# Roll of the Dead 🧟 (module id `zombie-dice`)

A push-your-luck dice game for 1+ players — a mechanics-faithful clone of the
Steve Jackson Games classic, shipped under our own name and art (the SJG name
and artwork are trademarked/copyrighted; the mechanics are not). The rulebook
spec, deviations list, and rules ledger live in
`src/sogotable/static/games/zombie-dice/PLAN.md`.

## How it plays

- Your cup holds 13 dice: **6 green** (easy victims), **4 yellow**, **3 red**
  (tough). Each roll you draw blind to 3 dice and roll them.
- **🧠 Brain** — set aside, worth 1 at bank time. **💥 Shotgun** — set aside;
  collect three and your turn ends with **nothing**. **👣 Footprints** — the
  victim escaped; those dice re-roll if you push on.
- After any roll you may **bank** (score your brains, end your turn) or **roll
  again** — drawing fresh dice up to 3. Drawing commits you to the roll.
- If the cup can't cover a draw, your brain tally is noted and the brain dice
  go back in the cup (shotguns stay out).
- First to bank **13 brains** triggers the end: the round is finished so
  everyone has equal turns, then most brains wins. Tied leaders (only) play
  tiebreaker rounds until someone shambles ahead.
- **Solo survival mode** (one-seat rooms, automatic): race to 13 with **3
  lives** — each bust costs one, zero lives is defeat (banked score recorded,
  no winner). Solo-with-bots plays the normal race. House mode #10 in the
  module's PLAN.md; rooms started before the mode existed keep the old
  unloseable race.

## Architecture

- **Timing:** shared-table `turnBased` with simultaneous per-seat rounds (the
  10,000 model): every seat plays each round's turn concurrently from its own
  full cup; a barrier advances the round when all active seats resolve.
- **Worker:** `workers/games/zombie-dice/rules.js` — pure, server-authoritative;
  atomic draw+roll; server-owned seedable RNG; normalization clamps persisted
  state. One `GAME_HANDLERS` row (`resolvesBotsInternally`).
- **Bots:** `workers/games/zombie-dice/ai.js` — 4 tiers (Sprout timid → Buddy
  house rules → Cipher exact 1-ply EV → Overlord EV + standings pressure).
  Bots play the human rules path at round start and replay client-side paced to
  the human's rolls.
- **Client:** `src/sogotable/static/games/zombie-dice/render.js` + `styles.js`
  — renders the projection, computes no rules; shared host-start lobby. The
  board commits to its graveyard art (`board-bg.jpg`, provided by MojoSOGO;
  the title is baked into the art) in both light and dark themes — the
  mazewright game-specific-board-palette precedent — with translucent panels
  and physically-colored dice.
- **Tests:** `workers/tests/zombie-dice-rules.test.js` — every rules-ledger row
  plus the projected wire shape, browser-free.

## Endgame state machine

`playing` rounds → barrier sees a banked score ≥ 13 → single leader: complete —
tied leaders: `tiebreaker` (active_marks = leaders; other seats sit out with
their scores frozen) → repeat until one leader. A tiebreaker among bots only
auto-plays at the barrier (no human roll is available to advance it). In solo
survival, a bust at the last life short-circuits to `complete` with
`winner: null` (`last_move.type: "defeat"`) before the barrier runs.
