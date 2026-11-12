import assert from "node:assert/strict";
import test from "node:test";
import {
  REEFKEEPERS_GAME_ID, isReefkeepersGame, newReefkeepersGame, initReefkeepersSeats, setReefkeepersOptions,
  makeReefkeepersMove, reefkeepersGameToDict, reefkeepersGameToDictForViewer, setReefkeepersRandom,
  reefkeepersScoreByMark, normalizeReefkeepersOptions,
} from "../games/reefkeepers/rules.js";
import { TILES, HABITATS, RARITY, deckIds, tileById, tileStrength } from "../games/reefkeepers/tiles.js";
import { legalSpots, isLegalSpot, scoreReef } from "../games/reefkeepers/board.js";
import { chooseReefMove } from "../games/reefkeepers/ai.js";
import { newGame, gameToDict, gameToDictForViewer, resetRoomGame, applyGameStartOptions } from "../games/handlers.js";

const human = (mark) => ({ mark, name: mark, kind: "human" });
const bot = (mark, bot_level = 2) => ({ mark, name: mark, kind: "bot", bot_level });

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function makeGame(seats, options = {}, seed = 1) {
  setReefkeepersRandom(seeded(seed));
  const g = newReefkeepersGame();
  setReefkeepersOptions(g, { reef_options: options });
  initReefkeepersSeats(g, seats);
  return g;
}

// A simple legal commit for a human seat: first legal spot, first offer tiles.
function autoBody(g, mark, picks = null) {
  const seat = g.players[mark];
  const pending = tileById(seat.pending);
  const spots = legalSpots(seat.cells, pending, g.options.size);
  return { type: "COMMIT", round: g.round, place: spots[0] || null, picks: picks || g.offer.slice(0, Math.min(3, g.offer.length)) };
}

const cell = (x, y, t, p = 0) => ({ x, y, t, p });

// ---------- deck ----------

test("deck: 48 original tiles, unique ids, n = 1..48 ordered by strength", () => {
  assert.equal(TILES.length, 48);
  assert.deepEqual(TILES.map((t) => t.n), Array.from({ length: 48 }, (_, i) => i + 1));
  assert.equal(new Set(TILES.map((t) => t.id)).size, 48);
  TILES.forEach((t) => {
    assert.equal(t.id, `t${t.n}`);
    assert.ok(HABITATS.includes(t.a) && HABITATS.includes(t.b));
    assert.ok(t.ap >= 0 && t.ap <= 3 && t.bp >= 0 && t.bp <= 3);
  });
  for (let i = 1; i < TILES.length; i += 1) {
    const s = (t) => tileStrength([t.a, t.ap, t.b, t.bp]);
    assert.ok(s(TILES[i]) >= s(TILES[i - 1]), `tile ${i + 1} weaker than ${i}`);
  }
  assert.ok(TILES.some((t) => t.a === t.b) && TILES.some((t) => t.a !== t.b), "mono and mixed tiles");
});

test("deck: rarer habitats appear less often and carry more pearls per half", () => {
  const count = {};
  const pearls = {};
  TILES.forEach((t) => [[t.a, t.ap], [t.b, t.bp]].forEach(([h, p]) => {
    count[h] = (count[h] || 0) + 1;
    pearls[h] = (pearls[h] || 0) + p;
  }));
  const byRarity = [...HABITATS].sort((a, b) => RARITY[a] - RARITY[b]);
  for (let i = 1; i < byRarity.length; i += 1) {
    const [prev, cur] = [byRarity[i - 1], byRarity[i]];
    assert.ok(count[cur] <= count[prev], `${cur} more common than ${prev}`);
    assert.ok(pearls[cur] / count[cur] >= pearls[prev] / count[prev], `${cur} pearls/half below ${prev}`);
  }
});

test("deck: extra copies carry id suffixes and keep their strength", () => {
  const ids = deckIds(4);
  assert.equal(ids.length, 192);
  assert.equal(new Set(ids).size, 192);
  assert.ok(ids.includes("t17b") && ids.includes("t48d"));
  assert.equal(tileById("t17b").n, 17);
  assert.equal(tileById("t17b").id, "t17b");
  assert.equal(tileById("t49"), null);
  assert.equal(tileById("x1"), null);
});

