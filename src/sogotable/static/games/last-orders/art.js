// Last Orders — original procedural art (pure SVG string builders).
//
// Hand-built layered-shape portraits for every patron, effect icons for hand
// cards, drink illustrations, card/drink backs, the table texture and the
// small stat icons. Every function returns an SVG markup string; nothing here
// touches the DOM or the network, and nothing here knows a rule.
//
// Re-skin: frame/table/icon colours come from assets.js (`paletteFor(theme)`),
// and any key set in ASSETS.portraits / cards / drinks / cardBack / drinkBack /
// tableBg replaces the procedural art with that image. Gradient and clip ids
// are unique per call (module counter + optional `idPrefix`), so any number of
// pieces can share one page.
import { ASSETS, paletteFor } from "./assets.js";

// ---------- small helpers ----------
let SEQ = 0;
const nextId = (prefix = "lo") => `${prefix}${(SEQ += 1).toString(36)}`;
function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seeded(seedText) {
  let a = hashString(seedText) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function esc(text) { return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
const f1 = (n) => (Math.round(n * 10) / 10).toString();
function rgb(hex) {
  const h = String(hex).replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
}
function mix(a, b, t) {
  const x = rgb(a); const y = rgb(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}
const lighten = (c, t) => mix(c, "#ffffff", t);
const darken = (c, t) => mix(c, "#000000", t);
function hslHex(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}
const hashColor = (seed, s = 0.55, l = 0.55) => hslHex(hashString(String(seed)) % 360, s, l);

// Outline colour for the current drawing (set at the top of every export —
// builders are synchronous, so this never leaks between calls).
let INK = "#3b2a1f";
const SW = 1.6;
const stroke = (sw = SW) => (sw === 0 ? "" : ` stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`);
const P_ = (d, fill, sw = SW, extra = "") => `<path d="${d}" fill="${fill}"${stroke(sw)}${extra ? ` ${extra}` : ""}/>`;
const C_ = (cx, cy, r, fill, sw = SW, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${stroke(sw)}${extra ? ` ${extra}` : ""}/>`;
const E_ = (cx, cy, rx, ry, fill, sw = SW, extra = "") => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${stroke(sw)}${extra ? ` ${extra}` : ""}/>`;
const R_ = (x, y, w, h, rx, fill, sw = SW, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${stroke(sw)}${extra ? ` ${extra}` : ""}/>`;
const L_ = (d, sw = SW, color = INK, extra = "") => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${extra ? ` ${extra}` : ""}/>`;
const mir = (s) => `<g transform="matrix(-1 0 0 1 100 0)">${s}</g>`;
const both = (s) => s + mir(s);
const G_ = (transform, s) => `<g transform="${transform}">${s}</g>`;
const star4 = (x, y, r, fill) => P_(`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`, fill, 0.8);
function starPoly(cx, cy, outer, inner, points) {
  const pts = [];
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 ? inner : outer; const a = (Math.PI * i) / points - Math.PI / 2;
    pts.push(`${f1(cx + r * Math.cos(a))} ${f1(cy + r * Math.sin(a))}`);
  }
  return `M${pts.join("L")}Z`;
}
// Face bits shared by several patrons.
const dotEyes = (x1, x2, y, r = 2.2) => [x1, x2].map((x) => C_(x, y, r, INK, 0) + C_(f1(x + r * 0.35), f1(y - r * 0.4), f1(r * 0.4), "#fff", 0)).join("");
const arcEyes = (x1, x2, y, w = 4, up = true) => [x1, x2].map((x) => L_(`M${x - w} ${y}Q${x} ${up ? y - w : y + w * 0.8} ${x + w} ${y}`, 1.8)).join("");
const blush = (x1, x2, y, rx, color, op = 0.5) => [x1, x2].map((x) => E_(x, y, rx, rx * 0.65, color, 0, `opacity="${op}"`)).join("");

function svgWrap(inner, { size, label, viewBox = "0 0 100 100", extra = "" } = {}) {
  const dims = size ? ` width="${size}" height="${Math.round(size * (Number(viewBox.split(" ")[3]) / Number(viewBox.split(" ")[2])))}"` : "";
  const aria = label ? ` role="img" aria-label="${esc(label)}"` : ` aria-hidden="true"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${dims}${aria}${extra}>${inner}</svg>`;
}
function imageSvg(url, { size, label, viewBox = "0 0 100 100", rx = 16 } = {}) {
  const [, , w, h] = viewBox.split(" ").map(Number);
  const id = nextId("loi");
  return svgWrap(`<defs><clipPath id="${id}"><rect width="${w}" height="${h}" rx="${rx}"/></clipPath></defs><image href="${esc(url)}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`, { size, label, viewBox });
}
const paletteOf = (opts = {}) => opts.palette || paletteFor(opts.theme);

/** Wrap an SVG string as a `data:` URL (for CSS backgrounds or <img src>). */
export function svgDataUrl(svg) { return `data:image/svg+xml,${encodeURIComponent(svg)}`; }

// =====================================================================
// Portraits (100×100 bust, drawn back to front)
// =====================================================================
const MOUTH = "#7a2e24";

function gorrum() {
  const skin = "#d99a6c"; const sh = "#b87a50"; const vest = "#6e4a2c";
  return [
    P_("M-4 104C-2 80 14 70 50 69C86 70 102 80 104 104Z", "#dcc79c"), P_("M-4 104C-2 80 14 70 37 69L50 93L63 69C86 70 102 80 104 104Z", vest),
    [[18, 84], [22, 95], [82, 84], [78, 95]].map(([x, y]) => C_(x, y, 1.7, "#e8c060", 1)).join(""), P_("M35 54L35 72Q50 79 65 72L65 54Z", sh),
    both(E_(24.5, 42, 4.5, 6.5, skin) + L_("M24 39Q22 42 24.5 45", 1.1, sh)),
    P_("M25 40C25 18 38 11 50 11C62 11 75 18 75 40C75 57 66 66 50 66C34 66 25 57 25 40Z", skin),
    E_(40, 19, 7, 3, "#fff", 0, `opacity=".45" transform="rotate(-18 40 19)"`),
    P_("M29 47C31 61 41 66 50 66C59 66 69 61 71 47C66 57 59 60 50 60C41 60 34 57 29 47Z", sh, 0, `opacity=".4"`),
    L_("M31.5 35Q39.5 29.5 47 33.5", 3.8), L_("M53 33.5Q60.5 29.5 68.5 35", 3.8), dotEyes(40.5, 59.5, 39.5, 2.1),
    L_("M63 27.5L67.5 36", 1.3, "#9a5a3a"), L_("M64 30.5L67.5 30M64.8 33.3L68.2 32.8", 1, "#9a5a3a"),
    P_("M48 36Q53.5 40.5 52.5 45Q58.5 48.5 53.5 52.5Q48.5 55.5 44.5 51.5Q42.5 48 46.8 46Q47.3 41 48 36Z", mix(skin, sh, 0.55)),
    G_("rotate(-24 50 40)", R_(43.5, 38.2, 13, 4.4, 1.2, "#f3e6c8", 1.1) + C_(48, 40.4, 0.5, "#c9b48a", 0) + C_(52, 40.4, 0.5, "#c9b48a", 0)),
    P_("M38.5 56Q50 62.5 61.5 56Q50 59.5 38.5 56Z", MOUTH, 1.4), R_(46.2, 56.9, 3.4, 2.6, 0.5, "#fff", 0.8),
    // the tankard, raised in a fist
    L_("M68.5 71C59 70 59 86 68.5 86", 3.6, INK), L_("M68.5 71C59 70 59 86 68.5 86", 1.6, "#8a5a34"),
    R_(68, 63, 22, 30, 3, "#a5683a"), L_("M74.5 64V92M81 64V92", 1, "#7a4a26"),
    R_(67, 67, 24, 3.4, 1, "#b8bec2", 1.1), R_(67, 86, 24, 3.4, 1, "#b8bec2", 1.1),
    P_("M66 66C63.5 60 70 56.5 73.5 59C75 53.5 82.5 54 84 58.5C89 56 93.5 61.5 90.5 66C88 68 86 66.5 85 70C84 72.5 82 72 81.5 68.5C79 67.5 70 68.5 66 66Z", "#fffaf0", 1.4),
    P_("M58 76C56 72 60 70 63 71L67 72C70 73 70 77 67.5 78C70 79 70 83 67 84L62 85C58 85 56.5 81 58 76Z", skin, 1.4),
    L_("M60.5 75.5L66 76M60 80L66.5 80.5", 1, sh),
  ].join("");
}

function tilly() {
  const skin = "#f2c29b"; const hood = "#5b3a6e"; const hair = "#b4562a";
  return [
    P_("M8 104C10 82 26 72 50 72C74 72 90 82 92 104Z", hood),
    P_("M18 88C11 62 18 31 44 18C52 10 64 6 76 9C67 12 62 16 63 21C81 31 89 60 82 88C74 79 62 75 50 75C38 75 26 79 18 88Z", hood),
    L_("M70 10.5C66 13 64 17 64.5 21", 1, lighten(hood, 0.25)),
    P_("M28 57C28 37 38 27 50 27C62 27 72 37 72 57C72 70 62 77 50 77C38 77 28 70 28 57Z", "#34203f", 0), E_(50, 54, 16, 17, skin),
    [[37, 41, 5], [43, 37.5, 5.5], [50.5, 36.5, 5.5], [57.5, 38, 5], [63, 42, 4.2]].map(([x, y, r]) => C_(x, y, r, hair, 1.3)).join(""),
    L_("M45 36Q47 39 45.5 41M56 37Q57.5 40 56 42", 0.9, darken(hair, 0.3)),
    L_("M38.5 45.5Q42.5 41 47 44.5", 1.9), L_("M54 47.5Q58 46.2 62.5 48.5", 1.9), C_(43, 50, 2.3, INK, 0), C_(43.8, 49.1, 0.9, "#fff", 0),
    L_("M54 51.5Q58 48.3 62 51.5", 1.9),
    [[38, 56], [40.5, 57.5], [37.5, 58.8], [61, 56.5], [63.5, 57.8], [60.5, 59]].map(([x, y]) => C_(x, y, 0.6, "#b86e4a", 0)).join(""),
    blush(39, 61, 57, 3.5, "#f08a7a", 0.45), L_("M50 53Q52.5 56.5 49 57.5", 1.3),
    P_("M42 61Q52 67.5 60.5 58.5Q53.5 63 42 61Z", MOUTH, 1.4), P_("M52.5 62.2L54.3 64.6L56 61.6Z", "#fff", 0.6),
    P_("M46 80Q50 76 54 80Q50 84 46 80Z", "#e8c060", 1.1),
    // the coin, mid-flip above a thumb
    L_("M77 77C81 72 82 68 79 63", 0.9, INK, `stroke-dasharray="1.6 2.2" opacity=".6"`),
    P_("M71 86C70 81 73 78 77 78.5L81 79C84 80 84 84 81.5 85C83 86.5 82 89.5 79 89.5L74 89.5C72 89.5 71 88 71 86Z", skin, 1.3),
    L_("M76.5 78.5L78.5 73.5", 2.6, INK), L_("M76.5 78.5L78.5 73.5", 1.2, skin),
    G_("rotate(-20 80 58)", E_(80, 58, 5, 7.5, "#f4c34a", 1.4) + E_(80, 58, 2.8, 4.8, "none", 0.9)),
    L_("M86 50L88.5 47.5M88 56H91.5M72 50.5L70 48", 1.1, "#e8a83a"),
  ].join("");
}

function ansel() {
  const skin = "#f2c6a0"; const robe = "#5f8a3e"; const robeD = "#476d2e"; const hair = "#7a5230";
  const cone = (x, y, r = 1) => G_(`translate(${x} ${y}) scale(${r})`, P_("M0 -8C6 -5 6 4 0 8C-6 4 -6 -5 0 -8Z", "#bcd982", 1.2) + L_("M-4 -2.5L0 0.3L4 -2.5M-4.2 2.5L0 5.2L4.2 2.5M-2.6 -6L0 -4.6L2.6 -6", 0.9, "#6f8f3a"));
  return [
    P_("M4 104C6 78 26 68 50 68C74 68 94 78 96 104Z", robe), L_("M50 76C46 86 44 94 43 104", 2.2, "#d8c08a"), C_(46.5, 85, 2.2, "#d8c08a", 1),
    P_("M22 76C28 64 72 64 78 76C70 82 30 82 22 76Z", robeD), both(E_(27.5, 48, 4.2, 6, skin)), C_(50, 46, 23, skin),
    E_(43, 29, 6, 2.6, "#fff", 0, `opacity=".55" transform="rotate(-14 43 29)"`),
    both(P_("M27.6 52C25 40 28.5 34.5 33 33C31.5 39 31.5 45 32.5 51Z", hair, 1.2)),
    P_("M30 39C35 30.5 65 30.5 70 39C64 35.5 36 35.5 30 39Z", hair, 1.2), L_("M36.5 41Q41 39 45 41M55 41Q59 39 63.5 41", 1.5),
    arcEyes(41, 59, 47, 3.8), blush(35.5, 64.5, 53.5, 5, "#ef8a78", 0.55), C_(50, 51, 3.4, mix(skin, "#d08a66", 0.5), 1.3),
    P_("M40 56.5Q50 67 60 56.5Q50 60.5 40 56.5Z", MOUTH, 1.4), P_("M45.5 61.5Q50 63.8 54.5 61.5Q50 59.8 45.5 61.5Z", "#e66a6a", 0),
    L_("M40 66Q50 71.5 60 66", 1.2, "#c98a68"),
    // a fresh hop sprig
    L_("M66 98C70 90 74 84 80 78", 1.8, "#5d7a2a"),
    P_("M78 82C84 78 90 80 92 84C86 88 80 87 78 82Z", "#5f9a34", 1.2), L_("M79 82.5Q85 82.8 91 84", 0.8, "#3f6a22"),
    cone(80, 70), cone(71, 76, 0.85), cone(86.5, 63.5, 0.7),
    P_("M60 100C59 94 62 90 67 90.5L72 91.5C75 92.5 75 96 72 97C74 98 73.5 101 70.5 101L64 101C62 101 60.5 101 60 100Z", skin, 1.3),
  ].join("");
}

function zephyrine() {
  const skin = "#f7e0d4"; const hair = "#b4e1f4"; const hairD = "#86c2e2"; const shawl = "#2d336e"; const gold = "#f6d36b";
  const eye = (x) => E_(x, 45, 3.4, 2.5, "#fff", 1.2) + C_(x + 0.3, 45.3, 1.9, "#7b5cc9", 0) + C_(x + 0.3, 45.3, 0.9, INK, 0) + C_(x + 1, 44.5, 0.6, "#fff", 0);
  return [
    P_("M19 97C9 70 13 28 50 15C87 28 91 70 81 97C72 90 68 74 66 56L34 56C32 74 28 90 19 97Z", hairD),
    L_("M24 84C20 70 20 52 26 38M76 84C80 70 80 52 74 38", 1, lighten(hairD, 0.35)), P_("M6 104C10 80 28 70 50 72C72 70 90 80 94 104Z", shawl),
    [[18, 92], [28, 82], [38, 96], [62, 90], [72, 80], [84, 94], [50, 100]].map(([x, y], i) => (i % 2 ? C_(x, y, 1.1, gold, 0) : star4(x, y, 2.6, gold))).join(""),
    P_("M44 58L44 74Q50 77 56 74L56 58Z", "#e8c7b8"), both(P_("M36 45L11 28Q17 44 35 54Z", skin, 1.4) + L_("M33 47L17 33.5", 0.9, "#e0b3a4")),
    P_("M36 42C36 29 42 24 50 24C58 24 64 29 64 42C64 55 57 64 50 64C43 64 36 55 36 42Z", skin),
    P_("M33.5 47C29 26 44 15 57 18C69 21 71 34 66 45C63 35 57 29 48 31C42 34 37.5 40 33.5 47Z", hair),
    P_("M64 35C71 48 71 63 66 76C64 64 62 51 59.5 41Z", hair, 1.3),
    L_("M47 22.5C42 25 38 31 36.5 38M58 21C63 24 66 29 66.5 34", 0.9, "#fff", `opacity=".7"`),
    L_("M38.5 40Q43 37.5 47 39.5M53 39.5Q57 37.5 61.5 40", 1.2),
    eye(43), eye(57), L_("M39.5 43.6L38 42M40.8 42.8L39.8 41M60.5 43.6L62 42M59.2 42.8L60.2 41", 0.9), blush(40, 60, 52, 3.2, "#d9a0d6", 0.55),
    L_("M50 47.5L49 52.5L50.8 53", 1), L_("M46 56.5Q50 59 54 56.5", 1.5),
    P_("M46 80C46 76 50 74 53 75C50 76 49 79 50.5 82C49 83 46 82 46 80Z", gold, 1),
    star4(21, 20, 4.5, gold), star4(81, 16, 3.5, gold), star4(86, 46, 2.6, "#fff7c7"), star4(14, 52, 2.4, "#fff7c7"), C_(76, 28, 1, gold, 0),
  ].join("");
}

function marrow() {
  const skin = "#c98d62"; const beard = "#c3c3bc"; const beardD = "#8f8f88"; const coat = "#2c3b5c"; const trim = "#e2b35a";
  return [
    P_("M2 104C4 80 20 70 50 70C80 70 96 80 98 104Z", coat),
    [[40, 92], [60, 92], [40, 100], [60, 100]].map(([x, y]) => C_(x, y, 1.6, trim, 1)).join(""),
    both(P_("M5 86C9 78 18 74 27 74L29 79C21 79 13 82 9 89Z", trim, 1.3) + L_("M9 89L8 93M12.5 84.8L12 89M16.5 82L16.5 86M21 80.3L21.4 84", 1.1, "#b8862a")),
    both(E_(27.5, 47, 4, 6, skin)), P_("M29 45C29 27 38 21 50 21C62 21 71 27 71 45C71 59 62 67 50 67C38 67 29 59 29 45Z", skin),
    L_("M33 44.5L30 43M33.5 47L30.5 47.5M67 44.5L70 43M66.5 47L69.5 47.5", 0.9, "#9a6440"),
    P_("M27.5 46C23 60 27 79 38 87C44 93 56 93 62 87C73 79 77 60 72.5 46C68 54 62 57.5 50 57.5C38 57.5 32 54 27.5 46Z", beard),
    L_("M35 66Q38 70 36 74M44 72Q47 76 45 80M56 72Q53 76 55 80M65 66Q62 70 64 74M50 80Q52 84 50 88", 1.1, beardD),
    blush(37.5, 62.5, 52, 4, "#d9604a", 0.4), E_(50, 50, 5, 4.2, mix(skin, "#9a5a3a", 0.35), 1.4),
    P_("M50 55C44 51 36 53 33.5 59C39.5 56.5 46 58.5 50 57.5C54 58.5 60.5 56.5 66.5 59C64 53 56 51 50 55Z", "#dcdcd5", 1.3),
    L_("M37.5 44.5Q41 42.5 44.5 44.5M55.5 44.5Q59 42.5 62.5 44.5", 1.8),
    P_("M33.5 40.5Q40 35 47.5 39Q41 38.5 34.5 42.5Z", beard, 1.2), P_("M66.5 40.5Q60 35 52.5 39Q59 38.5 65.5 42.5Z", beard, 1.2),
    // pipe and a lazy curl of smoke
    L_("M59 59.5L72 64.5", 3, INK), L_("M59 59.5L72 64.5", 1.4, "#6b4226"),
    P_("M70.5 58.5L80 58.5L79 68Q75.5 71.5 72 68Z", "#7a4a26", 1.4), E_(75.2, 58.6, 4.7, 1.3, "#3a2416", 0.9),
    L_("M76 55C72 49 80 45 76 39C72.5 34 79 30 77 24", 1.6, "#d8d4cc", `opacity=".85"`),
    // tricorn
    P_("M11 37C17 29 29 22 36 22C38 11 62 11 64 22C71 22 83 29 89 37C77 32.5 64 32.5 50 39C36 32.5 23 32.5 11 37Z", "#2a2520"),
    L_("M11.5 36.5C24 32 36 32 50 38.5C64 32 76 32 88.5 36.5", 1.8, trim), C_(50, 29, 3.2, "#b8322d", 1.1), C_(50, 29, 1.2, trim, 0),
  ].join("");
}

function nessa() {
  const skin = "#b67652"; const hair = "#2fa597"; const hairD = "#1d7c71"; const dress = "#ef8a6c"; const shell = "#f7c9c2";
  const note = (x, y, s = 1) => G_(`translate(${x} ${y}) scale(${s})`, E_(0, 0, 2.8, 2.1, hairD, 0.9, `transform="rotate(-20)"`) + L_("M2.4 -0.6V-10L7 -8", 1.4, hairD));
  return [
    P_("M15 92C6 77 15 66 11 54C7 40 17 22 34 18C42 12 58 12 66 18C83 22 93 40 89 54C85 66 94 77 85 92C76 87 70 75 66 60L34 60C30 75 24 87 15 92Z", hairD),
    P_("M8 104C12 82 28 74 50 74C72 74 88 82 92 104Z", dress), P_("M30 80C36 86 44 84 50 88C56 84 64 86 70 80", "none", 1.2),
    P_("M44 58L44 76Q50 79 56 76L56 58Z", darken(skin, 0.12)),
    [32, 37, 43.5, 50, 56.5, 63, 68].map((x, i) => C_(x, 77 + [0, 2.6, 4.2, 4.8, 4.2, 2.6, 0][i], 1.6, "#fbf5ea", 0.8)).join(""),
    P_("M35 44C35 30 42 26 50 26C58 26 65 30 65 44C65 56 58 64 50 64C42 64 35 56 35 44Z", skin),
    P_("M33.5 48C29 33 38 21 50 21C62 21 71 33 66.5 48C65 40 61 33 52 32C47 38 41 41 33.5 48Z", hair),
    both(P_("M35 39C26 49 33 60 26 73C35 71 39 58 36.5 46Z", hair, 1.3)), L_("M42 25C38 28 36 33 35.5 38M58 24.5C63 27 66 32 66 37", 1, "#8fe0d4"),
    G_("translate(31 27) rotate(-25)", P_("M0 5L-6.5 -2C-5 -7 5 -7 6.5 -2Z", shell, 1.2) + L_("M0 5L-3.5 -4.5M0 5V-5.5M0 5L3.5 -4.5", 0.8, "#d38f86")),
    P_(starPoly(69, 31, 5, 2.2, 5), "#f4a45a", 1.1), L_("M38.5 41Q42.5 38.5 46.5 40.5M53.5 40.5Q57.5 38.5 61.5 41", 1.4),
    arcEyes(42.5, 57.5, 45, 3.6, false), L_("M39.2 46.4L38 47.6M60.8 46.4L62 47.6", 0.9), blush(39, 61, 52, 3.6, "#e87a6a", 0.5),
    L_("M50 47L48.8 51.5L50.8 52", 1.1), E_(50, 57, 3, 3.6, "#6a2420", 1.3), E_(50, 58.6, 1.8, 1.3, "#e66a6a", 0), C_(35.5, 50, 1.4, "#fbf5ea", 0.8),
    note(80, 22, 1.05), note(87, 40, 0.8), note(16, 64, 0.75),
    // conch held at the shoulder
    P_("M62 92C59 80 70 70 84 72C94 74 96 84 90 91C83 97 68 98 62 92Z", "#f3dcbc"),
    P_("M64 90C70 86 76 86 82 90C76 93 70 93 64 90Z", "#f0a4a0", 1), L_("M71 80C76 76 84 76 87 81C89 85 85 88 81 86", 1, "#b98a5e"),
    P_("M84 72L90 66L88 74Z", "#f3dcbc", 1.1),
  ].join("");
}

function hrolga() {
  const skin = "#eeb48f"; const beard = "#c9502a"; const beardD = "#953518"; const fur = "#efe6d4"; const tunic = "#3d6a8f";
  const braid = (x) => [0, 1, 2, 3, 4].map((i) => E_(f1(x - i * 0.7), 70 + i * 5.6, 4.6 - i * 0.25, 3.5, beard, 1.2)).join("")
    + R_(x - 5.6, 79.5, 9, 3.2, 1.2, "#a9b0b4", 1) + R_(x - 7, 91, 9, 3.2, 1.2, "#e2b35a", 1)
    + P_(`M${x - 6} 94C${x - 9} 99 ${x - 7} 102 ${x - 3} 102C${x - 1} 99 ${x - 1} 96 ${x - 2} 94Z`, beard, 1.1);
  return [
    P_("M0 104C2 80 18 70 50 70C82 70 98 80 100 104Z", tunic), L_("M36 74L40 104M64 74L60 104", 2.4, "#8a5a34"),
    both(P_("M2 92C2 80 12 72 24 72C30 72 33 76 33 80C28 82 26 86 24 90C16 88 8 90 2 92Z", fur, 1.4)), both(E_(25.5, 47, 4.2, 6, skin)),
    P_("M26 46C26 30 36 24 50 24C64 24 74 30 74 46C74 60 64 68 50 68C36 68 26 60 26 46Z", skin),
    P_("M26 46C26 61 35 70 50 70C65 70 74 61 74 46C71 54 68 62 61 62.5C56 59 44 59 39 62.5C32 62 29 54 26 46Z", beard),
    L_("M31 54Q33 60 36 63M69 54Q67 60 64 63", 1, beardD), braid(40), mir(braid(40)),
    P_("M41.5 58.5Q50 65.5 58.5 58.5Q50 61.5 41.5 58.5Z", MOUTH, 1.3), P_("M44 59.3H56L55 61H45Z", "#fff", 0),
    blush(37, 63, 51.5, 4, "#e9705a", 0.55), [[35, 50], [37.5, 51.5], [62.5, 51.5], [65, 50]].map(([x, y]) => C_(x, y, 0.6, "#b0603a", 0)).join(""),
    C_(50, 51.5, 4.2, mix(skin, "#c9775a", 0.45), 1.3), dotEyes(41.5, 58.5, 45.5, 2.3),
    P_("M35.5 41.5Q41 37 47 40Q41.5 40 36 43Z", beard, 1.2), P_("M64.5 41.5Q59 37 53 40Q58.5 40 64 43Z", beard, 1.2),
    // fur hat
    P_("M29 30C29 11 71 11 71 30Z", "#7a4a2a"), L_("M40 15C38 20 38 25 39 29M60 15C62 20 62 25 61 29", 1, "#5a341c"),
    P_("M22 34C21 26 29 23.5 33.5 25.5C37.5 21 46 21.5 50 24C54 21.5 62.5 21 66.5 25.5C71 23.5 79 26 78 34C78.5 40.5 71 41 67 38.5C62 42 54 40.5 50 38.5C46 40.5 38 42 33 38.5C29 41 21.5 40.5 22 34Z", fur),
    L_("M30 31.5Q32 33 31 35.5M41 30Q43 32 42 35M50 29.5Q52 32 51 35M59 30Q61 32 60 35M69 31.5Q71 33 70 35.5", 0.9, "#c4b494"),
  ].join("");
}

function sable() {
  const fur = "#d4733a"; const cream = "#fbf1e2"; const tip = "#3a2a24"; const cloak = "#eef3f6"; const cloakD = "#bccbd6";
  const ear = P_("M31.5 38L23.5 7L48.5 25.5Z", fur) + P_("M32.5 32.5L27 14L43 26.5Z", "#f2b7a0", 0) + P_("M26.2 17.5L23.5 7L32 13Z", tip, 1);
  const eye = P_("M36 44.5Q42 38.5 47.5 43.5Q42 47.5 36 44.5Z", "#f2a92e", 1.3) + E_(42.2, 43.8, 1, 2.3, INK, 0) + C_(43.3, 42.6, 0.6, "#fff", 0);
  return [
    P_("M4 104C8 80 26 70 50 70C74 70 92 80 96 104Z", cloak), L_("M26 86C24 94 23 100 23 104M74 86C76 94 77 100 77 104", 1, cloakD),
    P_("M18 80C20 72 30 68 36 70C42 66 58 66 64 70C70 68 80 72 82 80C76 86 68 84 64 82C58 86 42 86 36 82C32 84 24 86 18 80Z", "#d9e2e8"),
    C_(50, 84, 3.2, "#5aa2d6", 1.2), C_(49.2, 83.2, 0.9, "#fff", 0), both(ear), both(P_("M27 46L15 50L24 53L17 59L30 57Z", fur, 1.3)),
    P_("M24 46C24 30 36 22 50 22C64 22 76 30 76 46C76 54 66 62 50 72C34 62 24 54 24 46Z", fur),
    P_("M26.5 51C36 49 44 54 50 72C56 54 64 49 73.5 51C71 59 61 65.5 50 72C39 65.5 29 59 26.5 51Z", cream, 1.3), P_("M46 23Q50 35 54 23Z", cream, 0),
    eye, mir(eye), L_("M36 39.5Q41 37 46 39M54 39Q59 37 64 39.5", 1.4, darken(fur, 0.35)),
    P_("M45.8 64Q50 60.8 54.2 64Q50 69.5 45.8 64Z", tip, 1.1), C_(48.6, 63.2, 0.7, "#fff", 0, `opacity=".7"`),
    L_("M50 67V69.5M47 69.5Q50 72 53 69.5", 1.1),
    [[13, 24, 3], [88, 30, 2.5], [86, 62, 2.2], [11, 70, 2]].map(([x, y, r]) => L_(`M${x - r} ${y}H${x + r}M${x} ${y - r}V${y + r}M${x - r * 0.7} ${y - r * 0.7}L${x + r * 0.7} ${y + r * 0.7}M${x - r * 0.7} ${y + r * 0.7}L${x + r * 0.7} ${y - r * 0.7}`, 0.9, "#ffffff", `opacity=".9"`)).join(""),
  ].join("");
}

function verrin() {
  const skin = "#ece2e8"; const hair = "#1f1b2a"; const cape = "#23202d"; const lining = "#a8233a";
  return [
    both(P_("M13 94L7 22L44 63L36 94Z", cape) + P_("M17 88L13 32L40 63L34 88Z", lining, 0)), P_("M2 104C6 82 22 74 50 74C78 74 94 82 98 104Z", cape),
    P_("M40 72L50 92L60 72Z", "#fbf6ee", 1.3), L_("M44 76Q50 80 56 76M45.5 81Q50 85 54.5 81", 1, "#cfc6bc"),
    C_(50, 79.5, 2.5, "#c2183a", 1.1), C_(49.3, 78.8, 0.7, "#fff", 0), P_("M44 59L44 74L56 74L56 59Z", "#d8cad3"),
    both(P_("M35.5 44L27 34L34.5 53Z", skin, 1.3)), P_("M35 42C35 28 42 22 50 22C58 22 65 28 65 42C65 56 58 66 50 68C42 66 35 56 35 42Z", skin),
    P_("M33 43C30 22 40 14 50 14C60 14 70 22 67 43C64.5 33 60.5 28.5 56 28.5L50 37L44 28.5C39.5 28.5 35.5 33 33 43Z", hair),
    L_("M41 19C38 22 36 27 35.5 32M58 18C61 20 63 23 64 27", 1.1, "#6a6488"), L_("M38 40L46.5 37.8M62 40L53.5 37.8", 1.9),
    both(P_("M39 44.3Q42.6 42.2 46.2 44.3Q42.6 46.3 39 44.3Z", "#fff", 1.1) + C_(42.6, 44.3, 1.4, "#8a1c2c", 0) + L_("M38.4 43.7Q42.6 41.4 46.8 43.7", 1.9)),
    L_("M50 45L48.2 52.2L51 53", 1.2), L_("M43.5 58Q51 61.5 57.5 57", 1.6), P_("M53 59L54.1 61.8L55.2 58.4Z", "#fff", 0.8), C_(58, 51.5, 0.7, INK, 0),
    // a glass of "tomato juice", garnished to prove it
    P_("M70 62L86 62C86 72 82 76.5 78 76.5C74 76.5 70 72 70 62Z", "rgba(226,240,246,.55)", 1.3),
    P_("M70.8 66L85.2 66C84.6 72 81.6 75.5 78 75.5C74.4 75.5 71.4 72 70.8 66Z", "#c8282f", 0), L_("M72.5 64.5L73.5 70", 1, "#ffffff", `opacity=".7"`),
    L_("M78 76.5V88", 1.8), E_(78, 89, 6, 1.6, "rgba(226,240,246,.7)", 1.2),
    C_(85.5, 61.5, 3.4, "#e0392b", 1.2), P_("M85.5 58.2L84 56.6M85.5 58.2L87.3 56.8M85.5 58.2V56", "none", 1, `stroke="#3f8a2e"`),
  ].join("");
}

function bim() {
  const frog = "#6cc04a"; const frogD = "#4c9a33"; const purple = "#7b45b0"; const yellow = "#f2c23a";
  const bell = (x, y) => C_(x, y, 3.4, "#f6d36b", 1.2) + L_(`M${x - 1.6} ${y + 0.8}H${x + 1.6}`, 0.9) + C_(x - 1, y - 1.1, 0.8, "#fff", 0);
  const zig = (y0, y1, x0, x1, n, fill) => {
    const pts = []; for (let i = 0; i <= n; i += 1) pts.push(`${f1(x0 + ((x1 - x0) * i) / n)} ${i % 2 ? y1 : y0}`);
    return P_(`M${x0} ${y0 - 8}L${pts.join("L")}L${x1} ${y0 - 8}Z`, fill, 1.3);
  };
  return [
    P_("M6 104C10 84 28 76 50 76C72 76 90 84 94 104Z", purple),
    P_("M50 80L60 92L50 104L40 92Z", yellow, 1.2), P_("M22 88L30 98L22 106L14 98ZM78 88L86 98L78 106L70 98Z", yellow, 1.2),
    zig(76, 85, 18, 82, 12, yellow), zig(74, 80, 26, 74, 10, purple),
    P_("M41 40C31 30 19 30 10 40C17 27 31 21 45 30Z", purple), P_("M42 35C40 20 46 10 54 4C52 14 56 24 59 35Z", yellow), P_("M56 30C69 21 83 27 90 40C81 30 69 30 59 40Z", purple),
    bell(10, 40), bell(54, 4), bell(90, 40), P_("M33 42C38 31 62 31 67 42Z", yellow, 1.3),
    P_("M22 55C22 41 34 37 50 37C66 37 78 41 78 55C78 67 66 73 50 73C34 73 22 67 22 55Z", frog),
    E_(39, 61, 4, 2.4, frogD, 0, `opacity=".5"`), E_(66, 49, 2.6, 1.8, frogD, 0, `opacity=".5"`), E_(30, 50, 2, 1.4, frogD, 0, `opacity=".5"`),
    both(C_(35.5, 41, 9.5, frog) + C_(35.5, 41, 6.4, "#fff", 1.1) + E_(36.4, 41.8, 3.2, 2.2, INK, 0) + C_(37.6, 40.6, 0.9, "#fff", 0) + L_("M27 37.5Q35.5 31 44 37.5", 1.3, frogD)),
    C_(47, 52.5, 0.9, INK, 0), C_(53, 52.5, 0.9, INK, 0), L_("M29 58.5Q50 73 71 58.5", 1.9), L_("M27.8 56.6L29.6 59.2M72.2 56.6L70.4 59.2", 1.5),
    P_("M45 64.6Q50 70.5 55 64.6Q50 66.2 45 64.6Z", "#f08aa0", 1), blush(28, 72, 63, 4.2, "#ff8fa8", 0.55),
  ].join("");
}

function sprocket() {
  const skin = "#a3bb6c"; const skinD = "#7f9a4c"; const brass = "#c8963a"; const lens = "#8fdcef";
  const goggle = (x) => C_(x, 34, 6.8, brass, 1.4) + C_(x, 34, 4.6, lens, 1.1) + P_(`M${x - 2.5} ${32.6}Q${x - 1} ${30.4} ${x + 1.4} ${30.6}`, "none", 1.1, `stroke="#fff"`);
  return [
    G_("translate(81 52) rotate(28)", P_("M-7 0C-7 -8 -4 -11 -2 -11L-2 -5L2 -5L2 -11C4 -11 7 -8 7 0C7 4 4 6 2.6 6L2.6 34C2.6 36.5 -2.6 36.5 -2.6 34L-2.6 6C-4 6 -7 4 -7 0Z", "#a4adb3", 1.5) + L_("M-1 10V30", 0.9, "#ffffff", `opacity=".7"`)),
    P_("M4 104C8 82 26 72 50 72C74 72 92 82 96 104Z", "#d8c9a0"),
    P_("M33 82L67 82L69 104L31 104Z", "#7a5a3a"), L_("M35 82L30 72M65 82L70 72", 2.2, "#7a5a3a"), C_(37, 85, 1.5, "#e2b35a", 1), C_(63, 85, 1.5, "#e2b35a", 1),
    R_(42, 88, 16, 10, 2, "#6a4c30", 1.2), L_("M45 88V81M45 81H47", 1.6, "#c8323a"), L_("M54 88L56 82", 1.4, "#9aa4aa"),
    both(P_("M32 44C21 40 9 34 2 34C8 42 20 52 32 55Z", skin) + L_("M29 46C21 43 14 40 9 38", 1, skinD)),
    P_("M30 46C30 30 38 24 50 24C62 24 70 30 70 46C70 60 62 70 50 70C38 70 30 60 30 46Z", skin),
    P_("M39 28L36 15L44.5 23L48 10L52.5 22.5L59 13L59.5 27Z", "#2a2420", 1.3),
    P_("M30 33.5C40 29.5 60 29.5 70 33.5L70 37.5C60 34 40 34 30 37.5Z", "#4a3a2c", 1.1),
    goggle(41.5), goggle(58.5), R_(47.5, 32.6, 5, 2.6, 1, brass, 1),
    both(C_(41.5, 47, 4.6, "#fffbe0", 1.3) + C_(42.6, 47.6, 2.1, INK, 0) + C_(43.4, 46.7, 0.7, "#fff", 0)),
    L_("M36.5 41.5Q41 40 45.5 42M54.5 42Q59 40 63.5 41.5", 1.5),
    P_("M38 60.5Q50 69 62 60.5Q50 64.5 38 60.5Z", "#5a2a20", 1.4), P_("M43.3 61.8L44.6 64.4L46 62.3Z", "#fff", 0.7), P_("M54 62.4L55.3 64.8L56.6 62Z", "#fff", 0.7),
    P_("M49.5 46.5C51.5 52 55.5 56 60.5 58.3C55.5 59.5 51 58.5 47.6 56.2Z", skinD, 1.3),
    E_(35, 55, 3.2, 1.6, "#3a3a3a", 0, `opacity=".3"`), E_(64, 54, 2, 1.1, "#3a3a3a", 0, `opacity=".25"`),
  ].join("");
}

function brassbell(id) {
  const tin = "#c3cbd0"; const tinD = "#8e989f"; const brass = "#cf9f45";
  const port = (x) => C_(x, 40, 8.8, brass, 1.5) + C_(x, 40, 6, `url(#${id}e)`, 1.1) + E_(x - 2, 37.6, 2, 1.2, "#fff", 0, `opacity=".85"`)
    + [0, 90, 180, 270].map((a) => C_(f1(x + 7.4 * Math.cos((a * Math.PI) / 180)), f1(40 + 7.4 * Math.sin((a * Math.PI) / 180)), 0.6, "#8a6420", 0)).join("");
  return [
    `<defs><radialGradient id="${id}e" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#fffbe0"/><stop offset=".55" stop-color="#ffe27a"/><stop offset="1" stop-color="#e59a2a"/></radialGradient></defs>`,
    P_("M10 104C12 84 26 78 50 78C74 78 88 84 90 104Z", tin), [22, 34, 66, 78].map((x) => C_(x, 92, 1.1, tinD, 0.8)).join(""),
    R_(40, 88, 20, 14, 2, "#a9b2b8", 1.2), C_(46, 95, 3, "#f6f0d8", 1), L_("M46 95L47.6 93", 0.9), C_(55, 95, 1.6, "#e0392b", 0.9),
    P_("M14 83C20 78 28 78 33 82L31 104L18 104Z", "#f4f0e4", 1.4), L_("M17.5 90H31.5M17.5 94H31.2", 1.2, "#c8323a"),
    R_(42, 62, 16, 16, 2, tinD, 1.3), L_("M42 66.5H58M42 71H58M42 75.5H58", 1, "#6e777d"),
    P_("M50 78L39 72L39 84Z", "#c8323a", 1.3), P_("M50 78L61 72L61 84Z", "#c8323a", 1.3), R_(47.5, 75.5, 5, 5, 1.2, "#a82a30", 1.1),
    both(R_(20.5, 35, 7, 13, 2.5, brass, 1.3) + L_("M22 39H26.5M22 43.5H26.5", 0.8, "#8a6420")),
    P_("M50 15V8", "none", 1.6), P_("M44.6 9C44.6 1.6 55.4 1.6 55.4 9L56.6 10.6L43.4 10.6Z", brass, 1.3), C_(50, 11.8, 1.3, "#8a6420", 0.8),
    P_("M37 22C37 14 63 14 63 22Z", tinD), R_(26, 20, 48, 46, 15, tin),
    P_("M30 30C30 25 33 23 37 23L37 60C33 60 30 57 30 52Z", "#ffffff", 0, `opacity=".35"`),
    [[31, 25], [69, 25], [31, 61], [69, 61]].map(([x, y]) => C_(x, y, 1.1, tinD, 0.8)).join(""), port(39), port(61),
    R_(39, 53, 22, 7, 3.5, "#4a5258", 1.3), [44, 48, 52, 56].map((x, i) => C_(x, 56.5, 1.1, i % 3 ? "#9fe6a0" : "#ffe27a", 0)).join(""),
    blush(31, 69, 53, 2.6, "#ff9a8a", 0.55),
  ].join("");
}

function genericPatron(seed) {
  const c = hashColor(seed, 0.35, 0.5);
  return () => [
    P_("M6 104C10 80 28 70 50 70C72 70 90 80 94 104Z", darken(c, 0.15)), C_(50, 44, 21, lighten(c, 0.15)),
    P_("M44.5 38C44.5 33 48 31 51 31C55 31 57 34 57 37C57 41 51 42 51 46M51 51V51.5", "none", 3.2, `stroke="${lighten(c, 0.65)}"`),
  ].join("");
}

const CHARACTERS = {
  "base:gorrum": { bg: "#e3a55a", draw: gorrum }, "base:tilly": { bg: "#c6a5d8", draw: tilly },
  "base:ansel": { bg: "#c9d98c", draw: ansel }, "base:zephyrine": { bg: "#9aa8e8", draw: zephyrine },
  "harbor:marrow": { bg: "#8fb9d6", draw: marrow }, "harbor:nessa": { bg: "#88d6c8", draw: nessa },
  "frost:hrolga": { bg: "#f0b07c", draw: hrolga }, "frost:sable": { bg: "#a9c7e0", draw: sable },
  "masquerade:verrin": { bg: "#c98c9e", draw: verrin }, "masquerade:bim": { bg: "#f2d276", draw: bim },
  "clockwork:sprocket": { bg: "#d9b77e", draw: sprocket }, "clockwork:brassbell": { bg: "#9fcbc6", draw: brassbell },
};
/** Ids that have hand-drawn portraits (anything else gets a tinted silhouette). */
export const PORTRAIT_IDS = Object.keys(CHARACTERS);
/** The backdrop accent for a patron — handy for seat rings and name chips. */
export function characterAccent(characterId) { return (CHARACTERS[characterId] || {}).bg || hashColor(characterId, 0.4, 0.62); }

/**
 * A bust portrait. `size` sets width/height in px (omit/null to size with CSS).
 * `theme` ("light" | "dark") or an explicit `palette` picks the backdrop tones.
 */
export function portraitSvg(characterId, { size = 96, theme, palette, idPrefix = "lop", label } = {}) {
  const P = palette || paletteFor(theme);
  const name = label || String(characterId || "patron");
  const override = ASSETS.portraits && ASSETS.portraits[characterId];
  if (override) return imageSvg(override, { size, label: name, rx: 18 });
  INK = P.ink;
  const id = nextId(idPrefix);
  const ch = CHARACTERS[characterId] || { bg: hashColor(characterId, 0.4, 0.62), draw: genericPatron(characterId) };
  const inner = P.backdropDrop ? darken(ch.bg, P.backdropDrop * 0.55) : lighten(ch.bg, P.backdropLift);
  const outer = P.backdropDrop ? darken(ch.bg, P.backdropDrop + 0.18) : lighten(ch.bg, P.backdropLift * 0.25);
  const body = [
    `<defs><radialGradient id="${id}b" cx="50%" cy="38%" r="72%"><stop offset="0" stop-color="${inner}"/><stop offset="1" stop-color="${outer}"/></radialGradient>`,
    `<clipPath id="${id}c"><rect width="100" height="100" rx="18"/></clipPath></defs>`,
    `<g clip-path="url(#${id}c)"><rect width="100" height="100" fill="url(#${id}b)"/>`,
    `<circle cx="50" cy="42" r="34" fill="${P.glow}" opacity="${P.backdropDrop ? 0.22 : 0.4}"/>`,
    ch.draw(id), "</g>",
    `<rect x=".9" y=".9" width="98.2" height="98.2" rx="17.2" fill="none" stroke="${darken(ch.bg, 0.4)}" stroke-width="1.8" opacity=".55"/>`,
  ].join("");
  return svgWrap(body, { size, label: name });
}

// =====================================================================
// Effect icons (100×100, centred around 50,52)
// =====================================================================
const ISW = 2.4;
const ICONS = {
  fist: (P) => [
    P_(starPoly(54, 50, 40, 26, 9), P.bolt, 0, `opacity=".9"`), L_("M12 40H24M8 52H22M12 64H24", 3, INK, `opacity=".55"`),
    R_(34, 78, 34, 14, 3, "#8a5a34", ISW), L_("M40 78V92M62 78V92", 1.4, "#5e3b20"),
    P_("M30 46C30 40 33 37 37 37L66 37C72 37 75 41 75 47L75 68C75 77 68 82 59 82L42 82C35 82 30 77 30 70Z", P.skinFist, ISW),
    [0, 1, 2, 3].map((i) => R_(30 + i * 11.2, 28 + (i === 0 || i === 3 ? 3 : 0), 11.2, 22, 5.6, P.skinFist, ISW)).join(""),
    P_("M30 58C30 51.5 36 49.5 44 51L60 53C64.5 54 64.5 61 60 62L40 64C34 64.5 30 62 30 58Z", P.skinFist, ISW),
    L_("M36 33.5Q38 31.5 40 33.5M47.5 30.5Q49.5 28.5 51.5 30.5M58.5 30.5Q60.5 28.5 62.5 30.5M69 33.5Q71 31.5 73 33.5", 1.4, "#c98a62"),
  ].join(""),
  heart: (P) => [
    L_("M44 22C40 17 44 12 47 15C50 12 54 17 50 22L47 25Z", 1.6, P.heart, `fill="${P.heart}" opacity=".7"`),
    L_("M58 14C55.5 11 58 8 60 10C62 8 64.5 11 62 14L60 16Z", 1.4, P.heart, `fill="${P.heart}" opacity=".55"`),
    L_("M72 50C86 50 86 74 72 74", 6.5, INK), L_("M72 50C86 50 86 74 72 74", 2.8, P.bone), R_(26, 36, 48, 52, 7, P.bone, ISW),
    P_("M24 40C22 31 31 26 38 30C43 24 54 25 57 31C64 26 76 30 75 38C78 42 74 46 70 44C66 47 30 47 26 44C22 44 22 41 24 40Z", P.foam, ISW),
    P_("M50 78C40 70 34 65 34 58C34 52 40 49 44 51C47 52.5 49 55 50 57C51 55 53 52.5 56 51C60 49 66 52 66 58C66 65 60 70 50 78Z", P.heart, ISW),
    E_(44, 56.5, 3, 2, "#fff", 0, `opacity=".6"`),
  ].join(""),
  coins: (P) => {
    const coin = (y) => R_(18, y, 40, 7, 3.5, P.goldDark, ISW) + E_(38, y, 20, 5.5, P.gold, ISW);
    return [
      [84, 76, 68, 60, 52].map(coin).join(""), E_(38, 52, 13, 3.4, "none", 1.4, `stroke="${P.goldDark}"`),
      C_(68, 60, 19, P.gold, ISW), C_(68, 60, 13.5, "none", 1.6, `stroke="${P.goldDark}"`),
      P_(starPoly(68, 60, 7.5, 3.4, 5), P.goldLight, 1.4),
      E_(61, 50, 4.5, 2.4, "#fff", 0, `opacity=".7" transform="rotate(-35 61 50)"`),
      star4(84, 30, 6, P.goldLight), star4(24, 34, 4.5, P.goldLight),
    ].join("");
  },
  bubbles: (P) => {
    const b = (x, y, r) => C_(x, y, r, P.buzzLight, ISW) + C_(x - r * 0.35, y - r * 0.35, r * 0.28, "#fff", 0, `opacity=".9"`);
    return [
      b(38, 66, 18), b(66, 44, 13), b(70, 76, 9), b(40, 30, 8), b(82, 22, 5.5), b(20, 40, 4.5),
      L_("M38 66m-7 0a7 7 0 1 1 7 7a4 4 0 1 1 -4 -4", 2.6, P.buzz),
      L_("M66 44m-5 0a5 5 0 1 1 5 5a2.6 2.6 0 1 1 -2.6 -2.6", 2.2, P.buzz),
    ].join("");
  },
  cards: (P) => {
    const card = (rot, fill) => G_(`rotate(${rot} 50 88)`, R_(34, 26, 32, 46, 5, fill, ISW) + R_(38, 30, 24, 38, 3, "none", 1.2, `stroke="${P.frameLight}"`));
    return [card(-22, P.bone), card(0, P.bone), card(22, P.bone),
      G_("rotate(22 50 88)", P_("M50 41V57M42 49H58", "none", 4.5, `stroke="${P.spike}"`))].join("");
  },
  palm: (P) => [
    C_(50, 54, 40, P.cardGlow, 0),
    [[33, 30, 8.5, 34], [42, 21, 8.5, 40], [51, 22.5, 8.5, 38], [60, 30, 8, 31]].map(([x, y, w, h]) => R_(x, y, w, h, w / 2, P.skinFist, ISW)).join(""),
    P_("M68.5 66C72 58 77 53 82 54.5C85 56 83 62 78 70L72 80Z", P.skinFist, ISW),
    P_("M33 52L33 74C33 85 41 92 51 92C61 92 69 86 69 74L68 52Z", P.skinFist, ISW), L_("M42 72Q50 76 58 70M44 80Q50 82 56 79", 1.4, "#c98a62"),
  ].join(""),
  swirl: (P) => {
    const arc = (d) => L_(d, 11, INK) + L_(d, 6.4, P.bone);
    return [
      arc("M24 46A27 27 0 0 1 70 30"), P_("M64 18L82 32L60 40Z", P.bone, ISW),
      arc("M76 58A27 27 0 0 1 30 74"), P_("M36 86L18 72L40 64Z", P.bone, ISW),
      C_(50, 52, 6, P.bolt, ISW),
    ].join("");
  },
  dice: (P) => {
    const pips = (x, y, s, list) => list.map(([u, v]) => C_(f1(x + u * s), f1(y + v * s), f1(s * 0.11), INK, 0)).join("");
    return [
      G_("rotate(-14 36 62)", R_(18, 44, 36, 36, 8, P.bone, ISW) + pips(18, 44, 36, [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]])),
      G_("rotate(16 66 40)", R_(50, 24, 32, 32, 7, P.bone, ISW) + pips(50, 24, 32, [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]])),
      L_("M80 66l6 4M84 60l7 1M76 72l3 6", 2.4, INK, `opacity=".5"`),
    ].join("");
  },
  tray: (P) => [
    E_(50, 80, 38, 9, P.pewter, ISW), E_(50, 78, 31, 6, P.pewterDark, 0, `opacity=".35"`),
    L_("M66 42C78 42 78 64 66 64", 6, INK), L_("M66 42C78 42 78 64 66 64", 2.6, P.woodVessel),
    R_(32, 34, 34, 42, 4, P.woodVessel, ISW), R_(31, 40, 36, 4, 1.4, P.pewter, 1.4), R_(31, 66, 36, 4, 1.4, P.pewter, 1.4),
    P_("M29 37C26 29 34 25 39 28C42 21 54 22 57 27C63 23 72 28 69 36C68 40 64 39 63 42C62 45 59 44 59 41C52 40 35 41 29 37Z", P.foam, ISW),
  ].join(""),
  bolt: (P) => [C_(50, 52, 38, P.cardGlow, 0), P_("M58 10L28 56L47 56L39 92L74 42L54 42L64 10Z", P.bolt, ISW), L_("M55 16L37 50", 1.6, "#fff", `opacity=".7"`)].join(""),
  drop: (P) => [
    P_("M50 18C60 34 70 46 70 60C70 72 61 80 50 80C39 80 30 72 30 60C30 46 40 34 50 18Z", P.spike, ISW),
    P_("M40 58C40 52 43 47 46 44", "none", 3, `stroke="#fff" opacity=".7"`), star4(72, 26, 7, P.bolt), star4(26, 34, 5, P.bolt),
  ].join(""),
  star: (P) => P_(starPoly(50, 52, 34, 15, 5), P.bolt, ISW),
};
/** Icon keys cardArtSvg can draw; displayEntry.icon may name one directly. */
export const CARD_ICON_KEYS = Object.keys(ICONS);
const PRIORITY_OPS = { negate: "palm", soften: "palm", redirect: "swirl", reflect: "swirl", gamble: "dice", take_lead: "dice", raise: "dice", order: "tray", extra_action: "bolt" };
const KIND_ICON = { action: "fist", reaction: "palm", gamble: "dice", spike: "drop" };

/** Which icon a card shows: displayEntry.icon, then signature ops, then its first effect. */
export function cardIconKey(def = {}, displayEntry = {}) {
  if (displayEntry && ICONS[displayEntry.icon]) return displayEntry.icon;
  const effects = Array.isArray(def.effects) ? def.effects : [];
  for (const e of effects) if (PRIORITY_OPS[e.op]) return PRIORITY_OPS[e.op];
  for (const e of effects) {
    if (e.op === "grit") return Number(e.n) > 0 ? "heart" : "fist";
    if (e.op === "gold" || e.op === "steal" || e.op === "collect") return "coins";
    if (e.op === "buzz") return "bubbles";
    if (e.op === "draw") return "cards";
  }
  return KIND_ICON[def.kind] || "star";
}

function cardTile(kind, iconKey, P, opts) {
  INK = P.ink;
  const id = nextId(opts.idPrefix || "loc");
  const base = P[kind] || P.generic;
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6; const b = a + Math.PI / 14;
    return `M50 52L${f1(50 + 80 * Math.cos(a))} ${f1(52 + 80 * Math.sin(a))}L${f1(50 + 80 * Math.cos(b))} ${f1(52 + 80 * Math.sin(b))}Z`;
  }).join("");
  const body = [
    `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(base, 0.28)}"/><stop offset="1" stop-color="${darken(base, 0.12)}"/></linearGradient>`,
    `<clipPath id="${id}c"><rect width="100" height="100" rx="12"/></clipPath></defs>`,
    `<g clip-path="url(#${id}c)"><rect width="100" height="100" fill="url(#${id}g)"/><path d="${rays}" fill="#fff" opacity=".1"/>`,
    `<circle cx="50" cy="52" r="34" fill="${P.cardGlow}"/>`, ICONS[iconKey](P), "</g>",
    `<rect x="1" y="1" width="98" height="98" rx="11" fill="none" stroke="${darken(base, 0.35)}" stroke-width="2"/>`,
  ].join("");
  return svgWrap(body, { size: opts.size, label: opts.label });
}

