import assert from "node:assert/strict";
import test from "node:test";
import {
  WNYK_GAME_ID, WNYK_HAND_SIZE, WNYK_SKIP_DELAY_MS, WNYK_WRITEIN_MAX_LENGTH,
  isWnykGame, newWnykGame, setWnykOptions, initWnykSeats, makeWnykMove,
  wnykGameToDict, wnykGameToDictForViewer, wnykScoreByMark,
  setWnykRandom, setWnykNow, setWnykDecks,
} from "../games/wnyk/rules.js";
import { wnykBotSubmission, wnykBotJudge } from "../games/wnyk/ai.js";
import { castSkipVote } from "../games/skip-vote.js";

const human = (mark, name) => ({ mark, name, kind: "human" });
const bot = (mark, name) => ({ mark, name, kind: "bot" });

// A rigged deck so tests never depend on real card text. With the constant
// 0.99 RNG below every Fisher–Yates shuffle is the identity (j === i for all
// i < 100), draws pop from the END of the built pile, and the 5% blank roll
// never fires (0.99 > 0.05). With the constant 0 RNG the FIRST draw by any
// blank-eligible human is a blank.
function riggedDecks({ whites = 60, blacks = 10, lastPick = 1 } = {}) {
  return {
    classic: {
      white: Array.from({ length: whites }, (_, i) => `White ${i}`),
      black: Array.from({ length: blacks }, (_, i) => ({
        text: `Prompt ${i} _`,
        pick: i === blacks - 1 ? lastPick : 1,
      })),
    },
    family: {
      white: Array.from({ length: whites }, (_, i) => `Fam ${i}`),
      black: Array.from({ length: blacks }, (_, i) => ({ text: `FamPrompt ${i} _`, pick: 1 })),
    },
  };
}

let now = 1_000_000;
function setup({ seats, decks = riggedDecks(), random = () => 0.99, customCards = [] } = {}) {
  now = 1_000_000;
  setWnykDecks(decks);
  setWnykRandom(random);
  setWnykNow(() => now);
  const g = newWnykGame(customCards);
  initWnykSeats(g, seats);
  return g;
}

function seeded(seed) {
  let s = seed >>> 0;
  setWnykRandom(() => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  });
}

function submitFirstCard(g, mark) {
  const index = g.players[mark].hand.findIndex((ref) => !ref.b);
  makeWnykMove(g, mark, { type: "submit", cards: [index] });
}

function submissionIdOf(g, mark) {
  const submission = g.submissions.find((entry) => entry.mark === mark);
  assert.ok(submission, `no submission from ${mark}`);
  return submission.id;
}

// Play a full pick-1 round to a chosen winner (all-human tables).
function playRound(g, winnerMark) {
  const judge = g.judge;
  g.seat_order.filter((mark) => mark !== judge && !g.players[mark].is_bot)
    .forEach((mark) => submitFirstCard(g, mark));
  assert.equal(g.phase, "judging");
  makeWnykMove(g, judge, { type: "promote", submission: submissionIdOf(g, winnerMark) });
  makeWnykMove(g, judge, { type: "confirm" });
  if (g.status === "playing") makeWnykMove(g, judge, { type: "next_round" });
}

test.afterEach(() => {
  setWnykRandom(Math.random);
  setWnykNow(null);
  setWnykDecks(null);
});

// ---- setup -------------------------------------------------------------------

test("setup: three seats deal 10 each, round 1, first seat judges", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  assert.equal(isWnykGame(g), true);
  assert.equal(g.round, 1);
  assert.equal(g.phase, "submitting");
  assert.equal(g.judge, "P1");
  assert.ok(g.black_card.text);
  g.seat_order.forEach((mark) => assert.equal(g.players[mark].hand.length, WNYK_HAND_SIZE));
  const dict = wnykGameToDict(g);
  assert.equal(dict.game_id, WNYK_GAME_ID);
  assert.equal(dict.players.length, 3);
  assert.equal(dict.players[0].is_judge, true);
  assert.equal(dict.submissions.length, 0);
});

test("setup: fewer than three seats is rejected", () => {
  setWnykDecks(riggedDecks());
  setWnykRandom(() => 0.99);
  const g = newWnykGame();
  assert.throws(() => initWnykSeats(g, [human("P1", "A"), human("P2", "B")]), /at least 3 players/);
});

