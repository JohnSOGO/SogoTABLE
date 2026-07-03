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
**5 developments** or **every monument in play** is built; highest score wins.
Rules values follow the **2025 rulebook edition** (`AI/RToA/rtta_2025_rules_06.pdf`;
adopted 2026-07-01 — monument worker costs and the non-Pyramid VPs come from the
classic score sheet, the only source for them). The monument set scales with seat
count per that rulebook: Temple and Great Pyramid sit out the 2-player game,
Hanging Gardens the 3-player game; solo and 4+ use all seven. `monumentsInPlay`
on the server and the client's `notAt` lists agree (parity-tested), and the board
renders the set for the room's actual seat count.

## Sync model — live-round, two-phase barrier

Round lifecycle on the server (`workers/games/rtta/rules.js`):

- **`phase: "playing"`** — humans POST one `COMMIT_TURN`; when every human is
  `round_done` the **bots take their turn** (`resolveBotRound`), then the server
  resolves disasters, recomputes scores, and flips to review.
- **`phase: "review"`** — the Discard scoreboard shows totals + disaster events;
  humans POST `READY_NEXT`; when all are ready `advanceRound` bumps the round and
  resets the flags.
- **Bots go last and never block either barrier** — they play through the same
  `applyCommittedTurn` pipeline at the barrier close and are marked `round_done` +
  `ready_next` at once. Going last matters: a pre-committing bot used to snipe
  the first-builder VP on any monument a human was one worker from closing.
- **Skip — the barrier escape hatch** (`{ type:"SKIP_PLAYER", target, round }`):
  a player already done at the current barrier may skip a HUMAN seat that never
  arrived (dropped phone, closed tab), releasing the table. A skipped turn is a
  null turn — that player's sheet is untouched. The waiting screen offers quiet
  per-player ⏭ buttons (two taps to fire) once you yourself are done.

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
- **The commit contract:** `{ type:"COMMIT_TURN", round, cities, cityBoxes[4],
  food, goods[5], monumentBoxes{}, monumentsCompleted[], devBought, skulls,
  pointsLostSelf }`. `cityBoxes/food/goods/monumentBoxes` are **absolute** —
  `cityBoxes` carries partial worker progress on the 4th–7th city (persists
  between rounds like the paper sheet; the server DERIVES `cities` from full
  slots). `devBought/monumentsCompleted/skulls/pointsLostSelf` are **this-turn
  deltas**. The server clamps every range (goods to pegboard maxima, losses to
  the 45-box grid), DERIVES monument completion from the clamped boxes (the
  `monumentsCompleted` list is advisory), and ignores an owned/unknown
  development (idempotent). The `round` stamp rejects a stale tab's commit
  loudly; a failed POST unlatches the board so Submit can be retried.
- **The Build page shows the race:** rivals' partial monument progress (from the
  projection's per-seat `monumentBoxes`, refreshed mid-round as opponents
  commit) tints worker boxes light red under my gold, and each monument badge
  shows 🥇+first-VP while unclaimed, dropping to the later-builder VP once
  someone scores it.
- **`READY_NEXT`** (`{ type:"READY_NEXT", round }`) leaves the review screen.
- **Reconnect** re-seeds the board from the last server seat; an uncommitted turn is
  replayed from the authoritative state (nothing half-applied server-side).

## Cross-player disasters + the Pestilence animation

Resolved once when the barrier closes (`resolveDisasters`), from each player's
`skulls`:

- **Pestilence** (exactly 3 skulls) — every *other* player without **Medicine**
  loses 3 points.
- **Revolt** (5+ skulls) with **Religion** — wipes every opponent's goods.