/** The art panel for a hand card: kind-coloured tile + the dominant-effect icon. */
export function cardArtSvg(def = {}, displayEntry = {}, opts = {}) {
  const override = ASSETS.cards && def.id && ASSETS.cards[def.id];
  const label = opts.label || (displayEntry && displayEntry.name) || def.id;
  if (override) return imageSvg(override, { size: opts.size, label, rx: 12 });
  return cardTile(def.kind, cardIconKey(def, displayEntry || {}), paletteOf(opts), { ...opts, label });
}
/** A kind tile with that kind's default emblem (for unknown or face-down-ish cards). */
export function cardFrameSvg(kind, opts = {}) { return cardTile(kind, KIND_ICON[kind] || "star", paletteOf(opts), opts); }

// =====================================================================
// Drinks
// =====================================================================
function liquidOf(displayEntry, seed) {
  const p = displayEntry && displayEntry.palette;
  if (typeof p === "string") return p;
  if (Array.isArray(p) && p.length) return p[0];
  if (p && typeof p === "object") return p.liquid || p.primary || p.main || p.color || Object.values(p).find((v) => typeof v === "string") || hashColor(seed, 0.6, 0.5);
  const words = `${(displayEntry && displayEntry.name) || ""} ${seed}`.toLowerCase();
  const hit = LIQUID_WORDS.find(([w]) => new RegExp(`\\b${w}`).test(words));
  return hit ? hit[1] : hashColor(seed, 0.62, 0.5);
}
// Name keywords → liquid colour / vessel, so unpainted drinks still look like what they're called.
const LIQUID_WORDS = Object.entries({
  seafoam: "#7ad6b8", stout: "#4a2a1a", ink: "#2c2748", whiskey: "#c4651c", grog: "#9a5a26", ale: "#dc9a2c", mead: "#e9b43a", cider: "#e6bf48",
  milk: "#f4ecd8", nog: "#f2deb0", water: "#9fd3ea", melt: "#bfe8f4", frost: "#a8d8f0", tea: "#a8642c", wine: "#8e1f3a",
  port: "#7c1d3a", punch: "#e0466a", cordial: "#d8486a", flute: "#f0d070", soda: "#7fd0e0", tonic: "#86d66a", coolant: "#4fdcc0",
  cooler: "#4fdcc0", fountain: "#a4e070", dare: "#e8502c", penny: "#c87a3a", jug: "#7a5a8a", shanty: "#3a8aa8", special: "#dc9a2c",
});
const VESSEL_WORDS = Object.entries({
  tea: "teacup", milk: "teacup", nog: "teacup", cordial: "teacup", wine: "goblet", port: "goblet", flute: "goblet", punch: "goblet",
  whiskey: "bottle", grog: "bottle", tonic: "bottle", dare: "bottle", jug: "bottle", mead: "horn", horn: "horn", soda: "flask",
  melt: "flask", cooler: "flask", potion: "flask", ale: "tankard", stout: "tankard", cider: "tankard", shanty: "tankard", special: "tankard",
});
const VESSEL_EMOJI = { "🍷": "goblet", "🥂": "goblet", "🥃": "bottle", "🍾": "bottle", "🏺": "bottle", "🍵": "teacup", "🥛": "teacup", "☕": "teacup", "🍺": "tankard", "🍻": "tankard", "🍯": "horn", "🧪": "flask" };
const GLASS_HI = (d) => L_(d, 2.6, "#fff", `opacity=".6"`);
const VESSELS = {
  tankard: (L, P) => [
    L_("M68 42C82 42 82 72 68 72", 8, INK), L_("M68 42C82 42 82 72 68 72", 4.2, P.glass),
    R_(30, 34, 40, 52, 5, P.glass, ISW), R_(32.5, 44, 35, 39.5, 3, L, 0),
    [40, 50, 60].map((x) => L_(`M${x} 46V80`, 1.2, darken(L, 0.2), `opacity=".5"`)).join(""),
    R_(28.5, 80, 43, 7, 2.5, P.pewter, ISW), R_(28.5, 40, 43, 5, 2, P.pewter, ISW),
    P_("M27 41C23 32 32 27 37 30C41 22 55 22 58 28C64 23 75 29 72 38C71 43 67 41 66 45C65 48 62 47 62 44C54 43 34 45 27 41Z", lighten(L, 0.82), ISW),
    GLASS_HI("M35 50V74"),
  ].join(""),
  goblet: (L, P) => [
    P_("M26 22L74 22C74 46 64 58 50 58C36 58 26 46 26 22Z", P.glass, ISW),
    P_("M27.5 32L72.5 32C71 48 62 56 50 56C38 56 29 48 27.5 32Z", L, 0), E_(50, 32, 22.5, 3.2, lighten(L, 0.3), 0),
    L_("M26 22H74", 3.2, P.gold), GLASS_HI("M33 36Q35 46 41 51"),
    R_(46.5, 57, 7, 22, 2, P.gold, ISW), C_(50, 66, 4.5, P.gold, ISW), E_(50, 82, 17, 5, P.gold, ISW),
  ].join(""),
  bottle: (L, P) => [
    P_("M35 46C35 39 42 36 44 33L44 18L56 18L56 33C58 36 65 39 65 46L65 86C65 90 61 92 57 92L43 92C39 92 35 90 35 86Z", L, ISW),
    R_(42.5, 9, 15, 11, 3, "#b98a5a", ISW), L_("M46 12V18M50 11V18M54 12V18", 1, "#8a5a34"),
    R_(37, 56, 26, 22, 3, P.paper, 1.8), P_(starPoly(50, 67, 6.5, 3, 5), L, 1.4),
    GLASS_HI("M39 48V84"), R_(43, 30, 14, 4, 1.5, P.gold, 1.4),
  ].join(""),
  teacup: (L, P) => [
    L_("M42 30C38 24 46 20 42 14M56 30C52 24 60 20 56 14", 2.4, P.inkSoft),
    E_(50, 82, 34, 8, P.bone, ISW), E_(50, 80, 22, 4, darken(P.bone, 0.08), 0),
    L_("M72 52C86 50 86 70 70 70", 6.5, INK), L_("M72 52C86 50 86 70 70 70", 3, P.bone),
    P_("M24 48L76 48C76 68 66 80 50 80C34 80 24 68 24 48Z", P.bone, ISW),
    E_(50, 48, 26, 6, L, ISW), E_(44, 47, 8, 1.8, "#fff", 0, `opacity=".45"`),
    P_("M50 70C45 66 42 63.5 42 60.5C42 57.5 46 56.5 48 58.5L50 60.5L52 58.5C54 56.5 58 57.5 58 60.5C58 63.5 55 66 50 70Z", P.heart, 1.4),
  ].join(""),
  horn: (L, P) => [
    P_("M22 30C24 26 48 24 54 30C58 50 70 70 86 80C89 83 86 88 81 86C60 78 38 60 22 30Z", "#e8cf9c", ISW),
    P_("M70 72C76 77 81 80 86 80C89 83 86 88 81 86C77 84 73 80 70 72Z", "#8a5a34", 0),
    L_("M49 46C42 48 34 46 30 43M62 66C56 68 50 66 46 62", 3.6, P.gold),
    E_(38, 29, 16, 5.2, L, ISW), P_("M25 28C28 25 34 25 36 27C40 24 48 25 50 28C44 30 30 31 25 28Z", lighten(L, 0.8), 0),
    L_("M22 30C24 26 48 24 54 30", 3, P.gold), GLASS_HI("M30 40Q40 56 52 66"),
  ].join(""),
  flask: (L, P) => [
    C_(50, 64, 22, P.glass, ISW),
    P_("M29.4 60Q40 64 50 60T70.6 60A21 21 0 1 1 29.4 60Z", L, 0),
    C_(44, 72, 2.4, lighten(L, 0.5), 0), C_(55, 66, 1.6, lighten(L, 0.5), 0), C_(52, 77, 1.3, lighten(L, 0.5), 0),
    R_(43.5, 26, 13, 20, 2, P.glass, ISW), R_(42, 17, 16, 11, 3, "#b98a5a", ISW),
    GLASS_HI("M36 56Q34 64 37 72"),
    L_("M43 33H57", 2.4, P.gold),
  ].join(""),
};
/** Vessel keys drinkSvg can draw; displayEntry.vessel may name one directly. */
export const DRINK_VESSELS = Object.keys(VESSELS);

