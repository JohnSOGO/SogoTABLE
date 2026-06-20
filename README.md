# SogoTable

SogoTable is a small browser-based family game platform for casual turn-based games on phones. The first proof-of-concept game is Super Tic Tac Toe, also known as Ultimate Tic Tac Toe.

The product target is simple: family members sitting together at a restaurant can open a browser, pick a player, join a room, and play without installing an app or creating a heavyweight account.

## Current Status

- Repo scaffold: complete.
- Super Tic Tac Toe rules engine: complete in the hosted Worker brain.
- Super Tic Tactical Toe rules engine: complete first pass in the hosted Worker brain.
- Mobile-first web UI: complete first pass.
- Room creation, invites, and room codes: Cloudflare Worker + D1 first pass.
- Shared persistent player roster: complete first pass.
- Progressive Web App shell: complete first pass.
- Quiet generated UI/game sound: complete first pass.
- Single-player bot opponent flow: complete first pass.
- Hosted dice game flow: 10,000 with a flexible guest list.
- Active room history/statistics: future milestone.

## Stack

- Vanilla HTML/CSS/JavaScript under `src/sogotable/static/`.
- PWA manifest and service worker for installable phone-browser shell.
- Generated Web Audio effects for quiet UI and game feedback.
- Cloudflare Worker + D1 brain for hosted public multiplayer API.
- Cloudflare Durable Object room channel for live room WebSocket updates.
- Worker-owned random legal move bots for instant single-player rooms.
- Node built-in tests for the hosted Worker API.

This avoids framework weight while keeping the app focused on the actual public play path: Cloudflare Pages for static files and a Cloudflare Worker backed by D1 for shared multiplayer state.

## Public App

Use the hosted app:

```text
https://sogotable.sogodojo.com/
```

The app can be installed from supported phone browsers as a Progressive Web App. The service worker caches static shell assets only; API calls for players, rooms, invites, and moves are not cached.

The intro screen shows a small revision label built from Git: human-facing app version, short commit hash, branch, and dirty/clean status. Cloudflare Pages serves `/revision.json`, generated during the Pages build. Git remains the canonical source of revision truth.

## Static Local Preview

Local preview is only for static UI inspection. It still talks to the hosted Worker API for `/api/*` calls.

```powershell
npx wrangler pages dev src/sogotable/static
```

Then open:

```text
http://127.0.0.1:8788/
```

## Deploy Hosted Brain

The public site uses a shared API brain for players, lobby presence, rooms, invites, and moves. Deploy it with:

```powershell
npm run deploy:brain
```

The Worker is configured in `wrangler.toml` and stores shared game state in a small D1 database. Durable Objects now serialize active-room mutations and deliver realtime room/app snapshots, while D1 remains the persistence layer during public playtesting.

## Run Tests

```powershell
npm run test:worker
```

## First Milestone Goals

- Make Super Tic Tac Toe and Super Tic Tactical Toe playable end-to-end.
- Keep hosted game rules separate from browser rendering where practical.
- Support simple player selection and room codes.
- Leave real accounts, history, and richer multiplayer for later phases.

## Useful Docs

- [Project Memory](docs/project-memory.md)
- [Doctrine Index](docs/doctrine.md)
- [State Machine](docs/state-machine.md)
- [Name Decision](docs/name-decision.md)
- [AREC Command](docs/AREC.md)
- [API Contract](docs/api-contract.md)
- [Purpose](docs/purpose.md)
- [Architecture](docs/architecture.md)
- [Cloudflare Quota Guardrails](docs/cloudflare-quota.md)
- [Nomenclature](docs/nomenclature.md)
- [Live Rounds](docs/live-rounds.md)
- [Wu Wei Method](docs/wu-wei-method.md)
- [Wu Wei Event-Driven Progress](docs/wu-wei-event-driven-progress.md)
- [Audio](docs/audio.md)
- [Bot Opponents](docs/bots.md)
- [Super Tic Tac Toe](docs/game-super-tic-tac-toe.md)
- [Super Tic Tactical Toe](docs/game-super-tic-tactical-toe.md)
- [Dots and Boxes](docs/game-dots-and-boxes.md)
- [Battleship](docs/game-battleship.md)
- [Quoridor](docs/game-quoridor.md)
- [10,000](docs/game-ten-thousand.md)
- [Roadmap](docs/roadmap.md)