// ---- options -----------------------------------------------------------------

test("options: target score clamps, deck selects, custom cards load and carry over", () => {
  setWnykDecks(riggedDecks());
  const g = newWnykGame();
  setWnykOptions(g, { target_score: 5, deck: "family" });
  assert.equal(g.options.target_score, 5);
  assert.equal(g.options.deck, "family");
  setWnykOptions(g, { target_score: 99 });
  assert.equal(g.options.target_score, 15);
  setWnykOptions(g, { target_score: 7, custom_cards: [{ text: "  spaced   out  ", author: "Ann" }, { text: "", author: "ghost" }] });
  assert.deepEqual(g.custom_pool, [{ text: "spaced out", author: "Ann", id: "" }]);
  // Reset carry-over pattern (the future handlers row): options + library re-apply.
  const g2 = newWnykGame();
  setWnykOptions(g2, { ...g.options, custom_cards: g.custom_pool });
  assert.deepEqual(g2.options, g.options);
  assert.deepEqual(g2.custom_pool, g.custom_pool);
});

// ---- round flow --------------------------------------------------------------

test("round: submissions collect hidden, reveal shuffles in, judge triages, winner scores", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  submitFirstCard(g, "P2");
  assert.equal(g.phase, "submitting");
  assert.equal(g.players.P2.submitted, true);
  assert.equal(g.players.P2.hand.length, WNYK_HAND_SIZE - 1);
  submitFirstCard(g, "P3");
  assert.equal(g.phase, "judging");
  assert.equal(g.submissions.length, 2);
  const p2Id = submissionIdOf(g, "P2");
  const p3Id = submissionIdOf(g, "P3");
  makeWnykMove(g, "P1", { type: "like", submission: p3Id });
  assert.equal(g.submissions.find((s) => s.id === p3Id).liked, true);
  makeWnykMove(g, "P1", { type: "unlike", submission: p3Id });
  assert.equal(g.submissions.find((s) => s.id === p3Id).liked, false);
  makeWnykMove(g, "P1", { type: "like", submission: p3Id });
  makeWnykMove(g, "P1", { type: "promote", submission: p2Id });
  assert.equal(g.final_pick, p2Id);
  makeWnykMove(g, "P1", { type: "confirm" });
  assert.equal(g.phase, "round_end");
  assert.equal(g.round_result.type, "win");
  assert.equal(g.round_result.winner, "P2");
  assert.equal(g.players.P2.score, 1);
  assert.equal(g.players.P3.score, 0);
  // Likes: P3 was liked; the winner P2 counts as liked implicitly.
  assert.equal(g.players.P2.likes, 1);
  assert.equal(g.players.P3.likes, 1);
  makeWnykMove(g, "P1", { type: "next_round" });
  assert.equal(g.round, 2);
  assert.equal(g.judge, "P2");
  g.seat_order.forEach((mark) => assert.equal(g.players[mark].hand.length, WNYK_HAND_SIZE));
});

test("round: pick-2 prompt takes two cards in order and refills both", () => {
  const g = setup({
    seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")],
    decks: riggedDecks({ lastPick: 2 }),
  });
  assert.equal(g.black_card.pick, 2);
  const first = g.players.P2.hand[3];
  const second = g.players.P2.hand[1];
  makeWnykMove(g, "P2", { type: "submit", cards: [3, 1] });
  const submission = g.submissions.find((entry) => entry.mark === "P2");
  assert.deepEqual(submission.cards, [first, second]);
  assert.equal(g.players.P2.hand.length, WNYK_HAND_SIZE - 2);
  assert.throws(() => makeWnykMove(g, "P3", { type: "submit", cards: [0] }), /exactly 2 different cards/);
  makeWnykMove(g, "P3", { type: "submit", cards: [0, 1] });
  makeWnykMove(g, "P1", { type: "promote", submission: submissionIdOf(g, "P2") });
  makeWnykMove(g, "P1", { type: "confirm" });
  makeWnykMove(g, "P1", { type: "next_round" });
  g.seat_order.forEach((mark) => assert.equal(g.players[mark].hand.length, WNYK_HAND_SIZE));
});

