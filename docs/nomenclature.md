# Nomenclature

This document records the SogoTable game-space language adopted from
`AI/Nomenclature.md`.

## Core Hierarchy

Use this hierarchy when designing docs, UI copy, rules, and future game state:

```text
Table -> Board -> Zone -> Cell
```

### Table

The table is the full game session or play experience.

It can include:

- board state
- players
- scores
- off-board assets
- hidden information
- timing or turn state
- room/session metadata

In the current hosted app, a `Room` is the multiplayer transport/session
container with a room code. The `Table` is the game-state concept inside that
room: the thing players are gathered around and playing on.

**User-facing copy says "Table" (adopted 2026-06-28).** All visible UI text and
user-facing error messages (e.g. "Table is full.", "Table code", "Close table?")
say *Table*, never *Room*. `Room` survives only as an internal term: code
identifiers, API paths (`/api/room/*`), the `room_code` field, WebSocket message
types (`room_snapshot`), Durable Object names, and CSS classes/IDs. Do not rename
those — see Legacy Compatibility below.

### Board

The board is the main visible play surface.

For Super Tic Tac Toe and Super Tic Tactical Toe, the whole nested 9x9 play
surface is the board.

### Zone

A zone is a major playable area on the board.

For Super Tic Tac Toe and Super Tic Tactical Toe, the board has nine zones. Each
zone is a local 3x3 area. Prefer `zone` over `sector`, `region`, `area`, or
calling each local 3x3 area a board.

### Cell

A cell is the smallest playable square inside a zone.

For Super Tic Tac Toe and Super Tic Tactical Toe, each zone has nine cells.

### Asset

An asset is a token, pickup, card, emoji, coin, chest, or other game object that
is not the structural board itself.

Useful asset categories:

- `boardAsset`: visible on the board
- `offBoardAsset`: visible outside the board, such as a hand, bank, queue, or tray
- `hiddenAsset`: owned by the game state but not visible to every player

## Recommended State Names

Use these names for new game modules where practical:

- `table`
- `tableId`
- `board`
- `boardId`
- `zoneId`
- `cellId`
- `playerId`
- `assetId`
- `activeZoneId`
- `selectedCellId`
- `claimedZones`
- `openCells`
- `zoneOwner`
- `cellOwner`
- `spawnedAssets`
- `turnState`
- `scoreState`

## Legacy Compatibility

The current Super Tic Tac Toe code and API still contain older field names such
as `boards`, `small_winners`, `next_board`, and some tactical event text that
uses `sector`.

Those names are compatibility details, not preferred product language. Do not
rename them casually in a docs-only pass. If the runtime is migrated later, do it
as an explicit API/code migration with tests and compatibility aliases.

For now:

- Docs and UI thinking should say `zone`.
- Existing code fields may keep `board` or `sector` names until deliberately migrated.
- API docs should explain that any legacy `sector` field means `zone`.
