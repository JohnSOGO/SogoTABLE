// Last Orders — scoped, injected-once stylesheet. Every rule is prefixed
// .last-orders-root (classes are lo-*, never a shell class name); the first
// two rules neutralise the tic-tac-toe #macroBoard grid and the shell
// #turnStatus, and the dark block re-points the --lo-* tokens under
// <html data-theme="dark">. Play-screen buttons reset the shell's global
// `button{min-height:44px;…}`; the lobby keeps the shell's own buttons.
// Art colours come from assets.js (the SVG palette), not from here.
const LIGHT = `
#macroBoard:has(.last-orders-root){display:block;aspect-ratio:auto;height:auto;max-width:none}
#turnStatus:has(~ #macroBoard .last-orders-root){display:none}
.last-orders-root{
  --lo-ink:#3b2a1f;--lo-muted:#7d6852;--lo-panel:#fff8ea;--lo-panel-2:#f6ead2;--lo-line:#e3cfab;--lo-chip:#f1e2c4;
  --lo-accent:#b5651d;--lo-accent-ink:#fff;--lo-btn:#8a3b24;--lo-btn-ink:#fff;--lo-btn-2:#fffaf0;
  --lo-good:#2e7d32;--lo-bad:#b3261e;--lo-info:#8a5a12;--lo-win:#fff0bf;
  --lo-grit:#e2475b;--lo-grit-track:rgba(226,71,91,.16);--lo-buzz:#e46fa3;--lo-gold:#c98f17;
  --lo-turn:#f0a92e;--lo-target:#3d7dbf;--lo-shadow:0 2px 10px rgba(70,40,15,.16);
  --lo-k-action:#d4573b;--lo-k-reaction:#3d7dbf;--lo-k-gamble:#8a52b8;--lo-k-spike:#4f9a4a;--lo-k-drink:#2f7f6f;--lo-k-event:#9a6a25;
  --lo-wood:#b9834f;--lo-wood-ink:#fffaf0;--lo-card:#fffdf6;--lo-card-ink:#3b2a1f;--lo-glow:rgba(255,196,64,.85);
  color:var(--lo-ink);font-family:"Avenir Next","Segoe UI",system-ui,sans-serif;position:relative;
  width:100%;max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:8px;text-align:left;
}
.last-orders-root [hidden]{display:none !important}
.last-orders-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.last-orders-root.lo-play :where(button){min-height:0;width:auto;margin:0;font:inherit;font-weight:700;cursor:pointer;box-shadow:none;letter-spacing:0;text-transform:none}
.last-orders-root.lo-play :where(button:disabled){cursor:not-allowed}
.last-orders-root svg{display:block}
.last-orders-root .lo-dot{display:inline-block;flex:none;width:10px;height:10px;border-radius:50%;box-shadow:0 0 0 1.5px rgba(0,0,0,.2)}

/* header */
.last-orders-root .lo-top{display:flex;align-items:center;gap:8px;height:40px;padding:0 6px 0 12px;background:var(--lo-panel);border-radius:12px;box-shadow:var(--lo-shadow)}
.last-orders-root .lo-title{font-weight:800;white-space:nowrap;font-size:14px}
.last-orders-root .lo-status{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--lo-muted);font-weight:700;font-size:13px;text-align:right}
.last-orders-root .lo-top{position:relative}
.last-orders-root .lo-steps{display:inline-flex;align-items:center;flex:none}
.last-orders-root button.lo-step{width:26px;height:34px;padding:0;border:0;background:transparent;display:grid;place-items:center;position:relative}
.last-orders-root .lo-step+.lo-step::before{content:"";position:absolute;left:-4px;top:50%;width:8px;height:2px;margin-top:-1px;background:var(--lo-line)}
.last-orders-root .lo-step i{display:block;width:13px;height:13px;border-radius:50%;border:2px solid var(--lo-muted);background:transparent;transition:background .25s,border-color .25s,transform .2s}
.last-orders-root .lo-step-done i{background:var(--lo-good);border-color:var(--lo-good)}
.last-orders-root .lo-step-done+.lo-step::before{background:var(--lo-good)}
.last-orders-root .lo-step-now i{border-color:var(--lo-turn);background:radial-gradient(circle,var(--lo-turn) 0 3px,transparent 3.5px);transform:scale(1.2);animation:lo-blink 1.4s ease-in-out infinite}
.last-orders-root .lo-step.lo-on i{box-shadow:0 0 0 3px rgba(61,125,191,.35)}
.last-orders-root .lo-step-tip{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:19;padding:10px 12px;border-radius:12px;background:var(--lo-panel);border:1px solid var(--lo-line);box-shadow:0 8px 26px rgba(0,0,0,.25);font-size:14px;line-height:1.35;font-weight:600;cursor:pointer;animation:lo-toast-in-down .18s ease-out}
.last-orders-root .lo-step-tip b{color:var(--lo-accent);font-weight:900}
@keyframes lo-toast-in-down{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@media (max-width:520px){.last-orders-root .lo-top:has(.lo-steps) .lo-title-text{display:none}}
.last-orders-root .lo-gear{flex:none;width:34px;height:34px;padding:0;border-radius:50%;border:1px solid var(--lo-line);background:var(--lo-chip);color:var(--lo-ink);font-size:17px;line-height:1}
.last-orders-root .lo-gear.lo-on{background:var(--lo-accent);color:var(--lo-accent-ink);border-color:var(--lo-accent)}
.last-orders-root .lo-menu{position:absolute;top:46px;right:0;z-index:20;width:min(320px,100%)}
.last-orders-root .lo-menu-card{background:var(--lo-panel);border:1px solid var(--lo-line);border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.25);padding:8px;display:flex;flex-direction:column;gap:6px}
.last-orders-root .lo-pref{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:10px;border:1px solid var(--lo-line);background:var(--lo-panel-2);color:var(--lo-ink);text-align:left}
.last-orders-root .lo-pref span:first-child{display:flex;flex-direction:column;min-width:0}
.last-orders-root .lo-pref small{font-weight:600;color:var(--lo-muted);font-size:11.5px}
.last-orders-root .lo-switch{flex:none;width:40px;height:24px;border-radius:12px;background:var(--lo-line);position:relative;transition:background .15s}
.last-orders-root .lo-switch i{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .15s}
.last-orders-root .lo-switch.lo-on{background:var(--lo-good)}
.last-orders-root .lo-switch.lo-on i{left:19px}

/* primer */
.last-orders-root .lo-primer{background:var(--lo-panel);border-radius:12px;box-shadow:var(--lo-shadow);padding:2px 4px}
.last-orders-root .lo-primer-toggle{width:100%;display:flex;justify-content:space-between;align-items:center;height:34px;padding:0 8px;border:0;background:transparent;color:var(--lo-ink);font-size:13px}
.last-orders-root .lo-primer-list{margin:0 0 6px;padding:0 10px 0 26px;font-size:12.5px;line-height:1.4;color:var(--lo-ink)}
.last-orders-root .lo-primer-list li{margin:3px 0}

/* seats */
.last-orders-root .lo-opps-row{display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;padding:2px 2px 6px;scrollbar-width:thin;scroll-snap-type:x proximity}
.last-orders-root .lo-seat,.last-orders-root .lo-myseat{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:center;
  background:var(--lo-panel);border-radius:12px;box-shadow:var(--lo-shadow);padding:7px 8px;border:2px solid transparent;transition:border-color .2s, opacity .3s}
.last-orders-root .lo-seat{flex:1 0 170px;max-width:230px;scroll-snap-align:start}
.last-orders-root .lo-seat .lo-stat{font-size:11.5px;padding:1px 4px 1px 2px}
.last-orders-root .lo-seat .lo-stat svg{width:13px;height:13px}
.last-orders-root .lo-seat .lo-stats{gap:3px}
.last-orders-root .lo-seat-face{position:relative;border-radius:12px;overflow:hidden;box-shadow:0 0 0 2px var(--lo-seat,#999)}
.last-orders-root .lo-seat-body{min-width:0;display:flex;flex-direction:column;gap:3px}
.last-orders-root .lo-seat-name{display:flex;align-items:baseline;gap:5px;min-width:0;font-weight:800;font-size:13px}
.last-orders-root .lo-seat-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.last-orders-root .lo-seat-name em{font-style:normal;font-weight:600;font-size:11px;color:var(--lo-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.last-orders-root .lo-turn{border-color:var(--lo-turn);box-shadow:0 0 0 3px rgba(240,169,46,.25),var(--lo-shadow)}
.last-orders-root .lo-turn::after{content:"";position:absolute;top:-5px;right:10px;width:10px;height:10px;border-radius:50%;background:var(--lo-turn);box-shadow:0 0 8px var(--lo-turn);animation:lo-blink 1.4s ease-in-out infinite}
.last-orders-root .lo-targetable{cursor:pointer;border-color:var(--lo-target);border-style:dashed}
.last-orders-root .lo-chosen{border-style:solid;border-color:var(--lo-target);box-shadow:0 0 0 3px rgba(61,125,191,.3),var(--lo-shadow)}
.last-orders-root .lo-is-out{opacity:.55;filter:grayscale(.7);transform:rotate(-3deg) translateY(4px)}
.last-orders-root .lo-out-badge{font-size:11px;font-weight:800;color:var(--lo-bad);white-space:nowrap}
.last-orders-root .lo-meter{position:relative;height:9px;border-radius:5px;background:var(--lo-grit-track);overflow:hidden}
.last-orders-root .lo-meter i{position:absolute;left:0;top:0;bottom:0;border-radius:5px;transition:width .5s ease}
.last-orders-root .lo-meter-grit{background:var(--lo-grit)}
.last-orders-root .lo-meter-buzz{background:repeating-linear-gradient(135deg,var(--lo-buzz) 0 5px,#f08fbb 5px 9px);box-shadow:1px 0 0 2px var(--lo-panel)}
.last-orders-root .lo-meter.lo-danger{animation:lo-throb 1s ease-in-out infinite}
.last-orders-root .lo-stats{display:flex;gap:4px;flex-wrap:nowrap}
.last-orders-root .lo-stat{display:inline-flex;align-items:center;gap:2px;font-size:12.5px;font-variant-numeric:tabular-nums;padding:1px 5px 1px 3px;border-radius:9px;background:var(--lo-chip)}
.last-orders-root .lo-stat b{font-weight:800}
.last-orders-root .lo-seat-misc,.last-orders-root .lo-mine-row{display:flex;align-items:center;gap:6px;min-width:0;font-size:11.5px;color:var(--lo-muted);font-weight:700;height:18px}
.last-orders-root .lo-mugs{display:inline-flex;align-items:center;gap:1px}
.last-orders-root .lo-mug{display:block;width:11px;height:15px;border-radius:2px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.3)}
.last-orders-root .lo-mug svg{width:100%;height:100%}
.last-orders-root .lo-mugs em{font-style:normal;margin-left:2px}
.last-orders-root .lo-myseat .lo-seat-name{font-size:15px}
.last-orders-root .lo-myseat .lo-stat{font-size:14px}
.last-orders-root .lo-myseat-empty{display:block;text-align:center;color:var(--lo-muted);font-weight:700}

/* the bar top */
.last-orders-root .lo-bar{position:relative;border-radius:16px;padding:8px;color:var(--lo-wood-ink);background:var(--lo-wood) var(--lo-table-img) center/cover;
  box-shadow:inset 0 0 0 2px rgba(0,0,0,.12),inset 0 -12px 24px rgba(0,0,0,.18),var(--lo-shadow);display:flex;flex-direction:column;gap:6px}
.last-orders-root .lo-bar-head{display:flex;align-items:center;gap:6px;min-height:40px}
.last-orders-root .lo-chip{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 9px;border-radius:12px;background:rgba(40,22,10,.55);color:#fff8e8;font-size:12px;font-weight:800;white-space:nowrap}
.last-orders-root .lo-chip-hot{background:rgba(180,40,30,.8)}
.last-orders-root .lo-chip-deck svg{width:12px;height:17px;border-radius:2px}
.last-orders-root .lo-ring-wrap{position:relative;margin-left:auto;width:40px;height:40px;flex:none}
.last-orders-root .lo-ring{width:40px;height:40px;transform:rotate(-90deg)}
.last-orders-root .lo-ring-bg{fill:rgba(30,16,8,.55);stroke:rgba(255,255,255,.18);stroke-width:4}
.last-orders-root .lo-ring-fg{fill:none;stroke:var(--lo-turn);stroke-width:4;stroke-linecap:round;stroke-dasharray:100;stroke-dashoffset:0}
.last-orders-root .lo-ring-num{position:absolute;inset:0;display:grid;place-items:center;font-weight:900;font-size:15px;color:#fff;font-variant-numeric:tabular-nums}
.last-orders-root .lo-ring-num.lo-hurry{color:#ffd1d1;animation:lo-throb .5s ease-in-out infinite}
@keyframes lo-ring{to{stroke-dashoffset:100}}
.last-orders-root .lo-bar-main{min-height:176px;display:flex;align-items:center;justify-content:center;perspective:700px}
.last-orders-root .lo-stack-empty{max-width:320px;text-align:center;font-weight:800;font-size:14px;padding:10px 14px;border-radius:12px;background:rgba(40,22,10,.45);color:#fff8e8}
.last-orders-root .lo-gamble-call{background:rgba(90,40,120,.75)}
.last-orders-root .lo-stack{display:flex;align-items:flex-end;justify-content:center;padding:0 8px;max-width:100%}
.last-orders-root .lo-stack-card{position:relative;flex:none;width:92px;margin-left:calc(-46px + 6px * var(--n));display:flex;flex-direction:column;align-items:center;gap:3px;
  transform:rotate(calc((var(--i) - var(--n) + 1) * 4deg)) translateY(calc((var(--n) - var(--i) - 1) * 6px));transform-origin:50% 100%;z-index:calc(var(--i) + 1)}
.last-orders-root .lo-stack-card:first-child{margin-left:0}
.last-orders-root .lo-stack-card.lo-stack-top{width:124px;transform:none}
.last-orders-root .lo-stack.lo-resolving .lo-stack-card{opacity:.85}
.last-orders-root .lo-stack-who{max-width:100%;padding:1px 7px;border-radius:9px;background:rgba(30,16,8,.62);color:#fff;font-size:10.5px;line-height:1.25;font-weight:800;text-align:center;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.last-orders-root .lo-stack-who small{display:block}
.last-orders-root .lo-stack-who small{font-weight:600;opacity:.85;font-size:10px}
.last-orders-root .lo-spikes{display:flex;flex-wrap:wrap;gap:2px;justify-content:center}
.last-orders-root .lo-spike-chip{padding:0 5px;border-radius:7px;background:var(--lo-k-spike);color:#fff;font-size:10px;font-weight:800}
.last-orders-root .lo-soften{padding:0 5px;border-radius:7px;background:var(--lo-k-reaction);color:#fff;font-size:10px;font-weight:800}
.last-orders-root .lo-x{position:absolute;inset:0 0 auto 0;height:calc(100% - 22px);pointer-events:none;
  background:linear-gradient(45deg,transparent calc(50% - 3px),var(--lo-bad) calc(50% - 3px),var(--lo-bad) calc(50% + 3px),transparent calc(50% + 3px)),
  linear-gradient(-45deg,transparent calc(50% - 3px),var(--lo-bad) calc(50% - 3px),var(--lo-bad) calc(50% + 3px),transparent calc(50% + 3px))}
.last-orders-root .lo-canceled .lo-face{filter:grayscale(.8);opacity:.75}
.last-orders-root .lo-face{width:100%;display:flex;flex-direction:column;border-radius:10px;overflow:hidden;background:var(--lo-card);color:var(--lo-card-ink);
  border:2px solid var(--lo-kc,#999);box-shadow:0 4px 12px rgba(0,0,0,.35)}
.last-orders-root .lo-face-art svg{width:100%;height:auto;aspect-ratio:1}
.last-orders-root .lo-face-kind{background:var(--lo-kc,#999);color:#fff;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;text-align:center;padding:1px 0}
.last-orders-root .lo-face-name{font-size:11.5px;line-height:1.15;padding:3px 5px 4px;text-align:center}
.last-orders-root .lo-stack-top .lo-face-name{font-size:13px}
.last-orders-root .lo-face-text{font-size:10.5px;line-height:1.25;padding:0 6px 6px;color:var(--lo-muted);text-align:center}
.last-orders-root .lo-k-action{--lo-kc:var(--lo-k-action)}
.last-orders-root .lo-k-reaction{--lo-kc:var(--lo-k-reaction)}
.last-orders-root .lo-k-gamble{--lo-kc:var(--lo-k-gamble)}
.last-orders-root .lo-k-spike{--lo-kc:var(--lo-k-spike)}
.last-orders-root .lo-k-drink{--lo-kc:var(--lo-k-drink)}
.last-orders-root .lo-bar-side{display:flex;flex-wrap:wrap;gap:6px;align-items:stretch}
.last-orders-root .lo-bar-side:empty{display:none}
.last-orders-root .lo-pot,.last-orders-root .lo-event,.last-orders-root .lo-lastdrink{flex:1 1 150px;min-width:0;border-radius:12px;padding:6px 8px;background:rgba(40,22,10,.55);color:#fff8e8;font-size:12px}
.last-orders-root .lo-pot{display:flex;align-items:center;gap:8px;background:rgba(90,40,120,.72)}
.last-orders-root .lo-pot-pile{position:relative;width:44px;height:34px;flex:none}
.last-orders-root .lo-pot-coin{position:absolute;filter:drop-shadow(0 1px 1px rgba(0,0,0,.5))}
.last-orders-root .lo-pot-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.last-orders-root .lo-pot-text b{font-size:15px}
.last-orders-root .lo-pot-text span{display:flex;align-items:center;gap:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.last-orders-root .lo-pot-text svg{width:22px;height:22px;border-radius:6px}
.last-orders-root .lo-event{display:flex;flex-direction:column;gap:1px;background:rgba(120,70,20,.75)}
.last-orders-root .lo-event-tag{font-size:9.5px;font-weight:900;text-transform:uppercase;letter-spacing:.6px;opacity:.85}
.last-orders-root .lo-lastdrink{display:flex;align-items:center;gap:8px}
.last-orders-root .lo-lastdrink-art{flex:none;width:36px;height:36px;border-radius:8px;overflow:hidden}
.last-orders-root .lo-lastdrink-art svg{width:36px;height:36px}
.last-orders-root .lo-lastdrink-text{display:flex;flex-direction:column;min-width:0}
.last-orders-root .lo-lastdrink-text small{font-size:9.5px;font-weight:900;text-transform:uppercase;letter-spacing:.6px;opacity:.8}
.last-orders-root .lo-lastdrink-text span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.last-orders-root .lo-lastdrink.lo-canceled b{text-decoration:line-through}
`;

