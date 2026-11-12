// Reefkeepers — scoped, injected-once stylesheet. Every rule is prefixed
// .reefkeepers-root (classes are rk-*, never a shell class name), the first two
// rules neutralise the tic-tac-toe #macroBoard grid and the shell #turnStatus,
// and the dark block re-points the --rk-* tokens under <html data-theme="dark">.
// The tokens are generated from assets.js (one palette for chrome AND the SVG
// art), so a re-skin is a hex edit there. Buttons reset the shell's global
// `button{min-height:44px;…}` props they use.
import { ASSETS } from "./assets.js";

const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const tokens = (pal) => Object.entries(pal).map(([k, val]) => `--rk-${kebab(k)}:${val};`).join("");

const BASE = `
#macroBoard:has(.reefkeepers-root){display:block;aspect-ratio:auto;height:auto;max-width:none;background:transparent;box-shadow:none;border:0;padding:0}
#turnStatus:has(~ #macroBoard .reefkeepers-root){display:none}
.reefkeepers-root{${tokens(ASSETS.palette.light)}
  --rk-shadow:0 2px 10px rgba(15,60,70,.12);
  color:var(--rk-ink);font-family:"Avenir Next","Segoe UI",system-ui,sans-serif;
  width:100%;max-width:1120px;margin:0 auto;text-align:left;min-width:0}
html[data-theme="dark"] .reefkeepers-root{${tokens(ASSETS.palette.dark)}--rk-shadow:0 2px 12px rgba(0,0,0,.45)}
.reefkeepers-root [hidden]{display:none !important}
.reefkeepers-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.reefkeepers-root button{min-height:0;width:auto;font:inherit;font-weight:700;cursor:pointer;box-shadow:none;margin:0}
.reefkeepers-root button:disabled{cursor:not-allowed}
.reefkeepers-root svg.rk-defs{position:absolute;width:0;height:0;overflow:hidden}
.reefkeepers-root h3{margin:0 0 8px;font-size:15px;font-weight:800;display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--rk-ink)}
.reefkeepers-root h3 small{font-weight:600;color:var(--rk-muted);font-size:12px}
.reefkeepers-root .rk-note{margin:6px 0 0;font-size:12.5px;color:var(--rk-muted)}
.reefkeepers-root .rk-warn{color:var(--rk-warn);font-weight:700}
.reefkeepers-root .rk-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:1px;flex:none;box-shadow:0 0 0 1.5px var(--rk-panel)}
.reefkeepers-root .rk-card{background:var(--rk-panel);border:1px solid var(--rk-line);border-radius:14px;box-shadow:var(--rk-shadow);padding:10px 12px;min-width:0}
.reefkeepers-root .rk-btn{border-radius:12px;border:1px solid var(--rk-line);background:var(--rk-chip);color:var(--rk-ink);padding:8px 12px;font-size:14px;line-height:1.1}
.reefkeepers-root .rk-btn:disabled{opacity:.5}
.reefkeepers-root .rk-btn-ghost{background:transparent}

/* play layout: phone = one column in reading order; desktop = reef left, controls right */
.reefkeepers-root.rk-play{display:flex;flex-direction:column;gap:10px;padding:0 0 8px}
.reefkeepers-root .rk-layout{display:flex;flex-direction:column;gap:10px;min-width:0}
.reefkeepers-root .rk-col{display:contents}
.reefkeepers-root .rk-layout div:empty{display:none}
.reefkeepers-root .rk-a-reef{order:1}
.reefkeepers-root .rk-a-draft{order:2}
.reefkeepers-root .rk-a-lock{order:3;position:sticky;bottom:8px;z-index:3}
.reefkeepers-root .rk-a-table{order:4}
.reefkeepers-root .rk-a-others{order:5}
.reefkeepers-root .rk-a-log{order:6}
@media (min-width:900px){
  .reefkeepers-root .rk-layout{flex-direction:row;align-items:flex-start;gap:14px}
  .reefkeepers-root .rk-col{display:flex;flex-direction:column;gap:12px;min-width:0}
  .reefkeepers-root .rk-col-main{flex:1.1 1 0}
  .reefkeepers-root .rk-col-side{flex:1 1 0}
  .reefkeepers-root .rk-a-lock{position:static}
  .reefkeepers-root .rk-expanded-reef{max-width:260px}
}

/* status strip */
.reefkeepers-root .rk-strip{display:flex;align-items:center;gap:8px;min-width:0;background:var(--rk-panel);border:1px solid var(--rk-line);
  border-radius:12px;padding:7px 12px;font-size:13.5px;box-shadow:var(--rk-shadow)}
.reefkeepers-root .rk-round{font-weight:800;white-space:nowrap}
.reefkeepers-root .rk-deck{color:var(--rk-muted);font-size:12px;white-space:nowrap;font-variant-numeric:tabular-nums}
.reefkeepers-root .rk-mystate,.reefkeepers-root .rk-flash{flex:1;min-width:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--rk-muted)}
.reefkeepers-root .rk-flash-error{color:var(--rk-warn);font-weight:700;white-space:normal}
.reefkeepers-root .rk-flash-info{color:var(--rk-accent);font-weight:700}

/* reef */
.reefkeepers-root .rk-score-badge{margin-left:auto;background:var(--rk-accent);color:var(--rk-accent-ink);border-radius:999px;padding:2px 10px;font-size:14px}
.reefkeepers-root .rk-score-badge small{font-size:11px;font-weight:700;color:inherit}
.reefkeepers-root .rk-reef-wrap{display:flex;justify-content:center}
.reefkeepers-root svg.rk-reef{display:block;width:100%;height:auto;max-width:520px}
.reefkeepers-root .rk-reef-live .rk-hit{cursor:pointer}
.reefkeepers-root .rk-water{fill:var(--rk-water)}
.reefkeepers-root .rk-empty{fill:var(--rk-empty);stroke:var(--rk-empty-line);stroke-width:1.5;stroke-dasharray:5 5}
.reefkeepers-root .rk-hit{fill:transparent}
.reefkeepers-root .rk-grotto-ring{fill:none;stroke:var(--rk-gold);stroke-width:4}
.reefkeepers-root .rk-spot{fill:rgba(255,255,255,.08);stroke:var(--rk-spot);stroke-width:3;stroke-dasharray:8 7;opacity:.55;pointer-events:none}
.reefkeepers-root .rk-spot-strong{opacity:1;stroke-width:4.5;animation:rk-pulse 1.4s ease-in-out infinite}
.reefkeepers-root .rk-preview{opacity:.95;pointer-events:none}
.reefkeepers-root .rk-preview-bad{opacity:.55}
.reefkeepers-root .rk-prev-ok{fill:none;stroke:var(--rk-gold);stroke-width:7;pointer-events:none}
.reefkeepers-root .rk-prev-bad{fill:rgba(220,40,40,.12);stroke:var(--rk-warn);stroke-width:6;stroke-dasharray:12 8;pointer-events:none}
.reefkeepers-root .rk-hint-outline{fill:none;stroke:var(--rk-accent);stroke-width:4;stroke-dasharray:4 9;stroke-linecap:round;pointer-events:none}
.reefkeepers-root .rk-ghost{opacity:.82;pointer-events:none}
.reefkeepers-root .rk-locked-outline{fill:none;stroke:var(--rk-good);stroke-width:6;pointer-events:none}
@keyframes rk-pulse{0%,100%{stroke-opacity:1}50%{stroke-opacity:.35}}
@media (prefers-reduced-motion:reduce){.reefkeepers-root .rk-spot-strong{animation:none}}

.reefkeepers-root .rk-tools{display:flex;align-items:center;gap:10px;margin-top:10px;min-width:0}
.reefkeepers-root .rk-pending{flex:none;width:88px;height:88px;display:flex;align-items:center;justify-content:center;background:var(--rk-chip);border-radius:12px}
.reefkeepers-root .rk-pending-svg{max-width:80px;max-height:80px;width:auto;height:auto}
.reefkeepers-root .rk-pending-svg[viewBox="0 0 200 100"]{width:80px}
.reefkeepers-root .rk-pending-svg[viewBox="0 0 100 200"]{height:80px}
.reefkeepers-root .rk-tools-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;font-size:13px;color:var(--rk-muted)}
.reefkeepers-root .rk-tools-text b{color:var(--rk-ink);font-size:14px}
.reefkeepers-root .rk-tools .rk-btn{flex:none;min-height:44px}
.reefkeepers-root .rk-tile-frame{fill:var(--rk-panel);stroke:var(--rk-line);stroke-width:2}

/* draft row */
.reefkeepers-root .rk-claims{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px;font-size:12.5px}
.reefkeepers-root .rk-label{color:var(--rk-muted);font-weight:700}
.reefkeepers-root .rk-claims ol{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.reefkeepers-root .rk-claim{display:flex;align-items:center;gap:5px;background:var(--rk-chip);border-radius:999px;padding:3px 10px 3px 3px;max-width:170px;min-width:0}
.reefkeepers-root .rk-claim span.rk-cn{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reefkeepers-root .rk-claim b{flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--rk-ink);color:var(--rk-panel);font-size:11px}
.reefkeepers-root .rk-claim.rk-me{box-shadow:inset 0 0 0 2px var(--rk-accent)}
.reefkeepers-root .rk-offer{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.reefkeepers-root .rk-offer-tile{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 6px 6px;border-radius:12px;
  border:2px solid var(--rk-line);background:var(--rk-chip);color:var(--rk-ink);min-height:44px}
.reefkeepers-root .rk-offer-tile .rk-tile-svg{width:100%;max-width:120px;height:auto;display:block}
.reefkeepers-root .rk-offer-tile .rk-n{position:absolute;top:-8px;left:-6px;min-width:24px;height:24px;padding:0 6px;border-radius:12px;background:var(--rk-ink);color:var(--rk-panel);font-size:12px;display:flex;align-items:center;justify-content:center}
.reefkeepers-root .rk-offer-tile .rk-rank{font-size:12.5px;font-weight:800;color:var(--rk-muted);min-height:16px}
.reefkeepers-root .rk-offer-tile.rk-ranked{border-color:var(--rk-accent);background:color-mix(in srgb,var(--rk-accent) 14%,var(--rk-panel))}
.reefkeepers-root .rk-offer-tile.rk-ranked .rk-rank{color:var(--rk-accent-ink);background:var(--rk-accent);border-radius:999px;padding:1px 10px}
.reefkeepers-root .rk-offer-tile:disabled{opacity:.72}
.reefkeepers-root .rk-offer-tile.rk-hinted{border-style:dashed}
.reefkeepers-root .rk-hint-tag{position:absolute;top:-9px;right:-4px;font-size:10.5px;background:var(--rk-panel);color:var(--rk-accent);border:1px solid var(--rk-accent);border-radius:999px;padding:1px 6px}

/* lock bar */
.reefkeepers-root .rk-lockbar{display:flex;flex-direction:column;gap:6px;background:var(--rk-panel);border:1px solid var(--rk-line);border-radius:14px;padding:8px;box-shadow:0 4px 18px rgba(0,0,0,.18)}
.reefkeepers-root .rk-btn-lock{width:100%;min-height:50px;border:0;border-radius:12px;background:var(--rk-accent);color:var(--rk-accent-ink);font-size:17px}
.reefkeepers-root .rk-btn-lock:disabled{opacity:1;background:var(--rk-chip);color:var(--rk-muted)}
.reefkeepers-root .rk-btn-lock.rk-is-locked:disabled{background:color-mix(in srgb,var(--rk-good) 18%,var(--rk-panel));color:var(--rk-good)}
.reefkeepers-root .rk-wait{font-size:12.5px;color:var(--rk-muted);text-align:center}

/* table */
.reefkeepers-root .rk-seats{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.reefkeepers-root .rk-seat{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 8px;border-radius:10px;background:var(--rk-chip);font-size:13.5px}
.reefkeepers-root .rk-seat.rk-me{box-shadow:inset 0 0 0 2px var(--rk-accent)}
.reefkeepers-root .rk-seat-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reefkeepers-root .rk-seat-name small{color:var(--rk-muted);font-weight:600}
.reefkeepers-root .rk-seat-score{font-weight:800;font-variant-numeric:tabular-nums}
.reefkeepers-root .rk-seat-status{font-size:12px;color:var(--rk-muted);white-space:nowrap}
.reefkeepers-root .rk-seat-ready .rk-seat-status{color:var(--rk-good);font-weight:700}
.reefkeepers-root .rk-seat-skipped .rk-seat-status{color:var(--rk-warn)}
.reefkeepers-root .rk-btn-skip{font-size:12px;padding:6px 10px;min-height:36px;width:100%}

/* other reefs */
.reefkeepers-root .rk-other-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
.reefkeepers-root .rk-other{display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:12px;border:2px solid var(--rk-line);background:var(--rk-chip);color:var(--rk-ink);text-align:left;min-width:0}
.reefkeepers-root .rk-other.rk-open{border-color:var(--rk-accent)}
.reefkeepers-root .rk-other-head{display:flex;align-items:center;gap:6px;font-size:13px;min-width:0}
.reefkeepers-root .rk-other-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reefkeepers-root .rk-other-sub{font-size:11.5px;color:var(--rk-muted);font-weight:600}
.reefkeepers-root .rk-other-reef svg{width:100%;height:auto;display:block}
.reefkeepers-root .rk-expanded{margin-top:10px;border-top:1px solid var(--rk-line);padding-top:10px}
.reefkeepers-root .rk-expanded-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:800;margin-bottom:8px}
.reefkeepers-root .rk-expanded-body{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}
.reefkeepers-root .rk-expanded-reef{flex:1 1 220px;max-width:340px}
.reefkeepers-root .rk-expanded-reef svg{width:100%;height:auto;display:block}

/* score breakdown */
.reefkeepers-root .rk-regions{list-style:none;margin:0;padding:0;flex:0 0 auto;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:13px}
.reefkeepers-root .rk-regions li{display:grid;grid-template-columns:22px minmax(0,1fr) auto 36px;align-items:center;gap:8px}
.reefkeepers-root .rk-region-blank{color:var(--rk-muted)}
.reefkeepers-root .rk-regions b{text-align:right;font-variant-numeric:tabular-nums}
.reefkeepers-root .rk-hab{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reefkeepers-root .rk-calc{color:var(--rk-muted);font-size:12px;display:inline-flex;align-items:center;gap:2px;white-space:nowrap}
.reefkeepers-root svg.rk-sw{width:22px;height:22px;border-radius:5px;display:block}
.reefkeepers-root svg.rk-pearl-ico{width:13px;height:13px;display:inline-block;vertical-align:-2px}
.reefkeepers-root .rk-bonus{width:22px;text-align:center;color:var(--rk-gold);font-size:16px}

/* log */
.reefkeepers-root .rk-log ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;font-size:12.5px;max-height:220px;overflow:auto}
.reefkeepers-root .rk-log li{padding:3px 6px;border-radius:6px;color:var(--rk-muted)}
.reefkeepers-root .rk-log .rk-log-round,.reefkeepers-root .rk-log .rk-log-final{color:var(--rk-ink);font-weight:800;margin-top:4px}
.reefkeepers-root .rk-log .rk-log-bumped{color:var(--rk-warn);font-weight:700}
.reefkeepers-root .rk-log .rk-log-mine{background:var(--rk-chip);color:var(--rk-ink)}

/* results */
.reefkeepers-root .rk-results{border-color:var(--rk-gold)}
.reefkeepers-root .rk-results h3{font-size:18px}
.reefkeepers-root .rk-results ol{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px;align-items:start}
.reefkeepers-root .rk-result{background:var(--rk-chip);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px}
.reefkeepers-root .rk-result.rk-first{background:var(--rk-win)}
.reefkeepers-root .rk-result.rk-me{box-shadow:inset 0 0 0 2px var(--rk-accent)}
.reefkeepers-root .rk-result-head{display:flex;align-items:center;gap:8px;min-width:0}
.reefkeepers-root .rk-place{font-weight:900;color:var(--rk-muted);width:32px}
.reefkeepers-root .rk-result-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:800}
.reefkeepers-root .rk-result-total{font-size:20px}
.reefkeepers-root .rk-result-sub{font-size:12px;color:var(--rk-muted)}

/* lobby options */
.reefkeepers-root .rk-options{display:flex;flex-direction:column;gap:10px;margin:4px 0 12px}
.reefkeepers-root .rk-opt-group{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted,#6b6b6b);margin-top:4px}
.reefkeepers-root .rk-opt-group span{display:block;text-transform:none;letter-spacing:0;font-weight:600}
.reefkeepers-root .rk-opt{display:flex;align-items:center;justify-content:space-between;gap:10px}
.reefkeepers-root .rk-opt-label{display:flex;flex-direction:column;min-width:0}
.reefkeepers-root .rk-opt-label b{font-size:14px}
.reefkeepers-root .rk-opt-label span{font-size:12px;color:var(--muted,#6b6b6b)}
.reefkeepers-root .rk-seg{flex:none;display:inline-flex;border:1px solid var(--line,#ddd);border-radius:10px;overflow:hidden}
.reefkeepers-root .rk-seg button{height:34px;padding:0 10px;border:0;border-radius:0;background:var(--surface,#fff);color:var(--ink,#222);font-size:13px}
.reefkeepers-root .rk-seg button+button{border-left:1px solid var(--line,#ddd)}
.reefkeepers-root .rk-seg button.rk-on{background:var(--rk-accent);color:var(--rk-accent-ink)}
@media (max-width:420px){
  .reefkeepers-root .rk-seg button{padding:0 7px;font-size:12px}
  .reefkeepers-root .rk-opt-label span{font-size:11px}
}
`;

export const REEFKEEPERS_CSS = BASE;
