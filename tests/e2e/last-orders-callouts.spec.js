// Last Orders play callouts through the real shell against the local stack
// (see playwright.config.js): one phone hosts, two bots fill the table, the
// host picks a patron and plays along (discard nothing, end the action, buy a
// drink) until a bot's card shows up as a callout banner with its portrait,
// spoken by the browser voice (speechSynthesis is stubbed to record lines).
import { test, expect } from "@playwright/test";

const API_ORIGIN = "http://127.0.0.1:8787";
const SHOTS = process.env.LAST_ORDERS_SHOTS || "";

test("host + two bots: another patron's card plays as a voiced callout", async ({ browser, playwright }) => {
  test.setTimeout(150_000);
  const context = await browser.newContext({ ...playwright.devices["Pixel 7"] });
  await context.addInitScript((origin) => {
    window.SOGOTABLE_API_ORIGIN = origin;
    window.__spoken = [];
    const fake = {
      speak: (u) => window.__spoken.push({ text: u.text, pitch: u.pitch, rate: u.rate }),
      cancel: () => {}, getVoices: () => [],
    };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
    window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) { this.text = text; };
  }, API_ORIGIN);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => { errors.push(`native dialog: ${dialog.message()}`); dialog.dismiss(); });
  await page.goto("/");

  await page.getByRole("button", { name: "Start Playing", exact: true }).click();
  await page.locator("#openCreatePlayerModal").click();
  await page.locator("#playerName").fill(`Lo${Date.now() % 100000}`);
  await page.locator("#playerFormSubmit").click();
  await page.locator("#closePlayerModal").click();

  await page.locator("#gamesList").getByRole("button", { name: /Last Orders/ }).first().click();
  await page.locator("#createGame").click();
  for (let i = 0; i < 2; i += 1) {
    await page.locator('[data-lobby="bot"]').click();
    await page.locator("#invitePlayerList .roster-player").first().click();
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(i + 1);
  }
  await page.locator('[data-lobby="start"]').click();
  await page.locator('[data-lo-act="pick"]').first().click();

  const banner = page.locator(".lo-callout .lo-co");
  const act = async (sel) => {
    const el = page.locator(`.last-orders-root ${sel}:not([disabled])`).first();
    if (await el.count()) { await el.click({ timeout: 2000 }).catch(() => {}); return true; }
    return false;
  };
  for (let i = 0; i < 200 && !(await banner.count()); i += 1) {
    // Keep my own turn moving with the simplest legal steps.
    // (Buying the round: tapping who drinks sends it — there is no confirm button.)
    if (!(await act('[data-lo-act="discard"]')) && !(await act('[data-lo-act="end_action"]'))) {
      await act('[data-lo-act="order_target"]');
    }
    await page.waitForTimeout(400);
  }
  await expect(banner).toBeVisible();
  await expect(banner.locator(".lo-co-face svg")).toBeVisible();
  await expect(banner.locator(".lo-co-line")).toContainText(/plays|answers with|raises/);
  if (SHOTS) { await page.waitForTimeout(700); await page.screenshot({ path: `${SHOTS}/callout-phone.png` }); }
  const text = await banner.locator(".lo-co-line").innerText();
  if (!/raises/.test(text)) {
    await expect.poll(() => page.evaluate(() => window.__spoken.length)).toBeGreaterThan(0);
  }
  // Wait for a voiced card line if the first banner was a drink.
  await expect.poll(() => page.evaluate(() => window.__spoken.length), { timeout: 90_000 }).toBeGreaterThan(0);
  const spoken = await page.evaluate(() => window.__spoken);
  expect(spoken[0].text).toMatch(/!$/);
  if (SHOTS) {
    // Best effort: catch an attack (the defender's seat flashes red) for the gallery.
    const attacker = page.locator(".last-orders-root .lo-defending");
    for (let i = 0; i < 150 && !(await attacker.count()); i += 1) {
      if (!(await act('[data-lo-act="discard"]')) && !(await act('[data-lo-act="end_action"]'))) {
        if (await page.locator('.last-orders-root [data-lo-act="order"]').count()) {
          await act('[data-lo-act="target"]'); await act('[data-lo-act="order_target"]'); await act('[data-lo-act="order"]');
        }
      }
      await page.waitForTimeout(300);
    }
    if (await attacker.count()) {
      await attacker.first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/defender-flash.png` });
    }
  }
  expect(errors).toEqual([]);
});
