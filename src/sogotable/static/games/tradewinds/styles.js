// Tradewind Isles — scoped, injected-once stylesheet. Every rule is prefixed
// .tradewinds-root (classes are tw-*, never a shell class name), the first two
// rules neutralise the tic-tac-toe #macroBoard grid and the shell #turnStatus,
// and the dark block re-points the --tw-* tokens under <html data-theme="dark">.
// Buttons reset the shell's global `button{min-height:44px;…}` props they use.
// Board colours come from assets.js (the SVG palette), not from here.
const LIGHT = `
#macroBoard:has(.tradewinds-root){display:block;aspect-ratio:auto;height:auto;max-width:none}
#turnStatus:has(~ #macroBoard .tradewinds-root){display:none}
.tradewinds-root{
  --tw-ink:#1f2a2e;--tw-muted:#5f6f73;--tw-panel:#fffdf7;--tw-line:#e3dccb;--tw-chip:#f1ece0;
  --tw-accent:#0f7c8c;--tw-accent-ink:#fff;--tw-btn:#e8673a;--tw-btn-ink:#fff;--tw-gold:#ffd23f;
  --tw-good:#2e7d32;--tw-bad:#b3261e;--tw-win:#fff1bf;--tw-shadow:0 2px 10px rgba(20,60,70,.13);
  --tw-afford:#2e9e5b;--tw-afford-bg:#e4f6ea;--tw-die:#fffaf0;--tw-die-ink:#2a2a2a;--tw-die-edge:#b9ad95;
  --tw-sea:#7cc6d9;
  color:var(--tw-ink);font-family:"Avenir Next","Segoe UI",system-ui,sans-serif;
  width:100%;max-width:1280px;margin:0 auto;display:flex;flex-direction:column;gap:8px;text-align:left;
}
.tradewinds-root [hidden]{display:none !important}
.tradewinds-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.tradewinds-root button{min-height:0;width:auto;margin:0;font:inherit;font-weight:700;cursor:pointer;box-shadow:none;letter-spacing:0;text-transform:none}
.tradewinds-root button:disabled{cursor:not-allowed;opacity:.42}
.tradewinds-root .tw-panel{background:var(--tw-panel);border-radius:14px;box-shadow:var(--tw-shadow);padding:8px 10px}
.tradewinds-root .tw-h{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--tw-muted);font-weight:800;margin:2px 0 6px}
.tradewinds-root .tw-h-sub{margin-top:10px}
.tradewinds-root .tw-empty{color:var(--tw-muted);font-size:12.5px;font-style:italic;list-style:none}
.tradewinds-root .tw-muted{color:var(--tw-muted);font-size:12px;font-weight:600}
.tradewinds-root .tw-swatch{flex:none;display:inline-block;width:12px;height:12px;border-radius:50%;box-shadow:0 0 0 1.5px rgba(0,0,0,.25);vertical-align:-1px}
.tradewinds-root .tw-swatch-none{background:transparent;box-shadow:none}
.tradewinds-root .tw-resimg{width:18px;height:18px;object-fit:contain;vertical-align:-4px}

/* top bar */
.tradewinds-root .tw-top{background:var(--tw-panel);border-radius:14px;box-shadow:var(--tw-shadow);padding:6px 10px;display:flex;flex-direction:column;gap:3px}
.tradewinds-root .tw-top-line{display:flex;align-items:center;gap:10px;min-height:30px;white-space:nowrap;overflow:hidden;font-size:14px}
.tradewinds-root .tw-round{font-weight:800}
.tradewinds-root .tw-dice{display:inline-flex;align-items:center;gap:3px;font-variant-numeric:tabular-nums}
.tradewinds-root .tw-dice b{margin-left:3px;font-size:16px}
.tradewinds-root .tw-dice.tw-seven b{color:var(--tw-bad)}
.tradewinds-root .tw-dice-none{color:var(--tw-muted);font-size:12.5px;font-weight:600}
.tradewinds-root svg.tw-die rect{fill:var(--tw-die);stroke:var(--tw-die-edge);stroke-width:1.2}
.tradewinds-root svg.tw-die circle{fill:var(--tw-die-ink)}
.tradewinds-root .tw-captain{font-size:12.5px;color:var(--tw-muted);font-weight:700;overflow:hidden;text-overflow:ellipsis;min-width:0}
.tradewinds-root .tw-target{margin-left:auto;font-weight:800;font-size:13px;color:var(--tw-muted)}
.tradewinds-root .tw-prompt,.tradewinds-root .tw-flash{font-size:14.5px;font-weight:700;line-height:1.3;min-height:20px}
.tradewinds-root .tw-prompt{color:var(--tw-accent)}
.tradewinds-root .tw-flash-error{color:var(--tw-bad)}
.tradewinds-root .tw-flash-info{color:var(--tw-accent)}

/* layout */
.tradewinds-root .tw-main{display:flex;flex-direction:column;gap:8px}
.tradewinds-root .tw-boardcol,.tradewinds-root .tw-side{display:flex;flex-direction:column;gap:8px;min-width:0}
.tradewinds-root .tw-boardframe{position:relative}
.tradewinds-root .tw-zoom{position:absolute;top:8px;right:8px;width:40px;height:40px;padding:0;border-radius:50%;border:1px solid var(--tw-line);background:var(--tw-panel);color:var(--tw-ink);font-size:18px;opacity:.92;box-shadow:var(--tw-shadow)}
.tradewinds-root.tw-zoomed .tw-zoom{background:var(--tw-accent);border-color:var(--tw-accent)}
.tradewinds-root.tw-zoomed .tw-boardwrap{overflow:auto;-webkit-overflow-scrolling:touch;max-height:78vh}
.tradewinds-root.tw-zoomed svg.tw-board{width:175%;max-height:none}
.tradewinds-root .tw-boardwrap{border-radius:14px;overflow:hidden;background:var(--tw-sea);box-shadow:var(--tw-shadow);touch-action:manipulation;user-select:none;-webkit-user-select:none}
.tradewinds-root svg.tw-board{display:block;width:100%;height:auto;max-height:78vh}
.tradewinds-root svg.tw-board text{pointer-events:none;font-family:inherit}
.tradewinds-root .tw-hit{fill:transparent;stroke:transparent;pointer-events:all;cursor:pointer}
.tradewinds-root .tw-glow{pointer-events:none;animation:tw-pulse 1.3s ease-in-out infinite}
.tradewinds-root .tw-sel,.tradewinds-root .tw-monkey,.tradewinds-root .tw-token,.tradewinds-root .tw-dock{pointer-events:none}
@keyframes tw-pulse{0%,100%{opacity:1}50%{opacity:.4}}
@media (prefers-reduced-motion:reduce){.tradewinds-root .tw-glow{animation:none}}
@media (min-width:900px){
  .tradewinds-root .tw-main{display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,400px);align-items:start}
  .tradewinds-root .tw-boardcol{position:sticky;top:8px}
  .tradewinds-root svg.tw-board{max-height:calc(100vh - 190px)}
}

/* action panel */
.tradewinds-root .tw-action{border:2px solid var(--tw-gold)}
.tradewinds-root .tw-act-row{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.tradewinds-root .tw-act-text{display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:14px;min-width:0}
.tradewinds-root .tw-act-text span{color:var(--tw-muted);font-weight:600}
.tradewinds-root .tw-act-btns{display:flex;gap:6px;margin-left:auto}
.tradewinds-root .tw-act-btn{height:40px;padding:0 14px;border-radius:12px;border:1px solid var(--tw-line);background:var(--tw-chip);color:var(--tw-ink);font-size:14px;white-space:nowrap}
.tradewinds-root .tw-act-btn.tw-primary{background:var(--tw-btn);border-color:var(--tw-btn);color:var(--tw-btn-ink)}
.tradewinds-root .tw-act-btn.tw-ghost{background:transparent}
.tradewinds-root .tw-act-btn.tw-wide{width:100%;margin-top:6px}
.tradewinds-root .tw-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center}
.tradewinds-root .tw-chips-label{font-size:12.5px;color:var(--tw-muted);font-weight:700}
.tradewinds-root .tw-chip{height:36px;padding:0 11px;border-radius:18px;border:1px solid var(--tw-line);background:var(--tw-chip);color:var(--tw-ink);font-size:13px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.tradewinds-root .tw-chip.tw-on{background:var(--tw-accent);border-color:var(--tw-accent);color:var(--tw-accent-ink)}
.tradewinds-root .tw-chip.tw-afford:not(.tw-on){border-color:var(--tw-afford);box-shadow:inset 0 0 0 1px var(--tw-afford)}
.tradewinds-root .tw-chip-static{font-weight:700}
.tradewinds-root .tw-chip-res{flex-direction:column;height:46px;width:52px;padding:2px 0;gap:0;border-radius:12px;justify-content:center;font-size:18px}
.tradewinds-root .tw-chip-res small{font-size:11px;font-weight:800}
.tradewinds-root .tw-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-top:8px}
.tradewinds-root .tw-step{display:flex;flex-direction:column;align-items:center;gap:3px;background:var(--tw-chip);border-radius:12px;padding:5px 2px}
.tradewinds-root .tw-step-res{font-size:20px;display:flex;align-items:baseline;gap:2px}
.tradewinds-root .tw-step-res small{font-size:11px;color:var(--tw-muted);font-weight:800}
.tradewinds-root .tw-step-n{font-size:16px;font-variant-numeric:tabular-nums}
.tradewinds-root .tw-stepbtn{width:36px;height:30px;border-radius:9px;border:1px solid var(--tw-line);background:var(--tw-panel);color:var(--tw-ink);font-size:18px;line-height:1;padding:0}
.tradewinds-root .tw-steps-tight{margin-top:0}
.tradewinds-root .tw-steps-tight .tw-step{flex-direction:row;flex-wrap:wrap;justify-content:center;gap:2px 3px}
.tradewinds-root .tw-steps-tight .tw-step-res{width:100%;justify-content:center;font-size:17px}
.tradewinds-root .tw-steps-tight .tw-stepbtn{width:28px;height:28px;font-size:16px}
.tradewinds-root .tw-steps-tight .tw-step-n{min-width:14px;text-align:center}

/* hand + build bar */
.tradewinds-root .tw-hand-head{display:flex;flex-direction:column;gap:4px}
.tradewinds-root .tw-res-row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.tradewinds-root .tw-res{display:flex;align-items:center;justify-content:center;gap:5px;height:40px;border-radius:12px;background:var(--tw-chip);font-size:20px}
.tradewinds-root .tw-res b{font-size:17px;font-variant-numeric:tabular-nums}
.tradewinds-root .tw-res.tw-zero{opacity:.45}
.tradewinds-root .tw-buildbar{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:8px}
.tradewinds-root .tw-build{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 2px;border-radius:12px;border:1.5px solid var(--tw-line);background:var(--tw-panel);color:var(--tw-ink);min-height:84px}
.tradewinds-root .tw-build-name{font-size:12px;white-space:nowrap}
.tradewinds-root .tw-cost{font-size:13px;display:flex;flex-wrap:wrap;justify-content:center;gap:1px 3px;font-weight:800}
.tradewinds-root .tw-cost-item{white-space:nowrap}
.tradewinds-root .tw-free{font-size:12px;color:var(--tw-afford);font-weight:800;text-transform:uppercase}
.tradewinds-root .tw-left{font-size:10.5px;color:var(--tw-muted);font-weight:700}
.tradewinds-root .tw-need{font-size:10.5px;color:var(--tw-bad);font-weight:800}
.tradewinds-root .tw-build.tw-afford{border-color:var(--tw-afford);background:var(--tw-afford-bg)}
.tradewinds-root .tw-build.tw-on{border-color:var(--tw-btn);box-shadow:0 0 0 2px var(--tw-btn)}
.tradewinds-root .tw-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.tradewinds-root .tw-cards .tw-empty{grid-column:1 / -1}
.tradewinds-root .tw-card{display:flex;align-items:center;gap:6px;min-width:0;min-height:48px;padding:5px 9px;border-radius:12px;border:1.5px solid var(--tw-line);background:linear-gradient(160deg,var(--tw-panel),var(--tw-chip));color:var(--tw-ink);text-align:left}
.tradewinds-root .tw-card.tw-on{border-color:var(--tw-btn);box-shadow:0 0 0 2px var(--tw-btn)}
.tradewinds-root .tw-card:disabled{opacity:.6}
.tradewinds-root .tw-card-emoji{font-size:22px}
.tradewinds-root .tw-card-body{display:flex;flex-direction:column;min-width:0}
.tradewinds-root .tw-card-body b{font-size:13px;white-space:nowrap}
.tradewinds-root .tw-card-body small{font-size:10.5px;color:var(--tw-muted);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tradewinds-root .tw-done-row{display:flex;gap:8px;margin-top:10px}
.tradewinds-root .tw-tradebtn{flex:1;height:46px;border-radius:12px;border:1.5px solid var(--tw-accent);background:transparent;color:var(--tw-accent);font-size:15px}
.tradewinds-root .tw-tradebtn.tw-on{background:var(--tw-accent);color:var(--tw-accent-ink)}
.tradewinds-root .tw-done{flex:1.3;height:46px;border-radius:12px;border:0;background:var(--tw-btn);color:var(--tw-btn-ink);font-size:16px}
.tradewinds-root .tw-done.tw-on{background:var(--tw-good);color:#fff}

/* trade drawer */
.tradewinds-root .tw-trade-grid{display:flex;flex-direction:column;gap:12px}
.tradewinds-root .tw-trade-row{display:flex;align-items:center;gap:8px;margin-top:6px}
.tradewinds-root .tw-trade-row .tw-chips,.tradewinds-root .tw-trade-row .tw-steps{flex:1;margin-top:0}
.tradewinds-root .tw-trade-label{flex:none;width:38px;font-size:12px;font-weight:800;color:var(--tw-muted)}
.tradewinds-root .tw-offer-list{list-style:none;margin:0 0 10px;padding:0;display:flex;flex-direction:column;gap:6px}
.tradewinds-root .tw-offer{border:1px solid var(--tw-line);border-radius:12px;padding:7px 9px;display:flex;flex-direction:column;gap:5px}
.tradewinds-root .tw-offer-mine{border-color:var(--tw-accent)}
.tradewinds-root .tw-offer-accepted{background:var(--tw-afford-bg)}
.tradewinds-root .tw-offer-head{display:flex;align-items:center;gap:6px;font-size:13px}
.tradewinds-root .tw-offer-head em{font-style:normal;color:var(--tw-muted);font-size:12px}
.tradewinds-root .tw-offer-terms{display:flex;align-items:center;gap:8px;font-size:16px;flex-wrap:wrap}
.tradewinds-root .tw-bundle{display:inline-flex;gap:6px;font-weight:800}
.tradewinds-root .tw-for{font-size:12px;color:var(--tw-muted);font-weight:700}
.tradewinds-root .tw-offer-acts{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.tradewinds-root .tw-offer-acts .tw-act-btn{height:36px;font-size:13px}

/* scoreboard */
.tradewinds-root .tw-scorebox{overflow-x:auto}
.tradewinds-root table.tw-scores{width:100%;border-collapse:collapse;font-size:14px}
.tradewinds-root table.tw-scores th{font-size:12px;color:var(--tw-muted);padding:4px 3px;text-align:center;font-weight:800}
.tradewinds-root table.tw-scores td{padding:6px 3px;border-top:1px solid var(--tw-line);text-align:center;vertical-align:middle}
.tradewinds-root table.tw-scores .tw-l{text-align:left}
.tradewinds-root table.tw-scores .tw-num{font-variant-numeric:tabular-nums;font-weight:700}
.tradewinds-root table.tw-scores .tw-renown{font-size:16px;color:var(--tw-accent)}
.tradewinds-root table.tw-scores tr.tw-me .tw-name{font-weight:800}
.tradewinds-root table.tw-scores tr.tw-win td{background:var(--tw-win)}
.tradewinds-root .tw-seat{display:flex;align-items:center;gap:5px;min-width:0;max-width:42vw}
.tradewinds-root .tw-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.tradewinds-root .tw-name em{font-style:normal;color:var(--tw-muted);font-weight:600;font-size:12px}
.tradewinds-root .tw-badge{flex:none;font-size:14px}
.tradewinds-root .tw-status{display:flex;flex-direction:column;align-items:center;gap:3px}
.tradewinds-root .tw-pill{display:inline-block;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:800;white-space:nowrap;background:var(--tw-chip);color:var(--tw-muted)}
.tradewinds-root .tw-pill-done{background:#dcefd9;color:#24622b}
.tradewinds-root .tw-pill-acting{background:#fff0c2;color:#7a5600}
.tradewinds-root .tw-pill-skipped{background:#f6dada;color:#8f2a22}
.tradewinds-root .tw-pill-bot{background:#e6e0f5;color:#4b3b80}
.tradewinds-root .tw-skip{height:26px;padding:0 8px;border-radius:13px;border:1px dashed var(--tw-line);background:transparent;color:var(--tw-muted);font-size:11.5px}
.tradewinds-root .tw-skip.tw-on{border-style:solid;border-color:var(--tw-accent);color:var(--tw-accent)}

/* log + help */
.tradewinds-root .tw-log-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;font-size:13px}
.tradewinds-root .tw-log-list li{display:flex;gap:7px;align-items:baseline;line-height:1.35}
.tradewinds-root .tw-help summary{cursor:pointer;font-weight:800;font-size:13.5px;color:var(--tw-accent);min-height:28px;display:flex;align-items:center}
.tradewinds-root .tw-help ul,.tradewinds-root .tw-lobby-help ul{margin:6px 0 2px;padding-left:18px;font-size:13px;line-height:1.45;display:flex;flex-direction:column;gap:5px}

/* results */
.tradewinds-root .tw-results{background:var(--tw-panel);border-radius:14px;box-shadow:var(--tw-shadow);padding:10px 12px;border:2px solid var(--tw-gold)}
.tradewinds-root .tw-banner{text-align:center;font-size:20px;font-weight:900;margin:4px 0 10px}
.tradewinds-root table.tw-scores .tw-total{font-size:16px}

/* lobby options */
.tradewinds-root .tw-options{display:flex;flex-direction:column;gap:10px;margin:4px 0 12px}
.tradewinds-root .tw-opt{display:flex;align-items:center;justify-content:space-between;gap:10px}
.tradewinds-root .tw-opt-label{display:flex;flex-direction:column;min-width:0}
.tradewinds-root .tw-opt-label b{font-size:14px}
.tradewinds-root .tw-opt-label span{font-size:12px;color:var(--muted,#6b6b6b)}
.tradewinds-root .tw-seg{flex:none;display:inline-flex;border:1px solid var(--line,#ddd);border-radius:10px;overflow:hidden}
.tradewinds-root .tw-seg button{height:34px;padding:0 10px;border:0;border-radius:0;background:var(--surface,#fff);color:var(--ink,#222);font-size:13px}
.tradewinds-root .tw-seg button+button{border-left:1px solid var(--line,#ddd)}
.tradewinds-root .tw-seg button.tw-on{background:var(--tw-accent);color:var(--tw-accent-ink)}
.tradewinds-root .tw-lobby-help{margin:10px 0 4px}
.tradewinds-root .tw-lobby-help summary{cursor:pointer;font-weight:800;color:var(--tw-accent)}
@media (max-width:420px){
  .tradewinds-root .tw-seg button{padding:0 7px;font-size:12px}
  .tradewinds-root .tw-opt-label span{font-size:11px}
  .tradewinds-root table.tw-scores{font-size:13px}
  .tradewinds-root .tw-act-btn{padding:0 11px}
}
`;

