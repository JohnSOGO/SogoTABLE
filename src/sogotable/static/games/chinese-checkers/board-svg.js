// Chinese Checkers — board markup (one SVG for the whole star).
//
// Pure string builder over a prepared view model from render.js. Geometry is
// the PLAN.md pointy-top axial layout (x = √3(q + r/2), y = 1.5r), scaled so
// neighbouring holes are SP units apart and rotated in 60° steps so the
// viewer's home arm sits at the bottom (spectators: arm 0). Coordinates are
// rotated in JS (not with an SVG transform) so the marbles' light always falls
// from the top-left. It decides nothing: which holes are steps, hops, stops
// or movable marbles arrives in the model, already from the server.
import { ASSETS } from "./assets.js";

export const SP = 40; // viewBox units between neighbouring holes
const K = SP / Math.sqrt(3);
const ARM_ANGLE = (arm) => 90 + 60 * arm; // screen angle (y down) of each arm, unrotated
// Distance (in spacings) from centre to an arm tip hole: 12 / √3.
const TIP_D = 12 / Math.sqrt(3);
const EDGE_PAD = 0.42; // star edge beyond the outermost hole rows (spacings)
const STAR_STROKE = 0.62; // rounded-join stroke width (spacings)
const STAR_R = (TIP_D + 2 * EDGE_PAD) * SP; // star tip radius (polygon, before stroke)
const HALF_W = STAR_R * Math.cos(Math.PI / 6) + (STAR_STROKE / 2) * SP + 2;
const HALF_H = STAR_R + (STAR_STROKE / 2) * SP + 2;

export const VIEWBOX = { x: -HALF_W, y: -HALF_H, w: 2 * HALF_W, h: 2 * HALF_H };

// ---------- geometry ----------
export function parseKey(k) {
  const [q, r] = String(k).split(",").map(Number);
  return { q, r };
}

// Pixel position of hole `k` with the board rotated `rot` × 60° clockwise
// (rot = -viewerArm puts the viewer's arm at the bottom).
export function holeXY(k, rot = 0) {
  const { q, r } = parseKey(k);
  const x = K * Math.sqrt(3) * (q + r / 2);
  const y = K * 1.5 * r;
  return rotate(x, y, rot * 60);
}

function rotate(x, y, deg) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a); const s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}
const polar = (radius, deg) => ({ x: radius * Math.cos((deg * Math.PI) / 180), y: radius * Math.sin((deg * Math.PI) / 180) });
const fmt = (n) => (Math.round(n * 10) / 10).toString();
const pts = (list) => list.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(" ");

function starPoints() {
  const inner = STAR_R / Math.sqrt(3);
  const out = [];
  for (let i = 0; i < 6; i += 1) {
    out.push(polar(STAR_R, 90 + 60 * i));
    out.push(polar(inner, 120 + 60 * i));
  }
  return out;
}

// Half-plane wedge for arm `arm` (screen-rotated), clipped to the star later.
// Its base line sits midway between hexagon row 4 and arm row 5.
function armWedge(arm, rot) {
  const deg = ARM_ANGLE(arm) + rot * 60;
  const base = 3.9 * SP;
  const far = 12 * SP;
  const side = 12 * SP;
  const c = polar(base, deg); const f = polar(far, deg);
  const px = polar(side, deg + 90);
  return [
    { x: c.x + px.x, y: c.y + px.y }, { x: f.x + px.x, y: f.y + px.y },
    { x: f.x - px.x, y: f.y - px.y }, { x: c.x - px.x, y: c.y - px.y },
  ];
}

// Outline triangle around an arm's holes (for the viewer's goal).
function armTriangle(arm, rot, pad) {
  const deg = ARM_ANGLE(arm) + rot * 60;
  const tip = polar((TIP_D + 2 * pad) * SP, deg);
  // Depth-1 corner holes sit 4.33 spacings out and ±1.5 spacings sideways.
  const baseD = (4.33 - pad) * SP;
  const half = (1.5 + pad * Math.sqrt(3)) * SP;
  const b = polar(baseD, deg); const s = polar(half, deg + 90);
  return [tip, { x: b.x + s.x, y: b.y + s.y }, { x: b.x - s.x, y: b.y - s.y }];
}

