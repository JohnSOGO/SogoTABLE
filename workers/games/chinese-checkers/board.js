// Chinese Checkers — star geometry + move generation. Pure: no DOM, no I/O,
// no timers, no game-state lifecycle (that is ./rules.js; round-barrier
// conflict resolution is ./resolve.js). Wire contract + rules text:
// src/sogotable/static/games/chinese-checkers/PLAN.md (Geometry / Moves).
//
// Axial hex coords (q, r), s = -q - r; a cell key is the string "q,r".
// The 121-hole star = cells where every coord <= 4 OR every coord >= -4.
// Internally cells are indexed into a 17×17 grid (index = (q+8)*17 + (r+8))
// so move generation runs over a flat array; the exported key-based helpers
// convert at the edge. A "grid" is an Array(289) holding a mark or null.

const SIZE = 17;
const OFF = 8;
export const GRID_SIZE = SIZE * SIZE;
export const DIRS = Object.freeze([[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]);
export const ARM_TIPS = Object.freeze(["-4,8", "-8,4", "-4,-4", "4,-8", "8,-4", "4,4"]);
// seat count -> home arm per seat_order index.
export const SEAT_ARMS = Object.freeze({
  2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5],
});

export const keyOf = (q, r) => `${q},${r}`;
export const oppositeArm = (arm) => (arm + 3) % 6;

function inBounds(q, r) {
  return q >= -OFF && q <= OFF && r >= -OFF && r <= OFF;
}
function rawIndex(q, r) {
  return (q + OFF) * SIZE + (r + OFF);
}

// Arm of a star cell (-1 = central hexagon); null when not in the star.
export function armOf(q, r) {
  const s = -q - r;
  const inStar = (q <= 4 && r <= 4 && s <= 4) || (q >= -4 && r >= -4 && s >= -4);
  if (!inStar) return null;
  if (r > 4) return 0;
  if (q < -4) return 1;
  if (s > 4) return 2;
  if (r < -4) return 3;
  if (q > 4) return 4;
  if (s < -4) return 5;
  return -1;
}

function depthOf(q, r, arm) {
  const s = -q - r;
  return [r - 4, -q - 4, s - 4, -r - 4, q - 4, -s - 4][arm] || 0;
}

// ---------- static tables ----------

const Q = new Int8Array(GRID_SIZE);
const R = new Int8Array(GRID_SIZE);
const IN_STAR = new Uint8Array(GRID_SIZE);
const ARM = new Int8Array(GRID_SIZE).fill(-2);
const DEPTH = new Int8Array(GRID_SIZE);
const KEY_AT = new Array(GRID_SIZE).fill(null);
const INDEX_OF = new Map();
const STAR = []; // star indices in key-stable order (r, then q)
for (let r = -OFF; r <= OFF; r += 1) {
  for (let q = -OFF; q <= OFF; q += 1) {
    const i = rawIndex(q, r);
    Q[i] = q;
    R[i] = r;
    const arm = armOf(q, r);
    if (arm === null) continue;
    IN_STAR[i] = 1;
    ARM[i] = arm;
    DEPTH[i] = arm === -1 ? 0 : depthOf(q, r, arm);
    KEY_AT[i] = keyOf(q, r);
    INDEX_OF.set(KEY_AT[i], i);
    STAR.push(i);
  }
}
const NEIGHBORS = new Array(GRID_SIZE).fill(null);
STAR.forEach((i) => {
  NEIGHBORS[i] = DIRS.map(([dq, dr]) => cellAt(Q[i] + dq, R[i] + dr)).filter((n) => n >= 0);
});

export const CELLS = Object.freeze(STAR.map((i) => Object.freeze({ k: KEY_AT[i], q: Q[i], r: R[i], arm: ARM[i] })));

// Star cell index at (q, r), or -1.
export function cellAt(q, r) {
  if (!inBounds(q, r)) return -1;
  const i = rawIndex(q, r);
  return IN_STAR[i] ? i : -1;
}
export function indexOf(key) {
  if (typeof key !== "string") return -1;
  const i = INDEX_OF.get(key);
  return i === undefined ? -1 : i;
}
export const keyAt = (i) => KEY_AT[i];
export const coordsAt = (i) => [Q[i], R[i]];
export const armAt = (i) => ARM[i];
export const depthAt = (i) => DEPTH[i];
export const isCellKey = (key) => indexOf(key) >= 0;

export function cellInfo(key) {
  const i = indexOf(key);
  return i < 0 ? null : { k: key, q: Q[i], r: R[i], arm: ARM[i], depth: DEPTH[i] };
}

