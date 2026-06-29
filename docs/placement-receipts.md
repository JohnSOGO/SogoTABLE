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

## 2026-06-29 — Post-create House step (bug mqxvi6zl)
Commit: feat(roster): after creating a player, surface House controls + tip instead of closing

PLACEMENT RECEIPT
- Ask:          Bug mqxvi6zl — after CREATING a player, keep the modal open showing
                House Create/Join buttons plus a guiding tip, instead of closing.
- Verdict:      app.js (finishPlayerSave, net-zero in-place) [EXISTING] +
                controllers/houses.js (renderIdle tip) [EXISTING]
- Flow stage:   render / orchestrate — post-save modal flow branch (shell orchestrates
                which view shows) and House-controls presentation (UI render). No
                validate/apply/persist stage touched; no rule logic involved.
- Sources read: docs/module-ownership.md, workers/tests/architecture.test.js,
                src/sogotable/static/controllers/houses.js,
                src/sogotable/static/app.js (finishPlayerSave ~800-838, editPlayer
                ~899-914, line count 2566, top-level let count 33).
- Considerations:
    - app.js sits AT both CI ceilings (2566/2566 lines, 33/33 top-level lets) — zero
      headroom. Only a net-zero, global-free, in-concern edit is admissible; the
      proposed one-line conditional swap of closePlayerModal() qualifies. +1 line or
      +1 global is a hard CI failure.
    - finishPlayerSave already owns the wasEditing branch, so adding the
      created→editPlayer outcome is in-concern, not a new seam. editPlayer (app.js:899)
      already surfaces House controls via renderPlayers→renderHouseControls, so no new
      machinery is needed.
    - Rejected alternatives: a new "post-create flow" owner/module (speculative —
      finishPlayerSave already owns this branch; would add weight for no structural
      gain); placing the tip in index.html or a tips module (splits the tip from the
      buttons it describes, breaking cohesion); routing the modal-flow branch through
      the houses ctx (would put a shell flow decision in a downstream controller).
    - No reorganizer: nothing grows, so triggering an extraction would be speculative
      splitting, which the doctrine forbids. houses.js (245/800) has ample room.
    - Stability threat avoided: convenience-adding lines/state to an at-ceiling god
      file (app.js), and smuggling House presentation into the shell instead of its
      owning controller.
- New owner row: none
- Implementer note: tip rendered unconditionally in renderIdle (shows on every House
  idle view, not only post-create) — chosen for cohesion/simplicity per the advisor's
  "implementer's call within owner" scope note; wording fits both create and edit. The
  `.house-tip` style lives with its siblings in styles-room.css (House chrome
  stylesheet) — presentation cohesive with concern (B), not a new owner.

## 2026-06-29 — Unified mode-driven lobby (bug mqxvagbl)
Commits: refactor(lobby) fcbe452 (prep) + feat(lobby) (feature)

PLACEMENT RECEIPT
- Ask:          Unify the two pre-game lobbies (2-player auto-start slots + 1+ host-start
                roster) into one mode-driven component, and decide where the mode of play
                is declared. User priorities: consistency + a single themed palette across
                light/dark.
- Verdict:      src/sogotable/static/games/lobby.js (rename of host-lobby.js, broadened
                concern) owns the unified lobby; renderRoomSlots + helpers moved there out
                of app.js; new pure-data `lobbyMode` field added to games/registry.js.
                [EXISTING owner rows — host-lobby row repointed/broadened, registry unchanged]
- Flow stage:   render (pre-game / room-fill presentation). `lobbyMode` is registry
                metadata; auto-start vs host-start AUTHORITY stays in orchestration, not
                the lobby — the lobby only selects which controls/markup show.
- Sources read: docs/module-ownership.md, docs/modularity.md, games/host-lobby.js,
                app.js (1730-1840 + routing), games/registry.js, yahtzee/ten-thousand/
                mazewright render.js + manifests, workers/tests/architecture.test.js,
                index.html room slots.
- Considerations:
    - lobby.js (57 lines) had ample room under the 800 cap to absorb both renderers;
      app.js was AT its 2566 ceiling, so the extraction (which REMOVES ~60 lines)
      relieved it — a behavior-preserving Two-Hats prep commit ratcheted the ceiling to
      2515 before the feature.
    - Rejected lobbyMode in manifest.js (shell doesn't import manifests for room flow) and
      runtime-deriving from host_start (implicit; the user wants it explicit). registry.js
      is the pure shared source both runtimes read.
    - Rejected a brand-new module: would split the single "lobby" concern across two owners.
- New owner row: none — existing host-lobby.js row repointed to games/lobby.js, concern
                broadened to "Shared pre-game lobby — mode-driven (fixed-capacity/auto-start
                + host-start)".

REORG RECEIPT (commit fcbe452)
- Trigger:      Mode-driven lobby feature lands in the lobby concern, but app.js (owner of
                the 2-player room slots) sat at its 2566 ceiling — needed room first.
- Seam moved:   renderRoomSlots / renderRoomInviteStatus / inviteStatusText / roomPlayerHtml
                from app.js to games/lobby.js, behind a wireLobby(ctx) injection seam
                (mirrors controllers/invites.js); lobby.js must not import app.js.
- Room opened:  app.js 2565 → 2515 lines; ceiling 2566 → 2515. host-lobby.js → lobby.js.
- Behavior:     PRESERVED — byte-identical DOM for both lobby shapes; hostInviteStatus
                stays a shell global mutated via ctx.setHostInviteStatus; renderHostStartLobby
                unchanged. npm test green (137/137 at the time).
- Restraint:    No lobbyMode dispatch, no duplicate fold-in, no CSS — those landed in the
                separate feature commit. syncHostInviteStatusFromRoom left in the shell
                (orchestration).
- New owner row: none — existing host-lobby.js row repointed.
