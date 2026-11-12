// Bloomwork — procedural inline-SVG art (view only). Pure string builders.
//
// One hidden sprite (<symbol>s) per mounted table; every tile is a tiny
// <svg><use/></svg>, so a 6-gardener table stays light. Colours are CSS
// custom properties (`var(--bw-rose-petal)` …) generated from assets.js by
// styles.js, so light/dark flips need no re-render.
//
// Each flower has a distinct SHAPE as well as a colour so colour-blind
// players can tell them apart: Rose = round spiral bloom, Iris = three-part
// upright bloom, Sunflower = ray burst with a big dark eye, Lilac = cone
// cluster of florets, Fern = a curled leafy frond (no petals at all).
//
// ASSETS.flowerArt[id] / ASSETS.birdArt (urls) replace the drawings.
import { ASSETS } from "./assets.js";

const v = (id, part) => `var(--bw-${id}-${part})`;
const TILE_BG = (id) => `<rect x="3" y="3" width="94" height="94" rx="20" fill="${v(id, "tile")}" stroke="var(--bw-tileEdge)" stroke-width="2.5"/>`;

function rose() {
  const id = "rose";
  const petals = [0, 72, 144, 216, 288].map((a) => {
    const r = (a * Math.PI) / 180;
    return `<circle cx="${(50 + Math.sin(r) * 15).toFixed(1)}" cy="${(47 - Math.cos(r) * 15).toFixed(1)}" r="16" fill="${v(id, "petal")}"/>`;
  }).join("");
  return `${TILE_BG(id)}
    <path d="M30 78 q8 -12 20 -10 q-8 10 -20 10z" fill="var(--bw-leaf)"/>
    <path d="M70 78 q-8 -12 -20 -10 q8 10 20 10z" fill="var(--bw-leafDark)"/>
    ${petals}
    <circle cx="50" cy="47" r="17" fill="${v(id, "deep")}"/>
    <path d="M50 47 m-3 0 a4 4 0 1 1 7 3 a8.5 8.5 0 1 1 -13 -8 a13 13 0 1 1 18 15" fill="none" stroke="${v(id, "heart")}" stroke-width="3.2" stroke-linecap="round"/>`;
}

function iris() {
  const id = "iris";
  return `${TILE_BG(id)}
    <path d="M50 92 L50 58" stroke="var(--bw-leafDark)" stroke-width="4" stroke-linecap="round"/>
    <path d="M50 88 q-16 -10 -14 -30 q8 12 14 22z" fill="var(--bw-leaf)"/>
    <ellipse cx="50" cy="30" rx="11" ry="20" fill="${v(id, "petal")}"/>
    <ellipse cx="33" cy="54" rx="10" ry="19" transform="rotate(48 33 54)" fill="${v(id, "deep")}"/>
    <ellipse cx="67" cy="54" rx="10" ry="19" transform="rotate(-48 67 54)" fill="${v(id, "deep")}"/>
    <ellipse cx="50" cy="48" rx="7" ry="10" fill="${v(id, "petal")}"/>
    <ellipse cx="50" cy="47" rx="3" ry="6" fill="${v(id, "heart")}"/>`;
}

