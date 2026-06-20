# Game Modules

Each game should live in its own directory under this folder.

Preferred shape:

```text
src/sogotable/static/games/<game-id>/
  README.md
  index.js
  manifest.js
  rules.js
  state.js
  render.js
```

Goals:

- keep game rules isolated from the main shell
- keep game-specific UI logic inside the game folder
- make it easy to add a new game without turning `app.js` into a junk drawer
- keep the module portable enough to move into a hosted integration later

Current module folders:

- `super-tic-tac-toe/` owns the shared nested-board browser renderer for
  Super Tic Tac Toe.
- `super-tic-tactical-toe/` owns the Tactical Toe module boundary and reuses
  the nested-board renderer with Worker-owned pickup and score fields.
- `boxes/` owns the Dots and Boxes standalone lab and hosted board renderer
  helpers.
- `battleship/` owns the Battleship hosted-game plan and module metadata.
- `Quoridor/` owns the Quoridor hosted-game plan, module metadata, and AI
  difficulty spec.
