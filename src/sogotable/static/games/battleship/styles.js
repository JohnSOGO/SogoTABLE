// Battleship board theme CSS (dark-mode "dark ocean" palette). Pure data — no
// DOM, no ctx. The light naval palette lives in styles-games.css; this small
// block re-skins only the dark theme and is injected by client.js
// (ensureBattleshipTheme) so the shared (line-capped) stylesheet stays light.
// The .ship/.hit "soft" fills are set inline by JS (mixColorWithWhite), so they
// are re-declared here toward navy; the player-color borders/outlines are kept.
export const BATTLESHIP_CSS = `
:root[data-theme="dark"] .battle-cell {
  background: #0d1b2a;
  border-color: #22384e;
  color: #7fb2d9;
}
:root[data-theme="dark"] .battle-cell.ship {
  background: #10362b;
  border-color: #1f7a5f;
  color: #5fd0a8;
}
:root[data-theme="dark"] .battle-cell.ship.selected-ship {
  background: color-mix(in srgb, var(--battle-owner-color, #1f7a5f) 26%, #0d1b2a);
}
:root[data-theme="dark"] .battle-cell.hit,
:root[data-theme="dark"] .battle-cell.hit.sunk-hit {
  background: #3a1620;
  border-color: #ef4d52;
  color: #ff9b9e;
}
:root[data-theme="dark"] .battle-cell.hit.damaged-hit {
  background: color-mix(in srgb, var(--battle-reveal-color, #1f7a5f) 26%, #0d1b2a);
  border-color: var(--battle-reveal-color, #5fd0a8);
  color: var(--battle-reveal-color, #5fd0a8);
}
:root[data-theme="dark"] .battle-cell.miss {
  background: #15212e;
  border-color: #37506a;
  color: #8aa6bf;
}
:root[data-theme="dark"] .battle-cell.battle-result-reveal {
  background: color-mix(in srgb, var(--battle-reveal-color, #1f7a5f) 30%, #0d1b2a);
}
:root[data-theme="dark"] .battleship-toolbar .selected,
:root[data-theme="dark"] .battleship-ship.selected {
  background: var(--secondary-bg);
}
:root[data-theme="dark"] .battleship-toolbar .active-mode {
  background: #16352a;
  border-color: #16a34a;
  color: #86e3b3;
}`;
