import assert from "node:assert/strict";
import test from "node:test";
import {
  newRttaGame, initRttaSeats, makeRttaMove, rttaGameToDict, rttaScoreByMark,
  MONUMENTS as SERVER_MONUMENTS, DEVELOPMENTS as SERVER_DEVELOPMENTS,
  CITY_BOX_COSTS as SERVER_CITY_BOX_COSTS,
} from "../games/rtta/rules.js";
import {
  MONUMENTS as CLIENT_MONUMENTS, DEVELOPMENTS as CLIENT_DEVELOPMENTS,
  CITY_COSTS as CLIENT_CITY_COSTS, MIN_CITIES, scoreBreakdown,
} from "../../src/sogotable/static/games/rtta/rules.js";

const human = (mark, name) => ({ mark, name, kind: "human" });
const bot = (mark, name) => ({ mark, name, kind: "bot" });
const commit = (extra) => ({ type: "COMMIT_TURN", cities: 3, food: 3, ...extra });
// A truthful monument completion: full boxes + the claim. The server credits
// completions from the CLAMPED BOXES only — a bare monumentsCompleted claim
// (the old trust hole) is ignored.
const built = (...names) => ({
  monumentBoxes: Object.fromEntries(names.map((n) => [n, SERVER_MONUMENTS[n].workers])),
  monumentsCompleted: names,
});

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
    assert.deepEqual(c.notAt || [], s.notAt || [], `${name}: sits-out seat counts differ`);
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

test("data parity: city worker costs agree across client and server", () => {
  assert.deepEqual(CLIENT_CITY_COSTS.slice(MIN_CITIES), SERVER_CITY_BOX_COSTS);
});

test("round starts in the playing phase, not yet resolved", () => {
  const g = twoHumans();
  assert.equal(g.phase, "playing");
  assert.equal(g.round, 1);
  assert.equal(g.status, "playing");
});

test("setup: seats start with 3 cities, 3 food, and empty goods (rulebook Setup)", () => {
  const g = twoHumans();
  assert.equal(g.players.P1.cities, 3);
  assert.equal(g.players.P1.food, 3);
  assert.deepEqual(g.players.P1.goods, [0, 0, 0, 0, 0]);
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
  makeRttaMove(g, "P1", commit(built("Step Pyramid")));
  makeRttaMove(g, "P1", commit(built("Stone Circle"))); // second one is dropped
  assert.deepEqual(g.monuments["Stone Circle"], []);
  assert.deepEqual(g.monuments["Step Pyramid"], ["P1"]);
});

test("a round-stamped action from another round is rejected loudly", () => {
  const g = twoHumans();
  assert.throws(() => makeRttaMove(g, "P1", commit({ round: 3 })), /Stale turn from round 3/);
  makeRttaMove(g, "P1", commit({ round: 1 }));   // the current round's stamp is accepted
  assert.equal(g.players.P1.round_done, true);
  makeRttaMove(g, "P2", commit());               // unstamped (legacy client) still lands
  makeRttaMove(g, "P1", { type: "READY_NEXT", round: 1 });
  makeRttaMove(g, "P2", { type: "READY_NEXT" });
  assert.equal(g.round, 2);
  // A duplicate tab left on round 1 can no longer hijack round 2's turn.
  assert.throws(() => makeRttaMove(g, "P1", commit({ round: 1 })), /Stale turn from round 1/);
  assert.throws(() => makeRttaMove(g, "P1", { type: "HACK" }), /Unknown Roll Through the Ages action/);
});

test("Pestilence (3 skulls) costs every opponent 3 — except Medicine holders", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1", "A"), human("P2", "B"), human("P3", "C")]);
  // Round 1: P2 buys Medicine — a development shields from the NEXT round on
  // (buys land after Upkeep, when disasters have already resolved).
  makeRttaMove(g, "P1", commit());
  makeRttaMove(g, "P2", commit({ devBought: "Medicine" }));
  makeRttaMove(g, "P3", commit());
  for (const m of ["P1", "P2", "P3"]) makeRttaMove(g, m, { type: "READY_NEXT" });
  // Round 2: P1 rolls pestilence.
  makeRttaMove(g, "P1", commit({ skulls: 3 }));       // the pestilent player
  makeRttaMove(g, "P2", commit());                    // immune (Medicine since round 1)
  makeRttaMove(g, "P3", commit());                    // takes the hit
  assert.equal(g.players.P1.points_lost, 0);
  assert.equal(g.players.P2.points_lost, 0);
  assert.equal(g.players.P3.points_lost, 3);
  assert.deepEqual(g.pending_events, [{ from: "P1", kind: "pestilence", to: ["P3"], amount: 3 }]);
});

