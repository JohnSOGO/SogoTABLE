// Mazewright — scoped styles (injected once by render.js, NOT added to
// styles-games.css), mirroring the rtta/styles.js precedent. Every rule is
// prefixed under `.mazewright-root` so the game's class names never touch the
// app shell; the dungeon palette lives on `.mazewright-root` as CSS tokens and
// the light theme only remaps those tokens (see docs/theme.md).
export const MW_CSS = `
#macroBoard:has(.mazewright-root){display:block;aspect-ratio:auto;background:none;border:none;}
.mazewright-root{display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;
 user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;
 padding:14px 10px;border-radius:16px;background:var(--mw-stage);
 --mw-panel:#211d31;--mw-ink:#f3effa;--mw-muted:#9b93b5;--mw-grid:#3a3350;--mw-cellc:#2a2540;
 --mw-start:#33406b;--mw-exit:#46d18a;--mw-gold:#e9c45a;--mw-accent:#7c6cff;
 --mw-fog:#131019;--mw-stage:#16121f;--mw-padink:#ffffff;--mw-pad:rgba(124,108,255,.25);--mw-trail:rgba(255,255,255,.8);
 color:var(--mw-ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}
.mazewright-root input,.mazewright-root textarea{user-select:text;-webkit-user-select:text;-webkit-touch-callout:default;}
/* Theme: the dark dungeon is the board's default; light mode echoes the platform
   light scheme (neutral tokens pulled straight from the shell). The lobby
   ("table") follows the global theme like every other game now — only the board
   palette is game-specific. data-theme is set on <html> before paint (see
   index.html + docs/theme.md). */
:root[data-theme="light"] .mazewright-root{
 --mw-stage:var(--bg);--mw-panel:var(--panel);--mw-ink:var(--ink);--mw-muted:var(--muted);--mw-grid:var(--line);
 --mw-cellc:#edeef3;--mw-start:#cfe0ff;--mw-exit:#1f9d62;--mw-gold:#b07d12;--mw-accent:#6a5be0;
 --mw-fog:#d9dbe4;--mw-padink:#241f3a;--mw-pad:rgba(106,91,224,.18);--mw-trail:rgba(60,48,110,.7);}
.mazewright-root .mw-panel{width:100%;max-width:460px;background:var(--mw-panel);border:1px solid var(--mw-grid);border-radius:14px;padding:12px 14px;}
.mazewright-root .mw-hud{cursor:pointer;}
.mazewright-root .mw-hudrow{display:flex;align-items:center;gap:9px;}
.mazewright-root .mw-turn{display:flex;align-items:center;gap:9px;font-weight:700;font-size:1.02rem;flex:none;}
.mazewright-root .mw-caret{flex:none;color:var(--mw-muted);font-size:.75rem;display:inline-block;transition:transform .15s;}
.mazewright-root .mw-hud.collapsed .mw-caret{transform:rotate(-90deg);}
.mazewright-root .mw-hud.collapsed .mw-sub,.mazewright-root .mw-hud.collapsed .mw-meters{display:none;}
.mazewright-root .mw-dot{width:14px;height:14px;border-radius:50%;flex:none;background:var(--mw-accent);}
.mazewright-root .mw-tag{margin-left:auto;font-size:.72rem;text-transform:uppercase;letter-spacing:1px;padding:4px 9px;border-radius:999px;background:var(--mw-cellc);color:var(--mw-muted);border:1px solid var(--mw-grid);}
.mazewright-root .mw-tag.build{color:#d98a4a;border-color:#d98a4a;}
.mazewright-root .mw-tag.crawl{color:var(--mw-exit);border-color:var(--mw-exit);}
.mazewright-root .mw-sub{margin-top:5px;color:var(--mw-muted);font-size:.85rem;}
.mazewright-root .mw-meters{display:flex;gap:8px;margin-top:9px;flex-wrap:wrap;}
.mazewright-root .mw-meter{font-size:.82rem;padding:5px 10px;border-radius:999px;background:var(--mw-cellc);border:1px solid var(--mw-grid);}
.mazewright-root .mw-meter b{color:var(--mw-ink);} .mazewright-root .mw-meter.ok{color:var(--mw-gold);border-color:var(--mw-gold);}
.mazewright-root .mw-modes{display:none;width:100%;max-width:460px;gap:6px;}
.mazewright-root .mw-mode{flex:1;padding:9px 4px;border-radius:10px;font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid var(--mw-grid);background:var(--mw-cellc);color:var(--mw-muted);}
.mazewright-root .mw-mode.active{color:var(--mw-ink);border-color:var(--mw-accent);background:var(--mw-pad);}
.mazewright-root .mw-board{width:100%;max-width:460px;}
.mazewright-root .mw-board.crawling,.mazewright-root .mw-board.crawling svg{touch-action:none;}
.mazewright-root svg{width:100%;height:auto;display:block;touch-action:manipulation;}
.mazewright-root .mw-warnring{fill:none;stroke:#e85d75;stroke-width:2.5;stroke-dasharray:4 3;pointer-events:none;}
.mazewright-root .mw-selring{fill:var(--mw-pad);stroke:var(--mw-gold);stroke-width:2.5;pointer-events:none;}
.mazewright-root .mw-cell{fill:var(--mw-cellc);} .mazewright-root .mw-cell.start{fill:var(--mw-start);}
.mazewright-root .mw-cell.tap{cursor:pointer;} .mazewright-root .mw-cell.fog{fill:var(--mw-fog);}
.mazewright-root .mw-cell.seen{fill:var(--mw-cellc);} .mazewright-root .mw-cell.here{fill:var(--mw-start);}
.mazewright-root .mw-wall,.mazewright-root .mw-perim{stroke:#2a0f0a;stroke-width:.5;}
.mazewright-root .mw-arch{filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.55));}
.mazewright-root .mw-wallprev{opacity:0;transition:opacity .07s ease;} .mazewright-root .mw-wallprev.lit{opacity:.85;}
.mazewright-root .mw-exitprev{fill:var(--mw-gold);opacity:0;transition:opacity .07s ease;} .mazewright-root .mw-exitprev.lit{opacity:.8;}
.mazewright-root .mw-wall.lit{filter:drop-shadow(0 0 4px #ffd45a);} .mazewright-root .mw-perim.lit{filter:drop-shadow(0 0 5px var(--mw-gold));}
.mazewright-root .mw-hit{fill:transparent;stroke:none;cursor:pointer;}
.mazewright-root .mw-emoji{font-size:26px;text-anchor:middle;dominant-baseline:central;pointer-events:none;}
.mazewright-root .mw-trail{fill:var(--mw-trail);}
.mazewright-root .mw-treasure{filter:drop-shadow(0 0 4px rgba(120,210,255,.7));}
.mazewright-root .mw-grab{fill:transparent;cursor:grab;} .mazewright-root .mw-grab:active{cursor:grabbing;}
.mazewright-root .mw-pad{fill:var(--mw-pad);stroke:var(--mw-accent);stroke-width:1.5;cursor:pointer;}
.mazewright-root .mw-pad:hover{fill:rgba(124,108,255,.55);} .mazewright-root .mw-pad.exit{fill:rgba(233,196,90,.5);stroke:var(--mw-gold);}
.mazewright-root .mw-padarrow{font-size:13px;text-anchor:middle;dominant-baseline:central;fill:var(--mw-padink);pointer-events:none;}
.mazewright-root .mw-dpad{display:none;grid-template-columns:repeat(3,3.6rem);grid-template-rows:repeat(3,3.6rem);gap:8px;justify-content:center;touch-action:none;}
.mazewright-root .mw-dbtn{font-size:1.4rem;line-height:1;border-radius:14px;border:1px solid var(--mw-grid);background:var(--mw-cellc);color:var(--mw-ink);cursor:pointer;display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;}
.mazewright-root .mw-dbtn:active{background:var(--mw-pad);border-color:var(--mw-accent);}
.mazewright-root .mw-dbtn.n{grid-area:1/2;} .mazewright-root .mw-dbtn.w{grid-area:2/1;}
.mazewright-root .mw-dbtn.e{grid-area:2/3;} .mazewright-root .mw-dbtn.s{grid-area:3/2;}
.mazewright-root .mw-inventory{display:none;font-size:1.1rem;}
.mazewright-root .mw-invlabel{color:var(--mw-muted);text-transform:uppercase;letter-spacing:1px;font-size:.74rem;margin-right:8px;}
.mazewright-root .mw-invempty{color:var(--mw-muted);opacity:.65;font-size:.85rem;}
.mazewright-root .mw-controls{display:flex;width:100%;max-width:460px;gap:8px;}
.mazewright-root .mw-controls button{flex:1;padding:12px;border-radius:10px;font-weight:700;cursor:pointer;border:1px solid var(--mw-grid);background:var(--mw-cellc);color:var(--mw-ink);}
.mazewright-root .mw-go,.mazewright-root .mw-go-btn{background:var(--mw-exit);border-color:var(--mw-exit);color:#0c2417;}
.mazewright-root .mw-go:disabled{opacity:.4;cursor:not-allowed;}
.mazewright-root .mw-advanced{display:none;width:100%;max-width:460px;padding:0;overflow:hidden;}
.mazewright-root .mw-advanced summary{cursor:pointer;padding:11px 14px;font-size:.8rem;color:var(--mw-muted);list-style:none;user-select:none;}
.mazewright-root .mw-advanced summary::-webkit-details-marker{display:none;}
.mazewright-root .mw-advanced[open] summary{border-bottom:1px solid var(--mw-grid);color:var(--mw-ink);}
.mazewright-root .mw-codebar{display:flex;align-items:center;gap:8px;padding:12px 14px;}
.mazewright-root .mw-codelabel{font-size:.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--mw-muted);white-space:nowrap;}
.mazewright-root .mw-codeinput{flex:1;min-width:0;font-family:ui-monospace,monospace;font-size:.82rem;padding:8px 9px;border-radius:8px;border:1px solid var(--mw-grid);background:var(--mw-cellc);color:var(--mw-ink);}
.mazewright-root .mw-codebar button{padding:8px 13px;border-radius:8px;border:1px solid var(--mw-grid);background:var(--mw-cellc);color:var(--mw-ink);font-weight:700;cursor:pointer;}
.mazewright-root .mw-done{display:none;text-align:center;} .mazewright-root .mw-mine{color:var(--mw-gold);font-weight:800;}
.mazewright-root .mw-champ{font-size:1.05rem;margin-bottom:11px;padding:11px;border-radius:11px;background:var(--mw-cellc);border:1px solid var(--mw-gold);color:var(--mw-ink);}
.mazewright-root .mw-help{color:var(--mw-muted);font-size:.84rem;line-height:1.5;}
.mazewright-root .mw-table{display:none;cursor:pointer;}
.mazewright-root .mw-ptitle{font-size:.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--mw-muted);margin-bottom:8px;}
.mazewright-root .mw-viewhint{text-transform:none;letter-spacing:0;color:var(--mw-accent);font-weight:600;margin-left:4px;}
.mazewright-root .mw-prow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:9px;border:1px solid transparent;}
.mazewright-root .mw-prow+.mw-prow{margin-top:5px;} .mazewright-root .mw-prow.you{background:var(--mw-cellc);border-color:var(--mw-ink);}
.mazewright-root .mw-prow.muted{opacity:.6;} .mazewright-root .mw-prow.done .mw-pstat{color:var(--mw-exit);}
.mazewright-root .mw-pname{display:flex;align-items:center;gap:8px;font-weight:600;}
.mazewright-root .mw-pdot{width:11px;height:11px;border-radius:50%;flex:none;}
.mazewright-root .mw-pstat{font-size:.82rem;color:var(--mw-muted);white-space:nowrap;} .mazewright-root .mw-prow.you .mw-pstat{color:var(--mw-ink);}
/* Final screen: champion hero (gold = champion ONLY) + standings; "you" is a
   neutral accent chip, never gold, so the two stop competing. */
.mazewright-root .mw-hero{text-align:center;padding:16px 14px;border-radius:14px;margin-bottom:12px;background:linear-gradient(180deg,rgba(233,196,90,.18),rgba(233,196,90,.05));border:1px solid var(--mw-gold);}
.mazewright-root .mw-herocrown{font-size:2.2rem;line-height:1;}
.mazewright-root .mw-heroname{display:flex;align-items:center;justify-content:center;gap:8px;font-size:1.25rem;margin-top:4px;}
.mazewright-root .mw-heroav{width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:1.05rem;}
.mazewright-root .mw-heropts{font-size:1.5rem;font-weight:800;color:var(--mw-gold);margin-top:6px;}
.mazewright-root .mw-herowhy{color:var(--mw-muted);font-size:.86rem;margin-top:2px;}
.mazewright-root .mw-youtag{font-size:.62rem;text-transform:uppercase;letter-spacing:.5px;padding:1px 6px;border-radius:999px;background:var(--mw-accent);color:#fff;vertical-align:middle;}
/* Per-player score table: icon+name, weighted category columns, Total on the right. */
.mazewright-root .mw-sctable{width:100%;border-collapse:collapse;font-size:.92rem;}
.mazewright-root .mw-sctable th{font-size:.78rem;font-weight:600;color:var(--mw-muted);padding:4px 6px;text-align:center;border-bottom:1px solid var(--mw-grid);}
.mazewright-root .mw-sctable td{padding:9px 6px;text-align:center;border-bottom:1px solid var(--mw-grid);}
.mazewright-root .mw-sctable .mw-scname{text-align:left;font-weight:600;}
.mazewright-root .mw-sctable th.mw-scname{font-weight:600;}
.mazewright-root .mw-sctotal{font-weight:800;font-size:1.05rem;}
.mazewright-root .mw-sctable tr.champ td{background:rgba(233,196,90,.12);}
.mazewright-root .mw-sctable tr.champ td:first-child{border-left:3px solid var(--mw-gold);}
.mazewright-root .mw-sctable tr.you .mw-scname{color:var(--mw-ink);}
.mazewright-root .mw-legend{margin-top:10px;color:var(--mw-muted);font-size:.76rem;line-height:1.5;text-align:center;}
.mw-flying{position:fixed;z-index:50;font-size:26px;pointer-events:none;transform:translate(-50%,-50%) scale(1.4);transition:left .6s cubic-bezier(.35,.1,.2,1),top .6s cubic-bezier(.35,.1,.2,1),transform .6s,opacity .6s;filter:drop-shadow(0 0 7px rgba(120,210,255,.9));}
`;
