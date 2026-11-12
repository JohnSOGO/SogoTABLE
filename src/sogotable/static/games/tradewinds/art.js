// Tradewind Isles — pure procedural SVG art (strings). Deterministic: every
// decoration is seeded by the hex id, so a re-render never reshuffles palms.
// Hexes are pointy-top with radius R (board units) and drawn around (0,0);
// the board translates each one. Colours come from the assets.js palette.
// No rule logic lives here.
export const R = 40; // hex radius in board units (= 2 lattice units × 0.5 × 40)

export function hexPoints(cx, cy, r = R) {
  const pts = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function seeded(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

// Six decoration slots around the number token (which sits at the centre).
const SLOTS = [[-17, -19], [15, -21], [24, 2], [13, 22], [-14, 22], [-25, 1], [0, -27], [-4, 28]];
function pickSlots(rand, n) {
  const order = SLOTS.map((s, i) => ({ s, k: rand() + (i > 5 ? 0.6 : 0) })).sort((a, b) => a.k - b.k);
  return order.slice(0, n).map((o) => [o.s[0] + (rand() - 0.5) * 4, o.s[1] + (rand() - 0.5) * 4]);
}

function palm(x, y, s, p) {
  const leaves = [-150, -105, -60, -20, 25].map((deg) => {
    const a = (deg * Math.PI) / 180;
    const ex = x + Math.cos(a) * 10 * s; const ey = y - 12 * s + Math.sin(a) * 6 * s + 3 * s;
    const mx = x + Math.cos(a) * 6 * s; const my = y - 12 * s + Math.sin(a) * 6 * s - 3 * s;
    return `<path d="M${x.toFixed(1)},${(y - 12 * s).toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}" stroke="${p.frond}" stroke-width="${(2.6 * s).toFixed(1)}" fill="none" stroke-linecap="round"/>`;
  }).join("");
  return `<path d="M${x},${y} q${-2 * s},${-6 * s} ${0.5 * s},${-12 * s}" stroke="${p.trunk}" stroke-width="${(2 * s).toFixed(1)}" fill="none" stroke-linecap="round"/>${leaves}
    <circle cx="${x + 0.5 * s}" cy="${y - 11 * s}" r="${1.4 * s}" fill="${p.trunk}"/>`;
}

function mangoTree(x, y, s, p, rand) {
  const fruit = [0, 1, 2].map(() => `<circle cx="${(x + (rand() - 0.5) * 9 * s).toFixed(1)}" cy="${(y - 9 * s + (rand() - 0.5) * 6 * s).toFixed(1)}" r="${(1.5 * s).toFixed(1)}" fill="${p.mango}"/>`).join("");
  return `<rect x="${x - 1 * s}" y="${y - 5 * s}" width="${2 * s}" height="${6 * s}" rx="${0.6 * s}" fill="${p.trunk}"/>
    <ellipse cx="${x}" cy="${y - 9 * s}" rx="${7 * s}" ry="${6 * s}" fill="${p.treeTop}"/>${fruit}`;
}

function tuft(x, y, s, p) {
  return `<path d="M${x - 4 * s},${y} l${2 * s},${-6 * s} M${x},${y} l0,${-8 * s} M${x + 4 * s},${y} l${-2 * s},${-6 * s}" stroke="${p.tuft}" stroke-width="${1.6 * s}" stroke-linecap="round" fill="none"/>`;
}

function basalt(x, y, s, p) {
  const top = hexPoints(x, y - 4 * s, 4.6 * s);
  return `<rect x="${x - 4 * s}" y="${y - 4 * s}" width="${8 * s}" height="${8 * s}" fill="${p.rockDark}"/>
    <polygon points="${top}" fill="${p.rock}" stroke="${p.rockDark}" stroke-width="${0.8 * s}"/>`;
}

export function terrainArt(terrain, id, p) {
  const rand = seeded(id);
  switch (terrain) {
    case "grove": {
      const spots = pickSlots(rand, 4);
      return spots.map(([x, y]) => palm(x, y + 6, 0.85 + rand() * 0.3, p)).join("");
    }
    case "orchard": {
      const spots = pickSlots(rand, 4);
      return spots.map(([x, y]) => mangoTree(x, y + 5, 0.85 + rand() * 0.25, p, rand)).join("");
    }
    case "meadow": {
      const spots = pickSlots(rand, 6);
      const flowers = pickSlots(rand, 3).map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6" fill="${p.flower}"/>`).join("");
      return spots.map(([x, y]) => tuft(x, y + 3, 0.9 + rand() * 0.3, p)).join("") + flowers;
    }
    case "clay": {
      const bands = [-26, -12, 14, 28].map((y, i) => {
        const w = 6 + rand() * 4;
        return `<path d="M-40,${y} q20,${-w} 40,0 t40,0" stroke="${i % 2 ? p.clayDark : p.clayLight}" stroke-width="${3 + rand() * 2}" fill="none" opacity=".75"/>`;
      }).join("");
      const notch = pickSlots(rand, 2).map(([x, y]) => `<path d="M${x - 5},${y + 3} l5,-7 l5,7z" fill="${p.clayDark}" opacity=".8"/>`).join("");
      return bands + notch;
    }
    case "quarry": {
      const spots = pickSlots(rand, 5);
      return spots.map(([x, y]) => basalt(x, y + 2, 0.9 + rand() * 0.35, p)).join("");
    }
    case "volcano": {
      const smoke = `<circle cx="3" cy="-24" r="5" fill="${p.smoke}"/><circle cx="9" cy="-30" r="4" fill="${p.smoke}"/>`;
      return `<path d="M-28,24 L-7,-14 L7,-14 L28,24 Z" fill="${p.volcanoDark}"/>
        <path d="M-7,-14 L7,-14 L4,-10 L1,-5 L-2,-9 L-5,-8 Z" fill="${p.lava}"/>
        <path d="M-1,-6 q-3,10 -8,18" stroke="${p.lava}" stroke-width="2" fill="none" opacity=".8"/>${smoke}`;
    }
    default: return "";
  }
}

export function terrainFill(terrain, p) {
  const map = { grove: p.grove, clay: p.clay, meadow: p.meadow, orchard: p.orchard, quarry: p.quarry, volcano: p.volcano };
  return map[terrain] || p.sand;
}

// Player pieces, centred on (x,y). `art` = optional image override URL.
export function hutSvg(x, y, color, p, { scale = 1, art = null, ghost = false } = {}) {
  const s = scale;
  const op = ghost ? ' opacity=".6"' : "";
  if (art) return `<g${op}><circle cx="${x}" cy="${y}" r="${9 * s}" fill="${color}" stroke="${p.pieceEdge}" stroke-width="1.5"/><image href="${art}" x="${x - 8 * s}" y="${y - 8 * s}" width="${16 * s}" height="${16 * s}"/></g>`;
  return `<g${op}><path d="M${x - 7 * s},${y + 6 * s} v${-7 * s} l${7 * s},${-7 * s} l${7 * s},${7 * s} v${7 * s} z" fill="${color}" stroke="${p.pieceEdge}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M${x - 9 * s},${y - 0.5 * s} l${9 * s},${-9 * s} l${9 * s},${9 * s}" fill="none" stroke="${p.pieceEdge}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="${x - 1.8 * s}" y="${y + 1 * s}" width="${3.6 * s}" height="${5 * s}" fill="${p.pieceEdge}" opacity=".55"/></g>`;
}

export function lodgeSvg(x, y, color, p, { scale = 1, art = null, ghost = false } = {}) {
  const s = scale;
  const op = ghost ? ' opacity=".6"' : "";
  if (art) return `<g${op}><rect x="${x - 11 * s}" y="${y - 10 * s}" width="${22 * s}" height="${20 * s}" rx="${4 * s}" fill="${color}" stroke="${p.pieceEdge}" stroke-width="1.5"/><image href="${art}" x="${x - 10 * s}" y="${y - 10 * s}" width="${20 * s}" height="${20 * s}"/></g>`;
  return `<g${op}><path d="M${x - 11 * s},${y + 7 * s} v${-9 * s} l${5 * s},${-5 * s} l${5 * s},${5 * s} v${-3 * s} l${6 * s},${-6 * s} l${6 * s},${6 * s} v${12 * s} z" fill="${color}" stroke="${p.pieceEdge}" stroke-width="1.6" stroke-linejoin="round"/>
    <rect x="${x - 8 * s}" y="${y + 1 * s}" width="${3 * s}" height="${3 * s}" fill="${p.pieceEdge}" opacity=".5"/>
    <rect x="${x + 3 * s}" y="${y - 2 * s}" width="${3 * s}" height="${3 * s}" fill="${p.pieceEdge}" opacity=".5"/>
    <rect x="${x + 3 * s}" y="${y + 3 * s}" width="${3 * s}" height="${4 * s}" fill="${p.pieceEdge}" opacity=".55"/></g>`;
}

// A boardwalk between two points: dark rail, player-coloured deck, plank ticks.
export function pathSvg(x1, y1, x2, y2, color, p, { ghost = false } = {}) {
  const dx = x2 - x1; const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const k = 9 / len; // pull in from the corners so huts stay readable
  const ax = x1 + dx * k; const ay = y1 + dy * k; const bx = x2 - dx * k; const by = y2 - dy * k;
  const line = `x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}"`;
  const op = ghost ? ' opacity=".6"' : "";
  return `<g${op}><line ${line} stroke="${p.pieceEdge}" stroke-width="8.5" stroke-linecap="round"/>
    <line ${line} stroke="${color}" stroke-width="5.5" stroke-linecap="round"/>
    <line ${line} stroke="${p.pieceEdge}" stroke-width="5.5" stroke-dasharray="1.2 3.6" opacity=".35"/></g>`;
}

export function diceSvg(n, size = 26) {
  const spots = {
    1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]],
    5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]],
  }[n] || [];
  const dots = spots.map(([x, y]) => `<circle cx="${x * 6 + 0}" cy="${y * 6 + 0}" r="2.1"/>`).join("");
  return `<svg class="tw-die" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="5"/>${dots}</svg>`;
}
