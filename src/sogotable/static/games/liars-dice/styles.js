// Liar's Dice — scoped styles, injected once by render.js (NOT added to the
// line-capped styles-games.css), mirroring the zombie-dice/rtta/mazewright
// styles.js precedent. Every rule is prefixed under `.liars-dice-root`.
//
// Theme: the board COMMITS to a card-table look — deep green felt with
// translucent dark panels — in BOTH light and dark modes (the "game-specific
// board palette" precedent; MojoSOGO rejected a tavern art background
// 2026-07-03). The dice stay white with dark pips in every theme
// (docs/theme.md: physical pieces keep their natural color). Only the
// pre-game lobby panel follows the global theme (shared host-start template).
export const LD_CSS = `
#macroBoard:has(.liars-dice-root){display:block;aspect-ratio:auto;background:none;border:none;}
.liars-dice-root{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:12px;
 width:100%;box-sizing:border-box;padding:16px 10px 22px;border-radius:18px;
 background:radial-gradient(ellipse at 50% 30%,#1d6b45 0%,#14513a 55%,#0d3a2b 100%);
 --ld-panel:rgba(6,24,17,.72);--ld-ink:#eef5ef;--ld-muted:#a7c4b2;--ld-line:rgba(233,255,240,.16);
 --ld-gold:#e7c256;--ld-danger:#e2574b;
 color:var(--ld-ink);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;}
.liars-dice-root .ld-panel{width:100%;max-width:440px;background:var(--ld-panel);border:1px solid var(--ld-line);
 border-radius:14px;padding:10px 12px;box-sizing:border-box;}
.liars-dice-root .ld-banner{margin:0;text-align:center;font-weight:700;}
.liars-dice-root .ld-banner.ld-win{font-size:1.12rem;}
/* The bid spotlight: what is currently claimed to be under all the cups. */
.liars-dice-root .ld-bid{display:flex;align-items:center;justify-content:center;gap:10px;min-height:44px;}
.liars-dice-root .ld-bid .ld-bid-label{font-size:.78rem;text-transform:uppercase;letter-spacing:.6px;color:var(--ld-muted);}
.liars-dice-root .ld-bid strong{font-size:1.5rem;line-height:1;}
.liars-dice-root .ld-bid .ld-die{width:40px;height:40px;font-size:2.1rem;}
.liars-dice-root .ld-turn-note{margin:4px 0 0;text-align:center;font-size:.85rem;color:var(--ld-muted);}
/* Dice: white with dark pips in every theme (physical pieces). The glyphs are
   the Unicode die faces, oversized inside a fixed white tile. Display-only —
   they never catch the pointer. */
.liars-dice-root .ld-die{width:52px;height:52px;border-radius:12px;background:#fbfaf6;color:#1c2320;
 display:inline-flex;align-items:center;justify-content:center;pointer-events:none;
 font-size:2.9rem;line-height:1;border:1px solid rgba(0,0,0,.35);
 box-shadow:inset 0 -3px 0 rgba(0,0,0,.12),0 2px 5px rgba(0,0,0,.4);}
.liars-dice-root .ld-die.ld-wild{background:#fdf3d3;}
.liars-dice-root .ld-die.ld-hit{outline:3px solid var(--ld-gold);outline-offset:-2px;}
.liars-dice-root .ld-die.ld-hidden{background:#274a3a;color:#8fb59f;font-size:1.25rem;border-style:dashed;
 border-color:var(--ld-line);box-shadow:none;}
.liars-dice-root .ld-die.ld-small{width:30px;height:30px;font-size:1.65rem;border-radius:8px;}
.liars-dice-root .ld-dice-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;}
/* Your cup */
.liars-dice-root .ld-cup-label{font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;color:var(--ld-muted);
 display:block;text-align:center;margin-bottom:8px;}
/* Bid picker: a quantity stepper and a face row, bounded by the server's
   raise_options — the UI never re-derives raise legality. */
.liars-dice-root .ld-picker{display:flex;flex-direction:column;gap:10px;}
.liars-dice-root .ld-stepper{display:flex;align-items:center;justify-content:center;gap:14px;}
.liars-dice-root .ld-stepper button{width:52px;height:44px;font-size:1.4rem;border-radius:12px;font-weight:800;}
.liars-dice-root .ld-stepper .ld-qty{font-size:1.7rem;font-weight:800;min-width:56px;text-align:center;}
.liars-dice-root .ld-faces{display:flex;justify-content:center;gap:8px;}
.liars-dice-root .ld-faces button{width:48px;height:48px;border-radius:12px;font-size:2.4rem;line-height:1;
 padding:0;background:#fbfaf6;color:#1c2320;border:2px solid rgba(0,0,0,.3);}
.liars-dice-root .ld-faces button[aria-pressed="true"]{outline:3px solid var(--ld-gold);outline-offset:-2px;}
.liars-dice-root .ld-faces button:disabled{opacity:.28;}
.liars-dice-root .ld-actions{display:flex;gap:10px;position:relative;z-index:2;}
.liars-dice-root .ld-actions button{flex:1;padding:12px 8px;font-size:1.02rem;border-radius:12px;}
.liars-dice-root .ld-actions .ld-liar{background:linear-gradient(180deg,#ea6a5b,#c43e33);color:#fff;
 border:none;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,.4);}
.liars-dice-root .ld-actions .ld-liar:disabled{opacity:.4;box-shadow:none;}
.liars-dice-root button{cursor:pointer;user-select:none;-webkit-user-select:none;}
.liars-dice-root button:disabled{cursor:default;}
.liars-dice-root button *{pointer-events:none;}
.liars-dice-root .ld-msg{margin:0;font-size:.9rem;color:var(--ld-muted);text-align:center;}
.liars-dice-root .ld-msg.ld-error{color:#ff8d80;}
/* Table roster: every seat, their face-down dice, and whose turn it is. */
.liars-dice-root .ld-seats{display:flex;flex-direction:column;gap:6px;}
.liars-dice-root .ld-seat{display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid var(--ld-line);}
.liars-dice-root .ld-seat:last-child{border-bottom:none;}
.liars-dice-root .ld-seat .ld-seat-name{flex:1;display:flex;align-items:center;gap:7px;min-width:0;}
.liars-dice-root .ld-seat .ld-seat-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.liars-dice-root .ld-seat .ld-seat-dice{display:flex;gap:4px;}
.liars-dice-root .ld-seat.ld-turn{background:rgba(231,194,86,.12);border-radius:10px;}
.liars-dice-root .ld-seat.ld-out{opacity:.45;}
.liars-dice-root .ld-seat .ld-turn-tag{font-size:.7rem;text-transform:uppercase;letter-spacing:.5px;color:var(--ld-gold);font-weight:700;}
/* The reveal: everyone's dice face-up, bid matches ringed in gold. */
.liars-dice-root .ld-reveal{display:flex;flex-direction:column;gap:10px;animation:ld-fade .4s ease;}
@keyframes ld-fade{0%{opacity:0;transform:translateY(6px);}100%{opacity:1;transform:none;}}
.liars-dice-root .ld-reveal-outcome{margin:0;text-align:center;font-weight:700;font-size:1.02rem;}
.liars-dice-root .ld-reveal-outcome.ld-lost{color:#ffb0a6;}
.liars-dice-root .ld-reveal-row{display:flex;align-items:center;gap:8px;}
.liars-dice-root .ld-reveal-row .ld-reveal-name{flex:0 0 96px;display:flex;align-items:center;gap:6px;min-width:0;
 font-size:.88rem;}
.liars-dice-root .ld-reveal-row .ld-reveal-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.liars-dice-root .ld-reveal-row .ld-dice-row{justify-content:flex-start;gap:4px;}
.liars-dice-root .ld-history{margin:0;font-size:.8rem;color:var(--ld-muted);text-align:center;
 white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
`;
