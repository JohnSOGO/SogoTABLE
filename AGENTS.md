# AI Instructions

SogoGAMES is a separate project from Ozymandias2. Ozymandias2 may be used as a reference for organization, documentation habits, local runtime pragmatism, and small-system design, but future agents must not mutate or depend on Ozymandias2 while working here.

## Project Goal

Build a mobile-first, browser-based family game platform for simple turn-based games. The first proof-of-concept is Super Tic Tac Toe.

## Working Rules

- Keep scope small and playable.
- Prefer clear local browser workflows over cloud-first architecture.
- Do not build production authentication until a later explicit milestone.
- Do not require paid services, app installs, or vendor lock-in.
- Separate game rules from UI and transport code.
- Keep rules engines testable without a browser.
- Use mobile-first layout decisions.
- Document important behavior changes in `docs/`.
- Preserve simple run and test commands in `README.md`.

## Architecture Preferences

- Start with a simple local web app.
- Use room codes and in-memory state before persistence.
- Introduce SQLite only when saved players/history are needed.
- Introduce WebSockets only when polling is no longer good enough.
- Add games through clear modules instead of mixing all rules into the UI.

## First Game

Super Tic Tac Toe is the first proof-of-concept. It should prove:

- nested-board rendering on phones
- clean move validation
- room/lobby flow
- player identity basics
- testable game rules

## Git

Use small logical commits:

1. scaffold and docs
2. rules engine and tests
3. playable UI
4. lobby/player flow improvements

Keep generated caches, virtual environments, and runtime data out of Git.
