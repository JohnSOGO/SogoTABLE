// Bloomwork — scoped, injected-once stylesheet. Every rule is prefixed
// .bloomwork-root (classes are bw-*, never a shell class name); the first two
// rules neutralise the tic-tac-toe #macroBoard grid and the shell #turnStatus,
// and the dark block re-points the --bw-* tokens under <html data-theme="dark">.
// Art colours (flowers, pot, soil, bird) come from assets.js as CSS custom
// properties, so the SVG sprite re-themes with no re-render.
// One layout on every device: wider screens only get bigger tiles.
import { paletteCssVars } from "./assets.js";

const TOKENS_LIGHT = `--bw-bg:#f6f1e4;--bw-panel:#fffdf6;--bw-ink:#2c2a1f;--bw-muted:#6f6a58;--bw-line:#e3dac3;
  --bw-chip:#f1ebd9;--bw-accent:#2f7d4a;--bw-accent-ink:#fff;--bw-hl:#f2b315;--bw-hl-soft:rgba(242,179,21,.22);
  --bw-fit:#3aa05a;--bw-fit-soft:rgba(58,160,90,.16);--bw-bad:#b3261e;--bw-good:#2e7d32;
  --bw-slot:#ebe2cb;--bw-slot-edge:#d6c9a8;--bw-bedcell:#e6dcc3;--bw-bed:#d9caa6;
  --bw-shadow:0 2px 10px rgba(80,60,20,.12);--bw-me:#2f7d4a;--bw-wm:.26`;
const TOKENS_DARK = `--bw-bg:#151a14;--bw-panel:#1e241d;--bw-ink:#ecead9;--bw-muted:#a3a690;--bw-line:#323a2f;
  --bw-chip:#262e25;--bw-accent:#5cbf7a;--bw-accent-ink:#0f1a10;--bw-hl:#ffcd3c;--bw-hl-soft:rgba(255,205,60,.18);
  --bw-fit:#5cc475;--bw-fit-soft:rgba(92,196,117,.16);--bw-bad:#ff7a70;--bw-good:#7ed492;
  --bw-slot:#2a2f26;--bw-slot-edge:#3c4436;--bw-bedcell:#2b2a21;--bw-bed:#3b3324;
  --bw-shadow:0 2px 12px rgba(0,0,0,.4);--bw-me:#5cbf7a;--bw-wm:.3`;

