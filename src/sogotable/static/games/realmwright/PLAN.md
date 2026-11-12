# Realmwright — plan + wire contract

An **original** tile-laying game for SogoTable: draw a land tile, lay it so its
edges match the realm, optionally stand one of your **meeples** on a feature of
that tile (city, road, cloister, or — when enabled — a field as a farmer), and
score features as they close. Mechanics follow the well-known tile-laying
family (tile mix and scoring values are the familiar ones); the **name, art,
and look are our own** — all artwork is procedural SVG drawn in `art.js`, and
every asset is swappable (see *Assets & renaming*).

What makes it SogoTable: **parallel play**. Every round, everyone holds their
own tile and places it whenever they like — no waiting for turns.

## Intake survey (docs/adding-a-game.md)

- **A. Seating/timing:** multi-device rooms, host-start lobby, 1+ humans, bots
  fill. Shared-table **`liveRound`** (Round-Locked): one shared board, one tile
  per seat per round, placements resolve **immediately in server-received
  order**; the next round deals when every seat has placed.
- **B. Client/server split:** the client only previews (rotate, pick a spot,
  pick a meeple spot). ONE actionable event per seat per round:
  `PLACE_TILE` (tile + optional meeple, atomic). The server computes and
  projects the legal placements, so the UI never decides legality.
- **C. Hidden info:** none that matters (tiles are shown face-up when drawn).
  The **bag order** is server-secret (stripped; only `bag_count` is sent). The
  viewer projection trims `legal` to the viewer's own seat (bytes, not secrecy).
- **D. State:** plain data (below). RNG behind `setRealmwrightRandom` (bag
  shuffle). Board features are **derived** from the placement list every time
  (union-find over tile ports), never stored — deterministic and replayable.
- **E. Assets:** procedural SVG (tiles, meeples, cloister, pennants) +
  synthesized SFX; overridable through `assets.js`.
- **F. Bots:** levels 1–4 (Sprout/Buddy/Cipher/Overlord), same `placeTile`
  path as humans; bots place at the round barrier (after every human), in seat
  order — the RTTA/Potion Lab precedent ("bots go last, never block").
- **G. Reuse:** standard lobby (`renderHostStartLobby`), rooms, invites,
  presence, stats, skip-vote. Nothing custom.
- **H. Rules source & deviations:** see *Deviations*.

## Parallel play — how a shared board resolves

1. **Round opens:** each seat is dealt one tile (seat order). A dealt tile with
   no legal spot anywhere is discarded and redrawn (classic rule).
2. **Anyone places, any time.** `PLACE_TILE` is validated against the
   **current** board and applied at once: tile placed → completed features
   scored → meeples on them returned. First-come wins.
3. **Conflicts** are just stale intents and are **rejected with a reason**:
   - spot already taken → "Someone just built there — pick another spot."
   - edges no longer match / no neighbour → "That spot no longer fits."
   - meeple feature now joined to a claimed feature → "That city was just
     claimed — place without a meeple or pick another feature."
   The client re-renders from the fresh snapshot; the player's tile stays theirs.
4. **Knock-on redraw:** after every placement the server re-checks every
   unplaced seat's tile. If it can no longer go anywhere it is discarded and
   that seat gets a fresh tile (`tile_serial` bumps, `redraw` event).
5. **Barrier:** when every human has placed (or been skipped), bots place in
   seat order, then the next round deals. An all-bot table runs straight
   through (loop with a guard).
6. **Game end:** after the round in which the bag ran dry (seats that get no
   tile in the final deal simply sit it out). Then end-game scoring.
7. **Skip (dropped phone):** `SKIP_PLAYER` vote via `workers/games/skip-vote.js`
   — voters are humans who already placed this round; target is an unplaced
   human. Unanimous. A skipped seat's tile goes back to the bottom of the bag.

## Rules (base game)

- **Placement:** empty cell, orthogonally adjacent to ≥1 tile, every touching
  edge matches (port-by-port kind equality). Rotation 0–3 (clockwise).
