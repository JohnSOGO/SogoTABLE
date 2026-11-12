# Game Integration Spec — Lobby ↔ Game Contract

The reference contract for plugging a new game into the SogoTable lobby: what the
lobby **provides**, what a game **must implement**, how a game **starts**, how
**parallel play** (simultaneous moves within a round — the preferred model) works,
how **conflicts** are handled, and how to **swap assets and rename** a game cheaply.

Everything here is derived from the shipped code (Potion Lab and Roll Through the
Ages are the parallel-play references). Where the code and this doc disagree, the
code wins — fix the doc.

How this relates to the other docs:

- [Adding a Game](adding-a-game.md) owns the **process** (prototype → survey →
  AREC → build → gates) and the UI hard rules. This doc owns the **contract**.
- [Live Rounds](live-rounds.md) owns the timing-mode ideology; §5 here is the
  concrete, shipped pattern.
- [API Contract](api-contract.md) owns the HTTP routes in full.

---

## 1. Shape of the system (one paragraph)

The browser shell (`src/sogotable/static/app.js`) owns screens, identity, the room
WebSocket, and the lobby UI. Room actions go to the Worker
(`workers/sogotable-api.js`), which routes each one to the room's Durable Object.
That object loads the shared D1 state, runs the route, saves it with an optimistic
version check, and broadcasts a **per-viewer** room snapshot to every socket.
Games plug in at two seams only: a **pure rules module + a handler row** on the
Worker side (`workers/games/handlers.js`), and a **render module fed a ctx bag** on
the client side. A game never touches routing, auth, persistence, sockets, or the
lobby itself.

```text
player intent ──ctx.makeMove(action)──▶ POST /api/room/move { code, player_id, owner_token, action, game_epoch }
   ▲                                          │ auth + seat → mark, epoch check
   │                                          ▼
render(ctx) ◀── room_snapshot (per viewer) ◀── applyAction(game, mark, payload) → bump revision → save → broadcast
```

---

## 2. What the lobby provides

A game gets all of this for free and must **not** re-implement any of it
(hard rule: "Reuse the lobby", [adding-a-game.md](adding-a-game.md)).

| Capability | Where it lives | What the game sees |
|---|---|---|
| Room create + share code | `/api/room/create` | `room.code`, `room.host_id` |
| Invite remote player | invite modal → `/api/room/join` | new seat in `room.players` |
| Invite / remove bot (host, pre-start) | `/api/room/join-bot`, `/api/room/remove-bot` | seat with `kind: "bot"`, `bot_level` |
| Seat marks | `addPlayerToRoom` | host-start: `P1…PN` in join order (re-packed when a bot is removed); fixed-capacity: `X`/`O` randomized at auto-start |
| Seat identity | player roster | `id`, `name`, `icon`, `color` (de-conflicted per room), `mark`, `kind` |
| Host start + start options | `/api/room/start` | `applyStartOptions(game, payload)` then `initSeats(game, players)` |
| Join lock after start | `/api/room/join` | new players are refused once `started`; rejoin by the same id is allowed |
| Reset / rematch (unanimous vote, bots auto-agree) | `/api/room/reset` | fresh `create()`, `carryOptionsOnReset`, `initSeats`; `game_epoch` bumps |
| Ownership auth | owner tokens | `mark` is resolved server-side from `player_id` — a client can never act as another seat |
| Stale-game guard | `/api/room/move` | moves stamped with an old `game_epoch` are rejected |
| Ordering + freshness | `room.revision` | bumped on every change; clients drop snapshots older than the one they hold |
| Realtime | room Durable Object WebSocket | every socket gets `roomToDictForViewer` — your viewer projection runs per socket |
| Stats on completion | `workers/stats.js` | recorded once when `game.status === "complete"` (see §4.4) |
| Shared lobby screen | `games/lobby.js` `renderHostStartLobby` | roster + Invite Remote / Invite Bot / Start Game, identical across games |
| Barrier skip vote | `workers/games/skip-vote.js` | unanimous (or game-chosen threshold) vote to release a dropped seat |

### What the lobby requires of a game

1. **A registry entry** (§4.1) with a `lobbyMode` consistent with `host_start`.
2. **A minimum-player check** — the lobby only blocks a start with zero seats. If
   your game needs ≥ N, `initSeats` must `throw` a friendly error (Potion Lab:
   `"Potion Lab needs at least 2 players — invite players or bots to fill the table."`).
   The start route surfaces it to the host and the room stays unstarted.
