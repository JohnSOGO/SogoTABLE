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
Commit: 21287f9 feat(zombie-dice): Roll of the Dead 🧟 (reorg prep: 93387b4)

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

REORG RECEIPT (commit 93387b4)
- Trigger:      The placement above: Zombie Dice needs ~50-80 lines of host-start shell
                wiring in app.js, which sat AT both ratchets (2498/2498 lines, 33/33
                top-level lets) — room had to open before the feature.
- Seam moved:   Ten Thousand farkle auto-ack flow (TEN_THOUSAND_FARKLE_ACK_MS + dedupe
                key + timer + maybeAutoAckTenThousandFarkle) from
                `src/sogotable/static/app.js` to
                `src/sogotable/static/games/ten-thousand/farkle-ack.js`, behind
                wireTenThousandFarkleAck(ctx) [EXISTING games/ directory-pattern owner —
                no owner row]. ctx injects isTenThousandGameState, localRoomSeat,
                getCurrentRoom, makeTenThousandAction; setRoom's call site is unchanged.
- Dead code:    maybeShowTenThousandFarklePrompt + lastTenThousandFarkleNoticeKey had NO
                call site anywhere (repo-wide grep: only the definition itself) —
                DELETED, not extracted, per the placement heads-up. The live inline
                tray flow (red dice + "You Farkled" banner) superseded this popup.
- Room opened:  app.js 2498 → 2445 lines; ceiling 2498 → 2497. Note: the mandated
                "actual + 80 + slack" (2525+) exceeds the binding "net below 2498"
                cap, so 2497 is the max ratchet-down — the implementer's wiring
                budget is the full 52 freed lines. Top-level lets 33 → 30;
                APP_TOP_LEVEL_LET_CAP 33 → 30.
- Behavior:     PRESERVED — identical guards, dedupe-key shape, 2000 ms hold, and
                ack_farkle action; module keeps its own key/timer state. Verified via
                `npm test` (210/210 green, incl. architecture ratchets, review-export
                closure with farkle-ack.js added to REVIEW_EXPORT_FILES, layering).
- Sources read: docs/module-ownership.md; docs/modularity.md; docs/wu-wei-method.md
                (per role brief); workers/tests/architecture.test.js (live CEILINGS,
                let cap, layering + review-export closure tests); app.js farkle block
                + imports + DOMContentLoaded wiring; controllers/room-sounds.js
                (wireX/ctx precedent); review-export.js allowlist; this entry.
- Restraint:    One seam only — did NOT touch battleship reveal state, makeTenThousand-
                Action, localRoomSeat, or any other game's wiring; no ten-thousand
                manifest/rows (tracked gap stays tracked); no Zombie Dice code.
- New owner row: none — `src/sogotable/static/games/` directory pattern covers it.

## 2026-07-03 — Liar's Dice (new game module, hidden-info sanitizer)

PLACEMENT RECEIPT
- Ask:          Place Liar's Dice — full new game (hidden-cup bidding/bluff dice): pure
                rules + bot, worker multiplayer integration, client UI, registration.
- Verdict:      workers/games/liars-dice/{rules.js,ai.js} +
                src/sogotable/static/games/liars-dice/{render.js,styles.js,manifest.js}
                [EXISTING directory-pattern owners] + additive touches: games/registry.js
                (GAME_IDS + entry), games/game-kinds.js (predicate), games/render-keys.js,
                app.js (wiring, ~10-25 lines, no new lets), workers/sogotable-api.js
                (import + GAME_HANDLERS row + gameToDictForViewer branch, ~8-12 lines),
                review-export.js (allowlist), workers/tests/liars-dice-rules.test.js.
                NO reorganizer required.
- Flow stage:   validate + apply = workers/games/liars-dice/rules.js (bid legality,
                challenge resolution, die loss, elimination — server RNG behind a
                seedable seam); broadcast = the per-viewer sanitizer
                liarsDiceGameToDictForViewer in rules.js, dispatched from the worker's
                existing gameToDictForViewer seam (Battleship precedent — hidden cups
                are a PROJECTION concern, never a renderer concern); render/intent =
                games/liars-dice/render.js via ctx; persist/orchestrate/record =
                existing platform paths, untouched.
- Sources read: docs/module-ownership.md; docs/modularity.md; docs/wu-wei-method.md;
                workers/tests/architecture.test.js (live CEILINGS: app.js 2497, worker
                1580, styles-games.css 1700; let-cap 30; purity/layering/registry/
                manifest/lobbyMode/review-export guards); docs/placement-receipts.md
                (2026-07-03 Zombie Dice receipt as the template precedent); app.js
                (2446 lines, 30/30 lets, zombie-dice touch sites at 80/115/1798/1801/
                1962); workers/sogotable-api.js (1550 lines; GAME_HANDLERS 1406-1423;
                roomToDictForViewer/gameToDictForViewer 1151-1173); workers/projections.js;
                workers/games/ layout (battleship sanitizer, yahtzee/rtta/zombie-dice
                ai.js precedent); games/zombie-dice/ client layout;
                styles-games.css (1648 lines, untouched by this feature).
- Considerations:
    - app.js is at its top-level-let cap (30/30) with ~51 line headroom; Zombie Dice's
      actual landed wiring pattern (~10-20 lines, 5 touch sites) fits, so no reorg —
      but the placement is conditional: >~40 net lines or any new shell `let` flips it
      to reorganizer-first.
    - workers/sogotable-api.js has ~30 lines headroom vs a ~8-12 line touch — fits;
      flagged as the last comfortable game before a worker extraction is owed.
    - Hidden information is the game's structural novelty. Rejected: sanitizing in the
      client renderer (leaks via wire), sanitizing in projections.js (would put
      game-specific shape knowledge in a platform owner), a per-game branch fan in the
      worker beyond one dispatch line. Chosen: sanitizer as a pure export of the game's
      own rules.js, Battleship's exact seam.
    - Rejected bot-inside-rules (ten-thousand cautionary, rules.js file-cap pressure);
      rejected any cross-game import of dice helpers (games are siblings — share via
      workers/games/util.js).
    - Main stability threats avoided: hidden dice leaking through an unsanitized
      snapshot path (WS broadcast must be verified); rule logic (bid legality/challenge
      math) smuggled into the UI; new cross-cutting shell state at a full let-cap;
      styles landing in the capped styles-games.css instead of the injected per-game
      styles.js.
    - Sibling flag: hot-seat/pass-and-play hidden info on one shared device needs a
      deliberate product answer (peek-to-reveal UI or multiplayer-only) — decide and
      document the exclusion, don't leak by default.
- New owner row: none — both subtrees covered by the standing games/ directory-pattern
                rows in docs/module-ownership.md.

## 2026-07-04 — Unanimous barrier-skip votes (new shared owner: skip-vote.js)
Commit: 85cb000 feat(platform): barrier skips are unanimous votes (skip-vote.js)

PLACEMENT RECEIPT
- Ask:          Make SKIP_PLAYER a unanimous vote (propose / toggle / prune /
                execute-on-unanimity / clear-on-advance) across RTTA and Mazewright,
                with shared tally logic and a doctrine home.
- Verdict:      workers/games/skip-vote.js [NEW owner row] for the shared protocol;
                vote state + gate in workers/games/rtta/rules.js and
                workers/games/mazewright/rules.js [EXISTING]; proposal rendering in
                src/sogotable/static/games/{rtta,mazewright}/render.js [EXISTING];
                standing rule -> docs/adding-a-game.md hard rules, dated decision ->
                docs/project-memory.md.
- Flow stage:   validate via rules + apply state transition (vote is server game
                state); projection carries skip_votes at broadcast; render only
                displays and captures intent — RTTA's client-side two-tap arm is
                removed as shadow rule state.
- Sources read: docs/module-ownership.md, docs/modularity.md, docs/wu-wei-method.md,
                docs/adding-a-game.md (hard rules), workers/tests/architecture.test.js
                (live CEILINGS + coverage/layering/purity guards), workers/games/util.js,
                workers/games/rtta/rules.js, workers/games/mazewright/rules.js,
                src/sogotable/static/games/rtta/render.js (skip/arm section),
                src/sogotable/static/review-export.js, line counts of all touched files.
- Considerations:
    - workers/games/ directory pattern covers only games/<id>/<file>; a file directly
      in workers/games/ needs its own owner row (bots.js/util.js precedent).
    - Rejected util.js (junk-drawer smell: its concern is generic scalar helpers) and
      per-game duplication (three drifting copies; games cannot import each other).
    - Line health: rtta/rules.js 451/800, mazewright/rules.js 276/800, rtta/render.js
      362/800 (shrinks — arm deleted), mazewright/render.js 694/800 (tightest; keep the
      addition small), rtta-rules.test.js 522/800. Reorganizer NOT required.
    - Main threat avoided: rule state (armed/vote progress) living in the UI layer —
      the unanimity gate is server-authoritative; the projection is the wire contract.
    - Zombie-dice has no skip at all; deliberately deferred as its own future
      placement — the injected eligibility predicate reserves the seam.
- New owner row: | workers/games/skip-vote.js | Unanimous barrier-skip vote protocol
                (toggle / prune-ineligible / unanimity / clear) — eligibility predicate
                injected per game | workers/sogotable-api.js |

## 2026-07-04 — No Thanks! (first card game; card-UI pilot quarantined in its game dir)
Commit: (feature/no-thanks) feat(no-thanks): the classic card auction, first card game

PLACEMENT RECEIPT
- Ask:          Place the new "No Thanks" card game — pure rules + hidden-chip
                sanitizer, worker room integration, game-owned card UI (tap/drag
                pilot) + per-game CSS.
- Verdict:      workers/games/no-thanks/{rules,ai}.js +
                src/sogotable/static/games/no-thanks/{manifest,render,cards,styles}.js
                [EXISTING directory-pattern owners; registration lines in
                workers/sogotable-api.js, workers/stats.js, app.js,
                games/registry.js, games/game-kinds.js, review-export.js]
- Flow stage:   validate + apply + record own rules.js (incl. per-viewer sanitize
                at broadcast); render owns the games/no-thanks/ client subtree;
                orchestrate gets dispatch rows only.
- Sources read: docs/module-ownership.md, workers/tests/architecture.test.js (live
                CEILINGS), workers/sogotable-api.js (liars-dice integration points),
                src/sogotable/static/app.js, game subtree listings for
                liars-dice/zombie-dice/rtta.
