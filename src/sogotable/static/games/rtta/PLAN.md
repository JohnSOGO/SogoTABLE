# Roll Through the Ages — PLAN

RTTA shipped before the PLAN.md convention; this file was created by the first
Verification Gate run (see `docs/adding-a-game.md`). Gate receipts collect here.

Rules spec: `AI/RToA/rtta_2025_rules_06.pdf` (2025 rulebook) +
`AI/RToA/ScoreSheet.jpg`. **MojoSOGO ruled 2026-07-01: the 2025 rulebook is the
edition.** Development values, Great Pyramid later-VP, the Granaries rate, the
Architecture bonus, and the seat-count monument sets now follow it. Monument
worker costs and the remaining monument VPs come from the classic score sheet —
the 2025 PDF contains no monument table (score sheet is the only source).

## Intended deviations (Survey H) — recorded post-hoc, need MojoSOGO sign-off

- **Round-locked simultaneous play** replaces turn order: everyone plays each
  round at once behind a barrier; "equal number of turns" holds by construction.
  (Documented in `docs/game-rtta.md`.)
- **Client-owned dice RNG / trust-but-clamp commits** — family-scale trust
  model, one COMMIT_TURN per round. (Documented in `docs/game-rtta.md`.)
- **1–20 seats** (rulebook is 1–4); seat counts above 4 use all 7 monuments.
- **Auto-discard at submit** — excess goods above 6 are discarded from Wood
  upward automatically (rulebook: player's choice). The player can hand-discard
  on the goods chart before submitting.
- **Bots roll real dice** (2026-07-02, superseding the "lightweight bots"
  deviation): bots run the same pure turn functions as the human client — real
  rolls with holds, feeding/famine/disasters with honest skulls, real
  development payment from the turn's coins + goods, persisted partial city
  progress. Levels differ by roll depth and buying strategy, not free
  resources. Since 2026-07-03 a bot also spends an owned Leadership rerolling
  a skull at exactly 2 or 4 skulls (unless immune). Remaining simplifications:
  bots skip the Engineering/Granaries taps and hold a simple heuristic, not an
  optimiser.
- **Longer Game variant (6 developments)** — intentionally not implemented.
- **Whole-stack goods payment stands** — a partial-goods (sell-off-the-top)
  house rule shipped briefly on 2026-07-02 and was reverted the same day at
  MojoSOGO's direction: the rulebook's whole-stack, no-change spend is the rule.
- **Development timing rule** (2026-07-03, adaptation of upkeep-before-buy to
  simultaneous rounds): a development bought this round takes effect for
  disaster resolution from the NEXT round on — for the roller AND for victims.
  The client also gates Dev purchases on Upkeep having run, so a player cannot
  see their skulls and buy the shield the same turn.
- **Refresh mid-turn = a fresh roll** (2026-07-03, signed): in-progress turn
  state (rolls, holds, builds) lives only on-device; a reload re-seeds from the
  round-start seat, so refreshing discards the turn and re-deals dice. Accepted
  at family scale (matches the Yahtzee trust model); the upgrade path is
  persisting the turn log server-side, not blocking refresh.
- **Same-round monument tie = commit arrival order** (2026-07-03, provisional):
  when two players complete the same monument in one round, "first builder" is
  whoever's commit reached the barrier first. Artifact of simultaneous play;
  MojoSOGO may swap to both-score-first later.

## Resolutions — 2026-07-01 (post-gate fix pass)

- **2025 edition adopted** (gap 5 closed): Medicine 20/4 · Religion 25/7 ·
  Granaries 6 coins/food · Architecture 60/8 at **+2**/monument · Empire 70/10 ·
  Great Pyramid later-VP 8. Client, server, bot tables + ability text updated;
  parity-tested.
- **Monument seat sets per the rulebook** (gap 1 closed): Temple + Great Pyramid
  sit out 2-player games, Hanging Gardens sits out 3-player games, solo/4+ use
  all (`notAt` lists, verbatim-verified against the PDF — removals do NOT stack,
  so Hanging Gardens is in play at 2P).
- **Leadership may reroll a skull die** (gap 3, first half, closed). The
  stops-early availability nuance remains open.
- **Reflected Revolt spares opponents who own Religion** (gap 4 closed, pinned
  by a server test).
- **DOM-free extraction done** (gap 7 closed): board.js turn maths now lives in
  client `rules.js` (tallyFaces / upkeepPlan / collectGoods / discardExcess /
  paymentTotal / engineeringConvert / buildCommitPayload), pinned by 20
  browser-free tests in `workers/tests/rtta-turn.test.js`.
- **Seats start with 3 food** (2026-07-02, spotted by MojoSOGO — the gate's
  ledger had no Setup row and missed it; the gate doc now requires a
  "Setup: starting resources" row). Rulebook Setup, verbatim: "Each player sets
  their food peg to 3." Pinned by a setup test.
- **Partial city progress persists** (2026-07-02, fidelity gap 2 closed):
  `cityBoxes[4]` joined the commit contract, seat, and projection; the server
  derives the city count from full slots and clamps each slot; the board seeds
  and locks carried progress. Legacy count-only commits (bots) still work.
- **Unfinished-purchase guard** (2026-07-02): Submit no longer silently cancels
  a fully-funded development purchase that was never confirmed — it navigates
  to the Dev page with an alert instead (the likely cause of "my development
  points are missing" reports; server scoring itself verified correct).
## Resolutions — 2026-07-03 (post-gate-re-run fix pass, branch fix/rtta-gate-gaps)

- **Solitaire variant implemented** (fidelity gap 3 closed): 10-round cap
  (`ten_rounds` end reason) and pestilence strikes the roller (Medicine, from a
  prior round, immune); the solo disaster table and review copy say so.
- **Development timing** (fidelity gap 1 closed): disasters resolve against
  pre-round developments (`dev_this_round` marker), and the client gates Dev
  purchases + ✓ Buy on Upkeep having run. Signed as a deviation above.
- **Leadership after an early stop** (fidelity gap 2 closed): offered whenever
  rolling has ended (3rd roll OR all dice held); using it declares the roll
  final. The choice die is now a legal reroll target (gap 6 closed), and an
  undecided choice die blocks Upkeep instead of tallying zero (gap 5 closed).
- **Tie-break by goods value** (fidelity gap 4 closed): equal final scores go
  to the seat whose remaining goods are worth more.
- **Stranded commit fixed** (resilience gap 1 closed): a failed COMMIT_TURN /
  READY_NEXT unlatches the board (`commitFailed`), re-enables the button, and
  surfaces the error in-board; `postRoomAction` reports failures to callers.
- **Round stamp** (resilience gap 2 closed): COMMIT_TURN/READY_NEXT carry
  `round`; a stamped action from another round rejects loudly, unknown actions
  throw, same-round duplicates stay silently idempotent (partial gap 5).
- **Completion cross-check** (resilience gap 3 closed): monument completion is
  derived from the clamped boxes; bare claims are ignored.
- **Goods + loss clamps** (resilience gap 4 closed): goods clamp to each row's
  pegboard max; points_lost caps at the 45-box grid (bot/human parity).
- **Score parity + projection shape pinned** (projection gap 1 + steward 2
  closed): `scoreBreakdown === server score` test; the projection test pins the
  exact wire-contract key sets. `finish_state`/`seat.name` stay emitted as
  cross-game convention (projection gaps 2–3: accepted).
- **Bots use Leadership** (parity gap 2 half-closed): an owned Leadership
  rerolls a skull at exactly 2/4 skulls. Engineering/Granaries taps remain a
  documented light-opponent simplification.
- **touch-action hardening** (parity gap 4 closed) on double-tap surfaces.
- Still open, deliberately: barrier deadlock when a human never returns
  (resilience gap 6 — needs a product decision on skip/timeout mechanics;
  mitigated by device-portable identities), bots skipping Engineering/Granaries,
  and the silent-ok:true pattern in OTHER games (platform-level).

## Gate receipts

```text
GATE rules-fidelity — 2026-07-01 — 12 gaps —
 1 HIGH  monument seat-count sets INVERTED vs rulebook (2P must REMOVE Temple+Great Pyramid, 3P must REMOVE Hanging Gardens, solo uses ALL; code reads the score-sheet annotations as minimum seats, so the 1P/2P/3P sets are all wrong and three tests pin the wrong sets) → flip the semantics in client rules.js / server rules.js / ai.js (e.g. an excludeAt list), fix the tests, re-run gate
 2 HIGH  partial city progress is silently lost at submit (COMMIT_TURN carries only the completed-city count; boxes checked into an unfinished city vanish next round — rulebook: checked boxes persist) → add cityBoxes to the commit contract + seat + projection + board seeding, or block partial city fills in the UI
 3 MED   Leadership cannot reroll a skull die (the rulebook grants exactly that — it is the development's main point) and is not offered when the player stops rolling before roll 3 → allow skull dice in leadershipReroll and gate on "rolling ended", not rolls===3
 4 MED   Revolt via Religion wipes ALL opponents; rulebook Table 2: opponents who also own Religion are unaffected → add a Religion check on victims in server resolveDisasters
 5 MED   edition conflict undocumented: implementation follows ScoreSheet.jpg where it differs from the designated 2025 PDF (Medicine 15/3 vs 20/4 · Religion 20/6 vs 25/7 · Architecture 50/8 +1/mon vs 60/8 +2/mon · Empire 60/8 vs 70/10 · Granaries 4 vs 6 coins/food · Great Pyramid later-VP 6 vs 8) → MojoSOGO picks the edition; either update both tables + ability text or sign the deviation above
 6 MED   solo rooms (manifest minPlayers 1) lack the solitaire rules (10-round cap, ALL monuments, self-affecting Pestilence) → implement the solo variant or set minPlayers 2 / document
 7 MED   most client rule rows have NO browser-free pin — board.js computes rules in the DOM (ownsDev reads CSS classes, tallies read textContent), the standing hard-rules violation that let the original four bugs ship → extract board.js turn maths into client rules.js functions with tests (reorganizer-scale work)
 8 LOW   end-of-game tie-break by goods value not implemented (first tied seat in seat order wins) → compare goods value on tie in completeGame
 9 LOW   same-round monument completion: "first builder" = commit arrival order within the barrier — adaptation artifact of simultaneous play → decide (arrival order vs both-score-first) and record it here
10 LOW   deviations were unrecorded (no PLAN.md existed): auto-discard, 1–20 seats, client RNG trust model, non-economic bots, Longer Game skipped → now listed above; MojoSOGO to confirm
11 LOW   ai.js duplicated tables (MONUMENT_COST / MONUMENT_MIN_PLAYERS / DEV_COST) sit outside the data-parity test → extend the parity test to cover ai.js
12 LOW   on-screen: a monument tile always shows the FIRST-builder VP even after another player claimed it (later builders see points they will not get); dice stay clickable after Upkeep (Leadership/choice taps change displays but not banked resources) → show first/later dynamically; freeze the tray post-Upkeep
```

```text
GATE projection — 2026-07-01 — 3 gaps —
  1 (med) projection-shape test too shallow: rtta-rules.test.js "projects the full public N-player state" pins only seat_order/players length, players[0].name, phase, monuments key — none of the per-seat fields the client actually reads (cities, food, goods, developments, monumentBoxes, points_lost, score, round_done, ready_next) nor round/status/winner/pending_events; a silent rename (e.g. monumentBoxes → monument_boxes) would pass tests and break board seeding as undefined → extend the test to assert every field render.js/board.js reads off the dict
  2 (low) seat.finish_state emitted but never read by the RTTA client (render.js recomputes the same states from status/phase/round_done/ready_next) → either adopt it (Yahtzee-style news strip uses finish_state) or drop it from the projection
  3 (low) seat.name emitted but never read: render.js resolves names via room.players (seatName) → keep for cross-game dict convention, or read it as the fallback when the room seat is missing
  info: games/render-keys.js carries no RTTA fields (round/monuments/pending_events absent); invalidation currently rides on room.revision + players_state (every RTTA transition also flips a seat flag), so no observed failure — note for the per-game render-key slice refactor
```

```text
GATE sibling-parity — 2026-07-01 — 5 gaps —
  1 (med) bot turns bypass the human economy: free developments (no payment check), fixed dice-free worker yield (2·cities+1), permanent skull/famine/disaster immunity — nothing binds bot turns to human-reachable turns (workers/games/rtta/ai.js); documented as "light opponent" but in tension with the bots-run-the-human-path hard rule
  2 (med) refresh mid-turn grants a free mulligan: uncommitted rolls are discarded and the board re-seeds from the round-start seat, so a bad roll can be refreshed away (inherent to client-computed turns; decide accept+document vs mitigate)
  3 (low) bots always win same-round first-builder monument ties — resolveBotRound commits every bot at round start, before any human can submit
  4 (low) late joiner into a started room becomes an unseated spectator with misleading status copy ("Turn submitted…" / "ready up" with no button); no started-room guard on /api/room/join for host-start games
  5 (low) manifest maxPlayers 20 is unenforced — registry player_count: null allows unlimited joins; metadata sources drifted
  pass: public-vs-private view, solo→N scaling + end-condition reachability, touch-vs-pointer, bot/server commit-pipeline parity (post-fix monument filter matches monumentsInPlay, pinned by tests)
```

```text
GATE resilience — 2026-07-01 — 5 gaps —
  1 (high) failed COMMIT_TURN strands the client: board.js latches submitted=true BEFORE the POST, and the error lands in #turnStatus which the shell hides for RTTA — player stuck at "Waiting for the other players…" with a disabled button until manual refresh
  2 (med) COMMIT_TURN / READY_NEXT carry no round or game_epoch and the server checks neither — a stale tab's round-N commit is accepted as the current round's turn
  3 (med) monumentsCompleted is credited without checking monumentBoxes[name] === workers — a doctored commit gains first-builder VP and can trip the all-monuments game end (a SHARED consequence, breaching trust-but-clamp's own promise)
  4 (low) goods array has no upper clamp (only ≥0) — self-granted goods reseed next round's purchasing power; clamp to per-row track max
  5 (low) invalid/stale/out-of-phase actions are silently swallowed with ok:true — doctrine asks for explicit rejection debug detail (sibling-consistent with Yahtzee/10k, so a platform-level decision)
  pass: duplicate submit (server+client+DO serialization), duplicate tab, out-of-order arrival (D1 optimistic lock + re-run), socket drop during barriers (flags in D1, reconnect backoff + re-fetch), refresh mid-turn (by design), no polling / write amplification
```

```text
GATE rules-fidelity — 2026-07-02 — 7 gaps —
 1 MAJOR wrong (partially known-open): developments usable the turn acquired against steps that already happened — a Dev-page purchase is not gated on Upkeep having run, so a 2/5-skull roller can buy Irrigation/Religion pre-Upkeep and dodge their own drought/revolt, or buy Leadership and reroll the same turn; server facet: resolveDisasters reads devs INCLUDING this round's devBought, so Religion/Medicine bought step 4 shields disasters resolving step 2 → gate purchases on upkeepDone + resolve disasters against pre-commit devs
 2 MAJOR wrong (known-open): Leadership not offered when the player stops rolling early (all dice held before roll 3) — leadershipReady requires rolls >= MAX_ROLLS; rulebook says "after your LAST roll" → gate on rolling-ended
 3 MED   missing (known-open): solo lacks solitaire rules (10-round cap; solo Pestilence never hits the roller) while manifest allows 1+ players → implement or set minPlayers 2
 4 LOW   missing (known-open): end-game tie-break by remaining goods value; completeGame awards the first tied seat in seat order → compare goods value on tie
 5 LOW   wrong (new): an undecided 2-food-or-2-workers choice die tallies as ZERO if the player taps Upkeep past the prompt — no pending-choice guard on onAction; the die is never worth nothing → block Upkeep while a choice is pending
 6 LOW   wrong (new): Leadership cannot reroll the choice die — onDieClick cycles a choice die before the leadMode branch, so one legal reroll target is unreachable → let leadMode taps reroll it
 7 LOW   deviation-undocumented (known-open): same-round monument "first builder" = commit arrival order within the barrier → MojoSOGO to sign or change
 pass: all five calibration bugs stay caught-and-fixed; every die face, all 13 developments (2025 PDF values), all 7 monuments + seat-count sets, all disasters + famine, setup 3/3/0, both end conditions at every seat count; client/server/ai table parity pinned; on-screen ability/disaster text matches behavior (old gaps 11+12 closed)
```

```text
GATE projection — 2026-07-02 — 3 gaps — (re-run: identical to 2026-07-01; nothing fixed, nothing new)
  1 (med) projection-shape test still too shallow — none of the per-seat fields the client reads are pinned; a silent rename passes tests and breaks board seeding as undefined → extend the test
  2 (low) seat.finish_state emitted, never read (client recomputes) → adopt (Yahtzee-style news strip) or drop
  3 (low) seat.name emitted, never read (client resolves via room.players) → keep as convention or read as fallback
  pass: ZERO read-but-never-emitted fields — the dangerous class is clean; pending_events.amount emit/read guards consistent
```

```text
GATE sibling-parity — 2026-07-02 — 4 gaps —
  1 (med) reconnect/resume vs initial join: refresh mid-turn silently discards the in-progress turn and deals fresh dice — an undetectable free reroll (turn state lives only in board.js closures; dice are client-rolled; server sees only the commit); matches the Yahtzee trust model but is documented NOWHERE as intentional → accept + sign the deviation here, or persist turn state
  2 (low) bot vs human: bots buy ability developments they never exercise — cheapest-first makes Leadership (10) their preferred purchase yet no bot ever rerolls, converts stone (Engineering), or sells food (Granaries) → teach ai.js the abilities or steer purchases
  3 (low) bot vs human: self-inflicted point loss caps at the 45-box disaster grid for humans (loseAPoint stops) but bots/server apply uncapped famine+disaster points → clamp server-side
  4 (low) mobile vs desktop: 250ms double-tap undo + quick-second-tap food chip lack touch-action:manipulation in rtta styles (siblings set it) — iOS double-tap zoom can race the gesture → add touch-action to those surfaces
  pass: bots import the client rules module and commit through the same clamps (2026-07-01 gap 1 structurally closed); monument seat sets + pestilence scaling at min/max counts; public-vs-private view; device-id seat identity; addEventListener-only wiring
```

```text
GATE resilience — 2026-07-02 — 6 gaps — (gaps 1-5 unchanged from 2026-07-01; gap 6 newly listed)
  1 (high) failed COMMIT_TURN / READY_NEXT strands the player: submitted=true latched + button disabled BEFORE the POST, error lands in #turnStatus which the shell hides for RTTA, and render.js keeps the mounted board so snapshots can't unstick it → re-enable on failure + surface the error in-board
  2 (med) no round/epoch stamp on COMMIT_TURN/READY_NEXT and the server checks neither — a stale tab's round-N commit is accepted as the current round's whole turn → stamp + reject mismatches
  3 (med) monumentsCompleted credited without cross-checking monumentBoxes[name] === workers — doctored commit gains first-builder VP and can trip the all-monuments game end (shared consequence); the lax behavior is even pinned by a test → validate against the clamped boxes
  4 (low) goods have no upper clamp (only >= 0) — hostile commits bank absurd goods that reseed purchasing power and bloat the persisted blob → clamp to per-row track max
  5 (low) invalid/stale/out-of-phase actions silently return ok:true — doctrine asks explicit rejection debug detail; sibling-consistent with Yahtzee/10k so a platform-level fix
  6 (low) a permanently departed human deadlocks both barriers — no timeout/skip/kick; reset vote needs EVERY seat; only escape is /api/room/leave which deletes the room (mitigated by device-portable identities)
  pass: duplicate submit (latch + round_done/ready_next + DO serialization, pinned); out-of-order (one DO per room + D1 optimistic lock); refresh/duplicate tab collapse to the barrier; no polling, one write + one broadcast per action; Leadership reroll is client-local (no new server surface); cityBoxes clamping correct and tested
```

## Rules Ledger — rules-fidelity gate, 2026-07-01

Status: ✓ correct · ✗ wrong · ◦ missing · Δ deviation (intended → listed above).
Owner `board` = `src/…/rtta/board.js`, `c-rules` = client `rules.js`,
`s-rules` = `workers/games/rtta/rules.js`, `ai` = `workers/games/rtta/ai.js`.
Tests live in `workers/tests/rtta-rules.test.js`. `—` in Pinned-by = no
browser-free pin exists (see gap 7).

### Dice & roll mechanics

| Effect | Fires when | Exactly | Bounds | Touches | Owner | Pinned by | Status |
|---|---|---|---|---|---|---|---|
| 3 Food face | roll | +3 food (+1/die w/ Agriculture) | food ≤ 15 | food | c-rules/board | — | ✓ |
| 1 Good face | roll | +1 good | row caps | goods | c-rules/board | — | ✓ |
| 2 Goods + skull face | roll | +2 goods AND 1 skull; die frozen | skulls per-turn only | goods, skulls | c-rules/board | — | ✓ |
| 3 Workers face | roll | +3 workers (+1/die w/ Masonry) | — | workers | c-rules/board | — | ✓ |
| 2 Food OR 2 Workers face | after last roll (tap) | choose one side; Agriculture/Masonry +1 applies to the chosen side | must decide before Upkeep | food/workers | board | — | ✓ |
| 7 Coins face | buy step | 7 coins (12 w/ Coinage); never saved between turns | per-turn | coins | c-rules/board | — | ✓ |
| Roll structure | roll step | up to 3 rolls; skull dice set aside after each roll; kept dice may be re-rolled; all dice kept after the 3rd | — | dice | board | — | ✓ |
| Dice per turn | turn start | 1 die per city | 3–7 | dice | board/s-rules | — | ✓ |

### Turn steps

| Effect | Fires when | Exactly | Bounds | Touches | Owner | Pinned by | Status |
|---|---|---|---|---|---|---|---|
| Collect goods | step 1 | round-robin Wood→Spearhead, restarting at Wood each turn; a full row loses the good but it still counts as earned | rows 8/7/6/5/4 | goods | board `populateResources` | — | ✓ (rulebook "Donna" example reproduces) |
| Collect food, then feed | steps 1–2 | +food first; then −1 food per city (per die) | food 0–15 | food | board upkeep | — | ✓ |
| Famine | step 2, unfed cities | −1 pt per unfed city | — | points_lost | board | — | ✓ |
| Build cities | step 3 | 4th–7th city cost 3/4/5/6 boxes; a completed city adds a die from the NEXT turn | max 7 | cities | board | — | ✗ partial city boxes not persisted (gap 2) |
| Build monuments | step 3 | 1 worker = 1 box; progress persists via `monumentBoxes` | boxes ≤ monument cost (server clamp) | monuments | board + s-rules | out-of-play-clamp test | ✓ |
| Buy development | step 4 | ≤1 per turn; coins + WHOLE goods stacks, spend ≥ cost, no change; each dev once per player | 1/turn, once ever | devs | board + s-rules | stale-commit test | ✓ |
| Discard | step 5 | keep ≤6 goods total; Caravans exempt | — | goods | board `discardExcessGoods` | — | Δ auto-discards from Wood up (deviation listed) |
| Pass dice / turn order | end of turn | replaced by the round barrier; equal turns hold by construction | — | round | s-rules | barrier tests | Δ (adaptation) |

### Disasters

| Effect | Fires when | Exactly | Bounds | Touches | Owner | Pinned by | Status |
|---|---|---|---|---|---|---|---|
| 1 skull | upkeep | no effect | — | — | board | — | ✓ |
| Drought | exactly 2 skulls | −2 pts; Irrigation immune | — | points_lost | board | — | ✓ |
| Pestilence | exactly 3 skulls | every OTHER player −3; Medicine immune; roller unaffected | — | opponents' points_lost | s-rules `resolveDisasters` | pestilence tests ×2 | ✓ |
| Invasion | exactly 4 skulls | −4 pts; completed Great Wall immune (wall from a prior build step) | — | points_lost | board | — | ✓ |
| Revolt | 5+ skulls | lose ALL goods incl. just-collected; with Religion the opponents lose all goods instead | — | goods | board + s-rules | revolt test | ✗ opponents with Religion not spared (gap 4) |
| Skull persistence | round end | skulls never carry between rounds | 0–7 server clamp | skulls | s-rules `advanceRound` | — | ✓ |

### Monuments (workers / first / later)

| Effect | Exactly | Owner | Pinned by | Status |
|---|---|---|---|---|
| Step Pyramid | 3 / 1 / 0 | c-rules + s-rules | data-parity test | ✓ |
| Stone Circle | 5 / 2 / 1 | 〃 | 〃 | ✓ |
| Temple | 7 / 4 / 2 | 〃 | 〃 | ✓ |
| Obelisk | 9 / 6 / 3 | 〃 | 〃 | ✓ |
| Hanging Gardens | 11 / 8 / 4 | 〃 | 〃 | ✓ |
| Great Wall | 13 / 10 / 5 + invasion immunity | 〃 | 〃 | ✓ |
| Great Pyramid | 15 / 12 / **6** | 〃 | 〃 | Δ? 2025 PDF says later = 8 (gap 5) |
| First vs later builder | first completion scores the big number; later builders the small one; incomplete = 0 at game end | s-rules `recomputeScores` | first/later test | ✓ (same-round tie = arrival order — gap 9) |
| Seat-count monument sets | rulebook: 2P removes Temple + Great Pyramid; 3P removes Hanging Gardens; solo and 4P use ALL | c-rules `players` + s-rules `monumentsInPlay` + ai | parity + in-play tests (pin the wrong sets) | ✗ inverted — read as minimum seats (gap 1) |

### Developments (cost / VP / effect)

| Development | Implemented | 2025 PDF | Owner | Pinned by | Status |
|---|---|---|---|---|---|
| Leadership | 10/2 — reroll 1 die after last roll | same, **incl. a skull die** | board | — | ✗ skull reroll blocked; unavailable after an early stop (gap 3) |
| Irrigation | 10/2 — drought has no effect | same | board | — | ✓ |
| Agriculture | 15/3 — +1 food per food die (incl. choice-as-food) | same | board `tally` | — | ✓ |
| Quarrying | 15/3 — +1 stone once when any stone produced | same | board | — | ✓ |
| Medicine | **15/3** — pestilence has no effect | **20/4** | board + s-rules | pestilence test | Δ? edition (gap 5) |
| Coinage | 20/4 — coin die worth 12 | same | board | — | ✓ |
| Caravans | 20/4 — no discard (works the turn bought; Buy precedes Discard) | same | board | — | ✓ |
| Religion | **20/6** — revolt hits opponents | **25/7** | board + s-rules | revolt test | Δ? edition (gap 5) |
| Granaries | 30/6 — **4 coins**/food during the Buy step | **6 coins**/food | board `paidTotal` | — | Δ? edition (gap 5) |
| Masonry | 30/6 — +1 worker per worker die | same | board `tally` | — | ✓ |
| Engineering | 40/6 — spend stone → 3 workers each, any amount, stone consumed, opt-in + undoable | same | board `engConvert` | — | ✓ |
| Architecture | **50/8 — +1**/monument | **60/8 — +2**/monument | c-rules + s-rules | bonus test | Δ? edition (gap 5) |
| Empire | **60/8** — +1/city | **70/10** — +1/city | c-rules + s-rules | bonus test | Δ? edition (gap 5) |
| Purchase timing | effects live from the moment bought (Build precedes Buy, so Engineering/dice effects start next turn; Caravans/Medicine work the same turn) | — | board `ownsDev` | — | ✓ |

### Game end & variants

| Effect | Exactly | Owner | Pinned by | Status |
|---|---|---|---|---|
| End: 5 developments | game over at the end of the round when any player owns 5 | s-rules `isGameOver` | 5-devs test | ✓ |
| End: all monuments | end of round when every IN-PLAY monument is built at least once | s-rules | in-play end test | ✓ mechanism (set wrong — gap 1) |
| Equal turns | the round barrier guarantees it | s-rules | barrier tests | ✓ |
| Score | dev VP + monument VP + Architecture/Empire bonuses − points lost | s-rules `recomputeScores` | score tests | ✓ |
| Tie-break | rulebook: tied player whose remaining goods are worth the most wins | s-rules `completeGame` | — | ◦ missing (gap 8) |
| Longer Game (6 devs) | optional variant | — | — | Δ not implemented (listed) |
| Solitaire | 10 rounds, ALL monuments, self-affecting Pestilence, Religion prevents Revolt | — | — | ◦ minPlayers=1 but solo rules absent (gap 6) |

### On-screen text vs behavior

Development ability lines, the disaster list, the Great Wall note, and the
build/dev/discard tips all match implemented behavior (score-sheet edition
wording — revisit with gap 5). Two mismatches → gap 12. Client/server
MONUMENTS + DEVELOPMENTS tables are parity-tested; the ai.js copies are not
→ gap 11.

## Projection audit (2026-07-01) — field-by-field

Wire contract: `rttaGameToDict` (workers/games/rtta/rules.js:288) vs client reads
(games/rtta/render.js, games/rtta/board.js, games/game-kinds.js, app.js).

**Read but never emitted: none.** Every client read resolves to an emitted field
(incl. `pending_events[].{kind,from,to,amount}`; `room.game_epoch` is room-level
and emitted by the room projection).

| Emitted field | Read by |
|---|---|
| game_id | game-kinds predicate |
| round | render key, standings heading, board round label |
| phase / status / winner | render.js barrier + standings |
| monuments | render.js Mon column; board.js built-monument seed |
| pending_events | eventsHtml + animatePendingEvents (kind/from/to/amount) |
| seat_order | render.js seat count → monuments-in-play |
| players[].mark / is_bot | standings rows |
| players[].cities/food/goods/developments/monumentBoxes/points_lost/score | standings + board seed |
| players[].round_done / ready_next | barrier UI |
| players[].name | **never** (names come from room.players) — gap 3 |
| players[].finish_state | **never** (RTTA recomputes; Yahtzee reads its own) — gap 2 |

Internal-only, correctly not projected: `players[].skulls`, `players[].level`.
