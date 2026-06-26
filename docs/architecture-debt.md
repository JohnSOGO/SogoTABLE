# Architecture Debt

This ledger records known compromises that are acceptable for the current family-table playtesting stage, plus the exit criteria for retiring them.

## Current Compromises

- The Worker still stores shared app state as one optimistic-lock D1 JSON row. Durable Objects serialize room creation and active room mutations, but roster, lobby, stats, and backfill reads still share the same document.
- `workers/sogotable-api.js` still contains platform routing, persistence, and Durable Object classes — but **all six games' rules now live in modules** (see the 2026-06-26 review response below); 4299 → 2150 lines (−50%), with no inline game rules left bar the thin dispatch predicates.
- `src/sogotable/static/app.js` still owns most browser shell state, screen rendering, API orchestration, and most per-game interaction glue — but the registry, review-export, render-keys, storage, and the Dots-and-Boxes client now live in modules; 4389 → 3893 lines.
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
- Architecture guard tests (`workers/tests/architecture.test.js`) ratchet line-count ceilings (app 4050, worker 2450, css 2800) and enforce registry single-source. Lower a ceiling whenever code is extracted.

**Phase 2 — game modules (one vertical slice per game):**
- **All six games done & live:** Dots and Boxes (`workers/games/boxes/rules.js` + `games/boxes/client.js`), Battleship rules **incl. the per-viewer hidden-information sanitizer** (`workers/games/battleship/rules.js`), 10,000 (`workers/games/ten-thousand/rules.js`), Quoridor (`workers/games/quoridor/rules.js`), and Super-Tic-Tac-Toe + Tactical (`workers/games/super-tic-tac-toe/rules.js` — the trickiest: the default game was woven into `newGame`/`gameToDict`/`makeMove`/`chooseBotMove`; `pushGameEvent`, `WIN_LINES`, and `TACTICAL_PICKUP_CONFIG` moved with the rules). Shared helpers in `workers/games/{bots,util}.js`. The Worker keeps each `is<Game>Game` dispatch predicate, the `makeMove` router, the inline newGame board creation, room-coupled wrappers, and the scored bot.
- **Capstone done:** `newGame`/`gameToDict`/`legalMoves`/`chooseBotMove` route through one `GAME_HANDLERS` table (`{id, is, create, toDict, legalMoves, bot}`) instead of four parallel predicate chains — adding a game is one row plus its module + predicate. Super-TTT/Tactical are the inline default fallthrough; the heterogeneous `makeMove` request-handler branch stays explicit (per-game payload shapes). Verified live: all six games create + serialize through the table.
- **Client adapters — all done & live-verified:** Boxes, 10,000 (renderer), Quoridor (`games/quoridor/client.js`), and **Battleship** (`games/battleship/client.js`). app.js 4389 → 3295. Battleship was the hardest: the reveal-animation scheduler + reveal/timer/queue/view-mode/review-mark state stay in the shell, and the module renders from a ctx bag that bridges back via `ctx.activeReveal()` + view-mode/review-mark getters/setters. Verified live: setup, auto-place, ready, offence fire with the radar→result reveal animation, defence view, and turn handling — no console errors.
- **Phase 2 is complete.** Every game's server rules and client UI are modules; the Worker dispatches through the `GAME_HANDLERS` registry. Adding a game is now: a rules module, a client module, a predicate, and one registry row.
- Optional follow-up: 10,000's residual ~60 lines of sound/farkle glue (shell-integration code; low value).
- Lesson: when adding a static game-module dir, check its tracked case (`git ls-files`) — a capital-cased lab dir (e.g. `Quoridor/`) collides with a lowercase import on Cloudflare's case-sensitive build and white-screens the app.
