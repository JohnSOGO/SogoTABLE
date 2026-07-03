# Roll of the Dead 🧟 (module id `zombie-dice`) — PLAN

Promoted from `AI/zombie-dice/PLAN.md` (intake 2026-07-03). Clone of the
push-your-luck dice game published by Steve Jackson Games; our display name,
art, and rendering are original (the mechanics are not protectable; the SJG
name/art are — see Deviations #1).

## Rules source (Survey H)

- **Clone.** Spec = the official rulebook v1.0 (March 2010), saved at
  `AI/zombie-dice/ZDRules_English.pdf` (published free by SJG; fetched via the
  Internet Archive mirror). The rules-fidelity gate holds the build to it.
- **Rulebook gap:** the PDF does not state the per-color face distribution.
  Sourced from the physical dice (widely documented, e.g. BoardGameGeek) and
  pinned in `workers/tests/zombie-dice-rules.test.js`:
  - **Green ×6:** 3 brains, 2 footprints, 1 shotgun
  - **Yellow ×4:** 2 brains, 2 footprints, 2 shotguns
  - **Red ×3:** 1 brain, 2 footprints, 3 shotguns

## Intended deviations (an unlisted difference from the rulebook is a bug)

1. **Name/art:** shipped as **"Roll of the Dead 🧟"** with our own CSS dice —
   "Zombie Dice" is an SJG trademark and their art is copyrighted (MojoSOGO
   decision, 2026-07-03).
2. **Simultaneous rounds (the 10,000 model):** every seat takes each round's
   turn concurrently from its own full 13-die cup; a barrier advances the round
   when all active seats have banked or busted. Probability-identical to
   passing one physical cup around, and turn-count equity matches the
   rulebook's "finish the round". Physical turn order (and "best Braaaaains!
   goes first") is therefore not modeled.
3. **Scorekeeping is automated** (rulebook: "you'll need some way to keep score").
4. **Cup-refill trigger read as intent:** the refill (note brains, return the
   brain dice, keep shotguns out) fires when the cup cannot cover the draw.
   The rulebook's literal wording is "if you don't have three dice left in the
   cup"; with 2 dice left but only 1 needed, we do not refill.
5. **Tiebreaker rounds are cumulative and repeat** among the current leaders
   until one leads outright (rulebook specifies one tiebreaker round among
   leaders; repetition on a re-tie is our reading of the obvious intent).
   **Edge rule:** a bots-only tiebreaker that stays exactly tied for the whole
   26-round guard window ends deterministically — the earliest-seated tied
   leader wins — so the room can never soft-lock with every human sitting out
   (pinned by test; found by the 2026-07-03 gates).
6. **Bots resolve sequentially at round start** via the human rules path. Each
   bot's standings awareness (Overlord's pressure branch) reads the scores at
   its own turn, so later-seated bots see earlier bots' same-round banked
   totals — mirroring physical turn-order information. Humans see bot results
   paced to their own rolls, but the full trajectory ships in the public
   projection (a devtools reader could peek; accepted at family scale).
7. **No expansions** (Double Feature / Horde) in v1.
8. **Score authority is trusted at the family scale** for nothing — unlike the
   Game-Locked games there is NO client-posted score here: every roll is
   server-rolled and every bank is server-computed. (Listed to note the survey
   question was asked; the answer is full server authority.)
9. **Solo play is allowed** (rulebook: "Two or more can play") — a one-player
   room is a practice race to 13, ending the moment the solo seat banks past
   the target, consistent with the platform's other host-start games.

## Architecture (Survey A–G)

- Shared-table, `turnBased` timing with simultaneous per-seat rounds; NOT
  Game-Locked (the endgame couples all seats). Closest sibling: 10,000.
