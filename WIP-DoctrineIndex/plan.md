# Doctrine Index Plan

This plan turns the new doctrine index into a stable long-term project foundation
and then uses that foundation to drive the actual game and code changes.

The work is intentionally incremental. Each milestone should leave the project in a
fully understandable state, even if later milestones are not yet complete.

## [x] Milestone 0: Scope Lock

Goal:

- Confirm what the doctrine index governs and what it does not govern.
- Keep the index short, explicit, and linked to canonical docs.

Goals met when:

- The index exists as a front door, not a duplicate source of truth.
- The canonical ownership of each doctrine area is clear.
- `docs/doctrine.md` points to the deeper docs instead of restating them.
- The project does not introduce competing doctrine files for the same responsibility.
- The scope explicitly includes downstream game and code edits, not just documentation.

## [x] Milestone 1: Doctrine Index Structure

Goal:

- Make the doctrine index the easiest entry point for durable project rules.

Goals met when:

- The index has a short list of canonical links.
- The index names the core doctrine themes in plain language.
- The refresh rule is visible in the index.
- Readers can tell where to go for architecture, flow, quota, and state-machine truth.

## [x] Milestone 2: Flow Doctrine Alignment

Goal:

- Make sure the Wu Wei doc and the doctrine index say the same thing about how the app should behave.

Goals met when:

- `docs/wu-wei-method.md` reflects the explicit-refresh, event-driven, no-normal-polling stance.
- The browser responsibility section matches the desired refresh behavior.
- The review checklist includes the refresh question.
- There is no conflict between flow doctrine and the doctrine index.

## [x] Milestone 3: Quota and Polling Guardrails

Goal:

- Encode the "no hidden polling loops" preference where quota-sensitive behavior lives.

Goals met when:

- `docs/cloudflare-quota.md` states that polling is exceptional, not normal.
- The doc prefers push, reconnect, or explicit user refresh.
- Repeating timers are treated as a last resort for room/lobby freshness.
- The Cloudflare quota note and the doctrine index tell the same story.

## [x] Milestone 4: Memory and Architecture Sync

Goal:

- Ensure the durable project memory and architecture docs point at the doctrine index instead of drifting beside it.

Goals met when:

- `docs/project-memory.md` references the doctrine index as a front door.
- The explicit-refresh preference is recorded as durable context.
- `docs/architecture.md` does not describe polling as a default owner of browser flow.
- `docs/state-machine.md` and related docs do not contradict the new doctrine hierarchy.

## [x] Milestone 5: Transition Log Boundary

Goal:

- Separate old transition notes from current doctrine.

Goals met when:

- `docs/wu-wei-event-driven-progress.md` is clearly labeled as a transition log.
- Historical fallback-polling content is no longer mistaken for current doctrine.
- Readers can tell which docs are current policy and which docs are implementation history.

## [x] Milestone 6: Consistency Pass

Goal:

- Make the documentation stack internally consistent and easy to maintain.

Goals met when:

- The README links to the doctrine index.
- The doctrine index links to all canonical docs it governs.
- The no-polling preference appears in the right places and not everywhere.
- There are no unresolved doc conflicts about refresh behavior.

## [x] Milestone 7: Working Agreement

Goal:

- Turn the doctrine index into the default reference for future changes.

Goals met when:

- Future architecture or workflow changes are checked against the doctrine index first.
- New decisions land in the right canonical doc instead of in ad hoc notes.
- The project has a stable path for updating doctrine without creating duplicate sources of truth.

## Recommended Execution Order

1. Scope lock
2. Doctrine index structure
3. Flow doctrine alignment
4. Quota and polling guardrails
5. Memory and architecture sync
6. Transition log boundary
7. Consistency pass
8. Working agreement

## [x] Milestone 8a: Code Audit And Gap Map

Goal:

- Audit the current code against the doctrine index and map the gaps.

Goals met when:

- The browser, Worker, room, and state-machine code paths are reviewed against the doctrine index.
- Existing polling, refresh, reconnect, and recovery behavior is classified as keep, change, or remove.
- The remaining implementation gaps are written down before code edits begin.
- The audit includes sibling paths where the same contract applies.

## [x] Milestone 8b: Explicit Refresh Control

Goal:

- Make manual refresh a first-class, explicit browser action.

Goals met when:

- The page title or game title triggers a manual refresh action.
- The UI makes refresh obvious without hiding it in background timers.
- The refresh path works without forcing unrelated polling loops to remain alive.

## [x] Milestone 8c: Event-Driven Recovery

Goal:

- Keep reconnect/backfill behavior while removing background polling as the normal path.

Goals met when:

- Room and app recovery still works after disconnects, sleeps, and reconnects.
- WebSocket push and explicit refresh cover the normal freshness path.
- Any remaining fallback reads are limited to recovery/backfill, not repetitive timer-driven sync.

## [x] Milestone 8d: Code Alignment Pass

Goal:

- Update the actual code to match the doctrine and the audit map.

Goals met when:

- The code changes implement the explicit-refresh and event-driven behavior from the doctrine stack.
- Polling-heavy paths are removed or reduced where the audit said they should be.
- Room, lobby, and game behavior still work for both public and hot-seat play.
- The new behavior is covered by focused tests or smoke checks.

## [x] Milestone 9: Completion Signal

The doctrine index work is done when the docs stack and the related game/code
work feel boring in the good way:

- one obvious front door
- clear ownership per doc
- no hidden polling doctrine in old notes
- refresh behavior is explicit and event-driven
- future changes have a stable place to land
- the implementation matches the doctrine, not just the documents

## Recommended Execution Order

1. Scope lock
2. Doctrine index structure
3. Flow doctrine alignment
4. Quota and polling guardrails
5. Memory and architecture sync
6. Transition log boundary
7. Consistency pass
8a. Code audit and gap map
8b. Explicit refresh control
8c. Event-driven recovery
8d. Code alignment pass
9. Completion signal
