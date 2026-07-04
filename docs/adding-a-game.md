# Adding a Game to SogoTable

The front door for "I want to add a game — here are the rules for coding." It is
a checklist and an AI-handoff brief in one. It does not replace the owner docs;
it routes to them and names the exact code touchpoints.

Adding a game has an optional prototype step and **three required phases**:

0. **Prototype** (optional, recommended for novel games) — prove the feel and
   rules standalone in the `AI/` sandbox, off the server, behind clean hooks.
1. **Design** — answer the Intake Survey, then run the result through AREC.
2. **Build** — the vertical slice: rules module + client module + predicate +
   registry row.
3. **Verify** — run the Verification Gates (each in a fresh session) and collect
   their receipts in the game's `PLAN.md`. No receipts → not done.

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

See [Building Offline UI Prototypes](offline-ui.md) for the standalone's UI shape
and the shell contract — what to build (the in-game screen, an N-player status
table at the bottom) and what **not** to (no intro, no room/setup flow, no
player-count picker; seats come from the server).

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

### H. Rules source & deviations

Division of labor, stated plainly: **for a cloned game the published rulebook is
the spec, and the session building/verifying the game is accountable for fidelity
to it; the human is accountable for feel and intended deviations.** The human
does not need to master the rules to commission the game — but fidelity must be
*someone's* job (RTTA shipped four rules bugs because it was nobody's).

- **Clone or original?** For a clone, drop the published rulebook into
  `AI/<game>/` — it becomes the spec the **rules-fidelity gate** holds the build
  to. For an original, the rules live in the owner's head; the gate runs in
  interview mode instead.
- List every **intended deviation** in `PLAN.md` — house rules, mobile/family
  simplifications, automation (e.g. auto-discarding excess goods), N-player
  scaling choices. An unlisted difference from the rulebook is a bug by
  definition; a listed one is a product decision.

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
- **Game-Locked** — each player plays their **own** game; the shared truth is a
  **leaderboard**, not a board. Supported path for **solo-scoring games** (Yahtzee,
  match-three). Adopted via AREC 2026-06-27. It has **two timing variants — pick one
  in the survey, they are not interchangeable** (conflating them cost a rebuild):
  - *Async* — each player finishes at their own pace; finals are compared. True
    "asynchronous multiplayer solitaire."
  - *Lockstep series* — a **global game index** with a game-level **barrier**:
    everyone plays the same game number, and the table advances to the next game
    only when **every human** has finished the current one. **Yahtzee shipped this.**
    It makes per-game scores comparable, at the cost of fast players waiting.

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
- **Series (optional wrapper):** an ordered array of games whose per-game scores
  accumulate into an **overall**, matching the *async* / *lockstep-barrier* variant
  chosen above. For the barrier variant the **server** owns the game index and the
  barrier; each seat carries `series_past` (banked games) + the current card, and
  `overall = series_past + current`. Build the series only after single-game is solid.
- **Bots may pre-compute — but then they are opponent-blind.** A Game-Locked bot
  can play its whole game/series **upfront** at seat-init (Yahtzee does). That means
  it must be **CPU-cheap** — it runs synchronously when the room starts, so no full
  game-tree search (enumerate distinct dice multisets with probabilities, not every
  branch) — and it **cannot be opponent-aware** (no opponent has scored yet). Reveal
  its pre-played result **paced to the leading human's round** so it still reads as a
  live race. See `workers/games/yahtzee/ai.js`.

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

### Rendering into the shell board

The shell hands the game `#macroBoard` as its mount and runs
`setGameBoardVisible(true)` before your `renderGame` branch. Edges every non-grid
game hits (all learned on Yahtzee):

- **Neutralize the tic-tac-toe grid.** `#macroBoard` carries class `.macro-board`
  (`display:grid; aspect-ratio:1/1`) — a square sized for a 3×3 board — which clips
  a taller game and pushes content off-screen. Override it scoped to your own
  wrapper: `#macroBoard:has(.<game>-root){display:block;aspect-ratio:auto}`. It
  self-reverts for other games (no `.<game>-root` present).
- **Scope every CSS selector.** A promoted standalone uses generic names (`.row`,
  `.card`, `.die`) that would clobber the shell globally. Wrap the UI in a single
  `.<game>-root` and prefix all rules; inject the stylesheet once.
- **Theme it for dark and light.** The platform is themed (`data-theme` on
  `<html>`) and **every shipped board now has a dark variant** — match that. Add a
  **theme-gated, scoped** dark block — `:root[data-theme="dark"] .<game>-root … {}`
  or `--token` overrides — **injected from your module** (a `<GAME>_DARK_CSS`
  string appended to the same injected `<style>`), leaving the light palette and
  the line-capped shared `styles-games.css` untouched. Don't blanket-darken:
  physical objects that read naturally light (dice, white pieces) **stay light** by
  design. If you themed the Phase 0 standalone (you should have), this is a lift,
  not new work. Full spec + worked examples: [Dark / Light Theme](theme.md).
