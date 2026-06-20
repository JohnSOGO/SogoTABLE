# 10,000

10,000 is the sixth ready SogoTable game and the first hosted solo game.

## Shape

- One player.
- Six dice.
- Goal score: 10,000.
- Hosted Worker room starts immediately after creation; there is no opponent,
  invite, or bot seat.
- The browser renders animated CSS 3D dice, but the Worker owns final dice
  values, scoring validation, banking, farkles, and completion.

## Rules

- Roll six dice to start a turn.
- Select only scoring dice.
- Bank selected turn points, or reroll the remaining dice to press your luck.
- If all six dice have scored, the player has hot dice and may reroll all six
  while keeping the current turn score.
- A roll with no scoring dice is a farkle: the turn score is lost, farkle count
  increments, and the player may start a new turn.
- Banking brings the total score closer to 10,000. Reaching 10,000 completes the
  game and records a high score.

## Scoring

- Single 1: 100.
- Single 5: 50.
- Three 1s: 1000.
- Three 2s through 6s: face value times 100.
- Straight 1-6: 1500.
- Three pairs: 1500.

## Runtime Ownership

Moves use `/api/room/move` with action objects:

- `{ "type": "roll" }`
- `{ "type": "select", "dice_ids": ["d1", "d4"] }`
- `{ "type": "reroll" }`
- `{ "type": "bank" }`

The browser may animate intermediate tumbling faces, but it must settle on the
Worker-provided dice values.
