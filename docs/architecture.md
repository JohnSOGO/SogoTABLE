# Architecture

SogoTable is now a Cloudflare-hosted browser game platform.

The active runtime path is:

```text
Browser UI -> Cloudflare Worker API -> Room Durable Object -> D1 state row -> room snapshot
room snapshot -> WebSocket clients + EventHub snapshots -> Browser UI
```

There is no Python code required in the current architecture.

## Chosen Stack

- Cloudflare Pages for static HTML/CSS/JavaScript/PWA assets.
- Vanilla browser JavaScript under `src/sogotable/static/`.
- Cloudflare Worker API in `workers/sogotable-api.js`.
- Cloudflare D1 database `sogotable-state` for shared state.
- One `RoomDurableObject` per active room for serialized room mutations and live WebSocket fanout.
- Cloudflare WebSocket Hibernation for idle room/app-event sockets.
- Node built-in test runner for Worker API contract tests.
- PWA manifest and service worker for an installable mobile shell.

The stack is intentionally small. The app should stay easy to reason about while proving the family-table game experience.

## Folder Layout

```text
SogoTable/
  README.md
  AGENTS.md
  docs/
  scripts/
    write-static-revision.mjs
  src/
    sogotable/
      static/
  workers/
    sogotable-api.js
    tests/
```

## Runtime Ownership

## Opaque ID Doctrine

Durable identity should be opaque. Anything that crosses sessions, rooms, stats, multiplayer APIs, or saved preferences should be referenced by a meaningless stable id. Human-facing values such as names, icons, colors, descriptions, game titles, and bot names are mutable display data and must not be used as identity.

Room codes are the deliberate exception in the current product: they are human-facing join codes, not long-term internal room identity. Legacy game ids such as `super_tic_tac_toe` remain compatibility aliases, but new writes should use canonical opaque game ids.

The Worker plus the room Durable Object path is the single multiplayer authority.

It owns:

- persistent player roster
- selected-game lobby presence
- room creation and re-entry
- room joins and exits through the room Durable Object
- invite creation and invite responses
- reset voting through the room Durable Object
- Super Tic Tac Toe move validation through the room Durable Object
- Super Tic Tactical Toe pickup, scoring, and move validation through the room Durable Object
- room status and final game result
- live room snapshot broadcast to connected room clients

The browser owns:

- screen rendering
- local device/home selected player id
- local hot-seat actor switching inside one browser
- PWA shell behavior
- polling and user-facing error display

The static frontend must not create local fallback players or local fallback rooms when the Worker is unavailable. A failed API call should be visible and actionable, not silently split phones and PCs into different realities.

## Game Space Nomenclature

SogoTable's preferred game-space hierarchy is:

```text
Table -> Board -> Zone -> Cell
```

- `Table`: the full game-state experience players gather around.
- `Room`: the current hosted multiplayer container with a room code, transport state, and persistence.
- `Board`: the main visible play surface.
- `Zone`: a major playable area on the board.
- `Cell`: the smallest playable location inside a zone.
- `Asset`: a coin, chest, card, token, emoji, or other game object.

For Super Tic Tac Toe and Super Tic Tactical Toe, the whole nested 9x9 surface is
the board, each local 3x3 area is a zone, and each playable square is a cell.

Current runtime fields such as `boards`, `small_winners`, `next_board`, and
legacy tactical `sector` event fields are compatibility details. New docs, UI
language, and future game modules should prefer the terms in `docs/nomenclature.md`.

## State Storage

The current public-playtesting backend stores shared app state as one JSON row in D1. The Worker uses a version column and optimistic locking so stale concurrent writes fail instead of silently overwriting newer state.

Active room-changing HTTP actions now enter the room's Durable Object first for `join`, `join-bot`, invite response, `leave`/`close`, `move`, and `reset`. The Durable Object serializes those mutations for that room, persists the resulting state through D1, stores the latest room snapshot, and broadcasts meaningful changes to connected WebSocket clients. Room and app-event sockets use Cloudflare WebSocket Hibernation so idle connected tabs do not keep Durable Objects billable. This removes aggressive room polling during normal connected play while preserving HTTP as the recovery/backfill path.

