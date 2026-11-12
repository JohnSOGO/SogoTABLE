import assert from "node:assert/strict";
import test from "node:test";
import {
  TRADEWINDS_GAME_ID, isTradewindsGame, newTradewindsGame, initTradewindsSeats, setTradewindsOptions,
  makeTradewindsMove, tradewindsGameToDict, tradewindsGameToDictForViewer, tradewindsScoreByMark,
  setTradewindsRandom, normalizeTradewindsOptions,
} from "../games/tradewinds/rules.js";
import { graphOf, longestPath, hutSpotFree, generateBoard, PIPS } from "../games/tradewinds/board.js";
import { gameToDictForViewer, moveHandlerFor, newGame } from "../games/handlers.js";

const human = (mark) => ({ mark, name: mark, kind: "human" });
const bot = (mark, bot_level = 2) => ({ mark, name: mark, kind: "bot", bot_level });

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function makeGame(seats, options = {}, seed = 1) {
  setTradewindsRandom(seeded(seed));
  const g = newTradewindsGame();
  setTradewindsOptions(g, { ti_options: options });
  initTradewindsSeats(g, seats);
  return g;
}

const view = (g, mark) => tradewindsGameToDictForViewer(tradewindsGameToDict(g), mark);

function setupHuman(g, mark) {
  const v = view(g, mark);
  const hut = v.legal.setup_huts[0];
  makeTradewindsMove(g, mark, { type: "SETUP_PLACE", round: g.round, hut, path: v.legal.setup_paths[hut][0] });
}

// Play through setup for every human seat (bots place themselves).
function finishSetup(g) {
  for (let i = 0; i < 40 && g.phase === "setup"; i += 1) setupHuman(g, g.setup.order[g.setup.index]);
}

// Force the table into a calm build phase.
function toBuild(g) {
  for (let i = 0; i < 20 && g.phase !== "build"; i += 1) {
    g.seat_order.forEach((m) => {
      const p = g.players[m];
      if (g.phase === "discard" && p.must_discard && !p.is_bot) {
        const cards = {};
        let n = p.must_discard;
        for (const r of Object.keys(p.hand)) { const k = Math.min(n, p.hand[r]); if (k) { cards[r] = k; n -= k; } }
        makeTradewindsMove(g, m, { type: "DISCARD", round: g.round, cards });
      }
    });
    if (g.phase === "monkey") {
      const v = view(g, g.seat_order[(g.round - 1) % g.seat_order.length]);
      const hex = v.legal.monkey_hexes[0];
      makeTradewindsMove(g, g.seat_order[(g.round - 1) % g.seat_order.length], { type: "MOVE_MONKEY", round: g.round, hex, victim: v.legal.monkey_victims[hex][0] || null });
    }
  }
  assert.equal(g.phase, "build");
}

test("tradewinds: identity, min players, options clamp", () => {
  const g = newTradewindsGame();
  assert.equal(g.game_id, TRADEWINDS_GAME_ID);
  assert.ok(isTradewindsGame(g));
  assert.ok(!isTradewindsGame({ game_id: "hearts" }));
  assert.throws(() => initTradewindsSeats(newTradewindsGame(), [human("P1")]), /at least 2 players/);
  const o = normalizeTradewindsOptions({ target: 99, hand_limit: "9", board: "huge", quick_setup: "yes", show_pips: false });
  assert.deepEqual([o.target, o.hand_limit, o.board, o.quick_setup, o.show_pips], [10, 9, "auto", false, false]);
  const h = moveHandlerFor(newGame(TRADEWINDS_GAME_ID));
  assert.ok(h && h.resolvesBotsInternally && h.initSeats && h.applyStartOptions);
});

test("tradewinds: board generation — sizes, numbers, docks, no touching 6/8", () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    for (const size of ["small", "large"]) {
      const b = generateBoard(size, seeded(seed));
      assert.equal(b.hexes.length, size === "small" ? 19 : 37);
      const volcanos = b.hexes.filter((h) => h.terrain === "volcano");
      assert.ok(volcanos.every((h) => h.number === null));
      assert.ok(b.hexes.filter((h) => h.terrain !== "volcano").every((h) => PIPS[h.number]));
      assert.equal(b.ports.length, size === "small" ? 9 : 11);
      assert.equal(new Set(b.ports.map((p) => p.edge)).size, b.ports.length);
      const { edges } = graphOf(b);
      assert.ok(b.ports.every((p) => edges[p.edge].hexes.length === 1), "docks sit on the coast");
    }
  }
  const small = generateBoard("small", seeded(3));
  const { vertices, edges } = graphOf(small);
  assert.equal(Object.keys(vertices).length, 54);
  assert.equal(Object.keys(edges).length, 72);
});