3. **The shared lobby screen** while `!ctx.started` — call
   `renderHostStartLobby(host, ctx, opts)`; never hand-roll an invite UI.
4. **Host options kept out of the DOM** — the lobby repaints on every snapshot, so
   store selections in module state keyed by room + epoch and read them in
   `getStartArg` (WNYK `lobbyOptions`, `games/hearts/lobby.js`).
5. **A terminal status.** The room only counts as completed (stats, results,
   rematch) when `game.status === "complete"` (two-player legacy games also use
   `x_won` / `o_won` / `draw`).

### Lobby modes

| `lobbyMode` | `host_start` | Seats | Start | Use for |
|---|---|---|---|---|
| `"hostStart"` | `true`, `player_count: null` | 1…∞, marks `P1…PN` | host taps **Start** | **every new N-player game** (default) |
| `"fixedCapacity"` | absent | exactly `player_count` (default 2), marks `X`/`O` | auto when full | legacy 2-player duels only |

An architecture test pins `lobbyMode` to `host_start`. New games should be
`hostStart`; the rest of this spec assumes it.

---

## 3. Lifecycle — how a game starts and runs

```text
create room ─▶ newGame(id) → handler.create()         room.started=false, game is an empty shell
   │             (client renders renderHostStartLobby while !ctx.started)
join / bots ─▶ seats appended, marks P1..PN, revision++
   │
host Start ─▶ applyStartOptions(game, {...payload, ...serverLibraryInputs})
   │          startRoom: started=true → initSeats(game, room.players)   ← deal, seat order, per-seat state
   │          (throw here to refuse the start)
   │
play ─────▶ POST /api/room/move → applyAction(game, mark, payload)      ← validate, transition, maybe resolve
   │          revision++, recordCompletedRoomStats, broadcast per viewer
   │
complete ─▶ game.status = "complete", game.winner = mark (optional), results projected
   │
rematch ──▶ unanimous reset vote → resetRoomGame: create() → carryOptionsOnReset → initSeats; game_epoch++
```

Bots: host-start games set `resolvesBotsInternally: true` and play bot seats
**inside the rules module**, through the same internals a human action uses
(§5.4). The shell's generic `runBotTurns` only serves the legacy turn-order games.

---

## 4. The contract a game implements

### 4.1 Registry entry — `src/sogotable/static/games/registry.js`

Add a key to `GAME_IDS` (an opaque 12-hex id, generated once, never changed) and an
entry to `GAME_REGISTRY`. Both runtimes import this file, so ids cannot drift.

```js
{
  id: GAME_IDS.myGame,          // opaque, permanent — stats/high scores key off it
  lobbyMode: "hostStart",
  name: "🧩 My Game",           // display name — renamable (§7)
  summary: "One sentence for the game-select card.",
  players: "2+ players",        // display text only
  player_count: null,           // null + host_start → unlimited seats
  host_start: true,
  category: "board",            // one of GAME_CATEGORIES: paper | dice | board | card
  status: "Ready",
  availability: "ready",
  aliases: ["my_game", "my-game"], // slugs accepted anywhere a game id is
}
```

### 4.2 Manifest — `src/sogotable/static/games/<dir>/manifest.js`

Required for every ready game (architecture test). `id` must match the registry id
or one alias, and `name` must equal the registry `name` exactly.

```js
export const myGameManifest = {
  id: "my_game",
  name: "🧩 My Game",
  description: "Longer description.",
  minPlayers: 2,
  maxPlayers: 8,
  timingMode: "simultaneousSubmit", // or "liveRound" / "turnBased" — see §5
  capabilities: ["hosted", "bot", "simultaneous"], // + "hiddenHand", "liveRound", …
};
```

Only `registry.js` is runtime-read today; the manifest is descriptive metadata
pinned by tests ([architecture-debt.md](architecture-debt.md)).

### 4.3 Rules module — `workers/games/<dir>/rules.js`

Pure: no DOM, no fetch, no storage, no timers (architecture test). Plain-data state
only, so it round-trips through D1 and replays deterministically.

