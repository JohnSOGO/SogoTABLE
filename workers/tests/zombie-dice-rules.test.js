import assert from "node:assert/strict";
import test from "node:test";
import {
  ZOMBIE_DICE_GAME_ID, ZOMBIE_DICE_CUP, ZOMBIE_DICE_FACES,
  isZombieDiceGame, newZombieDiceGame, initZombieDiceSeats, makeZombieDiceMove,
  zombieDiceGameToDict, zombieDiceScoreByMark, setZombieDiceRandom,
} from "../games/zombie-dice/rules.js";
import { zombieDiceRollOdds, zombieDiceDrawCombos } from "../games/zombie-dice/ai.js";

const human = (mark, name) => ({ mark, name, kind: "human" });
const bot = (mark, name, level = 2) => ({ mark, name, kind: "bot", bot_level: level });

// Deterministic RNG: hands out the queued values in order, throws when the
// test mis-counts. A roll consumes one value per DRAWN die (cup draws first,
// colors ordered green→yellow→red), then one value per die rolled (held feet
// first, then the draws). Face windows (value*6): green brain<3, feet<5,
// else shotgun; yellow brain<2, feet<4; red brain<1, feet<3.
function rig(values) {
  const queue = values.slice();
  setZombieDiceRandom(() => {
    if (!queue.length) throw new Error("test RNG exhausted");
    return queue.shift();
  });
}

function twoHumans() {
  const g = newZombieDiceGame();
  initZombieDiceSeats(g, [human("P1", "A"), human("P2", "B")]);
  return g;
}

test.afterEach(() => setZombieDiceRandom(Math.random));

// ---- spec pins (Rules Ledger: Setup + face table) ---------------------------

test("setup: 13 dice per cup (6 green / 4 yellow / 3 red), 6 faces per die, target 13", () => {
  assert.deepEqual(ZOMBIE_DICE_CUP, { green: 6, yellow: 4, red: 3 });
  assert.deepEqual(ZOMBIE_DICE_FACES.green, { brain: 3, feet: 2, shotgun: 1 });
  assert.deepEqual(ZOMBIE_DICE_FACES.yellow, { brain: 2, feet: 2, shotgun: 2 });
  assert.deepEqual(ZOMBIE_DICE_FACES.red, { brain: 1, feet: 2, shotgun: 3 });
  const g = twoHumans();
  assert.equal(g.target_brains, 13);
  assert.equal(g.round, 1);
  assert.equal(isZombieDiceGame(g), true);
  ["P1", "P2"].forEach((mark) => {
    const seat = g.players[mark];
    assert.equal(seat.score, 0);
    assert.deepEqual(seat.cup, { green: 6, yellow: 4, red: 3 });
    assert.equal(seat.phase, "ready");
  });
});

// ---- Ledger: draw + roll classification -------------------------------------

test("roll: draws to 3 from the cup and sets aside brains, shotguns, and feet", () => {
  const g = twoHumans();
  // Draw green, green, green; faces brain, feet, shotgun.
  rig([0, 0, 0, 0.1, 0.6, 0.99]);
  makeZombieDiceMove(g, "P1", { type: "roll" });
  const seat = g.players.P1;
  assert.equal(seat.turn_brains, 1);
  assert.deepEqual(seat.brains_rolled, ["green"]);
  assert.equal(seat.shotguns, 1);
  assert.deepEqual(seat.shotguns_rolled, ["green"]);
  assert.deepEqual(seat.hand, ["green"]);
  assert.deepEqual(seat.cup, { green: 3, yellow: 4, red: 3 });
  assert.equal(seat.phase, "rolled");
  assert.equal(seat.resolved, false);
  assert.equal(g.last_move.type, "roll");
  assert.equal(g.last_move.rolled.length, 3);
  assert.deepEqual(g.last_move.rolled[0], { color: "green", face: "brain" });
});

