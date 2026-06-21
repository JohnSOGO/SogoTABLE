# Ten Thousand / Farkle AI Policy

This note adapts the shared SogoTable bot ladder to 10,000 / Farkle.

## Relationship to the Global Bot Doctrine

The recruitable public names come from `docs/ai-difficulty.md`:

- Sprout - Novice
- Buddy - Casual
- Cipher - Strategist
- Overlord - Master

The shared bot behavior contract lives in `docs/bots/behavior.md`. This note is
the 10,000-specific policy layer that says how those four ladder tiers should
feel when they are playing Farkle.

Do not invent new public bot names here. Keep the ladder stable and vary only
the policy.

## 10,000 Bot Responsibilities

10,000 bots should:

- score legal dice through the Worker-owned rules path
- decide whether to bank or press based on the shared ladder tier
- preserve the final busted roll on a farkle until the player acknowledges it
- keep `farkles` accurate, including the bot-opening-bust regression path
- respect the same room flow as humans

10,000 bots should not:

- invent hidden rolls
- bypass the worker state machine
- mutate their own state in the browser
- double-count farkles

## Tier Mapping

Use the shared names and flavor them locally by policy:

### Sprout - Novice

- Chooses a legal keep, usually the obvious one.
- Presses too often and banks late.
- Is allowed to be imperfect.

### Buddy - Casual

- Uses simple score thresholds.
- Recognizes when a turn is safe enough to bank.
- Does not need deep probability math.

### Cipher - Strategist

- Uses risk-aware keep selection.
- Balances turn score against farkle risk.
- Banks when the roll value turns negative.

### Overlord - Master

- Uses the strongest fair 10,000 policy.
- Evaluates pressure, expected value, and endgame context.
- Protects leads and finishes games cleanly.

## Core Decision Shape

All ladder tiers should share the same decision structure:

1. Pick legal scoring dice.
2. Estimate whether continuing is worth the risk.
3. Bank or press.
4. If a farkle happens, let the Worker preserve the busted roll and count it
   once.

That keeps the behavior testable and keeps the browser dumb.

## Farkle Rule

If a bot farkles:

- the final dice stay visible
- the dice turn red in the UI
- the turn is acknowledged once
- `farkles` increments once
- the bot does not get a special recovery path

The rule is the same as for humans. Only the timing differs because the bot
round can resolve inside the Worker turn loop.

## Implementation Note

The existing 10,000 bot-farkle fix in the Worker should stay the source of
truth for count/ack handling. This document should describe the policy and
behavior expectations, not restate low-level reducer code.

