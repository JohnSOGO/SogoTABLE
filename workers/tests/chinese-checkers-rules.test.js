import assert from "node:assert/strict";
import test from "node:test";
import {
  CHINESE_CHECKERS_GAME_ID, isChineseCheckersGame, newChineseCheckersGame, initChineseCheckersSeats,
  setChineseCheckersOptions, normalizeChineseCheckersOptions, makeChineseCheckersMove,
  chineseCheckersGameToDict, chineseCheckersGameToDictForViewer, chineseCheckersScoreByMark,
  setChineseCheckersRandom, normalizeChineseCheckersGame,
} from "../games/chinese-checkers/rules.js";
import { armCells, cellInfo, DIRS } from "../games/chinese-checkers/board.js";

const human = (mark) => ({ mark, name: mark, kind: "human" });
const bot = (mark, bot_level = 3) => ({ mark, name: mark, kind: "bot", bot_level });
const humans = (n) => Array.from({ length: n }, (_, i) => human(`P${i + 1}`));

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function makeGame(seats, options = {}, seed = 1) {
  setChineseCheckersRandom(seeded(seed));
  const g = newChineseCheckersGame();
  setChineseCheckersOptions(g, { cc_options: options });
  initChineseCheckersSeats(g, seats);
  return g;
}
const move = (g, mark, from, path, round = g.round) => makeChineseCheckersMove(g, mark, { type: "MOVE", round, from, path });
const pass = (g, mark) => makeChineseCheckersMove(g, mark, { type: "PASS", round: g.round });
const eventsOf = (g, type, round) => g.events.filter((e) => e.type === type && (round === undefined || e.round === round));

const neighbors = (k) => {
  const { q, r } = cellInfo(k);
  return DIRS.map(([dq, dr]) => `${q + dq},${r + dr}`).filter((n) => cellInfo(n));
};
// A seat one step from finishing: its goal minus one edge hole, plus a marble
// on the hexagon next to that hole.
function nearGoal(goalArm, mark) {
  const goal = armCells(goalArm, 10);
  const edge = goal.find((k) => cellInfo(k).depth === 1 && neighbors(k).some((n) => cellInfo(n).arm === -1));
  const from = neighbors(edge).find((n) => cellInfo(n).arm === -1);
  const marbles = Object.fromEntries(goal.filter((k) => k !== edge).map((k) => [k, mark]));
  marbles[from] = mark;
  return { marbles, from, to: edge };
}
const homeOf = (arm, mark) => Object.fromEntries(armCells(arm, 10).map((k) => [k, mark]));

test("ids, predicate, seat bounds (2..6)", () => {
  const g = newChineseCheckersGame();
  assert.equal(g.game_id, CHINESE_CHECKERS_GAME_ID);
  assert.equal(CHINESE_CHECKERS_GAME_ID, "6bc129b1bbed");
  assert.ok(isChineseCheckersGame(g));
  assert.ok(!isChineseCheckersGame({ game_id: "hearts" }));
  assert.throws(() => initChineseCheckersSeats(newChineseCheckersGame(), humans(1)), /at least 2/);
  assert.throws(() => initChineseCheckersSeats(newChineseCheckersGame(), humans(7)), /at most 6/);
});

test("init: arms per PLAN table, 10 marbles each at home, round 1 priority", () => {
  const expected = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] };
  for (const n of [2, 3, 4, 5, 6]) {
    const g = makeGame(humans(n));
    const d = chineseCheckersGameToDict(g);
    assert.deepEqual(d.players.map((p) => p.arm), expected[n]);
    assert.deepEqual(d.players.map((p) => p.goal_arm), expected[n].map((a) => (a + 3) % 6));
    assert.equal(Object.keys(d.marbles).length, 10 * n);
    d.players.forEach((p) => {
      assert.ok(armCells(p.arm, 10).every((k) => d.marbles[k] === p.mark));
      assert.equal(p.marbles_total, 10);
      assert.equal(p.team, null);
      assert.equal(p.committed, false);
    });
    assert.equal(d.round, 1);
    assert.deepEqual(d.priority_order, d.seat_order);
    assert.equal(d.cells.length, 121);
  }
  const quick = makeGame(humans(2), { marbles: 6 });
  assert.equal(Object.keys(quick.marbles).length, 12);
});

