// Card-rating cluster for Well, Now You Know — its own seam beside rules.js so
// the rules file stays under the global cap. Owns the in-game side of crowd
// curation (spec AI/cah/RULES.md §5b): stable rate-key derivation, the private
// `rate` action, the per-game aggregate on game.new_card_ratings, and the
// removed-card exclusion set for dealing. Lifetime tallies and the removal
// threshold live upstream in workers/card-ratings.js — the engine records raw
// votes and receives the removed-card list as plain data; it never applies
// library policy. Pure logic, same contract as rules.js.

const RATE_KEY_LIMIT = 60;
const REMOVED_CARDS_LIMIT = 5000;

export function cleanWnykRateKey(value) {
  return String(value || "").trim().slice(0, RATE_KEY_LIMIT);
}

// Stable cross-game rating key for a hand-card ref, or null when the card is
// not rateable. Standard deck cards key as `<deck>:<index>` (stable while
// decks.js is not regenerated with different packs — see the card-ratings
// store header); library custom cards as `custom:<library id>` (the prefix
// lets orchestration route a removal to retireCustomCard). Blanks and fresh
// write-ins are not rateable — a write-in is judged by the table, not thumbed.
export function wnykRateCardKey(game, ref) {
  if (!ref || typeof ref !== "object") return null;
  if (ref.i !== undefined) return `${game.options.deck}:${ref.i}`;
  if (ref.c !== undefined) {
    const card = game.custom_pool[ref.c];
    return card && card.id ? `custom:${card.id}` : null;
  }
  return null;
}

// The `rate` action. PRIVATE by design: it never touches move_count,
// last_move, or events (all public), so no other seat can even see that a
// rating happened — the vote lives only on the actor's seat (sanitizer strips
// it for every other viewer) and in the anonymous aggregate. Tap-to-toggle:
// the same vote again retracts, the opposite vote switches. A vote needs the
// card in the actor's hand; retract/switch stays legal after the card leaves
// the hand (one standing vote per card per player per game either way).
export function applyWnykRate(game, mark, action) {
  const seat = game.players[mark];
  const vote = action && (action.vote === "up" || action.vote === "down") ? action.vote : null;
  if (!vote) throw new Error('Rate a card "up" or "down".');
  const key = cleanWnykRateKey(action && action.card);
  const rateable = key && (seat.hand.some((ref) => wnykRateCardKey(game, ref) === key) || seat.ratings[key]);
  if (!rateable) throw new Error("Rate a card from your own hand.");
  if (seat.ratings[key] === vote) delete seat.ratings[key];
  else seat.ratings[key] = vote;
  recountWnykCardRatings(game);
}

// Rebuild the anonymous per-game aggregate ([{ card, up, down }], sorted by
// key for determinism) that orchestration merges into the lifetime store at
// game resolution. No per-player attribution ever leaves the seats.
export function recountWnykCardRatings(game) {
  const tally = new Map();
  game.seat_order.forEach((mark) => {
    const ratings = game.players[mark].ratings;
    Object.keys(ratings).forEach((key) => {
      const entry = tally.get(key) || { card: key, up: 0, down: 0 };
      entry[ratings[key] === "up" ? "up" : "down"] += 1;
      tally.set(key, entry);
    });
  });
  game.new_card_ratings = [...tally.values()].sort((a, b) => (a.card < b.card ? -1 : 1));
}

export function wnykRemovedSet(game) {
  return new Set(game.removed_cards);
}

export function normalizeWnykSeatRatings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const ratings = {};
  Object.keys(value).slice(0, 200).forEach((key) => {
    const clean = cleanWnykRateKey(key);
    if (clean && (value[key] === "up" || value[key] === "down")) ratings[clean] = value[key];
  });
  return ratings;
}

export function normalizeWnykRemovedCards(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanWnykRateKey).filter(Boolean))].slice(0, REMOVED_CARDS_LIMIT);
}

export function normalizeWnykNewCardRatings(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => entry && typeof entry === "object" && cleanWnykRateKey(entry.card))
    .map((entry) => ({
      card: cleanWnykRateKey(entry.card),
      up: Math.max(0, Math.floor(Number(entry.up) || 0)),
      down: Math.max(0, Math.floor(Number(entry.down) || 0)),
    }))
    .slice(0, 2000);
}
