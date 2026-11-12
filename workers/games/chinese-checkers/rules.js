// Chinese Checkers — server-authoritative rules (Sternhalma on a 121-hole star).
// Pure logic: no routing/auth/persistence, no DOM, no timers. The Worker calls
// setChineseCheckersOptions at /api/room/start, then initChineseCheckersSeats.
// Geometry + move generation: ./board.js. Barrier conflict resolution:
// ./resolve.js. Bot policy: ./ai.js. Wire contract + rules text: PLAN.md in
// src/sogotable/static/games/chinese-checkers/.
//
// SIMULTANEOUS SUBMIT (the SogoTable twist): every unfinished seat commits one
// hidden move (or PASS) per round. Commits are validated on arrival against
// the start-of-round board; the round resolves when every human has committed
// (or passed / been skipped). Bots commit last through the same validation,
// then ./resolve.js applies every commit in rotating priority order
// (seat_order rotated left by (round - 1) % n). An all-bot table runs straight
// through, bounded by a guard and the 300-round cap. Other play modes (blitz /
// live / turns) and every clock deadline: ./modes.js, driven through OPS below.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { cleanGameId } from "../../game-catalog.js";
import { castSkipVote, normalizeSkipVotes, pruneSkipVotes } from "../skip-vote.js";
import {
  CELLS, SEAT_ARMS, isCellKey, indexOf, keyAt, toGrid, seatGeometry, teamOfArm, armCells,
  seatMoves, seatLegalKeys, hasAnyMove, pathProblem, seatDistance, inGoalCount, goalFinished,
} from "./board.js";
import { resolveRound } from "./resolve.js";
import { chooseChineseCheckersMove } from "./ai.js";
import {
  ROUND_CAP, MODES, normalizeTimer, chineseCheckersNow, isLiveMode, isTurnsMode, skipVoteMode, roundCap,
  deadlineAfter, turnOrder, beginGame, advanceClock, liveAction, turnAction, skipTurn,
} from "./modes.js";

export { ROUND_CAP, setChineseCheckersNow } from "./modes.js";
export const CHINESE_CHECKERS_GAME_ID = GAME_IDS.chineseCheckers;
const EVENT_CAP = 60;
const MAX_PATH = 60;
export const CHINESE_CHECKERS_DEFAULT_OPTIONS = Object.freeze({
  jumps: "standard", marbles: 10, capture: "off", teams: false,
  stay_in_goal: true, no_parking: false, anti_block: true, end: "first",
  mode: "rounds", timer: 0, chains: true, allow_pass: true, assists: "full",
});

export function isChineseCheckersGame(game) {
  if (!game || !game.game_id) return false;
  try { return cleanGameId(game.game_id) === CHINESE_CHECKERS_GAME_ID; } catch { return String(game.game_id).trim() === CHINESE_CHECKERS_GAME_ID; }
}

let ccRandom = Math.random;
export function setChineseCheckersRandom(fn) {
  ccRandom = typeof fn === "function" ? fn : Math.random;
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
function toBool(value, fallback) {
  if (value === true || value === false) return value;
  if (value === "true" || value === "on" || value === 1 || value === "1") return true;
  if (value === "false" || value === "off" || value === 0 || value === "0") return false;
  return fallback;
}
function botLevel(seat) {
  if (!seat || (seat.kind !== "bot" && seat.is_bot !== true)) return 0;
  const level = Number(seat.bot_level !== undefined ? seat.bot_level : seat.level);
  return Number.isInteger(level) && level >= 1 && level <= 4 ? level : 2;
}

// Each key falls back to its default on its own.
export function normalizeChineseCheckersOptions(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const d = CHINESE_CHECKERS_DEFAULT_OPTIONS;
  const capture = o.capture === "send_home" || o.capture === true ? "send_home" : "off";
  const mode = MODES.includes(o.mode) ? o.mode : d.mode;
  return {
    jumps: o.jumps === "long" ? "long" : d.jumps,
    marbles: [6, 15].includes(Number(o.marbles)) ? Number(o.marbles) : d.marbles, // 15: 2 seats only (clamped at init)
    capture: o.capture === undefined ? d.capture : capture,
    teams: toBool(o.teams, d.teams),
    stay_in_goal: toBool(o.stay_in_goal, d.stay_in_goal),
    no_parking: toBool(o.no_parking, d.no_parking),
    anti_block: toBool(o.anti_block, d.anti_block),
    end: o.end === "all" ? "all" : d.end,
    mode,
    timer: normalizeTimer(mode, o.timer),
    chains: toBool(o.chains, d.chains),
    allow_pass: toBool(o.allow_pass, d.allow_pass),
    assists: ["full", "moves", "off"].includes(o.assists) ? o.assists : d.assists,
  };
}

// Host options from /api/room/start (payload.cc_options). A payload without a
// cc_options object leaves existing options untouched (reset carries first).
export function setChineseCheckersOptions(game, payload) {
  const raw = payload && payload.cc_options;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) game.options = normalizeChineseCheckersOptions(raw);
  else game.options = normalizeChineseCheckersOptions(game.options);
  return game.options;
}

