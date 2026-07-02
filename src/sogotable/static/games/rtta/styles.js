// Roll Through the Ages — scoped styles (injected once by render.js, NOT added to
// styles-games.css). Every rule is prefixed under `.rtta-root` so the prototype's
// generic class names (.die/.row/.box/.page/...) never touch the app shell; the
// bronze/parchment palette lives on `.rtta-root` as CSS tokens. Keyframes and the
// body-appended flyer are renamed `rtta-*` so they can't collide with other games.
//
// The game's identity is a dark bronze board, so the same palette reads on both
// shell themes (a game board on a light page looks intentional, like Yahtzee's
// white dice on dark); the dark block below just deepens a couple of surfaces.
export const RTTA_CSS = `
/* neutralize the tic-tac-toe macro-board grid + square so the tall RToA UI lays out normally */
#macroBoard:has(.rtta-root){display:block;aspect-ratio:auto;height:auto}
/* the shell turn-status banner would leave a blank band above the board — collapse it */
#turnStatus:has(~ #macroBoard .rtta-root){display:none}

.rtta-root{
  --bg:#1b1410;--panel:#2a2018;--edge:#4a3a2a;--gold:#d8a33a;--ink:#f3e7d2;--muted:#b09a7c;--skull:#c2452f;
  grid-column:1/-1;width:100%;max-width:480px;margin:0 auto;color:var(--ink);
  font-family:"Trebuchet MS",system-ui,sans-serif;display:flex;flex-direction:column;align-items:center}
.rtta-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.rtta-root h1{font-size:1.2rem;margin:0 0 2px;letter-spacing:.5px;color:var(--gold);text-align:center}
.rtta-root .sub{color:var(--muted);font-size:.7rem;text-align:center}

/* fixed shell: header + tabs stay put, only the active page area changes */
.rtta-root .app-header{width:100%;flex:0 0 auto;padding:4px 4px 6px}
.rtta-root .tabs{display:flex;gap:4px;margin-top:8px}
.rtta-root .tabs button{flex:1;padding:8px 2px;font-size:.6rem;line-height:1.1;background:var(--panel);
  border:1px solid var(--edge);border-radius:8px;color:var(--muted);cursor:pointer;letter-spacing:.1px;white-space:nowrap}
.rtta-root .tabs button.active{background:var(--gold);color:#2a1c08;border-color:var(--gold);font-weight:bold}
@keyframes rtta-softblink{0%,100%{background:#2a2018;border-color:#4a3a2a}50%{background:#4a3a2a;border-color:#d8a33a}}
.rtta-root .tabs button.done{animation:rtta-softblink 1.4s ease-in-out infinite;color:var(--gold)}

.rtta-root .tipstrip{margin-top:8px;padding:7px 10px;background:#221a12;border:1px solid var(--edge);
  border-left:3px solid var(--gold);border-radius:8px;font-size:.66rem;color:var(--muted);line-height:1.35}
.rtta-root .tipstrip b{color:var(--gold)}
.rtta-root .tipstrip.alert{color:var(--gold);animation:rtta-blink 1s ease-in-out infinite}

.rtta-root .window{width:100%;flex:1 1 auto;min-height:0;max-height:72vh;overflow:hidden;padding:12px 6px 14px}
.rtta-root .page{height:100%;overflow-y:auto;display:none;flex-direction:column;align-items:center}
.rtta-root .page.active{display:flex}
.rtta-root .page-title{display:none}

/* dice tray */
.rtta-root .tray{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;width:100%;max-width:360px;margin-bottom:12px}
.rtta-root .die{width:100%;aspect-ratio:1/1;min-width:0;overflow:hidden;
  background:linear-gradient(160deg,#fbf3e2,#e3d2b2);border:1px solid #c8b48c;border-radius:14px;
  box-shadow:0 4px 0 #9c8458,0 6px 10px rgba(0,0,0,.45);display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:1px;color:#3a2c18;user-select:none;cursor:pointer}
.rtta-root .die .emojis{font-size:1.6rem;line-height:1;white-space:pre-line;text-align:center}
.rtta-root .die.bigface .emojis{font-size:2.4rem}
.rtta-root .die.coinface .emojis{font-size:2.9rem}
.rtta-root .die.skull{background:linear-gradient(160deg,#f4d9cf,#e0a596);border-color:#c98a78}
.rtta-root .die.skull .label{color:var(--skull)}
@keyframes rtta-tumble{0%{transform:rotate(0)}25%{transform:rotate(-16deg)}50%{transform:rotate(12deg)}75%{transform:rotate(-8deg)}100%{transform:rotate(0)}}
.rtta-root .die.rolling{animation:rtta-tumble .5s ease-in-out infinite}
.rtta-root .die.roll{background:linear-gradient(160deg,#e7b84c,#b87f24);border-color:#b87f24;color:#2a1c08;
  font-weight:bold;font-size:.95rem;letter-spacing:.5px;box-shadow:0 4px 0 #835912,0 6px 10px rgba(0,0,0,.45);cursor:pointer}
.rtta-root .die.roll:active{transform:translateY(3px);box-shadow:0 1px 0 #835912}
.rtta-root .die.roll.busy{filter:grayscale(.4) brightness(.85);cursor:default}
.rtta-root .die.empty{visibility:hidden}
.rtta-root .die.roll.bank{background:linear-gradient(160deg,#6fc04a,#3f8f2a);border-color:#3f8f2a;color:#16300c;
  box-shadow:0 4px 0 #2c6b1d,0 6px 10px rgba(0,0,0,.45)}
.rtta-root .die.roll.bank:active{box-shadow:0 1px 0 #2c6b1d}
.rtta-root .die.locked{background:linear-gradient(160deg,#d7f0c0,#aed988);border-color:#84bf5e}
.rtta-root .die.locked .label{color:#3f6324}
.rtta-root .die.locked .label::after{content:' 🔒'}

.rtta-root .hint{color:var(--muted);font-size:.72rem;margin-bottom:20px;text-align:center}
.rtta-root .hint b{color:var(--gold)}

/* tally */
.rtta-root .tally{width:100%;max-width:420px;background:var(--panel);border:1px solid var(--edge);border-radius:14px;padding:12px 14px;margin-bottom:12px}
.rtta-root .tally h2{font-size:.8rem;color:var(--muted);margin:0 0 10px;text-transform:uppercase;letter-spacing:1px}
.rtta-root .tally-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.rtta-root .stat{text-align:center;background:#221a12;border-radius:10px;padding:8px 4px}
.rtta-root .stat .icon{font-size:1.3rem}
.rtta-root .stat .val{font-size:1.4rem;font-weight:bold;color:var(--gold)}
.rtta-root .stat .nm{font-size:.58rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}
.rtta-root .stat.danger .val{color:var(--skull)}
.rtta-root .tally.oneline{padding:8px 6px}
.rtta-root .tally.oneline .tally-grid{grid-template-columns:repeat(5,1fr);gap:4px}
.rtta-root .tally.oneline .stat{display:flex;align-items:center;justify-content:center;gap:4px;padding:6px 2px}
.rtta-root .tally.oneline .stat .icon{font-size:1.15rem}
.rtta-root .tally.oneline .stat .meta{display:flex;flex-direction:column;align-items:flex-start;line-height:1}
.rtta-root .tally.oneline .stat .val{font-size:1rem;color:var(--gold)}
.rtta-root .tally.oneline .stat.danger .val{color:var(--skull)}
.rtta-root .tally.oneline .stat .nm{font-size:.46rem;color:var(--muted);text-transform:uppercase;letter-spacing:.3px}

/* blocks / rows */
.rtta-root .block{background:var(--panel);border:1px solid var(--edge);border-radius:12px;padding:10px 12px;margin-bottom:12px}
.rtta-root .block h3{margin:0 0 8px;font-size:.72rem;color:var(--gold);text-transform:uppercase;letter-spacing:1px;
  display:flex;justify-content:space-between;align-items:baseline}
.rtta-root .block h3 small{color:var(--muted);font-weight:normal;letter-spacing:.3px}
.rtta-root .boxrow{display:flex;flex-wrap:wrap;gap:4px}
.rtta-root .box{width:19px;height:19px;border:1px solid #6a543a;border-radius:4px;background:#1f1710;cursor:pointer;
  flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:.58rem;color:#7a6038;user-select:none}
.rtta-root .box.filled{background:var(--gold);border-color:var(--gold);color:#2a1c08}
.rtta-root .box.start{background:#4a3a2a;border-color:#6a543a;color:var(--muted);cursor:default}
.rtta-root .row{display:grid;align-items:center;gap:8px;padding:5px 0;border-top:1px solid #36291d}
.rtta-root .row:first-of-type{border-top:none}
.rtta-root .row .nm{font-size:.78rem}
.rtta-root .row .vp{font-size:.62rem;color:var(--muted);white-space:nowrap}
.rtta-root .row .vp b{color:var(--gold);font-size:.8rem}
.rtta-root .row.dev{grid-template-columns:auto 88px 1fr auto}
.rtta-root .row.dev .cost{background:#34281d;border:1px solid var(--edge);border-radius:7px;padding:3px 7px;
  font-size:.74rem;color:var(--gold);cursor:pointer;min-width:34px;text-align:center}
.rtta-root .row.dev.bought .cost,.rtta-root .row.dev.locked .cost{background:var(--gold);color:#2a1c08}
.rtta-root .row.dev.bought .nm,.rtta-root .row.dev.locked .nm{text-decoration:line-through;color:var(--muted)}
.rtta-root .row.dev .ab{font-size:.58rem;color:var(--muted)}
.rtta-root .row.dev.paying{outline:1px solid var(--gold);outline-offset:-1px}
.rtta-root .row.dev.unaffordable{opacity:.38}

/* score table on the Discard tab */
.rtta-root .scoretab{width:100%;border-collapse:collapse;font-size:.72rem}
.rtta-root .scoretab th,.rtta-root .scoretab td{padding:5px 4px;text-align:center;border-bottom:1px solid #36291d}
.rtta-root .scoretab th{color:var(--muted);text-transform:uppercase;font-size:.54rem;letter-spacing:.5px}
.rtta-root .scoretab th:first-child,.rtta-root .scoretab td:first-child{text-align:left;color:var(--ink)}
.rtta-root .scoretab td b{color:var(--gold);font-size:.95rem}
.rtta-root .scoretab tr.me td{background:rgba(216,163,58,.12)}
.rtta-root .scoretab tr.win td b{color:#6fc04a}

/* goods value chart */
.rtta-root .goods .grow{display:grid;grid-template-columns:64px repeat(8,1fr);align-items:center;column-gap:4px;padding:2px 0}
.rtta-root .goods .gname{font-size:.66rem;white-space:nowrap}
.rtta-root .goods .gv{text-align:center;font-size:.58rem;height:20px;line-height:19px;border:1px solid #4a3a2a;
  border-radius:4px;background:#1f1710;color:var(--muted);cursor:pointer}
.rtta-root .goods .gv.filled{background:var(--gold);border-color:var(--gold);color:#2a1c08}

.rtta-root .dis{display:flex;flex-direction:column;gap:3px;font-size:.7rem}
.rtta-root .drow{display:grid;grid-template-columns:58px 1fr;gap:10px;align-items:center;padding:3px 6px;border-radius:6px}
.rtta-root .drow .sk{color:var(--skull);white-space:nowrap}
.rtta-root .drow .ef{color:var(--ink)}
.rtta-root .drow.hit{background:rgba(194,69,47,.28);outline:1px solid var(--skull)}

/* cities as little buildings */
.rtta-root #cityRow{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;justify-content:center}
.rtta-root .city{display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer}
.rtta-root .city .num{font-size:.52rem;color:var(--muted)}

/* monuments as shaped box clusters */
.rtta-root #monArea{display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-end;align-content:flex-start;
  gap:14px 10px;position:relative;padding-right:56px;min-height:165px;margin-top:8px}
.rtta-root .mbreak{width:100%;height:0}
.rtta-root .mon.wide{width:100%;align-items:stretch}
.rtta-root .mon.tall{position:absolute;right:2px;top:4px;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end}
.rtta-root .mon.tall .monsvg{flex:1 1 0;min-height:0;width:auto;height:auto}
.rtta-root .mon.tall .mon-foot{flex:0 0 auto;min-height:26px}
.rtta-root .mon{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px;cursor:pointer}
.rtta-root .mon-foot{text-align:center;line-height:1.3}
.rtta-root .mname{display:block;color:var(--ink);font-size:.62rem}
.rtta-root .mscore{display:inline-block;background:#34281d;border:1px solid var(--edge);border-radius:7px;padding:0 7px;color:var(--muted);font-weight:bold;font-size:.72rem}
.rtta-root .mon.built .mscore{background:var(--gold);border-color:var(--gold);color:#2a1c08}
.rtta-root .monsvg,.rtta-root .citysvg{display:block}
.rtta-root .mon.wide .monsvg{width:100%;height:auto}
.rtta-root .art{fill:#4a3a2a;stroke:#5a4632;stroke-width:1.2;stroke-linejoin:round}
.rtta-root .artdim{fill:#33271a}
.rtta-root .green{fill:#5f9438}
.rtta-root .wbox rect{fill:#1f1710;stroke:#7a6038;stroke-width:1.2;cursor:pointer}
.rtta-root .wbox text{text-anchor:middle;dominant-baseline:central;opacity:0;pointer-events:none;user-select:none}
.rtta-root .wbox.filled rect{fill:#2a2018;stroke:var(--gold)}
.rtta-root .wbox.other rect{fill:#1c2a33;stroke:#5aa0c8}
.rtta-root .wbox.filled text,.rtta-root .wbox.other text{opacity:1}
.rtta-root .citydie{opacity:.18}
.rtta-root .city.done .citydie{opacity:1}

/* disaster points-lost grid, grouped in threes */
.rtta-root #disBoxes{display:flex;flex-direction:column;gap:8px;align-items:center}
.rtta-root .disrow{display:flex;justify-content:center;gap:20px}
.rtta-root .disgroup{display:flex;gap:4px}
.rtta-root .box.em-food.filled,.rtta-root .box.em-skull.filled{background:#2a2018;border-color:var(--gold)}
.rtta-root .box.em-food.filled::after{content:'🌾';font-size:12px;line-height:1}
.rtta-root .box.em-skull.filled::after{content:'💀';font-size:12px;line-height:1}
.rtta-root #page-dice > .block{width:100%;max-width:420px}
.rtta-root #foodRoll{justify-content:space-between}
@keyframes rtta-flashRed{from{background:#c2452f}to{background:#1f1710}}
.rtta-root .box.flash-red{animation:rtta-flashRed .4s ease-out}

/* choice die / ready blinks */
@keyframes rtta-blink{0%,100%{opacity:1}50%{opacity:.32}}
.rtta-root .die.choice-pending{animation:rtta-blink .8s ease-in-out infinite;outline:2px solid var(--gold);outline-offset:-2px}
.rtta-root .die.roll.bank.ready{animation:rtta-blink .9s ease-in-out infinite}
/* Leadership armed: any die may be rerolled once after the final roll */
.rtta-root .die.lead-glow{outline:2px dashed var(--gold);outline-offset:-2px}
/* a disaster row a development/monument covers explains itself in green */
.rtta-root .drow.immune .ef{color:#5fae3a}
.rtta-root .drow.immune .sk{opacity:.45}
.rtta-root .die.fed{box-shadow:inset 0 0 0 3px #5fae3a,0 4px 0 #9c8458,0 6px 10px rgba(0,0,0,.45)}

/* build page workers-to-spend + dev payment chips */
.rtta-root .big-stat{font-size:1.7rem;color:var(--gold);font-weight:bold;text-align:center}
.rtta-root #page-build > .block{width:100%;max-width:460px}
.rtta-root .cashchip.pay{cursor:pointer}
.rtta-root .cashchip.pay.on{background:var(--gold);border-color:var(--gold);color:#2a1c08}
.rtta-root .paylbl{color:var(--muted)}
.rtta-root .paystat{font-weight:bold;color:var(--skull)}
.rtta-root .paystat.ok{color:#5fae3a}
.rtta-root .paybuy{background:#2a3a1e;border:1px solid #5fae3a;color:#cdebbf;cursor:pointer}

/* purchasing-power strip on the Dev page */
.rtta-root .power{display:flex;gap:4px;width:100%;max-width:420px;margin-bottom:10px;flex:0 0 auto}
.rtta-root .power .pcell{flex:1;background:#221a12;border:1px solid var(--edge);border-radius:10px;padding:6px 2px;display:flex;align-items:center;justify-content:center;gap:4px}
.rtta-root .power .pcell.total{border-color:var(--gold)}
.rtta-root .power .picon{font-size:1.15rem}
.rtta-root .power .pmeta{display:flex;flex-direction:column;align-items:flex-start;line-height:1}
.rtta-root .power .pval{font-size:1rem;font-weight:bold;color:var(--gold)}
.rtta-root .power .plabel{font-size:.46rem;color:var(--muted);text-transform:uppercase;letter-spacing:.3px}
.rtta-root .goods-cash{width:100%;max-width:460px;margin:-2px 0 10px;font-size:.62rem;display:flex;flex-wrap:wrap;gap:6px;align-items:center;flex:0 0 auto}
.rtta-root .goods-cash .cashchip{background:#34281d;border:1px solid var(--edge);border-radius:7px;padding:2px 7px;color:var(--gold)}
.rtta-root .goods-cash button.cashchip{font:inherit;font-size:.62rem;cursor:pointer}
.rtta-root .nodis{color:var(--muted);font-size:.72rem}

/* barrier / review status + submit button */
.rtta-root .rtta-status{width:100%;max-width:460px;text-align:center;color:var(--muted);font-size:.74rem;margin:6px 0 10px}
.rtta-root .rtta-submit,.rtta-root .rtta-ready{margin:8px auto;padding:12px 22px;background:linear-gradient(160deg,#e7b84c,#b87f24);
  color:#2a1c08;font-weight:bold;border:none;border-radius:12px;box-shadow:0 4px 0 #835912;cursor:pointer;font-size:.95rem;letter-spacing:.3px}
.rtta-root .rtta-submit:active,.rtta-root .rtta-ready:active{transform:translateY(3px);box-shadow:0 1px 0 #835912}
.rtta-root .rtta-submit.ready,.rtta-root .rtta-ready.blink{animation:rtta-blink 1s ease-in-out infinite}
.rtta-root .rtta-event{color:var(--skull);font-weight:bold}
/* a standings row struck by a cross-player disaster flashes red as its total ticks down */
.rtta-root .scoretab tr.rtta-hit td{animation:rtta-flashRed .6s ease-out}
.rtta-root .scoretab tr.rtta-hit .tot b{color:var(--skull)}

/* body-appended flyer (fixed position — lives OUTSIDE .rtta-root, so global) */
.rtta-fly{position:fixed;z-index:99999;font-size:1.3rem;pointer-events:none;transition:transform .55s ease-in,opacity .55s ease-in}
.rtta-fly.arc{animation:rtta-flyArc .95s cubic-bezier(.45,0,.55,1) forwards}
@keyframes rtta-flyArc{
  0%{transform:translate(0,0) rotate(0deg) scale(1);opacity:1}
  45%{transform:translate(calc(var(--dx) * .5),calc(var(--dy) * .5 - 55px)) rotate(200deg) scale(1.25);opacity:1}
  100%{transform:translate(var(--dx),var(--dy)) rotate(360deg) scale(.85);opacity:.95}}

/* dark theme: the bronze board deepens slightly on a dark shell */
:root[data-theme="dark"] .rtta-root{--bg:#140f0b;--panel:#241b13;--edge:#4a3a2a}
`;
