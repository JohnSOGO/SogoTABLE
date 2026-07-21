// Well, Now You Know — server-authoritative rules + the per-viewer
// hidden-information sanitizer. Pure logic: no routing/auth/persistence, no
// DOM, no transport. The Worker will import these exports via the handlers
// table at UI-port time (registration deliberately deferred so the game stays
// invisible until then); tests import the engine directly.
//
// Ruleset (AI/cah/RULES.md): rotating judge; a black prompt card (pick 1-3);
// every other seat secretly submits that many white cards from a 10-card hand;
// submissions reveal anonymously in shuffled order; the judge triages
// (like/unlike shortlist, promote one to Final, confirm) — the winner scores a
// round point, and every liked submission (winner always counts as liked)
// credits its author one Like toward the game-long "Most Liked" title. First
// to the target score (default 7) wins; Most Liked is the second podium spot.
// Write-ins: max ONE blank card per player per game — 5% chance on any drawn
// card, or dealt on the third round win if the lucky draw never fired. A blank
// is a hand card; playing it submits custom text (≤80 chars) through the same
// anonymous flow, revealed with "written by <name>" attribution and recorded
// in game.new_custom_cards for the custom-card library (persistence happens
// upstream — rules never touch storage; the library merges back in through
// newWnykGame/setWnykOptions as plain data).
// Skip votes (MojoSOGO 2026-07-20): no auto-timeouts — after a decision has
// been pending 2 minutes, the other HUMAN players may vote to skip the stalled
// seat; 2/3 majority of eligible voters executes it (shared skip-vote.js
// protocol with an injected threshold; bots never stall, vote, or get
// skipped). A skipped submitter misses the round; a skipped judge discards the
// prompt — no point, but likes already given still count.
//
// DANGER ZONE: wnykGameToDictForViewer is the ONLY thing hiding other hands,
// pre-reveal submissions, and pre-confirm authorship (fresh write-in
// attribution included — a this-round write-in names its submitter). Library
// custom-card attribution is public card-face text and never masks. Keep its
// behaviour exactly.
//
// RNG: one seedable seam (setWnykRandom) — pile shuffles (Fisher–Yates), the
// 5% blank roll (one value per draw by a blank-eligible human), and the reveal
// shuffle all flow through it. Time: one seam (setWnykNow) feeding
// phase_started_at, read only to gate skip votes.
import { WNYK_DECKS } from "./decks.js";
import { clampInteger } from "../util.js";
import { castSkipVote, pruneSkipVotes, normalizeSkipVotes } from "../skip-vote.js";
import { wnykBotSubmission, wnykBotJudge } from "./ai.js";

// Fresh opaque id, registry-style. At UI-port time this literal moves into
// GAME_IDS in the shared registry and this line becomes GAME_IDS.wnyk (the
// game is deliberately unregistered until then, so isWnykGame must not call
// cleanGameId — it throws on ids the registry doesn't know).
export const WNYK_GAME_ID = "c9d4e72a81f5";
export const WNYK_HAND_SIZE = 10;
export const WNYK_MIN_SEATS = 3;
export const WNYK_WRITEIN_MAX_LENGTH = 80;
export const WNYK_SKIP_DELAY_MS = 2 * 60 * 1000;
export const WNYK_SKIP_THRESHOLD = 2 / 3;
const WNYK_BLANK_CHANCE = 0.05;
const WNYK_BLANK_WIN_COUNT = 3;
const WNYK_PHASES = ["submitting", "judging", "round_end"];
const TARGET_SCORE_MIN = 3;
const TARGET_SCORE_MAX = 15;
const TARGET_SCORE_DEFAULT = 7;

export function isWnykGame(game) {
  return Boolean(game && game.game_id === WNYK_GAME_ID);
}

let wnykRandom = Math.random;
export function setWnykRandom(fn) {
  wnykRandom = typeof fn === "function" ? fn : Math.random;
}

let wnykNow = () => Date.now();
export function setWnykNow(fn) {
  wnykNow = typeof fn === "function" ? fn : () => Date.now();
}

// Deck seam (tests only): swap the generated card data for a tiny rigged deck
// so tests don't depend on real card text. Shape must match WNYK_DECKS.
let wnykDecks = WNYK_DECKS;
export function setWnykDecks(decks) {
  wnykDecks = decks && typeof decks === "object" ? decks : WNYK_DECKS;
}

// ---------- game construction ----------