- **Meeple:** optional, only on the tile just placed, only on a feature whose
  merged (board-wide) feature has no meeple, only if `meeples_left > 0`.
  Fields only if `options.farmers === "on"`.
- **Scoring when completed** (immediately, during the round):
  - road: 1 / tile · city: 2 / tile + 2 / pennant (**small_city** option: a
    completed 2-tile city scores 1 / tile + 1 / pennant, i.e. 2 — or 3 with a pennant) · cloister: 9 (tile + 8 neighbours).
  - Majority: the seat(s) with the most meeples on the feature all score it;
    every meeple on it returns.
- **End game:** incomplete road 1/tile · city 1/tile + 1/pennant · cloister
  1 + neighbours · fields (if farmers on): 3 per **completed** city touching
  the field, majority per field. Meeples on fields never return mid-game.
- **Winner:** highest score; tie → shared result order by seat order.

## Options (host lobby → `/api/room/start` as `realm_options`)

| key | values | default | effect |
|---|---|---|---|
| `farmers` | `"on"` / `"off"` | `"on"` | fields are claimable + scored at end |
| `live_tally` | `true` / `false` | `true` | scoreboard shows a live **projected** total (incomplete features + fields as if the game ended now) next to the banked score |
| `show_spots` | `true` / `false` | `true` | glow the cells where the dealt tile fits. Off: no glow; the player taps any free cell next to the board, rotates through all four turns, and a spot that does not fit previews red with Confirm disabled. The server still projects `legal` (the client checks against it; it never computes legality) |
| `time_limit` | `0` / `30` / `45` / `60` / `90` / `120` | `0` | seconds per round (0 = untimed). At the deadline bots still thinking place and humans still holding a tile are skipped; `PAUSE_TIMER` / `RESUME_TIMER {round}` freeze and restart it. Projection adds `round_deadline` and `timer_paused_left` |
| `meeples` | 5–10 | 7 | meeples per seat |
| `small_city` | `true` / `false` | `false` | completed 2-tile city scores 2, not 4 |
| `deck` | `"standard"` / `"quick"` / `"big"` | `"standard"` | 72 tiles · ~half (ratios kept) · ×2 for big tables |
| `expansions` | `[]` | `[]` | reserved: ids of registered tilesets/feature kinds |

## Server state (plain data, `workers/games/realmwright/rules.js`)

```js
{
  game_id, status: "playing" | "complete", round, move_count,
  options: { farmers, live_tally, show_spots, time_limit, meeples, small_city, deck, expansions },
  seat_order: ["P1", ...],
  players: { [mark]: { is_bot, level, score, meeples_left,
    breakdown: { city, road, cloister, field },
    tile: typeId | null, tile_serial, placed, skipped } },
  board: [ { x, y, t: typeId, r: 0..3, by: mark | null, round,
             meeples: [ { f: featureIdx, mark } ] } ],   // placement order; start tile by:null
  bag: [typeId, ...],          // SECRET — stripped from every projection
  events: [ ... last 40 ... ],
  skip_votes: {}, winner, results,
}
```

## Wire contract — the projection IS the contract

`realmwrightGameToDict(game)` →

```js
{
  game_id, status, round, move_count, options, seat_order, winner,
  bag_count,
  tile_defs: { [typeId]: TileDef },     // every type that can appear this game
  board: [ { x, y, t, r, by, round, meeples: [ { f, mark } ] } ],
  players: [ { mark, is_bot, score, projected, breakdown, projected_breakdown,
               meeples_left, meeples_total, tile, tile_serial, placed, skipped } ],
  legal: { [mark]: [ { x, y, r, meeples: [featureIdx, ...] } ] },  // unplaced seats only
  events: [ Event ],
  skip_votes: { [target]: [voter, ...] },
  results: null | [ { mark, score, breakdown } ],   // best first, at game end
}
```

`realmwrightGameToDictForViewer(dict, viewerMark)` keeps only `legal[viewerMark]`.

**TileDef** (unrotated; the shared geometry):

