# SogoTable API Contract

This document records the current `/api/*` contract for the hosted Cloudflare Worker brain.

All responses are JSON.

Successful responses include:

```json
{ "ok": true }
```

Failures include:

```json
{ "ok": false, "error": "Human-readable error." }
```

## Player

Player shape:

```json
{
  "id": "player-id",
  "name": "Display Name",
  "icon": "🙂",
  "color": "#1f7a5f"
}
```

### `GET /api/players`

Returns the shared player roster. Reserved hidden test players are accepted by
write endpoints for smoke testing, but they are filtered from this public roster,
lobby presence, public room lists, and public game stats.

```json
{
  "ok": true,
  "players": []
}
```

### `POST /api/players/create`

Creates or updates a player.

Request:

```json
{
  "player": {
    "id": "player-id",
    "name": "Display Name",
    "icon": "🙂",
    "color": "#1f7a5f"
  }
}
```

Response:

```json
{
  "ok": true,
  "player": {},
  "players": []
}
```

### `POST /api/players/delete`

Request:

```json
{ "id": "player-id" }
```

Response:

```json
{
  "ok": true,
  "players": []
}
```

Delete is blocked while the player is seated in an unfinished room. Successful deletes remove pending lobby presence and pending invites for that player, but do not rewrite completed historical stats.

## Games

### `GET /api/games`

Returns the hosted game registry used by the browser game menu.

```json
{
  "ok": true,
  "games": [
    {
      "id": "a3f19c6e42b8",
      "name": "Super Tic Tac Toe",
      "summary": "A nested tic tac toe duel where every move sends the next player to a target board.",
      "players": "2 players",
      "player_count": 2,
      "status": "Ready",
      "availability": "ready",
      "aliases": ["super_tic_tac_toe"]
    },
    {
      "id": "4b7e2d9a6c10",
      "name": "Dots and Boxes",
      "summary": "Claim edges between dots, complete boxes, and keep the turn when you score.",
      "players": "2 players",
      "player_count": 2,
      "status": "Ready",
      "availability": "ready",
      "aliases": ["boxes", "dots_and_boxes", "dots_and_dashes"]
    },
    {
      "id": "9c2f7a81d4e6",
      "name": "Battleship",
      "summary": "Place your fleet, switch between defence and offence, and sink the enemy ships.",
      "players": "2 players",
      "player_count": 2,
      "status": "Ready",
      "availability": "ready",
      "aliases": ["battleship", "battle_ship"]
    },
    {
      "id": "8f5d2c7a1b90",
      "name": "Quoridor",
      "summary": "Race your pawn across the board while placing walls that slow your opponent without blocking every path.",
      "players": "2 players",
      "player_count": 2,
      "status": "Ready",
      "availability": "ready",
      "aliases": ["quoridor"]
    },
    {
      "id": "6d10f4a2c8b3",
      "name": "10,000",
      "summary": "Roll six dice, keep the scoring dice, press your luck, and bank your way to 10,000.",
      "players": "1+ players",
      "player_count": null,
      "status": "Ready",
      "availability": "ready",
      "aliases": ["ten_thousand", "10000", "dice_10000"]
    }
  ]
}
```

The browser keeps a local fallback registry for startup resilience, but the hosted `/api/games` response is the preferred source for ready-game metadata. `player_count` controls whether a room waits for an opponent or starts immediately as a solo room. A null `player_count` means the room accepts a flexible guest list.

## Lobby Presence

Lobby presence means a player is currently viewing the selected game screen.

### `GET /api/lobby?game_id=a3f19c6e42b8`

Response:

```json
{
  "ok": true,
  "players": [],
  "stats": {}
}
```

### `POST /api/lobby/presence`

Request:

```json
{
  "game_id": "a3f19c6e42b8",
  "player": {}
}
```

Response:

```json
{
  "ok": true,
  "players": []
}
```

## Rooms

Room summary shape:

