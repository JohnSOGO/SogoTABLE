// Chinese Checkers — HTML for the non-board panels: status strip, action bar,
// seat table, final results. Pure string builders over the view model that
// render.js prepares; every word comes from branding.js. No rule logic: legal
// moves, distances, ranks and statuses all arrive decided by the server.
import { UI, teamName } from "./branding.js";

export function stripHtml(vm, esc) {
  const prio = vm.priorityRank
    ? `<span class="cc-badge cc-badge-prio${vm.priorityRank === 1 ? " cc-first" : ""}" title="${esc(UI.priorityTitle(vm.priorityRank, vm.priorityN))}">${esc(UI.priority(vm.priorityRank, vm.priorityN))}</span>`
    : "";
  const locked = vm.complete ? "" : `<span class="cc-badge cc-badge-locked">${esc(UI.lockedCount(vm.lockedDone, vm.lockedTotal))}</span>`;
  const tickerClass = vm.flash ? ` cc-ticker-${vm.flash.kind}` : "";
  const tickerText = vm.flash ? vm.flash.text : (vm.ticker ? vm.ticker.text : "");
  const page = !vm.flash && vm.ticker && vm.ticker.pages > 1
    ? `<span class="cc-page">${esc(UI.tickerPage(vm.ticker.page + 1, vm.ticker.pages))}</span>` : "";
  return `<div class="cc-strip-line">
      <span class="cc-round">${esc(UI.round(vm.round))}</span>${prio}${locked}
    </div>
    <div class="cc-strip-line cc-mystate${vm.mineLocked ? " cc-mystate-locked" : ""}">${esc(vm.myStateText)}</div>
    <div class="cc-strip-line cc-ticker${tickerClass}" data-cc-ticker${page ? ' role="button" tabindex="0"' : ""}>${page}<span class="cc-ticker-text">${tickerText ? esc(tickerText) : "&nbsp;"}</span></div>`;
}

// Fixed four-slot bar: the primary slot swaps Lock in ⇄ Change move so no
// control ever moves; unavailable controls are disabled, never hidden.
export function controlsHtml(vm, esc) {
  const c = vm.controls;
  const primary = c.primary === "change"
    ? `<button type="button" class="cc-btn cc-btn-change" data-cc-act="retract" ${c.canChange ? "" : "disabled"}>${esc(UI.change)}</button>`
    : `<button type="button" class="cc-btn cc-btn-lock" data-cc-act="lock" ${c.canLock ? "" : "disabled"}>${esc(c.sending ? UI.sending : UI.lock)}</button>`;
  return `<button type="button" class="cc-btn cc-btn-ghost" data-cc-act="undo" ${c.canUndo ? "" : "disabled"}>↶ ${esc(UI.undo)}</button>
    <button type="button" class="cc-btn cc-btn-ghost" data-cc-act="clear" ${c.canClear ? "" : "disabled"}>✕ ${esc(UI.clear)}</button>
    <button type="button" class="cc-btn cc-btn-pass" data-cc-act="pass" ${c.canPass ? "" : "disabled"}>${esc(UI.pass)}</button>
    ${primary}`;
}

function seatCell(row, esc) {
  return `<span class="cc-swatch" style="--cc-sw:${esc(row.color)}"></span>
    <span class="cc-name">${row.icon ? `${esc(row.icon)} ` : ""}${esc(row.name)}${row.isMe ? ` <em>(${esc(UI.you)})</em>` : ""}</span>`;
}

function goalBar(row) {
  const total = Math.max(1, row.total || 0);
  const pct = Math.round((Math.min(total, row.inGoal || 0) / total) * 100);
  return `<div class="cc-goalbar" style="--cc-pct:${pct}%;--cc-sw:${row.color}"><span></span></div>`;
}

export function tableHtml(vm, esc) {
  const head = `<tr><th class="cc-l">${esc(UI.colPlayer)}</th><th>${esc(UI.colGoal)}</th><th title="${esc(UI.distTitle)}">${esc(UI.colDist)}</th><th>${esc(UI.colStatus)}</th></tr>`;
  const rows = vm.rows.map((row) => {
    const skip = row.skip
      ? `<button type="button" class="cc-skip${row.skip.mine ? " cc-on" : ""}" data-cc-skip="${esc(row.mark)}" aria-pressed="${row.skip.mine}" title="${esc(UI.skipTitle(row.name))}">${esc(UI.skipVote(row.skip.votes, row.skip.needed))}</button>`
      : "";
    const team = row.team !== null && row.team !== undefined ? `<div class="cc-sub">${esc(teamName(row.team))}</div>` : "";
    return `<tr class="${row.isMe ? "cc-me" : ""}">
        <td class="cc-l"><div class="cc-seat">${row.prio ? `<span class="cc-prio" title="${esc(UI.priorityTitle(row.prio, vm.priorityN))}">${row.prio}</span>` : ""}${seatCell(row, esc)}</div>${team}</td>
        <td class="cc-num">${row.inGoal}<span class="cc-of">/${row.total}</span>${goalBar(row)}</td>
        <td class="cc-num">${row.distance}</td>
        <td><div class="cc-status"><span class="cc-pill cc-pill-${row.statusKey}">${esc(row.statusText)}</span>${skip}</div></td>
      </tr>`;
  }).join("");
  return `<table class="cc-scores"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

export function resultsHtml(vm, esc) {
  const rows = vm.results.map((r) => `<tr class="${r.winner ? "cc-win" : ""}${r.isMe ? " cc-me" : ""}">
      <td class="cc-num cc-rank">${r.winner ? "👑" : esc(String(r.rank || "–"))}</td>
      <td class="cc-l"><div class="cc-seat">${seatCell(r, esc)}</div>${r.team !== null && r.team !== undefined ? `<div class="cc-sub">${esc(teamName(r.team))}</div>` : ""}</td>
      <td class="cc-num">${esc(r.finished ? UI.finishedYes : UI.finishedNo(r.distance))}</td>
      <td class="cc-num cc-total">${r.score}</td>
    </tr>`).join("");
  return `<h3 class="cc-results-title">${esc(vm.winnerText)}</h3>
    <table class="cc-scores cc-results-table">
      <thead><tr><th>${esc(UI.colRank)}</th><th class="cc-l">${esc(UI.colPlayer)}</th><th>${esc(UI.colGoal)}</th><th>${esc(UI.colScore)}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}
