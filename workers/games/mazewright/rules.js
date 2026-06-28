// Mazewright — server seat-wrapper (Game-Locked coordination).
//
// Mirrors the Yahtzee wrapper: the pure crawl/maze engine is shared from the
// static tree; this module owns the multiplayer room flow only. Two barriers:
//   BUILD  — collect every human's maze code; when all are in, assemble the run
//            deck (each maze + a server-chosen transform) and flip to RUNNING.
//   RUN    — each player runs every maze on their own device and posts only the
//            committed result {moves, loot}; when all humans finish, TALLY the
//            three prizes and complete.
// Family-trust: client-reported move/loot counts are accepted as-is (no replay).
// Bots get an auto-built maze and simulated run results so they never block a
// barrier (the Yahtzee pre-resolved-bot pattern).

import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import {
  buildRandomMazeCode,
  simulateRun,
  isValidMazeCode,
  randomTransform,
  shortestPathFromCode,
  computeStandings,
} from "../../../src/sogotable/static/games/mazewright/rules.js";

export const MAZEWRIGHT_GAME_ID = GAME_IDS.mazewright;

export function isMazewrightGame(game) {
  return Boolean(game && game.game_id === MAZEWRIGHT_GAME_ID);
}

export function newMazewrightGame() {
  return {
    game_id: MAZEWRIGHT_GAME_ID,
    status: "waiting",     // waiting -> building -> running -> complete
    seat_order: [],
    players: {},
    deck: null,            // [{ author: mark, transform: {axis, rot} }]
    prizes: null,          // { mazewright, mazerunner, treasureHunter } (marks)
    winner: null,
  };
}

function newSeat(name, isBot, level) {
  return {
    name: name || "Player",
    is_bot: !!isBot,
    level: level || null,
    maze: null,            // submitted maze code
    built: false,
    runIndex: 0,           // next deck maze this seat will run
    results: [],           // [{ author: mark, moves, loot }] in deck order
    runDone: false,
  };
}

function humanMarks(game) {
  return (game.seat_order || []).filter((m) => !game.players[m].is_bot);
}

export function initMazewrightSeats(game, players, rng = Math.random) {
  game.status = "building";
  game.seat_order = [];
  game.players = {};
  game.deck = null;
  game.prizes = null;
  game.winner = null;
  for (const p of players) {
    game.seat_order.push(p.mark);
    const seat = newSeat(p.name, p.kind === "bot", p.level);
    if (seat.is_bot) { seat.maze = buildRandomMazeCode(rng); seat.built = true; }
    game.players[p.mark] = seat;
  }
  maybeStartRunning(game, rng);   // bot-only / solo-bot rooms settle immediately
}

// ---- BUILD barrier ----
function submitMaze(game, mark, code, rng) {
  const seat = game.players && game.players[mark];
  if (!seat || seat.is_bot || game.status !== "building") return;
  if (!isValidMazeCode(code)) return;     // reject malformed/unsolvable
  seat.maze = code;
  seat.built = true;
  maybeStartRunning(game, rng);
}

function maybeStartRunning(game, rng) {
  if (game.status !== "building") return;
  const humans = humanMarks(game);
  if (!humans.length || !humans.every((m) => game.players[m].built)) return;
  // assemble the run deck: every player's maze, each with a server transform
  game.deck = game.seat_order.map((m) => ({ author: m, transform: randomTransform(rng) }));
  game.status = "running";
  // pre-resolve bot runs now that the deck is known
  for (const m of game.seat_order) {
    const seat = game.players[m];
    if (!seat.is_bot) continue;
    seat.results = game.deck.map((entry) => {
      const r = simulateRun(game.players[entry.author].maze, rng);
      return { author: entry.author, moves: r.moves, loot: r.loot };
    });
    seat.runIndex = game.deck.length;
    seat.runDone = true;
  }
  maybeComplete(game);
}