// Custom library cards arrive as plain data ({ text, author }) — from
// orchestration at creation, or via setWnykOptions' custom_cards field.
export function newWnykGame(customCards = []) {
  return {
    game_id: WNYK_GAME_ID,
    status: "playing",
    options: { target_score: TARGET_SCORE_DEFAULT, deck: "classic" },
    custom_pool: normalizeWnykCustomCards(customCards),
    round: 0,
    phase: "submitting",
    judge: null,
    black_card: null,
    seat_order: [],
    players: {},
    draw_pile: [],
    black_pile: [],
    submissions: [],
    final_pick: null,
    round_result: null,
    new_custom_cards: [],
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
  if (Object.prototype.hasOwnProperty.call(wnykDecks, payload.deck)) game.options.deck = payload.deck;
  if (Array.isArray(payload.custom_cards)) game.custom_pool = normalizeWnykCustomCards(payload.custom_cards);
}

function normalizeWnykCustomCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards
    .map((card) => ({
      text: cleanWnykText(card && card.text),
      author: String(card && card.author || "").trim().slice(0, 40),
    }))
    .filter((card) => card.text)
    .slice(0, 500);
}

function cleanWnykText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, WNYK_WRITEIN_MAX_LENGTH);
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
  game.move_count = 0;
  game.last_move = null;
  game.events = [];
  buildWnykPiles(game);
  refillWnykHands(game);
  startWnykRound(game);
  resolveWnykBots(game);
}

// ---------- decks & dealing ----------

function wnykDeck(game) {
  return wnykDecks[game.options.deck] || wnykDecks.classic || WNYK_DECKS.classic;
}

// Card refs stay tiny in the state blob: { i } = deck white card index,
// { c } = custom-library index, { b: 1 } = a blank in hand, { w: text } = a
// submitted write-in. Text materializes only in the dict projection.
function buildWnykPiles(game) {
  const deck = wnykDeck(game);
  const whites = deck.white.map((_, index) => ({ i: index }));
  game.custom_pool.forEach((_, index) => whites.push({ c: index }));
  game.draw_pile = shuffleWnyk(whites);
  game.black_pile = shuffleWnyk(deck.black.map((_, index) => index));
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
  const fresh = deck.white.map((_, index) => ({ i: index })).filter((ref) => !inUse.has(wnykRefKey(ref)));
  game.custom_pool.forEach((_, index) => {
    if (!inUse.has(`c:${index}`)) fresh.push({ c: index });
  });
  game.draw_pile = shuffleWnyk(fresh.length ? fresh : deck.white.map((_, index) => ({ i: index })));
}

function drawWnykCard(game, mark) {
  const seat = game.players[mark];
  if (!seat.blank_received && seat.pending_blank) {
    seat.blank_received = true;
    seat.pending_blank = false;
    return { b: 1 };
  }
  if (!seat.is_bot && !seat.blank_received && wnykRandom() < WNYK_BLANK_CHANCE) {
    seat.blank_received = true;
    return { b: 1 };
  }
  if (!game.draw_pile.length) rebuildWnykDrawPile(game);
  return game.draw_pile.pop();
}

function refillWnykHands(game) {
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    while (seat.hand.length < WNYK_HAND_SIZE) seat.hand.push(drawWnykCard(game, mark));
  });
}

function startWnykRound(game) {
  game.round += 1;
  game.judge = game.seat_order[(game.round - 1) % game.seat_order.length];
  game.seat_order.forEach((mark) => {
    game.players[mark].submitted = false;
    game.players[mark].skipped = false;
  });
  if (!game.black_pile.length) game.black_pile = shuffleWnyk(wnykDeck(game).black.map((_, index) => index));
  const blackIndex = game.black_pile.pop();
  const black = wnykDeck(game).black[blackIndex];
  game.black_card = { text: black.text, pick: black.pick };
  game.submissions = [];
  game.final_pick = null;
  game.round_result = null;
  game.skip_votes = {};
  game.phase = "submitting";
  game.phase_started_at = wnykNow();
  game.move_count += 1;
  game.last_move = { type: "round", round: game.round, judge: game.judge, black_card: game.black_card, move_count: game.move_count };
  pushWnykEvent(game, game.last_move);
}

// ---------- queries ----------

function wnykSubmitterMarks(game) {
  return game.seat_order.filter((mark) => mark !== game.judge);
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
  if (game.phase === "judging") {
    if (targetMark !== game.judge) return null;
    return humanMarks(game).filter((mark) => mark !== targetMark);
  }
  return null;
}

// ---------- projections ----------

function wnykCardFace(game, ref) {
  if (!ref || typeof ref !== "object") return null;
  if (ref.b) return { blank: true, text: null, author: null, writein: false };
  if (ref.w !== undefined) return { blank: false, text: String(ref.w), author: game.players[ref.by] ? game.players[ref.by].name : String(ref.by || ""), writein: true };
  if (ref.c !== undefined) {
    const card = game.custom_pool[ref.c];
    return card ? { blank: false, text: card.text, author: card.author, writein: false } : null;
  }
  const deck = wnykDeck(game);
  const text = deck.white[ref.i];
  return text === undefined ? null : { blank: false, text, author: null, writein: false };
}

