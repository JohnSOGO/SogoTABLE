# Placement Receipts

An **append-only** audit log of placement decisions. Every non-trivial code addition
(see the *Code Placement (Mandatory)* rule in `CLAUDE.md`) is preceded by a placement
decision from the `placement-advisor` subagent. The implementer commits that decision's
`PLACEMENT RECEIPT` here, **verbatim**, before/with the code.

This is what makes the placement *step* auditable: the **`code-steward`** owns the
periodic review of this log — as part of its whole-codebase audits it reconciles
recent receipts against the actual commits and `docs/module-ownership.md`, and
spot-checks a sample of light-path commits (those that ship with no receipt),
instead of re-deriving placement judgment across the whole codebase.

## How to log a receipt

1. Get the `PLACEMENT RECEIPT` block from the `placement-advisor` (or, if the agent was
   unavailable, write the equivalent yourself from `docs/module-ownership.md`).
2. Append a new `##` entry below — **never edit or delete prior entries** (append-only).
3. Stamp it with the date and, once committed, the resulting commit hash/subject.

**Scope note (codified 2026-07-01):** a new game subtree under the `games/<id>/`
directory patterns follows that standing decision in `docs/module-ownership.md` and
needs **no per-game receipt** (state the placement in the commit body). A **new
top-level owner row** always requires a receipt — that is the full-path trigger.

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
Commit: dd48d88 feat(roster): after creating a player, surface House controls + tip instead of closing

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
Commits: fcbe452 refactor(lobby) (prep) + 9ff4fbd feat(lobby) (feature)

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

## 2026-06-30 — RETROACTIVE — game-kind predicates extraction (new owner row)
Commit: 7b8bb89 refactor(app): extract game-kind predicates into games/game-kinds.js
Logged 2026-07-01: the steward's first receipts-vs-commits audit found this entry
missing — a new owner row shipped without a receipt. Substance reconstructed from the
commit body; the audit verified the placement itself was correct.

PLACEMENT RECEIPT
- Ask:          Extract the seven pure game-kind classifiers (isTacticalGameState …
                isMazewrightGameState) out of app.js to open room ahead of RTTA wiring.
- Verdict:      NEW owner row — src/sogotable/static/games/game-kinds.js (pure leaf;
                the shell injects its canonicalGameId via createGameKinds() so alias
                resolution tracks the live games list)
- Flow stage:   normalize/classify — pure predicates over a room game blob; no render,
                no rule mutation, no transport.
- Sources read: (retroactive) commit 7b8bb89 body; docs/module-ownership.md owner row;
                workers/tests/architecture.test.js ceilings.
- Considerations:
    - app.js sat at its then-ceiling (2515) ahead of RTTA wiring; the predicates were
      the cohesive pure seam to move. Ceiling ratcheted 2515 → 2498 to lock in the room.
    - Behavior-preserving: no call sites changed; six dead *_GAME_ID constants dropped.
    - Must-not-import ban on app.js recorded in the owner row; module added to the
      REVIEW_EXPORT_FILES allowlist.
- New owner row: | `src/sogotable/static/games/game-kinds.js` | Client game-kind
                predicates (classify a room game blob by id) | `src/sogotable/static/app.js` |

## 2026-07-03 — Mazewright gate-fix batch (12 items)

PLACEMENT RECEIPT
- Ask:          Place a 12-item Mazewright gate-fix batch (validation throws, barrier
                skip, client barrier UI, engine fixes, late-join + epoch guards,
                client epoch stamp, new test file, trivia).
- Verdict:      workers/games/mazewright/rules.js (items 1,2,11) [EXISTING];
                src/sogotable/static/games/mazewright/render.js (item 3) [EXISTING,
                REORG FIRST]; src/sogotable/static/games/mazewright/rules.js (item 4)
                [EXISTING]; workers/sogotable-api.js (items 5,6) [EXISTING, REORG
                FIRST — new owner workers/stats.js created by the prep refactor];
                src/sogotable/static/app.js (item 7) [EXISTING, net-zero only];
                workers/tests/mazewright-rules.test.js (item 8) [NEW FILE, exempt
                prefix — no owner row]; manifest.js / docs/game-mazewright.md
                (items 9,10) [EXISTING, light path].
- Flow stage:   1,2 validate+apply (server); 3 render/intent-capture; 4 apply (pure
                rules); 5,6 orchestrate/persist guards (platform); 7 normalize-action
                transport stamp; 8 record/verify; 9-11 docs/metadata.
