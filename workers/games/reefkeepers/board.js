// Reefkeepers — one player's reef: placement legality, habitat regions and
// scoring. Pure functions over plain data (no game state, no RNG), shared by
// rules.js (authoritative validation) and ai.js (bots, autopilot, hints).
//
// A reef is a list of placed halves `cells: [{ x, y, t, p }]`; the Grotto is
// implicit at (0,0) and joins no habitat region. A placement `{ x, y, rot }`
// puts the tile's A half on (x,y) and its B half on (x,y) + DIR[rot].

export const DIR = Object.freeze([[1, 0], [0, 1], [-1, 0], [0, -1]]);
const NEIGHBORS = DIR;

const key = (x, y) => (x + 64) * 256 + (y + 64);

// Occupied-cell lookup; the Grotto is "grotto".
export function cellMap(cells) {
  const map = new Map();
  map.set(key(0, 0), { t: "grotto", p: 0 });
  for (const c of cells) map.set(key(c.x, c.y), { t: c.t, p: c.p });
  return map;
}

// Bounding box of the reef (Grotto included).
export function reefBox(cells) {
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const c of cells) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }
  return { minX, maxX, minY, maxY };
}

// Is (x,y) next to the Grotto or to a placed cell of habitat `t`?
function touchesMatch(map, x, y, t) {
  for (const [dx, dy] of NEIGHBORS) {
    const n = map.get(key(x + dx, y + dy));
    if (n && (n.t === "grotto" || n.t === t)) return true;
  }
  return false;
}

// Both cells free and the reef still inside size × size?
function spotFits(map, box, size, x, y, rot) {
  const [dx, dy] = DIR[rot];
  const bx = x + dx;
  const by = y + dy;
  if (map.has(key(x, y)) || map.has(key(bx, by))) return false;
  return Math.max(box.maxX, x, bx) - Math.min(box.minX, x, bx) < size
    && Math.max(box.maxY, y, by) - Math.min(box.minY, y, by) < size;
}

function spotTouches(map, tile, x, y, rot) {
  return touchesMatch(map, x, y, tile.a) || touchesMatch(map, x + DIR[rot][0], y + DIR[rot][1], tile.b);
}

// Every free, in-square { x, y, rot } with a half on the frontier (an empty
// cell beside the reef) — tile-independent, so callers rating many tiles
// against one reef compute it once. Sorted (x, y, rot).
export function candidateSpots(cells, size, map = cellMap(cells)) {
  const box = reefBox(cells);
  const frontier = new Map();
  for (const c of [{ x: 0, y: 0 }, ...cells]) {
    for (const [nx, ny] of NEIGHBORS) {
      const k = key(c.x + nx, c.y + ny);
      if (!map.has(k) && !frontier.has(k)) frontier.set(k, [c.x + nx, c.y + ny]);
    }
  }
  const seen = new Set();
  const out = [];
  for (const [fx, fy] of frontier.values()) {
    for (let rot = 0; rot < 4; rot += 1) {
      // A half on the frontier, then B half on the frontier.
      for (const [x, y] of [[fx, fy], [fx - DIR[rot][0], fy - DIR[rot][1]]]) {
        const code = key(x, y) * 4 + rot;
        if (seen.has(code)) continue;
        seen.add(code);
        if (spotFits(map, box, size, x, y, rot)) out.push({ x, y, rot });
      }
    }
  }
  return out.sort((a, b) => a.x - b.x || a.y - b.y || a.rot - b.rot);
}

// Every legal { x, y, rot } for `tile` on this reef: both cells free, the
// bounding box (Grotto included) within size × size, and a half touching the
// Grotto or a cell of its own habitat.
export function legalSpots(cells, tile, size, map = cellMap(cells), candidates = null) {
  if (!tile) return [];
  return (candidates || candidateSpots(cells, size, map)).filter((s) => spotTouches(map, tile, s.x, s.y, s.rot));
}