test("roll: kept feet re-roll with their colors; only the shortfall is drawn", () => {
  const g = twoHumans();
  // Roll 1: three greens land feet, feet, brain -> hand [g, g].
  rig([0, 0, 0, 0.6, 0.6, 0.1]);
  makeZombieDiceMove(g, "P1", { type: "roll" });
  assert.deepEqual(g.players.P1.hand, ["green", "green"]);
  // Roll 2: draws exactly ONE die (green); order is held, held, drawn.
  rig([0, 0.1, 0.99, 0.6]);
  makeZombieDiceMove(g, "P1", { type: "roll" });
  const seat = g.players.P1;
  assert.equal(seat.turn_brains, 2);
  assert.equal(seat.shotguns, 1);
  assert.deepEqual(seat.hand, ["green"]);
  assert.deepEqual(seat.cup, { green: 2, yellow: 4, red: 3 }); // 3 + 1 drawn
  assert.equal(seat.roll_count, 2);
});

test("roll: yellow and red dice use their own face windows", () => {
  const g = twoHumans();
  // Draw yellow (6/13 <= r < 10/13), red (r >= 10/13), red; faces brain, feet, shotgun.
  rig([0.5, 0.9, 0.9, 0.2, 0.4, 0.6]);
  makeZombieDiceMove(g, "P1", { type: "roll" });
  const seat = g.players.P1;
  assert.deepEqual(seat.brains_rolled, ["yellow"]);
  assert.deepEqual(seat.hand, ["red"]);
  assert.deepEqual(seat.shotguns_rolled, ["red"]);
  assert.deepEqual(seat.cup, { green: 6, yellow: 3, red: 1 });
});

// ---- Ledger: bust at 3 shotguns ---------------------------------------------

test("bust: a third shotgun ends the turn and scores nothing", () => {
  const g = twoHumans();
  // Roll 1: greens -> shotgun, shotgun, brain.
  rig([0, 0, 0, 0.99, 0.99, 0.1]);
  makeZombieDiceMove(g, "P1", { type: "roll" });
  assert.equal(g.players.P1.shotguns, 2);
  assert.equal(g.players.P1.turn_brains, 1);
  // Roll 2: greens -> shotgun on the first die = bust regardless of the rest.
  rig([0, 0, 0, 0.99, 0.1, 0.1]);
  makeZombieDiceMove(g, "P1", { type: "roll" });
  const seat = g.players.P1;
  assert.equal(seat.shotguns, 3);
  assert.equal(seat.turn_brains, 0, "a bust scores nothing this turn");
  assert.equal(seat.score, 0);
  assert.equal(seat.finish_state, "busted");
  assert.equal(seat.resolved, true);
  assert.equal(g.last_move.type, "bust");
  assert.equal(g.last_move.turn_brains, 0);
});

// ---- Ledger: stop and score --------------------------------------------------

test("bank: scores 1 per brain and resolves the seat", () => {
  const g = twoHumans();
  rig([0, 0, 0, 0.1, 0.1, 0.1]); // 3 green brains
  makeZombieDiceMove(g, "P1", { type: "roll" });
  makeZombieDiceMove(g, "P1", { type: "bank" });
  const seat = g.players.P1;
  assert.equal(seat.score, 3);
  assert.equal(seat.finish_state, "banked");
  assert.equal(seat.resolved, true);
  assert.equal(g.last_move.type, "bank");
  assert.equal(zombieDiceScoreByMark(g).P1, 3);
});

test("rejects: bank before rolling, moves after resolving, bots, garbage actions", () => {
  const g = twoHumans();
  assert.throws(() => makeZombieDiceMove(g, "P1", { type: "bank" }), /Roll before/);
  assert.throws(() => makeZombieDiceMove(g, "P1", { type: "eat_brains" }), /action is required/);
  assert.throws(() => makeZombieDiceMove(g, "P9", { type: "roll" }), /not seated/);
  rig([0, 0, 0, 0.1, 0.1, 0.1]);
  makeZombieDiceMove(g, "P1", { type: "roll" });
  makeZombieDiceMove(g, "P1", { type: "bank" });
  assert.throws(() => makeZombieDiceMove(g, "P1", { type: "bank" }), /already finished/);
  const withBot = newZombieDiceGame();
  setZombieDiceRandom(Math.random);
  initZombieDiceSeats(withBot, [human("P1", "A"), bot("P2", "Buddy")]);
  assert.throws(() => makeZombieDiceMove(withBot, "P2", { type: "roll" }), /resolved automatically/);
});

