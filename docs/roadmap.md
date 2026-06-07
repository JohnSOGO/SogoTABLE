# Roadmap

## 1. Repo Scaffold

- Create standalone SogoGAMES repository.
- Add docs, source layout, tests layout, and local run instructions.

## 2. Super Tic Tac Toe Rules Engine

- Implement a pure Python rules engine.
- Add focused tests for move validation and win/draw behavior.

## 3. Mobile UI Mock / Playable Local Game

- Render nested boards clearly on phone screens.
- Show turn, valid boards, small-board winners, macro winner, restart, and game navigation.

## 4. Room Flow And Player Selection

- Select or create local players.
- Pick icon/avatar and color.
- Choose a game.
- Create a live room as the selected host.
- Invite a second player or join by room code.
- Automatically activate the room when enough players are present.

## 5. Room-Code Multiplayer

- Support multiple phones on the same network.
- Keep shared state on the local server.
- Add polling or server-sent updates.

## 6. Account Persistence

- Save players and room history.
- Add simple family stats.
- Keep auth optional and isolated.

## 7. More Games

Candidate games:

- Connect Four
- Dots and Boxes
- Word/guessing games
- Simple card/table games
