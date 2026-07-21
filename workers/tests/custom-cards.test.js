// Custom-card library store (workers/custom-cards.js) exercised directly as pure
// functions over a plain state blob — append / list active vs all / retire /
// unretire. Retire ≠ delete: attribution history must survive curation.
import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureCustomCards,
  appendCustomCards,
  listActiveCustomCards,
  listAllCustomCards,
  retireCustomCard,
  unretireCustomCard,
} from "../custom-cards.js";

test("appendCustomCards: shapes, trims, and caps entries; skips invalid write-ins", () => {
  const data = {};
  const appended = appendCustomCards(
    data,
    [
      { text: "  Who ate the last slice?  ", author: "  Mojo  " },
      { text: "   ", author: "Nobody" }, // whitespace-only text: skipped
      { text: "" }, // empty text: skipped
      null, // non-object: skipped
      "just a string", // non-object: skipped
      { text: "x".repeat(200), author: "y".repeat(300) }, // over-cap: trimmed to limits
    ],
    { roomCode: "ABCD" },
  );

  assert.equal(appended.length, 2);
  assert.equal(data.custom_cards.length, 2);

  const first = appended[0];
  assert.equal(first.text, "Who ate the last slice?", "text is trimmed");
  assert.equal(first.author, "Mojo", "author is trimmed");
  assert.equal(first.source_room, "ABCD");
  assert.equal(first.retired, false);
  assert.ok(first.id, "entry gets an id");
  assert.ok(first.created_at > 0, "entry gets a timestamp");
  assert.deepEqual(
    Object.keys(first).sort(),
    ["author", "created_at", "id", "retired", "source_room", "text"],
    "entry carries exactly the declared shape",
  );

  const capped = appended[1];
  assert.equal(capped.text.length, 80, "text caps at 80 chars");
  assert.equal(capped.author.length, 120, "author caps sanely");
});

test("appendCustomCards: initialises a state blob with no custom_cards key yet", () => {
  const data = { bug_reports: [] }; // pre-existing blob that predates the store
  const appended = appendCustomCards(data, [{ text: "First ever card", author: "A" }], { roomCode: "WXYZ" });
  assert.equal(appended.length, 1);
  assert.ok(Array.isArray(data.custom_cards), "store array is created on demand");
  assert.equal(data.custom_cards[0].text, "First ever card");
  // Nothing valid (or no array at all) appends nothing but still leaves a store.
  assert.deepEqual(appendCustomCards({}, "not-an-array"), []);
  assert.deepEqual(ensureCustomCards({}), []);
});

test("appendCustomCards: ids are unique across a batch", () => {
  const data = {};
  const cards = Array.from({ length: 50 }, (_, i) => ({ text: `Card ${i}`, author: "A" }));
  const appended = appendCustomCards(data, cards, { roomCode: "ROOM" });
  assert.equal(appended.length, 50);
  assert.equal(new Set(appended.map((c) => c.id)).size, 50, "every id is distinct");
});

test("retire hides a card from the active list; unretire restores it; history survives", () => {
  const data = {};
  const [a, b] = appendCustomCards(
    data,
    [
      { text: "Keep me", author: "A" },
      { text: "Retire me", author: "B" },
    ],
    { roomCode: "ROOM" },
  );

  assert.equal(listActiveCustomCards(data).length, 2);
  assert.equal(listAllCustomCards(data).length, 2);

  // Retire: gone from the deck-merge pool, still in the library with attribution.
  assert.equal(retireCustomCard(data, b.id), true);
  const active = listActiveCustomCards(data);
  assert.deepEqual(active.map((c) => c.id), [a.id], "retired card excluded from active");
  const all = listAllCustomCards(data);
  assert.equal(all.length, 2, "retire is not delete");
  assert.equal(all.find((c) => c.id === b.id).author, "B", "attribution survives retirement");

  // Unretire: back in the pool.
  assert.equal(unretireCustomCard(data, b.id), true);
  assert.equal(listActiveCustomCards(data).length, 2);

  // Unknown ids flip nothing.
  assert.equal(retireCustomCard(data, "nope"), false);
  assert.equal(unretireCustomCard(data, "nope"), false);
  // Lists on a blob with no store are empty, not throwing.
  assert.deepEqual(listActiveCustomCards({}), []);
  assert.deepEqual(listAllCustomCards({}), []);
});