function sun() {
  const id = "sun";
  const rays = Array.from({ length: 14 }, (_, i) => {
    const a = (i * 360) / 14;
    return `<ellipse cx="50" cy="24" rx="6.5" ry="15" fill="${i % 2 ? v(id, "deep") : v(id, "petal")}" transform="rotate(${a.toFixed(1)} 50 50)"/>`;
  }).join("");
  const seeds = [[44, 45], [52, 43], [57, 50], [50, 52], [44, 55], [53, 58]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="${v(id, "deep")}" opacity=".7"/>`).join("");
  return `${TILE_BG(id)}${rays}
    <circle cx="50" cy="50" r="16" fill="${v(id, "heart")}"/>${seeds}`;
}

function lilac() {
  const id = "lilac";
  // A cone of florets, widest at the top, tapering down the stem.
  const rows = [[26, 5, 26], [36, 4, 23], [46, 4, 19], [56, 3, 15], [65, 2, 11], [73, 1, 0]];
  const florets = rows.map(([y, n, half]) => Array.from({ length: n }, (_, i) => {
    const x = n === 1 ? 50 : 50 - half + (i * half * 2) / (n - 1);
    const fill = (i + n) % 2 ? v(id, "petal") : v(id, "deep");
    return `<circle cx="${x.toFixed(1)}" cy="${y}" r="7" fill="${fill}"/><circle cx="${x.toFixed(1)}" cy="${y}" r="1.8" fill="${v(id, "heart")}"/>`;
  }).join("")).join("");
  return `${TILE_BG(id)}
    <path d="M50 92 L50 74" stroke="var(--bw-leafDark)" stroke-width="4" stroke-linecap="round"/>
    <path d="M50 86 q-20 2 -22 -12 q14 -2 22 12z" fill="var(--bw-leaf)"/>
    <path d="M50 86 q20 2 22 -12 q-14 -2 -22 12z" fill="var(--bw-leafDark)"/>
    ${florets}`;
}

function fern() {
  const id = "fern";
  const leaflets = [];
  for (let i = 0; i < 6; i += 1) {
    const t = i / 6;
    const y = 82 - i * 10.5;
    const x = 50 + Math.sin(t * 2.2) * 8;
    const len = 17 - i * 2.2;
    leaflets.push(`<ellipse cx="${(x - len * 0.7).toFixed(1)}" cy="${(y - 3).toFixed(1)}" rx="${len.toFixed(1)}" ry="4.4" transform="rotate(-24 ${(x - len * 0.7).toFixed(1)} ${(y - 3).toFixed(1)})" fill="${v(id, "petal")}"/>`);
    leaflets.push(`<ellipse cx="${(x + len * 0.7).toFixed(1)}" cy="${(y - 3).toFixed(1)}" rx="${len.toFixed(1)}" ry="4.4" transform="rotate(24 ${(x + len * 0.7).toFixed(1)} ${(y - 3).toFixed(1)})" fill="${v(id, "deep")}"/>`);
  }
  return `${TILE_BG(id)}${leaflets.join("")}
    <path d="M50 92 C50 70 60 50 56 30 C53 18 40 16 40 26 C40 32 48 32 48 27" fill="none" stroke="${v(id, "deep")}" stroke-width="3.6" stroke-linecap="round"/>`;
}

function bird() {
  return `<circle cx="50" cy="50" r="47" fill="var(--bw-stone)" stroke="var(--bw-birdWing)" stroke-width="4"/>
    <path d="M24 66 q10 -2 18 -8" stroke="var(--bw-birdWing)" stroke-width="5" stroke-linecap="round" fill="none"/>
    <ellipse cx="52" cy="54" rx="24" ry="20" fill="var(--bw-birdBody)"/>
    <ellipse cx="58" cy="62" rx="14" ry="11" fill="var(--bw-birdBelly)"/>
    <path d="M40 50 q8 -10 20 -2 q-6 12 -20 2z" fill="var(--bw-birdWing)"/>
    <circle cx="66" cy="40" r="13" fill="var(--bw-birdBody)"/>
    <path d="M77 38 l12 4 l-12 4z" fill="var(--bw-birdBeak)"/>
    <circle cx="69" cy="37" r="2.8" fill="var(--bw-birdEye)"/>
    <path d="M48 74 l-3 9 M58 75 l2 9" stroke="var(--bw-birdBeak)" stroke-width="3" stroke-linecap="round"/>`;
}

function pot() {
  const specks = [[38, 36], [60, 32], [66, 58], [34, 62], [50, 70], [56, 46], [42, 50]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="var(--bw-soilSpeck)"/>`).join("");
  return `<circle cx="50" cy="50" r="49" fill="var(--bw-potDark)"/>
    <circle cx="50" cy="49" r="47" fill="var(--bw-pot)"/>
    <circle cx="50" cy="49" r="42" fill="none" stroke="var(--bw-potRim)" stroke-width="3"/>
    <circle cx="50" cy="50" r="39" fill="var(--bw-soilDark)"/>
    <circle cx="50" cy="51" r="37" fill="var(--bw-soil)"/>${specks}`;
}

const DRAW = { rose, iris, sun, lilac, fern };

export function spriteSvg() {
  const flowers = Object.entries(DRAW)
    .map(([id, fn]) => `<symbol id="bw-f-${id}" viewBox="0 0 100 100">${fn()}</symbol>`).join("");
  return `<svg class="bw-sprite" width="0" height="0" aria-hidden="true" focusable="false"><defs>${flowers}
    <symbol id="bw-bird" viewBox="0 0 100 100">${bird()}</symbol>
    <symbol id="bw-pot" viewBox="0 0 100 100">${pot()}</symbol></defs></svg>`;
}

const safeUrl = (url) => String(url).replace(/["'()\\]/g, encodeURIComponent);

// One flower tile. `cls` adds state classes (bw-ghost, bw-wm, bw-pop …);
// `style` carries an animation delay when the tile is animating.
export function tileSvg(flower, cls = "", style = "") {
  const st = style ? ` style="${style}"` : "";
  const url = ASSETS.flowerArt && ASSETS.flowerArt[flower];
  if (url) return `<span class="bw-tile bw-tile-img ${cls}" style="background-image:url('${safeUrl(url)}')${style ? `;${style}` : ""}"></span>`;
  if (!DRAW[flower]) return `<span class="bw-tile bw-tile-none ${cls}"${st}></span>`;
  return `<svg class="bw-tile ${cls}" data-f="${flower}" viewBox="0 0 100 100" aria-hidden="true"${st}><use href="#bw-f-${flower}"/></svg>`;
}

export function birdSvg(cls = "") {
  if (ASSETS.birdArt) return `<span class="bw-bird bw-tile-img ${cls}" style="background-image:url('${safeUrl(ASSETS.birdArt)}')"></span>`;
  return `<svg class="bw-bird ${cls}" viewBox="0 0 100 100" aria-hidden="true"><use href="#bw-bird"/></svg>`;
}

export function potSvg() {
  return `<svg class="bw-pot" viewBox="0 0 100 100" aria-hidden="true"><use href="#bw-pot"/></svg>`;
}
