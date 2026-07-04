import assert from "node:assert/strict";
import test from "node:test";
import {
  NO_THANKS_GAME_ID,
  isNoThanksGame, newNoThanksGame, initNoThanksSeats, makeNoThanksMove,
  noThanksGameToDict, noThanksGameToDictForViewer, noThanksScoreByMark,
  scoreNoThanksCards, noThanksStartingChips, setNoThanksRandom,
} from "../games/no-thanks/rules.js";
import { noThanksBotAction } from "../games/no-thanks/ai.js";

const human = (mark, name) => ({ mark, name, kind: "human" });
const bot = (mark, name) => ({ mark, name, kind: "bot" });

// rig(0) leaves the Fisher–Yates shuffle as the identity permutation (j always
// 0 swaps each element to the front, reversing... no: j=0 moves deck[i] to the
// head each step, producing a deterministic known order). Rather than reason
// about swap algebra, tests that need exact cards RIG THE DECK DIRECTLY after
// init — the deck is plain data. rig() only pins the shuffle deterministic.
function rig(value = 0) {
  setNoThanksRandom(() => value);
}

// Cycling LCG for bot games (bots draw jitter values).
function seeded(seed) {
  let s = seed >>> 0;
  setNoThanksRandom(() => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  });
}

// Three humans with a hand-built deck: `deck` pops from the END, so the last
// element is the first card flipped. Pass the FULL pile including the card
// you want face up.
function threeHumans(deck) {
  const g = newNoThanksGame();
  rig();
  initNoThanksSeats(g, [human("P1", "A"), human("P2", "B"), human("P3", "C")]);
  const pile = deck.slice();
  g.current_card = pile.pop();
  g.deck = pile;
  g.pot = 0;
  return g;
}

test.afterEach(() => setNoThanksRandom(Math.random));

// ---- setup -------------------------------------------------------------------

test("setup: 24 cards in play, 11 chips each, P1 opens on the first flip", () => {
  const g = newNoThanksGame();
  rig();
  initNoThanksSeats(g, [human("P1", "A"), human("P2", "B"), human("P3", "C")]);
  assert.equal(isNoThanksGame(g), true);
  assert.equal(g.deck.length, 23); // 24 in play, one already face up
  assert.ok(g.current_card >= 3 && g.current_card <= 35);
  assert.equal(g.pot, 0);
  assert.equal(g.current_player, "P1");
  assert.deepEqual(
    Object.values(g.players).map((seat) => seat.chips),
    [11, 11, 11],
  );
});

test("setup: N-player with a 3-seat floor; chip stacks scale down and hold at 7", () => {
  const g = newNoThanksGame();
  assert.throws(() => initNoThanksSeats(g, [human("P1", "A"), human("P2", "B")]), /at least 3 players/);
  // No ceiling (N-player, MojoSOGO 2026-07-04): 8 seats deal fine on 7 chips.
  rig();
  initNoThanksSeats(g, "P1 P2 P3 P4 P5 P6 P7 P8".split(" ").map((mark) => human(mark, mark)));
  assert.equal(g.seat_order.length, 8);
  assert.deepEqual(Object.values(g.players).map((seat) => seat.chips), Array(8).fill(7));
  assert.equal(noThanksStartingChips(5), 11);
  assert.equal(noThanksStartingChips(6), 9);
  assert.equal(noThanksStartingChips(7), 7);
  assert.equal(noThanksStartingChips(12), 7); // house rule past the box's 7
});

// ---- run scoring ---------------------------------------------------------------

test("scoring: only the lowest card of each consecutive run counts", () => {
  assert.equal(scoreNoThanksCards([]), 0);
  assert.equal(scoreNoThanksCards([17]), 17);
  assert.equal(scoreNoThanksCards([5, 6, 7]), 5);
  assert.equal(scoreNoThanksCards([5, 6, 7, 30]), 35);
  assert.equal(scoreNoThanksCards([35, 34, 3, 20, 22]), 3 + 20 + 22 + 34); // order-independent
});

// ---- pass / take -----------------------------------------------------------------

test("pass: costs a chip onto the card and hands the decision clockwise", () => {
  const g = threeHumans([10, 25]);
  makeNoThanksMove(g, "P1", { type: "pass" });
  assert.equal(g.players.P1.chips, 10);
  assert.equal(g.pot, 1);
  assert.equal(g.current_player, "P2");
  assert.equal(g.last_move.type, "pass");
  assert.equal(g.last_move.next, "P2");
  makeNoThanksMove(g, "P2", { type: "pass" });
  makeNoThanksMove(g, "P3", { type: "pass" });
  assert.equal(g.current_player, "P1"); // full circle back to the opener
  assert.equal(g.pot, 3);
});

