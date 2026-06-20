# Bohnanza Work Surface

This is the local build directory for the Bohnanza-style card game lab.

The intent is to grow a real rules package here first, then wire the game into
the SogoTable shell once the flow is stable.

Current contract:

- `manifest.js` declares game metadata
- `state.js` creates and normalizes game state
- `rules.js` owns legal actions and state transitions
- `render.js` turns game state into browser UI
- `index.js` exposes the module entry point

Working assumptions:

- one player per device
- hidden information is only visible on that player's device
- players are numbered for sorting and quick reference
- the game may need to scale cleanly to seven players, so public-player summaries should be compact and queryable rather than sprawling
- the public surface should show what is public knowledge about players and the deck, while the active player's hidden hand stays private
- the first build stays in turn order for simplicity, while the architecture keeps room for later rounds-without-turns play

This folder is the active development surface for gameplay, architecture, and
offline playtesting.
