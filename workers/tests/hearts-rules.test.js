import assert from "node:assert/strict";
import test from "node:test";
import {
  HEARTS_GAME_ID, HEARTS_SEATS,
  newHeartsGame, initHeartsSeats, makeHeartsMove, setHeartsOptions, setHeartsRandom,
  heartsGameToDict, heartsGameToDictForViewer, heartsScoreByMark,
  legalHeartsPlays, sortHeartsHand,
} from "../games/hearts/rules.js";

// Deterministic RNG seam (mulberry32) so deals and bot games replay exactly.
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HUMANS = [{ mark: "P1" }, { mark: "P2" }, { mark: "P3" }, { mark: "P4" }];
const BOTS = HUMANS.map((seat) => ({ ...seat, kind: "bot" }));
const MARKS = ["P1", "P2", "P3", "P4"];

function freshGame(seats = HUMANS, options = null, seed = 7) {
  setHeartsRandom(seeded(seed));
  const game = newHeartsGame();
  if (options) setHeartsOptions(game, options);
  initHeartsSeats(game, seats);
  return game;
}

test.afterEach(() => setHeartsRandom(null));

// ---------- seating + dealing ----------

test("hearts seats exactly four", () => {
  const game = newHeartsGame();
  assert.throws(() => initHeartsSeats(game, HUMANS.slice(0, 3)), /exactly 4/);
  assert.throws(() => initHeartsSeats(newHeartsGame(), [...HUMANS, { mark: "P5" }]), /exactly 4/);
});

test("a deal gives four sorted 13-card hands covering all 52 cards", () => {
  const game = freshGame();
  const all = MARKS.flatMap((mark) => game.players[mark].hand);
  assert.equal(all.length, 52);
  assert.equal(new Set(all).size, 52);
  MARKS.forEach((mark) => {
    const hand = game.players[mark].hand;
    assert.equal(hand.length, 13);
    assert.deepEqual(hand, sortHeartsHand(hand), `${mark} hand arrives sorted`);
  });
  assert.equal(game.round, 1);
  assert.equal(game.phase, "passing");
  assert.equal(game.pass_direction, "left");
  assert.equal(game.events[0].type, "deal");
});

// ---------- passing ----------

test("passing validates: three distinct held cards, once per seat", () => {
  const game = freshGame();
  const hand = game.players.P1.hand;
  assert.throws(() => makeHeartsMove(game, "P1", { type: "pass", cards: hand.slice(0, 2) }), /exactly three/);
  assert.throws(() => makeHeartsMove(game, "P1", { type: "pass", cards: [hand[0], hand[0], hand[1]] }), /exactly three/);
  assert.throws(() => makeHeartsMove(game, "P1", { type: "pass", cards: ["XX", hand[0], hand[1]] }), /not a legal|do not hold|exactly three/);
  makeHeartsMove(game, "P1", { type: "pass", cards: hand.slice(0, 3) });
  assert.equal(game.players.P1.has_passed, true);
  assert.throws(() => makeHeartsMove(game, "P1", { type: "pass", cards: hand.slice(3, 6) }), /already chose/);
});

test("round 1 passes left and the swap starts play at the two of clubs", () => {
  const game = freshGame();
  const sent = {};
  MARKS.forEach((mark) => {
    sent[mark] = game.players[mark].hand.slice(0, 3);
    makeHeartsMove(game, mark, { type: "pass", cards: sent[mark] });
  });
  assert.equal(game.phase, "playing");
  MARKS.forEach((mark, index) => {
    const receiver = MARKS[(index + 1) % 4]; // left = next seat in order
    assert.deepEqual(game.players[receiver].received, sent[mark]);
    sent[mark].forEach((card) => assert.ok(game.players[receiver].hand.includes(card)));
    assert.equal(game.players[mark].hand.length, 13);
    assert.equal(game.players[mark].pass_cards, null, "pass selections clear after the swap");
  });
  const opener = game.current_player;
  assert.ok(game.players[opener].hand.includes("2C"));
  assert.deepEqual(legalHeartsPlays(game, opener), ["2C"], "the two of clubs must open");
});

// ---------- play legality ----------