test("options: clamped, carried when cc_options is missing; teams only for 4 or 6", () => {
  const g = newChineseCheckersGame();
  setChineseCheckersOptions(g, { cc_options: { jumps: "warp", marbles: 99, capture: "send_home", teams: "on", end: "all", stay_in_goal: "nope", no_parking: 1 } });
  assert.deepEqual(g.options, { jumps: "standard", marbles: 10, capture: "send_home", teams: true, stay_in_goal: true, no_parking: true, anti_block: true, end: "all",
    mode: "rounds", timer: 0, chains: true, allow_pass: true, assists: "full" });
  setChineseCheckersOptions(g, {});
  assert.equal(g.options.capture, "send_home", "missing cc_options leaves options");
  assert.deepEqual(normalizeChineseCheckersOptions("garbage"), normalizeChineseCheckersOptions({}));
  assert.equal(chineseCheckersGameToDict(makeGame(humans(3), { teams: true })).options.teams_active, false);
  const four = chineseCheckersGameToDict(makeGame(humans(4), { teams: true }));
  assert.equal(four.options.teams_active, true);
  assert.deepEqual(four.players.map((p) => p.team), [0, 1, 0, 1]);
  const six = chineseCheckersGameToDict(makeGame(humans(6), { teams: true }));
  assert.deepEqual(six.players.map((p) => p.team), [0, 1, 2, 0, 1, 2]);
});

test("commits: stale rejected, duplicate ignored, retract, pass, bots + skipped rejected", () => {
  const g = makeGame([human("P1"), human("P2"), bot("P3")]);
  assert.throws(() => move(g, "P1", "-1,5", ["-1,4"], g.round + 1), /round 2.*round 1/);
  assert.throws(() => makeChineseCheckersMove(g, "P3", { type: "PASS", round: 1 }), /Bot seats/);
  assert.throws(() => move(g, "P1", "4,-5", ["4,-4"]), /not your marble/);
  assert.throws(() => move(g, "P1", "-1,5", ["-1,3"]), /jump/);
  move(g, "P1", "-1,5", ["-1,4"]);
  move(g, "P1", "-2,5", ["-2,4"]); // duplicate: first commit wins, silently
  assert.deepEqual(g.players.P1.committed, { from: "-1,5", path: ["-1,4"] });
  makeChineseCheckersMove(g, "P1", { type: "RETRACT", round: 1 });
  assert.equal(g.players.P1.committed, null);
  move(g, "P1", "-2,5", ["-2,4"]);
  assert.equal(g.round, 1, "P2 still holds the barrier");
  pass(g, "P2");
  assert.equal(g.round, 2);
  assert.equal(g.marbles["-2,4"], "P1");
  assert.equal(eventsOf(g, "pass", 1)[0].mark, "P2");
  assert.equal(eventsOf(g, "move", 1).length, 2, "P1 + the bot");
  assert.ok(eventsOf(g, "move", 1).some((e) => e.mark === "P3"), "bot committed at barrier close");
  assert.deepEqual(eventsOf(g, "round", 2)[0].priority, ["P2", "P3", "P1"]);
});

test("viewer projection hides other commits and trims legal/stops", () => {
  const g = makeGame(humans(3));
  move(g, "P1", "-1,5", ["-1,4"]);
  const d = chineseCheckersGameToDict(g);
  assert.deepEqual(Object.keys(d.legal).sort(), ["P1", "P2", "P3"]);
  const v2 = chineseCheckersGameToDictForViewer(d, "P2");
  assert.deepEqual(Object.keys(v2.legal), ["P2"]);
  assert.deepEqual(Object.keys(v2.stops), ["P2"]);
  const p1 = v2.players.find((p) => p.mark === "P1");
  assert.equal(p1.committed, true);
  assert.equal(p1.commit, null, "P1's move is hidden from P2");
  assert.ok(!JSON.stringify(v2).includes('"path":["-1,4"]'));
  const v1 = chineseCheckersGameToDictForViewer(d, "P1");
  assert.deepEqual(v1.players.find((p) => p.mark === "P1").commit, { from: "-1,5", path: ["-1,4"] });
  const spectator = chineseCheckersGameToDictForViewer(d, "");
  assert.deepEqual(spectator.legal, {});
  assert.ok(spectator.players.every((p) => p.commit === null));
  // legal shape: steps + hops graph keyed by origin; stops cover steps and hop ends
  const own = v1.legal.P1["-2,6"];
  assert.ok(own && Array.isArray(own.steps) && own.hops["-2,6"]);
});

test("contested hole: rotating priority decides (round 1 P1, round 2 P2)", () => {
  const g = makeGame(humans(2));
  const filler = { "0,4": "P1", "0,-4": "P2" };
  g.marbles = { ...filler, "0,0": "P1", "2,-1": "P2" };
  move(g, "P1", "0,0", ["1,0"]);
  move(g, "P2", "2,-1", ["1,0"]);
  assert.equal(g.marbles["1,0"], "P1");
  const lost = eventsOf(g, "move", 1).find((e) => e.mark === "P2");
  assert.deepEqual([lost.outcome, lost.by], ["bounced", "P1"]);
  g.marbles = { ...filler, "0,0": "P1", "2,-1": "P2" };
  move(g, "P1", "0,0", ["1,0"]);
  move(g, "P2", "2,-1", ["1,0"]);
  assert.equal(g.marbles["1,0"], "P2");
  const lost2 = eventsOf(g, "move", 2).find((e) => e.mark === "P1");
  assert.deepEqual([lost2.outcome, lost2.by], ["bounced", "P2"]);
  // round 2 priority is P2 first, and the events say so
  assert.deepEqual(eventsOf(g, "round", 2)[0].priority, ["P2", "P1"]);
});

