# Super Tic Tac Toe

Super Tic Tac Toe, also called Ultimate Tic Tac Toe, is the first SogoTable proof-of-concept.

## Rules

- The game has 9 small tic tac toe boards arranged as a 3x3 macro board.
- Each small board has 9 cells.
- Players alternate marks, `X` then `O`.
- A move is made by choosing a small board and a cell inside that board.
- The chosen cell determines the next required small board.
- If the required target board is already won or full, the next player may play in any unfinished board.
- Winning a small board claims that macro board cell.
- Winning 3 claimed small boards in a row wins the game.
- If all small boards finish without a macro winner, the game is a draw.

## State Model

- `boards`: 9 boards, each with 9 cells.
- `small_winners`: one entry per small board: `X`, `O`, `D`, or empty.
- `current_player`: `X` or `O`.
- `next_board`: board index required for the next move, or empty for free choice.
- `status`: `playing`, `x_won`, `o_won`, or `draw`.
- `winner`: `X`, `O`, or empty.

## Move Validation

A move is valid only when:

- the game is still playing
- board index is 0 through 8
- cell index is 0 through 8
- the target cell is empty
- the target small board is not already won or drawn
- the board matches `next_board`, unless `next_board` is empty

## Edge Cases

- If a move sends the opponent to a completed board, the opponent gets free choice.
- A completed small board cannot receive new moves.
- A macro win ends the game immediately.
- No moves are allowed after game over.

## Testing Strategy

The rules engine is tested without the browser. Tests cover:

- empty initial state
- valid and invalid moves
- redirect rule
- free-choice rule
- small-board wins
- macro-board wins
- draw state
- turn alternation
- blocked moves after game over

## Hot-Seat Browser Play

One phone can host both room players for local hot-seat play. After a local opponent is selected, the browser automatically switches the in-memory turn actor to whoever owns the next turn. When the game ends or closes, the original device/home selected player is restored, and hot-seat turn swaps do not overwrite that durable local selection.

For multi-device play, each browser keeps its selected player instead of auto-switching to the current turn. The board only enables moves when the selected player is seated in the room and owns the current turn. A persistent turn row below the player labels shows `It's Your Turn PLAYER_NAME; Place an X/O` for the active device and `Waiting for PLAYER_NAME.` for the inactive device.

The top player labels during active play are passive status labels. They are not buttons, and tapping them must not change turns. The current-turn label uses a light tint of that player's room-seat color. The non-turn label stays white.

Filled cells and won sub-boards use light tints derived from the owning player's room-seat color. Room-seat color may be adjusted by the server if two player colors are too similar for gameplay clarity.

## Win Display

When a game ends, the browser status banner names the winning mark and player. The winning macro-board line is drawn across the claimed boards, and the cells that won each claimed small board are highlighted.

One second after a winner is detected, the game shows a lightweight celebration overlay with confetti and the winning player's name. Closing the overlay returns to the completed board so the final line and highlights can still be inspected.

## Lobby Stats

The selected-game lobby heading has a right-aligned `ELO` link. Tapping it opens a popup with a single compact ELO table. Super Tic Tac Toe does not show high scores because classic score has no gameplay meaning. The popup is not capped; it scrolls when needed and only shows active selectable roster players.
