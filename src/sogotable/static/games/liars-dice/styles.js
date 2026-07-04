// Liar's Dice — scoped styles, injected once by render.js (NOT added to the
// line-capped styles-games.css), mirroring the zombie-dice/rtta/mazewright
// styles.js precedent. Every rule is prefixed under `.liars-dice-root`.
//
// Theme: the board rides the shell's light/dark tokens (--bg/--panel/--ink/
// --muted/--line) like the platform chrome — MojoSOGO chose standard theming
// over a game-specific palette in the 2026-07-03 preview review (a tavern art
// background and a felt palette were both tried and rejected). Dice stay
// white with dark drawn pips in every theme (docs/theme.md: physical pieces
// keep their natural color); reveal matches turn green.
export const LD_CSS = `
#macroBoard:has(.liars-dice-root){display:block;aspect-ratio:auto;background:none;border:none;}
.liars-dice-root{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:12px;
 width:100%;box-sizing:border-box;padding:16px 10px 22px;border-radius:18px;
 background:var(--bg);
 --ld-panel:var(--panel);--ld-ink:var(--ink);--ld-muted:var(--muted);--ld-line:var(--line);
 --ld-gold:#e7c256;--ld-danger:#d64b3e;
 color:var(--ld-ink);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;}
.liars-dice-root .ld-panel{width:100%;max-width:440px;background:var(--ld-panel);border:1px solid var(--ld-line);
 border-radius:14px;padding:10px 12px;box-sizing:border-box;}
.liars-dice-root .ld-banner{margin:0;text-align:center;font-weight:700;}
.liars-dice-root .ld-banner.ld-win{font-size:1.12rem;}
/* Tip strip: the one home for long guidance/verdict sentences. */
.liars-dice-root .ld-tip{width:100%;max-width:440px;box-sizing:border-box;margin:0;
 padding:9px 12px;border-radius:12px;background:var(--ld-panel);border:1px solid var(--ld-line);
 font-size:.9rem;text-align:center;color:var(--ld-ink);min-height:38px;}
.liars-dice-root .ld-tip.ld-lost{color:var(--ld-danger);font-weight:600;}
/* Dice: white with dark drawn pips in every theme (physical pieces). The pip
   layout is a 3x3 grid; display-only — dice never catch the pointer. */
.liars-dice-root .ld-die{width:52px;height:52px;border-radius:12px;background:#fbfaf6;color:#1c2320;
 display:inline-flex;align-items:center;justify-content:center;pointer-events:none;
 border:1px solid rgba(0,0,0,.3);
 box-shadow:inset 0 -3px 0 rgba(0,0,0,.1),0 2px 5px rgba(0,0,0,.25);}
.liars-dice-root .ld-pips{display:grid;width:72%;height:72%;
 grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);}
.liars-dice-root .ld-pips i{width:78%;aspect-ratio:1/1;border-radius:50%;background:#20261f;place-self:center;}
/* At reveal, dice matching the called face (wilds included) turn green. */
.liars-dice-root .ld-die.ld-hit{background:#63bd74;border-color:#2c7a3f;}
.liars-dice-root .ld-die.ld-small{width:30px;height:30px;border-radius:8px;}
.liars-dice-root .ld-die.ld-mini{width:19px;height:19px;border-radius:5px;box-shadow:none;}
/* Dead-man switch: your cup renders face-down (ld-secret) until the big peek
   button is HELD; releasing re-hides instantly. The values never paint while
   cloaked, so a glance at the phone shows nothing. */
.liars-dice-root .ld-die.ld-secret{position:relative;background:var(--ld-panel);
 border-style:dashed;border-color:var(--ld-line);box-shadow:none;}
.liars-dice-root .ld-die.ld-secret .ld-pips{visibility:hidden;}
.liars-dice-root .ld-die.ld-secret::after{content:"?";position:absolute;inset:0;display:flex;
 align-items:center;justify-content:center;color:var(--ld-muted);font-size:1.25rem;}
.liars-dice-root.ld-peek .ld-die.ld-secret{background:#fbfaf6;border-style:solid;
 border-color:rgba(0,0,0,.35);box-shadow:inset 0 -3px 0 rgba(0,0,0,.12),0 2px 5px rgba(0,0,0,.25);}
.liars-dice-root.ld-peek .ld-die.ld-secret .ld-pips{visibility:visible;}
.liars-dice-root.ld-peek .ld-die.ld-secret::after{content:none;}
.liars-dice-root .ld-peek-btn{width:100%;max-width:440px;padding:22px 8px;font-size:1.15rem;font-weight:800;
 letter-spacing:.4px;border-radius:16px;border:none;color:#fff;
 background:linear-gradient(180deg,#2c8659,#1b5e3e);box-shadow:0 3px 8px rgba(0,0,0,.45);
 touch-action:none;-webkit-tap-highlight-color:transparent;}
.liars-dice-root.ld-peek .ld-peek-btn{background:linear-gradient(180deg,#e7c256,#c99b2a);color:#2b1d04;}
.liars-dice-root .ld-dice-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;}
/* Your cup: always exactly one row — fluid die size fills the panel width on
   narrow phones instead of wrapping; 68px is the ceiling on wide screens. */
.liars-dice-root .ld-cup-row{flex-wrap:nowrap;gap:8px;}
.liars-dice-root .ld-cup-row .ld-die{width:calc((100% - 32px)/5);max-width:68px;height:auto;aspect-ratio:1/1;}
.liars-dice-root .ld-cup-label{font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;color:var(--ld-muted);
 display:block;text-align:center;margin-bottom:8px;}
/* Tap-to-count bidding: tapping a face selects it at its minimum legal
   quantity, further taps on the same face bump the count (rapid taps must
   never zoom or lag — touch-action), switching faces resets. The selected
   face wears its running count as a badge. */
.liars-dice-root .ld-picker{display:flex;flex-direction:column;gap:10px;}
.liars-dice-root .ld-faces{display:flex;justify-content:center;gap:8px;}
.liars-dice-root .ld-faces button{width:52px;height:52px;border-radius:12px;line-height:1;
 padding:0;background:#fbfaf6;color:#1c2320;border:2px solid rgba(0,0,0,.3);
 display:inline-flex;align-items:center;justify-content:center;position:relative;
 touch-action:manipulation;-webkit-tap-highlight-color:transparent;}
.liars-dice-root .ld-faces button .ld-pips{width:66%;height:66%;}
.liars-dice-root .ld-faces button[aria-pressed="true"]{outline:3px solid var(--ld-gold);outline-offset:-2px;}
.liars-dice-root .ld-faces button:disabled{opacity:.28;}
.liars-dice-root .ld-faces .ld-face-count{position:absolute;top:-9px;right:-9px;min-width:22px;height:22px;
 padding:0 4px;border-radius:11px;background:var(--ld-gold);color:#2b1d04;font-size:.85rem;font-weight:800;
 display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.4);box-sizing:border-box;}
.liars-dice-root .ld-actions{display:flex;gap:10px;position:relative;z-index:2;}
.liars-dice-root .ld-actions button{flex:1;padding:12px 8px;font-size:1.02rem;border-radius:12px;}
.liars-dice-root .ld-actions .ld-liar{background:linear-gradient(180deg,#ea6a5b,#c43e33);color:#fff;
 border:none;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,.4);}
.liars-dice-root .ld-actions .ld-liar:disabled{opacity:.4;box-shadow:none;}
.liars-dice-root button{cursor:pointer;user-select:none;-webkit-user-select:none;}
.liars-dice-root button:disabled{cursor:default;}
.liars-dice-root button *{pointer-events:none;}
.liars-dice-root .ld-msg{margin:0;font-size:.9rem;color:var(--ld-muted);text-align:center;}
.liars-dice-root .ld-msg.ld-error{color:var(--ld-danger);}
/* This round's history (player | bid as actual dice) + the fixed narrow
   standings (player | die count) side by side; the log flexes and follows. */
.liars-dice-root .ld-top{display:flex;gap:8px;width:100%;max-width:440px;align-items:stretch;}
.liars-dice-root .ld-top .ld-log-panel{flex:1;min-width:0;}
.liars-dice-root .ld-log{max-height:190px;overflow-y:auto;}
.liars-dice-root .ld-log-table{width:100%;border-collapse:collapse;}
.liars-dice-root .ld-log-table td{padding:3px 4px;font-size:.82rem;color:var(--ld-muted);
 vertical-align:middle;line-height:1.3;border-bottom:1px solid var(--ld-line);}
.liars-dice-root .ld-log-table tr:last-child td{border-bottom:none;}
.liars-dice-root .ld-log-table td.ld-log-name{white-space:nowrap;color:var(--ld-ink);font-weight:600;width:1%;}
.liars-dice-root .ld-log-table .ld-dice-cell{display:flex;flex-wrap:wrap;gap:2px;align-items:center;}
.liars-dice-root .ld-log-table .ld-liar-tag{color:var(--ld-danger);font-weight:800;letter-spacing:.4px;}
.liars-dice-root .ld-log-table tr.ld-log-win td{color:var(--ld-ink);font-weight:700;text-align:center;padding-top:7px;}
.liars-dice-root .ld-log-table tr.ld-log-now td{color:var(--ld-gold);font-weight:700;padding-top:5px;}
.liars-dice-root .ld-side{flex:0 0 108px;padding:8px 6px;}
.liars-dice-root .ld-side-table{border-collapse:collapse;width:100%;table-layout:fixed;}
.liars-dice-root .ld-side-table th{font-size:.62rem;text-transform:uppercase;letter-spacing:.4px;
 color:var(--ld-muted);padding:2px 3px;text-align:left;border-bottom:1px solid var(--ld-line);}
.liars-dice-root .ld-side-table th:last-child{width:24px;text-align:center;}
.liars-dice-root .ld-side-table td{padding:4px 3px;font-size:.78rem;color:var(--ld-ink);
 border-bottom:1px solid var(--ld-line);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.liars-dice-root .ld-side-table tr:last-child td{border-bottom:none;}
.liars-dice-root .ld-side-table td.ld-count{text-align:center;font-weight:800;}
.liars-dice-root .ld-side-table tr.ld-turn-row td{background:rgba(231,194,86,.16);}
.liars-dice-root .ld-side-table tr.ld-out-row td{opacity:.45;}
/* The reveal: everyone's dice face-up, bid matches green. */
.liars-dice-root .ld-reveal{display:flex;flex-direction:column;gap:10px;animation:ld-fade .4s ease;}
@keyframes ld-fade{0%{opacity:0;transform:translateY(6px);}100%{opacity:1;transform:none;}}
.liars-dice-root .ld-reveal-outcome{margin:0;text-align:center;font-weight:700;font-size:1.02rem;}
.liars-dice-root .ld-reveal-outcome.ld-lost{color:var(--ld-danger);}
.liars-dice-root .ld-reveal-row{display:flex;align-items:center;gap:8px;}
.liars-dice-root .ld-reveal-row .ld-reveal-name{flex:0 0 96px;display:flex;align-items:center;gap:6px;min-width:0;
 font-size:.88rem;}
.liars-dice-root .ld-reveal-row .ld-reveal-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.liars-dice-root .ld-reveal-row .ld-dice-row{justify-content:flex-start;gap:4px;}
`;
