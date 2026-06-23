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
- After an attack, the browser shows a hit explosion or miss splash only after
  the authoritative Worker response or room snapshot reports the result.
- In `Auto` view, the browser holds offence through the local attack reveal for
  two seconds, then switches to the player's own-fleet defence/turn view. Incoming
  attacks switch to defence immediately, wait 250ms for the defending board to
  settle, show a one-second radar scan, then reveal the hit/miss result for two
  seconds before returning to offence.
- The attacked cell gets an opponent-colored reveal outline while the hit/miss
  animation is active so the visual result is visible even when sound is the
  first cue.
- Manual `Defence` view stays on the player's own fleet and shows incoming
  attack target/result reveals there.
- Sunk enemy ships are revealed to the attacker after the authoritative snapshot
  confirms the sink, so the browser can mark those ship cells and show the sunk
  ship message while keeping the rest of the enemy fleet hidden.
- The game ends when every ship cell in one fleet has been hit.

## Runtime Ownership

The hosted Worker owns fleet validation, attack validation, hit/miss resolution,
turn order, bot moves, and final result. The browser renders the room snapshot
and sends setup or attack intent through `/api/room/move`.

Battleship room snapshots are viewer-projected at the Worker response boundary.
A player receives their own fleet and public shot results, but does not receive
opponent ship coordinates before the room is complete except for opponent ships
that player has already sunk. Completed rooms reveal both fleets for review. The
room WebSocket includes `player_id` so each connected browser receives its own
legal projection.

The game screen defaults to defence during setup, offence on the local player's
turn, and defence while waiting. Players can manually switch between `Auto`,
`Offence`, and `Defence`.

Battleship viewer state is tied to the device-selected player for both human
opponents and bot games. This keeps the room WebSocket projection and Auto view
on the local player's own fleet when an incoming attack resolves.

Overlord uses stronger Battleship logic than the basic bots: Monte Carlo
fleet placement scored against a generic attack heat map, and probability-based
attacks with parity, information value, and hit-line finishing. The shared bot
behavior contract lives in `docs/bots/behavior.md`.