// ---- Ledger: cup refill (Brrrains?) -------------------------------------------

test("cup refill: brains return to the cup, the tally and shotguns stay", () => {
  const g = twoHumans();
  const seat = g.players.P1;
  // Hand-crafted deep turn: 13 dice = 1 in cup + 9 brains + 2 shotguns + 1 foot.
  seat.cup = { green: 1, yellow: 0, red: 0 };
  seat.brains_rolled = ["green", "green", "green", "green", "yellow", "yellow", "yellow", "red", "red"];
  seat.shotguns_rolled = ["yellow", "red"];
  seat.shotguns = 2;
  seat.turn_brains = 9;
  seat.hand = ["green"];
  seat.phase = "rolled";
  // Needs 2 dice, cup holds 1 -> refill first: cup becomes 5g/3y/2r (10 dice).
  // Draw green, green; faces brain, brain, brain (all three dice green).
  rig([0, 0, 0.1, 0.1, 0.1]);
  makeZombieDiceMove(g, "P1", { type: "roll" });
  const after = g.players.P1; // normalization replaces the seat object
  assert.equal(after.turn_brains, 12, "the noted brains survive the refill");
  assert.equal(after.shotguns, 2, "shotguns never return to the cup");
  assert.deepEqual(after.brains_rolled, ["green", "green", "green"], "only post-refill brain dice are set aside");
  assert.deepEqual(after.cup, { green: 3, yellow: 3, red: 2 }, "refilled cup minus the two drawn");
  makeZombieDiceMove(g, "P1", { type: "bank" });
  assert.equal(g.players.P1.score, 12);
});

// ---- Ledger: round barrier + endgame ------------------------------------------

test("round barrier: next round starts on a roll; scores and cups reset per turn", () => {
  const g = twoHumans();
  rig([0, 0, 0, 0.1, 0.1, 0.1]); // P1: 3 brains
  makeZombieDiceMove(g, "P1", { type: "roll" });
  makeZombieDiceMove(g, "P1", { type: "bank" });
  rig([0, 0, 0, 0.6, 0.6, 0.6]); // P2: 3 feet, no brains
  makeZombieDiceMove(g, "P2", { type: "roll" });
  makeZombieDiceMove(g, "P2", { type: "bank" });
  assert.equal(g.round_pending_advance, true);
  assert.equal(g.round, 1);
  rig([0, 0, 0, 0.1, 0.6, 0.6]); // P1 rolls to open round 2
  makeZombieDiceMove(g, "P1", { type: "roll" });
  assert.equal(g.round, 2);
  assert.equal(g.round_pending_advance, false);
  assert.equal(g.players.P1.score, 3, "banked brains carry across rounds");
  assert.equal(g.players.P1.turn_brains, 1);
  assert.equal(g.players.P2.phase, "ready");
  assert.deepEqual(g.players.P2.cup, { green: 6, yellow: 4, red: 3 }, "each turn rolls from a full cup");
});

test("endgame: 13+ ends the game at the round's close, most brains wins", () => {
  const g = twoHumans();
  g.players.P1.turn_brains = 13;
  g.players.P1.phase = "rolled";
  makeZombieDiceMove(g, "P1", { type: "bank" });
  assert.equal(g.status, "playing", "the round must finish before the game ends");
  rig([0, 0, 0, 0.6, 0.6, 0.6]);
  makeZombieDiceMove(g, "P2", { type: "roll" });
  makeZombieDiceMove(g, "P2", { type: "bank" });
  assert.equal(g.status, "complete");
  assert.equal(g.winner, "P1");
  assert.equal(g.last_move.type, "complete");
});