- Considerations:
    - Live ceilings: workers/sogotable-api.js 1557/1580 pre-change (~9-line
      integration fits; flag: near-exhausted — extract GAME_HANDLERS before the
      NEXT game); app.js 2448/2497 (fits); styles-games.css 1648/1700 (avoided
      entirely — CSS lives in games/no-thanks/styles.js, uncapped).
    - Alternatives rejected: CSS in styles-games.css (near-full capped file);
      card tap/drag primitives in the shell or a shared games/ helper now
      (premature — first card game; extract a shared helper only when a second
      card game needs it, never game-to-game imports); chip-hiding in
      workers/projections.js (hidden-info sanitizers live beside the game's
      rules per the Liar's Dice precedent).
    - Stability threat avoided: no rules logic in render.js (chip legality +
      run scoring are rules-stage), no new weight on the two god-files beyond
      dispatch rows, and the card-UI pilot is quarantined in cards.js inside
      the game's own subtree instead of becoming shell code.
- New owner row: none (both directories covered by existing pattern rows).

Standing flag: workers/sogotable-api.js will not absorb many more ~9-line game
registrations; schedule a reorganizer pass to extract the GAME_HANDLERS table
before the next game lands.

## 2026-07-04 — Worker per-game dispatch layer extracted (prep for Hearts)

REORG RECEIPT
- Trigger:      Hearts placement flagged the Worker entry as full: workers/sogotable-api.js
                sat at 1566 vs its 1580 ceiling (~14 lines headroom) against a ~12-15 line
                registration — the standing 2026-07-04 flag named GAME_HANDLERS as the seam.
- Seam moved:   Per-game dispatch layer — the GAME_HANDLERS table, all per-game rules
                imports, and the game-agnostic dispatchers newGame / gameToDict /
                gameToDictForViewer / legalMoves / chooseBotMove / makeMove /
                moveHandlerFor / ensureBattleshipBotFleets — from `workers/sogotable-api.js`
                to `workers/games/handlers.js` [NEW owner row]. The startRoom and
                handleResetVote per-game if/else chains folded into the table as
                initSeats + carryOptionsOnReset fields (initGameSeats / resetRoomGame),
                and the /api/room/start 10,000 opening_minimum special case became the
                table's applyStartOptions field (applyGameStartOptions).
- Room opened:  workers/sogotable-api.js: 1566 -> 1347 lines; ceiling 1580 -> 1370
                (post-extraction actual + ~23 slack — covers Hearts' ~12-15 line
                registration). handlers.js is 257 lines under the 800 GLOBAL_FILE_CAP
                (per convention, no per-file CEILINGS entry for non-god files).
- Behavior:     PRESERVED — verified via `npm test` (281/281 green). All dispatch logic
                moved verbatim (same table rows, same find predicates, same fallthrough
                order); startRoom/reset/start-options folds are mechanically equivalent
                (same started/undefined guards, same seat-init order, same opening_base
                carry gating); same room dicts, viewer projections, and D1 state shapes.
                Dead imports dropped from the entry (OVERLORD_BOT_ID, clampInteger,
                8 unused super-tic-tac-toe symbols, 3 unused scoreByMark symbols —
                repo-grep confirmed no call sites); __test surface unchanged (10,000 bot
                internals now imported directly from ten-thousand/rules.js).
                architecture.test.js registry guard repointed: the dispatch layer (not
                the entry) now owns the Worker-side registry import; hardcoded-id scan
                extended to handlers.js.
- Sources read: docs/module-ownership.md; docs/modularity.md; docs/wu-wei-method.md;
                workers/tests/architecture.test.js (live CEILINGS + all guards);
                workers/sogotable-api.js (full); workers/games/util.js;
                src/sogotable/static/review-export.js (allowlist + import closure);
                docs/placement-receipts.md; workers/tests/helpers.js (__test consumer);
                package.json (test command).
- Restraint:    One seam only — did NOT split bot-turn orchestration (runBotTurns /
                botSeatForCurrentTurn stay in the entry: room orchestration), room-dict
                projections, seat-color helpers, or route handlers; did NOT pre-add any
                Hearts code, row, or import; did NOT touch any rules module's logic.
- New owner row: | `workers/games/handlers.js` | Per-game dispatch table + game-agnostic
                dispatchers (create / toDict / viewer projection / legalMoves / bot /
                initSeats / start-options) | `workers/sogotable-api.js` |

## 2026-07-04 — Hearts (new game)

```
PLACEMENT RECEIPT
- Ask:          Place all new code for Hearts — 4-player trick-taking, hidden hands,
                host options at table creation, bots, animated card UI, sounds,
                server-authoritative worker integration.
- Verdict:      workers/games/hearts/{rules.js,ai.js} [EXISTING dir pattern];
                src/sogotable/static/games/hearts/{manifest.js,render.js,styles.js}
                [EXISTING dir pattern];
                src/sogotable/static/games/playing-cards.js [NEW owner row — shared
                52-card face/back builders + canonical sort; No Thanks!''s tier-tinted
                number cards are a different visual system and stay in
                no-thanks/cards.js];
                workers/games/handlers.js: one import + one GAME_HANDLERS row
                (initSeats / applyStartOptions / carryOptionsOnReset /
                gameToDictForViewer dispatch) — zero net lines in
                workers/sogotable-api.js;
                minimal wiring: games/registry.js (GAME_IDS.hearts + entry),
                games/game-kinds.js, games/render-keys.js, app.js (~8 lines incl.
                generalizing the shared host-start poster to carry an options
                payload), workers/stats.js (scoreByMark row), sound.js (6 card cues),
                review-export.js allowlist, docs/game-hearts.md.
- Flow stage:   validate + apply = workers/games/hearts/rules.js (2♣ opener, follow
                suit, hearts-broken, first-trick blood, pass rotation, moon old/new,
                J♦ option, target score); broadcast = heartsGameToDictForViewer in
                that same module (other hands → nulls, pass selections secret,
                legal_plays masked off-turn), dispatched via handlers.js; render =
                games/hearts/render.js + games/playing-cards.js + injected styles.js
                (event-replay pacing: animated deal, plays slide from seats, tricks
                glide to the winner; interactions unlock only when settled);
                orchestrate = worker dispatch table only; record = workers/stats.js.
- Preparatory:  REORG RECEIPT above (2c67993) — GAME_HANDLERS extraction opened the
                seam first; Hearts landed as the table row it predicted.
- Tests:        workers/tests/hearts-rules.test.js — 19 cases incl. a scripted
                moon-shot round (both styles), sanitizer leak checks, option clamps,
                20-seed bots-only games to completion. Prototype twin (gitignored):
                AI/hearts/ (rules+bot+preview.html, 2,000-game headless smoke).
- Siblings:     public vs private view (sanitizer, tested); bot vs human (same
                makeHeartsMove path); reconnect (fresh join renders live state, no
                history replay); hot-seat EXCLUDED for a hidden-hand game (Liar''s
                Dice v1 precedent) — documented in docs/game-hearts.md.
- New owner row: | `src/sogotable/static/games/playing-cards.js` | Shared
                standard-deck (52-card) card-face + hand HTML primitives — pure
                builders, no rules, no per-game logic | `src/sogotable/static/app.js` |
```

## 2026-07-05 — Potion Lab (Sushi Go! re-theme)

```
PLACEMENT RECEIPT
- Ask:          Port a NEW game "Potion Lab" (Sushi Go! re-theme) into SogoTable —
                simultaneous N-player (min 2, no max, bots fill) card drafting, hidden
                hands, 3 rounds, host-start lobby, round-locked (liveRound) sync.
- Verdict:      EXISTING owners — no new owner row. New files land under the covered
                directory patterns workers/games/potion-lab/** and
                src/sogotable/static/games/potion-lab/**; registered via in-place edits
                to registry.js, workers/games/handlers.js, games/game-kinds.js, app.js,
                and review-export.js. workers/sogotable-api.js is NOT touched.
- Flow stage:   Spans the flow; NEW code is distributed by stage — validate + apply +
                round-barrier resolution + scoring + record in workers/games/potion-lab/
                rules.js (server authority); broadcast/per-viewer hand sanitization via
                potionLabGameToDictForViewer + handlers.js dispatch; render + capture
                intent in games/potion-lab/render.js. Normalize/persist/orchestrate reuse
                the platform unchanged.
- Considerations:
    - app.js at 2475/2497 (22 lines free) was the only near-ceiling target; Potion Lab
      joined the shared live-round render branch reusing postRoomAction + startYahtzeeGame,
      so net growth was 1 import line — no reorganizer needed. Confirmed 2475 lines after.
    - workers/sogotable-api.js (1363/1370) was NOT edited — the entry reaches games via
      generic dispatchers from handlers.js.
    - Hidden hands: rules.js owns potionLabGameToDictForViewer (masks every other hand
      to null; deck stripped for everyone in toDict); rules.js stays DOM/transport/
      storage-pure (architecture test green).
- New owner row: none.
- Verification:  workers/tests/potion-lab.test.js (barrier, scoring, sanitizer, stale
                 commits) + full suite 310/310 green. Prototype heavily verified in
                 AI/potion-lab/ before the port. Commit: pending (this change).
```

```
PLACEMENT RECEIPT
- Ask:          Where does the Mystic Wood "Mystic Horn" client effect live — a ~2s
                choreographed token tour, a colour-flashing narrating banner over the
                chronicle strip with an exit button, and a horn fanfare — plus the
                server side that announces the scatter as a one-shot event.
- Verdict:      EXISTING owners — no new owner row. New client file
                src/sogotable/static/games/mystic-wood/horn.js is covered by the
                per-game directory pattern. playMysticHorn joins the sound owner
                src/sogotable/static/sound.js. Server split: engine.js resolveSpell
                RECORDS game.horn (seq'd, like recordRoll); rules.js
                mysticWoodGameToDict PROJECTS it. styles.js takes the banner CSS.
- Flow stage:   render — the effect only PRESENTS an already-applied transition. The
                mirror rule stays server-authoritative in engine.js; the client reads
                horn.tour + the projected cells and derives no position of its own.
- Considerations:
    - render.js was 712/800 (GLOBAL_FILE_CAP). Inlining ~100 lines of choreography
      would breach the cap and stack a third concern on the board-render hub, so the
      effect is a new leaf module (fan-in 1) and render.js took a 6-line hook only:
      resetHorn on fresh mount, syncHorn before animateTokens, and glide suppression
      while hornOwnsTokens(). render.js finished at 718/800 — no reorganizer needed.
    - horn.js imports sound.js directly (the sanctioned per-game pattern) and never
      the shell; grid stride + prevPos are injected by render.js.
    - Sibling parity: bot and human casts share resolveSpell, so one choke point
      covers both. The scatter is public information — no per-viewer sanitizer.
      A reload/reconnect adopts horn.seq without replaying (same guard as roll_seq).
- New owner row: none. (CI action taken instead: horn.js added to REVIEW_EXPORT_FILES.)
- Verification:  workers/tests/mystic-wood-rules.test.js gains 2 tests (scatter +
                 seq'd event; projection carries it); full suite 331/331 green.
                 horn.js choreography driven against DOM stubs: waypoints, once-only
                 seq guard, banner re-mount, dismiss. Advisor: placement-advisor.
```

## 2026-07-09 — RETROACTIVE: workers/bug-reports.js (bug-report store leaf)

> Reconstructed after the fact (code-steward finding, 2026-07-09 pass): commit c67a08c created a
> new owner but logged no receipt. The placement was correct; this restores the paper trail.

```
PLACEMENT RECEIPT
- Ask:          Pull the bug_reports store (append/list/clear, later resolve/update) out of the
                Worker entry into its own module.
- Verdict:      New leaf `workers/bug-reports.js` (zero fan-in; owns the data.bug_reports lifecycle);
                the entry keeps thin dispatch routes only. Passcode gate → assertSogoPasscode in
                workers/platform/auth.js (existing owner, no new row).
- Flow stage:   persist / record-outcome — stores admin dispositions; decides no game rules.
- Considerations:
    - Entry (workers/sogotable-api.js) was at its ratcheted ceiling; a fourth bug-report handler
      would fatten a god-file. A cohesive store concern earns its own leaf (stats.js/projections.js
      precedent). Reorganizer extracted append/list/clear first; the ceiling ratcheted down.
    - Must-not-import the entry (matches stats.js/projections.js); added to REVIEW_EXPORT_FILES.
- New owner row: `workers/bug-reports.js` (present in docs/module-ownership.md since c67a08c).
- Verification:  workers/tests/bug-reports.test.js pins resolve/update; full suite green.
                 Advisor: placement-advisor (2026-07-08). Retroactive log: 2026-07-09.
```

## 2026-07-11 — REORG: extract Mystic spells/storm from engine.js

```
REORG RECEIPT
- Trigger:      workers/games/mystic-wood/engine.js hit 812 lines, over the 800-line GLOBAL_FILE_CAP,
                after the legitimate strandCompanions (§10 companion-stranding) feature landed; the
                architecture test failed until engine.js dropped back under 800.
- Seam moved:   Mystic spells (Fog/Wind/Horn) + Magician storm — resolveSpell, recordHorn, raiseStorm,
                decayStorms, stormWhere — from engine.js to workers/games/mystic-wood/spells.js
                [EXISTING owner via the workers/games/ owned-directory pattern — no new module-ownership row].
- Room opened:  engine.js 812 → 748 lines (52 under the cap); spells.js is 72 lines. GLOBAL_FILE_CAP
                unchanged (shared backstop, not a per-file ceiling).
- Behavior:     PRESERVED — pure move, no logic/signature/name changes. recordRotation stays exported in
                engine.js (shared by the Wand's powerRotate); sendIllusion stays (a combat/applyWin helper).
                spells.js is a one-way leaf: imports { logEvent, relocate, recordRotation } from engine.js,
                engine imports nothing back — no cycle.
- Files rewired: rules.js, ai.js, workers/tests/mystic-wood-rules.test.js, src/sogotable/static/review-export.js.
- Verification:  node --test workers/tests/*.test.js → 374 pass, 0 fail (incl. architecture.test.js).
                 Reorganizer: reorganizer agent (2026-07-11).
```

## 2026-07-12 — Mystic Wood playtest room QZCS (4 reports): UI soft-lock + §9

```
PLACEMENT RECEIPT
- Ask:          Four playtest reports from room QZCS. Two are one root cause (the game freezes with
                "⏳ Working…" up); one asks whether a second denizen after catching the Horse is legal;
                one asks for a rule audit of a full game log.
- Verdict:      (1) src/sogotable/static/app.js — postRoomAction's catch [EXISTING owner]
                (2) src/sogotable/static/games/mystic-wood/render.js — cellsHtml's myTurn [EXISTING]
                (3) workers/games/mystic-wood/rules.js — afterEncounter / doWithdraw / pendingToDict [EXISTING]
                (4) src/sogotable/static/games/mystic-wood/encounter.js — the §9 banner [EXISTING]
                (5) workers/games/mystic-wood/ai.js — botMeet, the §9 bot sibling path [EXISTING]
- Flow stage:   (1) render (the shell's terminal-path render fan) · (2) render (affordance from published
                state) · (3) validate + apply + broadcast · (4) render · (5) validate + apply (bot turn)
- Advisor:      placement-advisor (2026-07-12). New owner rows: NONE — all five land in existing owners.
- Considerations:
    - app.js was 2493/2497 (CEILINGS). The advisor ruled a net +1 line does NOT cross the ceiling, so
      modularity.md's objective trigger for a preparatory refactor is not met and its restraint clause
      forbids a speculative one. Reorganizer: NOT required. Landed at 2494/2497.
    - The advisor TRIMMED the app.js change from +2 to +1: re-render on the catch only, NOT on the
      pendingMove early-return (that path is not a leak — the in-flight move owns its own terminal render,
      and rendering there would clear a badge that is still truthfully reporting work on the wire). The
      invariant restored is "both terminal paths render", not "every return renders".
    - Rejected: clearing the "working" latch inside mystic-wood's client. That is the doctrine's named
      anti-pattern (defensive patch in every caller instead of one upstream boundary) — EVERY game that
      latches UI on send has this latent freeze, because they all route through ctx.makeMove =
      postRoomAction. Fixing it upstream fixes RTTA/Hearts/etc. for free.
    - Rejected: teaching render.js move-legality. Its guard mirrors published seat fields (moved/freeMove)
      only; rules.js doHumanMove keeps the reject. The UI stops LYING about what is offered; it decides nothing.
- Sibling paths: bot vs human on §9 — checked, and it was BROKEN: ai.js botEnter met the first card of a
                two-card area and walked away from the second, a rule a human is bound by. Fixed in ai.js
                (botMeet). Bots never withdraw, so the doWithdraw guard has no bot blast radius.
- Verification: node --test workers/tests/*.test.js → 400 pass, 0 fail (was 396; +4 new tests).
- app.js is FULL as of this commit (2494/2497). The NEXT app.js change of any size goes to the reorganizer
  first. Pre-named seam: extract postRoomAction / makeTenThousandAction / the pendingMove in-flight guard
  into a new src/sogotable/static/client/room-actions.js owner (also lifts a top-level `let` out of the shell).
- For the code-steward (NOT this batch): render.js reachableSet duplicates rules.js reachableFrom — the client
  mirrors legality instead of consuming it, which is the root class of the soft-lock. The durable fix is for
  rules.js to publish the legal target set in the projection. That is a projection-contract change = a second hat.
```

## 2026-07-12 — Mystic Wood playtest room 4T6D (7 reports)

```
PLACEMENT RECEIPT
- Ask:          Place five Mystic Wood playtest fixes — the crown's quest text (§18.10), the Prince spent
                only when decisive (§18.15/§12), a modal for delivering the Boy/Damsel (§15), the second
                denizen of a §9 glade drawn on the board, and the combat-tie reveal — and say whether any
                needs a reorganizer pass or a new owner row.
- Verdict:      workers/games/mystic-wood/{rules.js, engine.js, data.js} +
                src/sogotable/static/games/mystic-wood/{render.js, encounter.js, styles.js}
                [ALL EXISTING owners; covered by the two games/ directory rows]
- Flow stage:   quest text = projection (broadcast) + record; Prince = validate/apply (pure rules);
                rescue modal = record; §9 glyph + tie reveal = render.
- New owner row: none. Reorganizer: none.
- Considerations:
    - Caps (GLOBAL_FILE_CAP 800): engine 708→739, rules 630→647, render 733→743, encounter 372→400,
      data 203→206. Nothing crosses a cap, so modularity.md's objective trigger for a preparatory
      refactor is not met and its restraint clause forbids a speculative one.
    - The advisor CORRECTED two of the five plans, both of which would have silently not worked:
      (1) the crown's notice — game.results[mark] is a SINGLE SLOT, and both becomeKing callers
      (engine.js applyWin → recordRoll; rules.js doJoust → recordJoust) record immediately after, so a
      notice there is overwritten and never seen. Routed through logEvent instead, which BOTH result
      modals already surface via their `detail: logSince(...)` capture — one line, both sibling paths.
      (2) the Prince — applyWin runs BEFORE usePrince and reads _princeAiding to deny the §18.15 prowess,
      so a decisiveness check inside usePrince fires too late: he'd be kept AND the prowess still stripped.
      The verdict is now computed before applyWin.
    - CI trap surfaced by the advisor: mystic-wood-parity.test.js pins the KNIGHTS key set across
      data.js/content.js, so the King's quest text is a separate export (KING_QUEST), not a KNIGHTS row.
    - Rejected: a shared notice() helper for item 3 (one new call site; retrofitting the three existing
      notices is a behaviour-preserving refactor and must not ride in a fix commit — Two Hats).
    - Rejected: the §9 badge CSS in styles-games.css (ratcheted at 1700 in CEILINGS). Per-game injected
      styles.js owns it and is uncapped.
- Sibling paths: bot vs human — the Prince change rides resolveChallenge, which bots share (parity is
                automatic); the rescue modal is guarded !is_bot, and ai.js calls the same deliverRescue.
                greet_pick shares pickCard with combat_pick, so the tie reveal covers both by construction.
                combatPreview is unchanged: the Prince still AIDS, only the SPENDING changed.
- Verification: node --test workers/tests/*.test.js → 408 pass, 0 fail (was 407 before; +6 new, 1 retargeted).
- FLAG (next client change): render.js is 743/800. The next feature of any size must first extract the peek
  subsystem (showPop/hidePop/requestHide/peekContent/denizenSummary/playerPeek) to mystic-wood/peek.js.
  Pre-named seam; deliberately NOT opened in this batch.
```

## 2026-07-12 — Power-Limit player choice (§14/§18): first Informed-Consent slice

```
PLACEMENT RECEIPT (advisor: placement-advisor)
- Ask:          Make the power-limit (S+P≤10) surrender an interactive human choice at end of
                turn; bots keep auto-resolving; disposal-to-tile stays a follow-up.
- Verdict (5 pieces, per stage):
    1. enforcePower → bot-only guard ....... engine.js        [EXISTING] (1 line; every inline
                                                                caller becomes bot-only at once)
    2. end-of-turn over-limit check + pending  rules.js       [EXISTING] (gate at the single
                                                                passTurn chokepoint, human-only)
    3. power_shed move (doPowerShed + case +   rules.js       [EXISTING] (mirrors doEscapePick)
       pendingToDict projection)
    4. shedCard + powerShedChoices (pure) ... workers/games/mystic-wood/power.js  [NEW leaf —
                                                covered by workers/games/ dir pattern, NO owner row]
    5. power_shed pick modal (showPowerShed)   encounter.js   [EXISTING] (modal family home);
       render.js [EXISTING] gets ONLY wiring (import + dispatch whitelist + bar button + data-act)
- Why the new leaf: engine.js 751/800 — the ~40 new pure lines would cross the global 800 cap, and
                enforcePower can't be extracted cleanly (engine calls it internally → import cycle).
                So NEW pure pieces go to power.js (imports engine+data; engine never imports back →
                clean DAG; joust.js/spells.js precedent). Keeps engine.js at ~752.
- render.js 743/800: modal routed to encounter.js (~403/800), NOT render.js — render gets ~10 wiring
                lines only. The pre-named peek-subsystem seam is still NOT opened (deferred).
- CI trap handled: rules.js is in REVIEW_EXPORT_FILES and imports ./power.js, so power.js was added
                to the allowlist (review-export.js) — import-closure test stays green.
- Reorganizer:  NONE (new leaf is normal implementer work under the games/ pattern).
- Scope: the CHOICE only. Disposal (Thing→tile, slayer→beast revert, §18) is the documented follow-up.
- Sibling paths: bot vs human — enforcePower still auto-sheds bots inline; bots never reach passTurn's
                human-only gate. Golden-Bough heuristic test retargeted to a bot seat.
- Verification: node --test workers/tests/*.test.js → 411 pass, 0 fail. New: human power_shed flow
                (hold turn → choose → pass; spoofed index throws); the 24-seed integration harness now
                drives power_shed too. On-device modal check remains for MojoSOGO.
```

## 2026-07-12 — Missed-broadcast recovery for room sync (two-human deadlock, room HSYF)

```
PLACEMENT RECEIPT (advisor: placement-advisor)
- Ask:          Recover from a MISSED room-state broadcast — the two-human deadlock where a
                client never received the "it's your turn" snapshot, the game then waits on that
                stale client, and no further broadcast comes to unstick it (players restart the app).
- Verdict:      src/sogotable/static/realtime.js  [EXISTING] — the mechanism: a visibilitychange/
                pageshow listener (reconnect+re-pull on foreground, reusing refreshRoomLiveUpdates)
                and a ~7s safety-net poll timer, armed on start / disarmed on stop.
                src/sogotable/static/app.js  [EXISTING] — ONE new callback on the existing
                createRealtimeController({...}) literal: shouldPollRoom() (in a started, playing,
                non-solo room AND it's not my turn), reusing localRoomSeat/isSoloRoom. +1 line.
- Why:          realtime.js owns the socket lifecycle & reconnect — recovery timers/listeners are its
                concern. The waiting predicate is applied game-state the SHELL owns; it flows in via the
                callbacks object (like shouldReconnectRoom/getRoomPlayerId), never by transport reaching
                into turn state. Transport re-pulls messages; it does not resolve turn semantics.
- Poll is triple-gated (quota): armed only while in a room, only while shouldPollRoom() (not my turn),
                only while the tab is visible; disarmed on leaving the room. Both paths RE-FETCH only
                (callbacks.refreshRoom) — no new mutation/broadcast; setRoom's isStaleRoomSnapshot
                revision guard makes a late/older reply safe.
- Ceiling:      app.js was at 2494/2497 (3-line headroom). The one-line callback → 2495, under cap. No
                reorganizer needed. NOTE: app.js is now at 2495/2497 — the next shell addition needs an
                extraction first.
- Reorganizer:  NONE. New owner row: NONE (existing platform owners).
- Verification: 412 tests pass; architecture load-eval + ceiling guards green. Two-device on-device
                check (background one phone mid-turn, return) remains for MojoSOGO — inherent to the bug.
```

## 2026-07-12 — RETROACTIVE — room-view projection extraction (new owner row)
Commit: e634f18 refactor(worker): extract room-view projection from sogotable-api.js to open ceiling headroom
Logged 2026-07-15 (Steward Pass 7, maintenance-plan Task 3): the pass-7 receipts-vs-commits
audit found this reorg shipped a new top-level owner row in `docs/module-ownership.md` with
no receipt. Codified rule (2nd pass): a new top-level owner row is *always* a receipt.
Substance reconstructed from the commit body; the audit verified the placement was correct.

```
REORG RECEIPT (commit e634f18) — RETROACTIVE
- Trigger:      The Worker entry `workers/sogotable-api.js` sat at 1330/1330 — zero headroom —
                ahead of further worker work; make room first, as its own behavior-preserving commit.
- Seam moved:   Room WIRE PROJECTION — public room/summary/invite dicts + viewer projection +
                revision/freshness bookkeeping — from `workers/sogotable-api.js` to a NEW leaf
                `workers/room-view.js`, wired back by pure (downstream-only) import.
- Room opened:  sogotable-api.js 1330 → 1230 lines; ceiling ratcheted 1330 → 1230.
                room-view.js is a 116-line leaf under the global backstop (no dedicated ceiling).
- Behavior:     PRESERVED — functions moved verbatim; no HTTP route, Durable Object binding,
                broadcast shape, revision logic, or response changed. The three DO classes stay
                exported from the entry, so wrangler.toml bindings are unaffected. 412 tests green.
- Restraint:    Deliberately did NOT extract the DO classes — they couple back to entry-local
                routeRequest/notify*/runBotTurns (a circular back-import); room-view is downstream-only.
- New owner row: | `workers/room-view.js` | Room wire projection: public room/summary/invite dicts +
                viewer projection + revision/freshness bookkeeping | `workers/sogotable-api.js` |
                (shipped in e634f18; this receipt is the missing audit-trail entry for it).
                review-export allowlist entry also added in the original commit.
- Reorganizer:  YES (behavior-preserving preparatory extraction).
```

## 2026-07-12 — RETROACTIVE — sound-controls extraction (new owner row)
Commit: f37ba3d refactor(shell): extract sound-controls from app.js to open ceiling headroom
Logged 2026-07-15 (Steward Pass 7, maintenance-plan Task 3): same audit, same finding — a new
top-level owner row in `docs/module-ownership.md` shipped without a receipt. Substance
reconstructed from the commit body; the audit verified the placement was correct.

```
REORG RECEIPT (commit f37ba3d) — RETROACTIVE
- Trigger:      `src/sogotable/static/app.js` sat at 2496/2497 — one line under its hard CEILINGS
                cap, no runway — ahead of further shell work; open a seam first.
- Seam moved:   Sound-control UI wiring — mute/volume toggle buttons + one-time audio unlock +
                global control-click SFX — from `app.js` to a NEW leaf controller
                `src/sogotable/static/controllers/sound-controls.js`, wired once via
                wireSoundControls() from DOMContentLoaded.
- Room opened:  app.js 2496 → 2456 lines; ceiling ratcheted 2497 → 2456 (41 lines headroom).
                sound-controls.js is a 51-line leaf under the global backstop.
- Behavior:     PRESERVED — the three functions moved verbatim (same DOM listeners, button
                markup/aria/title, SFX); the module imports ../sound.js directly and needs no ctx
                (zero shell state moved). 412 tests green.
- Restraint:    Sound-control UI only; no shell state relocated, no unrelated app.js edits.
- New owner row: | `src/sogotable/static/controllers/sound-controls.js` | Sound mute/volume toggle
                UI + audio unlock + control-click SFX wiring | `src/sogotable/static/app.js` |
                (shipped in f37ba3d; this receipt is the missing audit-trail entry for it).
                review-export allowlist entry also added in the original commit.
- Reorganizer:  YES (behavior-preserving preparatory extraction).
```

## 2026-07-20 — Well, Now You Know (CAH port): headless engine, deck data, custom-card library, deferred registration

Placement-advisor consult ahead of the headless-engine build (spec: AI/cah/RULES.md; UI developed
in AI/, ported later). Four receipts below; no reorganizer pass anywhere — no capped file pressured.

```
PLACEMENT RECEIPT
- Ask:          Where does the headless "Well, Now You Know" (CAH port) rules engine live?
- Verdict:      workers/games/wnyk/ (rules.js + ai.js)  [EXISTING — games-subtree directory-pattern
                row; no new ownership rows]
- Flow stage:   validate via rules + apply state transition (viewer sanitizer = the broadcast-stage
                projection, computed in rules like liars-dice)
- Sources read: docs/module-ownership.md, docs/modularity.md, docs/wu-wei-method.md,
                workers/tests/architecture.test.js, AI/cah/RULES.md, workers/games/handlers.js,
                workers/games/skip-vote.js, liars-dice + hearts + potion-lab + mystic-wood layouts
- Considerations:
    - Every shipped game follows workers/games/<id>/rules.js (+ai.js); rules-purity test and the
      800 global cap apply; new leaf, zero fan-in. `wnyk` follows the RTTA abbreviation precedent.
    - Rejected: any placement in the worker entry (dispatch was extracted precisely to keep games
      out) or a per-game skip-vote reimplementation (skip-vote.js owns the protocol).
    - CONFLICT RESOLVED: spec's 2/3-majority skip vs the standing unanimous-skip decision
      (skip-vote.js, 2026-07-04). MojoSOGO's 2026-07-20 spec instruction is newer and explicit for
      this game: skip-vote.js generalized with an injected threshold — existing games keep
      unanimous (default), WNYK passes 2/3-of-other-humans. Same owner either way.
    - Threat avoided: hidden-info authorship leaking — sanitizer lives in rules.js
      (wnykGameToDictForViewer), never in transport or UI.
- Reorganizer:  NONE. New owner row: NONE.
```

```
PLACEMENT RECEIPT
- Ask:          Where does the filtered CAH card deck data (~1,970 cards) live?
- Verdict:      workers/games/wnyk/decks.js, generated by scripts/build-wnyk-decks.mjs
                [EXISTING — games-subtree pattern; + one reviewed FILE_CAP_EXCEPTIONS entry in
                workers/tests/architecture.test.js]
- Flow stage:   apply state transition input data (server-authoritative dealing); server-only,
                no client copy
- Sources read: workers/tests/architecture.test.js (GLOBAL_FILE_CAP + FILE_CAP_EXCEPTIONS
                mechanism), workers/games/mystic-wood/data.js (data-module precedent),
                AI/cah/RULES.md §7
- Considerations:
    - One-card-per-line data exceeds the 800 backstop; blessed as a reviewed pure-data exception
      (pinned at generated size + WORKING_BUFFER, commented) rather than packing lines to dodge
      the metric. The cap exists to catch god-CODE; this is generated data, not code.
    - Rejected: shipping a client deck copy (payload + split-brain — projections carry dealt card
      text) and committing the raw 1.9MB dataset (AI/ stays ignored; filter at build time).
    - License: card text CC BY-NC-SA 4.0 (Cards Against Humanity via JSON Against Humanity);
      attribution obligation recorded in the module header, owed in the game's help UI at port time.
- Reorganizer:  NONE. New owner row: NONE (FILE_CAP_EXCEPTIONS entry with justification comment).
```

```
PLACEMENT RECEIPT
- Ask:          Where do permanent attributed write-in custom cards persist (spec said
                "custom_cards D1 table"), and who owns read/write?
- Verdict:      workers/custom-cards.js  [NEW owner row] — data.custom_cards array in the single
                app_state blob, bug-reports.js pattern; NO new D1 table, NO change to
                workers/persistence/state.js
- Flow stage:   persist room state (durable store) + record outcome (append at resolution); the
                deck merge itself stays in wnyk rules on passed-in data
- Sources read: workers/bug-reports.js, workers/persistence/state.js (ensureSchema — the only
                schema owner), docs/module-ownership.md
- Considerations:
    - Corrected premise: bug-reports owns an in-blob array, not a table; the project has one D1
      table (app_state). Following the riverbed avoids the project's first second-table schema
      path for a few 80-char rows per game.
    - Rejected: placing the store inside workers/games/wnyk/ (the library outlives rooms and may
      serve future games — cross-room persistence is not one game's concern) and a real
      CREATE TABLE in ensureSchema (reserved for if the blob ever strains).
    - Threat avoided: rules module reading storage — orchestration passes the card list in as
      plain data; rules stay pure. Admin curation UI: follow-up in manage tooling, out of scope.
- Reorganizer:  NONE.
- New owner row: | `workers/custom-cards.js` | Custom card library store: append / list / retire
                attributed write-in cards over data.custom_cards | `workers/sogotable-api.js` |
```

```
PLACEMENT RECEIPT
- Ask:          Confirm the worker dispatch seam for registering the new game, and whether the
                handler file is part of the game module.
- Verdict:      workers/games/handlers.js (one import + one GAME_HANDLERS row + one
                gameToDictForViewer line)  [EXISTING seam, CONFIRMED] — registration DEFERRED to
                the UI-port phase
- Flow stage:   orchestrate (game-agnostic dispatch)
- Sources read: workers/games/handlers.js, workers/game-catalog.js (cleanGameId throws on
                unregistered ids), src/sogotable/static/games/registry.js + app.js availability
                handling ("coming_soon" still lists visibly)
- Considerations:
    - No separate handler file per game: the handler surface is rules.js's exports bound by one
      table row (Hearts row = template incl. applyStartOptions/carryOptionsOnReset for
      target-score + deck host options).
    - Deferred because a row is dead code without a registry id (cleanGameId throws), and any
      registry row — even non-ready — appears in the live game list, violating the
      invisible-until-ported requirement.
    - Threat flagged for port time: the viewer-projection line must land with the row (hidden-info
      game) or private hands leak into public broadcasts.
- Reorganizer:  NONE. New owner row: NONE.
```

## 2026-07-20 — WNYK card rating (crowd curation): durable ratings store

Follow-up consult for AI/cah/RULES.md §5b (players 👍/👎 dealt cards; lifetime tallies; net −3
removes a card from future decks).

```
PLACEMENT RECEIPT
- Ask:          Where does WNYK's durable cross-game card-rating store (👍/👎 tallies + net −3
                removal, spec AI/cah/RULES.md §5b) live — extend workers/custom-cards.js or a new
                leaf — and who owns the rating-driven retire of a custom card + the threshold const?
- Verdict:      workers/card-ratings.js  [NEW owner row] — data.card_ratings in the app_state blob,
                bug-reports/custom-cards pattern. Cross-module retire: orchestration (worker entry,
                at registration/wiring time) composes applyCardRatings → retireCustomCard; neither
                leaf imports the other. Threshold constant: owned by workers/card-ratings.js
                (CARD_TEXT_LIMIT precedent); engine records raw votes only. Engine-side ruling
                (rate action → game.new_card_ratings in workers/games/wnyk/rules.js) confirmed
                unchanged.
- Flow stage:   persist room state + record outcome (tally/removal at game resolution); the deal
                exclusion is apply-stage input data passed in at room creation, rules stay pure.
- Sources read: docs/module-ownership.md, docs/modularity.md, docs/wu-wei-method.md,
                workers/tests/architecture.test.js (live: worker entry 1229/1254, 800 backstop,
                WORKING_BUFFER 25), AI/cah/RULES.md §5b, docs/placement-receipts.md (2026-07-20 WNYK
                receipts), workers/custom-cards.js (67 lines), workers/games/wnyk/rules.js.
- Considerations:
    - Rejected Option A (broaden custom-cards.js): objection is concern count, not size — its row
      names one concern (write-in library lifecycle); rating tallies over standard-deck keys is a
      second lifecycle with different data and reasons to change. "General card library" is the
      junk-drawer trajectory the map exists to stop.
    - Rejected leaf-to-leaf import for the retire flip: card-ratings importing custom-cards would
      make the rating store own write-in lifecycle; modularity.md places spanning behavior at the
      boundary — the worker entry already holds `data` and composes both pure stores.
    - Rejected engine- or config-owned threshold: library curation policy is cross-game and applied
      at persist time, not during play; no config owner exists and one consumer doesn't justify one.
    - Stability caveat recorded: store keys are opaque; per-deck+index keys go stale if decks.js is
      regenerated with different pack filtering — header comment owed.
    - Threat avoided: a second concern accreting in a young store module, and rules touching storage.
- Reorganizer:  NONE — no capped file pressured; new leaf under the 800 backstop.
- New owner row: | `workers/card-ratings.js` | Card rating store: per-card 👍/👎 vote tallies +
                net-threshold removal decisions over data.card_ratings | `workers/sogotable-api.js` |
```

## 2026-07-20 — WNYK port: game↔card-library composition (new owner row)

```
PLACEMENT RECEIPT
- Ask:          Where does WNYK's worker-entry orchestration wiring live — creation-time library
                inputs into game creation, and resolution-time harvest (appendCustomCards /
                applyCardRatings / retireCustomCard) — entry-inline vs a new leaf, and is a new
                handlers.js hook needed?
- Verdict:      workers/game-library.js  [NEW owner row] — game-agnostic composer of the two
                stores; entry calls it in ~7 lines (start inject via the EXISTING
                applyStartOptions hook with server inputs spread last, reset re-inject, and one
                harvest line beside each of the three recordCompletedRoomStats sites).
- Flow stage:   orchestrate (entry coordinates) + persist/record (the leaf composes the stores);
                deck inputs remain apply-stage plain data, rules stay pure.
- Sources read: docs/module-ownership.md, workers/tests/architecture.test.js (live: entry
                1229/1254, WORKING_BUFFER 25, 800 backstop, review-export closure test),
                workers/sogotable-api.js (create/start/move/reset/runBotTurns sites),
                workers/games/handlers.js (full), workers/games/wnyk/rules.js
                (newWnykGame/setWnykOptions contract, new_custom_cards/new_card_ratings),
                workers/custom-cards.js + workers/card-ratings.js exports,
                docs/placement-receipts.md (2026-07-20 WNYK entries),
                src/sogotable/static/review-export.js (allowlist carries workers/sogotable-api.js).
- Considerations:
    - Entry is at exactly its re-pin (1229/1254): 25–50 inline lines would cross the ceiling AND
      add a library-bookkeeping concern to a router — rejected as the top-heavy move.
    - Rejected workers/wnyk-library.js: the module never touches WNYK internals — it operates on
      the generic new_custom_cards/new_card_ratings contract and the two stores, and future
      write-in/rating games ride the same seam free.
    - Rejected a new handlers.js hook or data-aware rows: applyStartOptions already carries the
      per-game part (setWnykOptions was built to take the library as plain data); giving dispatch
      rows `data` access would smuggle storage into the dispatch layer.
    - Standing receipt honored: neither leaf store imports the other; the "composition root" duty
      is discharged by a NAMED composer the entry calls, not by entry-inline growth.
    - Threats avoided: entry ceiling breach; client-spoofed library via the start payload (server
      inputs spread last); a bot-finished game skipping the harvest (all three resolution sites
      wired); review-export white-screen (three worker paths added to the allowlist).
    - Implementation note: harvest gates on game.status === "complete" and DRAINS the two game
      arrays as it persists — the engine recomputes new_card_ratings while play continues, so an
      earlier harvest would double count on the next recount; drain-once is the idempotence.
- Reorganizer:  NONE — entry stays pinned at 1229+25 (post-wiring: 1242/1254).
- New owner row: | `workers/game-library.js` | Game↔card-library composition: creation-time deck
                inputs (active customs + removed keys + usage map) and resolution-time harvest
                (append write-ins, apply ratings, retire rating-removed customs) across the
                custom-cards + card-ratings stores | `workers/sogotable-api.js` |
```

## 2026-07-20 — WNYK registration EXECUTED (deferred receipt closed)

The 2026-07-20 "Worker dispatch registration — DEFERRED" receipt is now executed at the
UI port (MojoSOGO approved go-live; the developed UI lifted verbatim from
AI/cah/preview.html's LIFT SEAM blocks per the hard port rule). One commit carries, as
that receipt required: the registry row (GAME_IDS.wnyk — the id literal moved from
wnyk/runtime.js to the registry, Mazewright precedent), the game-kinds predicate, the
app.js import + dispatch, the render-keys slice, the games/wnyk/ client module
(manifest/render/cards/styles), and the handlers.js row TOGETHER WITH the
gameToDictForViewer chain line (hidden-info game — the sanitizer line may never trail
the row). Review-export allowlist extended with the six worker-side and four
client-side wnyk modules for the import-closure guard.

## 2026-11-12 — Auto-update: extract deploy-version code to client/app-update.js

Preparatory refactor (own commit, before the auto-update feature lands). Placement already
decided: deploy-version awareness gets a new client/ owner; app.js only imports and calls.

```
REORG RECEIPT
- Trigger:      Auto-update (revision.json poll + SW update + Worker-version skew, safe-reload
                gate, resume marker, update overlay) was placed in a NEW owner
                `src/sogotable/static/client/app-update.js`; the existing deploy-version code
                lives in `app.js` and moves first, so the feature lands in a module with room.
- Seam moved:   Deploy-version awareness (refreshRevisionSummary, fetchRevisionStatus,
                registerServiceWorker) from `src/sogotable/static/app.js` to
                `src/sogotable/static/client/app-update.js`  [NEW owner row]
- Room opened:  app.js: 2264 → 2231 lines (as the test counts them); ceiling 2260+25 → 2231+25.
- Behavior:     PRESERVED — verified via `npm test` (513/513 green); all three functions moved
                verbatim (only `export` added); app.js still calls registerServiceWorker() and
                refreshRevisionSummary() at the same DOMContentLoaded spot; same DOM target,
                same fetch, same SW registration. The module is load-safe (nothing runs at
                import) and does not import app.js. Added to the review-export allowlist.
- Sources read: src/sogotable/static/app.js, workers/tests/architecture.test.js,
                docs/module-ownership.md, src/sogotable/static/review-export.js,
                docs/placement-receipts.md
- Restraint:    Moved only the three existing deploy-version functions. No auto-update
                behavior added, no shell state moved (APP_TOP_LEVEL_LET_CAP unchanged), no
                other app.js edits.
- New owner row: | `src/sogotable/static/client/app-update.js` | Deploy-version watch
                (revision.json poll + SW update + Worker-version skew), safe-reload gate,
                resume marker read/write, update overlay show/hide | `src/sogotable/static/app.js` |

## 2026-11-12 — Chinese Checkers (new game module, simultaneous submit + priority barrier)

- Ask:          Place a new parallel-play Chinese Checkers game (simultaneous submit, round barrier,
                priority conflict resolution, host-start lobby), mirroring Realmwright (98b85b4).
- Verdict:      workers/games/chinese-checkers/ (board.js, resolve.js, rules.js, ai.js) +
                src/sogotable/static/games/chinese-checkers/ (manifest, branding, assets, board-svg,
                render, panels, lobby, sfx, styles, PLAN.md, README.md) + one-row wiring entries
                (registry.js, game-kinds.js, app.js, handlers.js row + gameToDictForViewer line,
                stats.js, review-export.js allowlist, tests/helpers.js, sogotable-api.test.js list)
                [EXISTING owner: directory patterns]
- Flow stage:   validate + apply (board/resolve/rules, server-authoritative at the round barrier);
                render (client dir); record (stats.js score branch).
- Sources read: docs/module-ownership.md, workers/tests/architecture.test.js, docs/placement-receipts.md,
                docs/live-rounds.md, docs/game-integration-spec.md (PR #3). Game spec:
                docs/game-chinese-checkers.md + games/chinese-checkers/PLAN.md.
- Considerations:
    - app.js 2263/2285 (+1 line); sogotable-api.test.js games-list row only; behaviour tests live
      in chinese-checkers-*.test.js. No reorganizer.
    - Priority conflict resolution split out of rules.js into pure resolve.js (+ its own test) so
      rules.js does not carry five concerns toward the 800 backstop.
    - Rejected: barrier/priority logic in skip-vote.js, the shared lobby, or room-view.js.
    - Hidden commits: the handlers.js row and the gameToDictForViewer line land in one commit.
    - Hot-seat explicitly out of scope (hidden simultaneous commits need a hand-off screen).
- Reorganizer:  NONE
- New owner row: none

## 2026-11-12 — Chinese Checkers play modes (blitz / live / turns / timers) + new options

- Ask:          Add timing modes (rounds+timer, blitz, live, turns), a now seam with lazy deadlines and
                TICK, and options marbles 15 / chains / allow_pass / assists.
- Verdict:      NEW pure file workers/games/chinese-checkers/modes.js (now seam, deadline math,
                advanceClock, blitz/live immediate moves, round/turn advancing) called by rules.js
                through an ops bag (no import cycle); options/projection/allow_pass stay in rules.js;
                15-marble geometry + chains=false in board.js. review-export.js allowlist row added.
                [EXISTING owner: workers/games/ directory pattern]
- Flow stage:   validate + apply (server-authoritative), persist (deadline in game state).
- Considerations:
    - rules.js held under ~600 lines (528 -> 596); modes.js 233.
    - No Date.now()/timers outside the seam default; deadlines enforced lazily per action.
- Reorganizer:  NONE
- New owner row: none (directory pattern)

## 2026-11-12 — REORG: extract Battleship fleet geometry + theme CSS from client.js

```
REORG RECEIPT
- Trigger:      placement-advisor flagged src/sogotable/static/games/battleship/client.js (746 lines,
                near the 800-line GLOBAL_FILE_CAP) as too full / carrying too many concerns to absorb
                the upcoming Battleship feature; named two seams: pure fleet geometry and theme CSS.
- Seam moved:   (1) pure fleet geometry — randomBattleshipDraft, battleshipShipAt, battleshipShipSunk,
                coerceBattleshipPlacement, clampNumber, battleshipPlacementValid, battleshipFleetComplete,
                battleshipShipSize, battleshipShipCells, battleshipDraftKey — from client.js to
                src/sogotable/static/games/battleship/fleet-geometry.js (named exports);
                (2) dark-theme CSS string BATTLESHIP_DARK_CSS from client.js to
                src/sogotable/static/games/battleship/styles.js, exported as BATTLESHIP_CSS
                [EXISTING owner via the src/sogotable/static/games/ owned-directory pattern —
                no new module-ownership row].
- Room opened:  client.js 746 → 613 lines (187 under GLOBAL_FILE_CAP 800); fleet-geometry.js 97,
                styles.js 48. No per-file ceiling (client.js is not in CEILINGS/FILE_CAP_EXCEPTIONS);
                GLOBAL_FILE_CAP unchanged (shared backstop).
- Behavior:     PRESERVED — verbatim move, no logic/name/signature changes. The draft store
                (battleshipDrafts, battleshipDraftFor, placeBattleshipDraftShip, clearBattleshipDraft)
                and the injector ensureBattleshipTheme stay in client.js; same <style id="battleship-theme">
                text injected. fleet-geometry.js and styles.js are pure leaves (no DOM, no ctx, no
                module state, no imports). client.js public exports unchanged.
- Files rewired: client.js (imports), src/sogotable/static/review-export.js (both new files added to
                REVIEW_EXPORT_FILES), new workers/tests/battleship-fleet-geometry.test.js.
- Verification:  node --test workers/tests/*.test.js → 517 pass, 0 fail (incl. architecture.test.js).
- Restraint:    renderers, reveal subsystem, move action, and draft store untouched; no worker-side
                (workers/games/battleship/) changes; no feature code added.
                Reorganizer: reorganizer agent (2026-11-12).
```

## 2026-11-12 — Battleship visual + sound upgrade (client-only)

```
PLACEMENT RECEIPT
- Ask:          Client-only Battleship upgrade — 3D-look SVG ship overlay, animated water /
                hit / fire / splash / sink / shake fx, richer synth cues needing a
                filtered-noise primitive, swappable assets (palette, ship art, sound files),
                and per-device options (effects full/lite/off, tilt, coord labels, fleet
                tracker). No server/rules/transport change.
- Verdict:      EXISTING owners, no new owner row (src/sogotable/static/games/ dir pattern):
                  • games/battleship/assets.js — swappable palette/ship/sound overrides (data)
                  • games/battleship/ship-art.js — pure SVG ship builders
                  • games/battleship/fx.js — reveal→fx markup/classes; reduced-motion + level gate;
                    driven by the existing reveal timeline (no second timer)
                  • games/battleship/sfx.js — cue tone data + playCue; absorbs playBattleshipHit/Miss
                  • games/battleship/styles.js — all new CSS (styles-games.css untouched)
                  • games/battleship/settings.js — per-device prefs (sogotable.battleship.view)
                sound.js (EXISTING): filtered-noise voice via playTones `{type:"noise"}`.
                client.js: wiring only (reorg-first commit made room: 746 → 613).
- Flow stage:   render UI + record-outcome feedback. No normalize/validate/apply/persist/broadcast change.
- Considerations:
    - storage.js rejected for game-local prefs (platform keys only).
    - Fleet tracker counts only Worker-revealed sunk ships on offence; no hidden-info inference.
    - Overlay is pointer-events:none so tilt/touch hit-testing still lands on cells.
    - Next seam when client.js regrows: reveal subsystem + move action → reveal.js.
- New owner row: none.
```

## 2026-11-12 — REORG: extract room seat roster lifecycle to workers/room-seats.js
Commit: refactor(worker): extract seat-roster lifecycle to workers/room-seats.js (this entry's commit)

```
REORG RECEIPT
- Trigger:      workers/sogotable-api.js was at 1242 lines against a 1254 ceiling (12 lines of
                headroom) and is the named owner pressure for upcoming seat-lifecycle work
                (leave / host handoff / rejoin); the seat-roster cluster is the named seam.
- Seam moved:   Seat roster lifecycle — addPlayerToRoom, activateRoomIfReady, startRoom, playerMark,
                handleResetVote, ensureRoomSeatColors, nonConflictingRoomColor, colorsAreTooSimilar,
                colorDistance, safeHexColor, hexToRgb + ROOM_SEAT_COLORS, COLOR_SIMILARITY_THRESHOLD —
                from `workers/sogotable-api.js` to `workers/room-seats.js`; plus the inline
                host-start mark re-pack in /api/room/remove-bot extracted as
                repackHostStartMarks(room) (guard included; only one call site existed)  [NEW owner row]
- Room opened:  sogotable-api.js: 1242 → 1125 lines (as the test counts them); ceiling 1229+25 → 1125+25.
                room-seats.js 138 lines.
- Behavior:     PRESERVED — verified via `npm test` (all green); functions moved verbatim (only
                `export` added); same error strings, same mark/colour assignment, same reset-vote
                tally, same revision bump. Dead imports (gameUsesHostStart, resetRoomGame) dropped
                from the entry. room-seats.js imports only game-catalog / games/bots /
                games/handlers / room-view — never the entry.
- Sources read: CLAUDE.md, docs/module-ownership.md, docs/modularity.md, docs/placement-receipts.md,
                workers/tests/architecture.test.js, workers/sogotable-api.js,
                src/sogotable/static/review-export.js
- Restraint:    No leave/rejoin/host-handoff behavior added (owner row anticipates it; the feature
                lands there next). lobbyViewers, bot-turn loop, routing untouched.
- New owner row: | `workers/room-seats.js` | Room seat roster lifecycle: seat/mark assignment + colours, activation/start, leave (pre-start removal with mark re-pack + host handoff; post-start away), rejoin, reset-vote tally | `workers/sogotable-api.js` |
```

## 2026-11-12 — REORG: extract turn banner + player-switch strip to controllers/turn-status.js
Commit: refactor(app): extract turn banner + player-switch strip to controllers/turn-status.js (this entry's commit)

```
REORG RECEIPT
- Trigger:      src/sogotable/static/app.js was at 2251 lines against a 2256 ceiling (5 lines of
                headroom); upcoming seat-lifecycle UI work touches the turn banner / seat strip,
                which is the named seam.
- Seam moved:   Room turn banner + player-switch strip — renderGamePlayerSwitch,
                applyPlayerLabelTurnColor, showTurnStatus, setTurnStatusText, tacticalScoreText,
                tacticalEventText — from `src/sogotable/static/app.js` to
                `src/sogotable/static/controllers/turn-status.js`, wired via wireTurnStatus(ctx)
                [NEW owner row]
- Room opened:  app.js: 2251 → 2155 lines (as the test counts them); ceiling 2231+25 → 2155+25.
                APP_TOP_LEVEL_LET_CAP unchanged (25; no shell state moved — currentRoom /
                pendingMove are read through ctx getters).
- Behavior:     PRESERVED — verified via `npm test` (all green, incl. the static-module load sweep
                and review-export import closure); bodies verbatim except shell globals now read
                through ctx (getRoom / getPendingMove / rerender / predicates / Battleship
                review-mark hooks); same DOM ids, classes, text, inline styles, click handler.
                wireTurnStatus runs first in DOMContentLoaded, before any caller can fire.
                Exports: wireTurnStatus, renderGamePlayerSwitch, showTurnStatus, setTurnStatusText.
- Sources read: CLAUDE.md, docs/module-ownership.md, docs/modularity.md,
                workers/tests/architecture.test.js, src/sogotable/static/app.js,
                src/sogotable/static/controllers/win-overlay.js, src/sogotable/static/review-export.js
- Restraint:    No new turn/seat behaviour; setTurnColorVariables, safePlayerColor, playerForMark and
                the per-game render fan stay in app.js (shared with other callers). No isMyTurn hook.
- New owner row: | `src/sogotable/static/controllers/turn-status.js` | Room turn banner + player-switch strip (turn text, seat labels, turn tint) | `src/sogotable/static/app.js` |
```

## 2026-11-12 — REORG: extract design tokens to styles-tokens.css
Commit: refactor(css): extract :root design tokens to styles-tokens.css (this entry's commit)

```
REORG RECEIPT
- Trigger:      src/sogotable/static/styles.css (281 lines, ceiling 299) mixed the theme token
                palette with platform chrome; the token blocks are the named seam so upcoming
                theming/seat-colour work lands in a tokens-only sheet.
- Seam moved:   `:root` light tokens + `:root[data-theme="dark"]` token override (custom properties
                + color-scheme only) from `src/sogotable/static/styles.css` to
                `src/sogotable/static/styles-tokens.css`, linked FIRST in index.html
                [NEW file; CSS is outside the JS ownership map — no owner row; docs/theme.md
                updated to point at the new home]
- Room opened:  styles.css: 281 → 206 lines (as the test counts them); ceiling 274+25 → 206+25.
                styles-tokens.css 78 lines (under GLOBAL_FILE_CAP).
- Behavior:     PRESERVED for rendering — moved bytes are identical (diff of tokens+styles vs the
                old styles.css is empty) and load order keeps the same cascade order. Caller-directed
                service-worker changes in the same commit: styles-tokens.css added to the
                always-fresh (no-store) list, and the previously-missing styles-header.css /
                styles-roster.css / styles-room.css added too (a cache-freshness fix — these were
                being served through the SW cache); CACHE_NAME v100 → v101.
                review-export allowlist gains styles-tokens.css. `npm test` all green.
- Sources read: CLAUDE.md, docs/module-ownership.md, docs/theme.md,
                workers/tests/architecture.test.js, src/sogotable/static/styles.css,
                src/sogotable/static/index.html, src/sogotable/static/service-worker.js,
                src/sogotable/static/review-export.js
- Restraint:    Theme-gated selector overrides (`:root[data-theme="dark"] .x {…}`) stay in their
                chrome sheets; no token values renamed or added.
- New owner row: none
```

## 2026-11-12 — Stats: score direction, leaderboard cap, missing scored games
Commit: fix(stats): rank penalty-point games lowest-first, cap leaderboards, score Potion Lab + WNYK (this entry's commit)

```
PLACEMENT RECEIPT
- Ask:          Stats: per-game lower-is-better sorting (No Thanks, Hearts), cap high-score lists at 50,
                personal best respects direction, add scores for Potion Lab, WNYK and Mystic Wood.
- Verdict:      workers/stats.js (logic), src/sogotable/static/games/registry.js (`score_order` flag),
                workers/game-catalog.js (`lowerScoreIsBetter` query)  [EXISTING]
- Flow stage:   record outcome. The direction flag is shared game metadata.
- Considerations:
    - stats.js has room; the work is cohesive with it.
    - Rejected handlers.js for the flag (server-only dispatch; the client needs it too) and hard-coding
      game ids in stats.js.
    - The `score <= 0` filter is now direction-aware (a 0 is a perfect penalty-game score).
    - Mystic Wood has no numeric score: it, Super Tic Tac Toe, Battleship and Quoridor are now
      "win-only" (wins + Elo, no leaderboard row) instead of writing meaningless 1/0 high scores.
    - Follow-up for code-steward: the per-game if-chain in scoreByMarkForRoom wants to become a
      `scoreByMark` field on the handlers.js dispatch table.
- New owner row: none
```

## 2026-11-12 — Exit leaves your seat instead of closing the table
Commit: fix(rooms): exit leaves your seat instead of deleting the table for everyone (this entry's commit)

```
PLACEMENT RECEIPT
- Ask:          Room leave keeps the room: auth always required; before start remove the seat, re-pack
                marks, hand off host, delete when no humans left; after start mark the seat away and keep
                the room; rejoin clears away; away seats auto-vote on reset.
- Verdict:      workers/room-seats.js  [owner row landed with the REORG above]. Route stays thin in
                workers/sogotable-api.js.
- Flow stage:   orchestrate (room seat coordination).
- Considerations:
    - Hot-seat (local_mode) tables close on exit: one phone owns every seat.
    - Client: autoOpenActiveRoomForSelectedPlayer skips away seats (otherwise the leaver is pulled
      straight back in); Re-enter on an away seat goes through /api/room/join, which clears away.
    - Out of scope, recorded: an away seat holding the current turn stalls the game (no bot takeover).
- New owner row: none
```

## 2026-11-12 — Join link + QR, rematch button, turn signals, toasts
Commit: feat(client): join link + QR, one-tap rematch, your-turn signals, toasts instead of alert() (this entry's commit)

```
PLACEMENT RECEIPT
- Ask:          Shareable join link + QR on the room screen (`?join=CODE` deep link, navigator.share/copy);
                "Same players again" on the win card; your-turn title/badge/vibrate + Screen Wake Lock;
                in-app toasts replacing all 26 window.alert() calls.
- Verdict:      controllers/room-share.js, client/turn-attention.js, controllers/toast.js  [NEW owner rows];
                src/sogotable/static/vendor/  [NEW exempt row, qrcode-generator 1.4.4 MIT, minified ESM];
                controllers/win-overlay.js  [EXISTING, ctx.requestRematch -> resetGame({ skipConfirm })].
- Flow stage:   render UI / capture intent. Joins reuse enterRoomSummary; rematch reuses the reset vote.
- Considerations:
    - Sharing hidden for hot-seat, solo and started rooms (seats are fixed once a game starts).
    - Turn signal uses the platform `game.current_player` convention (same as the realtime poll and the
      turn sound); games without it never light the signal — a per-game awaiting-seats projection is a
      server follow-up. Suppressed in hot-seat and solo rooms; wake lock re-acquired on return.
    - Found by ESLint while here: handleIncomingResetRequest read an undefined `pendingConfirmAction`
      (ReferenceError), so the other phone never saw reset/rematch requests. prompts.js now exports
      isConfirmPending(); covered by the two-phone e2e test.
- New owner row: see docs/module-ownership.md (toast, room-share, turn-attention, vendor/)
```

## 2026-11-12 — Tooling: ESLint, Prettier, Playwright two-phone e2e
Commit: chore(tooling): ESLint + Prettier configs, Playwright two-phone e2e against a local stack (this entry's commit)

```
PLACEMENT RECEIPT
- Ask:          eslint.config.js (flat), Prettier config, Playwright e2e under tests/e2e/, local-stack start.
- Verdict:      Exempt rows `tests/`, `eslint.config.js`, `playwright.config.js`; static server in `scripts/`.
- Flow stage:   none (tooling)
- Considerations:
    - `npm test` stays worker-only; e2e is `npm run test:e2e` and its own CI job; lint is its own CI job.
    - The app reads `window.SOGOTABLE_API_ORIGIN` (set only by tests) so the browser talks to `wrangler dev`.
    - `wrangler pages dev` cannot serve the static app (it adopts the Worker's wrangler.toml and refuses
      the Durable Object bindings), hence scripts/e2e-static-server.mjs.
    - Prettier is configured but not enforced, to avoid one repo-wide reformat colliding with other threads.
    - Swapped the unused `playwright` devDependency for `@playwright/test` (same 1.61 line).
- New owner row: none (exempt rows above)

## 2026-11-12 — Chess Tutor (client-only opening trainer)

```
PLACEMENT RECEIPT
- Ask:          Place a single-player Chess Opening Tutor (book lines + explanations, weighted
                defender, spaced repetition, mistake explanations; vendored chess.js + cm-chessboard).
- Verdict:      src/sogotable/static/games/chess-tutor/ (EXISTING dir pattern) +
                src/sogotable/static/vendor/ [NEW directory owner row: vendored third-party libs,
                one per subdirectory]; client-only — no registry entry, GAME_HANDLERS row, or Worker change.
- Flow stage:   validate+apply = chess-tutor/rules.js + scheduler.js + session.js (pure);
                persist = storage.js keys via chess-tutor/progress.js; render = render.js /
                drill-view.js / board.js / styles.js; orchestrate = index.js, wired by app.js (2 lines).
- Considerations:
    - app.js at its ceiling: shell takes only an import + one wire call; navigation reuses
      [data-screen]; tutor renders lazily when #chessTutor becomes active (covers update-resume).
    - Rejected hostStart / Game-Locked room: no shared state; would need a handler row, D1 writes
      and a Worker deploy for a solo drill.
    - Vendor at platform level so a future chess game can share it without a cross-game import;
      chess.js (3368 lines, unmodified) gets a FILE_CAP_EXCEPTIONS entry.
    - Progress is device-local (per player id); cross-device sync is a future Worker owner.
    - Product flag: a non-room "trainer" entry on the Games screen is a new category.
- New owner row: | `src/sogotable/static/vendor/` | Vendored third-party browser libraries … |
```

## 2026-11-12 — Recorded sound files for global cues

```
PLACEMENT RECEIPT
- Ask:          Add recorded CC0 (Kenney) MP3 overrides for the global synth cues in
                src/sogotable/static/sound.js; each cue tries a file first and falls back to synth.
                UI ticks stay synth-only.
- Verdict:      src/sogotable/static/sound-files.js [NEW owner row] holds the URL map (data only);
                src/sogotable/static/sound.js [EXISTING] holds the private cue() fallback helper.
                Files in src/sogotable/static/sounds/. Per-game files use the existing assets.js keys.
- Flow stage:   render UI (presentation feedback). No rules, transport or persistence.
- Considerations:
    - Map inside sound.js rejected: mixes swappable licensed content into the synthesis engine;
      the split mirrors games/*/assets.js (data) vs sfx.js (playback).
    - playSoundFile can't detect an async 404/decode failure, so only committed files are mapped.
    - service-worker.js unchanged: MP3s take the network-first runtime cache; not precached.
    - sound-files.js must not import sound.js (cycle).
- New owner row: | `src/sogotable/static/sound-files.js` | Global sound-cue file overrides — pure data map … | `src/sogotable/static/sound.js` |
```
## 2026-11-12 — Reefkeepers (new game module, domino drafting, simultaneous submit)

- Ask:          Place a new host-start, parallel-play domino-drafting reef builder (5x5 grid,
                region x pearls), following game-integration-spec.md with Realmwright as precedent.
- Verdict:      workers/games/reefkeepers/ (tiles, board, rules, ai) + src/sogotable/static/games/
                reefkeepers/ (manifest, branding, assets, art, render [+views], lobby, sfx, styles)
                + one-row wiring (registry.js, game-kinds.js, app.js, handlers.js row +
                gameToDictForViewer line, stats.js, review-export.js, tests/helpers.js,
                sogotable-api.test.js list) [EXISTING owner: directory patterns]
- Flow stage:   validate + apply (board/rules, server-authoritative at the round barrier);
                render (client dir); record (stats.js score branch).
- Sources read: docs/module-ownership.md, workers/tests/architecture.test.js,
                scripts/audit-ceilings.mjs, docs/placement-receipts.md, app.js, service-worker.js.
- Considerations:
    - app.js ~2174/2180: +1 import line only; ids appended to existing predicate lines.
      Parallel game merges share 6 lines of headroom; crossing = re-consult, never bump.
    - Scoring/legality in pure board.js, deck in tiles.js, so rules.js stays well under 800.
    - Skip vote reuses workers/games/skip-vote.js; lobby reuses shared games/lobby.js.
    - Rejected: draft/barrier logic in skip-vote.js, the shared lobby, or the shell.
    - Hidden picks: the handlers.js row and the gameToDictForViewer line land in one commit.
    - No reefkeepers file may import another game's module.
- Reorganizer:  NONE
- New owner row: none

## 2026-11-12 — REORG: extract host-start render dispatch to games/room-render-dispatch.js

```
REORG RECEIPT
- Trigger:      src/sogotable/static/app.js at 2175/2180 with several host-start games landing;
                each new game added a render import + two predicate-list edits to app.js.
- Seam moved:   host-start render dispatch (15 render imports, the host-start branch predicate
                list and the render-function chooser ternary) from `src/sogotable/static/app.js`
                to `src/sogotable/static/games/room-render-dispatch.js` as an ordered
                HOST_START_RENDERERS table + pickHostStartRenderer(game, kinds) [NEW owner row]
- Room opened:  app.js: 2175 → 2163 lines; ceiling stays 2155+25 (= 2180). Re-pinning at
                2163+25 would RAISE the cap, which a reorg never does; per-game cost in app.js
                is now zero lines, so the 17 lines of headroom are not consumed by new games.
- Behavior:     PRESERVED — verified via `npm test` (all green); same predicate set (the old
                condition == chooser set + Yahtzee fallback), same chooser order with Yahtzee
                last, same render args; predicates are id-exclusive so order cannot change
                which renderer wins. Kinds object is the same createGameKinds instance.
- Sources read: docs/module-ownership.md, workers/tests/architecture.test.js,
                src/sogotable/static/app.js, src/sogotable/static/games/game-kinds.js,
                src/sogotable/static/controllers/turn-status.js,
                src/sogotable/static/review-export.js, docs/game-integration-spec.md,
                docs/placement-receipts.md
- Restraint:    Ten Thousand (own branch + extra args) and legacy games untouched. The
                renderGamePlayerSwitch hide list in controllers/turn-status.js was NOT driven
                from the table: it includes Ten Thousand and omits WNYK, so unifying would
                change behavior. The wireTurnStatus predicate pass-through stays as-is.
- New owner row: | `src/sogotable/static/games/room-render-dispatch.js` | Host-start game render dispatch — predicate → `render*Game` table + `pickHostStartRenderer` (kinds injected) | `src/sogotable/static/app.js` |
```

## 2026-11-12 — Bloomwork (new game module, simultaneous-submit draft + priority barrier)

```
PLACEMENT RECEIPT
- Ask:          New host-start parallel-play tile-drafting game "Bloomwork" (original garden theme on an
                open-market draft: stalls + Square, planter rows, 5x5 garden bed, compost penalties;
                simultaneous submit per pick step, rotating priority for contested stalls, bots commit at
                barrier close, skip vote).
- Verdict:      workers/games/bloomwork/ (rules.js, board.js, resolve.js, ai.js) +
                src/sogotable/static/games/bloomwork/ (client modules) + one-row wiring entries
                (registry.js, game-kinds.js, room-render-dispatch.js row, app.js predicate appends (0 net lines), controllers/turn-status.js,
                handlers.js row + gameToDictForViewer line, stats.js scoreByMarkForRoom, review-export.js)
                + bloomwork-{board,resolve,rules,api}.test.js + docs/game-bloomwork.md
                [EXISTING owner: directory patterns]
- Flow stage:   validate + apply (board/resolve/rules, server-authoritative at the barrier); render
                (client dir); record (stats.js score branch).
- Considerations:
    - app.js ~2174/2180: inline appends only (+1 import line). host_start comes from the registry; the
      player-switch hide list lives in controllers/turn-status.js.
    - Contested-stall priority split into pure resolve.js (Chinese Checkers precedent).
    - sogotable-api.test.js near its cap: Bloomwork behaviour tests live in their own files.
    - Hidden commits: handlers.js row and gameToDictForViewer mask land together.
    - Hot-seat out of scope (hidden simultaneous picks need a hand-off screen).
- Reorganizer:  NONE
- New owner row: none
```

## 2026-11-12 — Hidden Isles (team word-clue game)

```
PLACEMENT RECEIPT
- Ask:          Placement for new host-start game Hidden Isles (team word-clue), per its PLAN.md
- Verdict:      workers/games/hidden-isles/*, src/sogotable/static/games/hidden-isles/*, standard
                game-integration-spec §4.4/§4.6 touchpoints  [EXISTING]
- Flow stage:   validate/apply (rules.js + clues.js), bot (ai.js), render (client)
- Considerations:
    - Both dirs fall under the existing directory rows, so no new row is needed
    - app.js: no new lines (predicate added to existing lists); renderer is one row in
      games/room-render-dispatch.js
    - clues.js is a shared pure helper: rules.js alone decides clue legality, ai.js only scores,
      the client never checks legality
    - words.js split into words.js + aliases.js to stay under the 800-line backstop
- New owner row: none
```


## 2026-11-12 — Play several games at once (keep seat, switcher, needs-me alerts)

```
PLACEMENT RECEIPT
- Ask:          Multi-game play: keep the seat on return to the dashboard, an active-games switcher,
                needs-me alerts that work for every game including simultaneous-move games
- Verdict:      workers/games/handlers.js awaitingMarks field + workers/games/<dir>/awaiting.js [EXISTING +
                dir pattern]; workers/room-view.js awaiting_marks [EXISTING]; workers/player-rooms.js [NEW,
                via REORG R1]; workers/sogotable-api.js route only; client/active-games.js,
                client/game-alerts.js, controllers/game-switcher.js [NEW]; realtime.js createRoomWatcher,
                controllers/toast.js action, service-worker.js notificationclick [EXISTING];
                controllers/room-list.js [NEW, via REORG R2]; app.js wiring [EXISTING, after R2]
- Flow stage:   rules (awaitingMarks) → projection (awaiting_marks) → read query (my-rooms) → transport
                (watchers) → orchestrate (active-games) → render (switcher, toast) → attention (alerts)
- Considerations:
    - app.js at 2165/2180 and its let cap: extract the room-summary list view first (R2)
    - the new "all my rooms" query is a sibling of activeRoomForPlayer → move both to player-rooms.js (R1)
    - per-game awaitingMarks in awaiting.js: three rules.js files are near the 800 backstop
    - no createRealtimeController per room (global listeners + 7s poll each); a socket-only watcher
    - Notification via the service-worker registration first (new Notification() throws on Android)
    - hot-seat and solo rooms are excluded from watching and alerts; Web Push is out of scope
- New owner rows: workers/player-rooms.js, controllers/room-list.js, client/active-games.js,
                client/game-alerts.js, controllers/game-switcher.js
```

```
REORG RECEIPT (R1)
- Moved activeRoomForPlayer + playerHasUnfinishedRoom from workers/sogotable-api.js to workers/player-rooms.js,
  behaviour unchanged; entry ceiling re-pinned 1125 → 1117 (+ buffer).
```

```
REORG RECEIPT (R2)
- Extracted the room-summary list view (renderCurrentGames, renderRoomSummaryList, renderActiveGameNotice,
  the two signature helpers, playerSignature and their two render-key lets) from app.js to
  controllers/room-list.js, wired with wireRoomList(ctx). Behaviour unchanged. app.js ceiling re-pinned
  2155 → 2058 (+ buffer); APP_TOP_LEVEL_LET_CAP ratcheted 25 → 23.
```

```
PLACEMENT RECEIPT
- Ask:          app.js is 2097 lines against a 2083 ceiling after the multi-game shell wiring; rule between
                re-pinning (a) and a controllers/multi-game.js (b)
- Verdict:      app.js [EXISTING, bless-and-raise after moving 3 pieces into client/active-games.js]
- Flow stage:   orchestrate (screen/room switching)
- Considerations:
    - Rejected (b): a module that only assembles a dependency bag is a pass-through; keepSeatBack /
      jumpToRoom / detachFromRoom change shell state and stay in the shell
    - Moved out first: the /api/my-rooms fetch, the createRoomWatcher injection, the visibilitychange
      refresh and getPlayerId all live in active-games.js via direct downstream imports
    - Four duplicate room-drop blocks collapsed into detachFromRoom(); no new lets (cap 23); app.js is
      still ~70 lines below its 2165 before R2
    - Ceiling re-pinned at 2092 + WORKING_BUFFER
- New owner row: none (client/active-games.js row amended)
```

```
PLACEMENT RECEIPT
- Ask:          Place "Asset Review", a superuser-only lobby tool for playing/viewing every generated sound, alternate
                take and picture and recording approve/reject + note + chosen take + regenerate flag, stored
                server-side and exportable to JSON/Markdown
- Verdict:      src/sogotable/static/admin/asset-review/{index,catalog,takes,render,waveform,report,styles}.js +
                workers/asset-reviews.js + scripts/export-asset-reviews.mjs (exempt); shell wiring in app.js/index.html,
                routes in workers/sogotable-api.js  [NEW owner rows]
- Flow stage:   admin tooling outside the gameplay flow (capture + render client-side, validate + persist in a leaf)
- Considerations:
    - Rejected games/asset-review/: the catalog reads every game's assets.js, which the layering test forbids
      for a game module, and it is not a registry game
    - Loaded by dynamic import from the click handler, so no game asset module joins the boot path
    - Writes use a quiet side-effect profile (save, no room/app-hub notify); keyed upsert + caps keep the
      single state row small
    - Implementer deviation: the entry is an "Admin" card under Learn on the games screen (MojoSOGO asked for
      an admin "game" in the lobby) instead of an intro-screen button; it is static index.html markup like
      Chess Tutor and does not touch game-list-view.js
    - Synth previews temporarily blank one override (SOUND_FILES / ASSETS.sounds) around the real cue call,
      so sound.js and the game sfx.js files are unchanged
- New owner row: 8 (seven admin/asset-review modules + workers/asset-reviews.js)
```
