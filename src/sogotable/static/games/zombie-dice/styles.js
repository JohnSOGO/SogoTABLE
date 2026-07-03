// Roll of the Dead (module id zombie-dice) — scoped styles, injected once by
// render.js (NOT added to the line-capped styles-games.css), mirroring the
// mazewright/rtta styles.js precedent. Every rule is prefixed under
// `.zombie-dice-root`.
//
// Theme: the board COMMITS to its graveyard art (board-bg.jpg, provided by
// MojoSOGO 2026-07-03; the title is baked into the art's top band) in BOTH
// light and dark modes — the mazewright "game-specific board palette"
// precedent. Panels are translucent dark over the art's open middle; the DICE
// keep their fixed physical colors (docs/theme.md: physical pieces stay their
// natural color). Only the pre-game lobby panel follows the global theme (its
// markup/styling is the shell's shared host-start template).
export const ZD_CSS = `
#macroBoard:has(.zombie-dice-root){display:block;aspect-ratio:auto;background:none;border:none;}
.zombie-dice-root{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:12px;
 width:100%;box-sizing:border-box;padding:39% 10px 24%;border-radius:18px;
 aspect-ratio:846/1854;
 background:#141b22 url("games/zombie-dice/board-bg.jpg") center top/cover no-repeat;
 --zd-panel:rgba(11,19,17,.74);--zd-ink:#eef3ee;--zd-muted:#a9bcae;--zd-line:rgba(233,255,238,.16);
 color:var(--zd-ink);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;}
.zombie-dice-root .zd-banner{width:100%;max-width:440px;margin:0;text-align:center;font-weight:700;box-sizing:border-box;
 padding:10px 12px;border-radius:12px;background:var(--zd-panel);border:1px solid var(--zd-line);}
.zombie-dice-root .zd-banner.zd-win{font-size:1.1rem;}
.zombie-dice-root .zd-tray{width:100%;max-width:440px;background:var(--zd-panel);border:1px solid var(--zd-line);
 border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;box-sizing:border-box;}
.zombie-dice-root .zd-scoreboard{display:flex;justify-content:space-between;gap:8px;}
.zombie-dice-root .zd-scoreboard div{display:flex;flex-direction:column;align-items:center;flex:1;}
.zombie-dice-root .zd-scoreboard .label{font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;color:var(--zd-muted);}
.zombie-dice-root .zd-scoreboard strong{font-size:1.15rem;}
.zombie-dice-root .zd-dice{display:flex;justify-content:center;gap:12px;}
.zombie-dice-root .zd-die{width:64px;height:64px;border-radius:14px;display:flex;align-items:center;justify-content:center;
 font-size:2rem;border:2px solid rgba(0,0,0,.35);box-shadow:inset 0 -4px 0 rgba(0,0,0,.18),0 2px 5px rgba(0,0,0,.45);}
.zombie-dice-root .zd-die.zd-green{background:#43a558;}
.zombie-dice-root .zd-die.zd-yellow{background:#e2c04c;}
.zombie-dice-root .zd-die.zd-red{background:#cf4a45;}
.zombie-dice-root .zd-die.zd-blank{background:rgba(0,0,0,.25);border-style:dashed;border-color:var(--zd-line);
 color:var(--zd-muted);font-size:1.3rem;box-shadow:none;}
.zombie-dice-root .zd-die.zd-big{width:88px;height:88px;font-size:2.7rem;border-radius:16px;}
.zombie-dice-root .zd-die.rolling{animation:zd-tumble .45s ease;}
@keyframes zd-tumble{0%{transform:rotate(-14deg) scale(.55);opacity:.2;}60%{transform:rotate(9deg) scale(1.08);}100%{transform:none;opacity:1;}}
/* Brains and shotguns never re-roll: after the tumble they fly down out of the
   rolling row (zd-depart) and land in the sorted set-aside collection below the
   standings (zd-arrive). Feet stay put — they re-roll. */
.zombie-dice-root .zd-die.zd-depart{animation:zd-tumble .45s ease,zd-depart .5s ease 1.05s forwards;}
@keyframes zd-depart{0%{transform:none;opacity:1;}100%{transform:translateY(110px) scale(.7);opacity:0;}}
.zombie-dice-root .zd-die.zd-arrive{animation:zd-arrive .5s ease 1.45s backwards;}
@keyframes zd-arrive{0%{transform:translateY(-110px) scale(1.3);opacity:0;}100%{transform:none;opacity:1;}}
.zombie-dice-root .zd-die.zd-lost{opacity:.35;filter:grayscale(.6);}
.zombie-dice-root .zd-die span{filter:drop-shadow(0 1px 1px rgba(0,0,0,.35));}
.zombie-dice-root .zd-kept{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;font-size:.85rem;color:var(--zd-muted);margin:0;}
.zombie-dice-root .zd-kept b{color:var(--zd-ink);}
.zombie-dice-root .zd-actions{display:flex;gap:10px;}
.zombie-dice-root .zd-actions button{flex:1;padding:12px 8px;font-size:1.02rem;border-radius:12px;}
/* The whole button face is one click target: hand cursor everywhere on it
   (including over its label text), no text selection, and children never
   intercept the pointer. */
.zombie-dice-root button{cursor:pointer;user-select:none;-webkit-user-select:none;}
.zombie-dice-root button:disabled{cursor:default;}
.zombie-dice-root button *{pointer-events:none;}
.zombie-dice-root .zd-actions .zd-bank{background:linear-gradient(180deg,#f2c85b,#d69a28);color:#2b1d04;
 border:none;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,.4);}
.zombie-dice-root .zd-actions .zd-bank:disabled{opacity:.4;box-shadow:none;}
.zombie-dice-root .zd-msg{margin:0;font-size:.9rem;color:var(--zd-muted);text-align:center;}
.zombie-dice-root .zd-msg.zd-bust{color:#ff7a70;font-weight:700;font-size:1rem;}
.zombie-dice-root .zd-msg.zd-error{color:#ff7a70;}
.zombie-dice-root > .zd-msg{background:var(--zd-panel);border:1px solid var(--zd-line);border-radius:12px;
 padding:10px 12px;max-width:440px;}
.zombie-dice-root .zd-standings{width:100%;max-width:440px;background:var(--zd-panel);border:1px solid var(--zd-line);
 border-radius:14px;padding:8px 10px;box-sizing:border-box;}
.zombie-dice-root .zd-standings table{width:100%;border-collapse:collapse;}
.zombie-dice-root .zd-standings th{font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;color:var(--zd-muted);
 text-align:left;padding:4px 6px;border-bottom:1px solid var(--zd-line);}
.zombie-dice-root .zd-standings td{padding:7px 6px;border-bottom:1px solid var(--zd-line);font-size:.95rem;}
.zombie-dice-root .zd-standings tr:last-child td{border-bottom:none;}
.zombie-dice-root .zd-standings td:nth-child(3),.zombie-dice-root .zd-standings td:nth-child(4),
.zombie-dice-root .zd-standings th:nth-child(3),.zombie-dice-root .zd-standings th:nth-child(4){text-align:right;}
.zombie-dice-root .zd-player{display:flex;align-items:center;gap:7px;background:none;border:none;padding:0;
 color:var(--zd-ink);font:inherit;}
.zombie-dice-root .zd-turn-gain{color:var(--zd-muted);font-size:.82rem;margin-left:4px;}
.zombie-dice-root .zd-row-busted td{opacity:.75;}
.zombie-dice-root .zd-row-sitting td{opacity:.55;}
.zombie-dice-root .zd-aside{width:100%;max-width:440px;background:var(--zd-panel);border:1px solid var(--zd-line);
 border-radius:14px;padding:10px 12px;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;}
.zombie-dice-root .zd-aside-group{display:flex;flex-direction:column;gap:6px;}
.zombie-dice-root .zd-aside-label{font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;color:var(--zd-muted);}
.zombie-dice-root .zd-aside-dice{display:flex;flex-wrap:wrap;gap:8px;}
`;
