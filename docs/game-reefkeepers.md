# 🐚 Reefkeepers

An **original** domino-drafting builder. Its mechanics come from the familiar
"draft a two-terrain domino, grow a 5×5 realm, score area × crowns" family. The
name, theme (a coral reef around your home grotto), deck, procedural SVG art and
sounds are SogoTable's own. Host-start lobby, 1–8 seats, bots fill the table.

It is a **simultaneous-submit** game (see [Game Integration Spec](game-integration-spec.md) §5).
Everyone places their tile and ranks the tiles they want **at the same time**. The
barrier closes when every human has locked in; bots commit last through the human
path; then the round resolves together.

Opaque id: `661942bc1422` (never changes). Code dirs: `workers/games/reefkeepers/`,
`src/sogotable/static/games/reefkeepers/`.

## How to play

1. You start with a **Grotto** (your home tile) in the middle of an empty reef.
2. Each round a row of face-up **reef tiles** is laid out, lowest number first. Each
   tile has two halves, each a habitat, and some halves hold **pearls**.
3. In the same move you **place** the tile you claimed last round and **rank** the
   tiles you want from the new row (1st choice, optional 2nd and 3rd).
4. A placed tile must touch your Grotto or match a habitat it touches, and your reef
   must fit inside a 5×5 square (7×7 on the *Grand reef* option). If a tile cannot
   go anywhere it drifts away (discarded).
5. Score each habitat patch: **cells × pearls** in it. Highest reef wins.

### Who gets the tile you wanted (the draft rule)

Claims resolve in **claim order**: whoever claimed the **lowest-numbered** tile last
round chooses first this round (round 1: a random order). Each seat gets its highest
ranked choice that is still free. If all your choices were taken you get the free
tile the autopilot rates best for your reef, and the round log says so ("P3's picks
were taken, P1 chose first"). Low tiles are weaker but buy you first choice next
round. Arrival order never matters.

## Habitats (rule ids → display)

| Rule id | Display | Notes |
|---|---|---|
| `sand` | Sandbar | common, few pearls |
| `kelp` | Kelp Forest | |
| `lagoon` | Lagoon | |
| `seagrass` | Seagrass Meadow | |
| `coral` | Coral Garden | rarer, more pearls |
| `trench` | Deep Trench | rarest, most pearls |

## Host options (all helps optional)

| Option key | Values (default first) | Kind |
|---|---|---|
| `size` | `5` \| `7` (Grand reef, twice the rounds) | rule |
| `heart_bonus` | `true` \| `false` — +10 if the Grotto sits dead centre of a full-size reef | rule |
| `full_bonus` | `true` \| `false` — +5 if your reef fills its whole square | rule |
| `show_spots` | `true` \| `false` — highlight legal cells | help |
| `live_score` | `true` \| `false` — show running scores during play | help |
| `hints` | `false` \| `true` — suggest a placement and a pick | help |

## Wire contract

### Grid coordinates

The Grotto is at `(0,0)`. Cells are integer `(x,y)`, x to the east, y to the south.
A placement is `{ x, y, rot }`: the tile's **A half** goes on `(x,y)` and its **B
half** on `(x,y) + DIR[rot]`, with `DIR = [[1,0],[0,1],[-1,0],[0,-1]]` (0 east,
1 south, 2 west, 3 north). Both cells must be free, the bounding box of all cells
(Grotto included) must stay within `size × size`, and at least one half must be
orthogonally next to the Grotto or to a cell of the same habitat.

### Tile

`{ id: "t17", n: 17, a: "kelp", ap: 0, b: "coral", bp: 1 }` — `n` is the draft number
(lower = weaker = earlier claim next round). With several deck copies (big tables
or Grand reef) ids are `"t17"`, `"t17b"`, … and `n` stays the tile's strength.

### Projected game (`toDict`, then masked per viewer)

```js
{
  game_id, status: "playing" | "complete", phase: "playing",
  round: 1,                 // barrier stamp; one barrier per round
  rounds_total: 13,         // size 5: 12 drafts + 1 final place-only round
  options: { size, heart_bonus, full_bonus, show_spots, live_score, hints },
  seat_order: ["P1", …],
  claim_order: ["P2", "P1", …],   // who chooses first THIS round
  offer: [Tile…],           // the row being drafted this round, sorted by n; [] in the final round
  line_size: 3,             // tiles per row = max(3, seats)
  deck_count: 30,           // deck itself is server-secret
  players: {
    P1: {
      is_bot, level, name?,
      cells: [{ x, y, t: "kelp", p: 1 }, …],  // placed halves; Grotto is implicit at (0,0)
      pending: Tile | null,  // the tile to place this round (null in round 1)
      legal: [{ x, y, rot }…],               // legal spots for `pending` (viewer's own only after masking)
      has_committed: bool,
      committed: { place, picks } | null,     // masked to null for other seats until resolved
      skipped: bool,
      discards: 0,
      score: { total, regions: [{ t, size, pearls, points }], heart: 0, full: 0 } | null, // null for others when live_score off
      hint: { place: {x,y,rot}|null, pick: tileId|null } | null, // viewer only, only when hints on
    },
  },
  skip_votes: { [target]: [voter…] },
  events: [{ seq, type, mark, … }],   // last ~40; types: placed, discarded, picked, bumped, round, final
  event_seq: 57,
  winner: "P2" | null,
  results: [{ mark, total, largest, pearls, rank }] | null, // on complete, sorted by rank
  move_count,
}
```

### Actions (`ctx.makeMove`)

```js
{ type: "COMMIT", round, place: { x, y, rot } | null, picks: ["t17", "t9"] }
{ type: "SKIP_PLAYER", target: "P3" }
```

- `place` is required when `pending` is set **and** a legal spot exists; it must be
  `null` when `pending` is null. If no legal spot exists, send `null` and the tile is
  discarded.
- `picks` is 1–3 distinct ids from `offer` when the offer is non-empty, else `[]`.
- Duplicate commit in the same round: ignored (first wins). Wrong round: rejected
  loudly. Commit from a skipped seat: rejected loudly.
- A skipped seat is played by the level-2 autopilot for that round.

## Architecture

- **Server rules:** `workers/games/reefkeepers/` — `tiles.js` (habitats, the deck),
  `board.js` (legality, regions, scoring), `rules.js` (lifecycle, barrier, draft
  resolution, projection), `ai.js` (bot levels 1–4, also the autopilot).
- **Client:** `src/sogotable/static/games/reefkeepers/` — `render.js` (+ view helpers),
  `art.js` (procedural SVG), `branding.js` (every name and string), `assets.js`
  (palette, art and sound overrides), `lobby.js` (host options), `sfx.js`, `styles.js`.
- **Platform rows:** registry entry, `isReefkeepersGameState`, the `GAME_HANDLERS` row
  (with `applyStartOptions` / `carryOptionsOnReset`), the viewer projection hook,
  the stats score row.

## Out of scope

- Hot-seat (several players on one phone) is not supported; every seat plays from its own device or is a bot.

## Renaming and swapping assets

- **Rename:** edit `branding.js`, then the `name` in `games/registry.js` and
  `reefkeepers/manifest.js` (the architecture test keeps them equal). Add an alias.
- **Art and sound:** drop a file in the game folder and point the matching key in
  `assets.js` at it (`habitats[id]`, `grotto`, `pearl`, `sounds.place`, …). `null`
  keeps the procedural SVG / synth cue.
