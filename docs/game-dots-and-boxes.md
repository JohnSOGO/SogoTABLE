# Dots and Boxes

Dots and Boxes is the third ready SogoTable game.

## Shape

- Two players.
- Turn-based.
- Same selected-game lobby, room, local opponent, remote invite, bot opponent,
  reset, exit, and room WebSocket flow as the other ready two-player games.
- Default board is 5x8 boxes, represented by a 6x9 dot grid.

## Rules

- A move claims one open edge.
- Edge ids are `h-row-col` for horizontal edges and `v-row-col` for vertical
  edges.
- Completing a box awards that box to the current player and keeps the turn.
- A non-capturing line claim passes the turn.
- The game ends when all lines are claimed.
- Highest box count wins; equal scores draw.

## Runtime Ownership

The hosted Worker owns line validation, box capture, turn order, scoring, bot
move selection, and final result. The browser renders the room snapshot and
sends only player intent through `/api/room/move`.

Bots are normal room seats and play through the same hosted move pipeline as
human players.
Hosted bot auto-play scales to the number of remaining legal edges so
bot-vs-bot and long capture chains can finish.
