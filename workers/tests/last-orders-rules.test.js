// Last Orders — browser-free rules tests: lifecycle, pick, the timed reaction
// stack, drinks, gambling, stale/duplicate handling, skip vote, bots, and the
// per-viewer projection (the wire contract).
import test from "node:test";
import assert from "node:assert/strict";
import {
  newLastOrdersGame, initLastOrdersSeats, setLastOrdersOptions, makeLastOrdersMove, lastOrdersGameToDict,
  lastOrdersGameToDictForViewer, lastOrdersScoreByMark, setLastOrdersClock, setLastOrdersRandom, normalizeLastOrdersOptions,
} from "../games/last-orders/rules.js";

let now = 1_000_000;
setLastOrdersClock(() => now);

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const human = (mark) => ({ mark, kind: "human" });
const bot = (mark, level = 2) => ({ mark, kind: "bot", bot_level: level });
const view = (game, mark) => lastOrdersGameToDictForViewer(lastOrdersGameToDict(game), mark);
// A pass that leaves the window waiting only on its minimum show time
// (rules.js SHOW_MS) lets that beat elapse, so the card resolves as before.
function move(game, mark, action) {
  makeLastOrdersMove(game, mark, { step: game.step, ...action });
  const w = game.reaction;
  if (action.type !== "PASS" || !w || !w.show_until || w.show_until <= now) return;
  const eligible = view(game, "").reaction ? view(game, "").reaction.eligible : [];
  if (!eligible.every((m) => w.passed.includes(m))) return;
  now = w.show_until;
  makeLastOrdersMove(game, mark, { type: "TICK" });
}

// Two humans, fixed patrons, P1 to act, in the action phase with a known hand.
function duel(hand1 = [], hand2 = []) {
  setLastOrdersRandom(seeded(7));
  const game = newLastOrdersGame();
  setLastOrdersOptions(game, { lo_options: { react_seconds: 8 } });
  initLastOrdersSeats(game, [human("P1"), human("P2")]);
  move(game, "P1", { type: "PICK", character: "base:gorrum" });
  move(game, "P2", { type: "PICK", character: "base:tilly" });
  game.start_index = 0;
  game.turn = { mark: "P1", phase: "action", actions_left: 1, act_at: 0 };
  game.players.P1.hand = hand1.map((id, i) => ({ uid: `a${i}`, id }));
  game.players.P2.hand = hand2.map((id, i) => ({ uid: `b${i}`, id }));
  game.step += 1;
  return game;
}

test("last orders: needs two patrons", () => {
  const game = newLastOrdersGame();
  assert.throws(() => initLastOrdersSeats(game, [human("P1")]), /at least 2/);
});

test("last orders: options are clamped", () => {
  const o = normalizeLastOrdersOptions({ react_seconds: 99, expansions: ["frost", "nope", "frost", "base"], closing_time: "off" });
  assert.equal(o.react_seconds, 8);
  assert.deepEqual(o.expansions, ["frost"]);
  assert.equal(o.closing_time, false);
});

test("last orders: pick phase — unique patrons, bots pick last, then play deals hands", () => {
  setLastOrdersRandom(seeded(1));
  const game = newLastOrdersGame();
  initLastOrdersSeats(game, [human("P1"), human("P2"), bot("P3")]);
  assert.equal(game.phase, "pick");
  move(game, "P1", { type: "PICK", character: "base:ansel" });
  assert.throws(() => move(game, "P2", { type: "PICK", character: "base:ansel" }), /just took/);
  assert.equal(game.players.P3.character, null, "bots wait for humans");
  move(game, "P2", { type: "PICK", character: "base:tilly" });
  assert.equal(game.phase, "play");
  const chars = game.seat_order.map((m) => game.players[m].character);
  assert.equal(new Set(chars).size, 3);
  game.seat_order.forEach((m) => assert.ok(game.players[m].hand.length >= 7));
  assert.equal(game.players.P1.hand.length, 8, "Ansel's trait adds a card");
});

test("last orders: viewer projection hides other hands and the decks", () => {
  const game = duel(["base:gorrum:headbutt"], ["base:tilly:lift-a-purse"]);
  const v = view(game, "P1");
  assert.equal(v.private, undefined);
  assert.equal(v.me.mark, "P1");
  assert.deepEqual(v.me.hand.map((c) => c.id), ["base:gorrum:headbutt"]);
  assert.ok(v.defs["base:gorrum:headbutt"]);
  assert.equal(v.defs["base:tilly:lift-a-purse"], undefined);
  assert.equal(JSON.stringify(v).includes("drink_deck\":["), false);
  const spectator = view(game, "");
  assert.equal(spectator.me, null);
  assert.equal(v.players[1].hand_count, 1);
});

