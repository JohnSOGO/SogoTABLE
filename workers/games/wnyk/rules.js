// Well, Now You Know — server-authoritative rules + the per-viewer
// hidden-information sanitizer. Pure logic: no routing/auth/persistence, no
// DOM, no transport. The Worker will import these exports via the handlers
// table at UI-port time (registration deliberately deferred so the game stays
// invisible until then); tests import the engine directly.
//
// Ruleset (AI/cah/RULES.md): rotating judge. Each round opens with a PROMPT
// STAGE (§3 step 2): the black card (pick 1-3) is drawn JUDGE-ONLY — the
// judge may 👎-swap it (logged under "<deck>:b:<i>" keys, capped per round;
// prompts get no implicit up-vote, so black entries stay played:0 and the
// store's threshold degrades to downs-only) and then `release`s it to the
// table; submissions inside the 5s post-release grace are rejected server-
// side. Both piles draw lowest-lifetime-dealt first (card_usage plain-data
// input; random within equal-usage buckets), so fresh cards surface before
// well-worn ones. Every other seat then secretly submits that many white
// cards from a 10-card hand; submissions reveal anonymously in shuffled
// order. Judging is TWO STAGES
// (§6, the tabletop read-aloud ritual): stage 1 "read-aloud" — cards show one
// at a time to the whole room (reveal_cursor; judge hearts the current card
// or advances with `next`, no going back); stage 2 "triage" — all cards on
// the board (like/unlike shortlist seeded by the stage-1 hearts, promote one
// to Final, confirm) — the winner scores a round point, and every liked
// submission (winner always counts as liked) credits its author one Like
// toward the game-long "Most Liked" title. First
// to the target score (default 7) wins; Most Liked is the second podium spot.
// Write-ins: max ONE blank card per player per game — 5% chance on any drawn
// card, or dealt on the third round win if the lucky draw never fired. A blank
// is a hand card; playing it submits custom text (≤80 chars) through the same
// anonymous flow, revealed with "written by <name>" attribution and recorded
// in game.new_custom_cards for the custom-card library (persistence happens
// upstream — rules never touch storage; the library merges back in through
// newWnykGame/setWnykOptions as plain data).
// Card rating (spec §5b, revised 2026-07-20 — 👎-only): a downvote on a held
// card IS a dump — the card discards and its slot refills via the normal draw
// path, once per round per player, irreversible; playing a card is the
// implicit upvote (no 👍 control). The engine also passively counts, per card
// per game, times dealt into a human hand and times played — "dealt but never
// played" is quiet negative signal. Aggregates ({card, down, dealt, played})
// ride game.new_card_ratings for the lifetime store (workers/card-ratings.js),
// and the store's removed-card list comes back in as plain data
// (removed_cards) excluded from dealing. Details in ./ratings.js.
// Skip votes (MojoSOGO 2026-07-20): no auto-timeouts — after a decision has
// been pending 2 minutes, the other HUMAN players may vote to skip the stalled
// seat; 2/3 majority of eligible voters executes it (shared skip-vote.js
// protocol with an injected threshold; bots never stall, vote, or get
// skipped). A skipped submitter misses the round; a skipped judge discards the
// prompt — no point, but likes already given still count.
//
// Module seams (all intra-wnyk, acyclic): ./runtime.js owns the shared
// constants and the RNG/time/deck test seams; ./projection.js owns the dict
// shape, the per-viewer sanitizer (THE hidden-info boundary — see its DANGER
// ZONE note), and untrusted-state normalization; ./ratings.js owns the
// crowd-curation cluster. This file owns construction and every transition;
// it re-exports the public surface so consumers import from rules.js alone.
import { clampInteger } from "../util.js";
import { castSkipVote, pruneSkipVotes } from "../skip-vote.js";
import { wnykBotSubmission, wnykBotJudge } from "./ai.js";
import {
  wnykRateCardKey, wnykBlackCardKey, wnykBlackRateKey, applyWnykRate, wnykRemovedSet,
  wnykCountCardStat, wnykCountKeyStat, recountWnykCardRatings,
  normalizeWnykRemovedCards, normalizeWnykCardUsage,
} from "./ratings.js";
import {
  WNYK_GAME_ID, WNYK_HAND_SIZE, WNYK_MIN_SEATS, WNYK_WRITEIN_MAX_LENGTH,
  WNYK_SKIP_DELAY_MS, WNYK_SKIP_THRESHOLD, WNYK_SUBMIT_GRACE_MS,
  WNYK_BLACK_SWAPS_PER_ROUND, TARGET_SCORE_MIN, TARGET_SCORE_MAX,
  TARGET_SCORE_DEFAULT, wnykRandom, wnykNow, wnykDeckData,
} from "./runtime.js";
import {
  wnykDeck, cleanWnykText, normalizeWnykCustomCards, normalizeWnykGame,
} from "./projection.js";

