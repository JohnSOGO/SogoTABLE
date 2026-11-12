import assert from "node:assert/strict";
import test from "node:test";
import {
  CELLS, ARM_TIPS, SEAT_ARMS, armCells, oppositeArm, seatGeometry, hexDistance, indexOf, keyAt, toGrid,
  marbleMoves, seatLegalKeys, applyCaptures, pathProblem, seatDistance, goalFinished, teamOfArm,
} from "../games/chinese-checkers/board.js";

const STD = { jumps: "standard", stay_in_goal: true, no_parking: false };
const LONG = { ...STD, jumps: "long" };
const geo0 = seatGeometry(0, 10); // home arm 0 (bottom), goal arm 3 (top)
const geo3 = seatGeometry(3, 10);
const keys = (list) => list.map(keyAt).sort();
const movesAt = (marbles, from, options = STD, geo = geo0) => marbleMoves(toGrid(marbles), indexOf(from), geo, options);

test("star: 121 holes, 10 per arm, 61-hole hexagon, arms/tips per PLAN", () => {
  assert.equal(CELLS.length, 121);
  assert.equal(new Set(CELLS.map((c) => c.k)).size, 121);
  for (let arm = 0; arm < 6; arm += 1) {
    assert.equal(CELLS.filter((c) => c.arm === arm).length, 10, `arm ${arm}`);
    assert.equal(armCells(arm, 10).length, 10);
    assert.equal(armCells(arm, 6).length, 6);
    const tip = CELLS.find((c) => c.k === ARM_TIPS[arm]);
    assert.equal(tip.arm, arm);
  }
  assert.equal(CELLS.filter((c) => c.arm === -1).length, 61);
  assert.deepEqual(ARM_TIPS, ["-4,8", "-8,4", "-4,-4", "4,-8", "8,-4", "4,4"]);
  assert.ok(armCells(0, 6).every((k) => k !== "-1,5"), "quick 6 drops depth 1");
});

test("opposite arms, goals, seat-arm table, teams", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(oppositeArm), [3, 4, 5, 0, 1, 2]);
  assert.equal(geo0.goal_arm, 3);
  assert.deepEqual([...geo0.goal].map(keyAt).sort(), armCells(3, 10).sort());
  assert.deepEqual(SEAT_ARMS[2], [0, 3]);
  assert.deepEqual(SEAT_ARMS[3], [0, 2, 4]);
  assert.deepEqual(SEAT_ARMS[4], [0, 1, 3, 4]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(teamOfArm), [0, 1, 2, 0, 1, 2]);
  assert.equal(hexDistance("0,0", "2,-1"), 2);
  assert.equal(hexDistance("-4,8", "4,-8"), 16);
});

test("steps: six neighbours on an empty board; occupied holes excluded", () => {
  assert.deepEqual(keys(movesAt({ "0,0": "P1" }, "0,0").steps), ["-1,0", "-1,1", "0,-1", "0,1", "1,-1", "1,0"]);
  const m = movesAt({ "0,0": "P1", "1,0": "P2" }, "0,0");
  assert.ok(!keys(m.steps).includes("1,0"));
});

test("single hop and chained hop graph (origin included, never a landing)", () => {
  const single = movesAt({ "0,0": "P1", "1,0": "P2" }, "0,0");
  assert.deepEqual(keys(single.graph.get(indexOf("0,0"))), ["2,0"]);
  const chain = { "0,0": "P1", "1,0": "P2", "3,0": "P2", "3,-1": "P1" };
  const { legal, stops } = seatLegalKeys(toGrid(chain), "P1", geo0, STD);
  assert.deepEqual(legal["0,0"].hops["0,0"], ["2,0"]);
  assert.ok(legal["0,0"].hops["2,0"].includes("4,0"));
  assert.ok(legal["0,0"].hops["2,0"].includes("4,-2"), "hop over own marble too");
  assert.ok(!Object.values(legal["0,0"].hops).some((l) => l.includes("0,0")));
  assert.ok(stops["0,0"].includes("4,0") && stops["0,0"].includes("2,0"));
  assert.equal(pathProblem(toGrid(chain), indexOf("0,0"), ["2,0", "4,0"].map(indexOf), geo0, STD), null);
  assert.match(pathProblem(toGrid(chain), indexOf("0,0"), ["4,0"].map(indexOf), geo0, STD), /jump/);
});

test("long jumps: symmetric d empties / marble / d empties; blocked cases", () => {
  const far = { "0,0": "P1", "2,0": "P2" };
  assert.deepEqual(keys(movesAt(far, "0,0", STD).graph.get(indexOf("0,0"))), [], "standard can't reach");
  assert.deepEqual(keys(movesAt(far, "0,0", LONG).graph.get(indexOf("0,0"))), ["4,0"]);
  // a marble on the far side breaks the symmetry
  assert.deepEqual(keys(movesAt({ ...far, "3,0": "P2" }, "0,0", LONG).graph.get(indexOf("0,0"))), []);
  // occupied landing
  assert.deepEqual(keys(movesAt({ ...far, "4,0": "P2" }, "0,0", LONG).graph.get(indexOf("0,0"))), []);
  // adjacent marble still works as a standard hop under long rules
  assert.deepEqual(keys(movesAt({ "0,0": "P1", "1,0": "P2" }, "0,0", LONG).graph.get(indexOf("0,0"))), ["2,0"]);
});