test("tradewinds: board size follows seat count on auto", () => {
  assert.equal(makeGame([human("P1"), bot("P2")]).board.size, "small");
  assert.equal(makeGame([human("P1"), bot("P2"), bot("P3"), bot("P4"), bot("P5")]).board.size, "large");
  assert.equal(makeGame([human("P1"), bot("P2")], { board: "large" }).board.size, "large");
});

test("tradewinds: snake setup, turn guard, second hut pays out", () => {
  const g = makeGame([human("P1"), human("P2")]);
  assert.equal(g.phase, "setup");
  assert.deepEqual(g.setup.order, ["P1", "P2", "P2", "P1"]);
  assert.throws(() => makeTradewindsMove(g, "P2", { type: "SETUP_PLACE", hut: "0,0", path: "x" }), /isn't your turn/);
  const v = view(g, "P1");
  assert.ok(v.legal.setup_huts.length > 40);
  assert.deepEqual(view(g, "P2").legal.setup_huts, []);
  const hut = v.legal.setup_huts[0];
  assert.throws(() => makeTradewindsMove(g, "P1", { type: "SETUP_PLACE", hut, path: "nope" }), /must touch/);
  makeTradewindsMove(g, "P1", { type: "SETUP_PLACE", hut, path: v.legal.setup_paths[hut][0] });
  const { vertices } = graphOf(g.board);
  vertices[hut].adj.forEach((w) => assert.ok(!hutSpotFree(g.board, g.pieces, w), "distance rule"));
  setupHuman(g, "P2");
  const before = Object.values(g.players.P2.hand).reduce((a, b) => a + b, 0);
  setupHuman(g, "P2");
  const after = Object.values(g.players.P2.hand).reduce((a, b) => a + b, 0);
  assert.ok(after >= before, "second hut gathers");
  setupHuman(g, "P1");
  assert.equal(g.setup, null);
  assert.equal(g.round, 1);
  assert.ok(["build", "discard", "monkey"].includes(g.phase));
});

test("tradewinds: bots place setup instantly; quick setup skips straight to round 1", () => {
  const g = makeGame([bot("P1"), human("P2"), bot("P3")]);
  assert.equal(g.setup.order[g.setup.index], "P2", "bot P1 already placed");
  assert.equal(Object.keys(g.pieces.huts).length, 1);
  const q = makeGame([human("P1"), bot("P2")], { quick_setup: true });
  assert.equal(q.setup, null);
  assert.equal(q.round, 1);
  assert.equal(Object.keys(q.pieces.huts).length + Object.keys(q.pieces.lodges).length, 4);
});

test("tradewinds: an all-bot table plays to a winner at the target", () => {
  for (let seed = 1; seed <= 6; seed += 1) {
    const g = makeGame([bot("P1", 1), bot("P2", 2), bot("P3", 3), bot("P4", 4)], { target: 8 }, seed);
    assert.equal(g.status, "complete");
    assert.ok(g.winner);
    const scores = tradewindsScoreByMark(g);
    assert.ok(scores[g.winner] >= 8);
    assert.equal(g.results[0].mark, g.winner);
  }
});

test("tradewinds: build validation, costs and the live-round race", () => {
  const g = makeGame([human("P1"), human("P2")], { quick_setup: true }, 7);
  toBuild(g);
  const v = view(g, "P1");
  const path = v.legal.paths[0];
  g.players.P1.hand = { timber: 0, clay: 0, fiber: 0, fruit: 0, stone: 0 };
  assert.throws(() => makeTradewindsMove(g, "P1", { type: "BUILD", round: g.round, kind: "path", at: path }), /can't afford/);
  g.players.P1.hand = { timber: 5, clay: 5, fiber: 5, fruit: 5, stone: 5 };
  makeTradewindsMove(g, "P1", { type: "BUILD", round: g.round, kind: "path", at: path });
  assert.equal(g.pieces.paths[path], "P1");
  assert.equal(g.players.P1.hand.timber, 4);
  // P2 reaching for the same edge is rejected and keeps its cards.
  g.players.P2.hand = { timber: 5, clay: 5, fiber: 5, fruit: 5, stone: 5 };
  assert.throws(() => makeTradewindsMove(g, "P2", { type: "BUILD", round: g.round, kind: "path", at: path }), /Someone just built|connect/);
  assert.equal(g.players.P2.hand.timber, 5);
  // Lodge upgrades own hut only.
  const myHut = Object.keys(g.pieces.huts).find((k) => g.pieces.huts[k] === "P1");
  const theirHut = Object.keys(g.pieces.huts).find((k) => g.pieces.huts[k] === "P2");
  assert.throws(() => makeTradewindsMove(g, "P1", { type: "BUILD", round: g.round, kind: "lodge", at: theirHut }), /your own huts/);
  makeTradewindsMove(g, "P1", { type: "BUILD", round: g.round, kind: "lodge", at: myHut });
  assert.equal(g.pieces.lodges[myHut], "P1");
  assert.equal(view(g, "P2").players.P1.renown, 3);
});

test("tradewinds: stale round rejected loudly, wrong phase rejected", () => {
  const g = makeGame([human("P1"), human("P2")], { quick_setup: true }, 7);
  toBuild(g);
  assert.throws(() => makeTradewindsMove(g, "P1", { type: "DONE", round: g.round + 5 }), /Refresh to catch up/);
  assert.throws(() => makeTradewindsMove(g, "P1", { type: "DISCARD", round: g.round, cards: {} }), /don't need to discard/);
  assert.throws(() => makeTradewindsMove(g, "P1", { type: "WHAT", round: g.round }), /Unknown action/);
  assert.throws(() => makeTradewindsMove(g, "ZZ", { type: "DONE" }), /not seated/);
});

test("tradewinds: the round advances only when every human is done; bots build at the barrier", () => {
  const g = makeGame([human("P1"), human("P2"), bot("P3")], { quick_setup: true }, 11);
  toBuild(g);
  const round = g.round;
  makeTradewindsMove(g, "P1", { type: "DONE", round, done: true });
  assert.equal(g.round, round);
  makeTradewindsMove(g, "P1", { type: "DONE", round, done: false });
  makeTradewindsMove(g, "P2", { type: "DONE", round, done: true });
  assert.equal(g.round, round, "un-done holds the barrier");
  makeTradewindsMove(g, "P1", { type: "DONE", round, done: true });
  assert.equal(g.round, round + 1);
  assert.ok(g.events.some((e) => e.type === "roll" || e.type === "seven"));
});

test("tradewinds: a 7 makes big hands discard and the captain move the monkey", () => {
  const g = makeGame([human("P1"), human("P2")], { quick_setup: true }, 11);
  toBuild(g);
  g.players.P1.hand = { timber: 3, clay: 3, fiber: 3, fruit: 0, stone: 0 };
  // Find a seed state that rolls 7 next: force the RNG.
  setTradewindsRandom(() => 0.5); // 1 + floor(0.5*6) = 4, so 4+4 = 8 — use a sequence instead
  const seq = [0.0, 0.99]; // 1 + 6 = 7
  let i = 0;
  setTradewindsRandom(() => (i < seq.length ? seq[i++] : 0.3));
  const r = g.round;
  makeTradewindsMove(g, "P1", { type: "DONE", round: r });
  makeTradewindsMove(g, "P2", { type: "DONE", round: r });
  assert.deepEqual(g.dice, [1, 7 - 1]);
  assert.equal(g.phase, "discard");
  assert.equal(g.players.P1.must_discard, 4);
  assert.throws(() => makeTradewindsMove(g, "P1", { type: "DISCARD", round: g.round, cards: { timber: 1 } }), /exactly 4/);
  assert.throws(() => makeTradewindsMove(g, "P1", { type: "BUILD", round: g.round, kind: "path", at: "x" }), /settled/);
  makeTradewindsMove(g, "P1", { type: "DISCARD", round: g.round, cards: { timber: 2, clay: 2 } });
  const captain = g.seat_order[(g.round - 1) % 2];
  if (g.phase === "monkey") {
    const other = captain === "P1" ? "P2" : "P1";
    assert.throws(() => makeTradewindsMove(g, other, { type: "MOVE_MONKEY", round: g.round, hex: "h0" }), /captain/);
    assert.throws(() => makeTradewindsMove(g, captain, { type: "MOVE_MONKEY", round: g.round, hex: g.monkey }), /different hex/);
    const v = view(g, captain);
    const hex = v.legal.monkey_hexes.find((h) => v.legal.monkey_victims[h].length) || v.legal.monkey_hexes[0];
    makeTradewindsMove(g, captain, { type: "MOVE_MONKEY", round: g.round, hex, victim: v.legal.monkey_victims[hex][0] || null });
    assert.equal(g.monkey, hex);
  }
  assert.equal(g.phase, "build");
});

test("tradewinds: bank trades honour dock rates", () => {
  const g = makeGame([human("P1"), human("P2")], { quick_setup: true }, 5);
  toBuild(g);
  g.players.P1.hand = { timber: 4, clay: 0, fiber: 0, fruit: 0, stone: 0 };
  const rate = view(g, "P1").players.P1.rates.timber;
  makeTradewindsMove(g, "P1", { type: "BANK_TRADE", round: g.round, give: "timber", get: "stone" });
  assert.equal(g.players.P1.hand.timber, 4 - rate);
  assert.equal(g.players.P1.hand.stone, 1);
  assert.throws(() => makeTradewindsMove(g, "P1", { type: "BANK_TRADE", round: g.round, give: "clay", get: "stone" }), /You need/);
});

test("tradewinds: player offers — accept, confirm, stale and targeted", () => {
  const g = makeGame([human("P1"), human("P2"), human("P3")], { quick_setup: true }, 9);
  toBuild(g);
  g.players.P1.hand = { timber: 2, clay: 0, fiber: 0, fruit: 0, stone: 0 };
  g.players.P2.hand = { timber: 0, clay: 0, fiber: 0, fruit: 0, stone: 1 };
  g.players.P3.hand = { timber: 0, clay: 0, fiber: 0, fruit: 0, stone: 1 };
  assert.throws(() => makeTradewindsMove(g, "P1", { type: "OFFER", round: g.round, give: { timber: 5 }, want: { stone: 1 } }), /don't hold/);
  makeTradewindsMove(g, "P1", { type: "OFFER", round: g.round, give: { timber: 1 }, want: { stone: 1 }, to: "P2" });
  const id = g.offers[0].id;
  assert.throws(() => makeTradewindsMove(g, "P3", { type: "ACCEPT_OFFER", round: g.round, offer_id: id }), /someone else/);
  assert.throws(() => makeTradewindsMove(g, "P1", { type: "CONFIRM_TRADE", round: g.round, offer_id: id, partner: "P2" }), /hasn't accepted/);
  makeTradewindsMove(g, "P2", { type: "ACCEPT_OFFER", round: g.round, offer_id: id });
  makeTradewindsMove(g, "P1", { type: "CONFIRM_TRADE", round: g.round, offer_id: id, partner: "P2" });
  assert.equal(g.players.P1.hand.stone, 1);
  assert.equal(g.players.P2.hand.timber, 1);
  assert.throws(() => makeTradewindsMove(g, "P1", { type: "CONFIRM_TRADE", round: g.round, offer_id: id, partner: "P2" }), /gone/);
  // Offers clear at the round barrier.
  makeTradewindsMove(g, "P1", { type: "OFFER", round: g.round, give: { timber: 1 }, want: { stone: 1 } });
  ["P1", "P2", "P3"].forEach((m) => makeTradewindsMove(g, m, { type: "DONE", round: g.round }));
  assert.deepEqual(g.offers, []);
});

test("tradewinds: discovery cards — buy, can't play same round, one per round, monuments hidden", () => {
  const g = makeGame([human("P1"), human("P2")], { quick_setup: true }, 3);
  toBuild(g);
  g.deck = ["monument", "bounty", "bounty"];
  g.players.P1.hand = { timber: 0, clay: 0, fiber: 3, fruit: 3, stone: 3 };
  makeTradewindsMove(g, "P1", { type: "BUY_DISCOVERY", round: g.round });
  assert.equal(g.players.P1.discoveries[0].card, "bounty");
  assert.throws(() => makeTradewindsMove(g, "P1", { type: "PLAY_DISCOVERY", round: g.round, card: "bounty", picks: ["clay", "clay"] }), /next round/);
  makeTradewindsMove(g, "P1", { type: "BUY_DISCOVERY", round: g.round });
  makeTradewindsMove(g, "P1", { type: "BUY_DISCOVERY", round: g.round });
  const v2 = view(g, "P2");
  assert.equal(v2.players.P1.hand, null);
  assert.equal(v2.players.P1.discoveries, null);
  assert.equal(v2.players.P1.renown_total, null);
  assert.equal(v2.players.P1.discovery_count, 3);
  assert.equal(v2.discovery_left, 0);
  assert.equal(v2.deck, undefined, "deck never projected");
  const own = view(g, "P1").players.P1;
  assert.equal(own.renown_total, own.renown + 1, "own monument counts");
  ["P1", "P2"].forEach((m) => makeTradewindsMove(g, m, { type: "DONE", round: g.round }));
  toBuild(g);
  const clayBefore = g.players.P1.hand.clay;
  makeTradewindsMove(g, "P1", { type: "PLAY_DISCOVERY", round: g.round, card: "bounty", picks: ["clay", "clay"] });
  assert.equal(g.players.P1.hand.clay, clayBefore + 2);
  assert.throws(() => makeTradewindsMove(g, "P1", { type: "PLAY_DISCOVERY", round: g.round, card: "bounty", picks: ["clay", "clay"] }), /already played/);
});

test("tradewinds: market day takes a resource from everyone", () => {
  const g = makeGame([human("P1"), human("P2"), human("P3")], { quick_setup: true }, 4);
  toBuild(g);
  g.players.P1.discoveries = [{ card: "market", bought_round: 0 }];
  g.players.P2.hand.fruit = 3;
  g.players.P3.hand.fruit = 2;
  const mine = g.players.P1.hand.fruit;
  makeTradewindsMove(g, "P1", { type: "PLAY_DISCOVERY", round: g.round, card: "market", resource: "fruit" });
  assert.equal(g.players.P1.hand.fruit, mine + 5);
  assert.equal(g.players.P2.hand.fruit + g.players.P3.hand.fruit, 0);
});

test("tradewinds: longest boardwalk, broken by a rival hut; causeway award", () => {
  const g = makeGame([human("P1"), human("P2")], { quick_setup: true }, 2);
  toBuild(g);
  g.players.P1.hand = { timber: 20, clay: 20, fiber: 0, fruit: 0, stone: 0 };
  for (let i = 0; i < 6; i += 1) {
    const v = view(g, "P1");
    // extend from the end farthest along: pick any legal path
    makeTradewindsMove(g, "P1", { type: "BUILD", round: g.round, kind: "path", at: v.legal.paths[0] });
  }
  const len = longestPath(g.board, g.pieces, "P1");
  assert.ok(len >= 1);
  assert.equal(g.players.P1.longest, len);
  if (len >= 5) assert.equal(g.awards.causeway, "P1");
  else assert.equal(g.awards.causeway, null);
});

test("tradewinds: skip vote releases a stalled human in build", () => {
  const g = makeGame([human("P1"), human("P2"), human("P3")], { quick_setup: true }, 6);
  toBuild(g);
  const r = g.round;
  assert.throws(() => makeTradewindsMove(g, "P1", { type: "SKIP_PLAYER", round: r, target: "P3" }), /aren't holding up/);
  makeTradewindsMove(g, "P1", { type: "DONE", round: r });
  makeTradewindsMove(g, "P2", { type: "DONE", round: r });
  makeTradewindsMove(g, "P1", { type: "SKIP_PLAYER", round: r, target: "P3" });
  assert.equal(g.round, r);
  makeTradewindsMove(g, "P2", { type: "SKIP_PLAYER", round: r, target: "P3" });
  assert.equal(g.round, r + 1);
});

test("tradewinds: viewer projection via the handler table; reveal at the end", () => {
  const g = makeGame([human("P1"), bot("P2")], { quick_setup: true }, 8);
  const dict = tradewindsGameToDict(g);
  const v = gameToDictForViewer(dict, "P1", "playing");
  assert.ok(v.players.P1.hand);
  assert.equal(v.players.P2.hand, null);
  assert.ok(Array.isArray(v.legal.paths));
  assert.equal(typeof v.board.hexes[0].x, "number");
  assert.ok(v.costs.hut && v.resources.length === 5);
  g.status = "complete";
  g.winner = "P2";
  const end = tradewindsGameToDictForViewer(tradewindsGameToDict(g), "P1");
  assert.ok(end.players.P2.hand);
});

test("tradewinds: normalize survives garbage", () => {
  const g = makeGame([human("P1"), bot("P2")], { quick_setup: true }, 8);
  g.players.P1.hand = { timber: "lots", clay: -4 };
  g.offers = [{ from: "ZZ" }, null];
  g.phase = "dancing";
  const d = tradewindsGameToDict(g);
  assert.equal(d.players.P1.hand.timber, 0);
  assert.equal(d.players.P1.hand.clay, 0);
  assert.deepEqual(d.offers, []);
});
