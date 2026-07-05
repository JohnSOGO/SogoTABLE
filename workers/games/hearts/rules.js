// Hearts — server-authoritative rules + the per-viewer hidden-information
// sanitizer. Pure logic: no routing/auth/persistence, no DOM, no timers. The
// Worker imports the exports below via the handlers table and calls
// initHeartsSeats from startRoom/reset; bots resolve internally through the
// same pass/play internals humans use, with the decision policy in ./ai.js.
//
// Ruleset (v1, classic 4-player Hearts): 13 cards each, pass 3 (left, right,
// across, hold — rotating by round), the 2♣ opens, follow suit, hearts may not
// lead until broken, each ♥ = 1 point and the Q♠ = 13, LOWEST total wins when
// someone reaches the target at a round boundary. Taking every heart plus the
// Q♠ shoots the moon. Host options at table creation: Jack of Diamonds (J♦
// scores −10), no blood on the first trick (default on), moon style (old:
// others +26 / new: shooter −26), and the target score (50/75/100). Hearts is
// ALWAYS exactly four seats (MojoSOGO 2026-07-04) — bots fill the table.
// Hot-seat is a deliberate exclusion for a hidden-hand game (Liar's Dice
// precedent).
//
// DANGER ZONE: heartsGameToDictForViewer is the ONLY thing hiding the other
// three hands (and everyone's pass selections, and the current player's legal
// plays — legal plays are a subset of a hand, so they leak). Cards taken as
// points are public: they were played face up. Keep its behaviour exactly.
//
// RNG: deals flow through one seedable seam (setHeartsRandom); a deal consumes
// one value per Fisher–Yates swap over the 52-card deck.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { cleanGameId } from "../../game-catalog.js";
import { clampInteger } from "../util.js";
import { heartsBotPassCards, heartsBotPlayCard } from "./ai.js";

export const HEARTS_GAME_ID = GAME_IDS.hearts;
export const HEARTS_SEATS = 4;
const RANKS = "23456789TJQKA";
const SUITS = "CDSH"; // also the canonical hand sort: clubs, diamonds, spades, hearts
const QUEEN_OF_SPADES = "QS";
const JACK_OF_DIAMONDS = "JD";
const TWO_OF_CLUBS = "2C";
const PASS_CYCLE = ["left", "right", "across", "hold"];
const PASS_OFFSET = { left: 1, right: 3, across: 2, hold: 0 };
const MOON_STYLES = ["old", "new"];
const TARGET_SCORES = [50, 75, 100];
const CARD_RE = /^[23456789TJQKA][CDSH]$/;

export function isHeartsGame(game) {
  return Boolean(game && cleanGameId(game.game_id) === HEARTS_GAME_ID);
}

let heartsRandom = Math.random;
export function setHeartsRandom(fn) {
  heartsRandom = typeof fn === "function" ? fn : Math.random;
}

// ---------- card helpers (exported for tests + the shared client sort) ----------

export function heartsRankValue(card) { return RANKS.indexOf(card[0]) + 2; }
export function heartsSuit(card) { return card[1]; }
function isHeart(card) { return card[1] === "H"; }
function isBlood(card) { return isHeart(card) || card === QUEEN_OF_SPADES; }

function heartsCardPoints(card, options) {
  if (isHeart(card)) return 1;
  if (card === QUEEN_OF_SPADES) return 13;
  if (options.jack_of_diamonds && card === JACK_OF_DIAMONDS) return -10;
  return 0;
}

export function sortHeartsHand(cards) {
  return cards.slice().sort((a, b) => {
    const suit = SUITS.indexOf(a[1]) - SUITS.indexOf(b[1]);
    return suit !== 0 ? suit : heartsRankValue(a) - heartsRankValue(b);
  });
}

// ---------- game construction ----------

