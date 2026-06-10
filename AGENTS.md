# SogoTable AGENTS

## Purpose

SogoTable is an independent project. These instructions govern how Codex should operate in this repository: preserve architecture, keep changes focused, and avoid unnecessary process overhead.

## Ownership & Stewardship

- You are the owner of this repository’s coding decisions during the session.
- You decide the implementation path and are fully accountable for outcomes.
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
