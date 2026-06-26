# Modularity

This document is SogoTable's durable modularity doctrine: how responsibilities
are split into focused owners, how code is grown without producing god files,
and how new games are added as clean modules instead of being smuggled into the
shell.

It is the structural counterpart to `docs/wu-wei-method.md`. Wu Wei owns how
state *flows* (event-driven, explicit refresh, the downhill riverbed).
Modularity owns *who owns what* and *how big a unit is allowed to get*. Where
the two overlap — clear boundaries, one owner per responsibility — treat the Wu
Wei doc as the flow authority and this doc as the ownership/structure authority.
`docs/architecture.md` remains the current-shape owner; this doc is the rule for
keeping that shape from rotting as features land.

This method is adapted from Ozymandias2's modularity doctrine. Ozy is reference
material only; SogoTable owns its own version.

## Golden Rule

> **The platform owns the table. The game owns the rules. The UI owns the
> presentation. Persistence owns storage.**

Every modularity decision in this doc reduces to keeping these owners from
blurring. The boundaries read sharpest as what each owner must **not** touch —
a violation of this table is wrong until proven otherwise:

| Concern | Owns | Must NOT own |
|---|---|---|
| Platform / table | rooms, players, seats, routing, room lifecycle | game-specific rules or scoring |
| Game rules | legal moves, scoring, win/loss, phase/timing | DOM, network calls, persistence |
| UI | rendering, button state, animation, local interaction | authoritative move/score/win decisions |
| Persistence (D1 / Durable Object) | loading/saving durable state | game decision-making |
| Transport / sync (api-client, Worker routing, room socket) | moving validated requests + snapshots | business rules hidden in messages |
| Bots | choosing one legal move, submitted through the normal move path | mutating state directly or bypassing validation |
| Stats | recording outcomes | deciding winners |

The litmus test for any module: name the one concern it owns, then confirm it
touches nothing in another row's "Owns" column. If you cannot, it is becoming a
god file — give the stray concern its own owner before it grows. The sections
below are how this rule is applied and enforced.

## Core Doctrine

- Give every responsibility exactly one clear owner.
- Keep modules small, cohesive, and named for what they own.
- Separate game rules, transport, and UI. They must not bleed together.
- Keep game rules testable without a browser.
- Add games through dedicated modules, never by mixing rules into UI code.
- Grow by extracting stable seams, not by rewriting working code wholesale.
- A module with no owner is a future god file. Give it an owner before it grows.
- Prefer a small, boring split today over a heroic refactor later.
- Do not add abstraction that hides simple logic or fights the existing shape.

## The Module Map

SogoTable already has clean structural seams. Protect them. Each lane below owns
its concern and passes clean state to the next; none should reach across into
another's job.

```text
Worker authority   (workers/sogotable-api.js + RoomDurableObject)
        owns: shared truth, validation, game rules, room lifecycle, snapshots
Game rule owners   (per game, inside the Worker brain today)
        owns: legal moves, scoring, phase/timing for one game
Browser shell      (src/sogotable/static/app.js + helpers)
        owns: screens, state machine, explicit refresh, error display
Game UI modules    (src/sogotable/static/games/<game-id>/)
        owns: one game's rendering and local interaction
Shared helpers     (api-client.js, color-utils.js, html-utils.js, ...)
        owns: one reusable concern each
Docs               (docs/)
        owns: durable decisions, contracts, and current shape
```

The boundaries that must stay sharp:

- **Worker is the only multiplayer authority.** Rules, validation, and room
  lifecycle live behind it. The browser asks; it does not decide truth.
- **Game rules are separable from the shell.** The shared room/lobby shell is
  global; per-game behavior lives in game-state creation, move
  validation/application, and that game's renderer — selected by game id.
- **Game UI is per game id.** New local game work lives under
  `src/sogotable/static/games/<game-id>/` with manifest, rules, state, and
  rendering kept apart inside the module.
- **Helpers own one concern.** `api-client.js` is transport, `color-utils.js`
  is color math, `html-utils.js` is escaping/markup. A helper that grows a
  second unrelated concern should split.

## One Owner Per Responsibility

When you add behavior, first answer: *what already owns this?*

- If an owner exists, put the behavior there and keep that owner cohesive.
- If the behavior spans owners, it belongs at the boundary, not duplicated in
  every caller. Fix it once upstream rather than patching each caller.
- If nothing owns it, create a focused owner module instead of dropping it into
  the nearest convenient file. "There was no good home, so I put it in `app.js`"
  is how god files are born.

Use the `Table -> Board -> Zone -> Cell` nomenclature (see `docs/nomenclature.md`)
so ownership reads consistently across rules, state, and rendering. A module
named for a real concern is easier to keep honest than one named for where it
happened to land.

## No God Files

A god file is any module that has quietly become the owner of unrelated
concerns — players, rendering, rules, transport, and navigation all at once. Wu
Wei already names the anti-pattern: *one giant app brain that owns players,
rendering, rules, transport, and docs.* This is the rule for preventing and
unwinding it.

- The largest, most mixed-responsibility files are the highest risk. Know which
  files those are (today `app.js` is the one to watch) and treat new behavior in
  them with suspicion: does this *have* to live here?
