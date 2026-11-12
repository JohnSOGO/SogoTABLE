// Chinese Checkers — timing-mode lifecycle (PLAN.md "Play modes"). Pure: the
// only clock is the injectable now seam below; deadlines are plain epoch-ms
// numbers in game state and are enforced LAZILY (advanceClock runs at the top
// of every action — there are no timers). ./rules.js owns options, the rounds
// barrier, finishing/ranking and projections, and hands this module an `ops`
// bag of its lifecycle primitives, so no import cycle forms:
//   ops = { pushEvent(game, e), startRound(game, base), advance(game, base),
//           finishCheck(game), validate(game, mark, act) -> commit,
//           botCommit(game, mark) -> commit | { pass: true },
//           hasMove(game, mark) -> bool, geoFor(game, mark) -> geo }
//
// Modes: rounds (hidden commits + barrier, optional timer), blitz (fixed beat,
// one immediate first-come-first-served move per seat per round, no early
// close), live (as blitz but closes once every human has moved), turns (one
// seat at a time in clockwise arm order; bots move instantly). Finished seats
// are skipped everywhere. A table with no unfinished human never waits for
// the clock: it runs straight through, bounded by a guard and the round cap.
import { resolveRound } from "./resolve.js";

export const ROUND_CAP = 300;
const CATCH_UP = 20; // max expired rounds/turns closed by one action

let nowFn = () => Date.now();
export const chineseCheckersNow = () => nowFn();
export function setChineseCheckersNow(fn) {
  nowFn = typeof fn === "function" ? fn : () => Date.now();
}

export const MODES = Object.freeze(["rounds", "blitz", "live", "turns"]);
export const TIMER_DEFAULTS = Object.freeze({ rounds: 0, blitz: 10, live: 30, turns: 0 });
const TIMER_MIN = Object.freeze({ rounds: 5, blitz: 5, live: 10, turns: 5 });
export const TIMER_MAX = 120;

// Timer seconds for a mode: rounds/turns allow 0 (off); blitz/live always tick.
export function normalizeTimer(mode, value) {
  const n = Number.parseInt(value, 10);
  if (value === undefined || value === null || !Number.isFinite(n)) return TIMER_DEFAULTS[mode];
  if (n <= 0 && TIMER_DEFAULTS[mode] === 0) return 0;
  return Math.max(TIMER_MIN[mode], Math.min(TIMER_MAX, n));
}

const modeOf = (game) => game.options.mode;
export const isLiveMode = (game) => modeOf(game) === "blitz" || modeOf(game) === "live";
export const isTurnsMode = (game) => modeOf(game) === "turns";
// Skip votes exist only where nothing else moves the table along.
export const skipVoteMode = (game) => !isLiveMode(game) && !game.options.timer;
// In turns mode `round` counts turns, so the safety cap scales with the seats.
export const roundCap = (game) => (isTurnsMode(game) ? ROUND_CAP * Math.max(1, game.seat_order.length) : ROUND_CAP);
export const deadlineAfter = (game, base) => (game.options.timer > 0 ? base + game.options.timer * 1000 : null);

// Clockwise arm order (arms are indexed clockwise on screen).
export function turnOrder(game) {
  return [...game.seat_order].sort((a, b) => game.players[a].arm - game.players[b].arm);
}

const humansLeft = (game) => game.seat_order.filter((m) => !game.players[m].is_bot && !game.players[m].finished);
const guardLimit = (game) => roundCap(game) + 50;

// ---------- entry points ----------

// After seats are placed: open round/turn 1 and let bots / all-bot tables run.
export function beginGame(game, now, ops) {
  if (isTurnsMode(game)) {
    openTurn(game, null, now, ops);
    settleTurns(game, now, ops);
  } else {
    ops.startRound(game, now);
    if (isLiveMode(game)) settleLive(game, now, ops);
    else ops.advance(game, now);
  }
}

// Close every round/turn whose deadline has passed, oldest first, each at its
// own deadline (a fixed beat: the next deadline counts from the one that
// expired). After a long idle the catch-up is bounded and the clock re-anchors.
export function advanceClock(game, now, ops) {
  let guard = 0;
  while (game.status === "playing" && Number.isFinite(game.deadline) && now >= game.deadline && guard < CATCH_UP) {
    guard += 1;
    closeOnTimeout(game, game.deadline, ops);
  }
  if (game.status === "playing" && Number.isFinite(game.deadline) && now >= game.deadline) {
    game.deadline = deadlineAfter(game, now);
  }
  if (game.status !== "playing") game.deadline = null;
}

function closeOnTimeout(game, due, ops) {
  if (isTurnsMode(game)) {
    if (game.current) ops.pushEvent(game, { type: "timeout", mark: game.current });
    endTurn(game, due, ops);
    settleTurns(game, due, ops);
  } else if (isLiveMode(game)) {
    closeLiveRound(game, due, ops);
    settleLive(game, due, ops);
  } else {
    game.seat_order.forEach((m) => {
      const seat = game.players[m];
      if (seat.is_bot || seat.finished || seat.skipped || seat.committed !== null) return;
      seat.committed = { pass: true };
      ops.pushEvent(game, { type: "timeout", mark: m });
    });
    ops.advance(game, due);
  }
}

