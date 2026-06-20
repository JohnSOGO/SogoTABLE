# Super Tic Tactical Toe Module

This directory owns the browser-side module boundary for Super Tic Tactical Toe.

Tactical Toe uses the same nested 3x3 board renderer as Super Tic Tac Toe, with
extra pickup and score fields supplied by the hosted Worker. The renderer is
shared from `../super-tic-tac-toe/render.js` so the two games stay visually and
behaviorally aligned.

The hosted Worker remains the authoritative rules engine for pickup spawning,
scoring, turn order, bot moves, reset, and stats.

