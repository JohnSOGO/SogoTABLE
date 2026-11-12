// Realmwright — procedural tile + meeple art (pure SVG string builders).
//
// Everything is drawn from the TileDef alone (feature kinds + ports + anchor +
// pennant), so ANY tile — including future expansion tiles — renders with no
// per-tile code. The def is rotated first and the art is drawn upright, so
// rooftops and the abbey always stand the right way up and grass texture lines
// up across neighbouring tiles. Texture jitter is seeded from the type id, so a
// tile never flickers between renders. No DOM access; no rule logic.
//
// Geometry (100×100 units per tile): ports are edge thirds, clockwise from the
// north-west third (N 0-2 west→east, E 3-5, S 6-8 east→west, W 9-11). Roads
// meet edges exactly at the middle ports and leave perpendicular, city walls
// end exactly on tile corners, and the field base colour is uniform — so
// adjacent tiles join seamlessly.
import { ASSETS, paletteFor } from "./assets.js";

const CORNERS = [[0, 0], [100, 0], [100, 100], [0, 100]];
const INWARD = [[0, 1], [-1, 0], [0, -1], [1, 0]];
const SIDE_MID = [[50, 0], [100, 50], [50, 100], [0, 50]];
const GRID = 20; // classification grid (5-unit cells)
const CELL = 100 / GRID;
const ROAD_HALF = 7.5;

