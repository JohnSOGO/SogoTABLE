// Yahtzee — Game-Locked seat wrapper (server side).
//
// Built on 10,000's seat machinery but with NO inter-player round barrier: every
// seat is an INDEPENDENT Yahtzee game that runs to completion on its own. Humans
// run the game on their own client (local-first) and POST each committed category
// score (the trusted-score exception, per docs/adding-a-game.md); bots play their
// whole game server-side the moment they are seated. The room holds N seats plus a
// leaderboard projection. "complete" = every seat finished; winner = highest total.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import {
  newGame, applyAction, isCardComplete, grandTotal, previewScores, CATEGORY_KEYS,
} from "../../../src/sogotable/static/games/yahtzee/rules.js";

export const YAHTZEE_GAME_ID = GAME_IDS.yahtzee;

export function isYahtzeeGame(game) {
  return !!game && game.game_id === YAHTZEE_GAME_ID;
}

function emptyScores() {
  const s = {};
  for (const k of CATEGORY_KEYS) s[k] = null;
  return s;
}

// A seat is a lightweight scorecard (no dice — the human's dice live on their own
// client; a bot's were already played out below). Shaped so grandTotal() works.
function newSeat(name, isBot, level) {
  return { name: name || "Player", is_bot: !!isBot, level: level || null, scores: emptyScores(), yahtzeeBonus: 0, finish_state: "playing" };
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
    if (seat.is_bot) playYahtzeeBotGame(seat, rng);   // bot finishes its whole game at seat-init
    game.players[p.mark] = seat;
  }
  game.status = "playing";
  maybeCompleteYahtzee(game);
}

// The score-submit path. Humans post { type:"SCORE", category, value, yahtzee_bonus }.
// The value is trusted (computed on the client from its local dice). Only that one
// seat is touched — there is no shared current player and no turn order.
export function makeYahtzeeMove(game, mark, action) {
  const seat = game.players && game.players[mark];
  if (!seat || seat.finish_state === "complete") return game;
  if (action && action.type === "SCORE" && CATEGORY_KEYS.includes(action.category) && seat.scores[action.category] == null) {
    seat.scores[action.category] = Number(action.value) || 0;
    if (action.yahtzee_bonus) seat.yahtzeeBonus += Number(action.yahtzee_bonus) || 0;
    if (isCardComplete(seat.scores)) seat.finish_state = "complete";
  }
  maybeCompleteYahtzee(game);
  return game;
}

function maybeCompleteYahtzee(game) {
  if (!game.seat_order || !game.seat_order.length) return;
  if (!game.seat_order.every((m) => game.players[m].finish_state === "complete")) return;
  game.status = "complete";
  let best = -1;
  let winner = null;
  for (const m of game.seat_order) {
    const t = grandTotal(game.players[m]);
    if (t > best) { best = t; winner = m; }
  }
  game.winner = winner;
}

// Broadcast projection: per-seat leaderboard data (score, round X/13, status).
export function yahtzeeGameToDict(game) {
  const players = (game.seat_order || []).map((mark) => {
    const seat = game.players[mark];
    return {
      mark,
      name: seat.name,
      is_bot: !!seat.is_bot,
      score: grandTotal(seat),
      round: CATEGORY_KEYS.filter((k) => seat.scores[k] != null).length,
      finish_state: seat.finish_state,
      scores: seat.scores,
    };
  });
  return { game_id: game.game_id, seat_order: game.seat_order || [], players, status: game.status, winner: game.winner };
}

// For stats recording: each seat's grand total keyed by mark.
export function yahtzeeScoreByMark(game) {
  const scores = {};
  for (const mark of game.seat_order || []) scores[mark] = grandTotal(game.players[mark]);
  return scores;
}

// --- bot: play a full independent game greedily, then copy the card into the seat -
function playYahtzeeBotGame(seat, rng = Math.random) {
  const g = newGame([seat.name]);
  let guard = 0;
  while (!g.over && guard++ < 60) {
    applyAction(g, { type: "ROLL" }, rng);
    for (let r = 0; r < 2; r++) {
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
  }
  seat.scores = { ...g.players[0].scores };
  seat.yahtzeeBonus = g.players[0].yahtzeeBonus;
  seat.finish_state = "complete";
}
