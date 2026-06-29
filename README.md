# SogoTable

SogoTable is a mobile-first platform for casual, turn-based **family games played in a browser** — no install, no heavyweight account. The platform is the product; individual games are modules that plug into it.

The guiding scenario: a family sitting together at a restaurant opens a browser, picks a player, joins a room, and plays — on whatever phones are already in their pockets.

A shared Cloudflare brain is the authority for players, rooms, and moves, so the same room works across several phones at once, and a Worker-owned bot can fill an empty seat for instant single-player.

## Stack

- Vanilla HTML/CSS/JavaScript frontend (no framework) served as static files.
- PWA manifest + service worker for an installable phone-browser shell; the worker caches only the static shell, never API state.
- Cloudflare Pages for the static site, Cloudflare Worker + D1 for shared multiplayer state.
- Cloudflare Durable Object as the per-room channel for live WebSocket updates and serialized room mutations.
- Generated Web Audio effects for quiet UI/game feedback.
- Node built-in test runner for the hosted Worker brain.

This keeps the app focused on its real path — Cloudflare Pages for static files, a Worker backed by D1 for shared state — without framework weight.

## Where to look

The README stays at platform level on purpose. For current, game-by-game, and feature-level detail, go to the source of truth:

| You want… | Look in |
| --- | --- |
| The frontend app (UI, lobby, rendering) | `src/sogotable/static/` |
| A specific game's UI module | `src/sogotable/static/games/` |
| The hosted brain (API, persistence, room channel) | `workers/` |
| A specific game's rules engine | `workers/games/` |
| The current + planned game roster | [`docs/roadmap.md`](docs/roadmap.md) |
| How a new game plugs into the platform | [`docs/adding-a-game.md`](docs/adding-a-game.md) |
| Which module owns what (the module map) | [`docs/module-ownership.md`](docs/module-ownership.md) |
| Architecture, doctrine, and per-game docs | [`docs/doctrine.md`](docs/doctrine.md) → routes to the rest of `docs/` |

Games are added as **modules**, not by mixing rules into UI code: rules live under `workers/games/` (testable without a browser), the matching UI lives under `src/sogotable/static/games/`. The platform shell — lobby, rooms, players, transport — is shared by every game.

## Public app

Use the hosted app:

```text
https://sogotable.sogodojo.com/
```

It can be installed from supported phone browsers as a Progressive Web App. The service worker caches static shell assets only; API calls for players, rooms, invites, and moves are never cached.

The intro screen shows a revision label built from Git (app version, short commit hash, branch, dirty/clean). Cloudflare Pages serves `/revision.json`, generated during the Pages build; Git remains the canonical source of revision truth.

## Static local preview

Local preview is for static UI inspection only. It still talks to the hosted Worker API for `/api/*` calls.

```powershell
npx wrangler pages dev src/sogotable/static
```

Then open:

```text
http://127.0.0.1:8788/
```

## Deploy the hosted brain

The public site uses a shared API brain for players, lobby presence, rooms, invites, and moves. Deploy it with:

```powershell
npm run deploy:brain
```

The Worker is configured in `wrangler.toml` and stores shared game state in a D1 database. Durable Objects serialize room creation, active-room mutations, and realtime snapshots; D1 is the persistence layer.

Mutating API requests are protected by Cloudflare Workers rate-limit bindings: `API_MUTATION_RATE_LIMITER` allows 180 writes per minute per client key, and `SUPERUSER_RATE_LIMITER` allows 20 superuser verification attempts per minute.

Sogo superuser actions require the Worker secrets `SOGOTABLE_SUPERUSER_PASSCODE` and `SOGOTABLE_SUPERUSER_PLAYER_IDS` (a comma-separated allowlist of player ids). If either is missing, superuser verification fails closed.

## Run tests

Install dependencies from the committed lockfile, then run the suite:

```powershell
npm ci
npm test
```

`npm test` is an alias for `npm run test:worker`, which runs the Node test files under `workers/tests/`. Game rules are tested without a browser.

## Principles

- The platform is multi-game; never collapse it into a single-game app.
- Game rules own validation and state transitions; UI renders prepared state and captures intent — it does not decide legal/illegal moves.
- The shared Worker stays authoritative; assume stale, duplicate, and out-of-order actions are normal.
- Keep game rules testable without a browser.

See [`docs/doctrine.md`](docs/doctrine.md) for the full doctrine and where each concern is owned.
</content>
</invoke>
