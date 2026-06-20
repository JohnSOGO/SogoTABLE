# SogoTable Offline Card Game Architecture - AREC

## Abstract

The brief proposes a local, deterministic card-game lab for building a Bohnanza-style game first, then porting the finished game into SogoTable with minimal change.

The core idea is to separate reusable card-table infrastructure from game-specific rules so the game can be tested offline without Cloudflare, networking, or backend coupling.

## ReExplain

This is a staged architecture plan:

- build a browser-local card lab
- keep rules pure and deterministic
- model cards, zones, actions, and events as reusable primitives
- use a generic table shell for seats, hands, drag/drop, and logs
- implement a first game as a rules package
- later integrate that package into SogoTable's multiplayer table flow

The main architectural bet is that the same state/action/rules contract can serve both offline development and hosted multiplayer.

## Evaluate

What works:

- The separation between UI, rules, and transport is exactly the right shape for SogoTable.
- A deterministic local harness is a strong way to prove game feel before any shared-room work.
- Modeling cards, zones, public/private views, and actions as reusable primitives gives the platform a real path to multiple card games.
- The test strategy is concrete and aligned with the architecture.

Risks and limits:

- The plan can grow into a feature-rich local editor if scope is not held down hard.
- A local-only harness can drift from the eventual Cloudflare multiplayer contract unless the state and action interfaces are treated as the source of truth from day one.
- Trading is the highest-complexity part of the first game, so it is the most likely place for architecture to balloon or become game-specific too early.
- The brief is strong on structure, but it should not become a reason to overbuild generic abstractions before one game actually needs them.
- SogoTable's real multiplayer path still has to remain the production target, so this lab should stay a development surface, not a second product.

## Conclude

**Adopt with constraints**

Recommended path:

1. Build the offline card lab as a local development harness.
2. Keep the rules engine pure, deterministic, and portable.
3. Treat actions, zones, views, and events as the stable integration contract.
4. Delay multiplayer, persistence, and Cloudflare work until the offline game is fun and testable.
5. Keep the first implementation narrow enough to prove the architecture without building a framework monster.

The brief is directionally sound. The right move is to use it as a staging ground for reusable card-game architecture, while holding the line on scope and keeping SogoTable compatibility as the long-term contract.