export const BLOOMWORK_CSS = `
#macroBoard:has(.bloomwork-root){display:block;aspect-ratio:auto;height:auto;max-width:none}
#turnStatus:has(~ #macroBoard .bloomwork-root){display:none}
.bloomwork-root{${TOKENS_LIGHT};${paletteCssVars("light")};
  color:var(--bw-ink);font-family:"Avenir Next","Segoe UI",system-ui,sans-serif;
  width:100%;margin:0 auto;text-align:left}
html[data-theme="dark"] .bloomwork-root{${TOKENS_DARK};${paletteCssVars("dark")}}
.bloomwork-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.bloomwork-root .bw-body{display:contents}
.bloomwork-root .bw-sprite{position:absolute;width:0;height:0;overflow:hidden}
.bloomwork-root.bw-play{display:flex;flex-direction:column;gap:8px;background:var(--bw-bg);border-radius:16px;padding:8px;
  background-size:cover;background-position:center}
.bloomwork-root.bw-play button{min-height:0;width:auto;padding:0;border:0;background:none;font:inherit;color:inherit;box-shadow:none;
  border-radius:8px;cursor:pointer;transition:transform .12s ease,box-shadow .15s ease,opacity .15s ease}
.bloomwork-root.bw-play button:disabled{cursor:default;opacity:1}
.bloomwork-root.bw-play .bw-mtile:disabled{opacity:.72}
.bloomwork-root .bw-panel{background:var(--bw-panel);border-radius:14px;box-shadow:var(--bw-shadow);padding:8px}
.bloomwork-root .bw-tile{display:block;width:100%;height:100%}
.bloomwork-root .bw-tile-img{background-size:cover;background-position:center;border-radius:20%}
.bloomwork-root .bw-bird{display:block;width:100%;height:100%}

/* seat chips (scoreboard + ready status) */
.bloomwork-root .bw-seats{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:5px}
.bloomwork-root .bw-seat{display:flex;align-items:center;gap:5px;min-width:0;padding:4px 7px;border-radius:999px;background:var(--bw-panel);
  box-shadow:inset 0 0 0 1.5px var(--bw-line);font-size:12.5px;height:30px}
.bloomwork-root .bw-seat.bw-me{box-shadow:inset 0 0 0 2px var(--bw-me)}
.bloomwork-root .bw-seat-dot{width:10px;height:10px;border-radius:50%;flex:none}
.bloomwork-root .bw-seat-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
.bloomwork-root .bw-seat-score{font-weight:800;font-variant-numeric:tabular-nums}
.bloomwork-root .bw-seat-state{width:16px;text-align:center;flex:none;font-size:12px;color:var(--bw-muted)}
.bloomwork-root .bw-seat-state.bw-ok{color:var(--bw-good);font-weight:900}
.bloomwork-root .bw-seat .bw-bird{width:16px;height:16px;flex:none}

/* status + priority */
.bloomwork-root .bw-status{display:flex;flex-direction:column;gap:3px;padding:6px 10px}
.bloomwork-root .bw-status-line{display:flex;align-items:center;gap:8px;white-space:nowrap;overflow:hidden;font-size:13px;min-height:20px}
.bloomwork-root .bw-round{font-weight:800}
.bloomwork-root .bw-goal{color:var(--bw-muted);overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.bloomwork-root .bw-bag{color:var(--bw-muted);font-variant-numeric:tabular-nums}
.bloomwork-root .bw-prio{font-size:12.5px;color:var(--bw-muted)}
.bloomwork-root .bw-prio b{color:var(--bw-ink);font-weight:800;margin-right:2px}
.bloomwork-root .bw-prio-list{overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.bloomwork-root .bw-prio-n{display:inline-grid;place-items:center;width:15px;height:15px;border-radius:50%;background:var(--bw-chip);
  font-size:10px;font-weight:800;color:var(--bw-ink);margin-right:2px;vertical-align:1px}
.bloomwork-root .bw-prio-me{color:var(--bw-ink);font-weight:800}

/* market */
.bloomwork-root .bw-market{display:flex;flex-direction:column;gap:8px;container-type:inline-size}
.bloomwork-root .bw-stalls{display:grid;grid-template-columns:repeat(auto-fill,minmax(max(70px,calc(20cqi - 8px)),1fr));gap:6px}
.bloomwork-root .bw-stall{position:relative;aspect-ratio:1;max-width:104px;width:100%;justify-self:center}
.bloomwork-root .bw-pot{position:absolute;inset:0;width:100%;height:100%}
.bloomwork-root .bw-stall-tiles{position:absolute;inset:19%;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:6%}
.bloomwork-root .bw-stall-n{position:absolute;left:0;top:0;font-size:10px;font-weight:800;color:var(--bw-muted);background:var(--bw-panel);
  border-radius:999px;padding:0 5px;line-height:15px;box-shadow:inset 0 0 0 1px var(--bw-line)}
.bloomwork-root .bw-stall.bw-empty .bw-pot{opacity:.45}
.bloomwork-root .bw-mtile{display:block;width:100%;height:100%;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.28))}
.bloomwork-root .bw-mtile:not(:disabled):hover{transform:translateY(-1px)}
.bloomwork-root .bw-mtile.bw-sel{transform:translateY(-3px) scale(1.06);filter:drop-shadow(0 0 0 var(--bw-hl)) drop-shadow(0 0 4px var(--bw-hl))}
.bloomwork-root .bw-mtile.bw-sel .bw-tile{outline:3px solid var(--bw-hl);outline-offset:1px;border-radius:22%}
.bloomwork-root .bw-mtile.bw-dim{opacity:.45}
.bloomwork-root .bw-mtile.bw-mine .bw-tile{outline:2.5px dashed var(--bw-me);outline-offset:1px;border-radius:22%}
.bloomwork-root .bw-square{display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-height:52px;padding:6px 8px;border-radius:12px;
  background:repeating-linear-gradient(90deg,transparent 0 34px,color-mix(in srgb,var(--bw-stoneDark) 70%,transparent) 34px 35.5px),repeating-linear-gradient(0deg,transparent 0 22px,color-mix(in srgb,var(--bw-stoneDark) 70%,transparent) 22px 23.5px),var(--bw-stone);
  box-shadow:inset 0 0 0 1.5px var(--bw-stoneDark)}
.bloomwork-root .bw-square-label{font-size:12px;font-weight:800;color:var(--bw-ink);background:var(--bw-panel);padding:2px 8px;border-radius:999px;
  box-shadow:inset 0 0 0 1px var(--bw-line)}
.bloomwork-root .bw-square-empty{font-size:12px;color:var(--bw-muted);font-style:italic}
.bloomwork-root .bw-sq{position:relative;width:38px;height:38px}
.bloomwork-root .bw-sq-n{position:absolute;right:-5px;bottom:-5px;min-width:18px;height:18px;border-radius:999px;background:var(--bw-ink);color:var(--bw-panel);
  font-size:11px;font-weight:800;display:grid;place-items:center;padding:0 4px;pointer-events:none}
.bloomwork-root .bw-sq-bird{width:34px;height:34px;margin-left:auto}

/* hint / toast line: fixed height so controls never jump */
.bloomwork-root .bw-hint{display:flex;align-items:center;gap:8px;min-height:38px;padding:4px 10px;border-radius:12px;background:var(--bw-chip);font-size:13.5px;line-height:1.25}
.bloomwork-root .bw-hint-text{flex:1;min-width:0}
.bloomwork-root .bw-hint.bw-err{background:color-mix(in srgb,var(--bw-bad) 14%,var(--bw-panel));color:var(--bw-bad);font-weight:700}
.bloomwork-root .bw-hint.bw-locked{background:var(--bw-fit-soft)}
.bloomwork-root .bw-hint .bw-clear{padding:5px 10px;border-radius:999px;background:var(--bw-panel);box-shadow:inset 0 0 0 1px var(--bw-line);font-size:12.5px;font-weight:700}
.bloomwork-root .bw-hint .bw-clear:disabled{visibility:hidden}

/* my board */
.bloomwork-root .bw-board{container-type:inline-size}
.bloomwork-root .bw-board-head{display:flex;align-items:baseline;gap:8px;padding:0 2px 6px;font-size:13px}
.bloomwork-root .bw-board-head b{font-size:15px}
.bloomwork-root .bw-board-head .bw-pts{margin-left:auto;font-weight:800;font-size:15px;font-variant-numeric:tabular-nums}
.bloomwork-root .bw-grid{--t:min(46px,calc((100cqi - 34px) / 10.5));--g:3px;display:grid;
  grid-template-columns:repeat(5,var(--t)) calc(var(--t) * .5) repeat(5,var(--t));gap:var(--g);justify-content:center}
.bloomwork-root .bw-prow{display:flex;gap:var(--g);justify-content:flex-end;position:relative;border-radius:9px;padding:0}
.bloomwork-root .bw-slot{width:var(--t);height:var(--t);border-radius:22%;background:var(--bw-slot);box-shadow:inset 0 0 0 1.5px var(--bw-slot-edge);position:relative}
.bloomwork-root .bw-slot .bw-tile{position:absolute;inset:0}
.bloomwork-root .bw-arrow{display:grid;place-items:center;color:var(--bw-muted);font-size:calc(var(--t) * .42);font-weight:800}
.bloomwork-root .bw-cell{width:var(--t);height:var(--t);border-radius:22%;background:var(--bw-bedcell);position:relative}
.bloomwork-root .bw-cell .bw-tile{position:absolute;inset:0}
.bloomwork-root .bw-wm{opacity:var(--bw-wm);filter:saturate(.55)}
.bloomwork-root .bw-bedwrap{grid-column:7 / 12;grid-row:1 / 6;border-radius:12px;background:var(--bw-bed);margin:-3px;z-index:0}
.bloomwork-root .bw-cell,.bloomwork-root .bw-prow,.bloomwork-root .bw-arrow{z-index:1}
.bloomwork-root .bw-ghost{opacity:.5}
.bloomwork-root .bw-ghost-pick{opacity:.65;animation:bw-breathe 1.6s ease-in-out infinite}
.bloomwork-root .bw-badge{position:absolute;z-index:3;min-width:20px;height:18px;padding:0 5px;border-radius:999px;font-size:11px;font-weight:800;
  display:grid;place-items:center;pointer-events:none;white-space:nowrap}
.bloomwork-root .bw-badge-pts{right:-4px;top:-6px;background:var(--bw-good);color:#fff}
.bloomwork-root .bw-badge-spill{left:-6px;top:-7px;background:var(--bw-bad);color:#fff}
.bloomwork-root .bw-target .bw-prow:not(:disabled){box-shadow:0 0 0 2px var(--bw-slot-edge)}
.bloomwork-root .bw-target .bw-prow.bw-fit{box-shadow:0 0 0 3px var(--bw-fit),0 0 12px var(--bw-fit);background:var(--bw-fit-soft)}
.bloomwork-root .bw-target .bw-prow.bw-nofit{opacity:.5}
.bloomwork-root .bw-prow.bw-picked,.bloomwork-root .bw-compost.bw-picked{outline:2.5px dashed var(--bw-me);outline-offset:2px}
.bloomwork-root .bw-prow:disabled{opacity:1}

/* compost heap */
.bloomwork-root .bw-compost,.bloomwork-root.bw-play .bw-compost{display:flex;align-items:center;gap:8px;width:100%;margin-top:8px;padding:5px 6px;border-radius:12px;
  background:color-mix(in srgb,var(--bw-soil) 22%,var(--bw-panel));position:relative}
.bloomwork-root .bw-compost-label{font-size:12px;font-weight:800;width:62px;flex:none;line-height:1.25;text-align:left}
.bloomwork-root .bw-compost-label small{display:block;font-weight:700;color:var(--bw-muted);font-variant-numeric:tabular-nums;line-height:1.25;margin-top:2px}
.bloomwork-root .bw-heap{flex:1;display:grid;grid-template-columns:repeat(7,1fr);gap:3px;max-width:calc(7 * 44px)}
.bloomwork-root .bw-hslot{display:flex;flex-direction:column;align-items:center;gap:1px}
.bloomwork-root .bw-hslot i{display:block;width:100%;aspect-ratio:1;border-radius:22%;background:var(--bw-slot);box-shadow:inset 0 0 0 1.5px var(--bw-slot-edge);position:relative;max-width:40px}
.bloomwork-root .bw-hslot i .bw-tile,.bloomwork-root .bw-hslot i .bw-bird{position:absolute;inset:0}
.bloomwork-root .bw-hslot small{font-size:10.5px;font-weight:800;color:var(--bw-bad);font-variant-numeric:tabular-nums}
.bloomwork-root .bw-target .bw-compost{box-shadow:0 0 0 2px var(--bw-slot-edge)}
.bloomwork-root .bw-target.bw-helps .bw-compost{box-shadow:0 0 0 2.5px var(--bw-hl)}

/* opponents */
.bloomwork-root .bw-opps{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:6px}
.bloomwork-root .bw-opp{padding:6px;container-type:inline-size}
.bloomwork-root .bw-opp-head{display:flex;align-items:center;gap:5px;font-size:12.5px;margin-bottom:5px;min-height:24px}
.bloomwork-root .bw-opp-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
.bloomwork-root .bw-opp-head .bw-seat-score{font-size:13px}
.bloomwork-root .bw-skip{padding:2px 7px !important;border-radius:999px !important;font-size:11.5px;font-weight:800;
  background:var(--bw-chip) !important;box-shadow:inset 0 0 0 1px var(--bw-line) !important;white-space:nowrap}
.bloomwork-root .bw-skip.bw-on{background:var(--bw-hl-soft) !important;box-shadow:inset 0 0 0 1.5px var(--bw-hl) !important}
.bloomwork-root .bw-skip.bw-off{visibility:hidden}
.bloomwork-root .bw-mini{--t:min(20px,calc((100cqi - 24px) / 10.5));--g:2px}
.bloomwork-root .bw-mini .bw-slot,.bloomwork-root .bw-mini .bw-cell{border-radius:24%}
.bloomwork-root .bw-mini .bw-bedwrap{margin:-2px;border-radius:7px}
.bloomwork-root .bw-mini-foot{display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:var(--bw-muted);margin-top:5px;gap:4px;min-height:22px}
.bloomwork-root .bw-mini-heap{display:flex;gap:2px;align-items:center}
.bloomwork-root .bw-mini-heap i{display:block;width:12px;height:12px;border-radius:3px;background:var(--bw-slot);position:relative}
.bloomwork-root .bw-mini-heap i .bw-tile,.bloomwork-root .bw-mini-heap i .bw-bird{position:absolute;inset:0}
.bloomwork-root .bw-mini-heap b{color:var(--bw-bad);margin-left:3px}

/* last-pick log */
.bloomwork-root .bw-log h4{margin:0 0 4px;font-size:12.5px;color:var(--bw-muted);text-transform:uppercase;letter-spacing:.04em}
.bloomwork-root .bw-log ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;font-size:13px}
.bloomwork-root .bw-log li{display:flex;align-items:center;gap:6px;line-height:1.3}
.bloomwork-root .bw-log li .bw-tile{width:18px;height:18px;flex:none}
.bloomwork-root .bw-log li.bw-bad{color:var(--bw-bad)}
.bloomwork-root .bw-log li.bw-mine{font-weight:700}

/* round review + results */
.bloomwork-root .bw-review h3,.bloomwork-root .bw-results h3{margin:2px 2px 8px;font-size:17px}
.bloomwork-root .bw-rtable{display:flex;flex-direction:column;gap:5px}
.bloomwork-root .bw-rrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;align-items:center;padding:6px 8px;border-radius:10px;background:var(--bw-chip)}
.bloomwork-root .bw-rrow.bw-me{box-shadow:inset 0 0 0 2px var(--bw-me)}
.bloomwork-root .bw-rname{font-weight:800;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bloomwork-root .bw-rscore{font-weight:800;font-size:14px;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.bloomwork-root .bw-rscore small{font-weight:700;color:var(--bw-muted);font-size:12px;margin-right:4px}
.bloomwork-root .bw-rdetail{grid-column:1 / -1;display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:12.5px;color:var(--bw-muted)}
.bloomwork-root .bw-rplant{display:inline-flex;align-items:center;gap:2px;font-weight:800;color:var(--bw-good)}
.bloomwork-root .bw-rplant .bw-tile{width:20px;height:20px}
.bloomwork-root .bw-rpen{font-weight:800;color:var(--bw-bad)}
.bloomwork-root .bw-next{display:flex;align-items:center;gap:10px;margin-top:10px}
.bloomwork-root.bw-play .bw-next-btn{padding:10px 20px;min-height:44px;border-radius:12px;background:var(--bw-accent);color:var(--bw-accent-ink);font-weight:800;font-size:15px;
  box-shadow:0 3px 10px rgba(47,125,74,.3)}
.bloomwork-root.bw-play .bw-next-btn:disabled{opacity:.5;box-shadow:none}
.bloomwork-root .bw-next span{font-size:13px;color:var(--bw-muted);flex:1;min-width:0}
.bloomwork-root .bw-banner{display:flex;align-items:center;gap:10px;padding:10px;border-radius:12px;background:var(--bw-hl-soft);margin-bottom:8px;font-weight:800;font-size:16px}
.bloomwork-root .bw-banner .bw-tile{width:40px;height:40px;flex:none}
.bloomwork-root .bw-place{display:inline-grid;place-items:center;min-width:30px;height:22px;border-radius:999px;background:var(--bw-panel);font-size:11.5px;font-weight:800;margin-right:6px}
.bloomwork-root .bw-rrow.bw-first .bw-place{background:var(--bw-hl);color:#2a1d00}
.bloomwork-root .bw-results-note{font-size:12.5px;color:var(--bw-muted);margin:8px 2px 0}

/* animation: pop when tiles land, bloom when a flower is planted */
.bloomwork-root .bw-pop{animation:bw-pop .42s cubic-bezier(.2,.8,.3,1.3) both}
.bloomwork-root .bw-bloom{animation:bw-bloom .9s cubic-bezier(.2,.8,.3,1.2) both}
.bloomwork-root .bw-cell.bw-bloomcell::after{content:"";position:absolute;inset:-4px;border-radius:30%;box-shadow:0 0 14px 4px var(--bw-hl);
  animation:bw-glow 1.6s ease-out both;pointer-events:none}
@keyframes bw-pop{0%{transform:scale(.2) rotate(-25deg);opacity:0}70%{transform:scale(1.12) rotate(4deg);opacity:1}100%{transform:none}}
@keyframes bw-bloom{0%{transform:scale(.1) rotate(-90deg);opacity:0}60%{transform:scale(1.2) rotate(8deg);opacity:1}100%{transform:none}}
@keyframes bw-glow{0%{opacity:1}100%{opacity:0}}
@keyframes bw-breathe{0%,100%{opacity:.4}50%{opacity:.75}}
@media (prefers-reduced-motion: reduce){
  .bloomwork-root .bw-pop,.bloomwork-root .bw-bloom,.bloomwork-root .bw-ghost-pick,.bloomwork-root .bw-cell.bw-bloomcell::after{animation:none}
  .bloomwork-root.bw-play button{transition:none}
}

/* lobby options (inside the shared host-start template) */
.bloomwork-root .bw-options{display:flex;flex-direction:column;gap:10px;margin:4px 0 12px}
.bloomwork-root .bw-opt{display:flex;align-items:center;justify-content:space-between;gap:10px}
.bloomwork-root .bw-opt-label{display:flex;flex-direction:column;min-width:0}
.bloomwork-root .bw-opt-label b{font-size:14px}
.bloomwork-root .bw-opt-label span{font-size:12px;color:var(--muted,#6b6b6b)}
.bloomwork-root .bw-seg{display:flex;flex:none;border-radius:999px;overflow:hidden;box-shadow:inset 0 0 0 1px var(--line,#ddd)}
.bloomwork-root .bw-seg button{min-height:36px;width:auto;padding:0 12px;border:0;border-radius:0;background:transparent;color:inherit;font-size:13px;box-shadow:none}
.bloomwork-root .bw-seg button.bw-on{background:var(--bw-accent);color:var(--bw-accent-ink)}
`;
