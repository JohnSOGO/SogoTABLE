# Dice Game 10,000 — Complete Scoring Set

This document defines a complete scoring reference for the dice game **10,000** / **Ten Thousand** / **Farkle-style 10,000**.

The game has many house-rule variants. For SogoTable, use the **Default Scoring Set** unless a variant is explicitly selected.

---

## 1. Dice and Goal

- The game uses **six standard six-sided dice**.
- Players roll dice to score points.
- First player to reach or pass **10,000 points** triggers the endgame.
- Other players usually get one final turn to beat that score.
- Highest score after the final round wins.

---

## 2. Core Concepts

### Scoring Dice

A die or dice group is **scoring** if it matches one of the scoring patterns below.

Basic scoring dice:

| Roll Pattern | Points |
|---|---:|
| Single `1` | 100 |
| Single `5` | 50 |
| Three `1`s | 1,000 |
| Three `2`s | 200 |
| Three `3`s | 300 |
| Three `4`s | 400 |
| Three `5`s | 500 |
| Three `6`s | 600 |

Important: single `2`, `3`, `4`, or `6` dice do **not** score by themselves.

---

## 3. Default Scoring Set

This is the recommended complete scoring table.

### Singles

| Dice | Points |
|---|---:|
| `1` | 100 |
| `5` | 50 |

### Three of a Kind

| Dice | Points |
|---|---:|
| `1 1 1` | 1,000 |
| `2 2 2` | 200 |
| `3 3 3` | 300 |
| `4 4 4` | 400 |
| `5 5 5` | 500 |
| `6 6 6` | 600 |

### Four, Five, and Six of a Kind

Default rule: **doubling rule**.

Each matching die above three-of-a-kind doubles the three-of-a-kind score.

| Dice | Points |
|---|---:|
| Four `1`s | 2,000 |
| Five `1`s | 4,000 |
| Six `1`s | 8,000 |
| Four `2`s | 400 |
| Five `2`s | 800 |
| Six `2`s | 1,600 |
| Four `3`s | 600 |
| Five `3`s | 1,200 |
| Six `3`s | 2,400 |
| Four `4`s | 800 |
| Five `4`s | 1,600 |
| Six `4`s | 3,200 |
| Four `5`s | 1,000 |
| Five `5`s | 2,000 |
| Six `5`s | 4,000 |
| Four `6`s | 1,200 |
| Five `6`s | 2,400 |
| Six `6`s | 4,800 |

This makes four-of-a-kind meaningful without making every big roll a slot-machine jackpot. Good default. Not too spicy, not grandma-mode.

---

## 4. Six-Dice Combination Bonuses

These bonuses only apply when the full six-dice roll forms the pattern.

| Six-Dice Pattern | Example | Points |
|---|---|---:|
| Straight | `1 2 3 4 5 6` | 1,500 |
| Three Pairs | `2 2 4 4 6 6` | 1,500 |
| Two Triplets | `3 3 3 5 5 5` | 2,500 |
| Full House | `4 4 4 2 2` plus one non-scoring die if using six dice | See note below |

### Full House Note

A true five-dice full house does not naturally fit cleanly into six-dice 10,000 unless your rules explicitly allow it.

Recommended default:

- **Do not score Full House as a special bonus.**
- Score the three-of-a-kind normally.
- Score any extra `1`s or `5`s normally.
- Ignore non-scoring leftover dice.

Example:

| Roll | Score |
|---|---:|
| `3 3 3 2 2 4` | 300 |
| `5 5 5 2 2 1` | 600 = 500 + 100 |

Reason: Full House is a common variant, but it creates ambiguity and extra edge cases. Keep it out of the default rules unless you want a more arcade-style game.

---

## 5. Farkle / Bust Rule

A player **farkles** when a roll produces **zero scoring dice**.

When a player farkles:

- The player scores **0 points for that turn**.
- Any unbanked points accumulated during that turn are lost.
- The turn immediately ends.
- The dice should remain showing the final rolled values.
- In UI, all dice should be visually marked as failed/busted, usually red.

Example:

| Roll | Result |
|---|---|
| `2 2 3 3 4 6` | Farkle — no `1`, no `5`, no three-of-kind, no scoring combo |
| `2 3 4 6` | Farkle if rolling only four dice |
| `1 2 3 4 6 6` | Not a farkle because `1` scores |
| `2 3 4 5 6 6` | Not a farkle because `5` scores |

---

## 6. Hot Dice Rule

If all rolled dice score, the player has **hot dice**.

When hot dice happens:

