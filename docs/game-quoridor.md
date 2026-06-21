# Quoridor

Quoridor is the fifth ready SogoTable game.

## Game Shape

- Board: 9x9 cells.
- Players: 2.
- Tokens: each player's selected emoji is their pawn.
- Walls: each player starts with 10 walls.
- Goal: reach the opposite side of the board first.

## Rules

On a turn, a player either moves their pawn or places one wall.

Pawn moves are orthogonal by one cell unless the opponent is adjacent. If the
opponent is adjacent and the space behind them is open, the pawn may jump over.
If a wall blocks that direct jump, the pawn may move diagonally to either open
side of the opponent.

Walls occupy two edge segments and may be horizontal or vertical. A wall is
illegal if it overlaps another wall, crosses another wall, or leaves either
player with no path to their goal edge.

## SogoTable Integration

Quoridor uses the standard SogoTable selected-game lobby, room creation, local
opponent, remote invite, bot invite, reset, exit, and room WebSocket flow. The
Worker owns move validation and state transitions; the browser renders legal
pawn destinations and wall slots from the authoritative room state.

Bots use the global recruitable ladder documented in
`docs/ai-difficulty.md`, and Quoridor maps those four bot ids onto its
four-level behavior model described in
`src/sogotable/static/games/Quoridor/quoridor_ai_rules_four_difficulties.md`.
