// Reefkeepers — original procedural SVG art.
//
// One hidden <svg> of <symbol>s per mount (artDefs) holds every habitat half,
// the Grotto and the pearl, each drawn in a 100×100 box. Boards and tiles then
// just <use href="#rk-h-kelp">. Every colour is a CSS custom property (--rk-*,
// emitted from assets.js by styles.js), so a light/dark flip restyles the art
// with no repaint. Textures are bold and few so each habitat reads at ~44px on
// a phone. An image URL in ASSETS (habitats / grotto / pearl) replaces the
// procedural drawing for that symbol.
import { ASSETS } from "./assets.js";
import { HABITAT_IDS } from "./branding.js";

const v = (name) => `var(--rk-${name})`;
const f = (name) => `style="fill:${v(name)}"`;
const s = (name, w) => `style="fill:none;stroke:${v(name)};stroke-width:${w};stroke-linecap:round;stroke-linejoin:round"`;

const image = (url) => `<image href="${String(url).replace(/"/g, "&quot;")}" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice"/>`;

const DRAW = {
  // Sandbar — pale dune with three bold ripple lines and a few grains.
  sand: () => `<rect width="100" height="100" ${f("sand-bg")}/>
    <path d="M-4 30 Q 12 20 28 30 T 60 30 T 92 30 T 124 30" ${s("sand-ink", 6)}/>
    <path d="M-4 56 Q 12 46 28 56 T 60 56 T 92 56 T 124 56" ${s("sand-ink", 6)}/>
    <path d="M-4 82 Q 12 72 28 82 T 60 82 T 92 82 T 124 82" ${s("sand-ink", 6)}/>
    <path d="M-4 24 Q 12 14 28 24 T 60 24" ${s("sand-hi", 3)}/>
    <circle cx="74" cy="12" r="2.6" ${f("sand-ink")}/><circle cx="18" cy="68" r="2.4" ${f("sand-ink")}/><circle cx="82" cy="94" r="2.2" ${f("sand-ink")}/>`,
  // Kelp Forest — deep green water with two tall swaying fronds.
  kelp: () => `<rect width="100" height="100" ${f("kelp-bg")}/>
    <path d="M30 104 C 18 80 42 62 28 40 S 34 8 30 -4" ${s("kelp-ink", 7)}/>
    <path d="M70 104 C 82 82 58 64 72 44 S 66 12 72 -4" ${s("kelp-ink", 7)}/>
    <ellipse cx="40" cy="64" rx="11" ry="5" transform="rotate(-30 40 64)" ${f("kelp-hi")}/>
    <ellipse cx="20" cy="38" rx="11" ry="5" transform="rotate(30 20 38)" ${f("kelp-hi")}/>
    <ellipse cx="60" cy="70" rx="11" ry="5" transform="rotate(30 60 70)" ${f("kelp-hi")}/>
    <ellipse cx="81" cy="36" rx="11" ry="5" transform="rotate(-30 81 36)" ${f("kelp-hi")}/>
    <ellipse cx="38" cy="16" rx="9" ry="4" transform="rotate(-30 38 16)" ${f("kelp-hi")}/>`,
  // Lagoon — bright shallow water, rows of white wavelets.
  lagoon: () => `<rect width="100" height="100" ${f("lagoon-bg")}/>
    <circle cx="78" cy="22" r="20" ${f("lagoon-hi")} opacity=".55"/>
    <path d="M10 28 q 10 -10 20 0 M44 22 q 10 -10 20 0" ${s("lagoon-ink", 5)}/>
    <path d="M22 54 q 10 -10 20 0 q 10 10 20 0 M76 50 q 8 -8 16 0" ${s("lagoon-ink", 5)}/>
    <path d="M6 82 q 10 -10 20 0 M48 80 q 10 -10 20 0 q 10 10 20 0" ${s("lagoon-ink", 5)}/>`,
  // Seagrass Meadow — a fan of upright blades on a light green bed.
  seagrass: () => `<rect width="100" height="100" ${f("seagrass-bg")}/>
    <path d="M12 100 Q 8 70 18 46 M26 100 Q 28 66 20 30 M40 100 Q 36 72 46 52 M54 100 Q 58 62 50 22 M68 100 Q 64 74 74 50 M82 100 Q 86 66 78 34 M94 100 Q 92 80 98 62" ${s("seagrass-ink", 6)}/>
    <path d="M26 92 Q 27 70 22 44 M54 92 Q 57 66 52 36 M82 92 Q 85 70 80 46" ${s("seagrass-hi", 2.5)}/>
    <path d="M4 24 L 14 18 M62 10 l 8 -4" ${s("seagrass-hi", 3)}/>`,
  // Coral Garden — a pink bed with one bold branching coral and polyp tips.
  coral: () => `<rect width="100" height="100" ${f("coral-bg")}/>
    <path d="M50 100 L 50 66 M50 74 C 50 60 30 60 28 40 M28 50 C 22 44 16 40 14 26 M30 44 C 34 34 34 26 38 18 M50 70 C 54 56 72 58 74 38 M74 46 C 80 40 86 34 86 22 M72 42 C 66 32 64 24 62 14 M50 66 L 50 34" ${s("coral-ink", 8)}/>
    <circle cx="14" cy="24" r="5.5" ${f("coral-hi")}/><circle cx="38" cy="16" r="5.5" ${f("coral-hi")}/><circle cx="50" cy="32" r="5.5" ${f("coral-hi")}/>
    <circle cx="62" cy="12" r="5.5" ${f("coral-hi")}/><circle cx="86" cy="20" r="5.5" ${f("coral-hi")}/>
    <circle cx="16" cy="88" r="4" ${f("coral-ink")} opacity=".5"/><circle cx="84" cy="86" r="4" ${f("coral-ink")} opacity=".5"/>`,
  // Deep Trench — a dark rift with glowing specks.
  trench: () => `<rect width="100" height="100" ${f("trench-bg")}/>
    <path d="M38 -4 C 50 20 30 40 48 58 S 52 90 60 104 L 76 104 C 66 84 72 62 60 46 S 64 12 56 -4 Z" ${f("trench-ink")}/>
    <circle cx="20" cy="26" r="7" ${f("trench-hi")} opacity=".25"/><circle cx="20" cy="26" r="3.4" ${f("trench-hi")}/>
    <circle cx="84" cy="44" r="7" ${f("trench-hi")} opacity=".25"/><circle cx="84" cy="44" r="3.4" ${f("trench-hi")}/>
    <circle cx="57" cy="52" r="5.5" ${f("trench-hi")} opacity=".3"/><circle cx="57" cy="52" r="2.6" ${f("trench-hi")}/>
    <circle cx="80" cy="16" r="2" ${f("trench-hi")} opacity=".7"/><circle cx="16" cy="84" r="2" ${f("trench-hi")} opacity=".7"/>`,
};

