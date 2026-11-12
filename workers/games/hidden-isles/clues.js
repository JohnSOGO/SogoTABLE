// Hidden Isles — clue language: normalising, legality, and word association.
//
// Pure (no DOM, fetch, storage or timers). rules.js is the only caller that
// DECIDES legality (clueProblem); ai.js only uses the association helpers to
// score. The client never checks clues — it shows the server's rejection.
import { WORDS } from "./words.js";
import { TAG_ALIASES } from "./aliases.js";

const WORD_TAGS = new Map(WORDS.map((entry) => [entry.word, new Set(entry.tags)]));
const ALL_TAGS = new Set(WORDS.flatMap((entry) => entry.tags));

export function wordTags(word) {
  return WORD_TAGS.get(String(word || "").toLowerCase()) || new Set();
}

export function allTags() {
  return [...ALL_TAGS].sort();
}

// "Cats" → "cat", "boxes" → "box". Crude on purpose: it only has to catch the
// obvious plural dodge ("APPLES" for APPLE) and help match aliases.
export function stem(word) {
  const w = String(word || "").toLowerCase();
  if (w.length > 4 && /(ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

// Returns the cleaned clue, or throws a player-readable Error.
export function normalizeClue(raw) {
  const text = String(raw == null ? "" : raw).trim().toLowerCase().replace(/[’`]/g, "'");
  if (!text) throw new Error("Type a one-word clue first.");
  if (/\s/.test(text)) throw new Error("Clues are one word only — no spaces.");
  if (!/^[a-z][a-z'-]*[a-z]$/.test(text)) throw new Error("Use letters only (a hyphen or apostrophe inside a word is fine).");
  if (text.length < 2 || text.length > 20) throw new Error("Clues must be 2–20 letters long.");
  return text;
}

function clash(clue, word) {
  const a = clue.replace(/['-]/g, "");
  const b = String(word || "").toLowerCase();
  if (a === b || stem(a) === stem(b)) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.includes(short);
}

// The clue may not be (or contain, or sit inside) any word still face-down.
// Returns the clashing board word, or null when the clue is legal.
export function clueProblem(clue, unrevealedWords) {
  for (const word of unrevealedWords) {
    if (clash(clue, word)) return word;
  }
  return null;
}

// Canonical tags a clue word points at: the word itself if it is a tag, its
// singular, and any alias targets.
export function clueTags(clue) {
  const c = String(clue || "").toLowerCase().replace(/['-]/g, "");
  const out = new Set();
  [c, stem(c)].forEach((form) => {
    if (ALL_TAGS.has(form)) out.add(form);
    const alias = TAG_ALIASES[form];
    if (Array.isArray(alias)) alias.forEach((t) => { if (ALL_TAGS.has(t)) out.add(t); });
  });
  return out;
}

// How strongly a clue points at a board word: 2 = a direct tag hit,
// 1 = the clue is one of the word's tags' aliases only, 0 = no link.
export function association(clue, word) {
  const tags = wordTags(word);
  if (!tags.size) return 0;
  const c = String(clue || "").toLowerCase();
  if (tags.has(c) || tags.has(stem(c))) return 2;
  for (const t of clueTags(c)) if (tags.has(t)) return 1;
  return 0;
}
