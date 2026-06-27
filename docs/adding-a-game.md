# Adding a Game to SogoTable

The front door for "I want to add a game — here are the rules for coding." It is
a checklist and an AI-handoff brief in one. It does not replace the owner docs;
it routes to them and names the exact code touchpoints.

Adding a game happens in **two phases**. Do them in order.

1. **Design** — answer the Intake Survey, then run the result through AREC.
2. **Build** — the vertical slice: rules module + client module + predicate +
   registry row.

Do not write game code until the survey is answered and AREC has passed. The
survey is what decides the architecture; skipping it is how a game ends up
fighting the platform instead of reusing it.

---

## Phase 1 — Intake Survey

Answer these before any code. The answers decide what architecture is required,
what assets are required, and what runs on the server versus the local game app.
Capture the answers in the game's `PLAN.md` so the decision is durable.

### A. Seating & timing

- **Who plays:** solo (1) · hot-seat (many on one device) · multi-device (rooms)?
- **Cadence:** turn-based · live-round · real-time?
- **Reality check:** today SogoTable is **turn-based multiplayer over rooms**.
  Solo and real-time gameplay (e.g. the `AI/match-three` demo) are **not
  supported yet** and require a product decision before you build — they would
  add a new timing mode to the platform, which is an invariant change. Flag it,
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
