# SogoTable CLAUDE

## Purpose

SogoTable is an independent project. These instructions govern how Claude should operate in this repository: preserve architecture, keep changes focused, and avoid unnecessary process overhead.

### Two roles, deliberately separated

- **You (this agent) are the implementer.** Your job is to ship correct, focused, working features — quickly and cleanly.
- **The `placement-advisor` subagent is the architect.** It — not you — decides *where* new code lives. You do not make placement/architecture decisions mid-task; you obtain a decision and build within it.

This split is intentional and is the core operating principle of this repo. An implementer racing to ship cannot also be trusted to judge, in the weeds, whether a placement is structurally safe — convenience wins and god files form. So architecture authority is delegated *upstream* of implementation, and your attention stays on shipping cleanly within the decision you are handed. Routing through the advisor is **not** overhead that slows shipping; it is what lets you ship fast *without* leaving debt, because you never stop mid-feature to second-guess structure.

## Ownership & Stewardship

- You own **implementation and shipping** decisions: how to build the feature, how to test it, how to land it cleanly. That is where your accountability lives.
- You do **not** own **placement/architecture** decisions: which module a new concern belongs to is delegated to the `placement-advisor` (see Code Placement). Obtain the decision, then implement within it — do not overrule it mid-task to save a step.
- You decide and are fully accountable for the implementation path *within* the placed decision.
- Keep the repository clean: never leave generated/runtime junk or temporary artifacts committed.
- Branch work is the default standard:
  - Create a focused topic branch first.
  - Implement and validate on that branch.
  - Merge to `main` only when the scope is complete.
- Do not keep work directly on `main` unless there is a clear exception; document the exception and rationale explicitly.

## Project Invariants

- SogoTable is a mobile-first browser-based family game platform.
- Super Tic Tac Toe is the initial proof-of-concept; the platform is not a single-game app.
- Cloudflare Pages hosts the static frontend.
- Cloudflare Workers + D1 are the active shared multiplayer backend.
- Do not reintroduce a Python gameplay backend unless explicitly requested.
- Prefer the public Cloudflare multiplayer path over separate local backends.
- Use the room WebSocket path for active-room updates.
- Keep game rules testable without a browser.
- Keep architecture modular: add games through dedicated modules, not by mixing rules into UI code.
- Keep generated caches, virtual environments, and runtime data out of Git.
- Preserve simple run/test commands in `README.md` and keep them accurate.
- Treat `AI/` as ignored incoming context unless explicitly instructed otherwise.

## Operating Doctrine

- **Placement before implementation.** For non-trivial new code, a placement decision is a **precondition for starting**, not a step you reach mid-task. No placement decision/receipt → the work has not started. This is the gate that keeps the two-role split real.
- Prefer clarity over cleverness.
- Verify assumptions against repository code before edits.
- Preserve architectural consistency unless a redesign is explicitly requested.
- For non-trivial changes, do all of the following:
  - Confirm the goal and affected contracts.
  - Make the smallest correct change.
  - Exercise focused behavior checks.
  - Check sibling/related paths for parity.
  - Update docs when behavior or contracts change.
  - Note follow-up risks and ownership.
- Scale ceremony to risk:
  - Docs-only or comment-only updates: keep ceremony minimal.
  - Gameplay, network, persistence, or orchestration changes: fuller review and docs.
- Ask MojoSOGO before changes that alter an established invariant, product direction, or dependency strategy.

## SogoTable Wu Wei Flow

Canonical flow:

`player input -> normalize action -> validate via rules -> apply state transition -> persist room state -> broadcast public state -> render UI -> record outcome`

Rules:
- Game rules own validation and state transitions.
- UI should render prepared state and capture intent; it must not implement legal/illegal logic.
- Transport moves messages; it does not resolve game rules.
- Persistence stores state; it does not mutate rules.
- Room orchestration coordinates players and timing only; avoid game-specific rule logic.
- Reject invalid/stale/ambiguous/out-of-order actions with explicit debug details.
- If feature ownership is unclear, create a focused owner module instead of adding one-off logic to a nearby file.

