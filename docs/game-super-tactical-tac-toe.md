# Super Tactical Tac Toe

Super Tactical Tac Toe is the second SogoTable game. It uses the same shared two-player lobby, room, invite, reset, WebSocket, and player-selection architecture as Super Tic Tac Toe, but adds server-owned tactical pickups and scoring.

## Rules

- The board has 9 sectors.
- Each sector has 9 cells.
- Players use the same Ultimate Tic Tac Toe movement rule: the cell index of the current move sends the next player to that sector.
- If the target sector is closed, won, or full, the next player may play in any open sector.
- Capturing three sectors in a macro line wins immediately.
- A player also wins immediately by reaching 100 points.
- If the board fills first, highest score wins. Ties are broken by captured sectors, treasure captures, then coin captures. If still tied, the game is a draw.

## Tactical Pickups

Pickups are authoritative Worker state. The browser only renders them.

- Coin: worth 10 points.
- Treasure Chest: worth 25 points.

After every valid move, the Worker spawns one coin on a random open cell if possible. When a player captures a sector, the Worker also spawns one treasure chest on a random open cell if possible.

A pickup may spawn only on an open cell in an open sector and never on a cell that already has another pickup. A pickup cannot be captured on the same move that spawned it.

## State Model

Super Tactical Tac Toe reuses the base nested-board state:

- `boards`
- `small_winners`
- `current_player`
- `next_board`
- `status`
- `winner`
- `move_count`

It adds:

- `game_id: "super_tactical_tac_toe"`
- `pickups`
- `scores`
- `captures`
- `events`
- `last_event`
- `score_goal`

Scores and captures are keyed by room mark (`X` or `O`) so they continue to follow the randomly assigned room seats.

## UI

The shared selected-game lobby is global across two-player games. Super Tactical Tac Toe appears as a second ready game in the main game list, and the existing room cards, invites, local opponent selection, re-entry, and active-room WebSocket flow apply unchanged.

On the board, empty cells may show pickup emojis. Player marks always take visual priority over pickups. The active player labels show tactical scores, and the turn banner shows recent pickup or sector-capture events.

## Testing

Worker tests cover:

- creating a Super Tactical Tac Toe room
- spawning a coin after a valid move
- capturing a coin and scoring 10 points
- spawning a treasure chest after a sector capture
- preserving the original Super Tic Tac Toe behavior
