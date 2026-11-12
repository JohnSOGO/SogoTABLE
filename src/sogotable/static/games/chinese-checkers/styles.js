// Chinese Checkers — scoped, injected-once stylesheet. Every rule is prefixed
// .chinese-checkers-root (classes are cc-*, never a shell class name), the
// first two rules neutralise the tic-tac-toe #macroBoard grid and the shell
// #turnStatus, and the dark block re-points the --cc-* tokens under
// <html data-theme="dark">. Buttons reset the shell's global
// `button{min-height:44px;…}` props they use. Board wood/hole colours come from
// assets.js (the SVG palette); highlight rings and panels use the tokens here.
// Mobile-first: one arrangement on every device, wider screens just get larger.
const LIGHT = `
#macroBoard:has(.chinese-checkers-root){display:block;aspect-ratio:auto;height:auto;max-width:none}
#turnStatus:has(~ #macroBoard .chinese-checkers-root){display:none}
.chinese-checkers-root{
  --cc-ink:#2b2117;--cc-muted:#7b6b58;--cc-panel:#fffaf1;--cc-line:#eadcc4;--cc-chip:#f4ebda;
  --cc-felt:#e8dcc3;--cc-accent:#c2621b;--cc-accent-ink:#fff;--cc-btn:#2f6b3a;--cc-btn-ink:#fff;
  --cc-good:#2e7d32;--cc-bad:#b3261e;--cc-win:#fff1bf;--cc-shadow:0 2px 10px rgba(70,45,15,.14);
  --cc-select:#ffd23f;--cc-step:#ffffff;--cc-hop:#ffd23f;--cc-reach:rgba(255,255,255,.85);--cc-movable:rgba(255,248,214,.95);
  --cc-path:#fff6d6;--cc-path-edge:rgba(60,35,10,.55);
  color:var(--cc-ink);font-family:"Avenir Next","Segoe UI",system-ui,sans-serif;
  width:100%;max-width:980px;margin:0 auto;display:flex;flex-direction:column;gap:8px;text-align:left;
}
.chinese-checkers-root [hidden]{display:none !important}
.chinese-checkers-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.chinese-checkers-root button{min-height:0;width:auto;font:inherit;font-weight:700;cursor:pointer;box-shadow:none;margin:0}
.chinese-checkers-root button:disabled{cursor:not-allowed;opacity:.42}

/* status strip: three fixed one-liners */
.chinese-checkers-root .cc-strip{background:var(--cc-panel);border-radius:12px;box-shadow:var(--cc-shadow);padding:6px 10px}
.chinese-checkers-root .cc-strip-line{display:flex;align-items:center;gap:8px;height:22px;white-space:nowrap;overflow:hidden;font-size:13.5px}
.chinese-checkers-root .cc-round{font-weight:800}
.chinese-checkers-root .cc-badge{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:10px;font-size:11.5px;font-weight:800;background:var(--cc-chip);color:var(--cc-muted);font-variant-numeric:tabular-nums}
.chinese-checkers-root .cc-badge-prio{background:#fde7c8;color:#8a4a10}
.chinese-checkers-root .cc-badge-prio.cc-first{background:var(--cc-accent);color:var(--cc-accent-ink)}
.chinese-checkers-root .cc-badge-locked{margin-left:auto}
.chinese-checkers-root .cc-mystate{display:block;line-height:22px;text-overflow:ellipsis;font-weight:600}
.chinese-checkers-root .cc-mystate-locked{color:var(--cc-good);font-weight:800}
.chinese-checkers-root .cc-ticker{color:var(--cc-muted);font-size:12.5px}
.chinese-checkers-root .cc-ticker[role="button"]{cursor:pointer}
.chinese-checkers-root .cc-ticker-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.chinese-checkers-root .cc-page{flex:none;font-size:10.5px;font-weight:800;padding:1px 6px;border-radius:8px;background:var(--cc-chip);color:var(--cc-muted)}
.chinese-checkers-root .cc-ticker-error{color:var(--cc-bad);font-weight:700}
.chinese-checkers-root .cc-ticker-info{color:var(--cc-accent);font-weight:700}

/* board */
.chinese-checkers-root .cc-boardwrap{position:relative;width:100%;border-radius:16px;padding:6px 4px;
  background:radial-gradient(120% 90% at 50% 35%,var(--cc-felt),color-mix(in srgb,var(--cc-felt) 82%,#000));box-shadow:var(--cc-shadow)}
.chinese-checkers-root svg.cc-board{display:block;width:100%;height:auto;max-width:min(100%,640px,calc((100svh - 300px) * .87));margin:0 auto;
  touch-action:manipulation;user-select:none;-webkit-user-select:none}
.chinese-checkers-root.cc-can-act svg.cc-board,.chinese-checkers-root.cc-animating svg.cc-board{cursor:pointer}
.chinese-checkers-root .cc-ring-step{fill:rgba(255,255,255,.18);stroke:var(--cc-step);stroke-width:3.2px}
.chinese-checkers-root .cc-ring-hop{fill:rgba(255,210,63,.2);stroke:var(--cc-hop);stroke-width:3.4px;transform-box:fill-box;transform-origin:center;animation:cc-pulse 1.05s ease-in-out infinite}
.chinese-checkers-root .cc-ring-reach{fill:rgba(255,255,255,.08);stroke:var(--cc-reach);stroke-width:2px;stroke-dasharray:4 4}
.chinese-checkers-root .cc-movable{fill:none;stroke:var(--cc-movable);stroke-width:2.6px;transform-box:fill-box;transform-origin:center;animation:cc-breathe 1.8s ease-in-out infinite}
.chinese-checkers-root .cc-ring-selected{fill:none;stroke:var(--cc-select);stroke-width:4px;filter:drop-shadow(0 0 3px rgba(255,200,40,.9))}
.chinese-checkers-root .cc-ring-end{fill:none;stroke:var(--cc-path);stroke-width:3.5px;filter:drop-shadow(0 0 2px var(--cc-path-edge))}
.chinese-checkers-root .cc-ring-through{fill:none;stroke:var(--cc-reach);stroke-width:2.5px;stroke-dasharray:3 4}
.chinese-checkers-root .cc-path{fill:none;stroke:var(--cc-path);stroke-width:3.6px;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 1px 1.2px var(--cc-path-edge))}
.chinese-checkers-root .cc-path-locked{stroke-dasharray:6 6;opacity:.8}
.chinese-checkers-root .cc-path-node{fill:var(--cc-path);stroke:var(--cc-path-edge);stroke-width:1px}
.chinese-checkers-root .cc-ghost{opacity:.62}
.chinese-checkers-root .cc-ghost-through{opacity:.35}
.chinese-checkers-root .cc-lifted{opacity:.45}
.chinese-checkers-root .cc-shake{animation:cc-shake .46s ease-in-out}
.chinese-checkers-root .cc-flying{filter:drop-shadow(0 6px 4px rgba(0,0,0,.28))}
@keyframes cc-pulse{0%,100%{transform:scale(.88);stroke-opacity:1}50%{transform:scale(1.08);stroke-opacity:.45}}
@keyframes cc-breathe{0%,100%{stroke-opacity:.95}50%{stroke-opacity:.3}}
@keyframes cc-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}
@media (prefers-reduced-motion:reduce){.chinese-checkers-root .cc-ring-hop,.chinese-checkers-root .cc-movable{animation:none}}

/* action bar: four fixed slots, controls never move */
.chinese-checkers-root .cc-controls{display:grid;grid-template-columns:1fr 1fr 1fr 1.5fr;gap:6px;padding:8px;background:var(--cc-panel);border-radius:14px;box-shadow:var(--cc-shadow)}
.chinese-checkers-root .cc-btn{height:46px;padding:0 6px;border-radius:12px;border:1px solid var(--cc-line);background:var(--cc-chip);color:var(--cc-ink);font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chinese-checkers-root .cc-btn-pass{background:transparent}
.chinese-checkers-root .cc-btn-lock{background:var(--cc-btn);border-color:var(--cc-btn);color:var(--cc-btn-ink);font-size:15px}
.chinese-checkers-root .cc-btn-change{background:var(--cc-accent);border-color:var(--cc-accent);color:var(--cc-accent-ink);font-size:14px}

/* seat + results tables */
.chinese-checkers-root .cc-table,.chinese-checkers-root .cc-results{background:var(--cc-panel);border-radius:14px;box-shadow:var(--cc-shadow);padding:6px 10px;overflow-x:auto}
.chinese-checkers-root table.cc-scores{width:100%;border-collapse:collapse;font-size:14px}
.chinese-checkers-root table.cc-scores th{font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--cc-muted);padding:5px 4px;text-align:center;font-weight:800}
.chinese-checkers-root table.cc-scores td{padding:6px 4px;border-top:1px solid var(--cc-line);text-align:center;vertical-align:middle}
.chinese-checkers-root table.cc-scores .cc-l{text-align:left}
.chinese-checkers-root table.cc-scores .cc-num{font-variant-numeric:tabular-nums;font-weight:700;white-space:nowrap}
.chinese-checkers-root table.cc-scores .cc-of{color:var(--cc-muted);font-weight:600;font-size:11px}
.chinese-checkers-root table.cc-scores tr.cc-me .cc-name{font-weight:800}
.chinese-checkers-root table.cc-scores tr.cc-win td{background:var(--cc-win)}
.chinese-checkers-root .cc-goalbar{height:4px;width:40px;margin:3px auto 0;border-radius:2px;background:var(--cc-line);overflow:hidden}
.chinese-checkers-root .cc-goalbar span{display:block;height:100%;width:var(--cc-pct);background:var(--cc-sw)}
.chinese-checkers-root .cc-seat{display:flex;align-items:center;gap:6px;min-width:0;max-width:46vw}
.chinese-checkers-root .cc-prio{flex:none;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:10.5px;font-weight:800;background:var(--cc-chip);color:var(--cc-muted)}
.chinese-checkers-root .cc-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.chinese-checkers-root .cc-name em{font-style:normal;color:var(--cc-muted);font-weight:600;font-size:12px}
.chinese-checkers-root .cc-swatch{flex:none;width:14px;height:14px;border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#fff 0,var(--cc-sw) 45%,color-mix(in srgb,var(--cc-sw) 60%,#000) 100%);box-shadow:0 1px 2px rgba(0,0,0,.35)}
.chinese-checkers-root .cc-sub{font-size:11px;color:var(--cc-muted);white-space:nowrap;padding-left:44px}
.chinese-checkers-root .cc-pill{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:800;white-space:nowrap;background:var(--cc-chip);color:var(--cc-muted)}
.chinese-checkers-root .cc-pill-locked{background:#dcefd9;color:#24622b}
.chinese-checkers-root .cc-pill-thinking{background:#fff0c2;color:#7a5600}
.chinese-checkers-root .cc-pill-skipped{background:#f6dada;color:#8f2a22}
.chinese-checkers-root .cc-pill-finished{background:#e3dcfa;color:#4a2f99}
.chinese-checkers-root .cc-status{display:flex;flex-direction:column;align-items:center;gap:3px}
.chinese-checkers-root .cc-skip{height:24px;padding:0 8px;border-radius:13px;border:1px dashed var(--cc-line);background:transparent;color:var(--cc-muted);font-size:11.5px}
.chinese-checkers-root .cc-skip.cc-on{border-style:solid;border-color:var(--cc-accent);color:var(--cc-accent)}
.chinese-checkers-root .cc-results-title{margin:6px 0 8px;text-align:center;font-size:18px}
.chinese-checkers-root .cc-rank{font-size:16px}
.chinese-checkers-root .cc-total{font-size:16px}

/* lobby options */
.chinese-checkers-root .cc-options{display:flex;flex-direction:column;gap:10px;margin:4px 0 12px}
.chinese-checkers-root .cc-opt{display:flex;align-items:center;justify-content:space-between;gap:10px}
.chinese-checkers-root .cc-opt-label{display:flex;flex-direction:column;min-width:0}
.chinese-checkers-root .cc-opt-label b{font-size:14px}
.chinese-checkers-root .cc-opt-label span{font-size:12px;color:var(--muted,#6b6b6b)}
.chinese-checkers-root .cc-seg{flex:none;display:inline-flex;border:1px solid var(--line,#ddd);border-radius:10px;overflow:hidden}
.chinese-checkers-root .cc-seg button{height:34px;padding:0 10px;border:0;border-radius:0;background:var(--surface,#fff);color:var(--ink,#222);font-size:13px}
.chinese-checkers-root .cc-seg button+button{border-left:1px solid var(--line,#ddd)}
.chinese-checkers-root .cc-seg button.cc-on{background:var(--cc-btn);color:var(--cc-btn-ink)}
.chinese-checkers-root .cc-opt-hint{margin:0;font-size:12.5px;color:var(--cc-muted);font-weight:600}
.chinese-checkers-root .cc-opt-hint.cc-warn{color:var(--cc-accent);font-weight:700}
@media (max-width:420px){
  .chinese-checkers-root .cc-seg button{padding:0 7px;font-size:12px}
  .chinese-checkers-root .cc-opt-label span{font-size:11px}
  .chinese-checkers-root table.cc-scores{font-size:13px}
  .chinese-checkers-root .cc-btn{font-size:12.5px}
  .chinese-checkers-root .cc-btn-lock{font-size:14px}
}
`;

