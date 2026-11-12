// Reefkeepers — reef geometry for DISPLAY and the reef SVG builder.
//
// No rules here: legality only ever comes from the server's projected `legal`
// list. The window is purely a framing choice — the cells a size×size reef
// around its current extent could still reach — so the board shows the space
// you can build in and shrinks as your reef takes shape.
import { grottoSvg, halfSvg } from "./art.js";

export const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const K = 100;
const GAP = 3;

export function extent(cells) {
  let minX = 0; let maxX = 0; let minY = 0; let maxY = 0;
  (cells || []).forEach((c) => {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
  });
  return { minX, maxX, minY, maxY };
}

// Every cell a size×size square containing the reef (Grotto included) could cover.
export function reachWindow(cells, size) {
  const e = extent(cells);
  const x0 = e.maxX - size + 1; const y0 = e.maxY - size + 1;
  return { x0, y0, w: e.minX + size - 1 - x0 + 1, h: e.minY + size - 1 - y0 + 1 };
}

// Exactly size×size, centred on the reef — for the compact views of other reefs.
export function squareWindow(cells, size) {
  const e = extent(cells);
  const w = e.maxX - e.minX + 1; const h = e.maxY - e.minY + 1;
  const n = Math.max(size, w, h);
  return { x0: e.minX - Math.floor((n - w) / 2), y0: e.minY - Math.floor((n - h) / 2), w: n, h: n };
}

// The two cells a placement covers.
export function placementCells(place) {
  if (!place) return null;
  const [dx, dy] = DIR[((Number(place.rot) % 4) + 4) % 4];
  return [{ x: place.x, y: place.y }, { x: place.x + dx, y: place.y + dy }];
}

const inWin = (win, x, y) => x >= win.x0 && y >= win.y0 && x < win.x0 + win.w && y < win.y0 + win.h;

function dominoOutline(win, cells, cls) {
  const xs = cells.map((c) => c.x); const ys = cells.map((c) => c.y);
  const x = (Math.min(...xs) - win.x0) * K + 1; const y = (Math.min(...ys) - win.y0) * K + 1;
  const w = (Math.max(...xs) - Math.min(...xs) + 1) * K - 2; const h = (Math.max(...ys) - Math.min(...ys) + 1) * K - 2;
  return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/>`;
}

// A tile drawn at a placement (A on the anchor, B per rot), clipped to the window.
function tileAt(win, tile, place) {
  const cells = placementCells(place);
  if (!tile || !cells) return "";
  const halves = [[tile.a, tile.ap], [tile.b, tile.bp]];
  return cells.map((c, i) => (inWin(win, c.x, c.y)
    ? halfSvg(halves[i][0], halves[i][1], (c.x - win.x0) * K + GAP, (c.y - win.y0) * K + GAP, K - 2 * GAP)
    : "")).join("");
}

// opts: { cells, win, interactive, spots:Set("x,y"), strong:Set, preview:{tile,place,bad},
//         ghost:{tile,place}, hint:{place}, label }
export function reefSvg(opts) {
  const { cells = [], win } = opts;
  const taken = new Map(cells.map((c) => [`${c.x},${c.y}`, c]));
  taken.set("0,0", { grotto: true });
  let floor = ""; let placed = ""; let marks = ""; let hits = "";
  for (let y = win.y0; y < win.y0 + win.h; y += 1) {
    for (let x = win.x0; x < win.x0 + win.w; x += 1) {
      const px = (x - win.x0) * K; const py = (y - win.y0) * K;
      const key = `${x},${y}`;
      const c = taken.get(key);
      if (!c) floor += `<rect class="rk-empty" x="${px + GAP}" y="${py + GAP}" width="${K - 2 * GAP}" height="${K - 2 * GAP}" rx="10"/>`;
      else if (c.grotto) placed += grottoSvg(px + GAP, py + GAP, K - 2 * GAP) + `<rect class="rk-grotto-ring" x="${px + GAP}" y="${py + GAP}" width="${K - 2 * GAP}" height="${K - 2 * GAP}" rx="8"/>`;
      else placed += halfSvg(c.t, c.p, px + GAP, py + GAP, K - 2 * GAP);
      if (opts.spots && opts.spots.has(key)) {
        const strong = opts.strong && opts.strong.has(key);
        marks += `<rect class="rk-spot${strong ? " rk-spot-strong" : ""}" x="${px + 9}" y="${py + 9}" width="${K - 18}" height="${K - 18}" rx="9"/>`;
      }
      if (opts.interactive) hits += `<rect class="rk-hit" data-cell="${x},${y}" x="${px}" y="${py}" width="${K}" height="${K}"/>`;
    }
  }
  let over = "";
  if (opts.hint && opts.hint.place) {
    const hc = placementCells(opts.hint.place).filter((c) => inWin(win, c.x, c.y));
    if (hc.length) over += dominoOutline(win, hc, "rk-hint-outline");
  }
  if (opts.ghost && opts.ghost.place) {
    over += `<g class="rk-ghost">${tileAt(win, opts.ghost.tile, opts.ghost.place)}</g>`;
    const gc = placementCells(opts.ghost.place).filter((c) => inWin(win, c.x, c.y));
    if (gc.length) over += dominoOutline(win, gc, "rk-locked-outline");
  }
  if (opts.preview && opts.preview.place) {
    const bad = Boolean(opts.preview.bad);
    over += `<g class="rk-preview${bad ? " rk-preview-bad" : ""}">${tileAt(win, opts.preview.tile, opts.preview.place)}</g>`;
    const pc = placementCells(opts.preview.place).filter((c) => inWin(win, c.x, c.y));
    if (pc.length) over += dominoOutline(win, pc, bad ? "rk-prev-bad" : "rk-prev-ok");
  }
  const label = opts.label ? ` role="img" aria-label="${opts.label}"` : ` aria-hidden="true"`;
  return `<svg class="rk-reef${opts.interactive ? " rk-reef-live" : ""}" viewBox="0 0 ${win.w * K} ${win.h * K}"${label}>
    <rect class="rk-water" x="0" y="0" width="${win.w * K}" height="${win.h * K}" rx="14"/>
    ${floor}${placed}${marks}${over}${hits}</svg>`;
}