// ---------- blitz / live ----------

// One immediate move (or pass) for `mark` this round, first come first served
// against the live board. A move that is no longer legal throws (ops.validate)
// and the seat may try again while the clock runs.
export function liveAction(game, mark, type, act, now, ops) {
  const seat = game.players[mark];
  if (seat.moved) {
    throw new Error(modeOf(game) === "blitz"
      ? "You've already moved this round — the next one opens when the clock runs out."
      : "You've already moved this round — it closes when everyone has moved or the clock runs out.");
  }
  if (type === "PASS") ops.pushEvent(game, { type: "pass", mark });
  else applyNow(game, mark, ops.validate(game, mark, act), ops);
  seat.moved = true;
  settleLive(game, now, ops);
}

// Close rounds that need no clock: live once every unfinished human has moved
// (or has no legal move); either mode immediately when no unfinished human is
// left (all-bot tables, or only bots still racing).
function settleLive(game, base, ops) {
  let guard = 0;
  while (game.status === "playing" && guard < guardLimit(game)) {
    guard += 1;
    const humans = humansLeft(game);
    if (humans.length) {
      if (modeOf(game) === "blitz") return;
      if (humans.some((m) => !game.players[m].moved && ops.hasMove(game, m))) return;
    }
    closeLiveRound(game, base, ops);
  }
}

// Round close: bots move in seat order on the live board, humans who didn't
// move lose the turn (a human with no legal move simply passes), then
// finishes/cap are checked and the next round opens at base + timer.
function closeLiveRound(game, base, ops) {
  for (const m of game.seat_order) {
    const seat = game.players[m];
    if (seat.finished || seat.moved) continue;
    if (seat.is_bot) {
      const commit = ops.botCommit(game, m);
      if (commit.pass) ops.pushEvent(game, { type: "pass", mark: m });
      else applyNow(game, m, commit, ops);
    } else {
      ops.pushEvent(game, { type: ops.hasMove(game, m) ? "timeout" : "pass", mark: m });
    }
    seat.moved = true;
  }
  ops.finishCheck(game);
  if (game.status === "playing") ops.startRound(game, base);
}

// Apply one already-validated commit to the live board now (blitz/live/turns).
function applyNow(game, mark, commit, ops) {
  const result = resolveRound({
    marbles: game.marbles,
    options: game.options,
    commits: [{ mark, commit }],
    geoOf: (m) => ops.geoFor(game, m),
    teamOf: (m) => (game.players[m] ? game.players[m].team : null),
  });
  game.marbles = result.marbles;
  game.move_count += result.moved;
  result.events.forEach((e) => ops.pushEvent(game, { ...e, live: true }));
  const o = result.outcomes[0];
  if (o && (o.outcome === "ok" || o.outcome === "cut")) game.players[mark].last_move = { from: o.from, to: o.to };
}

// ---------- turns ----------

export function turnAction(game, mark, type, act, now, ops) {
  if (game.current !== mark) throw new Error(`It's ${game.current}'s turn — hang tight.`);
  if (type === "PASS") ops.pushEvent(game, { type: "pass", mark });
  else applyNow(game, mark, ops.validate(game, mark, act), ops);
  endTurn(game, now, ops);
  settleTurns(game, now, ops);
}

// A skip vote passed against the current seat (untimed turns only).
export function skipTurn(game, now, ops) {
  endTurn(game, now, ops);
  settleTurns(game, now, ops);
}

function endTurn(game, base, ops) {
  ops.finishCheck(game);
  if (game.status === "playing") openTurn(game, game.current, base, ops);
  else { game.current = null; game.deadline = null; }
}

// Next unfinished seat clockwise after `after` (null -> first in order).
function openTurn(game, after, base, ops) {
  const order = turnOrder(game);
  const start = after ? order.indexOf(after) + 1 : 0;
  let next = null;
  for (let i = 0; i < order.length && next === null; i += 1) {
    const m = order[(start + i) % order.length];
    if (!game.players[m].finished) next = m;
  }
  game.round += 1;
  game.current = next;
  game.skip_votes = {};
  game.deadline = deadlineAfter(game, base);
  ops.pushEvent(game, { type: "turn", mark: next });
}

// Bots take their turns instantly; a human with no legal move auto-passes.
function settleTurns(game, base, ops) {
  let guard = 0;
  while (game.status === "playing" && game.current && guard < guardLimit(game)) {
    guard += 1;
    const mark = game.current;
    const seat = game.players[mark];
    if (seat.is_bot) {
      const commit = ops.botCommit(game, mark);
      if (commit.pass) ops.pushEvent(game, { type: "pass", mark });
      else applyNow(game, mark, commit, ops);
    } else if (!ops.hasMove(game, mark)) {
      ops.pushEvent(game, { type: "pass", mark });
    } else {
      return;
    }
    endTurn(game, base, ops);
  }
}