test("cut-short chain and capture events through the rules lifecycle", () => {
  const g = makeGame(humans(2), { capture: "send_home" });
  // Round 2 (P2 has priority): P2 steps 3,0 away, cutting P1's two-hop chain.
  pass(g, "P1"); pass(g, "P2");
  g.marbles = { "0,0": "P1", "1,0": "P2", "3,0": "P2", "0,4": "P1" };
  move(g, "P1", "0,0", ["2,0", "4,0"]);
  move(g, "P2", "3,0", ["3,1"]);
  const e = eventsOf(g, "move", 2).find((x) => x.mark === "P1");
  assert.deepEqual([e.outcome, e.to, e.by], ["cut", "2,0", "P2"]);
  assert.deepEqual(e.captured, [{ mark: "P2", from: "1,0", to: "4,-8" }], "only the hop actually made captures");
  assert.equal(g.marbles["4,-8"], "P2");
  assert.equal(g.marbles["1,0"], undefined);
});

test("finish ends the game (end first); score = 100 - distance + 50", () => {
  const g = makeGame(humans(2));
  const near = nearGoal(3, "P1");
  g.marbles = { ...near.marbles, "0,0": "P2", "1,0": "P2" };
  move(g, "P1", near.from, [near.to]);
  pass(g, "P2");
  assert.equal(g.status, "complete");
  assert.deepEqual(g.winners, ["P1"]);
  assert.equal(g.winner, "P1");
  assert.deepEqual(eventsOf(g, "finish")[0], { ...eventsOf(g, "finish")[0], mark: "P1", rank: 1 });
  assert.deepEqual(eventsOf(g, "end")[0].winners, ["P1"]);
  const scores = chineseCheckersScoreByMark(g);
  assert.equal(scores.P1, 150);
  const d = chineseCheckersGameToDict(g);
  assert.equal(scores.P2, Math.max(0, 100 - d.players[1].distance));
  assert.deepEqual(d.results.map((r) => [r.mark, r.rank, r.finished]), [["P1", 1, true], ["P2", 2, false]]);
  assert.deepEqual(d.legal, {});
  assert.throws(() => pass(g, "P2"), /over/);
});

test("end first: same-round finishers share the win", () => {
  const g = makeGame(humans(2));
  const a = nearGoal(3, "P1");
  const b = nearGoal(0, "P2");
  g.marbles = { ...a.marbles, ...b.marbles };
  move(g, "P1", a.from, [a.to]);
  move(g, "P2", b.from, [b.to]);
  assert.equal(g.status, "complete");
  assert.deepEqual(g.winners, ["P1", "P2"]);
  assert.ok(g.results.every((r) => r.rank === 1));
});

test("end all: play on until one seat is left; ranks are finishing order", () => {
  const g = makeGame(humans(3), { end: "all" }); // arms 0,2,4 -> goals 3,5,1
  const a = nearGoal(3, "P1");
  const b = nearGoal(5, "P2");
  g.marbles = { ...a.marbles, ...b.marbles, ...homeOf(4, "P3") };
  move(g, "P1", a.from, [a.to]);
  pass(g, "P2");
  pass(g, "P3");
  assert.equal(g.status, "playing");
  assert.equal(g.players.P1.finished, true);
  assert.throws(() => pass(g, "P1"), /finished/);
  move(g, "P2", b.from, [b.to]);
  pass(g, "P3");
  assert.equal(g.status, "complete");
  assert.deepEqual(g.results.map((r) => [r.mark, r.rank]), [["P1", 1], ["P2", 2], ["P3", 3]]);
  assert.deepEqual(g.winners, ["P1"]);
});

test("anti-block: a full goal that is mostly yours finishes; off, it doesn't", () => {
  for (const anti_block of [true, false]) {
    const g = makeGame(humans(2), { anti_block });
    const near = nearGoal(3, "P1");
    const campers = ["4,-8", "3,-7", "4,-7"];
    g.marbles = { ...near.marbles, "0,0": "P2" };
    campers.forEach((k) => { g.marbles[k] = "P2"; });
    move(g, "P1", near.from, [near.to]);
    pass(g, "P2");
    assert.equal(g.players.P1.finished, anti_block);
    assert.equal(g.status, anti_block ? "complete" : "playing");
  }
});

