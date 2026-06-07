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

Returns the shared player roster.

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

## Lobby Presence

Lobby presence means a player is currently viewing the selected game screen.

### `GET /api/lobby?game_id=super_tic_tac_toe`

Response:

```json
{
  "ok": true,
  "players": []
}
```

### `POST /api/lobby/presence`

Request:

```json
{
  "game_id": "super_tic_tac_toe",
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
  "game_id": "super_tic_tac_toe",
  "started": false,
  "local_mode": false,
  "status": "waiting_for_player",
  "players": [],
  "open_seats": 1
}
```

Full room responses also include `game`, `latest_invite`, and `reset_request`.

Room statuses:

- `waiting_for_player`
- `active`
- `completed`

### `GET /api/rooms?game_id=super_tic_tac_toe`

Returns open and active rooms for a game.

```json
{
  "ok": true,
  "rooms": []
}
```

### `GET /api/rooms?game_id=super_tic_tac_toe&player_id=player-id`

Returns the selected player's unfinished room for that game, if any.

```json
{
  "ok": true,
  "active_room": null
}
```

### `GET /api/room?code=ABCD`

Returns a full room by code.

```json
{
  "ok": true,
  "room": {}
}
```

### `GET /api/room/socket?code=ABCD`

Opens a WebSocket to the room's live update channel.

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
  "game_id": "super_tic_tac_toe",
  "player": {},
  "code": "ABCD"
}
```

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

`POST /api/room/close` is currently equivalent.

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

Response:

```json
{
  "ok": true,
  "room": {}
}
```

Invalid moves return `{ "ok": false, "error": "..." }`.

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

Active room mutations for `POST /api/room/join`, `POST /api/room/leave`, `POST /api/room/close`, `POST /api/room/move`, and `POST /api/room/reset` are routed through the room's Durable Object before persistence. The public HTTP request/response contract stays the same, but the room object serializes these changes per room and broadcasts the resulting room snapshot.

Read-only `GET` polling endpoints must not write the whole state row back to D1.

Worker tests live under `workers/tests/` and run with:

```powershell
npm run test:worker
```
