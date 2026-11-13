// Last Orders — the end-of-my-turn summary's pure delta / mood helper.
import test from "node:test";
import assert from "node:assert/strict";
import { turnDelta } from "../../src/sogotable/static/games/last-orders/turn-summary.js";

test("turn summary: deltas per stat, and Buzz going up counts against me", () => {
  assert.deepEqual(turnDelta({ grit: 20, buzz: 0, gold: 10 }, { grit: 17, buzz: 2, gold: 12 }), { d: { grit: -3, buzz: 2, gold: 2 }, mood: "rough" });
  assert.equal(turnDelta({ grit: 15, buzz: 4, gold: 8 }, { grit: 18, buzz: 3, gold: 8 }).mood, "good");
  assert.equal(turnDelta({ grit: 15, buzz: 4, gold: 8 }, { grit: 15, buzz: 4, gold: 8 }).mood, "steady");
  assert.equal(turnDelta({ grit: 15, buzz: 4, gold: 8 }, { grit: 16, buzz: 5, gold: 8 }).mood, "mixed");
});