test("tiebreaker: tied leaders (only) play on; others sit out; scores accumulate", () => {
  const g = newZombieDiceGame();
  initZombieDiceSeats(g, [human("P1", "A"), human("P2", "B"), human("P3", "C")]);
  // Craft the trigger round: P1 banks to 13, P3 already banked 5, P2 banks to 13.
  g.players.P1.turn_brains = 13;
  g.players.P1.phase = "rolled";
  makeZombieDiceMove(g, "P1", { type: "bank" });
  g.players.P3.score = 5;
  g.players.P3.phase = "done";
  g.players.P3.finish_state = "banked";
  g.players.P3.resolved = true;
  g.players.P2.turn_brains = 13;
  g.players.P2.phase = "rolled";
  makeZombieDiceMove(g, "P2", { type: "bank" });
  assert.equal(g.status, "playing");
  assert.equal(g.tiebreaker, true);
  assert.deepEqual(g.active_marks, ["P1", "P2"]);
  assert.equal(g.round_pending_advance, true);
  // P1's roll opens the tiebreaker round; P3 is sitting and cannot act.
  rig([0, 0, 0, 0.1, 0.6, 0.6]); // P1: 1 brain
  makeZombieDiceMove(g, "P1", { type: "roll" });
  assert.equal(g.players.P3.finish_state, "sitting");
  assert.throws(() => makeZombieDiceMove(g, "P3", { type: "roll" }), /sitting out/);
  const dict = zombieDiceGameToDict(g);
  assert.equal(dict.players.find((seat) => seat.mark === "P3").active, false);
  makeZombieDiceMove(g, "P1", { type: "bank" }); // 14
  rig([0, 0, 0, 0.6, 0.6, 0.6]); // P2: no brains
  makeZombieDiceMove(g, "P2", { type: "roll" });
  makeZombieDiceMove(g, "P2", { type: "bank" }); // stays 13
  assert.equal(g.status, "complete");
  assert.equal(g.winner, "P1");
  assert.equal(g.players.P3.score, 5, "sitting seats are untouched");
});

test("tiebreaker between bots only auto-resolves (no human roll can start it)", () => {
  setZombieDiceRandom(Math.random);
  const g = newZombieDiceGame();
  initZombieDiceSeats(g, [human("P1", "A"), bot("P2", "Buddy"), bot("P3", "Cipher", 3)]);
  // Force the barrier into a bot-vs-bot tie: both bots at 13, human resolving last.
  ["P2", "P3"].forEach((mark) => {
    const seat = g.players[mark];
    seat.score = 13;
    seat.phase = "done";
    seat.finish_state = "banked";
    seat.resolved = true;
  });
  g.players.P1.turn_brains = 2;
  g.players.P1.phase = "rolled";
  makeZombieDiceMove(g, "P1", { type: "bank" });
  assert.equal(g.status, "complete", "bot-only tiebreaker rounds must play out on the spot");
  assert.ok(["P2", "P3"].includes(g.winner));
  assert.ok(g.players[g.winner].score > 13);
});

// ---- bots ---------------------------------------------------------------------

test("bots resolve their whole turn at round start via the human rules path", () => {
  setZombieDiceRandom(Math.random);
  const g = newZombieDiceGame();
  initZombieDiceSeats(g, [human("P1", "A"), bot("P2", "Buddy", 2), bot("P3", "Overlord", 4)]);
  ["P2", "P3"].forEach((mark) => {
    const seat = g.players[mark];
    assert.equal(seat.resolved, true);
    assert.ok(["banked", "busted"].includes(seat.finish_state));
    assert.ok(seat.bot_trajectory.length >= 2, "a baseline plus at least one roll");
    assert.equal(seat.bot_trajectory[0].total, 0);
    const final = seat.bot_trajectory[seat.bot_trajectory.length - 1];
    assert.equal(final.status, seat.finish_state);
    assert.equal(final.total, seat.score, "the trajectory ends on the banked total");
    if (seat.finish_state === "busted") assert.equal(seat.score, 0);
  });
  assert.equal(g.players.P1.resolved, false, "humans still play their own turn");
});

