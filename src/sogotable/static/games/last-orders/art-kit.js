// Last Orders — shared SVG drawing kit (pure string builders, no rules, no DOM).
//
// The primitives every Last Orders art module draws with: unique-id counter,
// seeded randomness, colour maths, the INK outline colour + stroke, the
// P_/C_/E_/R_/L_/G_ shape builders, shared face bits and the svg wrappers.
// Split out of art.js so portraits.js and art.js share one id counter and one
// INK. INK is a live export: read it anywhere, set it only via setInk().
import { paletteFor } from "./assets.js";

// ---------- small helpers ----------
let SEQ = 0;
export const nextId = (prefix = "lo") => `${prefix}${(SEQ += 1).toString(36)}`;
export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function seeded(seedText) {
  let a = hashString(seedText) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function esc(text) { return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
export const f1 = (n) => (Math.round(n * 10) / 10).toString();
function rgb(hex) {
  const h = String(hex).replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
}
export function mix(a, b, t) {
  const x = rgb(a); const y = rgb(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}
export const lighten = (c, t) => mix(c, "#ffffff", t);
export const darken = (c, t) => mix(c, "#000000", t);
function hslHex(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}
export const hashColor = (seed, s = 0.55, l = 0.55) => hslHex(hashString(String(seed)) % 360, s, l);

// Outline colour for the current drawing (set at the top of every export —
// builders are synchronous, so this never leaks between calls).
export let INK = "#3b2a1f";
/** Set the outline colour (importers can read INK live but cannot assign it). */
export function setInk(color) { INK = color; }
const SW = 1.6;
const stroke = (sw = SW) => (sw === 0 ? "" : ` stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`);
export const P_ = (d, fill, sw = SW, extra = "") => `<path d="${d}" fill="${fill}"${stroke(sw)}${extra ? ` ${extra}` : ""}/>`;
export const C_ = (cx, cy, r, fill, sw = SW, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${stroke(sw)}${extra ? ` ${extra}` : ""}/>`;
export const E_ = (cx, cy, rx, ry, fill, sw = SW, extra = "") => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${stroke(sw)}${extra ? ` ${extra}` : ""}/>`;
export const R_ = (x, y, w, h, rx, fill, sw = SW, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${stroke(sw)}${extra ? ` ${extra}` : ""}/>`;
export const L_ = (d, sw = SW, color = INK, extra = "") => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${extra ? ` ${extra}` : ""}/>`;
export const mir = (s) => `<g transform="matrix(-1 0 0 1 100 0)">${s}</g>`;
export const both = (s) => s + mir(s);
export const G_ = (transform, s) => `<g transform="${transform}">${s}</g>`;
export const star4 = (x, y, r, fill) => P_(`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`, fill, 0.8);
export function starPoly(cx, cy, outer, inner, points) {
  const pts = [];
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 ? inner : outer; const a = (Math.PI * i) / points - Math.PI / 2;
    pts.push(`${f1(cx + r * Math.cos(a))} ${f1(cy + r * Math.sin(a))}`);
  }
  return `M${pts.join("L")}Z`;
}
// Face bits shared by several patrons.
export const dotEyes = (x1, x2, y, r = 2.2) => [x1, x2].map((x) => C_(x, y, r, INK, 0) + C_(f1(x + r * 0.35), f1(y - r * 0.4), f1(r * 0.4), "#fff", 0)).join("");
export const arcEyes = (x1, x2, y, w = 4, up = true) => [x1, x2].map((x) => L_(`M${x - w} ${y}Q${x} ${up ? y - w : y + w * 0.8} ${x + w} ${y}`, 1.8)).join("");
export const blush = (x1, x2, y, rx, color, op = 0.5) => [x1, x2].map((x) => E_(x, y, rx, rx * 0.65, color, 0, `opacity="${op}"`)).join("");

export function svgWrap(inner, { size, label, viewBox = "0 0 100 100", extra = "" } = {}) {
  const dims = size ? ` width="${size}" height="${Math.round(size * (Number(viewBox.split(" ")[3]) / Number(viewBox.split(" ")[2])))}"` : "";
  const aria = label ? ` role="img" aria-label="${esc(label)}"` : ` aria-hidden="true"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${dims}${aria}${extra}>${inner}</svg>`;
}
export function imageSvg(url, { size, label, viewBox = "0 0 100 100", rx = 16 } = {}) {
  const [, , w, h] = viewBox.split(" ").map(Number);
  const id = nextId("loi");
  return svgWrap(`<defs><clipPath id="${id}"><rect width="${w}" height="${h}" rx="${rx}"/></clipPath></defs><image href="${esc(url)}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`, { size, label, viewBox });
}
export const paletteOf = (opts = {}) => opts.palette || paletteFor(opts.theme);

/** Wrap an SVG string as a `data:` URL (for CSS backgrounds or <img src>). */
export function svgDataUrl(svg) { return `data:image/svg+xml,${encodeURIComponent(svg)}`; }
