// The Mystic Wood — scoped board styles, injected once by render.js under `.mystic-wood-root`.
// Per-game injected CSS (uncapped); the shared styles-games.css is not touched. Theme-aware:
// dark is the board default; light remaps the tokens. Nothing leaks to the shell.
export const MYSTIC_WOOD_CSS = `
#macroBoard:has(.mystic-wood-root){display:block;aspect-ratio:auto;background:none;border:none;padding:0;}
.mystic-wood-root{
  --mw-ink:#e8e2d4; --mw-muted:#a39a86; --mw-panel:#20241a; --mw-panel2:#272c1f; --mw-rule:#3a4230;
  --mw-gold:#d9b45a; --mw-gold2:#f0d78c; --mw-azure:#7fb2e6; --mw-crimson:#e07a72;
  --mw-good:#8ac06a; --mw-bad:#e07a72; --mw-accent:#e6c168;
  --ench-h1:#2b3a4a; --ench-h2:#243140; --ench-h3:#33475a; --ench-road:#8ea6bc; --ench-leaf:#4d6b78;
  --earth-h1:#33402a; --earth-h2:#2b3722; --earth-h3:#3f4f30; --earth-road:#b79a63; --earth-leaf:#6b8a3f;
  display:flex; flex-direction:column; gap:8px; width:100%; color:var(--mw-ink);
  font-family:'Segoe UI',system-ui,sans-serif;
}
:root[data-theme="light"] .mystic-wood-root{
  --mw-ink:#2b2a22; --mw-muted:#6f6a58; --mw-panel:#f3efe2; --mw-panel2:#e9e3d1; --mw-rule:#d8cfb6;
  --mw-gold:#a9832f; --mw-gold2:#8a6b23; --mw-azure:#2f6db0; --mw-crimson:#b34840;
  --ench-h1:#c8d6e2; --ench-h2:#d6e2ec; --ench-h3:#b3c6d6; --ench-road:#e7eef4; --ench-leaf:#8fb0c2;
  --earth-h1:#cdd8b6; --earth-h2:#dbe4c4; --earth-h3:#bccda0; --earth-road:#efe6cb; --earth-leaf:#a7bf72;
}
.mw-serif{font-family:Georgia,'Times New Roman',serif;}

/* HUD */
.mw-hud{display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--mw-panel);border:1px solid var(--mw-rule);border-radius:10px;}
.mw-turn{flex:1;min-width:0;display:flex;align-items:center;gap:7px;font-family:Georgia,serif;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mw-dot{width:14px;height:14px;border-radius:50%;flex:none;box-shadow:0 0 0 2px #0003 inset;}
.mw-hud .mw-btn{flex:none;}
.mw-btn{background:var(--mw-panel2);color:var(--mw-ink);border:1px solid var(--mw-rule);border-radius:8px;padding:7px 11px;font-size:13px;cursor:pointer;white-space:nowrap;}
.mw-btn:hover{border-color:var(--mw-gold);}
.mw-btn.mw-primary{background:var(--mw-gold);color:#20241a;border-color:var(--mw-gold);font-weight:600;}
.mw-btn:disabled{opacity:.45;cursor:default;}

/* Board window + zoom */
.mw-boardwrap{position:relative;overflow:hidden;width:100%;aspect-ratio:7/6.6;background:var(--mw-panel);border:1px solid var(--mw-rule);border-radius:10px;}
.mw-board{position:absolute;top:0;left:0;transform-origin:0 0;display:grid;grid-template-columns:repeat(7,var(--mw-cell,100px));grid-auto-rows:calc(var(--mw-cell,100px)*0.72);}
.mw-cell{position:relative;box-sizing:border-box;}
.mw-cell svg{display:block;width:100%;height:100%;}
.mw-facedown{width:100%;height:100%;background:
  repeating-linear-gradient(45deg,#2a2f22 0 6px,#242a1d 6px 12px);border:1px solid #0004;box-sizing:border-box;}
:root[data-theme="light"] .mw-facedown{background:repeating-linear-gradient(45deg,#d3cbb2 0 6px,#cbc2a6 6px 12px);}
.mw-cell.mw-reachable{cursor:pointer;box-shadow:0 0 0 3px var(--mw-gold) inset, 0 0 10px #0006;z-index:2;border-radius:4px;}
.mw-cell.mw-current{box-shadow:0 0 0 3px var(--mw-gold2) inset;z-index:3;border-radius:4px;}
.mw-place{position:absolute;top:2px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:3px;
  font-size:calc(var(--mw-cell,100px)*0.12);background:#0008;color:var(--mw-gold2);padding:1px 5px;border-radius:6px;white-space:nowrap;z-index:2;pointer-events:none;}
.mw-card{position:absolute;bottom:3px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:3px;
  font-size:calc(var(--mw-cell,100px)*0.12);background:#3a1e1e;color:#f3c9c0;padding:1px 5px;border-radius:6px;white-space:nowrap;z-index:2;border:1px solid #7a3b32;pointer-events:none;}
.mw-tok{position:absolute;top:4px;width:calc(var(--mw-cell,100px)*0.26);height:calc(var(--mw-cell,100px)*0.26);border-radius:50%;
  display:flex;align-items:center;justify-content:center;font-weight:700;font-size:calc(var(--mw-cell,100px)*0.15);
  color:#111;box-shadow:0 1px 4px #0008,0 0 0 2px #fff6;z-index:4;}

/* Seat list */
.mw-seats{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;}
.mw-seat{flex:none;min-width:112px;background:var(--mw-panel);border:1px solid var(--mw-rule);border-radius:9px;padding:6px 8px;}
.mw-seat.mw-active{border-color:var(--mw-gold);box-shadow:0 0 0 1px var(--mw-gold);}
.mw-seat-r1{display:flex;align-items:center;gap:6px;font-family:Georgia,serif;font-size:13px;white-space:nowrap;overflow:hidden;}
.mw-seat-name{overflow:hidden;text-overflow:ellipsis;}
.mw-seat-stats{margin-top:3px;font-size:12px;font-variant-numeric:tabular-nums;}
.mw-p{color:var(--mw-azure);font-weight:600;} .mw-s{color:var(--mw-crimson);font-weight:600;}
.mw-seat-quest{margin-top:2px;font-size:11px;color:var(--mw-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mw-badges{margin-top:3px;display:flex;flex-wrap:wrap;gap:3px;}
.mw-badge{font-size:10.5px;background:var(--mw-panel2);border:1px solid var(--mw-rule);border-radius:5px;padding:0 4px;white-space:nowrap;}

/* Action bar */
.mw-actions{display:flex;justify-content:center;gap:6px;flex-wrap:wrap;padding:2px 0;}

/* Encounter + end panels */
.mw-panel-card{background:var(--mw-panel);border:1px solid var(--mw-gold);border-radius:12px;padding:12px 14px;}
.mw-enc-title{font-family:Georgia,serif;font-size:18px;margin-bottom:4px;}
.mw-enc-line{font-size:13px;margin:3px 0;line-height:1.5;}
.mw-enc-line.mw-good{color:var(--mw-good);} .mw-enc-line.mw-bad{color:var(--mw-bad);}
.mw-num{font-variant-numeric:tabular-nums;font-weight:700;}
.mw-enc-actions{display:flex;gap:8px;margin-top:10px;}

/* Log */
.mw-log{max-height:120px;overflow-y:auto;background:var(--mw-panel);border:1px solid var(--mw-rule);border-radius:10px;padding:6px 9px;font-size:12px;line-height:1.45;}
.mw-le{padding:2px 0;border-bottom:1px solid #ffffff0f;}
.mw-le .g{color:var(--mw-good);} .mw-le .r{color:var(--mw-bad);} .mw-le .a{color:var(--mw-accent);} .mw-le .muted{color:var(--mw-muted);}

/* End screen */
.mw-end{text-align:center;padding:18px;}
.mw-end h2{font-family:Georgia,serif;font-size:26px;margin:6px 0;}
.mw-hidden{display:none !important;}
`;
