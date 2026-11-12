// Realmwright — tile geometry + tilesets. Pure data and helpers: no DOM, no
// state. The client renders straight from the TileDefs exported here (sent as
// `tile_defs` in the projection), so a new tileset renders with zero client
// changes — art keys off feature KINDS, never tile ids.
//
// Ports (see PLAN.md): 12 per tile, clockwise from the north-west third.
//   N 0 1 2 (west→east) · E 3 4 5 (north→south) · S 6 7 8 (east→west) ·
//   W 9 10 11 (south→north). Middle ports (1 4 7 10) carry roads; a city side
//   owns all three ports of that side; fields own the rest.
// Rotation r (clockwise quarter turns): port p → (p + 3r) % 12, anchor
//   (u, v) → (1 − v, u) per turn. Neighbour N is (x, y − 1) (y grows down);
//   port 3s + k meets the neighbour's port 3((s + 2) % 4) + (2 − k).
//
// Tiles are AUTHORED as a compact spec (which sides are city / road, which
// city sides connect, how dead-end roads end) and EXPANDED into features at
// load: cities first, then roads, then the cloister, then fields. Fields are
// derived — perimeter field arcs merged when no interior "wall" (a city or
// road crossing the tile, a road junction, a road ending at a city wall)
// separates them — so every port lands in exactly one feature by
// construction (validateTileset checks it anyway).
//
// Meeple anchors (unit coords, unrotated) assume the art convention the
// client follows: a lone city side is a cap ~0.3 deep; connected cities fill
// between their sides; roads run from a middle port toward the centre (curves
// as a quarter arc around the corner they bend about).
//
// Expansion seam: add an entry to TILESETS with namespaced ids ("river:...").

export const SIDES = ["N", "E", "S", "W"];
// Neighbour delta per side index (N, E, S, W).
export const SIDE_DELTAS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function rotatePort(port, r) {
  return (((port + 3 * r) % 12) + 12) % 12;
}

// The port on the neighbouring tile that touches `port` across its side.
export function oppositePort(port) {
  const s = Math.floor(port / 3);
  const k = port % 3;
  return 3 * ((s + 2) % 4) + (2 - k);
}

export function portSide(port) {
  return Math.floor(port / 3);
}

export function rotateAnchor(anchor, r) {
  let [u, v] = anchor;
  for (let i = 0; i < (((r % 4) + 4) % 4); i += 1) [u, v] = [1 - v, u];
  return [round3(u), round3(v)];
}

function round3(n) { return Math.round(n * 1000) / 1000; }

// ---------- spec → TileDef expansion ----------

const SIDE_MID = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
const INWARD = [[0, 1], [-1, 0], [0, -1], [1, 0]];

// Point on the edge for a port, then pushed `depth` inward.
function portPoint(port, depth) {
  const s = portSide(port);
  const k = port % 3;
  const t = (k + 0.5) / 3;
  const along = [[t, 0], [1, t], [1 - t, 1], [0, 1 - t]][s];
  return [along[0] + INWARD[s][0] * depth, along[1] + INWARD[s][1] * depth];
}

function sidePorts(s) { return [3 * s, 3 * s + 1, 3 * s + 2]; }

// Rough geometric footprint of a city (used to keep field anchors out of it).
function inCity(sides, [u, v]) {
  const depth = [v, 1 - u, 1 - v, u]; // distance from each side
  if (sides.length === 1) { // a cap: deepest mid-side, thinning to the corners
    const along = sides[0] % 2 === 0 ? u : v;
    return depth[sides[0]] < 0.32 * (1 - (2 * Math.abs(along - 0.5)) ** 2);
  }
  if (sides.length === 4) return true;
  if (sides.length === 3) {
    const missing = [0, 1, 2, 3].find((s) => !sides.includes(s));
    return depth[missing] > 0.3;
  }
  const [a, b] = sides;
  if ((a + 2) % 4 === b) { // band across the tile
    const others = [0, 1, 2, 3].filter((s) => !sides.includes(s));
    return others.every((s) => depth[s] > 0.27);
  }
  return depth[a] + depth[b] < 1.0; // corner city: the diagonal half
}

