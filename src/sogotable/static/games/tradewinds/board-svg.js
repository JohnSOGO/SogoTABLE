// Tradewind Isles — board markup (one SVG string) from the projected board.
// Lattice → board units: X × 0.866 × R, Y × 0.5 × R (pointy-top hexes of
// radius R). Draws sea + beach, docks, terrain hexes (procedural art or an
// assets.js override), number tokens (+ odds dots), pieces, the monkey, the
// glow on server-legal targets, the current selection, and a top layer of
// generous transparent tap targets for the current mode only. Legality is
// never computed here: `targets.legal` is the server's list, verbatim.
import { ASSETS } from "./assets.js";
import { R, hexPoints, hutSvg, lodgeSvg, pathSvg, terrainArt, terrainFill } from "./art.js";
import { DOCK, MONKEY, resEmoji } from "./branding.js";

const KX = 0.866 * R;
const KY = 0.5 * R;
export const toPx = (x, y) => [x * KX, y * KY];
const f1 = (n) => n.toFixed(1);

function viewBox(board) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const grow = (x, y, pad) => {
    minX = Math.min(minX, x - pad); maxX = Math.max(maxX, x + pad);
    minY = Math.min(minY, y - pad); maxY = Math.max(maxY, y + pad);
  };
  (board.hexes || []).forEach((h) => { const [x, y] = toPx(h.x, h.y); grow(x, y, R + 6); });
  (board.ports || []).forEach((d) => { const [x, y] = toPx(d.x, d.y); grow(x, y, 17); });
  if (!Number.isFinite(minX)) return "-100 -100 200 200";
  return `${f1(minX - 4)} ${f1(minY - 4)} ${f1(maxX - minX + 8)} ${f1(maxY - minY + 8)}`;
}

function tokenSvg(h, x, y, p, showPips) {
  if (h.number == null) return "";
  const hot = h.number === 6 || h.number === 8;
  const pips = showPips && h.pips
    ? Array.from({ length: h.pips }, (_, i) => `<circle cx="${f1(x + (i - (h.pips - 1) / 2) * 3.2)}" cy="${f1(y + 7.2)}" r="1.15" fill="${hot ? p.tokenHot : p.pip}"/>`).join("")
    : "";
  const ty = showPips && h.pips ? y + 3.2 : y + 4.6;
  return `<g class="tw-token"><circle cx="${f1(x)}" cy="${f1(y)}" r="12.5" fill="${p.token}" stroke="${p.tokenEdge}" stroke-width="1.4"/>
    <text x="${f1(x)}" y="${f1(ty)}" text-anchor="middle" font-size="${hot ? 13 : 12}" font-weight="800" fill="${hot ? p.tokenHot : p.tokenInk}">${h.number}</text>${pips}</g>`;
}

function dockSvg(d, edge, verts, p) {
  const [px, py] = toPx(d.x, d.y);
  let piers = "";
  if (edge && verts[edge.a] && verts[edge.b]) {
    piers = [verts[edge.a], verts[edge.b]].map((v) => {
      const [vx, vy] = toPx(v.x, v.y);
      return `<line x1="${f1(vx)}" y1="${f1(vy)}" x2="${f1(vx + (px - vx) * 0.62)}" y2="${f1(vy + (py - vy) * 0.62)}" stroke="${p.dock}" stroke-width="3.2" stroke-linecap="round"/>`;
    }).join("");
  }
  const label = d.resource ? `${d.rate}:1` : `${d.rate || 3}:1`;
  const icon = d.resource ? resEmoji(d.resource) : DOCK.emoji;
  return `<g class="tw-dock">${piers}<circle cx="${f1(px)}" cy="${f1(py)}" r="13" fill="${p.dockBadge}" stroke="${p.dock}" stroke-width="2"/>
    <text x="${f1(px)}" y="${f1(py - 1)}" text-anchor="middle" font-size="9.5">${icon}</text>
    <text x="${f1(px)}" y="${f1(py + 8.4)}" text-anchor="middle" font-size="7" font-weight="800" fill="${p.dockInk}">${label}</text></g>`;
}

function edgeEnds(edge, verts) {
  const a = verts[edge.a]; const b = verts[edge.b];
  if (!a || !b) return null;
  return [...toPx(a.x, a.y), ...toPx(b.x, b.y)];
}

// Nearest tap target of the current mode to a board-unit point (Voronoi-style
// hit areas: on a phone the whole board is the hit area, not just the tiny
// circles). Returns { kind, id } or null when the tap is far from everything.
export function nearestTarget(board, targets, px, py) {
  if (!board || !targets || !targets.kind) return null;
  const verts = Object.fromEntries((board.vertices || []).map((v) => [v.id, v]));
  const cands = [];
  if (targets.kind === "hex") (board.hexes || []).forEach((h) => cands.push(["hex", h.id, ...toPx(h.x, h.y), R]));
  if (targets.kind === "edge") {
    (board.edges || []).forEach((e) => {
      const a = verts[e.a]; const b = verts[e.b];
      if (a && b) cands.push(["edge", e.id, ((a.x + b.x) / 2) * KX, ((a.y + b.y) / 2) * KY, 24]);
    });
  }
  if (targets.kind === "vertex" || targets.alsoVertex) (board.vertices || []).forEach((v) => cands.push(["vertex", v.id, ...toPx(v.x, v.y), 26]));
  let best = null; let bestD = Infinity;
  cands.forEach(([kind, id, x, y, max]) => {
    const d = Math.hypot(px - x, py - y);
    if (d <= max && d < bestD) { bestD = d; best = { kind, id }; }
  });
  return best;
}

