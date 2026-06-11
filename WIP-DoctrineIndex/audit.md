# Milestone 8a: Code Audit And Gap Map

This audit compares the current code to the doctrine index and the owner docs
it routes to. It is a gap map, not an implementation patch.

## What Already Matches

- The browser uses room WebSockets for active-room updates.
- The Worker owns shared multiplayer truth and Durable Object room authority.
- WebSocket Hibernation is already used where available for room and app-event sockets.
- `docs/doctrine.md` now acts as the first audit stop.
- `docs/wu-wei-method.md`, `docs/cloudflare-quota.md`, `docs/architecture.md`, and `docs/state-machine.md` all point toward event-driven behavior and explicit refresh.

## Gaps Found

### 1. Browser refresh is still timer-assisted

Current code:

- `src/sogotable/static/realtime.js` still starts repeating fallback timers for room summaries, invites, and lobby presence.
- `src/sogotable/static/app.js` still contains `pollInvites()`, `refreshRooms()`, `refreshRoom()`, `refreshGameRooms()`, and fallback-start helpers that assume repeated reads are normal recovery.
- `showScreen("gameSelected")` currently starts lobby presence fallback and room-list refresh behavior as part of the normal screen flow.

Doctrine mismatch:

- The new doctrine says explicit refresh and reconnect should be the normal recovery path, not repeating timers.
- Hidden periodic reads are now the thing to reduce, not the thing to preserve as a default screen mechanism.

Suggested follow-up:

- Move the normal path toward socket push plus explicit refresh.
- Keep only the minimum backfill needed for actual disconnect recovery.

### 2. Manual refresh is not yet a first-class title affordance

Current code:

- The selected-game title and page title do not currently act as the manual refresh control.
- The visible refresh action is still a button (`refreshGameList`) rather than a title-based affordance.

Doctrine mismatch:

- The doctrine index says refresh should be explicit and visible, with the page or game title as the manual affordance.

Suggested follow-up:

- Wire title clicks to a manual refresh action.
- Decide whether the game title, page title, or both should trigger the same explicit refresh path.

### 3. `app.js` still owns a lot of refresh choreography

Current code:

- `app.js` still orchestrates periodic refresh, fallback room reads, and lobby presence work in addition to rendering and state interpretation.
- `realtime.js` handles socket wiring, but the screen controller still triggers fallback behavior directly.

Doctrine mismatch:

- The doctrine stack wants the browser to stay explicit and event-driven, with the controller focused on state meaning rather than timer management.

Suggested follow-up:

- Narrow `app.js` toward screen state and explicit actions.
- Keep socket/reconnect policy inside `realtime.js`, but reduce timer-heavy default behavior.

### 4. Historical fallback language still exists in live code comments and helpers

Current code:

- `realtime.js` uses constant names like `ROOM_SUMMARY_FALLBACK_INTERVAL_MS`, `INVITE_FALLBACK_INTERVAL_MS`, `LOBBY_FALLBACK_INTERVAL_MS`, and `ROOM_SOCKET_FALLBACK_INTERVAL_MS`.
- `app.js` still has comments describing polling as a continuing path in some recovery flows.

Doctrine mismatch:

- The new doctrine prefers explicit refresh and recovery language over polling-as-default language.

Suggested follow-up:

- Rename or reframe the fallback constants and comments so they read as recovery/backfill, not normal polling doctrine.

### 5. The worker still supports the same read-heavy fallback model

Current code:

- `workers/sogotable-api.js` still exposes read endpoints that the browser uses repeatedly for room lists, invites, and lobby presence.
- That is acceptable for recovery/backfill, but the current browser implementation still leans on those reads as an ordinary freshness mechanism.

Doctrine mismatch:

- The Worker-side contract is fine, but the browser-side habit still reflects the older event-transition era.

Suggested follow-up:

- Keep the endpoints, but change the browser habit.
- Let the browser call them explicitly when a refresh is requested or after a reconnect gap.

## Keep / Change / Remove

### Keep

- Room WebSockets for active-room state.
- EventHub snapshots for lobby and invite events.
- D1 as shared state persistence.
- Explicit browser-visible error states.

### Change

- Timer-driven fallback refresh as a normal browser habit.
- Title and screen affordances for manual refresh.
- The naming and routing of fallback helpers so they read as recovery, not default polling doctrine.

### Remove

- The idea that room-list, invite, and lobby freshness should depend on repeating timers as the expected path.

## Recommended Next Slice

1. Add the explicit title-click refresh control.
2. Reduce timer-driven fallback refresh to true recovery/backfill only.
3. Rename or reframe remaining fallback helpers so the code reads like doctrine, not transitional scaffolding.
4. Update tests or smoke checks around the new refresh path.

This audit intentionally stops short of code changes. It defines the change map for Milestone 8b and beyond.
