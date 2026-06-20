# Farkle AI Players — 4 Difficulty Levels

## Purpose

This document defines AI player behavior for **Farkle** using four difficulty levels:

1. **Level 1 — Lucky Goblin**: casual, risky, sometimes dumb.
2. **Level 2 — Kitchen Table**: basic scoring logic, moderate risk.
3. **Level 3 — Sharp Player**: uses expected-value style decisions and game-state awareness.
4. **Level 4 — Ruthless Dice Gremlin**: strong AI using probability-weighted choices, score pressure, and endgame targeting.

The goal is not only to make the AI stronger at each level, but to make each level **feel different**.

---

## Farkle Assumptions

These rules assume a common Farkle scoring model:

| Combo | Points |
|---|---:|
| Single 1 | 100 |
| Single 5 | 50 |
| Three 1s | 1000 |
| Three 2s | 200 |
| Three 3s | 300 |
| Three 4s | 400 |
| Three 5s | 500 |
| Three 6s | 600 |
| Four of a kind | 1000 |
| Five of a kind | 2000 |
| Six of a kind | 3000 |
| Straight 1-6 | 1500 |
| Three pairs | 1500 |
| Two triplets | 2500 |

If your actual game uses different scoring, keep the AI structure and update the scoring table.

---

## Core AI Decision Points

Every AI turn has three major decisions:

1. **Which scoring dice should I keep?**
2. **Should I roll again or bank?**
3. **If all dice scored, should I roll hot dice or bank?**

The AI should evaluate every legal scoring choice, then decide whether to continue.

---

## Shared Concepts

### Turn Score

`turnScore` is the unbanked score accumulated during the current turn.

### Banked Score

`bankedScore` is the player’s permanent score.

### Score Needed

`scoreNeeded = targetScore - bankedScore`

Example:

```text
targetScore = 10000
bankedScore = 8600
scoreNeeded = 1400
```

### Dice Remaining

`diceRemaining` is the number of dice the player would roll if continuing.

### Hot Dice

If all dice are used in scoring combinations, the player may roll all six dice again.

Treat hot dice as:

```text
diceRemaining = 6
hotDice = true
```

### Farkle Risk by Dice Count

Approximate risk of rolling zero scoring dice:

| Dice Rolled | Farkle Risk |
|---:|---:|
| 6 | ~2.3% |
| 5 | ~7.7% |
| 4 | ~15.7% |
| 3 | ~27.8% |
| 2 | ~44.4% |
| 1 | ~66.7% |

The AI does not need perfect probability math at low levels. Higher levels should use this table directly.

---

## AI Output Format

The AI should return a decision object:

```js
{
  action: "BANK" | "ROLL",
  keepDice: [/* dice indexes or values to keep */],
  reason: "short debug reason",
  confidence: 0.0
}
```

Example:

```js
{
  action: "BANK",
  keepDice: [1, 5, 5],
  reason: "Level 2 banks at 350+ with only 3 dice remaining",
  confidence: 0.72
}
```

---

# Level 1 — Lucky Goblin

## Personality

The Lucky Goblin is chaotic. It understands obvious scoring dice but has terrible discipline.

This AI should be fun for children or beginners. It should occasionally make bad choices.

## Behavior Summary

| Behavior | Rule |
|---|---|
| Scoring choice | Usually picks the highest immediate score |
| Banking | Banks late and inconsistently |
| Risk tolerance | High |
| Hot dice | Usually rolls again |
| Endgame awareness | Minimal |
| Mistakes | Yes, intentional |

## Keep Dice Logic

1. Find all legal scoring combinations.
2. Pick one of the top scoring options most of the time.
3. Sometimes pick a smaller option to keep more dice available.

Suggested randomness:

```text
70% choose highest scoring legal keep
20% choose random legal keep
10% choose greedy-looking but strategically bad keep
```

Example bad behavior:

