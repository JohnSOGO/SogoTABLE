// Reefkeepers — HTML for the panels around the reef: status strip, draft row,
// tile tools + lock bar, table (ready chips + skip votes), other reefs, round
// log and final results. Pure string builders over the view model that
// render.js prepares; every word comes from branding.js and every player
// string is escaped with `esc`. No rule logic: legal spots, scores, claim
// order and outcomes all arrive decided by the server.
import { pearlIcon, swatchSvg, tileSvg } from "./art.js";
import { reefSvg, squareWindow } from "./board-view.js";
import { HABITAT_IDS, LOG, UI, habitatName, ordinal, pearlWord } from "./branding.js";

const dot = (color) => `<span class="rk-dot" style="background:${color}"></span>`;
const who = (p, esc) => `${dot(p.color)}${p.icon ? `${esc(p.icon)} ` : ""}${esc(p.name)}`;

export function stripHtml(vm, esc) {
  const round = vm.finalRound ? UI.finalRound : UI.round(vm.round, vm.roundsTotal);
  const msg = vm.flash
    ? `<span class="rk-flash rk-flash-${vm.flash.kind}">${esc(vm.flash.text)}</span>`
    : `<span class="rk-mystate">${esc(vm.stateText)}</span>`;
  return `<div class="rk-strip">
      <span class="rk-round">${esc(round)}</span>
      ${vm.deckCount !== null ? `<span class="rk-deck">${esc(UI.tilesLeft(vm.deckCount))}</span>` : ""}
      ${msg}
    </div>`;
}

export function claimOrderHtml(vm, esc) {
  if (!vm.claimOrder.length) return "";
  const chips = vm.claimOrder.map((p, i) => `<li class="rk-claim${p.isMe ? " rk-me" : ""}"><b>${i + 1}</b>${dot(p.color)}<span class="rk-cn">${p.icon ? `${esc(p.icon)} ` : ""}${esc(p.name)}</span></li>`).join("");
  return `<div class="rk-claims"><span class="rk-label">${esc(UI.claimOrder)}</span><ol>${chips}</ol></div>`;
}

export function draftHtml(vm, esc) {
  let body;
  if (!vm.offer.length) body = `<p class="rk-note">${esc(UI.draftEmpty)}</p>`;
  else {
    body = `<div class="rk-offer">${vm.offer.map((t) => {
      const rank = vm.picks.indexOf(t.id);
      const ranked = rank >= 0;
      const hint = vm.hintPick === t.id;
      return `<button type="button" class="rk-offer-tile${ranked ? " rk-ranked" : ""}${hint ? " rk-hinted" : ""}" data-pick="${esc(t.id)}"
          aria-pressed="${ranked}" ${vm.draftLocked ? "disabled" : ""} aria-label="${esc(`${t.n}: ${habitatName(t.a)} + ${habitatName(t.b)}`)}">
          <span class="rk-n">${esc(String(t.n))}</span>
          ${tileSvg(t, 0)}
          <span class="rk-rank">${ranked ? esc(ordinal(rank)) : "&nbsp;"}</span>
          ${hint ? `<span class="rk-hint-tag">✦ ${esc(UI.hintPick)}</span>` : ""}
        </button>`;
    }).join("")}</div>
    <p class="rk-note">${esc(vm.firstRound ? UI.draftFirst : UI.draftHelp)}</p>`;
  }
  return `<section class="rk-card rk-draft">
      <h3>${esc(UI.draftHeading)}</h3>
      ${claimOrderHtml(vm, esc)}
      ${body}
    </section>`;
}