export function wnykGameToDict(game) {
  normalizeWnykGame(game);
  const players = game.seat_order.map((mark) => {
    const seat = game.players[mark];
    return {
      mark,
      name: seat.name,
      hand: seat.hand.map((ref) => wnykCardFace(game, ref)),
      score: seat.score,
      likes: seat.likes,
      blank_received: seat.blank_received,
      submitted: seat.submitted,
      skipped: seat.skipped,
      is_bot: seat.is_bot,
      is_judge: mark === game.judge,
    };
  });
  const submissions = game.submissions.map((submission, index) => ({
    id: submission.id === undefined ? index : submission.id,
    mark: submission.mark,
    cards: submission.cards.map((ref) => wnykCardFace(game, ref)),
    liked: Boolean(submission.liked),
    has_writein: submission.cards.some((ref) => ref && ref.w !== undefined),
  }));
  const {
    players: _seats, submissions: _subs, draw_pile: _draw, black_pile: _black, custom_pool: _pool,
    ...publicGame
  } = game;
  return {
    ...publicGame,
    game_id: WNYK_GAME_ID,
    players,
    submissions,
    draw_count: game.draw_pile.length,
    skip_delay_ms: WNYK_SKIP_DELAY_MS,
  };
}

// Per-viewer projection (Worker gameToDictForViewer seam, Liar's Dice
// precedent). Receives the DICT shape. Masks, per phase:
//   - other players' hands → nulls (count preserved) unless the game is over;
//   - submitting: a viewer sees only their OWN submission — everyone else's
//     (contents AND existence beyond the public submitted flag) drops;
//   - judging: submission texts are public in their shuffled order, but every
//     submitter mark and every fresh write-in author masks — the judge is a
//     viewer like any other here (library custom-card authors are card-face
//     text and stay);
//   - round_end: the winning submission reveals its mark ("well, now you
//     know"), and every fresh write-in shows its "written by" credit (spec §5:
//     attribution shows on reveal, win or lose); non-winner marks stay
//     anonymous;
//   - game over (or room completed): full reveal.
export function wnykGameToDictForViewer(game, viewerMark, roomStatusValue) {
  const projected = structuredClone(game);
  const revealAll = roomStatusValue === "completed" || projected.status === "complete";
  if (Array.isArray(projected.players)) {
    projected.players = projected.players.map((seat) => (seat.mark === viewerMark || revealAll ? seat : {
      ...seat,
      hand: Array.isArray(seat.hand) ? seat.hand.map(() => null) : [],
    }));
  }
  if (!Array.isArray(projected.submissions)) return projected;
  if (revealAll) return projected;
  if (projected.phase === "submitting") {
    projected.submissions = projected.submissions.filter((submission) => submission.mark === viewerMark);
    return projected;
  }
  const winnerId = projected.round_result && projected.round_result.type === "win"
    ? projected.round_result.submission_id
    : null;
  projected.submissions = projected.submissions.map((submission) => {
    const revealed = projected.phase === "round_end" && submission.id === winnerId;
    if (revealed) return submission;
    const maskWriteinAuthor = projected.phase === "judging";
    return {
      ...submission,
      mark: null,
      cards: (submission.cards || []).map((card) => (card && card.writein && maskWriteinAuthor ? { ...card, author: null } : card)),
    };
  });
  return projected;
}

export function wnykScoreByMark(game) {
  normalizeWnykGame(game);
  const scores = {};
  game.seat_order.forEach((mark) => { scores[mark] = Number(game.players[mark].score || 0); });
  return scores;
}