test("a development bought the same round does NOT shield that round's disasters", () => {
  const g = twoHumans();
  makeRttaMove(g, "P1", commit({ skulls: 3 }));
  makeRttaMove(g, "P2", commit({ devBought: "Medicine" })); // bought in the Buy step — after Upkeep
  assert.equal(g.players.P2.points_lost, 3);
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
  // Round 1: P1 buys Religion (same-round Religion cannot power a revolt).
  makeRttaMove(g, "P1", commit({ devBought: "Religion" }));
  makeRttaMove(g, "P2", commit());
  makeRttaMove(g, "P1", { type: "READY_NEXT" });
  makeRttaMove(g, "P2", { type: "READY_NEXT" });
  // Round 2: P2 hoards goods; P1 revolts with Religion.
  makeRttaMove(g, "P1", commit({ skulls: 5 }));
  makeRttaMove(g, "P2", commit({ goods: [2, 1, 0, 3, 1] }));
  assert.deepEqual(g.players.P2.goods, [0, 0, 0, 0, 0]);
  assert.equal(g.pending_events.some((e) => e.kind === "revolt" && e.from === "P1"), true);
});

test("score = development VP + monument VP − points lost", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1")]);
  makeRttaMove(g, "P1", commit({ ...built("Step Pyramid"), devBought: "Leadership" }));
  assert.equal(g.phase, "review");
  assert.equal(g.players.P1.score, 3); // Leadership 2 + Step Pyramid first 1
});

test("first builder scores 'first', a later builder scores 'later'", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1"), human("P2")]);
  makeRttaMove(g, "P1", commit(built("Obelisk"))); // first
  makeRttaMove(g, "P2", commit());
  makeRttaMove(g, "P1", { type: "READY_NEXT" });
  makeRttaMove(g, "P2", { type: "READY_NEXT" });
  makeRttaMove(g, "P1", commit());
  makeRttaMove(g, "P2", commit(built("Obelisk"))); // later
  assert.equal(g.players.P1.score, 6); // Obelisk first
  assert.equal(g.players.P2.score, 3); // Obelisk later
});

test("Architecture (+2/monument) and Empire (+1/city) bonuses apply", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1")]);
  // Two monuments + Architecture, plus a city and Empire, across turns.
  makeRttaMove(g, "P1", commit({ ...built("Step Pyramid", "Stone Circle"), devBought: "Architecture" }));
  // Step 1 + Stone 2 + Architecture 8 + bonus 2×2 monuments = 15
  assert.equal(g.players.P1.score, 15);
  makeRttaMove(g, "P1", { type: "READY_NEXT" });
  makeRttaMove(g, "P1", commit({ cities: 5, devBought: "Empire" }));
  // prev 15 + Empire 10 + 5 cities = 30
  assert.equal(g.players.P1.score, 30);
});

test("score parity: the client scoreBreakdown matches the server's authoritative score", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1"), human("P2")]);
  makeRttaMove(g, "P1", commit({
    ...built("Obelisk", "Stone Circle"),
    devBought: "Architecture", cityBoxes: [3, 4, 2, 0], skulls: 2, pointsLostSelf: 2,
  }));
  makeRttaMove(g, "P2", commit());
  // The live standings run scoreBreakdown on the CLIENT tables; the Total
  // column is the SERVER's seat.score — the two must never diverge.
  const seat = g.players.P1;
  const monuments = Object.keys(g.monuments)
    .filter((n) => g.monuments[n].includes("P1"))
    .map((n) => ({ vp: g.monuments[n][0] === "P1" ? SERVER_MONUMENTS[n].first : SERVER_MONUMENTS[n].later }));
  const b = scoreBreakdown({
    developments: seat.developments, monuments, cities: seat.cities, pointsLost: seat.points_lost,
  });
  assert.equal(b.total, seat.score);
  assert.equal(seat.score, rttaScoreByMark(g).P1);
});

