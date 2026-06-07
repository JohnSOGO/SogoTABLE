# Architecture

SogoTable starts as a dependency-light Python web app with a vanilla browser frontend.

## Chosen Stack

- Python standard library `http.server` for local development.
- Python game engine modules under `src/sogotable/`.
- Vanilla JavaScript for the browser UI.
- Progressive Web App manifest and service worker for an installable mobile shell.
- `pytest` for game-rule tests.

The stack is intentionally small. The first milestone needs a reliable playable loop, not a framework commitment.

## Folder Layout

```text
SogoTable/
  README.md
  AGENTS.md
  docs/
  src/
    sogotable/
      super_tic_tac_toe.py
      server.py
      static/
  tests/
```

## Data Flow

```text
Browser UI -> Game Menu -> HTTP JSON API -> Room Store -> Game Engine -> JSON State -> Browser UI
```

The rules engine owns legal moves and win/draw state. The UI renders state and sends player actions. The server translates HTTP requests into engine operations.

## Game Engine Separation

The Super Tic Tac Toe engine has no HTML, CSS, browser storage, sockets, or HTTP concerns. It accepts moves and returns state.

This keeps the hardest logic testable and allows future transports to reuse the same rules.

## Room And Session Approach

Phase 1 uses in-memory rooms:

- room code
- selected game
- player list
- current game state

The server owns the shared player roster in `data/players.json`. Browser local storage keeps the selected game, a durable device/home selected player id, and a 10-digit device selection hash. Runtime `selectedPlayerId` may temporarily point at the active turn owner during one-phone local hot-seat play, but that temporary actor must not overwrite the durable device/home selected player. This makes the player list consistent between the PC and phones on the same local server while preserving each browser's own selected player.

Deleting a player removes them from future roster selection but does not eject that player from an active in-memory room. Editing a player's icon updates the persistent roster and any matching active room seat.

The main menu stays focused on current player and direct game selection. Player selection and player creation are separate top-level buttons that open the player modal at the relevant area. Player rows select immediately on tap and use green outline styling instead of `Pick` or `Selected` buttons. Game buttons on the main menu show only game names and open the selected-game screen for that game type.

The player editor keeps display name, emoji icon, and color together. Emoji icons default randomly, clear on focus for easy keyboard entry, and fall back to a random icon if left blank. The color picker follows the Mantine ColorPicker concept with a hex field, native color input, and swatches, implemented in vanilla HTML/CSS/JS to preserve the project's dependency-light stack.

In a room, the browser's selected player is the device's active identity. Room polling must not auto-switch that identity. The Super Tic Tac Toe board only enables moves when that selected player owns the current turn, while the turn row explains either `It's Your Turn PLAYER_NAME; Place an X/O` or `Waiting for PLAYER_NAME.`.

The screen-level state machine and display requirements live in `docs/state-machine.md`. Treat that file as the source of truth before changing navigation, game-screen layout, modal behavior, or room status rendering.

Room seats may use gameplay-safe display colors that differ from the persistent roster color. When a guest joins with a color too similar to the host's room-seat color, the server assigns the guest a non-conflicting palette color for that room only. Persistent player profile colors are not silently changed by this safety override.

The room is the live game instance, and the game screen is the room. After player selection, the game list opens a selected-game screen for that game type. That screen shows the game description, short-lived local presence for players currently viewing that game's lobby, open games, in-progress games, and a Create Game/Re-enter Game action. Creating or joining a game enters the game screen immediately.

Room creation seats the host and immediately opens the actual game screen in `waiting_for_player` status. The tic-tac-toe board is visible but disabled while waiting for the second player. When a second player joins by code or accepts an invite, the room activates, X/O marks are assigned randomly across the two seated players, and the board becomes playable automatically.

Rooms have a `host_id`, `game_id`, seated players, game state, optional `local_mode`, reset votes, and a computed status: `waiting_for_player`, `active`, or `completed`. A player can have only one active in-memory room per game, whether they are host or opponent; creating again returns the existing unfinished room. The game screen shows Host and Opponent slots while waiting, then hides that Players section once the game starts. If the opponent is missing, the host can either select a local opponent from the roster for one-device play or invite a remote opponent, whose browser receives an in-memory invite popup through polling. Local-mode games auto-toggle the runtime actor to the current turn owner and restore the original device/home selected player when the game ends or exits. Exiting asks only the local player for confirmation; in the current in-memory implementation, exit closes the room so it is no longer listed or re-enterable. Reset and Play Again require agreement from both seated players before the board is cleared.

The room disappears when the server restarts.

The browser main menu shows the current player, `Select Player` and `Create Player` buttons, and then the game picker. Each game button displays only the game name. Super Tic Tac Toe is currently the only enabled game, but rooms carry a `game_id` so future games can be added through separate game modules instead of reshaping the room flow.

## HTTP Endpoints

- `GET /api/players`: list the shared persistent player roster.
- `GET /api/rooms`: list open and active rooms, optionally filtered by `game_id`; with `player_id` and `game_id`, return that player's active room for the game.
- `GET /api/invites?player_id=...`: list pending invites for a player.
- `GET /api/lobby?game_id=...`: list short-lived players currently viewing the selected game screen.
- `POST /api/players/create`: create or update a player in the shared roster.
- `POST /api/players/delete`: remove a player from future roster selection.
- `DELETE /api/players?id=...`: alternate player delete endpoint.
- `POST /api/room/create`: create or reopen the selected host player's active in-memory room.
- `POST /api/room/join`: join an existing room; when the second player joins, activate the room and randomly assign X/O.
- `POST /api/room/close`: delete an in-memory room/game so it cannot be re-entered.
- `POST /api/room/leave`: let a seated player exit; currently closes the in-memory room.
- `GET /api/room?code=ABCD`: fetch the current room and game state.
- `POST /api/room/move`: submit one move for the current player.
- `POST /api/room/reset`: request or approve a reset; the board restarts only after all seated players agree.
- `POST /api/invite/create`: host-only create invite for a target player.
- `POST /api/invite/respond`: accept or decline a pending invite.
- `POST /api/lobby/presence`: update short-lived selected-game lobby presence for the browser's selected player.

## Progressive Web App

The browser frontend includes a conservative PWA shell:

- `manifest.webmanifest` declares the SogoTable app name, red theme color, and install icons.
- `service-worker.js` precaches and refreshes static shell assets.
- API calls under `/api/` are intentionally excluded from service-worker handling so rooms, invites, moves, and player state stay live.
- The current PWA promise is installability and better reload behavior, not offline gameplay.

The intro screen also shows a small Git-backed revision label. The server exposes `/api/status` with the human-facing version, Git short hash, branch, dirty flag, and a formatted summary string. Git is the source of truth for revision identity, not a manual counter.

## Future Multiplayer

The likely progression is:

1. HTTP polling with room codes.
2. SQLite persistence for players, rooms, and game history.
3. WebSocket/SSE updates if polling feels slow.
4. Optional hosted deployment only after local use proves the shape.
