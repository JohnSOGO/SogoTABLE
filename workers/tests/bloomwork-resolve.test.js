// Bloomwork pick-step resolution: rotating priority settles clashes over a
// stall; the loser falls back to the Square, else misses the pick.
import assert from "node:assert/strict";
import test from "node:test";
import { resolveBloomworkPick, plantInto } from "../games/bloomwork/resolve.js";
import { BIRD, emptyBed, emptyRows } from "../games/bloomwork/board.js";

function table(commits) {
  const seat = (committed) => ({ rows: emptyRows(), bed: emptyBed(), compost: [], committed });
  return {
    stalls: [["rose", "rose", "iris", "sun"], ["fern", "fern", "fern", "lilac"]],
    center: [],
    bird_in_center: true,
    lid: [],
    players: Object.fromEntries(Object.entries(commits).map(([m, c]) => [m, seat(c)])),
  };
}
const run = (game, order) => {
  const events = [];
  const out = resolveBloomworkPick(game, order, (e) => events.push(e));
  return { events, ...out };
};

test("same stall, same flower: priority wins, the other misses and is told who took it", () => {
  const game = table({ P1: { source: 0, flower: "rose", row: 1 }, P2: { source: 0, flower: "rose", row: 1 } });
  const { events } = run(game, ["P2", "P1"]);
  assert.deepEqual(game.players.P2.rows[1], { flower: "rose", count: 2 });
  assert.equal(game.players.P1.rows[1].count, 0);
  const missed = events.find((e) => e.type === "missed");
  assert.deepEqual([missed.mark, missed.by], ["P1", "P2"]);
  assert.deepEqual(game.center.sort(), ["iris", "sun"]);
});

test("same stall, different flower: the loser takes theirs from the Square (and the Early Bird)", () => {
  const game = table({ P1: { source: 0, flower: "rose", row: 1 }, P2: { source: 0, flower: "iris", row: 0 } });
  const { events, birdTaker } = run(game, ["P1", "P2"]);
  assert.deepEqual(game.players.P2.rows[0], { flower: "iris", count: 1 });
  assert.deepEqual(game.players.P2.compost, [BIRD]);
  assert.equal(birdTaker, "P2");
  const take = events.find((e) => e.mark === "P2");
  assert.deepEqual([take.source, take.wanted, take.bumped_by, take.bird], ["center", 0, "P1", true]);
  assert.deepEqual(game.center, ["sun"]);
});

test("different stalls never clash; overflow spills to compost then the lid", () => {
  const game = table({ P1: { source: 1, flower: "fern", row: 0 }, P2: { source: 0, flower: "sun", row: 4 } });
  run(game, ["P1", "P2"]);
  assert.deepEqual(game.players.P1.rows[0], { flower: "fern", count: 1 });
  assert.deepEqual(game.players.P1.compost, ["fern", "fern"]);
  assert.deepEqual(game.center.sort(), ["iris", "lilac", "rose", "rose"]);
  const seat = { rows: emptyRows(), bed: emptyBed(), compost: Array(6).fill("rose") };
  const lid = [];
  const r = plantInto(seat, -1, "iris", 3, lid);
  assert.deepEqual([r.composted, r.lidded, seat.compost.length, lid.length], [1, 2, 7, 2]);
});

test("a row that became illegal sends the flowers to compost instead", () => {
  const seat = { rows: emptyRows(), bed: emptyBed(), compost: [] };
  seat.rows[2] = { flower: "rose", count: 1 };
  const r = plantInto(seat, 2, "iris", 2, []);
  assert.equal(r.row, -1);
  assert.deepEqual(seat.compost, ["iris", "iris"]);
});
