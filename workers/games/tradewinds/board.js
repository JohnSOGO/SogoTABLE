// Tradewind Isles — board geometry, generation and placement legality.
// Pure functions over plain data (no DOM, no timers, no RNG of its own: the
// caller passes the seeded `random`).
//
// Geometry: axial hexes (q, r), pointy-top, on an INTEGER lattice so vertex and
// edge ids are exact strings with no float drift:
//   hex centre  x = 2q + r, y = 3r
//   corners     centre + (0,-2) (1,-1) (1,1) (0,2) (-1,1) (-1,-1)
// The client draws x × √3/2 and y × 1/2. A vertex id is "x,y"; an edge id is
// the two vertex ids sorted and joined with "|". Only the hexes (+ ports) are
// stored; vertices and edges are derived on demand.

export const RESOURCES = ["timber", "clay", "fiber", "fruit", "stone"];
export const TERRAIN_YIELD = { grove: "timber", clay: "clay", meadow: "fiber", orchard: "fruit", quarry: "stone", volcano: null };
const CORNERS = [[0, -2], [1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1]];
export const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

const LAYOUTS = {
  small: {
    radius: 2,
    terrain: { grove: 4, meadow: 4, orchard: 4, clay: 3, quarry: 3, volcano: 1 },
    numbers: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12],
    ports: 9,
  },
  large: {
    radius: 3,
    terrain: { grove: 7, meadow: 7, orchard: 7, clay: 7, quarry: 6, volcano: 3 },
    numbers: [2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 11, 12, 12],
    ports: 11,
  },
};

export const vid = (x, y) => `${x},${y}`;
export const eid = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function shuffle(list, random) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function cornersOf(hex) {
  const cx = 2 * hex.q + hex.r;
  const cy = 3 * hex.r;
  return CORNERS.map(([dx, dy]) => vid(cx + dx, cy + dy));
}

// Derived graph, memoised per hex list identity (the stored list never mutates
// after generation, so a WeakMap keyed on it is safe).
const graphCache = new WeakMap();
export function graphOf(board) {
  const hexes = board.hexes;
  if (graphCache.has(hexes)) return graphCache.get(hexes);
  const vertices = {};
  const edges = {};
  hexes.forEach((hex) => {
    const cs = cornersOf(hex);
    cs.forEach((v, i) => {
      if (!vertices[v]) {
        const [x, y] = v.split(",").map(Number);
        vertices[v] = { id: v, x, y, hexes: [], edges: [], adj: [], port: null };
      }
      vertices[v].hexes.push(hex.id);
      const w = cs[(i + 1) % 6];
      const e = eid(v, w);
      if (!edges[e]) edges[e] = { id: e, a: v < w ? v : w, b: v < w ? w : v, hexes: [] };
      edges[e].hexes.push(hex.id);
    });
  });
  Object.values(edges).forEach((e) => {
    vertices[e.a].edges.push(e.id);
    vertices[e.b].edges.push(e.id);
    vertices[e.a].adj.push(e.b);
    vertices[e.b].adj.push(e.a);
  });
  (board.ports || []).forEach((p) => {
    const e = edges[p.edge];
    if (e) { vertices[e.a].port = p.id; vertices[e.b].port = p.id; }
  });
  const hexById = {};
  hexes.forEach((h) => { hexById[h.id] = h; });
  const graph = { vertices, edges, hexById };
  graphCache.set(hexes, graph);
  return graph;
}

function hexDistance(q, r) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
}

export function layoutFor(sizeOption, seatCount) {
  if (sizeOption === "small" || sizeOption === "large") return sizeOption;
  return seatCount >= 5 ? "large" : "small";
}