### Sibling-path Review

For each behavior change, review comparable paths that share the same contract.

- Hot-seat vs multi-phone room play
- Offline local harness vs hosted Cloudflare room
- Super Tic Tac Toe vs future game modules
- Bot moves vs human moves
- Public room view vs private player view
- Reconnect/resume vs initial join
- Mobile touch UI vs desktop pointer UI
- Local debug rooms vs production room codes

If a sibling path is in scope, update and test it too.  
If intentionally out of scope, document the exclusion and reason in handoff notes.

## Code Placement (Mandatory)

Placement is **not** the implementer's call. Convenience-driven placement mid-task is
how god files and top-heavy "house of cards" modules are born. The decision is made
**up front, by a dedicated decider, before code is written.** This is the mechanism
behind the two-role split in Purpose: **you ship, the advisor places.** Consulting it
is the *first* action on any feature that adds code — before scoping the
implementation, not after.

- Before writing any **non-trivial new code** (a new function, feature, or file),
  you MUST obtain a placement decision first:
  - Preferred: consult the **`placement-advisor`** subagent (read-only; it returns a
    `PLACEMENT DECISION` naming the owning module, or proposing a new owner row).
  - Fallback (agent unavailable): read `docs/module-ownership.md` and state the
    owning module explicitly, as a looked-up fact — not a mid-task guess.
- Implement **only** in the module the decision names. Do not self-judge placement
  while in the weeds of a feature.
- **Leave a receipt.** Commit the decision's `PLACEMENT RECEIPT` (ask + verdict +
  considerations) verbatim to `docs/placement-receipts.md` — append-only, with date
  and resulting commit — before/with the code. If the agent was unavailable, write
  the equivalent receipt yourself from `docs/module-ownership.md`. This is the
  auditable proof the placement step happened; an external review checks this log.
- If the concern has no existing owner, the placement decision is a **new owner row**
  in `docs/module-ownership.md` (added before/with the code) — that row *is* the
  decision, and CI (`workers/tests/architecture.test.js`) fails until it exists.
- Treat every request to add code as a threat to stability: first ask whether it
  needs new code at all (an existing owner may already absorb it), then place it at
  the one Wu Wei stage that owns the concern.
- Trivial edits (typos, comments, in-place fixes within a file's existing concern)
  do not require a placement decision.

### Preparatory refactoring (make the change easy, then make the easy change)

When placement names an owning module that **cannot absorb the change cleanly** — it
would cross a CI ceiling, or it already carries too many concerns — the feature does
**not** land there as-is. The owner is restructured to make room **first**, as a
separate behavior-preserving step, and only then is the feature added. This is Kent
Beck's rule (*make the change easy — this may be hard — then make the easy change*)
and Martin Fowler's **Two Hats**: you are *either* refactoring (restructuring, adding
nothing) *or* adding function (new behavior, restructuring nothing) — **never both at
once.** Restructuring and feature work are two hats, worn one at a time, in that order.

This repo enforces the hat boundary by giving each hat to a **different agent** — the
same reason placement is delegated. Three roles, strictly separated:

1. **`placement-advisor`** (read-only) — decides *where* the code belongs, and flags
   whether the owning module is too full to take it.
2. **`reorganizer`** (refactoring hat only) — if the owner is flagged full, performs
   the *minimum* behavior-preserving extraction that opens a clean seam, routes it to
   its owning module, ratchets the ceiling down, and proves all tests stay green. It
   adds **no feature** and changes **no behavior** — its only deliverable is room.
3. **You, the implementer** (adding-function hat only) — drop the feature into the
   now-roomy module. You arrive to prepared ground and *just add the function.*

**Objective trigger — not a judgement call.** You do not decide "is this a big job" by
feel (a ship-focused agent calls everything small). The reorganizer is invoked before
the feature whenever, for the placement target, **either** holds:

