// Hidden Isles — bots. The Navigator bot picks an association tag shared by
// its crew's face-down islands and avoided by everything risky; crew bots read
// a clue through the same association table. Pure; randomness comes in as rng.
//
// Bots only ever see what their seat may see: a Navigator bot reads the chart
// (as a human Navigator does), a crew bot reads only words + revealed keys.
import { allTags, clueProblem, association, wordTags } from "./clues.js";

const TRAP = "trap";
const NEUTRAL = "neutral";

// Per level (1 Sprout … 4 Overlord): how many words a clue may aim at, how
// much risk it tolerates, and how often a crew bot fumbles a guess.
const LEVEL = {
  1: { maxCount: 1, neutralRisk: true, rivalRisk: true, fumble: 0.3 },
  2: { maxCount: 2, neutralRisk: true, rivalRisk: false, fumble: 0.15 },
  3: { maxCount: 3, neutralRisk: false, rivalRisk: false, fumble: 0.05 },
  4: { maxCount: 4, neutralRisk: false, rivalRisk: false, fumble: 0 },
};
function levelOf(level) {
  return LEVEL[level] || LEVEL[2];
}

const FALLBACK_CLUES = ["voyage", "horizon", "compass", "lantern", "harbor", "tide", "breeze", "anchorage"];

// Every legal tag scored for `team` against the full chart, best first.
// Each entry: { word, count, targets, risk } where risk counts rival/neutral
// words sharing the tag (the Kraken sharing it disqualifies the tag outright).
export function rankClues(board, team, opts = {}) {
  const hidden = board.filter((t) => !t.revealed);
  const hiddenWords = hidden.map((t) => t.word);
  const ranked = [];
  allTags().forEach((tag) => {
    if (clueProblem(tag, hiddenWords)) return;
    const targets = [];
    let rival = 0;
    let neutral = 0;
    let trap = false;
    hidden.forEach((t) => {
      if (!wordTags(t.word).has(tag)) return;
      if (t.key === team) targets.push(t.index);
      else if (t.key === TRAP) trap = true;
      else if (t.key === NEUTRAL) neutral += 1;
      else rival += 1;
    });
    if (!targets.length || trap) return;
    if (!opts.neutralRisk && neutral) return;
    if (!opts.rivalRisk && rival) return;
    ranked.push({ word: tag, count: targets.length, targets, risk: rival * 2 + neutral });
  });
  ranked.sort((a, b) => (b.count - b.risk) - (a.count - a.risk) || a.risk - b.risk || b.count - a.count || a.word.localeCompare(b.word));
  return ranked;
}

// Navigator bot: returns { word, count, unlimited:false }.
export function chooseClue(board, team, level, rng = Math.random) {
  const L = levelOf(level);
  let ranked = rankClues(board, team, { neutralRisk: L.neutralRisk, rivalRisk: L.rivalRisk });
  if (!ranked.length) ranked = rankClues(board, team, { neutralRisk: true, rivalRisk: true });
  if (ranked.length) {
    // Weaker bots don't always find the best link: pick among the top few.
    const pool = ranked.slice(0, Math.max(1, 5 - level));
    const pick = pool[Math.floor(rng() * pool.length) % pool.length];
    return { word: pick.word, count: Math.max(1, Math.min(L.maxCount, pick.count)), unlimited: false };
  }
  const hiddenWords = board.filter((t) => !t.revealed).map((t) => t.word);
  const word = FALLBACK_CLUES.find((w) => !clueProblem(w, hiddenWords)) || "seaward";
  return { word, count: 1, unlimited: false };
}

// Ideas for a human Navigator (optional help): safest-first, up to `limit`.
export function clueIdeas(board, team, limit = 6) {
  return rankClues(board, team, { neutralRisk: true, rivalRisk: false })
    .slice(0, limit)
    .map(({ word, count, targets }) => ({ word, count, targets }));
}

// Crew bot: returns { index } to reveal, or { pass: true }.
// `turn` = { clue, guesses_made, guesses_left }; board keys of face-down
// words are NOT read here — only words and the clue.
export function chooseGuess(board, turn, level, rng = Math.random) {
  const L = levelOf(level);
  const hidden = board.filter((t) => !t.revealed);
  if (!hidden.length || !turn.clue) return { pass: true };
  const scored = hidden
    .map((t) => ({ index: t.index, score: association(turn.clue.word, t.word) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const intended = turn.clue.unlimited || turn.clue.count === 0 ? scored.length : turn.clue.count;
  const made = turn.guesses_made || 0;
  const wantMore = made < Math.max(1, intended) && scored.length > 0;
  if (made >= 1 && !wantMore) return { pass: true };
  if (rng() < L.fumble || !scored.length) {
    const pick = hidden[Math.floor(rng() * hidden.length) % hidden.length];
    return { index: pick.index };
  }
  // Ties among the strongest links are broken at random so bots don't read
  // the board left-to-right.
  const top = scored.filter((s) => s.score === scored[0].score);
  return { index: top[Math.floor(rng() * top.length) % top.length].index };
}

// Best pointer for a crew bot that is helping human crew mates (no guess).
export function bestPointer(board, clue) {
  let best = null;
  board.forEach((t) => {
    if (t.revealed) return;
    const score = association(clue.word, t.word);
    if (score > 0 && (!best || score > best.score)) best = { index: t.index, score };
  });
  return best ? best.index : null;
}