// Generate a fresh island. Red numbers (6/8) never touch each other.
export function generateBoard(size, random) {
  const layout = LAYOUTS[size] || LAYOUTS.small;
  const cells = [];
  for (let q = -layout.radius; q <= layout.radius; q += 1) {
    for (let r = -layout.radius; r <= layout.radius; r += 1) {
      if (hexDistance(q, r) <= layout.radius) cells.push({ q, r });
    }
  }
  let hexes = null;
  for (let attempt = 0; attempt < 200 && !hexes; attempt += 1) {
    const terrains = shuffle(Object.entries(layout.terrain).flatMap(([t, n]) => Array(n).fill(t)), random);
    const numbers = shuffle([...layout.numbers], random);
    const candidate = cells.map((c, i) => ({ id: `h${i}`, q: c.q, r: c.r, terrain: terrains[i], number: null }));
    candidate.filter((h) => h.terrain !== "volcano").forEach((h, i) => { h.number = numbers[i]; });
    const hot = candidate.filter((h) => h.number === 6 || h.number === 8);
    const clash = hot.some((a) => hot.some((b) => a !== b && hexDistance(a.q - b.q, a.r - b.r) === 1));
    if (!clash || attempt === 199) hexes = candidate;
  }
  const board = { size, hexes, ports: [] };
  board.ports = placePorts(board, layout.ports, random);
  return board;
}

// Docks sit on evenly spaced coastal edges, walking the coast by angle.
function placePorts(board, count, random) {
  const { edges } = graphOf(board);
  const coast = Object.values(edges).filter((e) => e.hexes.length === 1).map((e) => {
    const [ax, ay] = e.a.split(",").map(Number);
    const [bx, by] = e.b.split(",").map(Number);
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    return { e, mx, my, angle: Math.atan2(my * 0.5, mx * 0.866) };
  }).sort((a, b) => a.angle - b.angle);
  const kinds = shuffle([...RESOURCES, ...Array(count - RESOURCES.length).fill(null)], random);
  const offset = Math.floor(random() * Math.max(1, Math.floor(coast.length / count)));
  const ports = [];
  for (let i = 0; i < count; i += 1) {
    const c = coast[(offset + Math.round((i * coast.length) / count)) % coast.length];
    const len = Math.hypot(c.mx * 0.866, c.my * 0.5) || 1;
    const push = 1.6 / len; // nudge the dock marker just off the shore
    ports.push({
      id: `d${i}`, edge: c.e.id, resource: kinds[i], rate: kinds[i] ? 2 : 3,
      x: Math.round((c.mx * (1 + push)) * 100) / 100, y: Math.round((c.my * (1 + push)) * 100) / 100,
    });
  }
  return ports;
}

// ---------- legality ----------

const ownerAt = (pieces, v) => pieces.lodges[v] || pieces.huts[v] || null;

// Distance rule: the corner and every neighbouring corner must be empty.
export function hutSpotFree(board, pieces, v) {
  const { vertices } = graphOf(board);
  const vert = vertices[v];
  if (!vert || ownerAt(pieces, v)) return false;
  return vert.adj.every((w) => !ownerAt(pieces, w));
}

export function setupHutSpots(board, pieces) {
  return Object.keys(graphOf(board).vertices).filter((v) => hutSpotFree(board, pieces, v));
}

export function hutSpots(board, pieces, mark) {
  const { vertices } = graphOf(board);
  return Object.keys(vertices).filter((v) => hutSpotFree(board, pieces, v)
    && vertices[v].edges.some((e) => pieces.paths[e] === mark));
}

export function lodgeSpots(pieces, mark) {
  return Object.keys(pieces.huts).filter((v) => pieces.huts[v] === mark);
}

// A boardwalk must touch your own building, or your own boardwalk through a
// corner that no rival building blocks.
export function pathSpots(board, pieces, mark) {
  const { edges, vertices } = graphOf(board);
  return Object.keys(edges).filter((e) => {
    if (pieces.paths[e]) return false;
    return [edges[e].a, edges[e].b].some((v) => {
      const owner = ownerAt(pieces, v);
      if (owner === mark) return true;
      if (owner) return false;
      return vertices[v].edges.some((o) => o !== e && pieces.paths[o] === mark);
    });
  });
}