const DARK = `
:root[data-theme="dark"] .chinese-checkers-root{
  --cc-ink:#ece6d8;--cc-muted:#a69c8a;--cc-panel:#1f2420;--cc-line:#363f39;--cc-chip:#2a312c;
  --cc-felt:#1b2a22;--cc-accent:#e59a4c;--cc-accent-ink:#1a1209;--cc-btn:#4f9a5c;--cc-btn-ink:#0f1410;
  --cc-good:#7fd08a;--cc-bad:#ff8a80;--cc-win:#3a3418;--cc-shadow:0 2px 12px rgba(0,0,0,.45);
  --cc-step:#f4f1e8;--cc-reach:rgba(244,241,232,.7);--cc-movable:rgba(255,240,190,.9);
  --cc-path:#fff2c4;--cc-path-edge:rgba(0,0,0,.7);
}
:root[data-theme="dark"] .chinese-checkers-root .cc-badge-prio{background:#45301a;color:#f3c089}
:root[data-theme="dark"] .chinese-checkers-root .cc-pill-locked{background:#22402a;color:#9fe0a8}
:root[data-theme="dark"] .chinese-checkers-root .cc-pill-thinking{background:#40361a;color:#f4d27a}
:root[data-theme="dark"] .chinese-checkers-root .cc-pill-skipped{background:#46201e;color:#ffaaa2}
:root[data-theme="dark"] .chinese-checkers-root .cc-pill-finished{background:#2e2650;color:#c6b8ff}
`;

export const CHINESE_CHECKERS_CSS = LIGHT + DARK;
