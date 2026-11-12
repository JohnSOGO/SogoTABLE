// Realmwright — derived-feature engine. Pure: plain data in, plain data out.
//
// The board is only a placement list ([{ x, y, t, r, meeples: [{ f, mark }] }]);
// every merged feature (a city spanning six tiles, a road loop, a field) is
// DERIVED from it on demand with a union-find over (placement, featureIdx)
// nodes, joined port-by-port across neighbouring tiles. Nothing derived is
// ever stored, so state stays small, deterministic and replayable.
//
// FEATURE_KINDS is the expansion seam: one row per kind says whether a meeple
// may claim it, when it is complete, and how it scores complete / at game end.
// A new kind (say, a river or a cathedral city) is a new row plus tiles that
// use it — the engine below never branches on kind names except through it.

import { SIDE_DELTAS, rotatePort, oppositePort, portSide, portKinds, portFeatures } from "./tiles.js";

const cellKey = (x, y) => x + "," + y;

export const FEATURE_KINDS = {
  city: {
    claimable: () => true,
    isComplete: (f) => f.open === 0,
    scoreComplete: (f, options) => (options && options.small_city && f.cells.length === 2
      ? f.cells.length + f.pennants // small city: 1 / tile + 1 / pennant
      : 2 * f.cells.length + 2 * f.pennants),
    scoreEnd: (f) => f.cells.length + f.pennants,
  },
  road: {
    claimable: () => true,
    isComplete: (f) => f.open === 0,
    scoreComplete: (f) => f.cells.length,
    scoreEnd: (f) => f.cells.length,
  },
  cloister: {
    claimable: () => true,
    isComplete: (f) => f.cells.length === 9,
    scoreComplete: () => 9,
    scoreEnd: (f) => f.cells.length,
  },
  field: {
    claimable: (options) => Boolean(options && options.farmers === "on"),
    isComplete: () => false, // fields only ever score at game end
    scoreComplete: () => 0,
    scoreEnd: (f, ctx) => 3 * f.cities.filter((root) => ctx.features[root] && ctx.features[root].complete).length,
  },
};

function kindOf(kind) {
  return FEATURE_KINDS[kind] || FEATURE_KINDS.road;
}

// ---------- union-find ----------

function find(parent, a) {
  while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
  return a;
}
function union(parent, a, b) {
  const ra = find(parent, a);
  const rb = find(parent, b);
  if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
}

// Rotated port → featureIdx for a placement (cached per def + rotation).
function rotatedFeatures(def, r) {
  if (!def._rot) Object.defineProperty(def, "_rot", { value: [], enumerable: false });
  if (!def._rot[r]) {
    const base = portFeatures(def);
    const out = new Array(12);
    for (let p = 0; p < 12; p += 1) out[rotatePort(p, r)] = base[p];
    def._rot[r] = out;
  }
  return def._rot[r];
}
function rotatedKinds(def, r) {
  if (!def._rotK) Object.defineProperty(def, "_rotK", { value: [], enumerable: false });
  if (!def._rotK[r]) {
    const base = portKinds(def);
    const out = new Array(12);
    for (let p = 0; p < 12; p += 1) out[rotatePort(p, r)] = base[p];
    def._rotK[r] = out;
  }
  return def._rotK[r];
}

// ---------- derive ----------

