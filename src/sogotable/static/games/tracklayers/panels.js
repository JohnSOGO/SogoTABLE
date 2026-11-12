// Tracklayers — HTML for every non-map panel: status strip, ticket picker,
// action area (market + deck, claim, tickets), hand, my tickets, score table,
// round log, helps toggles and the final results. Pure string builders over the
// view model render.js prepares; every word comes from branding.js. No rule
// logic: what is enabled is decided in render.js from the projection (UX
// pre-checks only — the server stays the authority).
import { ASSETS } from "./assets.js";
import { UI, WILD_ICON, cardName } from "./branding.js";

const swatch = (color) => `<span class="tl-swatch" style="background:${color}"></span>`;

export function cardChip(color, palette, { label = cardName(color), count = null, cls = "", attrs = "" } = {}) {
  const bg = palette.cards[color] || palette.cards.gray;
  const ink = palette.cardInk[color] || "#fff";
  const art = ASSETS.cardArt && ASSETS.cardArt[color] ? `<img class="tl-card-art" src="${ASSETS.cardArt[color]}" alt="">` : "";
  const icon = color === "wild" ? `<span class="tl-card-icon">${WILD_ICON}</span>` : "";
  const n = count === null ? "" : `<b class="tl-card-n">${count}</b>`;
  return `<span class="tl-card tl-card-${color} ${cls}" style="--tl-card:${bg};--tl-card-ink:${ink}" ${attrs}>${art}${icon}<span class="tl-card-name">${label}</span>${n}</span>`;
}

export function stripHtml(vm, esc) {
  const prio = vm.priority.map((p, i) => `<span class="tl-prio${p.isMe ? " tl-me" : ""}" title="${esc(p.name)}">${i + 1}${swatch(p.color)}${esc(p.name)}</span>`).join("");
  const line = vm.flash ? `<span class="tl-flash tl-flash-${vm.flash.kind}">${esc(vm.flash.text)}</span>` : `<span class="tl-mystate">${esc(vm.myStateText)}</span>`;
  const final = vm.finalBanner ? `<div class="tl-final" role="status">🔔 ${esc(vm.finalBanner)}</div>` : "";
  return `${final}<div class="tl-strip-top">
      <span class="tl-round">${esc(UI.round(vm.round))}</span>
      <span class="tl-meta">🂠 ${esc(UI.deck(vm.deckCount))}</span>
      <span class="tl-meta">🎫 ${esc(String(vm.ticketDeckCount))}</span>
      <span class="tl-meta tl-mytrains">${esc(UI.trains(vm.trains))}</span>
    </div>
    <div class="tl-prios" aria-label="${esc(UI.priority)}"><span class="tl-prio-label">${esc(UI.priority)}</span>${prio}</div>
    <div class="tl-stateline" aria-live="polite">${line}</div>`;
}

export function pickerHtml(vm, esc) {
  const pk = vm.picker;
  const rows = pk.tickets.map((t) => `<button type="button" class="tl-ticket tl-pick${t.on ? " tl-on" : ""}" data-tl-keep="${esc(t.id)}" aria-pressed="${t.on}" ${pk.disabled ? "disabled" : ""}>
      <span class="tl-check" aria-hidden="true">${t.on ? "✓" : ""}</span>
      <span class="tl-ticket-route">${esc(t.aName)} → ${esc(t.bName)}</span>
      <span class="tl-ticket-pts">${t.points}</span>
    </button>`).join("");
  return `<div class="tl-picker" role="dialog" aria-label="${esc(UI.pickerTitle)}">
      <h3>${esc(UI.pickerTitle)}</h3>
      <p class="tl-hint">${esc(UI.pickerHint(pk.min))}</p>
      <div class="tl-picker-list">${rows}</div>
      <button type="button" class="tl-btn tl-primary" data-tl-act="keep" ${pk.canKeep ? "" : "disabled"}>${esc(pk.sending ? UI.sending : pk.count >= pk.min ? UI.keep(pk.count) : UI.keepMore(pk.min))}</button>
    </div>`;
}

