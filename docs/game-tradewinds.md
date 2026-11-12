# 🏝️ Tradewind Isles

An **original** island trading game in the resource-hex family: dice production,
boardwalks and settlements, trading, a blocker and a card deck. The name, terms,
art (procedural SVG) and look are SogoTable's own. Host-start lobby, 2–6 seats,
bots fill the table. Opaque id `08a6c9699a46`.

## How to play

1. **Setup.** In snake order each seat places a hut on a free corner (no hut on
   a neighbouring corner) and a boardwalk touching it. Your second hut gathers one
   card from every producing hex around it. *Quick setup* (host option) places
   everyone's starting huts automatically.
2. **Each round** the table rolls once. Every hex showing that number pays each
   hut on its corners 1 card and each lodge 2, unless the Mischief Monkey 🐒 sits
   on it. Five resources: timber (Palm Grove), clay (Clay Cliffs), fiber (Sisal
   Meadow), fruit (Mango Orchard), stone (Basalt Quarry). The Volcano pays nothing.
3. **A 7** wakes the monkey. Anyone holding more than the hand limit (default 7)
   discards half. Then this round's **captain** (rotates every round) moves the
   monkey to a new hex and steals one random card from a player with a building there.
4. **Build phase: everyone at once.** Build, trade with the bank (4:1, or 3:1 / 2:1
   at your docks ⚓), trade with players (post an offer; accepted offers are closed
   by the offerer; bots show a "will trade" chip) and play discovery cards. Tap
   **Done** when finished. When every human is done, the bots build and the next round rolls.
5. **First to the renown target (default 10) wins** — instantly, at any moment.

| Build | Cost | Renown |
|---|---|---|
| Boardwalk | timber + clay | — |
| Hut | timber + clay + fiber + fruit | 1 |
| Lodge (upgrade a hut) | 2 fruit + 3 stone | 2 |
| Discovery card | fiber + fruit + stone | — |

Discovery deck (25; 34 on the large island): Ranger ×14 (move the monkey and
steal), Monument ×5 (+1 renown, hidden), Trailblaze ×2 (2 free boardwalks),
Bountiful Tide ×2 (any 2 resources), Market Day ×2 (take every opponent's cards
of one resource). Cards can't be played the round they were bought; one card per
seat per round. Awards: **Grand Causeway** (longest continuous boardwalk, at least 5,
+2) and **Chief Ranger** (at least 3 rangers played and the most, +2).

## Parallel play: who gets a contested spot

Building is a **live round**. Actions resolve the moment the server receives
them. If two players reach for the same corner or edge, the first valid build wins;
the other is **rejected with a reason and keeps its cards**. This is a deliberate
"quick hands" rule, and the help text says so. Bots build at the round barrier,
after every human is done, through the same validation a phone uses. A stalled
player can be skipped by unanimous vote of the players who aren't holding up the
table (`workers/games/skip-vote.js`). Skipping a discarder discards at random;
skipping the captain leaves the monkey where it is.

## Host options

Renown target 8/10/12/14 · hand limit 7/9/11 · island small (19 hexes) / large
(37) / auto (large at 5+ seats) · quick setup · friendly monkey (can't rob
players with 2 or fewer renown). **Helps, all optional:** glow legal spots, odds
dots under numbers, highlight what you can afford.

## Architecture

- **Server:** `workers/games/tradewinds/`. `board.js` (integer-lattice hex
  geometry, island generation, docks, legality, production, longest boardwalk),
  `rules.js` (lifecycle, phases, actions, projection, normalize), `ai.js` (bot
  policy for levels 1–4 + "would a bot take this offer"). The deck order is
  server-secret; hands, discovery cards and monuments are masked per viewer until
  the end. Legal spots are computed server-side and projected, so the UI never
  decides legality.
- **Client:** `src/sogotable/static/games/tradewinds/`. Wire contract: `PLAN.md`.
- **Platform rows:** registry entry, `isTradewindsGameState`, the `GAME_HANDLERS`
  row (with `applyStartOptions` / `carryOptionsOnReset`), the viewer projection
  hook, and the stats score row (renown).
- **Tests:** `workers/tests/tradewinds-rules.test.js`.

## Renaming and swapping assets

- **Rename:** edit `branding.js`, then the `name` in `games/registry.js` and
  `tradewinds/manifest.js` (the architecture test keeps those two equal). Add an
  alias; never change the opaque id.
- **Art and sound:** drop a file in the game folder and point the matching key in
  `assets.js` at it. `null` keeps the procedural art / synth cue.
