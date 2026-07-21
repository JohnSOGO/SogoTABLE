// Shared fixtures for the WNYK engine test files (wnyk-rules / wnyk-rating /
// wnyk-judging). Not a test file itself — workers/tests/ is ownership-exempt
// and `npm test` globs *.test.js only. Each test file registers
// `test.afterEach(resetWnykSeams)` itself.
import assert from "node:assert/strict";
import {
  makeWnykMove, newWnykGame, initWnykSeats,
  setWnykRandom, setWnykNow, setWnykDecks,
} from "../games/wnyk/rules.js";

export const human = (mark, name) => ({ mark, name, kind: "human" });
export const bot = (mark, name) => ({ mark, name, kind: "bot" });

// A rigged deck so tests never depend on real card text. With the constant
// 0.99 RNG below every Fisher-Yates shuffle is the identity (j === i for all
// i < 100), draws pop from the END of the built pile, and the 5% blank roll
// never fires (0.99 > 0.05). With the constant 0 RNG the FIRST draw by any
// blank-eligible human is a blank.
export function riggedDecks({ whites = 60, blacks = 10, lastPick = 1 } = {}) {
  return {
    classic: {
      white: Array.from({ length: whites }, (_, i) => ({ text: `White ${i}`, pack: "Base Set" })),
      black: Array.from({ length: blacks }, (_, i) => ({
        text: `Prompt ${i} _`,
        pick: i === blacks - 1 ? lastPick : 1,
        pack: "Base Set",
      })),
    },
    family: {
      // Mixed provenance like the real family deck (CAH cards + SOGO Kids).
      white: Array.from({ length: whites }, (_, i) => ({
        text: `Fam ${i}`,
        pack: i % 2 ? "SOGO Kids" : "Family Edition",
      })),
      black: Array.from({ length: blacks }, (_, i) => ({ text: `FamPrompt ${i} _`, pick: 1, pack: "Family Edition" })),
    },
  };
}

// Mutable sim clock: tests advance it with `clock.now += ...`.
export const clock = { now: 1_000_000 };

// `hold: true` leaves the game in the prompt stage (judge reading); the
// default releases the prompt and jumps the clock past the 5s submit grace so
// tests can submit immediately.
export function setup({ seats, decks = riggedDecks(), random = () => 0.99, customCards = [], hold = false } = {}) {
  clock.now = 1_000_000;
  setWnykDecks(decks);
  setWnykRandom(random);
  setWnykNow(() => clock.now);
  const g = newWnykGame(customCards);
  initWnykSeats(g, seats);
  if (!hold) releasePrompt(g);
  return g;
}

// Release the prompt (if the judge is human and still reading) and clear the
// submit grace. Safe to call in any phase.
export function releasePrompt(g, { grace = true } = {}) {
  if (g.phase === "prompt") makeWnykMove(g, g.judge, { type: "release" });
  if (grace) clock.now += 5001;
}

export function seeded(seed) {
  let s = seed >>> 0;
  setWnykRandom(() => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  });
}

export function resetWnykSeams() {
  setWnykRandom(Math.random);
  setWnykNow(null);
  setWnykDecks(null);
}

export function submitFirstCard(g, mark) {
  const index = g.players[mark].hand.findIndex((ref) => !ref.b);
  makeWnykMove(g, mark, { type: "submit", cards: [index] });
}

export function submissionIdOf(g, mark) {
  const submission = g.submissions.find((entry) => entry.mark === mark);
  assert.ok(submission, `no submission from ${mark}`);
  return submission.id;
}

// Walk the judge through stage 1 (the read-aloud) so the triage board opens.
export function readAloud(g) {
  while (g.phase === "judging" && g.reveal_cursor < g.submissions.length) {
    makeWnykMove(g, g.judge, { type: "next" });
  }
}

// Play a full pick-1 round to a chosen winner (all-human tables).
export function playRound(g, winnerMark) {
  releasePrompt(g);
  const judge = g.judge;
  g.seat_order.filter((mark) => mark !== judge && !g.players[mark].is_bot)
    .forEach((mark) => submitFirstCard(g, mark));
  assert.equal(g.phase, "judging");
  readAloud(g);
  makeWnykMove(g, judge, { type: "promote", submission: submissionIdOf(g, winnerMark) });
  makeWnykMove(g, judge, { type: "confirm" });
  if (g.status === "playing") makeWnykMove(g, judge, { type: "next_round" });
}

// Like `playRound`, but the judge also Likes one losing submission first.
export function playRoundWithLike(g, winnerMark, likedMark) {
  releasePrompt(g);
  const judge = g.judge;
  g.seat_order.filter((mark) => mark !== judge && !g.players[mark].is_bot)
    .forEach((mark) => submitFirstCard(g, mark));
  readAloud(g);
  if (likedMark) makeWnykMove(g, judge, { type: "like", submission: submissionIdOf(g, likedMark) });
  makeWnykMove(g, judge, { type: "promote", submission: submissionIdOf(g, winnerMark) });
  makeWnykMove(g, judge, { type: "confirm" });
  if (g.status === "playing") makeWnykMove(g, judge, { type: "next_round" });
}

// Aggregate lookup — the aggregate carries a dealt entry for every card in a
// human hand, so whole-array deepEqual is impractical.
export function ratingOf(g, key) {
  return g.new_card_ratings.find((entry) => entry.card === key) || null;
}