```json
{
  "code": "ABCD",
  "host_id": "player-id",
  "game_id": "a3f19c6e42b8",
  "revision": 1,
  "game_epoch": 1,
  "started": false,
  "local_mode": false,
  "status": "waiting_for_player",
  "players": [],
  "open_seats": 1
}
```

For unlimited guest-list games such as 10,000, `open_seats` may be `null`.

Full room responses also include `game`, `latest_invite`, and `reset_request`. `revision` is a room-level monotonic freshness marker. `game_epoch` increments when reset/play-again starts a fresh board, so `game.move_count` can safely reset to zero without looking stale.

Room responses are viewer-projected when a `player_id` is supplied on the HTTP
query string or room WebSocket URL, or when a mutating request includes a player
identity such as `player_id`, `requester_id`, `host_id`, or `player.id`. This
matters for hidden-information games. In Battleship, a player sees their own
ships and both players' public shots/results, but does not receive opponent ship
coordinates until the room is completed. Public room reads with no `player_id`
also hide active Battleship fleets.

Canonical `game_id` values:

- `a3f19c6e42b8` - Super Tic Tac Toe
- `d7e4a91f0c23` - Super Tic Tactical Toe
- `4b7e2d9a6c10` - Dots and Boxes
- `9c2f7a81d4e6` - Battleship
- `8f5d2c7a1b90` - Quoridor

Legacy aliases accepted for compatibility:

- `super_tic_tac_toe`
- `super_tactical_tac_toe`
- `boxes`
- `dots_and_boxes`
- `dots_and_dashes`
- `battleship`
- `battle_ship`
- `quoridor`

Super Tic Tactical Toe room game state reuses the base nested-board fields and adds `pickups`, `scores`, `captures`, `events`, and `last_event`. Pickups and scores are authoritative Worker state.

When a tactical game ends on a three-zone macro line, `line_winner` records the mark that completed the line. `winner` records the highest-score winner, which may be a different mark. If scores are tied on the line-completing move, `winner` is the same mark as `line_winner`.

Super Tic Tactical Toe product language calls each local 3x3 area a `zone`.
Current runtime payloads may still include legacy `sector` field names; in those
payloads, `sector` means `zone`.

Dots and Boxes room game state uses `rows`, `cols`, `lines`, `boxes`,
`current_player`, `scores`, `last_move`, `events`, and `legal_lines`. Line ids
use `h-row-col` for horizontal edges and `v-row-col` for vertical edges.

Battleship room game state uses `phase`, `status`, `players`, `current_player`,
`winner`, `fleet`, `events`, and `last_move`. Valid phases are `setup`,
`playing`, and `complete`. Each player state includes `ready`, `ships`, and
`shots`; ships use `{ id, row, col, orientation }` and shots use
`{ row, col, hit }`. `ship_id` may appear only when the server is allowed to
reveal ship identity, such as completed-game review or a public sunk result.

Quoridor room game state uses `size`, `status`, `current_player`, `winner`,
`pawns`, `walls`, `walls_remaining`, `legal_pawn_moves`, `legal_walls`,
`events`, and `last_move`. Pawns are keyed by mark and use
`{ row, col, goal }`. Walls use `{ orientation, row, col }` where orientation
is `h` or `v`.

## Game Stats

Stats are per game.

### `GET /api/stats?game_id=d7e4a91f0c23`

Returns top high scores and ELO ratings for the selected game.

```json
{
  "ok": true,
  "game_id": "d7e4a91f0c23",
  "stats": {
    "high_scores": [],
    "ratings": []
  }
}
```

High scores keep the top five score entries per game. ELO ratings start at `1000` per player per game and update once when a room first completes.

### `GET /api/player/stats?player_id=player-id`

Returns selected-player stats for every ready game. Used by the `Player & Game Select` screen after a player is selected.