test("round: guards — judge cannot submit, no double submit, judge-only triage, promote before confirm", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal"), human("P4", "Dee")] });
  assert.throws(() => submitFirstCard(g, "P1"), /judge sits this one out/);
  submitFirstCard(g, "P2");
  assert.throws(() => submitFirstCard(g, "P2"), /already submitted/);
  assert.throws(() => makeWnykMove(g, "P2", { type: "next_round" }), /still being played/);
  submitFirstCard(g, "P3");
  submitFirstCard(g, "P4");
  assert.equal(g.phase, "judging");
  assert.throws(() => makeWnykMove(g, "P2", { type: "like", submission: 0 }), /Only the judge/);
  assert.throws(() => makeWnykMove(g, "P1", { type: "confirm" }), /Promote one submission/);
});

// ---- bots --------------------------------------------------------------------

test("bots: a bot submits automatically and a bot judge triages to a finished round", () => {
  const g = setup({ seats: [bot("B1", "Bot"), human("P2", "Ben"), human("P3", "Cal")] });
  // Judge is the bot (first seat): humans submit, bot triage resolves instantly.
  submitFirstCard(g, "P2");
  assert.equal(g.phase, "submitting");
  submitFirstCard(g, "P3");
  assert.equal(g.phase, "round_end");
  assert.equal(g.round_result.type, "win");
  assert.ok(["P2", "P3"].includes(g.round_result.winner));
  makeWnykMove(g, "P2", { type: "next_round" });
  // Judge is now P2: the bot's submission arrives without any human action.
  assert.equal(g.judge, "P2");
  assert.equal(g.players.B1.submitted, true);
});

test("bots: an all-bot table plays itself to completion with one winner and a Most Liked", () => {
  setWnykDecks(riggedDecks({ whites: 40, blacks: 6 }));
  seeded(12345);
  setWnykNow(() => 5000);
  const g = newWnykGame();
  initWnykSeats(g, [bot("B1", "One"), bot("B2", "Two"), bot("B3", "Three")]);
  assert.equal(g.status, "complete");
  assert.equal(g.players[g.winner].score, g.options.target_score);
  assert.ok(g.most_liked && g.most_liked.marks.length >= 1);
  assert.ok(g.most_liked.likes > 0);
  const scores = wnykScoreByMark(g);
  assert.equal(scores[g.winner], g.options.target_score);
  // Bots never receive blanks.
  g.seat_order.forEach((mark) => assert.equal(g.players[mark].blank_received, false));
});

// ---- blanks & write-ins ------------------------------------------------------

test("blanks: the lucky draw deals at most one blank per player per game", () => {
  const g = setup({
    seats: [human("P1", "Ann"), human("P2", "Ben"), bot("B1", "Bot")],
    random: () => 0, // every eligible draw fires the 5% roll
  });
  ["P1", "P2"].forEach((mark) => {
    const blanks = g.players[mark].hand.filter((ref) => ref.b);
    assert.equal(blanks.length, 1, `${mark} should hold exactly one blank`);
    assert.equal(g.players[mark].blank_received, true);
  });
  assert.equal(g.players.B1.hand.filter((ref) => ref.b).length, 0);
});

test("blanks: the third round win deals a blank on the next refill when luck never fired", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  playRound(g, "P2"); // round 1, judge P1 — P2 wins
  assert.equal(g.judge, "P2");
  playRound(g, "P1"); // round 2, judge P2 — P1 wins (1)
  playRound(g, "P1"); // round 3, judge P3 — P1 wins (2)
  playRound(g, "P2"); // round 4, judge P1 — P2 wins
  playRound(g, "P1"); // round 5, judge P2 — P1's THIRD win
  assert.equal(g.players.P1.score, 3);
  // The next_round refill inside playRound already dealt the earned blank.
  assert.equal(g.players.P1.blank_received, true);
  assert.equal(g.players.P1.hand.filter((ref) => ref.b).length, 1);
  assert.equal(g.players.P2.blank_received, false);
});

