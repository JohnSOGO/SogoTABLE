// No Thanks! — scoped styles, injected once by render.js (NOT added to the
// line-capped styles-games.css), mirroring the liars-dice/zombie-dice/rtta
// precedent. Every rule is prefixed under `.no-thanks-root`.
//
// Theme: the board rides the shell's light/dark tokens (--bg/--panel/--ink/
// --muted/--line) like the platform chrome. Cards keep a physical paper face
// (near-white) in every theme, per docs/theme.md's physical-pieces rule, with
// a danger tint (low teal / mid amber / high red) so the table reads at a
// glance. This file is the card-look pilot — expect heavy iteration here.
export const NT_CSS = `
#macroBoard:has(.no-thanks-root){display:block;aspect-ratio:auto;background:none;border:none;}
.no-thanks-root{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:12px;
 width:100%;box-sizing:border-box;padding:16px 10px 22px;border-radius:18px;
 background:var(--bg);
 --nt-panel:var(--panel);--nt-ink:var(--ink);--nt-muted:var(--muted);--nt-line:var(--line);
 --nt-gold:#e7c256;--nt-danger:#d64b3e;
 --nt-low:#2f8f6b;--nt-mid:#c08a1f;--nt-high:#c2453a;
 color:var(--nt-ink);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;}
.no-thanks-root .nt-panel{width:100%;max-width:440px;background:var(--nt-panel);border:1px solid var(--nt-line);
 border-radius:14px;padding:10px 12px;box-sizing:border-box;}
.no-thanks-root .nt-banner{margin:0;text-align:center;font-weight:700;font-size:1.12rem;}
/* Tip strip: the one home for long guidance/verdict text. */
.no-thanks-root .nt-tip{width:100%;max-width:440px;box-sizing:border-box;margin:0;
 padding:9px 12px;border-radius:12px;background:var(--nt-panel);border:1px solid var(--nt-line);
 font-size:.9rem;text-align:center;color:var(--nt-ink);min-height:38px;}
.no-thanks-root .nt-tip.nt-your-turn{border-color:var(--nt-gold);animation:nt-turn-pulse 1.2s ease-in-out 3;}
@keyframes nt-turn-pulse{50%{background:rgba(231,194,86,.16);box-shadow:0 0 0 3px rgba(231,194,86,.18);}}
/* ---- the card (cards.js primitives): paper face in every theme ---- */
.no-thanks-root .nt-card{position:relative;display:inline-flex;align-items:center;justify-content:center;
 background:#fbfaf6;color:#1c2320;border:1px solid rgba(0,0,0,.28);border-radius:10px;
 box-shadow:inset 0 -3px 0 rgba(0,0,0,.08),0 2px 5px rgba(0,0,0,.25);
 font-variant-numeric:tabular-nums;pointer-events:none;}
.no-thanks-root .nt-card .nt-value{font-weight:800;line-height:1;}
.no-thanks-root .nt-card .nt-corner{position:absolute;font-weight:700;line-height:1;}
.no-thanks-root .nt-card .nt-corner-tl{top:6%;left:9%;}
.no-thanks-root .nt-card .nt-corner-br{bottom:6%;right:9%;transform:rotate(180deg);}
/* Danger tint: the value wears the tier color; the face stays paper. */
.no-thanks-root .nt-tier-low .nt-value,.no-thanks-root .nt-tier-low .nt-corner{color:var(--nt-low);}
.no-thanks-root .nt-tier-mid .nt-value,.no-thanks-root .nt-tier-mid .nt-corner{color:var(--nt-mid);}
.no-thanks-root .nt-tier-high .nt-value,.no-thanks-root .nt-tier-high .nt-corner{color:var(--nt-high);}
/* Sizes: big = the face-up table card, hand = your cards, mini = others'. */
.no-thanks-root .nt-card-big{width:112px;height:158px;border-radius:14px;font-size:3rem;
 border-width:2px;}
.no-thanks-root .nt-card-big .nt-corner{font-size:1.05rem;}
.no-thanks-root .nt-card-hand{width:44px;height:62px;font-size:1.25rem;}
.no-thanks-root .nt-card-hand .nt-corner{font-size:.5rem;}
.no-thanks-root .nt-card-mini{width:28px;height:40px;font-size:.82rem;border-radius:6px;box-shadow:none;}
.no-thanks-root .nt-card-mini .nt-corner{display:none;}
/* Runs fan behind their lowest (counting) card; tails dim — they score 0. */
.no-thanks-root .nt-run{display:inline-flex;margin-right:8px;margin-bottom:4px;}
.no-thanks-root .nt-run .nt-card{margin-right:0;}
.no-thanks-root .nt-run .nt-run-tail{margin-left:-26px;filter:brightness(.92);}
.no-thanks-root .nt-run .nt-card-mini.nt-run-tail{margin-left:-17px;}
.no-thanks-root .nt-no-cards{color:var(--nt-muted);font-size:.82rem;font-style:italic;}
/* Deal-in: the fresh table card flips up from the deck. */
.no-thanks-root .nt-flip-in{animation:nt-flip .45s ease;}
@keyframes nt-flip{0%{transform:rotateY(90deg) scale(.9);opacity:0;}100%{transform:none;opacity:1;}}
/* ---- the table: deck + face-up card + pot, turn list to the right ---- */
.no-thanks-root .nt-table{display:flex;align-items:center;gap:12px;padding:14px 12px;}
.no-thanks-root .nt-table-main{display:flex;align-items:center;justify-content:center;gap:14px;
 flex:0 0 auto;}
/* Turn list: every seat in order, 🤔 on whose decision it is. Flexes into the
   remaining width (min-width:0 so long names ellipsize instead of overflowing
   on narrow phones) and scrolls past ~5 rows for big N-player tables. */
.no-thanks-root .nt-turn-list{flex:1;min-width:0;margin:0;padding:0;list-style:none;
 max-height:158px;overflow-y:auto;align-self:stretch;display:flex;flex-direction:column;
 justify-content:center;gap:2px;}
.no-thanks-root .nt-turn-row{display:flex;align-items:center;gap:4px;padding:3px 6px;
 border-radius:8px;font-size:.82rem;color:var(--nt-muted);}
.no-thanks-root .nt-turn-row .nt-turn-name{flex:1;min-width:0;overflow:hidden;
 text-overflow:ellipsis;white-space:nowrap;}
.no-thanks-root .nt-turn-row .nt-turn-flag{flex:0 0 20px;text-align:center;}
.no-thanks-root .nt-turn-row.nt-turn-you .nt-turn-name{font-weight:700;color:var(--nt-ink);}
.no-thanks-root .nt-turn-row.nt-turn-now{background:rgba(231,194,86,.16);color:var(--nt-ink);
 border:1px solid var(--nt-gold);padding:2px 5px;}
.no-thanks-root .nt-deck{position:relative;width:72px;height:102px;border-radius:10px;
 background:linear-gradient(135deg,#28527a,#1b3a58);border:1px solid rgba(0,0,0,.4);
 box-shadow:2px 2px 0 rgba(0,0,0,.2),4px 4px 0 rgba(0,0,0,.12);
 display:flex;align-items:center;justify-content:center;color:#dbe7f3;font-weight:800;font-size:1.1rem;}
.no-thanks-root .nt-deck .nt-deck-count{background:rgba(0,0,0,.35);border-radius:9px;padding:2px 8px;}
.no-thanks-root .nt-deck-label{display:block;text-align:center;font-size:.62rem;text-transform:uppercase;
 letter-spacing:.5px;color:var(--nt-muted);margin-top:5px;}
.no-thanks-root .nt-spot{text-align:center;}
.no-thanks-root .nt-pot{display:inline-flex;align-items:center;gap:4px;margin-top:7px;
 padding:3px 10px;border-radius:11px;background:rgba(231,194,86,.18);border:1px solid var(--nt-gold);
 font-weight:800;font-size:.95rem;}
.no-thanks-root .nt-pot.nt-pot-empty{opacity:.45;border-style:dashed;font-weight:600;}
/* Chip gain: the pot (on a pass) and your own stack (on a take) flash green
   once per increase — the class only rides a paint where the count GREW. */
@keyframes nt-chip-flash{0%{background:rgba(99,189,116,.85);box-shadow:0 0 0 4px rgba(99,189,116,.35);}
 100%{box-shadow:0 0 0 0 rgba(99,189,116,0);}}
.no-thanks-root .nt-pot.nt-flash{animation:nt-chip-flash .8s ease;}
.no-thanks-root .nt-chips.nt-flash{animation:nt-chip-flash .8s ease;border-radius:9px;padding:0 4px;}
/* ---- actions: two big thumb targets ---- */
.no-thanks-root .nt-actions{display:flex;gap:10px;width:100%;max-width:440px;}
.no-thanks-root .nt-actions button{flex:1;padding:16px 8px;font-size:1.05rem;font-weight:800;border-radius:14px;
 border:none;color:#fff;box-shadow:0 3px 8px rgba(0,0,0,.35);cursor:pointer;
 touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;}
.no-thanks-root .nt-actions button:active{transform:translateY(2px);box-shadow:0 1px 3px rgba(0,0,0,.35);}
.no-thanks-root .nt-actions .nt-pass{background:linear-gradient(180deg,#ea6a5b,#c43e33);}
.no-thanks-root .nt-actions .nt-take{background:linear-gradient(180deg,#2c8659,#1b5e3e);}
.no-thanks-root .nt-actions button:disabled{opacity:.4;box-shadow:none;transform:none;cursor:default;}
.no-thanks-root .nt-actions button *{pointer-events:none;}
/* ---- player panels ---- */
.no-thanks-root .nt-seat{display:flex;flex-direction:column;gap:7px;}
.no-thanks-root .nt-seat-head{display:flex;align-items:center;gap:8px;}
.no-thanks-root .nt-seat-name{font-weight:700;font-size:.95rem;overflow:hidden;text-overflow:ellipsis;
 white-space:nowrap;min-width:0;flex:1;}
.no-thanks-root .nt-seat.nt-turn-seat{border-color:var(--nt-gold);box-shadow:0 0 0 2px rgba(231,194,86,.25);}
.no-thanks-root .nt-seat .nt-cards-row{display:flex;flex-wrap:wrap;align-items:flex-end;min-height:42px;}
.no-thanks-root .nt-chips{display:inline-flex;align-items:center;gap:3px;font-weight:800;font-size:.92rem;
 white-space:nowrap;}
.no-thanks-root .nt-chips-hidden{color:var(--nt-muted);font-weight:600;}
.no-thanks-root .nt-score-tag{font-size:.78rem;color:var(--nt-muted);white-space:nowrap;}
.no-thanks-root .nt-msg{margin:0;font-size:.9rem;color:var(--nt-muted);text-align:center;}
.no-thanks-root .nt-msg.nt-error{color:var(--nt-danger);}
/* ---- final results ----
   House table style (MojoSOGO 2026-07-04, global): player name left, a
   single-emoji status column beside it, stat columns centered, no row
   numbers. */
.no-thanks-root .nt-results-table{width:100%;border-collapse:collapse;}
.no-thanks-root .nt-results-table th{font-size:.66rem;text-transform:uppercase;letter-spacing:.4px;
 color:var(--nt-muted);padding:3px 5px;text-align:center;border-bottom:1px solid var(--nt-line);}
.no-thanks-root .nt-results-table td{padding:6px 5px;font-size:.88rem;border-bottom:1px solid var(--nt-line);
 color:var(--nt-ink);text-align:center;}
.no-thanks-root .nt-results-table tr:last-child td{border-bottom:none;}
.no-thanks-root .nt-results-table th.nt-name,.no-thanks-root .nt-results-table td.nt-name{text-align:left;
 overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.no-thanks-root .nt-results-table th.nt-status,.no-thanks-root .nt-results-table td.nt-status{width:28px;
 padding-left:0;padding-right:0;}
.no-thanks-root .nt-results-table td.nt-num{font-variant-numeric:tabular-nums;}
.no-thanks-root .nt-results-table td.nt-total{font-weight:800;}
.no-thanks-root .nt-results-table tr.nt-winner-row td{background:rgba(231,194,86,.14);}
/* ---- narrow phones: shrink the table pieces so deck + card + turn list
   always share one row without horizontal overflow ---- */
@media (max-width:430px){
  .no-thanks-root .nt-card-big{width:92px;height:130px;font-size:2.4rem;}
  .no-thanks-root .nt-deck{width:58px;height:82px;font-size:.95rem;}
  .no-thanks-root .nt-table{gap:8px;}
  .no-thanks-root .nt-table-main{gap:10px;}
}
@media (max-width:350px){
  .no-thanks-root .nt-card-big{width:78px;height:110px;font-size:2rem;}
  .no-thanks-root .nt-deck{width:48px;height:68px;font-size:.85rem;}
  .no-thanks-root .nt-turn-row{font-size:.76rem;}
}
`;
