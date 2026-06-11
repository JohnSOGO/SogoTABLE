# Doctrine Index

This file is the short front door for SogoTable's durable operating doctrine.
It does not replace the deeper docs. It points to them and states what each
one owns.

## Scope

This index governs both documentation and implementation alignment.

Use it when:

- auditing code against durable project rules
- deciding whether a change fits the current product direction
- checking whether a behavior change belongs in the browser, Worker, game rules, or docs

It does not replace:

- `docs/architecture.md` for current system shape
- `docs/state-machine.md` for screen and room behavior
- `docs/AREC.md` for idea pressure-testing
- `AGENTS.md` for repo operating rules

If there is a conflict, the deeper owner doc keeps its narrow authority and the
doctrine index points back to it.

## Canonical Docs

- [Project Memory](project-memory.md): durable product context, adopted decisions, and long-lived preferences.
- [Wu Wei Method](wu-wei-method.md): the flow doctrine for shaping the app so correct play is the natural path.
- [AREC](AREC.md): the idea-pressure test used before new concepts become doctrine or architecture.
- [Architecture](architecture.md): the current system shape and runtime ownership model.
- [State Machine](state-machine.md): screen, room, and navigation truth.
- [Cloudflare Quota Guardrails](cloudflare-quota.md): Worker, Durable Object, and quota-sensitive runtime guardrails.

## Start Here

If you are about to change code, read in this order:

1. `docs/project-memory.md`
2. `docs/wu-wei-method.md`
3. `docs/state-machine.md`
4. `docs/architecture.md`
5. `docs/cloudflare-quota.md` when the change touches Cloudflare or runtime cost

If the idea is still fuzzy or architecture-shaping, run AREC before implementation.

## Where To Route Changes

- Product direction or durable preferences -> `docs/project-memory.md`
- Flow, event-driven behavior, or explicit refresh doctrine -> `docs/wu-wei-method.md`
- Screen states, room flow, and modal behavior -> `docs/state-machine.md`
- Runtime ownership, browser vs Worker boundaries, or system shape -> `docs/architecture.md`
- Polling, WebSockets, Durable Objects, or quota-sensitive behavior -> `docs/cloudflare-quota.md`
- Risky or ambiguous idea proposals -> `docs/AREC.md`

## Core Doctrine

- Make correct behavior the easy path.
- Keep rules, transport, and UI separate.
- Prefer event-driven updates over periodic polling.
- Keep shared multiplayer truth on the hosted Worker path.
- Make refresh and recovery explicit instead of hidden.
- Preserve small, testable improvements over speculative architecture.

## Refresh Rule

If the user wants a refresh, make it explicit and visible. In the browser UI, the
page or game title can act as the manual refresh affordance.

Do not build background polling loops as the normal path for room, lobby, or
game updates when push, reconnect, or explicit user action can do the job.

## Index Promise

This file is meant to reduce hunting.

If someone asks, "Which doc should I read for this change?" the answer should be
obvious from this page without needing tribal memory.

## Working Agreement

For future changes:

- start the audit at this index
- route the change to the owner doc named here
- land new durable decisions in the owner doc or `docs/project-memory.md`
- update this index when the routing or ownership changes

That keeps the index a living front door instead of a passive bookmark list.