const PLAY = `
/* phase bar */
.last-orders-root .lo-controls{min-height:104px;background:var(--lo-panel);border-radius:14px;box-shadow:var(--lo-shadow);padding:8px 10px;display:flex;flex-direction:column;gap:6px}
.last-orders-root .lo-prompt{font-size:13.5px;font-weight:700;line-height:1.3;display:flex;flex-wrap:wrap;gap:6px;align-items:baseline}
.last-orders-root .lo-phase-tag{display:inline-block;padding:1px 8px;border-radius:9px;background:var(--lo-turn);color:#3b2400;font-size:11.5px;font-weight:900;white-space:nowrap}
.last-orders-root .lo-btns{display:flex;flex-wrap:wrap;align-items:center;gap:8px;justify-content:flex-end}
.last-orders-root .lo-btn{height:42px;padding:0 16px;border-radius:12px;border:1px solid var(--lo-line);background:var(--lo-btn-2);color:var(--lo-ink);font-size:14px}
.last-orders-root .lo-btn-primary{background:var(--lo-btn);border-color:var(--lo-btn);color:var(--lo-btn-ink);flex:1 1 auto;max-width:320px}
.last-orders-root .lo-btn:disabled{opacity:.42}
.last-orders-root .lo-targets{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--lo-muted)}
.last-orders-root .lo-target{display:inline-flex;align-items:center;gap:5px;height:34px;padding:0 12px;border-radius:17px;border:2px dashed var(--lo-target);background:transparent;color:var(--lo-ink);font-size:13px}
.last-orders-root .lo-target.lo-on{border-style:solid;background:var(--lo-target);color:#fff}
.last-orders-root .lo-spike-state{margin-right:auto;font-size:12px;color:var(--lo-muted);font-weight:700}
.last-orders-root .lo-waiting{font-size:12px;color:var(--lo-muted);font-weight:600}
.last-orders-root .lo-detail{font-size:12.5px;line-height:1.35;padding:6px 8px;border-radius:10px;background:var(--lo-panel-2)}
.last-orders-root .lo-detail i{color:var(--lo-muted)}
.last-orders-root .lo-skip-row{justify-content:space-between}
.last-orders-root .lo-skip-hint{font-size:12px;color:var(--lo-muted);font-weight:600}
.last-orders-root .lo-skip{height:30px;padding:0 10px;border-radius:15px;border:1px dashed var(--lo-line);background:transparent;color:var(--lo-muted);font-size:12px;white-space:nowrap}
.last-orders-root .lo-skip small{font-weight:600}
.last-orders-root .lo-skip.lo-on{border-style:solid;border-color:var(--lo-accent);color:var(--lo-accent)}

/* hand */
.last-orders-root .lo-hand{background:var(--lo-panel);border-radius:14px;box-shadow:var(--lo-shadow);padding:8px 0 4px}
.last-orders-root .lo-hand-row{display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;padding:6px 10px 8px;scrollbar-width:thin;scroll-snap-type:x proximity}
.last-orders-root .lo-hand-empty{padding:16px;text-align:center;color:var(--lo-muted);font-weight:700}
.last-orders-root button.lo-card{position:relative;flex:none;width:112px;min-height:150px;padding:0;display:flex;flex-direction:column;align-items:stretch;text-align:center;
  border-radius:12px;border:2px solid var(--lo-kc,#999);background:var(--lo-card);color:var(--lo-card-ink);overflow:hidden;scroll-snap-align:start;
  box-shadow:0 2px 6px rgba(0,0,0,.18);transition:transform .15s, box-shadow .15s, opacity .2s}
.last-orders-root button.lo-card:disabled{opacity:.8}
.last-orders-root .lo-card-art svg{width:100%;height:auto;aspect-ratio:1}
.last-orders-root .lo-card-art{display:block;padding:5px 5px 0}
.last-orders-root .lo-card-art svg{border-radius:8px}
.last-orders-root .lo-card-kind{margin:4px auto 0;padding:0 7px;border-radius:7px;background:var(--lo-kc,#999);color:#fff;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.5px}
.last-orders-root .lo-card-name{font-size:12.5px;line-height:1.15;padding:3px 5px 2px}
.last-orders-root .lo-card-text{font-size:10.5px;line-height:1.25;font-weight:600;color:var(--lo-muted);padding:0 6px 7px}
.last-orders-root .lo-card.lo-playable{box-shadow:0 0 0 3px var(--lo-glow),0 0 16px var(--lo-glow)}
.last-orders-root .lo-card.lo-dim{opacity:.55}
.last-orders-root .lo-card.lo-sel{transform:translateY(-6px);box-shadow:0 0 0 3px var(--lo-target),0 8px 18px rgba(0,0,0,.3);opacity:1}
.last-orders-root .lo-card.lo-discard{transform:translateY(-6px) rotate(-2deg);opacity:.75;border-style:dashed}
.last-orders-root .lo-card.lo-spiking{transform:translateY(-6px);box-shadow:0 0 0 3px var(--lo-k-spike),0 8px 18px rgba(0,0,0,.3);opacity:1}
.last-orders-root .lo-hand,.last-orders-root .lo-drag-ghost{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.last-orders-root .lo-hand svg,.last-orders-root .lo-hand img{pointer-events:none;-webkit-user-drag:none}
.last-orders-root .lo-card.lo-dragging{opacity:.3}
.last-orders-root button.lo-card.lo-drag-ghost{position:fixed;z-index:60;margin:0;pointer-events:none;box-shadow:0 14px 34px rgba(0,0,0,.45);transition:none}
.last-orders-root .lo-drop-hot{outline:3px solid var(--lo-turn);outline-offset:2px;box-shadow:0 0 0 6px rgba(240,169,46,.35),var(--lo-shadow)}
.last-orders-root .lo-card-mark{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--lo-bad);color:#fff;font-size:14px;font-weight:900;box-shadow:0 1px 4px rgba(0,0,0,.4)}
.last-orders-root .lo-spiking .lo-card-mark{background:var(--lo-k-spike)}

/* ticker + toast */
.last-orders-root .lo-ticker{background:var(--lo-panel);border-radius:12px;box-shadow:var(--lo-shadow);padding:6px 10px}
.last-orders-root .lo-log{list-style:none;margin:0;padding:0;font-size:12.5px;line-height:1.45;color:var(--lo-muted)}
.last-orders-root .lo-log li{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.last-orders-root .lo-log li:last-child{color:var(--lo-ink);font-weight:700}
.last-orders-root .lo-log .lo-log-out,.last-orders-root .lo-log .lo-log-win,.last-orders-root .lo-log .lo-log-gamble_win{color:var(--lo-accent);font-weight:800}
.last-orders-root .lo-toast{position:sticky;bottom:10px;z-index:15;display:flex;justify-content:center;pointer-events:none;height:0;overflow:visible}
.last-orders-root .lo-toast-msg{transform:translateY(-100%);max-width:min(92%,460px);padding:10px 14px;border-radius:12px;background:#2b1a10;color:#fff;font-weight:700;font-size:13.5px;box-shadow:0 6px 20px rgba(0,0,0,.35);animation:lo-toast-in .25s ease-out}
.last-orders-root .lo-toast-error{background:#8f2219}
@keyframes lo-toast-in{from{opacity:0;transform:translateY(-60%)}to{opacity:1;transform:translateY(-100%)}}

/* pick */
.last-orders-root .lo-pick{display:flex;flex-direction:column;gap:8px}
.last-orders-root .lo-pick-head{background:var(--lo-panel);border-radius:14px;box-shadow:var(--lo-shadow);padding:8px 12px}
.last-orders-root .lo-pick-head h3{margin:0;font-size:18px}
.last-orders-root .lo-pick-head p{margin:2px 0 0;font-size:13px;color:var(--lo-muted);font-weight:600}
.last-orders-root .lo-wait-chips{display:flex;flex-wrap:wrap;gap:6px}
.last-orders-root .lo-wait-chip{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:2px 10px;border-radius:15px;background:var(--lo-chip);font-size:12.5px;font-weight:700;color:var(--lo-muted)}
.last-orders-root .lo-wait-chip.lo-done{background:#dcefd9;color:#24622b}
.last-orders-root .lo-patrons{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
.last-orders-root button.lo-patron{display:grid;grid-template-columns:72px minmax(0,1fr);gap:10px;align-items:start;padding:10px;border-radius:14px;border:2px solid var(--lo-line);
  background:var(--lo-panel);color:var(--lo-ink);text-align:left;box-shadow:var(--lo-shadow);font-weight:400;transition:transform .12s, border-color .15s}
.last-orders-root button.lo-patron:not(:disabled):hover{border-color:var(--lo-accent)}
.last-orders-root button.lo-patron:not(:disabled):active{transform:scale(.98)}
.last-orders-root .lo-patron-face{border-radius:14px;overflow:hidden}
.last-orders-root .lo-patron-body{display:flex;flex-direction:column;gap:3px;min-width:0}
.last-orders-root .lo-patron-body b{font-size:15px;line-height:1.15}
.last-orders-root .lo-patron-body small{font-size:12px;color:var(--lo-muted);font-weight:700}
.last-orders-root .lo-patron-blurb{font-size:12px;line-height:1.3}
.last-orders-root .lo-patron-trait{font-size:12px;font-weight:800;color:var(--lo-accent)}
.last-orders-root .lo-patron-foot{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11px;color:var(--lo-muted);font-weight:700}
.last-orders-root .lo-pack-badge{padding:1px 7px;border-radius:8px;background:var(--lo-chip);color:var(--lo-ink)}
.last-orders-root .lo-taken-by{font-size:12px;font-weight:900;color:var(--lo-bad)}
.last-orders-root button.lo-patron.lo-taken{opacity:.5;filter:grayscale(.5)}
.last-orders-root button.lo-patron.lo-mine-pick{opacity:1;filter:none;border-color:var(--lo-good);box-shadow:0 0 0 3px rgba(46,125,50,.25),var(--lo-shadow)}
.last-orders-root .lo-mine-pick .lo-taken-by{color:var(--lo-good)}

/* results */
.last-orders-root .lo-results{background:var(--lo-panel);border-radius:14px;box-shadow:var(--lo-shadow);padding:8px 10px}
.last-orders-root .lo-results-title{margin:4px 0 8px;text-align:center;font-size:19px}
.last-orders-root .lo-results-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.last-orders-root .lo-result{display:grid;grid-template-columns:38px 40px minmax(0,1fr) auto;gap:8px;align-items:center;padding:6px 8px;border-radius:12px;background:var(--lo-panel-2)}
.last-orders-root .lo-result.lo-win{background:var(--lo-win);box-shadow:0 0 0 2px var(--lo-turn)}
.last-orders-root .lo-result.lo-me .lo-result-name b{text-decoration:underline;text-underline-offset:3px}
.last-orders-root .lo-place{font-weight:900;font-size:15px;text-align:center}
.last-orders-root .lo-result-face{border-radius:10px;overflow:hidden}
.last-orders-root .lo-result-name{display:flex;flex-direction:column;min-width:0}
.last-orders-root .lo-result-name b,.last-orders-root .lo-result-name small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.last-orders-root .lo-result-name small{color:var(--lo-muted);font-weight:600;font-size:11.5px}
.last-orders-root .lo-result-why{font-size:12.5px;font-weight:800;white-space:nowrap}

/* fx layer (fx.js) */
.last-orders-root .lo-defending{animation:lo-defender 1s ease-in-out infinite}
@keyframes lo-defender{0%,100%{box-shadow:0 0 0 3px var(--lo-grit),0 0 14px 2px rgba(226,71,91,.55);background:color-mix(in srgb,var(--lo-grit) 18%,var(--lo-panel))}50%{box-shadow:0 0 0 2px rgba(226,71,91,.35),0 0 0 rgba(226,71,91,0);background:var(--lo-panel)}}
@media (prefers-reduced-motion:reduce){.last-orders-root .lo-defending{animation:none;box-shadow:0 0 0 3px var(--lo-grit)}}
/* play callout (callout.js): a banner pinned to the top of the viewport */
.last-orders-root .lo-callout{position:sticky;top:8px;z-index:20;height:0;margin-bottom:-8px;overflow:visible;pointer-events:none;display:flex;align-items:flex-start;justify-content:center;grid-column:1 / -1;grid-row:1}
.last-orders-root .lo-co{display:flex;align-items:center;gap:10px;width:min(94%,520px);padding:8px 10px;border-radius:16px;background:var(--lo-panel);color:var(--lo-ink);border:2px solid var(--lo-co-k,var(--lo-k-action));box-shadow:0 10px 28px rgba(0,0,0,.35);animation:lo-co-in .42s cubic-bezier(.2,.8,.3,1.2) both}
.last-orders-root .lo-co-k-action{--lo-co-k:var(--lo-k-action)}.last-orders-root .lo-co-k-reaction{--lo-co-k:var(--lo-k-reaction)}
.last-orders-root .lo-co-k-gamble{--lo-co-k:var(--lo-k-gamble)}.last-orders-root .lo-co-k-spike{--lo-co-k:var(--lo-k-spike)}.last-orders-root .lo-co-k-drink{--lo-co-k:var(--lo-k-drink)}
.last-orders-root .lo-co-atme{box-shadow:0 0 0 3px var(--lo-grit),0 10px 28px rgba(0,0,0,.35)}
.last-orders-root .lo-co-face{flex:none;width:64px;height:64px;border-radius:18px;box-shadow:0 0 0 3px var(--lo-co-k,var(--lo-k-action))}
.last-orders-root .lo-co-face svg,.last-orders-root .lo-co-art svg{width:100%;height:100%}
.last-orders-root .lo-co-speaking .lo-co-face{animation:lo-co-talk .5s ease-in-out 4 alternate}
.last-orders-root .lo-co-body{flex:1;min-width:0;line-height:1.25}
.last-orders-root .lo-co-who{font-weight:800;font-size:13px}
.last-orders-root .lo-co-who small{font-weight:600;color:var(--lo-muted)}
.last-orders-root .lo-co-line{font-size:15px}
.last-orders-root .lo-co-card{font-size:17px;color:var(--lo-co-k,var(--lo-k-action))}
.last-orders-root .lo-co-rules{font-size:12px;color:var(--lo-muted);margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.last-orders-root .lo-co-art{flex:none;width:64px;height:64px;animation:lo-co-flip .6s .15s ease-out both}
@keyframes lo-co-in{from{opacity:0;transform:translateY(-24px) scale(.92)}to{opacity:1;transform:none}}
@keyframes lo-co-talk{from{transform:scale(1)}to{transform:scale(1.07) rotate(-2deg)}}
@keyframes lo-co-flip{from{transform:rotateY(90deg) scale(.6);opacity:0}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){.last-orders-root .lo-co,.last-orders-root .lo-co-art,.last-orders-root .lo-co-speaking .lo-co-face{animation:none}}
@media (max-width:420px){.last-orders-root .lo-co-face,.last-orders-root .lo-co-art{width:52px;height:52px}}
.last-orders-root .lo-fx{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:12}
.last-orders-root .lo-float{position:absolute;font-weight:900;font-size:16px;white-space:nowrap;text-shadow:0 1px 0 #fff,0 0 6px rgba(255,255,255,.8);will-change:transform,opacity}
.last-orders-root .lo-float-grit{color:var(--lo-grit)}
.last-orders-root .lo-float-buzz{color:#c2417d}
.last-orders-root .lo-float-gold{color:var(--lo-gold)}
.last-orders-root .lo-flycoin{position:absolute;width:22px;height:22px;will-change:transform,opacity;filter:drop-shadow(0 2px 2px rgba(0,0,0,.4))}
.last-orders-root .lo-flymug{width:28px;height:28px}
.last-orders-root .lo-confetti{position:absolute;width:8px;height:12px;border-radius:2px;will-change:transform,opacity}
@keyframes lo-blink{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes lo-throb{0%,100%{opacity:1}50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){
  .last-orders-root *,.last-orders-root *::after{animation:none !important;transition:none !important}
  .last-orders-root .lo-ring-fg{animation:none !important;stroke-dasharray:none}
}

/* lobby options */
.last-orders-root .lo-options{display:flex;flex-direction:column;gap:10px;margin:4px 0 12px}
.last-orders-root .lo-opt{display:flex;align-items:center;justify-content:space-between;gap:10px}
.last-orders-root .lo-opt-label{display:flex;flex-direction:column;min-width:0}
.last-orders-root .lo-opt-label b{font-size:14px}
.last-orders-root .lo-opt-label span{font-size:12px;color:var(--muted,#6b6b6b)}
.last-orders-root .lo-seg{flex:none;display:inline-flex;border:1px solid var(--line,#ddd);border-radius:10px;overflow:hidden}
.last-orders-root .lo-seg button{min-height:0;width:auto;margin:0;height:34px;padding:0 10px;border:0;border-radius:0;background:var(--surface,#fff);color:var(--ink,#222);font:inherit;font-size:13px;font-weight:700;box-shadow:none}
.last-orders-root .lo-seg button+button{border-left:1px solid var(--line,#ddd)}
.last-orders-root .lo-seg button.lo-on{background:var(--lo-btn);color:var(--lo-btn-ink)}
.last-orders-root .lo-packs{display:flex;flex-direction:column;gap:6px}
.last-orders-root button.lo-pack{min-height:0;width:100%;margin:0;display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:12px;border:1px solid var(--line,#ddd);
  background:var(--surface,#fff);color:var(--ink,#222);text-align:left;font:inherit;box-shadow:none}
.last-orders-root button.lo-pack.lo-on{border-color:var(--lo-btn);box-shadow:0 0 0 2px rgba(138,59,36,.2)}
.last-orders-root .lo-pack-check{flex:none;width:22px;height:22px;border-radius:6px;border:2px solid var(--line,#bbb);display:grid;place-items:center;font-weight:900;font-size:13px}
.last-orders-root .lo-pack.lo-on .lo-pack-check{background:var(--lo-btn);border-color:var(--lo-btn);color:#fff}
.last-orders-root .lo-pack-text{display:flex;flex-direction:column;min-width:0}
.last-orders-root .lo-pack-text b{font-size:14px}
.last-orders-root .lo-pack-text small{font-size:12px;color:var(--muted,#6b6b6b);line-height:1.3}

/* desktop: bar beside my seat + controls */
@media (min-width:900px){
  .last-orders-root.lo-play{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);grid-template-areas:"top top" "primer primer" "results results" "pick pick" "opps opps" "bar mine" "bar controls" "hand hand" "ticker ticker";align-items:start}
  .last-orders-root .lo-top{grid-area:top}.last-orders-root .lo-primer{grid-area:primer}.last-orders-root .lo-results{grid-area:results}
  .last-orders-root .lo-pick{grid-area:pick}.last-orders-root .lo-opps{grid-area:opps}.last-orders-root .lo-bar{grid-area:bar;align-self:stretch}
  .last-orders-root .lo-mine{grid-area:mine}.last-orders-root .lo-controls{grid-area:controls;align-self:stretch}
  .last-orders-root .lo-hand{grid-area:hand}.last-orders-root .lo-ticker{grid-area:ticker}
  .last-orders-root .lo-toast{grid-column:1 / -1}
  .last-orders-root .lo-opps-row{flex-wrap:wrap;overflow:visible}
  .last-orders-root .lo-seat{flex:0 0 200px}
  .last-orders-root .lo-bar-main{min-height:240px}
  .last-orders-root button.lo-card{width:124px}
  .last-orders-root .lo-stack-card{width:104px}
  .last-orders-root .lo-stack-card.lo-stack-top{width:140px}
}
@media (max-width:420px){
  .last-orders-root .lo-seg button{padding:0 7px;font-size:12px}
  .last-orders-root .lo-opt-label span{font-size:11px}
  .last-orders-root button.lo-card{width:100px}
}
`;