export function newChineseCheckersGame() {
  return {
    game_id: CHINESE_CHECKERS_GAME_ID,
    status: "playing",
    round: 0,
    move_count: 0,
    options: normalizeChineseCheckersOptions(null),
    seat_order: [],
    players: {},
    marbles: {},
    events: [],
    skip_votes: {},
    winner: null,
    winners: [],
    results: null,
    deadline: null,
    current: null,
  };
}

const teamsActive = (game) => Boolean(game.options.teams) && (game.seat_order.length === 4 || game.seat_order.length === 6);
const geoFor = (game, mark) => {
  const seat = game.players[mark];
  return seat && Number.isInteger(seat.arm) ? seatGeometry(seat.arm, game.options.marbles) : null;
};

export function initChineseCheckersSeats(game, seats) {
  const marks = [];
  (Array.isArray(seats) ? seats : []).forEach((seat) => {
    const mark = String(seat && seat.mark || "").trim();
    if (mark && !marks.includes(mark)) marks.push(mark);
  });
  if (marks.length < 2) throw new Error("Chinese Checkers needs at least 2 players — invite a friend or add a bot.");
  if (marks.length > 6) throw new Error("Chinese Checkers seats at most 6 players — remove a seat to start.");
  game.options = normalizeChineseCheckersOptions(game.options);
  if (game.options.marbles === 15 && marks.length !== 2) game.options.marbles = 10; // 15 is the 2-player set
  game.seat_order = marks;
  game.players = {};
  game.marbles = {};
  const arms = SEAT_ARMS[marks.length];
  marks.forEach((mark, index) => {
    const seat = seats.find((s) => String(s && s.mark || "").trim() === mark);
    game.players[mark] = blankSeat(Boolean(seat && seat.kind === "bot"), botLevel(seat), arms[index]);
    armCells(arms[index], game.options.marbles).forEach((k) => { game.marbles[k] = mark; });
  });
  assignTeams(game);
  game.game_id = CHINESE_CHECKERS_GAME_ID;
  game.status = "playing";
  game.round = 0;
  game.move_count = 0;
  game.events = [];
  game.skip_votes = {};
  game.winner = null;
  game.winners = [];
  game.results = null;
  game.deadline = game.current = null;
  beginGame(game, chineseCheckersNow(), OPS); // an all-bot table runs straight through
}

function blankSeat(isBot, level, arm) {
  return {
    is_bot: isBot, level, arm, goal_arm: (arm + 3) % 6, team: null,
    committed: null, skipped: false, moved: false, finished: false, finish_round: null, rank: null, last_move: null,
  };
}

function assignTeams(game) {
  const on = teamsActive(game);
  game.seat_order.forEach((m) => { game.players[m].team = on ? teamOfArm(game.players[m].arm) : null; });
}

// ---------- events ----------

function pushEvent(game, event) {
  const last = game.events[game.events.length - 1];
  game.events.push({ seq: last ? last.seq + 1 : 1, round: game.round, ...event });
  if (game.events.length > EVENT_CAP) game.events.splice(0, game.events.length - EVENT_CAP);
}

// ---------- lifecycle ----------

