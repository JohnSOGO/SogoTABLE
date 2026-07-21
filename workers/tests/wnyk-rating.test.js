import assert from "node:assert/strict";
import test from "node:test";
import {
  WNYK_HAND_SIZE, newWnykGame, setWnykOptions, initWnykSeats, makeWnykMove,
  wnykGameToDict, wnykGameToDictForViewer, setWnykRandom, setWnykNow, setWnykDecks,
} from "../games/wnyk/rules.js";
import {
  human, bot, riggedDecks, clock, setup, resetWnykSeams,
  submitFirstCard, submissionIdOf, readAloud, playRound, ratingOf,
} from "./wnyk-fixtures.js";

test.afterEach(resetWnykSeams);

// ---- card rating (spec 5b, revised: 👎-only dump-and-replace) -----------------

test("rating: a downvote IS a dump — replaced in-slot, logged, once per round", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  const before = g.players.P2.hand.map((ref) => ref.i);
  const drawBefore = g.draw_pile.length;
  const key = `classic:${before[4]}`;
  makeWnykMove(g, "P2", { type: "rate", card: key });
  // normalizeWnykGame rebuilds seat objects on every move — always re-read.
  const seat = g.players.P2;
  assert.equal(seat.hand.length, WNYK_HAND_SIZE);
  assert.notEqual(seat.hand[4].i, before[4]); // replaced in the same slot
  assert.ok(!seat.hand.some((ref) => `classic:${ref.i}` === key)); // dumped card gone
  assert.equal(seat.dump_used, true);
  assert.equal(seat.ratings[key], "down");
  assert.equal(g.draw_pile.length, drawBefore - 1);
  assert.deepEqual(ratingOf(g, key), { card: key, down: 1, dealt: 1, played: 0 });
  // Replacement counts as dealt.
  assert.deepEqual(ratingOf(g, `classic:${seat.hand[4].i}`), { card: `classic:${seat.hand[4].i}`, down: 0, dealt: 1, played: 0 });
  // Untouched slots keep their cards.
  before.forEach((i, idx) => { if (idx !== 4) assert.equal(seat.hand[idx].i, i); });
  // One downvote per round — the second is rejected outright, nothing changes.
  const key2 = `classic:${seat.hand[0].i}`;
  assert.throws(() => makeWnykMove(g, "P2", { type: "rate", card: key2 }), /spent until the next round/);
  assert.equal(seat.hand[0].i, before[0]);
  assert.equal(g.draw_pile.length, drawBefore - 1);
  assert.equal(seat.ratings[key2], undefined);
  // Rating never leaks into the public move stream.
  assert.notEqual(g.last_move.type, "rate");
  assert.ok(g.events.every((event) => event.type !== "rate"));
});

test("rating: down-only and hand-only — no upvotes, no votes on unheld cards", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  const key = `classic:${g.players.P2.hand[0].i}`;
  assert.throws(() => makeWnykMove(g, "P2", { type: "rate", card: key, vote: "up" }), /thumbs-down only/);
  // Not in P2's hand (identity shuffle: low indexes stay in the pile).
  assert.throws(() => makeWnykMove(g, "P2", { type: "rate", card: "classic:0" }), /own hand/);
  assert.throws(() => makeWnykMove(g, "P2", { type: "rate", card: "" }), /own hand/);
  // A card that left the hand can no longer be downvoted.
  makeWnykMove(g, "P2", { type: "submit", cards: [0] });
  assert.throws(() => makeWnykMove(g, "P2", { type: "rate", card: key }), /own hand/);
  assert.equal(g.players.P2.dump_used, false); // nothing was spent by the rejections
});

