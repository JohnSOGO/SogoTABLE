// Hidden Isles — original inline-SVG art (pure string builders, no DOM).
//
// Every colour is a `var(--hi-*)` token (assets.js palette → styles.js), so
// the art follows light/dark with no re-render. Colours are applied through
// style="" (not presentation attributes) so var() works on every browser.
// A non-null ASSETS.art[key] replaces the built-in picture with an <img>.
import { ASSETS } from "./assets.js";

const v = (name) => `var(--hi-${name.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`)})`;
// style="fill;stroke;stroke-width" helper
function st(fill, stroke, width) {
  const parts = [`fill:${fill ? v(fill) : "none"}`];
  if (stroke) parts.push(`stroke:${v(stroke)}`, `stroke-width:${width || 1}`);
  return `style="${parts.join(";")}"`;
}
const line = (stroke, width) => `style="fill:none;stroke:${v(stroke)};stroke-width:${width};stroke-linecap:round;stroke-linejoin:round"`;

// ---------- crew badges (40×40) ----------
function parrot() {
  return `<circle cx="20" cy="20" r="18.5" ${st("crewASoft", "crewA", 2)}/>
    <path d="M14 33 C11 29 11 22 15 19 C18 17 23 18 25 22 C27 27 24 32 20 36 Z" ${st("crewA")}/>
    <path d="M17 24 C20 25 22 29 20 34 C17 32 15 28 17 24 Z" ${st("crewAInk")} opacity=".55"/>
    <path d="M15 35 L12 39 L17 37 Z" ${st("crewAInk")}/>
    <circle cx="20.5" cy="14.5" r="7.5" ${st("crewA")}/>
    <path d="M15 9 C14 5 17 3 18 6 M18 8 C18 3 22 2 21.5 6.5" ${line("crewA", 2.2)}/>
    <path d="M27 12 C31 12 32.5 16 30 19.5 C29.5 17.5 28 16.5 26.5 16.5 Z" ${st("beak", "cardInk", 0.8)}/>
    <circle cx="22.5" cy="13" r="2.6" ${st("foam")}/>
    <circle cx="23.1" cy="13.2" r="1.3" ${st("cardInk")}/>`;
}

function dolphin() {
  return `<circle cx="20" cy="20" r="18.5" ${st("crewBSoft", "crewB", 2)}/>
    <path d="M5.5 26 C8 17 16 10.5 26 11 C30 11.2 33 12.6 34.8 15 L36.5 16.2 L33.6 17.1 C30 16 26 16.4 22.8 18.4 C19.4 20.6 16.6 24.6 15.2 28.6 L17.6 32.6 L12.4 30.8 L8 33.4 L9.4 28.4 Z" ${st("crewB")}/>
    <path d="M19 11.6 L16.2 5.6 L24.4 11 Z" ${st("crewB")}/>
    <path d="M22 19 L20.2 23.8 L25 20.4 Z" ${st("crewBInk")} opacity=".6"/>
    <path d="M11 24 C14 19 19 16.4 24.6 15.8" ${line("foam", 1.4)} opacity=".7"/>
    <circle cx="29.4" cy="13.6" r="1.25" ${st("cardInk")}/>
    <path d="M9 36 C12 34.4 15 34.4 18 36 M22 36 C25 34.4 28 34.4 31 36" ${line("crewB", 1.4)} opacity=".7"/>`;
}

export function crewBadge(team, size = 28) {
  const body = team === "A" ? parrot() : team === "B" ? dolphin() : "";
  return `<svg class="hi-badge" viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}</svg>`;
}

// ---------- card art (100×64, drawn in the upper part of a card) ----------
function water() {
  return `<path d="M10 54 C18 50 26 50 34 54 S50 58 58 54 S74 50 82 54 S92 56 96 54" ${line("foam", 2)} opacity=".55"/>`;
}

function island(team) {
  const tint = team === "B" ? "crewB" : "crewA";
  return `${water()}
    <ellipse cx="50" cy="47" rx="34" ry="8.5" ${st("sand")}/>
    <ellipse cx="50" cy="43.5" rx="24" ry="7.5" ${st(tint)}/>
    <path d="M55 43 C56 34 53 24 47 15" ${line("trunk", 3.6)}/>
    <path d="M47 15 C40 10 32 12 28 18 C35 15 41 15 47 15 Z" ${st("leaf")}/>
    <path d="M47 15 C52 8 61 8 66 13 C59 12 53 13 47 15 Z" ${st("leaf")}/>
    <path d="M47 15 C44 8 46 3 49 1.5 C48.5 7 48 11 47 15 Z" ${st("leaf")}/>
    <path d="M47 15 C55 15 61 19 62 25 C57 20 52 17 47 15 Z" ${st("leaf")}/>
    <path d="M47 15 C40 17 36 22 36 28 C40 22 43 19 47 15 Z" ${st("leaf")}/>
    <circle cx="47.6" cy="17.6" r="2" ${st("trunk")}/><circle cx="50.6" cy="17" r="1.8" ${st("trunk")}/>
    <path d="M71 44 L71 26" ${line("cardInk", 1.4)}/>
    <path d="M71 26 L80 29.5 L71 33 Z" ${st(tint, "cardInk", 0.8)}/>`;
}

function sandbar() {
  return `${water()}
    <path d="M12 46 C22 38 40 36 54 38 C68 40 82 41 90 46 C76 49.5 30 50 12 46 Z" ${st("sand")}/>
    <path d="M24 44 C34 42 44 42 52 43 M60 44 C68 43.5 74 44 80 45" ${line("sandSoft", 1.4)}/>
    <path d="M38 34.5 L39.6 38 L43.4 38.2 L40.4 40.4 L41.6 44 L38.4 41.8 L35.2 44 L36.4 40.4 L33.4 38.2 L37.2 38 Z" ${st("crewA", "crewAInk", 0.6)} opacity=".9"/>
    <path d="M64 41 C64 36.5 70 36.5 70 41 Z" ${st("foam", "sandInk", 0.8)}/>
    <path d="M65.4 41 L66.4 37.6 M67 41 L67 37.2 M68.6 41 L67.6 37.6" ${line("sandInk", 0.6)}/>
    <path d="M20 22 q3 -3 6 0 q3 -3 6 0 M66 16 q2.5 -2.5 5 0 q2.5 -2.5 5 0" ${line("cardInk", 1.3)} opacity=".45"/>`;
}

function kraken() {
  const tentacle = (d) => `<path d="${d}" ${line("kraken", 5)}/>`;
  return `${water()}
    ${tentacle("M34 40 C26 44 22 50 26 55 C29 58 33 55 31 52")}
    ${tentacle("M42 43 C40 50 40 55 44 58")}
    ${tentacle("M58 43 C60 50 60 55 56 58")}
    ${tentacle("M66 40 C74 44 78 50 74 55 C71 58 67 55 69 52")}
    <path d="M30 41 C28 22 38 6 50 6 C62 6 72 22 70 41 C64 45 36 45 30 41 Z" ${st("kraken")}/>
    <ellipse cx="44" cy="12.5" rx="5" ry="3" ${st("foam")} opacity=".28"/>
    <circle cx="43" cy="26" r="5.4" ${st("foam")}/><circle cx="57" cy="26" r="5.4" ${st("foam")}/>
    <circle cx="44" cy="27" r="2.6" ${st("cardInk")}/><circle cx="56" cy="27" r="2.6" ${st("cardInk")}/>
    <circle cx="44.9" cy="26" r=".9" ${st("foam")}/><circle cx="56.9" cy="26" r=".9" ${st("foam")}/>
    <path d="M44 35 C47.5 38.5 52.5 38.5 56 35" ${line("krakenInk", 1.8)}/>
    <ellipse cx="37.5" cy="33" rx="3" ry="1.8" ${st("crewA")} opacity=".45"/>
    <ellipse cx="62.5" cy="33" rx="3" ry="1.8" ${st("crewA")} opacity=".45"/>
    <circle cx="25.6" cy="50.4" r="1.1" ${st("krakenSoft")}/><circle cx="74.4" cy="50.4" r="1.1" ${st("krakenSoft")}/>`;
}

const CARD_ART = { A: () => island("A"), B: () => island("B"), neutral: sandbar, trap: kraken };

export function cardArt(key) {
  const override = ASSETS.art && ASSETS.art[key];
  if (override) return `<img class="hi-art-img" src="${encodeURI(override)}" alt="" draggable="false">`;
  const build = CARD_ART[key];
  if (!build) return "";
  return `<svg class="hi-art-svg" viewBox="0 0 100 64" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${build()}</svg>`;
}

// Small tile icon for log chips / legends (square 64×64 crop of the card art).
export function tileIcon(key, size = 18) {
  const build = CARD_ART[key];
  if (!build) return "";
  return `<svg class="hi-tile-icon" viewBox="18 0 64 64" width="${size}" height="${size}" aria-hidden="true" focusable="false">${build()}</svg>`;
}

// ---------- sea-chart background motif (behind the grid) ----------
function compassRose(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 16; i += 1) {
    const a = (Math.PI * 2 * i) / 16 - Math.PI / 2;
    const rr = i % 4 === 0 ? r : i % 2 === 0 ? r * 0.62 : r * 0.24;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r * 0.82}" ${st(null, "seaLine", 2)}/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.7}" ${st(null, "seaLine", 1)}/>
    <polygon points="${pts.join(" ")}" ${st("seaLine")}/>
    <text x="${cx}" y="${cy - r - 6}" text-anchor="middle" font-size="${r * 0.32}" font-weight="800" style="fill:${v("seaLine")}">N</text>`;
}