// ---------- board ----------

test("legality: next to the Grotto, matching habitat, free cells, bounding box", () => {
  const kc = { a: "kelp", ap: 0, b: "coral", bp: 1 };
  assert.ok(isLegalSpot([], kc, 5, { x: 1, y: 0, rot: 0 }), "touches the Grotto");
  assert.ok(!isLegalSpot([], kc, 5, { x: 2, y: 0, rot: 0 }), "floating tile");
  assert.ok(!isLegalSpot([], kc, 5, { x: 0, y: 0, rot: 0 }), "on the Grotto");
  assert.ok(!isLegalSpot([], kc, 5, { x: 1, y: 0, rot: 4 }), "bad rotation");

  const reef = [cell(1, 0, "kelp")];
  assert.ok(isLegalSpot(reef, { a: "coral", ap: 0, b: "kelp", bp: 0 }, 5, { x: 3, y: 0, rot: 2 }), "B half matches kelp");
  assert.ok(!isLegalSpot(reef, { a: "coral", ap: 0, b: "coral", bp: 0 }, 5, { x: 2, y: 0, rot: 0 }), "no habitat match");
  assert.ok(!isLegalSpot(reef, kc, 5, { x: 1, y: 0, rot: 1 }), "occupied cell");

  const row = [cell(1, 0, "sand"), cell(2, 0, "sand"), cell(3, 0, "sand"), cell(4, 0, "sand")];
  const ss = { a: "sand", ap: 0, b: "sand", bp: 0 };
  assert.ok(!isLegalSpot(row, ss, 5, { x: 5, y: 0, rot: 1 }), "east edge breaks 5 wide");
  assert.ok(!isLegalSpot(row, ss, 5, { x: -1, y: 0, rot: 1 }), "west edge breaks 5 wide");
  assert.ok(isLegalSpot(row, ss, 5, { x: 4, y: 1, rot: 1 }), "inside the box");
  assert.ok(isLegalSpot(row, ss, 7, { x: 5, y: 0, rot: 0 }), "Grand reef allows 7 wide");

  const spots = legalSpots(row, ss, 5);
  assert.ok(spots.length > 0);
  spots.forEach((s) => assert.ok(isLegalSpot(row, ss, 5, s)));
  assert.ok(spots.every((s) => s.x >= 0 && s.x + [1, 0, -1, 0][s.rot] >= 0 && s.x <= 4));
});

test("scoring: regions are cells × pearls; the Grotto joins nothing", () => {
  const s = scoreReef([cell(1, 0, "kelp", 1), cell(2, 0, "kelp"), cell(0, 1, "sand"), cell(-1, 0, "coral", 2)], 5, { heart_bonus: true, full_bonus: true });
  assert.equal(s.total, 4);
  assert.equal(s.heart, 0);
  assert.equal(s.full, 0);
  assert.equal(s.largest, 2);
  assert.equal(s.pearls, 3);
  assert.deepEqual(s.regions[0], { t: "kelp", size: 2, pearls: 1, points: 2 });
  const split = scoreReef([cell(-1, 0, "sand", 1), cell(1, 0, "sand", 1)], 5, {});
  assert.equal(split.total, 2, "two separate sand regions, not one of size 2");
});

test("scoring: heart (+10, centred full box) and full (+5, every cell) bonuses", () => {
  const full = [];
  for (let x = -2; x <= 2; x += 1) for (let y = -2; y <= 2; y += 1) if (x || y) full.push(cell(x, y, "sand", x === 2 && y === 2 ? 1 : 0));
  assert.equal(scoreReef(full, 5, { heart_bonus: true, full_bonus: true }).total, 24 + 10 + 5);
  assert.equal(scoreReef(full, 5, { heart_bonus: false, full_bonus: false }).total, 24);
  const offCentre = [];
  for (let x = -1; x <= 3; x += 1) for (let y = -2; y <= 2; y += 1) if (x || y) offCentre.push(cell(x, y, "sand", x === 3 && y === 2 ? 1 : 0));
  const s = scoreReef(offCentre, 5, { heart_bonus: true, full_bonus: true });
  assert.equal(s.heart, 0);
  assert.equal(s.full, 5);
  assert.equal(s.total, 24 + 5);
});