export function priorityOrder(game) {
  const n = game.seat_order.length;
  if (!n) return [];
  const shift = ((Math.max(1, game.round) - 1) % n + n) % n;
  return game.seat_order.slice(shift).concat(game.seat_order.slice(0, shift));
}

const isDone = (seat) => seat.finished || seat.skipped || seat.committed !== null;

// `base` = the epoch ms the new round's clock counts from (see ./modes.js).
function startRound(game, base) {
  game.round += 1;
  game.skip_votes = {};
  game.seat_order.forEach((m) => {
    const seat = game.players[m];
    seat.committed = null;
    seat.skipped = false;
    seat.moved = false;
  });
  game.deadline = deadlineAfter(game, base);
  pushEvent(game, { type: "round", priority: priorityOrder(game) });
}

// The barrier: hold while any human is undecided; then bots commit (human
// validation path) and the round resolves. Loops so an all-bot table finishes.
function advance(game, base) {
  let guard = 0;
  while (game.status === "playing" && guard < ROUND_CAP + 50) {
    guard += 1;
    const grid = toGrid(game.marbles);
    for (const mark of game.seat_order) {
      const seat = game.players[mark];
      if (!seat.is_bot && !isDone(seat) && !hasAnyMove(grid, mark, geoFor(game, mark), game.options)) {
        seat.committed = { pass: true }; // no legal move -> auto-pass at the barrier
      }
    }
    if (game.seat_order.some((m) => !game.players[m].is_bot && !isDone(game.players[m]))) return;
    for (const mark of game.seat_order) {
      const seat = game.players[mark];
      if (seat.is_bot && !isDone(seat)) seat.committed = botCommit(game, mark, grid);
    }
    resolveCurrentRound(game, base);
  }
}

function botLegalInfo(game, mark, grid) {
  const geo = geoFor(game, mark);
  const moves = [];
  seatMoves(grid, mark, geo, game.options).forEach((pm) => moves.push(...pm.moves));
  const order = priorityOrder(game);
  const next = order.slice(order.indexOf(mark) + 1).concat(order).find((m) => m !== mark && !game.players[m].finished);
  const last = game.players[mark].last_move;
  return {
    grid, geo, options: game.options, moves,
    last_move: last ? { from: indexOf(last.from), to: indexOf(last.to) } : null,
    opponent: next && (game.players[mark].team === null || game.players[next].team !== game.players[mark].team)
      ? { mark: next, geo: geoFor(game, next) } : null,
  };
}

// A bot's commit, validated on the board as it stands now (never throws).
function botCommit(game, mark, grid = toGrid(game.marbles)) {
  const info = botLegalInfo(game, mark, grid);
  let choice = null;
  try { choice = chooseChineseCheckersMove(game, mark, info, ccRandom); } catch { choice = null; }
  if (!choice && info.moves.length) choice = info.moves[0]; // never pass while a move exists
  if (!choice) return { pass: true };
  try {
    return validateCommit(game, mark, { from: keyAt(choice.from), path: choice.path.map(keyAt) });
  } catch {
    return { pass: true };
  }
}

// Shared by humans and bots: validated against the board as it stands now
// (rounds: the start-of-round board; blitz/live/turns: the live board).
function validateCommit(game, mark, action) {
  const from = typeof action.from === "string" ? action.from.trim() : "";
  if (!isCellKey(from)) throw new Error("Pick one of your marbles.");
  if (game.marbles[from] !== mark) throw new Error("That's not your marble.");
  const rawPath = Array.isArray(action.path) ? action.path : [];
  if (!rawPath.length) throw new Error("Pick where the marble goes.");
  if (rawPath.length > MAX_PATH) throw new Error("That jump chain is too long.");
  const path = rawPath.map((k) => (typeof k === "string" ? k.trim() : ""));
  if (!path.every(isCellKey)) throw new Error("That route leaves the board.");
  if (new Set([from, ...path]).size !== path.length + 1) throw new Error("A jump chain can't revisit a hole or end where it started.");
  const grid = toGrid(game.marbles);
  const problem = pathProblem(grid, indexOf(from), path.map(indexOf), geoFor(game, mark), game.options);
  if (problem) throw new Error(problem);
  return { from, path };
}

