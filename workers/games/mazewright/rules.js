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

// Rejection policy (RTTA's): a rejected/stale/unknown action THROWS — the API
// route turns that into an error response and skips the bump/save/broadcast,
// so a no-op never burns a D1 write. A skipped seat is filled bot-style and
// told the truth via seat.skipped.

import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import {
  buildRandomMazeCode,
  simulateRun,
  isValidMazeCode,
  randomTransform,
  shortestPathFromCode,
  computeStandings,
} from "../../../src/sogotable/static/games/mazewright/rules.js";
import { normalizeSkipVotes, castSkipVote, pruneSkipVotes } from "../skip-vote.js";

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
    skip_votes: {},
  };
}

// Who may vote to skip `targetMark` at the current barrier — humans already
// done at it, excluding the target. Null when the target is not skippable.
function mazewrightSkipEligibility(game, targetMark) {
  const target = game.players && game.players[targetMark];
  if (!target || target.is_bot) return null;
  const humans = humanMarks(game);
  if (game.status === "building") {
    if (target.built) return null;
    return humans.filter((m) => m !== targetMark && game.players[m].built);
  }
  if (game.status === "running") {
    if (target.runDone) return null;
    return humans.filter((m) => m !== targetMark && game.players[m].runDone);
  }
  return null;
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
  game.skip_votes = {};
  for (const p of players) {
    game.seat_order.push(p.mark);
    const seat = newSeat(p.name, p.kind === "bot", p.level);
    if (seat.is_bot) { seat.maze = buildRandomMazeCode(rng); seat.built = true; }
    game.players[p.mark] = seat;
  }
  maybeStartRunning(game, rng);   // no-op with zero humans: a humanless room stays in "building" (unreachable today — the host always holds a seat)
}