// derive(board, defs) → {
//   index: Map "x,y" → placementIdx, offsets: node offset per placement,
//   root(i, fi) → feature root id,
//   features: { [root]: { root, kind, cells: [[x,y]], pennants, open, complete,
//                         meeples: [{ mark, at: placementIdx, f }], cities: [root] (fields) } }
// }
export function derive(board, defs) {
  const index = new Map();
  const offsets = [];
  let n = 0;
  board.forEach((p, i) => {
    index.set(cellKey(p.x, p.y), i);
    offsets.push(n);
    n += defs[p.t] ? defs[p.t].features.length : 0;
  });
  const parent = new Array(n);
  for (let i = 0; i < n; i += 1) parent[i] = i;
  const open = new Array(n).fill(0);

  board.forEach((p, i) => {
    const def = defs[p.t];
    if (!def) return;
    const feats = rotatedFeatures(def, p.r);
    for (let s = 0; s < 4; s += 1) {
      const [dx, dy] = SIDE_DELTAS[s];
      const j = index.get(cellKey(p.x + dx, p.y + dy));
      if (j === undefined) {
        // An open side counts once per feature touching it.
        const seen = new Set();
        for (let k = 0; k < 3; k += 1) {
          const fi = feats[3 * s + k];
          if (!seen.has(fi)) { seen.add(fi); open[offsets[i] + fi] += 1; }
        }
        continue;
      }
      if (j < i) continue; // each shared edge once
      const q = board[j];
      const qdef = defs[q.t];
      if (!qdef) continue;
      const qfeats = rotatedFeatures(qdef, q.r);
      for (let k = 0; k < 3; k += 1) {
        const port = 3 * s + k;
        union(parent, offsets[i] + feats[port], offsets[j] + qfeats[oppositePort(port)]);
      }
    }
  });

  const features = {};
  const root = (i, fi) => find(parent, offsets[i] + fi);
  board.forEach((p, i) => {
    const def = defs[p.t];
    if (!def) return;
    def.features.forEach((f, fi) => {
      const node = offsets[i] + fi;
      let id;
      let entry;
      if (f.kind === "cloister") {
        id = node; // a cloister never merges
        const cells = [[p.x, p.y]];
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dy = -1; dy <= 1; dy += 1) {
            if ((dx || dy) && index.has(cellKey(p.x + dx, p.y + dy))) cells.push([p.x + dx, p.y + dy]);
          }
        }
        entry = features[id] = { root: id, kind: "cloister", cells, cellSet: null, pennants: 0, open: 9 - cells.length, meeples: [], cities: [] };
      } else {
        id = find(parent, node);
        entry = features[id] || (features[id] = { root: id, kind: f.kind, cells: [], cellSet: new Set(), pennants: 0, open: 0, meeples: [], cities: [] });
        const key = cellKey(p.x, p.y);
        if (!entry.cellSet.has(key)) { entry.cellSet.add(key); entry.cells.push([p.x, p.y]); }
        if (f.pennant) entry.pennants += 1;
        entry.open += open[node];
      }
      (p.meeples || []).forEach((m) => { if (m.f === fi) entry.meeples.push({ mark: m.mark, at: i, f: fi }); });
    });
  });
  // Fields → the merged cities they touch.
  board.forEach((p, i) => {
    const def = defs[p.t];
    if (!def) return;
    def.features.forEach((f, fi) => {
      if (f.kind !== "field" || !f.cities) return;
      const entry = features[root(i, fi)];
      f.cities.forEach((ci) => {
        const c = root(i, ci);
        if (!entry.cities.includes(c)) entry.cities.push(c);
      });
    });
  });
  Object.values(features).forEach((f) => {
    f.complete = kindOf(f.kind).isComplete(f);
    delete f.cellSet;
  });
  return { index, offsets, root, features };
}

// ---------- legality ----------

