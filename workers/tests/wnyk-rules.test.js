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
import {
  human, bot, riggedDecks, clock, setup, seeded, resetWnykSeams, releasePrompt,
  submitFirstCard, submissionIdOf, readAloud, playRound, playRoundWithLike,
} from "./wnyk-fixtures.js";

test.afterEach(resetWnykSeams);

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
  readAloud(g);
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
  readAloud(g);
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
  readAloud(g);
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
  // Judge is now P2 and must release the new prompt; the bot holds with the
  // humans through the grace and submits on the first post-grace human move.
  assert.equal(g.judge, "P2");
  assert.equal(g.phase, "prompt");
  releasePrompt(g);
  assert.equal(g.players.B1.submitted, false, "bots hold through the release grace");
  submitFirstCard(g, "P3");
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
  readAloud(g);
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
  readAloud(g);
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
  assert.deepEqual(face, { blank: false, text: "From the library", author: "Alice", writein: false, pack: "House Deck" });
  playRound(g, "P2"); // round 1 out of the way; judge is now P2
  releasePrompt(g);
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

// ---- pack provenance ---------------------------------------------------------

test("pack labels: every projected card face names its source pack", () => {
  // Classic game: deck faces read Base Set, the library custom card House Deck.
  const g = setup({
    seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")],
    customCards: [{ text: "From the library", author: "Alice" }],
  });
  const dict = wnykGameToDict(g);
  assert.equal(dict.black_card.pack, "Base Set");
  assert.equal(dict.players[0].hand[0].pack, "House Deck"); // identity shuffle: custom card dealt first
  dict.players[0].hand.slice(1).forEach((face) => assert.equal(face.pack, "Base Set"));

  // Blanks in hand and submitted write-ins are house cards too.
  const g2 = setup({
    seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")],
    random: () => 0,
  });
  const dict2 = wnykGameToDict(g2);
  const blankFace = dict2.players.flatMap((seat) => seat.hand).find((face) => face.blank);
  assert.equal(blankFace.pack, "House Deck");
  const blankIndex = g2.players.P2.hand.findIndex((ref) => ref.b);
  makeWnykMove(g2, "P2", { type: "submit", cards: [blankIndex], writein: "house card" });
  const writeinFace = wnykGameToDict(g2).submissions.find((entry) => entry.has_writein).cards[0];
  assert.equal(writeinFace.pack, "House Deck");

  // Family game: the mixed rigged deck surfaces both CAH and SOGO Kids labels,
  // and the labels ride the viewer projection untouched.
  setWnykDecks(riggedDecks());
  setWnykRandom(() => 0.99);
  setWnykNow(() => clock.now);
  const g3 = newWnykGame();
  setWnykOptions(g3, { deck: "family" });
  initWnykSeats(g3, [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")]);
  const dict3 = wnykGameToDict(g3);
  assert.equal(dict3.black_card.pack, "Family Edition");
  const packs = new Set(dict3.players.flatMap((seat) => seat.hand).map((face) => face.pack));
  assert.deepEqual([...packs].sort(), ["Family Edition", "SOGO Kids"]);
  const ownView = wnykGameToDictForViewer(dict3, "P1", "active");
  const ownPacks = new Set(ownView.players.find((seat) => seat.mark === "P1").hand.map((face) => face.pack));
  assert.deepEqual([...ownPacks].sort(), ["Family Edition", "SOGO Kids"]);
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
  readAloud(g);
  // Triage (stage 2): texts public, every mark masked (judge included), draw piles absent.
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
  readAloud(g);
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
  clock.now += WNYK_SKIP_DELAY_MS;
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
  readAloud(g);
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
  readAloud(g);
  const likedId = submissionIdOf(g, "P3");
  makeWnykMove(g, "P1", { type: "like", submission: likedId });
  clock.now += WNYK_SKIP_DELAY_MS;
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
  // The first post-grace human move brings the bot in; only humans can stall.
  submitFirstCard(g, "P2");
  assert.equal(g.players.B1.submitted, true);
  clock.now += WNYK_SKIP_DELAY_MS;
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
