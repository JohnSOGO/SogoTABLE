// Bloomwork pure board math: bed layout, row legality, planting points,
// compost penalties and end bonuses.
import assert from "node:assert/strict";
import test from "node:test";
import {
  FLOWERS, SIZE, BIRD, bedFlowerAt, bedColumnFor, canPlant, compostPenalty, emptyBed, emptyRows,
  endBonuses, legalRows, plantPoints,
} from "../games/bloomwork/board.js";

test("the bed is a Latin square: every row and column holds each flower once", () => {
  for (let i = 0; i < SIZE; i += 1) {
    assert.equal(new Set(FLOWERS.map((_, c) => bedFlowerAt(i, c))).size, SIZE);
    assert.equal(new Set(FLOWERS.map((_, r) => bedFlowerAt(r, i))).size, SIZE);
  }
  FLOWERS.forEach((f) => { for (let r = 0; r < SIZE; r += 1) assert.equal(bedFlowerAt(r, bedColumnFor(r, f)), f); });
});

test("row legality: capacity, one kind per row, no repeat of a planted flower", () => {
  const rows = emptyRows();
  const bed = emptyBed();
  assert.deepEqual(legalRows(rows, bed, "rose"), [0, 1, 2, 3, 4]);
  rows[2] = { flower: "iris", count: 1 };
  assert.equal(canPlant(rows, bed, 2, "rose"), false);
  assert.equal(canPlant(rows, bed, 2, "iris"), true);
  rows[0] = { flower: "sun", count: 1 };
  assert.equal(canPlant(rows, bed, 0, "sun"), false, "full row");
  bed[3][bedColumnFor(3, "fern")] = true;
  assert.equal(canPlant(rows, bed, 3, "fern"), false, "bed row already has fern");
  assert.equal(canPlant(rows, bed, -1, "fern"), true, "compost always takes flowers");
  assert.equal(canPlant(rows, bed, 5, "fern"), false);
  assert.equal(canPlant(rows, bed, 1, "weed"), false);
});

test("planting points count the horizontal and vertical runs joined", () => {
  const bed = emptyBed();
  assert.equal(plantPoints(bed, 2, 2), 1);
  bed[2][1] = true; bed[2][0] = true;
  assert.equal(plantPoints(bed, 2, 2), 3);
  bed[1][2] = true;
  assert.equal(plantPoints(bed, 2, 2), 5); // 3 across + 2 down
  bed[2][3] = false; bed[4][2] = true; // gap at (3,2): not joined
  assert.equal(plantPoints(bed, 2, 2), 5);
});

test("compost penalties fill slots left to right and cap at seven", () => {
  assert.equal(compostPenalty([]), 0);
  assert.equal(compostPenalty([BIRD]), -1);
  assert.equal(compostPenalty(["rose", "rose", "rose"]), -4);
  assert.equal(compostPenalty(Array(9).fill("iris")), -14);
});

test("end bonuses: +2 per bed row, +7 per column, +10 per complete flower", () => {
  const bed = emptyBed();
  bed[0] = [true, true, true, true, true];
  for (let r = 0; r < SIZE; r += 1) bed[r][0] = true;
  for (let r = 0; r < SIZE; r += 1) bed[r][bedColumnFor(r, "lilac")] = true;
  const b = endBonuses(bed);
  assert.equal(b.rows, 1);
  assert.equal(b.cols, 1);
  assert.equal(b.kinds >= 1, true);
  assert.equal(b.points, b.rows * 2 + b.cols * 7 + b.kinds * 10);
});
