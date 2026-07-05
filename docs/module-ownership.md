# Module Ownership

The authoritative map of **which file owns which concern**. It exists so code
placement is a *looked-up, enforced fact* — not a judgment the implementer makes
mid-task (where convenience wins and god files are born). The architecture review
owns this file; the implementer obeys it; `workers/tests/architecture.test.js`
enforces it.

Rules the test checks:
1. Every module listed here exists (no stale entries).
2. Every source `.js`/`.mjs` file is **covered** — listed below, matched by a
   directory pattern, or exempt. A new, undocumented module fails the build:
   that is the forcing function that makes "where does this go?" an explicit,
   reviewed decision before code lands.
3. Every declared **Must-not-import** ban holds (upstream owners must not import
   downstream code or the entry file). Controllers/games are additionally barred
   from importing the shell by the layering test.

When adding a concern: if it has an owner below, put it there. If it does not,
that is the architecture decision — add a new owner row here (with its one-line
concern), then implement.

## Owned modules

| Module | Owns (one concern) | Must not import |
|---|---|---|
| `src/sogotable/static/app.js` | Browser shell: screens, state machine, API orchestration, the render fan, wiring controllers | — |
| `src/sogotable/static/client/session-store.js` | Device identity + seat-resolution priority (upstream state owner) | `src/sogotable/static/app.js` |
| `src/sogotable/static/api-client.js` | HTTP transport to the Worker | — |
| `src/sogotable/static/realtime.js` | Room + app-event WebSocket controller | — |
| `src/sogotable/static/storage.js` | localStorage/sessionStorage keys + load/migrate helpers | — |
| `src/sogotable/static/sound.js` | Audio synthesis + playback | — |
| `src/sogotable/static/color-utils.js` | Colour math | — |
| `src/sogotable/static/html-utils.js` | HTML escaping + markup helpers | — |
| `src/sogotable/static/review-export.js` | Admin source-review ZIP export + the export allowlist | — |
| `src/sogotable/static/service-worker.js` | PWA service worker / cache | — |
| `src/sogotable/static/dev-inspect.js` | Dev-only shift+click element locator (passive) | — |
| `src/sogotable/static/controllers/prompts.js` | Confirm / info / passcode modal prompts | — |
| `src/sogotable/static/controllers/houses.js` | House (clan) controls in the player modal | — |
| `src/sogotable/static/controllers/game-options.js` | Game-options menu | — |
| `src/sogotable/static/controllers/game-stats.js` | Game stats panel + modal | — |
| `src/sogotable/static/controllers/win-overlay.js` | Win overlay + confetti | — |
| `src/sogotable/static/controllers/player-appearance.js` | Player-edit appearance picker (icon + colour) | — |
| `src/sogotable/static/controllers/superuser.js` | Sogo superuser identity + passcode gate | — |
| `src/sogotable/static/controllers/local-seat.js` | Local hot-seat seat persistence (device-local) | — |
| `src/sogotable/static/controllers/room-sounds.js` | Room-snapshot → sound-effect mapping | — |
| `src/sogotable/static/controllers/invites.js` | Invite / opponent flows (remote / bot / local) | — |
| `src/sogotable/static/games/registry.js` | Single game registry — metadata source of truth | — |
| `src/sogotable/static/games/game-kinds.js` | Client game-kind predicates (classify a room game blob by id) | `src/sogotable/static/app.js` |
| `src/sogotable/static/games/render-keys.js` | Room render-cache key | — |
| `src/sogotable/static/games/lobby.js` | Shared pre-game lobby — mode-driven (fixed-capacity/auto-start + host-start) | `src/sogotable/static/app.js` |
| `src/sogotable/static/games/game-list-view.js` | Game-select list view | — |
| `workers/sogotable-api.js` | Worker entry: routing, side-effect dispatch, Durable Objects, remaining domain handlers | — |
| `workers/game-catalog.js` | Game id resolution + public game definitions | `workers/sogotable-api.js` |
| `workers/stats.js` | Room outcome stats: completed-room recording, Elo, high scores, personal stats | `workers/sogotable-api.js` |
| `workers/projections.js` | Public projections (player + bot views) | `workers/sogotable-api.js` |
| `workers/test-players.js` | Reserved test-player identities | `workers/sogotable-api.js` |
| `workers/platform/auth.js` | Owner-token + Sogo superuser auth primitives | `workers/sogotable-api.js` |
| `workers/platform/http.js` | JSON response + CORS | — |
| `workers/platform/rate-limit.js` | Request rate limiting | — |
| `workers/persistence/state.js` | D1 state load / save / retry / migrate | — |
| `workers/games/bots.js` | Shared bot helpers | — |
| `workers/games/util.js` | Shared game utilities | — |
| `workers/games/skip-vote.js` | Unanimous barrier-skip vote protocol (toggle / prune-ineligible / unanimity / clear) — eligibility predicate injected per game | — |
| `workers/games/handlers.js` | Per-game dispatch table + game-agnostic dispatchers (create / toDict / viewer projection / legalMoves / bot / initSeats / start-options) | `workers/sogotable-api.js` |

## Owned directory patterns

Each game owns its own subtree; per-game files do not need individual rows.

| Directory prefix (one game per subdirectory) | Owns |
|---|---|
| `src/sogotable/static/games/` | A game's browser module (client / render / rules / state / manifest / index) |
| `workers/games/` | A game's server rules + bot |

## Exempt (no architectural owner required)

| Prefix | Why |
|---|---|
| `workers/tests/` | Test harness, not part of the runtime module graph |
| `scripts/` | Maintenance/build scripts, run by hand |
