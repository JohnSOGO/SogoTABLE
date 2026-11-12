# Tracklayers — design + wire contract

An ORIGINAL train-route game (route-building family mechanics: collect colored
cards, claim routes between cities, complete destination tickets, longest-line
bonus). Own name, own map ("the Lantern Isles", `workers/games/tracklayers/map.js`),
own procedural SVG art. No third-party names, maps, or art.

- Game id: `GAME_IDS.tracklayers = "7c31e9a05b42"` (opaque, permanent).
- Directory: `workers/games/tracklayers/`, `src/sogotable/static/games/tracklayers/`.
- `lobbyMode: "hostStart"`, 1–5 seats (1 human + bots is fine; at least 2 seats
  total — `initSeats` throws below 2), `timingMode: "simultaneousSubmit"`.

## Rules (what players see)

- Deck: 12 cards of each of 8 colors (`red orange yellow green blue purple black white`)
  + 14 `wild` (locomotive-style "Lantern" wild cards) = 110. Market = 5 face-up.
  If the market ever shows 3+ wilds it is discarded and refilled (max 3 tries).
  Discards reshuffle into the deck when the deck runs out.
- Start: each seat gets 4 cards and is offered 3 tickets; keeps ≥ 2.
- Trains per seat: option `trains` ∈ {25, 35, 45}, default 35 (the map has 262 cars).
- **Everyone acts at once each round** (simultaneous submit). Each round a seat
  commits exactly ONE action:
  1. `DRAW` — two picks. Each pick is `"deck"` or a market color (`"red"`, …, `"wild"`).
     A face-up `wild` must be the ONLY pick (it uses the whole action). (Blind
     deck wilds are fine.)
  2. `CLAIM` — `{ route, color }`. Pay `route.len` cards: cards of `color` first,
     wilds for the rest. For a gray route `color` is any one of the 8 colors
     (or `"wild"` = pay all wilds). For a colored route `color` must equal
     the route color (or `"wild"`). Needs `trains >= len`. Score per route length:
     1→1, 2→2, 3→4, 4→7, 5→10, 6→15.
  3. `TICKETS` — draw 3 tickets at resolution; keep ≥ 1 (chosen next round).
- Pending ticket choice: a seat with `pending_tickets` must send `KEEP_TICKETS`
  `{ keep: [ticketIds] }` (≥ min_keep: 2 at start, 1 later) BEFORE it may COMMIT.
  KEEP_TICKETS is instant (not a barrier action). Returned tickets go to the
  bottom of the ticket deck. Bots keep immediately.
- Double routes (`twin`): one seat may never own both. With ≤ 3 seats only one
  of the twins may be claimed at all.
- **Resolution (barrier close), fixed order, `priority_order` rotates one seat each round:**
  1. TICKETS actions: in priority order, draw up to 3 tickets each → `pending_tickets`.
  2. CLAIM actions: in priority order. Re-check legality (route free, twin rule,
     cards, trains). Loser of a contested route keeps its cards and gets ONE
     blind deck card as consolation; event: "P2 wanted Saltmere–Tidewick but P1
     had priority — P2 drew a card instead".
  3. DRAW actions: pick #1 for every drawer in priority order, refill the market
     (with the 3-wild check), then pick #2 for every drawer in priority order,
     refill. If the color you asked for is no longer in the market, you get a
     blind deck card instead (event says so). A face-up wild pick that is gone
     becomes two blind deck cards. If deck+discard are empty, nothing is drawn.
- End: when any seat has ≤ 2 trains after a resolution, the NEXT round is the
  final round (`final_round = round + 1`, event announces it). After the final
  round resolves the game completes. Also completes if 3 consecutive rounds pass
  where nobody could do anything productive (safety valve: no claims and deck,
  discard and market all empty), and a hard cap of 200 rounds.
- Final scoring: route points (live during play) + each kept ticket ±points
  (completed = connected via own routes) + **Longest Line** bonus 10 to every
  seat tied for the longest continuous path of own routes (edges can't repeat;
  cities can). Ties on total: most completed tickets, then longest line.
  `winner` = top mark.
- Skip vote: `SKIP_PLAYER { target }` via `workers/games/skip-vote.js` (unanimous of
  seats already committed this round); a skipped seat passes the round.
- Stale handling: every action carries `round`; mismatch → loud error
  "That move was for round N — the table is on round M. Refresh to catch up."
  Duplicate COMMIT in a round → ignored (first wins). Unstamped → accepted.

