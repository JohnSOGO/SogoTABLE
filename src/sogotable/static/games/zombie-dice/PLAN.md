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
6. **Bots are opponent-aware at round start only** (they resolve before humans
   act, reading the previous round's banked totals — information every seat has).
7. **No expansions** (Double Feature / Horde) in v1.
8. **Score authority is trusted at the family scale** for nothing — unlike the
   Game-Locked games there is NO client-posted score here: every roll is
   server-rolled and every bank is server-computed. (Listed to note the survey
   question was asked; the answer is full server authority.)

## Architecture (Survey A–G)

- Shared-table, `turnBased` timing with simultaneous per-seat rounds; NOT
  Game-Locked (the endgame couples all seats). Closest sibling: 10,000.
- Actionable events: **`roll`** (atomic server draw+roll — enforces "after you
  take new dice you have to roll") and **`bank`**. Everything else is local view.
- No hidden information → no per-viewer sanitizer.
- State is plain serializable data; the RNG sits behind one seedable seam
  (`setZombieDiceRandom`); server re-validates every action and clamps
  persisted state on read.
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

## Verification Gates (fresh sessions — no receipts yet)

```text
GATE rules-fidelity — pending
GATE projection    — pending
GATE sibling-parity — pending
GATE resilience    — pending
```
