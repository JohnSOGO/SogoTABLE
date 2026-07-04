import assert from "node:assert/strict";
import test from "node:test";
import {
  LIARS_DICE_GAME_ID, LIARS_DICE_STARTING_DICE,
  isLiarsDiceGame, newLiarsDiceGame, initLiarsDiceSeats, makeLiarsDiceMove,
  liarsDiceGameToDict, liarsDiceGameToDictForViewer, liarsDiceScoreByMark,
  countLiarsDiceMatches, setLiarsDiceRandom,
} from "../games/liars-dice/rules.js";
import { liarsDiceBotAction, liarsDiceBidTruthChance } from "../games/liars-dice/ai.js";

const human = (mark, name) => ({ mark, name, kind: "human" });
const bot = (mark, name) => ({ mark, name, kind: "bot" });

// Deterministic RNG: hands out the queued values in order, throws when the
// test mis-counts. A round start consumes one value per die, in seat order.
// face(f) yields a value that rolls exactly face f (1 + floor(v * 6)).
const face = (f) => (f - 1) / 6 + 0.01;
function rig(values) {
  const queue = values.slice();
  setLiarsDiceRandom(() => {
    if (!queue.length) throw new Error("test RNG exhausted");
    return queue.shift();
  });
}

// Cycling LCG for bot games (bots draw extra values for jitter/tie-breaks).
function seeded(seed) {
  let s = seed >>> 0;
  setLiarsDiceRandom(() => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  });
}

// Two humans with fully rigged cups: P1 rolls p1Dice, P2 rolls p2Dice.
function twoHumans(p1Dice, p2Dice) {
  const g = newLiarsDiceGame();
  rig([...p1Dice.map(face), ...p2Dice.map(face)]);
  initLiarsDiceSeats(g, [human("P1", "A"), human("P2", "B")]);
  return g;
}

test.afterEach(() => setLiarsDiceRandom(Math.random));

// ---- setup -------------------------------------------------------------------

test("setup: five dice each, round 1 rolled hidden, P1 opens", () => {
  const g = twoHumans([1, 2, 3, 4, 5], [2, 3, 4, 5, 6]);
  assert.equal(isLiarsDiceGame(g), true);
  assert.equal(g.round, 1);
  assert.equal(g.phase, "bidding");
  assert.equal(g.current_player, "P1");
  assert.equal(g.current_bid, null);
  assert.deepEqual(g.players.P1.dice, [1, 2, 3, 4, 5]);
  assert.deepEqual(g.players.P2.dice, [2, 3, 4, 5, 6]);
  assert.equal(g.players.P1.dice_count, LIARS_DICE_STARTING_DICE);
  assert.equal(liarsDiceGameToDict(g).total_dice, 10);
});

test("setup: fewer than two seats is rejected", () => {
  const g = newLiarsDiceGame();
  assert.throws(() => initLiarsDiceSeats(g, [human("P1", "Solo")]), /at least 2 players/);
});

// ---- wild counting -----------------------------------------------------------

test("counting: ones back every bid face; plain faces count themselves", () => {
  const g = twoHumans([1, 1, 4, 4, 2], [4, 6, 6, 3, 5]);
  assert.equal(countLiarsDiceMatches(g, 4), 5); // three 4s + two wilds
  assert.equal(countLiarsDiceMatches(g, 6), 4); // two 6s + two wilds
  assert.equal(countLiarsDiceMatches(g, 2), 3); // one 2 + two wilds
});

// ---- bid legality ------------------------------------------------------------

test("bids: raises need more dice, or the same count on a higher face", () => {
  const g = twoHumans([1, 2, 3, 4, 5], [2, 3, 4, 5, 6]);
  makeLiarsDiceMove(g, "P1", { type: "bid", quantity: 3, face: 4 });
  assert.deepEqual(g.current_bid, { quantity: 3, face: 4, mark: "P1" });
  assert.equal(g.current_player, "P2");
  assert.throws(() => makeLiarsDiceMove(g, "P2", { type: "bid", quantity: 3, face: 4 }), /Raise the bid/);
  assert.throws(() => makeLiarsDiceMove(g, "P2", { type: "bid", quantity: 3, face: 3 }), /Raise the bid/);
  assert.throws(() => makeLiarsDiceMove(g, "P2", { type: "bid", quantity: 2, face: 6 }), /Raise the bid/);
  makeLiarsDiceMove(g, "P2", { type: "bid", quantity: 3, face: 5 });
  assert.deepEqual(g.current_bid, { quantity: 3, face: 5, mark: "P2" });
});

