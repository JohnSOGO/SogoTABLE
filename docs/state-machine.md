# SogoGAMES State Machine

This document is the durable state-machine source of truth for the current SogoGAMES browser UI.

Future AI agents should read this before changing navigation, room flow, lobby behavior, player identity, or Super Tic Tac Toe display behavior. The project has moved beyond the older design idea where a room-entry screen or separate game lobby was the primary interaction model. The current product model is:

```text
Intro -> Player & Game Select -> Game Selected -> Game Screen
```

The room is the game instance. The game screen is the room. There is no separate pre-game room-entry screen.

## Core Entities

### GameDefinition

A game type that can be selected from the game list.

Current ready game:

- `super_tic_tac_toe`

Display name:

- `Super Tic Tac Toe`

### Room

A live game instance for one `GameDefinition`.

A room can be:

- `waiting_for_player`
- `active`
- `completed`

The room has:

- a 4-character room code
- one `game_id`
- a host player id
- seated room players
- optional `local_mode`
- the current game engine state

The room disappears on server restart because Phase 1 rooms are in memory.

### Player

A roster profile stored by the local Python server in `data/players.json`.

Player profiles have:

- `id`
- `name`
- `icon`
- persistent preferred `color`

Persistent player color is a preference. A room seat may use a gameplay-safe display color if the preferred color conflicts with another seated player.

### Device/Home Selected Player

Each browser stores its own durable selected player:

- `sogogames.deviceSelectedPlayerId`
- `sogogames.deviceSelectionHash`

During local hot-seat play, runtime `selectedPlayerId` may temporarily point to the current-turn player. That temporary actor must not overwrite the durable device/home selected player.

## Global Invariants

- Keep the app mobile-first.
- Do not introduce a separate room-entry screen.
- Do not make a game-specific admin/control panel.
- The main menu should answer only: Who am I? What game do I want?
- The selected-game screen is for open/in-progress game discovery and creating/re-entering a game.
- The game screen is the actual room and must show the actual game board.
- Room state should drive UI state.
- Multi-device play must keep each browser's selected player fixed.
- Local hot-seat play may auto-toggle the runtime actor, but must restore the device/home selected player when the game ends or closes.
- Player colors are gameplay signals. Use them carefully and keep them readable.

## Screen State: INTRO

DOM screen id:

- `intro`

Purpose:

- Lightweight opening screen.
- Introduces SogoGAMES.
- Sends user into player/game selection.

Required display:

- Brand/logo signal.
- Short product text.
- `Start Playing` button.

Allowed transitions:

- `Start Playing` -> `PLAYER_GAME_SELECTION`

Do not:

- Add setup forms here.
- Add room controls here.
- Add game descriptions here beyond light intro copy.

## Screen State: PLAYER_GAME_SELECTION

DOM screen id:

- `games`

Visible title:

- `Player & Game Select`

Purpose:

- Choose the browser's device/home selected player.
- Choose the game type.

Required display:

- Current selected player section at the top.
- If no player is selected, display `No player selected`.
- Player icon and player name in the current player row.
- `Change` button to open player selection.
- `Create` button to open player creation.
- `Games` section.
- One full-width button per game.
- Game buttons display only the game name.

Current game list:

- `Super Tic Tac Toe`

Game button behavior:

- Disabled if no device/home selected player exists.
- Enabled when a device/home selected player exists.
- Tapping a game button sets `selectedGameId` and opens `GAME_SELECTED`.

Do not:

- Show game descriptions here.
- Show player creation fields directly on the page.
- Show Pick/Selected buttons on player rows.
- Show a generic Continue button.
- Show room code inputs here.
- Let temporary hot-seat actor state replace the device/home selected player.

## Modal State: PLAYER_MODAL

DOM modal id:

- `playerModal`

Purpose:

- Select an existing player.
- Create a new player.
- Delete players from the shared roster.

Required display:

- Existing players list.
- Selected player shown by visual selection styling.
- No `Pick` or `Selected` buttons.
- Create New Player form.
- Display name input.
- Icon input.
- Color picker controls.
- Create Player button.

Selection behavior:

- Tapping a player selects that player immediately.
- The modal closes after selecting an existing player.
- Creating a player selects the new player and closes the modal.

Color behavior:

- Player color is a persistent preference.
- Do not rely on color alone for player identity.
- Use contrast-aware foregrounds anywhere player color is a background.

Do not:

- Make the player modal game-specific.
- Persist room-seat color overrides back to the player roster.

