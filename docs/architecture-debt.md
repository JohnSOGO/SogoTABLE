# Architecture Debt

This ledger records known compromises that are acceptable for the current family-table playtesting stage, plus the exit criteria for retiring them.

## Current Compromises

- The Worker still stores shared app state as one optimistic-lock D1 JSON row. Durable Objects serialize room creation and active room mutations, but roster, lobby, stats, and backfill reads still share the same document.
- `workers/sogotable-api.js` still contains platform routing, persistence, game rules, bots, projections, and Durable Object classes in one file.
- `src/sogotable/static/app.js` still owns most browser shell state, screen rendering, API orchestration, local storage, and per-game interaction glue.
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
