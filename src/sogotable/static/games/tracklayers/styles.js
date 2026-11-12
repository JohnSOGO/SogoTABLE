// Tracklayers — scoped, injected-once stylesheet. Every rule is prefixed
// .tracklayers-root (classes are tl-*, never a shell class name), the first two
// rules neutralise the tic-tac-toe #macroBoard grid and the shell #turnStatus,
// and the dark block re-points the --tl-* tokens under <html data-theme="dark">.
// Buttons reset the shell's global `button{min-height:44px;…}` props they use.
// Map and card colours come from assets.js (the palette), not from here.
const LIGHT = `
#macroBoard:has(.tracklayers-root){display:block;aspect-ratio:auto;height:auto;max-width:none}
#turnStatus:has(~ #macroBoard .tracklayers-root){display:none}
.tracklayers-root{
  --tl-ink:#23201a;--tl-muted:#6f6758;--tl-panel:#fffdf7;--tl-line:#e4dccb;--tl-chip:#f2ecdf;
  --tl-accent:#c0471f;--tl-accent-ink:#fff;--tl-btn:#1f6a5a;--tl-btn-ink:#fff;--tl-btn2:#efe7d6;--tl-btn2-ink:#2c261c;
  --tl-sel:#ffcf33;--tl-good:#2e7d32;--tl-bad:#b3261e;--tl-win:#fff1bf;--tl-final:#ffe2a8;--tl-final-ink:#5a3300;
  --tl-shadow:0 2px 10px rgba(60,45,20,.13);
  color:var(--tl-ink);font-family:"Avenir Next","Segoe UI",system-ui,sans-serif;
  width:100%;max-width:1240px;margin:0 auto;display:flex;flex-direction:column;gap:8px;text-align:left;
}
.tracklayers-root [hidden]{display:none !important}
.tracklayers-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.tracklayers-root button{min-height:0;width:auto;font:inherit;font-weight:700;cursor:pointer;box-shadow:none;margin:0}
.tracklayers-root button:disabled{cursor:not-allowed;opacity:.45}
.tracklayers-root .tl-panel,.tracklayers-root .tl-strip,.tracklayers-root .tl-sec,.tracklayers-root .tl-picker{background:var(--tl-panel);border-radius:14px;box-shadow:var(--tl-shadow)}
.tracklayers-root .tl-hint{color:var(--tl-muted);font-size:12px;font-weight:600}
.tracklayers-root .tl-meta{color:var(--tl-muted);font-weight:700;font-size:12.5px;white-space:nowrap;font-variant-numeric:tabular-nums}

/* strip */
.tracklayers-root .tl-strip{padding:7px 10px;display:flex;flex-direction:column;gap:5px}
.tracklayers-root .tl-strip-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.tracklayers-root .tl-round{font-weight:800;font-size:15px}
.tracklayers-root .tl-mytrains{margin-left:auto;color:var(--tl-ink)}
.tracklayers-root .tl-final{background:var(--tl-final);color:var(--tl-final-ink);font-weight:800;border-radius:10px;padding:5px 10px;text-align:center;font-size:14px}
.tracklayers-root .tl-prios{display:flex;align-items:center;gap:5px;overflow-x:auto;scrollbar-width:none;white-space:nowrap}
.tracklayers-root .tl-prio-label{font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--tl-muted);font-weight:800;margin-right:2px}
.tracklayers-root .tl-prio{flex:none;display:inline-flex;align-items:center;gap:4px;padding:2px 8px 2px 6px;border-radius:12px;background:var(--tl-chip);font-size:12px;font-weight:700;max-width:130px;overflow:hidden;text-overflow:ellipsis}
.tracklayers-root .tl-prio.tl-me{outline:2px solid var(--tl-accent)}
.tracklayers-root .tl-stateline{font-size:13.5px;min-height:20px;font-weight:600}
.tracklayers-root .tl-flash-error{color:var(--tl-bad);font-weight:800}
.tracklayers-root .tl-flash-info{color:var(--tl-accent);font-weight:800}
.tracklayers-root .tl-swatch{flex:none;display:inline-block;width:11px;height:11px;border-radius:50%;box-shadow:0 0 0 1.5px rgba(0,0,0,.25)}

/* layout */
.tracklayers-root .tl-main{display:flex;flex-direction:column;gap:8px}
.tracklayers-root .tl-mapcol,.tracklayers-root .tl-side{display:flex;flex-direction:column;gap:8px;min-width:0}
@media (min-width:960px){
  .tracklayers-root .tl-main{display:grid;grid-template-columns:minmax(0,1fr) 390px;align-items:start}
  .tracklayers-root .tl-mapcol{position:sticky;top:8px}
}

/* map */
.tracklayers-root .tl-mapwrap{position:relative}
.tracklayers-root .tl-viewport{overflow:auto;border-radius:14px;box-shadow:inset 0 0 0 1px var(--tl-line),var(--tl-shadow);overscroll-behavior:contain;cursor:pointer;-webkit-overflow-scrolling:touch}
.tracklayers-root .tl-viewport.tl-zoomed{max-height:min(66vh,620px)}
.tracklayers-root .tl-mapinner{width:100%}
.tracklayers-root .tl-viewport.tl-zoomed .tl-mapinner{width:240%}
@media (min-width:700px){.tracklayers-root .tl-viewport.tl-zoomed .tl-mapinner{width:160%}}
.tracklayers-root svg.tl-map{display:block;width:100%;height:auto;user-select:none;-webkit-user-select:none}
.tracklayers-root svg.tl-map text{pointer-events:none;font-weight:700;font-family:inherit}
.tracklayers-root .tl-halo-afford{opacity:.45;animation:tl-pulse 1.8s ease-in-out infinite}
.tracklayers-root .tl-halo-path{opacity:.9}
.tracklayers-root .tl-halo-sel{opacity:.95}
.tracklayers-root .tl-ticket-ring{animation:tl-pulse 2.2s ease-in-out infinite}
@keyframes tl-pulse{0%,100%{opacity:.85}50%{opacity:.3}}
@media (prefers-reduced-motion:reduce){.tracklayers-root .tl-halo-afford,.tracklayers-root .tl-ticket-ring{animation:none}}
.tracklayers-root .tl-zoom{position:absolute;top:8px;right:8px;width:40px;height:40px;padding:0;border-radius:50%;border:1px solid var(--tl-line);
  background:var(--tl-panel);color:var(--tl-ink);font-size:18px;line-height:1;opacity:.94;box-shadow:var(--tl-shadow)}
.tracklayers-root .tl-helps{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.tracklayers-root .tl-help-label{font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--tl-muted);font-weight:800}
.tracklayers-root .tl-help{height:32px;padding:0 11px;border-radius:16px;border:1px solid var(--tl-line);background:var(--tl-panel);color:var(--tl-muted);font-size:12px}
.tracklayers-root .tl-help.tl-on{background:var(--tl-chip);color:var(--tl-ink);border-color:var(--tl-btn)}

/* cards */
.tracklayers-root .tl-card{position:relative;display:inline-flex;align-items:center;gap:4px;min-height:34px;padding:0 9px;border-radius:8px;
  background:var(--tl-card);color:var(--tl-card-ink);border:2px solid rgba(0,0,0,.16);font-size:12.5px;font-weight:800;white-space:nowrap;overflow:hidden}
.tracklayers-root .tl-card-white{border-color:rgba(0,0,0,.28)}
.tracklayers-root .tl-card-wild{background:linear-gradient(135deg,#ffd166,#ff9f1c 45%,#ef476f 75%,#7b5cff)}
.tracklayers-root .tl-card-back{background:repeating-linear-gradient(45deg,#3c5a75 0 6px,#33506a 6px 12px);color:#fff}
.tracklayers-root .tl-card-art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.9}
.tracklayers-root .tl-card-name,.tracklayers-root .tl-card-n,.tracklayers-root .tl-card-icon{position:relative}
.tracklayers-root .tl-card-n{font-variant-numeric:tabular-nums}
.tracklayers-root .tl-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:6px}
.tracklayers-root .tl-cards .tl-card{justify-content:space-between;min-height:38px}
.tracklayers-root .tl-cards .tl-card-n{font-size:16px}
.tracklayers-root .tl-cards .tl-zero{opacity:.38}

/* sections */
.tracklayers-root .tl-actions{display:flex;flex-direction:column;gap:8px}
.tracklayers-root .tl-sec{padding:9px 10px;display:flex;flex-direction:column;gap:8px}
.tracklayers-root .tl-sec-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.tracklayers-root .tl-sec-head b{font-size:14px}
.tracklayers-root .tl-btn{height:46px;padding:0 16px;border-radius:12px;border:1px solid transparent;font-size:15px}
.tracklayers-root .tl-wide{width:100%}
.tracklayers-root .tl-primary{background:var(--tl-btn);color:var(--tl-btn-ink)}
.tracklayers-root .tl-secondary{background:var(--tl-btn2);color:var(--tl-btn2-ink);border-color:var(--tl-line)}
.tracklayers-root .tl-committed{background:var(--tl-chip);border:1px dashed var(--tl-btn);border-radius:12px;padding:8px 10px;font-weight:700;font-size:13.5px}
.tracklayers-root .tl-market{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}
.tracklayers-root .tl-mkt{position:relative;padding:0;border:0;border-radius:10px;background:transparent;height:62px}
.tracklayers-root .tl-mkt .tl-card{width:100%;height:100%;flex-direction:column;justify-content:center;gap:1px;padding:0 3px;font-size:11.5px}
.tracklayers-root .tl-mkt .tl-card-icon{font-size:16px;line-height:1}
.tracklayers-root .tl-mkt .tl-card-n{font-size:10.5px;font-weight:700;opacity:.9}
.tracklayers-root .tl-mkt.tl-on .tl-card{outline:3px solid var(--tl-sel);outline-offset:2px;transform:translateY(-2px)}
.tracklayers-root .tl-pickno{position:absolute;top:-6px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:var(--tl-ink);color:var(--tl-panel);font-size:11.5px;display:grid;place-items:center;padding:0 4px}
.tracklayers-root .tl-claim-empty{margin:0;padding:6px 0}
.tracklayers-root .tl-route-card{display:flex;flex-direction:column;gap:6px}
.tracklayers-root .tl-route-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tracklayers-root .tl-route-name{font-size:14.5px}
.tracklayers-root .tl-route-pts{color:var(--tl-good);font-weight:800;font-size:13px}
.tracklayers-root .tl-x{margin-left:auto;width:34px;height:34px;border-radius:50%;border:1px solid var(--tl-line);background:var(--tl-chip);color:var(--tl-ink);padding:0}
.tracklayers-root .tl-blocker{margin:0;color:var(--tl-bad);font-weight:700;font-size:13px}
.tracklayers-root .tl-paylabel{font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--tl-muted);font-weight:800}
.tracklayers-root .tl-pays{display:flex;flex-wrap:wrap;gap:6px}
.tracklayers-root .tl-pay{padding:0;border:0;background:transparent;border-radius:10px}
.tracklayers-root .tl-pay .tl-card{min-height:40px}
.tracklayers-root .tl-pay.tl-on .tl-card{outline:3px solid var(--tl-sel);outline-offset:2px}

/* tickets */
.tracklayers-root .tl-ticket-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}
.tracklayers-root .tl-ticket{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:10px;background:var(--tl-chip);border:1px solid var(--tl-line);font-size:13px}
.tracklayers-root .tl-ticket-route{flex:1;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tracklayers-root .tl-ticket-pts{flex:none;min-width:30px;height:24px;border-radius:12px;background:var(--tl-ink);color:var(--tl-panel);font-weight:800;font-size:12.5px;display:grid;place-items:center}
.tracklayers-root .tl-prog{flex:none;font-size:10.5px;font-weight:800;text-transform:uppercase;padding:2px 7px;border-radius:9px;background:#fff0c2;color:#7a5600}
.tracklayers-root .tl-prog-done{background:#dcefd9;color:#24622b}
.tracklayers-root .tl-ticket.tl-done .tl-ticket-route{text-decoration:line-through;text-decoration-color:rgba(46,125,50,.6)}
.tracklayers-root .tl-picker{padding:12px;display:flex;flex-direction:column;gap:9px;border:2px solid var(--tl-accent)}
.tracklayers-root .tl-picker h3{margin:0;font-size:17px}
.tracklayers-root .tl-picker p{margin:0}
.tracklayers-root .tl-picker-list{display:flex;flex-direction:column;gap:6px}
.tracklayers-root button.tl-pick{min-height:50px;width:100%;text-align:left;color:var(--tl-ink);font-size:14px}
.tracklayers-root button.tl-pick.tl-on{border-color:var(--tl-btn);background:var(--tl-panel);box-shadow:inset 0 0 0 2px var(--tl-btn)}
.tracklayers-root .tl-check{flex:none;width:24px;height:24px;border-radius:7px;border:2px solid var(--tl-line);display:grid;place-items:center;font-size:14px;color:var(--tl-btn-ink);background:var(--tl-panel)}
.tracklayers-root .tl-pick.tl-on .tl-check{background:var(--tl-btn);border-color:var(--tl-btn)}

/* table + log + results */
.tracklayers-root .tl-table,.tracklayers-root .tl-results,.tracklayers-root .tl-logbox,.tracklayers-root .tl-hand-host{padding:7px 10px;overflow-x:auto}
.tracklayers-root .tl-hand-host{display:flex;flex-direction:column;gap:4px;padding:0;background:transparent;box-shadow:none}
.tracklayers-root table.tl-scores{width:100%;border-collapse:collapse;font-size:13.5px}
.tracklayers-root table.tl-scores th{font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--tl-muted);padding:5px 4px;text-align:center;font-weight:800}
.tracklayers-root table.tl-scores td{padding:6px 4px;border-top:1px solid var(--tl-line);text-align:center;vertical-align:middle}
.tracklayers-root table.tl-scores .tl-l{text-align:left}
.tracklayers-root table.tl-scores .tl-num{font-variant-numeric:tabular-nums;font-weight:700}
.tracklayers-root table.tl-scores tr.tl-me .tl-name{font-weight:800}
.tracklayers-root table.tl-scores tr.tl-win td{background:var(--tl-win)}
.tracklayers-root .tl-seat{display:flex;align-items:center;gap:6px;min-width:0;max-width:40vw}
.tracklayers-root .tl-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.tracklayers-root .tl-name em{font-style:normal;color:var(--tl-muted);font-weight:600;font-size:11.5px}
.tracklayers-root .tl-status{display:flex;flex-direction:column;align-items:center;gap:3px}
.tracklayers-root .tl-pill{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:800;white-space:nowrap;background:var(--tl-chip);color:var(--tl-muted)}
.tracklayers-root .tl-pill-ready{background:#dcefd9;color:#24622b}
.tracklayers-root .tl-pill-waiting{background:#fff0c2;color:#7a5600}
.tracklayers-root .tl-pill-tickets{background:#e6e0f5;color:#4b3b80}
.tracklayers-root .tl-pill-skipped{background:#f6dada;color:#8f2a22}
.tracklayers-root .tl-skip{height:32px;padding:0 10px;border-radius:16px;border:1px dashed var(--tl-line);background:transparent;color:var(--tl-muted);font-size:12px}
.tracklayers-root .tl-skip.tl-on{border-style:solid;border-color:var(--tl-accent);color:var(--tl-accent)}
.tracklayers-root .tl-log{list-style:none;margin:4px 0 2px;padding:0;display:flex;flex-direction:column;gap:3px;font-size:12.5px;max-height:180px;overflow-y:auto}
.tracklayers-root .tl-log li{display:flex;gap:6px;align-items:flex-start}
.tracklayers-root .tl-ev-icon{flex:none;width:18px;text-align:center}
.tracklayers-root .tl-results-title{margin:6px 0 2px;text-align:center;font-size:18px}
.tracklayers-root .tl-winner{margin:0 0 6px;text-align:center;font-weight:800;color:var(--tl-accent)}
.tracklayers-root table.tl-res td{vertical-align:top}
.tracklayers-root .tl-total{font-size:17px}
.tracklayers-root .tl-sub{font-size:10.5px;color:var(--tl-muted);font-weight:700;white-space:nowrap}
.tracklayers-root .tl-bonus{color:var(--tl-good)}
.tracklayers-root .tl-res-tix{list-style:none;margin:0;padding:0 0 0 17px;font-size:12px;display:flex;flex-wrap:wrap;gap:2px 14px}
.tracklayers-root table.tl-scores tr.tl-res-tixrow td{border-top:0;padding-top:0;text-align:left}
.tracklayers-root .tl-res-tix .tl-hit{color:var(--tl-good)}
.tracklayers-root .tl-res-tix .tl-miss{color:var(--tl-bad)}

/* lobby */
.tracklayers-root .tl-options{display:flex;flex-direction:column;gap:10px;margin:4px 0 12px}
.tracklayers-root .tl-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.tracklayers-root .tl-opt-label{display:flex;flex-direction:column;min-width:0}
.tracklayers-root .tl-opt-label b{font-size:14px}
.tracklayers-root .tl-opt-label span{font-size:12px;color:var(--muted,#6b6b6b)}
.tracklayers-root .tl-seg{flex:none;display:inline-flex;border:1px solid var(--line,#ddd);border-radius:10px;overflow:hidden}
.tracklayers-root .tl-seg button{height:38px;padding:0 10px;border:0;border-radius:0;background:var(--surface,#fff);color:var(--ink,#222);font-size:13px}
.tracklayers-root .tl-seg button+button{border-left:1px solid var(--line,#ddd)}
.tracklayers-root .tl-seg button.tl-on{background:var(--tl-btn);color:var(--tl-btn-ink)}
@media (max-width:420px){
  .tracklayers-root table.tl-scores{font-size:12.5px}
  .tracklayers-root .tl-seg button{padding:0 8px;font-size:12px}
}
`;

