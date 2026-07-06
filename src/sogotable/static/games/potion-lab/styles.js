// Potion Lab — scoped, injected-once stylesheet (the RTTA/No-Thanks pattern).
// Every rule is prefixed .potion-lab-root so generic class names never leak,
// and the two neutralizers undo the tic-tac-toe macro-board grid so the tall
// card UI lays out normally. Themed for light + dark via the platform's
// <html data-theme> switch; the card faces stay paper-white in both, like dice.
export const POTION_LAB_CSS = `
#macroBoard:has(.potion-lab-root){display:block;aspect-ratio:auto;height:auto;max-width:none}
#turnStatus:has(~ #macroBoard .potion-lab-root){display:none}
.potion-lab-root{
  --pl-bg:#f3eefb;--pl-panel:#fff;--pl-ink:#241b33;--pl-muted:#7a6d8f;
  --pl-felt2:#7b57c9;--pl-accent:#c2410c;--pl-gold:#b8860b;
  --pl-card:#fbf7ff;--pl-cardink:#241b33;--pl-line:#e4d9f5;
  --pl-btn:#5a3ea0;--pl-btnink:#fff;--pl-chip:#ece3fb;--pl-num:#6d28d9;
  --pl-good:#15803d;--pl-bad:#b91c1c;--pl-shadow:0 3px 14px rgba(60,30,110,.16);
  color:var(--pl-ink);font-family:"Avenir Next","Segoe UI",system-ui,sans-serif;
  width:100%;max-width:760px;margin:0 auto;display:block;text-align:left;
}
html[data-theme="dark"] .potion-lab-root{
  --pl-bg:#141020;--pl-panel:#221a33;--pl-ink:#efe9f7;--pl-muted:#9d90b3;
  --pl-felt2:#8b6ad8;--pl-accent:#fb923c;--pl-gold:#e6c14a;
  --pl-card:#2c2340;--pl-cardink:#efe9f7;--pl-line:#3a2f52;
  --pl-btn:#8b6ad8;--pl-btnink:#160f26;--pl-chip:#332a49;--pl-num:#c9b6ff;
  --pl-good:#4ade80;--pl-bad:#f87171;--pl-shadow:0 3px 16px rgba(0,0,0,.5);
}
.potion-lab-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.potion-lab-root .pl-panel{background:var(--pl-panel);border-radius:16px;box-shadow:var(--pl-shadow);padding:12px;margin-bottom:10px}
.potion-lab-root .pl-panel h2{font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:var(--pl-muted);margin:0 0 8px;cursor:pointer;user-select:none}
.potion-lab-root .pl-panel h2 span{text-transform:none;font-weight:600}
.potion-lab-root .pl-panel h2::after{content:'▾';float:right;font-size:11px;opacity:.55}
.potion-lab-root .pl-panel.collapsed h2::after{content:'▸'}
.potion-lab-root .pl-panel.collapsed h2{margin-bottom:0}
.potion-lab-root .pl-panel.collapsed>:not(h2){display:none}
.potion-lab-root .pl-round{font-size:13px;font-weight:700;color:var(--pl-muted);margin:0 0 10px}

/* standings */
.potion-lab-root table.pl-stand{width:100%;border-collapse:collapse;font-size:14px}
.potion-lab-root table.pl-stand th,.potion-lab-root table.pl-stand td{padding:6px;text-align:center}
.potion-lab-root table.pl-stand th{color:var(--pl-muted);font-size:11px;text-transform:uppercase;letter-spacing:.4px}
.potion-lab-root table.pl-stand td.pl-name{text-align:left;font-weight:700}
.potion-lab-root table.pl-stand tr.pl-me td{color:var(--pl-num)}
.potion-lab-root table.pl-stand td.pl-total{font-weight:800}
.potion-lab-root table.pl-stand td.pl-hi{color:var(--pl-good);font-weight:800}
.potion-lab-root table.pl-stand td.pl-lo{color:var(--pl-bad);font-weight:800}

/* cauldrons */
.potion-lab-root .pl-seats{display:flex;flex-direction:column;gap:7px}
.potion-lab-root .pl-seat{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid var(--pl-line);border-radius:12px}
.potion-lab-root .pl-seat.pl-me{border-color:var(--pl-num)}
.potion-lab-root .pl-seat .pl-who{min-width:92px}
.potion-lab-root .pl-seat .pl-who .pl-nm{font-weight:700;font-size:14px}
.potion-lab-root .pl-seat .pl-who .pl-rs{font-size:11px;color:var(--pl-muted)}
.potion-lab-root .pl-seat .pl-coll{display:flex;flex-wrap:wrap;gap:5px;flex:1;min-height:26px}
.potion-lab-root .pl-mooncol{display:flex;flex-wrap:wrap;gap:3px;justify-content:flex-end;align-items:center;width:74px;flex-shrink:0}
.potion-lab-root .pl-seat .pl-sc{font-weight:800;font-size:16px;min-width:30px;text-align:right}
.potion-lab-root .pl-tok{display:inline-flex;align-items:center;gap:2px;background:var(--pl-chip);border-radius:8px;padding:2px 6px;font-size:13px;font-weight:700;white-space:nowrap;flex-wrap:nowrap}
.potion-lab-root .pl-tok.pl-moontok i{font-style:normal;display:inline-block}
.potion-lab-root .pl-tok.pl-moontally{font-weight:800}
.potion-lab-root .pl-tok.pl-firepartial{opacity:.45}
.potion-lab-root .pl-group{display:inline-flex;align-items:center;gap:1px;padding:2px 5px;border-radius:9px;border:1.5px solid var(--pl-num);background:var(--pl-chip)}
.potion-lab-root .pl-group.pl-partial{border:1.5px dashed var(--pl-line);opacity:.5}
.potion-lab-root .pl-group.pl-firegroup{border-color:var(--pl-accent)}
.potion-lab-root .pl-group .pl-gi{font-size:14px;line-height:1}
.potion-lab-root .pl-dash{color:var(--pl-muted);font-size:12px}

/* scoring key */
.potion-lab-root table.pl-key{width:100%;border-collapse:collapse}
.potion-lab-root table.pl-key th{text-align:left;color:var(--pl-muted);font-size:10px;text-transform:uppercase;letter-spacing:.4px;padding:0 7px 7px;font-weight:700}
.potion-lab-root table.pl-key th.pl-r{text-align:right}
.potion-lab-root table.pl-key td{padding:8px 7px;border-top:1px solid var(--pl-line);vertical-align:middle;cursor:pointer}
.potion-lab-root table.pl-key tr:hover td,.potion-lab-root table.pl-key tr:active td{background:var(--pl-chip)}
.potion-lab-root table.pl-key td.pl-em{font-size:16px;white-space:nowrap;letter-spacing:-2px;width:1%}
.potion-lab-root table.pl-key td.pl-kn{font-weight:700;white-space:nowrap}
.potion-lab-root table.pl-key td.pl-kd{color:var(--pl-muted);font-size:12.5px}
.potion-lab-root table.pl-key td.pl-mine{text-align:right;font-weight:800;color:var(--pl-num);white-space:nowrap;width:1%}

/* hand */
.potion-lab-root .pl-hand{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:6px}
.potion-lab-root .pl-card{width:64px;height:88px;border-radius:12px;background:var(--pl-card);color:var(--pl-cardink);border:2px solid var(--pl-line);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;user-select:none;box-shadow:var(--pl-shadow);transition:transform .12s,border-color .12s;position:relative}
.potion-lab-root .pl-card:active{transform:scale(.96)}
.potion-lab-root .pl-card.pl-sel{border-color:var(--pl-num);transform:translateY(-8px);box-shadow:0 8px 18px rgba(90,62,160,.4)}
.potion-lab-root .pl-card .pl-face{font-size:30px}
.potion-lab-root .pl-card .pl-face.pl-moons{display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;gap:1px}
.potion-lab-root .pl-card .pl-face.pl-moons .pl-mrow{display:flex;flex-wrap:nowrap;justify-content:center}
.potion-lab-root .pl-card .pl-face.pl-moons i{font-style:normal;display:inline-block;font-size:26px}
.potion-lab-root .pl-card .pl-face.pl-m3 i{font-size:22px}
.potion-lab-root .pl-card .pl-cn{font-size:10px;font-weight:700;margin-top:2px;text-align:center}
.potion-lab-root .pl-controls{display:flex;align-items:center;gap:10px;justify-content:center;margin-top:12px;flex-wrap:wrap}
.potion-lab-root .pl-commit{background:var(--pl-btn);color:var(--pl-btnink);border:none;border-radius:999px;padding:12px 30px;font-size:16px;font-weight:800;cursor:pointer;box-shadow:var(--pl-shadow)}
.potion-lab-root .pl-commit:disabled{opacity:.4;cursor:not-allowed}
.potion-lab-root .pl-wiz{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700}
.potion-lab-root .pl-wiz input{width:18px;height:18px}
.potion-lab-root .pl-hint{text-align:center;color:var(--pl-muted);font-size:12.5px;margin-top:8px;min-height:16px}
.potion-lab-root .pl-wait{text-align:center;color:var(--pl-muted);font-size:15px;padding:16px 8px;font-weight:600}
.potion-lab-root .pl-ready{display:block;margin:14px auto 0}

/* round / game-over add-up */
.potion-lab-root .pl-gr{display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-top:1px solid var(--pl-line)}
.potion-lab-root .pl-gr .pl-grl{min-width:96px;flex-shrink:0;font-size:13px;font-weight:700}
.potion-lab-root .pl-gr .pl-grl b{color:var(--pl-num)}
.potion-lab-root .pl-gr .pl-grc{display:flex;flex-wrap:wrap;gap:5px;align-items:center;flex:1}
.potion-lab-root .pl-grtot{text-align:right;font-size:15px;font-weight:800;margin-top:8px;padding-top:9px;border-top:2px solid var(--pl-line)}
.potion-lab-root .pl-grtot b{color:var(--pl-num);font-size:20px;margin-left:6px}
.potion-lab-root h3.pl-h{margin:0 0 10px;font-size:20px}
.potion-lab-root .pl-bd{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:4px}
.potion-lab-root .pl-bd th,.potion-lab-root .pl-bd td{padding:4px 5px;text-align:center}
.potion-lab-root .pl-bd td.pl-n{text-align:left;font-weight:700}
.potion-lab-root .pl-bd th{color:var(--pl-muted);font-size:10px;text-transform:uppercase}
.potion-lab-root .pl-bd tr.pl-win td{color:var(--pl-gold);font-weight:800}
.potion-lab-root .pl-bd tr.pl-me td{color:var(--pl-num)}

/* help popup */
.potion-lab-root .pl-overlay{position:fixed;inset:0;background:rgba(15,8,30,.66);display:flex;align-items:center;justify-content:center;padding:16px;z-index:40}
.potion-lab-root .pl-modal{background:var(--pl-panel);border-radius:18px;padding:18px;max-width:520px;width:100%;box-shadow:var(--pl-shadow);max-height:88dvh;overflow:auto}
.potion-lab-root .pl-detail .pl-big{font-size:40px;text-align:center;margin:2px 0 6px;letter-spacing:-4px}
.potion-lab-root .pl-detail h3{text-align:center;margin:0 0 12px;font-size:20px}
.potion-lab-root .pl-detail p{font-size:14px;line-height:1.5;margin:0 0 10px}
.potion-lab-root .pl-detail p.pl-ctr{text-align:center}
.potion-lab-root .pl-detail ul.pl-vals{list-style:none;padding:0;margin:0 0 12px;display:flex;flex-direction:column;gap:8px}
.potion-lab-root .pl-detail ul.pl-vals li{font-size:14px;white-space:nowrap}
.potion-lab-root .pl-detail ul.pl-vals li b{color:var(--pl-num)}
.potion-lab-root .pl-detail ol{margin:0 0 10px;padding-left:20px}
.potion-lab-root .pl-detail ol li{font-size:14px;line-height:1.5;margin-bottom:5px}
.potion-lab-root .pl-detail ol li b{color:var(--pl-num)}
.potion-lab-root .pl-detail table.pl-mini{border-collapse:collapse;margin:0 auto 12px;min-width:220px}
.potion-lab-root .pl-detail table.pl-mini th{text-align:left;color:var(--pl-muted);font-size:10px;text-transform:uppercase;letter-spacing:.4px;padding:0 14px 5px 0;font-weight:700}
.potion-lab-root .pl-detail table.pl-mini th.pl-r,.potion-lab-root .pl-detail table.pl-mini td.pl-r{text-align:right}
.potion-lab-root .pl-detail table.pl-mini td{padding:5px 14px 5px 0;font-size:14px;border-top:1px solid var(--pl-line)}
.potion-lab-root .pl-detail table.pl-mini td.pl-r b{color:var(--pl-num)}
.potion-lab-root .pl-detail .pl-potcard{display:inline-flex;align-items:center;padding:1px 5px;border-radius:6px;border:1px solid var(--pl-line);background:var(--pl-card)}
.potion-lab-root .pl-detail .pl-deckcount{text-align:center;color:var(--pl-muted);font-size:12.5px;margin:12px 0 0;border-top:1px solid var(--pl-line);padding-top:11px}
.potion-lab-root .pl-detail .pl-deckcount b{color:var(--pl-num);font-size:15px}
.potion-lab-root .pl-detail .pl-egs{background:var(--pl-chip);border-radius:10px;padding:11px 13px;font-size:13.5px;display:flex;flex-direction:column;gap:9px}
.potion-lab-root .pl-detail .pl-egs>div{white-space:nowrap}
.potion-lab-root .pl-detail .pl-egs b{color:var(--pl-num)}
.potion-lab-root .pl-center{text-align:center;margin-top:14px}
`;