test("partial city progress persists and the city count derives from full slots", () => {
  const g = twoHumans();
  // 2 boxes into the 4th city (cost 3): still 3 cities, progress kept.
  makeRttaMove(g, "P1", commit({ cityBoxes: [2, 0, 0, 0] }));
  makeRttaMove(g, "P2", commit());
  assert.equal(g.players.P1.cities, 3);
  assert.deepEqual(g.players.P1.cityBoxes, [2, 0, 0, 0]);
  assert.deepEqual(rttaGameToDict(g).players.find((p) => p.mark === "P1").cityBoxes, [2, 0, 0, 0]);
  makeRttaMove(g, "P1", { type: "READY_NEXT" });
  makeRttaMove(g, "P2", { type: "READY_NEXT" });
  // Next round: finish the 4th city and start the 5th.
  makeRttaMove(g, "P1", commit({ cityBoxes: [3, 1, 0, 0] }));
  assert.equal(g.players.P1.cities, 4);
  assert.deepEqual(g.players.P1.cityBoxes, [3, 1, 0, 0]);
});

test("cityBoxes are clamped and a legacy count-only commit still works", () => {
  const g = twoHumans();
  makeRttaMove(g, "P1", commit({ cityBoxes: [99, -2, 4, 6] }));  // → [3, 0, 4, 6]: 4th + 7th full (6th is 4/5)
  assert.deepEqual(g.players.P1.cityBoxes, [3, 0, 4, 6]);
  assert.equal(g.players.P1.cities, 5);
  makeRttaMove(g, "P2", commit({ cities: 5 }));                  // legacy: no cityBoxes field
  assert.equal(g.players.P2.cities, 5);
  assert.deepEqual(g.players.P2.cityBoxes, [3, 4, 0, 0]);        // synthesized full slots
});

test("a commit claiming an out-of-play monument is ignored (2-player game)", () => {
  const g = twoHumans();
  // Temple sits out the 2-player game; a doctored/stale commit must not land it.
  makeRttaMove(g, "P1", commit({
    monumentsCompleted: ["Temple"],
    monumentBoxes: { "Temple": 7, "Hanging Gardens": 3 },
  }));
  assert.deepEqual(g.monuments["Temple"], []);
  assert.deepEqual(g.players.P1.monumentBoxes, { "Hanging Gardens": 3 });
});

test("a completion claim without full boxes is not credited", () => {
  const g = twoHumans();
  // A doctored monumentsCompleted with only 5/9 workers boxed must not steal
  // first-builder VP (or trip the shared all-monuments end).
  makeRttaMove(g, "P1", commit({ monumentsCompleted: ["Obelisk"], monumentBoxes: { "Obelisk": 5 } }));
  assert.deepEqual(g.monuments["Obelisk"], []);
  assert.equal(g.players.P1.monumentBoxes["Obelisk"], 5);
  makeRttaMove(g, "P2", commit());
  assert.equal(g.players.P1.score, 0);
});

test("goods are clamped to each row's pegboard maximum", () => {
  const g = twoHumans();
  makeRttaMove(g, "P1", commit({ goods: [999, 999, -5, 2, 999] }));
  assert.deepEqual(g.players.P1.goods, [8, 7, 0, 2, 4]); // holes: 8/7/6/5/4
});

test("points lost cap at the 45-box disaster grid, like the paper sheet", () => {
  const g = twoHumans();
  makeRttaMove(g, "P1", commit({ pointsLostSelf: 999 }));
  assert.equal(g.players.P1.points_lost, 45);
});

