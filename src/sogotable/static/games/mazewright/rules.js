// Mazewright — pure rules core (no DOM, no timers, no network).
//
// Lifted from the AI/ standalone prototype; this is the shared engine the client
// renderer AND the Worker seat-wrapper both import (the Yahtzee split). It is a
// Game-Locked game: every player builds and crawls their OWN maze; the shared
// truth is a leaderboard + three prizes, not a board.
//
//   BUILD  — add/remove interior walls (≤ MAX_WALLS), set ONE perimeter exit,
//            and place your pawn + loot (drag/tap).
//   CRAWL  — move your pawn through fog to the exit; reaching it (and stepping out
//            through the golden arch) escapes that maze.
//
// State is plain serializable data so it round-trips through D1. The single
// transition entry point is applyAction(state, action, rng). The build editing
// and the fog crawl run client-side (local-first); only the barrier events
// (submitting a maze, posting a run result) cross to the server.

export const PHASE = { BUILD: 'build', CRAWL: 'crawl', MAZE_DONE: 'maze_done', OVER: 'over' };

export const MAX_WALLS = 30;
export const MIN_WALLS = 10;   // a submitted maze needs at least this many walls
export const EXCESS_CAP = 20;  // per-runner author credit ceiling (excess over the shortest escape)
export const LOOT_BONUS = 2;   // author credit per loot a runner is baited into grabbing
export const WIN_WEIGHTS = { author: 5, runner: 3, treasure: 3 }; // champion = rank-weighted composite

const DIRS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

// Fallbacks only — the seated player's emoji + colour come from the server.
const DEFAULT_EMOJIS = ['🧙', '🐉', '🦄', '👾', '🐙', '🦊'];
const DEFAULT_COLORS = ['#7c6cff', '#e85d75', '#46d18a', '#e7c14a', '#4db6e8', '#e88d4d'];

// Loot the wright hides: 3 diamonds + 2 coins, spread out, off the centre start.
function defaultItems(cols, rows) {
  return [
    { type: 'diamond', cell: [1, 1] },
    { type: 'diamond', cell: [cols - 2, 1] },
    { type: 'diamond', cell: [Math.floor(cols / 2), rows - 2] },
    { type: 'diamond', cell: [1, rows - 2] },
    { type: 'diamond', cell: [cols - 2, rows - 2] },
  ];
}

// ---------- geometry helpers ----------

export function edgeKey(a, b) {
  const ax = a[0], ay = a[1], bx = b[0], by = b[1];
  const aFirst = ax < bx || (ax === bx && ay < by);
  return aFirst ? `${ax},${ay}-${bx},${by}` : `${bx},${by}-${ax},${ay}`;
}

function inBounds(state, c, r) {
  return c >= 0 && r >= 0 && c < state.cols && r < state.rows;
}

function neighbors(state, c, r) {
  const out = [];
  for (const [dc, dr] of Object.values(DIRS)) {
    const nc = c + dc, nr = r + dr;
    if (inBounds(state, nc, nr)) out.push([nc, nr]);
  }
  return out;
}

export function canStep(state, from, to) {
  return !state.walls[edgeKey(from, to)];
}

export function pathExists(state, from, to, extraEdge = null) {
  if (from[0] === to[0] && from[1] === to[1]) return true;
  const blocked = extraEdge ? { ...state.walls, [extraEdge]: true } : state.walls;
  const seen = new Set([`${from[0]},${from[1]}`]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of neighbors(state, cur[0], cur[1])) {
      if (blocked[edgeKey(cur, nb)]) continue;
      const key = `${nb[0]},${nb[1]}`;
      if (seen.has(key)) continue;
      if (nb[0] === to[0] && nb[1] === to[1]) return true;
      seen.add(key);
      queue.push(nb);
    }
  }
  return false;
}

// ---------- setup ----------