// ---------- colour helpers ----------
function hexRgb(hex) {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(hex, toward, t) {
  const a = hexRgb(hex); const b = hexRgb(toward);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ---------- pieces ----------
// Glass gradients for one colour; ids ccM<id> (body) and ccC<id> (caustic).
export function marbleDefsFor(c, id) {
  const L = ASSETS.marbleLook;
  return `<radialGradient id="ccM${id}" cx="36%" cy="30%" r="78%" fx="32%" fy="26%">
      <stop offset="0" stop-color="${mix(c, "#ffffff", L.highlight)}"/>
      <stop offset=".28" stop-color="${mix(c, "#ffffff", L.core)}"/>
      <stop offset=".72" stop-color="${c}"/>
      <stop offset="1" stop-color="${mix(c, "#000000", L.edge)}"/>
    </radialGradient>
    <radialGradient id="ccC${id}" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${mix(c, "#ffffff", 0.7)}" stop-opacity=".85"/>
      <stop offset="1" stop-color="${mix(c, "#ffffff", 0.4)}" stop-opacity="0"/>
    </radialGradient>`;
}
const marbleDefs = (colors) => colors.map((c, i) => marbleDefsFor(c, i)).join("");

// One glass marble centred at (x, y). `ci` = gradient id suffix (marbleDefsFor).
export function marbleSvg(x, y, ci, color, opts = {}) {
  const R = ASSETS.marbleLook.radius * SP;
  const cls = opts.cls ? ` class="${opts.cls}"` : "";
  const extra = opts.attrs || "";
  const body = ASSETS.marble
    ? `<circle r="${fmt(R)}" fill="${color}"/><image href="${ASSETS.marble}" x="${fmt(-R)}" y="${fmt(-R)}" width="${fmt(2 * R)}" height="${fmt(2 * R)}"/>`
    : `<circle r="${fmt(R)}" fill="url(#ccM${ci})"/>
      <ellipse cx="${fmt(R * 0.2)}" cy="${fmt(R * 0.42)}" rx="${fmt(R * 0.46)}" ry="${fmt(R * 0.3)}" fill="url(#ccC${ci})"/>
      <ellipse cx="${fmt(-R * 0.34)}" cy="${fmt(-R * 0.4)}" rx="${fmt(R * 0.3)}" ry="${fmt(R * 0.19)}" transform="rotate(-35 ${fmt(-R * 0.34)} ${fmt(-R * 0.4)})" fill="url(#ccSpec)"/>
      <circle r="${fmt(R - 0.5)}" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1"/>`;
  return `<g transform="translate(${fmt(x)} ${fmt(y)})"${extra}><g${cls}>
      <ellipse cx="${fmt(R * 0.16)}" cy="${fmt(R * 0.3)}" rx="${fmt(R * 1.08)}" ry="${fmt(R * 0.95)}" fill="url(#ccShadow)"/>
      ${body}
    </g></g>`;
}

function arrowPath(points, cls) {
  if (points.length < 2) return "";
  let d = "";
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]; const b = points[i];
    const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
    const dx = b.x - a.x; const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // A gentle arc per hop (bulging left of travel) reads as "jump".
    const bend = Math.min(0.22 * len, 0.5 * SP);
    const cx = mx + (-dy / len) * bend; const cy = my + (dx / len) * bend;
    d += `M${fmt(a.x)} ${fmt(a.y)}Q${fmt(cx)} ${fmt(cy)} ${fmt(b.x)} ${fmt(b.y)}`;
  }
  return `<path class="${cls}" d="${d}" marker-end="url(#ccArrow)"/>`;
}

