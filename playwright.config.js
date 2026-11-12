// Browser end-to-end tests: two phones at one table, against a fully local
// stack — `wrangler dev` runs the Worker (D1 + Durable Objects in Miniflare) and
// a tiny Node server (scripts/e2e-static-server.mjs) serves the static app. Run with `npm run test:e2e`.
import { defineConfig, devices } from "@playwright/test";

const API_PORT = 8787;
const WEB_PORT = 8788;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    ...devices["Pixel 7"],
    trace: "off",
    // Optional: reuse a preinstalled Chromium (e.g. a sandbox image) instead of
    // `npx playwright install chromium`.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: [
    {
      command: `npx wrangler dev --local --ip 127.0.0.1 --port ${API_PORT} --persist-to .wrangler/e2e-state`,
      url: `http://127.0.0.1:${API_PORT}/api/games`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `node scripts/e2e-static-server.mjs ${WEB_PORT}`,
      url: `http://127.0.0.1:${WEB_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});

export { API_PORT };
