// Yahtzee — Game-Locked seat wrapper (server side): a SERIES of SERIES_GAMES
// independent games per seat.
//
// Built on 10,000's seat machinery but with NO inter-player round barrier: every
// seat plays its own series to completion on its own. Humans run each game on
// their own client (local-first) and POST each committed category score; when a
// card fills, the seat advances to its next game (banking that game's total into
// series_past) until the final game completes it. Bots play their whole series
// upfront, but the leaderboard only reveals each bot up to the round the most-
// advanced human has reached — a live race across the whole series.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import {
  newGame, applyAction, isCardComplete, grandTotal, previewScores, CATEGORY_KEYS,
} from "../../../src/sogotable/static/games/yahtzee/rules.js";

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

// A seat is a lightweight scorecard for the CURRENT game plus the series tally.
function newSeat(name, isBot, level) {
  return {
    name: name || "Player", is_bot: !!isBot, level: level || null,
    scores: emptyScores(), yahtzeeBonus: 0, game_index: 1, series_past: 0, finish_state: "playing",
  };
}

function seatOverall(seat) {
  return seat.series_past + grandTotal(seat);
}

export function newYahtzeeGame() {
  return { game_id: YAHTZEE_GAME_ID, seat_order: [], players: {}, status: "waiting", winner: null };
}

export function initYahtzeeSeats(game, players, rng = Math.random) {
  game.seat_order = [];
  game.players = {};
  for (const p of players) {
    game.seat_order.push(p.mark);
    const seat = newSeat(p.name, p.kind === "bot", p.level);
    if (seat.is_bot) playYahtzeeBotSeries(seat, rng); // bot plays its whole series at seat-init
    game.players[p.mark] = seat;
  }
  game.status = "playing";
  maybeCompleteYahtzee(game);
}

// Humans post { type:"SCORE", category, value, yahtzee_bonus }. A completed card
// advances the seat to its next game (banking the total); the final game ends it.
export function makeYahtzeeMove(game, mark, action) {
  const seat = game.players && game.players[mark];
  if (!seat || seat.is_bot || seat.finish_state === "complete") return game;
  if (action && action.type === "SCORE" && CATEGORY_KEYS.includes(action.category) && seat.scores[action.category] == null) {
    seat.scores[action.category] = Number(action.value) || 0;
    if (action.yahtzee_bonus) seat.yahtzeeBonus += Number(action.yahtzee_bonus) || 0;
    if (isCardComplete(seat.scores)) {
      if (seat.game_index < SERIES_GAMES) {
        seat.series_past += grandTotal(seat);
        seat.game_index += 1;
        seat.scores = emptyScores();
        seat.yahtzeeBonus = 0;
      } else {
        seat.finish_state = "complete";
      }
    }
  }
  maybeCompleteYahtzee(game);
  return game;
}

function humanMarks(game) {
  return (game.seat_order || []).filter((m) => !game.players[m].is_bot);
}

// Total rounds a seat has completed across the series (this paces the bots).
function seriesProgress(seat) {
  const cardRound = CATEGORY_KEYS.filter((k) => seat.scores[k] != null).length;
  return (seat.game_index - 1) * ROUNDS_PER_GAME + cardRound;
}

function maybeCompleteYahtzee(game) {
  if (!game.seat_order || !game.seat_order.length) return;
  const humans = humanMarks(game);
  const done = humans.length ? humans.every((m) => game.players[m].finish_state === "complete") : true;
  if (!done) return;
  game.status = "complete";
  for (const m of game.seat_order) game.players[m].finish_state = "complete";
  let best = -1;
  let winner = null;
  for (const m of game.seat_order) {
    const t = game.players[m].is_bot ? botFinalOverall(game.players[m]) : seatOverall(game.players[m]);
    if (t > best) { best = t; winner = m; }
  }
  game.winner = winner;
}

function botFinalOverall(seat) {
  const traj = seat.trajectory || [];
  return traj.length ? traj[traj.length - 1].overall : 0;
}

// Leaderboard projection: per-seat game index (G/6), round (R/13), and series
// overall. Bots are paced to the most-advanced human's total rounds.
export function yahtzeeGameToDict(game) {
  const seatOrder = game.seat_order || [];
  const pace = Math.max(0, ...humanMarks(game).map((m) => seriesProgress(game.players[m])));
  const players = seatOrder.map((mark) => {
    const seat = game.players[mark];
    if (seat.is_bot) {
      const traj = seat.trajectory || [];
      const shown = game.status === "complete" ? traj.length : Math.min(traj.length, pace);
      const e = shown > 0 ? traj[shown - 1] : { overall: 0, game: 1, round: 0 };
      return {
        mark, name: seat.name, is_bot: true,
        game_index: e.game, round: e.round, score: 0, overall: e.overall,
        finish_state: game.status === "complete" ? "complete" : "playing", scores: {},
      };
    }
    const cardRound = CATEGORY_KEYS.filter((k) => seat.scores[k] != null).length;
    return {
      mark, name: seat.name, is_bot: false,
      game_index: seat.game_index, round: cardRound, score: grandTotal(seat), overall: seatOverall(seat),
      finish_state: seat.finish_state, scores: seat.scores,
    };
  });
  return { game_id: game.game_id, seat_order: seatOrder, players, status: game.status, winner: game.winner, series_games: SERIES_GAMES };
}

// For stats recording: each seat's final series overall keyed by mark.
export function yahtzeeScoreByMark(game) {
  const scores = {};
  for (const mark of game.seat_order || []) {
    const seat = game.players[mark];
    scores[mark] = seat.is_bot ? botFinalOverall(seat) : seatOverall(seat);
  }
  return scores;
}

// A bot plays its whole SERIES_GAMES-game series upfront; the trajectory records
// { cumulative overall, game index, round } after each of the 6x13 rounds.
function playYahtzeeBotSeries(seat, rng = Math.random) {
  const trajectory = [];
  let seriesPast = 0;
  for (let gi = 1; gi <= SERIES_GAMES; gi += 1) {
    const g = newGame([seat.name]);
    let guard = 0;
    let round = 0;
    while (!g.over && guard++ < 60) {
      applyAction(g, { type: "ROLL" }, rng);
      for (let r = 0; r < 2; r += 1) {
        const counts = [0, 0, 0, 0, 0, 0, 0];
        g.dice.forEach((d) => { counts[d] += 1; });
        let keepFace = 1;
        for (let f = 2; f <= 6; f += 1) if (counts[f] >= counts[keepFace]) keepFace = f;
        applyAction(g, { type: "ROLL", held: g.dice.map((d) => d === keepFace) }, rng);
      }
      const pv = previewScores(g);
      let best = null;
      let bestV = -1;
      for (const k of CATEGORY_KEYS) {
        if (g.players[0].scores[k] == null && pv[k] > bestV) { bestV = pv[k]; best = k; }
      }
      if (best == null) break;
      applyAction(g, { type: "SCORE", category: best }, rng);
      round += 1;
      trajectory.push({ overall: seriesPast + grandTotal(g.players[0]), game: gi, round });
    }
    seriesPast += grandTotal(g.players[0]);
  }
  seat.trajectory = trajectory;
}