export function newHeartsGame() {
  return {
    game_id: HEARTS_GAME_ID,
    status: "playing",
    options: { jack_of_diamonds: false, no_blood_first_trick: true, moon_style: "old", target_score: 100 },
    round: 0,
    phase: "passing", // passing | playing | round_end
    pass_direction: null,
    seat_order: [],
    players: {},
    current_player: null,
    leader: null,
    trick: [], // [{ mark, card }] — the trick being built, public
    last_trick: null, // { winner, plays, points } — kept for the UI
    hearts_broken: false,
    first_trick: true,
    round_results: null, // { base, final, moon_shooter } for the round just scored
    winner: null,
    move_count: 0,
    last_move: null,
    events: [],
  };
}

// Host options from table creation (/api/room/start payload). Clamp
// defensively — the payload crosses the wire.
export function setHeartsOptions(game, payload) {
  if (!payload || typeof payload !== "object") return;
  const options = game.options;
  if (payload.jack_of_diamonds !== undefined) options.jack_of_diamonds = Boolean(payload.jack_of_diamonds);
  if (payload.no_blood_first_trick !== undefined) options.no_blood_first_trick = Boolean(payload.no_blood_first_trick);
  if (MOON_STYLES.includes(payload.moon_style)) options.moon_style = payload.moon_style;
  if (TARGET_SCORES.includes(Number(payload.target_score))) options.target_score = Number(payload.target_score);
}

export function initHeartsSeats(game, seats) {
  game.seat_order = [];
  game.players = {};
  (Array.isArray(seats) ? seats : []).forEach((seat) => {
    const mark = String(seat && seat.mark || "").trim();
    if (!mark) return;
    game.seat_order.push(mark);
    game.players[mark] = {
      hand: [],
      has_passed: false,
      pass_cards: null, // SECRET until the pass completes (then they're in a hand)
      received: null,   // viewer-own only: the 3 cards this seat was handed
      tricks: 0,
      points_taken: [], // point cards this seat has taken THIS round (public — played face up)
      round_points: 0,
      score: 0,
      is_bot: Boolean(seat && seat.kind === "bot"),
    };
  });
  if (game.seat_order.length !== HEARTS_SEATS) {
    throw new Error("Hearts seats exactly 4 — invite players or bots to fill the table.");
  }
  game.status = "playing";
  game.round = 0;
  game.winner = null;
  game.move_count = 0;
  game.last_move = null;
  game.events = [];
  startHeartsRound(game);
  resolveHeartsBots(game);
}