export function isLegalSpot(cells, tile, size, place) {
  if (!tile || !place) return false;
  const { x, y, rot } = place;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(rot) || rot < 0 || rot > 3) return false;
  const map = cellMap(cells);
  return spotFits(map, reefBox(cells), size, x, y, rot) && spotTouches(map, tile, x, y, rot);
}

// The two halves a placement adds.
export function halvesFor(tile, place) {
  const [dx, dy] = DIR[place.rot];
  return [
    { x: place.x, y: place.y, t: tile.a, p: tile.ap },
    { x: place.x + dx, y: place.y + dy, t: tile.b, p: tile.bp },
  ];
}

// Region index: label per cell plus { t, size, pearls } per region. The AI
// uses it to price a placement in O(1) (placementDelta) without re-flooding.
export function regionIndex(cells, map = cellMap(cells)) {
  const label = new Map();
  const regs = [];
  for (const c of cells) {
    const k0 = key(c.x, c.y);
    if (label.has(k0)) continue;
    const id = regs.length;
    const reg = { t: c.t, size: 0, pearls: 0 };
    regs.push(reg);
    const stack = [c];
    label.set(k0, id);
    while (stack.length) {
      const cur = stack.pop();
      reg.size += 1;
      reg.pearls += cur.p;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const nk = key(nx, ny);
        if (label.has(nk)) continue;
        const n = map.get(nk);
        if (n && n.t === c.t) {
          label.set(nk, id);
          stack.push({ x: nx, y: ny, t: n.t, p: n.p });
        }
      }
    }
  }
  return { map, label, regs };
}

function adjacentLabels(index, x, y, t, into) {
  for (const [dx, dy] of NEIGHBORS) {
    const nk = key(x + dx, y + dy);
    const n = index.map.get(nk);
    if (n && n.t === t) into.add(index.label.get(nk));
  }
}

// Exact region-score change if `tile` goes at `place` (assumed legal).
// Returns { delta, merged: [{ t, size, pearls }] } — the regions the halves
// end up in.
export function placementDelta(index, tile, place) {
  const [ha, hb] = halvesFor(tile, place);
  const groups = [];
  if (ha.t === hb.t) {
    const labels = new Set();
    adjacentLabels(index, ha.x, ha.y, ha.t, labels);
    adjacentLabels(index, hb.x, hb.y, hb.t, labels);
    groups.push({ t: ha.t, labels, size: 2, pearls: ha.p + hb.p });
  } else {
    for (const h of [ha, hb]) {
      const labels = new Set();
      adjacentLabels(index, h.x, h.y, h.t, labels);
      groups.push({ t: h.t, labels, size: 1, pearls: h.p });
    }
  }
  let delta = 0;
  const merged = groups.map((g) => {
    let size = g.size;
    let pearls = g.pearls;
    let before = 0;
    for (const l of g.labels) {
      const r = index.regs[l];
      size += r.size;
      pearls += r.pearls;
      before += r.size * r.pearls;
    }
    delta += size * pearls - before;
    return { t: g.t, size, pearls };
  });
  return { delta, merged };
}

// Full score for one reef. regions are sorted points desc, then size desc.
export function scoreReef(cells, size, options = {}) {
  const { regs } = regionIndex(cells);
  const regions = regs
    .map((r) => ({ t: r.t, size: r.size, pearls: r.pearls, points: r.size * r.pearls }))
    .sort((a, b) => b.points - a.points || b.size - a.size);
  const box = reefBox(cells);
  const half = (size - 1) / 2;
  const centred = box.minX === -half && box.maxX === half && box.minY === -half && box.maxY === half;
  const heart = options.heart_bonus && centred ? 10 : 0;
  const full = options.full_bonus && cells.length + 1 === size * size ? 5 : 0;
  const base = regions.reduce((s, r) => s + r.points, 0);
  return {
    total: base + heart + full,
    regions,
    heart,
    full,
    largest: regions.reduce((m, r) => Math.max(m, r.size), 0),
    pearls: cells.reduce((s, c) => s + c.p, 0),
  };
}