test("teams: a team wins only when both partners are home", () => {
  const g = makeGame(humans(4), { teams: true }); // P1 arm0 + P3 arm3 = team 0
  const a = nearGoal(3, "P1");
  const c = nearGoal(0, "P3");
  g.marbles = { ...a.marbles, ...c.marbles, ...homeOf(1, "P2"), ...homeOf(4, "P4") };
  move(g, "P1", a.from, [a.to]);
  ["P2", "P3", "P4"].forEach((m) => pass(g, m));
  assert.equal(g.status, "playing", "partner not home yet");
  assert.equal(g.players.P1.finished, true);
  ["P2", "P4"].forEach((m) => pass(g, m));
  move(g, "P3", c.from, [c.to]);
  assert.equal(g.status, "complete");
  assert.deepEqual(g.winners, ["P1", "P3"]);
  assert.deepEqual(g.results.map((r) => r.team), [0, 0, 1, 1]);
});

test("skip vote unblocks the barrier; a skipped seat's commit is rejected", () => {
  const g = makeGame(humans(4));
  assert.throws(() => makeChineseCheckersMove(g, "P1", { type: "SKIP_PLAYER", round: 1, target: "P3" }), /already committed/);
  pass(g, "P1");
  pass(g, "P2");
  makeChineseCheckersMove(g, "P1", { type: "SKIP_PLAYER", round: 1, target: "P3" });
  assert.deepEqual(chineseCheckersGameToDict(g).skip_votes, { P3: ["P1"] });
  makeChineseCheckersMove(g, "P2", { type: "SKIP_PLAYER", round: 1, target: "P3" });
  assert.equal(g.players.P3.skipped, true);
  assert.equal(g.round, 1, "P4 still pending");
  assert.throws(() => pass(g, "P3"), /skipped/);
  pass(g, "P4");
  assert.equal(g.round, 2);
  assert.equal(g.players.P3.skipped, false, "back next round");
  assert.equal(eventsOf(g, "skip", 1)[0].mark, "P3");
});

test("a human with no legal move is auto-passed at the barrier", () => {
  const g = makeGame(humans(2));
  g.marbles = { "0,0": "P2" }; // P1 has nothing to move
  move(g, "P2", "0,0", ["1,0"]);
  assert.equal(g.round, 2);
  assert.equal(eventsOf(g, "pass", 1)[0].mark, "P1");
});

test("round cap ends the game and ranks by remaining distance", () => {
  const g = makeGame(humans(2));
  g.round = 300;
  makeChineseCheckersMove(g, "P1", { type: "MOVE", round: 300, from: "-1,5", path: ["-1,4"] });
  pass(g, "P2");
  assert.equal(g.status, "complete");
  assert.deepEqual(g.winners, ["P1"], "closer to home wins at the cap");
  assert.equal(g.results[0].mark, "P1");
});

test("all-bot tables finish before the cap (2, 3, 4, 6 seats) and stay fast", () => {
  for (const n of [2, 3, 4, 6]) {
    for (const level of [1, 2, 3, 4]) {
      const seats = Array.from({ length: n }, (_, i) => bot(`P${i + 1}`, level));
      const t0 = performance.now();
      const g = makeGame(seats, {}, 7 * n + level);
      const perRound = (performance.now() - t0) / g.round;
      assert.equal(g.status, "complete", `${n} seats L${level}`);
      assert.ok(g.round < 300, `${n} seats L${level} took ${g.round} rounds`);
      assert.ok(g.winners.length >= 1);
      assert.ok(perRound < 100, `${perRound}ms per round`);
      // bots never pass while they have a move
      assert.equal(eventsOf(g, "pass").length, 0, `${n} seats L${level} passed`);
    }
  }
});

test("normalize tolerates garbage stored state", () => {
  const junk = { game_id: "x", status: "??", round: "abc", seat_order: [1, 1, 2], players: "nope", marbles: [], events: "x", options: 5, skip_votes: 3, winners: "P1" };
  normalizeChineseCheckersGame(junk);
  assert.deepEqual(junk.seat_order, ["1", "2"]);
  assert.equal(junk.round, 1);
  const d = chineseCheckersGameToDict(junk);
  assert.equal(d.status, "playing");
  assert.deepEqual(d.marbles, {});
  const shell = chineseCheckersGameToDict(newChineseCheckersGame());
  assert.deepEqual(shell.players, []);
  assert.deepEqual(shell.priority_order, []);
  const g = makeGame(humans(2));
  g.players.P1.committed = { from: "99,99", path: "x" };
  g.marbles["50,50"] = "P1";
  g.marbles["0,0"] = "ghost";
  normalizeChineseCheckersGame(g);
  assert.equal(g.players.P1.committed, null);
  assert.equal(g.marbles["50,50"], undefined);
  assert.equal(g.marbles["0,0"], undefined);
});
