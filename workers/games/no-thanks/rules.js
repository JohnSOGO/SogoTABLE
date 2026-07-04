// No Thanks! — server-authoritative rules + the per-viewer hidden-information
// sanitizer. Pure logic: no routing/auth/persistence, no DOM, no timers. The
// Worker imports the exports below and calls initNoThanksSeats from
// startRoom/reset; bots resolve internally through the same take/pass
// internals humans use, with the decision policy in ./ai.js.
//
// Ruleset (v1, the classic Schmidt Spiele game): a deck of cards 3–35 with 9
// removed unseen (24 cards in play). One card is face up at a time. On your
// turn you either TAKE the card (plus every chip on it — and then decide again
// on the next flipped card) or say NO THANKS by paying 1 chip onto the card,
// which passes the decision clockwise. Out of chips = forced take. The game
// ends when the last card is taken. Score = the LOWEST card of each
// consecutive run you hold, summed, minus your chips — lowest total wins.
// 3–5 players start with 11 chips, 6 players 9, 7 players 7.
//
// DANGER ZONE: two secrets live here. (1) Player chip counts are hidden from
// the other seats — noThanksGameToDictForViewer is the ONLY thing masking
// them; (2) the deck (which 9 cards are missing and the draw order) is hidden
// from EVERYONE — noThanksGameToDict strips it to deck_count before anything
// leaves the Worker. Keep both behaviours exactly.
//
// RNG: the deal flows through one seedable seam (setNoThanksRandom); an init
// consumes one value per shuffle swap (Fisher–Yates over the 33-card deck).
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { cleanGameId } from "../../game-catalog.js";
import { clampInteger } from "../util.js";
import { noThanksBotAction } from "./ai.js";

export const NO_THANKS_GAME_ID = GAME_IDS.noThanks;
export const NO_THANKS_MIN_PLAYERS = 3;
export const NO_THANKS_MAX_PLAYERS = 7;
const NO_THANKS_LOW_CARD = 3;
const NO_THANKS_HIGH_CARD = 35;
const NO_THANKS_REMOVED = 9;

export function isNoThanksGame(game) {
  return Boolean(game && cleanGameId(game.game_id) === NO_THANKS_GAME_ID);
}

let noThanksRandom = Math.random;
export function setNoThanksRandom(fn) {
  noThanksRandom = typeof fn === "function" ? fn : Math.random;
}

export function noThanksStartingChips(playerCount) {
  if (playerCount >= 7) return 7;
  if (playerCount === 6) return 9;
  return 11;
}

export function newNoThanksGame() {
  return {
    game_id: NO_THANKS_GAME_ID,
    status: "playing",
    deck: [], // server-secret draw pile; NEVER leaves via toDict
    current_card: null,
    pot: 0, // chips sitting on the face-up card (public)
    current_player: null,
    seat_order: [],
    players: {},
    winner: null,
    results: null, // filled at game end: public score breakdown, best first
    move_count: 0,
    last_move: null,
    events: [],
  };
}

export function initNoThanksSeats(game, seats) {
  game.seat_order = [];
  game.players = {};
  (Array.isArray(seats) ? seats : []).forEach((seat) => {
    const mark = String(seat && seat.mark || "").trim();
    if (!mark) return;
    game.seat_order.push(mark);
    game.players[mark] = {
      chips: 0,
      cards: [],
      is_bot: Boolean(seat && seat.kind === "bot"),
    };
  });
  const count = game.seat_order.length;
  if (count < NO_THANKS_MIN_PLAYERS || count > NO_THANKS_MAX_PLAYERS) {
    throw new Error(`No Thanks! seats ${NO_THANKS_MIN_PLAYERS}-${NO_THANKS_MAX_PLAYERS} players — invite players or bots.`);
  }
  const chips = noThanksStartingChips(count);
  game.seat_order.forEach((mark) => { game.players[mark].chips = chips; });
  // Fisher–Yates over 3..35, then keep 24: the discarded 9 are never stored,
  // so not even a snapshot leak could reveal them.
  const deck = [];
  for (let card = NO_THANKS_LOW_CARD; card <= NO_THANKS_HIGH_CARD; card += 1) deck.push(card);
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(noThanksRandom() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  game.deck = deck.slice(0, deck.length - NO_THANKS_REMOVED);
  game.status = "playing";
  game.pot = 0;
  game.current_card = game.deck.pop();
  game.current_player = game.seat_order[0];
  game.winner = null;
  game.results = null;
  game.move_count = 0;
  game.last_move = null;
  game.events = [];
  resolveNoThanksBots(game);
}

// ---------- scoring ----------

// The heart of No Thanks: in a run of consecutive cards only the lowest one
// counts. [5,6,7,30] scores 5 + 30.
export function scoreNoThanksCards(cards) {
  const sorted = (Array.isArray(cards) ? cards : []).slice().sort((a, b) => a - b);
  let total = 0;
  sorted.forEach((card, index) => {
    if (index === 0 || card !== sorted[index - 1] + 1) total += card;
  });
  return total;
}

export function noThanksScoreByMark(game) {
  normalizeNoThanksGame(game);
  const scores = {};
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    scores[mark] = scoreNoThanksCards(seat.cards) - seat.chips;
  });
  return scores;
}

