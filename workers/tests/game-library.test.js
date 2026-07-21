// Game↔card-library composition (workers/game-library.js): creation-time
// inputs gathering, resolution-time harvest (drain-once idempotence), and the
// rating-driven retire of a library custom card — the one cross-store behavior,
// composed here rather than by leaf-to-leaf imports.
import assert from "node:assert/strict";
import test from "node:test";
import { gameLibraryStartInputs, harvestGameLibrary } from "../game-library.js";
import { appendCustomCards, listActiveCustomCards, listAllCustomCards } from "../custom-cards.js";
import { applyCardRatings, listRemovedCards } from "../card-ratings.js";

function freshData() {
  return { custom_cards: [], card_ratings: {} };
}

test("start inputs: active customs, removed keys, and usage map as plain data", () => {
  const data = freshData();
  const [kept, gone] = appendCustomCards(data, [
    { text: "A suspicious goose.", author: "SOGO" },
    { text: "The plunger of destiny.", author: "Grammy" },
  ], { roomCode: "WNYK1" });
  gone.retired = true;
  applyCardRatings(data, [
    { card: "classic:7", down: 4, dealt: 9, played: 1 }, // net −3 → removed
    { card: "family:2", down: 1, dealt: 5, played: 3 },
  ]);
  const inputs = gameLibraryStartInputs(data);
  assert.deepEqual(inputs.custom_cards, [{ id: kept.id, text: kept.text, author: "SOGO" }]);
  assert.deepEqual(inputs.removed_cards, ["classic:7"]);
  assert.equal(inputs.card_usage["classic:7"], 9);
  assert.equal(inputs.card_usage["family:2"], 5);
});

test("harvest: banks write-ins + ratings once, draining the game arrays", () => {
  const data = freshData();
  const room = {
    code: "WNYK9",
    game: {
      status: "complete",
      new_custom_cards: [{ text: "Grandpa's secret sauce.", author: "Kramer" }],
      new_card_ratings: [{ card: "classic:3", down: 1, dealt: 4, played: 2 }],
    },
  };
  harvestGameLibrary(data, room);
  assert.equal(listActiveCustomCards(data).length, 1);
  assert.equal(listActiveCustomCards(data)[0].source_room, "WNYK9");
  assert.equal(data.card_ratings["classic:3"].dealt, 4);
  assert.deepEqual(room.game.new_custom_cards, []);
  assert.deepEqual(room.game.new_card_ratings, []);
  // Second call is a no-op (drained arrays) — nothing double counts.
  harvestGameLibrary(data, room);
  assert.equal(listActiveCustomCards(data).length, 1);
  assert.equal(data.card_ratings["classic:3"].dealt, 4);
});

test("harvest: an unfinished game is untouched (recounts would double count)", () => {
  const data = freshData();
  const room = {
    code: "WNYK9",
    game: { status: "playing", new_card_ratings: [{ card: "classic:3", down: 1, dealt: 1, played: 0 }] },
  };
  harvestGameLibrary(data, room);
  assert.deepEqual(data.card_ratings, {});
  assert.equal(room.game.new_card_ratings.length, 1);
});

test("harvest: a rating-removed custom:<id> key retires the library card", () => {
  const data = freshData();
  const [card] = appendCustomCards(data, [{ text: "A worm named Greg.", author: "SOGO" }], { roomCode: "WNYK1" });
  const room = {
    code: "WNYK2",
    game: {
      status: "complete",
      new_custom_cards: [],
      new_card_ratings: [{ card: `custom:${card.id}`, down: 3, dealt: 3, played: 0 }],
    },
  };
  harvestGameLibrary(data, room);
  assert.deepEqual(listRemovedCards(data), [`custom:${card.id}`]);
  assert.equal(listActiveCustomCards(data).length, 0, "removed custom card is retired from the deck-merge pool");
  assert.equal(listAllCustomCards(data)[0].retired, true, "retired, not deleted — attribution survives");
});

test("no-op on rooms/games without the library contract fields", () => {
  const data = freshData();
  harvestGameLibrary(data, null);
  harvestGameLibrary(data, { code: "X" });
  harvestGameLibrary(data, { code: "X", game: { status: "complete" } });
  assert.deepEqual(data.custom_cards, []);
  assert.deepEqual(data.card_ratings, {});
});
