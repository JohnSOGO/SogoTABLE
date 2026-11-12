# 🚂 Tracklayers

An **original** train-route game on one shared map, the Lantern Isles. Its
mechanics come from the route-building family: collect coloured cards, claim
routes between cities, and complete secret destination tickets. A bonus goes to
the longest line. The name, map and procedural SVG art are SogoTable's own.
Host-start lobby with 2–5 seats; bots fill the table.

It is a **`simultaneousSubmit`** game. Every round each seat locks in one hidden
action. When every human has locked in, the round resolves in a **priority
order** that rotates one seat each round.

## How to play

1. **Start:** you get 4 cards and are offered 3 tickets. Keep at least 2.
2. **Each round, pick one action:**
   - **Draw cards.** Pick 2 from the 5 face-up cards and/or the deck. A face-up
     **Lantern** (wild) card is the whole action. Lanterns drawn blind from the
     deck are fine.
   - **Claim a route.** Tap it on the map, choose a colour for a gray route, and
     pay its length in cards of one colour (Lanterns fill gaps). It uses that
     many trains and scores 1/2/4/7/10/15 points for lengths 1–6.
   - **New tickets.** Draw 3 at the end of the round, then keep at least 1.
3. **Lock in.** Your controls lock and show who the table is waiting for.
4. **Double routes:** one player can never own both tracks. With 3 or fewer
   seats only one of the two may be used at all.
5. **End:** when anyone has 2 or fewer trains left, the next round is the final
   round. Then completed tickets add their points, failed ones subtract them,
   and the longest continuous line(s) score +10.

## Parallel play: contested moves

Claims resolve in priority order. If two players want the same route, the
one with priority builds it. The other keeps their cards and draws one blind
card instead, and the round log says so. Draws also go in priority order (first
pick for everyone, refill, then second pick). A face-up card that is already
gone becomes a blind deck card. A dropped player can be skipped by a unanimous
vote of those who have locked in (`workers/games/skip-vote.js`).

## Helps (device-local, on by default)

- **Ticket path:** rings your ticket cities and marks a suggested shortest path
  over free and own routes.
- **Glow routes I can claim:** highlights routes your hand can pay for now.
- **Ticket progress:** shows done / not yet chips on your tickets.

These hints are advice computed on the client (`advice.js`). They are never the
rules: the server re-validates every move and scores tickets at the end.

## Host options

Trains each: 25 (quick) · 35 (standard) · 45 (long), sent as
`{ tracklayers_options: { trains } }`.

## Architecture

- **Server rules:** `workers/games/tracklayers/`. `map.js` (cities, routes,
  tickets as plain data), `cards.js` (deck + market), `graph.js` (connectivity,
  longest line, shortest path), `legal.js` (commit validation + events),
  `resolve.js` (barrier resolution in priority order), `rules.js` (lifecycle +
  projection), `ai.js` (bots). Deck order and the ticket pile stay
  server-secret. Other seats' hands, tickets and commits are masked until the
  game completes. Tests: `workers/tests/tracklayers.test.js`.
- **Client:** `src/sogotable/static/games/tracklayers/` (see its README).
  `render.js`, `map-svg.js`, `panels.js`, `advice.js`, `lobby.js`, `sfx.js`,
  `styles.js`, `branding.js` and `assets.js`.
- **Platform rows:** registry entry, `isTracklayersGameState`, the
  `GAME_HANDLERS` row, and the stats score row.
- **Wire contract:** `src/sogotable/static/games/tracklayers/PLAN.md`.

## Renaming and swapping assets

- **Rename:** edit `branding.js`, then the `name` in `games/registry.js` and
  `tracklayers/manifest.js` (the architecture test keeps those two equal). City
  names live in the server map. The opaque id `7c31e9a05b42` never changes.
- **Art and sound:** put a file in the game folder and point the matching key in
  `assets.js` at it (`seaImage`, `cardArt[color]`, `sounds.claim`, …). `null`
  keeps the procedural default.
