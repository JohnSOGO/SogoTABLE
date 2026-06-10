# Bot Opponents

This file tracks the first bot-opponent implementation. Bot ids are opaque random ids; bot names are mutable display labels.

## AREC

### Abstract

Single-player support is modeled as a normal hosted room where the second seat is controlled by a bot.

### ReExplain

The user can create a room, open the waiting opponent controls, tap `Invite Bot`, choose a bot persona, and play immediately. The bot is a room seat with `kind: "bot"` and makes moves through the same hosted rules pipeline as humans.

### Evaluate

This is the right direction because it preserves the room-as-game architecture and makes future games easier to test. The dangerous version would be a browser-side fake opponent or a separate single-player rules branch. Most v1 bots intentionally use random legal moves. Tactical Tess is the first normal-strength bot and uses hosted move scoring only.

### Conclude

Adopt with constraints: generic bot seats, hosted authority, short delayed room-object bot turns, no browser-owned bots, and no advanced strategy in the first pass.

## Checklist

- [x] Read `AI/Single Player and Bots.md` as input context.
- [x] Add stable bot persona definitions.
- [x] Add `GET /api/bots`.
- [x] Add `POST /api/room/join-bot`.
- [x] Route bot seating through `RoomDurableObject`.
- [x] Make bot moves through the same `makeMove` validation path as human moves.
- [x] Keep bot turns event-driven from room state changes, not polling.
- [x] Add `Invite Bot` to the waiting-room opponent controls.
- [x] Reuse the opponent picker modal for bot selection.
- [x] Count human stats from bot games while excluding bots from visible leaderboards.
- [x] Add Worker tests for bot list, seating, legal moves, and leaderboard filtering.
- [x] Upgrade Tactical Tess to a scored normal bot with attack, defense, destination control, positional scoring, and pickup scoring.

## Current Behavior

- Ready games share the same bot opponent flow.
- The first bots are named personas. Most v1 bots choose a random legal move.
- The bot invite list marks algorithms visually: `🧠` for Tactical Tess's smart scored selector and `🎲` for random legal-move bots.
- Tactical Tess uses a one-ply scored move selector:
  - win the whole game if possible
  - block opponent game wins
  - win or block zones
  - prefer stronger zone/cell shapes, with center before corners
  - avoid sending the opponent to a zone where they can immediately win
  - reward tactical pickups such as coins and treasure
- On the hosted Durable Object path, the room publishes the human action first, waits briefly, then publishes the bot move.
- On non-Durable-Object fallback/test paths, bot moves resolve in the same request for compatibility.
- Bot seats auto-agree to reset/play-again requests.

## Future Work

- Add one-ply opponent-response scoring for a future hard bot after Tactical Tess has been playtested.
- Keep future bot behavior as move choice, not direct board mutation.
- Consider separate vs-bot stats only if human-vs-bot ELO starts confusing the lobby.