export function createGame(opts = {}) {
  const cols = opts.cols ?? 7;
  const rows = opts.rows ?? 7;
  const center = [Math.floor(cols / 2), Math.floor(rows / 2)];

  const seats = opts.seats ?? [
    { name: 'Player 1', emoji: '🧙', color: '#7c6cff' },
    { name: 'Player 2', emoji: '🐉', color: '#e85d75' },
  ];
  const players = seats.map((s, i) => ({
    id: i,
    name: s.name ?? `Player ${i + 1}`,
    emoji: s.emoji ?? DEFAULT_EMOJIS[i % DEFAULT_EMOJIS.length],
    color: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));

  return {
    cols,
    rows,
    phase: PHASE.BUILD,
    me: opts.me ?? 0,
    players,
    walls: {},
    exit: null,
    start: [center[0], center[1]],
    pos: [center[0], center[1]],
    items: defaultItems(cols, rows),
    finished: false,
    winner: null,
    // ---- crawl-phase fog state ----
    transform: null,
    visited: {},
    revealedWalls: {},
    revealedPerim: {},
    inventory: [],
    exitRevealed: false,
    moves: 0,
    revealOnFinish: false,   // live single-maze run: escape -> MAZE_DONE (reveal), not OVER
    // ---- offline series (the standalone simulates the other players) ----
    series: null,
    seriesIndex: 0,
    results: [],
    standings: null,
  };
}

function captureDesign(state, author) {
  return {
    author,
    walls: { ...state.walls },
    exit: state.exit ? { cell: [...state.exit.cell], dir: state.exit.dir } : null,
    items: state.items.map((it) => ({ type: it.type, cell: [...it.cell] })),
    start: [...state.start],
  };
}

function resetFog(state) {
  state.pos = [...state.start];
  state.visited = { [`${state.start[0]},${state.start[1]}`]: true };
  state.revealedWalls = {};
  state.revealedPerim = {};
  state.inventory = [];
  state.exitRevealed = false;
  state.moves = 0;
  state.phase = PHASE.CRAWL;
  // A gem placed on the start cell is collected on spawn — MOVE only collects
  // on *entering* a cell, so without this the runner would have to step off
  // and back on to claim loot they are standing on.
  for (const it of state.items) {
    if (!it.collected && it.cell[0] === state.pos[0] && it.cell[1] === state.pos[1]) {
      it.collected = true;
      state.inventory.push(it.type);
    }
  }
}

function loadMaze(state, design, rng) {
  state.walls = { ...design.walls };
  state.exit = design.exit ? { cell: [...design.exit.cell], dir: design.exit.dir } : null;
  state.items = design.items.map((it) => ({ type: it.type, cell: [...it.cell] }));
  state.start = [...design.start];
  const axis = rng() < 0.5 ? 'x' : 'y';
  const rot = rng() < 0.5 ? 90 : -90;
  applyTransform(state, axis, rot);
  state.transform = { axis, rot };
  resetFog(state);
}

// LIVE: start a fog crawl from a server-provided maze code + a server-chosen
// transform (deterministic, not random). Escape -> MAZE_DONE so the client can
// reveal the maze, post the result, and advance the deck itself.
export function loadRunFromCode(state, code, transform) {
  applyMazeCode(state, code);
  applyTransform(state, transform.axis, transform.rot);
  state.transform = { axis: transform.axis, rot: transform.rot };
  state.series = null;
  state.revealOnFinish = true;
  resetFog(state);
  return state;
}

// ---------- map transform (disorient the builder) ----------
function txCell(N, axis, rot, c, r) {
  let x = c, y = r;
  if (axis === 'x') x = N - 1 - x; else y = N - 1 - y;
  if (rot === 90) { const nx = N - 1 - y, ny = x; x = nx; y = ny; }
  else { const nx = y, ny = N - 1 - x; x = nx; y = ny; }
  return [x, y];
}
function txDir(axis, rot, dir) {
  let d = dir;
  if (axis === 'x') d = { E: 'W', W: 'E', N: 'N', S: 'S' }[d];
  else d = { N: 'S', S: 'N', E: 'E', W: 'W' }[d];
  if (rot === 90) d = { N: 'E', E: 'S', S: 'W', W: 'N' }[d];
  else d = { N: 'W', W: 'S', S: 'E', E: 'N' }[d];
  return d;
}
function applyTransform(state, axis, rot) {
  const N = state.cols;
  const t = (cell) => txCell(N, axis, rot, cell[0], cell[1]);
  const nw = {};
  for (const key of Object.keys(state.walls)) {
    const [a, b] = key.split('-').map((s) => s.split(',').map(Number));
    nw[edgeKey(t(a), t(b))] = true;
  }
  state.walls = nw;
  state.start = t(state.start);
  state.items = state.items.map((it) => ({ ...it, cell: t(it.cell) }));
  if (state.exit) state.exit = { cell: t(state.exit.cell), dir: txDir(axis, rot, state.exit.dir) };
}

export function randomTransform(rng = Math.random) {
  return { axis: rng() < 0.5 ? 'x' : 'y', rot: rng() < 0.5 ? 90 : -90 };
}

// ---------- auto-build: a random, solvable dungeon layout ----------
function autoBuild(state, rng) {
  const N = state.cols;
  const rc = () => Math.floor(rng() * N);
  state.walls = {};
  state.start = [rc(), rc()];
  state.pos = [state.start[0], state.start[1]];
  const per = perimeterEdges(state);
  const e = per[Math.floor(rng() * per.length)];
  state.exit = { cell: [e.cell[0], e.cell[1]], dir: e.dir };
  const types = ['diamond', 'diamond', 'diamond', 'diamond', 'diamond'];
  const used = new Set([state.start.join(',')]);
  state.items = types.map((type) => {
    let cell;
    do { cell = [rc(), rc()]; } while (used.has(cell.join(',')));
    used.add(cell.join(','));
    return { type, cell };
  });
  const targets = [state.exit.cell, ...state.items.map((i) => i.cell)];
  const ok = (extraKey) => targets.every((t) => pathExists(state, state.start, t, extraKey));
  const edges = interiorEdges(state);
  let placed = 0, attempts = 0;
  while (placed < MAX_WALLS && attempts < edges.length * 12) {
    attempts++;
    const edge = edges[Math.floor(rng() * edges.length)];
    const key = edgeKey(edge[0], edge[1]);
    if (state.walls[key]) continue;
    if (!ok(key)) continue;
    state.walls[key] = true; placed++;
  }
}

// SERVER: a random solvable maze as a code (used to give bots a maze).
// Bots must pass the same gate humans do: autoBuild guarantees solvability
// structurally but hits MIN_WALLS only statistically, so retry until the code
// clears isValidMazeCode (in practice the first attempt almost always does).
export function buildRandomMazeCode(rng = Math.random) {
  let code = "";
  for (let i = 0; i < 25; i++) {
    const g = createGame();
    autoBuild(g, rng);
    code = mazeCode(g);
    if (isValidMazeCode(code)) return code;
  }
  return code;
}

// BFS shortest-path step count between two cells (walls respected).
function bfsDist(st, from, to) {
  if (from[0] === to[0] && from[1] === to[1]) return 0;
  const seen = new Set([`${from[0]},${from[1]}`]);
  let frontier = [from], dist = 0;
  while (frontier.length) {
    dist++;
    const next = [];
    for (const cur of frontier)
      for (const nb of neighbors(st, cur[0], cur[1])) {
        if (st.walls[edgeKey(cur, nb)]) continue;
        const k = `${nb[0]},${nb[1]}`;
        if (seen.has(k)) continue;
        if (nb[0] === to[0] && nb[1] === to[1]) return dist;
        seen.add(k); next.push(nb);
      }
    frontier = next;
  }
  return -1;
}

// SERVER: shortest escape length for a maze code — steps to the exit cell plus
// the final step out through the arch. The author-score baseline and the floor a
// posted run can't undercut. Transform-invariant (rotation/reflection preserve it).
export function shortestPathFromCode(code) {
  const g = createGame();
  applyMazeCode(g, code);
  const d = bfsDist(g, g.start, g.exit ? g.exit.cell : g.start);
  return d < 0 ? 0 : d + 1;
}

// SERVER: simulate a bot running a maze code under fog -> {moves, loot}.
export function simulateRun(code, rng = Math.random) {
  const g = createGame();
  applyMazeCode(g, code);
  const sp = bfsDist(g, g.start, g.exit ? g.exit.cell : g.start);
  const base = sp < 0 ? 20 : sp + 1;   // +1 for the step out, matching the run floor
  const walls = Object.keys(g.walls).length;
  const moves = Math.max(base, Math.round(base * (1.3 + rng() * 1.4) + walls * (0.3 + rng() * 0.5)));
  let loot = 0;
  for (let i = 0; i < g.items.length; i++) if (rng() < 0.45) loot++;
  return { moves, loot };
}

// ---------- shared scoring: the single prize + winner calculation ----------
// The Worker seat-wrapper AND the offline standalone both call this so hosted and
// local play can never drift. Inputs are representation-neutral:
//   runs:     [{ runner, author, moves, loot }] — every player's result on every maze
//   shortest: { [author]: shortestEscapeLength } — see shortestPathFromCode()
//   marks:    stable player ordering (deterministic argmax/argmin + tie-breaks)
// Author credit rewards *confusion*, not tedium: a runner's excess moves over the
// shortest escape (capped per runner so one wanderer can't dominate) plus a bonus
// when the maze baits them into grabbing loot. A self-run never credits its author.
// The overall winner is a 5/3/3 rank-weighted composite (see the champion block
// below); ties break on fewest total runner moves.
export function computeStandings(runs, shortest, marks, opts = {}) {
  if (!marks || !marks.length) {
    return { authorPoints: {}, runnerMoves: {}, runnerLoot: {}, composite: {}, parts: {},
      prizes: { mazewright: null, mazerunner: null, treasureHunter: null }, winner: null };
  }
  const cap = opts.excessCap ?? EXCESS_CAP;
  const lootBonus = opts.lootBonus ?? LOOT_BONUS;
  const authorPoints = {}, runnerMoves = {}, runnerLoot = {};
  const authorRuns = {}, runnerRuns = {};   // contest participation per category
  for (const m of marks) { authorPoints[m] = 0; runnerMoves[m] = 0; runnerLoot[m] = 0; authorRuns[m] = 0; runnerRuns[m] = 0; }
  for (const r of runs || []) {
    runnerRuns[r.runner] = (runnerRuns[r.runner] || 0) + 1;
    runnerMoves[r.runner] = (runnerMoves[r.runner] || 0) + r.moves;
    runnerLoot[r.runner] = (runnerLoot[r.runner] || 0) + r.loot;
    if (r.runner === r.author) continue;                 // self-runs never score the author
    authorRuns[r.author] = (authorRuns[r.author] || 0) + 1;   // an opponent ran your maze
    const excess = Math.max(0, Math.min(cap, r.moves - (shortest[r.author] || 0)));
    authorPoints[r.author] = (authorPoints[r.author] || 0) + excess + lootBonus * r.loot;
  }
  const argmax = (score) => marks.reduce((b, m) => ((score[m] || 0) > (score[b] || 0) ? m : b), marks[0]);
  const argmin = (score) => marks.reduce((b, m) => ((score[m] || 0) < (score[b] || 0) ? m : b), marks[0]);
  const prizes = {
    mazewright: argmax(authorPoints),
    mazerunner: argmin(runnerMoves),
    treasureHunter: argmax(runnerLoot),
  };
  // Overall champion: a rank-weighted composite across ALL three fields, so an
  // all-round 2nd-place player beats a one-category specialist. Rank is by *place*
  // (1st = N … last = 1), but only if you actually had a contest there: Mazewright
  // needs an opponent to have run your maze, so a solo player ranks 0 in it (you
  // can't score on your own maze) yet still ranks 1st in Running + Treasure. Weighted
  // 5/3/3. (The +1 place shift is constant across participants, so it never changes
  // who wins — it just stops a sole player or a category-of-one reading as 0.)
  const w = opts.weights ?? WIN_WEIGHTS;
  const aPlace = rankScores(authorPoints, marks, false);
  const mPlace = rankScores(runnerMoves, marks, true);   // fewer moves ranks higher
  const lPlace = rankScores(runnerLoot, marks, false);
  const aRank = {}, mRank = {}, lRank = {};
  for (const m of marks) {
    aRank[m] = authorRuns[m] > 0 ? aPlace[m] : 0;   // no opponent ran your maze (solo) → no Mazewright rank
    mRank[m] = runnerRuns[m] > 0 ? mPlace[m] : 0;
    lRank[m] = runnerRuns[m] > 0 ? lPlace[m] : 0;
  }
  const composite = {}, parts = {};   // parts = the weighted per-category points that sum to composite (the "show the math")
  for (const m of marks) {
    const pa = w.author * aRank[m], pr = w.runner * mRank[m], pt = w.treasure * lRank[m];
    parts[m] = { author: pa, runner: pr, treasure: pt };
    composite[m] = pa + pr + pt;
  }
  const winner = marks.reduce((best, m) => {
    if (best == null) return m;
    if (composite[m] !== composite[best]) return composite[m] > composite[best] ? m : best;
    if ((runnerMoves[m] || 0) !== (runnerMoves[best] || 0)) return (runnerMoves[m] || 0) < (runnerMoves[best] || 0) ? m : best;
    return best;   // stable: the earlier seat keeps the title on a dead tie
  }, null);
  return { authorPoints, runnerMoves, runnerLoot, composite, parts, prizes, winner };
}

// Per-category place score in [1, N]: how many players you beat, plus half of
// those you tie, plus 1 for your own place. 1st (unique) = N, last = 1; symmetric
// ties average out. (computeStandings zeroes this for a category you didn't contest.)
function rankScores(values, marks, lowerBetter) {
  const out = {};
  for (const m of marks) {
    let beats = 0, ties = 0;
    for (const o of marks) {
      if (o === m) continue;
      const a = values[m] || 0, b = values[o] || 0;
      if (a === b) ties++;
      else if (lowerBetter ? a < b : a > b) beats++;
    }
    out[m] = beats + ties / 2 + 1;
  }
  return out;
}

// ---------- enumerations (UI hitboxes + tests) ----------

export function wallCount(state) { return Object.keys(state.walls).length; }

export function interiorEdges(state) {
  const out = [];
  for (let c = 0; c < state.cols; c++)
    for (let r = 0; r < state.rows; r++)
      for (const [dc, dr] of [[1, 0], [0, 1]]) {
        const nc = c + dc, nr = r + dr;
        if (inBounds(state, nc, nr)) out.push([[c, r], [nc, nr]]);
      }
  return out;
}

export function perimeterEdges(state) {
  const out = [];
  for (let c = 0; c < state.cols; c++) {
    out.push({ cell: [c, 0], dir: 'N' });
    out.push({ cell: [c, state.rows - 1], dir: 'S' });
  }
  for (let r = 0; r < state.rows; r++) {
    out.push({ cell: [0, r], dir: 'W' });
    out.push({ cell: [state.cols - 1, r], dir: 'E' });
  }
  return out;
}

export function isExit(state, cell, dir) {
  return !!state.exit &&
    state.exit.cell[0] === cell[0] && state.exit.cell[1] === cell[1] &&
    state.exit.dir === dir;
}

export function canStartCrawl(state) {
  return !!state.exit && !!state.start &&
    pathExists(state, state.start, state.exit.cell);
}

// Every hidden loot must be reachable from the start, or Treasure Hunter is rigged.
export function allLootReachable(state) {
  return (state.items || []).every((it) => pathExists(state, state.start, it.cell));
}

// Ready to submit: solvable, all loot reachable, AND at least MIN_WALLS placed.
export function canSubmit(state) {
  return canStartCrawl(state) && allLootReachable(state) && wallCount(state) >= MIN_WALLS;
}

export function canAddWall(state, edge) {
  if (wallCount(state) >= MAX_WALLS) return false;
  const key = edgeKey(edge[0], edge[1]);
  if (state.walls[key]) return false;
  if (state.exit && state.start &&
      !pathExists(state, state.start, state.exit.cell, key)) return false;
  if (state.start && (state.items || []).some((it) => !pathExists(state, state.start, it.cell, key))) return false;
  return true;
}

export function legalMoves(state) {
  if (state.phase !== PHASE.CRAWL) return [];
  const out = [];
  for (const [dir, [dc, dr]] of Object.entries(DIRS)) {
    const nc = state.pos[0] + dc, nr = state.pos[1] + dr;
    if (!inBounds(state, nc, nr)) continue;
    if (!canStep(state, state.pos, [nc, nr])) continue;
    out.push({ dir, to: [nc, nr] });
  }
  return out;
}

// ---------- maze code: a shareable string encoding the whole design ----------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const DIR_LIST = ['N', 'S', 'E', 'W'];
function bytesToCode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}
function codeToBytes(code) {
  const bytes = [];
  for (let i = 0; i < code.length; i += 4) {
    const c0 = B64.indexOf(code[i]), c1 = B64.indexOf(code[i + 1]);
    const c2 = i + 2 < code.length ? B64.indexOf(code[i + 2]) : -1;
    const c3 = i + 3 < code.length ? B64.indexOf(code[i + 3]) : -1;
    if (c0 < 0 || c1 < 0) throw new Error('MW: bad maze code');
    const n = (c0 << 18) | (c1 << 12) | ((c2 < 0 ? 0 : c2) << 6) | (c3 < 0 ? 0 : c3);
    bytes.push((n >> 16) & 255);
    if (c2 >= 0) bytes.push((n >> 8) & 255);
    if (c3 >= 0) bytes.push(n & 255);
  }
  return bytes;
}

