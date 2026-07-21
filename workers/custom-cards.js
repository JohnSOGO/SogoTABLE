// Custom-card library store — a zero-fan-in leaf owning the shape and lifecycle of
// the durable data.custom_cards array (append / list / retire attributed write-in
// cards). Player write-ins become PERMANENT cross-room cards merged into future
// decks; retiring hides a card from deck merges but never deletes it, so
// attribution history survives. Pure functions over the passed-in state: they
// mutate data.custom_cards in place and return plain values, but never persist —
// the Worker entry's default save handles that. Declared ban (enforced by
// docs/module-ownership.md): this module must not import workers/sogotable-api.js —
// no storage/DB access, no fetch, no transport; callers pass state in.

// Field limits the store enforces on (untrusted) write-in payloads.
const CARD_TEXT_LIMIT = 80;
const CARD_AUTHOR_LIMIT = 120;

// Ensure the store exists on a state blob that predates it; returns the live array.
export function ensureCustomCards(data) {
  if (!Array.isArray(data.custom_cards)) data.custom_cards = [];
  return data.custom_cards;
}

// Append validated write-in cards. `cards` entries are (untrusted) { text, author }
// pairs; invalid entries (non-object, empty/whitespace text) are skipped, not fatal —
// one bad write-in must not drop the rest of the batch. Text and author are trimmed
// and capped with the exact limits the store enforces. Returns the entries actually
// appended (empty array when nothing was valid). Mutating (persists via the entry's
// default save).
export function appendCustomCards(data, cards, { roomCode } = {}) {
  const store = ensureCustomCards(data);
  const appended = [];
  for (const card of Array.isArray(cards) ? cards : []) {
    if (!card || typeof card !== "object") continue;
    const text = String(card.text || "").trim().slice(0, CARD_TEXT_LIMIT);
    if (!text) continue;
    const entry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      author: String(card.author || "").trim().slice(0, CARD_AUTHOR_LIMIT),
      created_at: Date.now(),
      source_room: String(roomCode || "").slice(0, 12),
      retired: false,
    };
    store.push(entry);
    appended.push(entry);
  }
  return appended;
}

// Non-retired cards only — the set merged into a new room's deck at creation.
export function listActiveCustomCards(data) {
  return ensureCustomCards(data).filter((card) => !card.retired);
}

// Every card, retired included — for admin curation (retire ≠ delete).
export function listAllCustomCards(data) {
  return ensureCustomCards(data);
}

// Flip a card's retired flag by id; false when no such card. Mutating (persists
// via the entry's default save).
function setCustomCardRetired(data, id, retired) {
  const card = ensureCustomCards(data).find((c) => String(c.id) === String(id));
  if (!card) return false;
  card.retired = retired;
  return true;
}

// Hide a card from future deck merges without deleting it.
export function retireCustomCard(data, id) {
  return setCustomCardRetired(data, id, true);
}

// Restore a retired card to the active deck-merge pool.
export function unretireCustomCard(data, id) {
  return setCustomCardRetired(data, id, false);
}