test("the all-monuments end condition counts only in-play monuments", () => {
  const g = twoHumans();
  // The five monuments in play for 2 players — Temple + Great Pyramid sit out.
  const inPlay = ["Step Pyramid", "Stone Circle", "Obelisk", "Hanging Gardens", "Great Wall"];
  makeRttaMove(g, "P1", commit(built(...inPlay)));
  makeRttaMove(g, "P2", commit());
  assert.equal(g.status, "complete");
  assert.equal(g.winner, "P1");
  assert.equal(g.end_reason.kind, "all_monuments");
  assert.deepEqual(g.end_reason.marks, ["P1"]); // P1 closed every open monument
  assert.deepEqual([...g.end_reason.monuments].sort(), [...inPlay].sort());
  assert.equal(rttaGameToDict(g).end_reason.kind, "all_monuments");
});

test("bots never build monuments that are out of play for the seat count", () => {
  const g = newRttaGame();
  initRttaSeats(g, [bot("P1", "Bot 1"), bot("P2", "Bot 2")]); // runs to completion
  assert.equal(g.status, "complete");
  assert.deepEqual(g.monuments["Temple"], []);
  assert.deepEqual(g.monuments["Great Pyramid"], []);
});

test("bots roll real dice: an all-food roll banks food and builds nothing", () => {
  const g = newRttaGame();
  initRttaSeats(g, [bot("P1", "Bot"), human("P2", "H")], () => 0);
  assert.equal(g.players.P1.round_done, false); // bots wait for the humans now
  // rng 0 → every die lands FACES[0] (3 food); buy gate 0 < chance → wants to
  // buy, but 0 coins + 0 goods affords nothing. 9 food − 3 cities fed = +6.
  makeRttaMove(g, "P2", commit(), () => 0); // barrier closes → the bot takes its turn
  const seat = g.players.P1;
  assert.equal(seat.food, 3 + 9 - 3); // started 3, harvested 9, fed 3
  assert.deepEqual(seat.monumentBoxes, {});
  assert.deepEqual(seat.developments, []);
  assert.equal(seat.skulls, 0);
});

test("bots roll real dice: an all-skull roll pestilences the humans", () => {
  const g = newRttaGame();
  // rng 0.99 → every die lands the last face (2 goods + skull): 3 skulls.
  initRttaSeats(g, [bot("P1", "Bot"), human("P2", "H")], () => 0.99);
  makeRttaMove(g, "P2", commit(), () => 0.99); // barrier closes → bot rolls, disasters resolve
  assert.equal(g.players.P1.skulls, 3);
  assert.equal(g.players.P2.points_lost, 3); // the BOT's pestilence struck the human
  assert.equal(g.pending_events[0].kind, "pestilence");
  assert.equal(g.pending_events[0].from, "P1");
});

test("bots build AFTER the humans — no first-builder sniping", () => {
  const g = newRttaGame();
  // rng 0.4 → every die lands FACES[2] (3 workers): the bot has 9 workers and
  // would love the Step Pyramid. The human finishes it the same round — and
  // wins first-builder VP, because the bot's turn resolves after every human.
  initRttaSeats(g, [bot("P1", "Bot"), human("P2", "H")], () => 0.4);
  makeRttaMove(g, "P2", commit(built("Step Pyramid")), () => 0.4);
  assert.equal(g.monuments["Step Pyramid"][0], "P2"); // the human is FIRST
  assert.ok((g.players.P1.monumentBoxes["Step Pyramid"] || 0) < 3
    || g.monuments["Step Pyramid"].indexOf("P1") !== 0); // the bot never got there first
});

test("a reflected Revolt spares opponents who also own Religion", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1"), human("P2"), human("P3")]);
  // Round 1: P1 and P2 each buy Religion (owned from round 2 on).
  makeRttaMove(g, "P1", commit({ devBought: "Religion" }));
  makeRttaMove(g, "P2", commit({ devBought: "Religion" }));
  makeRttaMove(g, "P3", commit());
  for (const m of ["P1", "P2", "P3"]) makeRttaMove(g, m, { type: "READY_NEXT" });
  // Round 2: P1 revolts; P2's Religion reflects it away.
  makeRttaMove(g, "P1", commit({ skulls: 5 }));
  makeRttaMove(g, "P2", commit({ goods: [2, 1, 0, 0, 0] })); // immune
  makeRttaMove(g, "P3", commit({ goods: [1, 1, 1, 0, 0] })); // wiped
  assert.deepEqual(g.players.P2.goods, [2, 1, 0, 0, 0]);
  assert.deepEqual(g.players.P3.goods, [0, 0, 0, 0, 0]);
  const revolt = g.pending_events.find((e) => e.kind === "revolt");
  assert.deepEqual(revolt.to, ["P3"]);
});