const DARK = `
html[data-theme="dark"] .tradewinds-root{
  --tw-ink:#e6efed;--tw-muted:#9aaead;--tw-panel:#18232a;--tw-line:#2e3d45;--tw-chip:#22313a;
  --tw-accent:#4fc3d1;--tw-accent-ink:#06171a;--tw-btn:#f0814f;--tw-btn-ink:#1a0d06;--tw-gold:#ffd23f;
  --tw-good:#3f9d4c;--tw-bad:#ff8a80;--tw-win:#3a3418;--tw-shadow:0 2px 12px rgba(0,0,0,.45);
  --tw-afford:#5fd08a;--tw-afford-bg:#183526;--tw-die:#efe4c8;--tw-die-ink:#1a1a1a;--tw-die-edge:#6b5f4a;
  --tw-sea:#14394a;
}
html[data-theme="dark"] .tradewinds-root .tw-pill-done{background:#22402a;color:#9fe0a8}
html[data-theme="dark"] .tradewinds-root .tw-pill-acting{background:#40361a;color:#f4d27a}
html[data-theme="dark"] .tradewinds-root .tw-pill-skipped{background:#46201e;color:#ffaaa2}
html[data-theme="dark"] .tradewinds-root .tw-pill-bot{background:#2e2946;color:#c9bdf5}
`;

export const TRADEWINDS_CSS = LIGHT + DARK;
