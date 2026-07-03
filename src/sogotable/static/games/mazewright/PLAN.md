# Mazewright — PLAN

Mazewright shipped before the PLAN.md convention; this file was created by the
first Verification Gate run (see `docs/adding-a-game.md`). Gate receipts collect
here.

Spec: `docs/game-mazewright.md` (original game — no external rulebook; design
history in `AI/Dungeon Master/`, ignored intake). Mazewright is **Game-Locked**
(2026-06-28): gate findings below are recorded, but fixes to game behavior need
MojoSOGO's go-ahead.

## Intended deviations / accepted tradeoffs (recorded by the 2026-07-03 gate run)

- **Family-trust crawl** — run progress (fog, moves, loot) is client-local; the
  server clamps `POST_RESULT` to the feasible band (moves ≥ shortest escape,
  loot 0–5, author excess capped at 20). A mid-maze refresh therefore grants a
  free retry with foreknowledge — accepted, same trust posture as RTTA's
  client-owned dice.
- **Mazes are public after the build barrier** — one projection for every
  viewer; fog is client-enforced. No leak exists *before* the barrier (deck is
  null until `running`).
- **Bots run the untransformed maze** in `simulateRun` — transform is
  distance-invariant, so scores are unaffected (critique #10).
- **No hot-seat mode by design** — secret build + fog crawl make shared-device
  play nonsensical; manifest deliberately omits `hotSeat`.

## Gate receipts

```text
GATE rules-fidelity — 2026-07-03 — 6 gaps — POST_RESULT lacks a deck-index/dedupe so a duplicate corrupts the next maze's result → add index to the action and reject mismatch; crawl engine (MOVE step/bump/collect/escape, transform, resetFog) unpinned by npm test → add core crawl tests; champion-rank spec drift (doc [0,N-1] vs shipped 1..N places, plus removed on-board pads) → update docs/game-mazewright.md; POST_RESULT moves clamp has floor but no finite ceiling (Infinity passes, D1-serializes to null) → require finite + cap; a gem on the start cell is never auto-collected → collect in resetFog or forbid at submit; manifest blurb still describes raw-moves scoring → reword to excess+loot formula
GATE projection — 2026-07-03 — 4 gaps — no exact-shape key-set test (sogotable-api.test.js:2643 asserts only a few fields) → add RTTA-style (rtta-rules.test.js:499) key-set pin for game+seat+deck dicts; seat.finish_state emitted (rules.js:192) never read (render.js recomputes 375-377) → adopt in statusChip or pin as convention in the shape test; seat_order emitted (rules.js:206) never read by Mazewright client → pin as convention or drop; shell reads room.game.move_count (app.js:1483,2386) which Mazewright never emits (undefined, guard mitigated by posting flag + inline clear, shared game-locked pattern) → fix shell-wide or emit move_count from the wrapper
GATE sibling-parity — 2026-07-03 — 5 gaps — building-phase rejoin shows empty board as locked maze → project own submitted maze or honest placeholder; late join into started room = silent ghost seat → reject join when room.started; mid-maze refresh = free retry with foreknowledge → accept as family-trust and document in PLAN.md; bot maze skips isValidMazeCode gate → validate buildRandomMazeCode output; bot-only-rooms-settle-immediately comment contradicts stalling guard → fix comment
GATE resilience — 2026-07-03 — 5 gaps — POST_RESULT lacks deck index, duplicate/out-of-order post corrupts next maze slot → send+verify run index; build barrier stalls forever on absent builder, reset also blocked → host skip w/ auto-maze or timeout; no game_epoch check lets pre-reset SUBMIT_MAZE land in fresh game → reject epoch mismatch on /api/room/move; rejected actions fail silent yet still bump/save/broadcast → return rejection reason, skip write; moves floored but uncapped (Infinity poisons projection) → add upper clamp like loot
```

No gate passed clean on this first run; per doctrine each gate is re-run after
fixes until its receipt says pass.

## Rules Ledger (rules-fidelity gate, 2026-07-03)

Owners abbreviated: **core** = `src/sogotable/static/games/mazewright/rules.js`,
**wrapper** = `workers/games/mazewright/rules.js`, **render** =
`src/sogotable/static/games/mazewright/render.js`. Tests are line numbers in
`workers/tests/sogotable-api.test.js`.

| Effect | Fires when (phase) | Exactly (cost → effect) | Bounds | Touches | Owner (file) | Pinned by (test) |
|---|---|---|---|---|---|---|
| **Setup: starting build state** | game start / rematch (`status→building`) | 7×7 board, start=centre (3,3), 0 walls, no exit, exactly **5 diamonds** at (1,1),(5,1),(3,5),(1,5),(5,5) | board size fixed (maze-code size nibble enforces 7×7) | self | core:89-133, wrapper:59-73 | 2617, 2661 (flow); default gem cells unpinned |
| **Setup: per-maze run state** | each deck maze loaded | pos=start, visited={start}, inventory=[], moves=0, walls/exit hidden (fog), gems visible through fog | — | self | core:145-179; render:558-563 | **none — gap** |
| TOGGLE_WALL (add) | BUILD | free → +1 wall (kept) | ≤30 total; adjacent cells only; rejected if it seals start→exit or traps any gem | self | core:527-548 | seal/trap guard indirectly via 2696; action-level unpinned |
| TOGGLE_WALL (remove) | BUILD | toggle existing → −1 wall, always legal | — | self | core:535-536 | none |
| TOGGLE_EXIT | BUILD | set/move/clear the exit (**replace** — exactly one) | perimeter edges only | self | core:550-559 | 2690 |
| SET_START | BUILD | move start+pos to any cell | in-bounds; no reachability check until submit (render warns live) | self | core:561-568; render:219-220,543-546 | none |
| SET_ITEM | BUILD | move gem *i* to any cell; stacking and on-start allowed | in-bounds; reachability enforced at submit | self | core:570-577 | none (on-start gem not auto-collected — gap) |
| AUTO_BUILD | BUILD | replace design with random solvable maze (5 distinct gem cells off start, ≤30 walls, exit+all loot reachable) | as canSubmit | self | core:216-252 | 2693 |
| LOAD_CODE / maze code | BUILD | decode replaces whole design; code round-trips walls+start+exit+5 gems | strict alphabet, ≥8 bytes, size nibble must equal 7×7 | self | core:456-519 | 2650, 2705-2715 |
| RESET_BUILD | BUILD | back to setup defaults | — | self | core:591-600 | none |
| Submit validity (`canSubmit`/`isValidMazeCode`) | build barrier | solvable start→exit **and** all 5 gems reachable **and** ≥10 walls | MIN_WALLS=10, MAX_WALLS=30 | self | core:419-442, 513-519 | 2686, 2696 |
| SUBMIT_MAZE | `status==="building"`, human seat | valid code → seat locked (`built`); invalid silently ignored; resubmit overwrites until barrier | server re-validates via `isValidMazeCode` | self | wrapper:76-83 | 2617, 2650, 2661 |
| Build barrier → deck | every human built | deck = one entry **per seat incl. your own maze**, each with server transform {axis x\|y, rot ±90}; `status→running`; bot runs pre-resolved | bots never block | all | wrapper:85-104 | 2617 (deck=3, bot runDone) |
| Map transform | per deck maze | reflect + rotate cells/walls/start/gems/exit-dir; distance-invariant → UX disorientation only, **not anti-cheat** | — | self (view) | core:181-213 | **none — gap** |
| MOVE (step) | CRAWL | +1 move → enter cell, mark visited, **collect all uncollected gems there** (add to inventory, kept), entering exit cell reveals the arch | 4 dirs; wall/perimeter blocks | self | core:637-668 | **none — gap** |
| MOVE (bump) | CRAWL | +1 move → reveal the bumped wall/perimeter, pos unchanged (a bump costs exactly one move, same as a step) | — | self | core:656-658 | **none — gap** |
| Escape | CRAWL, on exit cell, moving in exit dir | +1 move → `MAZE_DONE` (reveal screen), client posts result | minimum legal run = bfs(start→exit)+1 = server floor | self | core:642-654; render:268-280 | floor consistency via 2785 only |
| POST_RESULT | `status==="running"`, human, not runDone | append `{author, moves, loot}` for `deck[runIndex]`; runIndex+1; runDone at deck end | moves ≥ max(1, shortestEscape); loot 0..5; **no maze-index/dedupe (gap), no finite ceiling on moves (gap)** | self (scores feed everyone) | wrapper:107-126 | 2785, 2617, 2661 |
| Run barrier → tally | every human runDone | compute prizes + champion; `status→complete` | bots pre-resolved | all | wrapper:129-134 | 2617, 2661 |
| Author scoring | tally + live standings | per run by an **opponent** on your maze: `clamp(moves − shortestEscape, 0, 20) + 2×loot`; **self-runs never credit the author** | excess cap 20/runner; loot bonus 2 | opponents' runs → self score | core:298-327 (shared by wrapper:139-150 and offline:693-700 — one scorer, no drift) | 2718, 2730 |
| Prize: Mazewright | complete | argmax authorPoints | tie → earliest seat | all | core:330-334 | 2730, 2742 |
| Prize: Mazerunner | complete | argmin total moves across all mazes | tie → earliest seat | all | core:330-334 | 2743 |
| Prize: Treasure Hunter | complete | argmax total loot | tie → earliest seat | all | core:330-334 | 2744 |
| Champion (= `game.winner`) | complete | place-per-category in **[1,N]** (ties share ½; uncontested category = 0) × weights 5/3/3, summed; parts sum to composite | tie → fewest total moves → earlier seat; **doc says [0,N−1] — drift** | all | core:336-383 | 2748-2772, 2774 |
| Bot: maze | seat init | auto-built solvable maze; `built=true`; never blocks build barrier | same canSubmit floor (but skips `isValidMazeCode` — gap) | self | wrapper:69, core:248-252 | 2625, 2693 |
| Bot: runs | deck assembly | `simulateRun` per maze: moves ≥ floor (base=sp+1), loot 0..5 (45%/gem); pre-resolved | runs the **untransformed** maze — accepted deviation | self | core:285-296, wrapper:93-102 | 2633 |
| Stats score | game recorded | per-seat score = total loot (Treasure Hunter metric) | — | self | wrapper:215-220 | none (informational) |
| End conditions per player count | any | 1 human: own-maze deck of 1 → complete, ranks 0/1/1, winner=self; 2-6 (humans+bots): both barriers pass; bot-only room would stall in `building` but is unreachable (host always seated; wrapper:72 comment wrong) | minPlayers 1, maxPlayers 6 (manifest.js:9-10) | all | wrapper:85-88,129-134 | 2774 (solo scorer), 2617/2661 (N≥2); solo wrapper path unpinned |
| On-screen text contract | all screens | build-mode hints, meters, submit flash, crawl tips, weighted legend, lens note — all match behavior | manifest blurb lags scoring (gap) | self | render:185-199, 226, 284-287, 353-357, 402-409; manifest:5-8 | parts-sum-to-composite via 2769 |

Client/server data-table parity: **by construction** — the Worker wrapper
imports the identical shared core module (`wrapper:14-22`), and the committed
tests import both layers together (`sogotable-api.test.js:10-18`). No
duplicated tables exist to drift.
