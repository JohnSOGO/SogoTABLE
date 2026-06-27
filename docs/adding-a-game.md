# Adding a Game to SogoTable

The front door for "I want to add a game — here are the rules for coding." It is
a checklist and an AI-handoff brief in one. It does not replace the owner docs;
it routes to them and names the exact code touchpoints.

Adding a game has an optional prototype step and **two required phases**:

0. **Prototype** (optional, recommended for novel games) — prove the feel and
   rules standalone in the `AI/` sandbox, off the server, behind clean hooks.
1. **Design** — answer the Intake Survey, then run the result through AREC.
2. **Build** — the vertical slice: rules module + client module + predicate +
   registry row.

Do not write the **integrated** game (the `rules.js` / `client.js` / registry
wiring) until the survey is answered and AREC has passed — that gate decides the
architecture, and skipping it is how a game ends up fighting the platform instead
of reusing it. A standalone prototype in `AI/` is exempt: it is a lab, and its
job is to *reach* the gate, not bypass it.

---

## Phase 0 — Prototype standalone first (recommended for novel games)

When a game's *feel* is the real risk (a novel mechanic, not a known classic),
prove it standalone before paying for integration. Build the UI and rules as a
self-contained local app in the `AI/<game>/` sandbox — no server, no rooms, no
lobby, instant reload — and iterate where the loop is cheapest. `AI/match-three/`
is the worked example: a single `index.html` with a pure `Match3` core and a
documented path to a module.

This is the development-time twin of the runtime split in Phase 1B: **build off
the server, with hooks to push to the server once it is "good enough."** For that
to pay off instead of becoming a rewrite, follow these constraints:

- **The standalone's rules core IS the future `rules.js`** — pure, no DOM, no
  timers. Lift it at integration; never reimplement it. (match-three's `Match3`
  core is built exactly this way.)
- **Plan the hooks up front**, from the Phase 1B actionable-events list: the
  **action-emit seam** (the points that will call the server / `applyAction`) and
  the **state-injection seam** (the ctx bag the shell will provide). Don't
  discover them at integration time.
- **Flag the server-authority deltas early** — anything the standalone does
  locally that the server must own after integration: shared RNG (dice/shuffle
  fairness), move re-validation, and especially **hidden information**. A
  standalone holds *all* state on the client, which is fine in the lab but fatal
  for a multiplayer hidden-info game. If the game has hidden info or shared RNG,
  design those seams before the prototype hardens.
- **"Good enough" is a gate, not a vibe.** Passing the Intake Survey + AREC is
  what promotes a prototype out of `AI/`. The standalone proves *feel and rules*;
  it does **not** skip the survey's invariant checks (e.g. solo/real-time
  support) or the multiplayer-resilience and hidden-info validation that only
  happen after integration.
- **Keep it in the gitignored `AI/<game>/` sandbox** until it is promoted. A
  standalone is also the cleanest unit to hand to or from another AI session
  (the match-three demo arrived as a ChatGPT pass).

---

## Phase 1 — Intake Survey

Answer these before any code. The answers decide what architecture is required,
what assets are required, and what runs on the server versus the local game app.
Capture the answers in the game's `PLAN.md` so the decision is durable.

### A. Seating, coupling & timing