// ---------- small math helpers ----------
function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seededRandom(seedText) {
  let a = hashString(seedText) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const fmt = (n) => (Math.round(n * 100) / 100).toString();
const pt = (p) => `${fmt(p[0])} ${fmt(p[1])}`;
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
function quadAt(a, c, b, t) {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}
function sampleQuad(a, c, b, n) {
  const out = [];
  for (let i = 0; i <= n; i += 1) out.push(quadAt(a, c, b, i / n));
  return out;
}
function insidePoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToSegment(p, a, b) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function distToPolyline(p, line) {
  let best = Infinity;
  for (let i = 1; i < line.length; i += 1) best = Math.min(best, distToSegment(p, line[i - 1], line[i]));
  return best;
}
function safeId(text) { return String(text).replace(/[^a-zA-Z0-9_-]/g, "_"); }
function esc(text) { return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// ---------- rotation (contract: p → (p+3r)%12, (u,v) → (1−v,u) per turn) ----------
export function rotatePort(port, r) { return (port + 3 * (((r % 4) + 4) % 4)) % 12; }
export function rotateAnchor(anchor, r) {
  let [u, v] = anchor;
  for (let i = 0; i < (((r % 4) + 4) % 4); i += 1) [u, v] = [1 - v, u];
  return [u, v];
}
function portPoint(port) {
  const s = Math.floor(port / 3); const k = port % 3;
  return lerp(CORNERS[s], CORNERS[(s + 1) % 4], (k + 0.5) / 3);
}

// ---------- geometry (cached per type + rotation) ----------
const geometryCache = new Map();

export function tileGeometry(def, r = 0) {
  const key = `${def.id}|${r}|${JSON.stringify(def.features)}`;
  if (geometryCache.has(key)) return geometryCache.get(key);
  const geo = buildGeometry(def, r);
  geometryCache.set(key, geo);
  return geo;
}

function buildGeometry(def, r) {
  const features = (def.features || []).map((f, idx) => ({
    idx, kind: f.kind, pennant: Boolean(f.pennant),
    ports: (f.ports || []).map((p) => rotatePort(p, r)),
    anchor: Array.isArray(f.anchor) ? rotateAnchor(f.anchor, r) : null,
  }));
  const cityCount = features.filter((f) => f.kind === "city").length;
  const cities = features.filter((f) => f.kind === "city").map((f) => ({ f, ...cityShape(f, cityCount) }));
  const cloisters = features.filter((f) => f.kind === "cloister").map((f) => {
    const a = f.anchor || [0.5, 0.5];
    const c = [a[0] * 100, a[1] * 100];
    return { f, c, box: [c[0] - 23, c[1] - 23, 46, 46] };
  });
  const roads = buildRoads(features, cities, cloisters);
  const cells = classify(features, cities, roads, cloisters);
  // Anchor fallback: centroid of the feature's cells (for defs without anchors).
  features.forEach((f) => {
    if (f.anchor) return;
    let sx = 0; let sy = 0; let n = 0;
    cells.owner.forEach((o, i) => { if (o === f.idx) { sx += (i % GRID) + 0.5; sy += Math.floor(i / GRID) + 0.5; n += 1; } });
    f.anchor = n ? [sx / n / GRID, sy / n / GRID] : [0.5, 0.5];
  });
  return { features, cities, roads, cloisters, cells };
}

function citySides(f) {
  const sides = [];
  for (let s = 0; s < 4; s += 1) {
    const owned = [0, 1, 2].filter((k) => f.ports.includes(3 * s + k)).length;
    if (owned >= 2 || f.ports.includes(3 * s + 1)) sides.push(s);
  }
  return sides;
}

function cityShape(f, cityCount) {
  const owned = new Set(citySides(f));
  if (owned.size === 0) return { d: "", poly: [], walls: [] };
  if (owned.size === 4) {
    return { d: "M0 0 H100 V100 H0 Z", poly: CORNERS.map((c) => [...c]), walls: [] };
  }
  let start = 0;
  for (let s = 0; s < 4; s += 1) if (owned.has(s) && !owned.has((s + 3) % 4)) { start = s; break; }
  let d = `M${pt(CORNERS[start])}`;
  const poly = [[...CORNERS[start]]];
  const walls = [];
  let i = 0;
  while (i < 4) {
    const s = (start + i) % 4;
    if (owned.has(s)) {
      const c = CORNERS[(s + 1) % 4];
      d += ` L${pt(c)}`; poly.push([...c]);
      i += 1;
      continue;
    }
    let k = 0;
    while (k < 4 - i && !owned.has((s + k) % 4)) k += 1;
    const a = CORNERS[s];
    const b = CORNERS[(s + k) % 4];
    let ctrl;
    if (k === 1) {
      const depth = owned.size === 3 ? 60 : 56;
      ctrl = [SIDE_MID[s][0] + INWARD[s][0] * depth, SIDE_MID[s][1] + INWARD[s][1] * depth];
    } else if (k === 2) {
      const ownedCorner = CORNERS[(s + 3) % 4];
      ctrl = lerp([50, 50], ownedCorner, 0.22);
    } else {
      const side = (s + 3) % 4; // the single owned side
      const depth = cityCount > 1 ? 52 : 62;
      ctrl = [SIDE_MID[side][0] + INWARD[side][0] * depth, SIDE_MID[side][1] + INWARD[side][1] * depth];
    }
    d += ` Q${pt(ctrl)} ${pt(b)}`;
    sampleQuad(a, ctrl, b, 18).slice(1).forEach((p) => poly.push(p));
    walls.push({ a, c: ctrl, b });
    i += k;
  }
  return { d: `${d} Z`, poly, walls };
}

function buildRoads(features, cities, cloisters) {
  const roadFeatures = features.filter((f) => f.kind === "road");
  const center = [50, 50];
  const singles = roadFeatures.filter((f) => f.ports.length === 1);
  const roads = [];
  let needHamlet = singles.length >= 2 || roadFeatures.some((f) => f.ports.length >= 3);
  roadFeatures.forEach((f) => {
    const pts = f.ports.map(portPoint);
    const paths = [];
    if (pts.length === 2) {
      const [a, b] = pts;
      const opposite = Math.abs(a[0] - b[0]) === 100 || Math.abs(a[1] - b[1]) === 100;
      if (opposite) paths.push({ d: `M${pt(a)} L${pt(b)}`, line: [a, b] });
      else paths.push({ d: `M${pt(a)} Q50 50 ${pt(b)}`, line: sampleQuad(a, center, b, 16) });
    } else {
      pts.forEach((a) => paths.push({ d: `M${pt(a)} L50 50`, line: [a, center], spoke: true }));
    }
    let gate = null;
    if (pts.length === 1 && !needHamlet) {
      if (cloisters.length) {
        // Ends at the abbey door.
      } else {
        const line = paths[0].line;
        for (let t = 0; t <= 1.0001 && !gate; t += 0.02) {
          const p = lerp(line[0], line[1], t);
          if (cities.some((c) => c.poly.length && insidePoly(p, c.poly))) gate = p;
        }
        if (!gate) needHamlet = true;
      }
    }
    roads.push({ f, paths, gate });
  });
  return { list: roads, hamlet: needHamlet && roadFeatures.length ? center : null };
}

function classify(features, cities, roads, cloisters) {
  const owner = new Array(GRID * GRID).fill(-1); // feature idx, or -2 = blocked non-field
  const lines = roads.list.flatMap((rd) => rd.paths.map((p) => ({ idx: rd.f.idx, line: p.line })));
  for (let gy = 0; gy < GRID; gy += 1) {
    for (let gx = 0; gx < GRID; gx += 1) {
      const p = [(gx + 0.5) * CELL, (gy + 0.5) * CELL];
      const i = gy * GRID + gx;
      const city = cities.find((c) => c.poly.length && insidePoly(p, c.poly));
      if (city) { owner[i] = city.f.idx; continue; }
      const road = lines.find((l) => distToPolyline(p, l.line) < ROAD_HALF);
      if (road) { owner[i] = road.idx; continue; }
      if (roads.hamlet && Math.hypot(p[0] - 50, p[1] - 50) < 11) { owner[i] = -2; continue; }
      const cl = cloisters.find((c) => p[0] > c.box[0] && p[0] < c.box[0] + c.box[2] && p[1] > c.box[1] && p[1] < c.box[1] + c.box[3]);
      if (cl) { owner[i] = cl.f.idx; continue; }
    }
  }
  // Flood the remaining (field) cells into components, then map each
  // component to the field feature whose ports touch it.
  const comp = new Array(GRID * GRID).fill(-1);
  let compCount = 0;
  for (let i = 0; i < owner.length; i += 1) {
    if (owner[i] !== -1 || comp[i] !== -1) continue;
    const stack = [i]; comp[i] = compCount;
    while (stack.length) {
      const j = stack.pop(); const x = j % GRID; const y = Math.floor(j / GRID);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) return;
        const n = ny * GRID + nx;
        if (owner[n] === -1 && comp[n] === -1) { comp[n] = compCount; stack.push(n); }
      });
    }
    compCount += 1;
  }
  const compField = new Array(compCount).fill(null);
  const fields = features.filter((f) => f.kind === "field");
  fields.forEach((f) => {
    f.ports.forEach((port) => {
      const s = Math.floor(port / 3);
      const e = portPoint(port);
      const p = [e[0] + INWARD[s][0] * 2.5, e[1] + INWARD[s][1] * 2.5];
      const gx = Math.min(GRID - 1, Math.floor(p[0] / CELL)); const gy = Math.min(GRID - 1, Math.floor(p[1] / CELL));
      const c = comp[gy * GRID + gx];
      if (c >= 0 && compField[c] === null) compField[c] = f.idx;
    });
  });
  const fallback = fields.length ? fields.reduce((a, b) => (b.ports.length > a.ports.length ? b : a)).idx : -2;
  for (let i = 0; i < owner.length; i += 1) {
    if (owner[i] === -1) owner[i] = comp[i] >= 0 && compField[comp[i]] !== null ? compField[comp[i]] : fallback;
  }
  return { owner, fieldKinds: new Set(fields.map((f) => f.idx)) };
}