test("write-ins: blank plays with text, reveals with attribution, records a library card", () => {
  const g = setup({
    seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")],
    random: () => 0,
  });
  const blankIndex = g.players.P2.hand.findIndex((ref) => ref.b);
  assert.throws(() => makeWnykMove(g, "P2", { type: "submit", cards: [blankIndex] }), /write-in needs text/);
  assert.throws(
    () => makeWnykMove(g, "P2", { type: "submit", cards: [(blankIndex + 1) % WNYK_HAND_SIZE], writein: "sneaky" }),
    /needs your blank card/,
  );
  const longText = "x".repeat(120);
  makeWnykMove(g, "P2", { type: "submit", cards: [blankIndex], writein: longText });
  submitFirstCard(g, "P3");
  assert.equal(g.phase, "judging");
  const dict = wnykGameToDict(g);
  const writeinEntry = dict.submissions.find((entry) => entry.has_writein);
  assert.equal(writeinEntry.cards[0].text.length, WNYK_WRITEIN_MAX_LENGTH);
  assert.equal(writeinEntry.cards[0].author, "Ben");
  assert.equal(writeinEntry.cards[0].writein, true);
  // Judging: the write-in author masks for EVERY viewer, judge included.
  ["P1", "P2", "P3", null].forEach((viewer) => {
    const view = wnykGameToDictForViewer(wnykGameToDict(g), viewer, "active");
    const masked = view.submissions.find((entry) => entry.has_writein);
    assert.equal(masked.cards[0].author, null, `write-in author leaked to ${viewer}`);
    assert.equal(masked.mark, null);
  });
  const writeinId = submissionIdOf(g, "P2");
  makeWnykMove(g, "P1", { type: "promote", submission: writeinId });
  makeWnykMove(g, "P1", { type: "confirm" });
  assert.deepEqual(g.new_custom_cards, [{ text: "x".repeat(WNYK_WRITEIN_MAX_LENGTH), author: "Ben" }]);
  // Round end: the winner's mark and the write-in credit are public.
  const view = wnykGameToDictForViewer(wnykGameToDict(g), "P3", "active");
  const revealed = view.submissions.find((entry) => entry.has_writein);
  assert.equal(revealed.mark, "P2");
  assert.equal(revealed.cards[0].author, "Ben");
});

test("write-ins: a losing write-in still shows its credit at round end and still joins the library", () => {
  const g = setup({
    seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")],
    random: () => 0,
  });
  const blankIndex = g.players.P2.hand.findIndex((ref) => ref.b);
  makeWnykMove(g, "P2", { type: "submit", cards: [blankIndex], writein: "the loser" });
  submitFirstCard(g, "P3");
  makeWnykMove(g, "P1", { type: "promote", submission: submissionIdOf(g, "P3") });
  makeWnykMove(g, "P1", { type: "confirm" });
  assert.deepEqual(g.new_custom_cards, [{ text: "the loser", author: "Ben" }]);
  const view = wnykGameToDictForViewer(wnykGameToDict(g), "P1", "active");
  const losing = view.submissions.find((entry) => entry.has_writein);
  assert.equal(losing.mark, null, "losing submitter stays anonymous");
  assert.equal(losing.cards[0].author, "Ben", "write-in credit shows on reveal, win or lose");
});

// ---- custom library cards ----------------------------------------------------

test("custom cards: library cards merge into the deck and wear their author on the card face", () => {
  const g = setup({
    seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")],
    customCards: [{ text: "From the library", author: "Alice" }],
  });
  // Identity shuffle: the appended custom card is the first card dealt (to P1).
  const face = wnykGameToDict(g).players[0].hand[0];
  assert.deepEqual(face, { blank: false, text: "From the library", author: "Alice", writein: false });
  playRound(g, "P2"); // round 1 out of the way; judge is now P2
  makeWnykMove(g, "P1", { type: "submit", cards: [0] });
  submitFirstCard(g, "P3");
  // Library attribution is public card-face text even while marks are masked.
  const view = wnykGameToDictForViewer(wnykGameToDict(g), "P3", "active");
  const entry = view.submissions.find((s) => s.cards[0] && s.cards[0].text === "From the library");
  assert.ok(entry);
  assert.equal(entry.cards[0].author, "Alice");
  assert.equal(entry.mark, null);
  assert.equal(entry.cards[0].writein, false);
});

// ---- sanitizer ---------------------------------------------------------------