## Screen State: GAME_SELECTED

DOM screen id:

- `gameSelected`

Purpose:

- Show the selected game type.
- Show who is currently looking at that game.
- Show open games and games in progress.
- Let the selected player create or re-enter a game.

Required display:

- Back button to `PLAYER_GAME_SELECTION`.
- Game name as page title.
- Game description here, not on the main menu.
- `Lobby` panel showing players currently viewing this game screen.
- Local selected player first, then other lobby-present players sorted by name.
- `Current Games` panel.
- `Open` list for rooms in `waiting_for_player`.
- `In Progress` list for rooms in `active`.
- `Refresh` button.
- `Create Game` panel.
- `Create Game` or `Re-enter Game` button based on whether the selected player already has an unfinished room for this game.

Open game card requirements:

- Show host/player identity.
- Show room code.
- Show seated player avatars.
- If selected player is seated, action is `Re-enter Game`.
- If selected player is not seated and the room is open, action is `Join Game`.
- If room is active and selected player is not seated, action is disabled.

Create/Re-enter behavior:

- If the selected player has an unfinished room for this game, button text should be `Re-enter Game`.
- If not, button text should be `Create Game`.
- Creating a game creates a room and immediately opens `GAME_SCREEN`.
- Re-entering opens the existing room's `GAME_SCREEN`.

Do not:

- Treat this as the main game screen.
- Put X/O side selection here.
- Put manual host selection here.
- Ask for custom room names here.
- Hide an active game owned by the selected player.

## Screen State: GAME_SCREEN_WAITING

DOM screen id:

- `game`

Room status:

- `waiting_for_player`

Purpose:

- The actual game room exists.
- Host is waiting for an opponent.
- The board is visible but disabled.

Required display:

- Header with `Close` button.
- Centered game name.
- Centered room id line, formatted as `Room ABCD`.
- `Reset` button.
- Players panel visible.
- Host slot showing host icon, name, and mark/status.
- Opponent slot.
- If the current device/home selected player is the host, opponent slot shows:
  - `Select Local Opponent`
  - `Invite Remote Opponent`
- If the current device/home selected player is not the host, opponent slot explains waiting state.
- Turn/status row says waiting for opponent.
- Super Tic Tac Toe board visible and disabled.

Close behavior:

- `Close` opens a Yes/No confirmation.
- Yes deletes the room and returns polling players to `PLAYER_GAME_SELECTION`.
- No keeps the game open.

Reset behavior:

- `Reset` opens a Yes/No confirmation.
- Yes resets the game board.
- No leaves the board unchanged.

Do not:

- Hide the board while waiting.
- Show a separate room-entry screen.
- Show manual X/O selection.
- Start the game manually.

## Modal State: INVITE_PLAYER_MODAL

DOM modal id:

- `invitePlayerModal`

Purpose:

- Select a local opponent or remote invite target.

Modes:

- Local opponent selection.
- Remote invite target selection.

Local opponent behavior:

- Selecting a local opponent joins them to the room with `local_mode = true`.
- When the room starts, the browser auto-selects the current-turn room player.
- Hot-seat swaps must not overwrite the device/home selected player.

Remote invite behavior:

- Host sends an invite to a target player.
- Target player sees `INVITE_PROMPT` in their browser if they are selected on that device.

Do not:

- Let the host invite themselves.
- Show already seated players as available targets.

## Modal State: INVITE_PROMPT

DOM modal id:

- `invitePrompt`

Purpose:

- Let a remote player accept or decline an invite.

Required display:

- Invite text naming the host and game.
- `Yes` button.
- `No` button.

Yes behavior:

- Joins the invited player to the room.
- Opens `GAME_SCREEN`.
- If this is the second player, the room activates.

No behavior:

- Dismisses the invite.
- Does not join the room.

## Screen State: GAME_SCREEN_ACTIVE

DOM screen id:

- `game`

Room status:

- `active`

Purpose:

- The actual playable game.

Required display:

- Header with `Close`, centered game name, centered room id, and `Reset`.
- Players setup panel hidden.
- Top player labels visible.
- Top player labels are passive status labels, not buttons.
- Current-turn player label highlighted with a light tint of that player's room-seat color.
- Non-turn player label remains white.
- Turn row visible.
- Board visible and interactive only for the selected player whose mark owns the current turn.

Turn row requirements:

- If it is this device's active player turn:
  - `It's Your Turn PLAYER_NAME; Place an X`
  - or `It's Your Turn PLAYER_NAME; Place an O`
