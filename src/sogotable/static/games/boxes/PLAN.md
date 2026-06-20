# Dots And Boxes Implementation Plan

## Goal

Add Dots and Boxes as a SogoTable game module with the same player-facing modes
as Super Tic Tac Toe:

- two-player local hot-seat
- hosted remote room play
- hosted vs-bot play

The local module lives here first:

```text
src/sogotable/static/games/boxes/
```

## Product Shape

User-facing name:

- `Dots and Boxes`

Stable module id:

- `boxes`

Timing:

- `turnBased`

Default table:

- 4x4 boxes, using a 5x5 dot grid

Core rule:

- A player claims one unclaimed edge per move.
- Completing one or more boxes awards those boxes and grants another turn.
- If no box is completed, turn passes to the other player.
- The game ends when all edges are claimed.
- Highest box count wins; equal scores draw.

## Directory Contract

```text
src/sogotable/static/games/boxes/
  PLAN.md
  README.md
  index.html
  index.js
  manifest.js
  state.js
  rules.js
  render.js
  app.js
  styles.css
```

Ownership:

- `manifest.js` declares metadata and capabilities.
- `state.js` creates and normalizes deterministic game state.
- `rules.js` owns legal moves, scoring, turn order, bot move choice, and game
  completion.
- `render.js` converts a public game snapshot into DOM.
- `app.js` is only the standalone local lab shell.
- Hosted SogoTable integration should reuse `state.js` and `rules.js` rather
  than reimplementing Dots and Boxes inside the main UI.

## Mode Parity Plan

### 1. Local Hot-Seat

Status:

- Local module implemented in this folder.

Behavior:

- One browser controls both seats.
- The current player can claim any open edge.
- Capturing a box keeps the turn.
- `New Game` resets state without using the hosted API.

Validation:

- Invalid duplicate edge claims are rejected by rules code.
- Game-over state is derived from claimed edge count.

### 2. Remote Hosted Room

Status:

- Planned Worker integration.

Worker changes:

- Add an opaque production game id for Dots and Boxes.
- Add the game to the hosted `/api/games` registry as unavailable until remote
  move handling is complete, then mark ready.
- Add `createBoxesGameState`, `makeBoxesMove`, `boxesLegalMoves`, and
  `chooseBoxesBotMove` as a clearly named rules section or shared imported
  module.
- Route `/api/room/move` payloads for this game through edge ids instead of
  Super Tic Tac Toe board/cell fields.
- Preserve room `revision` and `game_epoch` freshness rules.
- Keep remote joins, invites, local-opponent joins, exits, reset/play-again,
  room WebSockets, and EventHub snapshots on the existing two-player room path.

Browser shell changes:

- Add the game definition to the fallback registry only as startup resilience.
- Render the Boxes board from the room `game` snapshot.
- Send move payloads with `{ line_id }`.
- Keep game-specific board rendering out of generic lobby code.

Tests:

- Worker test for game creation.
- Worker test for legal edge claim.
- Worker test that duplicate edge claims fail.
- Worker test that box capture keeps the turn.
- Worker test that non-capturing move passes the turn.
- Worker test for completed game scoring and draw.
- Room WebSocket test that a Boxes move broadcasts a fresh room snapshot.

### 3. Vs AI

Status:

- Local module includes a deterministic bot move selector.
- Hosted bot integration is planned with the remote Worker step.

Behavior:

- Bots remain normal room seats with `kind: "bot"`.
- Bot moves must use the same validation path as human moves.
- First strategy:
  - take a capturing edge when available
  - prefer moves that do not create a three-sided box for the opponent
  - otherwise choose a stable legal fallback

Tests:

- Bot list includes available personas for Dots and Boxes after the hosted game
  id is registered.
- `POST /api/room/join-bot` seats a bot opponent.
- Bot move is applied through the hosted Boxes move path.
- Bot game stats count for humans and exclude bot leaderboard rows.

## Sibling-Path Review

In scope for the local module:

- two-player local hot-seat
- vs-bot local harness
- pure rule validation
- board rendering

Intentionally out of scope for this first folder pass:

- hosted remote availability in the public game list
- Worker registry and room move routing
- production bot seating through `/api/room/join-bot`
- stats/ELO/high-score rows for the new game

Reason:

- The current architecture requires hosted multiplayer truth to live in the
  Worker/Room Durable Object path. This folder creates the portable rule and
  render surface first so the hosted integration can be done without mixing a
  third game's logic into the existing Super Tic Tac Toe paths.

## Promotion Checklist

- Add opaque hosted game id.
- Add hosted game metadata.
- Add Worker Boxes state/rules/move handling.
- Add Worker bot move selection.
- Add Worker tests.
- Add main-shell board renderer dispatch for `boxes`.
- Add docs updates to `docs/project-memory.md`, `docs/state-machine.md`,
  `docs/architecture.md`, and `docs/api-contract.md`.
- Run `npm run test:worker`.
- Run `node --check` for changed browser files.
- Preview the local module on mobile and desktop.

