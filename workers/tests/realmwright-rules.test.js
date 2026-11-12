import assert from "node:assert/strict";
import test from "node:test";
import {
  REALMWRIGHT_GAME_ID, isRealmwrightGame, newRealmwrightGame, initRealmwrightSeats, setRealmwrightOptions,
  makeRealmwrightMove, realmwrightGameToDict, realmwrightGameToDictForViewer, realmwrightScoreByMark,
  setRealmwrightRandom, normalizeRealmwrightOptions,
} from "../games/realmwright/rules.js";
import { legalPlacements } from "../games/realmwright/board.js";
import { tileDefsFor } from "../games/realmwright/tiles.js";

const human = (mark) => ({ mark, name: mark, kind: "human" });
const bot = (mark, bot_level = 2) => ({ mark, name: mark, kind: "bot", bot_level });
const defs = tileDefsFor(["base"]);
const START = "base:city1-road-straight";
const J3 = "base:road-junction3"; // features: 0 road E, 1 road S, 2 road W, then fields

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function makeGame(seats, options = {}, seed = 1) {
  setRealmwrightRandom(seeded(seed));
  const g = newRealmwrightGame();
  setRealmwrightOptions(g, { realm_options: options });
  initRealmwrightSeats(g, seats);
  return g;
}

function place(g, mark, x, y, r, meeple = null) {
  makeRealmwrightMove(g, mark, { type: "PLACE_TILE", round: g.round, serial: g.players[mark].tile_serial, x, y, r, meeple });
}

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

test("ids, predicate, seat requirement", () => {
  const g = newRealmwrightGame();
  assert.equal(g.game_id, REALMWRIGHT_GAME_ID);
  assert.ok(isRealmwrightGame(g));
  assert.ok(!isRealmwrightGame({ game_id: "hearts" }));
  assert.ok(!isRealmwrightGame(null));
  assert.throws(() => initRealmwrightSeats(newRealmwrightGame(), []), /at least one player/);
});

test("init: start tile at origin, one tile dealt per seat, bag secret", () => {
  const g = makeGame([human("P1"), human("P2")]);
  assert.deepEqual(g.board.map((p) => [p.x, p.y, p.t, p.r, p.by]), [[0, 0, START, 0, null]]);
  assert.equal(g.round, 1);
  assert.equal(g.bag.length, 72 - 1 - 2);
  ["P1", "P2"].forEach((m) => { assert.ok(g.players[m].tile); assert.equal(g.players[m].tile_serial, 1); assert.equal(g.players[m].meeples_left, 7); });
  const d = realmwrightGameToDict(g);
  assert.ok(!("bag" in d));
  assert.equal(d.bag_count, 69);
});

test("deck option: quick ≈ half (every type kept), big doubles", () => {
  const q = makeGame([human("P1")], { deck: "quick" });
  const b = makeGame([human("P1")], { deck: "big" });
  const quickTotal = q.bag.length + 1 + 1;
  assert.ok(quickTotal >= 36 && quickTotal <= 46, `quick deck ${quickTotal}`);
  const types = new Set([...q.bag, q.players.P1.tile, START]);
  assert.equal(types.size, 24);
  assert.equal(b.bag.length + 1 + 1, 144);
});

test("completed road scores immediately and returns the meeple", () => {
  const g = makeGame([human("P1"), human("P2")]);
  g.players.P1.tile = J3;
  g.players.P2.tile = J3;
  place(g, "P1", 1, 0, 0, 2); // stub W joins the start road; meeple on it
  assert.equal(g.players.P1.meeples_left, 6);
  place(g, "P2", -1, 0, 0, null); // stub E closes the road: 3 tiles
  assert.equal(g.players.P1.score, 3);
  assert.equal(g.players.P1.breakdown.road, 3);
  assert.equal(g.players.P1.meeples_left, 7);
  assert.ok(g.board.every((p) => p.meeples.length === 0));
  const score = g.events.find((e) => e.type === "score");
  assert.deepEqual([score.kind, score.points, score.marks, score.cells.length], ["road", 3, ["P1"], 3]);
  assert.equal(g.round, 2, "both humans placed → next round");
});