test("sanitizer: hands, submissions, and authorship mask per phase for every viewer", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  submitFirstCard(g, "P2");

  // Submitting: own hand only; own submission only; submitted flags public.
  let view = wnykGameToDictForViewer(wnykGameToDict(g), "P3", "active");
  assert.ok(view.players.find((seat) => seat.mark === "P3").hand.every((card) => card && card.text));
  assert.ok(view.players.find((seat) => seat.mark === "P2").hand.every((card) => card === null));
  assert.equal(view.players.find((seat) => seat.mark === "P2").submitted, true);
  assert.equal(view.submissions.length, 0, "someone else's submission leaked while submitting");
  view = wnykGameToDictForViewer(wnykGameToDict(g), "P2", "active");
  assert.equal(view.submissions.length, 1);
  assert.equal(view.submissions[0].mark, "P2");
  assert.ok(view.submissions[0].cards[0].text);
  // The judge sees no submission contents while submitting.
  view = wnykGameToDictForViewer(wnykGameToDict(g), "P1", "active");
  assert.equal(view.submissions.length, 0, "the judge saw a submission before the reveal");

  submitFirstCard(g, "P3");
  assert.equal(g.phase, "judging");
  // Judging: texts public, every mark masked (judge included), draw piles absent.
  ["P1", "P2", "P3", null].forEach((viewer) => {
    const projected = wnykGameToDictForViewer(wnykGameToDict(g), viewer, "active");
    assert.equal(projected.submissions.length, 2);
    projected.submissions.forEach((entry) => {
      assert.equal(entry.mark, null, `submitter mark leaked to ${viewer}`);
      entry.cards.forEach((card) => assert.ok(card.text));
    });
    assert.equal(projected.draw_pile, undefined);
    assert.equal(projected.black_pile, undefined);
    assert.equal(projected.custom_pool, undefined);
  });

  const winnerId = submissionIdOf(g, "P3");
  makeWnykMove(g, "P1", { type: "like", submission: winnerId });
  makeWnykMove(g, "P1", { type: "promote", submission: winnerId });
  makeWnykMove(g, "P1", { type: "confirm" });
  // Round end: winner revealed, loser still anonymous.
  view = wnykGameToDictForViewer(wnykGameToDict(g), "P2", "active");
  assert.equal(view.submissions.find((entry) => entry.id === winnerId).mark, "P3");
  assert.equal(view.submissions.find((entry) => entry.id !== winnerId).mark, null);

  // Game end: full reveal.
  g.players.P3.score = g.options.target_score;
  g.status = "complete";
  g.winner = "P3";
  view = wnykGameToDictForViewer(wnykGameToDict(g), "P2", "completed");
  view.submissions.forEach((entry) => assert.ok(entry.mark));
  view.players.forEach((seat) => assert.ok(seat.hand.every((card) => card && (card.text || card.blank))));
});

test("sanitizer: triage state (likes, final pick, tally) is public during judging", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  submitFirstCard(g, "P2");
  submitFirstCard(g, "P3");
  const id = submissionIdOf(g, "P2");
  makeWnykMove(g, "P1", { type: "like", submission: id });
  makeWnykMove(g, "P1", { type: "promote", submission: id });
  const view = wnykGameToDictForViewer(wnykGameToDict(g), "P3", "active");
  assert.equal(view.submissions.find((entry) => entry.id === id).liked, true);
  assert.equal(view.final_pick, id);
});

// ---- skip votes --------------------------------------------------------------

test("skip votes: gated two minutes, 2/3 of other humans, a skipped submitter misses the round", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal"), human("P4", "Dee")] });
  submitFirstCard(g, "P2");
  submitFirstCard(g, "P3");
  assert.throws(() => makeWnykMove(g, "P2", { type: "skip_vote", target: "P4" }), /after two minutes/);
  now += WNYK_SKIP_DELAY_MS;
  assert.throws(() => makeWnykMove(g, "P2", { type: "skip_vote", target: "P2" }), /cannot be skipped/);
  makeWnykMove(g, "P2", { type: "skip_vote", target: "P4" });
  assert.equal(g.phase, "submitting", "one vote of three eligible must not skip");
  assert.deepEqual(g.skip_votes.P4, ["P2"]);
  // Retract, then two of three (ceil(3 × 2/3) = 2) execute the skip.
  makeWnykMove(g, "P2", { type: "skip_vote", target: "P4" });
  assert.equal(g.skip_votes.P4, undefined);
  makeWnykMove(g, "P2", { type: "skip_vote", target: "P4" });
  makeWnykMove(g, "P1", { type: "skip_vote", target: "P4" });
  assert.equal(g.players.P4.skipped, true);
  assert.equal(g.phase, "judging");
  assert.equal(g.submissions.length, 2);
  makeWnykMove(g, "P1", { type: "promote", submission: submissionIdOf(g, "P2") });
  makeWnykMove(g, "P1", { type: "confirm" });
  assert.equal(g.players.P4.score, 0);
  makeWnykMove(g, "P1", { type: "next_round" });
  assert.equal(g.players.P4.skipped, false, "a skip lasts one round");
});

