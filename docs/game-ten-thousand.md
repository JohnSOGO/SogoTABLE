# 10,000

10,000 is the sixth ready SogoTable game and the first hosted dice game with a flexible guest list.

## Shape

- One host player, plus optional guests.
- Six dice.
- Goal score: 10,000.
- Hosted Worker room starts immediately after creation; the lobby shows
  `Invite Remote Opponent` and `Invite Bot`, and it accepts any number of
  additional guests.
- The browser renders animated CSS 3D dice, but the Worker owns final dice
  values, scoring validation, banking, farkles, and completion.

## Rules

- Roll six dice to start a turn.
- Select only scoring dice.
- Bank selected turn points, or reroll the remaining dice to press your luck.
- If all six dice have scored, the player has hot dice and may reroll all six
  while keeping the current turn score.
- A roll with no scoring dice is a farkle: the turn score is lost, farkle count
  increments, the dice stay on their final rolled values, the dice turn red,
  and the player must acknowledge a popup or the in-tray OK button before
  continuing.
- The standings table publishes a canonical `finish_state` for each seat. The
  UI renders that state as `Status`, green check, red X, or both for an
  acknowledged farkle.
- After all seats have banked or farkled and acknowledged, the round is marked
  complete and the next round starts when a player rolls again.
- Tapping scoring dice updates the visible `This turn` score immediately; tapping
  them off subtracts their value again before the move is committed.
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
- `{ "type": "ack_farkle" }`

The browser may animate intermediate tumbling faces, but it must settle on the
Worker-provided dice values.