function resolveCurrentRound(game, base) {
  const commits = priorityOrder(game)
    .filter((m) => !game.players[m].finished && !game.players[m].skipped)
    .map((m) => ({ mark: m, commit: game.players[m].committed || { pass: true } }));
  const result = resolveRound({
    marbles: game.marbles,
    options: game.options,
    commits,
    geoOf: (m) => geoFor(game, m),
    teamOf: (m) => (game.players[m] ? game.players[m].team : null),
  });
  game.marbles = result.marbles;
  game.move_count += result.moved;
  result.events.forEach((e) => pushEvent(game, e));
  result.outcomes.forEach((o) => {
    const seat = game.players[o.mark];
    if (o.outcome === "ok" || o.outcome === "cut") seat.last_move = { from: o.from, to: o.to };
  });
  game.seat_order.forEach((m) => { game.players[m].committed = null; });
  finishCheck(game);
  if (game.status === "playing") startRound(game, base);
}

function finishCheck(game) {
  markFinishes(game);
  if (game.status === "playing" && game.round >= roundCap(game)) completeGame(game);
}
const seatHasMove = (game, mark) => hasAnyMove(toGrid(game.marbles), mark, geoFor(game, mark), game.options);

// Lifecycle primitives handed to ./modes.js (see its header).
const OPS = Object.freeze({
  pushEvent, startRound, advance, finishCheck, validate: validateCommit, botCommit, hasMove: seatHasMove, geoFor,
});

// Units: teams when active, else each seat alone.
function units(game) {
  if (!teamsActive(game)) return game.seat_order.map((m) => [m]);
  const byTeam = new Map();
  game.seat_order.forEach((m) => {
    const t = game.players[m].team;
    if (!byTeam.has(t)) byTeam.set(t, []);
    byTeam.get(t).push(m);
  });
  return [...byTeam.values()];
}
const unitDone = (game, unit) => unit.every((m) => game.players[m].finished);
const unitRound = (game, unit) => Math.max(...unit.map((m) => game.players[m].finish_round || 0));

function markFinishes(game) {
  const grid = toGrid(game.marbles);
  const newly = [];
  game.seat_order.forEach((m) => {
    const seat = game.players[m];
    if (seat.finished || !goalFinished(grid, m, geoFor(game, m), game.options.anti_block)) return;
    seat.finished = true;
    seat.finish_round = game.round;
    newly.push(m);
  });
  if (!newly.length) return;
  const all = units(game);
  const earlier = all.filter((u) => unitDone(game, u) && unitRound(game, u) < game.round).length;
  all.forEach((u) => {
    if (unitDone(game, u) && unitRound(game, u) === game.round) u.forEach((m) => { game.players[m].rank = earlier + 1; });
  });
  newly.forEach((m) => pushEvent(game, { type: "finish", mark: m, rank: game.players[m].rank }));
  const done = all.filter((u) => unitDone(game, u));
  const finishedNow = done.filter((u) => unitRound(game, u) === game.round);
  if (game.options.end === "first" && done.length) completeGame(game, finishedNow.flat());
  else if (all.length - done.length <= 1) completeGame(game);
}

function completeGame(game, winnersOverride) {
  const grid = toGrid(game.marbles);
  const dist = (m) => seatDistance(grid, m, geoFor(game, m));
  const all = units(game);
  const finishedCount = all.filter((u) => unitDone(game, u)).length;
  const open = all.filter((u) => !unitDone(game, u))
    .map((u) => ({ u, d: u.reduce((s, m) => s + dist(m), 0) }))
    .sort((a, b) => a.d - b.d);
  open.forEach((entry, i) => {
    const rank = i > 0 && entry.d === open[i - 1].d ? game.players[open[i - 1].u[0]].rank : finishedCount + i + 1;
    entry.u.forEach((m) => { game.players[m].rank = rank; });
  });
  const winners = winnersOverride && winnersOverride.length
    ? winnersOverride
    : game.seat_order.filter((m) => game.players[m].rank === 1);
  game.winners = game.seat_order.filter((m) => winners.includes(m));
  game.winner = game.winners[0] || null;
  game.seat_order.forEach((m) => { game.players[m].committed = null; });
  game.status = "complete";
  game.deadline = game.current = null;
  game.skip_votes = {};
  game.results = game.seat_order.map((m) => ({
    mark: m, rank: game.players[m].rank, finished: game.players[m].finished,
    distance: dist(m), score: seatScore(game, m, dist(m)), team: game.players[m].team,
  })).sort((a, b) => a.rank - b.rank || game.seat_order.indexOf(a.mark) - game.seat_order.indexOf(b.mark));
  pushEvent(game, { type: "end", winners: [...game.winners] });
}