test("skip votes: a skipped judge discards the prompt but liked authors keep their likes", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal"), human("P4", "Dee")] });
  submitFirstCard(g, "P2");
  submitFirstCard(g, "P3");
  submitFirstCard(g, "P4");
  assert.equal(g.phase, "judging");
  const likedId = submissionIdOf(g, "P3");
  makeWnykMove(g, "P1", { type: "like", submission: likedId });
  now += WNYK_SKIP_DELAY_MS;
  makeWnykMove(g, "P2", { type: "skip_vote", target: "P1" });
  makeWnykMove(g, "P3", { type: "skip_vote", target: "P1" });
  assert.equal(g.phase, "round_end");
  assert.equal(g.round_result.type, "judge_skipped");
  assert.equal(g.players.P3.likes, 1, "likes given before the skip still count");
  g.seat_order.forEach((mark) => assert.equal(g.players[mark].score, 0, "no point on a skipped round"));
  makeWnykMove(g, "P2", { type: "next_round" });
  assert.equal(g.judge, "P2");
});

test("skip votes: bots are never targets and never voters", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal"), bot("B1", "Bot")] });
  // The bot submitted instantly; only humans can stall.
  assert.equal(g.players.B1.submitted, true);
  now += WNYK_SKIP_DELAY_MS;
  assert.throws(() => makeWnykMove(g, "P2", { type: "skip_vote", target: "B1" }), /cannot be skipped/);
  // Eligible voters for P3 are the other humans only: ceil(2 × 2/3) = 2.
  makeWnykMove(g, "P1", { type: "skip_vote", target: "P3" });
  assert.equal(g.players.P3.skipped, false);
  makeWnykMove(g, "P2", { type: "skip_vote", target: "P3" });
  assert.equal(g.players.P3.skipped, true);
});

test("skip-vote protocol: injected threshold passes at the majority; default stays unanimous", () => {
  let result = castSkipVote({}, "P1", "T", ["P1", "P2", "P3"]);
  assert.equal(result.passed, false);
  result = castSkipVote(result.votes, "P2", "T", ["P1", "P2", "P3"]);
  assert.equal(result.unanimous, false);
  assert.equal(result.passed, false, "default threshold is unanimous");
  result = castSkipVote(result.votes, "P3", "T", ["P1", "P2", "P3"]);
  assert.equal(result.passed, true);
  result = castSkipVote({}, "P1", "T", ["P1", "P2", "P3"], 2 / 3);
  assert.equal(result.passed, false);
  result = castSkipVote(result.votes, "P2", "T", ["P1", "P2", "P3"], 2 / 3);
  assert.equal(result.passed, true, "2 of 3 meets the 2/3 threshold");
  assert.equal(result.unanimous, false);
});

// ---- winning -----------------------------------------------------------------

// Like `playRound`, but the judge also Likes one losing submission first.
function playRoundWithLike(g, winnerMark, likedMark) {
  const judge = g.judge;
  g.seat_order.filter((mark) => mark !== judge && !g.players[mark].is_bot)
    .forEach((mark) => submitFirstCard(g, mark));
  if (likedMark) makeWnykMove(g, judge, { type: "like", submission: submissionIdOf(g, likedMark) });
  makeWnykMove(g, judge, { type: "promote", submission: submissionIdOf(g, winnerMark) });
  makeWnykMove(g, judge, { type: "confirm" });
  if (g.status === "playing") makeWnykMove(g, judge, { type: "next_round" });
}

