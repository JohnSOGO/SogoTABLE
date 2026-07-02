// Roll Through the Ages — client turn-maths tests (browser-free).
//
// These pin the pure functions extracted from board.js (the DOM-welded turn
// engine that shipped four rules bugs no test could see). Every self-inflicted
// rule — tally, upkeep disasters, goods collection, payment, Engineering,
// discard, the commit payload — is exercised here without a browser, per the
// "rule maths lives DOM-free" hard rule in docs/adding-a-game.md.
import assert from "node:assert/strict";
import test from "node:test";
import {
  tallyFaces, upkeepPlan, collectGoods, discardExcess, paymentTotal,
  goodsSaleValue, engineeringConvert, buildCommitPayload, GRANARIES_RATE, GOODS,
} from "../../src/sogotable/static/games/rtta/rules.js";

const owns = (...names) => new Set(names);
const die = (key, choice = null) => ({ key, choice });

// --- tallyFaces --------------------------------------------------------------

test("tally: plain faces sum food/workers/goods/coins/skulls", () => {
  const t = tallyFaces([die("food3"), die("work3"), die("good1"), die("coin"), die("skull")], owns());
  assert.deepEqual(t, { food: 3, work: 3, good: 3, coin: 1, skull: 1 }); // skull face = 2 goods + 1 skull
});

test("tally: the choice die counts only once resolved", () => {
  assert.equal(tallyFaces([die("choice")], owns()).food, 0);
  assert.equal(tallyFaces([die("choice", "food")], owns()).food, 2);
  assert.equal(tallyFaces([die("choice", "worker")], owns()).work, 2);
});

test("tally: Agriculture and Masonry add +1 per die, including resolved choice dice", () => {
  const t = tallyFaces(
    [die("food3"), die("choice", "food"), die("work3"), die("choice", "worker")],
    owns("Agriculture", "Masonry"),
  );
  assert.equal(t.food, 3 + 2 + 2);  // two food dice, +1 each
  assert.equal(t.work, 3 + 2 + 2);  // two worker dice, +1 each
});

test("tally: unknown/unrolled dice are skipped", () => {
  assert.deepEqual(tallyFaces([null, die("nope")], owns()), { food: 0, work: 0, good: 0, coin: 0, skull: 0 });
});

// --- upkeepPlan ---------------------------------------------------------------

const basePlan = (over) => upkeepPlan({
  harvest: 0, foodStored: 5, diceCount: 3, skulls: 0, owns: owns(), hasGreatWall: false, ...over,
});

test("upkeep: harvest caps at the 15-box food track", () => {
  assert.equal(basePlan({ harvest: 20, foodStored: 5 }).foodAfterHarvest, 15);
});

test("upkeep: cities feed 1 each; shortfall is famine points", () => {
  const p = basePlan({ harvest: 0, foodStored: 1, diceCount: 4 });
  assert.equal(p.feeds, 1);
  assert.equal(p.famine, 3);
  assert.equal(p.foodAfterFeeding, 0);
});

test("upkeep: drought at exactly 2 skulls costs 2 — Irrigation immune", () => {
  assert.equal(basePlan({ skulls: 2 }).disasterPts, 2);
  assert.equal(basePlan({ skulls: 2, owns: owns("Irrigation") }).disasterPts, 0);
});

test("upkeep: 1 and 3 skulls cost the roller nothing (3 is pestilence, server-side)", () => {
  assert.equal(basePlan({ skulls: 1 }).disasterPts, 0);
  assert.equal(basePlan({ skulls: 3 }).disasterPts, 0);
});

test("upkeep: invasion at exactly 4 skulls costs 4 — a completed Great Wall immune", () => {
  assert.equal(basePlan({ skulls: 4 }).disasterPts, 4);
  assert.equal(basePlan({ skulls: 4, hasGreatWall: true }).disasterPts, 0);
});

test("upkeep: 5+ skulls is revolt (all own goods), not invasion points — Religion reflects it", () => {
  const p = basePlan({ skulls: 5 });
  assert.equal(p.disasterPts, 0);
  assert.equal(p.revolt, true);
  assert.equal(basePlan({ skulls: 7 }).revolt, true);
  assert.equal(basePlan({ skulls: 5, owns: owns("Religion") }).revolt, false);
});

// --- collectGoods / discardExcess ----------------------------------------------

test("goods: collected one per row, Wood upward, wrapping past Spearhead", () => {
  assert.deepEqual(collectGoods([0, 0, 0, 0, 0], 7, owns()), [2, 2, 1, 1, 1]);
});

test("goods: a full row loses the good but still consumes the earned slot", () => {
  const full = [GOODS[0].holes, 0, 0, 0, 0];
  assert.deepEqual(collectGoods(full, 2, owns()), [GOODS[0].holes, 1, 0, 0, 0]);
});