// The Grotto — a scallop-shell arch over a dark doorway: your reef's home.
function grottoDraw() {
  const ribs = [-60, -36, -12, 12, 36, 60].map((a) => {
    const r = (a * Math.PI) / 180;
    const x = (50 + Math.sin(r) * 38).toFixed(1); const y = (66 - Math.cos(r) * 38).toFixed(1);
    return `M50 66 L ${x} ${y}`;
  }).join(" ");
  return `<rect width="100" height="100" ${f("grotto-bg")}/>
    <path d="M8 66 A 42 42 0 0 1 92 66 Z" ${f("grotto-shell")}/>
    <path d="M8 66 A 42 42 0 0 1 92 66" ${s("grotto-rib", 4)}/>
    <path d="${ribs}" ${s("grotto-rib", 4)}/>
    <path d="M36 92 L 36 70 A 14 14 0 0 1 64 70 L 64 92 Z" ${f("grotto-door")}/>
    <rect x="22" y="88" width="56" height="8" rx="4" ${f("grotto-rib")}/>`;
}

function pearlDraw() {
  return `<circle cx="10" cy="10.8" r="9.4" style="fill:${v("pearl-rim")}"/>
    <circle cx="10" cy="10" r="8" fill="url(#rk-pearl-grad)"/>
    <circle cx="7.2" cy="7.2" r="2.4" fill="#fff" opacity=".95"/>`;
}