export function drinkVessel(def = {}, displayEntry = {}) {
  if (displayEntry && VESSELS[displayEntry.vessel]) return displayEntry.vessel;
  const words = `${(displayEntry && displayEntry.name) || ""} ${def.id || ""}`.toLowerCase();
  const hit = VESSEL_WORDS.find(([w]) => new RegExp(`\\b${w}`).test(words));
  if (hit) return hit[1];
  if (displayEntry && VESSEL_EMOJI[displayEntry.emoji]) return VESSEL_EMOJI[displayEntry.emoji];
  const effects = Array.isArray(def.effects) ? def.effects : [];
  if (effects.some((e) => e.op === "grit" && Number(e.n) > 0)) return "teacup";
  if (def.house) return "tankard";
  if (effects.some((e) => e.op === "buzz" && Number(e.n) >= 3)) return "bottle";
  return DRINK_VESSELS[hashString(String(def.id || "drink")) % DRINK_VESSELS.length];
}

const BADGES = {
  crown: (P) => G_("translate(4 4)", C_(12, 12, 11, P.badge, 1.8) + P_("M4.5 16.5L3.5 7L8.5 11L12 4.5L15.5 11L20.5 7L19.5 16.5Z", P.gold, 1.5)),
  lock: (P) => G_("translate(72 4)", C_(12, 12, 11, P.badge, 1.8) + L_("M8.5 11V8.5A3.5 3.5 0 0 1 15.5 8.5V11", 2) + R_(6.5, 10.5, 11, 8.5, 1.8, P.goldDark, 1.5) + C_(12, 14.5, 1.3, INK, 0)),
};