```json
{
  "ok": true,
  "player_id": "player-id",
  "stats": [
    {
      "game_id": "a3f19c6e42b8",
      "game_name": "Super Tic Tac Toe",
      "games_played": 0,
      "games_won": 0,
      "personal_high_score": 0,
      "elo": 1000
    }
  ]
}
```

Games played and games won are counted once per completed room when room stats are first recorded. Personal high score is kept per player per game, not only from the public top-five leaderboard.

### `POST /api/player/stats/clear`

Clears a player's stats across games and returns the reset selected-player stats rows.

```json
{
  "player_id": "player-id"
}
```

Clearing stats removes the player's personal stats, ELO entries, and public high-score leaderboard rows. It does not delete the player or rewrite completed room history.

Room statuses:

- `waiting_for_player`
- `active`
- `completed`

### `GET /api/rooms?game_id=a3f19c6e42b8`

Returns open and active rooms for a game.

```json
{
  "ok": true,
  "rooms": []
}
```

### `GET /api/rooms?game_id=a3f19c6e42b8&player_id=player-id`

Returns the selected player's unfinished room for that game, if any.

```json
{
  "ok": true,
  "active_room": null
}
```

### `GET /api/room?code=ABCD&player_id=player-id`

Returns a full room by code, projected for the requesting player.

```json
{
  "ok": true,
  "room": {}
}
```

`player_id` is optional for non-hidden-information games and public recovery
reads. Battleship clients should include it.

### `GET /api/room/socket?code=ABCD&player_id=player-id`

Opens a WebSocket to the room's live update channel. The room Durable Object
stores the full room internally, but sends each socket a room snapshot projected
for that socket's `player_id`.

The room Durable Object sends messages shaped like:

```json
{
  "type": "room_snapshot",
  "room": { "code": "ABCD" }
}
```

When a room is closed, clients receive:

```json
{
  "type": "room_closed",
  "code": "ABCD"
}
```

HTTP room endpoints remain the recovery/backfill path. The browser should fetch the latest room through `GET /api/room` after reconnect or when the WebSocket cannot be established.

### `POST /api/room/create`

Creates a room for a game or returns the player's existing unfinished room for that game.

Request:

```json
{
  "game_id": "a3f19c6e42b8",
  "player": {},
  "code": "ABCD"
}
```

Use `game_id: "d7e4a91f0c23"` to create a Super Tic Tactical Toe room. The old `super_tactical_tac_toe` value remains a compatibility alias.

`code` is optional and mostly useful for tests.

Response:

```json
{
  "ok": true,
  "room": {},
  "existing": true
}
```

`existing` is only present when an unfinished room already exists.

### `POST /api/room/join`

Seats a second player. Once two players are seated, X/O marks are assigned and the room becomes active.

Request:

```json
{
  "code": "ABCD",
  "player": {},
  "local": false
}
```

Response:

```json
{
  "ok": true,
  "room": {}
}
```

### `GET /api/bots?game_id=a3f19c6e42b8`

Returns predefined bot personas available for the selected game.

Response:

```json
{
  "ok": true,
  "bots": [
    {
      "id": "7c91a4e2b6d0",
      "bot_id": "7c91a4e2b6d0",
      "kind": "bot",
      "name": "Sprout",
      "icon": "🌱",
      "color": "#16a34a"
    }
  ]
}
```

Bots are not shared roster players and should not be rendered in lobby player lists.

### `POST /api/room/join-bot`

Seats a predefined bot as the second room player. Only the host can invite a bot, and only while the room is waiting for an opponent.

Request:

```json
{
  "code": "ABCD",
  "host_id": "host-player-id",
  "bot_id": "7c91a4e2b6d0"
}
```

Response:

```json
{
  "ok": true,
  "room": {},
  "bot": {}
}
```

The room seat for a bot includes `kind: "bot"` and `bot_id`. Bot moves are generated by the hosted room path and applied through the same validation path as human moves.

### `POST /api/room/leave`

