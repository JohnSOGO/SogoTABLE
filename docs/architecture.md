# Architecture

SogoGAMES starts as a dependency-light Python web app with a vanilla browser frontend.

## Chosen Stack

- Python standard library `http.server` for local development.
- Python game engine modules under `src/sogogames/`.
- Vanilla JavaScript for the browser UI.
- `pytest` for game-rule tests.

The stack is intentionally small. The first milestone needs a reliable playable loop, not a framework commitment.

## Folder Layout

```text
SogoGames/
  README.md
  AGENTS.md
  docs/
  src/
    sogogames/
      super_tic_tac_toe.py
      server.py
      static/
  tests/
```

## Data Flow

```text
Browser UI -> HTTP JSON API -> Room Store -> Game Engine -> JSON State -> Browser UI
```

The rules engine owns legal moves and win/draw state. The UI renders state and sends player actions. The server translates HTTP requests into engine operations.

## Game Engine Separation

The Super Tic Tac Toe engine has no HTML, CSS, browser storage, sockets, or HTTP concerns. It accepts moves and returns state.

This keeps the hardest logic testable and allows future transports to reuse the same rules.

## Lobby And Session Approach

Phase 1 uses in-memory rooms:

- room code
- selected game
- player list
- current game state

Browser local storage keeps player display identity. The room disappears when the server restarts.

## HTTP Endpoints

- `POST /api/room/create`: create an in-memory room and seat the selected player as `X`.
- `POST /api/room/join`: join an existing room with the selected player as `O` when available.
- `GET /api/room?code=ABCD`: fetch the current room and game state.
- `POST /api/room/move`: submit one move for the current player.
- `POST /api/room/reset`: restart the current room's game.

## Future Multiplayer

The likely progression is:

1. HTTP polling with room codes.
2. SQLite persistence for players, rooms, and game history.
3. WebSocket/SSE updates if polling feels slow.
4. Optional hosted deployment only after local use proves the shape.
