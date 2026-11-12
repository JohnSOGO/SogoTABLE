// Bloomwork rules: seating, the simultaneous pick barrier, stale/duplicate
// handling, hidden picks in the viewer projection, round tiling, skip vote,
// options and game end.
import assert from "node:assert/strict";
import test from "node:test";
import {
  BLOOMWORK_GAME_ID, newBloomworkGame, initBloomworkSeats, makeBloomworkMove, bloomworkGameToDict,
  bloomworkGameToDictForViewer, bloomworkScoreByMark, setBloomworkRandom, setBloomworkOptions,
  bloomworkPriorityOrder, isBloomworkGame,
} from "../games/bloomwork/rules.js";
import { emptyBed } from "../games/bloomwork/board.js";
import { moveHandlerFor, newGame, gameToDictForViewer } from "../games/handlers.js";

function seeded(seed = 11) {
  let s = seed;
  setBloomworkRandom(() => { s = (s * 16807) % 2147483647; return s / 2147483647; });
}
const human = (mark) => ({ mark, kind: "human" });
const bot = (mark, level = 2) => ({ mark, kind: "bot", bot_level: level });

function start(seats, options) {
  seeded();
  const game = newBloomworkGame();
  if (options) setBloomworkOptions(game, { bloom_options: options });
  initBloomworkSeats(game, seats);
  return game;
}
// A legal pick: first stall with flowers (or the Square), first flower, compost.
function anyPick(game) {
  const i = game.stalls.findIndex((s) => s.length);
  const source = i >= 0 ? i : "center";
  const tiles = i >= 0 ? game.stalls[i] : game.center;
  return { type: "PICK", round: game.round, pick: game.pick, source, flower: tiles[0], row: -1 };
}

test("registers as a host-start game with a viewer mask", () => {
  const game = newGame(BLOOMWORK_GAME_ID);
  const row = moveHandlerFor(game);
  assert.ok(row && row.resolvesBotsInternally && row.initSeats && row.applyStartOptions);
  assert.equal(isBloomworkGame(newBloomworkGame()), true);
});

test("seating: needs 2–6 gardeners; stalls = 2n+1 with four flowers each", () => {
  assert.throws(() => initBloomworkSeats(newBloomworkGame(), [human("P1")]), /at least 2/);
  assert.throws(() => initBloomworkSeats(newBloomworkGame(), "1234567".split("").map((n) => bot("P" + n))), /at most 6/);
  const game = start([human("P1"), human("P2"), human("P3")]);
  assert.equal(game.stalls.length, 7);
  assert.ok(game.stalls.every((s) => s.length === 4));
  assert.equal(game.bag.length, 100 - 28);
  assert.equal(game.phase, "drafting");
});

test("the barrier holds until every human picks; picks stay hidden from other viewers", () => {
  const game = start([human("P1"), human("P2"), bot("P3")]);
  makeBloomworkMove(game, "P1", anyPick(game));
  assert.equal(game.pick, 0, "P2 still to pick");
  const dict = bloomworkGameToDict(game);
  assert.equal(dict.bag, undefined, "bag order never leaves the Worker");
  const forP2 = gameToDictForViewer(dict, "P2", "active");
  const p1 = forP2.players.find((p) => p.mark === "P1");
  assert.equal(p1.has_committed, true);
  assert.equal(p1.committed, null, "P2 can't see P1's pick");
  const forP1 = bloomworkGameToDictForViewer(dict, "P1");
  assert.ok(forP1.players.find((p) => p.mark === "P1").committed);
  makeBloomworkMove(game, "P2", anyPick(game));
  assert.equal(game.pick, 1, "step resolved, bot committed at the close");
  assert.ok(game.events.some((e) => e.type === "take" && e.mark === "P3") || game.events.some((e) => e.mark === "P3"));
});