// ---------- lifecycle + draft ----------

test("start: shape, line size, rounds, deck secret", () => {
  const g = makeGame([human("P1"), human("P2")]);
  assert.ok(isReefkeepersGame(g));
  assert.equal(g.game_id, REEFKEEPERS_GAME_ID);
  assert.equal(g.line_size, 3);
  assert.equal(g.rounds_total, 13);
  assert.equal(g.offer.length, 3);
  const d = reefkeepersGameToDict(g);
  assert.equal(d.deck, undefined);
  assert.equal(d.deck_count, 3 * 12 - 3);
  assert.deepEqual(d.offer.map((t) => t.n), [...d.offer.map((t) => t.n)].sort((a, b) => a - b));
  assert.ok(d.offer.every((t) => typeof t.id === "string" && HABITATS.includes(t.a)));
  assert.equal(d.players.P1.pending, null);
  assert.deepEqual(d.players.P1.legal, []);
  assert.equal(d.phase, "playing");
  assert.equal(d.event_seq, 1);
});

test("seat counts: 1–8 only, friendly errors outside", () => {
  assert.throws(() => makeGame([]), /at least one/);
  assert.throws(() => makeGame(Array.from({ length: 9 }, (_, i) => bot(`P${i + 1}`))), /at most 8/);
});

test("round 1 claim order is a seeded shuffle", () => {
  const seats = [human("P1"), human("P2"), human("P3"), human("P4")];
  assert.deepEqual(makeGame(seats, {}, 7).claim_order, makeGame(seats, {}, 7).claim_order);
  const orders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => makeGame(seats, {}, s).claim_order.join()));
  assert.ok(orders.size > 1);
});

test("draft: claim order decides contention; a seat whose picks are gone is bumped", () => {
  const g = makeGame([human("P1"), human("P2"), human("P3")], {}, 3);
  const [first, second, third] = g.claim_order;
  const [x, y, z] = g.offer;
  // Arrival order is reversed on purpose: it must not matter.
  makeReefkeepersMove(g, third, { type: "COMMIT", round: 1, place: null, picks: [x] });
  makeReefkeepersMove(g, second, { type: "COMMIT", round: 1, place: null, picks: [x, y] });
  makeReefkeepersMove(g, first, { type: "COMMIT", round: 1, place: null, picks: [x] });
  assert.equal(g.round, 2);
  assert.equal(g.players[first].pending, x);
  assert.equal(g.players[second].pending, y);
  assert.equal(g.players[third].pending, z);
  const bumped = g.events.find((e) => e.type === "bumped");
  assert.equal(bumped.mark, third);
  assert.equal(bumped.tile, z);
  assert.deepEqual(bumped.taken_by, [first]);
  assert.equal(g.events.find((e) => e.type === "picked" && e.mark === second).choice, 2);
  // Next claim order: lowest tile taken chooses first.
  assert.deepEqual(g.claim_order, [first, second, third]);
});

test("solo draft: the claimed tile leaves, leftovers drift away, a fresh row deals", () => {
  const g = makeGame([human("P1")], {}, 5);
  const target = g.offer[2];
  makeReefkeepersMove(g, "P1", { type: "COMMIT", round: 1, place: null, picks: [target] });
  assert.equal(g.players.P1.pending, target);
  assert.equal(g.offer.length, 3);
  assert.ok(!g.offer.includes(target));
});

