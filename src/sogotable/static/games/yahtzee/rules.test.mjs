// Browser-free tests for the Yahtzee rules core. Run: node --test
// These are the tests that travel with rules.js when it becomes
// workers/games/yahtzee/rules.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rawScore, scoreWithContext, isJoker, isYahtzee,
  upperSubtotal, upperBonus, grandTotal,
  newGame, applyAction, isCardComplete, previewScores, winners, scoringDice,
  CATEGORY_KEYS, UPPER_BONUS, YAHTZEE_BONUS,
} from "./rules.js";

test("upper categories sum only their face", () => {
  assert.equal(rawScore("ones", [1, 1, 1, 4, 5]), 3);
  assert.equal(rawScore("fives", [5, 5, 5, 5, 2]), 20);
  assert.equal(rawScore("sixes", [1, 2, 3, 4, 5]), 0);
});

test("three/four of a kind sum all dice, else zero", () => {
  assert.equal(rawScore("threeKind", [3, 3, 3, 4, 5]), 18);
  assert.equal(rawScore("threeKind", [3, 3, 4, 4, 5]), 0);
  assert.equal(rawScore("fourKind", [6, 6, 6, 6, 1]), 25);
  assert.equal(rawScore("fourKind", [6, 6, 6, 1, 1]), 0);
});

test("full house is 3+2 only (not five of a kind naturally)", () => {
  assert.equal(rawScore("fullHouse", [2, 2, 2, 5, 5]), 25);
  assert.equal(rawScore("fullHouse", [2, 2, 3, 5, 5]), 0);
  assert.equal(rawScore("fullHouse", [4, 4, 4, 4, 4]), 0);
});

test("straights need 4 / 5 consecutive", () => {
  assert.equal(rawScore("smallStraight", [1, 2, 3, 4, 4]), 30);
  assert.equal(rawScore("smallStraight", [2, 3, 4, 5, 1]), 30);
  assert.equal(rawScore("smallStraight", [1, 2, 3, 5, 6]), 0);
  assert.equal(rawScore("largeStraight", [2, 3, 4, 5, 6]), 40);
  assert.equal(rawScore("largeStraight", [1, 2, 3, 4, 6]), 0);
});

test("yahtzee and chance", () => {
  assert.equal(rawScore("yahtzee", [4, 4, 4, 4, 4]), 50);
  assert.equal(rawScore("yahtzee", [4, 4, 4, 4, 1]), 0);
  assert.equal(rawScore("chance", [1, 2, 3, 4, 5]), 15);
  assert.ok(isYahtzee([2, 2, 2, 2, 2]));
});

test("upper bonus triggers at 63", () => {
  const scores = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 }; // 63
  assert.equal(upperSubtotal(scores), 63);
  assert.equal(upperBonus(scores), UPPER_BONUS);
  assert.equal(upperBonus({ ...scores, sixes: 12 }), 0); // 57
});

test("Joker: bonus Yahtzee scores fixed values in full house / straights", () => {
  const player = { scores: { yahtzee: 50 }, yahtzeeBonus: 0 };
  const dice = [5, 5, 5, 5, 5];
  assert.ok(isJoker(dice, player));
  assert.equal(scoreWithContext("fullHouse", dice, player), 25);
  assert.equal(scoreWithContext("smallStraight", dice, player), 30);
  assert.equal(scoreWithContext("largeStraight", dice, player), 40);
  assert.equal(scoreWithContext("fives", dice, player), 25); // upper still natural
  // not a joker if the yahtzee box wasn't a 50
  const noBox = { scores: { yahtzee: 0 }, yahtzeeBonus: 0 };
  assert.ok(!isJoker(dice, noBox));
  assert.equal(scoreWithContext("fullHouse", dice, noBox), 0);
});