export function mazeCode(state) {
  const cols = state.cols, rows = state.rows;
  const idx = (c, r) => r * cols + c;
  const bytes = [(cols << 4) | rows, idx(state.start[0], state.start[1])];
  bytes.push(state.exit ? idx(state.exit.cell[0], state.exit.cell[1]) * 4 + DIR_LIST.indexOf(state.exit.dir) : 255);
  for (const it of state.items) bytes.push(idx(it.cell[0], it.cell[1]));
  const edges = interiorEdges(state);
  const wallBytes = new Array(Math.ceil(edges.length / 8)).fill(0);
  edges.forEach((e, i) => { if (state.walls[edgeKey(e[0], e[1])]) wallBytes[i >> 3] |= (1 << (i & 7)); });
  return bytesToCode(bytes.concat(wallBytes));
}

export function applyMazeCode(state, code) {
  const bytes = codeToBytes(String(code || '').trim());
  if (bytes.length < 8) throw new Error('MW: bad maze code');
  const cols = bytes[0] >> 4, rows = bytes[0] & 0xf;
  if (cols !== state.cols || rows !== state.rows) throw new Error('MW: maze code size mismatch');
  const cell = (i) => [i % cols, Math.floor(i / cols)];
  state.start = cell(bytes[1]); state.pos = [state.start[0], state.start[1]];
  state.exit = bytes[2] === 255 ? null : { cell: cell(Math.floor(bytes[2] / 4)), dir: DIR_LIST[bytes[2] % 4] };
  const types = ['diamond', 'diamond', 'diamond', 'diamond', 'diamond'];
  state.items = types.map((type, i) => ({ type, cell: cell(bytes[3 + i]) }));
  const edges = interiorEdges(state);
  const wallBytes = bytes.slice(8);
  state.walls = {};
  edges.forEach((e, i) => { if ((wallBytes[i >> 3] ?? 0) & (1 << (i & 7))) state.walls[edgeKey(e[0], e[1])] = true; });
}