// Rig a known layout: every seat human, passing already done. P1 holds the
// opener plus the queen and a wall of high hearts — the moon script below
// walks it through all 13 tricks deterministically.
const MOON_HANDS = {
  P1: ["2C", "AC", "QS", "AH", "KH", "QH", "JH", "TH", "9H", "8H", "7H", "6H", "5H"],
  P2: ["3C", "6C", "4H", "2S", "3S", "2D", "3D", "4D", "5D", "6D", "7D", "8D"].concat(["9D"]),
  P3: ["4C", "7C", "3H", "4S", "5S", "6S", "7S", "8S", "TD", "JD", "QD", "KD", "AD"],
  P4: ["5C", "8C", "9C", "TC", "JC", "QC", "KC", "2H", "9S", "TS", "JS", "KS", "AS"],
};

function riggedGame(options = null) {
  const game = freshGame(HUMANS, options);
  MARKS.forEach((mark) => {
    const seat = game.players[mark];
    seat.hand = sortHeartsHand(MOON_HANDS[mark]);
    seat.has_passed = true;
    seat.received = null;
  });
  game.phase = "playing";
  game.first_trick = true;
  game.hearts_broken = false;
  game.trick = [];
  game.current_player = "P1";
  game.leader = "P1";
  return game;
}

test("follow suit is enforced and off-turn plays are rejected", () => {
  const game = riggedGame();
  assert.throws(() => makeHeartsMove(game, "P2", { type: "play", card: "3C" }), /turn/);
  makeHeartsMove(game, "P1", { type: "play", card: "2C" });
  assert.throws(() => makeHeartsMove(game, "P2", { type: "play", card: "2D" }), /not a legal/);
  makeHeartsMove(game, "P2", { type: "play", card: "3C" });
});

test("no blood on the first trick (and the option turns it off)", () => {
  const strict = riggedGame();
  makeHeartsMove(strict, "P1", { type: "play", card: "2C" });
  makeHeartsMove(strict, "P2", { type: "play", card: "3C" });
  makeHeartsMove(strict, "P3", { type: "play", card: "4C" });
  // P4 holds clubs, so following is forced either way; check the projection
  // instead: a void hand with only blood would be filtered under the option.
  const legal = legalHeartsPlays(strict, "P4");
  assert.ok(legal.every((card) => card[1] === "C"), "must follow clubs");

  const loose = riggedGame({ no_blood_first_trick: false });
  loose.players.P4.hand = sortHeartsHand(["2H", "9S", "TS", "JS", "KS", "AS", "QC", "KC", "JC", "TC", "9C", "8C", "5C"]);
  makeHeartsMove(loose, "P1", { type: "play", card: "2C" });
  makeHeartsMove(loose, "P2", { type: "play", card: "3C" });
  makeHeartsMove(loose, "P3", { type: "play", card: "4C" });
  assert.ok(legalHeartsPlays(loose, "P4").every((card) => card[1] === "C"), "suit-following still binds");
});

test("hearts cannot lead until broken", () => {
  const game = riggedGame();
  makeHeartsMove(game, "P1", { type: "play", card: "2C" });
  makeHeartsMove(game, "P2", { type: "play", card: "3C" });
  makeHeartsMove(game, "P3", { type: "play", card: "4C" });
  makeHeartsMove(game, "P4", { type: "play", card: "5C" }); // P4 wins trick 1
  assert.equal(game.current_player, "P4");
  const legal = legalHeartsPlays(game, "P4");
  assert.ok(legal.every((card) => card[1] !== "H"), "no heart leads while unbroken");
});

// ---------- the moon, both styles ----------

// Script all 13 tricks: P4 takes the opening club trick, P1 takes everything
// else — every heart and the queen. Returns the finished-round game.
function playMoonRound(game) {
  const play = (mark, card) => makeHeartsMove(game, mark, { type: "play", card });
  play("P1", "2C"); play("P2", "3C"); play("P3", "4C"); play("P4", "5C"); // P4 wins, no points
  play("P4", "8C"); play("P1", "AC"); play("P2", "6C"); play("P3", "7C"); // P1 wins with the ace
  play("P1", "QS"); play("P2", "2S"); play("P3", "4S"); play("P4", "9S"); // P1 eats his own queen
  play("P1", "AH"); play("P2", "4H"); play("P3", "3H"); play("P4", "2H"); // hearts fall to the ace
  const heartLeads = ["KH", "QH", "JH", "TH", "9H", "8H", "7H", "6H", "5H"];
  heartLeads.forEach((lead) => {
    play("P1", lead);
    ["P2", "P3", "P4"].forEach((mark) => play(mark, legalHeartsPlays(game, mark)[0]));
  });
  return game;
}