test("commits: stale round rejected, duplicate ignored, bad bodies rejected", () => {
  const g = makeGame([human("P1"), human("P2")], {}, 2);
  const [a, b] = g.offer;
  assert.throws(() => makeReefkeepersMove(g, "P1", { type: "COMMIT", round: 2, place: null, picks: [a] }), /round 2/);
  assert.throws(() => makeReefkeepersMove(g, "P1", { type: "COMMIT", place: null, picks: [a] }), /round/);
  assert.throws(() => makeReefkeepersMove(g, "P1", { type: "COMMIT", round: 1, place: null, picks: [] }), /1 to 3/);
  assert.throws(() => makeReefkeepersMove(g, "P1", { type: "COMMIT", round: 1, place: null, picks: [a, a] }), /different/);
  assert.throws(() => makeReefkeepersMove(g, "P1", { type: "COMMIT", round: 1, place: null, picks: ["t99"] }), /isn't in/);
  assert.throws(() => makeReefkeepersMove(g, "P1", { type: "COMMIT", round: 1, place: { x: 1, y: 0, rot: 0 }, picks: [a] }), /no tile/);
  assert.throws(() => makeReefkeepersMove(g, "P9", { type: "COMMIT", round: 1, place: null, picks: [a] }), /not seated/);
  assert.throws(() => makeReefkeepersMove(g, "P1", { type: "DANCE" }), /COMMIT or SKIP_PLAYER/);
  makeReefkeepersMove(g, "P1", { type: "COMMIT", round: 1, place: null, picks: [a] });
  makeReefkeepersMove(g, "P1", { type: "COMMIT", round: 1, place: null, picks: [b] });
  assert.deepEqual(g.players.P1.committed.picks, [a]);
  assert.equal(g.move_count, 1);
  assert.equal(g.round, 1);
});

test("placement: required when a spot exists, null discards when none does", () => {
  const g = makeGame([human("P1")], {}, 4);
  makeReefkeepersMove(g, "P1", { type: "COMMIT", round: 1, place: null, picks: [g.offer[0]] });
  assert.throws(() => makeReefkeepersMove(g, "P1", { type: "COMMIT", round: 2, place: null, picks: [g.offer[0]] }), /Place your tile/);
  assert.throws(() => makeReefkeepersMove(g, "P1", { type: "COMMIT", round: 2, place: { x: 3, y: 3, rot: 0 }, picks: [g.offer[0]] }), /can't go there/);
  // Fill the reef but one hole: nothing fits, so null is the only legal place.
  const cells = [];
  for (let x = -2; x <= 2; x += 1) for (let y = -2; y <= 2; y += 1) if ((x || y) && !(x === 2 && y === 2)) cells.push(cell(x, y, "sand"));
  g.players.P1.cells = cells;
  const pending = g.players.P1.pending;
  assert.throws(() => makeReefkeepersMove(g, "P1", { type: "COMMIT", round: 2, place: { x: 2, y: 2, rot: 2 }, picks: [g.offer[0]] }), /can't fit anywhere/);
  makeReefkeepersMove(g, "P1", { type: "COMMIT", round: 2, place: null, picks: [g.offer[0]] });
  assert.equal(g.players.P1.discards, 1);
  assert.ok(g.events.some((e) => e.type === "discarded" && e.tile === pending));
});

test("skip vote: only committed humans vote; skipped seat is rejected and autopiloted", () => {
  const g = makeGame([human("P1"), human("P2"), human("P3"), human("P4")], {}, 6);
  makeReefkeepersMove(g, "P1", autoBody(g, "P1"));
  makeReefkeepersMove(g, "P2", autoBody(g, "P2"));
  assert.throws(() => makeReefkeepersMove(g, "P4", { type: "SKIP_PLAYER", target: "P3" }), /locked in/);
  assert.throws(() => makeReefkeepersMove(g, "P1", { type: "SKIP_PLAYER", target: "P1" }), /yourself/);
  makeReefkeepersMove(g, "P1", { type: "SKIP_PLAYER", target: "P3" });
  assert.deepEqual(g.skip_votes, { P3: ["P1"] });
  assert.equal(g.players.P3.skipped, false);
  makeReefkeepersMove(g, "P2", { type: "SKIP_PLAYER", target: "P3" });
  assert.equal(g.players.P3.skipped, true);
  assert.deepEqual(g.skip_votes, {});
  assert.throws(() => makeReefkeepersMove(g, "P3", autoBody(g, "P3")), /skipped/);
  makeReefkeepersMove(g, "P4", autoBody(g, "P4"));
  assert.equal(g.round, 2);
  assert.ok(g.players.P3.pending, "autopilot claimed a tile for the skipped seat");
  assert.equal(g.players.P3.skipped, false, "back in next round");
});

// ---------- projection ----------

test("projection: other seats' commits, legal spots and hints are masked until resolution", () => {
  const g = makeGame([human("P1"), human("P2"), bot("P3", 3)], { hints: true }, 8);
  // Round 1 → 2 so every seat has a pending tile.
  makeReefkeepersMove(g, "P1", autoBody(g, "P1"));
  makeReefkeepersMove(g, "P2", autoBody(g, "P2"));
  makeReefkeepersMove(g, "P1", autoBody(g, "P1"));
  const raw = reefkeepersGameToDict(g);
  assert.ok(raw.players.P1.committed && raw.players.P1.has_committed);
  const forP2 = reefkeepersGameToDictForViewer(raw, "P2");
  assert.equal(forP2.players.P1.committed, null);
  assert.equal(forP2.players.P1.has_committed, true);
  assert.deepEqual(forP2.players.P1.legal, []);
  assert.ok(forP2.players.P2.legal.length > 0);
  assert.ok(forP2.players.P2.hint && "place" in forP2.players.P2.hint && "pick" in forP2.players.P2.hint);
  assert.ok(g.offer.includes(forP2.players.P2.hint.pick));
  assert.ok(isLegalSpot(g.players.P2.cells, tileById(g.players.P2.pending), 5, forP2.players.P2.hint.place));
  assert.equal(forP2.players.P3.hint, null);
  const forP1 = reefkeepersGameToDictForViewer(raw, "P1");
  assert.deepEqual(forP1.players.P1.committed, g.players.P1.committed);
  assert.equal(forP1.players.P2.committed, null);
  const spectator = reefkeepersGameToDictForViewer(raw, "");
  assert.ok(Object.values(spectator.players).every((p) => p.committed === null && p.hint === null));
  // Through the platform dispatch too.
  assert.equal(gameToDictForViewer(gameToDict(g), "P2", "playing").players.P1.committed, null);
});

test("projection: live_score off hides other seats' scores; hints off hides hints", () => {
  const g = makeGame([human("P1"), human("P2")], { live_score: false }, 9);
  const forP1 = reefkeepersGameToDictForViewer(reefkeepersGameToDict(g), "P1");
  assert.ok(forP1.players.P1.score && Number.isInteger(forP1.players.P1.score.total));
  assert.equal(forP1.players.P2.score, null);
  assert.equal(forP1.players.P1.hint, null);
});

// ---------- whole games ----------

function assertComplete(g, seats) {
  assert.equal(g.status, "complete");
  assert.equal(g.results.length, seats);
  assert.equal(g.winner, g.results[0].mark);
  assert.equal(g.results[0].rank, 1);
  const scores = reefkeepersScoreByMark(g);
  g.results.forEach((r) => assert.equal(scores[r.mark], r.total));
  for (let i = 1; i < g.results.length; i += 1) {
    const [p, c] = [g.results[i - 1], g.results[i]];
    assert.ok(p.total > c.total || (p.total === c.total && (p.largest > c.largest || (p.largest === c.largest && p.pearls >= c.pearls))));
    assert.ok(c.rank >= p.rank);
  }
  assert.ok(g.events.length <= 40);
  g.events.forEach((e, i) => { if (i) assert.equal(e.seq, g.events[i - 1].seq + 1); });
  assert.equal(g.events.at(-1).type, "final");
  assert.equal(g.deck.length, 0);
}

test("all-bot table resolves straight through, quickly", () => {
  const seats = [1, 2, 3, 4, 1, 2, 3, 4].map((l, i) => bot(`P${i + 1}`, l));
  const t0 = performance.now();
  const g = makeGame(seats, {}, 11);
  const ms = performance.now() - t0;
  assertComplete(g, 8);
  assert.equal(g.round, 13);
  assert.ok(ms < 1000, `8-bot game took ${ms}ms`);
  const d = reefkeepersGameToDict(g);
  assert.deepEqual(d.results, g.results);
  assert.ok(d.players.P1.cells.length <= 24);
});

test("Grand reef (7×7): 24 drafts + 1, more deck copies", () => {
  const g = makeGame([bot("P1", 4), bot("P2", 3), bot("P3", 2)], { size: 7 }, 12);
  assert.equal(g.rounds_total, 25);
  assertComplete(g, 3);
  Object.values(g.players).forEach((p) => assert.ok(p.cells.length <= 48));
});

test("solo human game plays all 13 rounds to completion", () => {
  const g = makeGame([human("P1")], {}, 13);
  let guard = 0;
  while (g.status === "playing" && guard++ < 50) makeReefkeepersMove(g, "P1", autoBody(g, "P1"));
  assertComplete(g, 1);
  assert.equal(guard, 13);
  assert.throws(() => makeReefkeepersMove(g, "P1", autoBody(g, "P1")), /over/);
});

test("8-seat table: line of 8, two deck copies, human plays with 7 bots", () => {
  const g = makeGame([human("P1"), ...[2, 3, 4, 5, 6, 7, 8].map((n) => bot(`P${n}`, 1 + (n % 4)))], {}, 14);
  assert.equal(g.line_size, 8);
  assert.equal(g.offer.length, 8);
  const seen = new Set();
  while (g.status === "playing") {
    g.offer.forEach((id) => seen.add(id));
    makeReefkeepersMove(g, "P1", autoBody(g, "P1"));
  }
  assertComplete(g, 8);
  assert.equal(seen.size, 96);
  assert.ok([...seen].some((id) => id.endsWith("b")));
});

test("bot levels: stronger bots outscore level 1 over several games", () => {
  let weak = 0;
  let strong = 0;
  for (let s = 0; s < 6; s += 1) {
    const g = makeGame([bot("P1", 1), bot("P2", 4)], {}, 100 + s);
    weak += g.results.find((r) => r.mark === "P1").total;
    strong += g.results.find((r) => r.mark === "P2").total;
  }
  assert.ok(strong > weak, `level 4 ${strong} vs level 1 ${weak}`);
});

test("ai: every level proposes a commit the rules accept", () => {
  const offer = TILES.slice(10, 14);
  const view = { cells: [cell(1, 0, "kelp", 1)], pending: TILES[30], offer, size: 5, options: normalizeReefkeepersOptions({}) };
  [1, 2, 3, 4].forEach((lvl) => {
    const m = chooseReefMove(view, lvl, seeded(lvl));
    assert.ok(isLegalSpot(view.cells, view.pending, 5, m.place));
    assert.ok(m.picks.length >= 1 && m.picks.length <= 3 && m.picks.every((id) => offer.some((t) => t.id === id)));
  });
});

// ---------- options + platform wiring ----------

test("options: clamped, nested or flat, carried across a rematch", () => {
  assert.deepEqual(normalizeReefkeepersOptions({ size: 9, hints: "yes", live_score: "off" }), {
    size: 5, heart_bonus: true, full_bonus: true, show_spots: true, live_score: false, hints: false,
  });
  const g = newReefkeepersGame();
  setReefkeepersOptions(g, { size: "7", hints: "true" });
  assert.equal(g.options.size, 7);
  assert.equal(g.options.hints, true);
  setReefkeepersOptions(g, {});
  assert.equal(g.options.size, 7, "a payload without options keeps them");

  const room = { game_id: REEFKEEPERS_GAME_ID, started: true, game: newGame("reef-keepers"), players: [human("P1"), bot("P2", 2)] };
  applyGameStartOptions(room.game, { reef_options: { size: 7, heart_bonus: false, hints: true } });
  setReefkeepersRandom(seeded(20));
  initReefkeepersSeats(room.game, room.players);
  assert.equal(room.game.rounds_total, 25);
  resetRoomGame(room);
  assert.ok(isReefkeepersGame(room.game));
  assert.equal(room.game.options.size, 7);
  assert.equal(room.game.options.heart_bonus, false);
  assert.equal(room.game.options.hints, true);
  assert.equal(room.game.round, 1);
  assert.deepEqual(room.game.seat_order, ["P1", "P2"]);
});

test("normalize: garbage stored state stays playable", () => {
  const g = makeGame([human("P1"), human("P2")], {}, 21);
  g.players.P1.cells.push({ x: "a", y: 1, t: "lava", p: 9 }, null);
  g.round = 999;
  g.events = "nope";
  const d = reefkeepersGameToDict(g);
  assert.equal(d.round, 13);
  assert.deepEqual(d.players.P1.cells, []);
  assert.deepEqual(d.events, []);
});
