# Project Memory

This file is durable context for future Codex sessions. Read it with `AGENTS.md`, `README.md`, `docs/state-machine.md`, and `docs/AREC.md` before making changes.

## Product Direction

SogoGAMES is a mobile-first browser platform for simple family turn-based games. Super Tic Tac Toe is the first proof-of-concept, but the app should grow through a games menu and clear game modules rather than becoming a single-game app.

`docs/state-machine.md` is the current source of truth for screen states, modal states, transitions, and display requirements. Future agents should update it whenever navigation, room flow, or game-screen state behavior changes.

The target use case is casual local play: family members can open a phone browser, choose players, join a room, and play without installs, paid services, heavyweight accounts, or vendor lock-in.

## User Preferences

- The user wants Codex to pay close attention to live playtest feedback and treat it as product-owner direction.
- The user wants future Codex sessions to be up to speed after reading `AGENTS.md`, `README.md`, and docs.
- The user values copious documentation as the project evolves, especially project goals, decisions, preferences, and test workflows.
- The user prefers small playable improvements over large speculative architecture.
- The user likes clear, polished mobile UI details: centered marks, obvious valid moves, visual win lines, player-name win declarations, and celebratory feedback.
- The user wants shared player rosters across PC/iPhone, not per-device player lists.
- The user wants players to be deletable and their emoji icons editable.
- The user wants player creation at the top of the main menu, not buried inside a game-specific flow.
- The user does not want visible example emoji buttons. Player emoji should default randomly, clear when the emoji field receives focus, and fall back to a random emoji if left blank.
- The user wants display name, icon, and color on one compact row, with color chosen from a larger color palette.
- Player color picking should follow the Mantine ColorPicker feel: hex value, swatches, full-width picker behavior, and accessible controls, but keep the app vanilla unless a larger framework migration is explicitly approved.
- User-selected player colors can be bright or high-luminance, such as Yolo's yellow. Anywhere a player color is used as a background, use contrast-aware foreground text/icon coloring rather than hardcoding exceptions for yellow. For tinted/soft surfaces, calculate contrast against the actual rendered tint, not the raw source player color.
- Player colors are gameplay signals. When a guest joins with a color too similar to the host's in-room color, automatically assign the guest a non-conflicting room-seat color from the existing palette. Do not mutate the guest's persistent roster color for this.
- The main menu should stay focused: current player and direct game selection. Player selection and player creation should be separate top-level actions, while editing/deletion stays inside the player modal.
- Player rows should not have Pick/Selected buttons. Tapping a player row selects it, green border indicates selection, and the modal closes immediately.
- Main menu game buttons should only show game names. Game descriptions belong on the selected game's game-selected screen or game room, not on the main menu.
- Incoming AI handoff/prompt files may be placed in `AI/`. That directory is ignored and should be treated as input context, not product source.
- The user does not want distracting effects. In local hot-seat Super Tic Tac Toe, turn and active-board feedback should use the current player's selected color, with only a brief one-shot flash and no continuous green pulse.
- The opening splash should emphasize the SogoTABLE image mark, not a visible `SogoGAMES` heading. Keep it narrow-window friendly; the image should be centered and about 90% as wide as the `Start Playing` button.

## Current Implemented Shape

