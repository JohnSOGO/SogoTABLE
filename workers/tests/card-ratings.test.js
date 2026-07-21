import assert from "node:assert/strict";
import test from "node:test";
import {
  REMOVAL_NET_THRESHOLD, ensureCardRatings, applyCardRatings,
  listRemovedCards, clearCardRemoval, listAllCardRatings,
} from "../card-ratings.js";

test("applyCardRatings: tallies merge across applications", () => {
  const data = {};
  applyCardRatings(data, [{ card: "classic:1", up: 2, down: 1 }]);
  applyCardRatings(data, [{ card: "classic:1", up: 1, down: 1 }, { card: "family:9", up: 0, down: 1 }]);
  assert.deepEqual(data.card_ratings["classic:1"], { up: 3, down: 2, threshold_base: 0 });
  assert.deepEqual(data.card_ratings["family:9"], { up: 0, down: 1, threshold_base: 0 });
});

test("applyCardRatings: a threshold crossing is reported exactly once", () => {
  const data = {};
  assert.deepEqual(applyCardRatings(data, [{ card: "classic:7", up: 0, down: REMOVAL_NET_THRESHOLD - 1 }]), []);
  assert.deepEqual(applyCardRatings(data, [{ card: "classic:7", up: 0, down: 1 }]), ["classic:7"]);
  // Already removed — more downvotes must not re-report it.
  assert.deepEqual(applyCardRatings(data, [{ card: "classic:7", up: 0, down: 5 }]), []);
  assert.deepEqual(listRemovedCards(data), ["classic:7"]);
});

test("applyCardRatings: upvotes offset — net decides, not raw downs", () => {
  const data = {};
  assert.deepEqual(applyCardRatings(data, [{ card: "classic:3", up: 4, down: 6 }]), []);
  assert.deepEqual(listRemovedCards(data), []);
  assert.deepEqual(applyCardRatings(data, [{ card: "classic:3", up: 0, down: 1 }]), ["classic:3"]);
});

test("clearCardRemoval: resurrect rebases — history kept, fresh net required again", () => {
  const data = {};
  applyCardRatings(data, [{ card: "custom:abc", up: 1, down: 4 }]);
  assert.deepEqual(listRemovedCards(data), ["custom:abc"]);
  assert.equal(clearCardRemoval(data, "custom:abc"), true);
  assert.deepEqual(listRemovedCards(data), []);
  // Tally history intact, base rebased to the current net.
  assert.deepEqual(data.card_ratings["custom:abc"], { up: 1, down: 4, threshold_base: 3 });
  // One more down is not enough after the rebase…
  assert.deepEqual(applyCardRatings(data, [{ card: "custom:abc", up: 0, down: 1 }]), []);
  assert.deepEqual(listRemovedCards(data), []);
  // …a further net −REMOVAL_NET_THRESHOLD removes (and re-reports) it.
  assert.deepEqual(applyCardRatings(data, [{ card: "custom:abc", up: 0, down: 2 }]), ["custom:abc"]);
  assert.deepEqual(listRemovedCards(data), ["custom:abc"]);
});

test("clearCardRemoval: unknown or not-removed keys return false", () => {
  const data = {};
  applyCardRatings(data, [{ card: "classic:1", up: 1, down: 0 }]);
  assert.equal(clearCardRemoval(data, "classic:1"), false);
  assert.equal(clearCardRemoval(data, "nope"), false);
});

test("input hygiene: invalid entries skip, junk clamps, blob without the key initialises", () => {
  const data = {};
  assert.deepEqual(ensureCardRatings(data), {});
  const removed = applyCardRatings(data, [
    null, "junk", { up: 3, down: 3 }, { card: "", up: 1, down: 1 },
    { card: "classic:2", up: -5, down: "4" }, { card: "classic:9", up: 0, down: 0 },
  ]);
  assert.deepEqual(removed, ["classic:2"]);
  assert.deepEqual(Object.keys(data.card_ratings), ["classic:2"]);
  assert.deepEqual(data.card_ratings["classic:2"], { up: 0, down: 4, threshold_base: 0 });
  applyCardRatings({ card_ratings: "corrupt" }, []); // non-object store re-initialises, no throw
  assert.deepEqual(applyCardRatings(data, "not-an-array"), []);
});

test("listAllCardRatings: curation view sees every tally with its removed flag", () => {
  const data = {};
  applyCardRatings(data, [{ card: "a", up: 5, down: 1 }, { card: "b", up: 0, down: 3 }]);
  assert.deepEqual(listAllCardRatings(data), [
    { card: "a", up: 5, down: 1, removed: false },
    { card: "b", up: 0, down: 3, removed: true },
  ]);
});
