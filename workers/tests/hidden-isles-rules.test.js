import assert from "node:assert/strict";
import test from "node:test";
import {
  newHiddenIslesGame, initHiddenIslesSeats, makeHiddenIslesMove, hiddenIslesGameToDict, hiddenIslesGameToDictForViewer,
  setHiddenIslesRandom, setHiddenIslesClock, setHiddenIslesOptions, carryHiddenIslesOnReset, NUDGE_AFTER_MS,
} from "../games/hidden-isles/rules.js";
import { normalizeClue, clueProblem, association } from "../games/hidden-isles/clues.js";
import { chooseClue, chooseGuess, rankClues } from "../games/hidden-isles/ai.js";
import { WORDS } from "../games/hidden-isles/words.js";
import { TAG_ALIASES } from "../games/hidden-isles/aliases.js";

function seeded(seed = 7) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let now = 1_000_000;
function setup({ humans = 4, bots = 0, seed = 7, options } = {}) {
  setHiddenIslesRandom(seeded(seed));
  now = 1_000_000;
  setHiddenIslesClock(() => now);
  const game = newHiddenIslesGame();
  if (options) setHiddenIslesOptions(game, { hidden_isles_options: options });
  const seats = [];
  for (let i = 0; i < humans + bots; i += 1) {
    seats.push({ mark: `P${i + 1}`, kind: i < humans ? "human" : "bot", bot_level: 3 });
  }
  initHiddenIslesSeats(game, seats);
  return game;
}

const guideOf = (game, team) => game.seat_order.find((m) => game.players[m].team === team && game.players[m].role === "guide");
const guesserOf = (game, team) => game.seat_order.find((m) => game.players[m].team === team && game.players[m].role !== "guide");
const hiddenOfKey = (game, key) => game.board.find((t) => !t.revealed && t.key === key);
// A clue that's legal on this board (doesn't touch any face-down word).
function legalClue(game) {
  const words = game.board.filter((t) => !t.revealed).map((t) => t.word);
  return ["zyx", "qwerty", "plonk", "vroom", "zing"].find((w) => !clueProblem(w, words));
}
function giveClue(game, count = 2, extra = {}) {
  const team = game.turn_team;
  makeHiddenIslesMove(game, guideOf(game, team), { type: "CLUE", turn: game.turn, word: legalClue(game), count, ...extra });
}

test("word list: shape, sizes and tag hygiene", () => {
  const words = WORDS.map((w) => w.word);
  assert.ok(words.length >= 300, `${words.length} words`);
  assert.equal(new Set(words).size, words.length, "duplicate words");
  assert.ok(WORDS.filter((w) => w.easy).length >= 120, "easy pack too small");
  WORDS.forEach((w) => {
    assert.match(w.word, /^[a-z]{3,10}$/);
    assert.ok(w.tags.length >= 2, `${w.word} needs tags`);
  });
  const tags = new Set(WORDS.flatMap((w) => w.tags));
  tags.forEach((tag) => assert.equal(clueProblem(tag, words), null, `tag "${tag}" collides with a board word`));
  Object.values(TAG_ALIASES).flat().forEach((t) => assert.ok(tags.has(t), `alias target ${t} is not a tag`));
});

test("seats: needs four, alternating crews, one Navigator each", () => {
  assert.throws(() => setup({ humans: 3 }), /at least 4 seats/);
  const game = setup({ humans: 5 });
  assert.equal(game.phase, "setup");
  assert.deepEqual(game.seat_order.map((m) => game.players[m].team), ["A", "B", "A", "B", "A"]);
  assert.equal(guideOf(game, "A"), "P1");
  assert.equal(guideOf(game, "B"), "P2");
  assert.equal(hiddenIslesGameToDict(game).can_deal, true);
});

test("setup: switching crews keeps exactly one Navigator and blocks a lopsided deal", () => {
  const game = setup({ humans: 4 });
  makeHiddenIslesMove(game, "P2", { type: "JOIN_TEAM", team: "A" });
  assert.equal(game.players.P4.role, "guide", "B gets a new Navigator");
  const dict = hiddenIslesGameToDict(game);
  assert.equal(dict.can_deal, false);
  assert.throws(() => makeHiddenIslesMove(game, "P1", { type: "DEAL" }), /at least 2 members/);
  makeHiddenIslesMove(game, "P3", { type: "JOIN_TEAM", team: "B" });
  makeHiddenIslesMove(game, "P3", { type: "BE_GUIDE" });
  assert.equal(game.players.P3.role, "guide");
  assert.equal(game.players.P4.role, "guesser");
  makeHiddenIslesMove(game, "P1", { type: "DEAL" });
  assert.equal(game.phase, "clue");
});