function startHeartsRound(game) {
  game.round += 1;
  game.pass_direction = PASS_CYCLE[(game.round - 1) % PASS_CYCLE.length];
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(rank + suit);
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(heartsRandom() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  game.seat_order.forEach((mark, seatIndex) => {
    const seat = game.players[mark];
    seat.hand = sortHeartsHand(deck.slice(seatIndex * 13, seatIndex * 13 + 13));
    seat.has_passed = false;
    seat.pass_cards = null;
    seat.received = null;
    seat.tricks = 0;
    seat.points_taken = [];
    seat.round_points = 0;
  });
  game.trick = [];
  game.last_trick = null;
  game.hearts_broken = false;
  game.first_trick = true;
  game.round_results = null;
  game.current_player = null;
  game.leader = null;
  game.move_count += 1;
  game.last_move = { type: "deal", round: game.round, pass_direction: game.pass_direction, move_count: game.move_count };
  pushHeartsEvent(game, game.last_move);
  if (game.pass_direction === "hold") beginHeartsPlay(game);
  else game.phase = "passing";
}

function beginHeartsPlay(game) {
  game.phase = "playing";
  const opener = game.seat_order.find((mark) => game.players[mark].hand.includes(TWO_OF_CLUBS));
  game.current_player = opener;
  game.leader = opener;
  game.trick = [];
}

// ---------- queries ----------

// The current player's legal cards. Empty for anyone else. This is the ONE
// place play legality lives; the UI renders it, never re-derives it.
export function legalHeartsPlays(game, mark) {
  if (game.status !== "playing" || game.phase !== "playing" || mark !== game.current_player) return [];
  const hand = game.players[mark].hand;
  if (game.first_trick && game.trick.length === 0) {
    return hand.includes(TWO_OF_CLUBS) ? [TWO_OF_CLUBS] : [];
  }
  let candidates;
  if (game.trick.length === 0) {
    // Leading: hearts only once broken — unless hearts are all that's left.
    candidates = game.hearts_broken ? hand.slice() : hand.filter((card) => !isHeart(card));
    if (!candidates.length) candidates = hand.slice();
  } else {
    const led = heartsSuit(game.trick[0].card);
    const inSuit = hand.filter((card) => heartsSuit(card) === led);
    candidates = inSuit.length ? inSuit : hand.slice();
  }
  if (game.first_trick && game.options.no_blood_first_trick) {
    const clean = candidates.filter((card) => !isBlood(card));
    if (clean.length) candidates = clean;
  }
  return candidates;
}

// ---------- projections ----------

export function heartsGameToDict(game) {
  normalizeHeartsGame(game);
  const players = game.seat_order.map((mark) => {
    const seat = game.players[mark];
    return {
      mark,
      hand: seat.hand.slice(),
      has_passed: seat.has_passed,
      received: seat.received ? seat.received.slice() : null,
      tricks: seat.tricks,
      points_taken: seat.points_taken.slice(),
      round_points: seat.round_points,
      score: seat.score,
      is_bot: seat.is_bot,
      is_turn: game.status === "playing" && game.phase === "playing" && mark === game.current_player,
    };
  });
  const { players: _seats, ...publicGame } = game;
  return {
    ...publicGame,
    game_id: HEARTS_GAME_ID,
    players,
    legal_plays: game.current_player ? legalHeartsPlays(game, game.current_player) : [],
  };
}

// Per-viewer projection (dispatched from the Worker's gameToDictForViewer seam,
// the Liar's Dice precedent). Receives the DICT shape (players as an array).
// A viewer sees only their own hand and received cards; other hands mask to
// nulls (count preserved), and legal_plays — a subset of a hand — masks unless
// the viewer IS the current player. Point cards taken are public (played face
// up). Nothing un-masks at game end: hands are empty by then anyway.
export function heartsGameToDictForViewer(game, viewerMark) {
  const projected = structuredClone(game);
  if (Array.isArray(projected.players)) {
    projected.players = projected.players.map((seat) => (seat.mark === viewerMark ? seat : {
      ...seat,
      hand: Array.isArray(seat.hand) ? seat.hand.map(() => null) : [],
      received: null,
    }));
  }
  if (viewerMark !== projected.current_player) projected.legal_plays = null;
  return projected;
}

// Final standing for stats: LOWER is better in Hearts (like No Thanks!).
export function heartsScoreByMark(game) {
  normalizeHeartsGame(game);
  const scores = {};
  game.seat_order.forEach((mark) => { scores[mark] = Number(game.players[mark].score || 0); });
  return scores;
}

function normalizeHeartsGame(game) {
  game.game_id = HEARTS_GAME_ID;
  game.status = game.status === "complete" ? "complete" : "playing";
  if (!game.options || typeof game.options !== "object") game.options = {};
  game.options = {
    jack_of_diamonds: Boolean(game.options.jack_of_diamonds),
    no_blood_first_trick: game.options.no_blood_first_trick !== false,
    moon_style: MOON_STYLES.includes(game.options.moon_style) ? game.options.moon_style : "old",
    target_score: TARGET_SCORES.includes(Number(game.options.target_score)) ? Number(game.options.target_score) : 100,
  };
  game.round = clampInteger(game.round, 0, 999999, 0);
  game.phase = ["passing", "playing", "round_end"].includes(game.phase) ? game.phase : "passing";
  game.pass_direction = PASS_CYCLE.includes(game.pass_direction) ? game.pass_direction : null;
  game.seat_order = Array.isArray(game.seat_order) ? game.seat_order.map(String) : [];
  if (!game.players || typeof game.players !== "object") game.players = {};
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark] || {};
    game.players[mark] = {
      hand: normalizeHeartsCards(seat.hand, 13),
      has_passed: Boolean(seat.has_passed),
      pass_cards: Array.isArray(seat.pass_cards) ? normalizeHeartsCards(seat.pass_cards, 3) : null,
      received: Array.isArray(seat.received) ? normalizeHeartsCards(seat.received, 3) : null,
      tricks: clampInteger(seat.tricks, 0, 13, 0),
      points_taken: normalizeHeartsCards(seat.points_taken, 16),
      round_points: clampInteger(seat.round_points, -10, 26, 0),
      score: clampInteger(seat.score, -9999, 9999, 0),
      is_bot: Boolean(seat.is_bot),
    };
  });
  game.current_player = game.seat_order.includes(game.current_player) ? game.current_player : null;
  game.leader = game.seat_order.includes(game.leader) ? game.leader : null;
  game.trick = Array.isArray(game.trick)
    ? game.trick.filter((play) => play && game.seat_order.includes(play.mark) && CARD_RE.test(play.card)).slice(0, 4)
    : [];
  game.last_trick = game.last_trick || null;
  game.hearts_broken = Boolean(game.hearts_broken);
  game.first_trick = Boolean(game.first_trick);
  game.round_results = game.round_results || null;
  game.winner = game.seat_order.includes(game.winner) ? game.winner : null;
  game.move_count = clampInteger(game.move_count, 0, 999999, 0);
  game.last_move = game.last_move || null;
  game.events = Array.isArray(game.events) ? game.events.slice(-90) : [];
}

