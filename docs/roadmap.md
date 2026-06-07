# Roadmap

## 1. Repo Scaffold

- Create standalone SogoTable repository.
- Add docs, static source layout, Worker source layout, tests layout, and deploy instructions.

## 2. Super Tic Tac Toe Rules Engine

- Implement Super Tic Tac Toe rules in the hosted Worker brain.
- Add focused Worker API tests for move validation, win/draw behavior, and turn enforcement.

## 3. Mobile UI / Playable Hosted Game

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

- Support multiple phones from the public Cloudflare site.
- Keep shared state in the Worker/D1 brain.
- Continue polling until server-sent updates or WebSockets are clearly worth the complexity.

## 6. Account Persistence

- Keep persistent player profiles in the hosted brain.
- Save room history.
- Add simple family stats.
- Keep auth optional and isolated.

## 7. More Games

Add new games through game definitions with explicit availability metadata. Do not show a game as ready until it has a playable room/game-screen implementation.

Candidate games:

- Connect Four
- Dots and Boxes
- Word/guessing games
- Simple card/table games