- The player may pick up all six dice and continue rolling.
- The current turn total carries forward.
- The player may also choose to bank, if banking is allowed by the current rules.

Examples:

| Roll | Why Hot? |
|---|---|
| `1 2 3 4 5 6` | Straight scores all six dice |
| `2 2 2 5 5 5` | Two triplets score all six dice |
| `1 1 1 5 5 5` | Two triplets score all six dice |
| `1 1 1 2 5 5` | Three `1`s + two single `5`s score five dice; `2` does not score, so not hot |
| `1 5` | Both dice score; hot dice if only two dice were rolled |

---

## 7. Banking Rules

Recommended default:

- A player may stop and bank points after any scoring roll.
- Optional entry rule: first banked score must be at least **500** or **1,000** points.
- After a player is “on the board,” they may bank any positive turn score.

Suggested SogoTable default:

| Rule | Value |
|---|---:|
| Opening minimum | 500 |
| Normal banking minimum after opening | 50 |
| Winning score | 10,000 |
| Final round | Yes |

---

## 8. Dice Selection Rule

After each roll:

1. The player must set aside at least one scoring die or scoring group.
2. The player may set aside more than one scoring die or group.
3. Non-scoring dice cannot be kept as scoring dice.
4. The player may either bank or roll the remaining dice.
5. If no dice remain because all dice scored, apply Hot Dice.

Example:

Roll: `1 1 1 5 2 6`

Valid selections:

| Selection | Points |
|---|---:|
| `1` | 100 |
| `5` | 50 |
| `1 1 1` | 1,000 |
| `1 1 1 + 5` | 1,050 |

Invalid selection:

| Selection | Reason |
|---|---|
| `2` | Single `2` does not score |
| `6` | Single `6` does not score |
| `1 1` | Two `1`s are not a combo, but each `1` may be scored individually as 100 each if selected as singles |

---

## 9. Scoring Priority / Parser Rules

For implementation, score in this order:

1. Check for full six-dice special combos:
   - Straight
   - Three Pairs
   - Two Triplets
2. Check for six/five/four/three-of-a-kind.
3. Score remaining single `1`s.
4. Score remaining single `5`s.
5. Ignore remaining non-scoring dice.

Important: avoid double-counting dice.

Example:

Roll: `1 1 1 1 5 2`

Correct score:

- Four `1`s = 2,000
- Single `5` = 50
- Total = **2,050**

Incorrect score:

- Three `1`s = 1,000
- Extra `1` = 100
- Single `5` = 50
- Total = 1,150

The higher grouped match should consume the matching dice first.

---

## 10. Complete Default Examples

| Roll | Score | Explanation |
|---|---:|---|
| `1 2 3 4 6 6` | 100 | Single `1` |
| `2 3 4 5 6 6` | 50 | Single `5` |
| `1 5 2 3 4 6` | 150 | Single `1` + single `5` |
| `2 2 2 3 4 6` | 200 | Three `2`s |
| `3 3 3 1 5 6` | 450 | Three `3`s + `1` + `5` |
| `4 4 4 4 2 3` | 800 | Four `4`s |
| `5 5 5 5 1 2` | 1,100 | Four `5`s + single `1` |
| `6 6 6 6 6 2` | 2,400 | Five `6`s |
| `1 1 1 1 1 5` | 4,050 | Five `1`s + single `5` |
| `1 2 3 4 5 6` | 1,500 | Straight |
| `2 2 3 3 6 6` | 1,500 | Three pairs |
| `2 2 2 4 4 4` | 2,500 | Two triplets |
| `2 3 3 4 4 6` | 0 | Farkle |

---

## 11. Common Variant Scoring Sets

Because 10,000 is a folk game, scoring varies a lot. These variants should be supported as optional rule presets.

### Variant A — Flat Big-Kind Bonuses

| Pattern | Points |
|---|---:|
| Four of a kind | 1,000 |
| Five of a kind | 2,000 |
| Six of a kind | 3,000 |
| Straight | 1,500 |
| Three pairs | 1,500 |
| Two triplets | 2,500 |
| Full house | 1,500 |

This is simple and common. Downside: four `2`s and four `6`s score the same, which feels a little dumb but is easy for humans.

### Variant B — Additive Big-Kind Scoring

Each extra die above three-of-a-kind adds the base three-of-a-kind score again.

Example with `4`s:

| Pattern | Score |
|---|---:|
| `4 4 4` | 400 |
| `4 4 4 4` | 800 |
| `4 4 4 4 4` | 1,200 |
| `4 4 4 4 4 4` | 1,600 |

This is conservative. Good for longer games.

