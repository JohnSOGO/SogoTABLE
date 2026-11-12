// Chess Tutor — scoped CSS, injected once. Colours live in tokens on the root
// with a dark-theme override, so a palette swap is a token edit.
export const CHESS_TUTOR_CSS = `
.chess-tutor-root{
  --ct-bg:#fbf7f2; --ct-card:#ffffff; --ct-ink:#1f1a17; --ct-muted:#6b625b; --ct-line:#e6dcd2;
  --ct-accent:#8a5a2b; --ct-accent-ink:#ffffff; --ct-good:#1f7a4d; --ct-good-bg:#e7f6ee;
  --ct-bad:#b42318; --ct-bad-bg:#fdecea; --ct-info-bg:#f3ede6; --ct-new:#5b6bd6; --ct-due:#c27a0e;
  --ct-master:#1f7a4d; --ct-chip:#efe7de;
  color:var(--ct-ink); display:flex; flex-direction:column; gap:12px; padding-bottom:24px;
}
html[data-theme="dark"] .chess-tutor-root{
  --ct-bg:#181512; --ct-card:#221e1a; --ct-ink:#efe8e1; --ct-muted:#b0a69c; --ct-line:#3a332c;
  --ct-accent:#d8a26a; --ct-accent-ink:#1a1410; --ct-good:#6fd3a0; --ct-good-bg:#16322a;
  --ct-bad:#ff8a80; --ct-bad-bg:#3a1d1a; --ct-info-bg:#2a241f; --ct-new:#a3b0ff; --ct-due:#f0b452;
  --ct-master:#6fd3a0; --ct-chip:#2e2822;
}
.chess-tutor-root [hidden]{display:none !important;}
.chess-tutor-root .ct-card{background:var(--ct-card);border:1px solid var(--ct-line);border-radius:14px;padding:14px;}
.chess-tutor-root .ct-muted{color:var(--ct-muted);font-size:.9rem;}
.chess-tutor-root h3{margin:0 0 4px;font-size:1.05rem;}
.chess-tutor-root .ct-today{display:flex;flex-direction:column;gap:10px;}
.chess-tutor-root .ct-today-stats{display:flex;gap:16px;flex-wrap:wrap;font-size:.95rem;}
.chess-tutor-root .ct-today-stats b{font-size:1.25rem;}
.chess-tutor-root .ct-btn{border:0;border-radius:10px;padding:12px 14px;font-weight:700;font-size:1rem;cursor:pointer;
  background:var(--ct-accent);color:var(--ct-accent-ink);min-height:44px;}
.chess-tutor-root .ct-btn.ct-secondary{background:var(--ct-chip);color:var(--ct-ink);}
.chess-tutor-root .ct-btn:disabled{opacity:.5;cursor:default;}
.chess-tutor-root .ct-row{display:flex;gap:8px;flex-wrap:wrap;}
.chess-tutor-root .ct-row > .ct-btn{flex:1 1 140px;}
.chess-tutor-root .ct-helps{display:flex;gap:6px;flex-wrap:wrap;}
.chess-tutor-root .ct-chip{border:1px solid var(--ct-line);background:var(--ct-chip);color:var(--ct-ink);border-radius:999px;
  padding:6px 12px;font-size:.85rem;cursor:pointer;min-height:36px;}
.chess-tutor-root .ct-chip[aria-pressed="false"]{opacity:.55;text-decoration:line-through;}
.chess-tutor-root .ct-group-title{margin:6px 2px 0;font-size:.85rem;text-transform:uppercase;letter-spacing:.06em;color:var(--ct-muted);}
.chess-tutor-root .ct-openings{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;}
.chess-tutor-root .ct-opening{text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:6px;color:var(--ct-ink);font:inherit;}
.chess-tutor-root .ct-opening-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;}
.chess-tutor-root .ct-badge{font-size:.75rem;border-radius:999px;padding:2px 8px;background:var(--ct-chip);color:var(--ct-muted);white-space:nowrap;}
.chess-tutor-root .ct-badge.ct-due{background:var(--ct-due);color:#fff;}
.chess-tutor-root .ct-badge.ct-new{background:var(--ct-new);color:#fff;}
.chess-tutor-root .ct-badge.ct-mastered{background:var(--ct-master);color:#fff;}
html[data-theme="dark"] .chess-tutor-root .ct-badge.ct-due,
html[data-theme="dark"] .chess-tutor-root .ct-badge.ct-new,
html[data-theme="dark"] .chess-tutor-root .ct-badge.ct-mastered{color:#14110e;}
.chess-tutor-root .ct-bar{display:flex;height:8px;border-radius:999px;overflow:hidden;background:var(--ct-chip);}
.chess-tutor-root .ct-bar span{display:block;height:100%;}
.chess-tutor-root .ct-bar .ct-b-master{background:var(--ct-master);}
.chess-tutor-root .ct-bar .ct-b-learn{background:var(--ct-due);}
.chess-tutor-root .ct-ideas{margin:6px 0 0;padding-left:20px;}
.chess-tutor-root .ct-ideas li{margin:4px 0;}
.chess-tutor-root .ct-lines{display:flex;flex-direction:column;gap:8px;}
.chess-tutor-root .ct-line{display:flex;justify-content:space-between;align-items:center;gap:8px;text-align:left;width:100%;
  background:var(--ct-card);border:1px solid var(--ct-line);border-radius:12px;padding:10px 12px;color:var(--ct-ink);font:inherit;cursor:pointer;min-height:48px;}
.chess-tutor-root .ct-line small{display:block;color:var(--ct-muted);}
.chess-tutor-root .ct-drill{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start;}
@media (min-width: 860px){ .chess-tutor-root .ct-drill{grid-template-columns:minmax(0,560px) minmax(260px,1fr);} }
.chess-tutor-root .ct-board{width:100%;max-width:560px;margin:0 auto;aspect-ratio:1;touch-action:none;}
.chess-tutor-root .ct-side{display:flex;flex-direction:column;gap:10px;}
.chess-tutor-root .ct-title{display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap;}
.chess-tutor-root .ct-prompt{font-weight:700;font-size:1.05rem;}
.chess-tutor-root .ct-moves{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9rem;color:var(--ct-muted);line-height:1.5;}
.chess-tutor-root .ct-note{background:var(--ct-info-bg);border-radius:12px;padding:10px 12px;line-height:1.4;}
.chess-tutor-root .ct-note b{font-family:ui-monospace,Menlo,Consolas,monospace;}
.chess-tutor-root .ct-note.ct-good{background:var(--ct-good-bg);}
.chess-tutor-root .ct-note.ct-bad{background:var(--ct-bad-bg);}
.chess-tutor-root .ct-note.ct-bad .ct-note-head{color:var(--ct-bad);}
.chess-tutor-root .ct-note.ct-good .ct-note-head{color:var(--ct-good);}
.chess-tutor-root .ct-note-head{font-weight:700;margin-bottom:4px;}
.chess-tutor-root .ct-note ul{margin:4px 0 0;padding-left:18px;}
.chess-tutor-root .ct-summary{text-align:center;display:flex;flex-direction:column;gap:8px;}
.chess-tutor-root .ct-summary .ct-big{font-size:2rem;}
.chess-tutor-root .ct-credits{font-size:.75rem;color:var(--ct-muted);text-align:center;}
#chessTutor .ct-mount{max-width:1000px;margin:0 auto;width:100%;}
`;