// ---------- drawing ----------
function fieldLayer(geo, P, rand) {
  let out = `<rect width="100" height="100" fill="${P.field}"/>`;
  const { owner, fieldKinds } = geo.cells;
  const isField = (gx, gy) => gx < 0 || gy < 0 || gx >= GRID || gy >= GRID || fieldKinds.has(owner[gy * GRID + gx]);
  // Soft lighter meadows, kept off the edges so seams stay uniform.
  for (let n = 0; n < 3; n += 1) {
    const gx = 4 + Math.floor(rand() * 12); const gy = 4 + Math.floor(rand() * 12);
    if (!isField(gx, gy)) continue;
    out += `<ellipse cx="${fmt(gx * CELL)}" cy="${fmt(gy * CELL)}" rx="${fmt(9 + rand() * 6)}" ry="${fmt(6 + rand() * 4)}" fill="${P.fieldLight}" opacity=".55"/>`;
  }
  // Grass tufts + the odd flower on interior field cells.
  for (let n = 0; n < 34; n += 1) {
    const gx = Math.floor(rand() * GRID); const gy = Math.floor(rand() * GRID);
    if (![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => isField(gx + dx, gy + dy))) continue;
    const x = gx * CELL + 1 + rand() * 3; const y = gy * CELL + 2 + rand() * 3;
    if (x < 3 || x > 97 || y < 4 || y > 98) continue;
    if (rand() < 0.14) {
      out += `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="1.1" fill="${rand() < 0.5 ? P.flowerA : P.flowerB}"/>`;
    } else {
      out += `<path d="M${fmt(x - 2)} ${fmt(y)} l1 -2.6 l1 2.6 l1 -3.2 l1 3.2" fill="none" stroke="${rand() < 0.5 ? P.grass : P.fieldShade}" stroke-width=".7" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  }
  return out;
}

function roadLayer(geo, P) {
  const ds = geo.roads.list.flatMap((rd) => rd.paths.map((p) => p.d));
  if (!ds.length) return "";
  const stroke = (w, color, extra = "") => ds.map((d) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" ${extra}/>`).join("");
  let out = stroke(15, P.roadEdge);
  out += stroke(11.6, P.road);
  out += stroke(8.6, P.cobble, 'stroke-dasharray="1.4 2.6" opacity=".9"');
  out += stroke(6, P.road);
  out += stroke(1.2, P.cobble, 'stroke-dasharray="2.2 3.4" stroke-linecap="round" opacity=".8"');
  if (geo.roads.hamlet) out += hamlet(P);
  return out;
}

function hamlet(P) {
  return `<circle cx="50" cy="50" r="11.5" fill="${P.road}" stroke="${P.roadEdge}" stroke-width="1.6"/>
    <ellipse cx="50.5" cy="57" rx="8" ry="2" fill="#000" opacity=".16"/>
    <rect x="44" y="48" width="12" height="8.5" rx=".8" fill="${P.house}" stroke="${P.ink}" stroke-width=".8"/>
    <path d="M42 49 L50 41.5 L58 49 Z" fill="#d6a24a" stroke="${P.ink}" stroke-width=".8" stroke-linejoin="round"/>
    <rect x="53" y="42" width="2.4" height="4.5" fill="${P.wallDark}"/>
    <rect x="48.4" y="51.5" width="3.2" height="5" rx="1.4" fill="${P.ink}"/>`;
}

function house(x, y, rand, P) {
  const roof = [P.roofA, P.roofB, P.roofC][Math.floor(rand() * 3)];
  const w = 7.5 + rand() * 3; const h = 5.5 + rand() * 1.5;
  if (rand() < 0.18) {
    return `<ellipse cx="${fmt(x)}" cy="${fmt(y + 4.4)}" rx="4" ry="1.3" fill="#000" opacity=".16"/>
      <rect x="${fmt(x - 2.6)}" y="${fmt(y - 5)}" width="5.2" height="9.4" fill="${P.house}" stroke="${P.ink}" stroke-width=".6"/>
      <path d="M${fmt(x - 3.6)} ${fmt(y - 4.6)} L${fmt(x)} ${fmt(y - 11)} L${fmt(x + 3.6)} ${fmt(y - 4.6)} Z" fill="${roof}" stroke="${P.ink}" stroke-width=".6" stroke-linejoin="round"/>
      <rect x="${fmt(x - 0.8)}" y="${fmt(y - 2.2)}" width="1.6" height="2.2" fill="${P.ink}" opacity=".7"/>`;
  }
  return `<ellipse cx="${fmt(x + 0.6)}" cy="${fmt(y + h - 1)}" rx="${fmt(w / 2 + 0.8)}" ry="1.3" fill="#000" opacity=".16"/>
    <rect x="${fmt(x - w / 2)}" y="${fmt(y - 1.4)}" width="${fmt(w)}" height="${fmt(h)}" fill="${P.house}" stroke="${P.ink}" stroke-width=".6"/>
    <path d="M${fmt(x - w / 2 - 1)} ${fmt(y - 1)} L${fmt(x - w / 2 + 1.6)} ${fmt(y - 5.4)} L${fmt(x + w / 2 - 1.6)} ${fmt(y - 5.4)} L${fmt(x + w / 2 + 1)} ${fmt(y - 1)} Z" fill="${roof}" stroke="${P.ink}" stroke-width=".6" stroke-linejoin="round"/>
    <rect x="${fmt(x - 1)}" y="${fmt(y + h - 4.4)}" width="2" height="3" fill="${P.ink}" opacity=".75"/>`;
}

function pennant(x, y, P) {
  const star = [];
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? 1.25 : 2.9;
    star.push([x + Math.cos(a) * rr, y - 3.4 + Math.sin(a) * rr]);
  }
  return `<ellipse cx="${fmt(x)}" cy="${fmt(y + 7.2)}" rx="4" ry="1.2" fill="#000" opacity=".18"/>
    <line x1="${fmt(x - 6.5)}" y1="${fmt(y - 9.6)}" x2="${fmt(x + 6.5)}" y2="${fmt(y - 9.6)}" stroke="${P.pole}" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M${fmt(x - 5.4)} ${fmt(y - 9.6)} H${fmt(x + 5.4)} V${fmt(y + 5.6)} L${fmt(x)} ${fmt(y + 2)} L${fmt(x - 5.4)} ${fmt(y + 5.6)} Z" fill="${P.pennant}" stroke="${P.ink}" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M${fmt(x - 5.4)} ${fmt(y - 7.6)} H${fmt(x + 5.4)}" stroke="${P.pennantStar}" stroke-width=".7" opacity=".8"/>
    <path d="M${star.map(pt).join(" L")} Z" fill="${P.pennantStar}" stroke="${P.ink}" stroke-width=".4" stroke-linejoin="round"/>
    <circle cx="${fmt(x - 6.5)}" cy="${fmt(y - 9.6)}" r="1.1" fill="${P.pennantStar}"/><circle cx="${fmt(x + 6.5)}" cy="${fmt(y - 9.6)}" r="1.1" fill="${P.pennantStar}"/>`;
}