### Variant C — Doubling Big-Kind Scoring

This is the recommended default.

Each extra die above three-of-a-kind doubles the value.

Example with `4`s:

| Pattern | Score |
|---|---:|
| `4 4 4` | 400 |
| `4 4 4 4` | 800 |
| `4 4 4 4 4` | 1,600 |
| `4 4 4 4 4 4` | 3,200 |

This keeps the game exciting without completely breaking score balance.

### Variant D — Arcade Bonus Scoring

| Pattern | Points |
|---|---:|
| Four of a kind | 1,000 |
| Five of a kind | 2,000 |
| Six of a kind | 3,000 or instant win |
| Straight | 1,500, 2,000, or 3,000 |
| Three pairs | 1,500 or 2,000 |
| Two triplets | 2,500 or 3,000 |
| Four of a kind + pair | 1,500 |
| Full house | 1,500 |

This is swingy. Fun for casual chaos, bad for tight strategy.

---

## 12. Recommended SogoTable Rule Preset

Use this as the default implementation.

```json
{
  "game": "10000",
  "winningScore": 10000,
  "diceCount": 6,
  "openingMinimum": 500,
  "bankMinimumAfterOpening": 50,
  "finalRound": true,
  "singleOne": 100,
  "singleFive": 50,
  "threeOfKind": {
    "1": 1000,
    "2": 200,
    "3": 300,
    "4": 400,
    "5": 500,
    "6": 600
  },
  "fourPlusKindMode": "doubling",
  "straight": 1500,
  "threePairs": 1500,
  "twoTriplets": 2500,
  "fullHouse": null,
  "fourOfKindPlusPair": null,
  "hotDice": true,
  "mustKeepAtLeastOneScoringDie": true,
  "farkleLosesTurnPoints": true
}
```

---

## 13. Implementation Notes for CODEX

### Dice Result Object

Each roll should return:

```json
{
  "dice": [1, 1, 1, 5, 2, 6],
  "score": 1050,
  "scoringGroups": [
    { "type": "three_of_kind", "face": 1, "diceIndexes": [0, 1, 2], "points": 1000 },
    { "type": "single", "face": 5, "diceIndexes": [3], "points": 50 }
  ],
  "nonScoringDiceIndexes": [4, 5],
  "isFarkle": false,
  "isHotDice": false
}
```

### Farkle UI Behavior

When `isFarkle === true`:

- Keep the dice faces exactly as rolled.
- Do not replace dice values with `1` or any placeholder.
- Mark all dice as failed/busted.
- Show popup: **You Farkled!**
- Clear unbanked turn points.
- End the player’s turn.

### Hot Dice UI Behavior

When `isHotDice === true`:

- Show all dice as scoring.
- Allow player to roll all six dice again.
- Preserve the turn subtotal.
- Also allow banking if rules permit.

---

## 14. Edge Cases

### Roll Has Multiple Possible Scores

Always choose the highest legal score from non-overlapping dice groups, unless the player is manually selecting a smaller scoring subset.

Example:

`1 1 1 1 1 1`

Default score:

- Six `1`s = 8,000

Do not score it as:

- Two triplets = 2,500

The kind-of-a-kind value is higher and should win.

### Three Pairs With `1`s or `5`s

Example:

`1 1 5 5 6 6`

Default full-roll score:

- Three pairs = 1,500

Do not also add two single `1`s and two single `5`s.

### Straight Includes `1` and `5`

Example:

`1 2 3 4 5 6`

Default full-roll score:

- Straight = 1,500

Do not also add `1` + `5` for 150 extra.

### Two Triplets With `1`s

Example:

`1 1 1 6 6 6`

Default full-roll score:

- Two triplets = 2,500

Optional alternative:

- Three `1`s + three `6`s = 1,600

Default should choose **2,500** because it is the higher six-dice combo.

---

## 15. Summary

Default scoring should be:

| Pattern | Points |
|---|---:|
| Single `1` | 100 |
| Single `5` | 50 |
| Three `1`s | 1,000 |
| Three `2`s | 200 |
| Three `3`s | 300 |
| Three `4`s | 400 |
| Three `5`s | 500 |
| Three `6`s | 600 |
| Four+ of a kind | Doubling from three-of-kind value |
| Straight | 1,500 |
| Three pairs | 1,500 |
| Two triplets | 2,500 |
| Full house | Disabled by default |
| Farkle | Lose unbanked turn points |
| Hot dice | Roll all six again |

This is complete enough for implementation, flexible enough for variants, and not so overloaded that the game turns into dice karaoke.