// ---- BUILD barrier ----
function submitMaze(game, mark, code, rng) {
  const seat = game.players && game.players[mark];
  if (!seat || seat.is_bot) throw new Error("You are not seated at this maze table.");
  if (game.status !== "building") throw new Error("The build phase is over — refresh to catch up.");
  if (!isValidMazeCode(code)) throw new Error("That maze is not valid — it needs a reachable exit, reachable treasure, and enough walls.");
  seat.maze = code;   // resubmit-before-the-barrier legally overwrites
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
const MOVES_CEILING = 9999;   // like the loot clamp: Infinity/1e15 would D1-serialize to null and poison standings

function postResult(game, mark, action) {
  const seat = game.players && game.players[mark];
  if (!seat || seat.is_bot) throw new Error("You are not seated at this maze table.");
  if (game.status !== "running" || seat.runDone || !game.deck) throw new Error("No maze run is open for you — refresh to catch up.");
  const idx = seat.runIndex;
  if (idx >= game.deck.length) throw new Error("No maze run is open for you — refresh to catch up.");
  // The client stamps which deck slot it ran. A mismatch is a duplicate or a
  // lagging tab — without this, that post would be credited to the WRONG maze
  // and advance the pointer past it. Unstamped = legacy client mid-deploy,
  // accepted (RTTA's stamp policy).
  const stamped = action.index === undefined || action.index === null ? NaN : Math.trunc(Number(action.index));
  if (Number.isFinite(stamped) && stamped !== idx) {
    throw new Error(`Stale result for maze ${stamped + 1} — you are on maze ${idx + 1}. Refresh to catch up.`);
  }
  // Family-trust, but no neon "front door": clamp the client-reported result to
  // the feasible band. moves can't beat the maze's shortest escape; loot can't
  // exceed the five hidden items. (Author can't inflate their own score either:
  // self-runs are excluded in computeStandings.)
  const author = game.deck[idx].author;
  const floor = Math.max(1, shortestPathFromCode(game.players[author].maze));
  const rawMoves = Number(action.moves);
  seat.results.push({
    author,
    moves: Math.min(MOVES_CEILING, Math.max(floor, Number.isFinite(rawMoves) ? Math.round(rawMoves) : 0)),
    loot: Math.min(5, Math.max(0, Math.round(Number(action.loot) || 0))),
  });
  seat.runIndex += 1;
  if (seat.runIndex >= game.deck.length) seat.runDone = true;
  maybeComplete(game);
}

// ---- barrier escape hatch (RTTA's SKIP_PLAYER), as a UNANIMOUS vote ----
// Only a player already DONE at the current barrier may vote, and only over a
// human seat that is not (a dropped phone must not deadlock the table; reset
// can't recover either — it needs the absent player's vote). The first vote
// opens a proposal every client sees; voting again retracts; the skip fires
// only when every eligible waiter has voted (skip-vote.js). The skipped seat
// is filled bot-style — an auto-built maze at BUILD, simulated runs at RUN —
// so the game stays scoreable; seat.skipped tells the returning player the
// truth. Skipping someone who arrived in the meantime is a silent no-op (races).
function skipPlayer(game, mark, targetMark, rng) {
  const actor = game.players && game.players[mark];
  const target = game.players && game.players[targetMark];
  if (!actor || actor.is_bot) throw new Error("You are not seated at this maze table.");
  if (!target || target.is_bot || target === actor) throw new Error("Only another human player's seat can be skipped.");
  if (game.status === "building") {
    if (!actor.built) throw new Error("Submit your own maze before skipping a player.");
    if (target.built) return;
  } else if (game.status === "running") {
    if (!actor.runDone) throw new Error("Finish your own runs before skipping a player.");
    if (target.runDone) return;
  } else {
    throw new Error("Nothing to skip — the game is not at a barrier.");
  }
  const eligible = mazewrightSkipEligibility(game, targetMark) || [];
  const { votes, unanimous } = castSkipVote(game.skip_votes, mark, targetMark, eligible);
  game.skip_votes = votes;
  if (!unanimous) return; // proposal recorded — the projection shows it to everyone
  delete game.skip_votes[targetMark];
  if (game.status === "building") {
    target.maze = buildRandomMazeCode(rng);
    target.built = true;
    target.skipped = true;
    maybeStartRunning(game, rng);
  } else {
    for (let i = target.runIndex; i < game.deck.length; i++) {
      const r = simulateRun(game.players[game.deck[i].author].maze, rng);
      target.results.push({ author: game.deck[i].author, moves: r.moves, loot: r.loot });
    }
    target.runIndex = game.deck.length;
    target.runDone = true;
    target.skipped = true;
    maybeComplete(game);
  }
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
  const type = action && action.type;
  if (type === "SUBMIT_MAZE") submitMaze(game, mark, action.code, Math.random);
  else if (type === "POST_RESULT") postResult(game, mark, action);
  else if (type === "SKIP_PLAYER") skipPlayer(game, mark, action.target, Math.random);
  else throw new Error(`Unknown Mazewright action "${type}".`);
  // Re-validate open skip proposals after every action (arrived targets and
  // advanced barriers clear; ineligible voters drop out).
  game.skip_votes = pruneSkipVotes(game.skip_votes, (target) => mazewrightSkipEligibility(game, target));
  return game;
}

// ---- leaderboard projection (identical for every viewer; mazes are public) ----
export function mazewrightGameToDict(game) {
  const { authorPoints, runnerMoves, runnerLoot, composite, parts } = standings(game);
  const complete = game.status === "complete";
  const r1 = (x) => Math.round((x || 0) * 10) / 10;
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
      composite: r1(composite[mark]),
      pts_author: r1(parts[mark] && parts[mark].author),
      pts_runner: r1(parts[mark] && parts[mark].runner),
      pts_treasure: r1(parts[mark] && parts[mark].treasure),
      finish_state,
      skipped: !!seat.skipped,   // barrier skip — the seat is told the truth
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
    skip_votes: normalizeSkipVotes(game.skip_votes),
  };
}

// Stats: a player's "score" is their total loot collected (Treasure Hunter metric).
export function mazewrightScoreByMark(game) {
  const { runnerLoot } = standings(game);
  const scores = {};
  for (const mark of game.seat_order || []) scores[mark] = runnerLoot[mark] || 0;
  return scores;
}