// vm: { board, pieces, monkey, palette, colorOf, myColor, showPips,
//       targets: { kind: "vertex"|"edge"|"hex"|null, legal: string[], glow: bool },
//       selected: { vertex, edge, hex }, ghost: "hut"|"lodge"|null }
export function buildBoardSvg(vm) {
  const p = vm.palette;
  const board = vm.board || {};
  const hexes = Array.isArray(board.hexes) ? board.hexes : [];
  const vertices = Array.isArray(board.vertices) ? board.vertices : [];
  const edges = Array.isArray(board.edges) ? board.edges : [];
  const ports = Array.isArray(board.ports) ? board.ports : [];
  const verts = Object.fromEntries(vertices.map((v) => [v.id, v]));
  const edgeMap = Object.fromEntries(edges.map((e) => [e.id, e]));
  const pieces = vm.pieces || {};
  const huts = pieces.huts || {}; const lodges = pieces.lodges || {}; const paths = pieces.paths || {};
  const out = [];

  out.push(`<defs><clipPath id="twHexClip" clipPathUnits="userSpaceOnUse"><polygon points="${hexPoints(0, 0, R - 0.5)}"/></clipPath>
    <pattern id="twWaves" width="34" height="18" patternUnits="userSpaceOnUse"><path d="M2,12 q6,-6 12,0 t12,0" stroke="${p.seaFoam}" stroke-width="1.4" fill="none"/></pattern></defs>`);
  out.push(`<rect x="-2000" y="-2000" width="4000" height="4000" fill="${p.sea}"/><rect x="-2000" y="-2000" width="4000" height="4000" fill="url(#twWaves)"/>`);
  // beach ring under the island
  out.push(hexes.map((h) => { const [x, y] = toPx(h.x, h.y); return `<polygon points="${hexPoints(x, y, R + 7)}" fill="${p.sandEdge}"/>`; }).join(""));
  out.push(hexes.map((h) => { const [x, y] = toPx(h.x, h.y); return `<polygon points="${hexPoints(x, y, R + 4)}" fill="${p.sand}"/>`; }).join(""));
  out.push(ports.map((d) => dockSvg(d, edgeMap[d.edge], verts, p)).join(""));

  hexes.forEach((h) => {
    const [x, y] = toPx(h.x, h.y);
    const img = ASSETS.terrain && ASSETS.terrain[h.terrain];
    const art = img
      ? `<image href="${img}" x="${-R}" y="${-R}" width="${2 * R}" height="${2 * R}" preserveAspectRatio="xMidYMid slice"/>`
      : terrainArt(h.terrain, h.id, p);
    out.push(`<g transform="translate(${f1(x)},${f1(y)})"><g clip-path="url(#twHexClip)"><polygon points="${hexPoints(0, 0, R)}" fill="${terrainFill(h.terrain, p)}"/>${art}</g>
      <polygon points="${hexPoints(0, 0, R)}" fill="none" stroke="${p.hexEdge}" stroke-width="1.4"/></g>`);
    out.push(tokenSvg(h, x, y, p, vm.showPips));
  });

  const t = vm.targets || { kind: null, legal: [], glow: false };
  const legal = new Set(Array.isArray(t.legal) ? t.legal : []);
  const sel = vm.selected || {};

  // glow on server-legal targets (under the pieces)
  if (t.glow && legal.size) {
    if (t.kind === "vertex") {
      legal.forEach((id) => { const v = verts[id]; if (!v) return; const [x, y] = toPx(v.x, v.y); out.push(`<circle class="tw-glow" cx="${f1(x)}" cy="${f1(y)}" r="8" fill="${p.glowFill}" stroke="${p.glow}" stroke-width="2.6"/>`); });
    } else if (t.kind === "edge") {
      legal.forEach((id) => { const e = edgeMap[id]; const c = e && edgeEnds(e, verts); if (!c) return; out.push(`<line class="tw-glow" x1="${f1(c[0])}" y1="${f1(c[1])}" x2="${f1(c[2])}" y2="${f1(c[3])}" stroke="${p.glow}" stroke-width="6" stroke-linecap="round" stroke-dasharray="4 5"/>`); });
    } else if (t.kind === "hex") {
      legal.forEach((id) => { const h = hexes.find((x) => x.id === id); if (!h) return; const [x, y] = toPx(h.x, h.y); out.push(`<polygon class="tw-glow" points="${hexPoints(x, y, R - 3)}" fill="${p.glowFill}" stroke="${p.glow}" stroke-width="3"/>`); });
    }
  }

  Object.entries(paths).forEach(([id, mark]) => {
    const e = edgeMap[id]; const c = e && edgeEnds(e, verts);
    if (c) out.push(pathSvg(c[0], c[1], c[2], c[3], vm.colorOf(mark), p));
  });
  Object.entries(huts).forEach(([id, mark]) => {
    const v = verts[id]; if (!v) return;
    const [x, y] = toPx(v.x, v.y);
    out.push(hutSvg(x, y, vm.colorOf(mark), p, { art: ASSETS.pieces && ASSETS.pieces.hut }));
  });
  Object.entries(lodges).forEach(([id, mark]) => {
    const v = verts[id]; if (!v) return;
    const [x, y] = toPx(v.x, v.y);
    out.push(lodgeSvg(x, y, vm.colorOf(mark), p, { art: ASSETS.pieces && ASSETS.pieces.lodge }));
  });

  // the monkey
  const mh = hexes.find((h) => h.id === vm.monkey);
  if (mh) {
    const [x, y] = toPx(mh.x, mh.y);
    const face = ASSETS.monkey
      ? `<image href="${ASSETS.monkey}" x="${f1(x + 5)}" y="${f1(y - 25)}" width="20" height="20"/>`
      : `<text x="${f1(x + 15)}" y="${f1(y - 10.5)}" text-anchor="middle" font-size="14">${MONKEY.emoji}</text>`;
    out.push(`<g class="tw-monkey"><circle cx="${f1(x)}" cy="${f1(y)}" r="13" fill="rgba(0,0,0,.28)"/><circle cx="${f1(x + 15)}" cy="${f1(y - 15)}" r="11.5" fill="${p.token}" stroke="${p.pieceEdge}" stroke-width="1.6"/>${face}</g>`);
  }

  // current selection + ghost piece
  if (sel.edge && edgeMap[sel.edge]) {
    const c = edgeEnds(edgeMap[sel.edge], verts);
    if (c) out.push(`<line class="tw-sel" x1="${f1(c[0])}" y1="${f1(c[1])}" x2="${f1(c[2])}" y2="${f1(c[3])}" stroke="${p.select}" stroke-width="12" stroke-linecap="round" opacity=".55"/>${pathSvg(c[0], c[1], c[2], c[3], vm.myColor, p, { ghost: true })}`);
  }
  if (sel.vertex && verts[sel.vertex]) {
    const [x, y] = toPx(verts[sel.vertex].x, verts[sel.vertex].y);
    const ghost = vm.ghost === "lodge" ? lodgeSvg(x, y, vm.myColor, p, { ghost: true }) : vm.ghost === "hut" ? hutSvg(x, y, vm.myColor, p, { ghost: true }) : "";
    out.push(`<circle class="tw-sel" cx="${f1(x)}" cy="${f1(y)}" r="14" fill="none" stroke="${p.select}" stroke-width="3.2"/>${ghost}`);
  }
  if (sel.hex) {
    const h = hexes.find((x) => x.id === sel.hex);
    if (h) { const [x, y] = toPx(h.x, h.y); out.push(`<polygon class="tw-sel" points="${hexPoints(x, y, R - 2)}" fill="none" stroke="${p.select}" stroke-width="4"/><text x="${f1(x - 14)}" y="${f1(y + 24)}" text-anchor="middle" font-size="15">${MONKEY.emoji}</text>`); }
  }

  // tap targets (top layer; only the current mode's kind)
  const hit = [];
  if (t.kind === "hex") {
    hexes.forEach((h) => { const [x, y] = toPx(h.x, h.y); hit.push(`<polygon class="tw-hit" data-tw-t="hex" data-id="${h.id}" points="${hexPoints(x, y, R - 1)}"/>`); });
  } else if (t.kind === "edge") {
    edges.forEach((e) => {
      const c = edgeEnds(e, verts); if (!c) return;
      const mx = (c[0] + c[2]) / 2; const my = (c[1] + c[3]) / 2;
      hit.push(`<line class="tw-hit" data-tw-t="edge" data-id="${e.id}" x1="${f1(mx + (c[0] - mx) * 0.62)}" y1="${f1(my + (c[1] - my) * 0.62)}" x2="${f1(mx + (c[2] - mx) * 0.62)}" y2="${f1(my + (c[3] - my) * 0.62)}" stroke-width="22"/>`);
    });
  }
  if (t.kind === "vertex" || t.alsoVertex) {
    vertices.forEach((v) => { const [x, y] = toPx(v.x, v.y); hit.push(`<circle class="tw-hit" data-tw-t="vertex" data-id="${v.id}" cx="${f1(x)}" cy="${f1(y)}" r="${t.kind === "vertex" ? 18 : 11}"/>`); });
  }
  out.push(`<g class="tw-hits">${hit.join("")}</g>`);
  return { viewBox: viewBox(board), markup: out.join("") };
}