function seatScore(game, mark, distance) {
  return Math.max(0, 100 - distance) + (game.winners.includes(mark) ? 50 : 0);
}

// ---------- skip vote ----------

// Rounds: an undecided human holding the barrier. Turns: the current human.
function skippable(game, target) {
  const seat = Object.hasOwn(game.players, target) ? game.players[target] : null;
  if (!seat || seat.is_bot || !skipVoteMode(game)) return false;
  return isTurnsMode(game) ? game.current === target : !isDone(seat);
}
function skipVoters(game, target) {
  return game.seat_order.filter((m) => {
    const seat = game.players[m];
    if (m === target || seat.is_bot) return false;
    return isTurnsMode(game) || (!seat.skipped && (seat.committed !== null || seat.finished));
  });
}
function pruneVotes(game) {
  game.skip_votes = pruneSkipVotes(game.skip_votes, (t) => (game.status === "playing" && skippable(game, t) ? skipVoters(game, t) : null));
}

function applySkip(game, mark, action, now) {
  if (!skipVoteMode(game)) throw new Error("No skip vote needed — the clock moves the table along.");
  const target = String(action.target || "");
  if (target === mark) throw new Error("You can't vote to skip yourself.");
  if (!skippable(game, target)) throw new Error("That player can't be skipped right now.");
  const eligible = skipVoters(game, target);
  if (!eligible.includes(mark)) throw new Error("Only players who already committed this round can vote to skip.");
  if (isTurnsMode(game)) return skipCurrent(game, mark, target, eligible, now);
  const result = castSkipVote(game.skip_votes, mark, target, eligible);
  game.skip_votes = result.votes;
  if (result.passed) {
    game.players[target].skipped = true;
    pushEvent(game, { type: "skip", mark: target });
    const next = { ...game.skip_votes };
    delete next[target];
    game.skip_votes = next;
  }
}
function skipCurrent(game, mark, target, eligible, now) {
  const result = castSkipVote(game.skip_votes, mark, target, eligible);
  game.skip_votes = result.votes;
  if (!result.passed) return;
  pushEvent(game, { type: "skip", mark: target });
  skipTurn(game, now, OPS);
}

// ---------- transitions (top-level) ----------

export function makeChineseCheckersMove(game, mark, action) {
  normalizeChineseCheckersGame(game);
  const act = action && typeof action === "object" ? action : {};
  const type = String(act.type || "").trim().toUpperCase();
  if (game.status === "complete" && type === "TICK") return; // a late countdown is never an error
  if (game.status === "complete") throw new Error("The game is already over.");
  const seat = Object.hasOwn(game.players, mark) ? game.players[mark] : null;
  if (!seat) throw new Error("You are not seated in this game.");
  if (seat.is_bot) throw new Error("Bot seats play automatically.");
  const now = chineseCheckersNow();
  advanceClock(game, now, OPS); // lazily close every expired round/turn first
  pruneVotes(game);
  if (type === "TICK") return; // any seated seat (finished too); silent when nothing is due
  if (game.status === "complete") throw new Error("The game is already over.");
  const stamped = act.round === undefined || act.round === null ? NaN : Math.trunc(Number(act.round));
  if (act.round !== undefined && act.round !== null && stamped !== game.round) {
    throw new Error(`That move was for round ${act.round} — the table is on round ${game.round}. Refresh to catch up.`);
  }
  const mode = game.options.mode;
  if (type === "MOVE" || type === "PASS") {
    if (seat.finished) throw new Error("You've finished — your marbles are home.");
    if (seat.skipped) throw new Error("You were skipped this round — you're back in next round.");
    if (mode === "rounds" && seat.committed) return; // duplicate (retry / double tap): first commit wins, silently
    if (type === "PASS" && !game.options.allow_pass && seatHasMove(game, mark)) throw new Error("You still have a legal move — standard rules don't allow passing.");
    if (isLiveMode(game)) liveAction(game, mark, type, act, now, OPS);
    else if (isTurnsMode(game)) turnAction(game, mark, type, act, now, OPS);
    else seat.committed = type === "PASS" ? { pass: true } : validateCommit(game, mark, act);
  } else if (type === "RETRACT") {
    if (mode !== "rounds") throw new Error("Moves land instantly in this mode — there's nothing to take back.");
    if (seat.skipped) throw new Error("You were skipped this round — you're back in next round.");
    seat.committed = null;
  } else if (type === "SKIP_PLAYER") {
    applySkip(game, mark, act, now);
  } else {
    throw new Error("Chinese Checkers action must be MOVE, PASS, RETRACT, SKIP_PLAYER or TICK.");
  }
  pruneVotes(game);
  if (mode === "rounds") advance(game, now);
  pruneVotes(game);
}

