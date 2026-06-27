// ============================================================================
// Yahtzee CORE — pure rules. No DOM, no timers, no network. This is the chunk
// that becomes workers/games/yahtzee/rules.js when promoted into SogoTable.
//
// It owns: scoring for all 13 categories, the upper bonus, the Yahtzee bonus +
// Joker rules, the per-player scorecard, and the two authoritative state
// transitions a turn is made of — ROLL and SCORE — behind one applyAction()
// entry point. randomness is injected (the `rng` arg) so the SERVER can own the
// roll at integration time; the client never rolls its own authoritative dice.
// ============================================================================

export const UPPER = [
  { key: "ones", label: "Ones", face: 1 },
  { key: "twos", label: "Twos", face: 2 },
  { key: "threes", label: "Threes", face: 3 },
  { key: "fours", label: "Fours", face: 4 },
  { key: "fives", label: "Fives", face: 5 },
  { key: "sixes", label: "Sixes", face: 6 },
];

export const LOWER = [
  { key: "threeKind", label: "Three of a Kind" },
  { key: "fourKind", label: "Four of a Kind" },
  { key: "fullHouse", label: "Full House" },
  { key: "smallStraight", label: "Small Straight" },
  { key: "largeStraight", label: "Large Straight" },
  { key: "yahtzee", label: "Yahtzee" },
  { key: "chance", label: "Chance" },
];

export const CATEGORIES = [...UPPER, ...LOWER];
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

export const UPPER_BONUS_THRESHOLD = 63;
export const UPPER_BONUS = 35;
export const YAHTZEE_SCORE = 50;
export const YAHTZEE_BONUS = 100;
export const MAX_ROLLS = 3;

// --- dice helpers ----------------------------------------------------------

// Tally of how many dice show each face, indexed 1..6 (index 0 unused).
function faceCounts(dice) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d] += 1;
  return c;
}
const sum = (dice) => dice.reduce((a, b) => a + b, 0);

export function isYahtzee(dice) {
  return dice.length === 5 && faceCounts(dice).some((n) => n === 5);
}

function isFullHouse(c) {
  // exactly a triple + a pair (a five-of-a-kind is NOT a natural full house;
  // it only counts as one under the Joker rule, handled in scoreWithContext)
  return c.includes(3) && c.includes(2);
}

