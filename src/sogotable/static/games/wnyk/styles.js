// Well, Now You Know — scoped game CSS, LIFTED VERBATIM from the developed
// prototype (AI/cah/preview.html, LIFT SEAM 1). Every rule scoped under
// .wnyk-root. Rides the shell tokens; card faces keep physical paper colors
// in BOTH themes (docs/theme.md physical-pieces rule): white answers
// near-white paper, black prompts near-black paper.
export const WNYK_CSS = `
#macroBoard:has(.wnyk-root){display:block;aspect-ratio:auto;background:none;border:none;}
/* While WNYK is on screen, hide the shell's upper player-switch strip
   ENTIRELY — the game's own seat strip (.wk-seats) already shows every
   player with the turn marker, so the strip is pure duplication here.
   Gated on :has so it applies exactly while .wnyk-root is mounted in the
   board and self-cleans the moment any other game renders — no marker
   class to forget on unmount, and shell re-renders can't bring it back. */
#game:has(#macroBoard .wnyk-root) #gamePlayerSwitch{display:none;}
.wnyk-root{position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;
 width:100%;box-sizing:border-box;padding:14px 10px 22px;border-radius:18px;
 background:var(--bg);
 --wk-panel:var(--panel);--wk-ink:var(--ink);--wk-muted:var(--muted);--wk-line:var(--line);
 --wk-like:#d64b6e;--wk-gold:#e7c256;
 color:var(--wk-ink);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;}
.wnyk-root .wk-panel{width:100%;max-width:480px;background:var(--wk-panel);border:1px solid var(--wk-line);
 border-radius:14px;padding:10px 12px;box-sizing:border-box;}
/* Message strip: one line, height reserved so controls below never jump. */
.wnyk-root .wk-msg{width:100%;max-width:480px;box-sizing:border-box;margin:0;padding:8px 12px;
 border-radius:12px;background:var(--wk-panel);border:1px solid var(--wk-line);font-size:.9rem;
 height:36px;display:flex;align-items:center;justify-content:center;
 white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.wnyk-root .wk-msg.wk-error{border-color:var(--danger-border);color:var(--danger-ink);background:var(--danger-bg);}
/* Seat strip: every seat in order, ⚖️ on the judge; status badge per phase. */
.wnyk-root .wk-seats{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;width:100%;max-width:520px;}
.wnyk-root .wk-seat{display:flex;align-items:center;gap:5px;padding:5px 9px;border-radius:999px;
 border:1px solid var(--wk-line);background:var(--wk-panel);font-size:.84rem;font-weight:700;
 max-width:150px;white-space:nowrap;}
.wnyk-root .wk-seat .wk-seat-name{min-width:0;overflow:hidden;text-overflow:ellipsis;}
.wnyk-root .wk-seat.wk-me{border-color:var(--wk-gold);}
.wnyk-root .wk-seat .wk-badge{flex:0 0 auto;}
.wnyk-root .wk-skip{border:1px solid var(--danger-border);background:var(--danger-bg);color:var(--danger-ink);
 border-radius:999px;min-height:26px;padding:0 8px;font-size:.74rem;cursor:pointer;white-space:nowrap;}
/* Black prompt card: near-black paper, light text, in every theme. */
.wnyk-root .wk-black{width:100%;max-width:480px;box-sizing:border-box;padding:16px 18px;border-radius:14px;
 text-align:center;
 background:#1b1815;color:#f4f1e8;border:2px solid #000;box-shadow:inset 0 -3px 0 rgba(255,255,255,.05),0 3px 8px rgba(0,0,0,.3);
 font-weight:800;font-size:1.05rem;line-height:1.45;}
.wnyk-root .wk-black .wk-gap{border-bottom:2px solid #f4f1e8;padding:0 4px;min-width:56px;display:inline-block;
 text-align:center;line-height:1.2;}
.wnyk-root .wk-black .wk-gap.wk-filled{color:var(--wk-gold);border-bottom-color:var(--wk-gold);}
.wnyk-root .wk-black .wk-black-tag{display:block;margin-top:10px;font-size:.68rem;font-weight:700;
 letter-spacing:.08em;color:#8f8a80;white-space:nowrap;}
/* White answer card: near-white paper, dark text, in every theme.
   Flex column: text body (flex:1) + fixed-height footer for the pack label —
   real layout space the text can NEVER enter, in every variant (the compact
   triage tiles override padding, so a padding-band would overlap there).
   Bodies stretch, footers pin to the bottom, so cards in a row stay uniform. */
.wnyk-root .wk-card{position:relative;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;
 padding:12px 12px 5px;border-radius:12px;
 background:#fdfcf6;color:#221f1b;border:1px solid rgba(0,0,0,.3);
 box-shadow:inset 0 -3px 0 rgba(0,0,0,.07),0 2px 5px rgba(0,0,0,.22);
 font-weight:700;font-size:.92rem;line-height:1.35;min-height:108px;
 transition:transform .12s ease,box-shadow .12s ease;}
/* Card text sits centered, both axes, in the body area (footer/badges keep
   their spots); long text wraps centered — acceptable, it's card text. */
.wnyk-root .wk-card .wk-card-body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;
 align-items:center;justify-content:center;text-align:center;}
.wnyk-root .wk-card .wk-card-foot,.wnyk-root .wk-sentence .wk-card-foot{flex:0 0 auto;height:20px;
 display:flex;align-items:center;justify-content:center;padding:0 28px;}
.wnyk-root .wk-card .wk-card-author{display:block;max-width:100%;margin-top:6px;font-size:.72rem;font-style:italic;
 font-weight:600;color:#8a5a10;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
/* Source-pack label: centered in the fixed footer row of EVERY face (footer
   padding clears the corner thumbs), so faces with and without thumbs or
   labels stay the same height — controls never jump. Two scoped colors keep
   it legible on paper-white answers and near-black prompts. */
.wnyk-root .wk-card .wk-card-pack,.wnyk-root .wk-sentence .wk-card-pack{max-width:100%;text-align:center;
 font-size:.6rem;font-weight:600;font-style:normal;color:#8d867a;
 white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.wnyk-root .wk-black .wk-card-pack{display:block;margin-top:8px;text-align:center;
 font-size:.6rem;font-weight:600;letter-spacing:.06em;color:#8f8a80;
 white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
/* Hand: a WRAPPING grid that fills the column — never a horizontal strip.
   auto-fill/minmax sets the column count (~2 on phones, more on wide screens);
   all 10 cards are reached by scrolling the PAGE vertically. padding-top gives
   the raise transform headroom so it never clips against the row above. */
.wnyk-root .wk-hand{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;
 width:100%;max-width:640px;padding-top:8px;}
.wnyk-root .wk-hand .wk-card{cursor:pointer;-webkit-tap-highlight-color:transparent;}
.wnyk-root .wk-hand .wk-card.wk-raised{transform:translateY(-8px);border-color:var(--accent);
 box-shadow:0 6px 12px rgba(0,0,0,.28);z-index:2;}
.wnyk-root .wk-card .wk-order{position:absolute;top:6px;right:8px;width:22px;height:22px;border-radius:50%;
 background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;
 font-size:.78rem;font-weight:800;}
.wnyk-root .wk-card.wk-blank{border-style:dashed;color:#7a746a;font-style:italic;}
.wnyk-root .wk-card.wk-blank .wk-card-body{display:flex;align-items:center;justify-content:center;
 text-align:center;}
/* The 👎 control (§5b): the ONLY rating control — playing a card is its
   implicit up-vote. One corner tap target; it never selects the card and
   never resizes it. Disabled (never hidden) when the round's dump is spent
   or the card is in the current selection. */
.wnyk-root .wk-rate{position:absolute;bottom:3px;left:6px;right:6px;display:flex;justify-content:flex-end;}
.wnyk-root .wk-thumb{border:none;background:transparent;min-height:22px;height:22px;width:26px;padding:0;
 font-size:.82rem;line-height:1;opacity:.55;cursor:pointer;border-radius:6px;-webkit-tap-highlight-color:transparent;}
.wnyk-root .wk-thumb:disabled{opacity:.22;cursor:not-allowed;}
/* Dump-swap: 👎 replaces the card in place (once per round) — the fresh card
   flips in with no layout shift; the badge shows availability, dimmed when
   spent (disabled state, never hidden). */
.wnyk-root .wk-card.wk-swapped,.wnyk-root .wk-black.wk-swapped{animation:wk-swap .45s ease;}
@keyframes wk-swap{0%{transform:rotateY(85deg);opacity:.2;}100%{transform:none;opacity:1;}}
.wnyk-root .wk-dumpbadge{width:100%;max-width:640px;display:flex;justify-content:flex-end;
 font-size:.74rem;color:var(--wk-muted);white-space:nowrap;}
.wnyk-root .wk-dumpbadge.wk-spent{opacity:.55;}
/* Write-in composer */
.wnyk-root .wk-composer{display:grid;gap:8px;}
.wnyk-root .wk-composer textarea{font:inherit;resize:none;border:1px solid var(--wk-line);border-radius:10px;
 background:var(--surface);color:var(--wk-ink);padding:8px 10px;min-height:58px;}
.wnyk-root .wk-composer .wk-composer-row{display:flex;align-items:center;gap:8px;}
.wnyk-root .wk-composer .wk-count{flex:0 0 auto;font-size:.78rem;color:var(--wk-muted);
 font-variant-numeric:tabular-nums;white-space:nowrap;}
.wnyk-root .wk-composer button{width:auto;flex:1;}
/* Commit bar: always present while submitting — disabled, never hidden. */
.wnyk-root .wk-commitbar{width:100%;max-width:480px;display:grid;gap:6px;}
.wnyk-root .wk-commit-hint{margin:0;text-align:center;font-size:.76rem;color:var(--wk-muted);white-space:nowrap;}
/* Judge triage: three FULL-WIDTH sections stacked vertically — 📋 All,
   ❤️ Favorite, 🏆 Final. Tiles wrap in a grid inside each section; sections
   grow and the PAGE scrolls — no inner scroll in either orientation. Empty
   sections keep their header + a stable min-height, so promoting a card
   never jolts the layout. */
.wnyk-root .wk-triage{display:grid;grid-template-columns:1fr;gap:8px;width:100%;max-width:640px;}
.wnyk-root .wk-col{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;
 align-content:start;background:var(--wk-panel);border:1px solid var(--wk-line);border-radius:12px;
 padding:8px;min-height:96px;box-sizing:border-box;}
.wnyk-root .wk-col-h{grid-column:1 / -1;margin:0;text-align:center;font-size:.82rem;font-weight:800;
 white-space:nowrap;color:var(--wk-muted);}
.wnyk-root .wk-col .wk-confirm{grid-column:1 / -1;}
.wnyk-root .wk-col.wk-col-final{border-color:var(--wk-gold);}
/* The confirm action is unmistakable: success-green when armed (a card sits
   in Final), neutral while disabled — disabled, never hidden. The Final
   column wears the matching green accent when occupied. */
.wnyk-root .wk-confirm{background:#1e9e50;border:1px solid #1e9e50;color:#fff;font-weight:800;}
.wnyk-root .wk-confirm:disabled{background:var(--surface);border-color:var(--wk-line);color:var(--wk-muted);}
.wnyk-root .wk-col.wk-col-final.wk-final-armed{border-color:#1e9e50;box-shadow:0 0 0 1px #1e9e50 inset;}
:root[data-theme="dark"] .wnyk-root .wk-confirm:not(:disabled){background:#23b35c;border-color:#23b35c;}
:root[data-theme="dark"] .wnyk-root .wk-col.wk-col-final.wk-final-armed{border-color:#2fbf6b;
 box-shadow:0 0 0 1px #2fbf6b inset;}
.wnyk-root .wk-sub{display:grid;gap:4px;}
.wnyk-root .wk-sub .wk-card{min-height:0;padding:8px 9px;font-size:.8rem;}
/* Completed sentence: the prompt with the played card(s) substituted in as
   inline paper chips — hero of the reveal, compact in the triage tiles.
   Body text: it wraps normally (clause wrapping is fine here, not chrome). */
.wnyk-root .wk-sentence{width:100%;box-sizing:border-box;font-weight:600;line-height:1.6;text-align:center;}
.wnyk-root .wk-sentence .wk-fill{background:#fdfcf6;color:#221f1b;border:1px solid rgba(0,0,0,.25);
 border-radius:6px;padding:0 5px;font-weight:800;-webkit-box-decoration-break:clone;box-decoration-break:clone;}
.wnyk-root .wk-sentence .wk-fill .wk-fill-author{font-size:.7rem;font-style:italic;font-weight:600;
 color:#8a5a10;white-space:nowrap;}
.wnyk-root .wk-sentence .wk-gap{border-bottom:2px solid var(--wk-muted);min-width:48px;display:inline-block;}
.wnyk-root .wk-sentence-hero{font-size:1.02rem;margin-top:8px;}
.wnyk-root .wk-sentence .wk-card-foot{margin-top:6px;}
.wnyk-root .wk-sub .wk-sentence{font-size:.78rem;line-height:1.5;background:var(--surface);
 border:1px solid var(--wk-line);border-radius:10px;padding:8px 9px;}
.wnyk-root .wk-sub .wk-sub-actions{display:flex;gap:4px;}
.wnyk-root .wk-sub .wk-sub-actions button{flex:1;min-height:30px;padding:0;font-size:.8rem;border-radius:8px;}
.wnyk-root .wk-sub .wk-like-on{border-color:var(--wk-like);color:var(--wk-like);}
/* Prompt stage: judge-only hero prompt with 👎 (dump) + Release; everyone
   else sees the card face-down until release. */
.wnyk-root .wk-prompt-controls{display:grid;grid-template-columns:auto 1fr;gap:8px;width:100%;max-width:480px;}
.wnyk-root .wk-prompt-controls .wk-black-dump{width:64px;}
.wnyk-root .wk-black.wk-black-down{display:flex;align-items:center;justify-content:center;
 min-height:110px;font-size:2rem;letter-spacing:.2em;}
/* Read-aloud (judging stage 1): one hero sentence at a time, same card for
   the whole room; judge controls below, spectators get the face-down count.
   Both lines always render so controls never jump. */
.wnyk-root .wk-readaloud{display:grid;gap:8px;width:100%;max-width:480px;text-align:center;}
.wnyk-root .wk-readaloud .wk-progress{font-size:.78rem;font-weight:800;color:var(--wk-muted);white-space:nowrap;}
.wnyk-root .wk-readaloud .wk-ra-controls{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.wnyk-root .wk-readaloud .wk-remaining{font-size:.74rem;color:var(--wk-muted);white-space:nowrap;}
/* Reveal banner */
.wnyk-root .wk-banner{width:100%;max-width:480px;box-sizing:border-box;text-align:center;padding:14px;
 border-radius:14px;border:2px solid var(--wk-gold);background:var(--wk-panel);}
.wnyk-root .wk-banner .wk-banner-line{font-size:1.05rem;font-weight:800;white-space:nowrap;overflow:hidden;
 text-overflow:ellipsis;}
.wnyk-root .wk-banner .wk-banner-sub{margin-top:4px;font-size:.82rem;color:var(--wk-muted);white-space:nowrap;
 overflow:hidden;text-overflow:ellipsis;}
.wnyk-root .wk-banner .wk-sentence-hero{margin-top:10px;}
/* Standings: sorted by score; ❤️ column feeds the Most Liked podium. */
.wnyk-root .wk-stand{width:100%;border-collapse:collapse;font-size:.88rem;}
.wnyk-root .wk-stand th{font-size:.72rem;color:var(--wk-muted);font-weight:700;padding:2px 6px;white-space:nowrap;}
.wnyk-root .wk-stand td{padding:4px 6px;border-top:1px solid var(--wk-line);white-space:nowrap;}
.wnyk-root .wk-stand td.wk-stand-name{max-width:0;width:100%;overflow:hidden;text-overflow:ellipsis;text-align:left;}
.wnyk-root .wk-stand th:not(:first-child),.wnyk-root .wk-stand td:not(.wk-stand-name){text-align:center;}
.wnyk-root .wk-podium{display:grid;gap:4px;text-align:center;font-weight:800;}
.wnyk-root .wk-podium .wk-podium-line{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.wnyk-root .wk-podium .wk-podium-liked{color:var(--wk-like);}
/* Help panel (collapsible) */
.wnyk-root .wk-help{width:100%;max-width:480px;}
.wnyk-root .wk-help summary{cursor:pointer;font-weight:700;color:var(--wk-muted);white-space:nowrap;}
.wnyk-root .wk-help .wk-help-body{display:grid;gap:6px;margin-top:8px;font-size:.84rem;color:var(--wk-muted);
 line-height:1.4;}
.wnyk-root .wk-help .wk-credit{font-size:.74rem;white-space:nowrap;}
/* Host lobby options (rendered via renderHostStartLobby extraHtml; scoped copy
   of the .hx segmented-control pattern — hearts ships its own, we ship ours). */
.wnyk-root .hx-options{display:flex;flex-direction:column;gap:8px;margin:10px 0 4px;text-align:left;}
.wnyk-root .hx-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.wnyk-root .hx-opt .hx-opt-label b{display:block;font-size:.9rem;}
.wnyk-root .hx-opt .hx-opt-label span{font-size:.74rem;color:var(--wk-muted);white-space:nowrap;}
.wnyk-root .hx-seg{display:flex;background:var(--wk-line);border-radius:999px;padding:3px;flex:none;}
.wnyk-root .hx-seg button{border:none;background:transparent;color:inherit;padding:5px 11px;min-height:0;
 border-radius:999px;font-size:.82rem;cursor:pointer;white-space:nowrap;}
.wnyk-root .hx-seg button.hx-on{background:var(--wk-ink);color:var(--bg);font-weight:700;}
/* Narrow phones: scale only — same layout everywhere. */
@media (max-width:390px){
  .wnyk-root .wk-card{font-size:.84rem;padding:10px 10px 4px;min-height:98px;}
  /* smaller min card width so narrow phones keep ~2 columns (minmax only —
     the layout itself never rearranges) */
  .wnyk-root .wk-hand{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));}
  .wnyk-root .wk-black{font-size:.96rem;}
  .wnyk-root .wk-sub .wk-card{font-size:.72rem;}
  .wnyk-root .wk-col-h{font-size:.74rem;}
  /* narrower tile minimum so small phones keep ~2 tiles per section row */
  .wnyk-root .wk-col{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));}
}
/* Landscape / wide viewports: the stacked sections widen to the full board
   so their wrapping tile grids fit more per row (no-inner-scroll holds). */
@media (orientation:landscape){
  .wnyk-root .wk-triage{max-width:none;}
}
`;
