# 🏝️ Tradewind Isles — design + wire contract

An **original** island trading game in the resource-hex family (dice production,
paths and settlements, trading, a blocker, a card deck). The name, terms, art
(procedural SVG) and look are SogoTable's own. Opaque id `08a6c9699a46`.

Server: `workers/games/tradewinds/` (board.js, rules.js, ai.js). Client:
`src/sogotable/static/games/tradewinds/`. This file is the contract between them.

## Terms (display lives in `branding.js`; rule ids never change)

| Rule id | Display | Notes |
|---|---|---|
| `timber` | Timber 🪵 | from `grove` (Palm Grove 🌴) |
| `clay` | Clay 🧱 | from `clay` (Clay Cliffs) |
| `fiber` | Fiber 🧶 | from `meadow` (Sisal Meadow) |
| `fruit` | Fruit 🥭 | from `orchard` (Mango Orchard) |
| `stone` | Stone 🪨 | from `quarry` (Basalt Quarry) |
| terrain `volcano` | Volcano 🌋 | produces nothing; the monkey starts here |
| `path` | Boardwalk | edge piece. Cost timber + clay |
| `hut` | Hut 🛖 | vertex piece, 1 renown. Cost timber + clay + fiber + fruit |
| `lodge` | Lodge 🏘️ | upgrades own hut, 2 renown, double production. Cost 2 fruit + 3 stone |
| discovery card | Discovery | cost fiber + fruit + stone |
| `ranger` | Ranger 🧭 | move the monkey + steal; counts toward Chief Ranger |
| `monument` | Monument 🗿 | +1 renown, hidden until the end |
| `trailblaze` | Trailblaze 🪓 | build 2 free boardwalks |
| `bounty` | Bountiful Tide 🌊 | take any 2 resources from the bank |
| `market` | Market Day 🛶 | name a resource; every opponent gives you all of theirs |
| monkey | Mischief Monkey 🐒 | blocks its hex's production; mover steals 1 card |
| `causeway` award | Grand Causeway | longest continuous boardwalk ≥ 5 → +2 |
| `chief_ranger` award | Chief Ranger | ≥ 3 rangers played, most → +2 |
| renown | Renown ⭐ | victory points; first to the target (default 10) wins |
| port | Dock ⚓ | 3:1 any, or 2:1 for one resource |

## Parallel play (timingMode `liveRound`)

1. **Setup** (`phase:"setup"`): snake order over `seat_order` (P1…PN, PN…P1). The
   seat in `setup.current` places one hut + one adjoining boardwalk in a single
   `SETUP_PLACE`. Bots place instantly when their turn comes. The second hut pays
   one card per adjacent producing hex. Host option `quick_setup` auto-places
   everyone (bot heuristic) and starts at round 1.
