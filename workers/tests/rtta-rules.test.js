import assert from "node:assert/strict";
import test from "node:test";
import {
  newRttaGame, initRttaSeats, makeRttaMove, rttaGameToDict, rttaScoreByMark,
  MONUMENTS as SERVER_MONUMENTS, DEVELOPMENTS as SERVER_DEVELOPMENTS,
} from "../games/rtta/rules.js";
import {
  MONUMENTS as CLIENT_MONUMENTS, DEVELOPMENTS as CLIENT_DEVELOPMENTS,
} from "../../src/sogotable/static/games/rtta/rules.js";

const human = (mark, name) => ({ mark, name, kind: "human" });
const bot = (mark, name) => ({ mark, name, kind: "bot" });
const commit = (extra) => ({ type: "COMMIT_TURN", cities: 3, food: 3, ...extra });

function twoHumans() {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1", "A"), human("P2", "B")]);
  return g;
}

// Data-parity guard (steward finding #2): the client (preview/costs) and the
// server (authoritative score) each declare their own MONUMENTS/DEVELOPMENTS
// tables in different shapes. If a balance tweak lands on one side only, the
// client would show a cost/score the server won't award — a silent divergence a
// green build wouldn't catch. These pin the SHARED balance fields equal.
test("data parity: monument costs + VP agree across client and server", () => {
  const client = new Map(CLIENT_MONUMENTS.map((m) => [m.name, m]));
  const serverNames = Object.keys(SERVER_MONUMENTS);
  assert.deepEqual(
    [...client.keys()].sort(), serverNames.slice().sort(),
    "monument name sets differ between client and server",
  );
  for (const name of serverNames) {
    const s = SERVER_MONUMENTS[name];
    const c = client.get(name);
    assert.equal(c.w, s.workers, `${name}: worker cost differs (client ${c.w} vs server ${s.workers})`);
    assert.equal(c.first, s.first, `${name}: first-builder VP differs`);
    assert.equal(c.later, s.later, `${name}: later-builder VP differs`);
    assert.equal(c.players || 1, s.players || 1, `${name}: min-player threshold differs`);
  }
});

test("data parity: development cost + VP agree across client and server", () => {
  const client = new Map(CLIENT_DEVELOPMENTS.map((d) => [d.name, d]));
  const serverNames = Object.keys(SERVER_DEVELOPMENTS);
  assert.deepEqual(
    [...client.keys()].sort(), serverNames.slice().sort(),
    "development name sets differ between client and server",
  );
  for (const name of serverNames) {
    const s = SERVER_DEVELOPMENTS[name];
    const c = client.get(name);
    assert.equal(c.cost, s.cost, `${name}: coin cost differs (client ${c.cost} vs server ${s.cost})`);
    assert.equal(c.vp, s.vp, `${name}: VP differs (client ${c.vp} vs server ${s.vp})`);
  }
});

test("round starts in the playing phase, not yet resolved", () => {
  const g = twoHumans();
  assert.equal(g.phase, "playing");
  assert.equal(g.round, 1);
  assert.equal(g.status, "playing");
});

test("commit barrier: the round holds until EVERY human has committed", () => {
  const g = twoHumans();
  makeRttaMove(g, "P1", commit());
  assert.equal(g.phase, "playing"); // still waiting on P2
  assert.equal(g.players.P1.round_done, true);
  makeRttaMove(g, "P2", commit());
  assert.equal(g.phase, "review"); // both in → resolved
});

test("ready barrier: review holds until every human presses READY_NEXT", () => {
  const g = twoHumans();
  makeRttaMove(g, "P1", commit());
  makeRttaMove(g, "P2", commit());
  makeRttaMove(g, "P1", { type: "READY_NEXT" });
  assert.equal(g.phase, "review"); // still waiting on P2
  makeRttaMove(g, "P2", { type: "READY_NEXT" });
  assert.equal(g.phase, "playing");
  assert.equal(g.round, 2);
  assert.equal(g.players.P1.round_done, false); // reset for the new round
});

test("a stale duplicate commit in the same round is ignored", () => {
  const g = twoHumans();
  makeRttaMove(g, "P1", commit({ monumentsCompleted: ["Step Pyramid"] }));
  makeRttaMove(g, "P1", commit({ monumentsCompleted: ["Stone Circle"] })); // second one is dropped
  assert.deepEqual(g.monuments["Stone Circle"], []);
  assert.deepEqual(g.monuments["Step Pyramid"], ["P1"]);
});

test("Pestilence (3 skulls) costs every opponent 3 — except Medicine holders", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1", "A"), human("P2", "B"), human("P3", "C")]);
  makeRttaMove(g, "P1", commit({ skulls: 3 }));       // the pestilent player
  makeRttaMove(g, "P2", commit({ devBought: "Medicine" })); // immune
  makeRttaMove(g, "P3", commit());                    // takes the hit
  assert.equal(g.players.P1.points_lost, 0);
  assert.equal(g.players.P2.points_lost, 0);
  assert.equal(g.players.P3.points_lost, 3);
  assert.deepEqual(g.pending_events, [{ from: "P1", kind: "pestilence", to: ["P3"], amount: 3 }]);
});

test("Pestilence scales to N opponents", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1"), human("P2"), human("P3"), human("P4")]);
  makeRttaMove(g, "P1", commit({ skulls: 3 }));
  makeRttaMove(g, "P2", commit());
  makeRttaMove(g, "P3", commit());
  makeRttaMove(g, "P4", commit());
  assert.deepEqual(g.pending_events[0].to, ["P2", "P3", "P4"]);
  assert.equal(g.players.P2.points_lost, 3);
  assert.equal(g.players.P4.points_lost, 3);
});