test("solitaire: the game ends after 10 rounds (rulebook solo variant)", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1")]);
  for (let r = 1; r <= 10; r++) {
    assert.equal(g.round, r);
    makeRttaMove(g, "P1", commit());
    if (g.status !== "complete") makeRttaMove(g, "P1", { type: "READY_NEXT" });
  }
  assert.equal(g.status, "complete");
  assert.equal(g.end_reason.kind, "ten_rounds");
  assert.deepEqual(g.end_reason.marks, ["P1"]);
});

test("solitaire: pestilence strikes the roller — Medicine (prior round) immune", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1")]);
  makeRttaMove(g, "P1", commit({ skulls: 3 }));   // no opponents → the roller pays
  assert.equal(g.players.P1.points_lost, 3);
  assert.deepEqual(g.pending_events, [{ from: "P1", kind: "pestilence", to: ["P1"], amount: 3 }]);
  makeRttaMove(g, "P1", { type: "READY_NEXT" });
  makeRttaMove(g, "P1", commit({ devBought: "Medicine" }));
  makeRttaMove(g, "P1", { type: "READY_NEXT" });
  makeRttaMove(g, "P1", commit({ skulls: 3 }));   // round 3: Medicine owned since round 2
  assert.equal(g.players.P1.points_lost, 3);      // unchanged — immune
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
  assert.equal(g.end_reason.kind, "five_devs");
  assert.deepEqual(g.end_reason.marks, ["P1"]);
});

test("a tied final score is broken by remaining goods value", () => {
  const g = twoHumans();
  const devs = ["Leadership", "Irrigation", "Agriculture", "Quarrying", "Medicine"];
  for (const d of devs) {
    makeRttaMove(g, "P1", commit({ devBought: d, goods: [1, 0, 0, 0, 0] })); // wood — worth 1
    makeRttaMove(g, "P2", commit({ devBought: d, goods: [0, 1, 0, 0, 0] })); // stone — worth 2
    if (g.status !== "complete") {
      makeRttaMove(g, "P1", { type: "READY_NEXT" });
      makeRttaMove(g, "P2", { type: "READY_NEXT" });
    }
  }
  assert.equal(g.status, "complete");
  assert.equal(g.players.P1.score, g.players.P2.score);
  assert.equal(g.winner, "P2"); // seat order alone would have said P1
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
  makeRttaMove(g, "P1", commit());
  assert.equal(g.phase, "review"); // one human done → bot takes its turn → round resolves
  assert.equal(g.players.P2.round_done, true);
  assert.equal(g.players.P2.ready_next, true); // and never holds the review barrier
});

