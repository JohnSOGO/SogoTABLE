import assert from "node:assert/strict";
import test from "node:test";
import {
  WNYK_SKIP_DELAY_MS, WNYK_SUBMIT_GRACE_MS, WNYK_BLACK_SWAPS_PER_ROUND,
  makeWnykMove, wnykGameToDict, wnykGameToDictForViewer, newWnykGame, initWnykSeats,
  setWnykRandom, setWnykNow, setWnykDecks,
} from "../games/wnyk/rules.js";
import {
  human, bot, riggedDecks, clock, setup, seeded, resetWnykSeams, releasePrompt,
  submitFirstCard, readAloud, ratingOf,
} from "./wnyk-fixtures.js";

test.afterEach(resetWnykSeams);

// ---- two-stage judging (spec 6: read-aloud, then triage) ---------------------

test("read-aloud: cards reveal one at a time to everyone; stage-1 rules hold", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal"), human("P4", "Dee")] });
  submitFirstCard(g, "P2");
  submitFirstCard(g, "P3");
  submitFirstCard(g, "P4");
  assert.equal(g.phase, "judging");
  assert.equal(g.reveal_cursor, 0);
  // Masking at cursor 0: the current card is public, later ones are hidden
  // from EVERY viewer — the judge included — with the count intact.
  ["P1", "P2", "P3", null].forEach((viewer) => {
    const view = wnykGameToDictForViewer(wnykGameToDict(g), viewer, "active");
    assert.equal(view.submissions.length, 3, "count stays visible");
    view.submissions.forEach((entry) => {
      if (entry.id <= view.reveal_cursor) {
        entry.cards.forEach((card) => assert.ok(card.text, "current card is public"));
      } else {
        entry.cards.forEach((card) => assert.equal(card, null, `unread card leaked to ${viewer}`));
        assert.equal(entry.has_writein, false);
        assert.equal(entry.liked, false);
      }
    });
  });
  // Only the judge drives; hearts hit the card being read; nothing else runs.
  assert.throws(() => makeWnykMove(g, "P2", { type: "next" }), /Only the judge/);
  assert.throws(() => makeWnykMove(g, "P1", { type: "like", submission: 2 }), /card being read/);
  assert.throws(() => makeWnykMove(g, "P1", { type: "unlike", submission: 0 }), /No un-hearting/);
  assert.throws(() => makeWnykMove(g, "P1", { type: "promote", submission: 0 }), /read-aloud first/);
  assert.throws(() => makeWnykMove(g, "P1", { type: "confirm" }), /read-aloud first/);
  makeWnykMove(g, "P1", { type: "like", submission: 0 }); // heart the current card
  makeWnykMove(g, "P1", { type: "next" });
  assert.equal(g.reveal_cursor, 1);
  makeWnykMove(g, "P1", { type: "next" });
  makeWnykMove(g, "P1", { type: "next" });
  assert.equal(g.reveal_cursor, 3);
  // No going back, no advancing past the end.
  assert.throws(() => makeWnykMove(g, "P1", { type: "next" }), /pick a winner/);
  // Stage 2: everything public, the stage-1 heart pre-populates Favorite,
  // unlike is legal again.
  const view = wnykGameToDictForViewer(wnykGameToDict(g), "P3", "active");
  view.submissions.forEach((entry) => entry.cards.forEach((card) => assert.ok(card.text)));
  assert.equal(g.submissions.find((entry) => entry.id === 0).liked, true);
  makeWnykMove(g, "P1", { type: "unlike", submission: 0 });
  assert.equal(g.submissions.find((entry) => entry.id === 0).liked, false);
  makeWnykMove(g, "P1", { type: "like", submission: 1 });
  makeWnykMove(g, "P1", { type: "promote", submission: 2 });
  makeWnykMove(g, "P1", { type: "confirm" });
  assert.equal(g.phase, "round_end");
});