- Actionable events: **`roll`** (atomic server draw+roll — enforces "after you
  take new dice you have to roll") and **`bank`**. Everything else is local view.
- No hidden information → no per-viewer sanitizer.
- State is plain serializable data; the RNG sits behind one seedable seam
  (`setZombieDiceRandom`); server re-validates every action and clamps
  persisted state on read.
- Wire convention: the seat projection emits `hand` (kept feet colors) even
  though the current UI infers feet from `rolled` — kept deliberately as
  debug visibility and for a future kept-feet display (projection gate,
  2026-07-03).
- Bots: 4 tiers per `docs/ai-difficulty.md`, policy in `workers/games/zombie-dice/ai.js`,
  turns played through the human rules path; per-roll trajectory paced client-side.
- Reuse: standard lobby/room/invite/presence/stats; `lobbyMode: "hostStart"`
  via the shared `games/lobby.js` template.

## Rules Ledger

| Effect | Fires when | Exactly | Pinned by (test) |
|---|---|---|---|
| Setup | game start | 13 dice/cup (6G/4Y/3R), 6 faces each, scores 0, target 13 | "setup: 13 dice per cup…" |
| Draw | each roll | random dice from the cup to bring hand (incl. kept feet) to 3 | "roll: draws to 3…", "kept feet re-roll…" |
| Roll | after draw | exactly 3 dice; drawing forces the roll (atomic) | same |
| Brain | on roll | set aside, +1 turn brain; keeps its color | "roll: draws to 3…" |
| Shotgun | on roll | set aside, persistent all turn | same |
| Footprints | on roll | stays in hand; re-rolled on continue | "kept feet re-roll…" |
| Face windows | per color | G 3/2/1 · Y 2/2/2 · R 1/2/3 | "yellow and red dice use their own face windows" |
| Bust | 3+ shotguns | turn ends, banks nothing | "bust: a third shotgun…" |
| Stop/bank | player choice after a roll | +1 per brain; turn state resets next round | "bank: scores 1 per brain…" |
| Cup refill | cup can't cover the draw | note brains, brain dice return, shotguns stay out | "cup refill: brains return…" |
| Endgame | someone banks ≥13 | finish the round; most brains wins | "endgame: 13+ ends the game…" |
| Tie | leaders tied at round close | leaders (only) play tiebreaker rounds until broken | "tiebreaker: tied leaders…", "tiebreaker between bots…" |

## Verification Gates (fresh sessions)

```text
GATE rules-fidelity — 2026-07-03 — 4 gaps — solo play allowed but rulebook says "two or more" and deviation unlisted → deviation #9 added; all-bot tiebreaker 26-round guard exit left game unadvanceable → deterministic fallback added to maybeAdvanceZombieDiceRound + test; deviation #6 said bots read previous-round totals but later bots see same-round bot banks → deviation #6 reworded; rules.js face-table comment claimed a client parity test that doesn't exist → comment fixed
GATE projection — 2026-07-03 — 1 gap — seat.hand emitted but never read by any client (dead weight, low) → documented as intentional wire convention in Architecture notes
GATE sibling-parity — 2026-07-03 — 2 gaps — later-seated bots read earlier bots' same-round banked totals while deviation #6 said prior-round only → deviation #6 reworded (mirrors physical turn-order information); guard-exhausted bots-only tiebreaker left round_pending_advance with no legal human roll (soft-lock) → deterministic earliest-seat resolution added + test
GATE resilience — 2026-07-03 — pass — advisory: no round stamp on roll/bank (stale duplicate-tab roll can start the next round and spend its compulsory first roll — legal, uncorrupting, shared 10,000/Yahtzee tradeoff) · advisory: 26-round all-bot tiebreaker guard exhaustion soft-lock (since replaced by the deterministic fallback; reset vote also recovers)
```

All rules-fidelity / projection / sibling-parity gaps were fixed the same day
(commit 1b6ecd8); re-run receipts:

```text
GATE rules-fidelity (re-run) — 2026-07-03 — 1 gap — all four prior gaps verified fixed; new: rules.js playZombieDiceBotTurn comment still claimed bots see "previous round's banked totals", contradicting reworded deviation #6 — stale comment → fixed in 3a5132f
GATE projection (re-run) — 2026-07-03 — pass — prior gap resolved by documented wire convention; read-direction clean
GATE sibling-parity (re-run) — 2026-07-03 — 1 gap — both prior fixes verified in code+test (deviation #6 matches behavior; fallback human-proof, test exercises guard exhaustion; 229/229 green); same stale playZombieDiceBotTurn comment flagged (second sighting of the rules-fidelity re-run find) → fixed in 3a5132f
```

Both re-run flags were one and the same comment line, corrected in 3a5132f
before this stamp — all four gates closed as **pass**. Shipped to main the
same day.
