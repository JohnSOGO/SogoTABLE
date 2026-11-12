// Bloomwork — market + garden markup (view only; HTML strings).
//
// Renders the prepared projection: market stalls, the Square, a gardener's
// planter rows / garden bed / compost heap (big + interactive for you, mini
// for everyone else). It never decides legality: the Helps highlight comes
// from hints.js (display-only) and the server re-validates every pick.
// `view` is built by render.js: { game, myMark, me, helps, sel, locked,
// pending, esc, fx(key) → {cls, style} }.
import { WORDS, flowerWord, sourceWord } from "./branding.js";
import { birdSvg, potSvg, tileSvg } from "./art.js";
import { previewHint, rowFitsHint } from "./hints.js";

const SIZE = 5;
const PENALTIES = [-1, -1, -2, -2, -2, -3, -3];
const order = (game) => (Array.isArray(game.flowers) && game.flowers.length ? game.flowers : ["rose", "iris", "sun", "lilac", "fern"]);

function fxTile(view, key, flower, extra = "") {
  const fx = view.fx ? view.fx(key) : null;
  return tileSvg(flower, `${extra}${fx ? ` ${fx.cls}` : ""}`, fx ? fx.style : "");
}

// ---------- market ----------
export function marketHtml(view) {
  const { game, sel, locked, pending } = view;
  const kinds = order(game);
  const stalls = (game.stalls || []).map((tiles, i) => {
    const sorted = [...tiles].sort((a, b) => kinds.indexOf(a) - kinds.indexOf(b));
    const hereSel = sel && sel.source === i;
    const cells = sorted.map((f, j) => {
      const cls = [
        hereSel && sel.flower === f ? "bw-sel" : "",
        hereSel && sel.flower !== f ? "bw-dim" : "",
        pending && pending.source === i && pending.flower === f ? "bw-mine" : "",
      ].join(" ");
      const label = `${flowerWord(f)}, ${sourceWord(i)}`;
      return `<button type="button" class="bw-mtile ${cls}" data-act="tile" data-src="${i}" data-f="${f}" aria-label="${label}"${locked ? " disabled" : ""}>${fxTile(view, `stall:${i}:${j}`, f)}</button>`;
    }).join("");
    return `<div class="bw-stall${tiles.length ? "" : " bw-empty"}">${potSvg()}<span class="bw-stall-n">${i + 1}</span><div class="bw-stall-tiles">${cells}</div></div>`;
  }).join("");
  const center = Array.isArray(game.center) ? game.center : [];
  const groups = kinds.filter((f) => center.includes(f)).map((f) => {
    const n = center.filter((x) => x === f).length;
    const cls = [
      sel && sel.source === "center" && sel.flower === f ? "bw-sel" : "",
      sel && sel.source === "center" && sel.flower !== f ? "bw-dim" : "",
      pending && pending.source === "center" && pending.flower === f ? "bw-mine" : "",
    ].join(" ");
    return `<button type="button" class="bw-mtile bw-sq ${cls}" data-act="tile" data-src="center" data-f="${f}" aria-label="${n} ${flowerWord(f, n)}, ${WORDS.square}"${locked ? " disabled" : ""}>${tileSvg(f)}<span class="bw-sq-n">${n}</span></button>`;
  }).join("");
  const bird = game.bird_in_center ? `<span class="bw-sq-bird" title="${WORDS.bird}">${birdSvg()}</span>` : "";
  return `<section class="bw-market bw-panel" aria-label="${WORDS.stalls}">
      <div class="bw-stalls">${stalls}</div>
      <div class="bw-square"><span class="bw-square-label">${WORDS.Square}</span>${groups || `<span class="bw-square-empty">${center.length ? "" : "—"}</span>`}${bird}</div>
    </section>`;
}

// How many of the selected / pending flower the source holds now (display).
export function sourceCount(game, source, flower) {
  const tiles = source === "center" ? game.center : (game.stalls || [])[source];
  return Array.isArray(tiles) ? tiles.filter((f) => f === flower).length : 0;
}