- **Manage the shell chrome.** Hide what you don't use (`#gamePlayersPanel`,
  `#gamePlayerSwitch`). `#turnStatus` is styled `#turnStatus{display:grid}`, which
  beats `.hidden` by ID specificity — collapse it with a scoped
  `#turnStatus:has(~ #macroBoard .<game>-root){display:none}`, not a class.
- **The client wiring is more than the one-liner.** The "one `GAME_HANDLERS` row"
  is the *worker* side. A host-start / Game-Locked game also adds, in `app.js` (all
  additive, beside the existing games — never replacing them): an import, a
  `<GAME>_GAME_ID` const, an `is<Game>GameState` predicate, a `renderGame` branch,
  and `make<Game>Action` / `start<Game>Game` posters.
- **The room-create / invite screen MUST match every other game.** When the room
  is created from the lobby but not yet started, a host-start game owns its own
  not-started screen (the shell hides `#gamePlayersPanel` and delegates). Do **not**
  hand-roll a bespoke invite UI — render the shared **host-start lobby template**
  `games/lobby.js` (`renderHostStartLobby(host, ctx, opts)`) so the seated-
  players roster, the **Invite Remote Opponent / Invite Bot / Start Game** controls,
  and their look are identical across games. It emits the canonical
  `.ten-thousand-lobby` / `.tt-lobby-*` markup and wires the ctx `invitePlayer` /
  `addBot` / `startGame` callbacks; pass `wrap: "<game>-root"` so your macro-board
  neutralizer applies, plus a `heading`/`blurb`, and `extraHtml` + `getStartArg`
  for a start option (the 10,000 opening-score select is the worked example).
  Mazewright, Yahtzee, and 10,000 all render through this one template now — there
  are no hand-rolled lobby copies left to migrate. Which screen a game gets is
  declared explicitly by its `lobbyMode` in `registry.js` (`"hostStart"` for the
  host-start lobby above, `"fixedCapacity"` for the 2-player auto-start room slots);
  an architecture test pins `lobbyMode` to `host_start` so the two can't drift.

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
- **The projection IS the wire contract.** Whatever the client reads off a seat,
  `toDict` must emit. A field the client reads but the projection omits is
  `undefined`, not an error — it fails silently (a missing `series_past` once
  zeroed a player's running total mid-series). Keep the client's seat reads and
  the projection's emitted fields in lockstep, and assert the projected shape in a
  test, not just the internal state.
- **Bots run the human path.** No bot-only rule mutations.
- **A barrier skip is a unanimous proposal, never a unilateral act.** Any
  SKIP_PLAYER-style escape hatch records a VOTE (server state, projected to
  every client as a highlighted proposal) and executes only when all eligible
  waiters have joined; voting again retracts. Use `workers/games/skip-vote.js`
  with a game-specific eligibility predicate. (MojoSOGO decision, 2026-07-04.)
- **Rule maths lives DOM-free.** Every Rules-Ledger row is implemented in a
  rules module (client `rules.js` and/or worker `rules.js`) and pinned by a
  browser-free test. UI files render outcomes and capture intent — they never
  *compute* rule outcomes. (RTTA's lifted turn engine computed rules in the DOM
  — reading state out of CSS classes — so no test could see them; that is how
  four rules bugs shipped.) A headless engine is also what makes bot
  benchmarking, self-play, and future bot training possible at all.
- **Declare the timing mode.** Turn-based is supported today; solo/real-time is a
  product decision first.
- **Lowercase directory names.** A capital-cased dir (e.g. `Quoridor/`) collides
  with a lowercase import on Cloudflare's case-sensitive build and white-screens
  the app. Check `git ls-files` for the tracked case.
- **Respect the guards.** Add the new files to the review-export allowlist
  (`review-export.js`) and keep within the architecture line-count ceilings
  (`workers/tests/architecture.test.js`) — extract, don't bloat the shell.

---

## Verification Gates — fresh-session checks

A gate is a checklist written as an **executable prompt**. Open a **fresh
session** — no build context; independent eyes are the point, the same
incentive-separation the placement/steward split buys — and say:

> Run the **<name>** gate from `docs/adding-a-game.md` against `<game>`.

The session runs the gate, reports gaps ranked by severity, and appends a
**receipt** to the game's `PLAN.md` (create the file if the game predates it):

```text
GATE <name> — <date> — <pass | N gaps> — one line per gap → resolution
```

A gate that leaves no receipt did not run. Gates are **read-only**: they find,
rank, and record; fixing is normal implementer work afterwards, and a gate with
gaps is re-run after the fixes until its receipt says pass.

### Gate: Rules fidelity

**Inputs:** the source rulebook in `AI/<game>/` (reading it is explicitly
authorized when running this gate), the deviations list in `PLAN.md` (Survey H),
and the game's client + server rules code. Original game with no rulebook →
interview the owner first and write the ledger from their answers.

**Do:** build an effect-by-effect **Rules Ledger** from the rulebook — one row
per die face, card, development, disaster, phase step, and end condition —
**including a "Setup: starting resources" row** (RTTA's first gate run skipped
Setup and missed that seats must start with 3 food):

| Effect | Fires when (phase) | Exactly (cost → effect) | Bounds | Touches | Owner | Pinned by (test) |
|---|---|---|---|---|---|---|

Interrogate every row with the classic gap questions: what is **consumed** vs
kept · **exactly N** or N-or-more · does it **add or replace** · does it hit
**self or opponents** · is it usable **the turn it is acquired**? Then diff each
row against the implementation and classify: **correct / wrong / missing /
intentional deviation** (cite the `PLAN.md` decision).

**Also check:** every on-screen ability/help/disaster text matches actual
behavior (the on-screen card is a contract with the player); client and server
data tables agree *and are parity-tested*; every end condition is reachable at
every legal player count.

**Output:** ranked gap list + receipt. Save the ledger itself into `PLAN.md` —
it doubles as the single source for the UI's ability text.

*(Calibration: run against pre-fix RTTA, this gate must catch all five shipped
bugs — Engineering not consuming stone, invasion at ≥4 instead of exactly 4,
Granaries unusable in payment, the monument set ignoring seat count, and seats
starting at 0 food instead of the Setup section's 3.)*

### Gate: Projection

The projection IS the wire contract. **Do:** list every field the client reads
off `ctx.game` / a seat projection; diff against what `toDict` emits. Flag any
field **read but never emitted** (it fails *silently* as `undefined`) and any
**emitted but never read** (dead weight or a missed feature). Confirm a test
asserts the projected shape, not just internal state.

### Gate: Sibling parity

**Do:** walk the sibling-path list (CLAUDE.md): bot vs human · hot-seat vs
multi-device rooms · reconnect/resume vs initial join · public vs private view ·
minimum vs maximum player count · mobile touch vs desktop pointer. For each pair
sharing a contract: same rules, same outcome? Bots must run the human rules path
with no bot-only shortcuts — and must not act on state humans cannot reach
(RTTA's bots built monuments that were out of play for the seat count).

### Gate: Resilience

**Do:** at every server commit point, ask what happens on: duplicate submit ·
stale payload from a previous round · out-of-order arrival · refresh mid-turn ·
duplicate tab · socket drop while a barrier is held · hostile/garbage field
values (the server must clamp or reject — trust-but-clamp is the floor for
family games, re-validation the ceiling). Confirm dev fails loud, prod fails
graceful, and nothing polls or rewrites needlessly (Cloudflare quota).

---

## Before you ship

- **All four Verification Gates have `pass` receipts in the game's `PLAN.md`**
  (rules fidelity, projection, sibling parity, resilience) — each run in a fresh
  session. No receipt → the gate did not run → the game is not done.
- **Rules tests pass with no browser.**
- **Sibling-path review** — hot-seat vs multi-device, bot vs human, public vs
  private view, reconnect vs initial join, mobile vs desktop. If a sibling path
  is in scope, update and test it too. (The sibling-parity gate is the formal
  pass; this is the reminder to fix what it finds.)
- **Multiplayer resilience** — assume reconnects, duplicate tabs, dropped
  sockets, bad codes; fail loud in dev, graceful in prod; use the room WebSocket
  path for active updates; avoid needless polling/writes.
- **Looks right in both light and dark mode** — board, pieces, and status
  surfaces; contrast holds both ways; physical pieces (dice) kept light on purpose.
  ([Dark / Light Theme](theme.md).)
- **Ship `docs/game-<id>.md`** documenting the game, and link it from the docs.

---

## Shipping — just push it

This is a low-traffic family site that sits idle most of the time, so shipping a
finished game does **not** need a staging dance or a "wait for off-hours" hold.
**Once the standalone UI is developed and the vertical slice is integrated with the
full test suite green, push the game straight to `main` and finish it off:**

- Merge the work to `main` (Cloudflare Pages auto-builds the static client on push).
- Run `npm run deploy:brain` to deploy the Worker brain (the new `GAME_HANDLERS`
  row only goes live with this — a static push alone won't ship it).
- A new game adds an opt-in entry to the lobby; it doesn't touch existing games'
  state or rooms, so it won't disrupt anyone mid-game. Don't gate the ship on
  asking permission — the gate is **green tests + AREC**, not deploy timing.

Adding a *new* game is additive and independently removable (the modularity Golden
Rule), which is exactly why it's safe to ship the moment it's done.

---

## Where to go deeper

- [Wu Wei Method](wu-wei-method.md) — the canonical flow a game must follow.
- [Modularity](modularity.md) — the ownership Golden Rule and the reference
  "adding a game" act.
- [AREC](AREC.md) — the proposal gate.
- [State Machine](state-machine.md) — room and screen behavior to reuse.
- [Dark / Light Theme](theme.md) — the theming spec; new boards must support both
  modes (theme the Phase 0 standalone so it lifts straight in).
- [Cloudflare Quota Guardrails](cloudflare-quota.md) — why the client/server
  split matters for cost.
- [Bot Behavior](bots/index.md) and [AI Difficulty Ladder](ai-difficulty.md).