function normalizeHeartsCards(cards, max) {
  if (!Array.isArray(cards)) return [];
  return cards.filter((card) => typeof card === "string" && CARD_RE.test(card)).slice(0, max);
}

// ---------- transitions ----------

export function makeHeartsMove(game, mark, action) {
  normalizeHeartsGame(game);
  if (game.status === "complete") throw new Error("Game is complete.");
  const seat = game.players[mark];
  if (!seat) throw new Error("You are not seated in this game.");
  if (seat.is_bot) throw new Error("Bot seats play automatically.");
  const type = String(action && action.type || "").trim();
  if (type === "pass") applyHeartsPass(game, mark, Array.isArray(action.cards) ? action.cards.map(String) : []);
  else if (type === "play") applyHeartsPlay(game, mark, String(action.card || ""));
  else if (type === "next_round") applyHeartsNextRound(game);
  else throw new Error("Hearts action must be pass, play, or next_round.");
  resolveHeartsBots(game);
}

function applyHeartsPass(game, mark, cards) {
  if (game.phase !== "passing") throw new Error("The passing phase is over — play a card instead.");
  const seat = game.players[mark];
  if (seat.has_passed) throw new Error("You already chose your three cards to pass.");
  if (cards.length !== 3 || new Set(cards).size !== 3) throw new Error("Pass exactly three different cards.");
  cards.forEach((card) => {
    if (!seat.hand.includes(card)) throw new Error(`You do not hold ${card}.`);
  });
  seat.pass_cards = cards.slice();
  seat.has_passed = true;
  game.move_count += 1;
  // No cards on the event — pass selections are secret until the swap.
  game.last_move = { type: "passed", mark, move_count: game.move_count };
  pushHeartsEvent(game, game.last_move);
  if (game.seat_order.every((seatMark) => game.players[seatMark].has_passed)) {
    completeHeartsPass(game);
  }
}

