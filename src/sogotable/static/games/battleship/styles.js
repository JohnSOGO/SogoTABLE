// Battleship board CSS: the dark-mode "dark ocean" palette, then the sea stage
// (water, 3D ship overlay, shot markers, effects, tracker, settings row). Pure data — no
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
}
/* ---- Sea stage: water, 3D ship overlay, markers, effects (view only) ---- */
.bs-stage { position: relative; width: 100%; max-width: 560px; margin: 0 auto; }
.bs-frame { display: grid; grid-template-columns: minmax(0, 1fr); transform-origin: 50% 100%; transition: transform .35s ease; }
.bs-frame.bs-coords { grid-template-columns: 14px minmax(0, 1fr); grid-template-rows: 14px auto; gap: 3px; }
.bs-frame.bs-tilt { transform: perspective(1000px) rotateX(15deg); margin-top: -12%; }
.bs-cols, .bs-rows { display: grid; gap: 2px; font-size: .62rem; font-weight: 800; color: var(--muted); }
.bs-cols { grid-template-columns: repeat(var(--battle-size), minmax(0, 1fr)); }
.bs-rows { grid-template-rows: repeat(var(--battle-size), minmax(0, 1fr)); }
.bs-cols span, .bs-rows span { display: grid; place-items: center; }
.bs-board { position: relative; border-radius: 8px; box-shadow: 0 12px 26px -8px rgba(4, 24, 40, .55), 0 0 0 2px var(--bs-sea-deep); }
.bs-water { position: absolute; inset: 0; overflow: hidden; border-radius: 8px;
  background: radial-gradient(120% 90% at 28% 12%, var(--bs-sea-light), transparent 62%), linear-gradient(165deg, var(--bs-sea-mid), var(--bs-sea-deep)); }
.bs-water::before, .bs-water::after { content: ""; position: absolute; inset: -64px; pointer-events: none; will-change: transform; }
.bs-water::before { opacity: .55; background-image: radial-gradient(ellipse 17px 4px at 50% 50%, var(--bs-foam), transparent 72%); background-size: 46px 28px; animation: bs-waves-a 7s linear infinite; }
.bs-water::after { opacity: .35; background-image: radial-gradient(ellipse 26px 5px at 50% 50%, var(--bs-foam), transparent 72%); background-size: 64px 40px; background-position: 20px 12px; animation: bs-waves-b 11s linear infinite; }
@keyframes bs-waves-a { to { transform: translate(46px, 28px); } }
@keyframes bs-waves-b { to { transform: translate(-64px, 40px); } }
.bs-board .battleship-grid { position: relative; z-index: 2; max-width: none; }
.bs-ships { position: absolute; inset: 0; z-index: 1; display: grid; gap: 2px; pointer-events: none;
  grid-template-columns: repeat(var(--battle-size), minmax(0, 1fr)); grid-template-rows: repeat(var(--battle-size), minmax(0, 1fr)); }
