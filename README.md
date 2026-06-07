# SogoTable

SogoTable is a small local-first family game platform for casual turn-based games on phones. The first proof-of-concept game is Super Tic Tac Toe, also known as Ultimate Tic Tac Toe.

The product target is simple: family members sitting together at a restaurant can open a browser, pick a player, join a room, and play without installing an app or creating a heavyweight account.

## Current Status

- Repo scaffold: complete.
- Super Tic Tac Toe rules engine: complete.
- Mobile-first local web UI: complete first pass.
- Room creation, invites, and room codes: local/in-memory first pass.
- Shared persistent player roster: complete first pass.
- Progressive Web App shell: complete first pass.
- Active room persistence/history: future milestone.

## Stack

- Python standard library HTTP server.
- Python rules engine under `src/sogotable/`.
- Vanilla HTML/CSS/JavaScript under `src/sogotable/static/`.
- PWA manifest and service worker for installable phone-browser shell.
- Cloudflare Worker + D1 brain for hosted public multiplayer API.
- `pytest` for rules-engine tests.

This avoids framework weight while keeping a clear path to add Flask/FastAPI, SQLite, WebSockets, or hosted deployment later if the app earns that complexity.

## Run Locally

From this repo:

```powershell
python -m src.sogotable.server
```

Then open:

```text
http://127.0.0.1:8787/
```

For phone testing on the same network, use the computer's LAN IP with port `8787`.

The first server keeps rooms in memory. Restarting the server clears active rooms.

The app can be installed from supported phone browsers as a Progressive Web App. The service worker caches static shell assets only; API calls for players, rooms, invites, and moves are not cached.

The intro screen shows a small revision label built from Git: human-facing app version, short commit hash, branch, and dirty/clean status. Local Python serves this through `/api/status`; static Cloudflare Pages uses `/revision.json`, generated during the Pages build. Git remains the canonical source of revision truth.

## Deploy Hosted Brain

The public site needs a shared API brain for players, lobby presence, rooms, invites, and moves. Deploy it with:

```powershell
npm run deploy:brain
```

The Worker is configured in `wrangler.toml` and stores shared game state in a small D1 database. Durable Objects are still the strongest future fit for strict turn consistency, but D1 avoids KV write limits and avoids per-edge memory splits during public playtesting.

## Run Tests

```powershell
python -m pytest
```

Worker API tests for the hosted brain:

```powershell
npm run test:worker
```

If `pytest` is not installed:

```powershell
python -m pip install pytest
```

## First Milestone Goals

- Keep setup low-friction.
- Make Super Tic Tac Toe playable end-to-end.
- Keep game rules separate from the browser UI.
- Support simple player selection and room codes.
- Leave real accounts, history, and richer multiplayer for later phases.

## Useful Docs

- [Project Memory](docs/project-memory.md)
- [State Machine](docs/state-machine.md)
- [Name Decision](docs/name-decision.md)
- [AREC Command](docs/AREC.md)
- [Purpose](docs/purpose.md)
- [Architecture](docs/architecture.md)
- [Super Tic Tac Toe](docs/game-super-tic-tac-toe.md)
- [Roadmap](docs/roadmap.md)
