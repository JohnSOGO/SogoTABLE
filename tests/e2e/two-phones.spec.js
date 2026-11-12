// Two phones at one table, end to end against the local stack (see
// playwright.config.js): host creates a table, a second phone joins through
// the QR/join link, the turn signal lights on the right phone, and one player
// exiting no longer closes the table for the other.
import { test, expect } from "@playwright/test";

const API_ORIGIN = "http://127.0.0.1:8787";
const unique = () => String(Date.now() % 100000);

async function openPhone(browser, playwright, path = "/") {
  const context = await browser.newContext({ ...playwright.devices["Pixel 7"] });
  await context.addInitScript((origin) => { window.SOGOTABLE_API_ORIGIN = origin; }, API_ORIGIN);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => { errors.push(`native dialog: ${dialog.message()}`); dialog.dismiss(); });
  await page.goto(path);
  return { page, errors };
}

async function createPlayer(page, name) {
  await page.getByRole("button", { name: "Start Playing", exact: true }).click();
  await page.locator("#openCreatePlayerModal").click();
  await page.locator("#playerName").fill(name);
  await page.locator("#playerFormSubmit").click();
  await expect(page.locator("#playerModal")).toBeVisible();
  await page.locator("#closePlayerModal").click();
}

test("join by link, turn signal, and exit keeps the table for the other phone", async ({ browser, playwright }) => {
  const host = await openPhone(browser, playwright);
  await createPlayer(host.page, `Host${unique()}`);
  await host.page.locator("#gamesList").getByRole("button", { name: /^Super Tic Tac Toe/ }).first().click();
  await host.page.locator("#createGame").click();

  // The share panel shows a QR code and the table code.
  const share = host.page.locator("#roomSharePanel");
  await expect(share).toBeVisible();
  await expect(share.locator("svg")).toBeVisible();
  const code = (await share.locator(".room-share-code strong").innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{4}$/);

  // Second phone opens the join link, picks a player, and lands at the table.
  const guest = await openPhone(browser, playwright, `/?join=${code}`);
  await expect(guest.page).toHaveURL(/\/$/); // the ?join= is stripped from the address bar
  await expect(guest.page.locator(".toast")).toContainText(code);
  await createPlayer(guest.page, `Guest${unique()}`);
  await expect(guest.page.locator("#game")).toHaveClass(/active/);
  await expect(guest.page.locator("#roomTitle")).toHaveText("Super Tic Tac Toe");

  // Exactly one phone shows "your turn" in its tab title.
  await expect.poll(async () => [await host.page.title(), await guest.page.title()].filter((title) => title.startsWith("● Your turn")).length).toBe(1);
  await expect(share).toBeHidden(); // seats are fixed once the game starts

  // A reset/rematch request reaches the other phone as a Yes/No prompt.
  await host.page.locator("#resetGame").click();
  await host.page.locator("#confirmYes").click();
  await expect(guest.page.locator("#confirmPromptText")).toContainText("wants to reset");
  await guest.page.locator("#confirmYes").click();
  await expect(guest.page.locator("#confirmPrompt")).toBeHidden();

  // Guest exits: the table survives for the host, who sees the seat marked as left.
  await guest.page.locator("#closeGame").click();
  await expect(guest.page.locator("#confirmPromptText")).toContainText("Everyone else keeps playing");
  await guest.page.locator("#confirmYes").click();
  await expect(guest.page.locator("#gameSelected")).toHaveClass(/active/);
  await expect(host.page.locator("#game")).toHaveClass(/active/);
  await expect(host.page.locator("#gamePlayersPanel")).toContainText("left the table");

  // No native alert()/confirm() pop-ups and no uncaught errors on either phone.
  expect(host.errors).toEqual([]);
  expect(guest.errors).toEqual([]);
});
