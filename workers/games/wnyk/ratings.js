// Card-rating cluster for Well, Now You Know — its own seam beside rules.js so
// the rules file stays under the global cap. Owns the in-game side of crowd
// curation (spec AI/cah/RULES.md §5b, revised 2026-07-20 to 👎-only): stable
// rate-key derivation, the down-only `rate` action (the downvote and the
// dump-and-replace are the SAME act), the passive per-game dealt/played
// counters (a card repeatedly dealt but never played is quiet negative
// signal — playing a card is the implicit upvote, so there is no 👍 control),
// the anonymous aggregate on game.new_card_ratings, and the removed-card
// exclusion set for dealing. Lifetime tallies and the removal threshold live
// upstream in workers/card-ratings.js — the engine records raw signal and
// receives the removed-card list as plain data; it never applies library
// policy. Pure logic, same contract as rules.js.

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

// Black-card rating key — its own `:b:` namespace so prompt tallies can never
// collide with white-card indexes. Prompts get NO implicit up-vote: they must
// be played once drawn, so surviving a round means nothing — black entries
// carry played:0 forever and the store's down − played formula degrades to a
// downs-only threshold for them.
export function wnykBlackCardKey(deckKey, index) {
  return Number.isInteger(index) ? `${deckKey}:b:${index}` : null;
}

export function wnykBlackRateKey(game) {
  return game.black_card ? wnykBlackCardKey(game.options.deck, game.black_card.i) : null;
}

// The `rate` action — 👎-only, and the downvote IS the dump: the card must be
// in the actor's hand, it discards into nowhere (the played-card convention)
// and the same slot refills through the injected drawCard, i.e. the normal
// draw path (5% blank chance, third-win pending blank, removed-card
// exclusion, pile rebuild on exhaustion). ONCE PER ROUND per player
// (seat.dump_used, reset when the round advances) and irreversible — there is
// no retract, switch, or upvote. A re-drawn copy of an already-downvoted card
// may be downvoted (dumped) again in a later round, but the seat's ratings
// map keeps ONE counted vote per card per player per game. PRIVATE by
// design: never touches move_count/last_move/events (all public), so no other
// seat can see a rating happened — the vote lives on the actor's seat
// (sanitizer strips it for every other viewer) and in the anonymous
// aggregate. The draw runs BEFORE the slot is overwritten, so a pile rebuild
// mid-draw still sees the dumped card as held and cannot deal it straight
// back. (Accepted tell: the public draw_count shrinks by one — hands
// themselves stay private.)
export function applyWnykRate(game, mark, action, extras = {}) {
  const seat = game.players[mark];
  const vote = action && action.vote !== undefined ? action.vote : "down";
  if (vote !== "down") throw new Error("Rating is thumbs-down only — playing a card is the upvote.");
  const key = cleanWnykRateKey(action && action.card);
  const handIndex = key ? seat.hand.findIndex((ref) => wnykRateCardKey(game, ref) === key) : -1;
  if (handIndex === -1) throw new Error("Downvote a card from your own hand.");
  if (seat.dump_used) throw new Error("One downvote per round — yours is spent until the next round.");
  seat.ratings[key] = "down";
  seat.dump_used = true;
  if (typeof extras.drawCard === "function") seat.hand[handIndex] = extras.drawCard();
  else seat.hand.splice(handIndex, 1);
  recountWnykCardRatings(game);
}

// Passive usage counters (spec §5b): +1 dealt every time a draw lands the
// card in a HUMAN hand (initial deal, refills, dump replacements — a card
// sitting in hand across rounds is one deal), +1 played every time a human
// submits it (both cards of a pick-2 count). Bot hands are excluded from both:
// bots draw and play at random, which is noise, not the human "seen it /
// chose it" signal curation wants. Blanks and write-ins key as null → never
// counted. Callers recount the aggregate after a batch.
export function wnykCountCardStat(game, ref, field) {
  wnykCountKeyStat(game, wnykRateCardKey(game, ref), field);
}

export function wnykCountKeyStat(game, key, field) {
  if (!key) return;
  if (!game.card_stats || typeof game.card_stats !== "object" || Array.isArray(game.card_stats)) {
    game.card_stats = {};
  }
  const entry = game.card_stats[key] || (game.card_stats[key] = { dealt: 0, played: 0 });
  entry[field] += 1;
}

// Rebuild the anonymous per-game aggregate ([{ card, down, dealt, played }],
// sorted by key for determinism) that orchestration merges into the lifetime
// store at game resolution. Every dealt/played card appears even with zero
// downvotes — "dealt but never played" is exactly the signal the store wants.
// No per-player attribution ever leaves the seats.
export function recountWnykCardRatings(game) {
  const tally = new Map();
  const entryFor = (key) => {
    let entry = tally.get(key);
    if (!entry) { entry = { card: key, down: 0, dealt: 0, played: 0 }; tally.set(key, entry); }
    return entry;
  };
  game.seat_order.forEach((mark) => {
    Object.keys(game.players[mark].ratings).forEach((key) => { entryFor(key).down += 1; });
  });
  Object.keys(game.card_stats || {}).forEach((key) => {
    const stats = game.card_stats[key];
    const entry = entryFor(key);
    entry.dealt = stats.dealt;
    entry.played = stats.played;
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
    // Down-only since the 2026-07-20 revision; stray "up" entries from older
    // states drop here.
    if (clean && value[key] === "down") ratings[clean] = "down";
  });
  return ratings;
}

export function normalizeWnykCardStats(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const stats = {};
  Object.keys(value).slice(0, 2000).forEach((key) => {
    const clean = cleanWnykRateKey(key);
    const entry = value[key];
    if (!clean || !entry || typeof entry !== "object") return;
    stats[clean] = {
      dealt: Math.max(0, Math.floor(Number(entry.dealt) || 0)),
      played: Math.max(0, Math.floor(Number(entry.played) || 0)),
    };
  });
  return stats;
}

// Lifetime usage map ({card key → lifetime dealt count}) — plain data handed
// in at creation (the worker entry sources it from the card-ratings store at
// wiring time). Drives black-pile draw priority: lowest lifetime dealt first.
// Empty/absent = all zeros = pure shuffle.
export function normalizeWnykCardUsage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const usage = {};
  Object.keys(value).slice(0, 10000).forEach((key) => {
    const clean = cleanWnykRateKey(key);
    const count = Math.floor(Number(value[key]));
    if (clean && Number.isFinite(count) && count > 0) usage[clean] = count;
  });
  return usage;
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
      down: Math.max(0, Math.floor(Number(entry.down) || 0)),
      dealt: Math.max(0, Math.floor(Number(entry.dealt) || 0)),
      played: Math.max(0, Math.floor(Number(entry.played) || 0)),
    }))
    .slice(0, 2000);
}