test("rating: dump cap resets next round; re-drawn card recounts once per player", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  const key = `classic:${g.players.P2.hand[0].i}`;
  makeWnykMove(g, "P2", { type: "rate", card: key });
  assert.equal(g.players.P2.dump_used, true);
  playRound(g, "P2"); // round advances → cap resets for everyone
  assert.equal(g.round, 2);
  g.seat_order.forEach((mark) => assert.equal(g.players[mark].dump_used, false));
  // Restored-state scenario: the dumped card cycled back into P2's hand (pile
  // rebuild can legitimately re-deal it). A second downvote by the SAME player
  // still dumps but keeps ONE counted vote for that card.
  g.players.P2.hand[0] = { i: Number(key.split(":")[1]) };
  makeWnykMove(g, "P2", { type: "rate", card: key });
  assert.equal(g.players.P2.dump_used, true);
  assert.equal(ratingOf(g, key).down, 1); // not double-counted
  // A DIFFERENT player downvoting the same card is a legitimate second vote.
  const p3 = g.players.P3;
  p3.hand[0] = { i: Number(key.split(":")[1]) };
  makeWnykMove(g, "P3", { type: "rate", card: key });
  assert.equal(ratingOf(g, key).down, 2);
});

test("rating: dump is allowed while waiting in the judging phase", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  submitFirstCard(g, "P2");
  submitFirstCard(g, "P3");
  assert.equal(g.phase, "judging");
  const key = `classic:${g.players.P2.hand[3].i}`;
  makeWnykMove(g, "P2", { type: "rate", card: key });
  assert.equal(g.players.P2.hand.length, WNYK_HAND_SIZE - 1); // 9 held after submitting 1
  assert.ok(!g.players.P2.hand.some((ref) => `classic:${ref.i}` === key));
});

test("rating: replacement draw can grant the blank; removed cards never come back", () => {
  // Removed "classic:29" would otherwise be the first replacement drawn.
  setWnykDecks(riggedDecks());
  setWnykRandom(() => 0.99);
  setWnykNow(() => clock.now);
  const g = newWnykGame([], ["classic:29"]);
  initWnykSeats(g, [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")]);
  const key = `classic:${g.players.P2.hand[0].i}`;
  makeWnykMove(g, "P2", { type: "rate", card: key });
  assert.equal(g.players.P2.hand[0].i, 28); // 29 skipped at pile build
  // Blank grant on a dump replacement: constant-0 RNG blanks the next draw.
  const g2 = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  setWnykRandom(() => 0);
  const key2 = `classic:${g2.players.P2.hand[0].i}`;
  makeWnykMove(g2, "P2", { type: "rate", card: key2 });
  assert.deepEqual(g2.players.P2.hand[0], { b: 1 });
  assert.equal(g2.players.P2.blank_received, true);
  assert.equal(wnykGameToDict(g2).players.find((seat) => seat.mark === "P2").hand_rate_keys[0], null);
});

test("rating: bots never rate; blanks carry no rate key", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), bot("B1", "Bot")] });
  assert.throws(() => makeWnykMove(g, "B1", { type: "rate", card: "classic:1" }), /Bot seats/);
  // Force-blank draw: constant-0 RNG blanks the first human draw.
  const blanked = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")], random: () => 0 });
  const dict = wnykGameToDict(blanked);
  const p1 = dict.players.find((seat) => seat.mark === "P1");
  const blankAt = blanked.players.P1.hand.findIndex((ref) => ref.b);
  assert.ok(blankAt >= 0);
  assert.equal(p1.hand_rate_keys[blankAt], null);
});

test("rating: custom library cards downvote (and dump) as custom:<id>", () => {
  const g = setup({
    seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")],
    customCards: [{ text: "Zing", author: "Ann", id: "lib1" }],
  });
  const holder = g.seat_order.find((mark) => g.players[mark].hand.some((ref) => ref.c !== undefined));
  assert.ok(holder, "custom card was dealt");
  makeWnykMove(g, holder, { type: "rate", card: "custom:lib1" });
  assert.deepEqual(ratingOf(g, "custom:lib1"), { card: "custom:lib1", down: 1, dealt: 1, played: 0 });
  assert.ok(!g.players[holder].hand.some((ref) => ref.c !== undefined)); // dumped
});

