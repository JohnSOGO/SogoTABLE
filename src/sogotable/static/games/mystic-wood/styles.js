// The Mystic Wood — scoped board styles, LIFTED from the AI/Mystic_Wood prototype. EVERY generic
// selector is scoped under `.mystic-wood-root` (which also wraps body-appended modals/peeks) so nothing
// collides with or leaks into the shell. Injected once by render.js. Dark default + light remap.
export const MYSTIC_WOOD_CSS = `
#macroBoard:has(.mystic-wood-root){display:block;aspect-ratio:auto;background:none;border:none;box-shadow:none;padding:0;width:100%;gap:0;}
.mystic-wood-root{
  --bg:#141a0f; --panel:#1c2413; --panel2:#232d18; --ink:#ece5d0; --muted:#9aa07e;
  --rule:#3a4526; --gold:#c9a24a; --gold2:#e0bd63; --gold-bright:#e0bd63; --crimson:#c9564c; --azure:#7d9dce;
  --earth-h1:#5e8040; --earth-h2:#3c5626; --earth-h3:#28401c; --earth-road:#c7aa78; --earth-leaf:#7d9a4d;
  --ench-h1:#379a80; --ench-h2:#1f5244; --ench-h3:#123528; --ench-road:#aeb8c6; --ench-leaf:#4fae91;
  --serif:"Hoefler Text","Iowan Old Style",Georgia,serif; --sans:system-ui,"Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,Menlo,Consolas,monospace;
  color:var(--ink); font-family:var(--sans); display:flex; flex-direction:column; width:100%; box-sizing:border-box; position:relative;
}
:root[data-theme="light"] .mystic-wood-root{
  --bg:#efe9d6; --panel:#f4efe1; --panel2:#e8e1cd; --ink:#2b2a22; --muted:#6f6a58; --rule:#d6cdb2;
  --gold:#a9832f; --gold2:#8a6b23; --gold-bright:#8a6b23; --crimson:#b34840; --azure:#2f6db0;
  --earth-h1:#9db866; --earth-h2:#c6d3a4; --earth-h3:#d9e0c2; --earth-road:#c7aa78; --earth-leaf:#8aa64f;
  --ench-h1:#7fc4b0; --ench-h2:#c3ddd4; --ench-h3:#d7e6e0; --ench-road:#aeb8c6; --ench-leaf:#7fb8a6;
}
.mystic-wood-root *{box-sizing:border-box}
.mystic-wood-root h1,.mystic-wood-root h2,.mystic-wood-root h3{font-family:var(--serif);font-weight:600;font-variant:small-caps;letter-spacing:.02em;margin:0}
.mystic-wood-root button{font-family:var(--sans);cursor:pointer;border-radius:8px;border:1px solid var(--rule);background:var(--panel2);color:var(--ink);padding:8px 14px;font-size:13px;line-height:1.1;transition:.12s}
.mystic-wood-root button:hover:not(:disabled){border-color:var(--gold);background:color-mix(in srgb,var(--panel2) 70%,var(--gold) 12%)}
.mystic-wood-root button:disabled{opacity:.4;cursor:not-allowed}
.mystic-wood-root button.primary{background:var(--gold);color:#20260f;border-color:var(--gold);font-weight:600}
.mystic-wood-root button.primary:hover{background:var(--gold2)}
.mystic-wood-root .tag{font-family:var(--sans);text-transform:uppercase;letter-spacing:.22em;font-size:10px;color:var(--gold)}

/* single-column layout (the developed phone layout, used on every device) */
.mystic-wood-root .mw-topbar{display:flex;align-items:center;gap:6px;height:46px;padding:0 8px;background:var(--panel);border-bottom:1px solid var(--rule);border-radius:10px 10px 0 0}
.mystic-wood-root .mw-topbar button{padding:7px 9px;font-size:12px;white-space:nowrap}
.mystic-wood-root .mw-tb-turn{flex:1;min-width:0;text-align:center;font-family:var(--serif);font-size:15px;font-variant:small-caps;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--gold2)}
.mystic-wood-root .mw-status{background:var(--panel);border-bottom:1px solid var(--rule);padding:6px 8px}
.mystic-wood-root .mw-boardwrap{position:relative;overflow:hidden;width:100%;aspect-ratio:7/6.6;background:#0f1409;border-left:1px solid var(--rule);border-right:1px solid var(--rule)}
:root[data-theme="light"] .mystic-wood-root .mw-boardwrap{background:#c9d0b4}
.mystic-wood-root .board{--cell:96px;position:absolute;top:0;left:0;transform-origin:0 0;display:grid;grid-template-columns:repeat(7,var(--cell));grid-auto-rows:calc(var(--cell)*0.72);gap:3px;padding:8px}
.mystic-wood-root .cell{position:relative;display:block;aspect-ratio:auto;border-radius:5px;overflow:hidden;outline:2px solid transparent;transition:outline-color .1s;background:none;border:none;box-shadow:none;margin:0;padding:0;min-width:0;min-height:0;font-size:inherit;font-weight:inherit;touch-action:manipulation}
.mystic-wood-root .cell svg{display:block;width:100%;height:100%}
.mystic-wood-root .cell.reachable{outline-color:var(--gold);cursor:pointer}
.mystic-wood-root .cell.reachable:hover{outline-color:var(--gold2)}
.mystic-wood-root .cell.current{outline-color:var(--crimson)}
.mystic-wood-root .tok{position:absolute;width:26px;height:26px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px #000a;display:grid;place-items:center;font-family:var(--serif);font-weight:700;font-size:15px;color:#fff;z-index:3;will-change:transform}
.mystic-wood-root .cardmark{position:absolute;right:3px;bottom:3px;background:#0009;border:1px solid var(--gold);border-radius:4px;font-size:9px;padding:1px 4px;color:var(--gold2);z-index:2;max-width:88%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.mystic-wood-root .infomark{position:absolute;right:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#000a;border:1px solid var(--gold);color:var(--gold2);font-size:10px;display:grid;place-items:center;z-index:3;line-height:1;cursor:help}
.mystic-wood-root .facedown{position:absolute;inset:0;background:repeating-linear-gradient(45deg,#463b23,#463b23 6px,#3d3320 6px,#3d3320 12px);display:grid;place-items:center}
.mystic-wood-root .facedown::after{content:"";width:34%;height:48%;border:2px solid #7d653399;border-radius:50% 50% 50% 50%/60% 60% 40% 40%}
.mystic-wood-root .mw-legend{display:flex;gap:5px;overflow-x:auto;flex-wrap:nowrap;padding:5px 8px;background:var(--panel);border-top:1px solid var(--rule)}
.mystic-wood-root .mw-legend::-webkit-scrollbar{height:0}
.mystic-wood-root .mw-legbadge{flex:none;white-space:nowrap;font-size:11px;background:var(--panel2);border:1px solid var(--rule);border-radius:99px;padding:2px 9px;color:var(--gold2);cursor:pointer}
.mystic-wood-root .mw-leg-empty{font-size:11px;color:var(--muted)}
.mystic-wood-root .mw-pulse{animation:mw-pulse .9s ease-in-out infinite;border-color:#7be07b}
@keyframes mw-pulse{0%,100%{box-shadow:0 0 0 0 rgba(123,224,123,0)}50%{box-shadow:0 0 0 5px rgba(123,224,123,.5)}}
.mystic-wood-root .cardmark.mw-pulse{outline:2px solid #7be07b}
.mystic-wood-root .mw-log{height:84px;overflow-y:auto;background:var(--panel);border-top:1px solid var(--rule);padding:5px 8px;font-size:11.5px;line-height:1.4}
.mystic-wood-root .mw-actions{display:flex;justify-content:center;align-items:center;gap:6px;padding:6px 8px;background:var(--panel);border-top:1px solid var(--rule);overflow-x:auto;flex-wrap:nowrap;border-radius:0 0 10px 10px}
.mystic-wood-root .mw-actions button{font-size:12px;padding:8px 11px;white-space:nowrap;flex:0 0 auto;width:auto;height:auto}

/* knight strip (status) */
.mystic-wood-root .pstrip{display:flex;flex-direction:column;gap:3px}
.mystic-wood-root .pstrip-r1{display:flex;align-items:center;gap:7px;min-width:0}
.mystic-wood-root .pstrip-name{font-family:var(--serif);font-size:15px;font-weight:600;flex:none}
.mystic-wood-root .pstrip-r1 .stats{flex:none;font-size:12px;gap:7px}
.mystic-wood-root .pstrip-quest{flex:1;min-width:0;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mystic-wood-root .pstrip-badges{display:flex;align-items:center;gap:4px;overflow-x:auto;flex-wrap:nowrap;padding-bottom:1px}
.mystic-wood-root .pstrip-badges::-webkit-scrollbar{height:0}
.mystic-wood-root .pstrip-badges .chip,.mystic-wood-root .pstrip-badges .badge{flex:none;white-space:nowrap}

/* knight cards + chips + badges */
.mystic-wood-root .card{background:var(--panel);border:1px solid var(--rule);border-radius:12px;padding:12px;margin-bottom:12px}
.mystic-wood-root .pl{display:flex;flex-direction:column;gap:6px}
.mystic-wood-root .pl.active{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold) inset}
.mystic-wood-root .plhead{display:flex;align-items:center;gap:8px}
.mystic-wood-root .crest{width:30px;height:30px;border-radius:50%;border:2px solid var(--gold);display:grid;place-items:center;font-family:var(--serif);font-weight:700;color:#fff;font-size:15px;flex:none}
.mystic-wood-root .plname{font-family:var(--serif);font-size:17px;font-weight:600}
.mystic-wood-root .stats{display:inline-flex;gap:10px;font-family:var(--mono);font-size:13px}
.mystic-wood-root .pP{color:var(--azure)} .mystic-wood-root .pS{color:var(--crimson)}
.mystic-wood-root .quest{font-size:11.5px;color:var(--muted)}
.mystic-wood-root .inv{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}
.mystic-wood-root .chip{font-size:10px;background:var(--panel2);border:1px solid var(--rule);border-radius:99px;padding:1px 7px;color:var(--gold2)}
.mystic-wood-root .chip.comp{color:var(--azure);border-color:#3a4a66}
.mystic-wood-root .badge{font-size:10px;background:#5a2320;border:1px solid #a33;border-radius:99px;padding:1px 7px;color:#e8a}
.mystic-wood-root .holdable{cursor:help;user-select:none;-webkit-user-select:none}

/* slide-over panels (Knights / Chronicle) */
.mystic-wood-root.mw-panelover{position:fixed;top:0;bottom:0;width:88%;max-width:340px;z-index:60;background:linear-gradient(#1a2211,#161d0d);transition:transform .2s ease;box-shadow:0 0 44px #000b;overflow-y:auto;padding:16px}
:root[data-theme="light"] .mystic-wood-root.mw-panelover{background:linear-gradient(#f1ecdc,#e7e1cd)}
.mystic-wood-root.mw-knights{left:0;transform:translateX(-102%);border-right:2px solid var(--gold)}
.mystic-wood-root.mw-chronicle{right:0;transform:translateX(102%);border-left:2px solid var(--gold)}
.mystic-wood-root.mw-panelover.open{transform:translateX(0)}
.mw-backdrop{position:fixed;inset:0;background:#0008;z-index:55}
.mystic-wood-root .le{padding:3px 0;border-bottom:1px solid #ffffff08}
.mystic-wood-root .le b{color:var(--gold2)} .mystic-wood-root .le .g{color:#8fd08a} .mystic-wood-root .le .r{color:var(--crimson)} .mystic-wood-root .le .a{color:var(--azure)} .mystic-wood-root .le .muted{color:var(--muted)}

/* encounter / dice card — floats over the GAME area (not the whole screen), like the prototype */
.mystic-wood-root.mw-portal{position:absolute;inset:0;z-index:40;display:block;width:auto;background:none;pointer-events:none}
.mw-portal .overlay{position:absolute;inset:0;background:#0007;display:grid;place-items:center;pointer-events:auto;padding:10px}
.mw-portal .modal{background:var(--panel);border:1px solid var(--gold);border-radius:12px;padding:12px 13px;width:fit-content;max-width:min(300px,94%);box-shadow:0 12px 36px #000c;max-height:calc(100% - 16px);overflow-y:auto}
.mw-portal .modal h2{font-size:18px;color:var(--gold2);margin:2px 0 4px}
.mw-portal .modal p{font-size:13px;margin:5px 0}
.mw-portal .modal .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;justify-content:center}
.mw-portal .result{margin:9px 0 2px;text-align:center;font-size:13.5px;line-height:1.45}
.mw-portal .r{color:var(--crimson)} .mw-portal .g{color:#8fd08a} .mw-portal .a{color:var(--azure)}
.mw-portal .dicerow{display:flex;align-items:center;gap:7px;justify-content:center;flex-wrap:nowrap;white-space:nowrap;margin:7px 0}
.mw-portal .drlabel{font-size:12px;color:var(--muted);min-width:46px;text-align:right}
.mw-portal .die{width:40px;height:40px;border-radius:8px;display:grid;place-items:center;font-family:var(--mono);font-size:20px;font-weight:700;border:2px solid}
.mw-portal .die.white{background:#f2eede;color:#222;border-color:#fff}
.mw-portal .die.red{background:#7a2b26;color:#fff;border-color:#c9564c}
.mw-portal .drop{color:var(--muted);font-family:var(--mono)}
.mw-portal .drbon{font-size:13px;color:var(--gold2);font-family:var(--mono)}
.mw-portal .drtot{font-family:var(--mono);font-size:16px;font-weight:700;color:var(--gold-bright);margin-left:2px}
.mw-portal .denbox{background:var(--panel2);border:1px solid var(--rule);border-radius:9px;padding:8px 10px;margin:7px 0;display:flex;flex-direction:column;gap:3px;text-align:left}
.mw-portal .denrow{font-size:12.5px;line-height:1.3}
.mw-portal .denrow.good{color:#8fd08a} .mw-portal .denrow.bad{color:var(--crimson)} .mw-portal .denrow.muted{color:var(--muted);font-size:12px;margin-top:2px}
.mw-portal .denvs{font-size:16px;margin:3px 0}
.mw-portal .rtbl{width:100%;border-collapse:collapse;margin:3px 0 2px;font-size:12.5px}
.mw-portal .rtbl td{padding:3px 8px;border-bottom:1px solid var(--rule);text-align:left}
.mw-portal .rtbl tr:last-child td{border-bottom:none}
.mw-portal .rtbl .rroll{font-family:var(--mono);color:var(--gold2);width:52px;text-align:center;font-weight:700}
.mw-portal .tilehdr2{display:flex;gap:9px;align-items:center;margin:2px 0 7px;padding-bottom:7px;border-bottom:1px solid var(--rule)}
.mw-portal .tilethumb{width:78px;flex:none;aspect-ratio:10/7;border-radius:6px;overflow:hidden;border:1px solid var(--rule)}
.mw-portal .tilethumb svg{width:100%;height:100%;display:block}
.mw-portal .tileinfo{font-size:12.5px;line-height:1.4;text-align:left}
.mw-portal .hint{font-size:12px;color:var(--muted);text-align:center;margin-top:8px}
.mystic-wood-root.mw-pop{position:fixed;z-index:80;background:var(--panel);border:1px solid var(--gold);border-radius:8px;padding:8px 11px;max-width:270px;font-size:12px;line-height:1.5;box-shadow:0 8px 24px #000b;pointer-events:none;display:block}
.mystic-wood-root.mw-pop b{color:var(--gold2);display:block;margin-bottom:3px;font-family:var(--serif);font-size:13px}
.mystic-wood-root.mw-pop .popbody{color:var(--ink)}
`;
