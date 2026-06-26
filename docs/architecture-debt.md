# Architecture Debt

This ledger records known compromises that are acceptable for the current family-table playtesting stage, plus the exit criteria for retiring them.

## Current Compromises

- The Worker still stores shared app state as one optimistic-lock D1 JSON row. Durable Objects serialize room creation and active room mutations, but roster, lobby, stats, and backfill reads still share the same document.
- `workers/sogotable-api.js` is now the request entry + routing + Durable Object classes + domain handlers; **all six games' rules** and the **platform/persistence plumbing** live in modules; 4299 → 2047 lines, no inline game rules. HTTP/CORS (`workers/platform/http.js`), rate-limiting (`workers/platform/rate-limit.js`), and the D1 state row (`workers/persistence/state.js`) are extracted. Still mixing auth/lobby/rooms/invites/stats/bot-orchestration/notification fanout in the entry file — next targets are per-domain handlers (`domains/`) and explicit per-route `{mutates, notify}` metadata replacing the URL-string `readOnlyPost` heuristic.
- `src/sogotable/static/app.js` still owns most browser shell state, screen rendering, API orchestration, and most per-game interaction glue — but the registry, review-export, render-keys, storage, the boxes/quoridor/battleship client adapters, and the prompts/passcode controller, and the game-options/bug-report menu (`controllers/{prompts,game-options}.js`) are now modules; 4389 → 3118 lines. Still too large for a shell; the next UI-controller targets are players, lobby, rooms, invites, and stats.
- CSS remains in one broad app stylesheet plus a few game-local files.
- The browser uses the deployed API origin for static local previews. A configurable local API origin is deferred until it unlocks real local multiplayer testing.
- API errors are still string-based. Typed error codes are deferred until clients need richer recovery behavior.
- Rate limiting is intentionally coarse. The current owner-token model protects identity mutations, and the Worker has per-client write and superuser verification limits, but there is no per-player, per-room, or adaptive abuse policy yet.
- The service worker cache name is manually bumped when shell assets change.

## Risks

- A single D1 state row increases conflict pressure as public usage grows.
- Large Worker and frontend files make unrelated changes easier to entangle.
- String errors and manual cache versioning can create brittle UI behavior after future feature growth.
- Coarse rate limits may still need tuning before broad public use, especially for shared household networks and bursty room setup flows.

## Exit Criteria

- Move durable room state, invite lifecycle, and hot presence data behind focused Durable Object ownership, leaving D1 for roster, history, statistics, and backfill indexes.
- Split Worker modules by platform routing, persistence, rooms, players, invites, game rules, bot policy, and projections once tests can cover the seams.
- Split the browser shell into stable state/controller modules before adding another complex game.
- Add typed error identifiers when at least two client flows need distinct recovery handling for the same endpoint.
- Tune rate limits with real traffic evidence before broad public sharing outside the current family playtest group.
- Automate service-worker cache versioning from build metadata before frequent public releases.

## 2026-06-26 critical review response (in progress)

An external critical review (`AI/sogotable-critical-review-2026-06-26.md`, ignored intake — not committed) flagged the two god-files as the main scaling drag. We accepted the proportionate parts and explicitly **deferred S1-4 (partitioning the single D1 JSON row)** as premature for family-table scale; the optimistic-lock blob stays until public usage forces it. The extraction method and the recurring constant-dependency gotcha are recorded in the agent memory note `game-module-extraction`.

**Phase 1 — done & verified live:**
- `games/registry.js` — single source of truth for game metadata; the Worker (esbuild-bundled) and the browser both import it, killing the split-brain `GAME_DEFINITIONS`/`fallbackGames`. A guard test forbids re-hardcoding game ids.
- Extracted `review-export.js`, `games/render-keys.js`, `storage.js` out of `app.js`.
- Architecture guard tests (`workers/tests/architecture.test.js`) ratchet line-count ceilings (currently app 3150, worker 2050, css 2800), enforce registry single-source, and pin the review-export allowlist to tracked files. Lower a ceiling whenever code is extracted, and update these numbers here in the same change.