test("read-aloud: stage-1 hearts feed the Most Liked tally", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  submitFirstCard(g, "P2");
  submitFirstCard(g, "P3");
  const heartedMark = g.submissions.find((entry) => entry.id === 0).mark;
  const winnerMark = g.submissions.find((entry) => entry.id === 1).mark;
  makeWnykMove(g, "P1", { type: "like", submission: 0 }); // heart during the read-aloud
  readAloud(g);
  makeWnykMove(g, "P1", { type: "promote", submission: 1 });
  makeWnykMove(g, "P1", { type: "confirm" });
  assert.equal(g.players[heartedMark].likes, 1, "stage-1 heart counted");
  assert.equal(g.players[winnerMark].likes, 1, "winner counts as liked");
});

test("read-aloud: a stalled judge is skippable; judge actions re-arm the clock", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal"), human("P4", "Dee")] });
  submitFirstCard(g, "P2");
  submitFirstCard(g, "P3");
  submitFirstCard(g, "P4");
  const heartedMark = g.submissions.find((entry) => entry.id === 0).mark;
  makeWnykMove(g, "P1", { type: "like", submission: 0 });
  clock.now += WNYK_SKIP_DELAY_MS;
  // Advancing resets the stall clock — the gate closes again.
  makeWnykMove(g, "P1", { type: "next" });
  assert.throws(() => makeWnykMove(g, "P2", { type: "skip_vote", target: "P1" }), /after two minutes/);
  clock.now += WNYK_SKIP_DELAY_MS;
  makeWnykMove(g, "P2", { type: "skip_vote", target: "P1" });
  makeWnykMove(g, "P3", { type: "skip_vote", target: "P1" });
  assert.equal(g.phase, "round_end");
  assert.equal(g.round_result.type, "judge_skipped");
  assert.equal(g.players[heartedMark].likes, 1, "stage-1 heart survives the skip");
  g.seat_order.forEach((mark) => assert.equal(g.players[mark].score, 0));
});

test("read-aloud: state survives a JSON round-trip mid-read (reconnect/restore)", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  submitFirstCard(g, "P2");
  submitFirstCard(g, "P3");
  makeWnykMove(g, "P1", { type: "next" });
  const restored = JSON.parse(JSON.stringify(g));
  assert.equal(restored.reveal_cursor, 1);
  makeWnykMove(restored, "P1", { type: "next" }); // normalizes, then advances
  assert.equal(restored.reveal_cursor, 2);
  makeWnykMove(restored, "P1", { type: "promote", submission: 0 });
  makeWnykMove(restored, "P1", { type: "confirm" });
  assert.equal(restored.phase, "round_end");
  // Hostile cursor values normalize back to the start of the read-aloud.
  const junk = JSON.parse(JSON.stringify(g));
  junk.reveal_cursor = "junk";
  makeWnykMove(junk, "P1", { type: "like", submission: 0 }); // current card at cursor 0
  assert.equal(junk.reveal_cursor, 0);
  assert.equal(junk.submissions.find((entry) => entry.id === 0).liked, true);
});


// ---- prompt stage (spec 3 step 2: judge-only prompt, release, black dump) ----

test("prompt stage: the prompt is judge-only until release; grace gates submissions", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")], hold: true });
  assert.equal(g.phase, "prompt");
  assert.equal(g.released_at, 0);
  // The round event carries no prompt (events are public).
  assert.ok(g.events.every((event) => event.black_card === undefined));
  // Masking: only the judge sees the black card; the swap budget is judge-only.
  const dict = wnykGameToDict(g);
  assert.ok(wnykGameToDictForViewer(dict, "P1", "active").black_card.text);
  assert.equal(wnykGameToDictForViewer(dict, "P1", "active").black_swaps, 0);
  ["P2", "P3", null].forEach((viewer) => {
    const view = wnykGameToDictForViewer(dict, viewer, "active");
    assert.equal(view.black_card, null, `prompt leaked to ${viewer}`);
    assert.ok(!("black_swaps" in view));
  });
  // Guards: only the judge releases; nobody submits or triages yet.
  assert.throws(() => makeWnykMove(g, "P2", { type: "release" }), /Only the judge/);
  assert.throws(() => submitFirstCard(g, "P2"), /still reading the prompt/);
  assert.throws(() => makeWnykMove(g, "P1", { type: "next" }), /not judging/i);
  makeWnykMove(g, "P1", { type: "release" });
  assert.equal(g.phase, "submitting");
  assert.equal(g.released_at, clock.now);
  assert.throws(() => makeWnykMove(g, "P1", { type: "release" }), /already out/);
  // Server-side grace: rejected inside 5s, accepted after.
  assert.throws(() => submitFirstCard(g, "P2"), /Read the prompt first/);
  clock.now += WNYK_SUBMIT_GRACE_MS + 1;
  submitFirstCard(g, "P2");
  assert.equal(g.players.P2.submitted, true);
});

