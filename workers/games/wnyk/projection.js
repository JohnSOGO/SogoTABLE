// Projection + normalization cluster for Well, Now You Know — its own seam
// beside rules.js so the rules file stays under the global cap. Owns the
// public dict shape (wnykGameToDict), the per-viewer hidden-information
// sanitizer (wnykGameToDictForViewer), card-face materialization, and the
// untrusted-state normalizer the transitions run through. Pure logic, same
// contract as rules.js.
//
// DANGER ZONE: wnykGameToDictForViewer is the ONLY thing hiding other hands,
// pre-reveal submissions, read-aloud cards past the cursor, and pre-confirm
// authorship (fresh write-in attribution included — a this-round write-in
// names its submitter). Library custom-card attribution is public card-face
// text and never masks. Keep its behaviour exactly.
import { WNYK_DECKS } from "./decks.js";
import { clampInteger } from "../util.js";
import { normalizeSkipVotes } from "../skip-vote.js";
import {
  wnykRateCardKey, normalizeWnykSeatRatings, normalizeWnykRemovedCards,
  normalizeWnykNewCardRatings, normalizeWnykCardStats, normalizeWnykCardUsage,
} from "./ratings.js";
import {
  WNYK_GAME_ID, WNYK_HAND_SIZE, WNYK_HOUSE_PACK, WNYK_WRITEIN_MAX_LENGTH,
  WNYK_SKIP_DELAY_MS, WNYK_PHASES, TARGET_SCORE_MIN, TARGET_SCORE_MAX,
  TARGET_SCORE_DEFAULT, wnykDeckData,
} from "./runtime.js";

export function wnykDeck(game) {
  return wnykDeckData()[game.options.deck] || wnykDeckData().classic || WNYK_DECKS.classic;
}

export function cleanWnykText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, WNYK_WRITEIN_MAX_LENGTH);
}

export function normalizeWnykCustomCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards
    .map((card) => ({
      text: cleanWnykText(card && card.text),
      author: String(card && card.author || "").trim().slice(0, 40),
      // Library id — carried so rating keys can name the card (`custom:<id>`).
      id: String(card && card.id || "").trim().slice(0, 40),
    }))
    .filter((card) => card.text)
    .slice(0, 500);
}

// Every face carries `pack` — the small centered provenance label at the
// bottom of the card. House-made cards (blanks, write-ins, library customs)
// all read "House Deck"; deck cards carry their generated pack label.
function wnykCardFace(game, ref) {
  if (!ref || typeof ref !== "object") return null;
  if (ref.b) return { blank: true, text: null, author: null, writein: false, pack: WNYK_HOUSE_PACK };
  if (ref.w !== undefined) return { blank: false, text: String(ref.w), author: game.players[ref.by] ? game.players[ref.by].name : String(ref.by || ""), writein: true, pack: WNYK_HOUSE_PACK };
  if (ref.c !== undefined) {
    const card = game.custom_pool[ref.c];
    return card ? { blank: false, text: card.text, author: card.author, writein: false, pack: WNYK_HOUSE_PACK } : null;
  }
  const card = wnykDeck(game).white[ref.i];
  return card === undefined ? null : { blank: false, text: card.text, author: null, writein: false, pack: card.pack || null };
}