export function seaChart() {
  const override = ASSETS.art && ASSETS.art.sea;
  if (override) return `<img class="hi-sea-img" src="${encodeURI(override)}" alt="" draggable="false">`;
  const waves = [];
  for (let row = 0; row < 7; row += 1) {
    const y = 40 + row * 70;
    const x0 = row % 2 ? 30 : 70;
    waves.push(`<path d="M${x0} ${y} q8 -7 16 0 q8 -7 16 0" ${line("seaLine", 2.2)}/>`);
    waves.push(`<path d="M${x0 + 260} ${y + 30} q8 -7 16 0 q8 -7 16 0" ${line("seaLine", 2.2)}/>`);
  }
  return `<svg class="hi-sea-svg" viewBox="0 0 500 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <path d="M0 125 H500 M0 250 H500 M0 375 H500 M125 0 V500 M250 0 V500 M375 0 V500" ${st(null, "seaLine", 1)} stroke-dasharray="4 8"/>
    ${compassRose(400, 410, 70)}
    ${waves.join("")}
  </svg>`;
}

// Compass emoji stand-in for the Navigator badge, as tiny SVG (crisp everywhere).
export function compassIcon(size = 14) {
  return `<svg class="hi-compass" viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true" focusable="false">
    <circle cx="10" cy="10" r="8.6" ${st("card", "cardInk", 1.4)}/>
    <path d="M10 3.4 L12.4 10 L10 16.6 L7.6 10 Z" ${st("crewA")}/>
    <path d="M10 10 L12.4 10 L10 16.6 L7.6 10 Z" ${st("muted")}/>
    <circle cx="10" cy="10" r="1.3" ${st("cardInk")}/>
  </svg>`;
}