Self-inflicted disasters resolve on the client during Upkeep and arrive inside the
commit: Drought (exactly 2 skulls, −2 unless Irrigation), Invasion (exactly 4,
−4 unless Great Wall), and Revolt without Religion (5+, all own goods wiped after
collection; a reflected Revolt spares opponents who also own Religion).
**Development timing:** a development bought this round shields from the NEXT
round on — buys land after Upkeep, so it can't dodge this round's disasters —
and the Dev page is locked until Upkeep has run.
Engineering spends stone by choice (a tap-to-convert chip on the Build page,
3 workers per stone, undoable); Granaries sells food into a dev purchase via a
cycling 🌾 chip (6 coins each); Leadership may reroll any die — a skull, even
the choice die — once rolling has ended (3rd roll or an early all-held stop),
and using it makes that roll final.

## Solitaire

A 1-seat room plays the rulebook solo variant: the same loop with **all seven
monuments**, ending after **10 rounds** (`end_reason.kind === "ten_rounds"`) —
or earlier on 5 developments / all monuments. With no opponents, **Pestilence
(3 skulls) costs the roller 3 points** (Medicine immune); the disaster table
says so. Ties can't happen; the tie-break elsewhere is highest remaining goods
value, per the rulebook.

Each is recorded in `pending_events` (`{ from, kind, to[], amount }`). On the review
screen `render.js` animates them: **3 skulls fly from the pestilent player's
standings row to every opponent struck**, the row flashes red, and its Total ticks
down from the pre-disaster score. Deduped by resolution key so a snapshot mid-flight
never replays it.

## Bots

`workers/games/rtta/ai.js` — bots **roll real dice** and run the same pure turn
maths as the human client (imported from the client `rules.js` — one source of
truth, no duplicated tables): roll → hold → tally → upkeep (feeding, famine,
drought/invasion/revolt, honest skulls — a bot can pestilence the table) →
collect goods → workers into the cheapest unclaimed **in-play** monument, then
city boxes (partials persist) → buy ONE development with this turn's actual
coins + whole goods stacks → discard to 6. The commit is exactly a human
payload, and it lands **after every human's** — bots build on the humans'
post-commit board, so a human racing a bot to a monument wins the same-round
tie. The difficulty ladder is strategy, not free resources: level 1 takes
the first roll, level 2 rerolls once (default), levels 3–4 use all three rolls
with deeper monument lookahead, and level 4 buys the highest-VP development it
can afford. A bot spends an owned Leadership rerolling a skull at exactly 2 or
4 skulls (unless immune); Engineering/Granaries taps remain human-only.

## Scoreboard

`Player | 📜 Dev | 🏛️ Mon | ✨ Bonus | 💀 Lost | Total`, sorted by Total desc —
**every column is points** (Dev + Mon + Bonus − Lost = Total), not counts.
Monument points give the first builder the higher VP, later builders the lower;
Bonus is Architecture (+2/monument) and Empire (+1/city). Parts are computed
client-side from the parity-tested tables; Total is the server's authoritative
score — except **my own row while I play**, which projects the in-progress turn
(dev bought, monuments completed, points lost) the moment it happens, wu-wei
style; everyone else's rows settle at the barrier. **A development purchase is
final once ✓ Buy is tapped** (rulebook posture — there is no undo).

## Files

```text
workers/games/rtta/rules.js                    # server: barrier, disasters, scoring, projection
workers/games/rtta/ai.js                       # light bot turn generator
workers/tests/rtta-rules.test.js               # browser-free rules tests
src/sogotable/static/games/rtta/manifest.js    # liveRound, 1–20 players
src/sogotable/static/games/rtta/rules.js       # pure data + DOM-free helpers (shared)
src/sogotable/static/games/rtta/board.js       # lifted turn engine (scoped .rtta-root)
src/sogotable/static/games/rtta/board-art.js   # markup + monument/city artwork
src/sogotable/static/games/rtta/board-fx.js    # pure motion FX (fly/fill animations)
src/sogotable/static/games/rtta/render.js      # multiplayer shell seam + animations
src/sogotable/static/games/rtta/styles.js      # injected CSS (scoped, light + dark)
```

Registry id `7a1c3e9f5b28`. Worker changes ship via `npm run deploy:brain`.
