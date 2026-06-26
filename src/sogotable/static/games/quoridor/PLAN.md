# Quoridor Implementation Plan

## Goal

Add Quoridor as a SogoTable hosted game using the existing lobby, room,
invite, local opponent, and bot flows.

## Rules Baseline

- Two players on a 9x9 board.
- Player tokens start centered on opposite edges.
- A turn is either one pawn move or one wall placement.
- Each player starts with 10 walls.
- Pawns move orthogonally unless blocked by a wall.
- If the opponent is adjacent, the player may jump over them when the landing
  cell is open.
- If the direct jump is blocked, the player may move diagonally around the
  opponent where that side step is open.
- Walls occupy two adjacent gaps and cannot overlap or cross another wall.
- A wall is illegal if it removes every path to either player's goal row.
- First player to reach their opposite side wins.

## Stage 1: Module Surface

- Create `src/sogotable/static/games/Quoridor/`.
- Add `PLAN.md`, `README.md`, `manifest.js`, and `index.js`.
- Keep the module metadata separate from the main shell.

## Stage 2: Worker Rules

- Add Quoridor to the hosted game registry with a stable opaque game id.
- Add canonical aliases: `quoridor`.
- Add Worker-owned game state:
  - board size
  - pawn positions
  - wall list
  - wall counts
  - legal pawn moves
  - legal wall placements
  - last move
- Add move handling for:
  - `{ action: { type: "move_pawn", row, col } }`
  - `{ action: { type: "place_wall", orientation, row, col } }`
- Keep validation authoritative in the Worker.

## Stage 3: Bot Play

- Add bot move selection through the same normal room move pipeline.
- First bot strategy:
  - win immediately if possible
  - otherwise move along a shortest path
  - occasionally place a legal wall that lengthens the opponent path

## Stage 4: Browser UI

- Add a main-shell Quoridor renderer.
- Layout follows Dots and Boxes style:
  - score/status strip
  - grid with squares, wall slots, and intersections
  - compact mobile-friendly controls
- Use each player's emoji as their pawn token.
- Let the current player choose pawn mode, horizontal wall mode, or vertical
  wall mode.
- Highlight legal pawn destinations and legal wall slots.

## Stage 5: Tests and Verification

- Add Worker tests for room creation, pawn moves, wall placement, blocked paths,
  jump moves, win detection, and bot response.
- Run `node --check` for changed browser files.
- Run `npm run test:worker`.
- Smoke the browser UI enough to ensure the board renders and a first move can
  be sent through the existing room shell.