- Keeps a single 5 instead of three 2s.
- Keeps only one scoring die because “more dice are fun.”
- Rolls again with 1 die and 900 unbanked points. Goblin behavior. Dice goblin gonna dice.

## Bank or Roll Logic

Suggested rules:

```text
If turnScore < 500: always roll
If turnScore >= 500: 35% chance to bank
If turnScore >= 1000: 55% chance to bank
If diceRemaining <= 2: add 20% chance to bank
If hotDice: 75% chance to roll
```

## Endgame Logic

Very basic:

```text
If bankedScore + turnScore >= targetScore:
    70% chance to bank
    30% chance to roll anyway
```

Yes, this AI can throw away a win. That is the point.

## Pseudocode

```js
function decideLevel1(state) {
  const scoringOptions = getScoringOptions(state.dice);
  const keep = chooseGoblinKeep(scoringOptions);

  const futureDice = getDiceRemainingAfterKeep(state.dice, keep);
  const turnScoreAfterKeep = state.turnScore + score(keep);

  let bankChance = 0;

  if (turnScoreAfterKeep >= 500) bankChance += 0.35;
  if (turnScoreAfterKeep >= 1000) bankChance += 0.20;
  if (futureDice <= 2) bankChance += 0.20;
  if (futureDice === 6) bankChance -= 0.30;

  if (state.bankedScore + turnScoreAfterKeep >= state.targetScore) {
    bankChance = Math.max(bankChance, 0.70);
  }

  return Math.random() < bankChance
    ? { action: "BANK", keepDice: keep, reason: "Goblin banks randomly", confidence: bankChance }
    : { action: "ROLL", keepDice: keep, reason: "Goblin wants more dice", confidence: 1 - bankChance };
}
```

---

# Level 2 — Kitchen Table

## Personality

The Kitchen Table AI plays like a normal human who knows the rules but does not calculate deeply.

It uses simple thresholds.

## Behavior Summary

| Behavior | Rule |
|---|---|
| Scoring choice | Usually highest immediate score |
| Banking | Uses fixed thresholds |
| Risk tolerance | Medium |
| Hot dice | Rolls if turn score is low, banks if turn score is good |
| Endgame awareness | Basic |
| Mistakes | Rare, from randomness only |

## Keep Dice Logic

1. Prefer highest scoring legal keep.
2. If multiple options have similar score, prefer keeping fewer dice if it leaves at least 3 dice to roll.
3. Avoid rolling only 1 die unless turn score is low.

Tie-breaker order:

```text
1. Higher immediate score
2. More dice remaining, if score difference <= 100
3. Avoid leaving exactly 1 die
4. Random among tied options
```

## Bank or Roll Thresholds

Suggested banking thresholds:

| Dice Remaining | Bank If Turn Score Is At Least |
|---:|---:|
| 6 | 1000 |
| 5 | 750 |
| 4 | 600 |
| 3 | 450 |
| 2 | 350 |
| 1 | 250 |

This table intentionally gets more conservative as dice count drops.

## Hot Dice Logic

```text
If hot dice and turnScore < 750: roll
If hot dice and turnScore >= 750: bank
If behind by 2000+ points: roll hot dice unless turnScore >= 1200
```

## Endgame Logic

```text
If bankedScore + turnScore >= targetScore:
    bank immediately
```

No drama. No casino nonsense.

## Pseudocode

```js
function decideLevel2(state) {
  const scoringOptions = getScoringOptions(state.dice);
  const keep = chooseBestKitchenTableKeep(scoringOptions);

  const futureDice = normalizeHotDice(getDiceRemainingAfterKeep(state.dice, keep));
  const turnScoreAfterKeep = state.turnScore + score(keep);
  const totalAfterBank = state.bankedScore + turnScoreAfterKeep;

  if (totalAfterBank >= state.targetScore) {
    return { action: "BANK", keepDice: keep, reason: "Reached target score", confidence: 1.0 };
  }

  const bankThreshold = {
    6: 1000,
    5: 750,
    4: 600,
    3: 450,
    2: 350,
    1: 250
  }[futureDice];

  if (turnScoreAfterKeep >= bankThreshold) {
    return { action: "BANK", keepDice: keep, reason: "Met Level 2 bank threshold", confidence: 0.8 };
  }

  return { action: "ROLL", keepDice: keep, reason: "Below Level 2 bank threshold", confidence: 0.7 };
}
```