// ---------- projections ----------

export function chineseCheckersGameToDict(game) {
  normalizeChineseCheckersGame(game);
  const grid = toGrid(game.marbles);
  const playing = game.status === "playing";
  const legal = {};
  const stops = {};
  const legalLite = {};
  const players = game.seat_order.map((mark) => {
    const seat = game.players[mark];
    const geo = geoFor(game, mark);
    const distance = geo ? seatDistance(grid, mark, geo) : 0;
    if (playing && geo && !seat.finished) {
      const keys = seatLegalKeys(grid, mark, geo, game.options);
      legal[mark] = keys.legal;
      stops[mark] = keys.stops;
      legalLite[mark] = Object.fromEntries(Object.keys(keys.legal).map((k) => [k, true]));
    }
    return {
      mark, arm: seat.arm, goal_arm: seat.goal_arm, team: seat.team,
      is_bot: seat.is_bot, level: seat.level,
      committed: seat.committed !== null, skipped: seat.skipped, moved: Boolean(seat.moved),
      finished: seat.finished, finish_round: seat.finish_round, rank: seat.rank,
      in_goal: geo ? inGoalCount(grid, mark, geo) : 0,
      marbles_total: game.options.marbles,
      distance, score: seatScore(game, mark, distance),
      commit: seat.committed ? (seat.committed.pass ? { pass: true } : { from: seat.committed.from, path: [...seat.committed.path] }) : null,
    };
  });
  return {
    game_id: CHINESE_CHECKERS_GAME_ID,
    status: game.status,
    round: game.round,
    move_count: game.move_count,
    options: { ...game.options, teams_active: teamsActive(game) },
    seat_order: [...game.seat_order],
    priority_order: priorityOrder(game),
    cells: CELLS.map((c) => ({ k: c.k, q: c.q, r: c.r, arm: c.arm })),
    marbles: { ...game.marbles },
    players,
    legal,
    stops,
    legal_lite: legalLite,
    deadline: playing ? game.deadline : null,
    server_now: chineseCheckersNow(),
    current: playing && isTurnsMode(game) ? game.current : null,
    turn_order: isTurnsMode(game) ? turnOrder(game) : [],
    events: game.events.map((e) => structuredClone(e)),
    skip_votes: normalizeSkipVotes(game.skip_votes),
    winner: game.winner,
    winners: [...game.winners],
    results: game.results ? game.results.map((r) => ({ ...r })) : null,
  };
}

// Per-viewer projection: receives the DICT. Hides every other seat's commit
// (simultaneous submit is only fair blind) and trims legal/stops/legal_lite to
// the viewer. assists "off": no legal/stops at all — only legal_lite (which
// marbles can move), so the client can select without highlighting.
export function chineseCheckersGameToDictForViewer(dict, viewerMark /* , roomStatus */) {
  const projected = structuredClone(dict);
  const own = (obj) => (viewerMark && obj && obj[viewerMark] ? { [viewerMark]: obj[viewerMark] } : {});
  const off = projected.options && projected.options.assists === "off";
  projected.legal = off ? {} : own(projected.legal);
  projected.stops = off ? {} : own(projected.stops);
  projected.legal_lite = own(projected.legal_lite);
  (projected.players || []).forEach((p) => { if (!viewerMark || p.mark !== viewerMark) p.commit = null; });
  return projected;
}

