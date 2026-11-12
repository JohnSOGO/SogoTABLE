// Tracklayers through the real shell against the local stack (see
// playwright.config.js): one phone hosts, two bots fill the table, the host
// keeps starting tickets, then draws cards for a few rounds while the bots
// commit at each barrier. Proves the lobby → start → ticket keep → simultaneous
// round loop works end to end with no page errors.
import { test, expect } from "@playwright/test";

const API_ORIGIN = "http://127.0.0.1:8787";
const SHOTS = process.env.TRACKLAYERS_SHOTS || "";

test("host + two bots: keep tickets and play draw rounds", async ({ browser, playwright }) => {
  const context = await browser.newContext({ ...playwright.devices["Pixel 7"] });
  await context.addInitScript((origin) => { window.SOGOTABLE_API_ORIGIN = origin; }, API_ORIGIN);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => { errors.push(`native dialog: ${dialog.message()}`); dialog.dismiss(); });
  await page.goto("/");

  await page.getByRole("button", { name: "Start Playing", exact: true }).click();
  await page.locator("#openCreatePlayerModal").click();
  await page.locator("#playerName").fill(`Rail${Date.now() % 100000}`);
  await page.locator("#playerFormSubmit").click();
  await page.locator("#closePlayerModal").click();

  await page.locator("#gamesList").getByRole("button", { name: /Tracklayers/ }).first().click();
  await page.locator("#createGame").click();
  for (let i = 0; i < 2; i += 1) {
    await page.locator('[data-lobby="bot"]').click();
    await page.locator("#invitePlayerList .roster-player").first().click();
    await expect(page.locator(".tt-lobby-remove")).toHaveCount(i + 1);
  }
  await page.locator('[data-lobby="start"]').click();

  // Starting tickets: keep every offered ticket (at least 2 are required).
  const keepButtons = page.locator("[data-tl-keep]");
  await expect(keepButtons.first()).toBeVisible();
  const offered = await keepButtons.count();
  for (let i = 0; i < offered; i += 1) {
    const button = keepButtons.nth(i);
    if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  }
  await page.locator('[data-tl-act="keep"]').click();
  await expect(page.locator(".tl-picker")).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/real-app-start.png`, fullPage: true });

  // Three rounds of "draw two from the deck"; the bots commit at the barrier,
  // so each commit should advance the round.
  for (let round = 1; round <= 3; round += 1) {
    await expect(page.locator(".tl-stateline")).toBeVisible();
    await page.locator("[data-tl-deck]").click();
    await page.locator("[data-tl-deck]").click();
    await page.locator('[data-tl-act="draw"]').click();
    await expect(page.locator(".tl-round")).toHaveText(`Round ${round + 1}`);
  }
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/real-app-round4.png`, fullPage: true });

  expect(errors).toEqual([]);
});