/** A drink illustration: vessel + liquid colour, chaser bubbles, house/unrefusable badges. */
export function drinkSvg(drinkDef = {}, displayEntry = {}, opts = {}) {
  const label = opts.label || (displayEntry && displayEntry.name) || drinkDef.id;
  const override = ASSETS.drinks && drinkDef.id && ASSETS.drinks[drinkDef.id];
  if (override) return imageSvg(override, { size: opts.size, label, rx: 14 });
  const P = paletteOf(opts);
  INK = P.ink;
  const id = nextId(opts.idPrefix || "lod");
  const L = liquidOf(displayEntry, drinkDef.id || "drink");
  const dark = Boolean(P.backdropDrop);
  const bubbles = drinkDef.chaser
    ? [[84, 74, 4.5], [80, 60, 3.4], [86, 48, 2.8], [81, 37, 2.2], [16, 70, 3.2], [20, 56, 2.4]].map(([x, y, r]) => C_(x, y, r, lighten(L, 0.65), 1.3) + C_(x - r * 0.35, y - r * 0.35, r * 0.3, "#fff", 0)).join("")
    : "";
  const body = [
    `<defs><radialGradient id="${id}b" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="${dark ? darken(L, 0.45) : lighten(L, 0.82)}"/><stop offset="1" stop-color="${dark ? darken(L, 0.68) : lighten(L, 0.58)}"/></radialGradient>`,
    `<clipPath id="${id}c"><rect width="100" height="100" rx="14"/></clipPath></defs>`,
    `<g clip-path="url(#${id}c)"><rect width="100" height="100" fill="url(#${id}b)"/>`,
    E_(50, 90, 34, 6, "#000", 0, `opacity=".14"`),
    VESSELS[drinkVessel(drinkDef, displayEntry || {})](L, P), bubbles,
    drinkDef.house ? BADGES.crown(P) : "", drinkDef.unrefusable ? BADGES.lock(P) : "", "</g>",
    `<rect x="1" y="1" width="98" height="98" rx="13" fill="none" stroke="${darken(L, 0.4)}" stroke-width="1.8" opacity=".6"/>`,
  ].join("");
  return svgWrap(body, { size: opts.size, label });
}