test("winning: first to the target takes the game; Most Liked is the second podium", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  setWnykOptions(g, { target_score: 3 });
  playRound(g, "P2");                 // r1, judge P1 → P2 wins (like 1)
  playRound(g, "P1");                 // r2, judge P2 → P1 wins (like 1)
  playRound(g, "P2");                 // r3, judge P3 → P2 wins (like 2)
  playRoundWithLike(g, "P2", "P3");   // r4, judge P1 → P2's third win ends it
  assert.equal(g.status, "complete");
  assert.equal(g.winner, "P2");
  assert.throws(() => makeWnykMove(g, "P1", { type: "next_round" }), /complete/);
  // Likes: P2 three implicit winner likes; P1 one; P3 one explicit.
  assert.equal(g.players.P2.likes, 3);
  assert.equal(g.players.P1.likes, 1);
  assert.equal(g.players.P3.likes, 1);
  assert.deepEqual(g.most_liked, { likes: 3, marks: ["P2"] });
});

test("winning: Most Liked ties share the title", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  setWnykOptions(g, { target_score: 3 });
  playRoundWithLike(g, "P2", "P3");   // r1, judge P1: P2 +1 (win), P3 +1 (liked)
  playRound(g, "P3");                 // r2, judge P2: P3 +1 (win)
  playRound(g, "P2");                 // r3, judge P3: P2 +1 (win)
  playRoundWithLike(g, "P2", "P3");   // r4, judge P1: P2 +1 (third win, ends), P3 +1
  assert.equal(g.status, "complete");
  assert.equal(g.winner, "P2");
  assert.equal(g.players.P2.likes, 3);
  assert.equal(g.players.P3.likes, 3);
  assert.deepEqual(g.most_liked, { likes: 3, marks: ["P2", "P3"] });
});

// ---- card rating (spec 5b) ---------------------------------------------------

test("rating: up, switch, retract — one standing vote, anonymous aggregate", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  const key = `classic:${g.players.P2.hand[0].i}`;
  makeWnykMove(g, "P2", { type: "rate", card: key, vote: "up" });
  assert.equal(g.players.P2.ratings[key], "up");
  assert.deepEqual(g.new_card_ratings, [{ card: key, up: 1, down: 0 }]);
  makeWnykMove(g, "P2", { type: "rate", card: key, vote: "down" }); // switch
  assert.deepEqual(g.new_card_ratings, [{ card: key, up: 0, down: 1 }]);
  makeWnykMove(g, "P2", { type: "rate", card: key, vote: "down" }); // retract
  assert.equal(g.players.P2.ratings[key], undefined);
  assert.deepEqual(g.new_card_ratings, []);
  // Rating never leaks into the public move stream.
  assert.notEqual(g.last_move.type, "rate");
  assert.ok(g.events.every((event) => event.type !== "rate"));
});

test("rating: aggregate spans players and sorts by key", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  const p2Key = `classic:${g.players.P2.hand[0].i}`;
  const p3Key = `classic:${g.players.P3.hand[0].i}`;
  makeWnykMove(g, "P2", { type: "rate", card: p2Key, vote: "up" });
  makeWnykMove(g, "P3", { type: "rate", card: p3Key, vote: "down" });
  const sorted = [
    { card: p2Key, up: 1, down: 0 },
    { card: p3Key, up: 0, down: 1 },
  ].sort((a, b) => (a.card < b.card ? -1 : 1));
  assert.deepEqual(g.new_card_ratings, sorted);
});

test("rating: hand-only — but retract/switch survives the card leaving the hand", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  // Not in P2's hand (identity shuffle: low indexes stay in the pile).
  assert.throws(() => makeWnykMove(g, "P2", { type: "rate", card: "classic:0", vote: "down" }), /own hand/);
  assert.throws(() => makeWnykMove(g, "P2", { type: "rate", card: "", vote: "up" }), /own hand/);
  assert.throws(() => makeWnykMove(g, "P2", { type: "rate", card: "classic:0" }), /"up" or "down"/);
  const key = `classic:${g.players.P2.hand[0].i}`;
  makeWnykMove(g, "P2", { type: "rate", card: key, vote: "up" });
  makeWnykMove(g, "P2", { type: "submit", cards: [0] }); // the rated card leaves the hand
  assert.ok(!g.players.P2.hand.some((ref) => `classic:${ref.i}` === key));
  makeWnykMove(g, "P2", { type: "rate", card: key, vote: "down" }); // switch still legal
  assert.equal(g.players.P2.ratings[key], "down");
  makeWnykMove(g, "P2", { type: "rate", card: key, vote: "down" }); // retract still legal
  assert.equal(g.players.P2.ratings[key], undefined);
  // But a never-rated card outside the hand still refuses.
  assert.throws(() => makeWnykMove(g, "P2", { type: "rate", card: "classic:1", vote: "up" }), /own hand/);
});

