# Wu Wei Event-Driven Progress

This file tracks the reviewed event-driven plan from `AI/wu-wei-event-driven-code-review-plan.md` and `AI/SogoGames_wu_wei_event_driven.zip`.

Decision: adopt the direction, but do not apply the zip as a snapshot.

## Code Decision

The app should move downhill toward event-driven updates, but the public play path must stay conservative:

- Keep the per-room WebSocket as the normal active-room update path.
- Keep HTTP refresh as recovery when a socket disconnects or a phone browser sleeps.
- Do not remove invite, lobby, or room-list polling until the replacement event channel has Worker tests and phone smoke coverage.
- Do not use the zip's full repo snapshot as source. Extract small, reviewed changes only.
- Add any new Durable Object class with a fresh Wrangler migration tag.

## Checklist

- [x] Read required project context: `AGENTS.md`, `README.md`, `docs/project-memory.md`, `docs/state-machine.md`, `docs/AREC.md`, and `docs/wu-wei-method.md`.
- [x] Review the incoming plan and zip as AI input, not committed source.
- [x] Reject wholesale zip application.
- [x] Patch the immediate missed-tap risk before broad transport changes.
- [x] Add a minimal app event channel for room-list and invite notifications.
- [x] Add Worker tests for app-event fanout and snapshot payloads.
- [x] Keep fallback polling enabled while testing the app event channel on phones.
- [ ] Split large frontend controller code after the transport path is stable.
- [ ] Move more active-room authority into Durable Objects only after the current Worker/D1 path is boring.

## Progress Log

### 2026-06-07

Completed:

- Added a browser-side in-flight move guard so one tap cannot submit multiple moves while the hosted brain is responding.
- Added touch-first move handling through `pointerdown` for non-mouse input. This reduces the chance that a room refresh or WebSocket snapshot replaces the tapped button before the browser's delayed `click` event fires.
- Kept the server as the authority. The browser does not optimistically mutate the board.
- Added `EventHubDurableObject` with `/api/events/socket` for app-level snapshots.
- Added `EVENT_HUB` with fresh Wrangler migration tag `v2_event_hub`.
- Browser now listens for app snapshots and updates room list, lobby presence, and pending invite prompts from events.
- Existing room-list, invite, lobby, and room fallback polling remains enabled as recovery while the event channel is proven on phones.
- Added Worker tests for app-event room, lobby, pending invite, and declined-invite snapshots.

Still pending:

- Public Cloudflare deploy and phone smoke test.
- Reduce timed room-list/invite/lobby polling only after public phone smoke testing proves the event channel is reliable.

## Next Implementation Slice

Public-smoke the EventHub narrowly:

- Confirm two devices see room-list changes without waiting for the next poll.
- Confirm invited player gets the invite prompt from event delivery.
- Confirm declined invites clear pending invite snapshots.
- Keep existing polling intervals as fallback until these checks pass repeatedly.

Do not expand this into roster presence, auth, or full room authority in the same slice.