2. **Each round** starts with one server roll (2d6) for the whole table.
   - Not 7: every hex with that number (and no monkey) pays each adjacent hut 1,
     lodge 2. If the bank can't pay every claim of a resource, nobody gets that
     resource (unless only one seat claims it — then they get what's left).
   - 7: every seat holding more than `hand_limit` cards discards half (round
     down). Bots discard instantly; humans in `phase:"discard"` send `DISCARD`.
     Then this round's **captain** (`seat_order[(round-1) % n]`) moves the monkey
     (`phase:"monkey"`, `MOVE_MONKEY`) and steals one random card from a seat with
     a building on that hex. A bot captain moves instantly.
3. **Build phase** (`phase:"build"`): **everyone acts at once**. Builds, bank
   trades, player trades and discovery cards resolve **immediately in
   server-received order**. If two players reach for the same corner or edge the
   first valid build wins; the later one is **rejected with a reason** and keeps
   its resources (deliberate live-round rule, written in the help text).
   Each human taps **Done** (`DONE {done:true}`; can un-done). When every
   non-skipped human is done, **bots build** (seat order, through the same
   validation), then the next round rolls automatically. Offers are cleared.
4. Reaching the renown target at any moment ends the game at once (`status:
   "complete"`, `winner`).
5. A dropped phone: `SKIP_PLAYER {target}` (unanimous among seats already done /
   not blocking — skip-vote.js). Skipping a discarder auto-discards at random;
   skipping the captain leaves the monkey where it is; skipping in build marks
   them done for this round.

Discovery rules: a card can't be played the round it was bought; at most one
non-monument card per seat per round. Monuments count automatically (hidden).

## Projected game (`toDict` → `toDictForViewer(viewerMark)`)

```js
{
  game_id, status: "playing" | "complete",
  phase: "setup" | "discard" | "monkey" | "build",
  round, captain,                 // captain = mark that moves the monkey on a 7
  seat_order: ["P1", …], options: { target, hand_limit, board, quick_setup, friendly_monkey, show_spots, show_pips, show_afford },
  costs: { path: {timber:1, clay:1}, hut: {...}, lodge: {...}, discovery: {...} },
  resources: ["timber","clay","fiber","fruit","stone"],
  board: {
    // Integer lattice: hex centre (x = 2q + r, y = 3r). Draw with X × 0.866 (√3/2)
    // and Y × 0.5 relative units, pointy-top hexes. Corners of a hex are centre +
    // (0,-2),(1,-1),(1,1),(0,2),(-1,1),(-1,-1) in lattice units.
    hexes:    [{ id: "h0", q, r, x, y, terrain: "grove"|"clay"|"meadow"|"orchard"|"quarry"|"volcano", number: 2..12 | null, pips: 0..5 }],
    vertices: [{ id: "x,y", x, y, hexes: ["h0", …], port: "d0" | null }],
    edges:    [{ id: "x1,y1|x2,y2", a: vertexId, b: vertexId }],
    ports:    [{ id: "d0", resource: null | "timber"…, rate: 3 | 2, edge: edgeId, x, y /* lattice point just off the coast */ }],
  },
  monkey: "h7",
  dice: [3, 4] | null,           // this round's roll
  pieces: { huts: { [vertexId]: mark }, lodges: { [vertexId]: mark }, paths: { [edgeId]: mark } },
  setup: { order: [marks], index, current: mark | null } | null,
  bank: { timber: 19, … }, discovery_left: 25,
  awards: { causeway: mark | null, chief_ranger: mark | null },
  players: { [mark]: {
    is_bot, level,
    hand_count, hand: { timber: n, … } | null,             // null for other seats (until complete)
    discovery_count, discoveries: [{ card, bought_round }] | null, // own only
    played: { ranger: n, trailblaze: n, bounty: n, market: n },     // public
    renown,                 // public renown (monuments hidden from others)
    renown_total,           // own seat (and everyone at the end) includes monuments; else null
    pieces_left: { path, hut, lodge },
    longest_path,
    rates: { timber: 4|3|2, … },   // bank rates from docks
    done, skipped, must_discard, free_paths, played_card_round,
    has_committed,          // = done (ready chip)
  } },
  offers: [{ id, from, to: mark | null, give: {res:n}, want: {res:n}, acceptors: [marks], bot_acceptors: [marks] }],
  legal: {                  // viewer-specific, computed by the server — the UI never decides legality
    setup_huts: [vertexId], setup_paths: { [vertexId]: [edgeId] },
    huts: [vertexId], lodges: [vertexId], paths: [edgeId],
    monkey_hexes: [hexId], monkey_victims: { [hexId]: [mark] },
  },
  skip_votes, events: [{ seq, type, mark?, text, … }], winner, results: [{ mark, renown, rank }] | null, move_count,
}
```

## Actions (`ctx.makeMove`)

Every action carries `round: game.round` (stale → loud reject).

| type | payload |
|---|---|
| `SETUP_PLACE` | `{ hut: vertexId, path: edgeId }` |
| `DISCARD` | `{ cards: { res: n } }` exactly `must_discard` cards |
| `MOVE_MONKEY` | `{ hex, victim: mark \| null }` |
| `BUILD` | `{ kind: "path" \| "hut" \| "lodge", at: id }` (uses a free path first if `free_paths > 0`) |
| `BUY_DISCOVERY` | `{}` |
| `PLAY_DISCOVERY` | `{ card: "ranger", hex, victim }` / `{ card: "trailblaze" }` / `{ card: "bounty", picks: [res, res] }` / `{ card: "market", resource }` |
| `BANK_TRADE` | `{ give: res, get: res }` — pays `rates[give]` for 1 `get` |
| `OFFER` | `{ give: {…}, want: {…}, to?: mark }` |
| `CANCEL_OFFER` | `{ offer_id }` |
| `ACCEPT_OFFER` | `{ offer_id, accept: bool }` |
| `CONFIRM_TRADE` | `{ offer_id, partner }` — partner ∈ acceptors ∪ bot_acceptors |
| `DONE` | `{ done: bool }` |
| `SKIP_PLAYER` | `{ target }` |

## Event types (for sfx + log)

`roll` (dice, gains), `seven`, `discard`, `monkey` (hex, victim), `steal`,
`build` (kind, at), `upgrade`, `buy`, `play` (card), `bank_trade`, `trade`
(from, partner), `offer`, `award` (award, mark), `round`, `win`, `setup`,
`reject` is never an event (errors come back from makeMove).

## Host options

| key | values | default |
|---|---|---|
| `target` | 8, 10, 12, 14 | 10 |
| `hand_limit` | 7, 9, 11 | 7 |
| `board` | `auto` / `small` (19 hexes) / `large` (37) | auto (large at 5+ seats) |
| `quick_setup` | bool | false |
| `friendly_monkey` | bool — monkey can't target seats with ≤ 2 renown | false |
| `show_spots` | help: glow legal spots | true |
| `show_pips` | help: dots under numbers (odds) | true |
| `show_afford` | help: highlight what you can afford + trade hints | true |

Players: 2–6 seats (any mix of humans and bots).