function completeHeartsPass(game) {
  const offset = PASS_OFFSET[game.pass_direction];
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    seat.hand = seat.hand.filter((card) => !seat.pass_cards.includes(card));
  });
  game.seat_order.forEach((mark, seatIndex) => {
    const toMark = game.seat_order[(seatIndex + offset) % HEARTS_SEATS];
    const receiver = game.players[toMark];
    receiver.received = game.players[mark].pass_cards.slice();
    receiver.hand = sortHeartsHand(receiver.hand.concat(receiver.received));
  });
  game.seat_order.forEach((mark) => { game.players[mark].pass_cards = null; });
  game.move_count += 1;
  game.last_move = { type: "pass_complete", pass_direction: game.pass_direction, move_count: game.move_count };
  pushHeartsEvent(game, game.last_move);
  beginHeartsPlay(game);
}

function applyHeartsPlay(game, mark, card) {
  if (game.phase === "passing") throw new Error("Choose three cards to pass first.");
  if (game.phase !== "playing") throw new Error("The round is scored — start the next round first.");
  if (mark !== game.current_player) throw new Error(`It is ${game.current_player}'s turn.`);
  const legal = legalHeartsPlays(game, mark);
  if (!legal.includes(card)) {
    throw new Error(`${card || "That card"} is not a legal play (legal: ${legal.join(", ")}).`);
  }
  const seat = game.players[mark];
  seat.hand = seat.hand.filter((held) => held !== card);
  game.trick.push({ mark, card });
  if (isHeart(card)) game.hearts_broken = true;
  const trickFull = game.trick.length === HEARTS_SEATS;
  const nextMark = trickFull ? null : game.seat_order[(game.seat_order.indexOf(mark) + 1) % HEARTS_SEATS];
  game.move_count += 1;
  game.last_move = { type: "play", mark, card, next: nextMark, move_count: game.move_count };
  pushHeartsEvent(game, game.last_move);
  if (trickFull) resolveHeartsTrick(game);
  else game.current_player = nextMark;
}

function resolveHeartsTrick(game) {
  const plays = game.trick;
  const led = heartsSuit(plays[0].card);
  let winning = plays[0];
  plays.forEach((play) => {
    if (heartsSuit(play.card) === led && heartsRankValue(play.card) > heartsRankValue(winning.card)) winning = play;
  });
  const winner = game.players[winning.mark];
  winner.tricks += 1;
  let trickPoints = 0;
  plays.forEach((play) => {
    const points = heartsCardPoints(play.card, game.options);
    if (points !== 0) {
      winner.points_taken.push(play.card);
      trickPoints += points;
    }
  });
  winner.round_points = winner.points_taken.reduce((sum, card) => sum + heartsCardPoints(card, game.options), 0);
  game.last_trick = { winner: winning.mark, plays: plays.slice(), points: trickPoints };
  game.trick = [];
  game.first_trick = false;
  game.move_count += 1;
  game.last_move = { type: "trick", winner: winning.mark, plays: game.last_trick.plays, points: trickPoints, move_count: game.move_count };
  pushHeartsEvent(game, game.last_move);
  if (game.seat_order.every((mark) => game.players[mark].hand.length === 0)) {
    finishHeartsRound(game);
    return;
  }
  game.current_player = winning.mark;
  game.leader = winning.mark;
}

