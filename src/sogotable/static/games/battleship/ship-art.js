// Battleship — pure SVG ship builders. No DOM, no game state: each call returns
// markup for one ship, drawn top-down with shaded hull gradients, deck detail,
// raised superstructure and a cast shadow so it reads as a 3D model sitting on
// the water. Art is authored HORIZONTAL, bow to the right, in a viewBox of
// (size*100) × 100; vertical ships are the same drawing rotated 90°.
//
// `overrideUrl` (from ASSETS.ships) swaps the drawing for an image, laid out the
// same way. `uid` must be unique per ship in the document (gradient ids).

const f = (n) => Math.round(n * 10) / 10;

function defs(uid, p, sub) {
  const hull = sub ? p.subHull : p.hull;
  const light = sub ? p.subLight : p.hullLight;
  return `<defs>
    <linearGradient id="h${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.hullDark}"/><stop offset=".3" stop-color="${light}"/>
      <stop offset=".55" stop-color="${hull}"/><stop offset="1" stop-color="${p.hullDark}"/>
    </linearGradient>
    <linearGradient id="d${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.deck}"/><stop offset=".45" stop-color="${p.deckLight}"/><stop offset="1" stop-color="${p.deck}"/>
    </linearGradient>
    <linearGradient id="t${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.tower}"/><stop offset=".6" stop-color="${p.tower}"/><stop offset="1" stop-color="${p.towerDark}"/>
    </linearGradient>
    <radialGradient id="r${uid}" cx=".38" cy=".35" r=".7">
      <stop offset="0" stop-color="${p.deckLight}"/><stop offset=".55" stop-color="${p.towerDark}"/><stop offset="1" stop-color="${p.gun}"/>
    </radialGradient>
  </defs>`;
}

// Pointed-bow hull outline between y=top..bottom.
function hullPath(w, top, bottom) {
  const mid = (top + bottom) / 2;
  const h = bottom - top;
  return `M14 ${f(top + h * 0.06)} L${f(w - 78)} ${top} Q${f(w - 22)} ${f(top + h * 0.1)} ${f(w - 5)} ${mid} Q${f(w - 22)} ${f(bottom - h * 0.1)} ${f(w - 78)} ${bottom} L14 ${f(bottom - h * 0.06)} Q5 ${f(bottom - h * 0.1)} 5 ${mid} Q5 ${f(top + h * 0.1)} 14 ${f(top + h * 0.06)} Z`;
}

function block(uid, x, y, w, h, p, rx = 3) {
  return `<rect x="${f(x + 4)}" y="${f(y + 5)}" width="${f(w)}" height="${f(h)}" rx="${rx}" fill="${p.shadow}"/>`
    + `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${rx}" fill="url(#t${uid})" stroke="${p.towerDark}" stroke-width="1"/>`;
}

function windows(x, y, w, p) {
  let out = "";
  for (let i = 0; i < Math.floor(w / 9); i += 1) out += `<rect x="${f(x + 3 + i * 9)}" y="${f(y)}" width="5" height="3" fill="${p.window}"/>`;
  return out;
}

function turret(uid, cx, cy, p, aft = false, barrels = 2) {
  const dir = aft ? -1 : 1;
  let guns = "";
  for (let i = 0; i < barrels; i += 1) {
    const y = cy + (i - (barrels - 1) / 2) * 7;
    guns += `<line x1="${cx}" y1="${f(y)}" x2="${f(cx + dir * 36)}" y2="${f(y)}" stroke="${p.gun}" stroke-width="3.8" stroke-linecap="round"/>`;
  }
  return `<circle cx="${cx + 3}" cy="${cy + 4}" r="16" fill="${p.shadow}"/>${guns}`
    + `<circle cx="${cx}" cy="${cy}" r="16" fill="url(#r${uid})" stroke="${p.gun}" stroke-width="1.2"/>`;
}

function funnel(cx, cy, p) {
  return `<ellipse cx="${cx + 3}" cy="${cy + 4}" rx="11" ry="9" fill="${p.shadow}"/>`
    + `<ellipse cx="${cx}" cy="${cy}" rx="11" ry="9" fill="${p.towerDark}" stroke="${p.gun}"/>`
    + `<ellipse cx="${cx}" cy="${cy}" rx="7" ry="5" fill="${p.gun}"/>`;
}

function surfaceHull(uid, w, top, bottom, p) {
  const path = hullPath(w, top, bottom);
  const inset = 9;
  return `<path d="${path}" transform="translate(6 8)" fill="${p.shadow}"/>`
    + `<path d="${path}" fill="url(#h${uid})" stroke="${p.hullDark}" stroke-width="1.5"/>`
    + `<path d="${hullPath(w - inset, top + inset, bottom - inset)}" transform="translate(${inset / 2} 0)" fill="url(#d${uid})"/>`
    + `<path d="M${f(w - 34)} ${f(top + 4)} Q${f(w - 10)} ${(top + bottom) / 2} ${f(w - 34)} ${f(bottom - 4)}" fill="none" stroke="${p.foam}" stroke-width="3" stroke-linecap="round"/>`;
}

