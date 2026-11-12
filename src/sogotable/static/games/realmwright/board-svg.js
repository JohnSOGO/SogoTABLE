// Realmwright — board markup (the contents of the camera <g>).
//
// Pure string builder over a prepared view model from render.js: placed tiles
// (each unique type+rotation drawn once as a <symbol> and stamped with <use>),
// meeples at their feature anchors, this round's placements outlined in the
// owner's colour, recently scored tiles glowing, and — for the local seat —
// the server-computed legal cells plus the tile preview with meeple spots.
// It decides nothing: legality arrives in the model, already from the server.
import { featureAnchor, featureHighlight, meepleShape, safeId, tileArt } from "./art.js";
import { FEATURE_ICONS } from "./branding.js";
import { meepleFxKey } from "./fx.js";

// An empty animation frame (no fx running): everything drawn at rest.
const NO_FX = { hideTiles: new Set(), drops: new Map(), hideMeeples: new Set(), meepleDrops: new Map(), extras: [], jumps: new Map(), glow: [] };
const delay = (ms) => `animation-delay:-${Math.round(ms)}ms`;

const symbolId = (t, r) => `rwS-${safeId(t)}-${r}`;

function symbols(keys, defs, palette) {
  let out = "";
  keys.forEach((key) => {
    const [t, r] = key.split("|");
    const def = defs[t];
    if (!def) return;
    out += `<symbol id="${symbolId(t, r)}" viewBox="0 0 100 100">${tileArt(def, { r: Number(r), palette, idPrefix: `rwA-${safeId(t)}-${r}` })}</symbol>`;
  });
  return out;
}

function missingTile(x, y) {
  return `<rect x="${x * 100}" y="${y * 100}" width="100" height="100" fill="#b9a98c"/><text x="${x * 100 + 50}" y="${y * 100 + 56}" text-anchor="middle" font-size="18" fill="#47382a">?</text>`;
}