export function hexDistanceIdx(a, b) {
  const dq = Q[a] - Q[b];
  const dr = R[a] - R[b];
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}
export function hexDistance(a, b) {
  const ia = indexOf(a);
  const ib = indexOf(b);
  if (ia < 0 || ib < 0) return Infinity;
  return hexDistanceIdx(ia, ib);
}

// Arm cells for a marble count (10 -> depths 1-4, 6 -> depths 2-4), as keys.
export function armCells(arm, marbles = 10) {
  const minDepth = Number(marbles) === 6 ? 2 : 1;
  return STAR.filter((i) => ARM[i] === arm && DEPTH[i] >= minDepth).map((i) => KEY_AT[i]);
}

// Per-seat geometry (indices). Cached; treat as read-only.
const geoCache = new Map();
export function seatGeometry(arm, marbles = 10) {
  const count = Number(marbles) === 6 ? 6 : 10;
  const cacheKey = `${arm}|${count}`;
  if (geoCache.has(cacheKey)) return geoCache.get(cacheKey);
  const goalArm = oppositeArm(arm);
  const home = armCells(arm, count).map(indexOf);
  const goal = armCells(goalArm, count).map(indexOf);
  const homeTip = indexOf(ARM_TIPS[arm]);
  const goalTip = indexOf(ARM_TIPS[goalArm]);
  const geo = Object.freeze({
    arm,
    goal_arm: goalArm,
    count,
    home,
    goal,
    homeSet: new Set(home),
    goalSet: new Set(goal),
    home_tip: homeTip,
    goal_tip: goalTip,
    min_sum: goal.reduce((sum, i) => sum + hexDistanceIdx(i, goalTip), 0),
  });
  geoCache.set(cacheKey, geo);
  return geo;
}

// Team id for an arm when teams are active: min(arm, opposite) -> 0..2.
export const teamOfArm = (arm) => Math.min(arm, oppositeArm(arm));

// ---------- grids ----------

export function toGrid(marbles) {
  const grid = new Array(GRID_SIZE).fill(null);
  if (marbles && typeof marbles === "object") {
    for (const key of Object.keys(marbles)) {
      const i = indexOf(key);
      if (i >= 0 && marbles[key]) grid[i] = marbles[key];
    }
  }
  return grid;
}
export function fromGrid(grid) {
  const out = {};
  STAR.forEach((i) => { if (grid[i]) out[KEY_AT[i]] = grid[i]; });
  return out;
}
export function marblesOf(grid, mark) {
  return STAR.filter((i) => grid[i] === mark);
}

// ---------- move generation ----------

export const isAdjacent = (a, b) => hexDistanceIdx(a, b) === 1;

// Hop landings from `i` on `grid` (the mover must already be lifted off).
// Each entry is [landing, jumpedMarble]. Long jumps: d empties, a marble, d
// empties, land (standard is d = 0).
function hopsFrom(grid, i, long) {
  const out = [];
  for (const [dq, dr] of DIRS) {
    if (!long) {
      const mid = cellAt(Q[i] + dq, R[i] + dr);
      if (mid < 0 || !grid[mid]) continue;
      const land = cellAt(Q[i] + 2 * dq, R[i] + 2 * dr);
      if (land >= 0 && !grid[land]) out.push([land, mid]);
      continue;
    }
    for (let k = 1; k <= 8; k += 1) {
      const c = cellAt(Q[i] + k * dq, R[i] + k * dr);
      if (c < 0) break;
      if (!grid[c]) continue;
      let clear = true;
      for (let j = k + 1; j < 2 * k; j += 1) {
        const e = cellAt(Q[i] + j * dq, R[i] + j * dr);
        if (e < 0 || grid[e]) { clear = false; break; }
      }
      const land = clear ? cellAt(Q[i] + 2 * k * dq, R[i] + 2 * k * dr) : -1;
      if (land >= 0 && !grid[land]) out.push([land, c]);
      break; // only the first marble on a line can be jumped
    }
  }
  return out;
}

// Chained-hop graph for the marble at `from`: Map(node -> [landings]) over the
// origin and every hole reachable by a chain (the origin is never a landing:
// a chain never revisits a hole or ends where it started). Also returns the
// reachable nodes (origin excluded) and a BFS parent map for shortest paths.
export function hopGraph(grid, from, long = false) {
  const saved = grid[from];
  grid[from] = null;
  const graph = new Map();
  const parent = new Map([[from, -1]]);
  const queue = [from];
  for (let h = 0; h < queue.length; h += 1) {
    const node = queue[h];
    const lands = [];
    for (const [land] of hopsFrom(grid, node, long)) {
      if (land === from) continue;
      lands.push(land);
      if (!parent.has(land)) { parent.set(land, node); queue.push(land); }
    }
    graph.set(node, lands);
  }
  grid[from] = saved;
  return { graph, reach: queue.slice(1), parent };
}

