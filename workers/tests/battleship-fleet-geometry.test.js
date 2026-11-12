import assert from "node:assert/strict";
import test from "node:test";
import {
  randomBattleshipDraft, battleshipShipAt, battleshipShipSunk, coerceBattleshipPlacement,
  clampNumber, battleshipPlacementValid, battleshipFleetComplete, battleshipShipSize,
  battleshipShipCells, battleshipDraftKey,
} from "../../src/sogotable/static/games/battleship/fleet-geometry.js";

const game = {
  board_size: 10,
  fleet: [
    { id: "carrier", size: 5 },
    { id: "battleship", size: 4 },
    { id: "cruiser", size: 3 },
    { id: "submarine", size: 3 },
    { id: "destroyer", size: 2 },
  ],
};

test("battleship geometry: ship size, cells, and draft key", () => {
  assert.equal(battleshipShipSize(game, "cruiser"), 3);
  assert.equal(battleshipShipSize(game, "nope"), 0);
  assert.deepEqual(battleshipShipCells({ row: 2, col: 3, orientation: "h" }, 3), [
    { row: 2, col: 3 }, { row: 2, col: 4 }, { row: 2, col: 5 },
  ]);
  assert.deepEqual(battleshipShipCells({ row: 2, col: 3, orientation: "v" }, 2), [
    { row: 2, col: 3 }, { row: 3, col: 3 },
  ]);
  assert.equal(battleshipDraftKey("ABCD", "X"), "ABCD:X");
  assert.equal(battleshipDraftKey(null, undefined), ":");
});

test("battleship geometry: clamp and coerce keep a tapped ship on the board", () => {
  assert.equal(clampNumber(12, 0, 9), 9);
  assert.equal(clampNumber(-3, 0, 9), 0);
  assert.equal(clampNumber("abc", 0, 9), 0);
  assert.equal(clampNumber(4.6, 0, 9), 5);
  // Carrier (5) centered on the tap, then clamped so it fits.
  assert.deepEqual(coerceBattleshipPlacement(game, "carrier", 4, 4, "h"), { id: "carrier", row: 4, col: 2, orientation: "h" });
  assert.deepEqual(coerceBattleshipPlacement(game, "carrier", 0, 9, "h"), { id: "carrier", row: 0, col: 5, orientation: "h" });
  assert.deepEqual(coerceBattleshipPlacement(game, "carrier", 9, 0, "v"), { id: "carrier", row: 5, col: 0, orientation: "v" });
});

test("battleship geometry: placement validity, fleet completeness, hit lookup, sunk", () => {
  const a = { id: "destroyer", row: 0, col: 0, orientation: "h" };
  const b = { id: "cruiser", row: 0, col: 1, orientation: "v" };
  const off = { id: "destroyer", row: 0, col: 9, orientation: "h" };
  assert.equal(battleshipPlacementValid([a], game), true);
  assert.equal(battleshipPlacementValid([a, b], game), false, "overlap rejected");
  assert.equal(battleshipPlacementValid([off], game), false, "off-board rejected");
  assert.equal(battleshipFleetComplete([a], game.fleet), false);
  assert.equal(battleshipFleetComplete([], []), false);
  assert.equal(battleshipShipAt([a], game, 0, 1), a);
  assert.equal(battleshipShipAt([a], game, 1, 1), null);
  assert.equal(battleshipShipSunk(a, game, [{ row: 0, col: 0, hit: true }]), false);
  assert.equal(battleshipShipSunk(a, game, [{ row: 0, col: 0, hit: true }, { row: 0, col: 1, hit: true }]), true);
  assert.equal(battleshipShipSunk(a, game, [{ row: 0, col: 0, hit: true }, { row: 0, col: 1, hit: false }]), false);
});

test("battleship geometry: random draft places the whole fleet legally", () => {
  for (let i = 0; i < 20; i += 1) {
    const draft = randomBattleshipDraft(game);
    assert.deepEqual(draft.map((ship) => ship.id), game.fleet.map((ship) => ship.id));
    assert.equal(battleshipPlacementValid(draft, game), true);
    assert.equal(battleshipFleetComplete(draft, game.fleet), true);
  }
  assert.deepEqual(randomBattleshipDraft({ board_size: 2, fleet: [{ id: "carrier", size: 5 }] }), []);
});
