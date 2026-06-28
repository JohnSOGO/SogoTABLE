# Mazewright

Mazewright is a **Game-Locked** SogoTable game (the Yahtzee category): every
player builds their own maze, then everyone races every maze blind. The shared
truth is a leaderboard and three prizes, not a board. Multi-device only — each
player plays on their own device (no hot-seat / local opponent).

## Game shape

- **Board:** a 7×7 fog-of-war dungeon with a brick perimeter.
- **Players:** 1+ (host-start, like 10,000 / Yahtzee). Bots supported.
- **Loot:** the wright hides **5 💎** in their maze.
- **Exit:** one **golden archway** on the perimeter.

## Flow — three phases (the room state machine)

1. **BUILD (barrier).** Each player builds a maze on their own device using an
   explicit **edit-mode toolbar** (Walls / Start / Loot / Exit) so each mode lights
   up only its own hitboxes — no overloaded taps. Walls ≤ 30, one golden exit, drag
   the pawn, and **tap-to-pick / tap-to-drop** the gems. Submitting sends only the
   compact **maze code** (`SUBMIT_MAZE`);
   the room advances when **every human** has submitted. Copy/paste of an exact
   dungeon lives behind a collapsed **Advanced** drawer so the default flow is
   build-first, not paste-first.
2. **RUN (async).** The server distributes every maze (the deck) with a
   server-chosen **invert + ±90° rotation** per maze, so even your own dungeon is
   disorienting. Each player runs every maze under fog — moving blind via
   **full-board swipe, a large D-pad, on-board pads, or arrow keys**, walls
   revealing on a bump, the arch appearing when reached. The **uncollected gems
   show through the fog** so the runner can weigh chasing the shiny vs. bolting for
   the exit; grabbed gems fly into the inventory. Each player posts only the
   committed result `{moves, loot}` (`POST_RESULT`). In-progress crawling never
   leaves the device.
3. **TALLY.** When all humans finish, the server awards three prizes and one
   overall champion:
   - 🧱 **Mazewright** — highest **maze score** (see below).
   - 🏃 **Mazerunner** — fewest total moves across all mazes.
   - 💎 **Treasure Hunter** — most loot collected.
   - 🏆 **Champion** — a **rank-weighted composite of all three fields**. Each
     player earns a per-category rank score in `[0, N−1]` (best = N−1; ties share
     the average), weighted **5 author / 3 runner / 3 treasure**:
     `composite = 5·authorRank + 3·runnerRank + 3·treasureRank`. Ties break on
     fewest total moves, then seat order. This is `game.winner`, so an all-round
     2nd-place player beats a one-category specialist — running and treasure matter,
     not just authoring. (Earlier this was a medal-only composite that paid out only
     for *winning* a category; the rank version rewards 2nd/3rd place too.)

### Maze score — reward confusion, not tedium

A **move** = a step OR a wall discovery (a bump). The author does **not** earn a
flat point per move (that rewarded boring, tediously-long corridors). Instead,
for each *other* player who runs the maze:

```
authorScore += clamp(runnerMoves − shortestEscape, 0, 20) + 2 × lootGrabbed
```

So the author is paid for **excess** moves over the shortest escape (the runner
getting *lost*, capped per runner so one wanderer can't dominate) plus a bonus
when the maze baits a runner into grabbing loot. A **self-run never credits its
author** — you can't pad your own score by wandering your own dungeon. This is
the one shared `computeStandings()` in the core, called by both the Worker and the
offline standalone so hosted and local scoring never drift.

`shortestEscape` is transform-invariant (rotation/reflection preserve distances),
so the server-chosen transform is purely UX disorientation — never treat it as
anti-cheat.

## Scoring authority — family-trust, but no open front door

Crawling is local-first; clients post their own `{moves, loot}`. The server does
**not** replay move logs (a documented **family-scale exception**), but it does
**clamp posted results to the feasible band** using the maze it already holds:
`moves` can't beat the maze's shortest escape, and `loot` is capped at the five
hidden items. Submission is likewise validated: a maze must be solvable **and have
every loot reachable from the start** (`canSubmit`), and wall placement is guarded
so you can't trap the treasure mid-build. Full move-log re-validation remains
possible from the maze code if it ever matters, but is intentionally not built.

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
