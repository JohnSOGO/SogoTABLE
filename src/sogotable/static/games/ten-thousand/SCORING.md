# 10,000 — Scoring (as implemented)

This documents the **actual scoring rules in this game**. It follows the
**Default Scoring Set** from `10000_complete_scoring_set.md` (sections 1–9).
Source of truth: `workers/sogotable-api.js` — `tenThousandScoreValues()`
(combination values), `tenThousandHasAnyScoringSet()` (farkle test),
`tenThousandCanBank()` / `bankTenThousandScore()` (banking & opening rule).
The browser preview (`render.js` `tenThousandSelectionScore`) mirrors the worker
exactly. Played with **6 dice**; first to **10,000** triggers the final round.

## The ways to score

A selection is scored as a whole, in this priority order (section 9):

1. **Full six-dice combos** (only when all six dice are used)
2. **N-of-a-kind** with the doubling rule
3. **Leftover single 1s and 5s**

Any die left over that does not fall into one of these makes the selection
**invalid** — it cannot be set aside.

### Singles
| Die | Points (each) |
|-----|---------------|
| `1` | **100** |
| `5` | **50** |

A lone `2`, `3`, `4`, or `6` is worth nothing.

### N-of-a-kind (doubling rule)
Three of a kind is the base; **each die past three doubles it** (×2, ×4, ×8).

| Face | Three | Four | Five | Six |
|------|------:|-----:|-----:|----:|
| `1` | **1,000** | 2,000 | 4,000 | 8,000 |
| `2` | 200 | 400 | 800 | 1,600 |
| `3` | 300 | 600 | 1,200 | 2,400 |
| `4` | 400 | 800 | 1,600 | 3,200 |
| `5` | 500 | 1,000 | 2,000 | 4,000 |
| `6` | 600 | 1,200 | 2,400 | 4,800 |

### Six-dice combos (all six dice at once)
| Combination | Example | Points |
|-------------|---------|-------:|
| Straight | `1 2 3 4 5 6` | **1,500** |
| Three pairs | `2 2 4 4 6 6` | **1,500** |
| Two triplets | `2 2 2 4 4 4` | **2,500** |

Full house is **not** scored as a special combo (score the triple + any 1s/5s).

## Priority & edge cases (section 14)

The highest-value reading of the dice wins; the engine applies the order above
and never double-counts a die.

| Roll | Score | Why |
|------|------:|-----|
| `1 1 1 1 1 1` | 8,000 | Six of a kind beats "two triplets" (2,500) |
| `1 1 1 6 6 6` | 2,500 | Two triplets beats 1,000 + 600 |
| `1 1 5 5 6 6` | 1,500 | Three pairs — do **not** also add the 1s/5s |
| `1 2 3 4 5 6` | 1,500 | Straight — do **not** also add 1 + 5 |
| `6 6 6 6 6 2` | 2,400 | Five 6s; the leftover `2` is just not kept |
| `1 1 1 1 1 5` | 4,050 | Five 1s (4,000) + single 5 |

## Selecting dice (section 8)

- You must set aside **at least one** scoring die, and **every selected die
  must score** — selecting a stray `2`/`3`/`4`/`6` (or a die that doesn't
  complete a combo) is rejected.
- You may select **multiple times in one turn**: set some aside, re-roll the
  rest, set more aside — each selection **adds** to *This Turn*.
- **Hot dice:** if all six dice have been set aside, re-rolling rolls a fresh
  full set of six and your turn score carries over.

## Farkle / bust (section 5)

A roll has **no play** when it contains no scoring set — no `1`, no `5`, no
three-of-a-kind, **and** no three-pairs across six dice (e.g. `2 2 4 4 6 6`
scores 1,500 and has a play, but `2 2 3 3 4 6` does not).

**The farkle is player-declared, not auto-detected.** After rolling, the first
action button becomes a **Red X**; the game never tells you whether a play
exists (auto-detecting would leak that a play is there whenever it *didn't* fire,
which is too big an advantage). You either find a scoring selection or press the
Red X to bust yourself — and the Red X always busts, even if a play was actually
available. On a declared farkle the entire *This Turn* score is lost, the farkle
counter ticks up, the dice turn red with a "You Farkled" banner for ~2 seconds,
then it resolves and the turn ends. (Bots evaluate their own dice and bust when
they truly have no scoring play.)

## Banking & the opening rule (section 7)

- **Opening minimum: 500.** Until a seat has banked anything, the first bank
  must reach **500** — the bank button stays disabled below that, with a hint to
  keep pressing. (`game.opening_minimum` carries the value to the UI.)
- After a seat is **on the board**, any positive score may be banked (the
  smallest scoring die is 50).
- Scores accumulate across rounds toward **10,000**.

## Round structure & winning

Simultaneous and round-based: each round every seat plays its own dice and
resolves by banking or farkling (one turn per round). A round advances once all
seats resolve. When a seat banks to **≥ 10,000** a final round is flagged;
after every seat resolves that round, the **highest total wins**.