export {
  WNYK_GAME_ID, WNYK_HAND_SIZE, WNYK_MIN_SEATS, WNYK_WRITEIN_MAX_LENGTH,
  WNYK_SKIP_DELAY_MS, WNYK_SKIP_THRESHOLD, WNYK_SUBMIT_GRACE_MS,
  WNYK_BLACK_SWAPS_PER_ROUND, WNYK_HOUSE_PACK,
  setWnykRandom, setWnykNow, setWnykDecks,
} from "./runtime.js";
export { wnykGameToDict, wnykGameToDictForViewer } from "./projection.js";

const WNYK_BLANK_CHANCE = 0.05;
const WNYK_BLANK_WIN_COUNT = 3;

export function isWnykGame(game) {
  return Boolean(game && game.game_id === WNYK_GAME_ID);
}

// ---------- game construction ----------

// Custom library cards arrive as plain data ({ text, author, id }) — from
// orchestration at creation, or via setWnykOptions' custom_cards field — and
// so do the rating store's removed-card key list (removed_cards) and the
// lifetime usage map (card_usage: {key → lifetime dealt}, driving the
// fresh-cards-first pile priority for both colors).
export function newWnykGame(customCards = [], removedCards = [], cardUsage = {}) {
  return {
    game_id: WNYK_GAME_ID,
    status: "playing",
    options: { target_score: TARGET_SCORE_DEFAULT, deck: "classic" },
    custom_pool: normalizeWnykCustomCards(customCards),
    removed_cards: normalizeWnykRemovedCards(removedCards),
    card_usage: normalizeWnykCardUsage(cardUsage),
    round: 0,
    phase: "submitting",
    judge: null,
    black_card: null,
    black_swaps: 0,
    released_at: 0,
    seat_order: [],
    players: {},
    draw_pile: [],
    black_pile: [],
    submissions: [],
    reveal_cursor: 0,
    final_pick: null,
    round_result: null,
    new_custom_cards: [],
    new_card_ratings: [],
    card_stats: {},
    most_liked: null,
    winner: null,
    skip_votes: {},
    phase_started_at: 0,
    move_count: 0,
    last_move: null,
    events: [],
  };
}

// Host options from the lobby (/api/room/start payload — clamp defensively,
// it crosses the wire). custom_cards rides the same seam so orchestration can
// hand the library in without a second entry point.
export function setWnykOptions(game, payload) {
  if (!payload || typeof payload !== "object") return;
  const target = Number(payload.target_score);
  if (Number.isInteger(target)) {
    game.options.target_score = clampInteger(target, TARGET_SCORE_MIN, TARGET_SCORE_MAX, TARGET_SCORE_DEFAULT);
  }
  if (Object.prototype.hasOwnProperty.call(wnykDeckData(), payload.deck)) game.options.deck = payload.deck;
  if (Array.isArray(payload.custom_cards)) game.custom_pool = normalizeWnykCustomCards(payload.custom_cards);
  if (Array.isArray(payload.removed_cards)) game.removed_cards = normalizeWnykRemovedCards(payload.removed_cards);
  if (payload.card_usage && typeof payload.card_usage === "object") game.card_usage = normalizeWnykCardUsage(payload.card_usage);
}

