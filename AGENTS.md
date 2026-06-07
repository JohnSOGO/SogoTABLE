# AI Instructions

SogoGAMES is a separate project from Ozymandias2. Ozymandias2 may be used as a reference for organization, documentation habits, local runtime pragmatism, and small-system design, but future agents must not mutate or depend on Ozymandias2 while working here.

## Project Goal

Build a mobile-first, browser-based family game platform for simple turn-based games. The first proof-of-concept is Super Tic Tac Toe.

## Working Rules

- At session start, read `AGENTS.md`, `README.md`, `docs/project-memory.md`, `docs/state-machine.md`, and `docs/AREC.md` before making project changes.
- If the user writes `AREC`, follow the command structure and behavior rules in `docs/AREC.md`.
- Keep scope small and playable.
- Prefer clear local browser workflows over cloud-first architecture.
- Do not build production authentication until a later explicit milestone.
- Do not require paid services, app installs, or vendor lock-in.
- Separate game rules from UI and transport code.
- Keep rules engines testable without a browser.
- Use mobile-first layout decisions.
- Make copious documentation as the project evolves. Future Codex sessions should be able to get up to speed after reading `AGENTS.md`, `README.md`, and the docs in `docs/`.
- Document important behavior changes, user-approved preferences, current goals, test-room/debug workflows, and product decisions in `docs/`.
- Keep a running project memory in `docs/project-memory.md`; update it whenever the user teaches a preference, approves/rejects behavior, or the project direction changes.
- Treat files in `AI/` as ignored incoming context from the user or other AI tools. Read them when asked, but do not commit that directory.
- Preserve simple run and test commands in `README.md`.
- Pay close attention to the user as the product owner. Their live feedback during playtesting is authoritative and should be captured as durable project context.

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
- room-as-game-instance flow
- player identity basics
- testable game rules

## User Preferences And Style

- The user wants fast, playable iteration with frequent attention to details noticed during phone testing.
- The user prefers practical local workflows, test rooms, and quick verification over abstract planning.
- The user wants visible polish: centered marks, clear active-board indication, win highlights, player-name celebrations, and mobile-friendly controls.
- The user does not want distracting visual noise. For local hot-seat play, active-board and turn feedback should use the current player's selected color rather than a generic green pulse, and it should not pulse continuously.
- The user wants future Codex agents to read `AGENTS.md` and immediately understand the current goals, recent decisions, and user preferences.

## Current Product Memory

- SogoGAMES is a game platform, not a single-game app. Super Tic Tac Toe is the first game in a future games menu.
- One-phone hot-seat play matters: a single phone should be able to host both players and swap turns smoothly.
- Multi-phone same-network play matters: use the LAN URL and room codes.
- Win feedback matters: show the winning macro line, highlight winning cells, declare the winning player by name, and show a delayed celebration overlay with the player's icon.
- Test rooms are useful for approval. Local development may stage rooms such as `AAAA` one move away from a win so the user can verify behavior quickly.

## Git

Use small logical commits:

1. scaffold and docs
2. rules engine and tests
3. playable UI
4. room/player flow improvements

Keep generated caches, virtual environments, and runtime data out of Git.