function insideWithMargin(p, poly, m) {
  return [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m], [m * 0.7, m * 0.7], [-m * 0.7, m * 0.7], [m * 0.7, -m * 0.7], [-m * 0.7, -m * 0.7]]
    .every(([dx, dy]) => insidePoly([p[0] + dx, p[1] + dy], poly));
}

function merlons(wall, poly, P) {
  const dense = sampleQuad(wall.a, wall.c, wall.b, 80);
  const cum = [0];
  for (let i = 1; i < dense.length; i += 1) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const total = cum[cum.length - 1];
  let out = "";
  let j = 1;
  for (let s = 3; s < total; s += 7.2) {
    while (j < dense.length - 1 && cum[j] < s) j += 1;
    const p = dense[j]; const q = dense[j - 1];
    const tx = p[0] - q[0]; const ty = p[1] - q[1]; const len = Math.hypot(tx, ty) || 1;
    let n = [-ty / len, tx / len];
    if (insidePoly([p[0] + n[0] * 4, p[1] + n[1] * 4], poly)) n = [-n[0], -n[1]];
    const deg = (Math.atan2(n[0], -n[1]) * 180) / Math.PI;
    out += `<rect x="-2.2" y="-6.6" width="4.4" height="4.4" rx=".4" fill="${P.wall}" stroke="${P.wallDark}" stroke-width=".6" transform="translate(${fmt(p[0])} ${fmt(p[1])}) rotate(${fmt(deg)})"/>`;
  }
  return out;
}

