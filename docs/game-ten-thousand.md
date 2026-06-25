# 10,000

10,000 is the sixth ready SogoTable game and the first hosted dice game with a flexible guest list.

## Shape

- One host player, plus optional guests.
- Six dice.
- Goal score: 10,000.
- Hosted Worker room starts immediately after creation; the lobby shows
  `Invite Remote Opponent` and `Invite Bot`, and it accepts any number of
  additional guests.
- The lobby also lets the **host pick the opening "get on the board" bar**
  (`None`/250/500/750/1000, default 500) before starting. It is sent on
  `/api/room/start` as `opening_minimum`, stored as `game.opening_base`, and
  carried into a reset so the table keeps its chosen rules.
- The browser renders animated CSS 3D dice, but the Worker owns final dice
  values, scoring validation, banking, farkles, and completion.

## Rules

- Roll six dice to start a turn.
- Tap scoring dice to keep them — they turn green and the kept score is implied
  (the visible `This turn` updates live). There is no separate "score" press.
- **Two action buttons, plus the Red X.** `Press` scores the kept (green) dice
  and re-rolls the rest in one move; `Bank` scores the kept dice and banks the
  turn. The Red X declares a farkle. (Press your luck or bank — the score is
  baked into whichever you choose.)
- If all six dice have scored, the player has hot dice: `Press` re-rolls a fresh
  six keeping the turn score, or `Bank` banks it. After a straight (all six kept
  with nothing left to tap) `Press`/`Bank` act on an empty selection.
- **Press for a straight:** on a roll with all six dice live, selecting exactly
  five dice that show five different faces arms a straight bet — the five kept
  dice turn yellow (not scoring, but not an invalid red keep) and the `Press`
  button becomes a re-roll of the lone sixth die. It is all-or-nothing: landing
  the missing face completes `1-2-3-4-5-6` for 1,500 and hot dice; any other
  result busts the turn exactly like a farkle. This is the only way to set aside
  non-scoring dice, allowed only because the bet's own downside is the bust.
- A roll with no scoring dice is a farkle: the turn score is lost, farkle count
  increments, the dice stay on their final rolled values, the dice turn red,
  and the player must acknowledge a popup or the in-tray OK button before
  continuing.
- The standings table publishes a canonical `finish_state` for each seat. The
  UI renders that state as `Status`, green check, red X, or both for an
  acknowledged farkle.
- The top status banner is just the round number. The lower tray message copy
  stays empty so the actions and dice are the focus.
- After all seats have banked or farkled and acknowledged, the round is marked
  complete and the next round starts when a player rolls again.
- Tapping scoring dice updates the visible `This turn` score immediately; tapping
  them off subtracts their value again before the move is committed. The browser
  preserves an uncommitted dice selection across parallel-play snapshots from
  other seats, keyed by room, mark, and roll count, then clears it when the
  selection is committed, banked, or farkled.
- Banking brings the total score closer to 10,000. Reaching 10,000 completes the
  game and records a high score.
- On phones, the six dice stay 3-across and the action buttons stay on one row;
  the UI shrinks controls to fit instead of reflowing to fewer columns.
- Game Options can switch action buttons from emoji labels to short word labels
  (`Roll`, `Bust`, `Press`, `Bank`) as a per-device preference.

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
- `{ "type": "score_and_press", "dice_ids": ["d1", "d4"] }` — the `Press` button:
  score the kept dice, then re-roll the rest (empty `dice_ids` presses hot dice).
- `{ "type": "score_and_bank", "dice_ids": ["d1", "d4"] }` — the `Bank` button:
  score the kept dice, then bank (empty `dice_ids` banks the hot-dice total).
- `{ "type": "straight_attempt", "dice_ids": ["d1", "d2", "d3", "d4", "d5"] }` —
  keep five distinct faces, re-roll the sixth, resolve straight-or-bust.
- `{ "type": "declare_farkle" }`
- `{ "type": "ack_farkle" }`

The primitive `select`, `reroll`, and `bank` actions remain on the server (bots
and tests use them); the UI now sends the combined `score_and_*` moves so each is
atomic — if either half is invalid the whole move is rejected and nothing saves.

The browser may animate intermediate tumbling faces, but it must settle on the
Worker-provided dice values.

Browser sound effects for 10,000 are local-seat only. Parallel room snapshots
from another player must not play roll, score, bank, or farkle sounds on this
device.
