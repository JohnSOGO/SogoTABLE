// Realmwright — HTML for the non-board panels: status strip, action tray,
// score table, final results. Pure string builders over the view model that
// render.js prepares; every word comes from branding.js. No rule logic: the
// legal meeple spots, scores and statuses all arrive decided by the server.
import { featureAnchor, meepleSvg, tileSvg } from "./art.js";
import { DIRECTIONS, CENTER_WORD, FEATURE_ICONS, UI, capitalize, featureName } from "./branding.js";

export function stripHtml(vm, esc) {
  const tickerClass = vm.flash ? ` rw-ticker-${vm.flash.kind}` : "";
  const tickerText = vm.flash ? vm.flash.text : (vm.ticker || "");
  return `<div class="rw-strip-line">
      <span class="rw-chip-round">${esc(UI.round(vm.round))}</span>
      <button type="button" class="rw-chip-bag${vm.bagOpen ? " rw-on" : ""}" data-rw-bag aria-expanded="${vm.bagOpen}" title="${esc(UI.bagOpen(vm.bagCount))}">🎒 ${vm.bagCount}</button>
      <span class="rw-mystate">${esc(vm.myStateText)}</span>
    </div>
    <div class="rw-strip-line rw-ticker${tickerClass}">${tickerText ? esc(tickerText) : "&nbsp;"}</div>`;
}

function directionWord(anchor) {
  const dx = anchor[0] - 0.5; const dy = anchor[1] - 0.5;
  if (Math.hypot(dx, dy) < 0.13) return CENTER_WORD;
  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 = north, clockwise
  return DIRECTIONS[Math.round(((angle + 360) % 360) / 45) % 8];
}

// Chip label per legal feature; direction words only when a kind repeats.
export function meepleChoices(def, spots, r) {
  if (!def) return [];
  const counts = {};
  spots.forEach((idx) => { const k = def.features[idx] && def.features[idx].kind; counts[k] = (counts[k] || 0) + 1; });
  return spots.filter((idx) => def.features[idx]).map((idx) => {
    const kind = def.features[idx].kind;
    const name = capitalize(featureName(kind));
    const label = counts[kind] > 1 ? `${name} · ${directionWord(featureAnchor(def, idx, r))}` : name;
    return { idx, kind, label, icon: FEATURE_ICONS[kind] || "•" };
  });
}

export function trayHtml(vm, esc) {
  const tile = vm.myTileDef
    ? tileSvg(vm.myTileDef, { r: vm.handRot, size: 64, palette: vm.palette, idPrefix: "rwHand" })
    : `<div class="rw-hand-empty">?</div>`;
  const chips = [];
  const chooser = vm.preview && !vm.preview.bad && vm.canAct;
  chips.push(`<button type="button" class="rw-chip${chooser && vm.preview.meeple === null ? " rw-on" : ""}" data-rw-meeple="none" ${chooser ? "" : "disabled"}>🚫 ${esc(UI.noMeeple())}</button>`);
  if (chooser) {
    vm.choices.forEach((c) => {
      const on = vm.preview.meeple === c.idx;
      chips.push(`<button type="button" class="rw-chip${on ? " rw-on" : ""}" data-rw-meeple="${c.idx}" aria-pressed="${on}">${c.icon} ${esc(c.label)}</button>`);
    });
  }
  const chosen = chooser && vm.preview.meeple !== null ? vm.choices.find((c) => c.idx === vm.preview.meeple) : null;
  return `<div class="rw-hand">
      <button type="button" class="rw-hand-tile${vm.myTileDef && vm.canAct ? "" : " rw-faded"}" data-rw-act="rotate" ${vm.canRotate ? "" : "disabled"} aria-label="${esc(`${UI.yourTile} · ${UI.rotate}`)}" title="${esc(UI.rotate)}">${tile}<span class="rw-rot-badge" aria-hidden="true">⟳</span></button>
    </div>
    <div class="rw-mid">
      <div class="rw-meeple-count">${meepleSvg(vm.myColor, { size: 18 })}<span>${esc(UI.meeplesLeft(vm.meeplesLeft))}</span></div>
      <div class="rw-choice">${chosen ? `${chosen.icon} ${esc(chosen.label)}` : esc(chooser ? UI.noMeeple() : vm.idleChoiceText)}</div>
    </div>
    <button type="button" class="rw-btn rw-confirm" data-rw-act="confirm" ${vm.canConfirm ? "" : "disabled"}>${esc(vm.sending ? UI.sending : UI.confirm)}</button>
    <div class="rw-chips">${chips.join("")}</div>`;
}

function breakdownText(b) {
  if (!b) return "";
  return ["city", "road", "cloister", "field"].map((k) => `${FEATURE_ICONS[k]}${b[k] || 0}`).join(" ");
}
function breakdownTitle(b) {
  if (!b) return "";
  return ["city", "road", "cloister", "field"].map((k) => `${capitalize(featureName(k))}: ${b[k] || 0}`).join(" · ");
}

function seatCell(row, esc) {
  return `<span class="rw-swatch" style="background:${esc(row.color)}"></span>
    <span class="rw-name">${row.icon ? `${esc(row.icon)} ` : ""}${esc(row.name)}${row.isMe ? ` <em>(${esc(UI.you)})</em>` : ""}</span>`;
}