// Validate a maze code is well-formed + solvable (server accepts only these).
export function isValidMazeCode(code) {
  try {
    const g = createGame();
    applyMazeCode(g, code);
    return canSubmit(g);   // solvable + at least MIN_WALLS
  } catch (_) { return false; }
}

// ---------- the single transition entry point ----------
export function applyAction(state, action, rng = Math.random) {
  if (!action || typeof action.type !== 'string') throw new Error('MW: action must have a type');
  if (state.phase === PHASE.OVER) throw new Error('MW: game is over');

  switch (action.type) {
    case 'TOGGLE_WALL': {
      if (state.phase !== PHASE.BUILD) throw new Error(`MW: cannot edit walls during phase "${state.phase}"`);
      const edge = action.edge;
      if (!edge || edge.length !== 2) throw new Error('MW: TOGGLE_WALL needs edge=[[c,r],[c,r]]');
      const [a, b] = edge;
      if (!inBounds(state, a[0], a[1]) || !inBounds(state, b[0], b[1])) throw new Error('MW: wall edge cell out of bounds');
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) throw new Error('MW: wall must sit between two adjacent cells');
      const key = edgeKey(a, b);
      if (state.walls[key]) {
        delete state.walls[key];
      } else {
        if (wallCount(state) >= MAX_WALLS) throw new Error(`MW: ${MAX_WALLS}-wall limit reached`);
        if (state.exit && state.start && !pathExists(state, state.start, state.exit.cell, key)) {
          throw new Error('MW: that wall would seal the start off from the exit');
        }
        if (state.start && (state.items || []).some((it) => !pathExists(state, state.start, it.cell, key))) {
          throw new Error('MW: that wall would trap the treasure');
        }
        state.walls[key] = true;
      }
      return state;
    }

    case 'TOGGLE_EXIT': {
      if (state.phase !== PHASE.BUILD) throw new Error(`MW: cannot set the exit during phase "${state.phase}"`);
      const { cell, dir } = action;
      if (!cell || !DIRS[dir]) throw new Error('MW: TOGGLE_EXIT needs cell + dir');
      if (!inBounds(state, cell[0], cell[1])) throw new Error('MW: exit cell out of bounds');
      const [dc, dr] = DIRS[dir];
      if (inBounds(state, cell[0] + dc, cell[1] + dr)) throw new Error('MW: the exit must be on the perimeter');
      state.exit = isExit(state, cell, dir) ? null : { cell: [cell[0], cell[1]], dir };
      return state;
    }

    case 'SET_START': {
      if (state.phase !== PHASE.BUILD) throw new Error('MW: can only move your start in the build phase');
      const cell = action.cell;
      if (!cell || !inBounds(state, cell[0], cell[1])) throw new Error('MW: start cell out of bounds');
      state.start = [cell[0], cell[1]];
      state.pos = [cell[0], cell[1]];
      return state;
    }

    case 'SET_ITEM': {
      if (state.phase !== PHASE.BUILD) throw new Error('MW: can only move loot in the build phase');
      const { index, cell } = action;
      if (index == null || !state.items[index]) throw new Error('MW: bad item index');
      if (!cell || !inBounds(state, cell[0], cell[1])) throw new Error('MW: item cell out of bounds');
      state.items[index] = { ...state.items[index], cell: [cell[0], cell[1]] };
      return state;
    }

    case 'AUTO_BUILD': {
      if (state.phase !== PHASE.BUILD) throw new Error('MW: can only auto-build while building');
      autoBuild(state, rng);
      return state;
    }

    case 'LOAD_CODE': {
      if (state.phase !== PHASE.BUILD) throw new Error('MW: load a maze code only while building');
      applyMazeCode(state, action.code);
      return state;
    }

    case 'RESET_BUILD': {
      if (state.phase !== PHASE.BUILD) throw new Error('MW: can only reset while building');
      const center = [Math.floor(state.cols / 2), Math.floor(state.rows / 2)];
      state.walls = {};
      state.exit = null;
      state.start = [center[0], center[1]];
      state.pos = [center[0], center[1]];
      state.items = defaultItems(state.cols, state.rows);
      return state;
    }

    case 'NEXT_MAZE': {
      if (state.phase !== PHASE.MAZE_DONE) throw new Error('MW: no maze to advance from');
      if (state.series && state.seriesIndex + 1 < state.series.length) {
        state.seriesIndex += 1;
        loadMaze(state, state.series[state.seriesIndex], rng);
      } else if (state.series) {
        finalizeSeries(state, rng);
        state.finished = true;
        state.phase = PHASE.OVER;
        state.winner = state.me;
      }
      return state;
    }

    case 'START_CRAWL': {
      // Offline standalone only: simulate the other players locally. The live
      // client never calls this — the server assembles the deck and the client
      // uses loadRunFromCode() per maze.
      if (state.phase !== PHASE.BUILD) throw new Error('MW: already crawling');
      if (!state.exit) throw new Error('MW: set an exit before crawling');
      if (!state.start) throw new Error('MW: place your start before crawling');
      if (!pathExists(state, state.start, state.exit.cell)) throw new Error('MW: no open path from the start to the exit');
      const mine = captureDesign(state, state.me);
      state.series = state.players.map((p) => {
        if (p.id === state.me) return mine;
        const tmp = createGame({ seats: state.players, me: p.id });
        autoBuild(tmp, rng);
        return captureDesign(tmp, p.id);
      });
      state.results = [];
      state.seriesIndex = 0;
      loadMaze(state, state.series[0], rng);
      return state;
    }

    case 'MOVE': {
      if (state.phase !== PHASE.CRAWL) throw new Error(`MW: cannot move during phase "${state.phase}"`);
      const delta = DIRS[action.dir];
      if (!delta) throw new Error(`MW: bad move dir "${action.dir}"`);
      state.moves += 1;
      const from = state.pos;
      const onExit = state.exit && from[0] === state.exit.cell[0] && from[1] === state.exit.cell[1];
      if (onExit && action.dir === state.exit.dir) {
        if (state.series) {
          state.results.push({ author: state.series[state.seriesIndex].author, moves: state.moves, inventory: [...state.inventory] });
          state.phase = PHASE.MAZE_DONE;
          return state;
        }
        if (state.revealOnFinish) { state.phase = PHASE.MAZE_DONE; return state; }
        state.finished = true;
        state.phase = PHASE.OVER;
        state.winner = state.me;
        return state;
      }
      const to = [from[0] + delta[0], from[1] + delta[1]];
      if (!inBounds(state, to[0], to[1])) { state.revealedPerim[`${from[0]},${from[1]},${action.dir}`] = true; return state; }
      if (!canStep(state, from, to)) { state.revealedWalls[edgeKey(from, to)] = true; return state; }
      state.pos = to;
      state.visited[`${to[0]},${to[1]}`] = true;
      for (const it of state.items) {
        if (!it.collected && it.cell[0] === to[0] && it.cell[1] === to[1]) {
          it.collected = true;
          state.inventory.push(it.type);
        }
      }
      if (state.exit && to[0] === state.exit.cell[0] && to[1] === state.exit.cell[1]) state.exitRevealed = true;
      return state;
    }

    default:
      throw new Error(`MW: unknown action type "${action.type}"`);
  }
}

