# Roll Through the Ages — PLAN

RTTA shipped before the PLAN.md convention; this file was created by the first
Verification Gate run (see `docs/adding-a-game.md`). Gate receipts collect here.

## Gate receipts

```text
GATE projection — 2026-07-01 — 3 gaps —
  1 (med) projection-shape test too shallow: rtta-rules.test.js "projects the full public N-player state" pins only seat_order/players length, players[0].name, phase, monuments key — none of the per-seat fields the client actually reads (cities, food, goods, developments, monumentBoxes, points_lost, score, round_done, ready_next) nor round/status/winner/pending_events; a silent rename (e.g. monumentBoxes → monument_boxes) would pass tests and break board seeding as undefined → extend the test to assert every field render.js/board.js reads off the dict
  2 (low) seat.finish_state emitted but never read by the RTTA client (render.js recomputes the same states from status/phase/round_done/ready_next) → either adopt it (Yahtzee-style news strip uses finish_state) or drop it from the projection
  3 (low) seat.name emitted but never read: render.js resolves names via room.players (seatName) → keep for cross-game dict convention, or read it as the fallback when the room seat is missing
  info: games/render-keys.js carries no RTTA fields (round/monuments/pending_events absent); invalidation currently rides on room.revision + players_state (every RTTA transition also flips a seat flag), so no observed failure — note for the per-game render-key slice refactor
```

## Projection audit (2026-07-01) — field-by-field

Wire contract: `rttaGameToDict` (workers/games/rtta/rules.js:288) vs client reads
(games/rtta/render.js, games/rtta/board.js, games/game-kinds.js, app.js).

**Read but never emitted: none.** Every client read resolves to an emitted field
(incl. `pending_events[].{kind,from,to,amount}`; `room.game_epoch` is room-level
and emitted by the room projection).

| Emitted field | Read by |
|---|---|
| game_id | game-kinds predicate |
| round | render key, standings heading, board round label |
| phase / status / winner | render.js barrier + standings |
| monuments | render.js Mon column; board.js built-monument seed |
| pending_events | eventsHtml + animatePendingEvents (kind/from/to/amount) |
| seat_order | render.js seat count → monuments-in-play |
| players[].mark / is_bot | standings rows |
| players[].cities/food/goods/developments/monumentBoxes/points_lost/score | standings + board seed |
| players[].round_done / ready_next | barrier UI |
| players[].name | **never** (names come from room.players) — gap 3 |
| players[].finish_state | **never** (RTTA recomputes; Yahtzee reads its own) — gap 2 |

Internal-only, correctly not projected: `players[].skulls`, `players[].level`.