// Legal place to END a move (static per cell + seat: stay-in-goal, no-parking).
export function canStop(end, from, geo, options) {
  if (options.stay_in_goal && geo.goalSet.has(from) && !geo.goalSet.has(end)) return false;
  if (options.no_parking) {
    const arm = ARM[end];
    if (arm !== -1 && arm !== geo.arm && arm !== geo.goal_arm) return false;
  }
  return true;
}

function pathFromParents(parent, to) {
  const path = [];
  for (let n = to; parent.get(n) !== -1; n = parent.get(n)) path.push(n);
  return path.reverse();
}

// Every legal move for one marble: steps (stop-filtered), the full hop graph,
// the legal stop holes, and one concrete path per stop (shortest).
export function marbleMoves(grid, from, geo, options) {
  const long = options.jumps === "long";
  const steps = NEIGHBORS[from].filter((n) => !grid[n] && canStop(n, from, geo, options));
  const { graph, reach, parent } = hopGraph(grid, from, long);
  const hopStops = reach.filter((n) => canStop(n, from, geo, options));
  const moves = steps.map((to) => ({ from, to, path: [to] }))
    .concat(hopStops.map((to) => ({ from, to, path: pathFromParents(parent, to) })));
  return { steps, graph, stops: steps.concat(hopStops), moves };
}

// All legal moves for a seat. Index form (for rules / bots).
export function seatMoves(grid, mark, geo, options) {
  const perMarble = [];
  for (const from of STAR) {
    if (grid[from] !== mark) continue;
    const m = marbleMoves(grid, from, geo, options);
    if (m.stops.length) perMarble.push(m);
  }
  return perMarble;
}

// Key form for the projection: { legal: {from: {steps, hops}}, stops: {from: [..]} }.
export function seatLegalKeys(grid, mark, geo, options) {
  const legal = {};
  const stops = {};
  for (const m of seatMoves(grid, mark, geo, options)) {
    const from = KEY_AT[m.moves[0].from];
    const hops = {};
    m.graph.forEach((lands, node) => { hops[KEY_AT[node]] = lands.map((l) => KEY_AT[l]); });
    legal[from] = { steps: m.steps.map((s) => KEY_AT[s]), hops };
    stops[from] = m.stops.map((s) => KEY_AT[s]);
  }
  return { legal, stops };
}

export function hasAnyMove(grid, mark, geo, options) {
  for (const from of STAR) {
    if (grid[from] !== mark) continue;
    if (NEIGHBORS[from].some((n) => !grid[n] && canStop(n, from, geo, options))) return true;
    if (marbleMoves(grid, from, geo, options).stops.length) return true;
  }
  return false;
}

// ---------- path replay ----------

// One hop cur -> land on `grid` (mover lifted). Returns the jumped marble's
// index, or -1 when that hop is not legal on this board.
function hopJumped(grid, cur, land, long) {
  const dq = Q[land] - Q[cur];
  const dr = R[land] - R[cur];
  const dist = hexDistanceIdx(cur, land);
  if (dist < 2 || dist % 2) return -1;
  if (dq !== 0 && dr !== 0 && dq + dr !== 0) return -1; // not on a hex line
  const half = dist / 2;
  if (!long && half !== 1) return -1;
  const uq = dq / dist;
  const ur = dr / dist;
  if (grid[land]) return -1;
  for (let j = 1; j < dist; j += 1) {
    const c = cellAt(Q[cur] + j * uq, R[cur] + j * ur);
    if (c < 0) return -1;
    if (j === half ? !grid[c] : grid[c]) return -1;
  }
  return cellAt(Q[cur] + half * uq, R[cur] + half * ur);
}

// The cells a hop cur -> land depends on (for blaming a cut).
export function hopLine(cur, land) {
  const dist = hexDistanceIdx(cur, land);
  if (!dist) return [land];
  const uq = (Q[land] - Q[cur]) / dist;
  const ur = (R[land] - R[cur]) / dist;
  const out = [];
  for (let j = 1; j <= dist; j += 1) {
    const c = Number.isInteger(uq) && Number.isInteger(ur) ? cellAt(Q[cur] + j * uq, R[cur] + j * ur) : -1;
    if (c >= 0) out.push(c);
  }
  return out.length ? out : [land];
}