test("applyAction ROLL: rerolls non-held, decrements, stops at zero", () => {
  let seq = [1, 2, 3, 4, 5, 6, 6, 6]; // deterministic rng feed
  let i = 0;
  const rng = () => (seq[i++ % seq.length] - 1) / 6 + 0.001;
  const s = newGame(["A"]);
  applyAction(s, { type: "ROLL" }, rng); // first roll -> all five
  assert.equal(s.rollsLeft, 2);
  assert.equal(s.rolled, true);
  const after1 = s.dice.slice();
  applyAction(s, { type: "ROLL", held: [true, true, true, true, true] }, rng); // hold all
  assert.deepEqual(s.dice, after1); // unchanged
  assert.equal(s.rollsLeft, 1);
  applyAction(s, { type: "ROLL", held: [false, false, false, false, false] }, rng);
  assert.equal(s.rollsLeft, 0);
  applyAction(s, { type: "ROLL" }, rng); // no rolls left -> no-op
  assert.equal(s.rollsLeft, 0);
});

test("applyAction SCORE: records, and Game-Locked keeps the player until their card is complete", () => {
  const s = newGame(["A", "B"]);
  applyAction(s, { type: "SCORE", category: "chance" }, () => 0.5); // before roll -> no-op
  assert.equal(s.players[0].scores.chance, null);
  applyAction(s, { type: "ROLL" }, () => 0.99);
  const before = s.dice.slice();
  applyAction(s, { type: "SCORE", category: "chance" });
  assert.equal(s.players[0].scores.chance, before.reduce((a, b) => a + b, 0));
  assert.equal(s.current, 0); // Game-Locked: A keeps playing, card not complete
  // fill the rest of A's card -> play then passes to B
  for (const k of CATEGORY_KEYS) {
    if (s.players[0].scores[k] == null) { s.rolled = true; s.dice = [2, 3, 4, 5, 6]; applyAction(s, { type: "SCORE", category: k }); }
  }
  assert.ok(isCardComplete(s.players[0].scores));
  assert.equal(s.current, 1); // A finished -> now B's game
});

test("Yahtzee bonus +100 applied when scoring a joker", () => {
  const s = newGame(["A"]);
  s.players[0].scores.yahtzee = 50; // already have the yahtzee
  s.dice = [3, 3, 3, 3, 3];
  s.rolled = true;
  applyAction(s, { type: "SCORE", category: "threes" }); // joker into upper
  assert.equal(s.players[0].yahtzeeBonus, YAHTZEE_BONUS);
  assert.equal(s.players[0].scores.threes, 15);
});

test("game ends when every card is complete", () => {
  const s = newGame(["A"]);
  for (const k of CATEGORY_KEYS) s.players[0].scores[k] = 0;
  assert.ok(isCardComplete(s.players[0].scores));
  s.players[0].scores.yahtzee = null; // reopen one
  s.rolled = true;
  s.dice = [1, 1, 1, 1, 1];
  applyAction(s, { type: "SCORE", category: "yahtzee" });
  assert.ok(s.over);
});

test("scoringDice marks the dice that made the score", () => {
  assert.deepEqual(scoringDice("threes", [3, 3, 4, 5, 6]), [true, true, false, false, false]);
  assert.deepEqual(scoringDice("fours", [1, 2, 3, 5, 6]), [false, false, false, false, false]);
  assert.deepEqual(scoringDice("chance", [1, 2, 3, 4, 5]), [true, true, true, true, true]);
  assert.deepEqual(scoringDice("threeKind", [2, 2, 2, 5, 6]), [true, true, true, true, true]);
  assert.deepEqual(scoringDice("threeKind", [2, 2, 3, 5, 6]), [false, false, false, false, false]);
  assert.deepEqual(scoringDice("smallStraight", [1, 2, 3, 4, 4]), [true, true, true, true, false]);
  assert.deepEqual(scoringDice("largeStraight", [2, 3, 4, 5, 6]), [true, true, true, true, true]);
  assert.deepEqual(scoringDice("yahtzee", [5, 5, 5, 5, 5]), [true, true, true, true, true]);
});

test("previewScores and winners", () => {
  const s = newGame(["A", "B"]);
  s.rolled = true;
  s.dice = [2, 2, 2, 5, 5];
  const p = previewScores(s);
  assert.equal(p.fullHouse, 25);
  assert.equal(p.twos, 6);
  s.players[0].scores.chance = 30;
  s.players[1].scores.chance = 10;
  const w = winners(s);
  assert.equal(w.length, 1);
  assert.equal(w[0].name, "A");
});