Current implementation closes the room.

Request:

```json
{
  "code": "ABCD",
  "player_id": "player-id",
  "requester_id": "player-id"
}
```

Response:

```json
{
  "ok": true,
  "closed": true
}
```

### `POST /api/room/close`

Closes a room as a Sogo superuser action. This is for clearing stuck, abandoned,
or unwanted rooms from the shared public game list. During the no-account phase,
the requester must be the selected roster profile whose display name is `Sogo`
or `MojoSOGO`, and the request must include the Worker-configured
`SOGOTABLE_SUPERUSER_PASSCODE` value.

Request:

```json
{
  "code": "ABCD",
  "requester_id": "sogo-player-id",
  "passcode": "passcode"
}
```

Response:

```json
{
  "ok": true,
  "closed": true,
  "room_code": "ABCD",
  "superuser": true
}
```

Normal players receive `{ "ok": false }` and the room remains open.

### `POST /api/superuser/verify`

Verifies a Sogo superuser passcode before the browser accepts the selected Sogo
profile. This endpoint is read-only and does not write the shared state row.

Request:

```json
{
  "requester_id": "sogo-player-id",
  "passcode": "passcode"
}
```

Response:

```json
{
  "ok": true,
  "superuser": true
}
```

If `SOGOTABLE_SUPERUSER_PASSCODE` is not configured on the Worker, verification
fails closed.

## Moves

### `POST /api/room/move`

Request:

```json
{
  "code": "ABCD",
  "player_id": "player-id",
  "board": 0,
  "cell": 0
}
```

Dots and Boxes move request:

```json
{
  "code": "ABCD",
  "player_id": "player-id",
  "line_id": "h-0-0"
}
```

Battleship move requests use an action object. Setup can auto-place a valid
fleet:

```json
{
  "code": "ABCD",
  "player_id": "player-id",
  "action": { "type": "auto_place" }
}
```

Setup can also submit a complete manually placed fleet:

```json
{
  "code": "ABCD",
  "player_id": "player-id",
  "action": {
    "type": "place_fleet",
    "ships": [
      { "id": "carrier", "cells": [{"row": 0, "col": 0}] }
    ]
  }
}
```

During play, attacks use a target cell:

```json
{
  "code": "ABCD",
  "player_id": "player-id",
  "action": { "type": "attack", "row": 4, "col": 6 }
}
```

Quoridor moves use an action object for pawn moves and wall placement:

```json
{
  "code": "ABCD",
  "player_id": "player-id",
  "action": { "type": "move_pawn", "row": 7, "col": 4 }
}
```

```json
{
  "code": "ABCD",
  "player_id": "player-id",
  "action": { "type": "place_wall", "orientation": "h", "row": 4, "col": 3 }
}
```

10,000 moves use action objects for dice flow:

```json
{ "code": "ABCD", "player_id": "player-id", "action": { "type": "roll" } }
```

```json
{
  "code": "ABCD",
  "player_id": "player-id",
  "action": { "type": "select", "dice_ids": ["d1", "d4"] }
}
```

```json
{ "code": "ABCD", "player_id": "player-id", "action": { "type": "reroll" } }
```

```json
{ "code": "ABCD", "player_id": "player-id", "action": { "type": "bank" } }
```

```json
{ "code": "ABCD", "player_id": "player-id", "action": { "type": "ack_farkle" } }
```

Response:

```json
{
  "ok": true,
  "room": {}
}
```

Invalid moves return `{ "ok": false, "error": "..." }`.

For Super Tic Tactical Toe, valid moves may also update `game.pickups`, `game.scores`, `game.captures`, `game.events`, and `game.last_event`. The browser must render these values, not invent them locally.

For Super Tic Tactical Toe, score alone does not end the game. The game ends when a player captures three zones in a macro line; then the highest final score determines the winner. If final scores are tied on that line-completing move, the line completer wins.