- Do not let "it's already the big file, one more thing won't hurt" decide
  placement. That is exactly how the big file got big.
- A god file is not fixed by a dramatic rewrite. It is fixed by extracting one
  clear seam at a time, behavior-preserving, with tests pinning the behavior
  before and after.
- Pull stable, obviously-separable helpers out first (formatting, color, markup,
  transport). Save the hard structural splits (e.g. the screen/controller
  boundary inside the state machine) for when the seam is genuinely obvious —
  splitting prematurely creates a worse tangle than leaving it.

## Growing Code Modularly

- Design the flow and the owner before writing control logic.
- Make the smallest correct change. One module extraction per change, not five.
- Each extraction must be behavior-preserving and provable: keep the output
  identical (or add a test that pins it) so the seam is safe to trust.
- Be a low-ego refactor opportunist: when you are already editing ugly nearby
  code and the scope is small, improve its naming, duplication, or boundary.
  Do not rewrite everything, swap approaches, or add clever layers for a
  maintenance win that isn't concrete.
- Do not split a unit until its internal boundary is obvious. An early split
  along the wrong seam is harder to undo than a slightly-too-large cohesive file.
- After a change, look for what it left behind: dead code, stale imports,
  orphaned helpers, a comment that no longer matches, duplicated logic that now
  wants one home.

## Adding A Game Is The Reference Modular Act

SogoTable is a platform, not a single-game app, so adding a game is the most
common structural change and the clearest test of modularity. A new game should
add, as separable pieces:

- a game definition in the hosted `/api/games` registry (the browser may keep a
  tiny fallback registry for startup resilience, but hosted metadata is the
  source)
- timing metadata (`turnBased`, `liveRound`, ...) as game data, not a new
  transport
- a game-specific rule owner with clear inputs and clear state-change/rejection
  outputs
- tests for that rule owner, runnable without a browser
- room/state handling that **reuses** the existing Worker room path
- a browser game module under `src/sogotable/static/games/<game-id>/` that
  renders from the authoritative room snapshot, selected by game id

It should **not** add a custom room flow, a custom identity system, a separate
lobby, or a hidden local backend. Timing mode, board shape, and move payload are
the game's business; transport, identity, and room authority are the platform's.
Do not bury a new game inside unrelated UI rendering code.

## Rules, Transport, UI, Docs Must Stay Separate

- **Game rules** accept clear inputs and return clear state changes or rejection
  reasons. They must not reach into browser storage, decide screen navigation,
  or emit UI text as their primary output. They are testable without the DOM.
- **Transport** (api-client, Worker routing, the room socket) moves validated
  requests and snapshots. It does not contain game logic or rendering.
- **UI** renders screens and the current snapshot and surfaces failures. It does
  not validate final game outcomes or invent shared state when the Worker is
  unavailable.
- **Docs** record durable decisions and contracts. They do not stand in for
  tests, and they do not preserve dead designs as if still active.

Keep generated frontend assets and behavior in real, diffable, testable files —
not concatenated into one giant string or one mega-handler. A vanilla stack is
not an excuse to merge concerns; it is the reason to keep them physically
separate so they can be reasoned about and reused.

## Smell Tests — When To Extract A Module

Extract when any of these is true:

- A file owns more than one clear concern and the concerns change for different
  reasons.
- You keep scrolling past unrelated logic to find the part you are editing.
- A helper has grown a second, unrelated responsibility.
- The same defensive logic is copy-pasted into several callers.
- You cannot test a rule because it is entangled with rendering or transport.
- Adding a game required editing shell/UI code that has nothing to do with that
  game.
- You hesitate to touch a file because you are unsure what else lives in it.

Do **not** extract just to chase small files. Cohesion beats fragmentation: a
focused 400-line module that owns one thing is healthier than five 80-line files
that only make sense read together.

## Anti-Patterns

Avoid:

- one giant app brain that owns players, rendering, rules, transport, and docs
- game rules buried inside click handlers or UI rendering
- adding behavior to the biggest file because it is already big
- duplicating a fix in every caller instead of one upstream owner
- splitting a unit along a seam that is not yet obvious
- a heroic, behavior-changing rewrite when a small seam extraction would do
- introducing frameworks, new storage, or abstraction layers because they sound
  grown-up rather than because a concrete maintenance win demands them
- a new game that drags in its own room flow, identity, or backend
- leaving dead code, stale imports, or mismatched comments after a refactor

## Review Checklist

Before a non-trivial structural change, ask:

- What single owner is responsible for this behavior?
- If no owner exists, am I creating a focused one instead of using a convenient
  dumping ground?
- Does this keep game rules, transport, and UI separate?
- Can the rule change be tested without the browser?
- Am I extracting one clear seam, behavior-preserving, rather than rewriting?
- Did I avoid growing a known god file?
- For a new game: does it reuse the platform's room/identity/transport and live
  in its own `games/<game-id>/` module?
- Did I clean up what the change orphaned (dead code, stale imports, comments)?
- Did the durable decision land in the owner doc or `docs/project-memory.md`?

If the answer is muddy, give the responsibility an owner before you give it more
code.