// ---------- garden (rows + bed + compost) ----------
// opts.interactive: rows/compost are buttons (your own board).
export function gardenHtml(seat, view, opts = {}) {
  const { game } = view;
  const layout = game.bed_layout || [];
  const mark = seat.mark;
  const interactive = Boolean(opts.interactive);
  const sel = interactive ? view.sel : null;
  const pending = interactive ? view.pending : null;
  const count = sel ? sourceCount(game, sel.source, sel.flower) : 0;
  const pendCount = pending ? Math.max(1, sourceCount(game, pending.source, pending.flower)) : 0;
  const helps = Boolean(view.helps);
  const bedGhost = {}; // "r:c" → points badge
  let rowsHtml = "";
  for (let r = 0; r < SIZE; r += 1) {
    const line = seat.rows[r] || { flower: null, count: 0 };
    let fit = null;
    let prev = null;
    if (sel) {
      fit = helps ? rowFitsHint(seat, layout, r, sel.flower) : null;
      if (fit) {
        prev = previewHint(seat, layout, r, sel.flower, count);
        if (prev.completes && prev.col >= 0) bedGhost[`${r}:${prev.col}`] = { flower: sel.flower, points: prev.points };
      }
    }
    const isPending = pending && pending.row === r;
    const slots = [];
    for (let i = 0; i < r + 1; i += 1) {
      // Slots fill from the right (next to the arrow), like a staircase.
      const idx = r - i; // 0 = rightmost
      let inner = "";
      if (idx < line.count && line.flower) inner = fxTile(view, `row:${mark}:${r}:${idx}`, line.flower);
      else if (prev && idx < line.count + prev.placed) inner = tileSvg(sel.flower, "bw-ghost");
      else if (isPending && idx < line.count + pendCount) inner = tileSvg(pending.flower, "bw-ghost-pick");
      slots.push(`<span class="bw-slot">${inner}</span>`);
    }
    const badge = prev && prev.spill ? `<span class="bw-badge bw-badge-spill">${prev.compostCost || "−0"}</span>` : "";
    const cls = `bw-prow${fit === true ? " bw-fit" : ""}${fit === false ? " bw-nofit" : ""}${isPending ? " bw-picked" : ""}`;
    const style = `grid-column:${SIZE - r} / ${SIZE + 1};grid-row:${r + 1}`;
    rowsHtml += interactive
      ? `<button type="button" class="${cls}" style="${style}" data-act="row" data-row="${r}" aria-label="${WORDS.row(r)}"${view.locked || !sel ? " disabled" : ""}>${slots.join("")}${badge}</button>`
      : `<div class="${cls}" style="${style}">${slots.join("")}</div>`;
    rowsHtml += `<span class="bw-arrow" style="grid-column:${SIZE + 1};grid-row:${r + 1}" aria-hidden="true">›</span>`;
  }
  let bedHtml = `<span class="bw-bedwrap" aria-hidden="true"></span>`;
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const flower = (layout[r] || [])[c];
      const planted = Boolean(seat.bed && seat.bed[r] && seat.bed[r][c]);
      const fx = planted && view.fx ? view.fx(`bed:${mark}:${r}:${c}`) : null;
      const ghost = bedGhost[`${r}:${c}`];
      let inner = planted ? tileSvg(flower, fx ? fx.cls : "", fx ? fx.style : "") : tileSvg(flower, "bw-wm");
      if (ghost) inner = `${tileSvg(flower, "bw-ghost")}<span class="bw-badge bw-badge-pts">+${ghost.points}</span>`;
      bedHtml += `<span class="bw-cell${fx ? " bw-bloomcell" : ""}" style="grid-column:${SIZE + 2 + c};grid-row:${r + 1}">${inner}</span>`;
    }
  }
  return `<div class="bw-grid">${rowsHtml}${bedHtml}</div>`;
}

export function compostHtml(seat, view, opts = {}) {
  const interactive = Boolean(opts.interactive);
  const heap = Array.isArray(seat.compost) ? seat.compost : [];
  const sel = interactive ? view.sel : null;
  const pending = interactive ? view.pending : null;
  const slots = view.game.compost_slots || PENALTIES.length;
  let ghostFrom = heap.length;
  let ghostTo = heap.length;
  let ghostFlower = null;
  if (sel && view.helps) { ghostFlower = sel.flower; ghostTo += sourceCount(view.game, sel.source, sel.flower); }
  if (pending && pending.row === -1) { ghostFlower = pending.flower; ghostTo += Math.max(1, sourceCount(view.game, pending.source, pending.flower)); }
  const cells = Array.from({ length: slots }, (_, i) => {
    const f = heap[i];
    let inner = "";
    if (f === "bird") inner = birdSvg();
    else if (f) inner = fxTile(view, `heap:${seat.mark}:${i}`, f);
    else if (ghostFlower && i >= ghostFrom && i < ghostTo) inner = tileSvg(ghostFlower, pending && pending.row === -1 ? "bw-ghost-pick" : "bw-ghost");
    return `<span class="bw-hslot"><i>${inner}</i><small>${PENALTIES[i] || ""}</small></span>`;
  }).join("");
  const pen = Number(seat.compost_penalty) || 0;
  const label = `<span class="bw-compost-label">${WORDS.Compost}<small>${pen ? pen : "0"}</small></span>`;
  const cls = `bw-compost${pending && pending.row === -1 ? " bw-picked" : ""}`;
  return interactive
    ? `<button type="button" class="${cls}" data-act="row" data-row="-1" aria-label="${WORDS.compost}"${view.locked || !sel ? " disabled" : ""}>${label}<span class="bw-heap">${cells}</span></button>`
    : `<div class="${cls}">${label}<span class="bw-heap">${cells}</span></div>`;
}

// Tiny compost strip for the mini boards.
export function miniHeapHtml(seat) {
  const heap = Array.isArray(seat.compost) ? seat.compost : [];
  const cells = heap.map((f) => `<i>${f === "bird" ? birdSvg() : tileSvg(f)}</i>`).join("");
  const pen = Number(seat.compost_penalty) || 0;
  return `<span class="bw-mini-heap">${WORDS.Compost}${cells ? ` ${cells}` : ""}${pen ? `<b>${pen}</b>` : ""}</span>`;
}