test("completed city: tiles + pennants; small_city option", () => {
  const g = makeGame([human("P1"), human("P2")]);
  g.players.P1.tile = "base:city2-band-pennant";
  g.players.P2.tile = "base:city1";
  place(g, "P1", 0, -1, 1, 0); // band N–S above the start's cap; P1 claims it
  place(g, "P2", 0, -2, 2, null); // cap facing south closes it
  assert.equal(g.players.P1.score, 2 * 3 + 2);
  assert.equal(g.players.P1.breakdown.city, 8);

  for (const [small, pts] of [[false, 4], [true, 2]]) {
    const s = makeGame([human("P1")], { small_city: small });
    s.players.P1.tile = "base:city1";
    place(s, "P1", 0, -1, 2, 0);
    assert.equal(s.players.P1.score, pts, `small_city=${small}`);
  }
});

test("shared majority: tied seats both score the full city", () => {
  const g = makeGame([human("P1"), human("P2")]);
  g.board[0].meeples = [{ f: 0, mark: "P2" }];
  g.players.P2.meeples_left = 6;
  g.board.push({ x: 0, y: -1, t: "base:city2-band", r: 1, by: "P1", round: 0, meeples: [{ f: 0, mark: "P1" }] });
  g.players.P1.meeples_left = 6;
  g.players.P1.tile = "base:city1";
  place(g, "P1", 0, -2, 2, null);
  assert.equal(g.players.P1.score, 6);
  assert.equal(g.players.P2.score, 6);
  assert.equal(g.players.P1.meeples_left, 7);
  assert.equal(g.players.P2.meeples_left, 7);
});

test("cloister scores 9 when surrounded", () => {
  const g = makeGame([human("P1")]);
  for (let y = 1; y <= 3; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      if (x === 1 && y === 3) continue;
      g.board.push({ x, y, t: "base:cloister", r: 0, by: "P1", round: 0, meeples: x === 0 && y === 2 ? [{ f: 0, mark: "P1" }] : [] });
    }
  }
  g.players.P1.meeples_left = 6;
  g.players.P1.tile = "base:cloister";
  place(g, "P1", 1, 3, 0, null);
  assert.equal(g.players.P1.breakdown.cloister, 9);
  assert.equal(g.players.P1.meeples_left, 7);
});

test("meeple on a feature joined to a claimed one is rejected; plain placement still works", () => {
  const g = makeGame([human("P1"), human("P2")]);
  g.board[0].meeples = [{ f: 1, mark: "P1" }]; // P1 holds the start road
  g.players.P2.tile = J3;
  assert.throws(() => place(g, "P2", 1, 0, 0, 2), /road was just claimed/);
  assert.equal(g.board.length, 1, "rejected move changes nothing");
  place(g, "P2", 1, 0, 0, 0); // the E stub is a fresh road — fine
  assert.equal(g.players.P2.meeples_left, 6);
});