function carrier(uid, w, p) {
  let out = surfaceHull(uid, w, 6, 94, p);
  // Flight deck: a wide slab sitting on the hull.
  out += `<path d="M18 14 L${w - 70} 10 L${w - 24} 26 L${w - 24} 74 L${w - 70} 90 L18 86 Z" transform="translate(4 5)" fill="${p.shadow}"/>`;
  out += `<path d="M18 14 L${w - 70} 10 L${w - 24} 26 L${w - 24} 74 L${w - 70} 90 L18 86 Z" fill="url(#d${uid})" stroke="${p.hullDark}" stroke-width="1.2"/>`;
  out += `<line x1="34" y1="50" x2="${w - 40}" y2="50" stroke="#fff" stroke-opacity=".75" stroke-width="2" stroke-dasharray="14 10"/>`;
  out += `<line x1="40" y1="64" x2="${f(w * 0.55)}" y2="34" stroke="#ffd34d" stroke-opacity=".7" stroke-width="1.6" stroke-dasharray="8 6"/>`;
  // Island on the starboard (top) edge.
  out += block(uid, w * 0.6, 4, 70, 20, p) + windows(w * 0.6 + 4, 10, 60, p);
  out += `<circle cx="${f(w * 0.6 + 52)}" cy="14" r="5" fill="${p.gun}"/>`;
  // Two parked jets.
  [[w * 0.18, 72], [w * 0.3, 72], [w * 0.42, 34]].forEach(([x, y]) => {
    out += `<path d="M${f(x)} ${y} l18 0 l-6 -3 l0 -7 l-4 0 l-2 7 l-6 0 l-2 -3 l-2 0 Z M${f(x + 8)} ${y} l0 0 l-2 9 l4 0 l4 -9 Z" fill="${p.towerDark}" stroke="${p.gun}" stroke-width=".8"/>`;
  });
  return out;
}

function battleship(uid, w, p) {
  let out = surfaceHull(uid, w, 10, 90, p);
  out += turret(uid, w * 0.16, 50, p, true, 3);
  out += turret(uid, w * 0.66, 50, p, false, 3);
  out += turret(uid, w * 0.8, 50, p, false, 3);
  out += block(uid, w * 0.32, 28, w * 0.22, 44, p) + block(uid, w * 0.36, 34, w * 0.12, 32, p, 2);
  out += windows(w * 0.37, 40, w * 0.1, p);
  out += funnel(w * 0.31, 50, p);
  return out;
}

function cruiser(uid, w, p) {
  let out = surfaceHull(uid, w, 12, 88, p);
  out += turret(uid, w * 0.2, 50, p, true, 2);
  out += turret(uid, w * 0.76, 50, p, false, 2);
  out += block(uid, w * 0.38, 30, w * 0.24, 40, p) + windows(w * 0.4, 36, w * 0.2, p);
  out += funnel(w * 0.34, 50, p);
  out += `<line x1="${f(w * 0.56)}" y1="30" x2="${f(w * 0.56)}" y2="70" stroke="${p.gun}" stroke-width="2"/>`;
  return out;
}

function destroyer(uid, w, p) {
  let out = surfaceHull(uid, w, 14, 86, p);
  out += turret(uid, w * 0.74, 50, p, false, 1);
  out += block(uid, w * 0.36, 32, w * 0.2, 36, p) + windows(w * 0.38, 38, w * 0.16, p);
  out += funnel(w * 0.28, 50, p);
  return out;
}

function submarine(uid, w, p) {
  const path = `M18 50 Q18 22 60 22 L${w - 60} 22 Q${w - 8} 25 ${w - 8} 50 Q${w - 8} 75 ${w - 60} 78 L60 78 Q18 78 18 50 Z`;
  let out = `<path d="${path}" transform="translate(5 7)" fill="${p.shadow}"/>`;
  out += `<path d="${path}" fill="url(#h${uid})" stroke="${p.hullDark}" stroke-width="1.5"/>`;
  out += `<path d="M8 50 L22 36 L22 64 Z" fill="${p.subHull}"/>`;
  out += `<rect x="${f(w * 0.5 + 4)}" y="41" width="54" height="24" rx="12" fill="${p.shadow}"/>`;
  out += `<rect x="${f(w * 0.5)}" y="35" width="54" height="24" rx="12" fill="url(#t${uid})" stroke="${p.hullDark}"/>`;
  out += `<line x1="${f(w * 0.5 + 8)}" y1="47" x2="${f(w * 0.5 + 44)}" y2="47" stroke="${p.gun}" stroke-width="2"/>`;
  [0.25, 0.33, 0.73].forEach((x) => { out += `<circle cx="${f(w * x)}" cy="50" r="3.5" fill="${p.hullDark}"/>`; });
  // Water lapping over the hull so it reads as half-submerged.
  out += `<path d="${path}" fill="none" stroke="${p.foam}" stroke-width="5" stroke-dasharray="18 26" opacity=".7"/>`;
  return out;
}

const BUILDERS = { carrier, battleship, cruiser, submarine, destroyer };
const BY_LENGTH = { 2: destroyer, 3: cruiser, 4: battleship, 5: carrier };

export function shipSvg(ship, size, orientation, palette, overrideUrl, uid) {
  const len = Math.max(1, Number(size) || 1);
  const w = len * 100;
  const vertical = orientation === "v";
  const viewBox = vertical ? `0 0 100 ${w}` : `0 0 ${w} 100`;
  const id = String(ship && ship.id || "");
  const rotate = vertical ? ` transform="rotate(90) translate(0 -100)"` : "";
  let body;
  if (overrideUrl) {
    body = `<image href="${String(overrideUrl).replace(/"/g, "&quot;")}" x="0" y="0" width="${w}" height="100" preserveAspectRatio="none"/>`;
  } else {
    const build = BUILDERS[id] || BY_LENGTH[len] || cruiser;
    body = defs(uid, palette, build === submarine) + build(uid, w, palette);
  }
  return `<svg class="bs-ship-svg" viewBox="${viewBox}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><g${rotate}>${body}</g></svg>`;
}