test("passive counts: dealt on every human draw, played on submit, bots excluded", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), bot("B1", "Bot")] });
  // Humans P1+P2 hold 20 cards; the bot's 10 are not counted. (The black
  // prompt also counts one dealt under its ":b:" namespace — excluded here.)
  const whiteEntries = g.new_card_ratings.filter((entry) => !entry.card.includes(":b:"));
  const dealtEntries = whiteEntries.filter((entry) => entry.dealt > 0);
  assert.equal(dealtEntries.length, WNYK_HAND_SIZE * 2);
  assert.ok(g.new_card_ratings.every((entry) => entry.dealt === 1 && entry.played === 0 && entry.down === 0));
  const botKeys = g.players.B1.hand.map((ref) => `classic:${ref.i}`);
  botKeys.forEach((key) => assert.equal(ratingOf(g, key), null));
  // The bot has already auto-submitted (judge is P1) — its play is not counted.
  const played = () => g.new_card_ratings.filter((entry) => entry.played > 0);
  assert.equal(played().length, 0);
  // A human play counts — including a card sitting in hand across the deal
  // (dealt stays 1, played becomes 1).
  const p2Key = `classic:${g.players.P2.hand[0].i}`;
  makeWnykMove(g, "P2", { type: "submit", cards: [0] });
  assert.deepEqual(ratingOf(g, p2Key), { card: p2Key, down: 0, dealt: 1, played: 1 });
  assert.equal(played().length, 1);
});

test("passive counts: pick-2 counts both plays; refills count as fresh deals", () => {
  const g = setup({
    seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")],
    decks: riggedDecks({ blacks: 1, lastPick: 2 }),
  });
  assert.equal(g.black_card.pick, 2);
  const keys = [0, 1].map((index) => `classic:${g.players.P2.hand[index].i}`);
  makeWnykMove(g, "P2", { type: "submit", cards: [0, 1] });
  keys.forEach((key) => assert.deepEqual(ratingOf(g, key), { card: key, down: 0, dealt: 1, played: 1 }));
  makeWnykMove(g, "P3", { type: "submit", cards: [0, 1] });
  readAloud(g);
  makeWnykMove(g, "P1", { type: "promote", submission: submissionIdOf(g, "P2") });
  makeWnykMove(g, "P1", { type: "confirm" });
  makeWnykMove(g, "P1", { type: "next_round" });
  // Refill dealt two fresh cards per submitter, counted once each.
  const refilled = `classic:${g.players.P2.hand[WNYK_HAND_SIZE - 1].i}`;
  assert.deepEqual(ratingOf(g, refilled), { card: refilled, down: 0, dealt: 1, played: 0 });
});

test("rating: projections keep votes and dump state private to their seat, reveal included", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  const key = `classic:${g.players.P2.hand[0].i}`;
  makeWnykMove(g, "P2", { type: "rate", card: key });
  const dict = wnykGameToDict(g);
  const own = wnykGameToDictForViewer(dict, "P2", "playing");
  const p2Own = own.players.find((seat) => seat.mark === "P2");
  assert.deepEqual(p2Own.ratings, { [key]: "down" });
  assert.equal(p2Own.dump_used, true);
  const other = wnykGameToDictForViewer(dict, "P3", "playing");
  const p2ForOther = other.players.find((seat) => seat.mark === "P2");
  assert.ok(!("ratings" in p2ForOther));
  assert.ok(!("hand_rate_keys" in p2ForOther));
  assert.ok(!("dump_used" in p2ForOther));
  // The public aggregate stays anonymous {card, down, dealt, played}.
  assert.ok(other.new_card_ratings.every((entry) =>
    ["card", "down", "dealt", "played"].every((field) => field in entry)));
  // Full reveal opens hands but never the private votes, hand keys, or dump state.
  const revealed = wnykGameToDictForViewer(dict, "P3", "completed");
  const p2Revealed = revealed.players.find((seat) => seat.mark === "P2");
  assert.ok(p2Revealed.hand.every((card) => card && card.text));
  assert.ok(!("ratings" in p2Revealed));
  assert.ok(!("hand_rate_keys" in p2Revealed));
  assert.ok(!("dump_used" in p2Revealed));
});

test("removed cards: excluded from piles and hands, standard and custom", () => {
  setWnykDecks(riggedDecks());
  setWnykRandom(() => 0.99);
  setWnykNow(() => clock.now);
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
  setWnykNow(() => clock.now);
  const g = newWnykGame([], [0, 1, 2, 3, 4].map((i) => `classic:${i}`));
  initWnykSeats(g, [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")]);
  g.seat_order.forEach((mark) => assert.equal(g.players[mark].hand.length, WNYK_HAND_SIZE));
});
