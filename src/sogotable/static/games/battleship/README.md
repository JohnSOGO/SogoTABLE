# Battleship Module

Battleship is a hosted SogoTable game that uses the normal selected-game lobby,
room creation, local opponent, remote invite, bot opponent, reset, exit, and
room WebSocket shell.

The Worker owns setup validation, ship placement, attack legality, hit/miss
resolution, sunk ships, turn order, and final result. The browser renders the
prepared room snapshot and sends setup or attack intent through `/api/room/move`.

## Phases

- `setup`: each player places the five-ship fleet. The browser supports manual
  tap-to-place drafting and an `Auto Place` shortcut.
- `playing`: players alternate attacks. The UI auto-switches to offence on the
  local player's turn and defence while waiting, with manual view controls.
- `complete`: the game ends when one fleet is fully sunk.

