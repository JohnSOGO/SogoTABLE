# Roll Through the Ages: The Bronze Age

A **round-locked, simultaneous, N-player** dice game — the first *live-round*
game on SogoTable. Promoted from the proven single-file prototype in `AI/RToA/`
(which stays put as the design reference). See [Adding a Game](adding-a-game.md)
for the framework this exercises.

## What it is

Every player builds their own Bronze Age civilization **at the same time**, each on
their own device. A turn is the prototype's full loop — Roll → Upkeep (feed cities,
take disasters) → Build (cities + monuments) → Buy a development → Discard. When a
player lands on Discard they submit; the round only **resolves once every human has
submitted** (a per-round barrier). Then cross-player disasters fire, the shared
scoreboard updates, and the next round begins. The game ends when any player owns
**5 developments** or **all 7 monuments** are built; highest score wins.

## Sync model — live-round, two-phase barrier

Round lifecycle on the server (`workers/games/rtta/rules.js`):

- **`phase: "playing"`** — humans POST one `COMMIT_TURN`; when every human is
  `round_done` the server resolves disasters, recomputes scores, and flips to review.
- **`phase: "review"`** — the Discard scoreboard shows totals + disaster events;
  humans POST `READY_NEXT`; when all are ready `advanceRound` bumps the round, resets
  the flags, and lets bots pre-take the new round.
- **Bots never block either barrier** — `resolveBotRound` plays them through the same
  `applyCommittedTurn` pipeline and marks them `round_done` + `ready_next` at once.

## Client ↔ server split (client computes its own turn)

A family game, not a security exercise — so the **client computes its whole turn**
and the server owns only the *shared* truth (barrier, cross-player disasters,
authoritative score) with light **trust-but-clamp** validation, never a turn replay.
This is the primary Worker-load reduction: **one committed action per player per
round**, not per-die/per-build messages.

- `src/sogotable/static/games/rtta/board.js` seeds each round from the player's
  server seat (cities → dice, food, goods, owned developments, monument boxes,
  cumulative points lost), plays the local turn, and on **Submit** packages ONE
  `COMMIT_TURN` → `ctx.makeMove`.
- **The commit contract:** `{ type:"COMMIT_TURN", cities, food, goods[5],
  monumentBoxes{}, monumentsCompleted[], devBought, skulls, pointsLostSelf }`.
  `cities/food/goods/monumentBoxes` are **absolute**; `devBought/monumentsCompleted/
  skulls/pointsLostSelf` are **this-turn deltas**. The server clamps ranges and
  ignores an already-recorded monument or an owned/unknown development (idempotent).
- **`READY_NEXT`** (`{ type:"READY_NEXT" }`) leaves the review screen.
- **Reconnect** re-seeds the board from the last server seat; an uncommitted turn is
  replayed from the authoritative state (nothing half-applied server-side).

## Cross-player disasters + the Pestilence animation

Resolved once when the barrier closes (`resolveDisasters`), from each player's
`skulls`:

- **Pestilence** (exactly 3 skulls) — every *other* player without **Medicine**
  loses 3 points.
- **Revolt** (5+ skulls) with **Religion** — wipes every opponent's goods.

Each is recorded in `pending_events` (`{ from, kind, to[], amount }`). On the review
screen `render.js` animates them: **3 skulls fly from the pestilent player's
standings row to every opponent struck**, the row flashes red, and its Total ticks
down from the pre-disaster score. Deduped by resolution key so a snapshot mid-flight
never replays it.

## Bots

`workers/games/rtta/ai.js` — a deliberately light family-game opponent (not an
optimiser): a rough per-round worker yield poured into the cheapest unclaimed
monument (completing it when reached), leftover workers grow a city, and the cheapest
still-missing development bought now and then (more eagerly at higher levels — which
is also how a bot drives the game toward its end). Bots keep no skulls, so they never
trigger disasters. Cost tables are duplicated in `ai.js` to avoid an import cycle.

## Scoreboard

`Player | Cities | Mon | Dev | −Lost | Total`, sorted by Total desc. `Mon` counts
monuments this player has a claim on; first builder of a monument scores its higher
VP, later builders the lower.

## Files

```text
workers/games/rtta/rules.js                    # server: barrier, disasters, scoring, projection
workers/games/rtta/ai.js                       # light bot turn generator
workers/tests/rtta-rules.test.js               # browser-free rules tests
src/sogotable/static/games/rtta/manifest.js    # liveRound, 1–20 players
src/sogotable/static/games/rtta/rules.js       # pure data + DOM-free helpers (shared)
src/sogotable/static/games/rtta/board.js       # lifted turn engine (scoped .rtta-root)
src/sogotable/static/games/rtta/render.js      # multiplayer shell seam + animations
src/sogotable/static/games/rtta/styles.js      # injected CSS (scoped, light + dark)
```

Registry id `7a1c3e9f5b28`. Worker changes ship via `npm run deploy:brain`.
