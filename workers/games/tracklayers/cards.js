// Tracklayers — train-card deck, face-up market and draw helpers. Pure: every
// random choice comes through the `rng` argument (rules.js owns the one seam,
// setTracklayersRandom), so a seeded game replays exactly.
//
// Deck: 12 of each of the 8 colors + 14 wild "Lantern" cards = 110. Market:
// 5 face-up. If the market shows 3+ wilds it is discarded and refilled (max 3
// tries). When the deck runs out the discard pile is reshuffled into it.

export const COLORS = Object.freeze(["red", "orange", "yellow", "green", "blue", "purple", "black", "white"]);
export const CARD_KINDS = Object.freeze([...COLORS, "wild"]);
export const PER_COLOR = 12;
export const WILD_COUNT = 14;
export const MARKET_SIZE = 5;
const MARKET_WILD_LIMIT = 3;
const MARKET_RESET_TRIES = 3;

export function isCardKind(value) {
  return typeof value === "string" && CARD_KINDS.includes(value);
}

export function emptyHand() {
  const hand = {};
  CARD_KINDS.forEach((k) => { hand[k] = 0; });
  return hand;
}

export function handCount(hand) {
  return CARD_KINDS.reduce((sum, k) => sum + (hand[k] || 0), 0);
}

export function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function buildDeck(rng) {
  const deck = [];
  COLORS.forEach((c) => { for (let i = 0; i < PER_COLOR; i += 1) deck.push(c); });
  for (let i = 0; i < WILD_COUNT; i += 1) deck.push("wild");
  return shuffle(deck, rng);
}

// Top card of the deck, reshuffling the discard pile in when the deck is empty.
// Returns the card (a color/"wild") or null when deck and discard are both
// empty. `onEvent(kind, text)` lets the caller log a reshuffle.
export function drawBlind(game, rng, onEvent) {
  if (!game.deck.length && game.discard.length) {
    game.deck = shuffle(game.discard.slice(), rng);
    game.discard = [];
    if (onEvent) onEvent("reshuffle", "The discard pile was shuffled into a fresh deck.");
  }
  return game.deck.length ? game.deck.shift() : null;
}

const wildsIn = (market) => market.filter((c) => c === "wild").length;

// Fill empty market slots from the deck, then apply the 3-wild reset (discard
// the whole market and refill, at most MARKET_RESET_TRIES times). A market
// that cannot be filled stays short.
export function refillMarket(game, rng, onEvent) {
  const fill = () => {
    while (game.market.length < MARKET_SIZE) {
      const card = drawBlind(game, rng, onEvent);
      if (card === null) break;
      game.market.push(card);
    }
  };
  fill();
  let tries = 0;
  while (wildsIn(game.market) >= MARKET_WILD_LIMIT && tries < MARKET_RESET_TRIES) {
    tries += 1;
    const available = game.deck.length + game.discard.length;
    if (available < MARKET_SIZE) break; // a reset could not produce a fresh market
    game.discard.push(...game.market);
    game.market = [];
    if (onEvent) onEvent("market_reset", "Three Lantern wilds showed face-up — the market was swept and refilled.");
    fill();
  }
}

// Take one face-up card of `color` from the market (first match), or null.
export function takeFromMarket(game, color) {
  const index = game.market.indexOf(color);
  if (index < 0) return null;
  game.market.splice(index, 1);
  return color;
}

// Pay `len` cards for a claim: cards of `color` first, wilds for the rest
// (`color === "wild"` pays all wilds). Returns the paid cards, or null when the
// hand can't cover it (hand untouched).
export function payCost(hand, color, len) {
  const fromColor = color === "wild" ? 0 : Math.min(hand[color] || 0, len);
  const fromWild = len - fromColor;
  if ((hand.wild || 0) < fromWild) return null;
  if (fromColor) hand[color] -= fromColor;
  if (fromWild) hand.wild -= fromWild;
  const paid = [];
  for (let i = 0; i < fromColor; i += 1) paid.push(color);
  for (let i = 0; i < fromWild; i += 1) paid.push("wild");
  return paid;
}

export function canPay(hand, color, len) {
  const fromColor = color === "wild" ? 0 : Math.min(hand[color] || 0, len);
  return (hand.wild || 0) >= len - fromColor;
}