test("prompt stage: black downvote dumps and replaces under :b: keys, capped per round", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")], hold: true });
  const firstIndex = g.black_card.i;
  const firstKey = `classic:b:${firstIndex}`;
  // The current prompt key routes to the black path, which is judge-only.
  assert.throws(() => makeWnykMove(g, "P2", { type: "rate", card: firstKey }), /Only the judge downvotes the prompt/);
  // A non-current black key falls through to the white path and refuses there.
  assert.throws(() => makeWnykMove(g, "P1", { type: "rate", card: "classic:b:999" }), /own hand/);
  makeWnykMove(g, "P1", { type: "rate", card: firstKey });
  assert.notEqual(g.black_card.i, firstIndex, "prompt was swapped");
  assert.equal(g.black_swaps, 1);
  assert.deepEqual(ratingOf(g, firstKey), { card: firstKey, down: 1, dealt: 1, played: 0 });
  // The replacement counts dealt under its own :b: key; chaining swaps the
  // next prompt and logs a distinct down.
  const secondKey = `classic:b:${g.black_card.i}`;
  assert.deepEqual(ratingOf(g, secondKey), { card: secondKey, down: 0, dealt: 1, played: 0 });
  makeWnykMove(g, "P1", { type: "rate", card: secondKey });
  assert.equal(g.black_swaps, 2);
  assert.equal(ratingOf(g, secondKey).down, 1);
  // Cap reached — a third swap refuses.
  assert.throws(
    () => makeWnykMove(g, "P1", { type: "rate", card: `classic:b:${g.black_card.i}` }),
    new RegExp(`${WNYK_BLACK_SWAPS_PER_ROUND} prompts per round`),
  );
  // After release the prompt can no longer be downvoted.
  makeWnykMove(g, "P1", { type: "release" });
  assert.throws(() => makeWnykMove(g, "P1", { type: "rate", card: `classic:b:${g.black_card.i}` }), /before releasing it/);
});

test("prompt stage: blacks count dealt per draw but NEVER count played", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")] });
  const blackKey = `classic:b:${g.black_card.i}`;
  assert.deepEqual(ratingOf(g, blackKey), { card: blackKey, down: 0, dealt: 1, played: 0 });
  submitFirstCard(g, "P2");
  submitFirstCard(g, "P3");
  readAloud(g);
  makeWnykMove(g, "P1", { type: "promote", submission: 0 });
  makeWnykMove(g, "P1", { type: "confirm" });
  // The round completed with this prompt — played still 0 (blacks have no
  // implicit up-vote; they must be played once drawn, so surviving means nothing).
  assert.deepEqual(ratingOf(g, blackKey), { card: blackKey, down: 0, dealt: 1, played: 0 });
});