test("bids: face-1 bids and impossible counts are rejected while ones are wild", () => {
  const g = twoHumans([1, 2, 3, 4, 5], [2, 3, 4, 5, 6]);
  assert.throws(() => makeLiarsDiceMove(g, "P1", { type: "bid", quantity: 2, face: 1 }), /Ones are wild/);
  assert.throws(() => makeLiarsDiceMove(g, "P1", { type: "bid", quantity: 11, face: 3 }), /between 1 and 10/);
  assert.throws(() => makeLiarsDiceMove(g, "P1", { type: "bid", quantity: 0, face: 3 }), /between 1 and 10/);
});

test("raise options: same quantity climbs the face, higher quantities reopen at 2", () => {
  const g = twoHumans([1, 2, 3, 4, 5], [2, 3, 4, 5, 6]);
  makeLiarsDiceMove(g, "P1", { type: "bid", quantity: 9, face: 6 });
  const dict = liarsDiceGameToDict(g);
  // Off "nine 6s": same-quantity raise is impossible (no face above 6), so the
  // only raise left is ten of anything.
  assert.deepEqual(dict.raise_options, [{ quantity: 10, min_face: 2 }]);
});

// ---- N-player turn selection ----------------------------------------------------

test("turns: fewest plays act next, ties break via RNG, never twice in a row", () => {
  const g = newLiarsDiceGame();
  // 15 rolls (3 seats x 5 dice), then one tie-break draw for P1's first bid.
  rig([...Array.from({ length: 15 }, () => face(2)), 0.99, 0.0]);
  initLiarsDiceSeats(g, [human("P1", "A"), human("P2", "B"), human("P3", "C")]);
  assert.equal(g.current_player, "P1");
  makeLiarsDiceMove(g, "P1", { type: "bid", quantity: 1, face: 2 });
  // P2 and P3 tie at 0 plays: rigged 0.99 draws the second of [P2, P3].
  assert.equal(g.current_player, "P3");
  assert.equal(g.last_move.next, "P3"); // the public event names who is up
  makeLiarsDiceMove(g, "P3", { type: "bid", quantity: 1, face: 3 });
  // P2 (0 plays) beats P1 (1 play) — deterministic, no RNG consumed.
  assert.equal(g.current_player, "P2");
  makeLiarsDiceMove(g, "P2", { type: "bid", quantity: 1, face: 4 });
  // Everyone is at 1 play; candidates exclude P2; rigged 0.0 draws P1.
  assert.equal(g.current_player, "P1");
  const dict = liarsDiceGameToDict(g);
  assert.deepEqual(dict.players.map((seat) => seat.plays), [1, 1, 1]);
});

// ---- turn + actor validation ---------------------------------------------------