export function buildBoardMarkup(model) {
  const { defs, board, palette, colorOf, myTile, candidates, preview, round } = model;
  const fx = model.fx || NO_FX;
  const glow = fx.glow;
  const keys = new Set();
  board.forEach((b) => keys.add(`${b.t}|${b.r}`));
  if (myTile && candidates.some((c) => c.strong)) keys.add(`${myTile}|${model.rot}`);
  if (myTile && preview) keys.add(`${myTile}|${preview.r}`);

  let minX = 0; let minY = 0; let maxX = 0; let maxY = 0;
  board.forEach((b) => { minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.x); maxY = Math.max(maxY, b.y); });

  let out = `<defs>
    <filter id="rwSoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
    <pattern id="rwGrid" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0 H0 V100" fill="none" stroke="${palette.boardGrid}" stroke-width="1.5"/></pattern>
    ${symbols(keys, defs, palette)}
  </defs>`;
  out += `<rect class="rw-felt" x="${(minX - 40) * 100}" y="${(minY - 40) * 100}" width="${(maxX - minX + 81) * 100}" height="${(maxY - minY + 81) * 100}" fill="url(#rwGrid)"/>`;

  // Tiles.
  out += `<g class="rw-tiles">`;
  const shown = board.filter((b) => !fx.hideTiles.has(`${b.x},${b.y}`));
  shown.forEach((b) => {
    const tile = defs[b.t]
      ? `<use href="#${symbolId(b.t, b.r)}" x="${b.x * 100}" y="${b.y * 100}" width="100" height="100"/>`
      : missingTile(b.x, b.y);
    const el = fx.drops.get(`${b.x},${b.y}`);
    out += el === undefined ? tile
      : `<rect class="rw-drop-shadow rw-fxa" style="${delay(el)}" x="${b.x * 100 + 4}" y="${b.y * 100 + 10}" width="100" height="100" rx="6" filter="url(#rwSoft)"/><g class="rw-drop rw-fxa" style="${delay(el)}">${tile}</g>`;
  });
  out += `</g>`;
  // Seams + this round's placements in the owner's colour.
  out += `<path class="rw-seams" d="${shown.map((b) => `M${b.x * 100} ${b.y * 100}h100v100h-100Z`).join("")}" fill="none" stroke="${palette.tileEdge}" stroke-width="1"/>`;
  shown.forEach((b) => {
    if (b.by && b.round === round) {
      out += `<rect class="rw-fresh" x="${b.x * 100 + 2.5}" y="${b.y * 100 + 2.5}" width="95" height="95" rx="4" fill="none" stroke="${colorOf(b.by)}" stroke-width="4"/>`;
    }
  });

  // Recently scored tiles glow (animation continues across re-renders).
  glow.forEach((g) => {
    g.cells.forEach(([x, y]) => {
      out += `<rect class="rw-glow" style="${delay(g.elapsed)}" x="${x * 100 + 1}" y="${y * 100 + 1}" width="98" height="98" rx="6"/>`;
    });
  });

  // Legal cells for the local seat.
  candidates.forEach((c) => {
    if (preview && c.x === preview.x && c.y === preview.y) return;
    const x = c.x * 100; const y = c.y * 100;
    if (c.strong) {
      out += `<g class="rw-cand rw-cand-strong">
        <use href="#${symbolId(myTile, model.rot)}" x="${x}" y="${y}" width="100" height="100" opacity=".34"/>
        <rect class="rw-cand-ring" x="${x + 4}" y="${y + 4}" width="92" height="92" rx="8"/>
      </g>`;
    } else {
      out += `<rect class="rw-cand-weak" x="${x + 6}" y="${y + 6}" width="88" height="88" rx="8"/>`;
    }
  });

  // Meeples on placed tiles, plus any that already went home but are still
  // celebrating (fx extras). Waiting ones are hidden; landing / jumping ones
  // carry their animation with the elapsed time as a negative delay.
  const drawn = new Set();
  const drawMeeple = (b, m) => {
    const def = defs[b.t];
    const f = def && def.features[m.f];
    const k = meepleFxKey(b.x, b.y, m.f, m.mark);
    if (!f || drawn.has(k) || fx.hideMeeples.has(k) || fx.hideTiles.has(`${b.x},${b.y}`)) return;
    drawn.add(k);
    const [u, v] = featureAnchor(def, m.f, b.r);
    let shape = meepleShape(colorOf(m.mark), { farmer: f.kind === "field", scale: 1.3 });
    const jump = fx.jumps.get(k);
    if (jump !== undefined) shape = `<g class="rw-jump rw-fxa" style="${delay(jump)}">${shape}</g>`;
    const drop = fx.meepleDrops.get(k);
    if (drop !== undefined) shape = `<g class="rw-mdrop rw-fxa" style="${delay(drop)}">${shape}</g>`;
    out += `<g class="rw-meeple" transform="translate(${(b.x + u) * 100} ${(b.y + v) * 100 - 2})">${shape}</g>`;
  };
  const byCell = new Map(board.map((b) => [`${b.x},${b.y}`, b]));
  board.forEach((b) => { if (Array.isArray(b.meeples)) b.meeples.forEach((m) => drawMeeple(b, m)); });
  fx.extras.forEach((m) => { const b = byCell.get(`${m.x},${m.y}`); if (b) drawMeeple(b, m); });
  if (model.fxOverlay) out += model.fxOverlay;

  // The preview of my tile with meeple spots.
  if (preview && myTile && defs[myTile]) {
    const def = defs[myTile];
    const x = preview.x * 100; const y = preview.y * 100;
    out += `<g class="rw-preview${preview.bad ? " rw-preview-bad" : ""}">
      <rect class="rw-preview-shadow" x="${x + 3}" y="${y + 5}" width="100" height="100" rx="3"/>
      <use href="#${symbolId(myTile, preview.r)}" x="${x}" y="${y}" width="100" height="100"/>`;
    if (preview.meeple !== null && preview.meeple !== undefined) {
      out += `<g transform="translate(${x} ${y})">${featureHighlight(def, preview.meeple, preview.r, palette.highlight)}</g>`;
    }
    out += `<rect class="rw-preview-ring" x="${x + 1.5}" y="${y + 1.5}" width="97" height="97" rx="4"/>`;
    (preview.spots || []).forEach((idx) => {
      const f = def.features[idx];
      if (!f) return;
      const [u, v] = featureAnchor(def, idx, preview.r);
      const px = x + u * 100; const py = y + v * 100;
      if (idx === preview.meeple) {
        out += `<g class="rw-meeple rw-meeple-mine" transform="translate(${px} ${py - 2})">${meepleShape(model.myColor, { farmer: f.kind === "field", scale: 1.35 })}</g>`;
      } else {
        out += `<g class="rw-spot" transform="translate(${px} ${py})">
          <circle class="rw-spot-halo" r="15"/>
          <circle class="rw-spot-dot" r="10.5"/>
          <text y="4.2" text-anchor="middle" font-size="12">${FEATURE_ICONS[f.kind] || "•"}</text>
        </g>`;
      }
    });
    out += `</g>`;
  }
  return out;
}

export function boardBounds(board, cells) {
  const all = [...board.map((b) => [b.x, b.y]), ...cells.map((c) => [c.x, c.y])];
  if (!all.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return all.reduce((acc, [x, y]) => ({
    minX: Math.min(acc.minX, x), minY: Math.min(acc.minY, y), maxX: Math.max(acc.maxX, x), maxY: Math.max(acc.maxY, y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}