| Export | Signature | Job |
|---|---|---|
| `MY_GAME_ID` | `= GAME_IDS.myGame` | canonical id |
| `isMyGame` | `(game) → bool` | `cleanGameId(game.game_id) === MY_GAME_ID` |
| `newMyGame` | `() → game` | empty pre-start shell: `{ game_id, status: "playing", phase, round: 1, seat_order: [], players: {}, winner: null, move_count: 0, events: [] }` |
| `initMyGameSeats` | `(game, seats) → void` | seat order from `seat.mark`, per-seat state, the deal; **throw** if under min players; resolve an all-bot table straight through |
| `makeMyGameMove` | `(game, mark, action) → void` | normalize → validate → transition → maybe resolve barrier. Throw `Error` with a player-readable message to reject |
| `myGameToDict` | `(game) → dict` | public projection — strips server-only secrets (deck/draw pile) for **everyone** |
| `myGameToDictForViewer` | `(dict, viewerMark, roomStatus) → dict` | **required if any info is hidden** (hands, uncommitted picks): masks other seats; reveal on completion |
| `setMyGameRandom` | `(fn) → void` | the one RNG seam, so tests and replays can seed it |
| `myGameScoreByMark` | `(game) → { [mark]: number }` | final scores for stats |

Also recommended: `normalizeMyGame(game)` called at the top of `toDict` and
`makeMove` that clamps every field to a sane range (Potion Lab's
`normalizePotionLabGame`) — the floor of the resilience gate.

### 4.4 Worker wiring (the honest list)

"One `GAME_HANDLERS` row" is the core, but today a new game touches these Worker
places — all additive, beside the existing games:

1. **`workers/games/handlers.js`** — import + one `GAME_HANDLERS` row:

   ```js
   { id: MY_GAME_ID, is: isMyGame, create: newMyGame, toDict: myGameToDict, legalMoves: () => [],
     applyAction: (game, mark, payload) => makeMyGameMove(game, mark, payload.action || payload),
     resolvesBotsInternally: true,
     initSeats: initMyGameSeats,
     // optional:
     applyStartOptions: (game, payload) => setMyGameOptions(game, payload),
     carryOptionsOnReset: (prev, next) => { if (isMyGame(prev) && prev.options) setMyGameOptions(next, prev.options); },
   }
   ```

   | Field | Required | Meaning |
   |---|---|---|
   | `id`, `is`, `create`, `toDict`, `applyAction` | yes | identity, creation, projection, move dispatch |
   | `legalMoves` | yes (`() => []` for host-start) | only the legacy shell bot uses it |
   | `initSeats` | yes for host-start | seeds per-seat state at start and after reset |
   | `resolvesBotsInternally` | yes for host-start | shell skips its own bot loop |
   | `applyStartOptions` | if the lobby has options | clamp every option server-side |
   | `carryOptionsOnReset` | if options exist | rematch keeps the table's rules |
   | `enforcesTurnOrder` | **no** for parallel games | shell rejects `mark !== current_player` |
   | `preMove`, `bot` | rarely | legacy setup / shell-driven bot |

2. **`gameToDictForViewer`** in the same file — an `if (isMyGame(game)) return …`
   line if the game has hidden info. (This is still an if-chain, not a table field.)
3. **`workers/stats.js` `scoreByMarkForRoom`** — an `if (isMyGame(room.game)) return
   myGameScoreByMark(room.game);` branch. Without it the room falls through to the
   two-player `X`/`O` default and `P1…PN` scores are not recorded.
4. **Tests** — `workers/tests/<game>.test.js`, browser-free, pinning the rules, the
   barrier, stale/duplicate handling, and the **projected** shape (§5.5).

### 4.5 Client render module — `src/sogotable/static/games/<dir>/render.js`

Exports `renderMyGame(ctx)`. It renders prepared state and captures intent; it
computes no rule outcomes and never imports `app.js` or another game.

**The ctx bag** (built in `app.js` `renderGame` for every host-start game):

| Field | Type | Use |
|---|---|---|
| `host` | element | `#macroBoard` — your mount |
| `game` | object | the viewer-projected `room.game` (other hands already masked) |
| `room` | object | full room snapshot: `code`, `players`, `revision`, `game_epoch`, `status` |
| `started` | bool | false → render the shared lobby |
| `isHost` | bool | show host-only lobby controls |
| `localPlayerId` | string | find your seat: `room.players.find(p => p.id === ctx.localPlayerId).mark` |
| `pendingMove` | object\|null | an action is in flight |
| `isMovePending` | `() → bool` | live check for timer-driven renders |
| `makeMove` | `async (action) → undefined \| errorMessage` | posts `/api/room/move`; resolves to an error string on failure (use it to unlatch your "sending" UI) |
| `startGame` | `(options?) → void` | posts `/api/room/start` with the options object spread in |
| `addBot`, `removeBot`, `invitePlayer` | fns | lobby callbacks (pass through to `renderHostStartLobby`) |
| `escapeHtml` | fn | escape every player-supplied string |