export function reefCardHtml(vm, esc) {
  const scoreBadge = vm.myScore !== null ? `<span class="rk-score-badge">${esc(String(vm.myScore))} <small>${esc(UI.pts)}</small></span>` : "";
  let tools;
  if (!vm.mySeat) tools = `<p class="rk-note">${esc(UI.spectating)}</p>`;
  else if (!vm.pending) tools = `<p class="rk-note">${esc(vm.finalDone ? UI.gameOver : UI.noPending)}</p>`;
  else {
    tools = `<div class="rk-tools">
        <div class="rk-pending" title="${esc(UI.pendingLabel)}">${tileSvg(vm.pending, vm.rot, "rk-tile-svg rk-pending-svg")}</div>
        <div class="rk-tools-text"><b>${esc(UI.pendingLabel)}</b><span class="${vm.cantFit ? "rk-warn" : ""}">${esc(vm.toolText)}</span></div>
        <button type="button" class="rk-btn rk-btn-ghost" data-rotate ${vm.canRotate ? "" : "disabled"}>⟳ ${esc(UI.rotate)}</button>
      </div>`;
  }
  return `<section class="rk-card rk-mine">
      <h3>${esc(UI.myReef)} ${scoreBadge}</h3>
      <div class="rk-reef-wrap">${vm.myReefSvg}</div>
      ${tools}
    </section>`;
}

export function lockBarHtml(vm, esc) {
  if (!vm.mySeat || vm.complete) return "";
  const label = vm.locked ? `✓ ${UI.lockedIn}` : vm.sending ? UI.locking : vm.lockBlocker || UI.lockIn;
  return `<div class="rk-lockbar">
      <button type="button" class="rk-btn rk-btn-lock${vm.locked ? " rk-is-locked" : ""}" data-lock ${vm.canLock ? "" : "disabled"}>${esc(label)}</button>
      ${vm.locked ? `<span class="rk-wait">${esc(UI.waitingFor(vm.waitingNames))}</span>` : ""}
    </div>`;
}

export function tableHtml(vm, esc) {
  const chips = vm.seats.map((p) => {
    const skip = p.skip
      ? `<button type="button" class="rk-btn rk-btn-skip" data-skip="${esc(p.mark)}" ${p.skip.mine ? "disabled" : ""}>${esc(UI.skipBtn(p.name))}${p.skip.votes ? ` · ${esc(UI.skipVotes(p.skip.votes))}` : ""}</button>`
      : "";
    return `<li class="rk-seat rk-seat-${p.status}${p.isMe ? " rk-me" : ""}">
        <span class="rk-seat-name">${who(p, esc)}${p.isMe ? ` <small>(${esc(UI.you)})</small>` : ""}</span>
        ${p.score !== null ? `<span class="rk-seat-score">${esc(String(p.score))}</span>` : ""}
        <span class="rk-seat-status">${p.status === "ready" ? "✓ " : ""}${esc(p.statusText)}</span>
        ${skip}
      </li>`;
  }).join("");
  return `<section class="rk-card rk-table"><h3>${esc(UI.readyHeading)}</h3><ul class="rk-seats">${chips}</ul></section>`;
}

function regionsHtml(score, esc) {
  if (!score) return "";
  const byHab = {};
  (score.regions || []).forEach((r) => {
    const h = byHab[r.t] || (byHab[r.t] = { points: 0, cells: 0, pearls: 0 });
    h.points += Number(r.points) || 0; h.cells += Number(r.size) || 0; h.pearls += Number(r.pearls) || 0;
  });
  const rows = HABITAT_IDS.filter((id) => byHab[id]).map((id) => {
    const h = byHab[id];
    return `<li>${swatchSvg(id)}<span class="rk-hab">${esc(habitatName(id))}</span><span class="rk-calc">${h.cells} · ${h.pearls}${pearlIcon()}</span><b>${h.points}</b></li>`;
  });
  if (score.heart) rows.push(`<li><span class="rk-bonus">♥</span><span class="rk-hab">${esc(UI.heartBonus)}</span><span></span><b>+${esc(String(score.heart))}</b></li>`);
  if (score.full) rows.push(`<li><span class="rk-bonus">▣</span><span class="rk-hab">${esc(UI.fullBonus)}</span><span></span><b>+${esc(String(score.full))}</b></li>`);
  return rows.length ? `<ul class="rk-regions">${rows.join("")}</ul>` : "";
}