// ---------- the board ----------
// model: {
//   cells:[{k,q,r,arm}], marbles:{k:mark}, rot, palette, colorOf(mark)->hex,
//   armColor:{arm:hex}, goalArm:int|null, goalColor,
//   selected:k|null, selectedPlain:bool (assists off: outline, no glow), movable:[k], steps:[k], hops:[k], reach:[k], path:[k] (from first),
//   pathEnd:"stop"|"through"|null, ghostMark, committedPath:[k]|null, committedMark,
//   shake:Set<k> (bounced / cut marbles wobble)
// }
export function buildBoardSvg(m) {
  const pal = m.palette;
  const rot = m.rot || 0;
  const cells = Array.isArray(m.cells) ? m.cells : [];
  const xy = (k) => holeXY(k, rot);
  const marks = [...new Set(Object.values(m.marbles || {}).concat(m.ghostMark ? [m.ghostMark] : []))];
  const colors = [];
  const colorIndex = {};
  marks.forEach((mark) => {
    const c = m.colorOf(mark);
    if (!(c in colorIndex)) { colorIndex[c] = colors.length; colors.push(c); }
  });
  (m.extraColors || []).forEach((c) => { if (!(c in colorIndex)) { colorIndex[c] = colors.length; colors.push(c); } });
  const ciOf = (mark) => colorIndex[m.colorOf(mark)] || 0;
  const star = pts(starPoints());
  const HR = 0.3 * SP;

  let out = `<defs>
    <linearGradient id="ccWood" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${pal.woodLight}"/><stop offset=".55" stop-color="${pal.woodMid}"/><stop offset="1" stop-color="${pal.woodDark}"/>
    </linearGradient>
    <radialGradient id="ccSheen" cx="38%" cy="28%" r="70%">
      <stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <pattern id="ccGrain" width="${SP * 6}" height="${SP * 1.3}" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
      <path d="M0 ${SP * 0.3}q${SP * 1.5} ${-SP * 0.18} ${SP * 3} 0t${SP * 3} 0M0 ${SP * 0.85}q${SP * 1.5} ${SP * 0.14} ${SP * 3} 0t${SP * 3} 0" fill="none" stroke="${pal.woodGrain}" stroke-width="${SP * 0.09}"/>
      <path d="M0 ${SP * 1.1}q${SP * 2} ${-SP * 0.1} ${SP * 6} 0" fill="none" stroke="${pal.woodGrain}" stroke-width="${SP * 0.04}"/>
    </pattern>
    <radialGradient id="ccHole" cx="50%" cy="42%" r="60%">
      <stop offset="0" stop-color="${pal.holeDeep}"/><stop offset=".7" stop-color="${pal.holeMid}"/><stop offset="1" stop-color="${pal.holeMid}" stop-opacity=".6"/>
    </radialGradient>
    <radialGradient id="ccSpec" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#fff" stop-opacity="${ASSETS.marbleLook.specular}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ccShadow" cx="50%" cy="50%" r="50%">
      <stop offset=".45" stop-color="${pal.shadow}"/><stop offset="1" stop-color="${pal.shadow}" stop-opacity="0"/>
    </radialGradient>
    <filter id="ccDrop" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="${SP * 0.18}" stdDeviation="${SP * 0.22}" flood-color="#000" flood-opacity=".35"/></filter>
    <clipPath id="ccStarClip"><polygon points="${star}" stroke-width="${STAR_STROKE * SP}"/></clipPath>
    <marker id="ccArrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10z" fill="${pal.path}" stroke="${pal.pathEdge}" stroke-width="1"/>
    </marker>
    ${marbleDefs(colors)}
  </defs>`;

  // Wooden star (rounded by a same-colour round-join stroke) with grain + sheen.
  out += `<g filter="url(#ccDrop)"><polygon points="${star}" fill="${pal.woodRim}" stroke="${pal.woodRim}" stroke-width="${fmt((STAR_STROKE + 0.12) * SP)}" stroke-linejoin="round"/></g>`;
  out += `<polygon points="${star}" fill="url(#ccWood)" stroke="url(#ccWood)" stroke-width="${fmt(STAR_STROKE * SP)}" stroke-linejoin="round"/>`;
  if (ASSETS.board) {
    out += `<image href="${ASSETS.board}" x="${fmt(-STAR_R)}" y="${fmt(-STAR_R)}" width="${fmt(2 * STAR_R)}" height="${fmt(2 * STAR_R)}" transform="rotate(${rot * 60})" clip-path="url(#ccStarClip)" preserveAspectRatio="xMidYMid slice"/>`;
  }

  // Arm tints in seat colours (clipped to the star).
  out += `<g clip-path="url(#ccStarClip)">`;
  for (let arm = 0; arm < 6; arm += 1) {
    const c = m.armColor && m.armColor[arm];
    if (c) out += `<polygon points="${pts(armWedge(arm, rot))}" fill="${c}" fill-opacity="${pal.armTint}" stroke="${mix(c, "#000000", 0.35)}" stroke-opacity=".5" stroke-width="${fmt(SP * 0.06)}"/>`;
  }
  out += `</g>`;
  out += `<polygon points="${star}" fill="url(#ccGrain)" stroke="url(#ccGrain)" stroke-width="${fmt(STAR_STROKE * SP)}" stroke-linejoin="round"/>`;
  // Inlaid centre hexagon line + sheen.
  const hex = []; for (let i = 0; i < 6; i += 1) hex.push(polar(4.6 * SP, 120 + 60 * i));
  out += `<polygon points="${pts(hex)}" fill="none" stroke="${pal.inlayEdge}" stroke-width="${fmt(SP * 0.05)}" stroke-linejoin="round"/>`;
  out += `<polygon points="${star}" fill="url(#ccSheen)" stroke="url(#ccSheen)" stroke-width="${fmt(STAR_STROKE * SP)}" stroke-linejoin="round" pointer-events="none"/>`;

  // Etched lanes between neighbouring holes.
  const keySet = new Set(cells.map((c) => c.k));
  let lanes = "";
  cells.forEach((c) => {
    [[1, 0], [0, 1], [-1, 1]].forEach(([dq, dr]) => {
      const nk = `${c.q + dq},${c.r + dr}`;
      if (!keySet.has(nk)) return;
      const a = xy(c.k); const b = xy(nk);
      lanes += `M${fmt(a.x)} ${fmt(a.y)}L${fmt(b.x)} ${fmt(b.y)}`;
    });
  });
  out += `<path d="${lanes}" stroke="${pal.lines}" stroke-width="${fmt(SP * 0.06)}" stroke-linecap="round" fill="none"/>`;

  // Viewer's goal outline.
  if (Number.isInteger(m.goalArm) && m.goalArm >= 0) {
    out += `<polygon class="cc-goal" points="${pts(armTriangle(m.goalArm, rot, 0.5))}" fill="none" stroke="${m.goalColor || pal.goal}" stroke-width="${fmt(SP * 0.08)}" stroke-dasharray="${fmt(SP * 0.22)} ${fmt(SP * 0.16)}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }

  // Recessed holes.
  let holes = "";
  cells.forEach((c) => {
    const p = xy(c.k);
    holes += `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(HR)}" fill="url(#ccHole)"/>`;
    holes += `<path d="M${fmt(p.x - HR * 0.82)} ${fmt(p.y + HR * 0.4)}A${fmt(HR)} ${fmt(HR)} 0 0 0 ${fmt(p.x + HR * 0.82)} ${fmt(p.y + HR * 0.4)}" fill="none" stroke="${pal.holeRim}" stroke-width="${fmt(SP * 0.04)}" stroke-linecap="round"/>`;
  });
  out += `<g class="cc-holes">${holes}</g>`;

  // Committed move (own seat, after lock-in): a faint ghost path.
  if (Array.isArray(m.committedPath) && m.committedPath.length > 1) {
    out += arrowPath(m.committedPath.map(xy), "cc-path cc-path-locked");
    const end = xy(m.committedPath[m.committedPath.length - 1]);
    if (m.committedMark) out += marbleSvg(end.x, end.y, ciOf(m.committedMark), m.colorOf(m.committedMark), { cls: "cc-ghost" });
  }

  // Target rings on empty holes: dim = reachable stop, solid = step, pulsing = hop.
  const ring = (k, cls, r = 0.4) => { const p = xy(k); return `<circle class="${cls}" cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(r * SP)}"/>`; };
  out += `<g class="cc-rings">`;
  const strong = new Set([...(m.steps || []), ...(m.hops || [])]);
  (m.reach || []).forEach((k) => { if (!strong.has(k)) out += ring(k, "cc-ring-reach", 0.36); });
  (m.steps || []).forEach((k) => { out += ring(k, "cc-ring-step"); });
  (m.hops || []).forEach((k) => { out += ring(k, "cc-ring-hop"); });
  out += `</g>`;

  // Movable-marble glow (under marbles) + selected ring.
  (m.movable || []).forEach((k) => { if (k !== m.selected) out += ring(k, "cc-movable", 0.5); });

  // Marbles.
  const shake = m.shake || new Set();
  let marbles = "";
  const pathStart = m.path && m.path.length > 1 ? m.path[0] : null;
  Object.entries(m.marbles || {}).forEach(([k, mark]) => {
    const p = xy(k);
    const cls = ["cc-marble", shake.has(k) ? "cc-shake" : "", k === pathStart ? "cc-lifted" : ""].filter(Boolean).join(" ");
    marbles += marbleSvg(p.x, p.y, ciOf(mark), m.colorOf(mark), { cls, attrs: ` data-k="${k}"` });
  });
  out += `<g class="cc-marbles">${marbles}</g>`;
  if (m.selected) out += ring(m.selected, m.selectedPlain ? "cc-ring-plain" : "cc-ring-selected", 0.5);

  // Planned path + ghost marble at its end.
  if (Array.isArray(m.path) && m.path.length > 1) {
    const points = m.path.map(xy);
    out += arrowPath(points, "cc-path");
    m.path.slice(1, -1).forEach((k) => { out += ring(k, "cc-path-node", 0.16); });
    const end = points[points.length - 1];
    if (m.ghostMark) {
      out += marbleSvg(end.x, end.y, ciOf(m.ghostMark), m.colorOf(m.ghostMark), { cls: `cc-ghost${m.pathEnd === "through" ? " cc-ghost-through" : ""}` });
    }
    out += ring(m.path[m.path.length - 1], m.pathEnd === "stop" ? "cc-ring-end" : "cc-ring-through", 0.5);
  }
  out += `<g class="cc-anim"></g>`;
  return out;
}
