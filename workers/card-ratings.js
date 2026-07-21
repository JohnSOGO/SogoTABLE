// Card-rating store — a zero-fan-in leaf owning the durable data.card_ratings
// map: per-card 👍/👎 vote tallies and the net-threshold removal decisions that
// curate the deck across games (spec AI/cah/RULES.md §5b). Keys are OPAQUE
// strings derived by the game engine (per-deck+index for standard cards, the
// library id for custom cards) — this store never interprets them. Stability
// caveat: per-deck+index keys are only stable while decks.js is not regenerated
// with different pack filtering; re-running build-wnyk-decks.mjs with changed
// packs invalidates standard-card tallies. Pure functions over the passed-in
// state: they mutate data.card_ratings in place and return plain values, but
// never persist — the Worker entry's default save handles that. Declared ban
// (enforced by docs/module-ownership.md): this module must not import
// workers/sogotable-api.js — no storage/DB access, no fetch, no transport, and
// no import of workers/custom-cards.js either: a removal that names a custom
// card is flipped to `retired` by ORCHESTRATION composing the two stores.
//
// Removal semantics: a card is removed while (down − up) − threshold_base ≥
// REMOVAL_NET_THRESHOLD — derived from the tallies, never stored. Resurrecting
// a card (clearCardRemoval) keeps its full tally history and REBASES
// threshold_base to the current net, so the card returns to the deck and needs
// a further net −REMOVAL_NET_THRESHOLD from that moment to be removed again.

// Curation policy owned by this store (net downvotes that remove a card).
export const REMOVAL_NET_THRESHOLD = 3;

const CARD_KEY_LIMIT = 60;
const VOTES_PER_APPLY_LIMIT = 1000;

function cleanCardKey(value) {
  return String(value || "").trim().slice(0, CARD_KEY_LIMIT);
}

function clampVotes(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), VOTES_PER_APPLY_LIMIT) : 0;
}

function isRemoved(entry) {
  return entry.down - entry.up - entry.threshold_base >= REMOVAL_NET_THRESHOLD;
}

// Ensure the store exists on a state blob that predates it; returns the live map.
export function ensureCardRatings(data) {
  if (!data.card_ratings || typeof data.card_ratings !== "object" || Array.isArray(data.card_ratings)) {
    data.card_ratings = {};
  }
  return data.card_ratings;
}

// Merge one game's aggregate ratings (game.new_card_ratings entries — untrusted
// { card, up, down }) into the lifetime tallies. Invalid entries are skipped,
// not fatal. Returns the keys that NEWLY crossed the removal threshold with
// this application (already-removed cards are not re-reported), so
// orchestration can flip custom-card retire flags. Mutating (persists via the
// entry's default save).
export function applyCardRatings(data, ratings) {
  const store = ensureCardRatings(data);
  const newlyRemoved = [];
  for (const rating of Array.isArray(ratings) ? ratings : []) {
    if (!rating || typeof rating !== "object") continue;
    const key = cleanCardKey(rating.card);
    if (!key) continue;
    const up = clampVotes(rating.up);
    const down = clampVotes(rating.down);
    if (!up && !down) continue;
    const entry = store[key] || (store[key] = { up: 0, down: 0, threshold_base: 0 });
    const removedBefore = isRemoved(entry);
    entry.up += up;
    entry.down += down;
    if (!removedBefore && isRemoved(entry)) newlyRemoved.push(key);
  }
  return newlyRemoved;
}

// Keys currently removed from deck building — the exclusion list passed into
// room creation as plain data.
export function listRemovedCards(data) {
  const store = ensureCardRatings(data);
  return Object.keys(store).filter((key) => isRemoved(store[key]));
}

// Admin curation (resurrect): return a removed card to the deck without
// touching its tally history — threshold_base rebases to the current net, so
// only a further net −REMOVAL_NET_THRESHOLD removes it again. False when the
// key is unknown or not currently removed. Mutating (persists via the entry's
// default save).
export function clearCardRemoval(data, key) {
  const store = ensureCardRatings(data);
  const entry = store[cleanCardKey(key)];
  if (!entry || !isRemoved(entry)) return false;
  entry.threshold_base = entry.down - entry.up;
  return true;
}

// Every tally, removed or not — for the future admin curation view.
export function listAllCardRatings(data) {
  const store = ensureCardRatings(data);
  return Object.keys(store).map((key) => ({
    card: key,
    up: store[key].up,
    down: store[key].down,
    removed: isRemoved(store[key]),
  }));
}
