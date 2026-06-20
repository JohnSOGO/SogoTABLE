# Battleship Implementation Plan

## Goals

- Add Battleship as a ready SogoTable game.
- Reuse the existing player -> game -> room architecture.
- Support local two-player, remote invite play, and bot opponent rooms.
- Keep phases explicit: setup, playing, complete.
- Let the player view offence or defence manually, while defaulting to the
  useful view for the current phase and turn.

## Worker

- Add hosted game metadata with opaque id `9c2f7a81d4e6`.
- Add Battleship game state with a 10x10 board and the standard fleet:
  Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2.
- Accept `/api/room/move` actions:
  - `auto_place`
  - `place_fleet`
  - `attack`
- Validate ship bounds, overlap, attack turn, duplicate shots, hit/miss, sunk
  ships, and game end.
- Keep bots as normal room seats: auto-place bot fleets and use random legal
  attacks through the same move pipeline.

## Browser

- Add Battleship to fallback metadata.
- Render setup controls:
  - ship selector
  - horizontal/vertical toggle
  - tap-to-place board
  - auto-place shortcut
  - ready fleet button
- Render play controls:
  - Auto, Offence, Defence segmented view
  - offence board from local shots
  - defence board from own ships and opponent shots
- Keep game screen, reset, exit, invite, local opponent, and room WebSocket
  behavior in the shared shell.

## Verification

- Worker tests for game registry, setup, invalid placement, attack, duplicate
  attack, winner, and bot completion path.
- Browser smoke test for setup controls and offence/defence rendering.
- Public deploy and live API smoke.

