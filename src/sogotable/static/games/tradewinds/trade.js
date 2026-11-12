// Tradewind Isles — the trade drawer: bank trades at the seat's dock rates
// and player offers (compose, open offers, accept / confirm / cancel). Pure
// HTML builders; buttons carry data-tw verbs wired by render.js. Rates come
// from players[me].rates and acceptors from the offer itself — the server
// validates every trade, so a stale button is answered with a reason.
import { RESOURCE_ORDER, UI, resName } from "./branding.js";
import { resIcon } from "./panels.js";

function bundle(obj, esc) {
  const parts = RESOURCE_ORDER.filter((r) => Number(obj && obj[r]) > 0).map((r) => `<span class="tw-bundle-item">${obj[r]}${resIcon(r, esc)}</span>`);
  return parts.length ? parts.join("") : "—";
}

function bankSection(vm, esc) {
  const t = vm.trade;
  const live = vm.inBuild && !vm.pending;
  const give = RESOURCE_ORDER.map((r) => {
    const rate = Number(vm.rates[r]) || 4;
    const ok = (Number(vm.hand[r]) || 0) >= rate;
    const on = t.bankGive === r;
    return `<button type="button" class="tw-chip tw-chip-res${on ? " tw-on" : ""}${vm.showAfford && ok ? " tw-afford" : ""}" data-tw="bank-give" data-v="${r}" ${ok && live ? "" : "disabled"} aria-pressed="${on}" title="${esc(resName(r))}">${resIcon(r, esc)}<small>${esc(UI.rate(rate))}</small></button>`;
  }).join("");
  const get = RESOURCE_ORDER.map((r) => {
    const left = Number(vm.bank[r]) || 0;
    const on = t.bankGet === r;
    return `<button type="button" class="tw-chip tw-chip-res${on ? " tw-on" : ""}" data-tw="bank-get" data-v="${r}" ${left > 0 && r !== t.bankGive && live ? "" : "disabled"} aria-pressed="${on}" title="${esc(left > 0 ? `${resName(r)} · ${left}` : UI.bankEmpty)}">${resIcon(r, esc)}<small>${left}</small></button>`;
  }).join("");
  const ready = t.bankGive && t.bankGet && t.bankGive !== t.bankGet;
  const label = ready ? UI.bankDo(Number(vm.rates[t.bankGive]) || 4, resName(t.bankGive), resName(t.bankGet)) : UI.bankPick;
  return `<div class="tw-h">${esc(UI.bankTrade)}</div>
    <div class="tw-trade-row"><span class="tw-trade-label">${esc(UI.give)}</span><div class="tw-chips">${give}</div></div>
    <div class="tw-trade-row"><span class="tw-trade-label">${esc(UI.get)}</span><div class="tw-chips">${get}</div></div>
    <button type="button" class="tw-act-btn tw-primary tw-wide" data-tw="bank-go" ${ready && live ? "" : "disabled"}>${esc(label)}</button>`;
}

function stepRow(vm, esc, side, obj, capOf) {
  return RESOURCE_ORDER.map((r) => {
    const n = Number(obj[r]) || 0;
    const cap = capOf(r);
    return `<div class="tw-step"><span class="tw-step-res">${resIcon(r, esc)}</span>
      <button type="button" class="tw-stepbtn" data-tw="${side}-" data-v="${r}" ${n > 0 ? "" : "disabled"} aria-label="−">−</button>
      <b class="tw-step-n">${n}</b>
      <button type="button" class="tw-stepbtn" data-tw="${side}+" data-v="${r}" ${n < cap ? "" : "disabled"} aria-label="+">+</button></div>`;
  }).join("");
}

