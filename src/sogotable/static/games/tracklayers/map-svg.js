// Tracklayers — the board as one SVG string (pure; no DOM, no rules). Draws
// the sea, soft procedural islands of our own design (land follows the short
// routes, so the long crossings read as sea lanes), every route as a row of
// rail cars between its two cities (double routes offset in parallel), claimed
// routes in the owner's seat colour, and city dots + labels. Highlights
// (selected route, affordable glow, suggested ticket path, ticket cities) are
// passed in decided; this module only paints. Tap → route lives here too
// (nearestRoute) so the geometry has one owner.
import { ASSETS } from "./assets.js";

const CITY_R = 9;
const INSET = 16; // gap between a city dot and the first car
const CAR_GAP = 3.2;
const CAR_THICK = 12.5;
const TWIN_OFFSET = 8.5;

const num = (id) => Number(String(id).replace(/\D+/g, "")) || 0;
const r1 = (v) => Math.round(v * 10) / 10;

export function cityIndex(map) {
  const out = {};
  (map && Array.isArray(map.cities) ? map.cities : []).forEach((c) => { out[c.id] = c; });
  return out;
}

// Centre line of a route's track (twins pushed apart along the normal).
export function routeLine(route, cities) {
  const a = cities[route.a]; const b = cities[route.b];
  if (!a || !b) return null;
  const dx = b.x - a.x; const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len; const uy = dy / len;
  let off = 0;
  if (route.twin) off = num(route.id) < num(route.twin) ? -TWIN_OFFSET : TWIN_OFFSET;
  const nx = -uy * off; const ny = ux * off;
  return {
    x1: a.x + ux * INSET + nx, y1: a.y + uy * INSET + ny,
    x2: b.x - ux * INSET + nx, y2: b.y - uy * INSET + ny,
    ux, uy, length: len - 2 * INSET, angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

function distToSegment(px, py, g) {
  const vx = g.x2 - g.x1; const vy = g.y2 - g.y1;
  const t = Math.max(0, Math.min(1, ((px - g.x1) * vx + (py - g.y1) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - (g.x1 + vx * t), py - (g.y1 + vy * t));
}

// The route whose track is nearest a board point, within maxDist board units.
export function nearestRoute(map, wx, wy, maxDist) {
  const cities = cityIndex(map);
  let best = null; let bestD = maxDist;
  (map && Array.isArray(map.routes) ? map.routes : []).forEach((route) => {
    const g = routeLine(route, cities);
    if (!g) return;
    const d = distToSegment(wx, wy, g);
    if (d < bestD) { bestD = d; best = route.id; }
  });
  return best;
}

function islandsSvg(map, cities, p) {
  const shortRoutes = map.routes.filter((r) => r.len <= 4 && !(r.twin && num(r.id) > num(r.twin)));
  const strokes = (width, color) => shortRoutes.map((r) => {
    const a = cities[r.a]; const b = cities[r.b];
    return a && b ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>` : "";
  }).join("");
  const dots = (rad, color) => map.cities.map((c) => `<circle cx="${c.x}" cy="${c.y}" r="${rad}" fill="${color}"/>`).join("");
  return `<g class="tl-land" aria-hidden="true">
      <g>${strokes(120, p.shore)}${dots(72, p.shore)}</g>
      <g>${strokes(102, p.land)}${dots(62, p.land)}</g>
      <g opacity=".55">${strokes(34, p.landShade)}</g>
    </g>`;
}

function seaSvg(board, p) {
  const art = ASSETS.seaImage ? `<image href="${ASSETS.seaImage}" x="0" y="0" width="${board.width}" height="${board.height}" preserveAspectRatio="xMidYMid slice"/>` : "";
  const waves = [[180, 140], [640, 120], [860, 330], [330, 400], [560, 560], [80, 430], [900, 580], [700, 290]]
    .map(([x, y]) => `<path d="M${x} ${y} q8 -6 16 0 t16 0 t16 0" fill="none" stroke="${p.wave}" stroke-width="2.4" stroke-linecap="round"/>`).join("");
  return `<defs><radialGradient id="tlSea" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="${p.sea}"/><stop offset="1" stop-color="${p.seaDeep}"/></radialGradient></defs>
    <rect x="0" y="0" width="${board.width}" height="${board.height}" fill="url(#tlSea)"/>${art}<g aria-hidden="true">${waves}</g>`;
}

function carsSvg(route, g, fill, edge, edgeW, windows, p) {
  const n = route.len;
  const carLen = (g.length - CAR_GAP * (n - 1)) / n;
  let out = "";
  for (let i = 0; i < n; i += 1) {
    const d = i * (carLen + CAR_GAP) + carLen / 2;
    const cx = r1(g.x1 + g.ux * d); const cy = r1(g.y1 + g.uy * d);
    out += `<g transform="translate(${cx} ${cy}) rotate(${r1(g.angle)})"><rect x="${r1(-carLen / 2)}" y="${-CAR_THICK / 2}" width="${r1(carLen)}" height="${CAR_THICK}" rx="2.4" fill="${fill}" stroke="${edge}" stroke-width="${edgeW}"/>`;
    if (windows) out += `<rect x="${r1(-carLen / 2 + 3)}" y="-2" width="${r1(Math.max(2, carLen - 6))}" height="4" rx="1.5" fill="${p.window}"/>`;
    out += "</g>";
  }
  return out;
}

// vm: { map, palette, owners, colorOf(mark), myMark, selected, affordable:Set,
//       pathRoutes:Set, ticketCities:Set, labelSize, lockedIds:Set }
export function buildMapSvg(vm) {
  const { map, palette: p } = vm;
  const board = map.board || { width: 1000, height: 700 };
  const cities = cityIndex(map);
  const halos = [];
  const tracks = [];
  map.routes.forEach((route) => {
    const g = routeLine(route, cities);
    if (!g) return;
    const owner = vm.owners[route.id];
    const seg = `x1="${r1(g.x1)}" y1="${r1(g.y1)}" x2="${r1(g.x2)}" y2="${r1(g.y2)}"`;
    if (route.id === vm.selected) halos.push(`<line class="tl-halo-sel" ${seg} stroke="${p.select}" stroke-width="26" stroke-linecap="round"/>`);
    else if (!owner && vm.pathRoutes.has(route.id)) halos.push(`<line class="tl-halo-path" ${seg} stroke="${p.path}" stroke-width="22" stroke-linecap="round" stroke-dasharray="2 9"/>`);
    else if (!owner && vm.affordable.has(route.id)) halos.push(`<line class="tl-halo-afford" ${seg} stroke="${p.afford}" stroke-width="22" stroke-linecap="round"/>`);
    const locked = !owner && vm.lockedIds.has(route.id);
    const cars = owner
      ? carsSvg(route, g, vm.colorOf(owner), p.claimedEdge, 1.8, true, p)
      : carsSvg(route, g, p.cards[route.color] || p.cards.gray, p.carEdge, 1.3, false, p);
    tracks.push(`<g class="tl-route${owner ? " tl-owned" : ""}" data-route="${route.id}"${locked ? ` opacity="${p.locked}"` : ""}>${cars}</g>`);
  });
  const size = vm.labelSize;
  const spots = placeLabels(map.cities, size, board);
  const labels = map.cities.map((c) => {
    const ring = vm.ticketCities.has(c.id)
      ? `<circle cx="${c.x}" cy="${c.y}" r="${CITY_R + 7}" fill="none" stroke="${p.ticketRing}" stroke-width="3.5" class="tl-ticket-ring"/>`
      : "";
    const { x: lx, y: ly } = spots[c.id];
    return `<g class="tl-city" data-city="${c.id}">${ring}<circle cx="${c.x}" cy="${c.y}" r="${CITY_R}" fill="${p.city}" stroke="${p.cityRing}" stroke-width="3"/>
      <text x="${r1(lx)}" y="${r1(ly)}" font-size="${r1(size)}" text-anchor="middle" fill="${p.label}" stroke="${p.labelHalo}" stroke-width="${r1(size * 0.28)}" paint-order="stroke" stroke-linejoin="round">${escapeText(c.name)}</text></g>`;
  }).join("");
  return `<svg class="tl-map" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${board.width} ${board.height}" preserveAspectRatio="xMidYMid meet" role="img">
    ${seaSvg(board, p)}${islandsSvg(map, cities, p)}
    <g class="tl-halos">${halos.join("")}</g>
    <g class="tl-tracks">${tracks.join("")}</g>
    <g class="tl-cities">${labels}</g>
  </svg>`;
}

// Greedy label placement: below the dot, else above, else right / left —
// the first spot whose box clears every label already placed (and the board).
function placeLabels(cities, size, board) {
  const placed = [];
  const out = {};
  const hit = (b) => placed.some((o) => b.x1 < o.x2 && b.x2 > o.x1 && b.y1 < o.y2 && b.y2 > o.y1);
  cities.forEach((c) => {
    const w = c.name.length * size * 0.56;
    const clampX = (x) => Math.max(w / 2 + 3, Math.min(board.width - w / 2 - 3, x));
    const tries = [
      { x: clampX(c.x), y: c.y + CITY_R + size * 0.95 },
      { x: clampX(c.x), y: c.y - CITY_R - size * 0.35 },
      { x: clampX(c.x + CITY_R + 4 + w / 2), y: c.y + size * 0.35 },
      { x: clampX(c.x - CITY_R - 4 - w / 2), y: c.y + size * 0.35 },
    ];
    const box = (t) => ({ x1: t.x - w / 2, x2: t.x + w / 2, y1: t.y - size * 0.8, y2: t.y + size * 0.2 });
    const fits = (t) => { const b = box(t); return b.y1 >= 0 && b.y2 <= board.height && !hit(b); };
    const pick = tries.find(fits) || tries.find((t) => box(t).y2 <= board.height && box(t).y1 >= 0) || tries[0];
    placed.push(box(pick));
    out[c.id] = pick;
  });
  return out;
}

function escapeText(s) {
  return String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