test("bot bust is recorded honestly: three shotguns, zero brains banked", () => {
  const g = newZombieDiceGame();
  // First bot roll: three greens, all shotguns -> instant bust, no decisions consumed.
  rig([0, 0, 0, 0.99, 0.99, 0.99]);
  initZombieDiceSeats(g, [human("P1", "A"), bot("P2", "Buddy")]);
  const seat = g.players.P2;
  assert.equal(seat.finish_state, "busted");
  assert.equal(seat.score, 0);
  assert.equal(seat.shotguns, 3);
  assert.equal(seat.bot_trajectory.length, 2);
  assert.equal(seat.bot_trajectory[1].status, "busted");
});

// ---- projection (the wire contract) --------------------------------------------

test("projection: toDict emits every field the client reads, per seat and game", () => {
  const g = twoHumans();
  rig([0, 0, 0, 0.1, 0.6, 0.99]);
  makeZombieDiceMove(g, "P1", { type: "roll" });
  const dict = zombieDiceGameToDict(g);
  assert.equal(dict.game_id, ZOMBIE_DICE_GAME_ID);
  ["target_brains", "round", "round_pending_advance", "tiebreaker", "active_marks",
    "status", "winner", "move_count", "last_move", "players"].forEach((key) => {
    assert.ok(key in dict, `game field ${key} missing from projection`);
  });
  assert.deepEqual(dict.players.map((seat) => seat.mark), ["P1", "P2"]);
  const seat = dict.players[0];
  ["mark", "score", "turn_brains", "shotguns", "cup", "hand", "brains_rolled",
    "shotguns_rolled", "rolled", "phase", "finish_state", "resolved", "is_bot",
    "active", "roll_count", "bot_trajectory", "can_roll", "can_bank"].forEach((key) => {
    assert.ok(key in seat, `seat field ${key} missing from projection`);
  });
  assert.deepEqual(seat.rolled[0], { color: "green", face: "brain" });
  assert.equal(seat.can_roll, true);
  assert.equal(seat.can_bank, true);
  assert.equal(dict.players[1].can_bank, false, "a seat that has not rolled cannot bank");
});

test("normalization clamps hostile persisted state instead of trusting it", () => {
  const g = twoHumans();
  g.players.P1.score = -50;
  g.players.P1.cup = { green: 99, yellow: -2, red: "nope" };
  g.players.P1.hand = ["purple", "green", "green", "green", "green"];
  g.players.P1.phase = "hacked";
  const dict = zombieDiceGameToDict(g);
  const seat = dict.players[0];
  assert.equal(seat.score, 0);
  assert.deepEqual(seat.cup, { green: 6, yellow: 0, red: 3 });
  assert.deepEqual(seat.hand, ["green", "green", "green"]);
  assert.equal(seat.phase, "ready");
});

// ---- ai maths -------------------------------------------------------------------

test("ai odds: exact bust chance and expected brains for an all-green roll", () => {
  const odds = zombieDiceRollOdds(ZOMBIE_DICE_FACES, { green: 3, yellow: 0, red: 0 }, [], 0);
  assert.ok(Math.abs(odds.bustChance - 1 / 216) < 1e-12);
  assert.ok(Math.abs(odds.expectedBrains - 1.5) < 1e-12);
  // Two shotguns held: one more shotgun among three red dice busts.
  const hot = zombieDiceRollOdds(ZOMBIE_DICE_FACES, { green: 0, yellow: 0, red: 3 }, [], 2);
  assert.ok(Math.abs(hot.bustChance - (1 - 0.5 ** 3)) < 1e-12);
});

test("ai draw combos: hypergeometric probabilities sum to 1", () => {
  const combos = zombieDiceDrawCombos({ green: 6, yellow: 4, red: 3 }, 3);
  const total = combos.reduce((sum, combo) => sum + combo.prob, 0);
  assert.ok(Math.abs(total - 1) < 1e-12);
  combos.forEach((combo) => assert.equal(combo.colors.length, 3));
});
