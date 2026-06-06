# Super Tic Tac Toe

Super Tic Tac Toe, also called Ultimate Tic Tac Toe, is the first SogoGAMES proof-of-concept.

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