export function initWnykSeats(game, seats) {
  game.seat_order = [];
  game.players = {};
  (Array.isArray(seats) ? seats : []).forEach((seat) => {
    const mark = String(seat && seat.mark || "").trim();
    if (!mark) return;
    game.seat_order.push(mark);
    game.players[mark] = {
      name: String(seat && seat.name || mark).trim().slice(0, 40) || mark,
      hand: [],
      score: 0,
      likes: 0,
      blank_received: false,
      pending_blank: false,
      submitted: false,
      skipped: false,
      dump_used: false,
      ratings: {},
      is_bot: Boolean(seat && seat.kind === "bot"),
    };
  });
  if (game.seat_order.length < WNYK_MIN_SEATS) {
    throw new Error("Well, Now You Know needs at least 3 players — invite players or add bots.");
  }
  game.status = "playing";
  game.round = 0;
  game.winner = null;
  game.most_liked = null;
  game.new_custom_cards = [];
  game.new_card_ratings = [];
  game.card_stats = {};
  game.move_count = 0;
  game.last_move = null;
  game.events = [];
  buildWnykPiles(game);
  refillWnykHands(game);
  startWnykRound(game);
  resolveWnykBots(game);
}

// ---------- decks & dealing ----------

// Card refs stay tiny in the state blob: { i } = deck white card index,
// { c } = custom-library index, { b: 1 } = a blank in hand, { w: text } = a
// submitted write-in. Text materializes only in the dict projection.
function buildWnykPiles(game) {
  const deck = wnykDeck(game);
  const whites = wnykWhiteRefs(game, deck, () => true);
  game.draw_pile = orderWnykPileByUsage(game, whites, (ref) => wnykRateCardKey(game, ref));
  refillWnykBlackPile(game);
}

// Fresh-cards-first priority (spec §3 step 2, both colors): a full shuffle,
// then a STABLE sort by lifetime dealt count DESCENDING — draws pop from the
// end, so the least-dealt cards surface first and equal-usage buckets keep
// their full random order. An empty usage map degrades to a pure shuffle.
function orderWnykPileByUsage(game, items, keyOf) {
  const usage = (item) => game.card_usage[keyOf(item)] || 0;
  return shuffleWnyk(items).sort((a, b) => usage(b) - usage(a));
}

// Black pile: removed prompts excluded (same anti-wedge fallback as whites),
// usage-prioritized like the whites.
function refillWnykBlackPile(game) {
  const deck = wnykDeck(game);
  const removed = wnykRemovedSet(game);
  const all = deck.black.map((_, index) => index);
  const kept = all.filter((index) => !removed.has(wnykBlackCardKey(game.options.deck, index)));
  game.black_pile = orderWnykPileByUsage(
    game,
    kept.length ? kept : all,
    (index) => wnykBlackCardKey(game.options.deck, index),
  );
}

// Draw the next prompt to the judge (round start and 👎-swaps). Counted as
// dealt regardless of the judge's kind — unlike hands, the prompt is seen by
// the whole table once released. Prompts get NO played count, ever.
function drawWnykBlackCard(game) {
  if (!game.black_pile.length) refillWnykBlackPile(game);
  const index = game.black_pile.pop();
  const black = wnykDeck(game).black[index];
  game.black_card = { text: black.text, pick: black.pick, pack: black.pack || null, i: index };
  wnykCountKeyStat(game, wnykBlackRateKey(game), "dealt");
  recountWnykCardRatings(game);
}

// Every white-card ref passing `keep`, minus the rating store's removed cards.
// If curation would empty the pool entirely, deal the uncurated deck instead —
// a removed card on the table beats a wedged game.
function wnykWhiteRefs(game, deck, keep) {
  const removed = wnykRemovedSet(game);
  const refs = deck.white.map((_, index) => ({ i: index }));
  game.custom_pool.forEach((_, index) => refs.push({ c: index }));
  const kept = refs.filter((ref) => keep(ref) && !removed.has(wnykRateCardKey(game, ref)));
  return kept.length ? kept : refs.filter(keep);
}