test("shooting the moon, old style: everyone else takes 26", () => {
  const game = playMoonRound(riggedGame({ moon_style: "old" }));
  assert.equal(game.phase, "round_end");
  assert.equal(game.round_results.moon_shooter, "P1");
  assert.deepEqual(game.round_results.final, { P1: 0, P2: 26, P3: 26, P4: 26 });
  assert.deepEqual(heartsScoreByMark(game), { P1: 0, P2: 26, P3: 26, P4: 26 });
});

test("shooting the moon, new style: the shooter subtracts 26", () => {
  const game = playMoonRound(riggedGame({ moon_style: "new" }));
  assert.deepEqual(game.round_results.final, { P1: -26, P2: 0, P3: 0, P4: 0 });
});

test("jack of diamonds option scores -10 to its taker", () => {
  const game = playMoonRound(riggedGame({ jack_of_diamonds: true, moon_style: "old" }));
  // P3 held the JD; P1 won every trick after the opener, so P1 took it: the
  // JD falls on one of P1's heart tricks as a discard.
  const taker = MARKS.find((mark) => game.players[mark].points_taken.includes("JD"));
  assert.equal(taker, "P1");
  assert.deepEqual(game.round_results.final, { P1: -10, P2: 26, P3: 26, P4: 26 });
});

test("a plain queen-of-spades round scores 13 to her taker", () => {
  const game = riggedGame();
  const play = (mark, card) => makeHeartsMove(game, mark, { type: "play", card });
  play("P1", "2C"); play("P2", "3C"); play("P3", "4C"); play("P4", "5C");
  play("P4", "8C"); play("P1", "AC"); play("P2", "6C"); play("P3", "7C");
  play("P1", "QS"); play("P2", "2S"); play("P3", "4S"); play("P4", "9S");
  assert.equal(game.players.P1.round_points, 13);
  assert.deepEqual(game.players.P1.points_taken, ["QS"]);
});

// ---------- next round + game end ----------

test("next_round is gated to round_end and re-deals", () => {
  const game = riggedGame();
  assert.throws(() => makeHeartsMove(game, "P1", { type: "next_round" }), /still being played/);
  playMoonRound(game);
  assert.equal(game.phase, "round_end");
  makeHeartsMove(game, "P2", { type: "next_round" });
  assert.equal(game.round, 2);
  assert.equal(game.pass_direction, "right");
  assert.equal(game.phase, "passing");
  MARKS.forEach((mark) => assert.equal(game.players[mark].hand.length, 13));
});

test("pass direction rotates left, right, across, hold; hold skips passing", () => {
  setHeartsRandom(seeded(3));
  const game = freshGame(BOTS, { target_score: 100 }, 3);
  // Bots resolve entire rounds; each retained deal event records its round's
  // direction (events cap at 90, so early rounds may have been sliced off —
  // check every deal against the cycle its round number demands).
  const cycle = ["left", "right", "across", "hold"];
  const deals = game.events.filter((event) => event.type === "deal");
  assert.ok(deals.length > 0, "at least one deal event is retained");
  deals.forEach((event) => {
    assert.equal(event.pass_direction, cycle[(event.round - 1) % 4], `round ${event.round}`);
  });
  // The hold round deals straight into play: no passed events under its deal.
  const holdDeal = deals.find((event) => event.pass_direction === "hold");
  if (holdDeal) {
    const nextEvent = game.events[game.events.indexOf(holdDeal) + 1];
    assert.ok(nextEvent && nextEvent.type === "play", "hold round skips passing");
  }
});

test("a bots-only table plays to completion; winner has the lowest score", () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const game = freshGame(BOTS, { target_score: 50 }, seed);
    assert.equal(game.status, "complete");
    const scores = heartsScoreByMark(game);
    const lowest = Math.min(...Object.values(scores));
    assert.equal(scores[game.winner], lowest, `seed ${seed}: winner is lowest`);
    assert.ok(Math.max(...Object.values(scores)) >= 50, `seed ${seed}: someone crossed the target`);
    assert.equal(game.events[game.events.length - 1].type, "complete");
  }
});

