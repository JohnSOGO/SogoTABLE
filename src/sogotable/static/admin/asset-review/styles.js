// Asset Review: scoped CSS, injected once by index.js. Colours come from the
// shell tokens (styles-tokens.css), so light and dark themes both work.
export const ASSET_REVIEW_CSS = `
.asset-review-root{
  --ar-ok:#1f7a4d; --ar-ok-bg:#e7f6ee; --ar-bad:#b42318; --ar-bad-bg:#fdecea; --ar-regen:#7a4fd6; --ar-regen-bg:#efe9fd;
  --ar-wave:#1e63d6; --ar-wave-played:#d71920; --ar-clip:#b42318; --ar-line:var(--line);
  display:flex; flex-direction:column; gap:10px; padding-bottom:32px; color:var(--text);
}
html[data-theme="dark"] .asset-review-root{
  --ar-ok:#6fd3a0; --ar-ok-bg:#16322a; --ar-bad:#ff8a80; --ar-bad-bg:#3a1d1a; --ar-regen:#b9a3ff; --ar-regen-bg:#2a2340;
  --ar-wave:#7fb0ff; --ar-wave-played:#ff8a80; --ar-clip:#ff5c5c;
}
.asset-review-root .ar-card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:12px;box-shadow:var(--shadow-sm);}
.asset-review-root .ar-muted{color:var(--muted);font-size:.88rem;}
.asset-review-root .ar-error{color:var(--ar-bad);}
.asset-review-root kbd{font:600 .7rem/1 ui-monospace,monospace;border:1px solid var(--line);border-radius:4px;padding:1px 4px;opacity:.75;}
@media (pointer:coarse){.asset-review-root .ar-btn kbd,.asset-review-root .ar-check kbd{display:none;}}
.asset-review-root .ar-toolbar{display:flex;flex-direction:column;gap:8px;}
.asset-review-root .ar-progress-bar{height:8px;border-radius:99px;background:var(--surface-sunken);overflow:hidden;}
.asset-review-root .ar-progress-bar span{display:block;height:100%;background:var(--ar-ok);transition:width .3s;}
.asset-review-root .ar-counts{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:6px;font-size:.9rem;}
.asset-review-root .ar-save-state{margin-left:auto;color:var(--muted);font-size:.85rem;}
.asset-review-root .ar-filters,.asset-review-root .ar-actions,.asset-review-root .ar-row-btns,.asset-review-root .ar-verdict{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.asset-review-root select,.asset-review-root input[type=search]{width:auto;min-height:40px;border:1px solid var(--line);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);padding:0 10px;font:inherit;}
.asset-review-root input[type=search]{flex:1 1 140px;min-width:0;}
.asset-review-root .ar-seg{display:inline-flex;border:1px solid var(--line);border-radius:var(--radius-sm);overflow:hidden;}
.asset-review-root .ar-seg button{border:0;background:var(--surface);color:var(--text);padding:0 12px;min-height:40px;font:inherit;cursor:pointer;}
.asset-review-root .ar-seg button[aria-pressed=true]{background:var(--pill-bg);color:var(--on-pill);}
.asset-review-root .ar-btn{border:1px solid transparent;border-radius:var(--radius-sm);padding:0 12px;min-height:40px;font:600 .92rem var(--font-ui);cursor:pointer;
  background:var(--accent);color:#fff;display:inline-flex;align-items:center;gap:6px;text-decoration:none;}
.asset-review-root .ar-btn.ar-secondary{background:var(--secondary-bg);border-color:var(--secondary-border);color:var(--text);}
.asset-review-root .ar-btn:disabled{opacity:.45;cursor:default;}
.asset-review-root .ar-btn.ar-ok{background:var(--ar-ok-bg);color:var(--ar-ok);border-color:var(--ar-ok);}
.asset-review-root .ar-btn.ar-bad{background:var(--ar-bad-bg);color:var(--ar-bad);border-color:var(--ar-bad);}
.asset-review-root .ar-btn[aria-pressed=true]{box-shadow:0 0 0 3px var(--ring);font-weight:800;}
.asset-review-root .ar-btn.ar-ok[aria-pressed=true]{background:var(--ar-ok);color:#fff;}
.asset-review-root .ar-btn.ar-bad[aria-pressed=true]{background:var(--ar-bad);color:#fff;}
.asset-review-root .ar-check{display:inline-flex;align-items:center;gap:6px;min-height:40px;font-size:.92rem;cursor:pointer;}
.asset-review-root .ar-check input{width:20px;height:20px;min-height:0;margin:0;padding:0;flex:0 0 20px;accent-color:var(--accent);}
.asset-review-root .ar-volume{display:inline-flex;align-items:center;gap:6px;font-size:.92rem;}
.asset-review-root .ar-volume input{width:110px;min-height:0;padding:0;accent-color:var(--accent);}
.asset-review-root .ar-banner{background:var(--notice-bg);border:1px solid var(--notice-border);color:var(--notice-ink);border-radius:var(--radius-sm);padding:8px 10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
.asset-review-root .ar-chip{font-size:.75rem;border-radius:99px;padding:2px 8px;background:var(--surface-sunken);color:var(--muted);white-space:nowrap;}
.asset-review-root .ar-chip.ar-approved{background:var(--ar-ok-bg);color:var(--ar-ok);}
.asset-review-root .ar-chip.ar-rejected{background:var(--ar-bad-bg);color:var(--ar-bad);}
.asset-review-root .ar-chip.ar-regen{background:var(--ar-regen-bg);color:var(--ar-regen);}
.asset-review-root .ar-list{display:flex;flex-direction:column;gap:6px;}
.asset-review-root .ar-row{padding:0;overflow:hidden;}
.asset-review-root .ar-row.ar-open{border-color:var(--accent);}
.asset-review-root .ar-row-head{all:unset;box-sizing:border-box;width:100%;display:flex;gap:10px;align-items:center;padding:8px 10px;cursor:pointer;min-height:56px;}
.asset-review-root .ar-row-head:focus-visible{outline:3px solid var(--ring);}
.asset-review-root .ar-thumb{width:44px;height:44px;border-radius:8px;object-fit:cover;flex:0 0 44px;background:var(--surface-sunken);display:grid;place-items:center;font-size:1.3rem;}
.asset-review-root .ar-row-text{display:flex;flex-direction:column;min-width:0;flex:1;}
.asset-review-root .ar-row-text b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.asset-review-root .ar-note-snippet{font-size:.8rem;color:var(--muted);font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.asset-review-root .ar-row-status{display:flex;flex-direction:column;gap:4px;align-items:flex-end;}
.asset-review-root .ar-detail{border-top:1px solid var(--line);padding:12px;display:flex;flex-direction:column;gap:10px;}
.asset-review-root .ar-sources{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;}
.asset-review-root .ar-source{border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:var(--radius-sm);min-height:44px;padding:4px 8px;
  font:inherit;font-size:.88rem;cursor:pointer;display:flex;align-items:center;gap:6px;flex-wrap:wrap;text-align:left;}
.asset-review-root .ar-source.ar-selected{border-color:var(--accent);box-shadow:0 0 0 2px var(--ring);}
.asset-review-root .ar-source.ar-playing{background:var(--active-soft);}
.asset-review-root .ar-source-n{font:700 .75rem ui-monospace,monospace;color:var(--muted);}
.asset-review-root .ar-ab{background:var(--pill-bg);color:var(--on-pill);border-radius:4px;font-size:.7rem;padding:1px 5px;font-weight:800;}
.asset-review-root .ar-wave{width:100%;height:72px;display:block;background:var(--surface-sunken);border-radius:var(--radius-sm);}
.asset-review-root .ar-stats{display:flex;flex-wrap:wrap;gap:10px;margin:0;font-size:.85rem;font-variant-numeric:tabular-nums;}
.asset-review-root .ar-warn{color:var(--warn);font-weight:700;}
.asset-review-root .ar-note{width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);padding:8px;font:inherit;resize:vertical;}
.asset-review-root .ar-meta{margin:0;word-break:break-all;}
.asset-review-root .ar-pictures{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;padding:10px;border-radius:var(--radius-sm);}
.asset-review-root .ar-pictures figure{margin:0;display:flex;flex-direction:column;gap:4px;align-items:center;}
.asset-review-root .ar-pictures figcaption{font-size:.75rem;opacity:.8;}
.asset-review-root .ar-picture-full{max-width:min(384px,100%);height:auto;border-radius:8px;}
.asset-review-root .ar-in-game{width:100px;height:124px;border-radius:10px;overflow:hidden;border:3px solid #e8b95a;background:#561d1b;}
.asset-review-root .ar-in-game img{width:100%;height:100%;object-fit:cover;}
.asset-review-root .ar-bg-light{background:#fbf6f3;color:#1d1a1a;}
.asset-review-root .ar-bg-dark{background:#14181f;color:#e8eaef;}
.asset-review-root .ar-bg-felt{background:#1f5135;color:#f1f1e6;}
.asset-review-root .ar-shortcuts dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:0;}
.asset-review-root .ar-shortcuts dd{margin:0;}
.asset-review-root .ar-empty{text-align:center;padding:24px;}
`;
