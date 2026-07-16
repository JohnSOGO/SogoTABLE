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

## Enforcement (what the build actually checks)

Most of this doc is enforced by discipline + review. These rules are also pinned
by `workers/tests/architecture.test.js`, so a violation fails `npm test` instead
of merely contradicting prose:

- **Ratchet ceilings** — the four known big files (`app.js`, the Worker,
  `styles.css`, `styles-games.css`) have individual line caps that only ratchet
  down. Extract, then lower the cap. The new cap is the file's post-extraction size
  **plus a small `WORKING_BUFFER`** (≈25 lines) — *not* `size + 1`. The buffer is
  deliberate: a cap pinned one line above the file makes the *next* routine edit to
  the correct owner trip the guard, which turns the line-count proxy into the master
  and forces ceremony on every commit. The line cap is a smoke detector for
  god-files, not a target to optimise — it should fire on genuine bloat (a whole new
  subsystem, > buffer), then hand off to the `placement-advisor`, and stay quiet for
  ordinary forward work. Re-bloat back toward the pre-extraction size is still
  forbidden, and the 800-line backstop remains the hard "too far" line. (The
  separate `APP_TOP_LEVEL_LET_CAP` gets **no** buffer: it counts cross-cutting shell
  state, where adding a new global should always force a placement decision.)
- **Global file cap (800)** — every *other* source file is capped, so a new god
  file fails the build the moment it forms. Raising the cap or adding an exception
  is a deliberate, reviewed act — prefer extracting.
- **Layering / import direction** — controllers and game modules must not import
  the shell (`app.js`) back; they reach it only through a `ctx` injected via
  `wireX()`. Games are siblings: no game imports another game's module (the lone
  sanctioned exception is Tactical reusing Classic's renderer).
- **Rules purity** — every `games/<id>/rules.js` must reference no
  `document`/`window`/`localStorage`/`sessionStorage`/`fetch`, keeping rules
  browser-testable and side-channel-free (the ownership table, as a test).
- **Single registry + manifest parity + review-export import closure** — game
  ids live only in `games/registry.js`; each manifest reconciles with it; every
  exported module's relative imports resolve inside the export allowlist.
- **Documented owner per module** — `docs/module-ownership.md` maps every concern
  to its owning file. The build fails if a source module is undocumented (a new
  file can't land without an explicit owner row — that row *is* the placement
  decision), if a listed module is stale, or if an upstream owner imports the
  entry/shell it's barred from. Placement is a looked-up, enforced fact.

What is **not** mechanically caught yet (still review's job): ownership-map
*correctness* (the file is in SOME owner's row, but is it the RIGHT one?), other
ownership-table violations (e.g. transport growing game logic), and a `ctx`
surface ballooning past ~12 entries — a strong signal the boundary is wrong or
shared mutable state wants its own owner, not more getters.

## Placement is decided by the architecture step, not the implementer

The implementer (human or AI) is the worst-positioned judge of *where* code
belongs: mid-task, under a deadline, local convenience wins — which is how god
files are born. So placement is **not** the implementer's call, and it is **not**
the customer's (who need not know the architecture). It is decided *before* code,
by an architecture review/agent whose only job is structure:

1. **Customer** asks for a feature.
2. **Architecture step** (a dedicated reviewer/agent, no feature to ship) decides
   the owning module: an existing row in `docs/module-ownership.md`, or — if the
   concern has no home — a *new* owner row (the placement decision), updated here.
3. **Implementer** writes the code in that module only.
4. **Build** enforces it: the ownership guard + layering + caps fail CI if the
   code landed in the wrong place or smuggled in a new global.
5. **Periodic external review** audits the *map and boundaries* — a small legible
   artifact — instead of re-discovering rot across the whole codebase.

The map plus the guards remove trust from the moment it fails (implementation);
the architecture step supplies the judgment up front, where tunnel vision isn't.

## Preparatory Refactoring: Make Room Before The Feature

Placement decides *where* the code goes. When the owning module cannot absorb the
change cleanly — adding the code would push it over its ratcheted line cap, or it
already carries too many concerns — the feature does **not** land there as-is. The
owner is restructured to make room **first**, as a separate behavior-preserving step,
and only then is the feature added.

This is Kent Beck's rule — *make the change easy (this may be hard), then make the
easy change* — and Martin Fowler's **Two Hats**: at any moment you are *either*
refactoring (restructuring, adding no behavior) *or* adding function (new behavior,
restructuring nothing), **never both at once**. It is the "extract one clear seam,
behavior-preserving" rule from [No God Files](#no-god-files) applied as a
**precondition** to the feature instead of as cleanup after it.

**Objective trigger, not a judgement call.** The implementer must not decide "is this
a big job" by feel — under deadline, everything feels small. The architecture step
flags the owner as *full* when adding the planned code would cross a ratcheted ceiling
(one of the four capped files), push any other file toward the global cap, or add
cross-cutting state to a shell already at its top-level-state cap. The live caps are in
`workers/tests/architecture.test.js` — read them there; do not trust remembered numbers.

**Restraint is half the rule.** If the module has room, implement directly — do **not**
refactor speculatively. Splitting a module the feature never pressures, or inventing
seams to look tidy, trades god files for premature-abstraction sprawl and is its own
failure (see [Growing Code Modularly](#growing-code-modularly): never split along a
seam that is not yet obvious). A change that adds no net lines to a full file needs no
room made — fullness alone does not trigger a refactor; *pressure from the change* does.

**Sequencing (in this order):**

1. **Placement** — the architecture step names the owner; if it is full, names the seam to extract and where it goes.
2. **Preparatory-refactor commit** — the *minimum* seam that opens room: behavior-preserving, all tests green, the file's ceiling ratcheted down to its new size + `WORKING_BUFFER` (not size + 1 — see Enforcement). Its own commit, separately revertable.
3. **Feature commit** — the new code, dropped into the now-roomy module.

Two commits, in that order. Never bundle the refactor into the feature commit: keeping
"made room" and "added behavior" separate is the Two-Hats rule written into git
history, and it makes each half independently reviewable.

## Right-Sizing The Placement Step (Don't Over-Spend On Small Changes)

Placement discipline is a safeguard, not a tax on every keystroke. Match the ceremony
to the structural risk so a one-line change does not cost a full architecture review.

**Decide placement before exploring, not after.** The cheapest order is: name the
owning module *first* (from `docs/module-ownership.md`), then read and change only that
module. Mapping the whole codebase and scoping a full implementation *before* asking
where the code goes is wasted work — if placement names a different owner, that
exploration is thrown away. Ask first; explore narrow.

**Two paths, by risk:**

- **Light path (most changes).** When the change is small, lands in an *obvious*
  existing owner, makes no room (adds no net pressure to a capped file), and creates no
  new module — state the owner in one line from the ownership map and implement. Record
  the placement in the commit message; no separate review, no separate receipt.
- **Full review (real structural risk).** Required when **any** of these holds: a new
  file / module / owner is involved; the target is at or near a ceiling (room may be
  needed); placement is genuinely ambiguous (two or more owners could claim it); or the
  change crosses a rules / transport / persistence boundary. Here the full placement
  decision — and a preparatory refactor if the owner is full — earns its cost, and the
  receipt goes in `docs/placement-receipts.md`.

The light path is **not** a loophole: "small and obvious" means the owner is *not in
doubt*. The moment placement is unclear, a new home is needed, or a full file is in
play, it is a full-review change. When unsure which path applies, it is the full path.

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
