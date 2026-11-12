// Reefkeepers bot policy — also the autopilot (level 2) for skipped seats and
// "all your picks were taken", and the hint engine (level 3, noise-free).
// It returns a COMMIT body { place, picks }; rules.js runs it through the same
// validation a human commit takes. Reads only public information (the seat's
// own reef, its pending tile and the face-up offer) and uses ./board.js for
// legality, so it can never propose a spot the rules would not accept.
//
// Levels (seat.level):
//   1 — any legal spot, a random wish list.
//   2 — greedy: the spot with the biggest immediate score gain; ranks the row
//       by the best gain each tile could make next round (+ its pearls).
//   3 — greedy + reef shape: keeps the Grotto centred when the heart bonus is
//       on, values open edges around pearl regions, avoids dead holes, and
//       prices a low draft number (first choice next round).
//   4 — level 3 with heavier shape weights scaled by how much game is left,
//       and no noise.
// Cost is bounded: one regionIndex per reef, O(1) placementDelta per spot, and
// the full shape evaluation only for the best few spots per tile.
import { legalSpots, candidateSpots, regionIndex, placementDelta, halvesFor, cellMap, reefBox } from "./board.js";

const NOISE = [0, 0, 2, 0.6, 0];
const SHAPE_SHORTLIST = 6;

const key = (x, y) => (x + 64) * 256 + (y + 64);
const NEIGHBORS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function clampLevel(level) {
  const n = Number(level);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : 2;
}

function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function reachable(box, size, x, y) {
  return Math.max(box.maxX, x) - Math.min(box.minX, x) < size && Math.max(box.maxY, y) - Math.min(box.minY, y) < size;
}

// Board-shape bonus for a placement (levels 3–4).
function shapeValue(ctx, tile, spot, merged) {
  const { map, box, size, options, level, late } = ctx;
  const halves = halvesFor(tile, spot);
  const taken = new Set(halves.map((h) => key(h.x, h.y)));
  const isFree = (x, y) => !map.has(key(x, y)) && !taken.has(key(x, y));
  const nb = {
    minX: Math.min(box.minX, halves[0].x, halves[1].x), maxX: Math.max(box.maxX, halves[0].x, halves[1].x),
    minY: Math.min(box.minY, halves[0].y, halves[1].y), maxY: Math.max(box.maxY, halves[0].y, halves[1].y),
  };
  let v = 0;
  if (options.heart_bonus) {
    const h = (size - 1) / 2;
    if (halves.some((c) => Math.abs(c.x) > h || Math.abs(c.y) > h)) v -= level >= 4 ? 6 : 3;
  }
  const growth = (level >= 4 ? 0.4 : 0.25) * (level >= 4 ? 0.3 + late : 1);
  halves.forEach((c, i) => {
    const region = merged[merged.length === 1 ? 0 : i];
    for (const [dx, dy] of NEIGHBORS) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (!isFree(x, y) || !reachable(nb, size, x, y)) continue;
      v += region.pearls > 0 ? growth : growth * 0.25;
      // A free cell with no free reachable neighbour can never take a tile.
      const open = NEIGHBORS.some(([ex, ey]) => isFree(x + ex, y + ey) && reachable(nb, size, x + ex, y + ey));
      if (!open) v -= level >= 4 ? 2.5 : 1.5;
    }
  });
  return v;
}

function makeCtx(cells, size, options, level, progress) {
  const map = cellMap(cells);
  return {
    cells, map, index: regionIndex(cells, map), box: reefBox(cells), candidates: candidateSpots(cells, size, map),
    size, options: options || {}, level, late: Math.max(0, 1 - (Number(progress) || 0)),
  };
}

// Score every legal spot for `tile`; the shape pass runs on a shortlist.
function scoredSpots(ctx, tile) {
  const spots = legalSpots(ctx.cells, tile, ctx.size, ctx.map, ctx.candidates);
  const scored = spots.map((spot) => {
    const d = placementDelta(ctx.index, tile, spot);
    return { spot, v: d.delta, merged: d.merged };
  });
  if (ctx.level >= 3 && scored.length) {
    scored.sort((a, b) => b.v - a.v);
    scored.slice(0, ctx.level >= 4 ? SHAPE_SHORTLIST * 2 : SHAPE_SHORTLIST)
      .forEach((s) => { s.v += shapeValue(ctx, tile, s.spot, s.merged); });
  }
  return scored;
}

function choosePlace(view, level, rng) {
  if (!view.pending) return null;
  const ctx = makeCtx(view.cells, view.size, view.options, level, view.progress);
  if (level <= 1) {
    const spots = legalSpots(ctx.cells, view.pending, ctx.size, ctx.map, ctx.candidates);
    return spots.length ? spots[Math.floor(rng() * spots.length)] : null;
  }
  const scored = scoredSpots(ctx, view.pending);
  let best = null;
  let bestV = -Infinity;
  for (const s of scored) {
    const v = s.v + (rng() - 0.5) * NOISE[level];
    if (v > bestV) { bestV = v; best = s.spot; }
  }
  return best;
}

// Rank `tiles` (Tile objects) best-first for a reef; returns ids.
export function rankTiles(cells, tiles, size, options, level = 2, rng = () => 0.5, progress = 0) {
  const lvl = clampLevel(level);
  if (!Array.isArray(tiles) || !tiles.length) return [];
  if (lvl <= 1) return shuffled(tiles, rng).map((t) => t.id);
  const ctx = makeCtx(cells, size, options, lvl, progress);
  return tiles
    .map((tile) => {
      const scored = scoredSpots(ctx, tile);
      let v = scored.length ? Math.max(...scored.map((s) => s.v)) : -4;
      v += (tile.ap + tile.bp) * 0.5;
      if (lvl >= 3) v += (1 - tile.n / 48) * 1.2;
      return { id: tile.id, n: tile.n, v: v + (rng() - 0.5) * NOISE[lvl] };
    })
    .sort((a, b) => b.v - a.v || a.n - b.n || (a.id < b.id ? -1 : 1))
    .map((s) => s.id);
}

// view: { cells, pending: Tile|null, offer: Tile[], size, options, progress? }
// → { place: {x,y,rot}|null, picks: [tileId…] }
export function chooseReefMove(view, level, rng = Math.random) {
  const lvl = clampLevel(level);
  const place = choosePlace(view, lvl, rng);
  const cells = place && view.pending ? [...view.cells, ...halvesFor(view.pending, place)] : view.cells;
  const ranked = rankTiles(cells, view.offer || [], view.size, view.options, lvl, rng, view.progress);
  const count = lvl <= 1 ? 1 + Math.floor(rng() * 3) : 3;
  return { place, picks: ranked.slice(0, Math.min(count, ranked.length)) };
}