function cityLayer(geo, P, rand, idPrefix) {
  let out = "";
  geo.cities.forEach((city, ci) => {
    if (!city.d) return;
    const clip = `${idPrefix}cc${ci}`;
    out += `<clipPath id="${clip}"><path d="${city.d}"/></clipPath>`;
    out += `<path d="${city.d}" fill="${P.city}"/>`;
    // Inner shade along the wall + paving speckle.
    out += `<g clip-path="url(#${clip})">${city.walls.map((w) => `<path d="M${pt(w.a)} Q${pt(w.c)} ${pt(w.b)}" fill="none" stroke="${P.cityShade}" stroke-width="12"/>`).join("")}`;
    for (let n = 0; n < 26; n += 1) {
      const p = [rand() * 100, rand() * 100];
      if (insidePoly(p, city.poly)) out += `<circle cx="${fmt(p[0])}" cy="${fmt(p[1])}" r=".7" fill="${P.cityShade}"/>`;
    }
    out += "</g>";
    const anchor = city.f.anchor ? [city.f.anchor[0] * 100, city.f.anchor[1] * 100] : null;
    // Pennant spot: the in-city candidate farthest from the meeple anchor.
    let flag = null;
    if (city.f.pennant) {
      let best = -1;
      for (let gy = 10; gy <= 90; gy += 4) for (let gx = 10; gx <= 90; gx += 4) {
        const p = [gx, gy];
        if (!insideWithMargin(p, city.poly, 10) || !insidePoly([p[0], p[1] - 13], city.poly)) continue;
        if (geo.roads.list.some((rd) => rd.gate && Math.hypot(p[0] - rd.gate[0], p[1] - rd.gate[1]) < 18)) continue;
        const dist = anchor ? Math.hypot(p[0] - anchor[0], p[1] - anchor[1]) : 20;
        const score = (dist < 16 ? dist - 30 : Math.min(dist, 24)) - Math.hypot(p[0] - 50, p[1] - 50) * 0.3;
        if (score > best) { best = score; flag = p; }
      }
    }
    // Rooftops on a jittered grid inside the walls, leaving a plaza at the anchor.
    const homes = [];
    for (let gy = 10; gy < 100; gy += 17) {
      for (let gx = 10; gx < 100; gx += 17) {
        const p = [gx + (rand() - 0.5) * 4, gy + (rand() - 0.5) * 4 + (Math.round(gx / 17) % 2) * 5];
        if (!insideWithMargin(p, city.poly, 9) || !insidePoly([p[0], p[1] - 15], city.poly)) continue;
        if (anchor && Math.hypot(p[0] - anchor[0], p[1] - anchor[1]) < 13) continue;
        if (flag && Math.hypot(p[0] - flag[0], p[1] - flag[1]) < 14) continue;
        if (geo.roads.list.some((rd) => rd.gate && Math.hypot(p[0] - rd.gate[0], p[1] - rd.gate[1]) < 10)) continue;
        if (rand() < 0.1) continue;
        homes.push(p);
      }
    }
    let scale = 1.35;
    if (!homes.length) {
      // Small caps: a couple of cottages either side of the plaza.
      scale = 1;
      for (let gx = 14; gx < 90; gx += 12) {
        for (let gy = 8; gy < 92; gy += 12) {
          const p = [gx, gy];
          if (!insideWithMargin(p, city.poly, 5.5) || !insidePoly([p[0], p[1] - 8], city.poly)) continue;
          if (anchor && Math.hypot(p[0] - anchor[0], p[1] - anchor[1]) < 13) continue;
          if (homes.some((h) => Math.hypot(h[0] - p[0], h[1] - p[1]) < 18)) continue;
          if (homes.length < 3) homes.push(p);
        }
      }
    }
    homes.sort((a, b) => a[1] - b[1]).forEach((p) => {
      out += `<g transform="translate(${fmt(p[0])} ${fmt(p[1])}) scale(${scale})">${house(0, 0, rand, P)}</g>`;
    });
    city.walls.forEach((w) => { out += merlons(w, city.poly, P); });
    city.walls.forEach((w) => {
      const d = `M${pt(w.a)} Q${pt(w.c)} ${pt(w.b)}`;
      out += `<path d="${d}" fill="none" stroke="${P.wallDark}" stroke-width="6.4"/>`;
      out += `<path d="${d}" fill="none" stroke="${P.wall}" stroke-width="4.6"/>`;
      out += `<path d="${d}" fill="none" stroke="${P.wallLight}" stroke-width=".8" stroke-dasharray="3 2.4"/>`;
    });
    if (flag) out += pennant(flag[0], flag[1], P);
  });
  geo.roads.list.forEach((rd) => {
    if (!rd.gate) return;
    const [x, y] = rd.gate;
    out += `<rect x="${fmt(x - 6)}" y="${fmt(y - 6.5)}" width="12" height="9" rx="1" fill="${P.wall}" stroke="${P.wallDark}" stroke-width=".8"/>
      <path d="M${fmt(x - 6)} ${fmt(y - 6.5)} h2.4 v-2 h2.4 v2 h2.4 v-2 h2.4 v2 h2.4" fill="${P.wall}" stroke="${P.wallDark}" stroke-width=".7"/>
      <path d="M${fmt(x - 3)} ${fmt(y + 2.5)} V${fmt(y - 1.5)} A3 3 0 0 1 ${fmt(x + 3)} ${fmt(y - 1.5)} V${fmt(y + 2.5)} Z" fill="${P.ink}" opacity=".85"/>`;
  });
  return out;
}