// Empty cells orthogonally next to a tile.
export function frontier(board, index) {
  const out = [];
  const seen = new Set();
  board.forEach((p) => {
    for (const [dx, dy] of SIDE_DELTAS) {
      const x = p.x + dx;
      const y = p.y + dy;
      const key = cellKey(x, y);
      if (index.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push([x, y]);
    }
  });
  return out;
}

// Does tile `def` at rotation r fit at (x, y)? Needs ≥ 1 neighbour and every
// touching side to match port-by-port.
export function fits(board, index, defs, def, x, y, r) {
  if (index.has(cellKey(x, y))) return false;
  const kinds = rotatedKinds(def, r);
  let neighbours = 0;
  for (let s = 0; s < 4; s += 1) {
    const [dx, dy] = SIDE_DELTAS[s];
    const j = index.get(cellKey(x + dx, y + dy));
    if (j === undefined) continue;
    neighbours += 1;
    const q = board[j];
    const qkinds = rotatedKinds(defs[q.t], q.r);
    for (let k = 0; k < 3; k += 1) {
      const port = 3 * s + k;
      if (kinds[port] !== qkinds[oppositePort(port)]) return false;
    }
  }
  return neighbours > 0;
}

// Which merged features a new tile's feature would join (their roots).
export function joinedRoots(board, derived, defs, def, x, y, r, fi) {
  const roots = new Set();
  const f = def.features[fi];
  for (const port of f.ports) {
    const rp = rotatePort(port, r);
    const s = portSide(rp);
    const [dx, dy] = SIDE_DELTAS[s];
    const j = derived.index.get(cellKey(x + dx, y + dy));
    if (j === undefined) continue;
    const q = board[j];
    roots.add(derived.root(j, rotatedFeatures(defs[q.t], q.r)[oppositePort(rp)]));
  }
  return [...roots];
}

// Feature indices of `def` (placed at x,y,r) a meeple may stand on.
export function meepleSpots(board, derived, defs, def, x, y, r, options, meeplesLeft) {
  if (!(meeplesLeft > 0)) return [];
  const out = [];
  def.features.forEach((f, fi) => {
    if (!kindOf(f.kind).claimable(options)) return;
    const taken = joinedRoots(board, derived, defs, def, x, y, r, fi)
      .some((root) => derived.features[root] && derived.features[root].meeples.length > 0);
    if (!taken) out.push(fi);
  });
  return out;
}

// legalPlacements(board, typeId, defs, options, meeplesLeft, derived?) →
//   [{ x, y, r, meeples: [featureIdx] }]. Pass a precomputed `derived` to
//   share one derive across several seats.
export function legalPlacements(board, typeId, defs, options, meeplesLeft, derived) {
  const def = defs[typeId];
  if (!def) return [];
  const d = derived || derive(board, defs);
  const out = [];
  for (const [x, y] of frontier(board, d.index)) {
    for (let r = 0; r < 4; r += 1) {
      if (!fits(board, d.index, defs, def, x, y, r)) continue;
      out.push({ x, y, r, meeples: meepleSpots(board, d, defs, def, x, y, r, options, meeplesLeft) });
    }
  }
  return out;
}

// Cheap existence check (no meeple work) used for dead-tile redraws.
export function hasAnyPlacement(board, typeId, defs, derived) {
  const def = defs[typeId];
  if (!def) return false;
  const d = derived || derive(board, defs);
  for (const [x, y] of frontier(board, d.index)) {
    for (let r = 0; r < 4; r += 1) if (fits(board, d.index, defs, def, x, y, r)) return true;
  }
  return false;
}

// ---------- scoring ----------

// Marks holding the most meeples on a feature (all tied leaders score).
export function majority(meeples) {
  const counts = new Map();
  (meeples || []).forEach((m) => counts.set(m.mark, (counts.get(m.mark) || 0) + 1));
  if (!counts.size) return [];
  const top = Math.max(...counts.values());
  return [...counts.keys()].filter((mark) => counts.get(mark) === top);
}

// Features touched by placement `i` (its own, plus cloisters around it) that
// are complete AND hold meeples → [{ feature, points, marks }]. The caller
// banks the points and returns the meeples.
export function completedByPlacement(board, derived, defs, i, options) {
  const p = board[i];
  const out = [];
  const seen = new Set();
  const consider = (root) => {
    if (seen.has(root)) return;
    seen.add(root);
    const f = derived.features[root];
    if (!f || !f.complete || !f.meeples.length) return;
    out.push({ feature: f, points: kindOf(f.kind).scoreComplete(f, options), marks: majority(f.meeples) });
  };
  defs[p.t].features.forEach((f, fi) => {
    if (f.kind === "field") return;
    consider(derived.root(i, fi));
  });
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if (!dx && !dy) continue;
      const j = derived.index.get(cellKey(p.x + dx, p.y + dy));
      if (j === undefined) continue;
      const q = board[j];
      defs[q.t].features.forEach((f, fi) => { if (f.kind === "cloister") consider(derived.root(j, fi)); });
    }
  }
  return out;
}

// End-game scoring of everything still holding meeples (incomplete roads,
// cities, cloisters; fields when farmers are on). A completed city adjacent
// to several fields is scored by each field it touches (3rd-edition rule).
// → [{ feature, points, marks }]
export function endGameScores(derived, options) {
  const out = [];
  const ctx = { features: derived.features, options };
  Object.values(derived.features).forEach((f) => {
    if (!f.meeples.length) return;
    if (f.kind === "field" && !kindOf("field").claimable(options)) return;
    if (f.complete && f.kind !== "field") return; // already banked when it closed
    const points = kindOf(f.kind).scoreEnd(f, ctx);
    out.push({ feature: f, points, marks: majority(f.meeples) });
  });
  return out;
}
