# 10,000 — Scoring (as implemented)

This documents the **actual scoring rules in this game**, not the generic
folk-rules of 10,000/Farkle. Source of truth: `workers/sogotable-api.js` —
`tenThousandScoreValues()` (combination values), `selectTenThousandDice()`
(what may be set aside), `tenThousandHasAnyScoringSet()` (farkle test), and
`bankTenThousandScore()` / `maybeAdvanceTenThousandRound()` (keeping score and
winning). Played with **6 dice**.

## The ways to score

Every selection is scored as a whole by `tenThousandScoreValues`. A selection is
only legal if **every die in it contributes** — see [Selection rules](#selection-rules).

### Singles
Only **1s** and **5s** score on their own.

| Die | Points (each) |
|-----|---------------|
| `1` | **100** |
| `5` | **50** |

A lone `2`, `3`, `4`, or `6` is worth nothing.

### Three of a kind
Three matching dice. Ones are special; every other face is `face × 100`.

| Triple | Points |
|--------|--------|
| three `1`s | **1,000** |
| three `2`s | 200 |
| three `3`s | 300 |
| three `4`s | 400 |
| three `5`s | 500 |
| three `6`s | 600 |

### Six-dice specials (only when all 6 dice are used at once)
| Combination | Points |
|-------------|--------|
| Straight `1-2-3-4-5-6` | **1,500** |
| Three pairs (e.g. `2 2 4 4 6 6`) | **1,500** |

These are checked **only** on a full set of 6 dice. A partial run like
`1-2-3-4-5` is **not** a straight — it scores just the `1` and the `5` (150).

## What this game does NOT do

This is the part that surprises people, so it's spelled out:

- **No four/five/six-of-a-kind multipliers.** Only **one triple per face** is
  ever scored. Extra matching dice are then treated as singles — which only
  helps for `1`s and `5`s:
  | Roll selected | How it scores | Total |
  |---------------|---------------|-------|
  | four `1`s | 1,000 + 100 | **1,100** |
  | five `1`s | 1,000 + 200 | **1,200** |
  | six `1`s | 1,000 + 300 (one triple + 3 singles) | **1,300** |
  | four `5`s | 500 + 50 | **550** |
  | five `5`s | 500 + 100 | **600** |
  | six `5`s | 500 + 150 | **650** |
  | four `2`/`3`/`4`/`6`s | triple scores, 4th die is dead | only the **triple** (the 4th cannot be set aside) |
- **No "two triplets" bonus.** Two triples just add up, e.g. three `3`s +
  three `4`s = 300 + 400 = **700**.
- **No bonus / instant win** for six of a kind. Six `1`s is 1,300, six `2`s
  can only ever bank a single triple (200), etc.

## Selection rules

When you set dice aside (`selectTenThousandDice`):

- You must select **at least one** die, and **every selected die must be part
  of a scoring combination**. Selecting a non-scoring die (a stray `2`/`3`/`4`/`6`,
  or the 4th die of a non-1/5 four-of-a-kind) makes the whole selection invalid.
- You may select **multiple times in one turn**: set some dice aside, re-roll
  the rest, set more aside — each selection **adds** to your *This Turn* score.
- **Hot dice:** if all 6 dice have been set aside, re-rolling rolls a fresh
  full set of 6 and your accumulated turn score carries over.

## Farkle (busting)

A roll **farkles** when it contains no scoring set at all
(`tenThousandHasAnyScoringSet` = no `1`, no `5`, and no three-of-a-kind among
the dice just rolled). On a farkle:

- Your **entire *This Turn* score is lost** (nothing banks).
- Your **farkle counter increases by 1**.
- You must acknowledge it ("You Farkled!"), which ends your turn for the round.

## Banking & keeping score

- **Banking** (`bankTenThousandScore`) moves *This Turn* into your permanent
  score. You may bank only after setting aside at least one scoring die
  (turn score > 0).
- **There is no minimum to "get on the board."** Any positive turn score may be
  banked — even a single `5` (50).
- Scores **accumulate across rounds** toward the target.

## Round structure & winning

This implementation is **simultaneous and round-based**, not classic
take-turns play:

- Each round, **every seat plays its own independent dice** and resolves by
  either **banking** or **farkling**. Each seat gets **one turn per round**.
- A round advances only once **all seats have resolved**; the next round starts
  when someone rolls again.
- **Target: 10,000.** When a seat banks to **≥ 10,000**, a **final round** is
  flagged. Once every seat has resolved that round, the game ends and the
  **highest total score wins** (`tenThousandLeader`) — so reaching 10,000 first
  is not an automatic win; everyone finishes the round and the top score takes it.