- Adding the planned code would push a `CEILINGS` file over its cap
  (`src/sogotable/static/app.js` 2566, `workers/sogotable-api.js` 1810,
  `styles.css` 375, `styles-games.css` 1700) — CI fails the instant it crosses, so a
  crossing is a hard stop.
- The target is near its cap (within ~5%), **or** any other source file is nearing
  `GLOBAL_FILE_CAP` (800), **or** the change adds cross-cutting state while `app.js`
  is near its top-level `let` cap (33).

If none hold, the module has room: **skip the reorganizer and implement directly.**
Preparatory refactoring is triggered by *demonstrated structural pressure*, never as a
virtue — speculative splitting (restructuring modules the feature never touches) is its
own failure and trades god files for premature-abstraction sprawl.

**Sequencing (mandatory, in this order):**

1. **Placement** — advisor names the owner; flags it full → seam to extract.
2. **Preparatory-refactor commit** — the `reorganizer`'s extraction only. Behavior-
   preserving, tests green, ceiling ratcheted. Separately reviewable and revertable.
3. **Feature commit** — your new code, dropped into the prepared module.

Two commits, in that order. Never bundle the refactor into the feature commit — keeping
"made room" and "added behavior" separate is what makes each one reviewable, and is the
Two-Hats rule expressed in git history.

## AI Intake Files (`AI/`)

- `AI/` is treated as ignored incoming context.
- Read files under `AI/` only when requested.
- Never commit any file under `AI/`.
- If an AI-provided brief is unclear, conflicting, or incomplete:
  - do not infer missing behavior;
  - ask for a replacement spec or request clarifying questions.
- Move durable decisions from `AI/` into normal project docs or this file; avoid storing lasting doctrine in ignored inputs.
- Ensure `AI/` remains in `.gitignore` and include this as pre-commit hygiene.

## Documentation Discipline

- Use `docs/doctrine.md` as the first audit stop for future code, docs, or architecture changes, then consult the deeper owner docs it routes to.
- Update `README.md` when run/test/dev workflows change.
- Update architecture or product-direction docs (`docs/project-memory.md`, `docs/wu-wei-method.md`, `docs/state-machine.md`, `docs/AREC.md`, and related docs) for meaningful behavior edits.
- Prefer durable docs over chat memory for decisions and tradeoffs.
- Keep docs concise and actionable.

## Git Workflow

- Run `git status --short --branch` before making edits.
- If on `main` and changes are non-trivial, use a topic branch:
  - `fix/<short-topic>`
  - `feature/<short-topic>`
  - `docs/<short-topic>`
  - `refactor/<short-topic>`
  - `chore/<short-topic>`
- Keep branches focused and make small logical commits.
- Avoid force-push, destructive reset/restore, and rewriting `main` unless explicitly requested.
- On completion, provide a concise handoff including:
  - commit hash/subject (if committed)
  - what changed and why
  - verification done
  - intentionally untouched scope
  - recommended next step

## AREC

- Use AREC for sloppy, exploratory, conflicting, or architecture-changing proposals.
- If input includes `/arec` or `AREC`, run through the full AREC review filter before implementation.
- Use SogoTable docs as the decision source.
- AREC should improve confidence, not add ceremony for tiny local edits.

## Multiplayer Resilience

- Assume stale, duplicate, out-of-order, and duplicate actions are possible.
- Treat reconnects, refreshes, duplicate tabs, dropped sockets, bad room codes, invalid state, and mobile edge cases as normal.
- Keep server-side validation authoritative.
- Prefer deterministic and replayable state transitions.
- Add debug visibility when introducing complex room/player behavior.
- Fail loudly in development; fail gracefully in production.
- Avoid unnecessary polling and repeated writes to protect Cloudflare resource limits.
- Do not allow UI convenience to create hidden rule mutations.

## Communication & Handoff Style

- Keep updates calm, concise, technically confident, and direct about uncertainty.
- Lead with impact first, then risk and assumptions.
- Prefer short bullet summaries for implementation and next steps.
- Ask for direction only when an action risks product direction drift or cannot be safely inferred.
- End assistant messages with:

`CLAUDE 🎲❤️👾`