function marketHtml(vm, esc) {
  const cards = vm.market.map((m) => `<button type="button" class="tl-mkt${m.on ? " tl-on" : ""}" data-tl-mkt="${m.i}" aria-pressed="${m.on}" ${m.disabled ? "disabled" : ""} aria-label="${esc(cardName(m.color))}">
      ${cardChip(m.color, vm.palette, { label: esc(cardName(m.color)) })}${m.on ? `<span class="tl-pickno">${m.order}</span>` : ""}</button>`).join("");
  const dk = vm.deck;
  return `<section class="tl-sec tl-draw">
      <div class="tl-sec-head"><b>${esc(UI.drawTitle)}</b><span class="tl-hint">${esc(UI.drawHint)}</span></div>
      <div class="tl-market">${cards}
        <button type="button" class="tl-mkt tl-deck${dk.picks ? " tl-on" : ""}" data-tl-deck ${dk.disabled ? "disabled" : ""} aria-label="${esc(UI.deckButton)}">
          <span class="tl-card tl-card-back"><span class="tl-card-name">${esc(UI.deckButton)}</span><b class="tl-card-n">${esc(UI.deckLeft(dk.count))}</b></span>${dk.picks ? `<span class="tl-pickno">${dk.picks > 1 ? "×2" : dk.order}</span>` : ""}</button>
      </div>
      <button type="button" class="tl-btn tl-primary tl-wide" data-tl-act="draw" ${vm.canDraw ? "" : "disabled"}>${esc(vm.drawLabel)}</button>
    </section>`;
}

function claimHtml(vm, esc) {
  const rt = vm.route;
  let body;
  if (!rt) {
    body = `<p class="tl-hint tl-claim-empty">👆 ${esc(UI.claimHint)}</p>`;
  } else {
    const opts = rt.options.map((o) => `<button type="button" class="tl-pay${o.on ? " tl-on" : ""}" data-tl-pay="${esc(o.color)}" aria-pressed="${o.on}" ${vm.locked ? "disabled" : ""}>
        ${cardChip(o.color, vm.palette, { label: esc(o.label) })}</button>`).join("");
    body = `<div class="tl-route-card">
        <div class="tl-route-head">${cardChip(rt.color, vm.palette, { label: esc(UI.routeCost(rt.len, cardName(rt.color))) })}
          <b class="tl-route-name">${esc(UI.routeName(rt.aName, rt.bName))}</b><span class="tl-route-pts">${esc(UI.routePoints(rt.points))}</span>
          <button type="button" class="tl-x" data-tl-act="clear" aria-label="${esc(UI.clearRoute)}">✕</button></div>
        ${rt.blocker ? `<p class="tl-blocker">${esc(rt.blocker)}</p>` : `<div class="tl-paylabel">${esc(UI.payWith)}</div><div class="tl-pays">${opts}</div>`}
      </div>`;
  }
  return `<section class="tl-sec tl-claim">
      <div class="tl-sec-head"><b>${esc(UI.claimTitle)}</b></div>
      ${body}
      <button type="button" class="tl-btn tl-primary tl-wide" data-tl-act="claim" ${vm.canClaim ? "" : "disabled"}>${esc(UI.claim)}</button>
    </section>`;
}

export function actionsHtml(vm, esc) {
  const committed = vm.committedText ? `<div class="tl-committed">🔒 ${esc(UI.committed(vm.committedText))}</div>` : "";
  return `${committed}<div class="tl-actions${vm.locked ? " tl-locked" : ""}">
      ${claimHtml(vm, esc)}
      ${marketHtml(vm, esc)}
      <section class="tl-sec tl-tix">
        <div class="tl-sec-head"><b>${esc(UI.ticketsTitle)}</b><span class="tl-hint">${esc(UI.ticketsHint)}</span></div>
        <button type="button" class="tl-btn tl-secondary tl-wide" data-tl-act="tickets" ${vm.canTickets ? "" : "disabled"}>🎫 ${esc(vm.ticketDeckCount ? UI.ticketsButton : UI.ticketsEmpty)}</button>
      </section>
    </div>`;
}

export function handHtml(vm, esc) {
  const cards = vm.hand.map((h) => cardChip(h.color, vm.palette, { label: esc(cardName(h.color)), count: h.count, cls: h.count ? "" : "tl-zero" })).join("");
  const tickets = vm.myTickets.length
    ? vm.myTickets.map((t) => `<li class="tl-ticket${t.done === true ? " tl-done" : ""}">
        ${vm.helps.progress && t.done !== null ? `<span class="tl-prog${t.done ? " tl-prog-done" : ""}">${esc(t.done ? UI.ticketDone : vm.complete ? UI.ticketMissed : UI.ticketOpen)}</span>` : ""}
        <span class="tl-ticket-route">${esc(t.aName)} → ${esc(t.bName)}</span><span class="tl-ticket-pts">${t.points}</span></li>`).join("")
    : `<li class="tl-hint">${esc(UI.noTickets)}</li>`;
  return `<section class="tl-sec tl-hand">
      <div class="tl-sec-head"><b>${esc(UI.handTitle)}</b><span class="tl-meta">${esc(UI.trains(vm.trains))}</span></div>
      <div class="tl-cards">${cards}</div>
    </section>
    <section class="tl-sec tl-mytix">
      <div class="tl-sec-head"><b>${esc(UI.myTickets)}</b></div>
      <ul class="tl-ticket-list">${tickets}</ul>
    </section>`;
}