test("Revolt (5 skulls + Religion) wipes opponents' goods", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1"), human("P2")]);
  // P2 hoards goods; P1 revolts with Religion.
  makeRttaMove(g, "P1", commit({ skulls: 5, devBought: "Religion" }));
  makeRttaMove(g, "P2", commit({ goods: [2, 1, 0, 3, 1] }));
  assert.deepEqual(g.players.P2.goods, [0, 0, 0, 0, 0]);
  assert.equal(g.pending_events.some((e) => e.kind === "revolt" && e.from === "P1"), true);
});

test("score = development VP + monument VP − points lost", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1")]);
  makeRttaMove(g, "P1", commit({ monumentsCompleted: ["Step Pyramid"], devBought: "Leadership" }));
  assert.equal(g.phase, "review");
  assert.equal(g.players.P1.score, 3); // Leadership 2 + Step Pyramid first 1
});

test("first builder scores 'first', a later builder scores 'later'", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1"), human("P2")]);
  makeRttaMove(g, "P1", commit({ monumentsCompleted: ["Temple"] })); // first
  makeRttaMove(g, "P2", commit());
  makeRttaMove(g, "P1", { type: "READY_NEXT" });
  makeRttaMove(g, "P2", { type: "READY_NEXT" });
  makeRttaMove(g, "P1", commit());
  makeRttaMove(g, "P2", commit({ monumentsCompleted: ["Temple"] })); // later
  assert.equal(g.players.P1.score, 4); // Temple first
  assert.equal(g.players.P2.score, 2); // Temple later
});

test("Architecture (+1/monument) and Empire (+1/city) bonuses apply", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1")]);
  // Two monuments + Architecture, plus a city and Empire, across turns.
  makeRttaMove(g, "P1", commit({ monumentsCompleted: ["Step Pyramid", "Stone Circle"], devBought: "Architecture" }));
  // Step 1 + Stone 2 + Architecture 8 + bonus 2 monuments = 13
  assert.equal(g.players.P1.score, 13);
  makeRttaMove(g, "P1", { type: "READY_NEXT" });
  makeRttaMove(g, "P1", commit({ cities: 5, devBought: "Empire" }));
  // prev 13 + Empire 8 + 5 cities = 26
  assert.equal(g.players.P1.score, 26);
});

test("a commit claiming an out-of-play monument is ignored (2-player game)", () => {
  const g = twoHumans();
  // Hanging Gardens needs 3+ players; a doctored/stale commit must not land it.
  makeRttaMove(g, "P1", commit({
    monumentsCompleted: ["Hanging Gardens"],
    monumentBoxes: { "Hanging Gardens": 11, "Temple": 2 },
  }));
  assert.deepEqual(g.monuments["Hanging Gardens"], []);
  assert.deepEqual(g.players.P1.monumentBoxes, { Temple: 2 });
});

test("the all-monuments end condition counts only in-play monuments", () => {
  const g = twoHumans();
  // The six monuments in play for 2 players — Hanging Gardens is not required.
  const inPlay = ["Step Pyramid", "Stone Circle", "Temple", "Obelisk", "Great Wall", "Great Pyramid"];
  makeRttaMove(g, "P1", commit({ monumentsCompleted: inPlay }));
  makeRttaMove(g, "P2", commit());
  assert.equal(g.status, "complete");
  assert.equal(g.winner, "P1");
});

test("bots never build monuments that are out of play for the seat count", () => {
  const g = newRttaGame();
  initRttaSeats(g, [bot("P1", "Bot 1"), bot("P2", "Bot 2")]); // runs to completion
  assert.equal(g.status, "complete");
  assert.deepEqual(g.monuments["Hanging Gardens"], []);
});

test("the game ends when a player owns 5 developments", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1")]);
  const devs = ["Leadership", "Irrigation", "Agriculture", "Quarrying", "Medicine"];
  for (const d of devs) {
    makeRttaMove(g, "P1", commit({ devBought: d }));
    if (g.status !== "complete") makeRttaMove(g, "P1", { type: "READY_NEXT" });
  }
  assert.equal(g.status, "complete");
  assert.equal(g.players.P1.developments.length, 5);
  assert.equal(g.winner, "P1");
});

test("a bot-only room settles to completion without blocking", () => {
  const g = newRttaGame();
  initRttaSeats(g, [bot("P1", "Bot 1"), bot("P2", "Bot 2")]);
  assert.equal(g.status, "complete");
  assert.notEqual(g.winner, null);
});

test("bots never block a room that has a human", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1", "Human"), bot("P2", "Bot")]);
  assert.equal(g.phase, "playing"); // waiting on the human, not the bot
  assert.equal(g.players.P2.round_done, true); // bot already resolved its turn
  makeRttaMove(g, "P1", commit());
  assert.equal(g.phase, "review"); // one human done → round resolves
});

test("rttaGameToDict projects the full public N-player state", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1", "A"), human("P2", "B"), human("P3", "C")]);
  const dict = rttaGameToDict(g);
  assert.equal(dict.seat_order.length, 3);
  assert.equal(dict.players.length, 3);
  assert.equal(dict.players[0].name, "A");
  assert.equal(dict.phase, "playing");
  assert.equal(typeof dict.monuments["Great Wall"].length, "number");
});

test("rttaScoreByMark returns a score for every seat", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1"), human("P2")]);
  const scores = rttaScoreByMark(g);
  assert.deepEqual(Object.keys(scores).sort(), ["P1", "P2"]);
});