function shuffleWnyk(items) {
  const list = items.slice();
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(wnykRandom() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function wnykRefKey(ref) {
  if (ref && ref.i !== undefined) return `i:${ref.i}`;
  if (ref && ref.c !== undefined) return `c:${ref.c}`;
  return null;
}

// Played cards discard into nowhere; when the pile runs dry, rebuild it from
// every card not currently held in a hand or sitting on the board.
function rebuildWnykDrawPile(game) {
  const inUse = new Set();
  game.seat_order.forEach((mark) => {
    game.players[mark].hand.forEach((ref) => {
      const key = wnykRefKey(ref);
      if (key) inUse.add(key);
    });
  });
  game.submissions.forEach((submission) => {
    submission.cards.forEach((ref) => {
      const key = wnykRefKey(ref);
      if (key) inUse.add(key);
    });
  });
  const deck = wnykDeck(game);
  const fresh = wnykWhiteRefs(game, deck, (ref) => !inUse.has(wnykRefKey(ref)));
  game.draw_pile = orderWnykPileByUsage(
    game,
    fresh.length ? fresh : deck.white.map((_, index) => ({ i: index })),
    (ref) => wnykRateCardKey(game, ref),
  );
}

function drawWnykCard(game, mark) {
  const seat = game.players[mark];
  let ref;
  if (!seat.blank_received && seat.pending_blank) {
    seat.blank_received = true;
    seat.pending_blank = false;
    ref = { b: 1 };
  } else if (!seat.is_bot && !seat.blank_received && wnykRandom() < WNYK_BLANK_CHANCE) {
    seat.blank_received = true;
    ref = { b: 1 };
  } else {
    if (!game.draw_pile.length) rebuildWnykDrawPile(game);
    ref = game.draw_pile.pop();
  }
  // Passive "times dealt" signal — human hands only (see ratings.js).
  if (!seat.is_bot) wnykCountCardStat(game, ref, "dealt");
  return ref;
}

function refillWnykHands(game) {
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    while (seat.hand.length < WNYK_HAND_SIZE) seat.hand.push(drawWnykCard(game, mark));
  });
  recountWnykCardRatings(game);
}

function startWnykRound(game) {
  game.round += 1;
  game.judge = game.seat_order[(game.round - 1) % game.seat_order.length];
  game.seat_order.forEach((mark) => {
    game.players[mark].submitted = false;
    game.players[mark].skipped = false;
    game.players[mark].dump_used = false;
  });
  drawWnykBlackCard(game);
  game.black_swaps = 0;
  game.released_at = 0;
  game.submissions = [];
  game.final_pick = null;
  game.round_result = null;
  game.skip_votes = {};
  // Prompt stage: the judge reads (and may 👎-swap) the prompt before
  // releasing it to the table. The event carries NO black_card — events are
  // public and the prompt is judge-only until release.
  game.phase = "prompt";
  game.phase_started_at = wnykNow();
  game.move_count += 1;
  game.last_move = { type: "round", round: game.round, judge: game.judge, move_count: game.move_count };
  pushWnykEvent(game, game.last_move);
}

// The judge releases the prompt to the table, opening submissions. The 5s
// grace (WNYK_SUBMIT_GRACE_MS) is enforced server-side in applyWnykSubmit;
// the submitters' vote-to-skip stall clock starts here.
function applyWnykRelease(game, mark) {
  if (game.phase !== "prompt") throw new Error("The prompt is already out.");
  if (mark !== game.judge) throw new Error("Only the judge reveals the prompt.");
  game.phase = "submitting";
  game.released_at = wnykNow();
  game.phase_started_at = wnykNow();
  game.move_count += 1;
  game.last_move = { type: "release", round: game.round, move_count: game.move_count };
  pushWnykEvent(game, game.last_move);
}

// The judge's 👎 on the CURRENT prompt during the prompt stage: logged under
// the black key namespace and the prompt is dumped and replaced — the vote
// and the swap are the same act (white-card dump symmetry). Capped per round
// so a judge can't bulk-downvote the prompt deck by chaining every swap; each
// swap logs one honest down on a distinct card. Like white rating this stays
// out of the public move stream (others can't see the prompt yet anyway), and
// it deliberately does NOT re-arm the judge's stall clock — swapping is not
// progress; releasing is.
function applyWnykRateBlack(game, mark, key) {
  if (mark !== game.judge || game.phase !== "prompt") {
    throw new Error("Only the judge downvotes the prompt, before releasing it.");
  }
  if (game.black_swaps >= WNYK_BLACK_SWAPS_PER_ROUND) {
    throw new Error(`The judge may swap at most ${WNYK_BLACK_SWAPS_PER_ROUND} prompts per round.`);
  }
  game.players[mark].ratings[key] = "down"; // one counted vote per card per player per game
  game.black_swaps += 1;
  drawWnykBlackCard(game);
}

// ---------- queries ----------

function wnykSubmitterMarks(game) {
  return game.seat_order.filter((mark) => mark !== game.judge);
}