.bs-ship { position: relative; min-width: 0; min-height: 0; animation: bs-bob 4.6s ease-in-out infinite; }
.bs-ship.bs-v { animation-name: bs-bob-v; }
.bs-ship svg { display: block; width: 100%; height: 100%; overflow: visible; }
.bs-ship.bs-selected svg { filter: drop-shadow(0 0 3px var(--battle-owner-color, #1f7a5f)) drop-shadow(0 0 1px #fff); }
.bs-ship.bs-wreck { animation: none; opacity: .62; filter: grayscale(.85) brightness(.5) sepia(.35); }
.bs-ship.bs-sinking { animation: bs-sink 1.9s ease-in both; }
@keyframes bs-bob { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-1.5px) rotate(.35deg); } }
@keyframes bs-bob-v { 0%, 100% { transform: translateX(0) rotate(0); } 50% { transform: translateX(1.5px) rotate(-.35deg); } }
@keyframes bs-sink {
  0% { transform: none; filter: none; opacity: 1; }
  20% { transform: rotate(-3deg) translateY(1px); }
  55% { transform: rotate(5deg) scale(.95); filter: grayscale(.4) brightness(.75); opacity: .9; }
  100% { transform: rotate(4deg) scale(.9); filter: grayscale(.85) brightness(.5) sepia(.35); opacity: .62; }
}
.bs-board .battle-cell { position: relative; overflow: visible; color: transparent; border-radius: 3px;
  background: transparent !important; border-color: var(--bs-grid-line) !important; }
.bs-board .battle-cell:disabled { opacity: 1; cursor: default; }
.bs-board .battle-cell:not(:disabled):hover { background: rgba(255, 255, 255, .16) !important; }
.bs-board .battle-cell.selected-ship { box-shadow: inset 0 0 0 2px var(--battle-owner-color, #1f7a5f); }
.bs-board .battle-cell.damaged-hit { background: radial-gradient(circle, rgba(255, 110, 30, .32), transparent 70%) !important; }
.bs-board .battle-cell.battle-result-reveal { background: var(--battle-reveal-glow) !important; border-color: var(--battle-reveal-color) !important; }
.bs-board .battle-cell.battle-radar-scan { border-color: #facc15 !important; }
.bs-board .battle-cell.battle-radar-target, .bs-board .battle-cell.battle-attack-lock { border-color: #facc15 !important; }
.bs-peg { position: absolute; left: 32%; top: 32%; width: 36%; height: 36%; border-radius: 50%; z-index: 4; pointer-events: none; }
.bs-peg-miss { background: radial-gradient(circle at 35% 30%, #fff, var(--bs-miss) 55%, rgba(0, 0, 0, .25)); box-shadow: 0 0 0 3px rgba(255, 255, 255, .16), 0 2px 3px rgba(0, 0, 0, .35); }
.bs-peg-hit { background: radial-gradient(circle at 35% 30%, #ffc2bf, var(--bs-hit) 55%, #7a1010); box-shadow: 0 0 6px var(--bs-hit), 0 2px 3px rgba(0, 0, 0, .4); }
.bs-peg-sunk { background: radial-gradient(circle at 35% 30%, #8a8a8a, #1d1d1d); box-shadow: 0 0 0 2px rgba(227, 52, 47, .55); }
.bs-fire { position: absolute; left: 14%; right: 14%; bottom: 40%; height: 66%; z-index: 3; pointer-events: none; transform-origin: 50% 100%;
  border-radius: 50% 50% 40% 40% / 62% 62% 38% 38%; background: radial-gradient(ellipse at 50% 82%, var(--bs-fire-core), var(--bs-fire) 42%, rgba(255, 70, 0, 0) 72%); }
.bs-fire-live { animation: bs-flicker .42s ease-in-out infinite alternate; }
.bs-smoke { position: absolute; left: 22%; bottom: 62%; width: 56%; height: 56%; z-index: 3; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle, var(--bs-smoke), transparent 68%); animation: bs-smoke 2.8s ease-out infinite; }
@keyframes bs-flicker { from { transform: scale(.9, .85) skewX(-4deg); opacity: .85; } to { transform: scale(1.06, 1.12) skewX(4deg); opacity: 1; } }
@keyframes bs-smoke { 0% { transform: translateY(20%) scale(.5); opacity: 0; } 25% { opacity: .9; } 100% { transform: translateY(-90%) translateX(18%) scale(1.5); opacity: 0; } }
.bs-fx { position: absolute; left: 0; top: 0; width: 100%; height: 100%; z-index: 4; border-radius: 50%; pointer-events: none; animation-fill-mode: both; }
.bs-flash { background: radial-gradient(circle, #fff, rgba(255, 240, 180, .9) 30%, transparent 70%); animation: bs-flash .4s ease-out both; }
.bs-fireball { background: radial-gradient(circle, var(--bs-fire-core), var(--bs-fire) 40%, rgba(190, 40, 0, .65) 60%, transparent 72%); animation: bs-fireball .95s ease-out both; }
.bs-shock { border: 3px solid rgba(255, 230, 180, .9); animation: bs-ring .6s ease-out both; }
.bs-debris { left: 42%; top: 42%; width: 16%; height: 16%; border-radius: 2px; background: #2b2724; animation: bs-debris .95s cubic-bezier(.2, .7, .4, 1) both; }
.bs-smoke-puff { background: radial-gradient(circle, rgba(70, 70, 74, .75), transparent 65%); animation: bs-puff 1.7s ease-out both; }
.bs-ring { border: 2px solid rgba(255, 255, 255, .92); animation: bs-ring .95s ease-out both; }
.bs-ring2 { animation-duration: 1.25s; }
.bs-column { left: 30%; width: 40%; top: -70%; height: 120%; border-radius: 50% 50% 22% 22%; transform-origin: 50% 100%;
  background: linear-gradient(to top, rgba(255, 255, 255, .95), rgba(220, 240, 255, .15)); animation: bs-column .75s ease-out both; }
.bs-drop { left: 43%; top: 43%; width: 14%; height: 14%; background: #eaf7ff; animation: bs-drop .85s cubic-bezier(.2, .8, .5, 1) both; }
@keyframes bs-flash { 0% { transform: scale(.4); opacity: 1; } 100% { transform: scale(3); opacity: 0; } }
@keyframes bs-fireball { 0% { transform: scale(.2); opacity: 1; } 40% { transform: scale(2.1); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; } }
@keyframes bs-ring { 0% { transform: scale(.25); opacity: 1; } 100% { transform: scale(2.6); opacity: 0; } }
@keyframes bs-debris { 0% { transform: translate(0, 0) rotate(0); opacity: 1; } 100% { transform: translate(calc(var(--dx) * 34px), calc(var(--dy) * 34px)) rotate(420deg); opacity: 0; } }
@keyframes bs-puff { 0% { transform: scale(.4); opacity: 0; } 25% { opacity: .9; } 100% { transform: translateY(-55%) scale(3); opacity: 0; } }
@keyframes bs-column { 0% { transform: scaleY(0); opacity: 1; } 45% { transform: scaleY(1); opacity: .95; } 100% { transform: scaleY(.2); opacity: 0; } }
@keyframes bs-drop { 0% { transform: translate(0, 0); opacity: 1; } 50% { transform: translate(calc(var(--dx) * 16px), calc(var(--dy) * 16px)); opacity: 1; } 100% { transform: translate(calc(var(--dx) * 24px), 8px); opacity: 0; } }
.bs-stage.bs-shake { animation: bs-shake .5s linear both; }
@keyframes bs-shake { 0%, 100% { transform: none; } 15% { transform: translate(-4px, 2px); } 30% { transform: translate(4px, -2px); } 45% { transform: translate(-3px, -1px); } 60% { transform: translate(2px, 2px); } 80% { transform: translate(-1px, 0); } }
.fx-off .bs-water::before, .fx-off .bs-water::after, .fx-off .bs-ship, .fx-lite .bs-ship { animation: none; }
@media (prefers-reduced-motion: reduce) { .bs-stage, .bs-stage * , .bs-stage *::before, .bs-stage *::after { animation: none !important; transition: none !important; } }
.bs-tracker { margin-top: 10px; font-size: .74rem; }
.bs-tracker-title { font-weight: 900; color: var(--muted); margin-bottom: 4px; }
.bs-tracker ul { display: flex; flex-wrap: wrap; gap: 6px 12px; margin: 0; padding: 0; list-style: none; }
.bs-tracker li { display: grid; gap: 2px; }
.bs-tracker li.sunk span { text-decoration: line-through; opacity: .6; }
.bs-tracker b { display: inline-flex; gap: 2px; }
.bs-tracker i { width: 9px; height: 9px; border-radius: 2px; background: rgba(127, 140, 155, .45); }
.bs-tracker i.hit { background: #e3342f; }
.bs-settings { font-size: .8rem; }
.bs-settings summary { cursor: pointer; font-weight: 800; color: var(--muted); padding: 2px 0; }
.bs-settings-body { display: grid; gap: 6px; padding: 6px 0 2px; }
.bs-settings-body label { display: flex; align-items: center; gap: 6px; }
.bs-settings-body input[type="checkbox"] { width: 18px; height: 18px; min-height: 0; margin: 0; padding: 0; }
.bs-settings-fx { display: flex; align-items: center; gap: 6px; }
.bs-settings-fx button { min-height: 30px; padding: 2px 10px; font-size: .78rem; }
.bs-settings-fx button.selected { border-color: var(--accent); box-shadow: inset 0 -3px 0 var(--accent); }`;
