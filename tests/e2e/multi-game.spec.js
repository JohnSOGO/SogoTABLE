// Several games at once: a player steps back to the games list keeping their
// seat (🏠), starts another game, sees both in the 🎲 switcher, and gets an
// in-app alert with a Go button when the first table needs them — tapping it
// jumps straight back in. Runs against the local stack (playwright.config.js).
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

const isMyTurn = async (page) => (await page.title()).startsWith("● Your turn");

test("keep my seat, play another game, and jump back when a table needs me", async ({ browser, playwright }) => {
  const a = await openPhone(browser, playwright);
  await createPlayer(a.page, `Ann${unique()}`);
  await a.page.locator("#gamesList").getByRole("button", { name: /^Super Tic Tac Toe/ }).first().click();
  await a.page.locator("#createGame").click();
  const code = (await a.page.locator("#roomSharePanel .room-share-code strong").innerText()).trim();
  const b = await openPhone(browser, playwright, `/?join=${code}`);
  await createPlayer(b.page, `Ben${unique()}`);
  await expect(b.page.locator("#game")).toHaveClass(/active/);
  await expect.poll(async () => Number(await isMyTurn(a.page)) + Number(await isMyTurn(b.page))).toBe(1);

  // The phone that is waiting steps out, keeping its seat.
  const [mover, waiter] = (await isMyTurn(a.page)) ? [a, b] : [b, a];
  await waiter.page.locator("#keepSeatBack").click();
  await expect(waiter.page.locator("#games")).toHaveClass(/active/);
  const trigger = waiter.page.locator("#games [data-game-switcher]");
  await expect(trigger).toBeVisible();

  // ...and starts a second game (Potion Lab) in another lobby.
  await waiter.page.locator("#gamesList").getByRole("button", { name: /Potion Lab/ }).first().click();
  await waiter.page.locator("#createGame").click();
  await expect(waiter.page.locator("#game")).toHaveClass(/active/);
  await expect(waiter.page.locator("#roomTitle")).toContainText("Potion Lab");
  await waiter.page.locator("#game [data-game-switcher]").click();
  const sheet = waiter.page.locator("#gameSwitcher");
  await expect(sheet.locator(".switcher-row")).toHaveCount(2);
  await expect(sheet).toContainText("You're here");
  await expect(sheet).toContainText(code);
  await waiter.page.screenshot({ path: "test-results/multi-game-switcher.png" });
  await sheet.locator("[data-close]").click();

  // The other player moves: the waiter gets a "your move" toast with Go.
  await mover.page.locator("#macroBoard .small-board.legal .cell").first().click();
  const toast = waiter.page.locator(".toast-with-action");
  await expect(toast).toContainText("It's your move");
  await expect(waiter.page.locator("#game [data-game-switcher] .switcher-badge")).toHaveText("1");
  await waiter.page.screenshot({ path: "test-results/multi-game-alert.png" });
  await toast.getByRole("button", { name: "Go" }).click();
  await expect(waiter.page.locator("#roomTitle")).toHaveText("Super Tic Tac Toe");
  await expect.poll(() => isMyTurn(waiter.page)).toBe(true);

  // The Potion Lab table is still mine, listed in the switcher.
  await waiter.page.locator("#game [data-game-switcher]").click();
  await expect(sheet.locator(".switcher-row")).toHaveCount(2);
  await expect(sheet).toContainText("Potion Lab");

  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});