- If waiting:
  - `Waiting for PLAYER_NAME.`
- Waiting state uses a soft yellow box.
- Your-turn state uses the current player's color/tint and contrast-aware text.

Board display requirements:

- Legal target boards are visually emphasized.
- Legal target change flashes once briefly, then settles.
- Inactive boards are dimmed.
- Filled cells use a light tint derived from the owning player's room-seat color.
- Won sub-boards use a light tint derived from the winning player's room-seat color.
- Text on tinted surfaces must use contrast-aware foreground color.
- X/O marks must be centered.
- Do not rely only on X/O letters for ownership; color is a gameplay signal.

Move behavior:

- A move is allowed only if:
  - room status is active
  - game status is playing
  - selected runtime actor is seated
  - selected runtime actor mark equals `game.current_player`
  - board/cell is legal per rules engine
- After a local hot-seat move, runtime actor auto-switches to the current-turn player.
- Remote devices do not auto-switch their device/home selected player.

Close behavior:

- Ask Yes/No before closing.
- Yes deletes the room and returns all polling players to `PLAYER_GAME_SELECTION`.

Reset behavior:

- Ask Yes/No before reset.
- Yes resets board state.

Do not:

- Let users manually change turns by tapping player names.
- Let non-turn players place marks.
- Mutate the persistent player color because of room-seat color safety.

## Screen State: GAME_SCREEN_COMPLETED

DOM screen id:

- `game`

Room status:

- `completed`

Purpose:

- Show final board/result.

Required display:

- Final board remains visible.
- Winning macro line shown when a player wins.
- Winning macro boards highlighted.
- Winning cells inside claimed small boards highlighted.
- Status row names the winner or draw.
- One second after winner detection, show celebration overlay.
- Celebration overlay shows winning player's icon, not just X/O.
- `Back to Board` closes the overlay and returns to the completed board.

Local hot-seat completion:

- Restore the original device/home selected player.

Room lifecycle:

- Completed rooms are not listed as open or in-progress games.
- Close still requires Yes/No and then deletes the room.

## Modal State: WIN_OVERLAY

DOM id:

- `winOverlay`

Purpose:

- Celebration after win.

Required display:

- Confetti.
- Winning player's icon.
- Winning player's name.
- `Back to Board` button.

Do not:

- Block access to the final board permanently.
- Use only X/O as the winning identity.

## Modal State: CONFIRM_PROMPT

DOM id:

- `confirmPrompt`

Purpose:

- Prevent accidental destructive game actions.

Required display:

- Title: `Are you sure?`
- A short action-specific message.
- `Yes`
- `No`

Used by:

- Close game.
- Reset game.

Behavior:

- Yes continues the action.
- No cancels the action.
- Backdrop click cancels the action.

## Room-Seat Color Rules

Player colors are part of gameplay readability.

Persistent roster color:

- User preference.
- Stored in `data/players.json`.
- Shown in player picker and identity displays.

Room-seat color:

- Display color used during a specific room.
- May differ from persistent roster color if needed for gameplay clarity.
- If the guest joins with a color too similar to the host's room-seat color, assign the guest a non-conflicting palette color.
- Do not silently mutate the guest's persistent roster color.

Contrast rules:

- Calculate text/icon foreground color from the actual rendered background.
- Solid avatars calculate contrast against the solid color.
- Soft/tinted turn banners calculate contrast against the mixed tint.
- Do not special-case yellow, red, or any named player.

## Polling And Presence

Current polling is intentionally simple.

Room polling:

- Keeps room/game state current.
- If a room disappears, return the player to `PLAYER_GAME_SELECTION`.

Invite polling:

- Checks for pending invites for the browser's device/home selected player.

Lobby presence polling:

- Runs while on `GAME_SELECTED`.
- Shows only players currently looking at the selected game screen.
- Does not imply all roster players are present.

## Future-AI Guardrails

- Do not reintroduce a separate room-entry screen.
- Do not put player creation directly on the main menu.
- Do not add a generic Continue button for game selection.
- Do not make top player labels touchable during active play.
- Do not let local hot-seat turn swaps overwrite device/home selected player.
- Do not mutate persistent player colors to fix a room-seat conflict.
- Do not remove Yes/No confirmation from Close or Reset.
- Do not hide the board while waiting for an opponent.
- Do not move game descriptions back to the main menu.
- Do not use raw player color for text on tinted surfaces.
