// Bloomwork through the real shell against the local stack (see
// playwright.config.js): one phone hosts, two bots fill the table, the host
// picks flowers (straight to the compost heap, always legal) until round 1
// ends, reads the round summary and starts round 2. Proves lobby → start →
// simultaneous pick steps → round barrier → review works end to end.
import { test, expect } from "@playwright/test";

const API_ORIGIN = "http://127.0.0.1:8787";
const SHOTS = process.env.BLOOMWORK_SHOTS || "";

test("host + two bots: pick through round 1 and start round 2", async ({ browser, playwright }) => {
  const context = await browser.newContext({ ...playwright.devices["Pixel 7"] });
  await context.addInitScript((origin) => { window.SOGOTABLE_API_ORIGIN = origin; }, API_ORIGIN);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => { errors.push(`native dialog: ${dialog.message()}`); dialog.dismiss(); });
  await page.goto("/");

  await page.getByRole("button", { name: "Start Playing", exact: true }).click();
  await page.locator("#openCreatePlayerModal").click();
  await page.locator("#playerName").fill(`Bloom${Date.now() % 100000}`);
  await page.locator("#playerFormSubmit").click();
  await page.locator("#closePlayerModal").click();

  await page.locator("#gamesList").getByRole("button", { name: /Bloomwork/ }).first().click();
  await page.locator("#createGame").click();
  for (let i = 0; i < 2; i += 1) {
    await page.locator('[data-lobby="bot"]').click();
    await page.locator("#invitePlayerList .roster-player").first().click();
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(i + 1);
  }
  await page.locator('[data-lobby="start"]').click();
  await expect(page.locator(".bw-round")).toContainText("Round 1");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/real-app-start.png`, fullPage: true });

  const next = page.locator('[data-act="next"]');
  for (let step = 0; step < 40 && !(await next.count()); step += 1) {
    const before = await page.locator(".bw-round").innerText();
    await page.locator('.bloomwork-root button[data-act="tile"]:not([disabled])').first().click();
    await page.locator('.bloomwork-root button[data-act="row"][data-row="-1"]').click();
    await expect.poll(async () => (await next.count()) || (await page.locator(".bw-round").innerText()) !== before).toBeTruthy();
  }
  await expect(next).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/real-app-review.png`, fullPage: true });
  await next.click();
  await expect(page.locator(".bw-round")).toContainText("Round 2");

  expect(errors).toEqual([]);
});