// =====================================================================
// Backs, table, stat icons
// =====================================================================
function backSvg(kind, opts) {
  const P = paletteOf(opts);
  INK = P.ink;
  const id = nextId(opts.idPrefix || "lob");
  const card = kind === "card";
  const [a, b, trim] = card ? [P.cardBackA, P.cardBackB, P.cardBackTrim] : [P.drinkBackA, P.drinkBackB, P.drinkBackTrim];
  const pattern = card
    ? `<pattern id="${id}p" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 7H14M7 0V14" stroke="${trim}" stroke-width=".8" opacity=".22"/></pattern>`
    : `<pattern id="${id}p" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="2.2" fill="none" stroke="${trim}" stroke-width=".8" opacity=".25"/><circle cx="13" cy="13" r="1.3" fill="${trim}" opacity=".18"/></pattern>`;
  const mug = G_("translate(39.5 76) rotate(16)", L_("M-9 -6C-17 -6 -17 8 -9 8", 3.4, trim) + R_(-9, -12, 18, 26, 3, trim, 0) + R_(-9, -6, 18, 2.4, 0, b, 0, `opacity=".5"`)
    + R_(-9, 7, 18, 2.4, 0, b, 0, `opacity=".5"`) + P_("M-11 -11C-13 -16 -7 -19 -4 -16C-2 -20 5 -20 6 -16C10 -18 13 -13 10.5 -10Z", P.foam, 0));
  const emblem = card
    ? mug + mir(mug) + star4(50, 52, 6, P.foam) + C_(42, 50, 1.4, P.foam, 0) + C_(58, 49, 1.2, P.foam, 0) + C_(50, 43, 1.1, P.foam, 0)
    : P_("M41 54C41 49 45 47 45 44L45 35L53 35L53 44C53 47 57 49 57 54L57 88C57 90 55 92 53 92L45 92C43 92 41 90 41 88Z", trim, 0) + R_(43.5, 30, 11, 6, 2, P.foam, 0)
      + R_(43.5, 62, 11, 14, 1.5, b, 0, `opacity=".55"`) + P_("M59 64L73 64L71 86C71 89 69 90 66 90C63 90 61 89 61 86Z", trim, 0) + R_(60.5, 68, 11.5, 2.4, 0, b, 0, `opacity=".5"`)
      + C_(36, 52, 1.8, P.foam, 0) + C_(33, 42, 1.2, P.foam, 0) + C_(66, 56, 1.5, P.foam, 0) + C_(70, 48, 1, P.foam, 0);
  const body = [
    `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>${pattern}</defs>`,
    `<rect width="100" height="140" rx="10" fill="url(#${id}g)"/><rect width="100" height="140" rx="10" fill="url(#${id}p)"/>`,
    `<rect x="6" y="6" width="88" height="128" rx="6" fill="none" stroke="${trim}" stroke-width="1.6" opacity=".85"/>`,
    `<rect x="9.5" y="9.5" width="81" height="121" rx="4" fill="none" stroke="${trim}" stroke-width=".8" stroke-dasharray="3 2.4" opacity=".6"/>`,
    `<circle cx="50" cy="70" r="31" fill="${b}" stroke="${trim}" stroke-width="2"/><circle cx="50" cy="70" r="26" fill="none" stroke="${trim}" stroke-width=".8" opacity=".6"/>`,
    emblem,
    [[16, 16], [84, 16], [16, 124], [84, 124]].map(([x, y]) => star4(x, y, 4, trim)).join(""),
  ].join("");
  return svgWrap(body, { size: opts.size, label: opts.label, viewBox: "0 0 100 140" });
}
/** Hand-card back (100×140 viewBox — scale with CSS or `size` = width px). */
export function cardBackSvg(opts = {}) {
  if (ASSETS.cardBack) return imageSvg(ASSETS.cardBack, { size: opts.size, label: opts.label, viewBox: "0 0 100 140", rx: 10 });
  return backSvg("card", opts);
}
/** Drink-deck card back (100×140 viewBox). */
export function drinkBackSvg(opts = {}) {
  if (ASSETS.drinkBack) return imageSvg(ASSETS.drinkBack, { size: opts.size, label: opts.label, viewBox: "0 0 100 140", rx: 10 });
  return backSvg("drink", opts);
}