---

# Level 3 — Sharp Player

## Personality

The Sharp Player uses risk, score pressure, and dice count. It is not perfect, but it stops making obvious mistakes.

This AI should beat casual players over time.

## Behavior Summary

| Behavior | Rule |
|---|---|
| Scoring choice | Balances immediate points against dice remaining |
| Banking | Uses risk-adjusted value |
| Risk tolerance | Dynamic |
| Hot dice | Contextual |
| Endgame awareness | Strong |
| Mistakes | Very rare |

## Risk-Adjusted Roll Decision

Level 3 evaluates whether rolling again is worth the risk.

Use approximate farkle risk:

```js
const farkleRisk = {
  6: 0.023,
  5: 0.077,
  4: 0.157,
  3: 0.278,
  2: 0.444,
  1: 0.667
};
```

Estimate minimum useful gain from rolling:

```js
const expectedGain = {
  6: 450,
  5: 350,
  4: 275,
  3: 200,
  2: 125,
  1: 75
};
```

Simple roll value formula:

```text
rollValue = expectedGain[diceRemaining] - farkleRisk[diceRemaining] * turnScore
```

If `rollValue > 0`, rolling is attractive.
If `rollValue <= 0`, banking is attractive.

## Keep Dice Logic

Level 3 evaluates each legal keep option.

Score each option:

```text
optionValue = immediateScore
            + diceRemainingBonus
            - oneDiePenalty
            + hotDiceBonus
```

Suggested values:

```text
diceRemainingBonus = diceRemaining * 40
oneDiePenalty = 150 if diceRemaining == 1
hotDiceBonus = 250 if diceRemaining == 6 after scoring all dice
```

However, immediate score still matters most.

## Bank or Roll Logic

```text
If reaching target score: bank.
If rolling has positive rollValue: roll.
If behind leader by 1500+ points: roll slightly more often.
If ahead by 1500+ points: bank slightly earlier.
```

Suggested pressure adjustment:

```text
If behind by 1500+: rollValue += 150
If behind by 3000+: rollValue += 300
If ahead by 1500+: rollValue -= 150
If ahead by 3000+: rollValue -= 300
```

## Endgame Logic

Level 3 should understand that once a player is near the target, banking may force opponents to respond.

```text
If totalAfterBank >= targetScore:
    bank immediately

If opponent has already reached targetScore:
    roll until totalAfterBank > opponentScore, then bank
```

## Pseudocode

```js
function decideLevel3(state) {
  const scoringOptions = getScoringOptions(state.dice);
  const keep = chooseRiskAdjustedKeep(scoringOptions, state);

  const futureDice = normalizeHotDice(getDiceRemainingAfterKeep(state.dice, keep));
  const turnScoreAfterKeep = state.turnScore + score(keep);
  const totalAfterBank = state.bankedScore + turnScoreAfterKeep;

  const leaderScore = Math.max(...state.players.map(p => p.score));
  const scoreDelta = state.bankedScore - leaderScore;

  if (totalAfterBank >= state.targetScore) {
    return { action: "BANK", keepDice: keep, reason: "Reached target score", confidence: 1.0 };
  }

  if (state.opponentFinalScore && totalAfterBank > state.opponentFinalScore) {
    return { action: "BANK", keepDice: keep, reason: "Beat final-round target", confidence: 1.0 };
  }

  let rollValue = expectedGain[futureDice] - farkleRisk[futureDice] * turnScoreAfterKeep;

  if (scoreDelta < -3000) rollValue += 300;
  else if (scoreDelta < -1500) rollValue += 150;

  if (scoreDelta > 3000) rollValue -= 300;
  else if (scoreDelta > 1500) rollValue -= 150;

  if (rollValue > 0) {
    return { action: "ROLL", keepDice: keep, reason: "Positive risk-adjusted roll value", confidence: 0.75 };
  }

  return { action: "BANK", keepDice: keep, reason: "Risk outweighs expected gain", confidence: 0.8 };
}
```

