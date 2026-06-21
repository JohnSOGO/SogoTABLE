# Battleship

Battleship is the fourth ready SogoTable game.

## Shape

- Two players.
- Turn-based after setup.
- Same selected-game lobby, room, local opponent, remote invite, bot opponent,
  reset, exit, and room WebSocket flow as the other ready two-player games.
- Default board is 10x10 cells.
- Fleet: Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2.

## Phases

- `setup`: each player places ships. The browser supports manual tap-to-place
  drafting and an `Auto Place` shortcut. New ships start horizontal; tapping an
  already placed selected ship again rotates it vertical around the tapped cell
  and coerces the placement inside the board.
- `playing`: players alternate attacks.
- `complete`: one fleet is fully sunk.

## Rules

- Ships may be horizontal or vertical.
- Ships must stay inside the board and cannot overlap.
- Players may attack one untried enemy cell on their turn.
- Attacks record hit or miss.
- After an attack, the browser briefly holds the offence view and shows a hit
  explosion or miss splash on the attacked cell.
- In `Auto` view, the browser holds offence through the local attack reveal for
  two seconds, then switches to the opponent-colored defence/turn view. Incoming
  attacks show a one-second radar scan on defence, then reveal the hit/miss
  result for two seconds before returning to offence.
- The attacked cell gets an opponent-colored reveal outline while the hit/miss
  animation is active so the visual result is visible even when sound is the
  first cue.
- The game ends when every ship cell in one fleet has been hit.

## Runtime Ownership

The hosted Worker owns fleet validation, attack validation, hit/miss resolution,
turn order, bot moves, and final result. The browser renders the room snapshot
and sends setup or attack intent through `/api/room/move`.

The game screen defaults to defence during setup, offence on the local player's
turn, and defence while waiting. Players can manually switch between `Auto`,
`Offence`, and `Defence`.

Overlord uses stronger Battleship logic than the basic bots: Monte Carlo
fleet placement scored against a generic attack heat map, and probability-based
attacks with parity, information value, and hit-line finishing. The shared bot
behavior contract lives in `docs/bots/behavior.md`.
