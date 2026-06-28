# Mazewright

Mazewright is a **Game-Locked** SogoTable game (the Yahtzee category): every
player builds their own maze, then everyone races every maze blind. The shared
truth is a leaderboard and three prizes, not a board. Multi-device only — each
player plays on their own device (no hot-seat / local opponent).

## Game shape

- **Board:** a 7×7 fog-of-war dungeon with a brick perimeter.
- **Players:** 1+ (host-start, like 10,000 / Yahtzee). Bots supported.
- **Loot:** the wright hides **3 💎 + 2 🪙** in their maze.
- **Exit:** one **golden archway** on the perimeter.

## Flow — three phases (the room state machine)

1. **BUILD (barrier).** Each player builds a maze on their own device: tap wall
   slots (≤ 30 walls), set the golden exit, drag the pawn + loot. Submitting
   sends only the compact **maze code** (`SUBMIT_MAZE`). The room advances when
   **every human** has submitted. A live, shareable maze code lets you copy/paste
   an exact dungeon.
2. **RUN (async).** The server distributes every maze (the deck) with a
   server-chosen **invert + ±90° rotation** per maze, so even your own dungeon is
   disorienting. Each player runs every maze under fog — moving blind, walls
   revealing on a bump, the arch appearing when reached, loot flying into the
   inventory — and posts only the committed result `{moves, loot}`
   (`POST_RESULT`). In-progress crawling never leaves the device.
3. **TALLY.** When all humans finish, the server awards three prizes:
   - 🧱 **Mazewright** — most moves players cumulatively lost in *their* maze.
   - 🏃 **Mazerunner** — fewest total moves across all mazes.
   - 💎 **Treasure Hunter** — most loot collected.

A **move** = a step OR a wall discovery (a bump). The maze author scores one
point for every move each player takes in their dungeon — the more lost a player
gets, the more the author scores.

## Scoring authority — family-trust

Clients report their own move/loot counts and the server accepts them as-is (a
documented **family-scale exception** — no replay/anti-cheat). The maze code +
server-seeded transform make a future move-log re-validation possible if it ever
matters, but it is intentionally not built.

## Architecture (where the code lives)

- **Shared core** `src/sogotable/static/games/mazewright/rules.js` — the pure maze
  engine (build, fog crawl, transform, maze code, prize math). Imported by both
  the client renderer and the Worker wrapper. No DOM, no network.
- **Client** `src/sogotable/static/games/mazewright/render.js` — the in-game UI
  (build editor, fog crawl, leaderboard, prizes), scoped under `.mazewright-root`,
  driven by the shell ctx bag. The crawl is local-first; only the barrier events
  cross to the server.
- **Server wrapper** `workers/games/mazewright/rules.js` — Game-Locked
  coordination: the build barrier, the run deck + transforms, posted results, the
  leaderboard projection, the three-prize tally, and bot pre-resolution.
- **Wiring:** one `GAME_HANDLERS` row + `initMazewrightSeats` (start/reset) +
  `mazewrightScoreByMark` in `workers/sogotable-api.js`; one `registry.js` row
  (`GAME_IDS.mazewright`); one combined `renderGame` branch + `isMazewrightGameState`
  in `app.js`. Reuses the standard lobby / room / presence / stats flow unchanged.

## Bots

A bot gets an auto-built solvable maze at seat-init (never blocks the build
barrier) and **simulated** run results once the deck is known (never blocks the
run barrier) — the Yahtzee pre-resolved-bot pattern. Bots run the same projection
path as humans.

## No hidden information

Every maze is shared to all runners; the fog is purely client-side rendering. No
per-viewer sanitizer is needed (unlike Battleship).

See [adding-a-game.md](adding-a-game.md) for the integration checklist and
[offline-ui.md](offline-ui.md) for the standalone-prototype conventions this game
was built from.