function composeSection(vm, esc) {
  const t = vm.trade;
  const live = vm.inBuild && !vm.pending;
  const others = vm.order.filter((m) => m !== vm.myMark && vm.players[m]);
  const toBtns = [[null, UI.offerAnyone], ...others.map((m) => [m, vm.name(m)])].map(([m, label]) => {
    const on = (t.offerTo || null) === m;
    return `<button type="button" class="tw-chip${on ? " tw-on" : ""}" data-tw="offer-to" data-v="${esc(m || "")}" aria-pressed="${on}">${m ? `<span class="tw-swatch" style="background:${esc(vm.colorOf(m))}"></span>` : ""}${esc(label)}</button>`;
  }).join("");
  const sum = (o) => RESOURCE_ORDER.reduce((a, r) => a + (Number(o[r]) || 0), 0);
  const ready = live && sum(t.offerGive) > 0 && sum(t.offerWant) > 0;
  return `<div class="tw-h">${esc(UI.offerCompose)}</div>
    <div class="tw-trade-row"><span class="tw-trade-label">${esc(UI.give)}</span><div class="tw-steps tw-steps-tight">${stepRow(vm, esc, "og", t.offerGive, (r) => Number(vm.hand[r]) || 0)}</div></div>
    <div class="tw-trade-row"><span class="tw-trade-label">${esc(UI.offerWant)}</span><div class="tw-steps tw-steps-tight">${stepRow(vm, esc, "ow", t.offerWant, () => 9)}</div></div>
    <div class="tw-trade-row"><span class="tw-trade-label">${esc(UI.offerTo)}</span><div class="tw-chips">${toBtns}</div></div>
    <button type="button" class="tw-act-btn tw-primary tw-wide" data-tw="offer-post" ${ready ? "" : "disabled"}>${esc(UI.offerPost)}</button>`;
}

function offerItem(vm, esc, o) {
  const live = vm.inBuild && !vm.pending;
  const mine = o.from === vm.myMark;
  const who = mine ? UI.offerYours : UI.offerFrom(vm.name(o.from));
  const to = o.to ? (o.to === vm.myMark ? UI.offerToYou : UI.offerToName(vm.name(o.to))) : "";
  const head = `<div class="tw-offer-head"><span class="tw-swatch" style="background:${esc(vm.colorOf(o.from))}"></span><b>${esc(who)}</b>${to ? ` <em>${esc(to)}</em>` : ""}</div>
    <div class="tw-offer-terms"><span class="tw-bundle">${bundle(o.give, esc)}</span><span class="tw-for">${esc(UI.offerFor)}</span><span class="tw-bundle">${bundle(o.want, esc)}</span></div>`;
  const id = esc(String(o.id));
  if (mine) {
    const partners = [...new Set([...(o.acceptors || []), ...(o.bot_acceptors || [])])];
    const btns = partners.map((m) => `<button type="button" class="tw-act-btn tw-primary" data-tw="trade-confirm" data-v="${id}" data-p="${esc(m)}" ${live ? "" : "disabled"}>${esc(UI.tradeWith(vm.name(m)))}</button>`).join("");
    return `<li class="tw-offer tw-offer-mine">${head}<div class="tw-offer-acts"><span class="tw-muted">${esc(UI.offerAccepts)} ${partners.length ? "" : esc(UI.offerNobody)}</span>${btns}
      <button type="button" class="tw-act-btn tw-ghost" data-tw="offer-cancel" data-v="${id}" ${vm.pending ? "disabled" : ""}>${esc(UI.cancelOffer)}</button></div></li>`;
  }
  const forMe = !o.to || o.to === vm.myMark;
  const accepted = Array.isArray(o.acceptors) && o.acceptors.includes(vm.myMark);
  const act = forMe
    ? `<button type="button" class="tw-act-btn ${accepted ? "tw-ghost" : "tw-primary"}" data-tw="offer-accept" data-v="${id}" data-a="${accepted ? "0" : "1"}" ${live ? "" : "disabled"}>${esc(accepted ? UI.unaccept : UI.accept)}</button>`
    : "";
  return `<li class="tw-offer${accepted ? " tw-offer-accepted" : ""}">${head}<div class="tw-offer-acts">${accepted ? `<span class="tw-muted">✔ ${esc(UI.accepted)}</span>` : ""}${act}</div></li>`;
}

export function tradeHtml(vm, esc) {
  if (!vm.trade.open || !vm.seat) return "";
  const offers = Array.isArray(vm.game.offers) ? vm.game.offers : [];
  const list = offers.length ? offers.map((o) => offerItem(vm, esc, o)).join("") : `<li class="tw-empty">${esc(UI.offerNone)}</li>`;
  return `<div class="tw-trade-grid">
      <section class="tw-trade-bank">${bankSection(vm, esc)}</section>
      <section class="tw-trade-offers"><div class="tw-h">${esc(UI.offers)}</div><ul class="tw-offer-list">${list}</ul>${composeSection(vm, esc)}</section>
    </div>`;
}
