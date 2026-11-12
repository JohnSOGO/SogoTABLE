// Chinese Checkers bot policy. Pure: picks one move from the legal list the
// rules module hands over; the choice then goes through the SAME validation a
// human commit does (./rules.js). Levels: 1 Sprout (random forward-ish),
// 2 Buddy (greedy distance gain), 3 Cipher (greedy + straggler pull + goal
// entry), 4 Overlord (Cipher + one-step lookahead + mild hop-ladder penalty).
// Cheap by design: no tree search; a 6-bot round resolves in a few ms.
import { hexDistanceIdx, seatMoves, isAdjacent, cellAt, armAt, coordsAt, DIRS } from "./board.js";

// legalInfo: { grid, geo, options, moves: [{ from, to, path }] (indices),
//              last_move: { from, to } | null (indices),
//              opponent: { mark, geo } | null — next seat in priority }
// Returns one entry of legalInfo.moves, or null (pass) only when there are none.
export function chooseChineseCheckersMove(game, mark, legalInfo, rng = Math.random) {
  const info = legalInfo || {};
  const moves = Array.isArray(info.moves) ? info.moves : [];
  if (!moves.length) return null;
  const seat = game && game.players && game.players[mark];
  const level = seat && Number.isInteger(seat.level) && seat.level >= 1 ? Math.min(4, seat.level) : 2;
  const { grid, geo } = info;
  const dist = (i) => hexDistanceIdx(i, geo.goal_tip);
  const gain = (m) => dist(m.from) - dist(m.to);

  if (level === 1) {
    const forward = moves.filter((m) => gain(m) > 0);
    const sideways = moves.filter((m) => gain(m) === 0);
    const pool = forward.length && rng() < 0.85 ? forward : sideways.length ? sideways.concat(forward) : moves;
    return pool[Math.floor(rng() * pool.length) % pool.length];
  }

  const mine = [];
  for (let i = 0; i < grid.length; i += 1) if (grid[i] === mark) mine.push(i);
  const meanD = mine.reduce((s, i) => s + dist(i), 0) / Math.max(1, mine.length);
  const maxD = mine.reduce((m, i) => Math.max(m, dist(i)), 0);
  const last = info.last_move;
  const capture = info.options && info.options.capture === "send_home";

  const baseScore = (m) => {
    const g = gain(m);
    let s = g;
    if (last && m.from === last.to && m.to === last.from) s -= 1.5; // no ping-pong
    if (level >= 3) {
      if (g > 0) s += 0.25 * (dist(m.from) - meanD);   // pull stragglers forward
      if (g > 0 && dist(m.from) === maxD) s += 0.4;
      if (geo.goalSet.has(m.to) && !geo.goalSet.has(m.from)) s += 1.2;
      if (geo.homeSet.has(m.from) && !geo.homeSet.has(m.to)) s += 0.3; // leave home
      if (!geo.goalSet.has(m.to) && dist(m.to) > maxD) s -= 0.5; // don't fall behind the pack
    }
    if (capture && level >= 3 && !geo.goalSet.has(m.to) && exposed(grid, mark, m)) s -= 1;
    return s + rng() * 0.01; // seeded tie-break
  };

  let scored = moves.map((m) => ({ m, s: baseScore(m) }));
  if (level >= 4) {
    scored.sort((a, b) => b.s - a.s);
    scored = scored.slice(0, 6).map(({ m, s }) => ({ m, s: s + 0.4 * lookahead(info, mark, m, dist) - ladderPenalty(info, m) }));
  }
  let best = scored[0];
  for (const c of scored) if (c.s > best.s) best = c;
  return best.m;
}

// Best own gain available after `m` (one step ahead).
function lookahead(info, mark, m, dist) {
  const { grid, geo, options } = info;
  grid[m.from] = null;
  grid[m.to] = mark;
  let best = 0;
  try {
    for (const pm of seatMoves(grid, mark, geo, options)) {
      for (const n of pm.moves) best = Math.max(best, dist(n.from) - dist(n.to));
    }
  } finally {
    grid[m.to] = null;
    grid[m.from] = mark;
  }
  return best;
}

// Mild penalty when the landing hole gives the next opponent a forward hop
// over it (a ladder we'd be building for them).
function ladderPenalty(info, m) {
  const opp = info.opponent;
  if (!opp || !opp.geo || armAt(m.to) === opp.geo.goal_arm) return 0;
  const { grid } = info;
  let penalty = 0;
  for (let i = 0; i < grid.length; i += 1) {
    if (grid[i] !== opp.mark || !isAdjacent(i, m.to)) continue;
    const [mq, mr] = coordsAt(m.to);
    const [oq, or] = coordsAt(i);
    const land = cellAt(2 * mq - oq, 2 * mr - or);
    if (land < 0 || (grid[land] && land !== m.from)) continue;
    if (hexDistanceIdx(land, opp.geo.goal_tip) < hexDistanceIdx(i, opp.geo.goal_tip)) penalty += 0.3;
  }
  return penalty;
}

// Capture variant: could some other seat's marble hop the landed marble?
function exposed(grid, mark, m) {
  const [tq, tr] = coordsAt(m.to);
  for (const [dq, dr] of DIRS) {
    const a = cellAt(tq + dq, tr + dr);
    const b = cellAt(tq - dq, tr - dr);
    if (a < 0 || b < 0) continue;
    const owner = a === m.from ? null : grid[a];
    const beyond = b === m.from ? null : grid[b];
    if (owner && owner !== mark && !beyond) return true;
  }
  return false;
}
