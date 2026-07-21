import assert from "node:assert/strict";
import test from "node:test";
import {
  REMOVAL_NET_THRESHOLD, ensureCardRatings, applyCardRatings,
  listRemovedCards, clearCardRemoval, listAllCardRatings,
} from "../card-ratings.js";

test("applyCardRatings: tallies merge across applications", () => {
  const data = {};
  applyCardRatings(data, [{ card: "classic:1", down: 1, dealt: 3, played: 1 }]);
  applyCardRatings(data, [
    { card: "classic:1", down: 1, dealt: 2, played: 0 },
    { card: "family:9", down: 0, dealt: 4, played: 2 },
  ]);
  assert.deepEqual(data.card_ratings["classic:1"], { down: 2, dealt: 5, played: 1, threshold_base: 0 });
  assert.deepEqual(data.card_ratings["family:9"], { down: 0, dealt: 4, played: 2, threshold_base: 0 });
});

test("applyCardRatings: a threshold crossing is reported exactly once", () => {
  const data = {};
  assert.deepEqual(applyCardRatings(data, [{ card: "classic:7", down: REMOVAL_NET_THRESHOLD - 1, dealt: 2, played: 0 }]), []);
  assert.deepEqual(applyCardRatings(data, [{ card: "classic:7", down: 1, dealt: 1, played: 0 }]), ["classic:7"]);
  // Already removed — more downvotes must not re-report it.
  assert.deepEqual(applyCardRatings(data, [{ card: "classic:7", down: 5, dealt: 5, played: 0 }]), []);
  assert.deepEqual(listRemovedCards(data), ["classic:7"]);
});

test("applyCardRatings: plays offset downvotes — down − played decides, dealt never does", () => {
  const data = {};
  // 6 downs but 4 plays → net 2, stays.
  assert.deepEqual(applyCardRatings(data, [{ card: "classic:3", down: 6, dealt: 20, played: 4 }]), []);
  assert.deepEqual(listRemovedCards(data), []);
  // One more unplayed downvote crosses (dealt piling up changes nothing).
  assert.deepEqual(applyCardRatings(data, [{ card: "classic:3", down: 1, dealt: 50, played: 0 }]), ["classic:3"]);
});

test("clearCardRemoval: resurrect rebases — history kept, fresh net required again", () => {
  const data = {};
  applyCardRatings(data, [{ card: "custom:abc", down: 5, dealt: 6, played: 1 }]);
  assert.deepEqual(listRemovedCards(data), ["custom:abc"]);
  assert.equal(clearCardRemoval(data, "custom:abc"), true);
  assert.deepEqual(listRemovedCards(data), []);
  // Tally history intact, base rebased to the current net (5 − 1 = 4).
  assert.deepEqual(data.card_ratings["custom:abc"], { down: 5, dealt: 6, played: 1, threshold_base: 4 });
  // One more down is not enough after the rebase…
  assert.deepEqual(applyCardRatings(data, [{ card: "custom:abc", down: 1, dealt: 1, played: 0 }]), []);
  assert.deepEqual(listRemovedCards(data), []);
  // …a further net −REMOVAL_NET_THRESHOLD removes (and re-reports) it.
  assert.deepEqual(applyCardRatings(data, [{ card: "custom:abc", down: 2, dealt: 2, played: 0 }]), ["custom:abc"]);
  assert.deepEqual(listRemovedCards(data), ["custom:abc"]);
});

test("clearCardRemoval: unknown or not-removed keys return false", () => {
  const data = {};
  applyCardRatings(data, [{ card: "classic:1", down: 1, dealt: 1, played: 1 }]);
  assert.equal(clearCardRemoval(data, "classic:1"), false);
  assert.equal(clearCardRemoval(data, "nope"), false);
});

test("input hygiene: invalid entries skip, junk clamps, blob without the key initialises", () => {
  const data = {};
  assert.deepEqual(ensureCardRatings(data), {});
  const removed = applyCardRatings(data, [
    null, "junk", { down: 3, dealt: 3 }, { card: "", down: 1, dealt: 1 },
    { card: "classic:2", down: "4", dealt: -5, played: 1 }, { card: "classic:9", down: 0, dealt: 0, played: 0 },
  ]);
  assert.deepEqual(removed, ["classic:2"]);
  assert.deepEqual(Object.keys(data.card_ratings), ["classic:2"]);
  assert.deepEqual(data.card_ratings["classic:2"], { down: 4, dealt: 0, played: 1, threshold_base: 0 });
  applyCardRatings({ card_ratings: "corrupt" }, []); // non-object store re-initialises, no throw
  assert.deepEqual(applyCardRatings(data, "not-an-array"), []);
});

test("passive-only entries store: dealt-but-never-played is a recorded signal", () => {
  const data = {};
  assert.deepEqual(applyCardRatings(data, [{ card: "family:4", down: 0, dealt: 9, played: 0 }]), []);
  assert.deepEqual(data.card_ratings["family:4"], { down: 0, dealt: 9, played: 0, threshold_base: 0 });
  assert.deepEqual(listRemovedCards(data), []);
});

test("legacy {up, down} entries upgrade in place: up drops, counters zero", () => {
  const data = { card_ratings: { "classic:8": { up: 2, down: 4, threshold_base: 0 } } };
  // Legacy net (down − up) no longer applies: 4 downs, 0 plays → the card is
  // already over the revised threshold at upgrade time, so the touch does NOT
  // re-report it as a fresh crossing — but the removal list sees it.
  assert.deepEqual(applyCardRatings(data, [{ card: "classic:8", down: 0, dealt: 1, played: 0 }]), []);
  assert.deepEqual(data.card_ratings["classic:8"], { down: 4, dealt: 1, played: 0, threshold_base: 0 });
  assert.deepEqual(listRemovedCards(data), ["classic:8"]);
});

test("listAllCardRatings: curation view sees every tally with its removed flag", () => {
  const data = {};
  applyCardRatings(data, [
    { card: "a", down: 1, dealt: 8, played: 5 },
    { card: "b", down: 3, dealt: 4, played: 0 },
  ]);
  assert.deepEqual(listAllCardRatings(data), [
    { card: "a", down: 1, dealt: 8, played: 5, removed: false },
    { card: "b", down: 3, dealt: 4, played: 0, removed: true },
  ]);
});
