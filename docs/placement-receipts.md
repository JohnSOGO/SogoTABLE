# Placement Receipts

An **append-only** audit log of placement decisions. Every non-trivial code addition
(see the *Code Placement (Mandatory)* rule in `CLAUDE.md`) is preceded by a placement
decision from the `placement-advisor` subagent. The implementer commits that decision's
`PLACEMENT RECEIPT` here, **verbatim**, before/with the code.

This is what makes the placement *step* auditable: a periodic external review reads
this log against the actual commits and `docs/module-ownership.md`, instead of
re-deriving placement judgment across the whole codebase.

## How to log a receipt

1. Get the `PLACEMENT RECEIPT` block from the `placement-advisor` (or, if the agent was
   unavailable, write the equivalent yourself from `docs/module-ownership.md`).
2. Append a new `##` entry below — **never edit or delete prior entries** (append-only).
3. Stamp it with the date and, once committed, the resulting commit hash/subject.

## Entry format

```
## YYYY-MM-DD — <short title>
Commit: <hash> <subject>   (fill in after committing; "pending" until then)

PLACEMENT RECEIPT
- Ask:          ...
- Verdict:      ...
- Flow stage:   ...
- Sources read: ...
- Considerations:
    - ...
- New owner row: ...
```

---

<!-- Append new receipts below this line. Newest at the bottom. -->

## 2026-06-28 — VERIFICATION ENTRY (system test — no feature shipped)
Commit: n/a — this exercised the placement→receipt loop end to end; emoji reactions
were NOT built. Kept (not deleted) because the log is append-only; clearly marked so
the audit trail stays honest.

PLACEMENT RECEIPT
- Ask:          Ephemeral in-room emoji reactions — a player taps an emoji (👍 😂 😮);
                it floats briefly on every connected player's screen, then vanishes.
                Not game state, not validated, not persisted.
- Verdict:      NEW owner rows (two) + small existing-file edits:
                  • `src/sogotable/static/controllers/room-reactions.js` (NEW) — UI capture + float render
                  • `workers/room-reactions.js` (NEW) — ephemeral relay: shape/stamp/fan-out, no persistence
                  • `src/sogotable/static/realtime.js` (EXISTING) — add `sendRoomReaction` over the existing room socket
                  • `workers/sogotable-api.js` (EXISTING, minimal) — `webSocketMessage()` one-line delegate
- Flow stage:   capture = UI (new); relay = transport (new + entry delegate);
                validate/apply/persist = intentionally NONE (ephemeral); render = UI (new).
- Sources read: app.js, sogotable-api.js (RoomDurableObject), realtime.js,
                docs/module-ownership.md, architecture.test.js (ceilings).
- Considerations:
    - Both natural homes are at their caps (app.js ~2556/2566; Worker entry ~1810/1810),
      so the correct move is redistribution into new leaf owners, not fattening the hubs.
    - Pre-work required: extract the socket-message dispatch seam out of app.js into a
      new `client/socket-dispatch.js` and ratchet the ceiling, before the wiring lands.
    - Rejected: bolting capture/render into app.js (at ceiling); routing through
      handleRoomAction (that is the validate/apply/persist path — wrong flow stage);
      opening a new socket (the per-room socket already connects exactly these players).
    - Stability threat avoided: a UI feature smuggling rule/transport weight into two
      already-full god files, and a client-trusted sender. Server stamps the sender.
    - Out of scope (documented): hot-seat/single-device, bots, reconnect-replay.
- New owner row: two new rows (client controller + worker relay) — see Verdict.