// Walk `path` (landing indices) for the marble at `from` against `grid` as it
// stands. Returns { kind: "step"|"hop", reached, hopped, failAt } where
// `reached` = how many path entries are legal in sequence, `hopped[j]` = the
// marble jumped by hop j, and `failAt` = first failing path position (or -1).
export function replayPath(grid, from, path, options) {
  const long = options.jumps === "long";
  if (!Array.isArray(path) || !path.length) return { kind: "hop", reached: 0, hopped: [], failAt: 0, malformed: true };
  if (isAdjacent(from, path[0])) {
    const malformed = path.length !== 1;
    const ok = !malformed && !grid[path[0]];
    return { kind: "step", reached: ok ? 1 : 0, hopped: [], failAt: ok ? -1 : 0, malformed };
  }
  const saved = grid[from];
  grid[from] = null;
  const seen = new Set([from]);
  const hopped = [];
  let cur = from;
  let failAt = -1;
  for (let j = 0; j < path.length; j += 1) {
    const land = path[j];
    const mid = seen.has(land) ? -1 : hopJumped(grid, cur, land, long);
    if (mid < 0) { failAt = j; break; }
    hopped.push(mid);
    seen.add(land);
    cur = land;
  }
  grid[from] = saved;
  return { kind: "hop", reached: hopped.length, hopped, failAt, malformed: false };
}

// Longest prefix length (1..reached) whose last hole is a legal stop; 0 = none.
export function stopPrefix(replay, from, path, geo, options) {
  for (let n = replay.reached; n >= 1; n -= 1) {
    if (canStop(path[n - 1], from, geo, options)) return n;
  }
  return 0;
}

// Full validation (arrival-time): the whole path is legal now and ends on a
// legal stop. Returns null when fine, else a player-readable reason.
export function pathProblem(grid, from, path, geo, options) {
  const replay = replayPath(grid, from, path, options);
  if (replay.malformed) return "A step moves one hole and ends the move.";
  if (replay.reached !== path.length) {
    return replay.kind === "step" ? "That hole is taken." : "That jump isn't open — pick another route.";
  }
  if (!canStop(path[path.length - 1], from, geo, options)) {
    return geo.goalSet.has(from) && options.stay_in_goal
      ? "Marbles in their goal must end the move inside it."
      : "No parking: a move can't end in another player's arm.";
  }
  return null;
}

// ---------- captures ----------

// Send every hopped OPPONENT marble home: to the free home hole nearest the
// owner's tip (if home is full, the free star hole nearest that tip; ties by
// key order). Teammates and marbles sitting in their own goal are safe; a
// marble hopped twice is captured once. Mutates `grid`; returns
// [{ mark, from, to }] as indices.
export function applyCaptures(grid, mover, hopped, geoOf, teamOf) {
  const victims = [];
  const seen = new Set();
  for (const c of hopped) {
    if (seen.has(c)) continue;
    seen.add(c);
    const owner = grid[c];
    if (!owner || owner === mover) continue;
    const moverTeam = teamOf(mover);
    if (moverTeam !== null && moverTeam !== undefined && teamOf(owner) === moverTeam) continue;
    const geo = geoOf(owner);
    if (!geo || geo.goalSet.has(c)) continue;
    victims.push({ mark: owner, from: c });
  }
  victims.forEach((v) => { grid[v.from] = null; });
  victims.forEach((v) => {
    const geo = geoOf(v.mark);
    v.to = nearestFree(grid, geo.home.filter((i) => !grid[i]), geo.home_tip)
      ?? nearestFree(grid, STAR.filter((i) => !grid[i]), geo.home_tip);
    if (v.to === null || v.to === undefined) { v.to = v.from; }
    grid[v.to] = v.mark;
  });
  return victims;
}

function nearestFree(grid, candidates, tip) {
  let best = null;
  let bestD = Infinity;
  for (const i of candidates) {
    const d = hexDistanceIdx(i, tip);
    if (d < bestD || (d === bestD && KEY_AT[i] < KEY_AT[best])) { best = i; bestD = d; }
  }
  return best;
}

// ---------- progress ----------

// Sum of hex distances to the goal tip minus the full-goal minimum (0 = home).
export function seatDistance(grid, mark, geo) {
  let sum = 0;
  for (const i of STAR) if (grid[i] === mark) sum += hexDistanceIdx(i, geo.goal_tip);
  return Math.max(0, sum - geo.min_sum);
}
export function inGoalCount(grid, mark, geo) {
  return geo.goal.reduce((n, i) => n + (grid[i] === mark ? 1 : 0), 0);
}
// Finished: goal all own. Anti-block: goal completely full and MORE THAN HALF
// of it own (PLAN says "at least one own"; read literally that finishes a seat
// in round 2 when it slips one marble into a hole its opposite neighbour just
// vacated, because the goal is that neighbour's still-full home — so the
// camper rule only kicks in once the seat really is mostly home).
export function goalFinished(grid, mark, geo, antiBlock) {
  let own = 0;
  for (const i of geo.goal) {
    if (!grid[i]) return false;
    if (grid[i] === mark) own += 1;
  }
  return own === geo.goal.length || (antiBlock && own * 2 > geo.goal.length);
}