function finishHeartsRound(game) {
  const options = game.options;
  const base = {};
  const jd = {};
  let moonShooter = null;
  game.seat_order.forEach((mark) => {
    const taken = game.players[mark].points_taken;
    base[mark] = taken.reduce((sum, card) => sum + heartsCardPoints(card, options), 0);
    jd[mark] = options.jack_of_diamonds && taken.includes(JACK_OF_DIAMONDS) ? -10 : 0;
    const hearts = taken.filter(isHeart).length;
    if (hearts === 13 && taken.includes(QUEEN_OF_SPADES)) moonShooter = mark;
  });
  const final = {};
  game.seat_order.forEach((mark) => {
    if (moonShooter === null) {
      final[mark] = base[mark];
    } else if (options.moon_style === "old") {
      // Old moon: the shooter's 26 points land on everyone else instead.
      final[mark] = mark === moonShooter ? jd[mark] : 26 + jd[mark];
    } else {
      // New moon: the shooter subtracts 26 from their own total.
      final[mark] = mark === moonShooter ? -26 + jd[mark] : jd[mark];
    }
    game.players[mark].score += final[mark];
  });
  game.round_results = { base, final, moon_shooter: moonShooter };
  game.current_player = null;
  game.leader = null;
  game.move_count += 1;
  const totals = Object.fromEntries(game.seat_order.map((mark) => [mark, game.players[mark].score]));
  game.last_move = { type: "round_end", round: game.round, round_scores: final, totals, moon_shooter: moonShooter, move_count: game.move_count };
  pushHeartsEvent(game, game.last_move);

  const scores = game.seat_order.map((mark) => game.players[mark].score);
  if (Math.max(...scores) >= options.target_score) {
    const lowest = Math.min(...scores);
    const leaders = game.seat_order.filter((mark) => game.players[mark].score === lowest);
    if (leaders.length === 1) {
      game.status = "complete";
      game.phase = "round_end";
      game.winner = leaders[0];
      game.move_count += 1;
      game.last_move = { type: "complete", winner: game.winner, move_count: game.move_count };
      pushHeartsEvent(game, game.last_move);
      return;
    }
    // Tied for the lead at the finish line: play another round (classic rule).
  }
  game.phase = "round_end";
}

function applyHeartsNextRound(game) {
  if (game.phase !== "round_end") throw new Error("The round is still being played.");
  startHeartsRound(game);
}

function pushHeartsEvent(game, event) {
  game.events.push(event);
  game.events = game.events.slice(-90);
}

// Bot turns run through the SAME pass/play internals a human move uses — no
// bot-only legality. The chain stops at a human's decision (their pass, their
// play, or a round_end a human should get to read before continuing). A
// bots-only table plays itself out. The guard bounds a pathological game far
// above any real one (a round is 4 passes + 52 plays + bookkeeping; a game to
// 100 rarely passes ~15 rounds).
function resolveHeartsBots(game) {
  for (let guard = 0; guard < 10000; guard += 1) {
    if (game.status !== "playing") return;
    if (game.phase === "passing") {
      const pending = game.seat_order.find((mark) => !game.players[mark].has_passed && game.players[mark].is_bot);
      if (!pending) return; // waiting on a human's selection
      const seat = game.players[pending];
      let cards = heartsBotPassCards({ hand: seat.hand.slice(), random: heartsRandom });
      const valid = Array.isArray(cards) && cards.length === 3 && new Set(cards).size === 3
        && cards.every((card) => seat.hand.includes(card));
      if (!valid) cards = seat.hand.slice(-3); // a confused policy must not wedge the table
      applyHeartsPass(game, pending, cards);
      continue;
    }
    if (game.phase === "playing") {
      const mark = game.current_player;
      const seat = mark ? game.players[mark] : null;
      if (!seat || !seat.is_bot) return;
      const legal = legalHeartsPlays(game, mark);
      let card = heartsBotPlayCard({
        hand: seat.hand.slice(),
        legal: legal.slice(),
        trick: game.trick.map((play) => play.card),
        heartsBroken: game.hearts_broken,
        random: heartsRandom,
      });
      if (!legal.includes(card)) card = legal[0]; // safe default for a confused policy
      applyHeartsPlay(game, mark, card);
      continue;
    }
    if (game.phase === "round_end") {
      // A human at the table reads the score sheet and taps Next Round;
      // a bots-only table deals itself forward.
      if (game.seat_order.some((mark) => !game.players[mark].is_bot)) return;
      startHeartsRound(game);
      continue;
    }
    return;
  }
  throw new Error("Hearts bot resolution exceeded its guard — this is a bug.");
}
