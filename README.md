# SogoGAMES

SogoGAMES is a small local-first family game platform for casual turn-based games on phones. The first proof-of-concept game is Super Tic Tac Toe, also known as Ultimate Tic Tac Toe.

The product target is simple: family members sitting together at a restaurant can open a browser, pick a player, join a room, and play without installing an app or creating a heavyweight account.

## Current Status

- Repo scaffold: complete.
- Super Tic Tac Toe rules engine: complete.
- Mobile-first local web UI: complete first pass.
- Lobby and room codes: local/in-memory first pass.
- Real multi-phone persistence: future milestone.

## Stack

- Python standard library HTTP server.
- Python rules engine under `src/sogogames/`.
- Vanilla HTML/CSS/JavaScript under `src/sogogames/static/`.
- `pytest` for rules-engine tests.

This avoids framework weight while keeping a clear path to add Flask/FastAPI, SQLite, WebSockets, or hosted deployment later if the app earns that complexity.

## Run Locally

From this repo:

```powershell
python -m src.sogogames.server
```

Then open:

```text
http://127.0.0.1:8787/
```

For phone testing on the same network, use the computer's LAN IP with port `8787`.

## Run Tests

```powershell
python -m pytest
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

- [Purpose](docs/purpose.md)
- [Architecture](docs/architecture.md)
- [Super Tic Tac Toe](docs/game-super-tic-tac-toe.md)
- [Roadmap](docs/roadmap.md)