function normalizeWnykGame(game) {
  game.game_id = WNYK_GAME_ID;
  game.status = game.status === "complete" ? "complete" : "playing";
  if (!game.options || typeof game.options !== "object") game.options = {};
  game.options = {
    target_score: clampInteger(game.options.target_score, TARGET_SCORE_MIN, TARGET_SCORE_MAX, TARGET_SCORE_DEFAULT),
    deck: Object.prototype.hasOwnProperty.call(wnykDecks, game.options.deck) ? game.options.deck : "classic",
  };
  game.custom_pool = normalizeWnykCustomCards(game.custom_pool);
  game.round = clampInteger(game.round, 0, 999999, 0);
  game.phase = WNYK_PHASES.includes(game.phase) ? game.phase : "submitting";
  game.seat_order = Array.isArray(game.seat_order) ? game.seat_order.map(String) : [];
  if (!game.players || typeof game.players !== "object") game.players = {};
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark] || {};
    game.players[mark] = {
      name: String(seat.name || mark).trim().slice(0, 40) || mark,
      hand: Array.isArray(seat.hand) ? seat.hand.filter((ref) => ref && typeof ref === "object").slice(0, WNYK_HAND_SIZE) : [],
      score: clampInteger(seat.score, 0, 999999, 0),
      likes: clampInteger(seat.likes, 0, 999999, 0),
      blank_received: Boolean(seat.blank_received),
      pending_blank: Boolean(seat.pending_blank),
      submitted: Boolean(seat.submitted),
      skipped: Boolean(seat.skipped),
      is_bot: Boolean(seat.is_bot),
    };
  });
  game.judge = game.seat_order.includes(game.judge) ? game.judge : null;
  game.black_card = game.black_card && typeof game.black_card === "object"
    ? { text: String(game.black_card.text || ""), pick: clampInteger(game.black_card.pick, 1, 3, 1) }
    : null;
  game.draw_pile = Array.isArray(game.draw_pile) ? game.draw_pile : [];
  game.black_pile = Array.isArray(game.black_pile) ? game.black_pile : [];
  game.submissions = Array.isArray(game.submissions)
    ? game.submissions.filter((submission) => submission && game.seat_order.includes(submission.mark) && Array.isArray(submission.cards))
    : [];
  game.final_pick = Number.isInteger(game.final_pick) ? game.final_pick : null;
  game.round_result = game.round_result || null;
  game.new_custom_cards = Array.isArray(game.new_custom_cards) ? game.new_custom_cards.slice(0, 200) : [];
  game.most_liked = game.most_liked || null;
  game.winner = game.seat_order.includes(game.winner) ? game.winner : null;
  game.skip_votes = normalizeSkipVotes(game.skip_votes);
  game.phase_started_at = Number.isFinite(game.phase_started_at) ? game.phase_started_at : 0;
  game.move_count = clampInteger(game.move_count, 0, 999999, 0);
  game.last_move = game.last_move || null;
  game.events = Array.isArray(game.events) ? game.events.slice(-60) : [];
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
  } else if (type === "like" || type === "unlike") {
    applyWnykLike(game, mark, Number(action.submission), type === "like");
  } else if (type === "promote") {
    applyWnykPromote(game, mark, action.submission);
  } else if (type === "confirm") {
    applyWnykConfirm(game, mark);
  } else if (type === "next_round") {
    applyWnykNextRound(game);
  } else if (type === "skip_vote") {
    applyWnykSkipVote(game, mark, String(action.target || ""));
  } else {
    throw new Error("Action must be submit, like, unlike, promote, confirm, next_round, or skip_vote.");
  }
  game.skip_votes = pruneSkipVotes(game.skip_votes, (target) => wnykSkipEligibility(game, target));
  resolveWnykBots(game);
}

function applyWnykSubmit(game, mark, indices, writeinText) {
  if (game.phase !== "submitting") throw new Error("Submissions are closed — the judge is deciding.");
  if (mark === game.judge) throw new Error("The judge sits this one out — you pick the winner.");
  const seat = game.players[mark];
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

function applyWnykLike(game, mark, id, liked) {
  assertWnykJudge(game, mark);
  const submission = wnykSubmissionById(game, id);
  submission.liked = liked;
  if (!liked && game.final_pick === id) game.final_pick = null;
  game.move_count += 1;
  game.last_move = { type: liked ? "like" : "unlike", submission: id, move_count: game.move_count };
  pushWnykEvent(game, game.last_move);
}

function applyWnykPromote(game, mark, id) {
  assertWnykJudge(game, mark);
  if (id === null || id === undefined || id === "") {
    game.final_pick = null;
  } else {
    game.final_pick = wnykSubmissionById(game, Number(id)).id;
  }
  game.move_count += 1;
  game.last_move = { type: "promote", submission: game.final_pick, move_count: game.move_count };
  pushWnykEvent(game, game.last_move);
}

function applyWnykConfirm(game, mark) {
  assertWnykJudge(game, mark);
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
    if (game.phase === "submitting") {
      const pending = wnykSubmitterMarks(game).find((mark) => {
        const seat = game.players[mark];
        return seat.is_bot && !seat.submitted && !seat.skipped;
      });
      if (!pending) return; // waiting on humans (or the reveal already fired)
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
      (choice && Array.isArray(choice.likes) ? choice.likes : []).forEach((id) => {
        if (game.submissions.some((submission) => submission.id === id)) applyWnykLike(game, game.judge, id, true);
      });
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