```js
{ id: "base:city1-road", count, start?: true,
  features: [ { kind: "city" | "road" | "field" | "cloister",
                ports: [0..11],          // empty for cloister
                anchor: [ux, uy],        // meeple spot, unit tile coords 0..1
                pennant?: true,          // city only
                cities?: [featureIdx] }  // field only: city features it touches
  ] }
```

**Ports** — 12 per tile, clockwise from the north-west third:
N `0 1 2` (west→east), E `3 4 5` (north→south), S `6 7 8` (east→west),
W `9 10 11` (south→north). Middle ports (1, 4, 7, 10) carry roads; a city side
owns all three ports of that side; fields own the rest. Rotation `r` (clockwise
quarter turns) maps port `p → (p + 3r) % 12` and anchor `(u,v) → (1−v, u)` per
turn. Neighbour `N` is `(x, y−1)` (y grows down); port `3s+k` meets the
neighbour's port `3((s+2)%4) + (2−k)`.

**Event:** `{ seq, type, round, mark?, x?, y?, kind?, points?, marks?, cells? }`
- `place` (mark, x, y, meeple?: kind) · `score` (kind, points, marks = winners,
  cells = [[x,y]...] of the feature) · `redraw` (mark) · `skip` (mark) ·
  `round` (round opened) · `end`.

**Actions** (`ctx.makeMove(action)`):
- `{ type: "PLACE_TILE", round, serial, x, y, r, meeple: featureIdx | null }`
  — `serial` must equal the seat's `tile_serial`; a mismatched `round`/`serial`
  is rejected loudly as stale.
- `{ type: "SKIP_PLAYER", target, round }` — toggles a skip vote.
- `{ type: "BOT_TICK", round }` — any seated human's client sends it once the
  earliest unplaced bot's `act_at` has passed; due bots place (earliest
  first). Rejected without a write ("No bot is ready yet.") when none is due.

**Bot timing (MojoSOGO 2026-11-12):** bots act during the round like players,
after a think-time of BASE + 1d5 s from round open (`BOT_DELAY_BASE_S`: easy 15,
intermediate 10, hard/overlord 5). The projection carries `round_opened_at`,
`server_now` (to map server time onto the client clock) and `players[].act_at`
(non-zero only for an unplaced bot). Any action first releases bots already
due, so server order stays fair. An all-bot table plays straight through.
Score events carry `meeples: [{x, y, f, mark}]` (who stood there) and end-game
ones `final: true`.

## Expansion seam

- `workers/games/realmwright/tiles.js` exports `TILESETS = { base: {...} }`;
  an expansion is a new tileset entry (namespaced type ids like `river:...`)
  plus, if needed, a new feature kind in `board.js`'s `FEATURE_KINDS` table
  (`{ claimable(options), isComplete(feature), scoreComplete(feature, options), scoreEnd(feature, ctx) }`). The bag builder
  composes `["base", ...options.expansions]`. The client draws from
  `tile_defs`, so new tiles render with zero client changes (art keys off
  feature kinds, not tile ids).

## Assets & renaming

- `src/sogotable/static/games/realmwright/branding.js` — every user-facing
  name (game, piece, features, blurb). Renaming the game = edit `branding.js`
  plus the `name` in `games/registry.js` and `manifest.js` (the architecture
  test pins those two equal). The opaque id never changes.
- `src/sogotable/static/games/realmwright/assets.js` — palette + optional
  per-tile image overrides (`tiles: { [typeId]: url }`), meeple image, and SFX
  file overrides. `null` = use the procedural SVG / synth default.

## Deviations (intended)

- Parallel rounds instead of turns (the whole point); bots go last per round.
- One `PLACE_TILE` carries tile + meeple atomically (no separate meeple step
  on the wire).
- Seats that receive no tile in the final deal sit that round out.
- Ties are shared (no tiebreak), matching the rulebook.

## Verification gates

(receipts appended below by fresh-session gate runs)

