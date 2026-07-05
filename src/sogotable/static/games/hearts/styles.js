// Hearts — scoped styles, injected once by render.js (NOT added to the
// line-capped styles-games.css), mirroring the no-thanks/liars-dice precedent.
// Every rule is prefixed under `.hearts-root`. Card FACES come from the shared
// games/playing-cards.js (PLAYING_CARD_CSS, injected alongside this); layout,
// the felt, fans, raising, and animations live here.
//
// Theme: the chrome rides the shell's light/dark tokens (--bg/--panel/--ink/
// --muted/--line); the felt keeps its physical green in both themes and cards
// keep a paper face (docs/theme.md physical-pieces rule).
//
// One layout on every device (hard rule): breakpoints only scale — the shared
// pc-card sizes shrink on narrow phones; nothing rearranges or hides.
export const HEARTS_CSS = `
#macroBoard:has(.hearts-root){display:block;aspect-ratio:auto;background:none;border:none;}
.hearts-root{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;
 width:100%;box-sizing:border-box;padding:14px 10px 20px;border-radius:18px;background:var(--bg);
 --hx-panel:var(--panel);--hx-ink:var(--ink);--hx-muted:var(--muted);--hx-line:var(--line);
 --hx-gold:#e7c256;--hx-danger:#d64b3e;--hx-felt:#2e7d54;--hx-felt-edge:#24623f;
 color:var(--hx-ink);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;}
.hearts-root .hx-banner{width:100%;max-width:480px;box-sizing:border-box;margin:0;text-align:center;
 font-weight:700;font-size:1.1rem;background:var(--hx-panel);border:1px solid var(--hx-line);
 border-radius:12px;padding:9px 12px;}
/* Status strip: ALWAYS one fixed-height line (the no-jump rule). */
.hearts-root .hx-tip{width:100%;max-width:480px;box-sizing:border-box;margin:0;padding:8px 12px;
 border-radius:12px;background:var(--hx-panel);border:1px solid var(--hx-line);font-size:.88rem;
 height:36px;display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden;}
.hearts-root .hx-tip.hx-your-turn{border-color:var(--hx-gold);animation:hx-pulse 1.2s ease-in-out 3;}
@keyframes hx-pulse{50%{background:rgba(231,194,86,.16);box-shadow:0 0 0 3px rgba(231,194,86,.18);}}
/* ---- seat boxes: the turn list lives around the felt (3 up top, you below) ---- */
.hearts-root .hx-opps{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;width:100%;max-width:480px;}
.hearts-root .hx-seatbox{background:var(--hx-panel);border:1px solid var(--hx-line);border-radius:12px;
 padding:6px 9px;min-width:0;display:flex;flex-direction:column;gap:2px;box-sizing:border-box;}
.hearts-root .hx-seatbox.hx-turn{border-color:var(--hx-gold);box-shadow:0 0 0 2px rgba(231,194,86,.25);}
.hearts-root .hx-seatbox .hx-nm{font-weight:700;font-size:.84rem;white-space:nowrap;overflow:hidden;
 text-overflow:ellipsis;}
.hearts-root .hx-seatbox .hx-nm .hx-mark{display:inline-block;width:1.15em;}
/* ---- the felt ---- */
.hearts-root .hx-felt{position:relative;width:100%;max-width:480px;box-sizing:border-box;
 height:clamp(210px,34dvh,290px);border-radius:16px;
 background:radial-gradient(ellipse at 50% 38%,var(--hx-felt),var(--hx-felt-edge));
 box-shadow:inset 0 0 40px rgba(0,0,0,.25),0 2px 10px rgba(0,0,0,.18);}
.hearts-root .hx-slot{position:absolute;width:52px;height:72px;}
.hearts-root .hx-slot-b{left:50%;bottom:7%;transform:translateX(-50%);}
.hearts-root .hx-slot-l{left:11%;top:50%;transform:translateY(-50%);}
.hearts-root .hx-slot-t{left:50%;top:7%;transform:translateX(-50%);}
.hearts-root .hx-slot-r{right:11%;top:50%;transform:translateY(-50%);}
.hearts-root .hx-felt-status{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
 width:56%;text-align:center;color:rgba(255,255,255,.92);font-size:.86rem;
 text-shadow:0 1px 3px rgba(0,0,0,.5);pointer-events:none;}
.hearts-root .hx-felt-corner{position:absolute;color:rgba(255,255,255,.85);font-size:.74rem;
 text-shadow:0 1px 2px rgba(0,0,0,.5);}
.hearts-root .hx-corner-bl{left:10px;bottom:7px;}
.hearts-root .hx-corner-br{right:10px;bottom:7px;}
/* Card entering a trick slot: slides in from its seat's direction. */
@keyframes hx-from-b{from{transform:translateY(140px) scale(.85);opacity:.3;}}
@keyframes hx-from-l{from{transform:translateX(-140px) scale(.85);opacity:.3;}}
@keyframes hx-from-t{from{transform:translateY(-140px) scale(.85);opacity:.3;}}
@keyframes hx-from-r{from{transform:translateX(140px) scale(.85);opacity:.3;}}
.hearts-root .hx-play-b{animation:hx-from-b .5s cubic-bezier(.25,.8,.35,1);}
.hearts-root .hx-play-l{animation:hx-from-l .5s cubic-bezier(.25,.8,.35,1);}
.hearts-root .hx-play-t{animation:hx-from-t .5s cubic-bezier(.25,.8,.35,1);}
.hearts-root .hx-play-r{animation:hx-from-r .5s cubic-bezier(.25,.8,.35,1);}
/* Trick collect: the four cards glide to the winner's edge and fade. */
.hearts-root .hx-slot .pc-card{transition:transform 1.1s cubic-bezier(.45,.05,.35,1),opacity 1.1s ease;}
.hearts-root .hx-collect-b .pc-card{transform:translateY(150px) scale(.5);opacity:0;}
.hearts-root .hx-collect-l .pc-card{transform:translateX(-190px) scale(.5);opacity:0;}
.hearts-root .hx-collect-t .pc-card{transform:translateY(-150px) scale(.5);opacity:0;}
.hearts-root .hx-collect-r .pc-card{transform:translateX(190px) scale(.5);opacity:0;}
/* ---- results on the felt (round end / game over) ---- */
.hearts-root .hx-results{position:absolute;inset:10px;display:flex;align-items:center;justify-content:center;}
.hearts-root .hx-results table{width:min(100%,340px);border-collapse:collapse;background:var(--hx-panel);
 border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.3);}
.hearts-root .hx-results th{font-size:.64rem;text-transform:uppercase;letter-spacing:.4px;
 color:var(--hx-muted);padding:6px 6px 3px;text-align:center;}
.hearts-root .hx-results td{padding:5px 8px;font-size:.88rem;border-top:1px solid var(--hx-line);
 text-align:center;font-variant-numeric:tabular-nums;}
.hearts-root .hx-results td.hx-name,.hearts-root .hx-results th.hx-name{text-align:left;max-width:120px;
 overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;}
.hearts-root .hx-results td.hx-status{width:26px;padding-left:0;padding-right:0;}
.hearts-root .hx-results td.hx-total{font-weight:800;}
.hearts-root .hx-results tr.hx-winner-row td{background:rgba(231,194,86,.14);}
.hearts-root .hx-moon-note{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);
 color:#fff;font-weight:700;font-size:.9rem;text-shadow:0 1px 3px rgba(0,0,0,.6);white-space:nowrap;}
/* ---- action row: one slot, disable — never hide (no-jump rule) ---- */
.hearts-root .hx-actionrow{display:flex;align-items:center;gap:10px;width:100%;max-width:480px;}
.hearts-root .hx-actionrow .hx-seatbox{flex:1;flex-direction:row;align-items:center;
 justify-content:space-between;gap:8px;}
.hearts-root .hx-action{flex:none;min-width:128px;padding:12px 14px;border:none;border-radius:12px;
 background:linear-gradient(180deg,#2c8659,#1b5e3e);color:#fff;font-weight:800;font-size:.95rem;
 box-shadow:0 3px 8px rgba(0,0,0,.35);cursor:pointer;touch-action:manipulation;
 -webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;}
.hearts-root .hx-action:active{transform:translateY(2px);box-shadow:0 1px 3px rgba(0,0,0,.35);}
.hearts-root .hx-action:disabled{opacity:.42;box-shadow:none;transform:none;cursor:default;
 background:var(--hx-panel);color:var(--hx-muted);border:1px solid var(--hx-line);}
/* ---- my hand: overlapping fan, tap to raise, tap again to commit ---- */
.hearts-root .hx-hand{display:flex;justify-content:center;align-items:flex-end;width:100%;
 max-width:480px;padding-top:16px;min-height:82px;}
/* touch-action:none so an up-flick reaches pointerup as a commit gesture
   instead of scrolling the page. */
.hearts-root .hx-hand .pc-card{pointer-events:auto;cursor:pointer;transition:transform .16s ease;
 touch-action:none;}
.hearts-root .hx-hand .pc-card + .pc-card{margin-left:calc(var(--hx-ovl,24px) * -1);}
.hearts-root .hx-hand .pc-card.hx-raised{transform:translateY(-15px);}
.hearts-root .hx-hand .pc-card.hx-dim{filter:grayscale(.4) brightness(.8);cursor:default;}
.hearts-root .hx-hand .pc-card.hx-new{outline:2px solid var(--hx-gold);outline-offset:-2px;}
/* Deal-in: the hand fans out card by card. */
@keyframes hx-deal-in{from{transform:translateY(-70px) scale(.6);opacity:0;}}
.hearts-root .hx-hand.hx-dealing .pc-card{animation:hx-deal-in .45s cubic-bezier(.25,.8,.35,1) both;
 animation-delay:calc(var(--hx-i,0) * 90ms);}
/* ---- the standing score table: always below the cards region ---- */
.hearts-root .hx-standings{width:100%;max-width:480px;box-sizing:border-box;background:var(--hx-panel);
 border:1px solid var(--hx-line);border-radius:12px;padding:4px 8px 6px;}
.hearts-root .hx-standings table{width:100%;border-collapse:collapse;}
.hearts-root .hx-standings th{font-size:.64rem;text-transform:uppercase;letter-spacing:.4px;
 color:var(--hx-muted);padding:5px 5px 3px;text-align:center;}
.hearts-root .hx-standings td{padding:5px 6px;font-size:.86rem;border-top:1px solid var(--hx-line);
 text-align:center;font-variant-numeric:tabular-nums;}
.hearts-root .hx-standings td.hx-name,.hearts-root .hx-standings th.hx-name{text-align:left;
 max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;}
.hearts-root .hx-standings td.hx-status{width:26px;padding-left:0;padding-right:0;}
.hearts-root .hx-standings td.hx-total{font-weight:800;}
.hearts-root .hx-standings tr.hx-winner-row td{background:rgba(231,194,86,.14);}
.hearts-root .hx-msg{margin:0;font-size:.88rem;color:var(--hx-muted);text-align:center;min-height:1.2em;}
.hearts-root .hx-msg.hx-error{color:var(--hx-danger);}
/* ---- host lobby options (rendered via renderHostStartLobby extraHtml) ---- */
.hearts-root .hx-options,.ten-thousand-lobby .hx-options{display:flex;flex-direction:column;gap:8px;
 margin:10px 0 4px;text-align:left;}
.ten-thousand-lobby .hx-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.ten-thousand-lobby .hx-opt .hx-opt-label b{display:block;font-size:.9rem;}
.ten-thousand-lobby .hx-opt .hx-opt-label span{font-size:.74rem;color:var(--hx-muted,var(--muted));}
.ten-thousand-lobby .hx-seg{display:flex;background:var(--hx-line,var(--line));border-radius:999px;
 padding:3px;flex:none;}
.ten-thousand-lobby .hx-seg button{border:none;background:transparent;color:inherit;padding:5px 11px;
 border-radius:999px;font-size:.82rem;cursor:pointer;white-space:nowrap;}
.ten-thousand-lobby .hx-seg button.hx-on{background:var(--ink);color:var(--bg);font-weight:700;}
/* ---- narrow phones: scale only — same layout everywhere ---- */
@media (max-width:390px){
  .hearts-root .hx-felt{height:clamp(190px,32dvh,260px);}
  .hearts-root .hx-seatbox .hx-nm{font-size:.78rem;}
  .hearts-root .hx-seatbox .hx-st{font-size:.68rem;gap:6px;}
}
`;
