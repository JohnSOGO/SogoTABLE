import assert from "node:assert/strict";
import test from "node:test";
import {
  POTION_LAB_GAME_ID, POTION_LAB_MIN_PLAYERS,
  isPotionLabGame, newPotionLabGame, initPotionLabSeats, makePotionLabMove,
  potionLabGameToDict, potionLabGameToDictForViewer, potionLabScoreByMark,
  potionLabHandSize, potionLabCardScore, potionLabMoondustScores, potionLabIceScores,
  setPotionLabRandom,
} from "../games/potion-lab/rules.js";

const human = (mark, name) => ({ mark, name, kind: "human" });
const bot = (mark, name) => ({ mark, name, kind: "bot" });
const leveledBot = (mark, name, bot_level) => ({ mark, name, kind: "bot", bot_level });

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Drive a game to completion: every human keeps their first hand card each pick
// and readies up each review; bots resolve internally.
function playOut(game) {
  let guard = 0;
  while (game.status !== "complete" && guard++ < 10000) {
    const dict = potionLabGameToDict(game);
    if (game.phase === "playing") {
      const seat = dict.players.find((p) => !p.is_bot && !p.has_committed && p.hand_count > 0);
      if (!seat) { // no human able to act (shouldn't happen mid-playing) — safety
        break;
      }
      const card = seat.hand[0];
      makePotionLabMove(game, seat.mark, { type: "COMMIT_PICK", round: game.round, pick: game.pick, cards: [card.id], useWizard: false });
    } else { // review
      const seat = dict.players.find((p) => !p.is_bot && !p.ready_next);
      if (!seat) break;
      makePotionLabMove(game, seat.mark, { type: "READY_NEXT", round: game.round });
    }
  }
  return game;
}

test("predicate + ids", () => {
  const g = newPotionLabGame();
  assert.equal(g.game_id, POTION_LAB_GAME_ID);
  assert.ok(isPotionLabGame(g));
  assert.ok(!isPotionLabGame({ game_id: "hearts" }));
  assert.equal(POTION_LAB_MIN_PLAYERS, 2);
});

test("hand size scales down with players", () => {
  assert.equal(potionLabHandSize(2), 10);
  assert.equal(potionLabHandSize(5), 7);
  assert.equal(potionLabHandSize(9), 5);
});

test("needs the minimum players", () => {
  const g = newPotionLabGame();
  assert.throws(() => initPotionLabSeats(g, [human("P1", "Solo")]), /at least 2/);
});

test("full game completes over 3 rounds for various tables", () => {
  for (const n of [2, 3, 4, 6]) {
    setPotionLabRandom(seeded(100 + n));
    const seats = [];
    for (let i = 0; i < n; i += 1) seats.push(i % 2 === 0 ? human("P" + (i + 1), "H" + i) : bot("P" + (i + 1), "Bot" + i));
    const g = newPotionLabGame();
    initPotionLabSeats(g, seats);
    playOut(g);
    assert.equal(g.status, "complete", `n=${n} should complete`);
    assert.ok(g.winner, `n=${n} winner set`);
    assert.equal(g.results.length, n);
    // results sorted by score descending
    for (let i = 1; i < g.results.length; i += 1) assert.ok(g.results[i - 1].score >= g.results[i].score);
    g.seat_order.forEach((m) => {
      assert.equal(g.players[m].round_scores.length, 3, `${m} played 3 rounds`);
      assert.equal(typeof g.players[m].ice_score, "number");
    });
    const byMark = potionLabScoreByMark(g);
    assert.equal(byMark[g.winner], Math.max(...Object.values(byMark)));
  }
});

test("bot levels store on seats and default to Buddy", () => {
  setPotionLabRandom(seeded(5));
  const g = newPotionLabGame();
  initPotionLabSeats(g, [human("P1", "Me"), leveledBot("P2", "Over", 4), bot("P3", "Def")]);
  assert.equal(g.players.P2.level, 4, "explicit level stored");
  assert.equal(g.players.P3.level, 2, "unspecified bot defaults to Buddy");
  assert.equal(g.players.P1.level, 0, "humans are level 0");
});

test("Overlord out-scores Sprout over many all-bot games", () => {
  let overlordWins = 0, games = 40;
  for (let s = 0; s < games; s += 1) {
    setPotionLabRandom(seeded(1000 + s));
    const g = newPotionLabGame();
    // seat an Overlord against three Sprouts
    initPotionLabSeats(g, [leveledBot("P1", "Overlord", 4), leveledBot("P2", "S", 1), leveledBot("P3", "S", 1), leveledBot("P4", "S", 1)]);
    if (g.winner === "P1") overlordWins += 1;
  }
  // random winner would be ~25%; a working ladder should clear well past half.
  assert.ok(overlordWins / games > 0.5, `Overlord won ${overlordWins}/${games} (expected > 50%)`);
});