export function tableHtml(vm, esc) {
  const rows = vm.rows.map((r) => `<tr class="${r.isMe ? "tl-me" : ""}">
      <td class="tl-l"><div class="tl-seat">${swatch(r.color)}<span class="tl-name">${r.icon ? `${esc(r.icon)} ` : ""}${esc(r.name)}${r.isMe ? ` <em>(${esc(UI.you)})</em>` : ""}</span></div></td>
      <td class="tl-num">${r.score}</td><td class="tl-num">${r.trains}</td><td class="tl-num">${r.cards}</td><td class="tl-num">${r.tickets}</td>
      <td><div class="tl-status"><span class="tl-pill tl-pill-${r.statusKey}">${esc(r.statusText)}</span>${r.skip
        ? `<button type="button" class="tl-skip${r.skip.mine ? " tl-on" : ""}" data-tl-skip="${esc(r.mark)}" title="${esc(UI.skipTitle(r.name))}" ${r.skip.mine ? "disabled" : ""}>${esc(UI.skipVote(r.skip.votes, r.skip.needed))}</button>` : ""}</div></td>
    </tr>`).join("");
  return `<table class="tl-scores"><thead><tr><th class="tl-l">${esc(UI.colPlayer)}</th><th>${esc(UI.colScore)}</th><th>${esc(UI.colTrains)}</th><th>${esc(UI.colCards)}</th><th>${esc(UI.colTickets)}</th><th>${esc(UI.colStatus)}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function logHtml(vm, esc) {
  const items = vm.events.length
    ? vm.events.map((e) => `<li><span class="tl-ev-icon" aria-hidden="true">${e.icon}</span><span>${esc(e.text)}</span></li>`).join("")
    : `<li class="tl-hint">${esc(UI.logEmpty)}</li>`;
  return `<div class="tl-sec-head"><b>${esc(vm.logTitle)}</b></div><ul class="tl-log">${items}</ul>`;
}

export function helpsHtml(vm, esc) {
  const chip = (name) => `<button type="button" class="tl-help${vm.helps[name] ? " tl-on" : ""}" data-tl-help="${name}" aria-pressed="${vm.helps[name]}">${vm.helps[name] ? "✓ " : ""}${esc(UI.helps[name])}</button>`;
  return `<span class="tl-help-label">${esc(UI.helpsTitle)}</span>${chip("path")}${chip("afford")}${chip("progress")}`;
}

export function resultsHtml(vm, esc) {
  const rows = vm.results.map((r) => {
    const tix = r.ticketList.map((t) => `<li class="${t.done ? "tl-hit" : "tl-miss"}">${esc(t.done ? UI.ticketHit : UI.ticketMiss)} ${esc(t.aName)} → ${esc(t.bName)} <b>${t.done ? "+" : "−"}${Math.abs(t.points)}</b></li>`).join("");
    return `<tr class="${r.winner ? "tl-win" : ""}${r.isMe ? " tl-me" : ""}">
      <td class="tl-l"><div class="tl-seat">${swatch(r.color)}<span class="tl-name">${r.winner ? "🏆 " : ""}${esc(r.name)}</span></div></td>
      <td class="tl-num">${r.route_points}</td>
      <td class="tl-num">${r.ticket_points >= 0 ? "+" : ""}${r.ticket_points}<div class="tl-sub">${esc(UI.resTicketsDone(r.tickets_done, r.tickets_failed))}</div></td>
      <td class="tl-num">${r.longest}${r.longest_bonus ? `<div class="tl-sub tl-bonus">${esc(UI.longestBonus(r.longest_bonus))}</div>` : ""}</td>
      <td class="tl-num tl-total">${r.total}</td></tr>${tix ? `<tr class="tl-res-tixrow${r.winner ? " tl-win" : ""}"><td colspan="5"><ul class="tl-res-tix">${tix}</ul></td></tr>` : ""}`;
  }).join("");
  return `<h3 class="tl-results-title">🏁 ${esc(UI.results)}</h3>
    <p class="tl-winner">${esc(UI.winner(vm.winnerNames))}</p>
    <table class="tl-scores tl-res"><thead><tr><th class="tl-l">${esc(UI.colPlayer)}</th><th>${esc(UI.resRoutes)}</th><th>${esc(UI.resTickets)}</th><th>${esc(UI.resLongest)}</th><th>${esc(UI.resTotal)}</th></tr></thead><tbody>${rows}</tbody></table>`;
}