// ---------- projections ----------

export function noThanksGameToDict(game) {
  normalizeNoThanksGame(game);
  const players = game.seat_order.map((mark) => {
    const seat = game.players[mark];
    return {
      mark,
      chips: seat.chips,
      cards: seat.cards.slice(),
      card_score: scoreNoThanksCards(seat.cards), // cards are public; the chip half of the score is not
      is_bot: seat.is_bot,
      is_turn: game.status === "playing" && mark === game.current_player,
    };
  });
  const { deck, ...publicGame } = game; // the draw pile is secret from EVERYONE
  return {
    ...publicGame,
    game_id: NO_THANKS_GAME_ID,
    players,
    deck_count: game.deck.length,
  };
}

// Per-viewer projection (dispatched from the Worker's gameToDictForViewer
// seam, the Battleship/Liar's-Dice precedent). Receives the DICT shape
// (players as an array). A viewer sees only their own chip count; everyone
// else's masks to null until the game (or room) completes, when the final
// reveal makes every stack public alongside `results`.
export function noThanksGameToDictForViewer(game, viewerMark, roomStatusValue) {
  const projected = structuredClone(game);
  const revealAll = roomStatusValue === "completed" || projected.status === "complete";
  if (Array.isArray(projected.players)) {
    projected.players = projected.players.map((seat) => ({
      ...seat,
      chips: seat.mark === viewerMark || revealAll ? seat.chips : null,
    }));
  }
  return projected;
}

function normalizeNoThanksGame(game) {
  game.game_id = NO_THANKS_GAME_ID;
  game.status = game.status === "complete" ? "complete" : "playing";
  game.deck = Array.isArray(game.deck)
    ? game.deck.map((card) => clampInteger(card, NO_THANKS_LOW_CARD, NO_THANKS_HIGH_CARD, NO_THANKS_LOW_CARD))
    : [];
  game.current_card = Number.isInteger(game.current_card)
    ? clampInteger(game.current_card, NO_THANKS_LOW_CARD, NO_THANKS_HIGH_CARD, NO_THANKS_LOW_CARD)
    : null;
  game.pot = clampInteger(game.pot, 0, 999, 0);
  game.seat_order = Array.isArray(game.seat_order) ? game.seat_order.map(String) : [];
  if (!game.players || typeof game.players !== "object") game.players = {};
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark] || {};
    game.players[mark] = {
      chips: clampInteger(seat.chips, 0, 999, 0),
      cards: Array.isArray(seat.cards)
        ? seat.cards.map((card) => clampInteger(card, NO_THANKS_LOW_CARD, NO_THANKS_HIGH_CARD, NO_THANKS_LOW_CARD)).sort((a, b) => a - b)
        : [],
      is_bot: Boolean(seat.is_bot),
    };
  });
  game.current_player = game.seat_order.includes(game.current_player) ? game.current_player : null;
  game.winner = game.seat_order.includes(game.winner) ? game.winner : null;
  game.results = Array.isArray(game.results) ? game.results : null;
  game.move_count = clampInteger(game.move_count, 0, 999999, 0);
  game.last_move = game.last_move || null;
  game.events = Array.isArray(game.events) ? game.events.slice(-60) : [];
}

// ---------- transitions ----------