test("all-bot table resolves straight through on init", () => {
  setPotionLabRandom(seeded(7));
  const g = newPotionLabGame();
  initPotionLabSeats(g, [bot("P1", "A"), bot("P2", "B"), bot("P3", "C")]);
  assert.equal(g.status, "complete");
  assert.equal(g.results.length, 3);
});

test("card scoring: fire triples next potion, sets, ladder", () => {
  const mk = (type, extra) => ({ id: "x" + Math.random(), type, ...(extra || {}) });
  // fire then a 3-potion = 9; frog x3 = 10; mushroom x2 = 5; herb x3 = 6
  const s = potionLabCardScore([
    mk("fire"), mk("potion", { val: 3 }),
    mk("frog"), mk("frog"), mk("frog"),
    mk("mushroom"), mk("mushroom"),
    mk("herb"), mk("herb"), mk("herb"),
  ]);
  assert.equal(s.potion, 9);
  assert.equal(s.frog, 10);
  assert.equal(s.mushroom, 5);
  assert.equal(s.herb, 6);
  // a lone fire and a second unboosted potion
  const s2 = potionLabCardScore([mk("fire"), mk("potion", { val: 2 }), mk("potion", { val: 2 })]);
  assert.equal(s2.potion, 8); // 6 + 2
});

test("moon dust majority 6/3 with ties, and ice most/least", () => {
  const seat = (icons, ice) => ({
    is_bot: false, collected: icons.map((n) => ({ id: "m" + Math.random(), type: "moondust", icons: n })), ice,
  });
  const game = {
    seat_order: ["P1", "P2", "P3"],
    players: { P1: seat([3], 3), P2: seat([1], 1), P3: seat([1, 1], 0) },
  };
  const moon = potionLabMoondustScores(game);
  assert.deepEqual(moon, [6, 0, 3]); // P1 most (3) -> 6; P3 second (2) -> 3; P2 (1) -> 0
  const ice = potionLabIceScores(game);
  assert.equal(ice[0], 6);  // most ice
  assert.equal(ice[2], -6); // least ice (3 players -> penalty applies)
});

test("sanitizer masks other hands but not my own; reveals at completion", () => {
  setPotionLabRandom(seeded(3));
  const g = newPotionLabGame();
  initPotionLabSeats(g, [human("P1", "Me"), human("P2", "You"), bot("P3", "Bot")]);
  const dict = potionLabGameToDict(g);
  assert.equal(dict.deck, undefined, "deck stripped for everyone");
  const view = potionLabGameToDictForViewer(dict, "P1", "playing");
  const me = view.players.find((p) => p.mark === "P1");
  const other = view.players.find((p) => p.mark === "P2");
  assert.ok(Array.isArray(me.hand) && me.hand.length > 0, "I see my hand");
  assert.equal(other.hand, null, "I do not see other hands");
  assert.equal(other.hand_count, g.players.P2.hand.length, "but I see the count");
  // reveal at room completion
  const revealed = potionLabGameToDictForViewer(dict, "P1", "completed");
  assert.ok(Array.isArray(revealed.players.find((p) => p.mark === "P2").hand));
});

test("stale/duplicate commits are ignored; wrong phase rejected", () => {
  setPotionLabRandom(seeded(11));
  const g = newPotionLabGame();
  initPotionLabSeats(g, [human("P1", "Me"), bot("P2", "Bot")]);
  const dict = potionLabGameToDict(g);
  const my = dict.players.find((p) => p.mark === "P1");
  const first = my.hand[0].id;
  const savedPick = g.pick;
  // stale round/pick stamp: ignored (no throw, no state change)
  makePotionLabMove(g, "P1", { type: "COMMIT_PICK", round: 99, pick: 99, cards: [first], useWizard: false });
  assert.equal(g.players.P1.committed, null);
  // a real commit advances the barrier (bot resolves) so pick changes
  makePotionLabMove(g, "P1", { type: "COMMIT_PICK", round: g.round, pick: g.pick, cards: [first], useWizard: false });
  assert.notEqual(g.pick + g.round * 100, savedPick, "barrier advanced");
  // READY_NEXT during playing is rejected
  assert.throws(() => makePotionLabMove(g, "P1", { type: "READY_NEXT", round: g.round }), /round summary/);
});