- Sources read: docs/module-ownership.md; workers/tests/architecture.test.js;
                docs/modularity.md; docs/wu-wei-method.md;
                workers/games/mazewright/rules.js (head + line count);
                function maps + line counts of workers/sogotable-api.js (1800/1801),
                src/sogotable/static/app.js (at 2498 ceiling),
                games/mazewright/render.js (775/800) and rules.js (716/800);
                src/sogotable/static/review-export.js (allowlist entries).
- Considerations:
    - sogotable-api.js and app.js have ZERO headroom; render.js has 25 lines vs a
      25-35 line addition — three of twelve items pressure capped files.
    - Alternatives rejected: seat-color helper extraction from the worker (~40 lines,
      opens room but is not a concern-level seam; stats lines 1511-1738 are a
      golden-table concern of their own); putting the epoch guard in the game wrapper
      (it is game-agnostic staleness rejection — platform's job); a board-fx-style
      render extraction (the MW_CSS literal is the smaller, already-precedented
      rtta styles.js seam); adding an owner row for the test file (workers/tests/ is
      exempt — a row would be map noise).
    - Main stability threats avoided: growing two files sitting exactly at their
      ratchets; a skip button smuggling absence-eligibility rules into the UI;
      forking a second bot-resolve path instead of reusing simulateRun/
      buildRandomMazeCode; a refactor hidden inside a feature commit via line
      compaction in app.js.
- New owner row: | `workers/stats.js` | Room outcome stats: completed-room recording,
                Elo, high scores, personal stats | `workers/sogotable-api.js` |
                (added by prep commit A; no other rows.)

REORG RECEIPT
- Trigger:      Mazewright gate-fix batch items 5,6 land in workers/sogotable-api.js,
                which sat at 1800/1801 — the placement named the stats block
                (lines 1511-1738) as the seam to open first.
- Seam moved:   Room outcome stats (completed-room recording, Elo, high scores,
                personal stats, incl. refreshPlayerStats — same golden-tables
                concern) from `workers/sogotable-api.js` to `workers/stats.js`
                [NEW owner row]. Boundary-forced relocations so stats.js never
                imports the Worker back: roomStatus -> workers/projections.js
                (room projection, invited by that module's header);
                BOT_DEFINITIONS + isBotSeat -> workers/games/bots.js;
                isBoxesGame -> workers/games/boxes/rules.js and isTacticalGame ->
                workers/games/super-tic-tac-toe/rules.js (matching the isXGame
                pattern every other game already exports).
- Room opened:  workers/sogotable-api.js: 1800 -> 1530 lines; ceiling 1801 -> 1580
                (post-extraction actual + ~2 small guards + modest slack).
- Behavior:     PRESERVED - verified via `npm test` (197/197 green); all code moved
                verbatim (no logic edits, no signature changes at any call site);
                same D1 state shapes, same public stats payloads, same room dicts.
- Sources read: docs/module-ownership.md; docs/modularity.md; docs/wu-wei-method.md;
                workers/tests/architecture.test.js (live CEILINGS);
                workers/sogotable-api.js; workers/projections.js;
                workers/games/bots.js; workers/games/boxes/rules.js;
                workers/games/super-tic-tac-toe/rules.js;
                src/sogotable/static/review-export.js.
- Restraint:    Only the advisor-named stats seam (plus its five boundary-forced
                helper moves) — did NOT split GAME_HANDLERS, seat-color helpers,
                bot-turn orchestration, or the room-dict projections, and did NOT
                pre-build the two guards the feature batch will add.
- New owner row: | `workers/stats.js` | Room outcome stats: completed-room recording, Elo, high scores, personal stats | `workers/sogotable-api.js` |

REORG RECEIPT
- Trigger:      Mazewright gate-fix batch item 3 (client barrier UI, ~25-35 lines)
                lands in src/sogotable/static/games/mazewright/render.js, which sat
                at 775/800 (GLOBAL_FILE_CAP) — the placement named the MW_CSS
                literal as the seam to open first.
- Seam moved:   Mazewright injected-CSS template literal (MW_CSS, 112 lines) from
                `src/sogotable/static/games/mazewright/render.js` to
                `src/sogotable/static/games/mazewright/styles.js` [NEW FILE, no
                owner row — covered by the games/ directory pattern], exactly
                mirroring the rtta/styles.js precedent (export const MW_CSS;
                render.js imports it; injectStyles unchanged).
- Room opened:  render.js: 775 -> 664 lines vs the 800 global cap (per-file
                ceiling: none — GLOBAL_FILE_CAP applies; no ratchet entry to move).
- Behavior:     PRESERVED - verified via `npm test` (197/197 green); CSS moved
                byte-for-byte, same style tag id (mazewright-styles), same
                inject-once guard, identical DOM output.
- Sources read: src/sogotable/static/games/rtta/styles.js + render.js (precedent);
                src/sogotable/static/games/mazewright/render.js;
                src/sogotable/static/review-export.js;
                workers/tests/architecture.test.js (GLOBAL_FILE_CAP + import-closure
                test, which requires the REVIEW_EXPORT_FILES entry added here).
- Restraint:    CSS only — did NOT split render.js further (board svg, lobby,
                final-screen sections stay put) and did NOT touch rules.js (716/800,
                room enough for its items).
- New owner row: none (games/ directory pattern covers per-game files).

## 2026-07-03 — Zombie Dice (new game module) + app.js reorg-first
Commit: pending

PLACEMENT RECEIPT
- Ask:          Place the Zombie Dice game (id `zombie-dice`) — shared-table turn-based
                push-your-luck dice, Ten Thousand's structural twin; hostStart lobby via
                games/lobby.js; bots required; no hidden info.
- Verdict:      workers/games/zombie-dice/{rules.js,ai.js} + src/sogotable/static/games/
                zombie-dice/{render.js,styles.js,manifest.js,PLAN.md,README.md}
                [EXISTING directory-pattern owners — NO new owner row] + additive touches:
                games/registry.js (GAME_IDS + entry), workers/sogotable-api.js (import +
                GAME_HANDLERS row only, ~13 lines), games/game-kinds.js (predicate),
                games/render-keys.js (key fields), app.js (host-start wiring, REORG FIRST),
                review-export.js (allowlist), workers/tests/zombie-dice-rules.test.js
                (exempt prefix), docs/game-zombie-dice.md.
- Flow stage:   validate + apply = workers/games/zombie-dice/rules.js (server-owned RNG
                behind a seedable seam); render/intent-capture = games/zombie-dice/render.js
                via ctx bag + shared host-start lobby; normalize/classify = game-kinds.js
                predicate + applyAction row; persist/broadcast/orchestrate = existing
                platform paths, untouched; record = stats via existing completed-room flow.
- Sources read: docs/module-ownership.md; docs/adding-a-game.md; workers/tests/
                architecture.test.js (live CEILINGS: app.js 2498, worker 1580; let-cap 33;
                manifest + lobbyMode + review-export + purity + layering guards);
                docs/placement-receipts.md (2026-07-01 scope note); AI/zombie-dice/PLAN.md;
                games/registry.js; games/game-kinds.js; games/render-keys.js;
                workers/sogotable-api.js (GAME_HANDLERS 1401-1416, __test tail, 1542 lines);
                app.js (ten-thousand wiring + farkle-ack block 139-150/1586-1643, 2498 lines);
                workers/games/ten-thousand/rules.js (784/800, bot-in-rules cautionary);
                review-export.js allowlist; on-disk layouts of ten-thousand/yahtzee/
                mazewright/rtta (client + worker).
- Considerations:
    - New game subtrees are the map's designed extension point (directory-pattern rows):
      zero fan-in leaves, no owner rows needed — adding rows would be map noise.
    - app.js is AT BOTH ratchets (2498/2498 lines, 33/33 top-level lets) and the host-start
      shell wiring is ~50-80 unavoidable additive lines → REORGANIZER FIRST: extract the
      Ten Thousand farkle-ack flow (const + 3 lets at 139-150, maybeAutoAckTenThousandFarkle
      1601-1620, maybeShowTenThousandFarklePrompt 1622-1643 — the latter appears to have NO
      call site; verify and delete if dead) to a new games/ten-thousand/farkle-ack.js behind
      wireTenThousandFarkleAck(ctx); frees ~55-80 lines + 3 lets; ratchet the ceiling to
      post-extraction actual + wiring budget + modest slack (net below 2498). Game-specific
      orchestration leaves the shell — correct ownership independent of Zombie Dice.
    - workers/sogotable-api.js has ~38 lines headroom vs a ~13-line touch — fits; import +
      one GAME_HANDLERS row and nothing else lands in the hub. No sanitizer branch (no
      hidden info).
    - Bot goes in a separate ai.js (yahtzee/rtta precedent), rejected bot-inside-rules
      (ten-thousand's rules.js sits at 784/800 for exactly that reason). Rejected any
      import of ten-thousand code for dice helpers (game-to-game ban; share via
      workers/games/util.js if ever needed). Rejected Game-Locked shape (endgame/tiebreaker
      couples all seats — shared-table turnBased, per the intake survey).
    - Main stability threats avoided: pushing an at-ceiling god file over its ratchet;
      rule logic (bust/endgame/tiebreaker) leaking into the UI or shell; a second lobby;
      client-owned shared RNG.
- New owner row: none — both subtrees covered by the standing directory-pattern rows;
                the reorganizer's farkle-ack.js is likewise pattern-covered (no row).