/** Subtle wood-plank table texture (400×400, `slice` so it covers any box; tiles cleanly as a CSS background). */
export function tableBgSvg(opts = {}) {
  const P = paletteOf(opts);
  if (ASSETS.tableBg) return imageSvg(ASSETS.tableBg, { label: opts.label, viewBox: "0 0 400 400", rx: 0 });
  const rand = seeded(`table:${opts.seed || "last-orders"}`);
  const planks = [];
  const tones = [P.tableA, P.tableB, P.tableC, P.tableB];
  for (let i = 0; i < 4; i += 1) {
    const y = i * 100;
    planks.push(`<rect x="0" y="${y}" width="400" height="100" fill="${tones[i]}"/>`);
    for (let g = 0; g < 7; g += 1) {
      const gy = y + 10 + g * 12 + rand() * 6; const amp = 2 + rand() * 4; const ph = rand() * 400;
      planks.push(`<path d="M0 ${f1(gy)}C${f1(100 + ph * 0.1)} ${f1(gy - amp)} ${f1(200 - ph * 0.1)} ${f1(gy + amp)} 400 ${f1(gy)}" fill="none" stroke="${P.tableGrain}" stroke-width="${f1(0.8 + rand() * 1.4)}"/>`);
    }
    const kx = 40 + rand() * 320; const ky = y + 30 + rand() * 40;
    planks.push(`<ellipse cx="${f1(kx)}" cy="${f1(ky)}" rx="${f1(9 + rand() * 6)}" ry="${f1(3.5 + rand() * 2)}" fill="none" stroke="${P.tableGrain}" stroke-width="1.6"/><ellipse cx="${f1(kx)}" cy="${f1(ky)}" rx="3" ry="1.4" fill="${P.tableSeam}"/>`);
    planks.push(`<path d="M0 ${y + 0.5}H400" stroke="${P.tableSeam}" stroke-width="2"/>`);
    const nx = i % 2 ? 300 : 100;
    planks.push(`<circle cx="${nx}" cy="${y + 12}" r="2" fill="${P.tableSeam}"/><circle cx="${nx}" cy="${y + 88}" r="2" fill="${P.tableSeam}"/>`);
  }
  const vb = "0 0 400 400";
  return svgWrap(planks.join(""), { label: opts.label, viewBox: vb, extra: ` preserveAspectRatio="xMidYMid slice"` });
}

