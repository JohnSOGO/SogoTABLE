// Hidden Isles — scoped, injected-once stylesheet. Every rule is prefixed
// .hidden-isles-root (classes are hi-*, never a shell class name), the first
// two rules neutralise the tic-tac-toe #macroBoard grid and the shell
// #turnStatus, and the colour tokens (--hi-*) are generated from the
// assets.js palette: light on the root, dark under <html data-theme="dark">.
// Buttons reset the shell's global `button{min-height:44px;…}` props.
// Mobile-first: the 5×5 chart fits a 360px phone; wider screens scale it up.
import { ASSETS } from "./assets.js";

const kebab = (name) => name.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
const tokens = (palette) => Object.entries(palette).map(([k, val]) => `--hi-${kebab(k)}:${val};`).join("");

const BASE = `
#macroBoard:has(.hidden-isles-root){display:block;aspect-ratio:auto;height:auto;max-width:none;background:transparent;border:0;box-shadow:none;padding:0}
#turnStatus:has(~ #macroBoard .hidden-isles-root){display:none}
.hidden-isles-root{${tokens(ASSETS.palette.light)}
  --hi-radius:12px;--hi-shadow:0 2px 10px rgba(20,50,70,.12);
  color:var(--hi-ink);font-family:"Avenir Next","Segoe UI",system-ui,sans-serif;
  width:100%;max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:8px;text-align:left;
}
html[data-theme="dark"] .hidden-isles-root{${tokens(ASSETS.palette.dark)}--hi-shadow:0 2px 12px rgba(0,0,0,.45)}
.hidden-isles-root [hidden]{display:none !important}
.hidden-isles-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.hidden-isles-root button{min-height:0;width:auto;margin:0;font:inherit;font-weight:700;cursor:pointer;box-shadow:none;text-transform:none;letter-spacing:normal}
.hidden-isles-root button:disabled,.hidden-isles-root button[aria-disabled="true"]{cursor:not-allowed}
.hidden-isles-root button:disabled{opacity:.45}
.hidden-isles-root :focus-visible{outline:3px solid var(--hi-highlight);outline-offset:2px}
.hidden-isles-root .hi-panel{background:var(--hi-panel);border-radius:var(--hi-radius);box-shadow:var(--hi-shadow)}
.hidden-isles-root .hi-btn{height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--hi-line);background:var(--hi-chip);color:var(--hi-ink);font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hidden-isles-root .hi-btn-primary{background:var(--hi-btn);border-color:var(--hi-btn);color:var(--hi-btn-ink)}
.hidden-isles-root .hi-btn:not(:disabled):active{transform:scale(.97)}
.hidden-isles-root .hi-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* crew colour helpers */
.hidden-isles-root .hi-team-A{--hi-team:var(--hi-crew-a);--hi-team-soft:var(--hi-crew-a-soft);--hi-team-ink:var(--hi-crew-a-ink)}
.hidden-isles-root .hi-team-B{--hi-team:var(--hi-crew-b);--hi-team-soft:var(--hi-crew-b-soft);--hi-team-ink:var(--hi-crew-b-ink)}

/* status strip: two fixed one-liners */
.hidden-isles-root .hi-strip{padding:6px 10px}
.hidden-isles-root .hi-line{display:flex;align-items:center;gap:8px;height:26px;white-space:nowrap;overflow:hidden;font-size:13.5px}
.hidden-isles-root .hi-turn{flex:1;min-width:0;display:flex;align-items:center;gap:6px;font-weight:800;overflow:hidden}
.hidden-isles-root .hi-turn span{overflow:hidden;text-overflow:ellipsis}
.hidden-isles-root .hi-turn .hi-badge{flex:none}
.hidden-isles-root .hi-turn.hi-team-A,.hidden-isles-root .hi-turn.hi-team-B{color:var(--hi-team-ink)}
.hidden-isles-root .hi-score{flex:none;display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px 0 3px;border-radius:12px;background:var(--hi-team-soft);color:var(--hi-team-ink);font-weight:800;font-variant-numeric:tabular-nums;border:1.5px solid var(--hi-team)}
.hidden-isles-root .hi-score.hi-active{box-shadow:0 0 0 2px var(--hi-team)}
.hidden-isles-root .hi-me{flex:none;color:var(--hi-muted);font-weight:700;font-size:12.5px}
.hidden-isles-root .hi-ticker{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--hi-muted);font-size:12.5px;display:block;line-height:26px}
.hidden-isles-root .hi-ticker-error{color:var(--hi-danger);font-weight:700}

/* clue banner: fixed height */
.hidden-isles-root .hi-banner{display:flex;align-items:center;gap:8px;height:52px;padding:0 12px;border-left:6px solid var(--hi-team,var(--hi-line))}
.hidden-isles-root .hi-banner-main{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center}
.hidden-isles-root .hi-banner-who{font-size:11.5px;font-weight:700;color:var(--hi-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hidden-isles-root .hi-banner-clue{font-size:20px;font-weight:900;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--hi-team-ink,var(--hi-ink))}
.hidden-isles-root .hi-banner-wait{font-size:14.5px;font-weight:700;color:var(--hi-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hidden-isles-root .hi-banner-left{flex:none;padding:4px 10px;border-radius:14px;background:var(--hi-chip);font-size:12.5px;font-weight:800;white-space:nowrap}
.hidden-isles-root .hi-banner-fresh .hi-banner-clue{animation:hi-pop 600ms ease-out both}

/* the sea chart */
.hidden-isles-root .hi-sea{position:relative;padding:5px;border-radius:14px;background:linear-gradient(160deg,var(--hi-sea),var(--hi-sea-deep));overflow:hidden;box-shadow:var(--hi-shadow)}
.hidden-isles-root .hi-sea-bg{position:absolute;inset:0;pointer-events:none}
.hidden-isles-root .hi-sea-bg svg,.hidden-isles-root .hi-sea-bg img{width:100%;height:100%;display:block;object-fit:cover}
.hidden-isles-root .hi-grid{position:relative;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}
.hidden-isles-root .hi-card{position:relative;aspect-ratio:4/3;width:100%;padding:0;border-radius:9px;overflow:hidden;
  border:1.5px solid var(--hi-card-edge);background:var(--hi-card);color:var(--hi-card-ink);
  box-shadow:0 2px 0 var(--hi-card-edge),0 3px 6px var(--hi-card-shadow);container-type:inline-size;
  display:flex;align-items:center;justify-content:center;transition:transform .12s ease,box-shadow .12s ease}
.hidden-isles-root .hi-card:not([aria-disabled="true"]):hover{transform:translateY(-1px)}
.hidden-isles-root .hi-word{display:block;max-width:94%;padding:0 1px;font-weight:800;line-height:1.05;text-transform:uppercase;letter-spacing:-.01em;
  white-space:nowrap;overflow:hidden;text-overflow:clip;font-size:11px;font-size:clamp(7.5px,calc(112cqi / var(--len,6)),22px)}
.hidden-isles-root .hi-card.hi-can-pick{cursor:pointer}
.hidden-isles-root .hi-card.hi-selected{border-color:var(--hi-highlight);box-shadow:0 0 0 3px var(--hi-highlight),0 6px 12px var(--hi-card-shadow);transform:translateY(-2px);z-index:1}
.hidden-isles-root .hi-card.hi-idea{box-shadow:0 0 0 2px var(--hi-btn),0 3px 6px var(--hi-card-shadow)}
/* Navigator chart tints (unrevealed) */
.hidden-isles-root .hi-card.hi-chart-A{background:var(--hi-crew-a-soft);border:2.5px solid var(--hi-crew-a)}
.hidden-isles-root .hi-card.hi-chart-B{background:var(--hi-crew-b-soft);border:2.5px solid var(--hi-crew-b)}
.hidden-isles-root .hi-card.hi-chart-neutral{background:var(--hi-sand-soft);border:2px dashed var(--hi-sand)}
.hidden-isles-root .hi-card.hi-chart-trap{background:var(--hi-kraken);border:2.5px solid var(--hi-kraken-ink);color:var(--hi-kraken-text)}
.hidden-isles-root .hi-key-icon{position:absolute;left:3px;top:2px;font-size:11px;line-height:1;font-size:clamp(9px,17cqi,18px)}
.hidden-isles-root .hi-chart-trap .hi-key-icon{font-size:clamp(11px,22cqi,22px)}
/* revealed cards */
.hidden-isles-root .hi-card.hi-revealed{box-shadow:inset 0 0 0 1px rgba(0,0,0,.06);border-width:1.5px;border-style:solid;align-items:flex-end}
.hidden-isles-root .hi-revealed.hi-key-A{background:var(--hi-crew-a-soft);border-color:var(--hi-crew-a)}
.hidden-isles-root .hi-revealed.hi-key-B{background:var(--hi-crew-b-soft);border-color:var(--hi-crew-b)}
.hidden-isles-root .hi-revealed.hi-key-neutral{background:var(--hi-sand-soft);border-color:var(--hi-sand)}
.hidden-isles-root .hi-revealed.hi-key-trap{background:var(--hi-kraken-soft);border-color:var(--hi-kraken)}
.hidden-isles-root .hi-art{position:absolute;left:0;right:0;top:0;bottom:24%;display:flex;align-items:center;justify-content:center;pointer-events:none}
.hidden-isles-root .hi-art-svg,.hidden-isles-root .hi-art-img{width:100%;height:100%;display:block;object-fit:contain}
.hidden-isles-root .hi-revealed .hi-word{position:relative;margin-bottom:3%;padding:1px 4px;border-radius:5px;background:var(--hi-card);color:var(--hi-card-ink);
  font-size:9px;font-size:clamp(7px,calc(100cqi / var(--len,6)),16px);opacity:.92}
/* end of game: the unfound part of the chart */
.hidden-isles-root .hi-card.hi-unfound{opacity:.62}
.hidden-isles-root .hi-card.hi-unfound.hi-chart-trap{opacity:.9}
/* crew pointer dots */
.hidden-isles-root .hi-dots{position:absolute;right:3px;top:3px;display:flex;gap:2px;pointer-events:none}
.hidden-isles-root .hi-dot{width:9px;height:9px;border-radius:50%;border:1.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25)}
.hidden-isles-root .hi-who{position:absolute;right:3px;top:2px;font-size:10px;line-height:1;pointer-events:none}
/* animation */
.hidden-isles-root .hi-flip{animation:hi-flip 650ms cubic-bezier(.2,.8,.3,1.2) both}
.hidden-isles-root .hi-wiggle{animation:hi-flip 650ms cubic-bezier(.2,.8,.3,1.2) both,hi-wiggle 900ms 600ms ease-in-out 2}
@keyframes hi-flip{0%{transform:perspective(400px) rotateY(90deg) scale(.9)}60%{transform:perspective(400px) rotateY(-12deg) scale(1.06)}100%{transform:perspective(400px) rotateY(0) scale(1)}}
@keyframes hi-wiggle{0%,100%{transform:rotate(0)}20%{transform:rotate(-6deg) scale(1.06)}40%{transform:rotate(5deg)}60%{transform:rotate(-4deg)}80%{transform:rotate(3deg)}}
@keyframes hi-pop{0%{transform:scale(.7);opacity:0}60%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.hidden-isles-root .hi-flip,.hidden-isles-root .hi-wiggle,.hidden-isles-root .hi-banner-fresh .hi-banner-clue{animation:none !important}}

/* action area */
.hidden-isles-root .hi-actions{padding:8px;display:flex;flex-direction:column;gap:7px}
.hidden-isles-root .hi-hint{height:20px;font-size:13px;font-weight:700;color:var(--hi-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hidden-isles-root .hi-row{display:flex;gap:8px;align-items:center}
.hidden-isles-root .hi-row > .hi-btn{flex:1 1 0;min-width:0}
.hidden-isles-root .hi-clue-input{flex:1;min-width:0;height:44px;padding:0 12px;border-radius:12px;border:1.5px solid var(--hi-line);background:var(--hi-card);color:var(--hi-card-ink);
  font:inherit;font-size:17px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.hidden-isles-root .hi-clue-input::placeholder{text-transform:none;font-weight:600;letter-spacing:0;color:var(--hi-muted)}
.hidden-isles-root .hi-clue-input:disabled{opacity:.55}
.hidden-isles-root .hi-row > .hi-give{flex:0 0 auto}
.hidden-isles-root .hi-nums{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:4px}
.hidden-isles-root .hi-num{height:38px;padding:0;border-radius:10px;border:1.5px solid var(--hi-line);background:var(--hi-chip);color:var(--hi-ink);font-size:16px;font-variant-numeric:tabular-nums}
.hidden-isles-root .hi-num.hi-on{background:var(--hi-btn);border-color:var(--hi-btn);color:var(--hi-btn-ink)}
.hidden-isles-root .hi-ideas{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;height:34px;align-items:center;scrollbar-width:thin}
.hidden-isles-root .hi-ideas-label{flex:none;font-size:11.5px;font-weight:800;color:var(--hi-muted);text-transform:uppercase;letter-spacing:.05em}
.hidden-isles-root .hi-idea-chip{flex:none;height:30px;padding:0 10px;border-radius:15px;border:1px dashed var(--hi-btn);background:transparent;color:var(--hi-ink);font-size:13px;white-space:nowrap}
.hidden-isles-root .hi-idea-chip.hi-on{border-style:solid;background:var(--hi-chip)}
.hidden-isles-root .hi-nudge{align-self:center;height:32px;padding:0 12px;border-radius:16px;border:1px dashed var(--hi-muted);background:transparent;color:var(--hi-muted);font-size:12.5px}

/* log */
.hidden-isles-root .hi-log{padding:2px 10px}
.hidden-isles-root .hi-log summary{cursor:pointer;height:38px;display:flex;align-items:center;font-weight:800;font-size:13.5px;list-style:none}
.hidden-isles-root .hi-log summary::-webkit-details-marker{display:none}
.hidden-isles-root .hi-log summary::before{content:"▸";display:inline-block;width:16px;transition:transform .15s}
.hidden-isles-root .hi-log[open] summary::before{transform:rotate(90deg)}
.hidden-isles-root .hi-log ol{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-direction:column;gap:6px}
.hidden-isles-root .hi-log li{padding:6px 8px;border-radius:10px;background:var(--hi-chip);border-left:4px solid var(--hi-team)}
.hidden-isles-root .hi-log-head{display:flex;gap:6px;align-items:baseline;font-size:13px;min-width:0}
.hidden-isles-root .hi-log-head b{font-size:14.5px;letter-spacing:.03em}
.hidden-isles-root .hi-log-by{color:var(--hi-muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hidden-isles-root .hi-log-results{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.hidden-isles-root .hi-res{display:inline-flex;align-items:center;gap:3px;height:22px;padding:0 7px 0 2px;border-radius:11px;font-size:11.5px;font-weight:800;text-transform:uppercase;border:1px solid}
.hidden-isles-root .hi-res-A{background:var(--hi-crew-a-soft);border-color:var(--hi-crew-a);color:var(--hi-crew-a-ink)}
.hidden-isles-root .hi-res-B{background:var(--hi-crew-b-soft);border-color:var(--hi-crew-b);color:var(--hi-crew-b-ink)}
.hidden-isles-root .hi-res-neutral{background:var(--hi-sand-soft);border-color:var(--hi-sand);color:var(--hi-sand-ink)}
.hidden-isles-root .hi-res-trap{background:var(--hi-kraken-soft);border-color:var(--hi-kraken);color:var(--hi-kraken-ink)}
.hidden-isles-root .hi-log-none{font-size:12px;color:var(--hi-muted);font-style:italic}

/* results */
.hidden-isles-root .hi-results{padding:12px;text-align:center;border-top:6px solid var(--hi-team)}
.hidden-isles-root .hi-results .hi-badge{display:block;margin:0 auto 4px}
.hidden-isles-root .hi-results h3{margin:0;font-size:22px;color:var(--hi-team-ink)}
.hidden-isles-root .hi-results p{margin:4px 0 0;font-size:14px;color:var(--hi-muted);font-weight:700}
.hidden-isles-root .hi-results .hi-results-me{color:var(--hi-ink);font-size:15px}
.hidden-isles-root .hi-section-title{margin:2px 2px 0;font-size:13px;font-weight:800;color:var(--hi-muted);text-transform:uppercase;letter-spacing:.06em}

/* setup */
.hidden-isles-root .hi-setup-body{display:flex;flex-direction:column;gap:8px}
.hidden-isles-root .hi-setup-title{margin:0;padding:8px 10px;font-size:18px;display:flex;align-items:center;gap:8px}
.hidden-isles-root .hi-crews{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.hidden-isles-root .hi-crew{padding:8px;border-top:6px solid var(--hi-team);display:flex;flex-direction:column;gap:6px;min-width:0}
.hidden-isles-root .hi-crew-head{display:flex;align-items:center;gap:6px;font-weight:900;font-size:15px;color:var(--hi-team-ink);min-width:0}
.hidden-isles-root .hi-crew-head span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hidden-isles-root .hi-crew ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;min-height:64px}
.hidden-isles-root .hi-member{display:flex;align-items:center;gap:6px;min-width:0;height:32px;padding:0 6px;border-radius:9px;background:var(--hi-chip);font-size:13.5px}
.hidden-isles-root .hi-member.hi-is-me{box-shadow:inset 0 0 0 1.5px var(--hi-team)}
.hidden-isles-root .hi-member-empty{color:var(--hi-muted);font-style:italic;background:transparent}
.hidden-isles-root .hi-avatar{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:13px;line-height:1;box-shadow:0 0 0 1.5px rgba(0,0,0,.15)}
.hidden-isles-root .hi-member-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
.hidden-isles-root .hi-member-name em{font-style:normal;font-weight:600;color:var(--hi-muted);font-size:11.5px}
.hidden-isles-root .hi-tag{flex:none;display:inline-flex;align-items:center;gap:2px;font-size:10.5px;font-weight:800;padding:1px 5px;border-radius:8px;background:var(--hi-panel);color:var(--hi-muted)}
.hidden-isles-root .hi-tag-guide{color:var(--hi-team-ink);background:var(--hi-team-soft)}
.hidden-isles-root .hi-crew .hi-btn{height:40px;font-size:14px;padding:0 8px}
.hidden-isles-root .hi-setup-actions{padding:8px;display:flex;flex-direction:column;gap:8px}
.hidden-isles-root .hi-deal{height:54px;font-size:18px}
.hidden-isles-root .hi-problem{min-height:18px;margin:0;font-size:13px;font-weight:700;color:var(--hi-danger);text-align:center}
.hidden-isles-root .hi-how{padding:10px 12px}
.hidden-isles-root .hi-how h4{margin:0 0 6px;font-size:14px;display:flex;align-items:center;gap:6px}
.hidden-isles-root .hi-how ol{margin:0;padding-left:20px;font-size:13px;line-height:1.45;color:var(--hi-ink)}
.hidden-isles-root .hi-legend{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}

/* host lobby options */
.hidden-isles-root .hi-options{display:flex;flex-direction:column;gap:10px;margin:4px 0 12px}
.hidden-isles-root .hi-opt{display:flex;align-items:center;justify-content:space-between;gap:10px}
.hidden-isles-root .hi-opt-label{display:flex;flex-direction:column;min-width:0}
.hidden-isles-root .hi-opt-label b{font-size:14px}
.hidden-isles-root .hi-opt-label span{font-size:12px;color:var(--muted,#6b6b6b)}
.hidden-isles-root .hi-seg{flex:none;display:inline-flex;border:1px solid var(--line,#ddd);border-radius:10px;overflow:hidden}
.hidden-isles-root .hi-seg button{height:34px;padding:0 10px;border:0;border-radius:0;background:var(--surface,#fff);color:var(--ink,#222);font-size:13px}
.hidden-isles-root .hi-seg button+button{border-left:1px solid var(--line,#ddd)}
.hidden-isles-root .hi-seg button.hi-on{background:var(--hi-btn);color:var(--hi-btn-ink)}

/* phones: tighten, never restack */
@media (max-width:420px){
  .hidden-isles-root{gap:6px}
  .hidden-isles-root .hi-grid{gap:3px}
  .hidden-isles-root .hi-sea{padding:4px}
  .hidden-isles-root .hi-card{border-radius:7px}
  .hidden-isles-root .hi-line{font-size:12.5px;gap:6px}
  .hidden-isles-root .hi-score{padding:0 6px 0 2px}
  .hidden-isles-root .hi-seg button{padding:0 7px;font-size:12px}
  .hidden-isles-root .hi-opt-label span{font-size:11px}
}
@media (min-width:700px){
  .hidden-isles-root .hi-grid{gap:7px}
  .hidden-isles-root .hi-sea{padding:9px}
  .hidden-isles-root .hi-banner{height:60px}
  .hidden-isles-root .hi-banner-clue{font-size:26px}
  .hidden-isles-root .hi-dot{width:12px;height:12px}
}
`;

export const HIDDEN_ISLES_CSS = BASE;
