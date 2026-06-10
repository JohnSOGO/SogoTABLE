# Super Tic Tactical Toe

Super Tic Tactical Toe is the second SogoTable game. It uses the same shared two-player lobby, room, invite, reset, WebSocket, and player-selection architecture as Super Tic Tac Toe, but adds server-owned tactical pickups and scoring.

## Rules

- The board has 9 zones.
- Each zone has 9 cells.
- Players use the same Ultimate Tic Tac Toe movement rule: the cell index of the current move sends the next player to that zone.
- If the target zone is closed, won, or full, the next player may play in any open zone.
- The game ends when a player captures three zones in a macro line.
- When the macro line is completed, the player with the highest score wins, even if the other player completed the zone line.
- If scores are tied when a macro line is completed, the player who completed the three-zone line wins.
- If the board fills first, highest score wins.
- If the board fills first and scores are tied, the game is a draw.
- `line_winner` tracks the mark that completed the zone line; `winner` tracks the final winner after score comparison and line-completion tie-break.

## Tactical Pickups

Pickups are authoritative Worker state. The browser only renders them.

- Coin: worth 10 points.
- Treasure Chest: worth 25 points.

After every valid move, the Worker spawns one coin on a random open cell if possible. When a player captures a zone, the Worker also spawns one treasure chest on a random open cell if possible.

A pickup may spawn only on an open cell in an open zone and never on a cell that already has another pickup. A pickup cannot be captured on the same move that spawned it.

## State Model

Super Tic Tactical Toe reuses the base nested-board state:

- `boards`
- `small_winners`
- `current_player`
- `next_board`
- `status`
- `winner`
- `move_count`

It adds:

- `game_id: "d7e4a91f0c23"`
- `pickups`
- `scores`
- `captures`
- `events`
- `last_event`

Scores and captures are keyed by room mark (`X` or `O`) so they continue to follow the randomly assigned room seats.

Current runtime payloads may still include legacy names such as `next_board` or
event fields containing `sector`. In Super Tic Tactical Toe product language,
those local 3x3 areas are zones.

## Stats

The Worker records completed-game stats once per room.

- Top five high scores are kept per game.
- ELO ratings are kept per game, starting at 1000.
- Super Tic Tactical Toe high scores use final tactical score.
- The selected-game lobby heading has a right-aligned `High Scores` link. Tapping it opens a popup with a single compact high-score table; ELO is still recorded but is not shown in this lobby because tactical score is the meaningful visible comparison. The popup is not capped; it scrolls when needed and only shows active selectable roster players.
- A tactical room does not record stats until it reaches a completed state.

## UI

The shared selected-game lobby is global across two-player games. Super Tic Tactical Toe appears as a second ready game in the main game list, and the existing room cards, invites, local opponent selection, re-entry, and active-room WebSocket flow apply unchanged.

On the board, empty cells may show pickup emojis. Player marks always take visual priority over pickups. The active player labels show tactical scores, and the turn banner shows recent pickup or zone-capture events.

## Testing

Worker tests cover:

- creating a Super Tic Tactical Toe room
- spawning a coin after a valid move
- capturing a coin and scoring 10 points
- spawning a treasure chest after a zone capture
- score alone not ending the game
- zone-line completion ending the game and highest score choosing the winner
- tied score on zone-line completion awarding the line completer
- high-score and ELO recording
- preserving the original Super Tic Tac Toe behavior