---

# Level 4 — Ruthless Dice Gremlin

## Personality

The Ruthless Dice Gremlin plays to win. It is not reckless. It pressures opponents, protects leads, and changes behavior near the endgame.

This AI should feel unfair to casual players, but not magical.

## Behavior Summary

| Behavior | Rule |
|---|---|
| Scoring choice | Evaluates all legal keeps by future value |
| Banking | Uses dynamic EV thresholds |
| Risk tolerance | Score-state dependent |
| Hot dice | Strong contextual handling |
| Endgame awareness | Ruthless |
| Mistakes | None intentional |

## Strategic Goals

Level 4 uses a priority stack:

1. **Win immediately if possible.**
2. **Beat final-round target if opponent has triggered endgame.**
3. **Bank a score that creates major pressure.**
4. **Avoid exposing a lead to unnecessary risk.**
5. **Take high-risk rolls only when behind or when expected value is clearly positive.**

## Advanced Keep Dice Logic

Level 4 evaluates every legal scoring keep and estimates the future position.

Option score:

```text
optionValue = immediateScore
            + futureDiceValue
            + hotDiceValue
            + endgameValue
            - riskExposurePenalty
```

Suggested values:

```text
futureDiceValue = expectedGain[diceRemaining] * 0.60
hotDiceValue = 350 if hot dice
riskExposurePenalty = farkleRisk[diceRemaining] * newTurnScore * 0.50
```

Endgame value:

```text
If totalAfterBank >= targetScore: very large bonus
If totalAfterBank passes current leader: medium bonus
If totalAfterBank enters striking range of target: small bonus
```

Suggested endgame bonuses:

```text
Reach target score: +10000
Pass final-round opponent score: +10000
Pass current leader: +500
Reach within 1000 of target: +300
Reach within 500 of target: +500
```

## Roll Decision Formula

Use this formula:

```text
rollValue = expectedGain[diceRemaining]
          - farkleRisk[diceRemaining] * turnScore
          + pressureModifier
          + endgameModifier
          - leadProtectionModifier
```

### Pressure Modifier

```text
Behind leader by 3000+: +400
Behind leader by 2000+: +250
Behind leader by 1000+: +125
```

### Lead Protection Modifier

```text
Ahead by 1000+: -100
Ahead by 2000+: -250
Ahead by 3000+: -450
```

### Endgame Modifier

```text
If opponent has triggered final round and AI is still behind: +500
If rolling can realistically reach target this turn: +250
If banking creates targetScore - 500 or better: -150
If banking already forces opponents into chase mode: -300
```

## Bank Pressure Logic

Level 4 banks not only when risk is bad, but when banking creates a painful target.

Good bank scores:

```text
1000+ early game: strong bank
750+ mid game: acceptable bank if dice remaining <= 3
Any score that reaches 9000+ when target is 10000: strong bank
Any score that wins: mandatory bank
```

## Endgame Logic

Level 4 should be ruthless near the end.

### If AI Can Win

```text
If bankedScore + turnScore >= targetScore:
    bank immediately
```

No showboating. No goblin nonsense.

### If Opponent Triggered Final Round

```text
If totalAfterBank > opponentFinalScore:
    bank immediately
Else:
    roll if any reasonable chance remains
```

### If AI Is Close To Target

```text
If totalAfterBank >= targetScore - 500:
    bank if rollValue is not strongly positive
```

### If AI Is Far Behind