- Python standard-library HTTP server at `src/sogogames/server.py`.
- Pure Python Super Tic Tac Toe rules engine at `src/sogogames/super_tic_tac_toe.py`.
- Vanilla browser UI under `src/sogogames/static/`.
- Local in-memory rooms with 4-character room codes.
- Persistent shared player roster in `data/players.json`, served by the local Python server.
- Static Cloudflare Pages does not currently run the Python `/api/` player endpoints. When `/api/players` returns the static HTML shell, the browser UI falls back to localStorage player profiles so public/static users can still create and select players. This fallback is per browser/device and is not the same as the shared local Python roster.
- Static Cloudflare Pages also does not currently provide room, lobby-presence, invite, or move APIs. Public/static UI should hide raw JSON errors and show disabled/unavailable game actions until a hosted backend exists. True two-browser/two-device multiplayer requires the local Python server or a future hosted Worker/Durable Object backend.
- Browser local storage keeps the device/home selected player separately from the active hot-seat turn actor. `sogogames.deviceSelectedPlayerId` is the browser's durable selected player; `selectedPlayerId` in runtime may temporarily point at the current turn owner during local hot-seat play.
- Games menu exists, currently with Super Tic Tac Toe as the only ready game.
- The player/game selection screen is titled `Player & Game Select`. It starts with the current player summary, separate `Change` and `Create` buttons positioned to the right of the player icon/name when space allows, then direct game buttons.
- Current main menu shape is selected-player summary, separate player action buttons, and simple full-width game buttons showing only game names. There is no generic Continue button and no Create/Re-enter text on the menu.
- Clicking a game now opens a selected-game screen for that game type. This screen shows the game description, current players actually viewing that selected-game lobby, current open games, current in-progress games, and a `Create Game`/`Re-enter Game` action.
- One-phone hot-seat play is supported. When a local opponent is selected, the room is marked as local mode, the browser auto-selects the current-turn player after each move, and the original device/home selected player is restored when the game ends or closes. Local hot-seat turn swaps must not overwrite the device/home selected player in local storage.
- During an active game, player names on the game screen are passive status labels, not controls. Do not let users tap player names to manually change the active turn actor. The current-turn player label should be highlighted with a light tint of that player's selected color; non-turn player labels should stay white.
- The room is the table: a live game instance and play space, not a pre-game lobby container. The selected player from the main menu is the host; do not show a player roster or ask the user to select a host again before creating the room.
- Multi-device play keeps each browser's selected player fixed. Do not auto-switch the selected player on room refresh; the game screen should show `It's Your Turn PLAYER_NAME; Place an X/O` or `Waiting for PLAYER_NAME.` and only enable moves for the selected player's turn.
- Waiting turn state should use a soft yellow box, not grey.
- Manual X/O selection is removed. Creating a room seats the host and waits for an opponent; once a second player joins or accepts an invite, X/O is assigned randomly and play begins automatically.
- Each player may have only one active in-memory room per game. If the host creates again before the room is complete, the server returns the existing room.
- There is no separate room-entry screen for a specific room. The selected-game screen is for choosing or creating a game instance; the game screen is still the room and the room is the game.
- The selected-game lobby shows the local selected player first, then other lobby-present players in sorted order. The game screen is the waiting/play surface. It shows Host and Opponent slots while waiting for the game to start, then hides that Players section once the game is active because turn ownership is shown separately. An empty opponent slot shows `Select Local Opponent` and `Invite Remote Opponent` for the host. Creating a game must open the actual tic-tac-toe game screen; while waiting for the second player, show the board disabled rather than hiding it. If the selected player already has an unfinished room for the game, show a recovery notice and `Re-enter Game`; use the browser's device/home selected player for re-entry, not a temporary hot-seat actor.
- The game screen has an `Exit` button that asks the local player for Yes/No confirmation and lets that player leave without needing agreement from the other player. In the current in-memory implementation, exiting closes the room so polling players return to player/game selection. `Reset` is different: it asks for confirmation, then waits for both seated players to agree before clearing the board. After a completed game the same control is labeled `Play Again` and also requires both seated players to agree before starting a fresh board.
- Invited players receive an invite popup with `Yes` and `No`. Accepting joins the room and opens it; declining dismisses the invite. Hosts should see invite lifecycle feedback while waiting: sent, accepted, declined, or expired. Remote invite targets must come from players currently present in the selected game's lobby and must exclude anyone already seated in an unfinished game. If none are eligible, show `No players in lobby.`
- There is no manual Start Game button. When the room has the required players, it becomes active and both devices auto-open the board once polling observes the active state.
- Game definitions should carry explicit availability metadata. Keep Super Tic Tac Toe as the only ready game until another game is actually implemented; future games can be added as unavailable/coming soon without changing the player -> game -> room flow.

## Super Tic Tac Toe UX Decisions

- The board is slightly narrower than full width on phones for comfort.
- Legal boards and the turn highlight use the current player's selected color. When the legal target changes, the board flashes once for about 0.25 seconds, then settles into that player's color.
- Filled cells and won sub-boards use light tints derived from the owning player's selected color, with contrast-aware foreground text. This makes ownership visible without relying only on X/O colors.
- Turn labels and player icons must stay readable against arbitrary player colors by calculating a contrast-aware foreground color. Solid avatars use the solid player color as the contrast background; soft turn banners use the mixed/tinted banner background as the contrast background.
- Inactive boards are dimmed so the playable target is clearer.
- X/O marks should be visually centered in cells.
- A win should show the winning macro line, highlight the winning macro boards, highlight cells that won each claimed small board, and update the status banner with the winning mark and player name.
- One second after a winner is detected, show a celebration overlay with confetti and the winning player's name and icon. The overlay must be closable with `Back to Board`.
- The game screen has a persistent device-perspective turn row below the player buttons. It is separate from the generic status banner and should make multi-device turn ownership obvious.

## Test And Approval Workflows

- Use the LAN URL for phone testing. On the last observed network, the computer was reachable at `http://192.168.0.72:8787/`, but future agents should re-check `ipconfig` because this may change.
- Local test rooms are useful. The server supports requested 4-character room codes when creating rooms through the API.
- Room `AAAA` has been used as a staged approval room one move away from an `O` win. If the server restarts, in-memory rooms are cleared and must be staged again.
- For the staged O-win approval position, the final move is bottom-left macro board, bottom-right cell: board `6`, cell `8`.

## Verification Habits

- Run `python -m pytest` after rules/server changes.
- Run `node --check src\sogogames\static\app.js` after browser JavaScript changes.
- Check static assets through the running local server when UI files change.
- PWA support is intentionally conservative: cache static shell assets and icons, but never cache `/api/` requests. The PWA improves phone install/reload feel; it does not promise offline multiplayer or replace the hosted Worker/state layer.
- The intro screen shows a Git-backed revision summary. Local Python serves `/api/status`; static Cloudflare Pages serves `/revision.json`, generated at build time by `scripts/write-static-revision.mjs`. Use Git as the source of truth: human-facing version, short commit hash, branch, and dirty/clean state. Keep the summary short and readable on phones.
- If browser automation tools are unavailable, headless Chrome can be driven through the DevTools protocol if Chrome is installed.