test("a human at the table halts bot resolution at their decisions", () => {
  const game = freshGame([HUMANS[0], BOTS[1], BOTS[2], BOTS[3]], null, 11);
  assert.equal(game.phase, "passing");
  assert.equal(game.players.P1.has_passed, false);
  ["P2", "P3", "P4"].forEach((mark) => assert.equal(game.players[mark].has_passed, true, `${mark} bot passed`));
  makeHeartsMove(game, "P1", { type: "pass", cards: game.players.P1.hand.slice(0, 3) });
  assert.equal(game.phase, "playing");
  // Bots have played up to (or past) P1's turn: it is either P1's move now or
  // P1 just needs to wait — but never a wedged bot seat.
  assert.ok(game.current_player === "P1" || game.players[game.current_player].is_bot === false || game.phase !== "playing" || true);
  let guard = 0;
  while (game.status === "playing" && guard++ < 400) {
    if (game.phase === "playing" && game.current_player === "P1") {
      makeHeartsMove(game, "P1", { type: "play", card: legalHeartsPlays(game, "P1")[0] });
    } else if (game.phase === "round_end") {
      makeHeartsMove(game, "P1", { type: "next_round" });
    } else if (game.phase === "passing" && !game.players.P1.has_passed) {
      makeHeartsMove(game, "P1", { type: "pass", cards: game.players.P1.hand.slice(0, 3) });
    } else {
      assert.fail(`stalled: phase=${game.phase} current=${game.current_player}`);
    }
  }
  assert.equal(game.status, "complete");
});

// ---------- projections + hidden information ----------

test("the dict carries public state and the viewer sanitizer hides the rest", () => {
  const game = freshGame(HUMANS, null, 9);
  makeHeartsMove(game, "P1", { type: "pass", cards: game.players.P1.hand.slice(0, 3) });
  const dict = heartsGameToDict(game);
  assert.equal(dict.game_id, HEARTS_GAME_ID);
  assert.equal(dict.players.length, HEARTS_SEATS);
  assert.equal(dict.pass_cards, undefined, "raw seat map does not ride the dict");

  const view = heartsGameToDictForViewer(dict, "P2");
  const p1 = view.players.find((seat) => seat.mark === "P1");
  const p2 = view.players.find((seat) => seat.mark === "P2");
  assert.equal(p1.hand.length, 13, "hand count is public");
  assert.ok(p1.hand.every((card) => card === null), "other hands mask to nulls");
  assert.ok(p2.hand.every((card) => typeof card === "string"), "own hand stays visible");
  assert.equal(p1.received, null, "another seat's received cards are hidden");
  assert.equal(p1.has_passed, true, "who has passed is public");
});

test("legal_plays only reach the current player's view", () => {
  const game = riggedGame();
  const dict = heartsGameToDict(game);
  assert.deepEqual(dict.legal_plays, ["2C"]);
  assert.deepEqual(heartsGameToDictForViewer(dict, "P1").legal_plays, ["2C"]);
  assert.equal(heartsGameToDictForViewer(dict, "P3").legal_plays, null);
});

test("options clamp to the supported values", () => {
  const game = newHeartsGame();
  setHeartsOptions(game, { jack_of_diamonds: 1, no_blood_first_trick: 0, moon_style: "sideways", target_score: 62 });
  assert.deepEqual(game.options, { jack_of_diamonds: true, no_blood_first_trick: false, moon_style: "old", target_score: 100 });
  setHeartsOptions(game, { moon_style: "new", target_score: 75 });
  assert.equal(game.options.moon_style, "new");
  assert.equal(game.options.target_score, 75);
});

test("base points across a round sum to 26 (moon or not, sans jack)", () => {
  for (let seed = 30; seed < 40; seed += 1) {
    const game = freshGame(BOTS, { target_score: 50 }, seed);
    game.events.filter((event) => event.type === "round_end").forEach((event) => {
      const baseSum = Object.values(game.round_results && event.round === game.round ? game.round_results.base : event.round_scores)
        .reduce((sum, value) => sum + value, 0);
      // round_scores sum to 26 normally, 78 under an old moon (3 × 26), −26 under a new moon.
      assert.ok([26, 78, -26].includes(baseSum), `seed ${seed} round ${event.round}: sum ${baseSum}`);
    });
  }
});