test("deal: 9/8/7/1 chart, start crew holds nine", () => {
  const game = setup();
  makeHiddenIslesMove(game, "P1", { type: "DEAL" });
  const count = (k) => game.board.filter((t) => t.key === k).length;
  assert.equal(game.board.length, 25);
  assert.equal(new Set(game.board.map((t) => t.word)).size, 25);
  assert.equal(count(game.start_team), 9);
  assert.equal(count(game.start_team === "A" ? "B" : "A"), 8);
  assert.equal(count("neutral"), 7);
  assert.equal(count("trap"), 1);
  assert.equal(game.turn_team, game.start_team);
});

test("projection: crew sees no face-down keys; Navigators see the chart", () => {
  const game = setup();
  makeHiddenIslesMove(game, "P1", { type: "DEAL" });
  const dict = hiddenIslesGameToDict(game);
  const crewView = hiddenIslesGameToDictForViewer(dict, "P3");
  assert.ok(crewView.board.every((t) => t.key === null));
  assert.equal(crewView.you.role, "guesser");
  const navView = hiddenIslesGameToDictForViewer(dict, "P1");
  assert.ok(navView.board.every((t) => t.key));
  const spectator = hiddenIslesGameToDictForViewer(dict, "");
  assert.equal(spectator.you, null);
  assert.ok(spectator.board.every((t) => t.key === null));
});

test("clue rules: one word, no board words, number range", () => {
  assert.throws(() => normalizeClue("two words"), /one word/);
  assert.throws(() => normalizeClue("x1"), /letters/);
  assert.equal(normalizeClue("  Ocean "), "ocean");
  assert.equal(clueProblem("apples", ["apple"]), "apple");
  assert.equal(clueProblem("starfish", ["star"]), "star");
  assert.equal(clueProblem("ocean", ["apple"]), null);
  const game = setup();
  makeHiddenIslesMove(game, "P1", { type: "DEAL" });
  const team = game.turn_team;
  const guide = guideOf(game, team);
  const onBoard = game.board[0].word;
  assert.throws(() => makeHiddenIslesMove(game, guide, { type: "CLUE", turn: 1, word: onBoard, count: 1 }), /too close/);
  assert.throws(() => makeHiddenIslesMove(game, guide, { type: "CLUE", turn: 1, word: legalClue(game), count: "x" }), /number/);
  assert.throws(() => makeHiddenIslesMove(game, guesserOf(game, team), { type: "CLUE", turn: 1, word: "zyx", count: 1 }), /Navigator/);
  giveClue(game, 2);
  assert.equal(game.phase, "guess");
  assert.equal(game.guesses_left, 3);
});