function cloisterGarden(c, P, rand) {
  const [x, y, w, h] = c.box;
  let out = `<rect x="${fmt(x)}" y="${fmt(y)}" width="${w}" height="${h}" rx="9" fill="${P.garden}" stroke="${P.hedge}" stroke-width="3.6"/>`;
  out += `<rect x="${fmt(x + 3.4)}" y="${fmt(y + 3.4)}" width="${w - 6.8}" height="${h - 6.8}" rx="6" fill="none" stroke="${P.hedge}" stroke-width=".7" stroke-dasharray="1.6 1.8" opacity=".7"/>`;
  [[x + 8, y + 8], [x + w - 8, y + 8], [x + 8, y + h - 8], [x + w - 8, y + h - 8]].forEach(([fx, fy]) => {
    out += `<circle cx="${fmt(fx)}" cy="${fmt(fy)}" r="2.6" fill="${P.hedge}"/>`;
    out += `<circle cx="${fmt(fx + (rand() - 0.5) * 2)}" cy="${fmt(fy - 0.8)}" r=".9" fill="${rand() < 0.5 ? P.flowerA : P.flowerB}"/>`;
  });
  return out;
}

function chapel(c, P) {
  const [cx, cy] = c.c;
  return `<ellipse cx="${fmt(cx + 1)}" cy="${fmt(cy + 12.5)}" rx="14" ry="2.6" fill="#000" opacity=".18"/>
    <rect x="${fmt(cx - 11)}" y="${fmt(cy - 3)}" width="22" height="15" fill="${P.cloisterWall}" stroke="${P.ink}" stroke-width=".9"/>
    <path d="M${fmt(cx - 13)} ${fmt(cy - 2)} L${fmt(cx - 4)} ${fmt(cy - 12)} L${fmt(cx + 5)} ${fmt(cy - 2)} Z" fill="${P.cloisterRoof}" stroke="${P.ink}" stroke-width=".9" stroke-linejoin="round"/>
    <rect x="${fmt(cx + 3)}" y="${fmt(cy - 16)}" width="9" height="28" fill="${P.cloisterWall}" stroke="${P.ink}" stroke-width=".9"/>
    <path d="M${fmt(cx + 1.6)} ${fmt(cy - 15.6)} L${fmt(cx + 7.5)} ${fmt(cy - 26)} L${fmt(cx + 13.4)} ${fmt(cy - 15.6)} Z" fill="${P.cloisterRoof}" stroke="${P.ink}" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M${fmt(cx + 5.6)} ${fmt(cy - 7)} V${fmt(cy - 10)} A1.9 1.9 0 0 1 ${fmt(cx + 9.4)} ${fmt(cy - 10)} V${fmt(cy - 7)} Z" fill="${P.ink}" opacity=".8"/>
    <circle cx="${fmt(cx + 7.5)}" cy="${fmt(cy - 8.4)}" r="1" fill="${P.pennantStar}"/>
    <circle cx="${fmt(cx - 4)}" cy="${fmt(cy + 1.4)}" r="2.5" fill="#86b6dc" stroke="${P.ink}" stroke-width=".6"/>
    <path d="M${fmt(cx - 4)} ${fmt(cy - 1.1)} V${fmt(cy + 3.9)} M${fmt(cx - 6.5)} ${fmt(cy + 1.4)} H${fmt(cx - 1.5)}" stroke="${P.ink}" stroke-width=".4"/>
    <path d="M${fmt(cx - 6.6)} ${fmt(cy + 12)} V${fmt(cy + 7.6)} A2.6 2.6 0 0 1 ${fmt(cx - 1.4)} ${fmt(cy + 7.6)} V${fmt(cy + 12)} Z" fill="${P.ink}" opacity=".85"/>
    <rect x="${fmt(cx + 6)}" y="${fmt(cy + 3)}" width="3" height="4" rx="1.4" fill="${P.ink}" opacity=".6"/>`;
}

