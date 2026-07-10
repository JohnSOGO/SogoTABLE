// The Mystic Wood — shared pure builders used by BOTH the board renderer (render.js) and the
// encounter/result modals (encounter.js): HTML escaping, denizen emoji, log sanitising, the reaction-
// table folder, tile lookup, and the SVG tile art. No DOM writes, no ctx, no transport — pure functions
// over the ctx.game projection and content.js data. Living here (not in render.js) lets encounter.js
// reuse them without importing render.js, so the two modules never form an import cycle.
import { DEN, DEN_EMOJI, THINGS } from "./content.js";

export const E = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
export const denEmoji = (id) => DEN_EMOJI[id] || (DEN[id] ? { beast: "🐾", warrior: "⚔️", magic: "✨", greet: "❓", companion: "🤝", special: "❓" }[DEN[id].cls] : "❓");

// log text may contain the game's own <b>/<span class='g'>… markup — allow a safe subset.
export function sanitizeLog(t) {
  return String(t == null ? "" : t).replace(/<(?!\/?(b|br|small|span)( class='(g|r|a|muted)')?\s*\/?>)/g, "&lt;");
}

export function tileAt(game, r, c) { return (r >= 0 && r < 9 && c >= 0 && c < 7) ? game.board[r * 7 + c] : null; }

// The Horse bolts one glade that way if a road leads there; walled in, it is caught.
const RUN_WORD = { N: "north", S: "south", E: "east", W: "west" };
const ACT_LABEL = (a) => a === "remains" ? "remains / ignores you" : a === "transport" ? "vanishes to the far wood" : a === "transportYou" ? "transports you away" : a === "befriend" ? "befriends you" : a === "tower" ? "betrays you → Tower" : a && a.startsWith("give:") ? "gives " + THINGS[a.slice(5)].name : a && a.startsWith("run") ? `bolts ${RUN_WORD[a.slice(3)]} (no road → you catch it)` : (a || "remains");
export function tblRows(tbl) {
  if (!tbl) return null;
  const a = []; for (let i = 1; i <= 6; i += 1) a.push(tbl[i] || "remains");
  const res = []; let i = 0;
  while (i < 6) { let j = i; while (j + 1 < 6 && a[j + 1] === a[i]) j++; res.push({ range: (i === j ? `${i + 1}` : `${i + 1}–${j + 1}`), effect: ACT_LABEL(a[i]) }); i = j + 1; }
  return res;
}