```text
If behind by 3000+ and fewer than 3 rounds likely remain:
    accept negative rollValue down to -250
```

This is controlled desperation, not random stupidity.

## Pseudocode

```js
function decideLevel4(state) {
  const scoringOptions = getScoringOptions(state.dice);
  const keep = chooseBestEVKeep(scoringOptions, state);

  const futureDice = normalizeHotDice(getDiceRemainingAfterKeep(state.dice, keep));
  const turnScoreAfterKeep = state.turnScore + score(keep);
  const totalAfterBank = state.bankedScore + turnScoreAfterKeep;

  const scores = state.players.map(p => p.score);
  const leaderScore = Math.max(...scores);
  const scoreDelta = state.bankedScore - leaderScore;

  if (totalAfterBank >= state.targetScore) {
    return { action: "BANK", keepDice: keep, reason: "Win immediately", confidence: 1.0 };
  }

  if (state.opponentFinalScore && totalAfterBank > state.opponentFinalScore) {
    return { action: "BANK", keepDice: keep, reason: "Beat final-round target", confidence: 1.0 };
  }

  let pressureModifier = 0;
  if (scoreDelta < -3000) pressureModifier += 400;
  else if (scoreDelta < -2000) pressureModifier += 250;
  else if (scoreDelta < -1000) pressureModifier += 125;

  let leadProtectionModifier = 0;
  if (scoreDelta > 3000) leadProtectionModifier += 450;
  else if (scoreDelta > 2000) leadProtectionModifier += 250;
  else if (scoreDelta > 1000) leadProtectionModifier += 100;

  let endgameModifier = 0;
  if (state.opponentFinalScore && totalAfterBank <= state.opponentFinalScore) {
    endgameModifier += 500;
  }

  if (totalAfterBank >= state.targetScore - 500) {
    endgameModifier -= 150;
  }

  if (totalAfterBank >= state.targetScore - 1000) {
    endgameModifier -= 100;
  }

  let rollValue = expectedGain[futureDice]
    - farkleRisk[futureDice] * turnScoreAfterKeep
    + pressureModifier
    + endgameModifier
    - leadProtectionModifier;

  const desperationAllowed = scoreDelta < -3000;
  const rollThreshold = desperationAllowed ? -250 : 0;

  if (rollValue > rollThreshold) {
    return {
      action: "ROLL",
      keepDice: keep,
      reason: "Level 4 EV favors rolling",
      confidence: clamp(0.5 + rollValue / 1000, 0.55, 0.95)
    };
  }

  return {
    action: "BANK",
    keepDice: keep,
    reason: "Level 4 protects value",
    confidence: clamp(0.5 + Math.abs(rollValue) / 1000, 0.55, 0.95)
  };
}
```

---

# Difficulty Comparison Table

| Feature | Level 1 | Level 2 | Level 3 | Level 4 |
|---|---|---|---|---|
| Chooses legal scoring dice | Yes | Yes | Yes | Yes |
| Sometimes makes dumb choices | Yes | Rarely | No | No |
| Uses banking thresholds | Loose/random | Yes | Dynamic | Dynamic EV |
| Uses farkle probability | No | No | Yes | Yes |
| Understands leader pressure | No | Minimal | Yes | Yes |
| Understands final round | Barely | Basic | Strong | Ruthless |
| Rolls hot dice | Often | Sometimes | Contextual | Contextual |
| Protects big lead | No | Slightly | Yes | Strongly |
| Chases when behind | Randomly | Slightly | Yes | Aggressively but rationally |

---

# Recommended Implementation Structure

Use one shared evaluator and difficulty-specific policies.

```js
function decideFarkleAI(state, difficulty) {
  const scoringOptions = getScoringOptions(state.dice);

  switch (difficulty) {
    case 1:
      return decideLevel1(state, scoringOptions);
    case 2:
      return decideLevel2(state, scoringOptions);
    case 3:
      return decideLevel3(state, scoringOptions);
    case 4:
      return decideLevel4(state, scoringOptions);
    default:
      return decideLevel2(state, scoringOptions);
  }
}
```

