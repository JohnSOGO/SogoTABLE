// Zombie Dice bot policy — 4 difficulty levels over one shared push-your-luck
// evaluator. Pure leaf module: NO imports, no game-state mutation. rules.js owns
// the bot's turn loop (roll/bank via the same human move path) and consults
// zombieDiceBotDecision before each roll; everything the decision needs arrives
// as plain data, so this file never touches the authoritative state.
//
//   1 Sprout   — timid: banks at 2 brains; frequent believable mistakes.
//   2 Buddy    — house player: banks at 2 shotguns or 4 brains; some mistakes.
//   3 Cipher   — 1-ply expected value: rolls while the expected brains beat the
//                expected loss (turn brains x bust chance); rare mistakes.
//   4 Overlord — Cipher's EV plus standings pressure: chases the leader when a
//                safe bank cannot win, and always banks a winning total. No
//                mistakes. (Bots resolve at round start, so opponent scores are
//                the previous round's banked totals — known, fair information.)
//
// The evaluator is exact, not sampled: the 3-dice draw is enumerated
// hypergeometrically over the cup and each die's faces are independent, so
// P(bust) and E[brains] cost a few dozen multiplications per decision.

export const ZOMBIE_DICE_AI_LEVELS = { SPROUT: 1, BUDDY: 2, CIPHER: 3, OVERLORD: 4 };

const BOT_ERROR_RATE = { 1: 0.3, 2: 0.2, 3: 0.1, 4: 0 };

// Decide whether to roll again. `view` is plain data assembled by rules.js:
//   faces      - per-color face counts, e.g. { green: { brain: 3, feet: 2, shotgun: 1 }, ... }
//   cup        - per-color dice remaining in the cup, e.g. { green: 4, yellow: 2, red: 3 }
//   hand       - feet colors carried into the next roll, e.g. ["green", "red"]
//   shotguns   - shotguns collected this turn (0-2 when deciding)
//   turnBrains - brains collected this turn
//   score      - this seat's banked brains
//   bestOpponentScore - highest banked score among the other seats
//   target     - brains needed to trigger the endgame (13)
//   random     - RNG for the misplay dice (the rules module's seeded seam)
export function zombieDiceBotDecision(level, view) {
  const tier = Number.isInteger(level) && level >= 1 && level <= 4 ? level : 2;
  const intended = zombieDiceIntendedChoice(tier, view);
  const random = typeof view.random === "function" ? view.random : Math.random;
  if (random() < BOT_ERROR_RATE[tier]) return !intended;
  return intended;
}

function zombieDiceIntendedChoice(tier, view) {
  const shotguns = Number(view.shotguns) || 0;
  const turnBrains = Number(view.turnBrains) || 0;
  const score = Number(view.score) || 0;
  const target = Number(view.target) || 13;
  if (tier === 1) return turnBrains < 2;
  if (tier === 2) return shotguns < 2 && turnBrains < 4;
  const odds = zombieDiceRollOdds(view.faces, view.cup, view.hand, shotguns);
  const evGain = odds.expectedBrains - turnBrains * odds.bustChance;
  if (tier === 3) return evGain > 0;
  // Overlord: a bank that already wins is never passed up; a bank that cannot
  // catch the leader is pressure to keep rolling even at negative EV, as long
  // as the bust chance is not hopeless.
  const bestOpponent = Number(view.bestOpponentScore) || 0;
  const total = score + turnBrains;
  if (total >= target && total > bestOpponent) return false;
  if (bestOpponent >= target && total <= bestOpponent) return odds.bustChance < 0.85;
  return evGain > 0 || (total < bestOpponent && odds.bustChance < 0.5);
}

// Exact one-roll odds: enumerate every hypergeometric 3-dice draw from the cup
// (feet in hand are fixed), then every face combination of the 3 dice.
// Returns { bustChance, expectedBrains } for the NEXT roll given `shotguns`
// already collected. Exported for tests (and for any future difficulty tuning).
export function zombieDiceRollOdds(faces, cup, hand, shotguns) {
  const held = Array.isArray(hand) ? hand : [];
  const need = Math.max(0, 3 - held.length);
  const draws = zombieDiceDrawCombos(cup, need);
  const kill = Math.max(1, 3 - (Number(shotguns) || 0));
  let bustChance = 0;
  let expectedBrains = 0;
  draws.forEach((draw) => {
    const colors = held.concat(draw.colors);
    const shotgunProbs = colors.map((color) => zombieDiceFaceChance(faces, color, "shotgun"));
    bustChance += draw.prob * chanceOfAtLeast(shotgunProbs, kill);
    expectedBrains += draw.prob * colors.reduce(
      (sum, color) => sum + zombieDiceFaceChance(faces, color, "brain"), 0);
  });
  return { bustChance, expectedBrains };
}

function zombieDiceFaceChance(faces, color, face) {
  const table = faces && faces[color];
  if (!table) return 0;
  const total = (table.brain || 0) + (table.feet || 0) + (table.shotgun || 0);
  return total > 0 ? (table[face] || 0) / total : 0;
}

// All ways to draw `count` dice from the cup, with hypergeometric probabilities.
// Returns [{ colors: ["green", ...], prob }]; a single [{ colors: [], prob: 1 }]
// when nothing needs drawing. Callers guarantee the cup can cover the draw
// (rules.js refills brains first), but a short cup still enumerates safely.
export function zombieDiceDrawCombos(cup, count) {
  const g = Math.max(0, Number(cup && cup.green) || 0);
  const y = Math.max(0, Number(cup && cup.yellow) || 0);
  const r = Math.max(0, Number(cup && cup.red) || 0);
  const total = g + y + r;
  const k = Math.min(Math.max(0, count), total);
  if (k === 0) return [{ colors: [], prob: 1 }];
  const combos = [];
  const denom = choose(total, k);
  for (let takeG = 0; takeG <= Math.min(k, g); takeG += 1) {
    for (let takeY = 0; takeY <= Math.min(k - takeG, y); takeY += 1) {
      const takeR = k - takeG - takeY;
      if (takeR < 0 || takeR > r) continue;
      const ways = choose(g, takeG) * choose(y, takeY) * choose(r, takeR);
      if (ways <= 0) continue;
      combos.push({
        colors: [
          ...Array.from({ length: takeG }, () => "green"),
          ...Array.from({ length: takeY }, () => "yellow"),
          ...Array.from({ length: takeR }, () => "red"),
        ],
        prob: ways / denom,
      });
    }
  }
  return combos;
}

// P(at least `need` successes) over independent per-die probabilities.
function chanceOfAtLeast(probs, need) {
  if (need <= 0) return 1;
  let atLeast = 0;
  const total = 1 << probs.length;
  for (let mask = 0; mask < total; mask += 1) {
    let hits = 0;
    let p = 1;
    for (let index = 0; index < probs.length; index += 1) {
      if (mask & (1 << index)) { hits += 1; p *= probs[index]; }
      else p *= 1 - probs[index];
    }
    if (hits >= need) atLeast += p;
  }
  return atLeast;
}

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let index = 0; index < k; index += 1) result = (result * (n - index)) / (index + 1);
  return Math.round(result);
}
