// Yahtzee — Game-Locked seat wrapper (server side): a SERIES of SERIES_GAMES
// games played in LOCKSTEP.
//
// Every seat plays its own 13-round card for the CURRENT game at its own pace.
// When a seat fills its card it is "done" and waits; once every HUMAN seat has
// finished the current game the whole table advances to the next game together
// (a game-level barrier). Overall = the sum of all SERIES_GAMES games. Winner =
// highest overall. Bots play their whole series upfront with the level-based AI
// engine; the board reveals each bot's CURRENT game paced to the most-advanced
// human's round, and the bot never blocks the barrier.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import {
  newGame, applyAction, isCardComplete, grandTotal, CATEGORY_KEYS,
} from "../../../src/sogotable/static/games/yahtzee/rules.js";
import { chooseYahtzeeHold, chooseYahtzeeCategory } from "./ai.js";

export const YAHTZEE_GAME_ID = GAME_IDS.yahtzee;
export const SERIES_GAMES = 6;
const ROUNDS_PER_GAME = CATEGORY_KEYS.length; // 13

export function isYahtzeeGame(game) {
  return !!game && game.game_id === YAHTZEE_GAME_ID;
}

function emptyScores() {
  const s = {};
  for (const k of CATEGORY_KEYS) s[k] = null;
  return s;
}

function botLevel(seat) {
  const lvl = Number(seat && (seat.bot_level !== undefined ? seat.bot_level : seat.level));
  return Number.isInteger(lvl) && lvl >= 1 && lvl <= 4 ? lvl : 2;
}

function newSeat(name, isBot, level) {
  return { name: name || "Player", is_bot: !!isBot, level: level || null, scores: emptyScores(), yahtzeeBonus: 0, series_past: 0, card_done: false };
}

function filled(scores) { return CATEGORY_KEYS.filter((k) => scores[k] != null).length; }
function humanMarks(game) { return (game.seat_order || []).filter((m) => !game.players[m].is_bot); }

export function newYahtzeeGame() {
  return { game_id: YAHTZEE_GAME_ID, game_index: 1, seat_order: [], players: {}, status: "waiting", winner: null };
}

export function initYahtzeeSeats(game, players, rng = Math.random) {
  game.game_index = 1;
  game.seat_order = [];
  game.players = {};
  for (const p of players) {
    game.seat_order.push(p.mark);
    const seat = newSeat(p.name, p.kind === "bot", p.level);
    if (seat.is_bot) playYahtzeeBotSeries(seat, botLevel(p), rng);
    game.players[p.mark] = seat;
  }
  game.status = "playing";
  maybeAdvance(game);
}

// Humans post each committed category score for the CURRENT game. A filled card
// marks the seat done; the table advances only when every human is done.
export function makeYahtzeeMove(game, mark, action) {
  const seat = game.players && game.players[mark];
  if (!seat || seat.is_bot || seat.card_done) return game;
  if (action && action.type === "SCORE" && CATEGORY_KEYS.includes(action.category) && seat.scores[action.category] == null) {
    seat.scores[action.category] = Number(action.value) || 0;
    if (action.yahtzee_bonus) seat.yahtzeeBonus += Number(action.yahtzee_bonus) || 0;
    if (isCardComplete(seat.scores)) seat.card_done = true;
  }
  maybeAdvance(game);
  return game;
}

function maybeAdvance(game) {
  if (!game.seat_order || !game.seat_order.length) return;
  const humans = humanMarks(game);
  if (!humans.length) { completeSeries(game); return; }      // bot-only room: settle now
  if (!humans.every((m) => game.players[m].card_done)) return;
  if (game.game_index < SERIES_GAMES) {
    // bank the finished game and reset everyone's card for the next game
    for (const m of humans) {
      const s = game.players[m];
      s.series_past += grandTotal(s);
      s.scores = emptyScores();
      s.yahtzeeBonus = 0;
      s.card_done = false;
    }
    game.game_index += 1;
  } else {
    completeSeries(game);   // final game done: leave cards in place, overall counts them
  }
}