## Server state (internal; plain data)

```js
{ game_id, status: "playing" | "complete", phase: "playing", round: 1, final_round: null,
  options: { trains: 35 },
  seat_order: ["P1",...], priority_order: ["P1",...],
  deck: [colors...], discard: [], market: [5 colors], ticket_deck: [ticketIds],
  routes: { [routeId]: mark },               // owner map
  players: { P1: { is_bot, level, hand: {red:0,...,wild:0}, tickets: [ids],
                   pending_tickets: [ids] | [], min_keep: 2, trains: 35, score: 0,
                   committed: null | {type,...}, skipped: false } },
  skip_votes: {}, events: [ {seq, round, kind, mark?, text, route?, ...} ] (cap 60),
  event_seq: 0, winner: null, results: null, move_count: 0 }
```

## Projection (wire contract — the client reads ONLY this)

`tracklayersGameToDict(game)` → public dict (no deck order, no ticket_deck):

```js
{ game_id, status, phase, round, final_round, options,
  map: { id, board:{width,height}, cities:[{id,name,x,y}], routes:[{id,a,b,len,color,twin}] },
  tickets_catalog: { [ticketId]: {id,a,b,points} },     // all tickets (static, public)
  colors: ["red",...,"white"], route_points: {1:1,2:2,3:4,4:7,5:10,6:15},
  deck_count, discard_count, ticket_deck_count, market: ["red",...],
  routes: { [routeId]: mark }, twins_locked: bool (true when ≤3 seats),
  seat_order, priority_order,
  players: { P1: { is_bot, level, trains, score, hand_count, ticket_count,
                   has_committed, has_pending_tickets, skipped,
                   hand: {...} | null, tickets: [ids] | null, pending_tickets: [ids] | null,
                   min_keep,   // how many of pending_tickets must be kept (2 at start, 1 later)
                   committed: {...} | null,
                   // only after completion:
                   ticket_results: [{id, points, done}] | null, longest: n | null } },
  longest_bonus: 10, skip_votes, events, winner, results, move_count }
```

`results` (on complete): `[{ mark, total, route_points, ticket_points, tickets_done,
tickets_failed, longest, longest_bonus }]` sorted best first.
`ticket_results[].points` is SIGNED: `+points` when done, `-points` when missed.
Event `kind`s: start, round, keep, tickets, claim, conflict (has `route`, `winner`),
draw (has `face: [colors]`, `blind: n`), fallback, reshuffle, market_reset, skip,
final_round, end, score, winner. Every event has `seq`, `round`, `kind`, `text`.

`tracklayersGameToDictForViewer(dict, viewerMark, roomStatus)` keeps `hand`,
`tickets`, `pending_tickets`, `committed` ONLY for `viewerMark` (null for others);
on complete, everyone's `tickets` + `ticket_results` are revealed. Hidden
`committed` everywhere except own seat.

## Client actions

```js
ctx.makeMove({ type: "KEEP_TICKETS", round, keep: ["t3","t9"] })
ctx.makeMove({ type: "COMMIT", round, action: { type: "DRAW", picks: ["red","deck"] } })
ctx.makeMove({ type: "COMMIT", round, action: { type: "DRAW", picks: ["wild"] } })
ctx.makeMove({ type: "COMMIT", round, action: { type: "CLAIM", route: "r12", color: "blue" } })
ctx.makeMove({ type: "COMMIT", round, action: { type: "TICKETS" } })
ctx.makeMove({ type: "SKIP_PLAYER", round, target: "P3" })
```

Start options: `ctx.startGame({ tracklayers_options: { trains: 35 } })`.

## Bots (`ai.js`, levels easy/medium/hard via seat `bot_level`)

Bots commit at barrier close through the same `validateCommit` path. Plan: shortest
paths (Dijkstra; owned routes cost 0, free routes cost len, others' routes and
locked twins blocked) for each incomplete ticket → needed routes. Claim the most
valuable affordable needed route; else draw the market colors those routes need
(else deck); when all tickets are done and trains > 12 (medium/hard) take TICKETS;
otherwise claim the longest affordable route. Easy: 40% of the time a random legal
action. Ticket keeping: keep the cheapest-to-complete (min 2/1); hard keeps one
more if cheap.

## Helps (all optional, client-side toggles, device-local)

- Highlight my ticket cities + suggested path (on by default).
- Glow routes I can afford right now (on).
- Ticket progress chips (done / not yet) (on).
