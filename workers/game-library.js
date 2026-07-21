// Game↔card-library composition — the one place the custom-cards and
// card-ratings stores meet (placement receipt 2026-07-20: the two leaf stores
// must never import each other; the Worker entry calls this NAMED composer
// instead of growing library bookkeeping inline). GAME-AGNOSTIC by charter:
// no workers/games/* imports, no game-id checks — it speaks only the generic
// contract fields a game may expose (`game.new_custom_cards`,
// `game.new_card_ratings`, and the start-option inputs `custom_cards` /
// `removed_cards` / `card_usage`); a game without them is a no-op. Pure
// functions over passed-in state — the entry's default save persists.
// Declared ban (docs/module-ownership.md): must not import
// workers/sogotable-api.js.
import { listActiveCustomCards, appendCustomCards, retireCustomCard } from "./custom-cards.js";
import { listRemovedCards, applyCardRatings, listAllCardRatings } from "./card-ratings.js";

// Rating keys that name a library custom card ("custom:<id>") — the one
// namespace whose removal must also flip the custom-card retire flag.
const CUSTOM_KEY_PREFIX = "custom:";

// Creation-side inputs, as plain data for a game's applyStartOptions seam:
// the active write-in library, the rating-removed exclusion keys, and the
// lifetime per-card deal counts that drive lowest-usage-first pile ordering.
// Server-derived — the entry spreads these LAST over the client's start
// payload so a client can never spoof its own library.
export function gameLibraryStartInputs(data) {
  const cardUsage = {};
  listAllCardRatings(data).forEach((row) => { cardUsage[row.card] = row.dealt; });
  return {
    custom_cards: listActiveCustomCards(data).map((card) => ({ id: card.id, text: card.text, author: card.author })),
    removed_cards: listRemovedCards(data),
    card_usage: cardUsage,
  };
}

// Resolution-side harvest: bank a finished game's write-ins and rating
// aggregates into the durable stores, and retire any custom card whose key
// newly crossed the removal threshold. Once-only by construction: the game
// arrays are DRAINED as they persist (stats_recorded idempotence pattern) and
// the harvest only runs on a complete game — games recompute
// new_card_ratings while play continues, so draining earlier would double
// count on the next recount. Safe to call from every resolution site.
export function harvestGameLibrary(data, room) {
  const game = room && room.game;
  if (!game || game.status !== "complete") return;
  if (Array.isArray(game.new_custom_cards) && game.new_custom_cards.length) {
    appendCustomCards(data, game.new_custom_cards, { roomCode: room.code });
    game.new_custom_cards = [];
  }
  if (Array.isArray(game.new_card_ratings) && game.new_card_ratings.length) {
    const newlyRemoved = applyCardRatings(data, game.new_card_ratings);
    game.new_card_ratings = [];
    newlyRemoved.forEach((key) => {
      if (key.startsWith(CUSTOM_KEY_PREFIX)) retireCustomCard(data, key.slice(CUSTOM_KEY_PREFIX.length));
    });
  }
}