**Phase 2 — game modules (one vertical slice per game):**
- **All six games done & live:** Dots and Boxes (`workers/games/boxes/rules.js` + `games/boxes/client.js`), Battleship rules **incl. the per-viewer hidden-information sanitizer** (`workers/games/battleship/rules.js`), 10,000 (`workers/games/ten-thousand/rules.js`), Quoridor (`workers/games/quoridor/rules.js`), and Super-Tic-Tac-Toe + Tactical (`workers/games/super-tic-tac-toe/rules.js` — the trickiest: the default game was woven into `newGame`/`gameToDict`/`makeMove`/`chooseBotMove`; `pushGameEvent`, `WIN_LINES`, and `TACTICAL_PICKUP_CONFIG` moved with the rules). Shared helpers in `workers/games/{bots,util}.js`. The Worker keeps each `is<Game>Game` dispatch predicate, the `makeMove` router, the inline newGame board creation, room-coupled wrappers, and the scored bot.
- **Capstone done + extended:** `newGame`/`gameToDict`/`legalMoves`/`chooseBotMove` **and now the `/api/room/move` + bot-turn dispatch** route through one `GAME_HANDLERS` table. The table gained `applyAction(game, mark, payload)` (normalises the heterogeneous per-game move signatures) plus behavior flags `enforcesTurnOrder` / `preMove` / `resolvesBotsInternally` — collapsing the four explicit move branches into one generic path + the Classic/Tactical default. Adding a game is one row + its module + predicate; no shell move/bot touchpoints. Verified live: all six games create + serialize + move through the table.
- **Client adapters — all done & live-verified:** Boxes, 10,000 (renderer), Quoridor (`games/quoridor/client.js`), and **Battleship** (`games/battleship/client.js`). app.js 4389 → 3295. Battleship was the hardest: the reveal-animation scheduler + reveal/timer/queue/view-mode/review-mark state stay in the shell, and the module renders from a ctx bag that bridges back via `ctx.activeReveal()` + view-mode/review-mark getters/setters. Verified live: setup, auto-place, ready, offence fire with the radar→result reveal animation, defence view, and turn handling — no console errors.
- **Phase 2 is complete.** Every game's server rules and client UI are modules; the Worker dispatches through the `GAME_HANDLERS` registry. Adding a game is now: a rules module, a client module, a predicate, and one registry row.
- Optional follow-up: 10,000's residual ~60 lines of sound/farkle glue (shell-integration code; low value).
- Lesson: when adding a static game-module dir, check its tracked case (`git ls-files`) — a capital-cased lab dir (e.g. `Quoridor/`) collides with a lowercase import on Cloudflare's case-sensitive build and white-screens the app.

### Rerun review (2026-06-26) — next extractions, NOT more games

A rerun review confirmed the cleanup is real (game-rule ownership 8/10) but the system is "less dangerous, not yet modular." Explicit guidance: **do one or two boring extraction PRs before adding game #7.** Agreed next steps, in order (each behavior-preserving, tests pin before/after):

1. **Worker platform/persistence extraction** — move `platform/{http,cors,rate-limit}.js` and `persistence/state.js` (ensureSchema/loadState/saveState/withStateRetry) out of `sogotable-api.js`. Target < 1,900 lines. The Worker is only ~30 lines under its 2,200 guard — this buys headroom before more endpoints land.
2. **`routeRequest()` policy** — replace the URL-string `readOnlyPost` mutate/notify heuristic with explicit per-route metadata (`{mutates, notify:[...]}`) so endpoints declare their side effects instead of the central dispatcher guessing.
3. **Browser UI controllers** — extract prompts/passcode/confirm first (low-risk DOM plumbing), then players/lobby/rooms/invites/stats. Target app.js < 2,800.
4. **Render-key fragments** — each game client exports its own render-key fragment; `buildRoomRenderKey` becomes shell-common + adapter-provided. Kills the dead `gameId === "ten_thousand"` branch in `render-keys.js`.
5. **Split the worker test file** by domain (2,699 lines → per-domain files) — pure file movement, verified by `npm test`.
6. **Game adapter contract** — finish what `GAME_HANDLERS` started: fold super-ttt/tactical and the `makeMove`/bot-turn switches into the adapter so adding a game is truly "module + register," no shell touchpoints.

Smaller notes: review-export reflects GitHub `main`, not the deployed SHA — its README should state that caveat (and ideally pin the export to a commit SHA). D1 single-row debt stays acceptable for family scale; keep the exit criteria visible. CSS split is later, not the next fire.
