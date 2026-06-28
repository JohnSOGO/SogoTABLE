# Yahtzee

The first **Game-Locked** game on SogoTable, and the worked example of the
*lockstep-series* variant. Declared locked-in 2026-06-27 — treat as stable; see
[Adding a Game](adding-a-game.md) for the framework this exercises.

## What it is

A **6-game series** of solo Yahtzee played in lockstep. Every seat plays its own
13-round card; the whole table advances to the next game only when **every human**
has finished the current one (a game-level barrier). Overall = the sum of all six
games; the winner is the highest overall.

## Sync model — lockstep Game-Locked

- **Global game index on the server.** `game_index` (1..6) lives on the room game,
  not per seat. A seat fills its card → `card_done`; when all human seats are done,
  the server banks each card into `series_past`, resets the cards, and bumps
  `game_index`. The sixth game completes the series.
- **Bots never block the barrier.** They are pre-played and always "ready"; the
  table waits only on humans.
- **No board is shared** — the shared truth is the leaderboard projection.

## Client ↔ server split (local-first)

- The client **runs its own game** (rolls, holds, scoring all on-device) and posts
  **only committed category scores** via `/api/room/move` (`makeYahtzeeMove`
  records the trusted value). Rolls/holds never leave the client.
- The client does **not** advance the game itself — it posts the last score and
  shows a *waiting* state; the **server** owns the barrier and advances. The next
  snapshot (new `game_index`) re-seeds the local game and fires the celebration.
- **Reconnect** rebuilds the current card + series position from the seat.
- **Projection is the contract:** the per-seat dict emits `game_index`, `round`,
  `round_score`, `series_past`, `overall`, `finish_state`. The client reads these;
  omitting one fails silently (a missing `series_past` once zeroed a player's
  overall on advance — now asserted in tests).

## Bots — 4-level AI, pre-computed, reveal-paced

`workers/games/yahtzee/ai.js` — one EV core, four levels per `AI/Yahtzee/AI Algo.txt`
(evaluated + adapted): **Sprout=Rookie** (common-keep + believable mistakes),
**Buddy=Casual** (pattern chasing), **Cipher=Sharp** (1-ply EV over candidate holds
+ upper-bonus pressure), **Overlord=Ruthless** (EV + regret-aware category
planning). EV enumerates distinct reroll multisets with multinomial probabilities —
cheap enough to play a bot's whole series **synchronously at room start**. Because
they pre-play, bots are **opponent-blind**; their result is **revealed paced to the
leading human's round** so it reads as a live race.

## Leaderboard

`Player | Round# | Round | Game | Overall` — emoji-prefixed name (left); the four
score columns centered. `Round#` = R/13 in the current game (⏳ waiting, ✅ done),
`Round` = current game score, `Game` = G/6, `Overall` = series total.

## Files

```text
workers/games/yahtzee/rules.js   # seat wrapper: barrier, series, projection
workers/games/yahtzee/ai.js      # 4-level bot AI
src/sogotable/static/games/yahtzee/rules.js     # pure single-game rules (shared)
src/sogotable/static/games/yahtzee/render.js    # in-game client (scoped .yz-root)
src/sogotable/static/games/yahtzee/manifest.js
```

Registry id `2c8a5f1e9d74`. Worker changes ship via `npm run deploy:brain`.