// Longest run of consecutive faces present; small straight needs 4, large 5.
function longestRun(c) {
  let run = 0;
  let best = 0;
  for (let f = 1; f <= 6; f += 1) {
    if (c[f] > 0) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

// --- scoring ---------------------------------------------------------------

// Natural score for a category given dice — no Joker logic. Pure dice -> points.
export function rawScore(category, dice) {
  const c = faceCounts(dice);
  switch (category) {
    case "ones": return c[1] * 1;
    case "twos": return c[2] * 2;
    case "threes": return c[3] * 3;
    case "fours": return c[4] * 4;
    case "fives": return c[5] * 5;
    case "sixes": return c[6] * 6;
    case "threeKind": return c.some((n) => n >= 3) ? sum(dice) : 0;
    case "fourKind": return c.some((n) => n >= 4) ? sum(dice) : 0;
    case "fullHouse": return isFullHouse(c) ? 25 : 0;
    case "smallStraight": return longestRun(c) >= 4 ? 30 : 0;
    case "largeStraight": return longestRun(c) >= 5 ? 40 : 0;
    case "yahtzee": return isYahtzee(dice) ? YAHTZEE_SCORE : 0;
    case "chance": return sum(dice);
    default: return 0;
  }
}

// A "Joker" is a Yahtzee rolled when the player has already scored 50 in the
// Yahtzee box (so it earns the +100 bonus and unlocks the Joker placement
// values for the fixed lower categories).
export function isJoker(dice, player) {
  return isYahtzee(dice) && player.scores.yahtzee === YAHTZEE_SCORE;
}

// Score a category for a player, applying the Joker rule: a bonus Yahtzee played
// into full house / small / large straight scores its full fixed value.
export function scoreWithContext(category, dice, player) {
  if (isJoker(dice, player)) {
    if (category === "fullHouse") return 25;
    if (category === "smallStraight") return 30;
    if (category === "largeStraight") return 40;
  }
  return rawScore(category, dice);
}

// --- totals ----------------------------------------------------------------

export function upperSubtotal(scores) {
  return UPPER.reduce((t, c) => t + (scores[c.key] || 0), 0);
}
export function upperBonus(scores) {
  return upperSubtotal(scores) >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS : 0;
}
export function lowerSubtotal(scores) {
  return LOWER.reduce((t, c) => t + (scores[c.key] || 0), 0);
}
export function grandTotal(player) {
  return upperSubtotal(player.scores) + upperBonus(player.scores) + lowerSubtotal(player.scores) + player.yahtzeeBonus;
}

// --- state -----------------------------------------------------------------

function emptyScores() {
  const s = {};
  for (const k of CATEGORY_KEYS) s[k] = null;
  return s;
}

export function newGame(playerNames = ["Player 1"]) {
  return {
    players: playerNames.map((name) => ({ name, scores: emptyScores(), yahtzeeBonus: 0 })),
    current: 0,
    dice: [1, 2, 3, 4, 5],
    held: [false, false, false, false, false],
    rollsLeft: MAX_ROLLS,
    rolled: false, // has this player rolled at least once this turn?
    round: 1, // 1..13 (advances when play wraps back to player 0)
    over: false,
  };
}

export function isCardComplete(scores) {
  return CATEGORY_KEYS.every((k) => scores[k] != null);
}

function rollDie(rng) {
  return 1 + Math.floor(rng() * 6);
}

function nextTurn(state) {
  state.dice = [1, 2, 3, 4, 5];
  state.held = [false, false, false, false, false];
  state.rollsLeft = MAX_ROLLS;
  state.rolled = false;
  if (state.players.every((p) => isCardComplete(p.scores))) {
    state.over = true;
    return;
  }
  // Game-Locked: the current player keeps playing their own game until their whole
  // card is complete, THEN play passes to the next unfinished player.
  if (!isCardComplete(state.players[state.current].scores)) return;
  do {
    state.current = (state.current + 1) % state.players.length;
  } while (isCardComplete(state.players[state.current].scores));
}

// THE authoritative transition — the future server applyAction. ROLL rerolls
// the non-held dice (server owns `rng`); SCORE records a category, applies the
// Yahtzee bonus, and advances the turn. Illegal actions are no-ops (the server
// would reject; the client should never have offered them).
export function applyAction(state, action, rng = Math.random) {
  if (state.over) return state;
  const player = state.players[state.current];

  if (action.type === "ROLL") {
    if (state.rollsLeft <= 0) return state;
    const held = state.rolled ? action.held || state.held : [false, false, false, false, false];
    state.dice = state.dice.map((d, i) => (held[i] ? d : rollDie(rng)));
    state.held = held.slice();
    state.rollsLeft -= 1;
    state.rolled = true;
    return state;
  }

  if (action.type === "SCORE") {
    if (!state.rolled) return state;
    const cat = action.category;
    if (!CATEGORY_KEYS.includes(cat) || player.scores[cat] != null) return state;
    const joker = isJoker(state.dice, player);
    player.scores[cat] = scoreWithContext(cat, state.dice, player);
    if (joker) player.yahtzeeBonus += YAHTZEE_BONUS;
    nextTurn(state);
    return state;
  }

  return state;
}

// --- view helpers (pure; used by the UI, harmless to ship to clients) ------

// What each still-open category would score for the current dice (null if the
// category is taken or the player hasn't rolled yet).
export function previewScores(state) {
  const player = state.players[state.current];
  const out = {};
  for (const k of CATEGORY_KEYS) {
    out[k] = player.scores[k] == null && state.rolled ? scoreWithContext(k, state.dice, player) : null;
  }
  return out;
}

// Which dice "made" a category's score, as a boolean mask parallel to `dice`.
// Pure; used for post-score visual feedback (and harmless to ship to clients).
//   - upper: the dice matching that face
//   - small/large straight: one die per face in the qualifying run
//   - three/four kind, full house, yahtzee, chance: every die (when it scores)
//   - a forced zero: no dice
export function scoringDice(category, dice) {
  const u = UPPER.find((x) => x.key === category);
  if (u) return dice.map((d) => d === u.face);
  if (category === "smallStraight" || category === "largeStraight") {
    return straightMask(dice, category === "smallStraight" ? 4 : 5);
  }
  if (rawScore(category, dice) === 0) return dice.map(() => false);
  return dice.map(() => true);
}

function straightMask(dice, len) {
  const present = new Set(dice);
  let best = [];
  let run = [];
  for (let f = 1; f <= 6; f += 1) {
    if (present.has(f)) {
      run.push(f);
      if (run.length > best.length) best = run.slice();
    } else {
      run = [];
    }
  }
  if (best.length < len) return dice.map(() => false);
  const used = new Set();
  return dice.map((d) => {
    if (best.includes(d) && !used.has(d)) {
      used.add(d);
      return true;
    }
    return false;
  });
}

export function winners(state) {
  const totals = state.players.map((p, i) => ({ index: i, name: p.name, total: grandTotal(p) }));
  const top = Math.max(...totals.map((t) => t.total));
  return totals.filter((t) => t.total === top);
}