test("rating: bots never rate; blanks carry no rate key", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), bot("B1", "Bot")] });
  assert.throws(() => makeWnykMove(g, "B1", { type: "rate", card: "classic:1", vote: "up" }), /Bot seats/);
  // Force-blank draw: constant-0 RNG blanks the first human draw.
  const blanked = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")], random: () => 0 });
  const dict = wnykGameToDict(blanked);
  const p1 = dict.players.find((seat) => seat.mark === "P1");
  const blankAt = blanked.players.P1.hand.findIndex((ref) => ref.b);
  assert.ok(blankAt >= 0);
  assert.equal(p1.hand_rate_keys[blankAt], null);
});

test("rating: custom library cards rate as custom:<id>", () => {
  const g = setup({
    seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")],
    customCards: [{ text: "Zing", author: "Ann", id: "lib1" }],
  });
  // Identity shuffle puts the custom ref at the pile top — P1 drew it first.
  const holder = g.seat_order.find((mark) => g.players[mark].hand.some((ref) => ref.c !== undefined));
  assert.ok(holder, "custom card was dealt");
  makeWnykMove(g, holder, { type: "rate", card: "custom:lib1", vote: "down" });
  assert.deepEqual(g.new_card_ratings, [{ card: "custom:lib1", up: 0, down: 1 }]);
});

test("rating: projections keep votes private to their seat, reveal included", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  const key = `classic:${g.players.P2.hand[0].i}`;
  makeWnykMove(g, "P2", { type: "rate", card: key, vote: "up" });
  const dict = wnykGameToDict(g);
  const own = wnykGameToDictForViewer(dict, "P2", "playing");
  assert.deepEqual(own.players.find((seat) => seat.mark === "P2").ratings, { [key]: "up" });
  const other = wnykGameToDictForViewer(dict, "P3", "playing");
  const p2ForOther = other.players.find((seat) => seat.mark === "P2");
  assert.ok(!("ratings" in p2ForOther));
  assert.ok(!("hand_rate_keys" in p2ForOther));
  // Full reveal opens hands but never the private votes or their hand keys.
  const revealed = wnykGameToDictForViewer(dict, "P3", "completed");
  const p2Revealed = revealed.players.find((seat) => seat.mark === "P2");
  assert.ok(p2Revealed.hand.every((card) => card && card.text));
  assert.ok(!("ratings" in p2Revealed));
  assert.ok(!("hand_rate_keys" in p2Revealed));
});

test("removed cards: excluded from piles and hands, standard and custom", () => {
  setWnykDecks(riggedDecks());
  setWnykRandom(() => 0.99);
  setWnykNow(() => now);
  const g = newWnykGame(
    [{ text: "Zing", author: "Ann", id: "lib1" }],
    ["classic:59", "custom:lib1"],
  );
  initWnykSeats(g, [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")]);
  const everywhere = [
    ...g.draw_pile,
    ...g.seat_order.flatMap((mark) => g.players[mark].hand),
  ];
  assert.ok(everywhere.every((ref) => ref.i !== 59));
  assert.ok(everywhere.every((ref) => ref.c === undefined));
  // The options seam carries the list too (reset carry-over path).
  const g2 = newWnykGame();
  setWnykOptions(g2, { removed_cards: ["classic:2", "classic:2", "", 42] });
  assert.deepEqual(g2.removed_cards, ["classic:2", "42"]);
});

test("removed cards: curating away the whole deck falls back rather than wedging", () => {
  setWnykDecks(riggedDecks({ whites: 5 }));
  setWnykRandom(() => 0.99);
  setWnykNow(() => now);
  const g = newWnykGame([], [0, 1, 2, 3, 4].map((i) => `classic:${i}`));
  initWnykSeats(g, [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")]);
  g.seat_order.forEach((mark) => assert.equal(g.players[mark].hand.length, WNYK_HAND_SIZE));
});