test("skip: a unanimous vote of the waiting players releases the commit barrier", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1"), human("P2"), human("P3")]);
  // Nobody may skip before finishing their own turn.
  assert.throws(() => makeRttaMove(g, "P1", { type: "SKIP_PLAYER", target: "P3" }), /Finish and submit/);
  makeRttaMove(g, "P1", commit());
  makeRttaMove(g, "P2", commit());
  makeRttaMove(g, "P1", { type: "SKIP_PLAYER", target: "P2" }); // P2 already arrived — silent no-op
  assert.equal(g.phase, "playing");
  makeRttaMove(g, "P1", { type: "SKIP_PLAYER", target: "P3", round: 1 }); // P3's phone died — P1 proposes
  assert.equal(g.phase, "playing", "one vote of two is a proposal, not a skip");
  assert.deepEqual(g.skip_votes, { P3: ["P1"] }, "the proposal is server state every client sees");
  assert.equal(rttaGameToDict(g).skip_votes.P3.length, 1, "and it rides the projection");
  makeRttaMove(g, "P1", { type: "SKIP_PLAYER", target: "P3", round: 1 }); // voting again retracts
  assert.deepEqual(g.skip_votes, {});
  makeRttaMove(g, "P1", { type: "SKIP_PLAYER", target: "P3", round: 1 }); // re-propose
  makeRttaMove(g, "P2", { type: "SKIP_PLAYER", target: "P3", round: 1 }); // unanimous — executes
  assert.deepEqual(g.skip_votes, {}, "an executed proposal clears");
  assert.equal(g.phase, "review");
  assert.equal(g.players.P3.round_done, true);
  assert.equal(g.players.P3.ready_next, true); // one skip covers BOTH barriers — no double skip
  assert.equal(g.players.P3.skipped, true);
  assert.equal(g.players.P3.food, 3); // a skipped turn is a null turn — sheet untouched
  // P3 finishes their turn anyway and submits — rejected LOUDLY, never a
  // silent "duplicate" drop under a '✓ Turn submitted' success message.
  assert.throws(() => makeRttaMove(g, "P3", commit({ round: 1 })), /turn was skipped/);
  makeRttaMove(g, "P1", { type: "READY_NEXT" });
  makeRttaMove(g, "P2", { type: "READY_NEXT" });
  assert.equal(g.round, 2);
  assert.equal(g.players.P3.skipped, false); // back in from the new round
  makeRttaMove(g, "P3", commit({ round: 2 })); // and their next commit lands
  assert.equal(g.players.P3.round_done, true);
});

test("skip: releases the ready barrier too, and rejects bots/self", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1"), human("P2"), bot("P3")]);
  makeRttaMove(g, "P1", commit());
  makeRttaMove(g, "P2", commit());
  assert.equal(g.phase, "review");
  assert.throws(() => makeRttaMove(g, "P1", { type: "SKIP_PLAYER", target: "P3" }), /human player/); // bots resolve themselves
  assert.throws(() => makeRttaMove(g, "P1", { type: "SKIP_PLAYER", target: "P1" }), /human player/); // not yourself
  assert.throws(() => makeRttaMove(g, "P1", { type: "SKIP_PLAYER", target: "P2" }), /Press Ready yourself/);
  makeRttaMove(g, "P1", { type: "READY_NEXT" });
  makeRttaMove(g, "P1", { type: "SKIP_PLAYER", target: "P2", round: 1 });
  assert.equal(g.round, 2); // the table moved on
});

test("rttaGameToDict projects the full public N-player state", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1", "A"), human("P2", "B"), human("P3", "C")]);
  const dict = rttaGameToDict(g);
  // The projection IS the wire contract: pin the exact key sets so a silent
  // rename (e.g. monumentBoxes → monument_boxes) fails HERE, not as an
  // `undefined` in the board seeding.
  assert.deepEqual(Object.keys(dict).sort(), [
    "end_reason", "game_id", "monuments", "pending_events", "phase",
    "players", "round", "seat_order", "skip_votes", "status", "winner",
  ]);
  assert.deepEqual(Object.keys(dict.players[0]).sort(), [
    "cities", "cityBoxes", "developments", "finish_state", "food", "goods",
    "is_bot", "mark", "monumentBoxes", "name", "points_lost", "ready_next",
    "round_done", "score", "skipped",
  ]);
  assert.equal(dict.seat_order.length, 3);
  assert.equal(dict.players.length, 3);
  assert.equal(dict.players[0].name, "A");
  assert.equal(dict.players[0].finish_state, "playing");
  assert.deepEqual(dict.players[0].goods, [0, 0, 0, 0, 0]);
  assert.deepEqual(dict.players[0].cityBoxes, [0, 0, 0, 0]);
  assert.equal(dict.phase, "playing");
  assert.equal(dict.round, 1);
  assert.equal(dict.status, "playing");
  assert.equal(dict.winner, null);
  assert.deepEqual(dict.pending_events, []);
  assert.equal(typeof dict.monuments["Great Wall"].length, "number");
});

test("rttaScoreByMark returns a score for every seat", () => {
  const g = newRttaGame();
  initRttaSeats(g, [human("P1"), human("P2")]);
  const scores = rttaScoreByMark(g);
  assert.deepEqual(Object.keys(scores).sort(), ["P1", "P2"]);
});