For Dots and Boxes, a valid line claim updates `game.lines`, may update
`game.boxes`, updates `game.scores`, records `game.last_move`, and keeps the
same `current_player` only when at least one box was completed.

For Battleship, setup actions mark the player's fleet ready. The game advances
from `setup` to `playing` after both fleets are ready. A valid attack records a
hit or miss in `game.players[mark].shots`, updates `last_move`, changes
`current_player`, and moves to `complete` when all enemy ship cells are hit.

For Quoridor, a valid pawn move updates `game.pawns[mark]`. A valid wall
placement spends one wall from `game.walls_remaining[mark]` and is rejected if
it overlaps, crosses, or leaves either player with no path to their goal edge.
Either valid action changes `current_player`, and reaching the opposite edge
moves the game to `complete`.

For 10,000, a valid roll updates `game.dice` with Worker-owned face values.
Selecting dice adds to `game.turn_score`, rerolling rolls remaining unscored
dice or all six hot dice, banking adds `turn_score` to `game.score`, and a
roll with no scoring dice records a farkle, preserves the final rolled dice
values, and waits for `ack_farkle` before the round is marked complete. Each
seat publishes a canonical `finish_state` so the UI can render a status table
without inferring state from prompts or buttons. The next round starts on the
next roll after everyone has banked or busted and acknowledged their popup.
The farkled seat also exposes a visible OK action in the tray so a missed popup
cannot trap the turn.

## Reset

Reset requires all seated players to agree.

### `POST /api/room/reset`

Request:

```json
{
  "code": "ABCD",
  "requester_id": "player-id",
  "approve": true
}
```

Pending response:

```json
{
  "ok": true,
  "room": {},
  "reset": "pending"
}
```

Declined response:

```json
{
  "ok": true,
  "room": {},
  "reset": "declined"
}
```

When all players approve, the board is reset and `reset` is omitted.

## Invites

### `GET /api/invites?player_id=player-id`

Returns pending invites for a player.

```json
{
  "ok": true,
  "invites": []
}
```

### `GET /api/invites?host_id=player-id&room_code=ABCD`

Returns invite status for host feedback.

### `POST /api/invite/create`

Request:

```json
{
  "code": "ABCD",
  "host_id": "host-player-id",
  "player": {}
}
```

Response:

```json
{
  "ok": true,
  "invite": {}
}
```

### `POST /api/invite/respond`

Request:

```json
{
  "invite_id": "ABCD:player-id",
  "accept": true,
  "player": {}
}
```

Accepted response:

```json
{
  "ok": true,
  "accepted": true,
  "room": {}
}
```

Declined response:

```json
{
  "ok": true,
  "accepted": false
}
```

## Hosted Worker Notes

The hosted Worker stores current playtest state in D1. It uses optimistic locking on the single state row so stale concurrent writes fail instead of silently overwriting newer state.

Active room mutations for `POST /api/room/join`, `POST /api/room/join-bot`, `POST /api/room/leave`, `POST /api/room/close`, `POST /api/room/move`, `POST /api/room/reset`, and invite acceptance through `POST /api/invite/respond` are routed through the room's Durable Object before persistence. The public HTTP request/response contract stays the same, but the room object serializes these changes per room and broadcasts the resulting room snapshot.

If the `ROOM_OBJECT` Durable Object binding is unavailable in production, those
room-authority POST paths fail closed with HTTP `503`:

```json
{ "ok": false, "error": "Room authority unavailable." }
```

They must not fall back to direct Worker mutation routing, because that would
bypass the room object's serialization and live snapshot contract.

App event snapshots include selected-game room lists, lobby players, pending invites, and game stats. The EventHub sends an initial snapshot on socket open/subscription, and the browser reconnects the app event socket when the selected game changes.

Read-only `GET` polling endpoints must not write the whole state row back to D1.

Worker tests live under `workers/tests/` and run with:

```powershell
npm run test:worker
```