test("guessing: own island continues, sandbar ends the turn, duplicate tap is idempotent", () => {
  const game = setup();
  makeHiddenIslesMove(game, "P1", { type: "DEAL" });
  const team = game.turn_team;
  giveClue(game, 2);
  const g = guesserOf(game, team);
  assert.throws(() => makeHiddenIslesMove(game, guideOf(game, team), { type: "GUESS", turn: 1, index: 0 }), /Navigators can't guess/);
  assert.throws(() => makeHiddenIslesMove(game, g, { type: "PASS", turn: 1 }), /at least one guess/);
  const own = hiddenOfKey(game, team);
  makeHiddenIslesMove(game, g, { type: "GUESS", turn: 1, index: own.index });
  assert.equal(game.turn_team, team);
  assert.equal(game.guesses_left, 2);
  const before = JSON.stringify(game.board);
  makeHiddenIslesMove(game, g, { type: "GUESS", turn: 1, index: own.index }); // crew mate double tap
  assert.equal(JSON.stringify(game.board), before);
  const sand = hiddenOfKey(game, "neutral");
  makeHiddenIslesMove(game, g, { type: "GUESS", turn: 1, index: sand.index });
  assert.equal(game.turn_team, team === "A" ? "B" : "A");
  assert.equal(game.turn, 2);
  assert.equal(game.phase, "clue");
  assert.deepEqual(game.events.at(-1), { seq: game.event_seq, type: "turn", team: game.turn_team, ended: team, reason: "sandbar" });
  assert.throws(() => makeHiddenIslesMove(game, g, { type: "GUESS", turn: 1, index: 3 }), /Refresh to catch up/);
});

test("guess limit: N+1 then the turn passes; rival island scores for them", () => {
  const game = setup();
  makeHiddenIslesMove(game, "P1", { type: "DEAL" });
  const team = game.turn_team;
  const rival = team === "A" ? "B" : "A";
  giveClue(game, 1);
  const g = guesserOf(game, team);
  makeHiddenIslesMove(game, g, { type: "GUESS", turn: 1, index: hiddenOfKey(game, team).index });
  makeHiddenIslesMove(game, g, { type: "GUESS", turn: 1, index: hiddenOfKey(game, team).index });
  assert.equal(game.turn_team, rival);
  assert.equal(game.events.at(-1).reason, "out_of_guesses");
  const before = game.remaining[team];
  giveClue(game, 3);
  makeHiddenIslesMove(game, guesserOf(game, rival), { type: "GUESS", turn: 2, index: hiddenOfKey(game, team).index });
  assert.equal(game.remaining[team], before - 1);
  assert.equal(game.turn_team, team);
});

test("the Kraken ends the game for the crew that finds it; chart revealed to all", () => {
  const game = setup();
  makeHiddenIslesMove(game, "P1", { type: "DEAL" });
  const team = game.turn_team;
  giveClue(game, 2);
  makeHiddenIslesMove(game, guesserOf(game, team), { type: "GUESS", turn: 1, index: hiddenOfKey(game, "trap").index });
  assert.equal(game.status, "complete");
  assert.equal(game.end_reason, "kraken");
  assert.equal(game.winner_team, team === "A" ? "B" : "A");
  assert.equal(game.winner, guideOf(game, game.winner_team));
  const view = hiddenIslesGameToDictForViewer(hiddenIslesGameToDict(game), guesserOf(game, team));
  assert.ok(view.board.every((t) => t.key));
  assert.throws(() => makeHiddenIslesMove(game, "P1", { type: "PASS", turn: 1 }), /already over/);
});

test("finding every island wins, unlimited clue never runs out", () => {
  const game = setup();
  makeHiddenIslesMove(game, "P1", { type: "DEAL" });
  const team = game.turn_team;
  giveClue(game, 0, { unlimited: true });
  assert.equal(game.guesses_left, null);
  const g = guesserOf(game, team);
  while (game.status === "playing") makeHiddenIslesMove(game, g, { type: "GUESS", turn: 1, index: hiddenOfKey(game, team).index });
  assert.equal(game.winner_team, team);
  assert.equal(game.end_reason, "found_all");
});

test("crew pointers toggle and move, one per player", () => {
  const game = setup({ humans: 6 });
  makeHiddenIslesMove(game, "P1", { type: "DEAL" });
  giveClue(game, 2);
  const g = guesserOf(game, game.turn_team);
  makeHiddenIslesMove(game, g, { type: "MARK", turn: 1, index: 4 });
  assert.deepEqual(game.marks, { 4: [g] });
  makeHiddenIslesMove(game, g, { type: "MARK", turn: 1, index: 6 });
  assert.deepEqual(game.marks, { 6: [g] });
  makeHiddenIslesMove(game, g, { type: "MARK", turn: 1, index: 6 });
  assert.deepEqual(game.marks, {});
});

test("bots: a bot Navigator clues on BOT_TICK after its think time", () => {
  // Humans P1..P3 + bot P4; make the bot the Navigator of crew B.
  const game = setup({ humans: 3, bots: 1 });
  assert.equal(game.players.P4.team, "B");
  makeHiddenIslesMove(game, "P2", { type: "JOIN_TEAM", team: "A" });
  makeHiddenIslesMove(game, "P3", { type: "JOIN_TEAM", team: "B" });
  assert.equal(game.players.P4.role === "guide" || game.players.P3.role === "guide", true);
  if (game.players.P4.role !== "guide") {
    // force the bot to navigate: humans can only make themselves Navigator,
    // so move P3 to A and back after the bot took the role.
    makeHiddenIslesMove(game, "P3", { type: "JOIN_TEAM", team: "A" });
    makeHiddenIslesMove(game, "P2", { type: "JOIN_TEAM", team: "B" });
  }
  assert.equal(game.players.P4.role, "guide");
  makeHiddenIslesMove(game, "P1", { type: "DEAL" });
  // Play crew A's turn out to give B the clue phase if needed.
  if (game.turn_team === "A") {
    giveClue(game, 1);
    makeHiddenIslesMove(game, guesserOf(game, "A"), { type: "GUESS", turn: game.turn, index: hiddenOfKey(game, "neutral").index });
  }
  assert.equal(game.turn_team, "B");
  assert.ok(game.players.P4.act_at > now);
  assert.throws(() => makeHiddenIslesMove(game, "P1", { type: "BOT_TICK", turn: game.turn }), /No bot is ready/);
  now = game.players.P4.act_at;
  makeHiddenIslesMove(game, "P1", { type: "BOT_TICK", turn: game.turn });
  assert.equal(game.phase, "guess");
  assert.equal(game.clue.by, "P4");
  assert.equal(game.players.P4.act_at, 0);
});

test("an all-bot table plays to the end on its own", () => {
  for (let seed = 1; seed <= 12; seed += 1) {
    const game = setup({ humans: 0, bots: 4, seed });
    assert.equal(game.status, "complete", `seed ${seed}`);
    assert.ok(["A", "B"].includes(game.winner_team));
  }
});

test("bots: clues avoid the Kraken and strong bots target only their islands", () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const game = setup({ seed });
    makeHiddenIslesMove(game, "P1", { type: "DEAL" });
    const team = game.turn_team;
    rankClues(game.board, team, {}).forEach((c) => {
      c.targets.forEach((i) => assert.equal(game.board[i].key, team));
    });
    const clue = chooseClue(game.board, team, 4, seeded(seed));
    const hits = game.board.filter((t) => association(clue.word, t.word) === 2);
    assert.ok(!hits.some((t) => t.key === "trap"), `seed ${seed}: ${clue.word} points at the Kraken`);
    const guess = chooseGuess(game.board, { clue: { ...clue }, guesses_made: 0 }, 4, seeded(seed));
    assert.ok(Number.isInteger(guess.index));
  }
});