test("loud errors: bad feature, no meeples, farmers off, bad rotation, bot seat, unknown action", () => {
  const g = makeGame([human("P1"), human("P2"), bot("B1")], { farmers: "off" });
  g.players.P1.tile = J3;
  assert.throws(() => place(g, "P1", 1, 0, 0, 9), /no feature #9/);
  assert.throws(() => place(g, "P1", 1, 0, 0, 3), /Farmers are off/);
  assert.throws(() => place(g, "P1", 1, 0, 7, null), /Rotation/);
  assert.throws(() => place(g, "P1", 5, 5, 0, null), /no longer fits/);
  g.players.P1.meeples_left = 0;
  assert.throws(() => place(g, "P1", 1, 0, 0, 2), /no meeples left/);
  assert.throws(() => makeRealmwrightMove(g, "B1", { type: "PLACE_TILE" }), /Bot seats/);
  assert.throws(() => makeRealmwrightMove(g, "ZZ", { type: "PLACE_TILE" }), /not seated/);
  assert.throws(() => makeRealmwrightMove(g, "P1", { type: "NOPE" }), /PLACE_TILE or SKIP_PLAYER/);
  place(g, "P1", 1, 0, 0, null);
  assert.throws(() => place(g, "P1", 2, 0, 0, null), /already placed/);
});

test("garbage meeple values never coerce into a feature; prototype marks are not seats", () => {
  const g = makeGame([human("P1"), human("P2")]);
  g.players.P1.tile = J3;
  for (const bad of [false, true, [], [0], {}, "x", "1e0", 0.5, -1]) {
    assert.throws(() => place(g, "P1", 1, 0, 0, bad), /no feature/, `meeple ${JSON.stringify(bad)}`);
  }
  for (const mark of ["__proto__", "constructor", "toString"]) {
    assert.throws(() => makeRealmwrightMove(g, mark, { type: "PLACE_TILE" }), /not seated/);
  }
  assert.throws(() => makeRealmwrightMove(g, "P1", { type: "SKIP_PLAYER", round: g.round, target: "__proto__" }), /can't be skipped/);
  place(g, "P1", 1, 0, 0, "0"); // a digit string still names feature 0
  assert.deepEqual(g.board[g.board.length - 1].meeples, [{ f: 0, mark: "P1" }]);
  assert.equal(g.players.P1.meeples_left, 6);
});

test("closing a city returns its knight but never the farmer beside it", () => {
  const g = makeGame([human("P1"), human("P2")]);
  g.board[0].meeples = [{ f: 2, mark: "P2" }]; // farmer on the start tile's city-side field
  g.players.P2.meeples_left = 6;
  g.players.P1.tile = "base:city1";
  place(g, "P1", 0, -1, 2, 0); // cap facing south closes the 2-tile city, knight on it
  assert.equal(g.players.P1.score, 4);
  assert.equal(g.players.P1.meeples_left, 7, "knight came home");
  assert.deepEqual(g.board[0].meeples, [{ f: 2, mark: "P2" }], "farmer stays");
  assert.equal(g.players.P2.meeples_left, 6);
  const p2 = realmwrightGameToDict(g).players.find((p) => p.mark === "P2");
  assert.equal(p2.projected, 3, "farmer will score the finished city at the end");
});

test("parallel conflict: first placement wins, second is rejected and re-places", () => {
  const g = makeGame([human("P1"), human("P2")]);
  g.players.P1.tile = "base:road-straight";
  g.players.P2.tile = "base:road-straight";
  place(g, "P1", 1, 0, 1, null);
  assert.throws(() => place(g, "P2", 1, 0, 1, null), /Someone just built there/);
  assert.equal(g.players.P2.placed, false);
  assert.equal(g.players.P2.tile, "base:road-straight", "tile stays theirs");
  const dict = realmwrightGameToDict(g);
  const spot = dict.legal.P2[0];
  place(g, "P2", spot.x, spot.y, spot.r, null);
  assert.equal(g.round, 2);
});

test("stale round / serial rejected loudly", () => {
  const g = makeGame([human("P1"), human("P2")]);
  const seat = g.players.P1;
  const spot = realmwrightGameToDict(g).legal.P1[0];
  assert.throws(() => makeRealmwrightMove(g, "P1", { type: "PLACE_TILE", round: g.round - 1, serial: seat.tile_serial, ...spot, meeple: null }), /Stale move/);
  assert.throws(() => makeRealmwrightMove(g, "P1", { type: "PLACE_TILE", round: g.round, serial: seat.tile_serial - 1, ...spot, meeple: null }), /Stale tile/);
  assert.throws(() => makeRealmwrightMove(g, "P1", { type: "PLACE_TILE", round: g.round, ...spot, meeple: null }), /Stale tile/);
});

test("knock-on redraw: a tile that no longer fits anywhere is replaced", () => {
  const g = makeGame([human("P1"), human("P2")]);
  g.players.P1.tile = "base:city1";
  g.players.P2.tile = "base:city4-pennant"; // its only spot is above the start
  g.bag.unshift("base:road-straight");
  const serial = g.players.P2.tile_serial;
  place(g, "P1", 0, -1, 2, null); // takes that spot
  assert.equal(g.players.P2.tile, "base:road-straight");
  assert.equal(g.players.P2.tile_serial, serial + 1);
  assert.ok(g.events.some((e) => e.type === "redraw" && e.mark === "P2"));
  assert.throws(() => makeRealmwrightMove(g, "P2", { type: "PLACE_TILE", round: g.round, serial, x: 1, y: 0, r: 1, meeple: null }), /Stale tile/);
  place(g, "P2", 1, 0, 1, null);
});

test("bots place at the barrier, after every human, in seat order", () => {
  const g = makeGame([bot("B1"), human("P1"), bot("B2")]);
  assert.equal(g.board.length, 1, "bots wait for the human");
  const spot = realmwrightGameToDict(g).legal.P1[0];
  place(g, "P1", spot.x, spot.y, spot.r, null);
  const places = g.events.filter((e) => e.type === "place" && e.round === 1).map((e) => e.mark);
  assert.deepEqual(places, ["P1", "B1", "B2"]);
  assert.equal(g.round, 2);
  assert.ok(g.players.B1.tile && g.players.P1.tile);
});

test("all-bot table runs to completion", () => {
  for (const level of [1, 2, 3, 4]) {
    const g = makeGame([bot("B1", level), bot("B2", level), bot("B3", level)], {}, 10 + level);
    assert.equal(g.status, "complete", `level ${level}`);
    assert.equal(g.bag.length, 0);
    assert.ok(g.events.some((e) => e.type === "end"));
  }
});

test("game end: last round empties the bag, end-game scoring, results + winner", () => {
  const g = makeGame([human("P1"), human("P2")]);
  g.bag = [];
  g.players.P1.tile = "base:road-straight";
  g.players.P2.tile = "base:city1";
  place(g, "P1", 1, 0, 1, 0); // meeple on a 2-tile incomplete road
  assert.equal(g.status, "playing");
  place(g, "P2", 0, -1, 2, null);
  assert.equal(g.status, "complete");
  assert.equal(g.players.P1.breakdown.road, 2);
  assert.deepEqual(g.results.map((r) => r.mark), ["P1", "P2"]);
  assert.equal(g.winner, "P1");
  assert.deepEqual(realmwrightScoreByMark(g), { P1: 2, P2: 0 });
  assert.throws(() => place(g, "P1", 2, 0, 1, null), /complete/);
});

test("ties at the end share results in seat order", () => {
  const g = makeGame([human("P1"), human("P2")]);
  g.bag = [];
  g.players.P1.tile = "base:road-straight";
  g.players.P2.tile = "base:road-straight";
  place(g, "P2", 1, 0, 1, null);
  place(g, "P1", -1, 0, 1, null);
  assert.deepEqual(g.results.map((r) => r.mark), ["P1", "P2"]);
});

test("projected score includes incomplete features and fields only when farmers are on", () => {
  for (const farmers of ["on", "off"]) {
    const g = makeGame([human("P1"), human("P2")], { farmers });
    g.players.P1.tile = "base:city1";
    g.players.P2.tile = "base:road-straight";
    place(g, "P1", 0, -1, 2, null); // closes a 2-tile city (no meeple)
    g.board[0].meeples = [{ f: 2, mark: "P2" }]; // a farmer beside that city
    const p2 = realmwrightGameToDict(g).players.find((p) => p.mark === "P2");
    assert.equal(p2.score, 0);
    assert.equal(p2.projected, farmers === "on" ? 3 : 0);
    assert.equal(p2.projected, sum(p2.projected_breakdown));
  }
});

test("projection shape is exactly the wire contract", () => {
  const g = makeGame([human("P1"), bot("B1")]);
  const d = realmwrightGameToDict(g);
  assert.deepEqual(Object.keys(d).sort(), [
    "bag_count", "board", "events", "game_id", "legal", "move_count", "options", "players", "results",
    "round", "seat_order", "skip_votes", "status", "tile_defs", "winner",
  ]);
  assert.deepEqual(Object.keys(d.players[0]).sort(), [
    "breakdown", "is_bot", "mark", "meeples_left", "meeples_total", "placed", "projected", "projected_breakdown",
    "score", "skipped", "tile", "tile_serial",
  ]);
  assert.deepEqual(Object.keys(d.options).sort(), ["deck", "expansions", "farmers", "live_tally", "meeples", "small_city"]);
  assert.deepEqual(Object.keys(d.board[0]).sort(), ["by", "meeples", "round", "t", "x", "y", "r"].sort());
  assert.equal(Object.keys(d.tile_defs).length, 24);
  assert.ok(d.tile_defs[START].start);
  assert.deepEqual(Object.keys(d.legal).sort(), ["B1", "P1"]);
  assert.ok(d.legal.P1.length > 0);
  d.legal.P1.forEach((l) => assert.deepEqual(Object.keys(l).sort(), ["meeples", "r", "x", "y"]));
  assert.ok(!JSON.stringify(d).includes('"bag"'));
  assert.deepEqual(Object.keys(d.events[0]).sort(), ["round", "seq", "type"]);
  // Placing removes the seat from legal.
  place(g, "P1", d.legal.P1[0].x, d.legal.P1[0].y, d.legal.P1[0].r, null);
  const d2 = realmwrightGameToDict(g);
  assert.ok(d2.round === 2 && d2.legal.P1);
});

test("viewer projection keeps only the viewer's legal list", () => {
  const g = makeGame([human("P1"), human("P2")]);
  const d = realmwrightGameToDict(g);
  const v = realmwrightGameToDictForViewer(d, "P1", "playing");
  assert.deepEqual(Object.keys(v.legal), ["P1"]);
  assert.deepEqual(Object.keys(d.legal).sort(), ["P1", "P2"], "input untouched");
  assert.deepEqual(realmwrightGameToDictForViewer(d, "spectator").legal, {});
  assert.equal(v.players.length, 2);
});

test("skip vote: only placed humans vote, unanimous, tile back to the bag bottom", () => {
  const g = makeGame([human("P1"), human("P2"), human("P3")]);
  const vote = (voter, target, round = g.round) => makeRealmwrightMove(g, voter, { type: "SKIP_PLAYER", target, round });
  assert.throws(() => vote("P1", "P3"), /already placed/);
  let spot = realmwrightGameToDict(g).legal.P1[0];
  place(g, "P1", spot.x, spot.y, spot.r, null);
  spot = realmwrightGameToDict(g).legal.P2[0];
  place(g, "P2", spot.x, spot.y, spot.r, null);
  assert.throws(() => vote("P1", "P1"), /yourself/);
  assert.throws(() => vote("P1", "P2"), /can't be skipped/);
  assert.throws(() => vote("P1", "P3", 99), /Stale skip/);
  vote("P1", "P3");
  assert.deepEqual(g.skip_votes, { P3: ["P1"] });
  vote("P1", "P3"); // toggle off
  assert.deepEqual(g.skip_votes, {});
  const tile = g.players.P3.tile;
  vote("P1", "P3");
  const bagBefore = g.bag.length;
  vote("P2", "P3");
  assert.ok(g.events.some((e) => e.type === "skip" && e.mark === "P3"));
  assert.equal(g.round, 2, "skip released the barrier");
  assert.ok(g.bag.includes(tile));
  assert.equal(g.bag.length, bagBefore + 1 - 3, "tile returned, then three dealt");
  assert.equal(g.players.P3.skipped, false, "back in next round");
});

test("options: clamping, garbage tolerance, reset carry-over", () => {
  assert.deepEqual(normalizeRealmwrightOptions(null), { farmers: "on", live_tally: true, meeples: 7, small_city: false, deck: "standard", expansions: [] });
  assert.deepEqual(normalizeRealmwrightOptions({ farmers: false, live_tally: "off", meeples: 99, small_city: "true", deck: "huge", expansions: ["base", "nope", 3] }),
    { farmers: "off", live_tally: false, meeples: 10, small_city: true, deck: "standard", expansions: [] });
  assert.equal(normalizeRealmwrightOptions({ meeples: 1 }).meeples, 5);
  assert.equal(normalizeRealmwrightOptions({ meeples: "abc" }).meeples, 7);
  assert.equal(normalizeRealmwrightOptions([1, 2]).farmers, "on");
  const g = newRealmwrightGame();
  setRealmwrightOptions(g, { realm_options: { meeples: 9, deck: "quick", farmers: "off" } });
  setRealmwrightOptions(g, { something_else: true }); // reset path: no realm_options → keep
  assert.equal(g.options.meeples, 9);
  assert.equal(g.options.deck, "quick");
  setRealmwrightOptions(g, { realm_options: "garbage" });
  assert.equal(g.options.farmers, "off");
  initRealmwrightSeats(g, [human("P1")]);
  assert.equal(g.players.P1.meeples_left, 9);
});

test("garbage stored state is tolerated", () => {
  const g = makeGame([human("P1")]);
  g.board.push({ x: "a", t: "nope" }, null);
  g.players.P1.score = "lots";
  g.events.push("junk");
  g.round = -5;
  const d = realmwrightGameToDict(g);
  assert.equal(d.board.length, 1);
  assert.equal(d.players[0].score, 0);
  assert.equal(d.round, 0);
});

// ---------- full seeded playouts ----------

function playOut(g, rng) {
  let guard = 0;
  while (g.status !== "complete" && guard++ < 2000) {
    const mark = g.seat_order.find((m) => !g.players[m].is_bot && !g.players[m].placed && !g.players[m].skipped && g.players[m].tile);
    assert.ok(mark, "a human can act while the game is playing");
    const seat = g.players[mark];
    const legal = legalPlacements(g.board, seat.tile, defs, g.options, seat.meeples_left);
    const spot = legal[Math.floor(rng() * legal.length)];
    const meeple = spot.meeples.length && rng() < 0.3 ? spot.meeples[Math.floor(rng() * spot.meeples.length)] : null;
    place(g, mark, spot.x, spot.y, spot.r, meeple);
  }
  return g;
}

function checkSane(g) {
  assert.equal(g.status, "complete");
  assert.equal(g.bag.length, 0);
  assert.equal(g.results.length, g.seat_order.length);
  for (let i = 1; i < g.results.length; i += 1) assert.ok(g.results[i - 1].score >= g.results[i].score);
  assert.equal(g.winner, g.results[0].mark);
  const onBoard = {};
  g.board.forEach((p) => p.meeples.forEach((m) => { onBoard[m.mark] = (onBoard[m.mark] || 0) + 1; }));
  for (const m of g.seat_order) {
    const seat = g.players[m];
    assert.equal(seat.score, sum(seat.breakdown), `${m} score == breakdown sum`);
    assert.equal(seat.meeples_left + (onBoard[m] || 0), g.options.meeples, `${m} meeples conserved`);
    if (g.options.farmers === "off") assert.equal(seat.breakdown.field, 0);
  }
  const d = realmwrightGameToDict(g);
  d.players.forEach((p) => assert.equal(p.projected, p.score));
  assert.deepEqual(d.legal, {});
  const cells = new Set(g.board.map((p) => p.x + "," + p.y));
  assert.equal(cells.size, g.board.length, "no two tiles share a cell");
}

test("seeded playouts at 1, 2, 4, 6 seats finish for every option combo", () => {
  let seed = 1;
  for (const n of [1, 2, 4, 6]) {
    for (const farmers of ["on", "off"]) {
      for (const small_city of [false, true]) {
        for (const deck of ["quick", "standard", "big"]) {
          for (const live_tally of [true, false]) {
            if (deck === "big" && (live_tally === false || small_city)) continue; // big decks: keep the suite fast
            seed += 1;
            const seats = [];
            for (let i = 0; i < n; i += 1) seats.push(i === 0 || i % 3 === 1 ? human("P" + (i + 1)) : bot("P" + (i + 1), 1 + (i % 4)));
            const g = makeGame(seats, { farmers, small_city, deck, live_tally, meeples: 5 + (seed % 6) }, seed);
            playOut(g, seeded(seed * 31));
            checkSane(g);
          }
        }
      }
    }
  }
});
