import assert from "node:assert/strict";
import test from "node:test";
import {
  TILESETS, validateTileset, rotatePort, oppositePort, rotateAnchor, tileDefsFor, expandTile,
} from "../games/realmwright/tiles.js";
import { derive, legalPlacements, fits, majority, endGameScores, completedByPlacement } from "../games/realmwright/board.js";

const defs = tileDefsFor(["base"]);
const START = "base:city1-road-straight";
const at = (x, y, t, r = 0, meeples = []) => ({ x, y, t, r, by: null, round: 0, meeples });

test("base tileset validates: 24 types, 72 tiles, one start, every port once", () => {
  const set = TILESETS.base;
  assert.deepEqual(validateTileset(set), []);
  assert.equal(set.tiles.length, 24);
  assert.equal(set.tiles.reduce((a, t) => a + t.count, 0), 72);
  assert.deepEqual(set.tiles.filter((t) => t.start).map((t) => t.id), [START]);
  assert.equal(defs[START].count, 4);
});

test("validator catches broken tiles", () => {
  const bad = { id: "x", size: 1, tiles: [{ id: "x:bad", count: 1, features: [{ kind: "city", ports: [0, 1, 2], anchor: [0.5, 0.2] }] }] };
  const problems = validateTileset(bad);
  assert.ok(problems.some((p) => /port 3 covered 0/.test(p)));
});

test("derived fields: splits by roads/cities and lists touched cities", () => {
  const start = defs[START];
  const fields = start.features.filter((f) => f.kind === "field");
  assert.equal(fields.length, 2);
  const north = fields.find((f) => f.ports.includes(3));
  assert.deepEqual(north.ports.sort((a, b) => a - b), [3, 11]);
  assert.deepEqual(north.cities, [0]);
  assert.deepEqual(fields.find((f) => f.ports.includes(7)).cities, []);
  // junction: four roads, four separate fields
  const x = defs["base:road-junction4"];
  assert.equal(x.features.filter((f) => f.kind === "road").length, 4);
  assert.equal(x.features.filter((f) => f.kind === "field").length, 4);
  // three-sided city + road: the road ending at the wall splits the field
  assert.equal(defs["base:city3-road"].features.filter((f) => f.kind === "field").length, 2);
  // cloister + road: one field wraps around the dead end
  assert.equal(defs["base:cloister-road"].features.filter((f) => f.kind === "field").length, 1);
  // separate caps: one field touching both cities
  const caps = defs["base:city2-caps-opposite"].features.find((f) => f.kind === "field");
  assert.deepEqual(caps.cities, [0, 1]);
  assert.ok(expandTile({ id: "t:x", count: 1, roads: [[0, 2]] }).features.length === 3);
});

test("rotation + port matching geometry", () => {
  assert.equal(rotatePort(0, 1), 3);
  assert.equal(rotatePort(11, 1), 2);
  assert.equal(rotatePort(5, 4), 5);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(oppositePort), [8, 7, 6, 11, 10, 9]);
  for (let p = 0; p < 12; p += 1) assert.equal(oppositePort(oppositePort(p)), p);
  assert.deepEqual(rotateAnchor([0.5, 0], 1), [1, 0.5]);
  assert.deepEqual(rotateAnchor([0.2, 0.1], 4), [0.2, 0.1]);
});

test("legality: adjacency, edge match, rotations", () => {
  const board = [at(0, 0, START)];
  const d = derive(board, defs);
  // A straight road fits east/west of the start (running E–W), or below the
  // start's field edge (also E–W, so its field side faces up).
  const legal = legalPlacements(board, "base:road-straight", defs, { farmers: "on" }, 7, d);
  const spots = legal.map((l) => `${l.x},${l.y},${l.r}`).sort();
  assert.deepEqual(spots, ["-1,0,1", "-1,0,3", "0,1,1", "0,1,3", "1,0,1", "1,0,3"]);
  assert.ok(!fits(board, d.index, defs, defs["base:road-straight"], 0, -1, 0), "no road under a city edge");
  assert.ok(!fits(board, d.index, defs, defs["base:road-straight"], 2, 0, 1), "must touch a tile");
  assert.ok(!fits(board, d.index, defs, defs["base:road-straight"], 0, 0, 1), "occupied");
  // Full city only fits on the start's city edge.
  const city = legalPlacements(board, "base:city4-pennant", defs, {}, 7, d);
  assert.deepEqual(city.map((l) => [l.x, l.y]), [[0, -1], [0, -1], [0, -1], [0, -1]]);
  // Meeple spots: fields only with farmers on; none with zero meeples.
  const withFarmers = legal[0].meeples.map((fi) => defs["base:road-straight"].features[fi].kind).sort();
  assert.deepEqual(withFarmers, ["field", "field", "road"]);
  const noFarmers = legalPlacements(board, "base:road-straight", defs, { farmers: "off" }, 7, d)[0].meeples;
  assert.deepEqual(noFarmers.map((fi) => defs["base:road-straight"].features[fi].kind), ["road"]);
  assert.deepEqual(legalPlacements(board, "base:road-straight", defs, { farmers: "on" }, 0, d)[0].meeples, []);
});