function cityAnchor(sides) {
  if (sides.length === 4) return [0.5, 0.5];
  if (sides.length === 3) {
    const missing = [0, 1, 2, 3].find((s) => !sides.includes(s));
    const [dx, dy] = INWARD[missing];
    return [0.5 + dx * 0.15, 0.5 + dy * 0.15];
  }
  const pts = sides.map((s) => [SIDE_MID[s][0] + INWARD[s][0] * 0.16, SIDE_MID[s][1] + INWARD[s][1] * 0.16]);
  if (sides.length === 2 && (sides[0] + 2) % 4 !== sides[1]) {
    const avg = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
    return [avg[0] - (0.5 - avg[0]) * 0.2, avg[1] - (0.5 - avg[1]) * 0.2]; // nudged into the corner
  }
  return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
}

// Road polyline (sampled) for clearance checks + its anchor.
function roadPath(sides, end) {
  if (sides.length === 2) {
    const [a, b] = sides;
    const pa = SIDE_MID[a];
    const pb = SIDE_MID[b];
    if ((a + 2) % 4 === b) {
      const pts = [];
      for (let i = 0; i <= 10; i += 1) pts.push([pa[0] + (pb[0] - pa[0]) * i / 10, pa[1] + (pb[1] - pa[1]) * i / 10]);
      return { pts, anchor: [0.5, 0.5] };
    }
    const corner = [pa[0] === 0.5 ? pb[0] : pa[0], pa[1] === 0.5 ? pb[1] : pa[1]];
    const a0 = Math.atan2(pa[1] - corner[1], pa[0] - corner[0]);
    let a1 = Math.atan2(pb[1] - corner[1], pb[0] - corner[0]);
    if (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
    if (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
    const pts = [];
    for (let i = 0; i <= 10; i += 1) {
      const ang = a0 + (a1 - a0) * i / 10;
      pts.push([corner[0] + Math.cos(ang) * 0.5, corner[1] + Math.sin(ang) * 0.5]);
    }
    return { pts, anchor: pts[5].map(round3) };
  }
  const s = sides[0];
  const stop = end === "junction" ? 0.5 : end === "city" ? 0.3 : 0.32; // depth where it ends
  const pts = [];
  for (let i = 0; i <= 10; i += 1) {
    const d = stop * i / 10;
    pts.push([SIDE_MID[s][0] + INWARD[s][0] * d, SIDE_MID[s][1] + INWARD[s][1] * d]);
  }
  const ad = end === "junction" ? 0.26 : 0.15;
  return { pts, anchor: [SIDE_MID[s][0] + INWARD[s][0] * ad, SIDE_MID[s][1] + INWARD[s][1] * ad].map(round3) };
}

function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

// Gap index of every port relative to one wall (a set of contact ports):
// ports between consecutive contact runs share a gap id.
function gapIds(wall) {
  const ids = new Array(12).fill(-1);
  const start = [...wall][0];
  let gap = 0;
  let prevWall = true;
  for (let i = 1; i <= 12; i += 1) {
    const p = (start + i) % 12;
    if (wall.has(p)) { prevWall = true; continue; }
    if (prevWall) gap += 1;
    prevWall = false;
    ids[p] = gap;
  }
  return ids;
}

// spec: { id, count, start?, cities: [{ sides, pennant? }], roads: [sides],
//         ends?: "junction" | "city" | "cloister", cloister? }
export function expandTile(spec) {
  const features = [];
  const owner = new Array(12).fill(-1);
  const take = (fi, ports) => ports.forEach((p) => { owner[p] = fi; });
  (spec.cities || []).forEach((c) => {
    const ports = c.sides.flatMap(sidePorts);
    const f = { kind: "city", ports, anchor: cityAnchor(c.sides).map(round3) };
    if (c.pennant) f.pennant = true;
    take(features.length, ports);
    features.push(f);
  });
  const paths = [];
  (spec.roads || []).forEach((sides) => {
    const ports = sides.map((s) => 3 * s + 1);
    const path = roadPath(sides, spec.ends);
    paths.push(path.pts);
    take(features.length, ports);
    features.push({ kind: "road", ports, anchor: path.anchor });
  });
  if (spec.cloister) features.push({ kind: "cloister", ports: [], anchor: [0.5, 0.5] });

  // Walls that split fields: each city / two-sided road on its own; dead-end
  // roads merge into one junction wall, or into the city wall they end at.
  const walls = [];
  features.forEach((f) => {
    if (f.kind === "city") walls.push(new Set(f.ports));
    if (f.kind === "road" && f.ports.length === 2) walls.push(new Set(f.ports));
  });
  const stubs = features.filter((f) => f.kind === "road" && f.ports.length === 1).flatMap((f) => f.ports);
  if (spec.ends === "junction" && stubs.length) walls.push(new Set(stubs));
  if (spec.ends === "city" && stubs.length) {
    const cityWall = walls.find((w) => features.some((f) => f.kind === "city" && f.ports.every((p) => w.has(p))));
    if (cityWall) stubs.forEach((p) => cityWall.add(p));
  }
  const wallGaps = walls.map(gapIds);
  const groups = new Map();
  for (let p = 0; p < 12; p += 1) {
    if (owner[p] >= 0) continue;
    const key = wallGaps.map((g) => g[p]).join(",");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const cityFeatures = features.map((f, i) => (f.kind === "city" ? i : -1)).filter((i) => i >= 0);
  for (const ports of groups.values()) {
    const fi = features.length;
    take(fi, ports);
    const cities = cityFeatures.filter((ci) => ports.some((p) => features[ci].ports.includes((p + 1) % 12) || features[ci].ports.includes((p + 11) % 12)));
    features.push({ kind: "field", ports, cities, anchor: fieldAnchor(ports, features, spec, paths) });
  }
  const def = { id: spec.id, count: spec.count, features };
  if (spec.start) def.start = true;
  return def;
}

// Pick the field point with the most clearance from roads, cities and the
// other anchors, sampled inward from each of the field's own ports.
function fieldAnchor(ports, features, spec, paths) {
  const cities = (spec.cities || []).map((c) => c.sides);
  const others = features.map((f) => f.anchor);
  const roadPts = paths.flat();
  let best = null;
  for (const p of ports) {
    for (const depth of [0.08, 0.14, 0.2, 0.28, 0.36]) {
      const pt = portPoint(p, depth);
      if (cities.some((sides) => inCity(sides, pt))) continue;
      // The inward stroke must not cross a road.
      let crosses = false;
      for (let d = 0.02; d <= depth && !crosses; d += 0.02) {
        const q = portPoint(p, d);
        if (roadPts.some((r) => dist(r, q) < 0.045)) crosses = true;
      }
      if (crosses) continue;
      const clear = Math.min(
        ...roadPts.map((r) => dist(r, pt) * 1.2),
        ...others.map((a) => dist(a, pt)),
        Math.min(pt[0], pt[1], 1 - pt[0], 1 - pt[1]) * 2.2,
      );
      if (!best || clear > best.clear + 1e-9) best = { clear, pt };
    }
  }
  const pt = best ? best.pt : portPoint(ports[Math.floor(ports.length / 2)], 0.1);
  return pt.map(round3);
}

// ---------- the base set: the familiar 72-tile mix (24 types) ----------
// Sides: 0 N, 1 E, 2 S, 3 W.

const BASE_SPECS = [
  { id: "base:cloister-road", count: 2, cloister: true, roads: [[2]], ends: "cloister" },
  { id: "base:cloister", count: 4, cloister: true },
  { id: "base:city4-pennant", count: 1, cities: [{ sides: [0, 1, 2, 3], pennant: true }] },
  { id: "base:city1-road-straight", count: 4, start: true, cities: [{ sides: [0] }], roads: [[3, 1]] },
  { id: "base:city1", count: 5, cities: [{ sides: [0] }] },
  { id: "base:city2-band-pennant", count: 2, cities: [{ sides: [3, 1], pennant: true }] },
  { id: "base:city2-band", count: 1, cities: [{ sides: [3, 1] }] },
  { id: "base:city2-caps-opposite", count: 3, cities: [{ sides: [3] }, { sides: [1] }] },
  { id: "base:city2-caps-adjacent", count: 2, cities: [{ sides: [1] }, { sides: [2] }] },
  { id: "base:city1-road-curve-right", count: 3, cities: [{ sides: [0] }], roads: [[1, 2]] },
  { id: "base:city1-road-curve-left", count: 3, cities: [{ sides: [0] }], roads: [[2, 3]] },
  { id: "base:city1-road-junction", count: 3, cities: [{ sides: [0] }], roads: [[1], [2], [3]], ends: "junction" },
  { id: "base:city2-corner-pennant", count: 2, cities: [{ sides: [0, 3], pennant: true }] },
  { id: "base:city2-corner", count: 3, cities: [{ sides: [0, 3] }] },
  { id: "base:city2-corner-road-pennant", count: 2, cities: [{ sides: [0, 3], pennant: true }], roads: [[1, 2]] },
  { id: "base:city2-corner-road", count: 3, cities: [{ sides: [0, 3] }], roads: [[1, 2]] },
  { id: "base:city3-pennant", count: 1, cities: [{ sides: [0, 1, 3], pennant: true }] },
  { id: "base:city3", count: 3, cities: [{ sides: [0, 1, 3] }] },
  { id: "base:city3-road-pennant", count: 2, cities: [{ sides: [0, 1, 3], pennant: true }], roads: [[2]], ends: "city" },
  { id: "base:city3-road", count: 1, cities: [{ sides: [0, 1, 3] }], roads: [[2]], ends: "city" },
  { id: "base:road-straight", count: 8, roads: [[0, 2]] },
  { id: "base:road-curve", count: 9, roads: [[2, 3]] },
  { id: "base:road-junction3", count: 4, roads: [[1], [2], [3]], ends: "junction" },
  { id: "base:road-junction4", count: 1, roads: [[0], [1], [2], [3]], ends: "junction" },
];

export const TILESETS = {
  base: { id: "base", size: 72, tiles: BASE_SPECS.map(expandTile) },
};

// Every TileDef from the named tilesets, keyed by id.
export function tileDefsFor(tilesetIds) {
  const defs = {};
  for (const id of tilesetIds) {
    const set = TILESETS[id];
    if (!set) continue;
    set.tiles.forEach((t) => { defs[t.id] = t; });
  }
  return defs;
}

// Port → kind for an unrotated def (cached on the def object).
export function portKinds(def) {
  if (!def._kinds) {
    const kinds = new Array(12).fill(null);
    const feat = new Array(12).fill(-1);
    def.features.forEach((f, fi) => f.ports.forEach((p) => { kinds[p] = f.kind; feat[p] = fi; }));
    Object.defineProperty(def, "_kinds", { value: kinds, enumerable: false });
    Object.defineProperty(def, "_feat", { value: feat, enumerable: false });
  }
  return def._kinds;
}

export function portFeatures(def) {
  portKinds(def);
  return def._feat;
}

// Tileset validator (tests + a load-time sanity net for new expansions).
export function validateTileset(set) {
  const problems = [];
  const ids = new Set();
  let total = 0;
  let starts = 0;
  for (const t of set.tiles) {
    if (ids.has(t.id)) problems.push(`${t.id}: duplicate id`);
    ids.add(t.id);
    if (!/^[a-z0-9]+:[a-z0-9-]+$/.test(t.id)) problems.push(`${t.id}: id must be namespaced`);
    if (!Number.isInteger(t.count) || t.count < 1) problems.push(`${t.id}: bad count`);
    total += t.count;
    if (t.start) starts += 1;
    const seen = new Array(12).fill(0);
    t.features.forEach((f, fi) => {
      f.ports.forEach((p) => { seen[p] += 1; });
      if (!Array.isArray(f.anchor) || f.anchor.length !== 2 || f.anchor.some((n) => !(n >= 0 && n <= 1))) problems.push(`${t.id}#${fi}: bad anchor`);
      if (f.kind === "cloister" && f.ports.length) problems.push(`${t.id}#${fi}: cloister owns ports`);
      if (f.kind === "road" && f.ports.some((p) => p % 3 !== 1)) problems.push(`${t.id}#${fi}: road off a middle port`);
      if (f.kind === "field") {
        if (!Array.isArray(f.cities)) problems.push(`${t.id}#${fi}: field without cities list`);
        else f.cities.forEach((ci) => { if (!t.features[ci] || t.features[ci].kind !== "city") problems.push(`${t.id}#${fi}: field cities[] -> non-city ${ci}`); });
      }
      if (f.pennant && f.kind !== "city") problems.push(`${t.id}#${fi}: pennant off a city`);
    });
    seen.forEach((n, p) => { if (n !== 1) problems.push(`${t.id}: port ${p} covered ${n}×`); });
  }
  if (set.size !== undefined && total !== set.size) problems.push(`tile counts sum to ${total}, expected ${set.size}`);
  if (set.id === "base" && starts !== 1) problems.push(`base set needs exactly one start tile (has ${starts})`);
  return problems;
}
