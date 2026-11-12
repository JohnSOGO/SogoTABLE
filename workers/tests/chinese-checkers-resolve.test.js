// Round-barrier conflict resolution (PLAN.md "Parallel play"): commits applied
// one at a time in priority order, each re-checked against the board left by
// the higher-priority moves.
import assert from "node:assert/strict";
import test from "node:test";
import { resolveRound } from "../games/chinese-checkers/resolve.js";
import { seatGeometry } from "../games/chinese-checkers/board.js";

const OPTS = { jumps: "standard", stay_in_goal: true, no_parking: false, capture: "off" };
const GEO = { P1: seatGeometry(0, 10), P2: seatGeometry(3, 10), P3: seatGeometry(1, 10) };
const run = (marbles, commits, options = OPTS) => resolveRound({
  marbles, options, commits: commits.map(([mark, commit]) => ({ mark, commit })),
  geoOf: (m) => GEO[m], teamOf: () => null,
});
const moveOf = (res, mark) => res.events.find((e) => e.type === "move" && e.mark === mark);

test("contested hole: the higher-priority seat gets it, the other bounces naming who had priority", () => {
  const board = { "0,0": "P1", "2,-1": "P2" };
  const p1 = ["P1", { from: "0,0", path: ["1,0"] }];
  const p2 = ["P2", { from: "2,-1", path: ["1,0"] }];
  const a = run(board, [p1, p2]);
  assert.equal(a.marbles["1,0"], "P1");
  assert.equal(a.marbles["2,-1"], "P2");
  assert.equal(moveOf(a, "P1").outcome, "ok");
  assert.deepEqual([moveOf(a, "P2").outcome, moveOf(a, "P2").reason, moveOf(a, "P2").by], ["bounced", "hole_taken", "P1"]);
  const b = run(board, [p2, p1]);
  assert.equal(b.marbles["1,0"], "P2");
  assert.deepEqual([moveOf(b, "P1").outcome, moveOf(b, "P1").by], ["bounced", "P2"]);
  assert.equal(b.moved, 1);
});

test("cut short: a later hop's jumped marble moved away -> stop at the last legal landing", () => {
  const board = { "0,0": "P1", "1,0": "P3", "3,0": "P2" };
  const res = run(board, [
    ["P2", { from: "3,0", path: ["3,1"] }],
    ["P1", { from: "0,0", path: ["2,0", "4,0"] }],
  ]);
  const e = moveOf(res, "P1");
  assert.deepEqual([e.outcome, e.to, e.path, e.reason, e.by], ["cut", "2,0", ["2,0"], "jump_changed", "P2"]);
  assert.deepEqual(e.intended, ["2,0", "4,0"]);
  assert.equal(res.marbles["2,0"], "P1");
  assert.equal(res.marbles["0,0"], undefined);
});

test("cut short: a later landing was taken by a higher-priority step", () => {
  const board = { "0,0": "P1", "1,0": "P3", "3,0": "P3", "4,-1": "P2" };
  const res = run(board, [
    ["P2", { from: "4,-1", path: ["4,0"] }],
    ["P1", { from: "0,0", path: ["2,0", "4,0"] }],
  ]);
  const e = moveOf(res, "P1");
  assert.deepEqual([e.outcome, e.to, e.reason, e.by], ["cut", "2,0", "hole_taken", "P2"]);
});

test("cut short respects stop rules: no legal prefix -> bounced", () => {
  // P1 chain 3,-3 -> 5,-3 (arm 4, no-parking) -> 3,-1; the second hop's marble leaves.
  const board = { "3,-3": "P1", "4,-3": "P3", "4,-2": "P2" };
  const res = run(board, [
    ["P2", { from: "4,-2", path: ["4,-1"] }],
    ["P1", { from: "3,-3", path: ["5,-3", "3,-1"] }],
  ], { ...OPTS, no_parking: true });
  const e = moveOf(res, "P1");
  assert.deepEqual([e.outcome, e.by], ["bounced", "P2"]);
  assert.equal(res.marbles["3,-3"], "P1");
});

test("bounced: the only hop's marble moved away first", () => {
  const res = run({ "0,0": "P1", "1,0": "P2" }, [
    ["P2", { from: "1,0", path: ["1,1"] }],
    ["P1", { from: "0,0", path: ["2,0"] }],
  ]);
  assert.deepEqual([moveOf(res, "P1").outcome, moveOf(res, "P1").by], ["bounced", "P2"]);
  assert.equal(res.marbles["0,0"], "P1");
});

test("capture ordering: captures land right after the capturing move", () => {
  const options = { ...OPTS, capture: "send_home" };
  const board = { "-1,0": "P2", "0,0": "P1" };
  const p2 = ["P2", { from: "-1,0", path: ["1,0"] }];
  const p1 = ["P1", { from: "0,0", path: ["0,-1"] }];
  // P2 first: P1's marble is sent home before it can move -> P1 bounced.
  const a = run(board, [p2, p1], options);
  assert.deepEqual(moveOf(a, "P2").captured, [{ mark: "P1", from: "0,0", to: "-4,8" }]);
  assert.equal(a.marbles["-4,8"], "P1");
  assert.deepEqual([moveOf(a, "P1").outcome, moveOf(a, "P1").reason, moveOf(a, "P1").by], ["bounced", "marble_moved", "P2"]);
  // P1 first: it steps away, P2's jump is gone -> bounced, no capture.
  const b = run(board, [p1, p2], options);
  assert.equal(moveOf(b, "P1").outcome, "ok");
  assert.deepEqual([moveOf(b, "P2").outcome, moveOf(b, "P2").captured], ["bounced", []]);
  assert.equal(b.marbles["0,-1"], "P1");
});

test("capture off: hopped marbles stay; passes emit pass events", () => {
  const res = run({ "-1,0": "P2", "0,0": "P1" }, [["P2", { from: "-1,0", path: ["1,0"] }], ["P1", { pass: true }]]);
  assert.equal(res.marbles["0,0"], "P1");
  assert.deepEqual(moveOf(res, "P2").captured, []);
  assert.deepEqual(res.events.find((e) => e.type === "pass"), { type: "pass", mark: "P1" });
});