// Offline-only prize tally for the standalone (the server owns this when live).
function finalizeSeries(state, rng) {
  const N = state.players.length, M = state.series.length;
  const moves = [], loot = [];
  for (let p = 0; p < N; p++) {
    moves[p] = []; loot[p] = [];
    for (let m = 0; m < M; m++) {
      if (p === state.me) { moves[p][m] = state.results[m].moves; loot[p][m] = state.results[m].inventory.length; }
      else {
        const code = mazeCodeOfDesign(state, state.series[m]);
        const s = simulateRun(code, rng);
        moves[p][m] = s.moves; loot[p][m] = s.loot;
      }
    }
  }
  // Feed the shared scorer the same way the Worker does, so offline standings and
  // hosted standings are computed by one function (no drift).
  const runs = [], shortest = {};
  for (let m = 0; m < M; m++) {
    const author = state.series[m].author;
    shortest[author] = shortestPathFromCode(mazeCodeOfDesign(state, state.series[m]));
    for (let p = 0; p < N; p++) runs.push({ runner: p, author, moves: moves[p][m], loot: loot[p][m] });
  }
  const marks = state.players.map((p) => p.id);
  const s = computeStandings(runs, shortest, marks);
  state.standings = {
    runners: state.players.map((p) => ({ id: p.id, totalMoves: s.runnerMoves[p.id] || 0, totalLoot: s.runnerLoot[p.id] || 0 })),
    authors: state.players.map((p) => ({ id: p.id, points: s.authorPoints[p.id] || 0 })),
    composite: s.composite,
    prizes: s.prizes,
    winner: s.winner,
  };
}
function mazeCodeOfDesign(state, design) {
  const g = createGame({ cols: state.cols, rows: state.rows });
  g.walls = { ...design.walls };
  g.exit = design.exit;
  g.start = [...design.start];
  g.items = design.items.map((it) => ({ type: it.type, cell: [...it.cell] }));
  return mazeCode(g);
}
