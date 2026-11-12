// Chinese Checkers — round-barrier conflict resolution (spec §6.4, PLAN.md
// "Parallel play — conflict resolution"). Pure: board + options + commits in
// PRIORITY ORDER in; new board, per-move outcomes and events out. ./rules.js
// calls this once per round at barrier close; it owns no lifecycle.
//
// Each commit is applied one at a time, re-checked against the board as it
// stands after every higher-priority move:
//   1. marble no longer at `from` (captured) -> bounced;
//   2. walk the path hop by hop on the current board;
//   3. a failing hop cuts the move at the last reachable landing that is a
//      legal stop; no such prefix -> bounced;
//   4. `by` names the higher-priority mover whose move changed a cell this
//      move depended on (contested hole, vanished jump, capture);
//   5. captures for the hops actually made apply right after that move.
import {
  toGrid, fromGrid, indexOf, keyAt, replayPath, stopPrefix, hopLine, applyCaptures,
} from "./board.js";

// input: { marbles: {"q,r": mark}, options, commits: [{ mark, commit }],
//          geoOf(mark) -> seat geometry, teamOf(mark) -> team id | null }
// commit: { pass: true } | { from: "q,r", path: ["q,r", ...] }
// output: { marbles, events, outcomes: [{ mark, outcome, from, to }], moved }
export function resolveRound({ marbles, options, commits, geoOf, teamOf }) {
  const grid = toGrid(marbles);
  const touched = new Map(); // cell index -> mark whose move changed it this round
  const events = [];
  const outcomes = [];
  let moved = 0;
  for (const { mark, commit } of commits || []) {
    if (!commit || commit.pass) {
      events.push({ type: "pass", mark });
      outcomes.push({ mark, outcome: "pass", from: null, to: null });
      continue;
    }
    const result = resolveOne(grid, touched, mark, commit, options, geoOf(mark), geoOf, teamOf);
    events.push(result.event);
    outcomes.push({ mark, outcome: result.event.outcome, from: result.event.from, to: result.event.to });
    if (result.event.outcome !== "bounced") moved += 1;
  }
  return { marbles: fromGrid(grid), events, outcomes, moved };
}

function blame(touched, cells, mark) {
  for (const c of cells) {
    const who = touched.get(c);
    if (who && who !== mark) return who;
  }
  return null;
}

function resolveOne(grid, touched, mark, commit, options, geo, geoOf, teamOf) {
  const from = indexOf(commit.from);
  const path = (Array.isArray(commit.path) ? commit.path : []).map(indexOf);
  const base = { type: "move", mark, from: commit.from, intended: [...(commit.path || [])] };
  const bounced = (reason, by) => ({
    event: { ...base, to: commit.from, path: [], outcome: "bounced", reason, ...(by ? { by } : {}), captured: [] },
  });
  if (from < 0 || path.some((i) => i < 0) || !geo) return bounced("invalid", null);
  if (grid[from] !== mark) return bounced("marble_moved", touched.get(from) || null);

  const replay = replayPath(grid, from, path, options);
  const n = replay.malformed ? 0 : stopPrefix(replay, from, path, geo, options);
  let reason = null;
  let by = null;
  if (n < path.length) {
    const failAt = replay.failAt >= 0 ? replay.failAt : n;
    const prev = failAt === 0 ? from : path[failAt - 1];
    const target = path[failAt];
    const cells = target === undefined ? [] : replay.kind === "step" ? [target] : hopLine(prev, target);
    reason = target !== undefined && grid[target] ? "hole_taken" : "jump_changed";
    by = blame(touched, cells, mark);
  }
  if (n === 0) return bounced(reason || "blocked", by);

  const end = path[n - 1];
  grid[from] = null;
  grid[end] = mark;
  touched.set(from, mark);
  touched.set(end, mark);
  let captured = [];
  if (options.capture === "send_home" && replay.kind === "hop") {
    captured = applyCaptures(grid, mark, replay.hopped.slice(0, n), geoOf, teamOf);
    captured.forEach((c) => { touched.set(c.from, mark); touched.set(c.to, mark); });
  }
  const event = {
    ...base,
    to: keyAt(end),
    path: path.slice(0, n).map(keyAt),
    outcome: n === path.length ? "ok" : "cut",
    ...(reason ? { reason } : {}),
    ...(by ? { by } : {}),
    captured: captured.map((c) => ({ mark: c.mark, from: keyAt(c.from), to: keyAt(c.to) })),
  };
  if (event.outcome === "ok") delete event.intended;
  return { event };
}