export function chineseCheckersScoreByMark(game) {
  normalizeChineseCheckersGame(game);
  const grid = toGrid(game.marbles);
  const scores = {};
  game.seat_order.forEach((m) => {
    const geo = geoFor(game, m);
    scores[m] = seatScore(game, m, geo ? seatDistance(grid, m, geo) : 0);
  });
  return scores;
}

// ---------- stored-state hygiene ----------

function cleanCommit(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.pass === true) return { pass: true };
  if (!isCellKey(raw.from) || !Array.isArray(raw.path) || !raw.path.length || raw.path.length > MAX_PATH) return null;
  return raw.path.every(isCellKey) ? { from: raw.from, path: [...raw.path] } : null;
}

// Tolerate garbage in stored state: every field falls back to a sane value.
export function normalizeChineseCheckersGame(game) {
  game.game_id = CHINESE_CHECKERS_GAME_ID;
  game.status = game.status === "complete" ? "complete" : "playing";
  game.round = clampInt(game.round, 0, 99999, 0);
  game.move_count = clampInt(game.move_count, 0, 9999999, 0);
  game.options = normalizeChineseCheckersOptions(game.options);
  const order = Array.isArray(game.seat_order) ? [...new Set(game.seat_order.map(String))] : [];
  game.seat_order = order.length >= 2 && order.length <= 6 ? order : [];
  const rawPlayers = game.players && typeof game.players === "object" && !Array.isArray(game.players) ? game.players : {};
  const arms = SEAT_ARMS[game.seat_order.length] || [];
  game.players = {};
  game.seat_order.forEach((mark, index) => {
    const seat = rawPlayers[mark] && typeof rawPlayers[mark] === "object" ? rawPlayers[mark] : {};
    const clean = blankSeat(Boolean(seat.is_bot), clampInt(seat.level, 0, 4, seat.is_bot ? 2 : 0), arms[index]);
    clean.committed = cleanCommit(seat.committed);
    clean.skipped = Boolean(seat.skipped);
    clean.moved = Boolean(seat.moved);
    clean.finished = Boolean(seat.finished);
    clean.finish_round = clean.finished ? clampInt(seat.finish_round, 0, 99999, game.round) : null;
    clean.rank = seat.rank === null || seat.rank === undefined ? null : clampInt(seat.rank, 1, 6, null);
    clean.last_move = seat.last_move && isCellKey(seat.last_move.from) && isCellKey(seat.last_move.to)
      ? { from: seat.last_move.from, to: seat.last_move.to } : null;
    game.players[mark] = clean;
  });
  assignTeams(game);
  const rawMarbles = game.marbles && typeof game.marbles === "object" && !Array.isArray(game.marbles) ? game.marbles : {};
  game.marbles = {};
  Object.keys(rawMarbles).forEach((k) => {
    if (isCellKey(k) && game.seat_order.includes(rawMarbles[k])) game.marbles[k] = rawMarbles[k];
  });
  game.events = Array.isArray(game.events) ? game.events.filter((e) => e && typeof e === "object" && Number.isInteger(e.seq)).slice(-EVENT_CAP) : [];
  game.skip_votes = normalizeSkipVotes(game.skip_votes);
  game.winners = Array.isArray(game.winners) ? game.winners.filter((m) => game.seat_order.includes(m)) : [];
  game.winner = game.seat_order.includes(game.winner) ? game.winner : (game.winners[0] || null);
  game.results = Array.isArray(game.results) ? game.results : null;
  if (game.options.marbles === 15 && game.seat_order.length && game.seat_order.length !== 2) game.options.marbles = 10;
  game.deadline = Number.isFinite(game.deadline) ? game.deadline : null;
  game.current = game.seat_order.includes(game.current) ? game.current : null;
  if (game.status === "playing" && isTurnsMode(game) && !game.current) game.current = turnOrder(game).find((m) => !game.players[m].finished) || null;
  if (game.status === "playing" && game.seat_order.length && game.round < 1) game.round = 1;
  return game;
}
