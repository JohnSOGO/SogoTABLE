# AREC Command

AREC is SogoTable's structured idea-review protocol:

```text
Abstract -> ReExplain -> Evaluate -> Conclude
```

Use AREC when the user explicitly writes `/arec` or `AREC`. Also use it when a
request is sloppy, exploratory, conflicting, architecture-changing, or likely
to become product doctrine before it has been pressure-tested.

If the shared local Codex skill exists at `C:\Users\johns\.codex\skills\arec`,
use it as the reusable protocol source, then apply SogoTable-specific product
checks from this file, `AGENTS.md`, `docs/project-memory.md`,
`docs/state-machine.md`, and `docs/wu-wei-method.md`.

Do not apply AREC silently. Start with a short note such as:

```text
Using AREC because this is an idea-shaped architecture request.
```

For simple direct implementation requests, skip formal AREC unless the user
explicitly invoked it.

## A - Abstract

Compress the user's idea into its cleanest underlying concept.

- Do not merely repeat the user's words.
- Identify the real problem, goal, or product need.
- Treat the user's terminology as potentially imprecise.
- Note when the idea resembles an existing standard pattern or current
  SogoTable capability.

## R - ReExplain

Restate the idea in clearer operational language.

Answer:

- What is the user trying to accomplish?
- What are the moving parts?
- What would this mean inside SogoTable?
- What would this look like in practice?
- Is there an existing architecture, rule owner, lobby flow, or Worker path that
  already covers it?

## E - Evaluate

Critically judge the idea.

Evaluate for:

- Fit with the mobile-first family game platform direction.
- Fit with the shared two-player lobby architecture.
- Fit with Worker/D1/Durable Object authority for public multiplayer truth.
- Impact on one-phone hot-seat play.
- Impact on multi-phone public Cloudflare play.
- Whether rules stay separated from UI and transport code.
- Whether the feature creates hidden local state, duplicate lobby behavior,
  aggressive polling, visual noise, or fragile phone UI.
- Whether it belongs in docs, game rules, Worker API, shared UI, or a future
  game module.
- Whether it is actionable now or should be parked.

Be blunt. A plausible idea from another AI is still only an idea until it fits
the product and architecture.

## C - Conclude

Give a clear decision and next action.

Use one of:

- **Adopt** - the idea fits and should be implemented.
- **Adopt with constraints** - useful, but only under specific limits.
- **Park** - interesting, but not now.
- **Reject** - conflicts with the project or adds bad complexity.
- **Needs clarification** - not enough information to safely act.

If work should proceed, include the next concrete action:

- write a spec
- update a `.md`
- implement a small slice
- test manually first
- create a prototype
- do nothing for now

## Output Template

```md
## Abstract

[Core idea in clean form.]

## ReExplain

[Clear operational restatement.]

## Evaluate

[Blunt analysis. Include benefits, risks, conflicts, and implementation concerns.]

## Conclude

[Decision and next action.]
```