GATE Rules fidelity — 2026-11-12 — 1 gap — all 24 types / 72 tiles / 10 pennant tiles / start tile verified port-by-port (two-cap tiles: separate cities, shared field touches both); scoring probes (tie-merge, road loop, cloister+city same tile, one city → two fields, small_city, end-game incomplete) all correct · farmer-never-returned was not pinned on the rules path → test "closing a city returns its knight but never the farmer beside it"
GATE Projection — 2026-11-12 — pass — every client read (players[].{mark,is_bot,score,projected,breakdown,projected_breakdown,meeples_left,meeples_total,tile,tile_serial,placed,skipped}, legal, board[].{x,y,t,r,by,round,meeples}, events[].{seq,type,round,mark,meeple,kind,points,marks,cells}, tile_defs, seat_order, round, status, bag_count, options.live_tally, options.show_spots, results, skip_votes) is emitted; emitted-unread only move_count/winner/other options (harmless); shape pinned by "projection shape is exactly the wire contract"
GATE Sibling parity — 2026-11-12 — pass — bots use applyPlacement + legal list (bag count only, no order); 1 vs 12 seats finish on every deck; view state keyed room#epoch + round|serial|tile, sfx cursor primes on first snapshot (no replay on load; a socket resume without reload plays ≤6 missed cues — accepted); one layout everywhere (420px query only shrinks type), pointer events for touch + mouse
GATE Resilience — 2026-11-12 — 3 gaps — meeple false/true/[] coerced to feature 0/1 via Number() → strict integer/digit-string parse + test · "__proto__"/"constructor" as mark or skip target resolved to Object.prototype → Object.hasOwn seat lookup + test · barrier CPU: 11 Overlord bots on the big deck ≈ 300 ms worst per barrier and a 12-bot big-deck table plays its whole game (≈1.3 s, Node) inside /api/room/start → OPEN (fine on Workers paid 30 s, exceeds free-plan 10 ms; mitigate by scaling ai.js CANDIDATES with seat count). Noted, not a bug: a skip in the dry final round puts the tile back and the extra round deals it to seat_order[0].

| Effect | Fires when | Exactly | Bounds | Owner | Pinned by |
|---|---|---|---|---|---|
| Setup | init | start `base:city1-road-straight` at (0,0) r0, removed from bag; bag = 71 (std) / 42 (quick) / 143 (big) shuffled; each seat `meeples` (7, 5–10); one tile dealt per seat in seat order, dead tiles discarded | 1–12 seats | rules.js initRealmwrightSeats/buildBag | init, deck option tests |
| Placement | PLACE_TILE | empty cell, ≥1 neighbour, every touching port same kind; r 0–3 | \|x\|,\|y\| ≤ 999 | board.js fits | legality tests |
| Meeple | with placement | ≤1, on placed tile only, merged feature unclaimed, meeples_left > 0, field only if farmers on | strict integer index | rules.js applyPlacement | loud errors, garbage meeple |
| Road complete | placement closes | 1 / tile → majority (ties share), meeples return | loops count once per tile | board.js FEATURE_KINDS.road | completed road |
| City complete | placement closes | 2 / tile + 2 / pennant; small_city: 2-tile city = 1/tile (+1/pennant) | — | FEATURE_KINDS.city | completed city, shared majority |
| Cloister complete | 9 cells filled | 9 | own + 8 neighbours | FEATURE_KINDS.cloister | cloister scores 9 |
| Farmer | never mid-game | stays until end | — | FEATURE_KINDS.field | farmer-beside-city test |
| Dead tile | deal / after any placement | discard, redraw, tile_serial++ | bag may empty → seat sits out | rules.js drawTile/knockOnRedraw | knock-on redraw |
| End: incomplete | bag dry, round done | road 1/tile · city 1/tile + 1/pennant · cloister 1 + neighbours | — | board.js endGameScores | end-game test |
| End: fields | bag dry, farmers on | 3 per completed city touching the field, majority per field; a city touching several fields scores for each | — | FEATURE_KINDS.field | 3rd-edition shared city |
| Winner | game end | highest score; ties shared (results in seat order, all tied crowned) | — | rules.js completeGame | ties at the end |