test("duplicates are idempotent; stale and out-of-range picks are rejected loudly", () => {
  const game = start([human("P1"), human("P2")]);
  const pick = anyPick(game);
  makeBloomworkMove(game, "P1", pick);
  makeBloomworkMove(game, "P1", { ...pick, flower: "fern", source: 0 }); // retry with a different body: first wins
  assert.equal(game.players.P1.committed.flower, pick.flower);
  assert.throws(() => makeBloomworkMove(game, "P2", { ...anyPick(game), round: 3 }), /Refresh to catch up/);
  assert.throws(() => makeBloomworkMove(game, "P2", { ...anyPick(game), pick: 5 }), /ahead of the table/);
  assert.throws(() => makeBloomworkMove(game, "P2", { ...anyPick(game), source: 99 }), /market stall/);
  const missing = ["rose", "iris", "sun", "lilac", "fern"].find((f) => !game.stalls[0].includes(f));
  assert.throws(() => makeBloomworkMove(game, "P2", { ...anyPick(game), source: 0, flower: missing }), /isn't there/);
  assert.throws(() => makeBloomworkMove(game, "P2", { ...anyPick(game), type: "READY_NEXT" }), /round summary/);
  makeBloomworkMove(game, "P2", anyPick(game));
  assert.equal(game.pick, 1);
  assert.throws(() => makeBloomworkMove(game, "P2", { ...anyPick(game), pick: 0 }), /earlier step/);
});

test("illegal row is rejected (row holds another flower)", () => {
  const game = start([human("P1"), human("P2")]);
  const flower = game.stalls[0][0];
  const other = ["rose", "iris", "sun", "lilac", "fern"].find((f) => f !== flower);
  game.players.P1.rows[3] = { flower: other, count: 1 };
  assert.throws(() => makeBloomworkMove(game, "P1", { type: "PICK", round: 1, pick: 0, source: 0, flower, row: 3 }), /can't go in that row/);
});

test("priority rotates every pick and the round leader goes first", () => {
  const game = start([human("P1"), human("P2"), human("P3")]);
  assert.deepEqual(bloomworkPriorityOrder(game), ["P1", "P2", "P3"]);
  game.pick = 1;
  assert.deepEqual(bloomworkPriorityOrder(game), ["P2", "P3", "P1"]);
  game.first = "P3"; game.pick = 0;
  assert.deepEqual(bloomworkPriorityOrder(game), ["P3", "P1", "P2"]);
});

test("round end: full rows plant and score, compost costs points, Early Bird leads next round", () => {
  const game = start([human("P1"), human("P2")]);
  let guard = 0;
  while (game.phase === "drafting" && guard++ < 200) {
    makeBloomworkMove(game, "P1", anyPick(game));
    makeBloomworkMove(game, "P2", anyPick(game));
  }
  assert.equal(game.phase, "review");
  const bird = game.events.find((e) => e.type === "take" && e.bird);
  assert.ok(bird);
  assert.equal(game.first, bird.mark);
  assert.ok(game.last_round && game.last_round.seats.P1);
  assert.ok(game.players.P1.score >= 0 && game.players.P2.score >= 0, "score floors at zero");
  assert.ok(game.players.P1.compost.length === 0, "compost emptied");
  makeBloomworkMove(game, "P1", { type: "READY_NEXT", round: 1 });
  assert.equal(game.round, 1, "waits for P2");
  makeBloomworkMove(game, "P2", { type: "READY_NEXT", round: 1 });
  assert.equal(game.round, 2);
  assert.equal(game.phase, "drafting");
  assert.ok(game.stalls.every((s) => s.length === 4));
});

test("planting a full row scores adjacency into the bed", () => {
  const game = start([human("P1"), human("P2")]);
  const seat = game.players.P1;
  seat.bed = emptyBed();
  seat.rows[0] = { flower: "rose", count: 1 }; // rose column in row 0 is 0
  seat.bed[1][0] = true;
  // Empty the market so the next step ends the round.
  game.stalls = game.stalls.map(() => []);
  game.center = ["fern"];
  makeBloomworkMove(game, "P1", { type: "PICK", round: 1, pick: 0, source: "center", flower: "fern", row: -1 });
  makeBloomworkMove(game, "P2", { type: "PICK", round: 1, pick: 0, source: "center", flower: "fern", row: -1 });
  const log = game.last_round.seats.P1;
  assert.deepEqual(log.planted.map((p) => [p.row, p.col, p.points]), [[0, 0, 2]]);
  assert.equal(game.players.P1.bed[0][0], true);
  assert.deepEqual(game.players.P1.rows[0], { flower: null, count: 0 });
});

test("game ends after the round someone completes a bed row; bonuses and results", () => {
  const game = start([human("P1"), human("P2")]);
  game.players.P1.bed[0] = [true, true, true, true, false];
  game.players.P1.rows[0] = { flower: "fern", count: 1 }; // fern column in row 0 is 4
  game.stalls = game.stalls.map(() => []);
  game.center = ["sun"];
  makeBloomworkMove(game, "P1", { type: "PICK", round: 1, pick: 0, source: "center", flower: "sun", row: -1 });
  makeBloomworkMove(game, "P2", { type: "PICK", round: 1, pick: 0, source: "center", flower: "sun", row: -1 });
  assert.equal(game.status, "complete");
  assert.equal(game.winner, "P1");
  const p1 = game.results.find((r) => r.mark === "P1");
  assert.equal(p1.rows, 1);
  assert.equal(p1.place, 1);
  assert.deepEqual(bloomworkScoreByMark(game), { P1: game.players.P1.score, P2: game.players.P2.score });
  assert.throws(() => makeBloomworkMove(game, "P1", anyPick(game)), /finished/);
});

test("an all-bot table plays to completion; quick option caps at round 3", () => {
  for (const level of [1, 2, 3, 4]) {
    const game = start([bot("P1", level), bot("P2", level), bot("P3", level)]);
    assert.equal(game.status, "complete");
    assert.ok(game.results.length === 3);
  }
  const quick = start([bot("P1"), bot("P2")], { length: "quick" });
  assert.equal(quick.status, "complete");
  assert.equal(quick.round, 3);
  assert.deepEqual(quick.options, { length: "quick", helps: true });
});

test("skip vote: only done seats vote; unanimous skip releases the barrier; skipped seat can't pick", () => {
  const game = start([human("P1"), human("P2"), human("P3")]);
  assert.throws(() => makeBloomworkMove(game, "P1", { type: "SKIP_PLAYER", target: "P3", round: 1 }), /already done/);
  makeBloomworkMove(game, "P1", anyPick(game));
  makeBloomworkMove(game, "P2", anyPick(game));
  makeBloomworkMove(game, "P1", { type: "SKIP_PLAYER", target: "P3", round: 1 });
  assert.deepEqual(game.skip_votes, { P3: ["P1"] });
  assert.equal(game.pick, 0);
  makeBloomworkMove(game, "P2", { type: "SKIP_PLAYER", target: "P3", round: 1 });
  assert.equal(game.pick, 1, "skip released the step");
  assert.equal(game.players.P3.skipped, true);
  assert.throws(() => makeBloomworkMove(game, "P3", anyPick(game)), /skipped this round/);
});

test("normalize survives a corrupted blob", () => {
  const game = start([human("P1"), human("P2")]);
  game.players.P1.rows = "nope";
  game.stalls = [["rose", "weed", 7]];
  game.round = -4;
  const dict = bloomworkGameToDict(game);
  assert.equal(dict.round, 1);
  assert.deepEqual(dict.stalls, [["rose"]]);
  assert.equal(dict.players[0].rows.length, 5);
});

test("a finished game stays finished: no new round is dealt after game over", () => {
  const game = start([bot("P1"), bot("P2")], { length: "quick" });
  assert.equal(game.status, "complete");
  const last = game.events[game.events.length - 1];
  assert.equal(last.type, "game_over");
  assert.equal(game.round, game.last_round.round);
});

test("an empty market (bag and discards dry) never deadlocks the table", () => {
  const game = start([human("P1"), human("P2")]);
  game.bag = []; game.lid = [];
  game.stalls = game.stalls.map(() => []);
  game.center = ["rose"];
  makeBloomworkMove(game, "P1", { type: "PICK", round: 1, pick: 0, source: "center", flower: "rose", row: 0 });
  makeBloomworkMove(game, "P2", { type: "PICK", round: 1, pick: 0, source: "center", flower: "rose", row: 0 });
  makeBloomworkMove(game, "P1", { type: "READY_NEXT", round: 1 });
  makeBloomworkMove(game, "P2", { type: "READY_NEXT", round: 1 });
  // Round 2 deals nothing, so it ends at once and goes to review again.
  assert.equal(game.round, 2);
  assert.equal(game.phase, "review");
});