// The hidden defs block: one per mounted root (ids are document-global).
export function artDefs() {
  const habitats = HABITAT_IDS.map((id) => {
    const url = ASSETS.habitats && ASSETS.habitats[id];
    return `<symbol id="rk-h-${id}" viewBox="0 0 100 100">${url ? image(url) : DRAW[id]()}</symbol>`;
  }).join("");
  const pearlUrl = ASSETS.pearl;
  return `<svg class="rk-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
    <radialGradient id="rk-pearl-grad" cx="35%" cy="35%" r="70%">
      <stop offset="0%" style="stop-color:${v("pearl")}"/><stop offset="100%" style="stop-color:${v("pearl-shade")}"/>
    </radialGradient>
    <symbol id="rk-h-unknown" viewBox="0 0 100 100"><rect width="100" height="100" ${f("empty")}/></symbol>
    ${habitats}
    <symbol id="rk-grotto" viewBox="0 0 100 100">${ASSETS.grotto ? image(ASSETS.grotto) : grottoDraw()}</symbol>
    <symbol id="rk-pearl" viewBox="0 0 20 20">${pearlUrl ? `<image href="${String(pearlUrl).replace(/"/g, "&quot;")}" width="20" height="20"/>` : pearlDraw()}</symbol>
  </defs></svg>`;
}

const habitatRef = (t) => (HABITAT_IDS.includes(t) ? `#rk-h-${t}` : "#rk-h-unknown");

// Pearls sit in a row along the bottom-right of a cell (x,y = cell origin, k = cell size).
function pearlsAt(x, y, k, count) {
  const n = Math.max(0, Math.min(4, Number(count) || 0));
  const d = k * 0.26;
  let out = "";
  for (let i = 0; i < n; i += 1) {
    out += `<use href="#rk-pearl" x="${x + k - d * (i + 1) - k * 0.04}" y="${y + k - d - k * 0.05}" width="${d}" height="${d}"/>`;
  }
  return out;
}

// One habitat half at (x,y) of size k, with its pearls.
export function halfSvg(t, p, x, y, k) {
  return `<use href="${habitatRef(t)}" x="${x}" y="${y}" width="${k}" height="${k}"/>${pearlsAt(x, y, k, p)}`;
}

export function grottoSvg(x, y, k) {
  return `<use href="#rk-grotto" x="${x}" y="${y}" width="${k}" height="${k}"/>`;
}

const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// A whole tile as a standalone <svg>: A half at the origin, B half per rot
// (0 east, 1 south, 2 west, 3 north). Used for the draft row and pending tile.
export function tileSvg(tile, rot = 0, cls = "rk-tile-svg") {
  if (!tile) return "";
  const [dx, dy] = DIR[((rot % 4) + 4) % 4];
  const ax = dx < 0 ? 1 : 0; const ay = dy < 0 ? 1 : 0;
  const w = dx ? 2 : 1; const h = dy ? 2 : 1;
  const k = 100; const g = 3;
  const a = halfSvg(tile.a, tile.ap, ax * k + g, ay * k + g, k - 2 * g);
  const b = halfSvg(tile.b, tile.bp, (ax + dx) * k + g, (ay + dy) * k + g, k - 2 * g);
  return `<svg class="${cls}" viewBox="0 0 ${w * k} ${h * k}" aria-hidden="true">
    <rect x="1" y="1" width="${w * k - 2}" height="${h * k - 2}" rx="10" class="rk-tile-frame"/>${a}${b}</svg>`;
}

// A single habitat swatch (legend / score breakdown chips).
export function swatchSvg(t) {
  return `<svg class="rk-sw" viewBox="0 0 100 100" aria-hidden="true"><use href="${habitatRef(t)}" width="100" height="100"/></svg>`;
}
export function pearlIcon() {
  return `<svg class="rk-pearl-ico" viewBox="0 0 20 20" aria-hidden="true"><use href="#rk-pearl" width="20" height="20"/></svg>`;
}