test("nudge: after 90 s anyone can let a bot cover an away Navigator", () => {
  const game = setup();
  makeHiddenIslesMove(game, "P1", { type: "DEAL" });
  const team = game.turn_team;
  const outsider = guesserOf(game, team === "A" ? "B" : "A");
  assert.throws(() => makeHiddenIslesMove(game, outsider, { type: "NUDGE", turn: 1 }), /90 seconds/);
  now += NUDGE_AFTER_MS;
  makeHiddenIslesMove(game, outsider, { type: "NUDGE", turn: 1 });
  assert.equal(game.phase, "guess");
  assert.equal(game.clue.by, guideOf(game, team));
});

test("rematch keeps crews and rotates the Navigator", () => {
  const game = setup({ humans: 6, options: { pack: "easy", clue_ideas: true } });
  makeHiddenIslesMove(game, "P1", { type: "DEAL" });
  const next = newHiddenIslesGame();
  carryHiddenIslesOnReset(game, next);
  initHiddenIslesSeats(next, game.seat_order.map((mark) => ({ mark, kind: "human" })));
  assert.equal(next.options.pack, "easy");
  assert.equal(next.options.clue_ideas, true);
  assert.equal(next.players.P3.role, "guide");
  assert.equal(next.players.P4.role, "guide");
  game.seat_order.forEach((m) => assert.equal(next.players[m].team, game.players[m].team));
});

test("clue ideas reach only the active Navigator when the option is on", () => {
  const game = setup({ options: { clue_ideas: true } });
  makeHiddenIslesMove(game, "P1", { type: "DEAL" });
  const dict = hiddenIslesGameToDict(game);
  const nav = guideOf(game, game.turn_team);
  const otherNav = guideOf(game, game.turn_team === "A" ? "B" : "A");
  assert.ok(Array.isArray(hiddenIslesGameToDictForViewer(dict, nav).clue_ideas));
  assert.equal(hiddenIslesGameToDictForViewer(dict, otherNav).clue_ideas, undefined);
  assert.equal(hiddenIslesGameToDictForViewer(dict, "P3").clue_ideas, undefined);
});

test("normalize survives garbage state", () => {
  const game = { game_id: "aa6b6dee04ef", phase: "guess", board: "nope", players: null, seat_order: 5 };
  const dict = hiddenIslesGameToDict(game);
  assert.equal(dict.phase, "setup");
  assert.deepEqual(dict.board, []);
});