export function setupPathsFor(board, pieces, hutVertex) {
  const { vertices } = graphOf(board);
  const vert = vertices[hutVertex];
  return vert ? vert.edges.filter((e) => !pieces.paths[e]) : [];
}

// ---------- production ----------

// { [mark]: { [res]: n } } claims for a roll, skipping the monkey's hex.
export function productionClaims(board, pieces, total, monkeyHex) {
  const { vertices } = graphOf(board);
  const claims = {};
  board.hexes.forEach((hex) => {
    if (hex.number !== total || hex.id === monkeyHex) return;
    const res = TERRAIN_YIELD[hex.terrain];
    if (!res) return;
    Object.values(vertices).forEach((v) => {
      if (!v.hexes.includes(hex.id)) return;
      const owner = ownerAt(pieces, v.id);
      if (!owner) return;
      const n = pieces.lodges[v.id] ? 2 : 1;
      claims[owner] = claims[owner] || {};
      claims[owner][res] = (claims[owner][res] || 0) + n;
    });
  });
  return claims;
}

export function marksOnHex(board, pieces, hexId) {
  const { vertices } = graphOf(board);
  const marks = new Set();
  Object.values(vertices).forEach((v) => {
    if (v.hexes.includes(hexId)) {
      const owner = ownerAt(pieces, v.id);
      if (owner) marks.add(owner);
    }
  });
  return [...marks];
}

export function portRates(board, pieces, mark) {
  const { vertices } = graphOf(board);
  const rates = Object.fromEntries(RESOURCES.map((r) => [r, 4]));
  const byId = Object.fromEntries((board.ports || []).map((p) => [p.id, p]));
  Object.values(vertices).forEach((v) => {
    if (!v.port || ownerAt(pieces, v.id) !== mark) return;
    const port = byId[v.port];
    if (!port) return;
    if (port.resource) rates[port.resource] = Math.min(rates[port.resource], 2);
    else RESOURCES.forEach((r) => { rates[r] = Math.min(rates[r], 3); });
  });
  return rates;
}

// ---------- longest boardwalk ----------

// Longest simple trail (edges used once) through `mark`'s boardwalks; a rival
// building on a corner breaks the trail there.
export function longestPath(board, pieces, mark) {
  const { edges, vertices } = graphOf(board);
  const mine = Object.keys(pieces.paths).filter((e) => pieces.paths[e] === mark && edges[e]);
  if (!mine.length) return 0;
  let best = 0;
  const used = new Set();
  const walk = (v, length) => {
    if (length > best) best = length;
    const owner = ownerAt(pieces, v);
    if (length > 0 && owner && owner !== mark) return; // broken here
    vertices[v].edges.forEach((e) => {
      if (used.has(e) || pieces.paths[e] !== mark) return;
      used.add(e);
      walk(edges[e].a === v ? edges[e].b : edges[e].a, length + 1);
      used.delete(e);
    });
  };
  const starts = new Set();
  mine.forEach((e) => { starts.add(edges[e].a); starts.add(edges[e].b); });
  starts.forEach((v) => walk(v, 0));
  return best;
}

// ---------- plain projection ----------

export function boardToDict(board) {
  const { vertices, edges } = graphOf(board);
  return {
    size: board.size,
    hexes: board.hexes.map((h) => ({
      id: h.id, q: h.q, r: h.r, x: 2 * h.q + h.r, y: 3 * h.r, terrain: h.terrain, number: h.number, pips: PIPS[h.number] || 0,
    })),
    vertices: Object.values(vertices).map((v) => ({ id: v.id, x: v.x, y: v.y, hexes: [...v.hexes], port: v.port })),
    edges: Object.values(edges).map((e) => ({ id: e.id, a: e.a, b: e.b })),
    ports: (board.ports || []).map((p) => ({ ...p })),
  };
}