export function othersHtml(vm, esc) {
  if (!vm.others.length) return "";
  const cards = vm.others.map((p) => {
    const open = vm.expanded === p.mark;
    const svg = reefSvg({ cells: p.cells, win: squareWindow(p.cells, vm.size), label: esc(`${p.name} — ${UI.myReef}`) });
    return `<button type="button" class="rk-other${open ? " rk-open" : ""}" data-expand="${esc(p.mark)}" aria-expanded="${open}">
        <span class="rk-other-head"><span class="rk-other-name">${who(p, esc)}</span>${p.score !== null ? `<b>${esc(String(p.score))}</b>` : ""}</span>
        <span class="rk-other-reef">${svg}</span>
        ${p.discards ? `<span class="rk-other-sub">${esc(UI.discards(p.discards))}</span>` : ""}
      </button>`;
  }).join("");
  const open = vm.others.find((p) => p.mark === vm.expanded);
  const detail = open ? `<div class="rk-expanded">
      <div class="rk-expanded-head"><span>${who(open, esc)}</span>
        <button type="button" class="rk-btn rk-btn-ghost" data-expand="${esc(open.mark)}">${esc(UI.close)}</button></div>
      <div class="rk-expanded-body"><div class="rk-expanded-reef">${reefSvg({ cells: open.cells, win: squareWindow(open.cells, vm.size) })}</div>${regionsHtml(open.scoreObj, esc)}</div>
    </div>` : "";
  return `<section class="rk-card rk-others"><h3>${esc(UI.othersHeading)} <small>${esc(UI.tapToView)}</small></h3>
      <div class="rk-other-grid">${cards}</div>${detail}</section>`;
}

export function logHtml(vm, esc) {
  const items = vm.log.length
    ? vm.log.map((l) => `<li class="rk-log-${l.type}${l.mine ? " rk-log-mine" : ""}">${esc(l.text)}</li>`).join("")
    : `<li class="rk-note">${esc(UI.logEmpty)}</li>`;
  return `<section class="rk-card rk-log"><h3>${esc(UI.logHeading)}</h3><ul>${items}</ul></section>`;
}

export function resultsHtml(vm, esc) {
  if (!vm.results.length) return "";
  const top = vm.results.filter((r) => r.rank === 1);
  const title = top.length > 1 ? UI.tie : UI.winner(top[0] ? top[0].name : "?");
  const rows = vm.results.map((r) => `<li class="rk-result${r.rank === 1 ? " rk-first" : ""}${r.isMe ? " rk-me" : ""}">
      <div class="rk-result-head"><span class="rk-place">${esc(ordinal(r.rank - 1))}</span>
        <span class="rk-result-name">${who(r, esc)}</span><b class="rk-result-total">${esc(String(r.total))}</b></div>
      <div class="rk-result-sub">${esc(UI.largest)}: ${esc(String(r.largest ?? "—"))} · ${pearlIcon()} ${esc(`${r.pearls ?? 0} ${pearlWord(Number(r.pearls) || 0)}`)}</div>
      ${regionsHtml(r.scoreObj, esc)}
    </li>`).join("");
  return `<section class="rk-card rk-results"><h3>🐚 ${esc(title)}</h3><ol>${rows}</ol></section>`;
}

// One round-log line from a server event. Tile fields are ids ("t17", "t17b");
// the number shown is the id's digits, which the contract pins to the tile's `n`.
const tileNo = (id) => {
  const m = /^t(\d+)/.exec(String(id || ""));
  return m ? Number(m[1]) : null;
};
export function logLine(e, nameOf) {
  const name = nameOf(e.mark);
  switch (e.type) {
    case "placed": return LOG.placed(name, tileNo(e.tile));
    case "discarded": return LOG.discarded(name);
    case "picked": return LOG.picked(name, tileNo(e.tile), Number(e.choice) || 0);
    case "bumped": {
      const by = (Array.isArray(e.taken_by) ? e.taken_by : [e.taken_by]).filter(Boolean).map(nameOf);
      return LOG.bumped(name, by, tileNo(e.tile));
    }
    case "skipped": return LOG.skipped(name);
    case "round": return LOG.round(e.round);
    case "final": return LOG.final;
    default: return "";
  }
}
