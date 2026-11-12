// Realmwright — scoped, injected-once stylesheet. Every rule is prefixed
// .realmwright-root (classes are rw-*, never a shell class name), the first two
// rules neutralise the tic-tac-toe #macroBoard grid and the shell #turnStatus,
// and the dark block re-points the --rw-* tokens under <html data-theme="dark">.
// Buttons reset the shell's global `button{min-height:44px;…}` props they use.
// Board colours come from assets.js (the SVG palette), not from here.
const LIGHT = `
#macroBoard:has(.realmwright-root){display:block;aspect-ratio:auto;height:auto;max-width:none}
#turnStatus:has(~ #macroBoard .realmwright-root){display:none}
.realmwright-root{
  --rw-ink:#2e2416;--rw-muted:#7a6a55;--rw-panel:#fffaf0;--rw-line:#e6d8bd;--rw-chip:#f3ead6;
  --rw-accent:#b5651d;--rw-accent-ink:#fff;--rw-btn:#2f6b3a;--rw-btn-ink:#fff;--rw-gold:#ffd84a;
  --rw-good:#2e7d32;--rw-bad:#b3261e;--rw-win:#fff1bf;--rw-shadow:0 2px 10px rgba(70,50,20,.14);
  --rw-cand:#ffcf33;--rw-weak:rgba(70,50,30,.5);--rw-spot:#fff8dc;--rw-spot-ink:#6b4f2f;
  color:var(--rw-ink);font-family:"Avenir Next","Segoe UI",system-ui,sans-serif;
  width:100%;max-width:980px;margin:0 auto;display:flex;flex-direction:column;gap:8px;text-align:left;
}
.realmwright-root [hidden]{display:none !important}
.realmwright-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.realmwright-root button{min-height:0;width:auto;font:inherit;font-weight:700;cursor:pointer;box-shadow:none}
.realmwright-root button:disabled{cursor:not-allowed;opacity:.45}

/* status strip: two fixed one-liners */
.realmwright-root .rw-strip{background:var(--rw-panel);border-radius:12px;box-shadow:var(--rw-shadow);padding:6px 10px}
.realmwright-root .rw-strip-line{display:flex;align-items:center;gap:8px;height:22px;white-space:nowrap;overflow:hidden;font-size:13.5px}
.realmwright-root .rw-chip-round{font-weight:800}
.realmwright-root .rw-chip-bag{color:var(--rw-muted);font-weight:700;font-variant-numeric:tabular-nums}
.realmwright-root .rw-mystate{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.realmwright-root .rw-ticker{display:block;line-height:22px;text-overflow:ellipsis;color:var(--rw-muted);font-size:12.5px}
.realmwright-root .rw-ticker-error{color:var(--rw-bad);font-weight:700}
.realmwright-root .rw-ticker-info{color:var(--rw-accent);font-weight:700}

/* board */
.realmwright-root .rw-viewport{position:relative;height:clamp(300px,54vh,680px);border-radius:14px;overflow:hidden;
  touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;box-shadow:inset 0 0 0 1px var(--rw-line),var(--rw-shadow)}
.realmwright-root .rw-viewport.rw-dragging{cursor:grabbing}
.realmwright-root svg.rw-board{display:block;width:100%;height:100%}
.realmwright-root .rw-zoom{position:absolute;top:8px;right:8px;display:flex;flex-direction:column;gap:6px}
.realmwright-root .rw-zbtn{width:36px;height:36px;padding:0;border-radius:50%;border:1px solid var(--rw-line);
  background:var(--rw-panel);color:var(--rw-ink);font-size:19px;line-height:1;opacity:.92;box-shadow:var(--rw-shadow)}
.realmwright-root .rw-cand-ring{fill:rgba(255,220,80,.12);stroke:var(--rw-cand);stroke-width:3px;vector-effect:non-scaling-stroke;
  animation:rw-pulse 1.3s ease-in-out infinite}
.realmwright-root .rw-cand-weak{fill:none;stroke:var(--rw-weak);stroke-width:1.5px;stroke-dasharray:7 6;vector-effect:non-scaling-stroke}
.realmwright-root .rw-preview-shadow{fill:rgba(0,0,0,.28)}
.realmwright-root .rw-preview-ring{fill:none;stroke:var(--rw-gold);stroke-width:3.5px;vector-effect:non-scaling-stroke}
.realmwright-root .rw-spot-halo{fill:rgba(255,216,74,.45);transform-box:fill-box;transform-origin:center;animation:rw-spot 1.1s ease-in-out infinite}
.realmwright-root .rw-spot-dot{fill:var(--rw-spot);stroke:var(--rw-spot-ink);stroke-width:1.6}
.realmwright-root .rw-spot text{pointer-events:none}
.realmwright-root .rw-glow{fill:rgba(255,230,110,.4);stroke:#ffe066;stroke-width:6;animation:rw-glow 2.6s ease-out forwards}
.realmwright-root .rw-fresh{opacity:.9}
@keyframes rw-pulse{0%,100%{stroke-opacity:1;fill-opacity:1}50%{stroke-opacity:.35;fill-opacity:.4}}
@keyframes rw-spot{0%,100%{transform:scale(.85);opacity:.9}50%{transform:scale(1.18);opacity:.45}}
@keyframes rw-glow{0%{opacity:1}70%{opacity:.8}100%{opacity:0}}

/* action tray: fixed height, controls never move */
.realmwright-root .rw-tray{display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-rows:64px 34px;align-items:center;gap:6px 8px;
  height:120px;padding:8px;background:var(--rw-panel);border-radius:14px;box-shadow:var(--rw-shadow)}
.realmwright-root .rw-hand{display:flex;align-items:center;gap:6px}
.realmwright-root .rw-hand-tile{width:64px;height:64px;border-radius:6px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.3)}
.realmwright-root .rw-hand-tile svg{display:block}
.realmwright-root .rw-hand-tile.rw-faded{opacity:.4}
.realmwright-root .rw-hand-empty{width:64px;height:64px;display:grid;place-items:center;background:var(--rw-chip);color:var(--rw-muted);font-size:24px}
.realmwright-root .rw-btn{border:1px solid transparent;border-radius:12px;padding:0}
.realmwright-root .rw-rotate{width:44px;height:44px;border-radius:50%;background:var(--rw-chip);border-color:var(--rw-line);color:var(--rw-ink);font-size:22px}
.realmwright-root .rw-confirm{height:52px;padding:0 16px;background:var(--rw-btn);color:var(--rw-btn-ink);font-size:15px;min-width:92px}
.realmwright-root .rw-mid{display:flex;flex-direction:column;gap:5px;min-width:0}
.realmwright-root .rw-chips{grid-column:1 / -1;display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;height:34px;align-items:center;scrollbar-width:thin}
.realmwright-root .rw-chip{flex:none;height:30px;padding:0 10px;border-radius:15px;border:1px solid var(--rw-line);
  background:var(--rw-chip);color:var(--rw-ink);font-size:12.5px;white-space:nowrap;display:inline-flex;align-items:center;gap:3px}
.realmwright-root .rw-chip.rw-on{background:var(--rw-accent);border-color:var(--rw-accent);color:var(--rw-accent-ink)}
.realmwright-root .rw-chip-hint{background:transparent;border-color:transparent;color:var(--rw-muted);font-weight:600;font-style:italic}
.realmwright-root .rw-meeple-count{display:flex;align-items:center;gap:4px;font-size:12.5px;color:var(--rw-muted);font-weight:700;height:22px}
.realmwright-root .rw-choice{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;height:20px}
.realmwright-root .rw-meeple-count svg{display:block}

/* score + results tables */
.realmwright-root .rw-table,.realmwright-root .rw-results{background:var(--rw-panel);border-radius:14px;box-shadow:var(--rw-shadow);padding:6px 10px;overflow-x:auto}
.realmwright-root table.rw-scores{width:100%;border-collapse:collapse;font-size:14px}
.realmwright-root table.rw-scores th{font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--rw-muted);padding:5px 4px;text-align:center;font-weight:800}
.realmwright-root table.rw-scores td{padding:6px 4px;border-top:1px solid var(--rw-line);text-align:center;vertical-align:middle}
.realmwright-root table.rw-scores .rw-l{text-align:left}
.realmwright-root table.rw-scores .rw-num{font-variant-numeric:tabular-nums;font-weight:700}
.realmwright-root table.rw-scores .rw-live{color:var(--rw-accent)}
.realmwright-root table.rw-scores .rw-of{color:var(--rw-muted);font-weight:600;font-size:11px}
.realmwright-root table.rw-scores tr.rw-me .rw-name{font-weight:800}
.realmwright-root .rw-seat{display:flex;align-items:center;gap:6px;min-width:0;max-width:44vw}
.realmwright-root .rw-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.realmwright-root .rw-name em{font-style:normal;color:var(--rw-muted);font-weight:600;font-size:12px}
.realmwright-root .rw-swatch{flex:none;width:12px;height:12px;border-radius:50%;box-shadow:0 0 0 1.5px rgba(0,0,0,.25)}
.realmwright-root .rw-sub{font-size:11px;color:var(--rw-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:18px}
.realmwright-root .rw-pill{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:800;white-space:nowrap;background:var(--rw-chip);color:var(--rw-muted)}
.realmwright-root .rw-pill-placed{background:#dcefd9;color:#24622b}
.realmwright-root .rw-pill-ready{background:#fff0c2;color:#7a5600}
.realmwright-root .rw-pill-skipped{background:#f6dada;color:#8f2a22}
.realmwright-root .rw-status{display:flex;flex-direction:column;align-items:center;gap:3px}
.realmwright-root .rw-skip{height:24px;padding:0 8px;border-radius:13px;border:1px dashed var(--rw-line);background:transparent;color:var(--rw-muted);font-size:11.5px}
.realmwright-root .rw-skip.rw-on{border-style:solid;border-color:var(--rw-accent);color:var(--rw-accent)}
.realmwright-root .rw-results-title{margin:6px 0 8px;text-align:center;font-size:18px}
.realmwright-root table.rw-scores tr.rw-win td{background:var(--rw-win)}
.realmwright-root table.rw-scores .rw-total{font-size:16px}

/* lobby options */
.realmwright-root .rw-options{display:flex;flex-direction:column;gap:10px;margin:4px 0 12px}
.realmwright-root .rw-opt{display:flex;align-items:center;justify-content:space-between;gap:10px}
.realmwright-root .rw-opt-label{display:flex;flex-direction:column;min-width:0}
.realmwright-root .rw-opt-label b{font-size:14px}
.realmwright-root .rw-opt-label span{font-size:12px;color:var(--muted,#6b6b6b)}
.realmwright-root .rw-seg{flex:none;display:inline-flex;border:1px solid var(--line,#ddd);border-radius:10px;overflow:hidden}
.realmwright-root .rw-seg button{height:34px;padding:0 10px;border:0;border-radius:0;background:var(--surface,#fff);color:var(--ink,#222);font-size:13px}
.realmwright-root .rw-seg button+button{border-left:1px solid var(--line,#ddd)}
.realmwright-root .rw-seg button.rw-on{background:var(--rw-btn);color:var(--rw-btn-ink)}
.realmwright-root .rw-opt-hint{margin:0;font-size:12.5px;color:var(--rw-accent);font-weight:700}
@media (max-width:420px){
  .realmwright-root .rw-seg button{padding:0 7px;font-size:12px}
  .realmwright-root .rw-opt-label span{font-size:11px}
  .realmwright-root table.rw-scores{font-size:13px}
}
`;

const DARK = `
:root[data-theme="dark"] .realmwright-root{
  --rw-ink:#ece6d8;--rw-muted:#a59c8a;--rw-panel:#1f2621;--rw-line:#36403a;--rw-chip:#2a332d;
  --rw-accent:#e0a050;--rw-accent-ink:#1a140a;--rw-btn:#4f9a5c;--rw-btn-ink:#0f1410;--rw-gold:#ffd84a;
  --rw-good:#7fd08a;--rw-bad:#ff8a80;--rw-win:#3a3418;--rw-shadow:0 2px 12px rgba(0,0,0,.45);
  --rw-cand:#ffd84a;--rw-weak:rgba(230,220,190,.42);--rw-spot:#fff3c4;--rw-spot-ink:#3b2a14;
}
:root[data-theme="dark"] .realmwright-root .rw-pill-placed{background:#22402a;color:#9fe0a8}
:root[data-theme="dark"] .realmwright-root .rw-pill-ready{background:#40361a;color:#f4d27a}
:root[data-theme="dark"] .realmwright-root .rw-pill-skipped{background:#46201e;color:#ffaaa2}
`;

export const REALMWRIGHT_CSS = LIGHT + DARK;