// Focus layouts: render.js sets data-lo-focus on the play root to say what the
// screen is FOR right now ("act keep", "act big play", "act big gamble", …,
// or "watch"), and these rules re-shape the table around that one task: the
// cards I'm deciding on get big and readable, everything else shrinks.
const F = (t) => `.last-orders-root[data-lo-focus~="${t}"]`;
const FOCUS = `
/* any decision of mine: compact the rest of the table */
${F("act")} .lo-seat{flex:1 0 132px;padding:5px 7px;gap:6px}
${F("act")} .lo-seat-face svg{width:36px;height:36px}
${F("act")} .lo-seat-misc{display:none}
${F("act")} .lo-myseat{padding:5px 8px}
${F("act")} .lo-myseat .lo-seat-face svg{width:40px;height:40px}
${F("act")} .lo-myseat .lo-seat-name{font-size:14px}
${F("act")} .lo-myseat .lo-stat{font-size:13px}
${F("act")} .lo-bar-main:has(> .lo-stack-empty:not(.lo-gamble-call)){display:none}
${F("act")} .lo-bar:has(.lo-bar-main > .lo-stack-empty:not(.lo-gamble-call)) .lo-lastdrink{display:none}
${F("act")} .lo-bar-head{min-height:32px}
${F("act")} .lo-event,${F("act")} .lo-lastdrink{padding:4px 8px;font-size:11.5px}
${F("act")} .lo-lastdrink-art,${F("act")} .lo-lastdrink-art svg{width:28px;height:28px}
${F("act")} .lo-log li:nth-last-child(n+3){display:none}
${F("act")} .lo-controls{min-height:0}
${F("act")} .lo-prompt{font-size:15px}
${F("act")} .lo-btn{height:48px;font-size:16px}
${F("act")} .lo-btns{flex-wrap:nowrap}
${F("act")} .lo-btns .lo-btn:not(.lo-btn-primary){flex:none}
${F("act")} .lo-target{height:42px;padding:0 14px;font-size:15px;border-radius:21px}
${F("act")} .lo-detail{font-size:14px}

/* keep-or-draw: the whole hand as a readable list, art beside the words */
${F("keep")} .lo-lastdrink{display:none}
${F("keep")} .lo-hand-row{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;overflow:visible;padding:4px 10px 8px;scroll-snap-type:none}
${F("keep")} button.lo-card{width:auto;min-height:0;display:grid;grid-template-columns:84px minmax(0,1fr);grid-template-rows:auto auto 1fr;column-gap:12px;align-items:start;text-align:left;padding:6px 40px 6px 6px}
${F("keep")} .lo-card-art{grid-row:1 / span 3;padding:0}
${F("keep")} .lo-card-art svg{width:84px;height:84px}
${F("keep")} .lo-card-kind{margin:2px 0 0;justify-self:start;font-size:10.5px}
${F("keep")} .lo-card-name{font-size:17px;padding:3px 0 0}
${F("keep")} .lo-card-text{font-size:14px;line-height:1.3;color:var(--lo-card-ink);padding:2px 0 0}
${F("keep")} .lo-card.lo-discard{transform:none;opacity:.6}
${F("keep")} .lo-card-mark{top:50%;right:8px;width:30px;height:30px;margin-top:-15px;font-size:16px}

/* playing, answering, gambling, ordering: big cards, the unplayable ones tuck in small */
${F("big")} .lo-hand-row{align-items:flex-start;padding-top:10px}
${F("big")} button.lo-card{touch-action:pan-x}
${F("big")} button.lo-card{width:154px}
${F("big")} .lo-card-kind{font-size:10.5px}
${F("big")} .lo-card-name{font-size:15.5px}
${F("big")} .lo-card-text{font-size:13px;line-height:1.3;color:var(--lo-card-ink)}
${F("big")} button.lo-card.lo-dim{width:96px}
${F("big")} .lo-card.lo-dim .lo-card-text{display:none}
${F("big")} .lo-card.lo-dim .lo-card-name{font-size:12px}

/* defending (any answer window, gamble too): the attacking card large, and
   only the cards I can answer with right beneath it (with the playable help on) */
${F("react")} .lo-stack-card.lo-stack-top{width:168px}
${F("react")} .lo-stack-top .lo-face-name{font-size:16px}
${F("react")} .lo-stack-top .lo-face-text{font-size:13px;color:var(--lo-card-ink)}
${F("react")} .lo-stack-who{font-size:12px}
${F("react")} .lo-bar-side{display:none}
${F("react")} .lo-hand-row,${F("act")}${F("gamble")} .lo-hand-row{justify-content:safe center}
${F("react")} .lo-card.lo-dim,${F("act")}${F("gamble")} .lo-card.lo-dim{display:none}
${F("react")} .lo-hand:not(:has(.lo-card:not(.lo-dim))),${F("act")}${F("gamble")} .lo-hand:not(:has(.lo-card:not(.lo-dim))){display:none}

/* the gamble: the pot and who leads take the stage */
${F("gamble")} .lo-bar-side{order:1}
${F("gamble")} .lo-bar-main{order:2;min-height:0}
${F("gamble")} .lo-bar-main:has(.lo-stack){min-height:190px}
${F("gamble")} .lo-event,${F("gamble")} .lo-lastdrink{display:none}
${F("gamble")} .lo-pot{flex:1 1 100%;padding:12px 16px;gap:16px}
${F("gamble")} .lo-pot-pile{width:66px;height:52px;transform:scale(1.5);transform-origin:left bottom}
${F("gamble")} .lo-pot-text{gap:4px}
${F("gamble")} .lo-pot-text b{font-size:28px;line-height:1}
${F("gamble")} .lo-pot-text span{font-size:16px;font-weight:800}
${F("gamble")} .lo-pot-text svg{width:36px;height:36px;border-radius:9px}
${F("gamble")} .lo-gamble-call{font-size:16px;padding:12px 16px;max-width:none}
${F("act")}${F("gamble")} .lo-bar-main:has(> .lo-gamble-call){display:none}

/* buying a drink: the people are the choice */
${F("order")} .lo-target{height:48px;padding:0 18px;font-size:17px;border-radius:24px}
${F("order")} .lo-target .lo-dot{width:14px;height:14px}
${F("order")} .lo-targets{font-size:14px}
${F("order")} .lo-targets > span{flex-basis:100%}

/* phone: my hand right under the bar, the buttons pinned to the bottom edge */
@media (max-width:899px){
  ${F("act")} .lo-primer{display:none}
  ${F("act")} .lo-opps{order:1}
  ${F("act")} .lo-bar{order:2}
  ${F("act")} .lo-mine{order:3}
  ${F("act")} .lo-hand{order:4}
  ${F("act")} .lo-controls{order:5;position:sticky;bottom:8px;z-index:14;box-shadow:0 -6px 22px rgba(0,0,0,.22)}
  ${F("act")} .lo-ticker{order:6}
  ${F("react")} .lo-bar{order:1}
  ${F("react")} .lo-hand{order:2}
  ${F("react")} .lo-controls{order:3}
  ${F("react")} .lo-mine{order:4}
  ${F("react")} .lo-opps{order:5}
  ${F("react")} .lo-hand{margin-top:-14px;padding-top:12px}
  ${F("act")} .lo-toast{order:7}
}
@media (min-width:560px){
  ${F("keep")} .lo-hand-row{grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
}
@media (min-width:900px){
  ${F("big")} button.lo-card{width:170px}
}
`;

