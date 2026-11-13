# 🏰 Realmwright

An **original** tile-laying game on one shared board. Its mechanics come from the
familiar roads / cities / cloisters / fields family. The name, artwork (procedural SVG) and look are
SogoTable's own. Host-start lobby, 1+ players, bots fill the table.

It is the first **`liveRound` game on a shared board**. Every round each seat holds
its own tile, and everyone places at the same time. Placements resolve
immediately in server-received order. The next round deals once every seat has
placed. See [Live Rounds](live-rounds.md).

## How to play

1. Each round you are dealt one land tile. Rotate it and tap a glowing cell. A
   strong glow means it fits as rotated, and a dim dashed outline means it fits
   in another rotation. If the host turned **Show valid spots** off, nothing
   glows: tap any free cell next to the board, rotate, and a red outline means
   it doesn't fit.
2. Optionally stand a **meeple** on one feature of that tile: a city, road,
   cloister, or (with farmers on) a field. You can only claim a feature nobody
   holds yet.
3. Confirm. Features that close score immediately for the seat(s) with the most
   meeples on them, and those meeples come home.
4. When the bag runs dry, incomplete features and fields score, and the highest
   total wins.

## Parallel play: who wins a shared spot

The first valid placement the server receives wins. A later one that no longer
fits (cell taken, edges changed, feature now claimed) is **rejected with a
reason**. The player keeps their tile and picks again from the fresh board. If
the board changes so that an unplaced tile can no longer go anywhere, the server
discards it and deals that seat a new one (`tile_serial` bumps). Bots play during
the round like everyone else, after a per-level think-time (easy 15+1d5 s,
intermediate 10+1d5 s, hard 5+1d5 s). The Worker has no timers, so a player's
phone sends `BOT_TICK` when a bot's time comes. A
dropped player can be skipped by unanimous vote of those who have already
placed (`workers/games/skip-vote.js`).

## Round timer (optional)

With a round timer set in the lobby, the countdown sits in the status bar
and any seated player can tap it to pause or resume (the server freezes the
time left). From 10 s a wooden tick sounds each second for anyone who hasn't
placed, sharper for the last 3, and a gong at zero. At the deadline the
server places any bot still thinking and skips every human still holding a
tile (tile back in the bag, `skip` event with `timeout: true`); the next
round deals. The Worker has no timers, so clients nudge it with `BOT_TICK`
at the deadline (`bot-tick.js`); the countdown and sounds live in
`round-timer.js`. Projection: `round_deadline` (server ms, 0 = untimed or
paused) and `timer_paused_left` (ms).

## Scoring

| Feature | Completed | End of game |
|---|---|---|
| Road | 1 / tile | 1 / tile |
| City | 2 / tile + 2 / pennant (*small city*: a 2-tile city scores 2) | 1 / tile + 1 / pennant |
| Cloister | 9 | 1 + neighbours |
| Field (farmers on) | — | 3 per completed city it touches |

Majority wins and ties share. The scoreboard can show a live **projected** total
that includes fields (the *live tally* option).

## Host options

Farmers on/off · live tally on/off · show valid spots on/off · round timer off/30s/45s/1m/1½m/2m · meeples 5–10 · small-city rule · deck
standard (72) / quick (~36) / big (×2 for big tables). Full table and wire
contract: `src/sogotable/static/games/realmwright/PLAN.md`.

## Architecture

- **Server rules:** `workers/games/realmwright/`. `tiles.js` (port geometry +
  tilesets, the expansion seam), `board.js` (derived feature graph, legality,
  scoring, `FEATURE_KINDS`), `rules.js` (lifecycle, parallel rounds,
  projection), `ai.js` (bot levels 1–4). The bag is server-secret. Legal
  placements are computed server-side and projected, so the UI never decides
  legality.
- **Client:** `src/sogotable/static/games/realmwright/`. `render.js` (+ helpers),
  `art.js` (procedural SVG from tile definitions), `assets.js` (art and sound
  overrides), `branding.js` (all names and strings), `lobby.js` (host options),
  `sfx.js`, `styles.js`.
- **Platform rows:** registry entry, `isRealmwrightGameState`, the
  `GAME_HANDLERS` row (with `applyStartOptions` / `carryOptionsOnReset`), the
  viewer projection hook, and the stats score row.

## Renaming and swapping assets

- **Rename:** edit `branding.js`, then the `name` in `games/registry.js` and
  `realmwright/manifest.js` (the architecture test keeps those two equal). The
  opaque id `4d8e2b6a9c13` never changes.
- **Art and sound:** put a file in the game folder and point the matching key in
  `assets.js` at it (`tiles[typeId]`, `meeple`, `sounds.place`, …). `null` keeps
  the procedural default.

## Expansions

Add a tileset to `TILESETS` in `tiles.js` (namespaced ids such as `river:…`).
If it brings a new feature kind, add one row to `FEATURE_KINDS` in `board.js`,
then list its id in the `expansions` option. The client draws any tile from the
projected `tile_defs`, so new tiles need no client code.