Skeleton:

```js
import { renderHostStartLobby } from "../lobby.js";
import { MY_GAME_CSS } from "./styles.js";
let stylesInjected = false;

export function renderMyGame(ctx) {
  const { host, game } = ctx;
  if (!host || !game) return;
  if (!stylesInjected) { const s = document.createElement("style"); s.textContent = MY_GAME_CSS; document.head.appendChild(s); stylesInjected = true; }
  host.className = "macro-board my-game-table";
  if (!ctx.started) {
    renderHostStartLobby(host, ctx, { wrap: "my-game-root", heading: "Players", blurb: "Everyone moves at once. Invite players or bots, then start." });
    return;
  }
  renderPlay(host, ctx); // addEventListener wiring only — no inline onclick
}
```

### 4.6 Client wiring (the honest list)

All additive, beside existing games:

1. `games/game-kinds.js` — an `isMyGameGameState` predicate (+ return it).
2. `app.js` — import `renderMyGame`; add the predicate to the host-start branch
   condition and the render-function chooser in `renderGame`; add it to the
   `renderGamePlayerSwitch` hide list.
3. `games/render-keys.js` — any **game-level** field your UI reads that is not
   already in the key. (`revision` is in the key, so this is belt-and-braces, but
   keep it honest.)
4. `games/<dir>/styles.js` — scoped CSS + dark theme (§7.3).
5. `review-export.js` — add every new file to the allowlist.
6. `docs/game-<id>.md` and a link from the docs index.