test("last orders: an action opens a timed window and resolves when everyone passes", () => {
  const game = duel(["base:gorrum:headbutt"], []);
  move(game, "P1", { type: "PLAY", uid: "a0", target: "P2" });
  assert.ok(game.reaction);
  assert.equal(game.reaction.closes_at, now + 8000);
  assert.equal(game.players.P2.grit, 20);
  move(game, "P2", { type: "PASS" });
  assert.equal(game.reaction, null);
  assert.equal(game.players.P2.grit, 17);
  assert.equal(game.turn.phase, "order", "no action left → straight to ordering");
});

test("last orders: the window closes on its own clock (TICK)", () => {
  const game = duel(["base:gorrum:headbutt"], []);
  move(game, "P1", { type: "PLAY", uid: "a0", target: "P2" });
  assert.throws(() => makeLastOrdersMove(game, "P1", { type: "TICK" }), /Nothing is due/);
  now += 8000;
  makeLastOrdersMove(game, "P1", { type: "TICK" });
  assert.equal(game.reaction, null);
  assert.equal(game.players.P2.grit, 17);
});

test("last orders: negate cancels, a counter-negate restores (LIFO stack)", () => {
  const game = duel(["base:gorrum:headbutt", "base:gorrum:bouncer-says-no"], ["base:gorrum:not-on-my-watch"]);
  move(game, "P1", { type: "PLAY", uid: "a0", target: "P2" });
  assert.ok(view(game, "P2").me.playable.includes("b0"));
  move(game, "P2", { type: "PLAY", uid: "b0" });
  assert.equal(view(game, "P2").me.can_pass, false, "can't answer your own card");
  move(game, "P1", { type: "PLAY", uid: "a1" });
  move(game, "P2", { type: "PASS" });
  assert.equal(game.reaction, null);
  assert.equal(game.players.P2.grit, 17, "the counter cancelled the dodge");
  assert.ok(game.players.P2.discard.includes("base:gorrum:not-on-my-watch"));
});

test("last orders: a stale stamp is rejected loudly; a duplicate pass is ignored", () => {
  const game = duel(["base:gorrum:headbutt"], ["base:gorrum:not-on-my-watch"]);
  const stale = game.step;
  move(game, "P1", { type: "PLAY", uid: "a0", target: "P2" });
  assert.throws(() => makeLastOrdersMove(game, "P2", { type: "PLAY", uid: "b0", step: stale }), /moved on/);
  assert.throws(() => move(game, "P1", { type: "PASS" }), /nothing to pass/, "can't pass on your own card");
});

test("last orders: refusing a drink, and drinks raise buzz with closing time", () => {
  const game = duel([], ["base:gorrum:no-thanks-big-fella"]);
  game.turn.phase = "order";
  game.players.P1.line = [{ drink: "base:drink:house-ale", spikes: [], by: "P2" }];
  move(game, "P1", { type: "ORDER", target: "P2" });
  assert.equal(game.players.P2.line.length, 1);
  // P1 now drinks the ale P2 ordered earlier; only P1 may still answer it.
  assert.equal(game.reaction.stack[0].kind, "drink");
  assert.equal(game.reaction.stack[0].target, "P1");
  assert.deepEqual(game.reaction.passed, []);
  move(game, "P1", { type: "PASS" });
  // P2's turn: discard, end action, order, then drink the ordered drink.
  assert.equal(game.turn.mark, "P2");
  move(game, "P2", { type: "DISCARD", uids: [] });
  game.players.P2.hand = [{ uid: "z1", id: "base:gorrum:no-thanks-big-fella" }];
  game.round = 12; // closing time: +2
  game.players.P2.line = [{ drink: "base:drink:barrel-stout", spikes: [], by: "P1" }];
  game.turn.phase = "order";
  game.step += 1;
  move(game, "P2", { type: "ORDER", target: "P1" });
  assert.equal(game.reaction.stack[0].card, "base:drink:barrel-stout");
  move(game, "P2", { type: "PLAY", uid: "z1" });
  move(game, "P1", { type: "PASS" });
  assert.equal(game.players.P2.buzz, 0, "refused");
  assert.equal(game.last_drink.canceled, true);
  // The next one lands: 2 + escalation 2.
  game.players.P1.line = [{ drink: "base:drink:barrel-stout", spikes: [], by: "P2" }];
  move(game, "P1", { type: "DISCARD", uids: [] });
  if (game.turn.phase === "action") move(game, "P1", { type: "END_ACTION" });
  move(game, "P1", { type: "ORDER", target: "P2" });
  const before = game.players.P1.buzz;
  move(game, "P1", { type: "PASS" });
  assert.equal(game.players.P1.buzz - before, 4);
});