// Judging stage 1 ("read-aloud", spec §6): submissions reveal one at a time —
// reveal_cursor is the id of the card currently being read; ids beyond it are
// hidden from EVERYONE. When the cursor passes the last submission, stage 2
// (the triage board) begins.
function wnykInReadAloud(game) {
  return game.phase === "judging" && game.reveal_cursor < game.submissions.length;
}

function wnykAllSubmissionsIn(game) {
  return wnykSubmitterMarks(game).every((mark) => game.players[mark].submitted || game.players[mark].skipped);
}

function humanMarks(game) {
  return game.seat_order.filter((mark) => !game.players[mark].is_bot);
}

// Marks allowed to vote on skipping `targetMark` right now, or null when the
// target is not skippable (they acted, they're a bot, the phase moved on).
function wnykSkipEligibility(game, targetMark) {
  if (game.status !== "playing") return null;
  const target = game.players[targetMark];
  if (!target || target.is_bot) return null;
  if (game.phase === "submitting") {
    if (targetMark === game.judge || target.submitted || target.skipped) return null;
    return humanMarks(game).filter((mark) => mark !== targetMark);
  }
  // A judge can stall reading the prompt or judging — skippable in both.
  if (game.phase === "prompt" || game.phase === "judging") {
    if (targetMark !== game.judge) return null;
    return humanMarks(game).filter((mark) => mark !== targetMark);
  }
  return null;
}

export function wnykScoreByMark(game) {
  normalizeWnykGame(game);
  const scores = {};
  game.seat_order.forEach((mark) => { scores[mark] = Number(game.players[mark].score || 0); });
  return scores;
}

// ---------- transitions ----------

export function makeWnykMove(game, mark, action) {
  normalizeWnykGame(game);
  if (game.status === "complete") throw new Error("Game is complete.");
  const seat = game.players[mark];
  if (!seat) throw new Error("You are not seated in this game.");
  if (seat.is_bot) throw new Error("Bot seats play automatically.");
  const type = String(action && action.type || "").trim();
  if (type === "submit") {
    applyWnykSubmit(game, mark, Array.isArray(action.cards) ? action.cards.map(Number) : [], action.writein);
  } else if (type === "release") {
    applyWnykRelease(game, mark);
  } else if (type === "next") {
    applyWnykNext(game, mark);
  } else if (type === "like" || type === "unlike") {
    applyWnykLike(game, mark, Number(action.submission), type === "like");
  } else if (type === "promote") {
    applyWnykPromote(game, mark, action.submission);
  } else if (type === "confirm") {
    applyWnykConfirm(game, mark);
  } else if (type === "next_round") {
    applyWnykNextRound(game);
  } else if (type === "rate") {
    // The current prompt's key routes to the black path; everything else is a
    // white-card (hand) downvote.
    const rateKey = String(action && action.card || "").trim();
    if (rateKey && rateKey === wnykBlackRateKey(game)) {
      applyWnykRateBlack(game, mark, rateKey);
    } else {
      applyWnykRate(game, mark, action, { drawCard: () => drawWnykCard(game, mark) });
    }
  } else if (type === "skip_vote") {
    applyWnykSkipVote(game, mark, String(action.target || ""));
  } else {
    throw new Error("Action must be submit, release, next, like, unlike, promote, confirm, next_round, rate, or skip_vote.");
  }
  game.skip_votes = pruneSkipVotes(game.skip_votes, (target) => wnykSkipEligibility(game, target));
  resolveWnykBots(game);
}

