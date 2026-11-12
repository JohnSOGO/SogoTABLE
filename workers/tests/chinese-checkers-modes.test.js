// Chinese Checkers play modes + 2026-11-12 options (PLAN.md "Play modes" /
// "Added 2026-11-12"): blitz, live, turns, timed rounds through the injectable
// clock seam; 15 marbles; chains off; allow_pass off; assists projection.
import assert from "node:assert/strict";
import test from "node:test";
import {
  newChineseCheckersGame, initChineseCheckersSeats, setChineseCheckersOptions, normalizeChineseCheckersOptions,
  makeChineseCheckersMove, chineseCheckersGameToDict, chineseCheckersGameToDictForViewer,
  setChineseCheckersRandom, setChineseCheckersNow,
} from "../games/chinese-checkers/rules.js";
import { armCells } from "../games/chinese-checkers/board.js";

const human = (mark) => ({ mark, name: mark, kind: "human" });
const bot = (mark, bot_level = 2) => ({ mark, name: mark, kind: "bot", bot_level });
const T0 = 1_000_000;
let clock = T0;
setChineseCheckersNow(() => clock);
test.after(() => setChineseCheckersNow(null));

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function makeGame(seats, options = {}) {
  clock = T0;
  setChineseCheckersRandom(seeded(7));
  const g = newChineseCheckersGame();
  setChineseCheckersOptions(g, { cc_options: options });
  initChineseCheckersSeats(g, seats);
  return g;
}
const act = (g, mark, action) => makeChineseCheckersMove(g, mark, action);
const move = (g, mark, from, path, round = g.round) => act(g, mark, { type: "MOVE", round, from, path });
const tick = (g, mark = "P1") => act(g, mark, { type: "TICK" });
// First legal step for a seat, read from the projection like a client would.
function anyStep(g, mark) {
  const legal = chineseCheckersGameToDict(g).legal[mark] || {};
  const from = Object.keys(legal).find((k) => legal[k].steps.length);
  return { from, path: [legal[from].steps[0]] };
}
const playStep = (g, mark) => { const m = anyStep(g, mark); move(g, mark, m.from, m.path); return m; };
const eventsOf = (g, type, round) => g.events.filter((e) => e.type === type && (round === undefined || e.round === round));

test("options: mode/timer/marbles/chains/allow_pass/assists normalize, clamp and carry", () => {
  const n = normalizeChineseCheckersOptions;
  assert.deepEqual([n({}).mode, n({}).timer, n({}).chains, n({}).allow_pass, n({}).assists], ["rounds", 0, true, true, "full"]);
  assert.equal(n({ mode: "blitz" }).timer, 10);
  assert.equal(n({ mode: "live" }).timer, 30);
  assert.equal(n({ mode: "turns" }).timer, 0);
  assert.equal(n({ mode: "warp" }).mode, "rounds");
  assert.equal(n({ mode: "blitz", timer: 0 }).timer, 5, "blitz always ticks");
  assert.equal(n({ mode: "live", timer: 3 }).timer, 10, "live min 10");
  assert.equal(n({ mode: "rounds", timer: 3 }).timer, 5);
  assert.equal(n({ mode: "turns", timer: 0 }).timer, 0);
  assert.equal(n({ mode: "turns", timer: 999 }).timer, 120);
  assert.equal(n({ timer: "soon" }).timer, 0);
  assert.equal(n({ marbles: 15 }).marbles, 15);
  assert.equal(n({ chains: "off", allow_pass: "false", assists: "off" }).chains, false);
  assert.equal(n({ assists: "moves" }).assists, "moves");
  assert.equal(n({ assists: "lots" }).assists, "full");
  const raw = { mode: "live", timer: 45, chains: false, allow_pass: false, assists: "off", marbles: 6 };
  assert.deepEqual(n(n(raw)), n(raw), "normalization is idempotent");
  // Reset carry (handlers.carryOptionsOnReset re-feeds prevGame.options).
  const prev = makeGame([human("P1"), human("P2")], raw);
  const next = newChineseCheckersGame();
  setChineseCheckersOptions(next, { cc_options: prev.options });
  initChineseCheckersSeats(next, [human("P1"), human("P2")]);
  assert.deepEqual(next.options, prev.options);
  const d = chineseCheckersGameToDict(next);
  assert.equal(d.options.mode, "live");
  assert.equal(d.options.timer, 45);
});