// ---- RUN: a player posts one finished maze's result ----
function postResult(game, mark, action) {
  const seat = game.players && game.players[mark];
  if (!seat || seat.is_bot || game.status !== "running" || seat.runDone) return;
  const idx = seat.runIndex;
  if (!game.deck || idx >= game.deck.length) return;
  // Family-trust, but no neon "front door": clamp the client-reported result to
  // the feasible band. moves can't beat the maze's shortest escape; loot can't
  // exceed the five hidden items. (Author can't inflate their own score either:
  // self-runs are excluded in computeStandings.)
  const author = game.deck[idx].author;
  const floor = Math.max(1, shortestPathFromCode(game.players[author].maze));
  seat.results.push({
    author,
    moves: Math.max(floor, Math.round(Number(action.moves) || 0)),
    loot: Math.min(5, Math.max(0, Math.round(Number(action.loot) || 0))),
  });
  seat.runIndex += 1;
  if (seat.runIndex >= game.deck.length) seat.runDone = true;
  maybeComplete(game);
}

// ---- TALLY barrier ----
function maybeComplete(game) {
  const humans = humanMarks(game);
  if (!humans.length || !humans.every((m) => game.players[m].runDone)) return;
  computePrizes(game);
  game.status = "complete";
}

// Project the room's posted results into the representation-neutral shape the
// shared scorer consumes, then defer to computeStandings (the one true tally).
// Works on partial results too, so the live leaderboard shows standings forming.
function standings(game) {
  const runs = [];
  const shortest = {};
  for (const m of game.seat_order || []) {
    const seat = game.players[m];
    for (const r of seat.results) {
      if (shortest[r.author] === undefined) shortest[r.author] = shortestPathFromCode(game.players[r.author].maze);
      runs.push({ runner: m, author: r.author, moves: r.moves, loot: r.loot });
    }
  }
  return computeStandings(runs, shortest, game.seat_order || []);
}

function computePrizes(game) {
  const s = standings(game);
  game.prizes = s.prizes;
  game.winner = s.winner;   // 5/3/3 medal composite, not Mazewright-only
}

export function makeMazewrightMove(game, mark, action) {
  if (!action || typeof action.type !== "string") return game;
  if (action.type === "SUBMIT_MAZE") submitMaze(game, mark, action.code, Math.random);
  else if (action.type === "POST_RESULT") postResult(game, mark, action);
  return game;
}

// ---- leaderboard projection (identical for every viewer; mazes are public) ----
export function mazewrightGameToDict(game) {
  const { authorPoints, runnerMoves, runnerLoot, composite } = standings(game);
  const complete = game.status === "complete";
  const total = game.deck ? game.deck.length : (game.seat_order ? game.seat_order.length : 0);
  const players = (game.seat_order || []).map((mark) => {
    const seat = game.players[mark];
    let finish_state;
    if (game.status === "building") finish_state = seat.built ? "ready" : "building";
    else if (game.status === "running") finish_state = seat.runDone ? "done" : "running";
    else finish_state = "done";
    return {
      mark,
      name: seat.name,
      is_bot: seat.is_bot,
      built: seat.built,
      run_index: seat.runIndex,
      run_total: total,
      run_done: seat.runDone,
      runner_moves: runnerMoves[mark] || 0,
      runner_loot: runnerLoot[mark] || 0,
      author_points: authorPoints[mark] || 0,
      composite: Math.round((composite[mark] || 0) * 10) / 10,
      finish_state,
    };
  });
  // the deck (codes + transforms) is shared so each client can run every maze
  const deck = (game.status === "running" || complete) && game.deck
    ? game.deck.map((entry) => ({
        author: entry.author,
        code: game.players[entry.author].maze,
        transform: entry.transform,
      }))
    : null;
  return {
    game_id: game.game_id,
    status: game.status,
    seat_order: game.seat_order || [],
    players,
    deck,
    prizes: game.prizes,
    winner: game.winner,
  };
}

// Stats: a player's "score" is their total loot collected (Treasure Hunter metric).
export function mazewrightScoreByMark(game) {
  const { runnerLoot } = standings(game);
  const scores = {};
  for (const mark of game.seat_order || []) scores[mark] = runnerLoot[mark] || 0;
  return scores;
}
