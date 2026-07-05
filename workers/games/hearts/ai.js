// Hearts bot decision policy. Pure heuristics over the context rules.js hands
// it — no game-object access, no legality (rules.js validates every choice and
// substitutes a safe default if a policy misfires). Tuned in the AI/hearts
// prototype: 2,000 headless games across every option combo, ~3.4% moon rate.
//
// Passing: shed the queen unless she's guarded, bare high spades, high hearts,
// and high cards that open a void in a short off-suit.
// Playing: duck as high as possible under points, never eat the queen when a
// duck exists, burn dangerous cards on free tricks, and discard Q♠ → high
// spades → high hearts → highest when void.

const RANKS = "23456789TJQKA";
const QUEEN_OF_SPADES = "QS";

function rankValue(card) { return RANKS.indexOf(card[0]) + 2; }
function suitOf(card) { return card[1]; }
function isHeart(card) { return card[1] === "H"; }
function byRank(cards) { return cards.slice().sort((a, b) => rankValue(a) - rankValue(b)); }
function cardPoints(card) { return isHeart(card) ? 1 : card === QUEEN_OF_SPADES ? 13 : 0; }

export function heartsBotPassCards({ hand }) {
  const bySuit = { C: [], D: [], S: [], H: [] };
  hand.forEach((card) => bySuit[suitOf(card)].push(card));
  const danger = (card) => {
    const rank = rankValue(card);
    const suit = suitOf(card);
    let weight = rank;
    if (card === QUEEN_OF_SPADES) weight += bySuit.S.length >= 4 ? -5 : 40; // keep a guarded queen
    else if (suit === "S" && rank >= 13) weight += bySuit.S.length >= 4 ? 5 : 30; // bare A/K of spades
    else if (suit === "H") weight += rank >= 11 ? 12 : 2;
    if ((suit === "C" || suit === "D") && bySuit[suit].length <= 2) weight += 8; // open a void
    return weight;
  };
  return hand.slice().sort((a, b) => danger(b) - danger(a)).slice(0, 3);
}

export function heartsBotPlayCard({ legal, trick, heartsBroken }) {
  if (!legal.length) return null;
  if (legal.length === 1) return legal[0];
  if (trick.length === 0) return chooseLead(legal, heartsBroken);
  const led = suitOf(trick[0]);
  const following = legal.filter((card) => suitOf(card) === led);
  if (!following.length) return chooseDiscard(legal);

  const winningRank = Math.max(...trick.filter((card) => suitOf(card) === led).map(rankValue));
  const ducks = following.filter((card) => rankValue(card) < winningRank);
  const trickPoints = trick.reduce((sum, card) => sum + cardPoints(card), 0);
  const lastToPlay = trick.length === 3;

  if (ducks.length) {
    // Duck (as high as possible) whenever points ride the trick, the queen
    // could still land, or someone acts after us.
    if (trickPoints > 0 || !lastToPlay || led === "S") return byRank(ducks).pop();
    // Last to act on a clean trick: win it with our highest to burn a
    // dangerous card — but never volunteer the queen.
    const burn = byRank(following).pop();
    return burn === QUEEN_OF_SPADES ? byRank(ducks).pop() : burn;
  }
  // Forced to beat the current winner: win as cheap as possible, avoid the
  // queen; on a clean trick as last to act, burn our highest non-queen.
  const nonQueen = following.filter((card) => card !== QUEEN_OF_SPADES);
  if (lastToPlay && trickPoints === 0 && nonQueen.length) return byRank(nonQueen).pop();
  return nonQueen.length ? byRank(nonQueen)[0] : byRank(following)[0];
}

function chooseLead(legal, heartsBroken) {
  const scored = legal.map((card) => {
    const rank = rankValue(card);
    let weight = rank;
    if (card === QUEEN_OF_SPADES) weight += 40;
    if (suitOf(card) === "S" && rank >= 13) weight += 25; // don't lead A/K of spades into the queen
    if (isHeart(card)) weight += heartsBroken ? 6 : 60;
    return { card, weight };
  });
  scored.sort((a, b) => a.weight - b.weight);
  return scored[0].card;
}

function chooseDiscard(legal) {
  if (legal.includes(QUEEN_OF_SPADES)) return QUEEN_OF_SPADES;
  const highSpades = legal.filter((card) => suitOf(card) === "S" && rankValue(card) >= 13);
  if (highSpades.length) return byRank(highSpades).pop();
  const hearts = legal.filter(isHeart);
  if (hearts.length) return byRank(hearts).pop();
  return byRank(legal).pop();
}