Rooms carry monotonic `revision` and `game_epoch` freshness fields. Browser stale-snapshot checks should use those room-level markers instead of treating lower `game.move_count` as stale, because reset/play-again legitimately starts a fresh board at move count zero.

This is good enough for family playtesting. The next Durable Object step is to reduce the remaining Worker-owned room-adjacent paths, especially room creation and any remaining invite creation bookkeeping, once the current room-authority path has been smoke-tested:

```text
One room -> one Durable Object authority for validation, invite lifecycle, and live state
D1 -> roster/history/statistics/backfill indexes
```

Hot gameplay, presence, room-list, and heartbeat state must not be moved to
Workers KV. The current architecture intentionally uses Durable Objects for live
coordination and D1 for durable shared state.

## Game Logic

Super Tic Tac Toe and Super Tic Tactical Toe rules currently live in the Worker because the Worker is the production brain. The shared room and lobby shell is global for two-player games; game-specific behavior should live in game-state creation, move validation/application, and board rendering.

When adding future games, add game definitions to the Worker-hosted `/api/games` registry and add game-specific logic through clear modules or clearly named Worker sections. The browser can keep a tiny fallback registry for startup resilience, but hosted game metadata is the preferred source for the menu. Do not bury a second game inside UI rendering code.

## Timing Modes

Current ready games use classic `turnBased` timing: one player owns the next legal move.

Future games may use timing modes described in `docs/live-rounds.md`:

- `turnBased`
- `simultaneousSubmit`
- `liveRound`
- `liveRoundRegroup`
- `timedLiveRound`
- `actionBudgetRound`
- `hybridRound`

Timing mode should be game metadata and room state. It should not create a separate lobby, identity system, or transport architecture.

For live-round games, the room Durable Object is the natural authority boundary: it can serialize received actions, reject duplicate actions by players who already acted this round, update `actedPlayerIds`, advance `roundNumber`, and broadcast the authoritative room snapshot.

Do not implement live-round play as unlimited realtime movement. The defining rule is one action per active player per round, in any order.

## Browser UI

The browser UI is under `src/sogotable/static/`.

Current helper split:

- `app.js`: state machine, rendering, polling, event flow.
- `api-client.js`: hosted API routing and JSON handling.
- `color-utils.js`: contrast-aware and tint color helpers.
- `html-utils.js`: escaping and avatar HTML.

Future cleanup should continue extracting stable helpers first. Do not split the state machine until the screen/controller boundary is obvious.

## HTTP Endpoints

The authoritative endpoint list and request/response payloads live in `docs/api-contract.md`.

High-level endpoint groups:

- `GET/POST/DELETE /api/players`
- `GET /api/lobby`
- `POST /api/lobby/presence`
- `GET /api/rooms`
- `GET /api/room`
- `GET /api/room/socket`
- `POST /api/room/create`
- `POST /api/room/join`
- `POST /api/room/leave`
- `POST /api/room/move`
- `POST /api/room/reset`
- `GET /api/invites`
- `POST /api/invite/create`
- `POST /api/invite/respond`

## Progressive Web App

The browser frontend includes a conservative PWA shell:

- `manifest.webmanifest` declares the SogoTable app name, red theme color, and install icons.
- `service-worker.js` precaches shell assets and refreshes core shell files.
- API calls under `/api/` are intentionally excluded from service-worker handling.
- The PWA promise is installability and better reload behavior, not offline multiplayer.

When public phone behavior changes, bump the service worker `CACHE_NAME` so installed devices receive the new shell.

## Revision Strategy

Cloudflare Pages serves `/revision.json`, generated by `scripts/write-static-revision.mjs` during build. The intro screen displays the short revision summary so the user can confirm whether the public site is actually updated.

Git is the source of truth for revision identity.

## Future Multiplayer

Likely progression:

1. Use room WebSockets for normal active-room updates.
2. Keep HTTP refresh/backfill for reconnect and stale snapshots.
3. Route active room `join`, `leave`, `move`, and `reset` through the room Durable Object.
4. Move remaining room-adjacent lifecycle, especially invites and creation, into the room object if the current path remains stable.
5. Add room history/statistics in D1.
