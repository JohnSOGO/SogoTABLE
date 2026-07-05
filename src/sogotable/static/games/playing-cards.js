// Shared standard-deck (52-card) primitives — card faces, backs, and the
// canonical hand sort. Pure builders: no DOM queries, no listeners, no rules
// (legality and scoring stay in each game's worker rules module). Hearts is
// the first consumer; future deck games (Spades, Rummy, ...) import from HERE
// — never from another game's directory (games must not import game-to-game).
// No Thanks!'s tier-tinted number cards are a different visual system and
// deliberately stay in no-thanks/cards.js.
//
// Cards are strings "<rank><suit>": rank in 23456789TJQKA, suit in CDSH.
// A null/undefined card renders as a card back.

export const CARD_SUIT_GLYPHS = { C: "♣", D: "♦", S: "♠", H: "♥" };
const SUIT_ORDER = "CDSH"; // clubs, diamonds, spades, hearts — the house hand sort
const RANK_ORDER = "23456789TJQKA";

export function cardSuit(card) { return String(card || "")[1] || ""; }
export function cardRankLabel(card) {
  const rank = String(card || "")[0] || "";
  return rank === "T" ? "10" : rank;
}
export function isRedCard(card) {
  const suit = cardSuit(card);
  return suit === "H" || suit === "D";
}
export function cardRankValue(card) { return RANK_ORDER.indexOf(String(card || "")[0]) + 2; }

// Canonical display sort: by suit (C, D, S, H), ascending rank — matches the
// server-side sortHeartsHand so a rewound hand re-inserts where it was dealt.
export function sortPlayingCards(cards) {
  return (Array.isArray(cards) ? cards : []).slice().sort((a, b) => {
    const suit = SUIT_ORDER.indexOf(cardSuit(a)) - SUIT_ORDER.indexOf(cardSuit(b));
    return suit !== 0 ? suit : cardRankValue(a) - cardRankValue(b);
  });
}

// One card face (or back, when `card` is falsy or opts.back): corner index +
// big suit glyph. opts.size: "table" (trick/table cards) | "hand" (a player's
// fan). opts.extraClass rides animation/state classes; opts.zIndex stacks
// overlapping fans (flex items honor z-index).
export function playingCardHtml(card, opts = {}) {
  const size = opts.size || "hand";
  const back = Boolean(opts.back || !card);
  const classes = ["pc-card", `pc-${size}`];
  if (back) classes.push("pc-back");
  else if (isRedCard(card)) classes.push("pc-red");
  if (opts.extraClass) classes.push(opts.extraClass);
  const style = Number.isInteger(opts.zIndex) ? ` style="z-index:${opts.zIndex}"` : "";
  if (back) return `<span class="${classes.join(" ")}"${style} role="img" aria-label="face-down card"></span>`;
  const glyph = CARD_SUIT_GLYPHS[cardSuit(card)] || "?";
  return `<span class="${classes.join(" ")}" data-card="${card}"${style} role="img" aria-label="${cardRankLabel(card)} of ${cardSuit(card)}">
    <span class="pc-corner">${cardRankLabel(card)}<small>${glyph}</small></span>
    <span class="pc-pip">${glyph}</span>
  </span>`;
}

// Base card look, injected once by whichever game renders cards. Cards keep a
// physical paper face in BOTH themes (docs/theme.md physical-pieces rule, the
// same reason dice stay white). Layout (fans, slots, raising) is each game's
// own injected CSS; only the face itself lives here.
export const PLAYING_CARD_CSS = `
.pc-card{position:relative;display:inline-flex;flex:none;background:#fdfcf6;color:#1c2320;
 border:1px solid rgba(0,0,0,.30);border-radius:8px;box-sizing:border-box;
 box-shadow:inset 0 -2px 0 rgba(0,0,0,.06),0 2px 5px rgba(0,0,0,.28);
 font-variant-numeric:tabular-nums;pointer-events:none;}
.pc-card.pc-red{color:#c22335;}
.pc-card .pc-corner{position:absolute;top:4%;left:8%;font-weight:800;line-height:1;text-align:center;}
.pc-card .pc-corner small{display:block;font-size:.8em;line-height:1;}
.pc-card .pc-pip{position:absolute;right:7%;bottom:4%;line-height:1;}
.pc-card.pc-back{background:repeating-linear-gradient(135deg,#7e2a3a 0 6px,#6c2231 6px 12px);
 border-color:rgba(255,255,255,.35);}
.pc-card.pc-back::after{content:"";position:absolute;inset:4px;border-radius:5px;
 border:1.5px solid rgba(255,255,255,.5);}
.pc-hand{width:46px;height:64px;font-size:1rem;}
.pc-hand .pc-pip{font-size:1.3em;}
.pc-table{width:52px;height:72px;font-size:1.1rem;border-radius:9px;}
.pc-table .pc-pip{font-size:1.35em;}
@media (max-width:390px){
  .pc-hand{width:42px;height:59px;font-size:.92rem;}
  .pc-table{width:47px;height:66px;font-size:1rem;}
}
`;