test("take: collects the card and the pot, then the SAME player decides the next card", () => {
  const g = threeHumans([10, 25]);
  makeNoThanksMove(g, "P1", { type: "pass" });
  makeNoThanksMove(g, "P2", { type: "pass" });
  makeNoThanksMove(g, "P3", { type: "take" });
  assert.deepEqual(g.players.P3.cards, [25]);
  assert.equal(g.players.P3.chips, 13); // 11 + the 2-chip pot, having paid no pass
  assert.equal(g.current_card, 10);
  assert.equal(g.pot, 0);
  assert.equal(g.current_player, "P3"); // taker decides first on the fresh card
});

test("pass with an empty stack is rejected as a forced take", () => {
  const g = threeHumans([10, 25]);
  g.players.P1.chips = 0;
  assert.throws(() => makeNoThanksMove(g, "P1", { type: "pass" }), /out of chips/);
  makeNoThanksMove(g, "P1", { type: "take" }); // the forced take itself is legal
  assert.deepEqual(g.players.P1.cards, [25]);
});

// ---- turn + actor validation ---------------------------------------------------

test("validation: out-of-turn, unseated, bot seats, and junk actions are rejected", () => {
  const g = threeHumans([10, 25]);
  assert.throws(() => makeNoThanksMove(g, "P2", { type: "take" }), /P1's turn/);
  assert.throws(() => makeNoThanksMove(g, "P9", { type: "take" }), /not seated/);
  assert.throws(() => makeNoThanksMove(g, "P1", { type: "dance" }), /must be take or pass/);
  g.players.P1.is_bot = true;
  assert.throws(() => makeNoThanksMove(g, "P1", { type: "take" }), /play automatically/);
});

// ---- game end + winner -----------------------------------------------------------

test("completion: taking the last card ends the game, lowest total wins", () => {
  const g = threeHumans([30]); // single card in play
  makeNoThanksMove(g, "P1", { type: "pass" });
  makeNoThanksMove(g, "P2", { type: "take" });
  assert.equal(g.status, "complete");
  assert.equal(g.current_card, null);
  assert.equal(g.current_player, null);
  // P2: 30 - (11 + 1 pot) = 18; P1: -10 after paying a chip; P3: -11.
  assert.deepEqual(noThanksScoreByMark(g), { P1: -10, P2: 18, P3: -11 });
  assert.equal(g.winner, "P3");
  assert.equal(g.results[0].mark, "P3");
  assert.equal(g.results[0].total, -11);
  assert.equal(g.last_move.type, "complete");
  assert.throws(() => makeNoThanksMove(g, "P3", { type: "take" }), /complete/);
});

test("completion: score ties break toward the bigger chip stack", () => {
  const g = threeHumans([6]);
  // Hand-build the pre-take table so P1 and P2 finish tied on total but with
  // different chip stacks, then close the game through the one legal take.
  g.players.P1.cards = [7];
  g.players.P1.chips = 0; // takes the 6: run [6,7] scores 6, total 6
  g.players.P2.cards = [20];
  g.players.P2.chips = 14; // total 6 — ties P1 with MORE chips
  g.players.P3.cards = [30];
  g.players.P3.chips = 5; // total 25
  makeNoThanksMove(g, "P1", { type: "take" });
  assert.equal(g.status, "complete");
  assert.deepEqual(noThanksScoreByMark(g), { P1: 6, P2: 6, P3: 25 });
  assert.equal(g.winner, "P2");
});

// ---- hidden information (the defining constraints) -------------------------------

test("sanitizer: a viewer sees their own chips; everyone else's mask to null", () => {
  const g = threeHumans([10, 25]);
  makeNoThanksMove(g, "P1", { type: "pass" });
  const view = noThanksGameToDictForViewer(noThanksGameToDict(g), "P1", "active");
  const p1 = view.players.find((seat) => seat.mark === "P1");
  const p2 = view.players.find((seat) => seat.mark === "P2");
  assert.equal(p1.chips, 10);
  assert.equal(p2.chips, null);
  assert.deepEqual(p2.cards, []); // cards stay public
  assert.equal(view.pot, 1); // chips ON the card are public
});

test("sanitizer: a spectator (no seat) sees no chip stack at all", () => {
  const g = threeHumans([10, 25]);
  const view = noThanksGameToDictForViewer(noThanksGameToDict(g), "", "active");
  for (const seat of view.players) assert.equal(seat.chips, null);
});

test("sanitizer: completion reveals every stack alongside the results", () => {
  const g = threeHumans([30]);
  makeNoThanksMove(g, "P1", { type: "take" });
  const view = noThanksGameToDictForViewer(noThanksGameToDict(g), "P2", "active");
  for (const seat of view.players) assert.ok(Number.isInteger(seat.chips));
  assert.ok(Array.isArray(view.results));
  assert.equal(view.results[0].mark, view.winner);
});

test("deck secrecy: the dict carries a count, never the draw pile", () => {
  const g = threeHumans([10, 22, 25]);
  const dict = noThanksGameToDict(g);
  assert.equal(dict.deck, undefined);
  assert.equal(dict.deck_count, 2);
  const serialized = JSON.stringify(noThanksGameToDictForViewer(dict, "P1", "active"));
  assert.ok(!serialized.includes('"deck":'), "the draw pile must never leave the worker");
});

test("events: pass/take events carry the public table, never chip totals", () => {
  const g = threeHumans([10, 25]);
  makeNoThanksMove(g, "P1", { type: "pass" });
  makeNoThanksMove(g, "P2", { type: "take" });
  const view = noThanksGameToDictForViewer(noThanksGameToDict(g), "P3", "active");
  const serialized = JSON.stringify({ events: view.events, last_move: view.last_move });
  assert.ok(!serialized.includes("chips\":"), "events must not embed chip stacks");
  assert.deepEqual(view.events.map((event) => event.type), ["pass", "take"]);
  assert.equal(view.events[1].chips_gained, 1); // the pot collected is public
});

// ---- projection id + turn flags --------------------------------------------------

test("projection: the dict pins the opaque game id, turn flags, and card scores", () => {
  const g = threeHumans([10, 25]);
  g.players.P2.cards = [5, 6, 7, 30];
  const dict = noThanksGameToDict(g);
  assert.equal(dict.game_id, NO_THANKS_GAME_ID);
  assert.equal(dict.players.find((seat) => seat.mark === "P1").is_turn, true);
  assert.equal(dict.players.find((seat) => seat.mark === "P2").is_turn, false);
  assert.equal(dict.players.find((seat) => seat.mark === "P2").card_score, 35);
});

// ---- bots ------------------------------------------------------------------------

test("bot policy: forced take at 0 chips; free points taken; expensive cards dodged", () => {
  assert.deepEqual(noThanksBotAction({ card: 35, pot: 0, chips: 0, scoreDelta: 35, random: () => 0.5 }), { type: "take" });
  assert.deepEqual(noThanksBotAction({ card: 20, pot: 20, chips: 5, scoreDelta: 20, random: () => 0.5 }), { type: "take" });
  assert.deepEqual(noThanksBotAction({ card: 21, pot: 0, chips: 5, scoreDelta: 1, random: () => 0.5 }), { type: "take" }); // run extension
  assert.deepEqual(noThanksBotAction({ card: 35, pot: 0, chips: 11, scoreDelta: 35, random: () => 0.5 }), { type: "pass" });
});

test("bot: an all-bot table plays itself to completion with chips conserved", () => {
  for (const seed of [1, 7, 42, 2026]) {
    const g = newNoThanksGame();
    seeded(seed);
    initNoThanksSeats(g, [bot("P1", "Bot1"), bot("P2", "Bot2"), bot("P3", "Bot3")]);
    assert.equal(g.status, "complete", `seed ${seed} never finished`);
    assert.ok(g.winner, `seed ${seed} finished without a winner`);
    const chips = Object.values(g.players).reduce((sum, seat) => sum + seat.chips, 0);
    assert.equal(chips, 33, `seed ${seed} leaked chips`); // 3 x 11, pots included
    const cards = Object.values(g.players).reduce((sum, seat) => sum + seat.cards.length, 0);
    assert.equal(cards, 24, `seed ${seed} lost cards`);
  }
});

test("bot: a human-vs-bot game always plays to completion", () => {
  for (const seed of [3, 11, 2026]) {
    const g = newNoThanksGame();
    seeded(seed);
    initNoThanksSeats(g, [human("P1", "A"), bot("P2", "Bot"), bot("P3", "Bot")]);
    let guard = 0;
    while (g.status === "playing" && guard++ < 500) {
      assert.equal(g.current_player, "P1", "bots must resolve internally back to the human");
      const cheap = g.players.P1.chips <= 0 || (g.current_card - g.pot) <= 12;
      makeNoThanksMove(g, "P1", { type: cheap ? "take" : "pass" });
    }
    assert.equal(g.status, "complete", `seed ${seed} never finished`);
    assert.ok(guard < 500, `seed ${seed} tripped the guard`);
  }
});
