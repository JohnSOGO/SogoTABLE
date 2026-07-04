// Liar's Dice bot policy — one probability-aware house player. Pure leaf
// module: NO imports, no game-state mutation. rules.js owns the bot's turn
// (bid/challenge through the same internals a human move uses) and consults
// liarsDiceBotAction on each bot turn; everything the decision needs arrives
// as plain data — the bot's OWN dice plus the public table state, never an
// opponent's hidden cup (that would be a rules leak even server-side).
//
// The math is exact, not sampled: the unknown dice (everyone's cup but its
// own) are independent, each matching a bid face with probability 1/3 when
// ones are wild (face + wild) or 1/6 plain, so P(bid is true) is one binomial
// tail. Policy: call LIAR when the standing bid is too unlikely, otherwise
// make the most credible minimal raise — with a pinch of bluff so the family
// can't clock it. All randomness comes through view.random (the rules
// module's seeded seam), so tests can rig it.

// Below this probability that the standing bid is true, the bot calls liar.
const CHALLENGE_BELIEF_FLOOR = 0.32;
// A raise this credible is always acceptable; below it the bot weighs
// challenging the standing bid instead.
const COMFORT_FLOOR = 0.45;
const BLUFF_RATE = 0.15;

// Decide the bot's action. `view` is plain data assembled by rules.js:
//   dice         - the bot's own hidden dice, e.g. [3, 3, 1, 6]
//   totalDice    - all dice on the table (own included)
//   currentBid   - { quantity, face } or null when the bot opens the round
//   onesWild     - whether 1s count toward every bid face
//   faces        - faces per die (6)
//   raiseOptions - legal raises as [{ quantity, min_face }] (from rules.js)
//   random       - RNG for the bluff dice (the rules module's seeded seam)
// Returns { type: "challenge" } or { type: "bid", quantity, face }.
export function liarsDiceBotAction(view) {
  const random = typeof view.random === "function" ? view.random : Math.random;
  const options = Array.isArray(view.raiseOptions) ? view.raiseOptions : [];
  const canChallenge = Boolean(view.currentBid);
  if (canChallenge) {
    const belief = liarsDiceBidTruthChance(view, view.currentBid.quantity, view.currentBid.face);
    // Slight jitter keeps the trigger point from being clockable.
    if (belief < CHALLENGE_BELIEF_FLOOR + (random() - 0.5) * 0.08) return { type: "challenge" };
  }
  const raise = chooseLiarsDiceRaise(view, options, random);
  if (!raise) return canChallenge ? { type: "challenge" } : null;
  if (canChallenge && raise.belief < COMFORT_FLOOR) {
    // Every raise is a stretch: call liar unless the standing bid looks safer
    // to attack than the best lie is to tell.
    const belief = liarsDiceBidTruthChance(view, view.currentBid.quantity, view.currentBid.face);
    if (belief < raise.belief) return { type: "challenge" };
  }
  return { type: "bid", quantity: raise.quantity, face: raise.face };
}

// Pick a raise: score each candidate by how likely it is to be TRUE, keep the
// bid pressure low (smallest quantity wins ties), and sometimes bluff onto the
// bot's own strongest face to muddy the pattern. Candidates are capped to the
// two cheapest quantities — deeper raises are strictly less credible.
function chooseLiarsDiceRaise(view, options, random) {
  const candidates = [];
  let quantities = [...new Set(options.map((option) => option.quantity))].slice(0, 2);
  if (!view.currentBid && quantities.length) {
    // Opening bid: aim just under the expected count of the bot's strongest
    // face instead of the timid legal minimum.
    const faces = view.faces || 6;
    const dice = Array.isArray(view.dice) ? view.dice : [];
    const unknown = Math.max(0, Number(view.totalDice || 0) - dice.length);
    let bestOwn = 0;
    for (let face = view.onesWild !== false ? 2 : 1; face <= faces; face += 1) {
      bestOwn = Math.max(bestOwn, countOwnMatches(view, face));
    }
    const perDie = view.onesWild !== false ? 2 / faces : 1 / faces;
    const target = Math.max(1, Math.floor((bestOwn + unknown * perDie) * 0.8));
    const ceiling = options[options.length - 1].quantity;
    quantities = [Math.min(target, ceiling)];
  }
  for (const quantity of quantities) {
    const option = options.find((item) => item.quantity === quantity);
    for (let face = option.min_face; face <= (view.faces || 6); face += 1) {
      candidates.push({
        quantity,
        face,
        belief: liarsDiceBidTruthChance(view, quantity, face),
        own: countOwnMatches(view, face),
      });
    }
  }
  if (!candidates.length) return null;
  const bluffing = random() < BLUFF_RATE;
  candidates.sort((left, right) =>
    (right.belief + (bluffing ? right.own * 0.1 : 0)) - (left.belief + (bluffing ? left.own * 0.1 : 0))
    || left.quantity - right.quantity);
  // Break near-ties randomly so identical hands don't always produce the
  // identical bid.
  const best = candidates[0];
  const nearTies = candidates.filter((item) => best.belief - item.belief < 0.04);
  return nearTies[Math.floor(random() * nearTies.length)] || best;
}

// P(at least `quantity` dice on the table show `face`, wilds included), given
// the bot's own dice are known and the others are uniform unknowns. Exported
// for tests and future difficulty tuning.
export function liarsDiceBidTruthChance(view, quantity, face) {
  const own = countOwnMatches(view, face);
  const unknown = Math.max(0, Number(view.totalDice || 0) - (Array.isArray(view.dice) ? view.dice.length : 0));
  const needed = quantity - own;
  const perDie = view.onesWild !== false && face !== 1 ? 2 / (view.faces || 6) : 1 / (view.faces || 6);
  return binomialTailAtLeast(unknown, needed, perDie);
}

function countOwnMatches(view, face) {
  const dice = Array.isArray(view.dice) ? view.dice : [];
  const wild = view.onesWild !== false;
  return dice.filter((die) => die === face || (wild && die === 1 && face !== 1)).length;
}

// P(X >= k) for X ~ Binomial(n, p), computed exactly from the pmf recurrence.
function binomialTailAtLeast(n, k, p) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let pmf = Math.pow(1 - p, n); // P(X = 0)
  let below = 0; // P(X < k)
  for (let i = 0; i < k; i += 1) {
    below += pmf;
    pmf *= ((n - i) / (i + 1)) * (p / (1 - p));
  }
  return Math.max(0, Math.min(1, 1 - below));
}