test("15 marbles: 2 seats only, 15 home + goal holes incl. the hexagon edge; clamped to 10 for 3+", () => {
  assert.deepEqual(armCells(0, 15).filter((k) => k.endsWith(",4")).sort(), ["-1,4", "-2,4", "-3,4", "-4,4", "0,4"]);
  assert.equal(armCells(3, 15).length, 15);
  const g = makeGame([human("P1"), human("P2")], { marbles: 15 });
  const d = chineseCheckersGameToDict(g);
  assert.equal(d.options.marbles, 15);
  assert.equal(Object.keys(d.marbles).length, 30);
  assert.ok(d.players.every((p) => p.marbles_total === 15 && p.in_goal === 0));
  assert.ok(armCells(0, 15).every((k) => g.marbles[k] === "P1"));
  assert.ok(armCells(3, 15).every((k) => g.marbles[k] === "P2"));
  assert.ok(d.players.every((p) => p.distance > 0));
  const three = makeGame([human("P1"), human("P2"), human("P3")], { marbles: 15 });
  assert.equal(three.options.marbles, 10);
  assert.equal(Object.keys(three.marbles).length, 30);
});

test("chains off: single hops from the origin only; a chained path is rejected", () => {
  const setup = (chains) => {
    const g = makeGame([human("P1"), human("P2")], { chains });
    g.marbles = { "0,0": "P1", "1,0": "P2", "3,0": "P2" };
    return g;
  };
  const on = setup(true);
  const legalOn = chineseCheckersGameToDict(on).legal.P1["0,0"];
  assert.ok(legalOn.hops["2,0"].includes("4,0"));
  move(on, "P1", "0,0", ["2,0", "4,0"]);
  assert.equal(on.players.P1.committed.path.length, 2);
  const off = setup(false);
  const d = chineseCheckersGameToDict(off);
  assert.deepEqual(Object.keys(d.legal.P1["0,0"].hops), ["0,0"]);
  assert.ok(d.stops.P1["0,0"].includes("2,0"));
  assert.ok(!d.stops.P1["0,0"].includes("4,0"));
  assert.throws(() => move(off, "P1", "0,0", ["2,0", "4,0"]), /one hop/);
  move(off, "P1", "0,0", ["2,0"]);
  assert.deepEqual(off.players.P1.committed, { from: "0,0", path: ["2,0"] });
});

