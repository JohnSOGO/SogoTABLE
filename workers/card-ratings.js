// Card-rating store — a zero-fan-in leaf owning the durable data.card_ratings
// map: per-card usage tallies (👎 downvotes plus passive dealt/played counts —
// spec AI/cah/RULES.md §5b, revised 2026-07-20 to 👎-only: playing a card is
// the implicit upvote, so a card's positive signal is its played count) and
// the net-threshold removal decisions that curate the deck across games. Keys
// are OPAQUE strings derived by the game engine (per-deck+index for standard
// cards, the library id for custom cards) — this store never interprets them.
// Stability caveat: per-deck+index keys are only stable while decks.js is not
// regenerated with different pack filtering; re-running build-wnyk-decks.mjs
// with changed packs invalidates standard-card tallies. Pure functions over
// the passed-in state: they mutate data.card_ratings in place and return
// plain values, but never persist — the Worker entry's default save handles
// that. Declared ban (enforced by docs/module-ownership.md): this module must
// not import workers/sogotable-api.js — no storage/DB access, no fetch, no
// transport, and no import of workers/custom-cards.js either: a removal that
// names a custom card is flipped to `retired` by ORCHESTRATION composing the
// two stores.
//
// Removal semantics: a card is removed while (down − played) − threshold_base
// ≥ REMOVAL_NET_THRESHOLD — derived from the tallies, never stored. Being
// played offsets downvotes; `dealt` is recorded as curation signal ("dealt
// but never played") but does not enter the removal formula. Resurrecting a
// card (clearCardRemoval) keeps its full tally history and REBASES
// threshold_base to the current net, so the card returns to the deck and
// needs a further net −REMOVAL_NET_THRESHOLD from that moment to be removed
// again.

// Curation policy owned by this store (net downvotes-over-plays that remove a card).
export const REMOVAL_NET_THRESHOLD = 3;

const CARD_KEY_LIMIT = 60;
const VOTES_PER_APPLY_LIMIT = 1000;

function cleanCardKey(value) {
  return String(value || "").trim().slice(0, CARD_KEY_LIMIT);
}

function clampCount(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), VOTES_PER_APPLY_LIMIT) : 0;
}

function isRemoved(entry) {
  return entry.down - entry.played - entry.threshold_base >= REMOVAL_NET_THRESHOLD;
}

// Ensure the store exists on a state blob that predates it; returns the live
// map. Entries from the pre-revision {up, down} shape gain zeroed dealt/played
// lazily as they are next touched (applyCardRatings) — readers treat missing
// fields as 0 via the entry upgrade there.
export function ensureCardRatings(data) {
  if (!data.card_ratings || typeof data.card_ratings !== "object" || Array.isArray(data.card_ratings)) {
    data.card_ratings = {};
  }
  return data.card_ratings;
}

function liveEntry(store, key) {
  const entry = store[key] || (store[key] = { down: 0, dealt: 0, played: 0, threshold_base: 0 });
  // Upgrade pre-revision {up, down} entries in place: dropped `up` (the 👍
  // control no longer exists), zero the new counters.
  if (entry.dealt === undefined) entry.dealt = 0;
  if (entry.played === undefined) entry.played = 0;
  if (entry.threshold_base === undefined) entry.threshold_base = 0;
  delete entry.up;
  return entry;
}

// Merge one game's aggregate (game.new_card_ratings entries — untrusted
// { card, down, dealt, played }) into the lifetime tallies. Invalid entries
// are skipped, not fatal. Returns the keys that NEWLY crossed the removal
// threshold with this application (already-removed cards are not re-reported),
// so orchestration can flip custom-card retire flags. Mutating (persists via
// the entry's default save).
export function applyCardRatings(data, ratings) {
  const store = ensureCardRatings(data);
  const newlyRemoved = [];
  for (const rating of Array.isArray(ratings) ? ratings : []) {
    if (!rating || typeof rating !== "object") continue;
    const key = cleanCardKey(rating.card);
    if (!key) continue;
    const down = clampCount(rating.down);
    const dealt = clampCount(rating.dealt);
    const played = clampCount(rating.played);
    if (!down && !dealt && !played) continue;
    const entry = liveEntry(store, key);
    const removedBefore = isRemoved(entry);
    entry.down += down;
    entry.dealt += dealt;
    entry.played += played;
    if (!removedBefore && isRemoved(entry)) newlyRemoved.push(key);
  }
  return newlyRemoved;
}

// Keys currently removed from deck building — the exclusion list passed into
// room creation as plain data.
export function listRemovedCards(data) {
  const store = ensureCardRatings(data);
  return Object.keys(store).filter((key) => isRemoved(liveEntry(store, key)));
}

// Admin curation (resurrect): return a removed card to the deck without
// touching its tally history — threshold_base rebases to the current net, so
// only a further net −REMOVAL_NET_THRESHOLD removes it again. False when the
// key is unknown or not currently removed. Mutating (persists via the entry's
// default save).
export function clearCardRemoval(data, key) {
  const store = ensureCardRatings(data);
  const clean = cleanCardKey(key);
  if (!store[clean]) return false;
  const entry = liveEntry(store, clean);
  if (!isRemoved(entry)) return false;
  entry.threshold_base = entry.down - entry.played;
  return true;
}

// Every tally, removed or not — for the future admin curation view.
export function listAllCardRatings(data) {
  const store = ensureCardRatings(data);
  return Object.keys(store).map((key) => {
    const entry = liveEntry(store, key);
    return {
      card: key,
      down: entry.down,
      dealt: entry.dealt,
      played: entry.played,
      removed: isRemoved(entry),
    };
  });
}