export function makeNoThanksMove(game, mark, action) {
  normalizeNoThanksGame(game);
  if (game.status === "complete") throw new Error("Game is complete.");
  const seat = game.players[mark];
  if (!seat) throw new Error("You are not seated in this game.");
  if (seat.is_bot) throw new Error("Bot seats play automatically.");
  if (mark !== game.current_player) throw new Error(`It is ${game.current_player}'s turn.`);
  const type = String(action && action.type || "").trim();
  if (type === "take") applyNoThanksTake(game, mark);
  else if (type === "pass") applyNoThanksPass(game, mark);
  else throw new Error("No Thanks! action must be take or pass.");
  resolveNoThanksBots(game);
}

function applyNoThanksPass(game, mark) {
  const seat = game.players[mark];
  if (seat.chips <= 0) throw new Error("You are out of chips — you must take the card.");
  seat.chips -= 1;
  game.pot += 1;
  const order = game.seat_order;
  game.current_player = order[(order.indexOf(mark) + 1) % order.length];
  game.move_count += 1;
  // Card + pot ride the public event so the client replay can redraw the
  // table at each step; `next` names who is up (chip totals stay off events).
  game.last_move = { type: "pass", mark, card: game.current_card, pot: game.pot, next: game.current_player, move_count: game.move_count };
  pushNoThanksEvent(game, game.last_move);
}

function applyNoThanksTake(game, mark) {
  const seat = game.players[mark];
  const card = game.current_card;
  seat.cards.push(card);
  seat.cards.sort((a, b) => a - b);
  seat.chips += game.pot;
  const gained = game.pot;
  game.pot = 0;
  game.move_count += 1;
  if (game.deck.length) {
    game.current_card = game.deck.pop();
    // The taker decides first on the fresh card — that is the rule, not a bug.
    game.last_move = { type: "take", mark, card, chips_gained: gained, next_card: game.current_card, next: mark, move_count: game.move_count };
    pushNoThanksEvent(game, game.last_move);
    return;
  }
  game.last_move = { type: "take", mark, card, chips_gained: gained, next_card: null, next: null, move_count: game.move_count };
  pushNoThanksEvent(game, game.last_move);
  finishNoThanksGame(game);
}

function finishNoThanksGame(game) {
  game.status = "complete";
  game.current_card = null;
  game.current_player = null;
  game.results = game.seat_order.map((mark) => {
    const seat = game.players[mark];
    const cardScore = scoreNoThanksCards(seat.cards);
    return { mark, card_score: cardScore, chips: seat.chips, cards: seat.cards.length, total: cardScore - seat.chips };
  });
  // Lowest total wins; ties break toward the bigger chip stack, then the
  // thinner card pile, then seat order (documented in docs/game-no-thanks.md).
  game.results.sort((a, b) =>
    a.total - b.total || b.chips - a.chips || a.cards - b.cards ||
    game.seat_order.indexOf(a.mark) - game.seat_order.indexOf(b.mark));
  game.winner = game.results[0].mark;
  game.move_count += 1;
  game.last_move = { type: "complete", winner: game.winner, move_count: game.move_count };
  pushNoThanksEvent(game, game.last_move);
}

function pushNoThanksEvent(game, event) {
  game.events.push(event);
  game.events = game.events.slice(-60);
}

// Bot turns run through the SAME take/pass internals a human move uses — no
// bot-only legality. The chain stops at a human's turn or at game end. Chips
// are conserved (a pass moves one to the pot, a take collects it), so bots
// cannot pass forever — stacks drain into forced takes. The guard bounds a
// pathological game far above any real one (24 cards, finite chips).
function resolveNoThanksBots(game) {
  for (let guard = 0; guard < 5000; guard += 1) {
    if (game.status !== "playing") return;
    const mark = game.current_player;
    const seat = mark ? game.players[mark] : null;
    if (!seat || !seat.is_bot) return;
    const choice = noThanksBotAction({
      card: game.current_card,
      pot: game.pot,
      chips: seat.chips,
      scoreDelta: scoreNoThanksCards([...seat.cards, game.current_card]) - scoreNoThanksCards(seat.cards),
      deckCount: game.deck.length,
      random: noThanksRandom,
    });
    if (choice && choice.type === "pass" && seat.chips > 0) applyNoThanksPass(game, mark);
    else applyNoThanksTake(game, mark); // forced take at 0 chips, and the safe default for a confused policy
  }
  throw new Error("No Thanks! bot resolution exceeded its guard — this is a bug.");
}
