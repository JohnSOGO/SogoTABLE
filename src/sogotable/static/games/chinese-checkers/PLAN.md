# Chinese Checkers — plan and wire contract

Status: built against `docs/game-integration-spec.md` (PR #3). This file is the
contract the server rules (`workers/games/chinese-checkers/`) and the client
(`src/sogotable/static/games/chinese-checkers/`) are both built to. If code and
this file disagree, fix one of them in the same change.

## Intake survey (adding-a-game.md Phase 1)

| Question | Answer |
|---|---|
| A. Coupling / timing | Shared table, **simultaneous submit** (`timingMode: "simultaneousSubmit"`). Every seat commits one move per round, hidden; the round resolves when every human has committed (or passed / been skipped). Bots commit at barrier close through the human validation path. |
| B. Actionable events | `MOVE`, `PASS`, `RETRACT`, `SKIP_PLAYER`. Selecting a marble and walking a hop chain is local only. |
| C. Hidden info | Other seats' commits are hidden until the round resolves (`committed` is projected as a bool only). No other secrets. |
| D. State | Plain data: occupancy map `"q,r" → mark`, per-seat flags, options, events. RNG seam only for bot choices. |
| E. Assets | Procedural SVG board + glass marbles, synthesized SFX. File overrides through `assets.js`. All words in `branding.js`. |
| F. Bots | Levels 1–4 (Sprout / Buddy / Cipher / Overlord), same validated path as humans. |
| G. Reuse | Standard host-start lobby, invite, bots, skip vote, reset/rematch, stats. No exceptions. |
| H. Rules source | Public-domain Chinese Checkers (Sternhalma) rules. Deviations listed below. |

Seats: **2, 3, 4, 5 or 6** (5 is a house rule: one empty arm). `initSeats` throws
below 2 or above 6 with a friendly message.

## Geometry

Axial hex coords `(q, r)`, `s = -q - r`. Cell key is the string `"q,r"`.
The 121-hole star = cells where every coord ≤ 4 **or** every coord ≥ −4
(union of two side-12 triangles; the overlap is the radius-4 hexagon of 61).

Arms (10 holes each), indexed clockwise on screen with pointy-top pixel layout
`x = √3·(q + r/2)`, `y = 1.5·r` (y down):

| arm | condition | screen position | tip cell |
|---|---|---|---|
| 0 | r > 4 | bottom | `-4,8` |
| 1 | q < −4 | bottom-left | `-8,4` |
| 2 | s > 4 | top-left | `-4,-4` |
| 3 | r < −4 | top | `4,-8` |
| 4 | q > 4 | top-right | `8,-4` |
| 5 | s < −4 | bottom-right | `4,4` |

Opposite arm = `(arm + 3) % 6`. Hexagon cells have arm `-1`.
Depth of an arm cell = how far its defining coord is past 4 (1…4); tip = depth 4.
With **10 marbles** a seat fills depths 1–4; with **6 marbles** (quick) depths 2–4.
A seat's **goal** = the same depth set in the opposite arm.

Home arms by seat count (seat_order index → arm):

| seats | arms |
|---|---|
| 2 | 0, 3 |
| 3 | 0, 2, 4 |
| 4 | 0, 1, 3, 4 |
| 5 | 0, 1, 2, 3, 4 |
| 6 | 0, 1, 2, 3, 4, 5 |

Teams (option, 4 or 6 seats only; ignored otherwise): partners are the seats on
**opposite** arms, so 4 seats → 2 teams of 2, 6 seats → 3 teams of 2. Team id =
`min(arm, opposite) ` (0, 1 or 2).

## Moves

- **Step**: to an adjacent empty hole. A step ends the move.
- **Hop (standard jumps)**: over an adjacent occupied hole (any colour) into the
  empty hole directly beyond, in a straight line. Hops **chain** as long as the
  player likes; a chain never revisits a hole and never ends where it started.
- **Long jumps** option ("fast-paced" / super-jumps): a hop may jump a marble
  any distance away along a line, if the holes between the start and that marble
  are empty and the same number of holes beyond it are empty, landing
  symmetrically (`d` empties, marble, `d` empties, land). Standard is `d = 0`.
- **Stay in goal** (default on): once a marble is inside its goal, a move may not
  end outside it (a chain may pass out and back in).
- **No parking** (default off): a move may not *end* in an arm that is neither the
  mover's home nor goal (passing through is fine).
- **Capture** option (default `off`; `send_home`): every *opponent* marble hopped
  over is sent back to its owner's home arm, to the free home hole nearest the
  tip (if the home is full, the free hole nearest that tip by hex distance; ties by
  key order). Teammates are never captured. A marble sitting in **its own goal is
  safe**. Captures apply when the move resolves, after the full chain; a marble
  hopped twice is captured once.
- **PASS** is always allowed. A human with no legal move is auto-passed at the barrier.

## Winning

- A seat **finishes** when every hole of its goal is filled with its own marbles.
  **Anti-block** (default on): it also finishes when its goal is completely full
  and **more than half** the marbles there are its own (stops spoilers camping in
  your goal). "At least one" was tried and rejected: with 6 seats a marble slipped
  into a hole the opposite seat just vacated counted as a finish in round 2.
- Finished seats stop moving (they count as done at the barrier).
- `end: "first"` (default): the game ends after the round in which the first seat
  (or, with teams, the first whole team) finishes; everyone finishing in that
  round shares the win. `end: "all"`: play continues until at most one seat
  (team) is unfinished; ranks are finishing order (same-round finishers share a
  rank).
- Safety cap: 300 rounds. At the cap the game ends and unfinished seats rank by
  remaining distance.
- **Distance** (ranking + bots): sum over a seat's marbles of hex distance to its
  goal tip, minus the minimum possible sum for a full goal (so 0 = finished).
- `score` (stats) = 100 − distance clamped to ≥ 0, +50 for a win. Higher is better.

## Parallel play — conflict resolution (spec §6.4)

Simultaneous submit with **rotating priority**: `priority_order` is `seat_order`
rotated left by `(round − 1) % n`. At barrier close every commit (bots last via
the same validation) is applied **one at a time in priority order**, each
re-checked against the board as it stands after the higher-priority moves:

1. Marble no longer at `from` (it was captured) → **bounced**, nothing moves.
2. Walk the path hop by hop. Each step must still be legal on the current board.
3. If a later hop fails, the move is **cut short** at the last landing that is
   still reachable *and* is a legal place to stop (stay-in-goal / no-parking).
   If no prefix works → **bounced** (marble stays home).
4. Two players aiming for the same hole: the higher-priority one gets it; the
   other is cut short or bounced, with an event naming who had priority.
5. Captures for the hops actually made apply right after that move.

Commits are validated on arrival against the **start-of-round** board (marble is
yours, path is legal now) and resolved at close per above. `RETRACT` clears your
commit while the round is still open. Duplicate commit while committed → ignored
(first commit wins). Stale `round` → rejected loudly.

## Options (`cc_options` on `/api/room/start`; clamped server-side)

| key | values | default |
|---|---|---|
| `jumps` | `"standard"` · `"long"` | `"standard"` |
| `marbles` | `10` · `6` | `10` |
| `capture` | `"off"` · `"send_home"` | `"off"` |
| `teams` | `false` · `true` | `false` |
| `stay_in_goal` | bool | `true` |
| `no_parking` | bool | `false` |
| `anti_block` | bool | `true` |
| `end` | `"first"` · `"all"` | `"first"` |

`carryOptionsOnReset` keeps them for a rematch.

### Added 2026-11-12 (MojoSOGO: "all helps optional", chaos modes, around-the-table, more standard options)

| key | values | default | meaning |
|---|---|---|---|
| `mode` | `"rounds"` · `"blitz"` · `"live"` · `"turns"` | `"rounds"` | see **Play modes** |
| `timer` | seconds: `0` (off) or 5–120 | per mode: rounds 0, blitz 10, live 30, turns 0 | round/turn clock; clamped; blitz min 5, live min 10 |
| `marbles` | `10` · `6` · `15` | `10` | 15 = the classic 2-player set (adds the 5 hexagon holes in front of the arm); **only with 2 seats**, otherwise clamped to 10 at init |
| `chains` | bool | `true` | false = single hop per move (kids' rule) |
| `allow_pass` | bool | `true` | false = standard rule: you may pass only when you have no legal move |
| `assists` | `"full"` · `"moves"` · `"off"` | `"full"` | full = steps, hops, all multi-hop reach + tap-far auto-route; moves = steps + next hops only; off = no highlights, hop by hop, a tap on an illegal hole buzzes |

`assists` is enforced in the projection: with `"off"` the viewer gets `legal` = `{}` and `stops` = `{}` replaced by `legal_lite`: `{ [mark]: { [from]: true } }` (which marbles can move, used only to let a tap select a marble without highlighting it), and the client sends each hop as typed; the server validates on commit and rejects with a reason. With `"moves"` the server omits `reach` data (`stops` is still sent so Lock in can be enabled, but the client must not draw dim reach rings nor auto-route).

### Play modes

- **rounds** (the original): hidden simultaneous commits, barrier, rotating priority (unchanged). If `timer > 0`, when the deadline passes any un-committed human loses the round (auto-pass, `timeout` event) and the round resolves.
- **blitz** ("chaos", first come first served on a fixed beat): each round lasts exactly `timer` seconds (default 10) and does **not** close early. During the round each seat may make **one** move, applied **immediately** in server-received order against the live board (no hidden commits, no RETRACT). A move that is no longer legal when it arrives is rejected with a reason and the player may try again while the clock runs. At the deadline: bots move (seat order), every human who hasn't moved **loses the turn** (`timeout` event), next round opens with a fresh deadline.
- **live** (async rounds, not blitz): same as blitz (immediate, first come first served, one move per seat per round) but the round **closes as soon as every human has moved or passed**, or at the `timer` deadline (default 30s), whichever is first.
- **turns** ("order, around the table"): classic one-at-a-time play. Turn order = seats in clockwise arm order. `current` = whose turn. Only that seat may MOVE/PASS; bots move instantly when their turn comes. With `timer > 0` the current human loses the turn at the deadline.

Barrier/skip vote still exists in rounds/turns without a timer. Finished seats are skipped in every mode.

Clock: the rules module reads time only through an injectable seam `setChineseCheckersNow(fn)` (WNYK precedent). Deadlines are enforced **lazily**: every incoming action first runs `advanceClock(game, now)`, which closes any expired round/turn (repeatedly, if several elapsed, bounded). Because a room with no actions would never advance, clients send `{ type: "TICK" }` when their local countdown hits zero; TICK is accepted from any seated player (and is a silent no-op when nothing is due, never an error). Projection carries `deadline` (server epoch ms or null) and `server_now` (epoch ms at projection time) so clients can correct for clock skew.

New projection fields: `options.mode`, `options.timer`, `deadline`, `server_now`, `current` (turns mode: mark or null), `turn_order` (turns mode), per-player `moved` (bool: moved this round in blitz/live), `legal_lite` (assists off).
New events: `{ type: "timeout", mark }` (lost turn), `{ type: "move", ..., outcome: "ok", live: true }` (blitz/live moves are emitted the moment they apply), `{ type: "turn", mark }` (turns mode), `{ type: "rejected" }` is NOT an event (the action throws).
New/changed actions: `{ type: "MOVE", round, from, path }` works in every mode (in turns mode `round` = the turn counter `game.round`, which increments every turn); `{ type: "TICK" }`; RETRACT only in rounds mode.


## Actions (client → `ctx.makeMove`)

```js
{ type: "MOVE", round, from: "q,r", path: ["q,r", ...] } // path = landings in order; a step is one element
{ type: "PASS", round }
{ type: "RETRACT", round }
{ type: "SKIP_PLAYER", round, target: "P3" }
```

## Projection (`chineseCheckersGameToDict` → then `…ForViewer(dict, viewerMark)`)

```js
{
  game_id, status: "playing" | "complete", round, move_count,
  options: { ...all keys above, teams_active: bool },
  seat_order: ["P1", ...],
  priority_order: ["P2", "P3", "P1"],      // this round
  cells: [{ k: "q,r", q, r, arm }],         // all 121 holes, arm -1..5 (static geometry)
  marbles: { "q,r": "P1", ... },            // occupancy
  players: [{
    mark, arm, goal_arm, team,              // team: null or 0..2
    is_bot, level,
    committed: bool, skipped: bool,
    finished: bool, finish_round: int|null, rank: int|null,
    in_goal: int, marbles_total: int, distance: int, score: int,
    commit: null | { from, path } | { pass: true }   // ONLY on the viewer's own seat; null for others
  }],
  legal: {                                   // ONLY the viewer's own mark after ForViewer
    P1: { "q,r(from)": { steps: ["q,r", ...], hops: { "q,r(node)": ["q,r(landing)", ...] } } }
  },
  stops: { P1: { "q,r(from)": ["q,r", ...] } }, // legal END holes for that marble (respects stay-in-goal / no-parking); viewer only
  events: [ /* capped 60, seq increasing */ ],
  skip_votes: { [target]: [voters] },
  winner: mark | null, winners: [mark...],
  results: null | [{ mark, rank, finished, distance, score, team }],
}
```

`hops[node]` lists landings from `node` (the origin and every hole reachable by a
chain). The client walks this graph (excluding holes already on the current
path); it never computes jump legality itself. `stops` tells it where a chain may
end; nodes not in `stops` can be passed through but not confirmed.

### Events

```js
{ seq, round, type: "round", priority: [marks] }
{ seq, round, type: "move", mark, from, to, path, outcome: "ok" | "cut" | "bounced",
  reason?, by?,          // by = mark whose higher-priority move caused the cut/bounce
  captured: [{ mark, from, to }] }
// path = the route actually travelled (a cut move's path ends at `to`; a bounced move has path [] and to === from);
// cut/bounced moves also carry `intended` (the requested path) and reason: "hole_taken" | "jump_changed" | "marble_moved"
{ seq, round, type: "pass", mark }
{ seq, round, type: "skip", mark }
{ seq, round, type: "finish", mark, rank }
{ seq, round, type: "end", winners: [marks] }
```

## Intended deviations from the published rules

- Simultaneous rounds with rotating priority instead of turn order (the SogoTable twist).
- 5 seats allowed (one empty arm).
- Anti-block finish rule on by default.
- 300-round safety cap.
- Capture is a house variant (`send_home`), off by default.

## Rename and re-skin

- Name and every word: `branding.js`, plus `name` in `games/registry.js` and
  `manifest.js` (kept equal by the architecture test). Opaque id `6bc129b1bbed`
  never changes.
- Colours: `assets.js` palette tokens. Marble/hole art and sounds: `assets.js`
  file overrides (`null` = procedural default).