const DARK = `
:root[data-theme="dark"] .tracklayers-root{
  --tl-ink:#ece6d8;--tl-muted:#a39b8b;--tl-panel:#1d2427;--tl-line:#344047;--tl-chip:#273136;
  --tl-accent:#f08a5d;--tl-accent-ink:#1a0f08;--tl-btn:#3fa58c;--tl-btn-ink:#0b1512;--tl-btn2:#2a3439;--tl-btn2-ink:#ece6d8;
  --tl-sel:#ffd84a;--tl-good:#7fd08a;--tl-bad:#ff8a80;--tl-win:#3a3418;--tl-final:#4a3412;--tl-final-ink:#ffd9a0;
  --tl-shadow:0 2px 12px rgba(0,0,0,.45);
}
:root[data-theme="dark"] .tracklayers-root .tl-card{border-color:rgba(255,255,255,.14)}
:root[data-theme="dark"] .tracklayers-root .tl-pill-waiting,:root[data-theme="dark"] .tracklayers-root .tl-prog{background:#40361a;color:#f4d27a}
:root[data-theme="dark"] .tracklayers-root .tl-pill-ready,:root[data-theme="dark"] .tracklayers-root .tl-prog-done{background:#22402a;color:#9fe0a8}
:root[data-theme="dark"] .tracklayers-root .tl-pill-tickets{background:#2e2946;color:#c9bdf5}
:root[data-theme="dark"] .tracklayers-root .tl-pill-skipped{background:#46201e;color:#ffaaa2}
`;

export const TRACKLAYERS_CSS = LIGHT + DARK;
