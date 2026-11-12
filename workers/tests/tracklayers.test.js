import assert from "node:assert/strict";
import test from "node:test";
import {
  TRACKLAYERS_GAME_ID, isTracklayersGame, newTracklayersGame, initTracklayersSeats, setTracklayersOptions,
  makeTracklayersMove, tracklayersGameToDict, tracklayersGameToDictForViewer, tracklayersScoreByMark,
  setTracklayersRandom, normalizeTracklayersGame,
} from "../games/tracklayers/rules.js";
import { refillMarket, emptyHand } from "../games/tracklayers/cards.js";
import { longestPath } from "../games/tracklayers/graph.js";
import { newGame, gameToDict, gameToDictForViewer } from "../games/handlers.js";

const human = (mark) => ({ mark, name: mark, kind: "human" });
const bot = (mark, bot_level = 2) => ({ mark, name: mark, kind: "bot", bot_level });
const humans = (n) => Array.from({ length: n }, (_, i) => human(`P${i + 1}`));

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function makeGame(seats, options = {}, seed = 1) {
  setTracklayersRandom(seeded(seed));
  const g = newTracklayersGame();
  setTracklayersOptions(g, { tracklayers_options: options });
  initTracklayersSeats(g, seats);
  return g;
}

// Every human keeps the first two offered tickets.
function keepStart(g) {
  g.seat_order.forEach((m) => {
    const s = g.players[m];
    if (!s.is_bot && s.pending_tickets.length) makeTracklayersMove(g, m, { type: "KEEP_TICKETS", round: g.round, keep: s.pending_tickets.slice(0, 2) });
  });
  return g;
}

const commit = (g, mark, action) => makeTracklayersMove(g, mark, { type: "COMMIT", round: g.round, action });
const DRAW_DECK = { type: "DRAW", picks: ["deck", "deck"] };
const hand = (counts) => ({ ...emptyHand(), ...counts });
const deckOf = (color, n = 20) => Array.from({ length: n }, () => color);

test("ids, predicate, min players", () => {
  assert.equal(TRACKLAYERS_GAME_ID, "7c31e9a05b42");
  assert.ok(isTracklayersGame(newTracklayersGame()));
  assert.ok(!isTracklayersGame({ game_id: "nope" }));
  assert.throws(() => makeGame([human("P1")]), /at least 2 players/);
  assert.throws(() => makeGame([]), /at least 2 players/);
});

test("options clamp to 25/35/45 and seed trains", () => {
  assert.equal(makeGame(humans(2), { trains: 44 }).players.P1.trains, 45);
  assert.equal(makeGame(humans(2), { trains: "abc" }).players.P1.trains, 35);
  assert.equal(makeGame(humans(2), { trains: 5 }).players.P2.trains, 25);
  const g = newTracklayersGame();
  setTracklayersOptions(g, { tracklayers_options: { trains: 25 } });
  setTracklayersOptions(g, {}); // reset path: keeps current options
  assert.deepEqual(g.options, { trains: 25 });
});