function applyWnykSubmit(game, mark, indices, writeinText) {
  if (game.phase === "prompt") throw new Error("The judge is still reading the prompt.");
  if (game.phase !== "submitting") throw new Error("Submissions are closed — the judge is deciding.");
  if (mark === game.judge) throw new Error("The judge sits this one out — you pick the winner.");
  const seat = game.players[mark];
  // Server-authoritative release grace: a racing client can't submit before
  // the table has had a beat to read the prompt. Bots are driven server-side
  // (resolveWnykBots holds them through the grace), so they skip the check.
  if (!seat.is_bot && wnykNow() - game.released_at < WNYK_SUBMIT_GRACE_MS) {
    throw new Error("Read the prompt first — submissions open a moment after the reveal.");
  }
  if (seat.submitted) throw new Error("You already submitted this round.");
  if (seat.skipped) throw new Error("The table voted to move on without you this round.");
  const pick = game.black_card.pick;
  if (indices.length !== pick || new Set(indices).size !== pick) {
    throw new Error(`Submit exactly ${pick} different card${pick > 1 ? "s" : ""} for this prompt.`);
  }
  indices.forEach((index) => {
    if (!Number.isInteger(index) || index < 0 || index >= seat.hand.length) {
      throw new Error("Submission points at a card you do not hold.");
    }
  });
  const blanks = indices.filter((index) => seat.hand[index] && seat.hand[index].b);
  if (blanks.length > 1) throw new Error("Only one write-in per submission.");
  let writein = null;
  if (blanks.length === 1) {
    writein = cleanWnykText(writeinText);
    if (!writein) throw new Error(`A write-in needs text (up to ${WNYK_WRITEIN_MAX_LENGTH} characters).`);
  } else if (writeinText !== undefined && writeinText !== null && String(writeinText).trim()) {
    throw new Error("Write-in text needs your blank card in the submission.");
  }
  const cards = indices.map((index) => {
    const ref = seat.hand[index];
    return ref.b ? { w: writein, by: mark } : ref;
  });
  // Passive "times played" signal — human plays only (see ratings.js); blanks
  // and write-ins key as null and never count.
  if (!seat.is_bot) {
    indices.forEach((index) => wnykCountCardStat(game, seat.hand[index], "played"));
    recountWnykCardRatings(game);
  }
  indices.slice().sort((a, b) => b - a).forEach((index) => seat.hand.splice(index, 1));
  game.submissions.push({ id: null, mark, cards, liked: false });
  seat.submitted = true;
  game.move_count += 1;
  // No contents on the event — submissions are secret until the reveal.
  game.last_move = { type: "submitted", mark, move_count: game.move_count };
  pushWnykEvent(game, game.last_move);
  if (wnykAllSubmissionsIn(game)) revealWnykSubmissions(game);
}

function revealWnykSubmissions(game) {
  if (!game.submissions.length) {
    finishWnykRound(game, { type: "no_submissions" });
    return;
  }
  game.submissions = shuffleWnyk(game.submissions);
  game.submissions.forEach((submission, index) => { submission.id = index; });
  game.reveal_cursor = 0; // stage 1: the first card is on the table
  game.final_pick = null;
  game.phase = "judging";
  game.phase_started_at = wnykNow();
  game.skip_votes = {};
  game.move_count += 1;
  game.last_move = { type: "reveal", round: game.round, count: game.submissions.length, move_count: game.move_count };
  pushWnykEvent(game, game.last_move);
}

function wnykSubmissionById(game, id) {
  const submission = game.submissions.find((entry) => entry.id === id);
  if (!submission) throw new Error("That submission is not on the table.");
  return submission;
}

function assertWnykJudge(game, mark) {
  if (game.phase !== "judging") throw new Error("The table is not judging right now.");
  if (mark !== game.judge) throw new Error("Only the judge triages submissions.");
}

// Advance the read-aloud cursor (judge action {type:"next"}). Deliberately no
// reverse action — no going back during the read-aloud (spec §6).
function applyWnykNext(game, mark) {
  assertWnykJudge(game, mark);
  if (!wnykInReadAloud(game)) throw new Error("Every submission is on the table — pick a winner.");
  game.reveal_cursor += 1;
  game.phase_started_at = wnykNow(); // each judge action re-arms the stall clock
  game.move_count += 1;
  game.last_move = { type: "next", revealed: game.reveal_cursor, move_count: game.move_count };
  pushWnykEvent(game, game.last_move);
}

function applyWnykLike(game, mark, id, liked) {
  assertWnykJudge(game, mark);
  if (wnykInReadAloud(game)) {
    // Stage 1: the heart applies to the card being read; no un-hearting until
    // the triage board (stage 2).
    if (!liked) throw new Error("No un-hearting during the read-aloud — sort it out on the triage board.");
    if (id !== game.reveal_cursor) throw new Error("Heart the card being read.");
  }
  const submission = wnykSubmissionById(game, id);
  submission.liked = liked;
  if (!liked && game.final_pick === id) game.final_pick = null;
  game.phase_started_at = wnykNow();
  game.move_count += 1;
  game.last_move = { type: liked ? "like" : "unlike", submission: id, move_count: game.move_count };
  pushWnykEvent(game, game.last_move);
}