// Stat icons: 24×24, simple shapes. `mono: true` draws in currentColor only.
function statIcon(opts, drawColour, drawMono) {
  const P = paletteOf(opts);
  INK = P.ink;
  return svgWrap(opts.mono ? drawMono() : drawColour(P), { size: opts.size === undefined ? 24 : opts.size, label: opts.label, viewBox: "0 0 24 24" });
}
const MONO = (d, extra = "") => `<path d="${d}" fill="currentColor"${extra}/>`;
const HEART_D = "M12 21C6 16.5 2.5 13.2 2.5 9C2.5 5.8 5 3.8 7.6 3.8C9.4 3.8 11 4.8 12 6.4C13 4.8 14.6 3.8 16.4 3.8C19 3.8 21.5 5.8 21.5 9C21.5 13.2 18 16.5 12 21Z";

export function coinSvg(opts = {}) {
  return statIcon(opts,
    (P) => C_(12, 12, 9.6, P.gold, 1.4) + C_(12, 12, 6.6, "none", 1.1, `stroke="${P.goldDark}"`) + P_(starPoly(12, 12, 3.8, 1.7, 5), P.goldLight, 0.9) + E_(8.6, 8, 1.8, 1, "#fff", 0, `opacity=".7" transform="rotate(-35 8.6 8)"`),
    () => `<circle cx="12" cy="12" r="9.6" fill="currentColor"/><path d="${starPoly(12, 12, 3.8, 1.7, 5)}" fill="none" stroke="currentColor" stroke-width="0"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/>`);
}
export function mugIconSvg(opts = {}) {
  return statIcon(opts,
    (P) => L_("M17 9.5C21 9.5 21 16.5 17 16.5", 3.6, INK) + L_("M17 9.5C21 9.5 21 16.5 17 16.5", 1.6, P.woodVessel) + R_(5, 7, 12.5, 14, 2, P.woodVessel, 1.3) + R_(4.5, 9, 13.5, 1.8, 0.8, P.pewter, 0.9) + R_(4.5, 17.5, 13.5, 1.8, 0.8, P.pewter, 0.9) + P_("M4 8C3 5 6 3.5 8 4.6C9.5 2 14 2.4 14.6 4.6C16.6 3.8 19 5.6 18 8Z", P.foam, 1.2),
    () => MONO("M5 8H17.5V9.5C21.5 9.5 21.5 17 17.5 17V19C17.5 20.1 16.6 21 15.5 21H7C5.9 21 5 20.1 5 19ZM17.5 11.2V15.3C19.2 15.3 19.2 11.2 17.5 11.2ZM4 7C3.4 4.6 6 3.3 8 4.3C9.5 1.8 14 2.2 14.6 4.3C16.6 3.6 19 5.2 18.2 7Z"));
}
export function gritIconSvg(opts = {}) {
  return statIcon(opts,
    (P) => P_(HEART_D, P.heart, 1.4) + G_("rotate(-35 12 12)", R_(6.5, 10, 11, 4, 1.4, P.bone, 0.9) + C_(10.5, 12, 0.5, P.heartDark, 0) + C_(13.5, 12, 0.5, P.heartDark, 0)) + E_(7.4, 8, 1.6, 1, "#fff", 0, `opacity=".6"`),
    () => MONO(HEART_D));
}
export function buzzIconSvg(opts = {}) {
  return statIcon(opts,
    (P) => C_(9.5, 14, 6.5, P.buzzLight, 1.3) + C_(17, 7.5, 4, P.buzzLight, 1.2) + C_(19, 16.5, 2.2, P.buzzLight, 1) + L_("M9.5 14m-2.6 0a2.6 2.6 0 1 1 2.6 2.6a1.5 1.5 0 1 1 -1.5 -1.5", 1.3, P.buzz) + C_(7.4, 11.6, 1.2, "#fff", 0) + C_(15.8, 6.2, 0.9, "#fff", 0),
    () => `<circle cx="9.5" cy="14" r="6.5" fill="currentColor"/><circle cx="17" cy="7.5" r="4" fill="currentColor"/><circle cx="19" cy="16.5" r="2.2" fill="currentColor"/>`);
}