test("setup deal: 4 cards, 5 market, 3 tickets offered, keep >= 2 before committing", () => {
  const g = makeGame([human("P1"), human("P2"), bot("P3")]);
  assert.equal(g.market.length, 5);
  assert.equal(g.deck.length + g.discard.length + g.market.length + 12, 110);
  for (const m of ["P1", "P2"]) {
    const s = g.players[m];
    assert.equal(Object.values(s.hand).reduce((a, b) => a + b, 0), 4);
    assert.equal(s.pending_tickets.length, 3);
    assert.equal(s.min_keep, 2);
  }
  // Bots keep immediately.
  assert.equal(g.players.P3.pending_tickets.length, 0);
  assert.ok(g.players.P3.tickets.length >= 2);
  assert.throws(() => commit(g, "P1", DRAW_DECK), /Choose which tickets to keep first/);
  const offered = [...g.players.P1.pending_tickets];
  assert.throws(() => makeTracklayersMove(g, "P1", { type: "KEEP_TICKETS", round: 1, keep: [offered[0]] }), /Keep at least 2/);
  assert.throws(() => makeTracklayersMove(g, "P1", { type: "KEEP_TICKETS", round: 1, keep: [offered[0], "t999"] }), /isn't one of the tickets/);
  makeTracklayersMove(g, "P1", { type: "KEEP_TICKETS", round: 1, keep: offered.slice(0, 2) });
  assert.deepEqual(g.players.P1.tickets, offered.slice(0, 2));
  assert.equal(g.players.P1.pending_tickets.length, 0);
  assert.equal(g.ticket_deck[g.ticket_deck.length - 1], offered[2], "returned ticket goes to the bottom");
  assert.throws(() => makeTracklayersMove(g, "P1", { type: "KEEP_TICKETS", round: 1, keep: offered.slice(0, 2) }), /no tickets waiting/);
});

test("DRAW: contested market color falls back to a blind card by priority", () => {
  const g = keepStart(makeGame(humans(2)));
  g.market = ["red", "blue", "green", "black", "white"];
  g.deck = deckOf("yellow");
  g.players.P1.hand = hand({});
  g.players.P2.hand = hand({});
  commit(g, "P2", { type: "DRAW", picks: ["red", "deck"] });
  commit(g, "P1", { type: "DRAW", picks: ["red", "deck"] });
  assert.equal(g.round, 2);
  assert.deepEqual([g.players.P1.hand.red, g.players.P1.hand.yellow], [1, 1], "P1 had priority");
  assert.deepEqual([g.players.P2.hand.red, g.players.P2.hand.yellow], [0, 2]);
  assert.ok(g.events.some((e) => e.kind === "fallback" && e.mark === "P2" && /wanted red but it was gone/.test(e.text)));
  assert.equal(g.market.length, 5);
  assert.deepEqual(g.priority_order, ["P2", "P1"], "priority rotates each round");
});

test("DRAW: face-up wild must be the only pick; a gone wild becomes two blind cards", () => {
  const g = keepStart(makeGame(humans(2)));
  g.market = ["wild", "blue", "green", "black", "white"];
  g.deck = deckOf("yellow");
  assert.throws(() => commit(g, "P1", { type: "DRAW", picks: ["wild", "deck"] }), /whole draw/);
  assert.throws(() => commit(g, "P1", { type: "DRAW", picks: ["deck"] }), /Draw two cards/);
  assert.throws(() => commit(g, "P1", { type: "DRAW", picks: ["red", "deck"] }), /no face-up red/);
  g.players.P1.hand = hand({});
  g.players.P2.hand = hand({});
  commit(g, "P1", { type: "DRAW", picks: ["wild"] });
  commit(g, "P2", { type: "DRAW", picks: ["wild"] });
  assert.deepEqual(g.players.P1.hand, hand({ wild: 1 }));
  assert.deepEqual(g.players.P2.hand, hand({ yellow: 2 }));
  // Blind deck wilds are fine; no face-up wild → loud rejection.
  g.market = ["blue", "blue", "green", "black", "white"];
  assert.throws(() => commit(g, "P1", { type: "DRAW", picks: ["wild"] }), /no face-up wild/);
});

test("market: three face-up wilds sweep and refill", () => {
  const state = { deck: ["wild", ...deckOf("green", 10)], discard: [], market: ["wild", "wild", "red", "blue"] };
  const events = [];
  refillMarket(state, Math.random, (kind) => events.push(kind));
  assert.deepEqual(state.market, deckOf("green", 5));
  assert.deepEqual(state.discard.sort(), ["blue", "red", "wild", "wild", "wild"]);
  assert.ok(events.includes("market_reset"));
  // Empty deck → discard reshuffles in.
  const s2 = { deck: [], discard: deckOf("red", 6), market: [] };
  refillMarket(s2, seeded(3), (kind) => events.push(kind));
  assert.equal(s2.market.length, 5);
  assert.ok(events.includes("reshuffle"));
});

test("CLAIM: contested route goes to priority; loser keeps cards and draws one", () => {
  const g = keepStart(makeGame(humans(2)));
  g.deck = deckOf("yellow");
  g.players.P1.hand = hand({ white: 1 });
  g.players.P2.hand = hand({ white: 1 });
  commit(g, "P2", { type: "CLAIM", route: "r19", color: "white" });
  commit(g, "P1", { type: "CLAIM", route: "r19", color: "white" });
  assert.equal(g.routes.r19, "P1");
  assert.equal(g.players.P1.trains, 34);
  assert.equal(g.players.P1.score, 1);
  assert.deepEqual(g.players.P2.hand, hand({ white: 1, yellow: 1 }));
  assert.equal(g.players.P2.trains, 35);
  const ev = g.events.find((e) => e.kind === "conflict");
  assert.equal(ev.text, "P2 wanted Saltmere–Tidewick but P1 had priority — P2 drew a card instead.");
  // Next round P2 has priority and wins the next contest (r22 Oakhollow–Briarwood, green 1).
  g.players.P1.hand = hand({ green: 1 });
  g.players.P2.hand = hand({ green: 1 });
  commit(g, "P1", { type: "CLAIM", route: "r22", color: "green" });
  commit(g, "P2", { type: "CLAIM", route: "r22", color: "green" });
  assert.equal(g.routes.r22, "P2");
  // Claiming an owned route is rejected at commit time.
  assert.throws(() => commit(g, "P1", { type: "CLAIM", route: "r19", color: "white" }), /already own/);
  assert.throws(() => commit(g, "P1", { type: "CLAIM", route: "r22", color: "green" }), /already taken/);
});

test("CLAIM: gray route color choice, colored route color, wild payment", () => {
  const g = keepStart(makeGame(humans(2)));
  g.players.P1.hand = hand({ blue: 3, wild: 1 });
  assert.throws(() => commit(g, "P1", { type: "CLAIM", route: "r3", color: "red" }), /needs 4 red cards/);
  assert.throws(() => commit(g, "P1", { type: "CLAIM", route: "r3", color: "gray" }), /Pick which card color/);
  assert.throws(() => commit(g, "P1", { type: "CLAIM", route: "r4", color: "blue" }), /orange route/);
  commit(g, "P1", { type: "CLAIM", route: "r3", color: "blue" });
  commit(g, "P2", DRAW_DECK);
  assert.equal(g.routes.r3, "P1");
  assert.deepEqual(g.players.P1.hand, hand({}));
  assert.equal(g.players.P1.score, 7);
  assert.equal(g.players.P1.trains, 31);
  // Pay entirely with wilds.
  g.players.P2.hand = hand({ wild: 3 });
  commit(g, "P2", { type: "CLAIM", route: "r4", color: "wild" });
  commit(g, "P1", DRAW_DECK);
  assert.equal(g.routes.r4, "P2");
  assert.equal(g.players.P2.hand.wild, 0);
});

test("twin rule: locked with <= 3 seats; 4+ seats one seat can't own both", () => {
  const g = keepStart(makeGame(humans(3)));
  assert.equal(tracklayersGameToDict(g).twins_locked, true);
  g.routes.r1 = "P1";
  g.players.P2.hand = hand({ blue: 5 });
  assert.throws(() => commit(g, "P2", { type: "CLAIM", route: "r2", color: "blue" }), /only one track of a double route/);

  const g4 = keepStart(makeGame(humans(4)));
  assert.equal(tracklayersGameToDict(g4).twins_locked, false);
  g4.routes.r1 = "P1";
  g4.players.P1.hand = hand({ blue: 5 });
  g4.players.P2.hand = hand({ blue: 5 });
  assert.throws(() => commit(g4, "P1", { type: "CLAIM", route: "r2", color: "blue" }), /can't own both/);
  commit(g4, "P2", { type: "CLAIM", route: "r2", color: "blue" });
  ["P1", "P3", "P4"].forEach((m) => commit(g4, m, DRAW_DECK));
  assert.equal(g4.routes.r2, "P2");

  // Same-round twin claims with twins locked: priority builds, the other bounces.
  const g2 = keepStart(makeGame(humans(2)));
  g2.deck = deckOf("yellow");
  g2.players.P1.hand = hand({ red: 5 });
  g2.players.P2.hand = hand({ blue: 5 });
  commit(g2, "P1", { type: "CLAIM", route: "r1", color: "red" });
  commit(g2, "P2", { type: "CLAIM", route: "r2", color: "blue" });
  assert.equal(g2.routes.r1, "P1");
  assert.equal(g2.routes.r2, undefined);
  assert.deepEqual(g2.players.P2.hand, hand({ blue: 5, yellow: 1 }));
  assert.ok(g2.events.some((e) => e.kind === "conflict" && /P1 built the double track first/.test(e.text)));
});

test("insufficient cards / trains are rejected with reasons; unknown route too", () => {
  const g = keepStart(makeGame(humans(2), { trains: 25 }));
  g.players.P1.hand = hand({ yellow: 6, wild: 0 });
  g.players.P1.trains = 5;
  assert.throws(() => commit(g, "P1", { type: "CLAIM", route: "r5", color: "yellow" }), /needs 6 trains — you have 5/);
  g.players.P1.trains = 25;
  g.players.P1.hand = hand({ yellow: 4, wild: 1 });
  assert.throws(() => commit(g, "P1", { type: "CLAIM", route: "r5", color: "yellow" }), /needs 6 yellow cards/);
  assert.throws(() => commit(g, "P1", { type: "CLAIM", route: "nope", color: "yellow" }), /isn't on the map/);
  assert.throws(() => commit(g, "P1", { type: "BUILD" }), /Choose an action/);
  assert.throws(() => makeTracklayersMove(g, "P1", { type: "DANCE" }), /must be COMMIT, KEEP_TICKETS or SKIP_PLAYER/);
  assert.equal(g.players.P1.committed, null);
});

test("stale round rejected loudly; unstamped accepted; duplicate commit idempotent", () => {
  const g = keepStart(makeGame([human("P1"), human("P2"), bot("P3")]));
  assert.throws(
    () => makeTracklayersMove(g, "P1", { type: "COMMIT", round: 7, action: DRAW_DECK }),
    { message: "That move was for round 7 — the table is on round 1. Refresh to catch up." },
  );
  makeTracklayersMove(g, "P1", { type: "COMMIT", action: { type: "TICKETS" } }); // unstamped
  assert.deepEqual(g.players.P1.committed, { type: "TICKETS" });
  commit(g, "P1", DRAW_DECK); // duplicate: ignored, first wins
  assert.deepEqual(g.players.P1.committed, { type: "TICKETS" });
  assert.throws(() => commit(g, "P3", DRAW_DECK), /Bot seats play automatically/);
  assert.throws(() => commit(g, "P9", DRAW_DECK), /not seated/);
  commit(g, "P2", DRAW_DECK);
  assert.equal(g.round, 2);
  assert.equal(g.players.P1.pending_tickets.length, 3);
  assert.equal(g.players.P1.min_keep, 1);
  assert.equal(g.players.P3.committed, null, "bots' commits cleared for the new round");
  // P1 must keep before committing; P2 can commit but the barrier waits for P1.
  commit(g, "P2", DRAW_DECK);
  assert.equal(g.round, 2);
  makeTracklayersMove(g, "P1", { type: "KEEP_TICKETS", round: 2, keep: [g.players.P1.pending_tickets[0]] });
  commit(g, "P1", DRAW_DECK);
  assert.equal(g.round, 3);
});

test("skip vote: only locked-in humans vote, unanimous, skipped seat rejected", () => {
  const g = keepStart(makeGame(humans(4)));
  commit(g, "P1", DRAW_DECK);
  assert.throws(() => makeTracklayersMove(g, "P2", { type: "SKIP_PLAYER", round: 1, target: "P3" }), /already locked in/);
  assert.throws(() => makeTracklayersMove(g, "P1", { type: "SKIP_PLAYER", round: 1, target: "P1" }), /skip yourself/);
  assert.throws(() => makeTracklayersMove(g, "P1", { type: "SKIP_PLAYER", round: 1, target: "P2x" }), /can't be skipped/);
  commit(g, "P2", DRAW_DECK);
  makeTracklayersMove(g, "P1", { type: "SKIP_PLAYER", round: 1, target: "P3" });
  assert.deepEqual(g.skip_votes, { P3: ["P1"] });
  assert.equal(g.players.P3.skipped, false);
  makeTracklayersMove(g, "P2", { type: "SKIP_PLAYER", round: 1, target: "P3" });
  assert.equal(g.players.P3.skipped, true);
  assert.throws(() => commit(g, "P3", DRAW_DECK), /You were skipped/);
  const before = Object.values(g.players.P3.hand).reduce((a, b) => a + b, 0);
  commit(g, "P4", DRAW_DECK);
  assert.equal(g.round, 2);
  assert.equal(Object.values(g.players.P3.hand).reduce((a, b) => a + b, 0), before, "skipped seat passed");
  assert.equal(g.players.P3.skipped, false, "back next round");
  assert.deepEqual(g.skip_votes, {});
});

test("final round: <= 2 trains triggers it; the game completes after it", () => {
  const g = keepStart(makeGame(humans(2)));
  g.players.P1.trains = 3;
  g.players.P1.hand = hand({ white: 1 });
  commit(g, "P1", { type: "CLAIM", route: "r19", color: "white" });
  commit(g, "P2", DRAW_DECK);
  assert.equal(g.players.P1.trains, 2);
  assert.equal(g.final_round, 2);
  assert.ok(g.events.some((e) => e.kind === "final_round" && /round 2 is the final round/.test(e.text)));
  assert.equal(g.status, "playing");
  commit(g, "P1", DRAW_DECK);
  commit(g, "P2", DRAW_DECK);
  assert.equal(g.status, "complete");
  assert.ok(g.winner);
  assert.throws(() => commit(g, "P1", DRAW_DECK), /already over/);
});

test("final scoring: tickets ±, Longest Line bonus (ties share), results order", () => {
  const g = keepStart(makeGame(humans(3)));
  g.players.P1.tickets = ["t35", "t1"]; // Saltmere–Briarwood (4) done, Frostharbor–Southreach (19) missed
  g.players.P2.tickets = ["t32"]; // Oakhollow–Tidewick (4): missed
  g.players.P3.tickets = [];
  g.routes = { r19: "P1", r31: "P1", r24: "P2", r39: "P2", r3: "P3" };
  assert.equal(longestPath(g.routes, "P1"), 4);
  assert.equal(longestPath(g.routes, "P2"), 4);
  g.final_round = 1;
  ["P1", "P2", "P3"].forEach((m) => commit(g, m, DRAW_DECK));
  assert.equal(g.status, "complete");
  const byMark = Object.fromEntries(g.results.map((r) => [r.mark, r]));
  assert.deepEqual(byMark.P1, { mark: "P1", total: 1 + 4 + 4 - 19 + 10, route_points: 5, ticket_points: -15, tickets_done: 1, tickets_failed: 1, longest: 4, longest_bonus: 10 });
  assert.deepEqual(byMark.P2, { mark: "P2", total: 2 + 2 - 4 + 10, route_points: 4, ticket_points: -4, tickets_done: 0, tickets_failed: 1, longest: 4, longest_bonus: 10 });
  assert.deepEqual(byMark.P3, { mark: "P3", total: 17, route_points: 7, ticket_points: 0, tickets_done: 0, tickets_failed: 0, longest: 4, longest_bonus: 10 });
  assert.deepEqual(g.results.map((r) => r.mark), ["P3", "P2", "P1"]);
  assert.equal(g.winner, "P3");
  assert.deepEqual(g.players.P1.ticket_results, [{ id: "t35", points: 4, done: true }, { id: "t1", points: -19, done: false }]);
  assert.deepEqual(tracklayersScoreByMark(g), { P1: 0, P2: 10, P3: 17 });
});

test("results tie-break: equal totals → most completed tickets wins", () => {
  const g = keepStart(makeGame(humans(2)));
  // P1: r3 (7) + r22 (1) + r29 (1) + Longest Line 4 cars (+10) = 19, no tickets.
  // P2: r19 (1) + r31 (4) + t35 done (+4) + Longest Line 4 cars (+10) = 19, one ticket done.
  g.players.P1.tickets = [];
  g.players.P2.tickets = ["t35"];
  g.routes = { r3: "P1", r22: "P1", r29: "P1", r19: "P2", r31: "P2" };
  g.final_round = 1;
  commit(g, "P1", DRAW_DECK);
  commit(g, "P2", DRAW_DECK);
  assert.deepEqual(g.results.map((r) => [r.mark, r.total, r.tickets_done]), [["P2", 19, 1], ["P1", 19, 0]]);
  assert.equal(g.winner, "P2");
});

test("viewer projection masks other seats and reveals tickets on completion", () => {
  const g = keepStart(makeGame([human("P1"), human("P2"), bot("P3")]));
  commit(g, "P1", DRAW_DECK);
  const dict = tracklayersGameToDict(g);
  assert.equal(dict.deck, undefined);
  assert.equal(dict.ticket_deck, undefined);
  const v = tracklayersGameToDictForViewer(dict, "P1", "playing");
  assert.ok(v.players.P1.hand && v.players.P1.tickets && v.players.P1.committed);
  assert.equal(v.players.P1.has_committed, true);
  for (const m of ["P2", "P3"]) {
    assert.equal(v.players[m].hand, null);
    assert.equal(v.players[m].tickets, null);
    assert.equal(v.players[m].pending_tickets, null);
    assert.equal(v.players[m].committed, null);
    assert.ok(Number.isInteger(v.players[m].hand_count));
  }
  const spectator = tracklayersGameToDictForViewer(dict, "", "playing");
  assert.equal(spectator.players.P1.hand, null);
  assert.equal(spectator.players.P1.committed, null);
  // Original dict untouched.
  assert.ok(dict.players.P2.hand);
  g.final_round = 1;
  commit(g, "P2", DRAW_DECK);
  assert.equal(g.status, "complete");
  const done = tracklayersGameToDictForViewer(tracklayersGameToDict(g), "P1", "completed");
  assert.ok(Array.isArray(done.players.P2.tickets));
  assert.ok(Array.isArray(done.players.P2.ticket_results));
  assert.ok(Number.isInteger(done.players.P2.longest));
  assert.equal(done.players.P2.hand, null);
});

test("projected dict has the PLAN.md shape", () => {
  const g = keepStart(makeGame([human("P1"), bot("P2")]));
  const d = tracklayersGameToDict(g);
  for (const key of [
    "game_id", "status", "phase", "round", "final_round", "options", "map", "tickets_catalog", "colors", "route_points",
    "deck_count", "discard_count", "ticket_deck_count", "market", "routes", "twins_locked", "seat_order", "priority_order",
    "players", "longest_bonus", "skip_votes", "events", "winner", "results", "move_count",
  ]) assert.ok(key in d, `missing ${key}`);
  assert.equal(d.game_id, TRACKLAYERS_GAME_ID);
  assert.deepEqual(Object.keys(d.map).sort(), ["board", "cities", "id", "routes"]);
  assert.equal(d.map.routes.length, 76);
  assert.deepEqual(Object.keys(d.map.routes[0]).sort(), ["a", "b", "color", "id", "len", "twin"]);
  assert.deepEqual(Object.keys(d.map.cities[0]).sort(), ["id", "name", "x", "y"]);
  assert.deepEqual(d.tickets_catalog.t1, { id: "t1", a: "frostharbor", b: "southreach", points: 19 });
  assert.deepEqual(d.colors, ["red", "orange", "yellow", "green", "blue", "purple", "black", "white"]);
  assert.deepEqual(d.route_points, { 1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 15 });
  assert.equal(d.market.length, 5);
  assert.equal(d.deck_count + d.market.length + 8, 110);
  assert.equal(d.ticket_deck_count, 40 - 6 + 2);
  assert.equal(d.longest_bonus, 10);
  for (const key of [
    "is_bot", "level", "trains", "score", "hand_count", "ticket_count", "has_committed", "has_pending_tickets", "skipped",
    "hand", "tickets", "pending_tickets", "committed", "ticket_results", "longest",
  ]) assert.ok(key in d.players.P1, `missing players.P1.${key}`);
  assert.equal(d.players.P2.is_bot, true);
  assert.ok(d.events.every((e) => Number.isInteger(e.seq) && typeof e.kind === "string" && typeof e.text === "string"));
  // Wiring through the shared handlers.
  const shell = newGame(TRACKLAYERS_GAME_ID);
  assert.ok(isTracklayersGame(shell));
  const viaHandlers = gameToDictForViewer(gameToDict(g), "P1", "playing");
  assert.equal(viaHandlers.players.P2.hand, null);
});

test("human + bots: bots commit at barrier close; normalize tolerates garbage", () => {
  const g = keepStart(makeGame([human("P1"), bot("P2", 1), bot("P3", 3)]));
  commit(g, "P1", DRAW_DECK);
  assert.equal(g.round, 2);
  assert.equal(g.move_count, 3);
  assert.ok(g.events.filter((e) => e.round === 1 && ["draw", "claim", "tickets", "conflict"].includes(e.kind)).length >= 3);
  const junk = { game_id: TRACKLAYERS_GAME_ID, seat_order: ["P1", "P1", "P2"], players: { P1: { hand: { red: -4, fake: 3 }, tickets: ["t1", "zz"] } }, routes: { r1: "P9", r2: "P2" }, market: ["red", "mauve"] };
  normalizeTracklayersGame(junk);
  assert.deepEqual(junk.seat_order, ["P1", "P2"]);
  assert.equal(junk.players.P1.hand.red, 0);
  assert.deepEqual(junk.players.P1.tickets, ["t1"]);
  assert.deepEqual(junk.routes, { r2: "P2" });
  assert.deepEqual(junk.market, ["red"]);
  assert.doesNotThrow(() => tracklayersGameToDict(junk));
});

test("all-bot tables run to completion fast at every level", () => {
  const started = Date.now();
  for (const level of [1, 2, 3, 4]) {
    for (const seed of [1, 7]) {
      const g = makeGame(Array.from({ length: 5 }, (_, i) => bot(`P${i + 1}`, level)), {}, seed);
      assert.equal(g.status, "complete", `level ${level} seed ${seed}`);
      assert.ok(g.round < 200, "ended naturally");
      assert.ok(g.winner && g.results.length === 5);
      // Card conservation: deck + discard + market + hands = 110.
      const inHands = g.seat_order.reduce((sum, m) => sum + Object.values(g.players[m].hand).reduce((a, b) => a + b, 0), 0);
      assert.equal(g.deck.length + g.discard.length + g.market.length + inHands, 110);
      g.seat_order.forEach((m) => assert.ok(g.players[m].trains >= 0));
    }
  }
  const twoBots = makeGame([bot("P1", 2), bot("P2", 3)], { trains: 45 }, 3);
  assert.equal(twoBots.status, "complete");
  assert.ok(Date.now() - started < 1000, `bots took ${Date.now() - started}ms`);
});