function applyWnykPromote(game, mark, id) {
  assertWnykJudge(game, mark);
  if (wnykInReadAloud(game)) throw new Error("Finish the read-aloud first.");
  if (id === null || id === undefined || id === "") {
    game.final_pick = null;
  } else {
    game.final_pick = wnykSubmissionById(game, Number(id)).id;
  }
  game.phase_started_at = wnykNow();
  game.move_count += 1;
  game.last_move = { type: "promote", submission: game.final_pick, move_count: game.move_count };
  pushWnykEvent(game, game.last_move);
}

function applyWnykConfirm(game, mark) {
  assertWnykJudge(game, mark);
  if (wnykInReadAloud(game)) throw new Error("Finish the read-aloud first.");
  if (game.final_pick === null) throw new Error("Promote one submission to Final before confirming.");
  const winning = wnykSubmissionById(game, game.final_pick);
  const winnerSeat = game.players[winning.mark];
  winnerSeat.score += 1;
  tallyWnykLikes(game, winning.id);
  harvestWnykWriteins(game);
  // Bots never write in, so they never earn (or luck into) a blank.
  if (!winnerSeat.is_bot && winnerSeat.score === WNYK_BLANK_WIN_COUNT && !winnerSeat.blank_received) winnerSeat.pending_blank = true;
  finishWnykRound(game, { type: "win", winner: winning.mark, submission_id: winning.id, black_card: game.black_card });
  if (winnerSeat.score >= game.options.target_score) completeWnykGame(game, winning.mark);
}

// Every liked submission credits its author one Like; the winner counts as
// liked whether or not the judge explicitly said so.
function tallyWnykLikes(game, winnerId) {
  game.submissions.forEach((submission) => {
    if (submission.liked || submission.id === winnerId) game.players[submission.mark].likes += 1;
  });
}

// Revealed write-ins become permanent library candidates ({ text, author })
// that orchestration persists via workers/custom-cards.js.
function harvestWnykWriteins(game) {
  game.submissions.forEach((submission) => {
    submission.cards.forEach((ref) => {
      if (ref && ref.w !== undefined) {
        game.new_custom_cards.push({ text: String(ref.w), author: game.players[submission.mark].name });
      }
    });
  });
}

function finishWnykRound(game, result) {
  game.round_result = { ...result, round: game.round };
  game.phase = "round_end";
  game.phase_started_at = wnykNow();
  game.skip_votes = {};
  game.move_count += 1;
  game.last_move = { type: "round_end", ...game.round_result, move_count: game.move_count };
  pushWnykEvent(game, game.last_move);
}

function completeWnykGame(game, winnerMark) {
  game.status = "complete";
  game.winner = winnerMark;
  const best = Math.max(...game.seat_order.map((mark) => game.players[mark].likes));
  game.most_liked = {
    likes: best,
    marks: best > 0 ? game.seat_order.filter((mark) => game.players[mark].likes === best) : [],
  };
  game.move_count += 1;
  game.last_move = { type: "complete", winner: winnerMark, most_liked: game.most_liked, move_count: game.move_count };
  pushWnykEvent(game, game.last_move);
}

function applyWnykNextRound(game) {
  if (game.phase !== "round_end") throw new Error("The round is still being played.");
  refillWnykHands(game);
  startWnykRound(game);
}