test("stay_in_goal and no_parking filter END holes only", () => {
  // P1 (goal arm 3) has a marble in its goal at 1,-5; stepping out to 1,-4 is not a stop.
  const inGoal = movesAt({ "1,-5": "P1" }, "1,-5");
  assert.ok(!keys(inGoal.stops).includes("1,-4"));
  assert.ok(keys(movesAt({ "1,-5": "P1" }, "1,-5", { ...STD, stay_in_goal: false }).stops).includes("1,-4"));
  // no_parking: 5,-4 is arm 4 (neither P1's home 0 nor goal 3).
  const edge = { "4,-3": "P1" };
  assert.ok(keys(movesAt(edge, "4,-3").stops).includes("5,-4"));
  const parked = movesAt(edge, "4,-3", { ...STD, no_parking: true });
  assert.ok(!keys(parked.stops).includes("5,-4"));
  assert.ok(keys(parked.stops).includes("4,-4"), "own goal arm is fine");
  // passing through a forbidden arm is fine: hop into arm 4 (5,-3) and back out (3,-1).
  const through = { "3,-3": "P1", "4,-3": "P2", "4,-2": "P2" };
  const m = movesAt(through, "3,-3", { ...STD, no_parking: true });
  assert.deepEqual(keys(m.graph.get(indexOf("3,-3"))), ["5,-3"]);
  assert.deepEqual(keys(m.graph.get(indexOf("5,-3"))), ["3,-1"]);
  assert.ok(!keys(m.stops).includes("5,-3"));
  assert.ok(keys(m.stops).includes("3,-1"));
});

test("captures: sent to the free home hole nearest the tip; own-goal safe; teammates safe", () => {
  const geoOf = (m) => ({ P1: geo0, P2: geo3, P3: geo3 }[m]);
  const noTeams = () => null;
  // P2's home tip 4,-8 is free -> captured marble lands there.
  let grid = toGrid({ "1,0": "P2" });
  let caps = applyCaptures(grid, "P1", [indexOf("1,0")], geoOf, noTeams);
  assert.deepEqual(caps.map((c) => [c.mark, keyAt(c.from), keyAt(c.to)]), [["P2", "1,0", "4,-8"]]);
  assert.equal(grid[indexOf("1,0")], null);
  // tip taken -> next nearest home hole, ties by key order (3,-7 < 4,-7).
  grid = toGrid({ "1,0": "P2", "4,-8": "P2" });
  caps = applyCaptures(grid, "P1", [indexOf("1,0")], geoOf, noTeams);
  assert.equal(keyAt(caps[0].to), "3,-7");
  // home full -> nearest free star hole to the tip.
  const full = Object.fromEntries(armCells(3, 10).map((k) => [k, "P2"]));
  grid = toGrid({ ...full, "1,0": "P2" });
  caps = applyCaptures(grid, "P1", [indexOf("1,0")], geoOf, noTeams);
  const best = CELLS.filter((c) => !grid[indexOf(c.k)] || c.k === keyAt(caps[0].to))
    .map((c) => [hexDistance(c.k, "4,-8"), c.k]).sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1))[0];
  assert.equal(keyAt(caps[0].to), best[1]);
  assert.ok(!armCells(3, 10).includes(keyAt(caps[0].to)));
  // hopped twice -> captured once; own marbles never captured.
  grid = toGrid({ "1,0": "P2", "2,0": "P1" });
  caps = applyCaptures(grid, "P1", [indexOf("1,0"), indexOf("1,0"), indexOf("2,0")], geoOf, noTeams);
  assert.equal(caps.length, 1);
  // P2 marble sitting in its own goal (arm 0) is safe.
  grid = toGrid({ "-1,5": "P2" });
  assert.deepEqual(applyCaptures(grid, "P1", [indexOf("-1,5")], geoOf, noTeams), []);
  // teammates are never captured.
  grid = toGrid({ "1,0": "P3" });
  assert.deepEqual(applyCaptures(grid, "P2", [indexOf("1,0")], geoOf, (m) => (m === "P2" || m === "P3" ? 0 : null)), []);
});

test("distance is 0 for a full goal; finish + anti-block", () => {
  const goal = Object.fromEntries(armCells(3, 10).map((k) => [k, "P1"]));
  assert.equal(seatDistance(toGrid(goal), "P1", geo0), 0);
  assert.ok(goalFinished(toGrid(goal), "P1", geo0, false));
  const home = Object.fromEntries(armCells(0, 10).map((k) => [k, "P1"]));
  assert.ok(seatDistance(toGrid(home), "P1", geo0) > 100);
  // 7 own + 3 campers: anti-block finishes; without it, not.
  const camped = { ...goal, "4,-8": "P2", "3,-7": "P2", "4,-7": "P2" };
  assert.ok(goalFinished(toGrid(camped), "P1", geo0, true));
  assert.ok(!goalFinished(toGrid(camped), "P1", geo0, false));
  // a single own marble in a still-full enemy home is NOT a finish.
  const oneIn = { ...Object.fromEntries(armCells(3, 10).map((k) => [k, "P2"])), "1,-5": "P1" };
  assert.ok(!goalFinished(toGrid(oneIn), "P1", geo0, true));
});