export function wnykGameToDict(game) {
  normalizeWnykGame(game);
  const players = game.seat_order.map((mark) => {
    const seat = game.players[mark];
    return {
      mark,
      name: seat.name,
      hand: seat.hand.map((ref) => wnykCardFace(game, ref)),
      // Rate keys line up index-for-index with `hand` so the client can draw
      // the thumbs; null = not rateable (blanks, write-ins).
      hand_rate_keys: seat.hand.map((ref) => wnykRateCardKey(game, ref)),
      ratings: { ...seat.ratings },
      dump_used: seat.dump_used,
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
    card_stats: _stats, // redundant with the new_card_ratings aggregate
    card_usage: _usage, // deal-priority input data, not table state
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
//   - judging stage 1 (read-aloud): cards past reveal_cursor are hidden from
//     EVERYONE, judge included — texts drop, the count stays;
//   - judging: revealed submission texts are public in their shuffled order,
//     but every submitter mark and every fresh write-in author masks — the
//     judge is a viewer like any other here (library custom-card authors are
//     card-face text and stay);
//   - round_end: the winning submission reveals its mark ("well, now you
//     know"), and every fresh write-in shows its "written by" credit (spec §5:
//     attribution shows on reveal, win or lose); non-winner marks stay
//     anonymous;
//   - game over (or room completed): full reveal.
export function wnykGameToDictForViewer(game, viewerMark, roomStatusValue) {
  const projected = structuredClone(game);
  const revealAll = roomStatusValue === "completed" || projected.status === "complete";
  // Prompt stage: the black card is JUDGE-ONLY until released — everyone else
  // just knows the judge is reading (the phase itself is public). The judge's
  // remaining swap budget is equally their own business.
  if (projected.phase === "prompt" && viewerMark !== projected.judge && !revealAll) {
    projected.black_card = null;
  }
  if (viewerMark !== projected.judge) delete projected.black_swaps;
  if (Array.isArray(projected.players)) {
    // Ratings, the hand-aligned rate keys (which would name masked hand
    // cards), and the round's dump availability are private to their seat in
    // EVERY phase — full reveal included.
    projected.players = projected.players.map((seat) => {
      if (seat.mark === viewerMark) return seat;
      const { ratings: _ratings, hand_rate_keys: _keys, dump_used: _dump, ...masked } = seat;
      return revealAll ? masked : {
        ...masked,
        hand: Array.isArray(seat.hand) ? seat.hand.map(() => null) : [],
      };
    });
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
    // Read-aloud (stage 1): cards past the cursor are hidden from EVERYONE,
    // judge included — texts drop, the count stays.
    if (projected.phase === "judging" && Number.isInteger(projected.reveal_cursor)
      && submission.id > projected.reveal_cursor) {
      return {
        ...submission,
        mark: null,
        liked: false,
        has_writein: false,
        cards: (submission.cards || []).map(() => null),
      };
    }
    const maskWriteinAuthor = projected.phase === "judging";
    return {
      ...submission,
      mark: null,
      cards: (submission.cards || []).map((card) => (card && card.writein && maskWriteinAuthor ? { ...card, author: null } : card)),
    };
  });
  return projected;
}

export function normalizeWnykGame(game) {
  game.game_id = WNYK_GAME_ID;
  game.status = game.status === "complete" ? "complete" : "playing";
  if (!game.options || typeof game.options !== "object") game.options = {};
  game.options = {
    target_score: clampInteger(game.options.target_score, TARGET_SCORE_MIN, TARGET_SCORE_MAX, TARGET_SCORE_DEFAULT),
    deck: Object.prototype.hasOwnProperty.call(wnykDeckData(), game.options.deck) ? game.options.deck : "classic",
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
      dump_used: Boolean(seat.dump_used),
      ratings: normalizeWnykSeatRatings(seat.ratings),
      is_bot: Boolean(seat.is_bot),
    };
  });
  game.judge = game.seat_order.includes(game.judge) ? game.judge : null;
  game.black_card = game.black_card && typeof game.black_card === "object"
    ? {
      text: String(game.black_card.text || ""),
      pick: clampInteger(game.black_card.pick, 1, 3, 1),
      pack: game.black_card.pack ? String(game.black_card.pack) : null,
      // Deck index — carried so black-card rating keys ("<deck>:b:<i>") can
      // name the prompt; null for pre-provenance persisted states.
      i: Number.isInteger(game.black_card.i) ? game.black_card.i : null,
    }
    : null;
  game.black_swaps = clampInteger(game.black_swaps, 0, 999999, 0);
  game.released_at = Number.isFinite(game.released_at) ? game.released_at : 0;
  game.draw_pile = Array.isArray(game.draw_pile) ? game.draw_pile : [];
  game.black_pile = Array.isArray(game.black_pile) ? game.black_pile : [];
  game.submissions = Array.isArray(game.submissions)
    ? game.submissions.filter((submission) => submission && game.seat_order.includes(submission.mark) && Array.isArray(submission.cards))
    : [];
  game.reveal_cursor = clampInteger(game.reveal_cursor, 0, 999999, 0);
  game.final_pick = Number.isInteger(game.final_pick) ? game.final_pick : null;
  game.round_result = game.round_result || null;
  game.new_custom_cards = Array.isArray(game.new_custom_cards) ? game.new_custom_cards.slice(0, 200) : [];
  game.new_card_ratings = normalizeWnykNewCardRatings(game.new_card_ratings);
  game.card_stats = normalizeWnykCardStats(game.card_stats);
  game.card_usage = normalizeWnykCardUsage(game.card_usage);
  game.removed_cards = normalizeWnykRemovedCards(game.removed_cards);
  game.most_liked = game.most_liked || null;
  game.winner = game.seat_order.includes(game.winner) ? game.winner : null;
  game.skip_votes = normalizeSkipVotes(game.skip_votes);
  game.phase_started_at = Number.isFinite(game.phase_started_at) ? game.phase_started_at : 0;
  game.move_count = clampInteger(game.move_count, 0, 999999, 0);
  game.last_move = game.last_move || null;
  game.events = Array.isArray(game.events) ? game.events.slice(-60) : [];
}
