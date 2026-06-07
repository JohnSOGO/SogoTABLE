# SogoTable State Machine

This document is the durable state-machine source of truth for the current SogoTable browser UI.

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

Rooms are stored in hosted D1-backed shared state during public playtesting. Completed or exited rooms should stop appearing in open/in-progress game lists.

### Player

A roster profile stored by the hosted Cloudflare Worker brain in D1-backed shared state.

Player profiles have:

- `id`
- `name`
- `icon`
- persistent preferred `color`

Persistent player color is a preference. A room seat may use a gameplay-safe display color if the preferred color conflicts with another seated player.

### Device/Home Selected Player

Each browser stores its own durable selected player:

- `sogotable.deviceSelectedPlayerId`
- `sogotable.deviceSelectionHash`

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
- Opens the app with the SogoTable image mark and a direct path into player/game selection.
- Sends user into player/game selection.

Required display:

- Centered image logo/splash art, about 90% as wide as the `Start Playing` button.
- Short product text.
- `Start Playing` button.
- Small revision label.

Allowed transitions:

- `Start Playing` -> `PLAYER_GAME_SELECTION`

Do not:

- Show a visible `SogoTable` heading on the splash.
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
- Disabled if the game definition is not currently available.
- Enabled when a device/home selected player exists.
- Tapping a game button sets `selectedGameId` and opens `GAME_SELECTED`.
- Game availability is data-driven on the game definition so future games can be added as `ready`, `coming_soon`, or unavailable without changing the screen flow.

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
- If the selected player has an unfinished room for this game, show a visible recovery notice with `Re-enter Game`.
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
- Treat the rendered card as a stale snapshot. On tap, fetch the room by code from the shared API before joining or re-entering so phone and PC clients use current room state.
- Before creating, joining, or re-entering a hosted room, require the browser's device/home selected player to exist in the shared API roster. Do not use local-only fallback players and do not silently migrate old localStorage fallback players into the hosted roster.
- If the shared API is unavailable or returns non-JSON/static HTML, show an explicit error and disable multiplayer actions. Do not render empty rosters or empty game lists as if they were valid server state.
- Polling endpoints such as room lists, room reads, player lists, lobby reads, and invite reads are read-only. Hosted storage must not save the whole state row after `GET` requests, or stale polling snapshots can overwrite newer room/player changes.

Create/Re-enter behavior:

- If the selected player has an unfinished room for this game, button text should be `Re-enter Game`.
- If not, button text should be `Create Game`.
- Creating a game creates a room and immediately opens `GAME_SCREEN`.
- Re-entering opens the existing room's `GAME_SCREEN`.
- Re-entry must use the browser's device/home selected player, not a temporary hot-seat actor.
- Completed rooms are not unfinished rooms; they should not block `Create Game`.

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

- Header with `Exit` button.
- Centered game name.
- Centered room id line, formatted as `Room ABCD`.
- `Reset` button.
- Players panel visible.
- Host slot showing host icon, name, and mark/status.
- Opponent slot.
- If the current device/home selected player is the host, opponent slot shows:
  - `Select Local Opponent`
  - `Invite Remote Opponent`
- If a remote invite has been sent by the host, show invite lifecycle feedback near the opponent slot:
  - invite sent / waiting for response
  - accepted / starting game
  - declined
  - expired
- If the current device/home selected player is not the host, opponent slot explains waiting state.
- Turn/status row says waiting for opponent.
- Super Tic Tac Toe board visible and disabled.

Exit behavior:

- `Exit` opens a Yes/No confirmation.
- Yes lets the selected player leave without requiring agreement from the other player.
- The current hosted implementation closes the game room so polling players return to `GAME_SELECTED` for the current game type.
- No keeps the player in the game.

Reset behavior:

- `Reset` opens a Yes/No confirmation.
- If two players are seated, Yes requests a reset and waits for the other seated player to agree.
- The board resets only after both seated players agree.
- If the other player declines, the pending reset request is cleared.
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
- Host receives visible lifecycle feedback while waiting.
- The waiting room payload carries the latest invite status so normal room polling can update the host after a decline.
- Invite lifecycle feedback must not depend on a fragile local selected-player check; if the waiting room has a latest invite, render that state.
- Target player sees `INVITE_PROMPT` in their browser if they are selected on that device.
- Remote invite targets are limited to players currently present in the selected game's lobby.
- Remote invite targets must exclude players already seated in any unfinished game for that game type.
- If no eligible remote targets are present, show `No players in lobby.`

Do not:

- Let the host invite themselves.
- Show already seated players as available targets.
- Show the full persistent player roster for remote invites.

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

- Header with `Exit`, centered game name, centered room id, and `Reset`.
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

Exit behavior:

- Ask Yes/No before closing.
- Confirmation copy must make it clear the local player is leaving.
- The exiting player does not need the other player to agree.
- The current hosted implementation closes the game room so polling players return to `GAME_SELECTED` for the current game type.

Reset behavior:

- Ask Yes/No before reset.
- Confirmation copy must make it clear the other player must agree.
- Yes creates a pending reset request if another player is seated.
- The other player sees a Yes/No agreement prompt.
- Board state resets only after both seated players agree.

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
- Header action should read `Play Again` instead of `Reset`.

Local hot-seat completion:

- Restore the original device/home selected player.

Room lifecycle:

- Completed rooms are not listed as open or in-progress games.
- Exit still requires local Yes/No and then leaves/closes the room.
- `Play Again` requires both seated players to agree, then starts a fresh board with the same seated players.

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

- Exit game.
- Reset or Play Again request.

Behavior:

- Yes continues the action.
- No cancels the action.
- Backdrop click cancels the action.

## Room-Seat Color Rules

Player colors are part of gameplay readability.

Persistent roster color:

- User preference.
- Stored in hosted shared state.
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

Current live updates are event-first with conservative timed fallback.

App-level live updates:

- Room lists, selected-game lobby presence, and pending invite prompts should arrive through `/api/events/socket` app snapshots during normal connected play.
- Timed reads still exist as fallback and recovery, not as the primary update path.

Room live updates:

- Normal active-room updates should arrive through the room WebSocket.
- Move, join, leave, invite lifecycle, reset, and completed-state changes should render from received room snapshots.
- If a room disappears, return the player to `GAME_SELECTED` for the current game type.
- If the WebSocket disconnects, show a reconnecting state and use conservative HTTP refresh as fallback/recovery, not constant 1500ms polling.

Invite polling:

- Checks for pending invites for the browser's device/home selected player every 30 seconds as fallback.
- EventHub app snapshots should deliver normal pending invite prompts first.

Lobby presence polling:

- Runs while on `GAME_SELECTED` every 15 seconds as fallback.
- Shows only players currently looking at the selected game screen.
- Does not imply all roster players are present.
- Use a forgiving presence TTL. Mobile browsers can pause timers and network requests, so a tight 10-second TTL makes players flicker in and out of the lobby even when they are still present. The current target TTL is 45 seconds.

## Future-AI Guardrails

- Do not reintroduce a separate room-entry screen.
- Do not put player creation directly on the main menu.
- Do not add a generic Continue button for game selection.
- Do not make top player labels touchable during active play.
- Do not let local hot-seat turn swaps overwrite device/home selected player.
- Do not mutate persistent player colors to fix a room-seat conflict.
- Do not remove Yes/No confirmation from Exit or Reset.
- Do not let Reset or Play Again clear the board until all seated players have agreed.
- Do not hide the board while waiting for an opponent.
- Do not move game descriptions back to the main menu.
- Do not use raw player color for text on tinted surfaces.