function featureArtOverrides(geo) {
  const art = ASSETS.tileFeatureArt || {};
  return geo.features.filter((f) => art[f.kind]).map((f) => {
    const [u, v] = f.anchor;
    return `<image href="${esc(art[f.kind])}" x="${fmt(u * 100 - 13)}" y="${fmt(v * 100 - 13)}" width="26" height="26"/>`;
  }).join("");
}

const artCache = new Map();

// Inner tile markup in 0..100 units (no <svg> wrapper) — for embedding in a
// board <symbol>. idPrefix keeps clip ids unique within a document.
export function tileArt(def, { r = 0, palette, idPrefix = "rw" } = {}) {
  const P = palette || paletteFor("light");
  const override = ASSETS.tiles && ASSETS.tiles[def.id];
  if (override) {
    return `<image href="${esc(override)}" width="100" height="100" preserveAspectRatio="none" transform="rotate(${90 * (r % 4)} 50 50)"/>`;
  }
  const key = `${def.id}|${r}|${idPrefix}|${JSON.stringify(P)}|${JSON.stringify(def.features)}`;
  if (artCache.has(key)) return artCache.get(key);
  const geo = tileGeometry(def, r);
  const rand = seededRandom(`${def.id}#${r}`);
  let out = fieldLayer(geo, P, rand);
  geo.cloisters.forEach((c) => { out += cloisterGarden(c, P, rand); });
  out += roadLayer(geo, P);
  out += cityLayer(geo, P, rand, `${idPrefix}-`);
  geo.cloisters.forEach((c) => { out += chapel(c, P); });
  out += featureArtOverrides(geo);
  artCache.set(key, out);
  return out;
}

export function tileSvg(def, { r = 0, size = 100, palette, idPrefix } = {}) {
  const prefix = idPrefix || `rw${safeId(def.id)}${r}`;
  return `<svg class="rw-tile-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">${tileArt(def, { r, palette, idPrefix: prefix })}</svg>`;
}

// Rotated anchor [u, v] (unit coords) of feature featureIdx at rotation r.
export function featureAnchor(def, featureIdx, r = 0) {
  const geo = tileGeometry(def, r);
  const f = geo.features[featureIdx];
  return f ? f.anchor : [0.5, 0.5];
}

// Highlight overlay (0..100 units) for the feature a meeple would claim.
export function featureHighlight(def, featureIdx, r = 0, color = "#fff6a8") {
  const geo = tileGeometry(def, r);
  const f = geo.features[featureIdx];
  if (!f) return "";
  if (f.kind === "city") {
    const city = geo.cities.find((c) => c.f.idx === featureIdx);
    return city && city.d ? `<path d="${city.d}" fill="${color}" fill-opacity=".38" stroke="${color}" stroke-width="2.4"/>` : "";
  }
  if (f.kind === "road") {
    const rd = geo.roads.list.find((x) => x.f.idx === featureIdx);
    return rd ? rd.paths.map((p) => `<path d="${p.d}" fill="none" stroke="${color}" stroke-width="13" stroke-opacity=".55"/>`).join("") : "";
  }
  if (f.kind === "cloister") {
    const c = geo.cloisters.find((x) => x.f.idx === featureIdx);
    return c ? `<rect x="${fmt(c.box[0] - 2)}" y="${fmt(c.box[1] - 2)}" width="${c.box[2] + 4}" height="${c.box[3] + 4}" rx="11" fill="${color}" fill-opacity=".3" stroke="${color}" stroke-width="2.4"/>` : "";
  }
  // Fields (and unknown kinds): merge the owned grid cells into row runs.
  let out = "";
  const { owner } = geo.cells;
  for (let gy = 0; gy < GRID; gy += 1) {
    let gx = 0;
    while (gx < GRID) {
      if (owner[gy * GRID + gx] !== featureIdx) { gx += 1; continue; }
      const startX = gx;
      while (gx < GRID && owner[gy * GRID + gx] === featureIdx) gx += 1;
      out += `<rect x="${fmt(startX * CELL)}" y="${fmt(gy * CELL)}" width="${fmt((gx - startX) * CELL)}" height="${fmt(CELL + 0.05)}"/>`;
    }
  }
  return `<g fill="${color}" fill-opacity=".34">${out}</g>`;
}

