// Yahtzee bot AI — 4 difficulty levels over one shared scoring engine, per
// AI/Yahtzee/AI Algo.txt. The level changes (a) which dice to keep and (b) how a
// category is chosen:
//
//   1 Rookie   — keep the most common face + believable random mistakes; flashy-
//                first scoring. A funny little dice goblin.
//   2 Casual   — chase the best visible pattern; priority scoring, no lookahead.
//   3 Sharp    — 1-ply expected value over candidate holds + upper-bonus pressure.
//   4 Ruthless — Sharp's EV plus regret-aware category planning (never wastes a
//                high-potential box) and full upper-bonus weighting.
//
// EV is computed over DISTINCT reroll multisets (<=252) with their multinomial
// probabilities, and holds are limited to coherent candidates (face groups, the
// straight draw, keep-all/none) — near-optimal but cheap enough to play a bot's
// whole 6-game series synchronously when a room starts.
//
// (Opponent-aware endgame from the spec is intentionally omitted: bots play their
// series upfront, before any human has scored, so there is no opponent state yet.)
import {
  UPPER, CATEGORY_KEYS, scoreWithContext, upperSubtotal, upperBonus,
  UPPER_BONUS_THRESHOLD,
} from "../../../src/sogotable/static/games/yahtzee/rules.js";

export const AI_LEVELS = { ROOKIE: 1, CASUAL: 2, SHARP: 3, RUTHLESS: 4 };

// --- distinct reroll multisets with multinomial probabilities (k = 0..5) ------
const FACT = [1, 1, 2, 6, 24, 120];
function buildOutcomes(k) {
  if (k === 0) return [{ dice: [], prob: 1 }];
  const out = [];
  const total = 6 ** k;
  const rec = (start, chosen) => {
    if (chosen.length === k) {
      const c = {};
      for (const f of chosen) c[f] = (c[f] || 0) + 1;
      let denom = 1;
      for (const f in c) denom *= FACT[c[f]];
      out.push({ dice: chosen, prob: (FACT[k] / denom) / total });
      return;
    }
    for (let f = start; f <= 6; f += 1) rec(f, [...chosen, f]);
  };
  rec(1, []);
  return out;
}
const OUTCOMES = [0, 1, 2, 3, 4, 5].map(buildOutcomes);

const UPPER_KEY = ["ones", "twos", "threes", "fours", "fives", "sixes"];
const TYPICAL_MAX = {
  ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18,
  threeKind: 21, fourKind: 23, fullHouse: 25, smallStraight: 30,
  largeStraight: 40, yahtzee: 50, chance: 23,
};
const ZERO_ORDER = ["ones", "twos", "threeKind", "yahtzee", "fourKind", "fullHouse", "smallStraight", "largeStraight", "threes", "chance", "fours", "fives", "sixes"];

function counts(dice) { const c = [0, 0, 0, 0, 0, 0, 0]; for (const d of dice) c[d] += 1; return c; }
function asPlayer(card) { return { scores: card.scores, yahtzeeBonus: card.yahtzeeBonus || 0 }; }
function openCats(card) { return CATEGORY_KEYS.filter((k) => card.scores[k] == null); }
function catScore(cat, dice, card) { return scoreWithContext(cat, dice, asPlayer(card)); }

// Extra value for an upper score that keeps the 63-point bonus on pace.
function upperCredit(cat, score, card) {
  if (!UPPER_KEY.includes(cat) || upperBonus(card.scores) > 0) return 0;
  const remaining = UPPER.filter((x) => card.scores[x.key] == null).length;
  const needed = UPPER_BONUS_THRESHOLD - upperSubtotal(card.scores);
  if (needed <= 0 || remaining === 0) return 0;
  return Math.max(0, score - needed / remaining) * 0.7;
}

function bestImmediate(dice, card) {
  let best = 0;
  for (const k of openCats(card)) {
    const s = catScore(k, dice, card);
    const v = s + upperCredit(k, s, card);
    if (v > best) best = v;
  }
  return best;
}
function holdEV(kept, card) {
  const k = 5 - kept.length;
  let ev = 0;
  for (const o of OUTCOMES[k]) ev += o.prob * bestImmediate([...kept, ...o.dice], card);
  return ev;
}

// Coherent candidate holds: keep-none, keep-all, each face group, the straight draw.
function candidateHolds(dice) {
  const c = counts(dice);
  const masks = [];
  const seen = new Set();
  const add = (m) => { const key = m.join(""); if (!seen.has(key)) { seen.add(key); masks.push(m); } };
  add(dice.map(() => false));
  add(dice.map(() => true));
  for (let f = 1; f <= 6; f += 1) if (c[f] > 0) add(dice.map((d) => d === f));
  const run = longestRunFaces(dice);
  if (run.length >= 3) {
    const used = new Set();
    add(dice.map((d) => { if (run.includes(d) && !used.has(d)) { used.add(d); return true; } return false; }));
  }
  return masks;
}
function longestRunFaces(dice) {
  const present = new Set(dice);
  let best = [];
  let run = [];
  for (let f = 1; f <= 6; f += 1) {
    if (present.has(f)) { run.push(f); if (run.length > best.length) best = run.slice(); } else run = [];
  }
  return best;
}
function keptOf(dice, mask) { const k = []; for (let i = 0; i < 5; i += 1) if (mask[i]) k.push(dice[i]); return k; }
function evHold(dice, card) {
  let best = null;
  let bestEv = -1;
  for (const mask of candidateHolds(dice)) {
    const ev = holdEV(keptOf(dice, mask), card);
    if (ev > bestEv) { bestEv = ev; best = mask; }
  }
  return best || dice.map(() => true);
}
function cheapestZero(card) {
  const open = new Set(openCats(card));
  for (const k of ZERO_ORDER) if (open.has(k)) return k;
  return openCats(card)[0];
}