/* ------------------------------ tile art -------------------------------- */
// Ink, medallion, and a distinct hue per place — the hue tells you *what* the place is
// before you can read its name; the ink keeps every emblem readable on either theme.
const INK = "#14150e", PARCHMENT = "#f0e6cd";
const AREA_COLOR = {
  tower: "#8b93a3", egate: "#8a6a3c", xgate: "#9a6fd0", cave: "#5f4c39", chapel: "#b3aa93",
  castle: "#c9564c", fountain: "#4f9fd8", grove: "#4f9a52", island: "#3fa6a0",
  palace: "#d8a93f", altar: "#d97b3f",
};
function drawIcon(name, col) {
  const c = col || AREA_COLOR.grove;
  const P = (d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  const F = (d, f) => `<path d="${d}" fill="${f || c}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`;
  const C = (cx, cy, r, f, sw) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f || "none"}" stroke="${INK}" stroke-width="${sw || 1.8}"/>`;
  const map = {
    tower: () => F("M42 48 v-22 h4 v-4 h3 v4 h2 v-4 h3 v4 h4 v22 z"),
    egate: () => F("M36 48 v-13 a14 14 0 0 1 28 0 v13 z") + P("M50 22 l5 5 l-5 5 l-5 -5 z"),
    xgate: () => F("M36 48 v-13 a14 14 0 0 1 28 0 v13 z") + P("M50 20 l6 6 l-6 6 l-6 -6 z") + C(50, 32, 3, "var(--gold)"),
    cave: () => F("M33 47 q4 -21 17 -21 q13 0 17 21 z") + F("M44 47 q2 -10 6 -10 q4 0 6 10 z", "#12120c"),
    chapel: () => F("M50 18 l13 13 v16 h-26 v-16 z") + C(50, 33, 4, "none", 2.2),
    // Walk right 7x4 units, then close with the matching h-28 — a mismatched return leaves the wall slanted.
    castle: () => F("M35 31 h4 v-4 h4 v4 h4 v-4 h4 v4 h4 v-4 h4 v4 h4 v15 h-28 z"),
    fountain: () => F("M37 46 h26 l-3 -8 h-20 z") + P("M50 38 v-8") + C(50, 24, 3),
    grove: () => P("M50 48 v-12") + F("M50 18 q13 4 11 15 q-11 6 -22 0 q-2 -11 11 -15 z"),
    island: () => F("M40 40 q10 -12 20 0 z") + P("M31 44 q19 7 38 0"),
    palace: () => F("M39 47 v-17 l11 -8 l11 8 v17 z") + F("M50 14 l4 8 h-8 z", "var(--gold)"),
    altar: () => F("M44 43 v-13 h12 v13 z") + F("M41 47 h18 v-4 h-18 z", "var(--gold)"),
  };
  return (map[name] || map.grove)();
}
// Faithful tile art: terrain, roads to open edges (over a darker lining), closed-edge semicircle,
// grass tufts, named-glade backdrop + emblem, and the gold north triangle.
export function tileSvg(t, seed) {
  const half = t.half === "ench" ? "ench" : "earth";
  const H1 = `var(--${half}-h1)`, H2 = `var(--${half}-h2)`, H3 = `var(--${half}-h3)`, PP = `var(--${half}-road)`, LF = `var(--${half}-leaf)`;
  let s = seed || 1; const rr = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const ends = { N: [50, 0], E: [100, 36], S: [50, 72], W: [0, 36] };
  const open = t.open || { N: 1, E: 1, S: 1, W: 1 };
  const ok = ["N", "E", "S", "W"].filter((k) => open[k]);
  let g = `<svg viewBox="0 0 100 72"><rect x="0" y="0" width="100" height="72" fill="${H2}"/>`;
  for (let i = 0; i < 3; i += 1) g += `<ellipse cx="${(10 + rr() * 80).toFixed(1)}" cy="${(8 + rr() * 56).toFixed(1)}" rx="${(12 + rr() * 16).toFixed(1)}" ry="${(8 + rr() * 10).toFixed(1)}" fill="${H1}" opacity="${(0.14 + rr() * 0.14).toFixed(2)}"/>`;
  ok.forEach((k) => { const [x, y] = ends[k]; g += `<line x1="50" y1="36" x2="${x}" y2="${y}" stroke="${H3}" stroke-width="22" stroke-linecap="round" opacity="0.8"/>`; });
  ok.forEach((k) => { const [x, y] = ends[k]; g += `<line x1="50" y1="36" x2="${x}" y2="${y}" stroke="${PP}" stroke-width="15" stroke-linecap="round"/>`; });
  if (ok.length) g += `<circle cx="50" cy="36" r="9" fill="${PP}"/>`;
  if (ok.length) { const R = 8; ["N", "E", "S", "W"].filter((k) => !open[k]).forEach((k) => {
    let d; if (k === "N") d = `M${50 - R} 0 Q 50 ${R * 1.4} ${50 + R} 0 Z`;
    else if (k === "S") d = `M${50 - R} 72 Q 50 ${72 - R * 1.4} ${50 + R} 72 Z`;
    else if (k === "E") d = `M100 ${36 - R} Q ${100 - R * 1.4} 36 100 ${36 + R} Z`;
    else d = `M0 ${36 - R} Q ${R * 1.4} 36 0 ${36 + R} Z`;
    g += `<path d="${d}" fill="${PP}" opacity="0.85"/>`; }); }
  for (let i = 0; i < 10; i += 1) { const x = 4 + rr() * 92, y = 4 + rr() * 64; if (Math.abs(x - 50) < 13 || Math.abs(y - 36) < 11) continue; const hh = 3 + rr() * 3;
    g += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l -1.4 ${(-hh * 0.8).toFixed(1)} M${x.toFixed(1)} ${y.toFixed(1)} l 0 ${(-hh).toFixed(1)} M${x.toFixed(1)} ${y.toFixed(1)} l 1.4 ${(-hh * 0.8).toFixed(1)}" fill="none" stroke="${rr() < 0.5 ? LF : H1}" stroke-width="0.9" stroke-linecap="round" opacity="0.9"/>`; }
  if (t.name) {
    const col = AREA_COLOR[t.name] || AREA_COLOR.grove;
    // A named place is the thing players hunt for, so it gets a bright parchment medallion,
    // an ink rim, and an emblem inked in black over its own colour — legible at any zoom.
    g += `<ellipse cx="50" cy="36" rx="24" ry="17" fill="${INK}" opacity="0.35"/>`
      + `<ellipse cx="50" cy="36" rx="23" ry="16" fill="${PARCHMENT}" stroke="${INK}" stroke-width="1.6"/>`
      + `<ellipse cx="50" cy="36" rx="23" ry="16" fill="${col}" opacity="0.28"/>`
      + drawIcon(t.name, col)
      + `<rect x="26" y="2" width="48" height="11" rx="3" fill="${PARCHMENT}" stroke="${INK}" stroke-width="1"/>`
      + `<rect x="28" y="10.2" width="44" height="2.2" rx="1.1" fill="${col}"/>`
      + `<text x="50" y="9.6" text-anchor="middle" font-family="var(--serif)" font-size="8" font-weight="600" fill="${INK}">${E(t.label || t.name)}</text>`;
  }
  g += `<path d="M9 4 l3 5 h-6 Z" fill="var(--gold)" opacity="0.85"/></svg>`;
  return g;
}