Game directories are covered by directory-level owner rows in
[module-ownership.md](module-ownership.md), so new files under
`workers/games/<dir>/` and `static/games/<dir>/` need no new row. Use a
**lowercase** directory name (Cloudflare's build is case-sensitive).

---

## 5. Parallel play — the preferred model

**Decision:** new SogoTable games should let everyone act at once and synchronize
at a **round barrier**, not pass a turn token. It is faster at a family table and
it is the pattern the platform has hardened (Potion Lab, Roll Through the Ages,
Well, Now You Know). Strict turn order is the fallback for games whose rules truly
need it.

### 5.1 Pick a resolution style

| Style | `timingMode` | Actions resolve… | Contention rule | Reference |
|---|---|---|---|---|
| **Simultaneous submit** (preferred) | `"simultaneousSubmit"` | **together** when the barrier closes | a deterministic **rule** decides — arrival order never matters | Potion Lab (per-pick draft) |
| Live round | `"liveRound"` | **immediately** as each commit arrives | **server-received order** — first commit wins, by design | RTTA (first-builder monument VP) |

Choose **simultaneous submit** when players compete for the *same* shared thing
(a board cell, a tile, a card in a market): it removes phone speed and network
latency from the outcome. Choose **live round** only when "faster player grabs it"
is a deliberate mechanic — and say so in the rules text.

### 5.2 State shape

```js
{
  game_id, status: "playing" | "complete",
  phase: "playing" | "review",   // two-phase barrier: commit → (resolve) → review → next round
  round: 1,                      // barrier stamp; add `pick`/`step` if a round has several barriers
  seat_order: ["P1", "P2", …],
  players: {
    P1: {
      is_bot, level,
      committed: null,           // this barrier's action — PRIVATE until resolved
      ready_next: false,         // left the review screen
      skipped: false,            // released by a skip vote this round
      /* game-specific seat state */
    },
  },
  skip_votes: {},                // { [targetMark]: [voterMark…] } — skip-vote.js
  events: [],                    // last resolution's public events (capped, e.g. .slice(-60))
  winner: null, results: null, move_count: 0,
}
```

### 5.3 Action protocol

The client stamps every action with the barrier it was built against:

```js
ctx.makeMove({ type: "COMMIT", round: game.round, /* pick: game.pick, */ ...payload });
ctx.makeMove({ type: "READY_NEXT", round: game.round });
ctx.makeMove({ type: "SKIP_PLAYER", target: "P3" });
```

The server (`makeMyGameMove`):

```js
export function makeMyGameMove(game, mark, action) {
  normalizeMyGame(game);
  if (game.status === "complete") throw new Error("The game is already over.");
  const seat = game.players[mark];
  if (!seat) throw new Error("You are not seated in this game.");
  if (seat.is_bot) throw new Error("Bot seats play automatically.");
  const stamped = action.round == null ? NaN : Math.trunc(Number(action.round));
  if (Number.isFinite(stamped) && stamped !== game.round) {
    throw new Error(`That move was for round ${stamped} — the table is on round ${game.round}. Refresh to catch up.`);
  }
  switch (action.type) {
    case "COMMIT":
      if (game.phase !== "playing") throw new Error("Not in the commit phase.");
      if (seat.skipped) throw new Error("You were skipped this round — you're back in next round.");
      if (seat.committed) break;                       // duplicate = client retry → idempotent, first commit wins
      seat.committed = validateCommit(game, mark, action); // throws on illegal; stores normalized plain data
      break;
    case "READY_NEXT":
      if (game.phase !== "review") throw new Error("Not in the round summary.");
      seat.ready_next = true;
      break;
    case "SKIP_PLAYER": skipPlayer(game, mark, action.target); break;
    default: throw new Error(`Unknown action "${action.type}".`);
  }
  maybeResolve(game);
  game.skip_votes = pruneSkipVotes(game.skip_votes, (t) => skipEligibility(game, t));
}
```

### 5.4 The barrier

```js
function maybeResolve(game) {
  let guard = 0;
  while (game.status !== "complete" && guard++ < 1000) {
    const humans = game.seat_order.filter((m) => !game.players[m].is_bot);
    if (game.phase === "playing") {
      if (humans.length && !humans.every((m) => game.players[m].committed || game.players[m].skipped)) return;
      commitBots(game);        // bots choose LAST, through validateCommit — the human path
      resolveRound(game);      // apply every commit together; conflicts per §6.3; scores; events
      game.phase = "review";
      if (isGameOver(game)) { completeGame(game); return; }
      if (humans.length) return; // wait for READY_NEXT
    }
    if (game.phase === "review") {
      if (humans.length && !humans.every((m) => game.players[m].ready_next)) return;
      advanceRound(game);      // round++, phase "playing", clear committed/ready_next/skipped
    }
  }
}
```

Rules the barrier must keep:

- **Only humans hold the barrier.** Bots never block it; they commit at close,
  through the same validation a human commit goes through ("bots run the human
  path"). Committing bots last stops them seeing nothing *and* stops them sniping
  (RTTA once let pre-committed bots steal first-builder VP).
- **An all-bot table resolves straight through** in the loop (bounded by a guard).
- **The review phase is optional** — drop it (Potion Lab chains picks within a round
  without one) if there is nothing to read between barriers, but keep `READY_NEXT`
  wherever scores or reveals need a beat.
- **A dropped phone must not deadlock the table**: implement `SKIP_PLAYER` with
  `workers/games/skip-vote.js`. Only seats already done at this barrier may vote,
  the skip is a **unanimous proposal** (or a game-chosen threshold), voting again
  retracts, and a late real commit from a skipped seat is rejected loudly.

### 5.5 Projection rules for parallel play

- Project `has_committed` (bool) per seat so every client can show
  "Ready / Waiting" chips — never "wait for Player 2's turn".
- **Mask uncommitted and committed choices** of other seats until the barrier
  resolves (`toDictForViewer`). Simultaneous play is only fair if nobody sees a
  pick before locking their own.
- Emit the last resolution's `events` so the UI can animate what happened,
  including **conflict outcomes** ("P2 and P3 both reached for the bridge tile —
  P2 had priority").
- Test the projected shape, not just internal state (the projection is the wire
  contract).

### 5.6 Client behavior

- Local selection lives in module state **keyed to the barrier**
  (`${room.code}:${game_epoch}:${round}:${pick}`) so it resets automatically when
  the barrier advances (Potion Lab `selection.key`).
- After commit: lock the controls (disabled, **not hidden** — no layout jump),
  show "Locked in. Waiting for others", and show each seat's ready chip.
- `ctx.makeMove` allows one in-flight action per device; on an error string,
  unlatch and show the message. The authoritative snapshot will arrive over the
  socket either way.

---

## 6. Conflict handling

Conflicts are handled in four layers. A game owns only layers 3 and 4; layers 1–2
are platform guarantees.

### 6.1 Layer 1 — storage concurrency (platform)

Two phones commit in the same instant. Each request runs in the room's Durable
Object, loads the D1 state blob, applies the move, and saves with
`UPDATE … WHERE version = ?`. The loser gets "State changed while saving" and
`withStateRetry` replays it (up to 3 tries) against the **fresh** state. Net
effect: every action is applied **serially, in the server's order**, against the
latest state. Games never see interleaved writes.

Consequence for games: a retried action is re-run from scratch, so
`applyAction` must be a pure function of `(state, mark, action)` — no side effects
outside the game blob.

### 6.2 Layer 2 — stale and wrong-game actions (platform)

- `game_epoch` (sent by `ctx.makeMove` automatically) rejects a move built against
  a previous game of the same room (a tab left open across a rematch).
- `room.revision` lets the client discard out-of-order snapshots.
- `mark` comes from the server's seat lookup, never from the payload.

### 6.3 Layer 3 — action-level policy (game)

| Situation | Policy | Why |
|---|---|---|
| Same-barrier duplicate (retry, double tap, two tabs) | **ignore silently**, first commit wins | it is the same intent; erroring would confuse the player |
| Action stamped for another round/pick | **reject loudly** with "refresh to catch up" (RTTA). Potion Lab drops these silently; prefer loud for new games | a stale tab must not act on a board it can't see |
| Unstamped action (legacy client mid-deploy) | accept | deploy safety; stamp everything new |
| Wrong phase (commit during review, etc.) | reject with a readable message | |
| Commit from a skipped seat | reject loudly | prevents "✓ submitted" over a voided turn |
| Illegal content (not your card, out-of-range value) | normalize/clamp, then reject if still illegal | trust-but-clamp is the floor; re-validation the ceiling |

Validate a commit against the state **at the time it arrives**, but resolve it
**at barrier close** — so validate only things that cannot change before close
(your own hand, a cell existing), and leave contested outcomes to 6.4.

### 6.4 Layer 4 — contested resources at resolution (game)

When two commits claim the same thing (same board cell, same tile, last copy of a
card), the rules module decides **deterministically**, from data in the state —
never from arrival order (for simultaneous submit), wall-clock time, or
`Math.random()` outside the RNG seam. Pick one rule, write it in the rules text the
player sees, and pin it in a test:

| Strategy | How | Good for |
|---|---|---|
| **Rotating priority** (recommended default) | a `priority_order` that rotates one seat each round; earliest seat wins the contested claim | boards and tile placement — fair over a game, easy to explain ("first player marker") |
| Bounce both | every claimant fails; their commit falls back (tile returns to hand, or a default legal action) | games where collisions should be a funny moment |
| Merit tie-break | compare a game value (bid, lower score, initiative card), then priority order | auction/bid mechanics |
| Split / share | both get it, or it is divided | scoring rewards (Potion Lab's Moon Dust majority split) |
| Arrival order | server-received order (live round only) | only when speed is an intended mechanic (RTTA monuments) |

Resolution order inside `resolveRound`:

1. Gather every seat's `committed` (plus bots').
2. Group claims by contested key (e.g. `"x,y"` cell).
3. Apply the contention rule; **losers get a fallback**, never a lost turn without
   an explanation.
4. Apply all winning claims together, then derived effects (scoring, chains) in
   one fixed order.
5. Push an `events` entry for every conflict, naming who won, who lost, and why.

A tile-laying worked example: every player places one tile per round. Two players
target cell `(3,4)`. With rotating priority, whichever of them is earlier in this
round's `priority_order` places it. The other tile goes back to its owner's hand
(or to their second-choice cell, if the commit carried one), and the event reads
"P3 bumped from (3,4) — P1 had priority this round". The legality of each
placement is checked against the board **as it stands after higher-priority
placements**, so two adjacent placements that are each legal alone but illegal
together resolve correctly.

---

## 7. Easy asset swapping and renaming

The goal: re-theme or rename a game by editing **one display table, one CSS token
block, and one registry line** — without touching rules, tests, stats, or saved
rooms.

### 7.1 Ids are permanent; names are not

| Thing | Change it? | Notes |
|---|---|---|
| `GAME_IDS` value (12-hex) | **never** | rooms, stats, high scores, Elo, and saved state key off it |
| Registry `name` / `summary` / `players` | freely | the manifest `name` must match exactly (architecture test) |
| `aliases` | **add**, don't remove | append the new slug; old slugs keep old links and tests working |
| Registry key (`GAME_IDS.myGame`), exported consts, directory name | avoid | code-only identifiers; renaming them is churn across imports, `review-export.js`, and tests. A display rename doesn't need them changed (Roll of the Dead still lives in `zombie-dice/`) |

**Rename checklist:** registry `name` + `summary`, manifest `name` +
`description`, add an alias slug, the game's display strings (§7.2), lobby
`heading`/`blurb`, and the `docs/game-<id>.md` title. Run `npm test`. Nothing else.

### 7.2 Keep rule ids separate from display

Rules modules speak in stable **type ids** (`"frog"`, `"herb"`, `"wizard"`). Every
player-facing name, emoji, color, and image is looked up from **one display table**
on the client:

```js
// games/<dir>/content.js — display only; the worker never imports this
export const PIECES = {
  frog:   { name: "Frog",   emoji: "🐸", art: null },
  herb:   { name: "Herb",   emoji: "🌿", art: "games/my-game/art/herb.webp" },
};
```

Potion Lab's `CARD_META` and Mystic Wood's `content.js` are the precedents
(Potion Lab is itself a re-theme done this way). A re-theme then edits only this
file and the CSS tokens; rules, tests, bots, and saved games are untouched. Never
branch rule logic on a display string, and never store display strings in the
authoritative state.

### 7.3 Palette and styling through tokens

Put every color in CSS custom properties on the game root, with a dark override:

```css
.my-game-root{ --mg-bg:#f3eefb; --mg-ink:#241b33; --mg-accent:#c2410c; … }
html[data-theme="dark"] .my-game-root{ --mg-bg:#141020; --mg-ink:#efe9f7; … }
```

Rules reference only `var(--mg-*)`. A palette swap is a token edit. Prefix every
selector with `.my-game-root`, never reuse shell class names, and add the
`#macroBoard:has(.my-game-root){display:block;aspect-ratio:auto}` and `#turnStatus`
neutralizers (see [adding-a-game.md](adding-a-game.md), [theme.md](theme.md)).

### 7.4 Image and audio files

- Emoji and inline SVG are the zero-cost default: no files, no cache, both themes.
- Binary art lives in the game's own directory (`static/games/<dir>/…`), never in
  the shell's `assets/`. Reference it **relative to the site root**, because injected
  CSS resolves against the page: `url("games/zombie-dice/board-bg.jpg")`.
- Reference each file from **one place** (the display table or one CSS token), so a
  swap is a one-line edit.
- **When replacing art, change the filename** (`board-bg-v2.jpg`) or add
  `?v=2`. The service worker fetches `.js` with `no-store`, but images go
  network-first with a cache fallback, and browsers may hold an HTTP-cached copy.
  A new name guarantees every phone sees the new art.
- Keep images small (mobile budget): prefer WebP/JPG ≤ ~200 KB and SVG for
  line art. Source files and generator scripts live with the game too.

---

## 8. Definition of done (contract view)

The process gates live in [adding-a-game.md](adding-a-game.md). From the contract
side, a game is plugged in when:

- [ ] Registry entry + manifest, `lobbyMode: "hostStart"`, names match.
- [ ] Rules module is pure, seeded RNG seam, normalize/clamp on entry.
- [ ] `GAME_HANDLERS` row with `initSeats` + `resolvesBotsInternally`; options
      hooks if the lobby has options.
- [ ] `initSeats` throws below the minimum player count.
- [ ] Viewer projection masks every hidden choice (hands **and** uncommitted
      picks) until resolution; wired in `gameToDictForViewer`.
- [ ] `stats.js` score branch; `status: "complete"` + `winner` set at the end.
- [ ] Parallel play: stamped actions, idempotent duplicates, loud stale
      rejection, humans-only barrier, bots last via the human path, skip vote.
- [ ] Contested resources resolved by a documented deterministic rule, with
      events, pinned by tests.
- [ ] Client: shared lobby while unstarted, host options out of the DOM,
      barrier-keyed local selection, disabled-not-hidden controls, error unlatch.
- [ ] Display strings and art in one display table; colors in tokens; dark theme.
- [ ] New files in `review-export.js`; `npm test` green; `docs/game-<id>.md`.