- **Who plays:** solo (1) · hot-seat (many on one device) · multi-device (rooms)?
- **Player coupling — the first question:** do players share *one* game, or play
  their *own*? See **Sync modes** below.
  - **Shared-table** — everyone acts on one game state (today's games); within
    that, timing is `turnBased` or a `liveRound` variant.
  - **Game-Locked** — each player plays an independent game to completion; the
    shared truth is a leaderboard, not a board ("multiplayer solitaire").
- **Reality check:** **shared-table turn-based** is fully built. **Game-Locked**
  is an adopted category (AREC 2026-06-27) with Yahtzee as the first
  implementation — it is the supported path for solo-scoring games (Yahtzee,
  match-three). A genuinely real-time *shared* board is still unbuilt; flag it,
  do not infer it.

### B. Client vs server split — *the core question*

Guiding principle: **local-first turn-taking, server-authoritative commits.**

- **Push onto the game app** (no server round-trip): rendering, move preview and
  selection, "are you sure" affordances, animation, sound, and any turn rotation
  that stays on one device (hot-seat). Solo play, if/when supported, lives almost
  entirely here.
- **Send to the server only when an action is *actionable*** — i.e. it must be
  authoritatively adjudicated, must persist, must reach another device, must be
  tamper-resistant, or produces a score/stat. A committed move is actionable; a
  half-built move is not.
- **The server stays the authority.** It **re-validates every committed move**
  against the authoritative state and rejects illegal / stale / out-of-order
  submissions. Client-side rules are a UX mirror for instant feedback — never the
  source of truth for shared state. (Client predicts; server confirms.)
- **Why:** fewer round-trips means snappier play and fewer Cloudflare writes —
  see [Cloudflare Quota Guardrails](cloudflare-quota.md).

Deliverable for this section: **list the minimal set of actionable events** this
game sends to the server. Everything else is local.

### C. Hidden information

- Does any player hold private state (a hand, a hidden fleet, fog of war)?
- If yes: the **server owns the secret** and emits a **per-viewer sanitized**
  state — never broadcast the full state. Follow the Battleship precedent
  (`battleshipGameToDictForViewer` behind `gameToDictForViewer` /
  `responseForViewer` in `workers/sogotable-api.js`). A client must never receive
  data it is not allowed to see.

### D. Authoritative state shape

- What is the authoritative game state? It must be **plain, serializable data**
  (type indices, ids, scalars) — no DOM nodes, no promises, no class instances —
  so it round-trips through D1 and replays deterministically.
- What is purely **local view state** (selection, animation, camera) that the
  server never needs to see?
- Does the game need randomness (dice, shuffle, board generation)? Put it behind
  one **RNG seam** so it can be seeded for replay and bots. Shared-outcome
  randomness (who-wins dice) is **server-owned**; cosmetic local randomness can
  stay client-side.

### E. Assets

- What art, sound, board imagery, or icons does the game need?
- They live in the **game's own directory**, not the shell. Mind the mobile
  budget — keep large binaries out of the critical path.
- Source/generators for assets (e.g. SFX synth scripts) live with the game too.

### F. Bots

- Is a bot opponent required? Which difficulty tiers
  (see [AI Difficulty Ladder](ai-difficulty.md))?
- Bots run the **same rules path as humans** — no bot-only legality shortcuts.

### G. Reuse

- Confirm the game reuses the standard **lobby, room, invite, presence, and stats
  flow**. The default answer is "all of it."
- If something genuinely cannot reuse the platform path, say *what* and *why* in
  `PLAN.md` — that is an AREC-worthy exception, not a default.

---

## Sync modes — who shares a game

The **first** architecture question (Survey A): how tightly are players coupled in
time? This axis sits *above* the within-game timing modes (`turnBased` /
`liveRound` …), which only apply *inside* a shared game.

- **Move/Turn-Locked** — one shared game state; players alternate moves in strict
  order; the server validates every move and broadcasts the board. All current
  games. Within this, timing is `turnBased` (or a future `liveRound` variant per
  [project-memory](project-memory.md)).
- **Round-Locked** — one shared game, but players sync at the *round* boundary
  rather than every move (the `liveRound` family).
- **Game-Locked** — each player plays their **own independent game to completion**
  at their own pace; the shared truth is a **leaderboard**, not a board. Finals
  are compared to crown a winner. This is *asynchronous multiplayer solitaire*,
  and it is the supported path for **solo-scoring games** (Yahtzee, match-three).
  Adopted via AREC 2026-06-27.

### Building a Game-Locked game

The model is the Phase 0 standalone *promoted directly to multiplayer*:

- **N independent game states + one shared leaderboard projection.** The server
  stores each player's game state and aggregates posted scores into the
  leaderboard (the global truth). Lobby/room/players/stats are reused unchanged —
  Game-Locked is a *room mode*, not a new lobby.
- **The client owns its whole game** (exactly the standalone). It runs locally and
  pushes **only the global**: a committed round's score, "I finished," and a tiny
  fixed set of **significant plays** (e.g. a Yahtzee, a lead change) that fan out
  to everyone. In-progress turn state (dice, holds, current rolls) **never leaves
  the client** — the local-first rule is mandatory here.
- **Softer score authority — a documented family-scale exception.** Because the
  client runs the game and posts the score, a client could lie. For family play we
  **accept trusted client-posted scores**; the upgrade path (if it ever matters)
  is to post the move/RNG log and re-validate server-side. State this in `PLAN.md`.
- **Per-player resume.** A dropped player resumes *their own* game from a server
  snapshot; the leaderboard shows them "in progress."
- **N-player UI shape:** the player's own game up top, a **tip/news strip** for the
  broadcast significant plays, the **all-player score table at the bottom**, and
  the player's own big total as the headline number.
- **Series (optional wrapper — build last):** an ordered array of games; play each
  Game-Locked; per-game scores accumulate; reveal the winner when the array is
  exhausted. Do not build the series until single-game Game-Locked is solid.

---

## Phase 1.5 — AREC gate

Run the survey output through [AREC](AREC.md) before implementation. AREC's
Evaluate step already checks lobby-flow fit, rules/UI/transport separation, and
module placement — exactly the failure modes a new game invites. AREC should
raise confidence, not add ceremony; scale it to the risk.

---

## Phase 2 — Build the vertical slice

### The one-line contract

> A game = one **rules module** + one **client module** + one **`is<Game>`
> predicate** + one **`GAME_HANDLERS` row** + one **`registry.js` entry**.

If you find yourself touching shell move/bot/lobby code, stop — the contract is
designed so you do not have to.

### Files to create

```text
workers/games/<id>/rules.js                  # pure, server-authoritative rules
workers/tests/…                              # rules tests, runnable with no browser
src/sogotable/static/games/<id>/
  manifest.js                                # module metadata (see below)
  client.js (or render.js)                   # in-game UI adapter (ctx bag)
  index.js                                   # module entry / exports
  README.md, PLAN.md                         # the survey answers + plan
```

- **`rules.js`** owns validation and state transitions. No DOM, no emoji, no
  timers. This is the part tests pin without a browser.
- **`client.js`** renders prepared public state and captures intent. It receives
  a **ctx bag** from the shell and bridges back via getters/setters (see the
  header of `games/battleship/client.js`). It exports a **render-key fragment**
  (see `games/render-keys.js`). **All wiring is `addEventListener` — no inline
  `onclick`, and no rule logic in the UI.**

### The `GAME_HANDLERS` row

One row in the table in `workers/sogotable-api.js` wires the game into every
generic path (create / serialize / legal-moves / move / bot):

```js
{ id, is, create, toDict, legalMoves, bot, applyAction,
  // optional behavior flags:
  enforcesTurnOrder, preMove, resolvesBotsInternally }
```

`applyAction(game, mark, payload)` normalizes the game's move signature so the
generic `/api/room/move` and bot-turn dispatch never special-case it. Keep the
`is<Game>` predicate in the Worker (it resolves the canonical id).

### Register the game

- Add the id to `GAME_IDS` and an entry to `GAME_REGISTRY` in
  `src/sogotable/static/games/registry.js` — **once**. Both runtimes import it,
  so the ids cannot drift. Seating is expressed here today via `player_count` /
  `host_start` (see the `10,000` entry).
- Add a `manifest.js` carrying richer module metadata (`minPlayers`,
  `maxPlayers`, `timingMode`, `capabilities`). Note: `manifest.js` metadata is
  module-local and not all of it is runtime-consumed yet — the runtime reads
  `registry.js`. Keep the two consistent until they converge.

---

## The hard rules

- **No interdependence between games.** A game module must **not** import another
  game. Shared logic goes in `workers/games/{bots,util}.js` or a platform module
  — never game-to-game. Each game must be independently removable.
- **Reuse the lobby.** Do not add a custom room flow, a custom identity system, a
  separate lobby, or a hidden local backend. ([Modularity](modularity.md) 162-164.)
- **Server-authoritative on commit.** The UI never decides legal/illegal for
  shared state; the server re-validates. (Phase 1B.)
- **Plain-data, deterministic, replayable state**, RNG behind a seam.
- **Hidden info → per-viewer sanitizer.** Never broadcast secrets. (Phase 1C.)
- **Bots run the human path.** No bot-only rule mutations.
- **Declare the timing mode.** Turn-based is supported today; solo/real-time is a
  product decision first.
- **Lowercase directory names.** A capital-cased dir (e.g. `Quoridor/`) collides
  with a lowercase import on Cloudflare's case-sensitive build and white-screens
  the app. Check `git ls-files` for the tracked case.
- **Respect the guards.** Add the new files to the review-export allowlist
  (`review-export.js`) and keep within the architecture line-count ceilings
  (`workers/tests/architecture.test.js`) — extract, don't bloat the shell.

---

## Before you ship

- **Rules tests pass with no browser.**
- **Sibling-path review** — hot-seat vs multi-device, bot vs human, public vs
  private view, reconnect vs initial join, mobile vs desktop. If a sibling path
  is in scope, update and test it too.
- **Multiplayer resilience** — assume reconnects, duplicate tabs, dropped
  sockets, bad codes; fail loud in dev, graceful in prod; use the room WebSocket
  path for active updates; avoid needless polling/writes.
- **Ship `docs/game-<id>.md`** documenting the game, and link it from the docs.

---

## Where to go deeper

- [Wu Wei Method](wu-wei-method.md) — the canonical flow a game must follow.
- [Modularity](modularity.md) — the ownership Golden Rule and the reference
  "adding a game" act.
- [AREC](AREC.md) — the proposal gate.
- [State Machine](state-machine.md) — room and screen behavior to reuse.
- [Cloudflare Quota Guardrails](cloudflare-quota.md) — why the client/server
  split matters for cost.
- [Bot Behavior](bots/index.md) and [AI Difficulty Ladder](ai-difficulty.md).