export function tableHtml(vm, esc) {
  const live = vm.liveTally;
  const head = `<tr><th class="rw-l">${esc(UI.colPlayer)}</th><th>${esc(UI.colScore)}</th>${live ? `<th>${esc(UI.colLive)}</th>` : ""}<th>${esc(UI.colMeeples)}</th><th>${esc(UI.colStatus)}</th></tr>`;
  const rows = vm.rows.map((row) => {
    const skip = row.skip
      ? `<button type="button" class="rw-skip${row.skip.mine ? " rw-on" : ""}" data-rw-skip="${esc(row.mark)}" aria-pressed="${row.skip.mine}" title="${esc(UI.skipTitle(row.name))}">${esc(UI.skipVote(row.skip.votes, row.skip.needed))}</button>`
      : "";
    return `<tr class="${row.isMe ? "rw-me" : ""}">
        <td class="rw-l"><div class="rw-seat">${seatCell(row, esc)}</div>${live ? `<div class="rw-sub" title="${esc(breakdownTitle(row.projectedBreakdown))}">${esc(breakdownText(row.projectedBreakdown))}</div>` : ""}</td>
        <td class="rw-num" title="${esc(breakdownTitle(row.breakdown))}"><span class="rw-count" data-rw-count="${esc(row.mark)}">${row.shownScore}</span></td>
        ${live ? `<td class="rw-num rw-live" title="${esc(breakdownTitle(row.projectedBreakdown))}">${row.projected}</td>` : ""}
        <td class="rw-num">${row.meeplesLeft}<span class="rw-of">/${row.meeplesTotal}</span></td>
        <td><div class="rw-status"><span class="rw-pill rw-pill-${row.statusKey}">${esc(row.statusText)}</span>${skip}</div></td>
      </tr>`;
  }).join("");
  return `<table class="rw-scores"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

export function resultsHtml(vm, esc) {
  const rows = vm.results.map((r, i) => `<tr class="${r.winner ? "rw-win" : ""}${r.isMe ? " rw-me" : ""}">
      <td class="rw-num">${r.winner ? "👑" : i + 1}</td>
      <td class="rw-l"><div class="rw-seat">${seatCell(r, esc)}</div></td>
      ${["city", "road", "cloister", "field"].map((k) => `<td class="rw-num">${(r.breakdown && r.breakdown[k]) || 0}</td>`).join("")}
      <td class="rw-num rw-total">${r.score}</td>
    </tr>`).join("");
  return `<h3 class="rw-results-title">${esc(UI.winner(vm.winnerNames))}</h3>
    <table class="rw-scores rw-results-table">
      <thead><tr><th></th><th class="rw-l">${esc(UI.colPlayer)}</th>${["city", "road", "cloister", "field"].map((k) => `<th title="${esc(capitalize(featureName(k)))}">${FEATURE_ICONS[k]}</th>`).join("")}<th>${esc(UI.total)}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ---- "Tiles left" panel (display only, approximate when tiles were discarded) ----
// Mirrors the server's deck sizes (PLAN.md options: quick ≈ half, big ×2).
function deckCount(count, deck) {
  if (deck === "big") return count * 2;
  if (deck === "quick") return Math.max(1, Math.round(count / 2));
  return count;
}

// Remaining per type = deck count − tiles on the board − tiles in hands. Dead
// tiles discarded at a deal are invisible to clients, so the sum can exceed
// bag_count: then it is labelled approximate.
export function tilesLeft(game) {
  const defs = game.tile_defs || {};
  const deck = (game.options && game.options.deck) || "standard";
  const left = {};
  Object.values(defs).forEach((d) => { left[d.id] = deckCount(Number(d.count) || 0, deck); });
  (Array.isArray(game.board) ? game.board : []).forEach((b) => { if (b.t in left) left[b.t] -= 1; });
  (Array.isArray(game.players) ? game.players : []).forEach((p) => { if (p.tile && p.tile in left) left[p.tile] -= 1; });
  const list = Object.keys(left).map((id) => ({ id, n: Math.max(0, left[id]) }));
  const total = list.reduce((a, x) => a + x.n, 0);
  list.sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  return { list, exact: total === (Number(game.bag_count) || 0) };
}

export function bagPanelHtml(vm, esc) {
  const { list, exact } = vm.tilesLeft;
  const cells = list.map((x) => {
    const def = vm.defs[x.id];
    if (!def) return "";
    return `<div class="rw-bag-cell${x.n ? "" : " rw-gone"}">${tileSvg(def, { size: 34, palette: vm.palette, idPrefix: `rwBag${x.id.replace(/[^a-z0-9]/gi, "")}` })}<span>×${x.n}</span></div>`;
  }).join("");
  return `<div class="rw-bag-head"><div>${esc(UI.tilesLeft)}<small>${esc(exact ? UI.tilesLeftExact(vm.bagCount) : UI.tilesLeftApprox(vm.bagCount))}</small></div>
      <button type="button" class="rw-bag-close" data-rw-bag aria-label="${esc(UI.close)}">✕</button></div>
    <div class="rw-bag-grid">${cells}</div>`;
}
