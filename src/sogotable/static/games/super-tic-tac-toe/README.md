# Super Tic Tac Toe Module

This directory owns the browser-side Super Tic Tac Toe board renderer used by
the main SogoTable room shell.

The hosted Worker remains the authoritative rules engine for room creation,
move validation, turn order, bot moves, reset, and stats. This module only turns
the prepared room snapshot into DOM and emits move intent through callbacks from
the shared shell.

## Files

- `manifest.js` - static game metadata for module discovery.
- `render.js` - nested 3x3 board renderer, small-board highlights, pickup
  display hooks for tactical-compatible snapshots, and macro win-line drawing.
- `index.js` - public module exports.