## Shared Helper Functions

Recommended helpers:

```js
getScoringOptions(dice)
score(option)
getDiceRemainingAfterKeep(dice, keep)
normalizeHotDice(diceRemaining)
chooseGoblinKeep(options)
chooseBestKitchenTableKeep(options)
chooseRiskAdjustedKeep(options, state)
chooseBestEVKeep(options, state)
clamp(value, min, max)
```

---

# Legal Scoring Option Generation

The most important engine piece is `getScoringOptions(dice)`.

It should return every valid scoring subset the player may keep.

Example dice:

```text
[1, 1, 1, 5, 2, 6]
```

Possible scoring keeps might include:

```text
[1] = 100
[1, 1, 1] = 1000
[5] = 50
[1, 1, 1, 5] = 1050
```

Do not force the AI to keep every scoring die. Sometimes keeping fewer dice is strategically better.

Example:

```text
Dice: [1, 5, 2, 3, 4, 6]
```

The AI could keep:

```text
[1] = 100, roll 5 dice
[5] = 50, roll 5 dice
[1, 5] = 150, roll 4 dice
[1,2,3,4,5,6] = 1500, hot dice
```

If the straight is enabled, Level 3 and Level 4 almost always take it.

---

# Tuning Values

Start with these values and adjust after playtesting.

```js
const farkleRisk = {
  6: 0.023,
  5: 0.077,
  4: 0.157,
  3: 0.278,
  2: 0.444,
  1: 0.667
};

const expectedGain = {
  6: 450,
  5: 350,
  4: 275,
  3: 200,
  2: 125,
  1: 75
};
```

Expected gain values are intentionally conservative. If the AI feels too timid, increase them. If the AI feels like a casino goblin with a math degree, decrease them.

---

# Suggested AI Names

| Difficulty | Name | Flavor |
|---|---|---|
| 1 | Lucky Goblin | Chaotic beginner |
| 2 | Aunt Linda | Normal kitchen-table player |
| 3 | Dice Shark | Strong player |
| 4 | Ruthless Dice Gremlin | Mean but fair |

Alternative names:

| Difficulty | Safer Name | Flavor |
|---|---|---|
| 1 | Rookie Roller | Beginner |
| 2 | Table Regular | Casual competent |
| 3 | Sharp Roller | Strong |
| 4 | Farkle Master | Expert |

---

# Recommended Defaults

For SogoTable, use these defaults:

```js
const FARKLE_AI_DEFAULTS = {
  targetScore: 10000,
  level1Randomness: 0.30,
  level2Randomness: 0.08,
  level3Randomness: 0.03,
  level4Randomness: 0.00,
  allowIntentionalMistakes: true,
  useEndgameAwarenessFromLevel: 2
};
```

Level 4 should still have no visible cheating. It only uses public information.

---

# Debug Logging

For development, every AI decision should log:

```js
{
  difficulty,
  dice,
  keepDice,
  keepScore,
  turnScoreBefore,
  turnScoreAfter,
  diceRemaining,
  farkleRisk,
  rollValue,
  action,
  reason
}
```

This makes tuning much easier.

Example:

```text
AI L3 Dice Shark kept [1,1,1] for 1000.
Turn score now 1000, dice remaining 3.
Roll value = -78.
Decision: BANK. Risk outweighs expected gain.
```

---

# Final Recommendation

Implement Level 2 first.

Then add Level 1 by injecting randomness and bad decisions.

Then add Level 3 by adding farkle-risk logic.

Then add Level 4 by adding score pressure, final-round logic, and stronger option evaluation.

Do not build four separate AI engines. Build one scoring engine and four policy layers.

That keeps the code clean and prevents the usual AI spaghetti monster from crawling out of the dice cup.