// ---------- the meeple (an original little figure) ----------
// Centered on (0,0), ~28 units tall; scale with the `scale` option.
export function meepleShape(color, { farmer = false, scale = 1, ink = "#2a2018" } = {}) {
  const c = esc(color || "#888");
  const override = ASSETS.meeple;
  if (override) {
    return `<g transform="scale(${scale})"><ellipse cx="0" cy="11" rx="10" ry="3.2" fill="${c}" stroke="${ink}" stroke-width="1"/><image href="${esc(override)}" x="-12" y="-16" width="24" height="28"/></g>`;
  }
  const hat = farmer
    ? `<path d="M-4.6 -12.4 Q-4.4 -18 0 -18.2 Q4.4 -18 4.6 -12.4 Z" fill="#e9c66b" stroke="${ink}" stroke-width="1"/>
       <ellipse cx="0" cy="-12.2" rx="9.4" ry="2.5" fill="#e9c66b" stroke="${ink}" stroke-width="1"/>
       <path d="M-4.4 -13.6 H4.4" stroke="${c}" stroke-width="1.4"/>`
    : `<path d="M-5.2 -10.6 Q-5 -15.6 0 -15.8 Q5 -15.6 5.2 -10.6 Q0 -12 -5.2 -10.6 Z" fill="${c}" stroke="${ink}" stroke-width="1"/>
       <circle cx="0" cy="-16.2" r="1.5" fill="${c}" stroke="${ink}" stroke-width=".9"/>`;
  const fork = farmer
    ? `<path d="M11.2 11 V-9.5 M8.6 -9.5 H13.8 M8.6 -9.5 V-13.6 M11.2 -9.5 V-14.6 M13.8 -9.5 V-13.6" stroke="${ink}" stroke-width="1.5" stroke-linecap="round" fill="none"/>
       <path d="M11.2 11 V-9.5" stroke="#b98a4c" stroke-width=".7"/>`
    : "";
  return `<g transform="scale(${scale})">
    <ellipse cx="0" cy="11.4" rx="9.5" ry="2.4" fill="#000" opacity=".28"/>
    ${fork}
    <ellipse cx="-8.4" cy="2" rx="2.7" ry="3.6" transform="rotate(18 -8.4 2)" fill="${c}" stroke="${ink}" stroke-width="1.1"/>
    <ellipse cx="8.4" cy="2" rx="2.7" ry="3.6" transform="rotate(-18 8.4 2)" fill="${c}" stroke="${ink}" stroke-width="1.1"/>
    <path d="M-3.4 -4.2 Q-7.8 -3 -8.4 4 L-9 9.8 Q-9 11.2 -7.6 11.2 L-1.7 11.2 L0 8.2 L1.7 11.2 L7.6 11.2 Q9 11.2 9 9.8 L8.4 4 Q7.8 -3 3.4 -4.2 Z" fill="${c}" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M-6.2 3.2 Q0 5.2 6.2 3.2" stroke="${ink}" stroke-width=".9" fill="none" opacity=".55"/>
    <path d="M-5.8 0 Q-6.4 4 -6.8 8.6" stroke="#fff" stroke-width="1.5" stroke-linecap="round" fill="none" opacity=".35"/>
    <circle cx="0" cy="-8.6" r="5.4" fill="#f7dcc0" stroke="${ink}" stroke-width="1.1"/>
    <circle cx="-1.9" cy="-8.4" r=".8" fill="${ink}"/><circle cx="1.9" cy="-8.4" r=".8" fill="${ink}"/>
    <path d="M-1.4 -6.4 Q0 -5.4 1.4 -6.4" stroke="${ink}" stroke-width=".6" fill="none" stroke-linecap="round"/>
    ${hat}
  </g>`;
}

export function meepleSvg(color, { farmer = false, size = 28 } = {}) {
  return `<svg class="rw-meeple-svg" xmlns="http://www.w3.org/2000/svg" viewBox="-14 -20 28 33" width="${size}" height="${fmt(size * 33 / 28)}" aria-hidden="true">${meepleShape(color, { farmer })}</svg>`;
}

export { safeId };