test("validation: out-of-turn, bot seats, and junk actions are rejected", () => {
  const g = twoHumans([1, 2, 3, 4, 5], [2, 3, 4, 5, 6]);
  assert.throws(() => makeLiarsDiceMove(g, "P2", { type: "bid", quantity: 2, face: 3 }), /P1's turn/);
  assert.throws(() => makeLiarsDiceMove(g, "P1", { type: "dance" }), /must be bid, challenge, or next_round/);
  assert.throws(() => makeLiarsDiceMove(g, "P3", { type: "bid", quantity: 2, face: 3 }), /not seated/);
  assert.throws(() => makeLiarsDiceMove(g, "P1", { type: "challenge" }), /no bid to challenge/);
  assert.throws(() => makeLiarsDiceMove(g, "P1", { type: "next_round" }), /still being played/);
});

// ---- challenge resolution ------------------------------------------------------

test("challenge: a true bid costs the challenger a die and the reveal is public", () => {
  // Table: P1 [4,4,1,2,3], P2 [6,1,5,5,2] -> four effective 4s (two 4s + two wilds).
  const g = twoHumans([4, 4, 1, 2, 3], [6, 1, 5, 5, 2]);
  makeLiarsDiceMove(g, "P1", { type: "bid", quantity: 4, face: 4 });
  makeLiarsDiceMove(g, "P2", { type: "challenge" });
  assert.equal(g.phase, "reveal");
  assert.equal(g.last_reveal.outcome, "bid_holds");
  assert.equal(g.last_reveal.actual, 4);
  assert.equal(g.last_reveal.loser, "P2");
  assert.deepEqual(g.last_reveal.dice, { P1: [4, 4, 1, 2, 3], P2: [6, 1, 5, 5, 2] });
  assert.equal(g.players.P2.dice_count, 4);
  assert.equal(g.players.P1.dice_count, 5);
  // Live cups empty until the next round rolls — the reveal owns the dice now.
  assert.deepEqual(g.players.P1.dice, []);
  assert.deepEqual(g.players.P2.dice, []);
  assert.equal(g.starter, "P2"); // die-loser opens the next round
});

test("challenge: an overbid costs the bidder a die", () => {
  const g = twoHumans([4, 4, 1, 2, 3], [6, 1, 5, 5, 2]);
  makeLiarsDiceMove(g, "P1", { type: "bid", quantity: 5, face: 4 });
  makeLiarsDiceMove(g, "P2", { type: "challenge" });
  assert.equal(g.last_reveal.outcome, "bid_fails");
  assert.equal(g.last_reveal.loser, "P1");
  assert.equal(g.players.P1.dice_count, 4);
  assert.equal(g.starter, "P1");
});

test("next round: the loser opens with one die fewer", () => {
  const g = twoHumans([4, 4, 1, 2, 3], [6, 1, 5, 5, 2]);
  makeLiarsDiceMove(g, "P1", { type: "bid", quantity: 5, face: 4 });
  makeLiarsDiceMove(g, "P2", { type: "challenge" });
  rig([...[2, 2, 3, 3].map(face), ...[5, 5, 6, 6, 2].map(face)]);
  makeLiarsDiceMove(g, "P2", { type: "next_round" });
  assert.equal(g.round, 2);
  assert.equal(g.phase, "bidding");
  assert.equal(g.current_player, "P1");
  assert.equal(g.current_bid, null);
  assert.equal(g.last_reveal, null);
  assert.deepEqual(g.players.P1.dice, [2, 2, 3, 3]);
  assert.equal(liarsDiceGameToDict(g).total_dice, 9);
});

test("elimination: losing the last die ends a two-player game", () => {
  const g = twoHumans([3, 2, 2, 2, 2], [6, 6, 5, 5, 4]);
  g.players.P1.dice_count = 1;
  g.players.P1.dice = [3];
  makeLiarsDiceMove(g, "P1", { type: "bid", quantity: 6, face: 3 }); // one 3 on the table
  makeLiarsDiceMove(g, "P2", { type: "challenge" });
  assert.equal(g.status, "complete");
  assert.equal(g.winner, "P2");
  assert.equal(g.players.P1.eliminated, true);
  assert.equal(g.last_move.type, "complete");
  assert.deepEqual(liarsDiceScoreByMark(g), { P1: 0, P2: 5 });
  assert.throws(() => makeLiarsDiceMove(g, "P2", { type: "bid", quantity: 1, face: 2 }), /complete/);
});

// ---- hidden information (the defining constraint) -------------------------------

test("sanitizer: a viewer sees only their own cup; counts survive the mask", () => {
  const g = twoHumans([1, 2, 3, 4, 5], [2, 3, 4, 5, 6]);
  const view = liarsDiceGameToDictForViewer(liarsDiceGameToDict(g), "P1", "active");
  const p1 = view.players.find((seat) => seat.mark === "P1");
  const p2 = view.players.find((seat) => seat.mark === "P2");
  assert.deepEqual(p1.dice, [1, 2, 3, 4, 5]);
  assert.deepEqual(p2.dice, [null, null, null, null, null]);
  assert.equal(p2.dice_count, 5);
});

test("sanitizer: a spectator (no seat) sees no cup at all", () => {
  const g = twoHumans([1, 2, 3, 4, 5], [2, 3, 4, 5, 6]);
  const view = liarsDiceGameToDictForViewer(liarsDiceGameToDict(g), "", "active");
  for (const seat of view.players) {
    assert.deepEqual(seat.dice, [null, null, null, null, null]);
  }
});

test("sanitizer: the challenge reveal is public while live cups stay empty", () => {
  const g = twoHumans([4, 4, 1, 2, 3], [6, 1, 5, 5, 2]);
  makeLiarsDiceMove(g, "P1", { type: "bid", quantity: 4, face: 4 });
  makeLiarsDiceMove(g, "P2", { type: "challenge" });
  const view = liarsDiceGameToDictForViewer(liarsDiceGameToDict(g), "P2", "active");
  assert.deepEqual(view.last_reveal.dice, { P1: [4, 4, 1, 2, 3], P2: [6, 1, 5, 5, 2] });
  for (const seat of view.players) assert.deepEqual(seat.dice, []);
});

test("sanitizer: events and bids carry no dice", () => {
  const g = twoHumans([1, 2, 3, 4, 5], [2, 3, 4, 5, 6]);
  makeLiarsDiceMove(g, "P1", { type: "bid", quantity: 2, face: 4 });
  const view = liarsDiceGameToDictForViewer(liarsDiceGameToDict(g), "P2", "active");
  const serialized = JSON.stringify({ events: view.events, last_move: view.last_move, current_bid: view.current_bid });
  assert.ok(!serialized.includes("dice"), "bidding events must not embed dice");
});

// ---- bots ------------------------------------------------------------------------

test("bot: an opening bot bids immediately and hands the turn to the human", () => {
  const g = newLiarsDiceGame();
  seeded(7);
  initLiarsDiceSeats(g, [bot("P1", "Bot"), human("P2", "B")]);
  assert.equal(g.phase, "bidding");
  assert.ok(g.current_bid, "bot should have opened the bidding");
  assert.equal(g.current_bid.mark, "P1");
  assert.equal(g.current_player, "P2");
});

test("bot: a human-vs-bot game always plays to completion", () => {
  for (const seed of [1, 2, 3, 2026]) {
    const g = newLiarsDiceGame();
    seeded(seed);
    initLiarsDiceSeats(g, [human("P1", "A"), bot("P2", "Bot"), bot("P3", "Bot")]);
    let guard = 0;
    while (g.status === "playing" && guard++ < 2000) {
      if (g.players.P1.eliminated) break; // bots auto-play the rest
      if (g.phase === "reveal") {
        makeLiarsDiceMove(g, "P1", { type: "next_round" });
        continue;
      }
      const dict = liarsDiceGameToDict(g);
      const bidTooRich = g.current_bid && g.current_bid.quantity > dict.total_dice / 2;
      if (g.current_bid && (bidTooRich || !dict.raise_options.length)) {
        makeLiarsDiceMove(g, "P1", { type: "challenge" });
      } else {
        const option = dict.raise_options[0];
        makeLiarsDiceMove(g, "P1", { type: "bid", quantity: option.quantity, face: option.min_face });
      }
    }
    assert.equal(g.status, "complete", `seed ${seed} never finished`);
    assert.ok(g.winner, `seed ${seed} finished without a winner`);
    assert.ok(guard < 2000, `seed ${seed} tripped the guard`);
  }
});

test("bot policy: challenges an absurd bid, raises legally off a plausible one", () => {
  const table = {
    dice: [2, 3, 4, 5, 6],
    totalDice: 10,
    onesWild: true,
    faces: 6,
    random: () => 0.5,
  };
  const absurd = liarsDiceBotAction({
    ...table,
    currentBid: { quantity: 10, face: 6 },
    raiseOptions: [],
  });
  assert.equal(absurd.type, "challenge");
  const plausible = liarsDiceBotAction({
    ...table,
    currentBid: { quantity: 2, face: 3 },
    raiseOptions: [{ quantity: 2, min_face: 4 }, { quantity: 3, min_face: 2 }, { quantity: 4, min_face: 2 }],
  });
  assert.equal(plausible.type, "bid");
  assert.ok(
    plausible.quantity > 2 || (plausible.quantity === 2 && plausible.face > 3),
    `bot raise ${plausible.quantity}x${plausible.face} does not beat 2x3`,
  );
});

test("bot math: bid truth chances are exact at the edges", () => {
  const view = { dice: [4, 4, 1], totalDice: 3, onesWild: true, faces: 6 };
  // The bot holds all the dice: three effective 4s, so "three 4s" is certain
  // and "four 4s" is impossible.
  assert.equal(liarsDiceBidTruthChance(view, 3, 4), 1);
  assert.equal(liarsDiceBidTruthChance(view, 4, 4), 0);
  // One unknown die: it backs a 5-bid with probability 2/6 (face or wild).
  const oneUnknown = { dice: [5], totalDice: 2, onesWild: true, faces: 6 };
  assert.ok(Math.abs(liarsDiceBidTruthChance(oneUnknown, 2, 5) - 2 / 6) < 1e-12);
});

// ---- projection id + registry --------------------------------------------------

test("projection: the dict pins the opaque game id and per-seat turn flags", () => {
  const g = twoHumans([1, 2, 3, 4, 5], [2, 3, 4, 5, 6]);
  const dict = liarsDiceGameToDict(g);
  assert.equal(dict.game_id, LIARS_DICE_GAME_ID);
  assert.equal(dict.players.find((seat) => seat.mark === "P1").is_turn, true);
  assert.equal(dict.players.find((seat) => seat.mark === "P2").is_turn, false);
  assert.equal(dict.can_continue, false);
});