// --- Rookie (1) ---------------------------------------------------------------
const ROOKIE_ORDER = ["yahtzee", "largeStraight", "fullHouse", "fourKind", "threeKind", "sixes", "fives", "fours", "threes", "twos", "ones", "smallStraight", "chance"];
function rookieHold(dice, rng) {
  if (rng() < 0.15) return dice.map(() => rng() < 0.4); // believable fumble
  const c = counts(dice);
  let face = 0;
  let n = 1;
  for (let f = 1; f <= 6; f += 1) if (c[f] >= 2 && c[f] >= n) { n = c[f]; face = f; }
  if (face) return dice.map((d) => d === face);
  const hi = Math.max(...dice);
  let kept = false;
  return dice.map((d) => { if (d === hi && !kept) { kept = true; return true; } return false; });
}
function rookieCategory(dice, card, rng) {
  const open = new Set(openCats(card));
  for (const k of ROOKIE_ORDER) {
    if (open.has(k) && catScore(k, dice, card) > 0) {
      if (rng() < 0.1) continue; // sometimes overlooks the obvious play
      return k;
    }
  }
  return cheapestZero(card);
}

// --- Casual (2) ---------------------------------------------------------------
const CASUAL_ORDER = ["yahtzee", "largeStraight", "fullHouse", "smallStraight", "fourKind", "threeKind"];
function casualHold(dice, card) {
  const c = counts(dice);
  const open = new Set(openCats(card));
  for (let f = 6; f >= 1; f -= 1) if (c[f] >= 3) return dice.map((d) => d === f);
  const run = longestRunFaces(dice);
  if (run.length >= 3 && (open.has("smallStraight") || open.has("largeStraight"))) {
    const used = new Set();
    return dice.map((d) => { if (run.includes(d) && !used.has(d)) { used.add(d); return true; } return false; });
  }
  for (let f = 6; f >= 1; f -= 1) if (c[f] === 2) return dice.map((d) => d === f);
  const hi = Math.max(...dice);
  let kept = false;
  return dice.map((d) => { if (d === hi && !kept) { kept = true; return true; } return false; });
}
function casualCategory(dice, card) {
  const open = new Set(openCats(card));
  const c = counts(dice);
  for (const k of CASUAL_ORDER) if (open.has(k) && catScore(k, dice, card) > 0) return k;
  for (let f = 6; f >= 1; f -= 1) { const key = UPPER_KEY[f - 1]; if (open.has(key) && c[f] >= 3) return key; }
  let bU = null;
  let bV = 0;
  for (let f = 6; f >= 1; f -= 1) { const key = UPPER_KEY[f - 1]; if (open.has(key) && c[f] * f > bV) { bV = c[f] * f; bU = key; } }
  if (bU) return bU;
  if (open.has("chance") && catScore("chance", dice, card) > 0) return "chance";
  return cheapestZero(card);
}

// --- Sharp (3) ----------------------------------------------------------------
function sharpCategory(dice, card) {
  let best = null;
  let bestV = -1;
  for (const k of openCats(card)) {
    const s = catScore(k, dice, card);
    const v = s + upperCredit(k, s, card);
    if (v > bestV) { bestV = v; best = k; }
  }
  return bestV <= 0 ? cheapestZero(card) : best;
}

// --- Ruthless (4) -------------------------------------------------------------
function ruthlessCategory(dice, card) {
  let best = null;
  let bestV = -Infinity;
  for (const k of openCats(card)) {
    const s = catScore(k, dice, card);
    const regret = 0.6 * Math.max(0, (TYPICAL_MAX[k] || 0) - s); // penalty for wasting a strong box
    const v = s + upperCredit(k, s, card) - regret;
    if (v > bestV) { bestV = v; best = k; }
  }
  return best;
}

// --- dispatch -----------------------------------------------------------------
export function chooseYahtzeeHold(level, dice, rollsLeft, card, rng) {
  switch (level) {
    case AI_LEVELS.ROOKIE: return rookieHold(dice, rng);
    case AI_LEVELS.CASUAL: return casualHold(dice, card);
    case AI_LEVELS.SHARP: return evHold(dice, card);
    default: return evHold(dice, card);
  }
}
export function chooseYahtzeeCategory(level, dice, card, rng) {
  switch (level) {
    case AI_LEVELS.ROOKIE: return rookieCategory(dice, card, rng);
    case AI_LEVELS.CASUAL: return casualCategory(dice, card);
    case AI_LEVELS.SHARP: return sharpCategory(dice, card);
    default: return ruthlessCategory(dice, card);
  }
}