test("allow_pass off: PASS rejected while a legal move exists", () => {
  const g = makeGame([human("P1"), human("P2")], { allow_pass: false });
  assert.throws(() => act(g, "P1", { type: "PASS", round: g.round }), /still have a legal move — standard rules don't allow passing/);
  assert.equal(g.players.P1.committed, null);
  const open = makeGame([human("P1"), human("P2")]);
  act(open, "P1", { type: "PASS", round: open.round });
  assert.deepEqual(open.players.P1.committed, { pass: true });
});

test("assists: off trims legal/stops to {} and sends legal_lite; moves/full keep them", () => {
  const off = makeGame([human("P1"), human("P2")], { assists: "off" });
  const full = chineseCheckersGameToDict(off);
  const v = chineseCheckersGameToDictForViewer(full, "P1");
  assert.deepEqual(v.legal, {});
  assert.deepEqual(v.stops, {});
  assert.deepEqual(Object.keys(v.legal_lite), ["P1"]);
  assert.deepEqual(Object.keys(v.legal_lite.P1).sort(), Object.keys(full.legal.P1).sort());
  assert.ok(Object.values(v.legal_lite.P1).every((x) => x === true));
  assert.ok(Object.keys(v.legal_lite.P1).every((k) => off.marbles[k] === "P1"));
  assert.deepEqual(chineseCheckersGameToDictForViewer(full, null).legal_lite, {});
  for (const assists of ["moves", "full"]) {
    const g = makeGame([human("P1"), human("P2")], { assists });
    const view = chineseCheckersGameToDictForViewer(chineseCheckersGameToDict(g), "P2");
    assert.deepEqual(Object.keys(view.legal), ["P2"]);
    assert.deepEqual(Object.keys(view.stops), ["P2"]);
    assert.deepEqual(Object.keys(view.legal_lite), ["P2"]);
  }
});

test("projection: deadline, server_now, current, turn_order, moved", () => {
  const g = makeGame([human("P1"), human("P2")], { mode: "blitz" });
  clock = T0 + 250;
  const d = chineseCheckersGameToDict(g);
  assert.equal(d.options.mode, "blitz");
  assert.equal(d.options.timer, 10);
  assert.equal(d.deadline, T0 + 10_000);
  assert.equal(d.server_now, T0 + 250);
  assert.equal(d.current, null);
  assert.deepEqual(d.turn_order, []);
  assert.ok(d.players.every((p) => p.moved === false));
  assert.equal(chineseCheckersGameToDict(makeGame([human("P1"), human("P2")])).deadline, null, "untimed rounds");
});

test("blitz: immediate moves, fixed beat, no early close, one move per seat, TICK no-op before deadline", () => {
  const g = makeGame([human("P1"), human("P2")], { mode: "blitz" });
  assert.equal(g.round, 1);
  assert.equal(g.deadline, T0 + 10_000);
  clock = T0 + 1000;
  const m1 = playStep(g, "P1");
  assert.equal(g.marbles[m1.path[0]], "P1", "applied the moment it arrives");
  assert.equal(g.marbles[m1.from], undefined);
  const ev = eventsOf(g, "move", 1)[0];
  assert.equal(ev.mark, "P1");
  assert.equal(ev.outcome, "ok");
  assert.equal(ev.live, true);
  assert.equal(chineseCheckersGameToDict(g).players[0].moved, true);
  assert.throws(() => playStep(g, "P1"), /already moved this round/);
  assert.throws(() => act(g, "P1", { type: "RETRACT", round: 1 }), /nothing to take back/);
  assert.throws(() => act(g, "P1", { type: "SKIP_PLAYER", round: 1, target: "P2" }), /clock moves the table/);
  clock = T0 + 2000;
  playStep(g, "P2");
  assert.equal(g.round, 1, "blitz never closes early");
  assert.equal(g.deadline, T0 + 10_000);
  const before = g.events.length;
  clock = T0 + 9999;
  tick(g, "P2");
  assert.equal(g.round, 1);
  assert.equal(g.events.length, before, "TICK before the deadline is a silent no-op");
  clock = T0 + 10_000;
  tick(g, "P1");
  assert.equal(g.round, 2);
  assert.equal(g.deadline, T0 + 20_000, "fixed beat");
  assert.deepEqual(eventsOf(g, "timeout", 1), [], "both moved in round 1");
  assert.ok(Object.values(g.players).every((p) => p.moved === false));
});

test("blitz: FCFS conflict — the second mover to a hole is rejected and may retry", () => {
  const g = makeGame([human("P1"), human("P2")], { mode: "blitz" });
  g.marbles = { "0,0": "P1", "2,0": "P2", "-3,6": "P1", "3,-6": "P2" };
  move(g, "P1", "0,0", ["1,0"]);
  assert.throws(() => move(g, "P2", "2,0", ["1,0"]), /That hole is taken/);
  assert.equal(g.players.P2.moved, false, "rejected move doesn't use the turn");
  move(g, "P2", "2,0", ["2,-1"]);
  assert.equal(g.marbles["2,-1"], "P2");
  assert.equal(g.marbles["1,0"], "P1");
});

test("blitz: timeout loses the turn; several elapsed rounds advance; stale stamp rejected", () => {
  const g = makeGame([human("P1"), human("P2")], { mode: "blitz", timer: 5 });
  clock = T0 + 1000;
  playStep(g, "P1");
  const late = anyStep(g, "P2");
  clock = T0 + 5000;
  assert.throws(() => move(g, "P2", late.from, late.path, 1), /round 1 — the table is on round 2/, "the clock closes round 1 first");
  assert.deepEqual(eventsOf(g, "timeout", 1).map((e) => e.mark), ["P2"]);
  assert.equal(g.round, 2);
  clock = T0 + 5000 + 3 * 5000 + 10; // rounds 2, 3, 4 all expire
  tick(g, "P2");
  assert.equal(g.round, 5);
  assert.equal(g.deadline, T0 + 25_000);
  for (const r of [2, 3, 4]) assert.deepEqual(eventsOf(g, "timeout", r).map((e) => e.mark), ["P1", "P2"]);
  assert.equal(g.status, "playing");
  // TICK from a finished seat is accepted; on a complete game it's silent.
  g.players.P1.finished = true;
  tick(g, "P1");
  g.status = "complete";
  tick(g, "P2");
  assert.throws(() => act(g, "P2", { type: "PASS" }), /already over/);
});

test("live: closes early once every human moved (bots move at close); timeout otherwise", () => {
  const g = makeGame([human("P1"), human("P2"), bot("P3")], { mode: "live" });
  assert.equal(g.deadline, T0 + 30_000);
  clock = T0 + 1000;
  playStep(g, "P1");
  assert.equal(g.round, 1);
  clock = T0 + 4000;
  playStep(g, "P2");
  assert.equal(g.round, 2, "closed early");
  assert.equal(g.deadline, T0 + 4000 + 30_000, "next clock counts from the close");
  assert.deepEqual(eventsOf(g, "move", 1).map((e) => e.mark), ["P1", "P2", "P3"], "bot moved at close");
  assert.ok(eventsOf(g, "move", 1).every((e) => e.live));
  clock = T0 + 5000;
  playStep(g, "P2");
  clock = T0 + 34_000;
  tick(g, "P2");
  assert.equal(g.round, 3);
  assert.deepEqual(eventsOf(g, "timeout", 2).map((e) => e.mark), ["P1"]);
  assert.deepEqual(eventsOf(g, "move", 2).map((e) => e.mark), ["P2", "P3"]);
});

test("rounds + timer: un-committed humans auto-pass at the deadline; early close re-arms", () => {
  const g = makeGame([human("P1"), human("P2")], { timer: 15 });
  assert.equal(g.deadline, T0 + 15_000);
  const m = anyStep(g, "P1");
  move(g, "P1", m.from, m.path);
  assert.equal(g.marbles[m.from], "P1", "still hidden until close");
  assert.throws(() => act(g, "P1", { type: "SKIP_PLAYER", round: 1, target: "P2" }), /clock moves the table/);
  clock = T0 + 15_000;
  tick(g, "P2");
  assert.equal(g.round, 2);
  assert.deepEqual(eventsOf(g, "timeout", 1).map((e) => e.mark), ["P2"]);
  assert.equal(g.marbles[m.path[0]], "P1");
  assert.equal(g.deadline, T0 + 30_000);
  clock = T0 + 17_000;
  act(g, "P1", { type: "PASS", round: 2 });
  act(g, "P2", { type: "PASS", round: 2 });
  assert.equal(g.round, 3);
  assert.equal(g.deadline, T0 + 17_000 + 15_000);
});

test("turns: clockwise order, wrong seat rejected, bot turns instant, round counts turns", () => {
  const g = makeGame([human("P1"), bot("P2"), human("P3")], { mode: "turns" });
  const d = chineseCheckersGameToDict(g);
  assert.deepEqual(d.turn_order, [...g.seat_order].sort((a, b) => g.players[a].arm - g.players[b].arm));
  assert.deepEqual(d.turn_order, ["P1", "P2", "P3"]);
  assert.equal(d.current, "P1");
  assert.equal(d.deadline, null, "untimed turns");
  assert.equal(g.round, 1);
  assert.throws(() => playStep(g, "P3"), /It's P1's turn/);
  assert.throws(() => act(g, "P1", { type: "RETRACT", round: 1 }), /nothing to take back/);
  const m = playStep(g, "P1");
  assert.equal(g.marbles[m.path[0]], "P1");
  assert.equal(g.current, "P3", "bot P2 moved instantly");
  assert.equal(g.round, 3);
  assert.deepEqual(g.events.filter((e) => e.type === "turn").map((e) => e.mark), ["P1", "P2", "P3"]);
  assert.equal(eventsOf(g, "move", 2)[0].mark, "P2");
  playStep(g, "P3");
  assert.equal(g.current, "P1");
  assert.equal(g.round, 4);
});

test("turns: skip vote moves past the current human (untimed only)", () => {
  const g = makeGame([human("P1"), human("P2"), human("P3")], { mode: "turns" });
  act(g, "P2", { type: "SKIP_PLAYER", round: 1, target: "P1" });
  assert.equal(g.current, "P1");
  act(g, "P3", { type: "SKIP_PLAYER", round: 1, target: "P1" });
  assert.equal(g.current, "P2");
  assert.deepEqual(eventsOf(g, "skip", 1).map((e) => e.mark), ["P1"]);
  assert.throws(() => act(g, "P1", { type: "SKIP_PLAYER", round: 2, target: "P3" }), /can't be skipped/);
});

test("turns + timer: the current human loses the turn at the deadline", () => {
  const g = makeGame([human("P1"), bot("P2"), human("P3")], { mode: "turns", timer: 20 });
  assert.equal(g.deadline, T0 + 20_000);
  clock = T0 + 20_001;
  tick(g, "P3");
  assert.deepEqual(eventsOf(g, "timeout").map((e) => e.mark), ["P1"]);
  assert.equal(g.current, "P3");
  assert.equal(g.deadline, T0 + 40_000, "bot turn was instant; P3's clock counts from the expired deadline");
  clock = T0 + 21_000;
  playStep(g, "P3");
  assert.equal(g.current, "P1");
  assert.equal(g.deadline, T0 + 41_000);
});

test("all-bot tables resolve straight through in every mode without waiting for the clock", () => {
  for (const mode of ["rounds", "blitz", "live", "turns"]) {
    const g = makeGame([bot("P1", 3), bot("P2", 3)], { mode, marbles: 6, timer: mode === "rounds" ? 10 : undefined });
    assert.equal(g.status, "complete", mode);
    assert.equal(g.deadline, null, mode);
    assert.ok(g.winners.length >= 1, mode);
  }
});