test("prompt stage: a judge stalling pre-release is skippable; swaps do not re-arm the clock", () => {
  const g = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal"), human("P4", "Dee")], hold: true });
  clock.now += WNYK_SKIP_DELAY_MS;
  // A swap is not progress — the stall clock keeps running.
  makeWnykMove(g, "P1", { type: "rate", card: `classic:b:${g.black_card.i}` });
  makeWnykMove(g, "P2", { type: "skip_vote", target: "P1" });
  makeWnykMove(g, "P3", { type: "skip_vote", target: "P1" });
  assert.equal(g.phase, "round_end");
  assert.equal(g.round_result.type, "judge_skipped");
  g.seat_order.forEach((mark) => assert.equal(g.players[mark].score, 0));
  // The swap's downvote survives the skip.
  assert.equal(g.new_card_ratings.some((entry) => entry.card.includes(":b:") && entry.down === 1), true);
});

test("prompt stage: bot judges release on their own; restore mid-prompt survives", () => {
  const g = setup({ seats: [bot("B1", "Bot"), human("P2", "Ben"), human("P3", "Cal")], hold: true });
  // The bot judge released during setup bot resolution — hold cannot hold a bot.
  assert.equal(g.phase, "submitting");
  assert.ok(g.released_at > 0);
  // Restore a human-judge game mid-prompt: JSON round-trip, then hostile fields.
  const held = setup({ seats: [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")], hold: true });
  const restored = JSON.parse(JSON.stringify(held));
  restored.black_swaps = "junk";
  restored.released_at = "junk";
  makeWnykMove(restored, "P1", { type: "release" }); // normalizes, then releases
  assert.equal(restored.phase, "submitting");
  assert.equal(restored.black_swaps, 0);
  assert.equal(restored.released_at, clock.now);
});

// ---- pile priority (spec 3 step 2: fresh cards first, both colors) -----------

test("pile priority: well-worn cards sink to the bottom of both piles", () => {
  setWnykDecks(riggedDecks());
  setWnykRandom(() => 0.99);
  setWnykNow(() => clock.now);
  // Identity baseline (no usage): P1 draws whites 59..50 and the black pile
  // pops prompt 9 first. Mark exactly those as well-worn.
  const usage = { "classic:b:9": 5 };
  for (let i = 50; i <= 59; i += 1) usage[`classic:${i}`] = 3;
  const g = newWnykGame([], [], usage);
  initWnykSeats(g, [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")]);
  // No hand holds a well-worn white; the fresh prompt 8 beat the worn 9.
  g.seat_order.forEach((mark) => {
    g.players[mark].hand.forEach((ref) => assert.ok(ref.i < 50, `worn card ${ref.i} was dealt`));
  });
  assert.equal(g.black_card.i, 8);
  // A black swap draws the next-lowest-usage prompt, not the worn one.
  makeWnykMove(g, "P1", { type: "rate", card: "classic:b:8" });
  assert.equal(g.black_card.i, 7);
  // A white dump replacement also draws in priority order (next fresh card).
  makeWnykMove(g, "P1", { type: "release" });
  clock.now += WNYK_SUBMIT_GRACE_MS + 1;
  const before = g.players.P2.hand[0].i;
  makeWnykMove(g, "P2", { type: "rate", card: `classic:${before}` });
  assert.ok(g.players.P2.hand[0].i < 50, "dump replacement drew a worn card");
});

test("pile priority: equal-usage buckets keep the full seeded shuffle (empty map = pure shuffle)", () => {
  // Same seed, no usage vs uniform usage: identical piles — the bucket sort
  // is a stable no-op over the shuffle.
  setWnykDecks(riggedDecks());
  setWnykNow(() => clock.now);
  seeded(4242);
  const bare = newWnykGame();
  initWnykSeats(bare, [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")]);
  seeded(4242);
  const uniform = {};
  for (let i = 0; i < 60; i += 1) uniform[`classic:${i}`] = 7;
  for (let i = 0; i < 10; i += 1) uniform[`classic:b:${i}`] = 7;
  const even = newWnykGame([], [], uniform);
  initWnykSeats(even, [human("P1", "Ann"), human("P2", "Ben"), human("P3", "Cal")]);
  assert.deepEqual(
    even.seat_order.map((mark) => even.players[mark].hand),
    bare.seat_order.map((mark) => bare.players[mark].hand),
  );
  assert.equal(even.black_card.i, bare.black_card.i);
});