const DARK = `
:root[data-theme="dark"] .last-orders-root{
  --lo-ink:#f1e6d4;--lo-muted:#b2a28b;--lo-panel:#2a211b;--lo-panel-2:#342a22;--lo-line:#4a3c30;--lo-chip:#3a2f26;
  --lo-accent:#e9a24f;--lo-accent-ink:#1d1208;--lo-btn:#c4583a;--lo-btn-ink:#fff;--lo-btn-2:#342a22;
  --lo-good:#6fc47a;--lo-bad:#ff8a80;--lo-info:#e9b86b;--lo-win:#3d3318;
  --lo-grit:#e0566a;--lo-grit-track:rgba(224,86,106,.18);--lo-buzz:#e07aac;--lo-gold:#f0c14b;
  --lo-turn:#f5b443;--lo-target:#6aa6e6;--lo-shadow:0 2px 12px rgba(0,0,0,.45);
  --lo-k-action:#c4583a;--lo-k-reaction:#4a82c0;--lo-k-gamble:#9264bf;--lo-k-spike:#56a050;--lo-k-drink:#3a9482;--lo-k-event:#b58035;
  --lo-wood:#4a3222;--lo-wood-ink:#f6ead0;--lo-card:#3a2f27;--lo-card-ink:#f6ead0;--lo-glow:rgba(255,196,64,.6);
}
:root[data-theme="dark"] .last-orders-root .lo-wait-chip.lo-done{background:#22402a;color:#9fe0a8}
:root[data-theme="dark"] .last-orders-root .lo-float{text-shadow:0 1px 0 #000,0 0 6px rgba(0,0,0,.8)}
:root[data-theme="dark"] .last-orders-root .lo-float-buzz{color:#f5a3c8}
`;

export const LAST_ORDERS_CSS = LIGHT + PLAY + FOCUS + DARK;