test("goods: Quarrying adds one bonus stone when 2+ goods are collected", () => {
  assert.deepEqual(collectGoods([0, 0, 0, 0, 0], 2, owns("Quarrying")), [1, 2, 0, 0, 0]);
  assert.deepEqual(collectGoods([0, 0, 0, 0, 0], 1, owns("Quarrying")), [1, 0, 0, 0, 0]);
});

test("discard: down to 6 total, cheapest rows first — Caravans exempt", () => {
  assert.deepEqual(discardExcess([4, 3, 2, 0, 0], owns()), [1, 3, 2, 0, 0]); // 9 total → drop 3 wood
  assert.deepEqual(discardExcess([2, 2, 1, 0, 0], owns()), [2, 2, 1, 0, 0]); // ≤6 untouched
  assert.deepEqual(discardExcess([4, 3, 2, 0, 0], owns("Caravans")), [4, 3, 2, 0, 0]);
});

// --- paymentTotal / engineeringConvert ------------------------------------------

test("payment: coins are all-or-nothing at 7 each — 12 with Coinage", () => {
  const sel = { payCoins: true, payGoodsCounts: [0, 0, 0, 0, 0], payFood: 0 };
  assert.equal(paymentTotal(sel, { coinCount: 2, goods: [0, 0, 0, 0, 0], owns: owns() }), 14);
  assert.equal(paymentTotal(sel, { coinCount: 2, goods: [0, 0, 0, 0, 0], owns: owns("Coinage") }), 24);
});

test("goods sale: partial sales take the topmost marginals (chart stays coherent)", () => {
  assert.equal(goodsSaleValue(0, 3, 3), 6);   // whole 3-wood stack = 1×tri(3)
  assert.equal(goodsSaleValue(0, 3, 1), 3);   // top wood of 3 = its position value
  assert.equal(goodsSaleValue(0, 3, 2), 5);   // top two = 3 + 2
  assert.equal(goodsSaleValue(4, 2, 1), 10);  // top spearhead of 2 = 5×2
  assert.equal(goodsSaleValue(1, 2, 5), 6);   // over-ask clamps to the stack (2×tri(2))
  assert.equal(goodsSaleValue(2, 0, 1), 0);   // empty stack sells nothing
});

test("payment: per-type counts sold off the top (house rule) sum with coins", () => {
  const sel = { payCoins: false, payGoodsCounts: [1, 0, 0, 0, 2], payFood: 0 };
  // top wood of 3 = 3; both spearheads of 2 = 5×(1+2) = 15
  assert.equal(paymentTotal(sel, { coinCount: 0, goods: [3, 0, 0, 0, 2], owns: owns() }), 18);
});

test("payment: Granaries food sells at the Granaries rate", () => {
  const sel = { payCoins: false, payGoodsCounts: [0, 0, 0, 0, 0], payFood: 3 };
  assert.equal(paymentTotal(sel, { coinCount: 0, goods: [0, 0, 0, 0, 0], owns: owns("Granaries") }), 3 * GRANARIES_RATE);
});

test("engineering: spends 1 stone for 3 workers; undo restores; illegal steps return null", () => {
  const step = engineeringConvert({ goods: [0, 2, 0, 0, 0], workers: 1 }, +1);
  assert.deepEqual(step, { goods: [0, 1, 0, 0, 0], workers: 4 });
  const undo = engineeringConvert({ goods: step.goods, workers: step.workers }, -1);
  assert.deepEqual(undo, { goods: [0, 2, 0, 0, 0], workers: 1 });
  assert.equal(engineeringConvert({ goods: [0, 0, 0, 0, 0], workers: 5 }, +1), null); // no stone
  assert.equal(engineeringConvert({ goods: [0, 1, 0, 0, 0], workers: 2 }, -1), null); // workers already spent
});

// --- buildCommitPayload ----------------------------------------------------------

test("commit payload: absolute state + this-turn deltas, completion derived from full boxes", () => {
  const p = buildCommitPayload({
    cities: 4, food: 22, goods: [1, 0, 0, 0, 0],
    monumentBoxes: { "Step Pyramid": 3, "Temple": 2, "Bogus": 9 },
    devBought: "Leadership", skulls: 2, pointsLostSelf: 1,
  });
  assert.equal(p.type, "COMMIT_TURN");
  assert.equal(p.food, 15); // clamped to the track
  assert.deepEqual(p.monumentBoxes, { "Step Pyramid": 3, "Temple": 2 }); // unknown names dropped
  assert.deepEqual(p.monumentsCompleted, ["Step Pyramid"]); // 3/3 full; Temple 2/7 is not
  assert.equal(p.devBought, "Leadership");
});

test("commit payload: empty turn sends no monuments and a null dev", () => {
  const p = buildCommitPayload({ cities: 3, food: 0, goods: [0, 0, 0, 0, 0], monumentBoxes: {}, devBought: null, skulls: 0, pointsLostSelf: 0 });
  assert.deepEqual(p.monumentBoxes, {});
  assert.deepEqual(p.monumentsCompleted, []);
  assert.equal(p.devBought, null);
});