test("last orders: gambling — antes, take the lead, leader wins the pot", () => {
  const game = duel(["base:gorrum:arm-wrestle"], ["base:gorrum:lucky-knuckles"]);
  move(game, "P1", { type: "PLAY", uid: "a0" });
  move(game, "P2", { type: "PASS" });
  assert.equal(game.reaction.kind, "gamble");
  assert.deepEqual(game.gamble, { leader: "P1", pot: 2, in: ["P1", "P2"] });
  assert.equal(game.players.P2.gold, 9);
  assert.equal(view(game, "P1").me.can_pass, false, "the leader holds no say");
  move(game, "P2", { type: "PLAY", uid: "b0" });
  move(game, "P1", { type: "PASS" });
  assert.equal(game.gamble.leader, "P2");
  // P1 has nothing; window closes when P1 passes again → P2 wins 2 (+1 Tilly pot bonus).
  move(game, "P1", { type: "PASS" });
  assert.equal(game.gamble, null);
  assert.equal(game.players.P2.gold, 9 + 2 + 1);
});

test("last orders: out checks — passing out ends the night for that patron", () => {
  const game = duel(["base:gorrum:headbutt"], []);
  game.players.P2.buzz = 17;
  move(game, "P1", { type: "PLAY", uid: "a0", target: "P2" });
  move(game, "P2", { type: "PASS" });
  assert.equal(game.players.P2.out, "passed_out");
  assert.equal(game.status, "complete");
  assert.equal(game.winner, "P1");
  assert.deepEqual(lastOrdersScoreByMark(game), { P1: 2, P2: 1 });
});

test("last orders: a stuck human is auto-played after a unanimous skip vote", () => {
  setLastOrdersRandom(seeded(3));
  const game = newLastOrdersGame();
  setLastOrdersOptions(game, { lo_options: { random_characters: true } });
  initLastOrdersSeats(game, [human("P1"), human("P2"), human("P3")]);
  const stuck = game.turn.mark;
  const others = game.seat_order.filter((m) => m !== stuck);
  assert.throws(() => makeLastOrdersMove(game, stuck, { type: "SKIP_PLAYER", target: stuck }), /can't vote/);
  makeLastOrdersMove(game, others[0], { type: "SKIP_PLAYER", target: stuck });
  assert.equal(game.players[stuck].auto, false);
  makeLastOrdersMove(game, others[1], { type: "SKIP_PLAYER", target: stuck });
  assert.equal(game.players[stuck].auto, true);
  now += 5000;
  makeLastOrdersMove(game, others[0], { type: "TICK" });
  assert.notEqual(game.turn.phase, "discard", "the brain took the discard step");
});

test("last orders: all-bot tables (every pack) finish, with bounded work", () => {
  for (let i = 0; i < 40; i += 1) {
    setLastOrdersRandom(seeded(100 + i));
    const game = newLastOrdersGame();
    setLastOrdersOptions(game, { lo_options: { expansions: i % 2 ? ["harbor", "frost", "masquerade", "clockwork", "rowdy"] : [] } });
    initLastOrdersSeats(game, Array.from({ length: 2 + (i % 6) }, (_, k) => bot(`P${k + 1}`, 1 + (k % 4))));
    assert.equal(game.status, "complete", `game ${i}`);
    assert.ok(game.winner);
    assert.equal(game.results.length, game.seat_order.length);
  }
});

test("last orders: bots play through windows with a human at the table", () => {
  setLastOrdersRandom(seeded(42));
  const game = newLastOrdersGame();
  initLastOrdersSeats(game, [human("P1"), bot("P2", 3), bot("P3", 4)]);
  move(game, "P1", { type: "PICK", character: "base:zephyrine" });
  let guard = 0;
  while (game.status === "playing" && guard < 5000) {
    guard += 1;
    const v = view(game, "P1");
    try {
      if (v.window && v.me.can_pass) move(game, "P1", { type: "PASS" });
      else if (v.turn.mark === "P1" && !v.window && v.turn.phase === "discard") move(game, "P1", { type: "DISCARD", uids: [] });
      else if (v.turn.mark === "P1" && !v.window && v.turn.phase === "action") move(game, "P1", { type: "END_ACTION" });
      else if (v.turn.mark === "P1" && !v.window && v.turn.phase === "order") move(game, "P1", { type: "ORDER", target: v.me.order_targets[0] });
      else { now = Math.max(now + 10, v.next_due_at); makeLastOrdersMove(game, "P1", { type: "TICK" }); }
    } catch (e) {
      if (!/Nothing is due/.test(e.message)) throw e;
      now += 100;
    }
  }
  assert.equal(game.status, "complete");
});

test("last orders: a played card stays on the table for its show time before it resolves", () => {
  const game = duel(["base:gorrum:headbutt"], []);
  makeLastOrdersMove(game, "P1", { type: "PLAY", uid: "a0", target: "P2", step: game.step });
  const showUntil = game.reaction.show_until;
  assert.equal(showUntil, now + 2200);
  makeLastOrdersMove(game, "P2", { type: "PASS", step: game.step });
  assert.ok(game.reaction, "everyone passed, but the card is still showing");
  assert.equal(lastOrdersGameToDict(game).next_due_at, showUntil);
  now = showUntil;
  makeLastOrdersMove(game, "P1", { type: "TICK" });
  assert.equal(game.reaction, null);
  assert.equal(game.players.P2.grit, 17);
});
