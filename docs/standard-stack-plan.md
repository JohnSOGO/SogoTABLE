# Standard-Stack Migration Plan

Status: **plan, staged.** MojoSOGO's direction (2026-11-12): use industry-standard tools instead of
hand-rolled ones. ESLint, Prettier, Playwright e2e, a vendored QR library and toasts landed already
(see `docs/placement-receipts.md`). This doc stages the two larger swaps so each lands as its own
small, test-pinned PR instead of one rewrite of the live multiplayer path.

Each stage: placement step first (`docs/modularity.md`), behaviour-preserving, `npm test` and
`npm run test:e2e` green before and after, ceilings ratcheted.

## A. Worker: Hono routing + Zod validation + typed errors

Why staged: `routeRequest()` in `workers/sogotable-api.js` is called from three places — the Worker
`fetch`, `RoomDurableObject` (`/__room_action`) and `RoomFactoryDurableObject`. Swapping the router
changes the room authority path, which every live table depends on.

1. **Edge router.** Replace the outer `fetch` if-chain (CORS, OPTIONS, socket upgrades, rate limit,
   room-authority forwarding, error envelope) with a Hono app in `workers/platform/edge.js`, using
   `hono/cors` and one `app.onError`. `routeRequest` is untouched. Pins: existing CORS, 503
   fail-closed and rate-limit tests.
2. **Typed errors.** Add `{ ok: false, error, code }` with a small `ApiError(code, message)` class in
   `workers/platform/http.js`; the client branches on `code` (owner-token healing in `api-client.js`
   stops string-matching messages). Retires the "string errors" debt in `docs/architecture-debt.md`.
3. **Zod schemas per route,** in `workers/platform/schemas.js` (`@hono/zod-validator` at the edge,
   the same schema `.parse()` inside `routeRequest` so Durable Object calls validate too). Start with
   room routes (create, join, leave, start, reset), then players, invites, stats, bug reports. Game
   move payloads stay with each game's `applyAction` normaliser (rules own validation).
4. **Domain routers.** Move route bodies into Hono sub-apps per domain (`domains/rooms.js`,
   `domains/players.js`, `domains/invites.js`, `domains/stats.js`), mounted by the edge app and
   invoked in-process by the Durable Objects via `app.request()`. `ROUTE_SIDE_EFFECTS` becomes
   per-route middleware. This is where `sogotable-api.js` finally shrinks to wiring.

## B. Browser: components + build

Why staged: `app.js` (~2,170 lines) and ~140 `innerHTML` templates work; a big-bang rewrite would
stall game work for weeks.

1. **Vite + vite-plugin-pwa.** Build `src/sogotable/static` with Vite (hashed assets, Workbox
   service worker with automatic cache versioning). Retires the hand-bumped `CACHE_NAME` and the
   "every .js is no-store" rule in `service-worker.js`. Cloudflare Pages runs `npm run build`.
2. **Preact + htm for new screens.** No JSX build needed, ~4 kB. New UI (and rewrites of the lobby,
   player modal and room panel) render through components; existing game renderers stay as-is until
   touched. `escapeHtml` + `innerHTML` stop being the default.
3. **TypeScript via JSDoc** (`// @ts-check` + `tsc --noEmit` in CI) on shared modules first:
   `games/registry.js`, `api-client.js`, `room-view.js`.
4. **Ratings.** Replace the two-player-only Elo in `workers/stats.js` with `openskill` so 3–6 player
   family games get ratings too.

## Order

A1 → A2 → B1 → A3 → B2 → A4 → B3 → B4. A1 and B1 are the cheapest wins; A4 and B2 are the big
structural payoffs and should wait until the earlier stages have been live for a while.