function completeSeries(game) {
  game.status = "complete";
  let best = -1;
  let winner = null;
  for (const m of game.seat_order) {
    const t = finalOverall(game, m);
    if (t > best) { best = t; winner = m; }
  }
  game.winner = winner;
}

function humanOverall(seat) { return seat.series_past + grandTotal(seat); }
function botPastGames(seat, gi) { return seat.gameTotals.slice(0, gi - 1).reduce((a, b) => a + b, 0); }
function botFinalOverall(seat) { return seat.gameTotals.reduce((a, b) => a + b, 0); }
function finalOverall(game, mark) {
  const seat = game.players[mark];
  return seat.is_bot ? botFinalOverall(seat) : humanOverall(seat);
}

// Leaderboard projection: per-seat game index (G/6), round (R/13), this-game
// score and series overall. Bots are paced to the most-advanced human's round in
// the current game and never block the barrier.
export function yahtzeeGameToDict(game) {
  const seatOrder = game.seat_order || [];
  const gi = game.game_index;
  const complete = game.status === "complete";
  const pace = Math.max(0, ...humanMarks(game).map((m) => filled(game.players[m].scores)));
  const players = seatOrder.map((mark) => {
    const seat = game.players[mark];
    if (seat.is_bot) {
      const arr = (seat.games && seat.games[gi - 1]) || [];
      const shown = complete ? ROUNDS_PER_GAME : Math.min(ROUNDS_PER_GAME, pace);
      const gameScore = shown > 0 ? arr[shown - 1] : 0;
      return {
        mark, name: seat.name, is_bot: true,
        game_index: gi, round: shown, round_score: gameScore,
        overall: botPastGames(seat, gi) + gameScore,
        card_done: true, finish_state: complete ? "complete" : "playing", scores: {},
      };
    }
    const round = filled(seat.scores);
    const roundScore = grandTotal(seat);
    return {
      mark, name: seat.name, is_bot: false,
      game_index: gi, round, round_score: roundScore,
      overall: seat.series_past + roundScore,
      card_done: seat.card_done,
      finish_state: complete ? "complete" : (seat.card_done ? "waiting" : "playing"),
      scores: seat.scores,
    };
  });
  return { game_id: game.game_id, game_index: gi, seat_order: seatOrder, players, status: game.status, winner: game.winner, series_games: SERIES_GAMES };
}

// For stats recording: each seat's final series overall keyed by mark.
export function yahtzeeScoreByMark(game) {
  const scores = {};
  for (const mark of game.seat_order || []) scores[mark] = finalOverall(game, mark);
  return scores;
}

// A bot plays its whole SERIES_GAMES-game series upfront with the level-based AI.
// Per game it records the cumulative game score after each of the 13 rounds, so
// the board can reveal the current game paced to the humans.
function playYahtzeeBotSeries(seat, level, rng = Math.random) {
  seat.games = [];
  seat.gameTotals = [];
  for (let g = 0; g < SERIES_GAMES; g += 1) {
    const game = newGame([seat.name]);
    const perRound = [];
    let guard = 0;
    while (!game.over && guard++ < 60) {
      applyAction(game, { type: "ROLL" }, rng); // first roll of the turn
      let rollGuard = 0;
      while (game.rollsLeft > 0 && rollGuard++ < 4) {
        const held = chooseYahtzeeHold(level, game.dice, game.rollsLeft, game.players[0], rng);
        if (held.every((h) => h)) break;
        applyAction(game, { type: "ROLL", held }, rng);
      }
      const cat = chooseYahtzeeCategory(level, game.dice, game.players[0], rng);
      applyAction(game, { type: "SCORE", category: cat }, rng);
      perRound.push(grandTotal(game.players[0]));
    }
    seat.games.push(perRound);
    seat.gameTotals.push(grandTotal(game.players[0]));
  }
}