// The 2-minute vote-to-skip (shared skip-vote.js protocol, 2/3 threshold —
// see the module header). The clock gates the vote, never decides anything.
function applyWnykSkipVote(game, mark, targetMark) {
  const eligible = wnykSkipEligibility(game, targetMark);
  if (!eligible) throw new Error("That seat cannot be skipped right now.");
  if (!eligible.includes(mark)) throw new Error("Only the waiting human players vote on a skip.");
  if (wnykNow() - game.phase_started_at < WNYK_SKIP_DELAY_MS) {
    throw new Error("Skip votes open after two minutes — give them a moment.");
  }
  const { votes, passed } = castSkipVote(game.skip_votes, mark, targetMark, eligible, WNYK_SKIP_THRESHOLD);
  game.skip_votes = votes;
  game.move_count += 1;
  game.last_move = { type: "skip_vote", mark, target: targetMark, move_count: game.move_count };
  pushWnykEvent(game, game.last_move);
  if (!passed) return; // proposal recorded — the projection shows the live tally
  delete game.skip_votes[targetMark];
  if (game.phase === "submitting") {
    game.players[targetMark].skipped = true;
    game.move_count += 1;
    game.last_move = { type: "skipped", target: targetMark, move_count: game.move_count };
    pushWnykEvent(game, game.last_move);
    if (wnykAllSubmissionsIn(game)) revealWnykSubmissions(game);
    return;
  }
  // Judging: the prompt is discarded — no point, but likes already given (and
  // revealed write-ins) still count.
  tallyWnykLikes(game, null);
  harvestWnykWriteins(game);
  finishWnykRound(game, { type: "judge_skipped", judge: targetMark, black_card: game.black_card });
}

function pushWnykEvent(game, event) {
  game.events.push(event);
  game.events = game.events.slice(-60);
}

// Bot turns run through the SAME submit/triage internals a human move uses —
// no bot-only legality. The chain stops at a human's decision (their
// submission, the human judge's triage, or a round_end a human should read).
// A bots-only table plays itself out. The guard bounds a pathological game far
// above any real one.
function resolveWnykBots(game) {
  for (let guard = 0; guard < 2000; guard += 1) {
    if (game.status !== "playing") return;
    if (game.phase === "prompt") {
      const judgeSeat = game.players[game.judge];
      if (!judgeSeat || !judgeSeat.is_bot) return;
      // Bot judges never downvote prompts — straight to release.
      applyWnykRelease(game, game.judge);
      continue;
    }
    if (game.phase === "submitting") {
      const pending = wnykSubmitterMarks(game).find((mark) => {
        const seat = game.players[mark];
        return seat.is_bot && !seat.submitted && !seat.skipped;
      });
      if (!pending) return; // waiting on humans (or the reveal already fired)
      // Bots hold with the humans through the release grace so the table
      // never sees instant submissions — the first post-grace human move
      // resolves them. With no human submitter left to trigger a later move
      // (bots-only submitters), they go immediately instead of wedging.
      const humanPending = wnykSubmitterMarks(game).some((mark) => {
        const seat = game.players[mark];
        return !seat.is_bot && !seat.submitted && !seat.skipped;
      });
      if (humanPending && wnykNow() - game.released_at < WNYK_SUBMIT_GRACE_MS) return;
      const seat = game.players[pending];
      const playable = seat.hand.map((ref, index) => (ref && ref.b ? null : index)).filter((index) => index !== null);
      let indices = wnykBotSubmission({ playable: playable.slice(), pick: game.black_card.pick, random: wnykRandom });
      const valid = Array.isArray(indices) && indices.length === game.black_card.pick
        && new Set(indices).size === indices.length && indices.every((index) => playable.includes(index));
      if (!valid) indices = playable.slice(0, game.black_card.pick); // a confused policy must not wedge the table
      applyWnykSubmit(game, pending, indices, undefined);
      continue;
    }
    if (game.phase === "judging") {
      const judgeSeat = game.players[game.judge];
      if (!judgeSeat || !judgeSeat.is_bot) return;
      const choice = wnykBotJudge({ ids: game.submissions.map((submission) => submission.id), random: wnykRandom });
      const likes = new Set(choice && Array.isArray(choice.likes) ? choice.likes : []);
      // Stage 1: read each card aloud, hearting the planned ones as they come
      // up (ids are read order), then run the triage board.
      while (wnykInReadAloud(game)) {
        if (likes.has(game.reveal_cursor)) applyWnykLike(game, game.judge, game.reveal_cursor, true);
        applyWnykNext(game, game.judge);
      }
      const winnerId = choice && game.submissions.some((submission) => submission.id === choice.winner)
        ? choice.winner
        : game.submissions[0].id;
      applyWnykPromote(game, game.judge, winnerId);
      applyWnykConfirm(game, game.judge);
      continue;
    }
    if (game.phase === "round_end") {
      if (game.seat_order.some((mark) => !game.players[mark].is_bot)) return;
      applyWnykNextRound(game);
      continue;
    }
    return;
  }
  throw new Error("Well, Now You Know bot resolution exceeded its guard — this is a bug.");
}
