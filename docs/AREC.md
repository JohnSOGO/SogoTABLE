# AREC Command

When the user writes `AREC`, the agent must respond using this structure:

## A — Abstract
Compress the user's idea into its cleanest underlying concept.

Do not merely repeat the user's words. Identify what the idea is really about.

Example:
> The user is proposing that Ozy should use HAM chain breaks as higher-confidence intraday alert triggers, while keeping pivot zones as secondary context.

## R — ReExplain
Restate the idea in clearer, more operational language.

Assume the user may be using imperfect terminology. Translate the thought into what the system should actually understand.

This section should answer:
- What is the user trying to accomplish?
- What are the moving parts?
- What would this mean inside the project?
- What does the idea look like in practice?

## E — Evaluate
Critically judge the idea.

The agent must not rubber-stamp. Treat the proposal as possibly coming from another AI or from a half-formed bathroom thought.

Evaluate for:
- Project consistency
- Conflict with existing architecture or ideology
- Practical implementation difficulty
- Risk of overcomplication
- Whether the idea introduces a new strategy lane
- Whether it belongs in `pdash`, `ldash`, Discord, alerts, reports, or documentation
- Whether the idea is actionable now or needs validation first

Be blunt. If the idea is bad, say so. If it is good but dangerous, say that too.

## C — Conclude
Give a clear decision.

Use one of these styles:

- **Adopt** — the idea fits and should be implemented.
- **Adopt with constraints** — useful, but only under specific limits.
- **Park** — interesting, but not now.
- **Reject** — conflicts with the project or adds bad complexity.
- **Needs clarification** — not enough information to safely act.

The conclusion should include the next concrete action:
- write a spec
- update a `.md`
- ask Codex to implement
- test manually first
- create a dashboard-only prototype
- do nothing for now

---

# AREC Behavior Rules

When using AREC, the agent should be intense and skeptical.

The point is not to be polite.
The point is to prevent strategy drift, architecture sprawl, and AI hallucination from infecting Ozy or SogoGAMES.

The agent should especially watch for:
- new ideology being smuggled in
- new trading logic that bypasses the Prime Directive
- features that create noisy alerts
- dashboard clutter
- hidden state or magic behavior
- data flowing uphill instead of downhill
- human workflow assumptions that do not match the user's real availability

If an idea conflicts with existing project direction, the agent must say so clearly.

If the user confirms a conflicting idea anyway, label it as a deliberate strategy/architecture change, not a minor tweak.

---

# AREC Output Template

```md
## Abstract

[Core idea in clean form.]

## ReExplain

[Clear operational restatement.]

## Evaluate

[Blunt analysis. Include benefits, risks, conflicts, and implementation concerns.]

## Conclude

[Decision and next action.]