test("legality: a feature joined to a claimed one offers no meeple", () => {
  const board = [at(0, 0, START, 0, [{ f: 1, mark: "P1" }])]; // P1 on the road
  const legal = legalPlacements(board, "base:road-straight", defs, { farmers: "off" }, 7);
  const onRoad = legal.filter((l) => l.y === 0);
  assert.equal(onRoad.length, 4);
  assert.ok(onRoad.every((l) => l.meeples.length === 0), "road joins P1's road");
  assert.ok(legal.filter((l) => l.y === 1).every((l) => l.meeples.length === 1), "a fresh road below is free");
});

test("derive: merged city, pennants, open edges, completion", () => {
  const board = [at(0, 0, START), at(0, -1, "base:city2-band-pennant", 1), at(0, -2, "base:city1", 2)];
  const d = derive(board, defs);
  const city = d.features[d.root(0, 0)];
  assert.equal(city.kind, "city");
  assert.equal(city.cells.length, 3);
  assert.equal(city.pennants, 1);
  assert.equal(city.open, 0);
  assert.ok(city.complete);
  assert.equal(d.root(0, 0), d.root(2, 0));
  const road = d.features[d.root(0, 1)];
  assert.equal(road.open, 2);
  assert.ok(!road.complete);
});

test("majority: most meeples win, ties share", () => {
  assert.deepEqual(majority([{ mark: "A" }, { mark: "A" }, { mark: "B" }]), ["A"]);
  assert.deepEqual(majority([{ mark: "A" }, { mark: "B" }]).sort(), ["A", "B"]);
  assert.deepEqual(majority([]), []);
});

test("cloister completes with its 8 neighbours", () => {
  const board = [at(0, 0, START)];
  for (let y = 1; y <= 3; y += 1) for (let x = -1; x <= 1; x += 1) board.push(at(x, y, "base:cloister"));
  board[5].meeples = [{ f: 0, mark: "P1" }]; // (0,2) — the centre
  const d = derive(board, defs);
  const done = completedByPlacement(board, d, defs, board.length - 1, {});
  assert.equal(done.length, 1);
  assert.equal(done[0].points, 9);
  assert.deepEqual(done[0].marks, ["P1"]);
});

test("end-game: incomplete features + fields (3rd-edition shared city)", () => {
  // Start + a cap below it closes a 2-tile city. Farmers on the start's north
  // field (P1) and on the cap's own field (P2) both score the completed city.
  const board = [
    at(0, 0, START, 0, [{ f: 2, mark: "P1" }, { f: 1, mark: "P3" }]),
    at(0, -1, "base:city1", 2, [{ f: 1, mark: "P2" }]),
  ];
  const d = derive(board, defs);
  const on = endGameScores(d, { farmers: "on" });
  const byKind = (kind) => on.filter((s) => s.feature.kind === kind);
  assert.deepEqual(byKind("field").map((s) => [s.marks[0], s.points]).sort(), [["P1", 3], ["P2", 3]]);
  assert.deepEqual(byKind("road").map((s) => [s.marks[0], s.points]), [["P3", 1]]);
  const off = endGameScores(d, { farmers: "off" });
  assert.equal(off.filter((s) => s.feature.kind === "field").length, 0);
  // Incomplete city: 1 / tile + 1 / pennant.
  const b2 = [at(0, 0, START), at(0, -1, "base:city2-band-pennant", 1, [{ f: 0, mark: "P1" }])];
  const s2 = endGameScores(derive(b2, defs), { farmers: "on" });
  assert.deepEqual(s2.map((s) => [s.feature.kind, s.points]), [["city", 3]]);
});

test("derive + legality stay fast on a big board", () => {
  // A long road snake of ~160 tiles.
  const board = [at(0, 0, START)];
  for (let x = 1; x <= 160; x += 1) board.push(at(x, 0, "base:road-straight", 1));
  const t = Date.now();
  const d = derive(board, defs);
  for (let i = 0; i < 6; i += 1) legalPlacements(board, "base:city1", defs, { farmers: "on" }, 7, d);
  assert.ok(Date.now() - t < 500, "derive + 6 legality scans under 500ms");
});
