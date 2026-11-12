// Tradewind Isles — HTML for the non-board panels: top bar, hand + build bar
// + discoveries + Done, scoreboard, island log, results. Pure string builders
// over the view model (view.js); every word comes from branding.js. Buttons
// carry data-tw="verb" (+ data-v) and are wired by ONE delegated listener in
// render.js. Disabled-not-hidden: controls keep their place while waiting.
import { ASSETS } from "./assets.js";
import { diceSvg } from "./art.js";
import { AWARDS, CAPTAIN, CARDS, HELP, LOG, PIECES, RENOWN, RESOURCE_ORDER, UI, cardEmoji, cardName, resEmoji, resName } from "./branding.js";
import { canPay, shortfall } from "./view.js";

export function resIcon(r, esc) {
  const url = ASSETS.resources && ASSETS.resources[r];
  return url ? `<img class="tw-resimg" src="${esc(url)}" alt="${esc(resName(r))}">` : `<span aria-hidden="true">${resEmoji(r)}</span>`;
}

export function costHtml(cost, esc) {
  if (!cost) return "";
  return Object.entries(cost).map(([r, n]) => `<span class="tw-cost-item">${n > 1 ? n : ""}${resIcon(r, esc)}</span>`).join("");
}

function swatch(color, esc) {
  return `<span class="tw-swatch" style="background:${esc(color)}"></span>`;
}

export function topHtml(vm, esc) {
  const g = vm.game;
  const dice = Array.isArray(g.dice) && g.dice.length === 2
    ? `<span class="tw-dice${g.dice[0] + g.dice[1] === 7 ? " tw-seven" : ""}" title="${esc(UI.dice(g.dice[0], g.dice[1]))}">${diceSvg(g.dice[0])}${diceSvg(g.dice[1])}<b>${g.dice[0] + g.dice[1]}</b></span>`
    : `<span class="tw-dice tw-dice-none">${esc(UI.noRoll)}</span>`;
  const round = g.phase === "setup" ? UI.setupRound : UI.round(g.round);
  const captain = vm.playing && g.phase !== "setup" && g.captain
    ? `<span class="tw-captain" title="${esc(UI.captainTitle)}">${CAPTAIN.emoji} ${esc(vm.name(g.captain))}</span>` : "";
  const msg = vm.flash
    ? `<div class="tw-flash tw-flash-${vm.flash.kind}" role="status">${esc(vm.flash.text)}</div>`
    : `<div class="tw-prompt">${esc(vm.sending ? UI.sending : vm.prompt)}</div>`;
  return `<div class="tw-top-line"><span class="tw-round">${esc(round)}</span>${dice}${captain}
      <span class="tw-target" title="${esc(RENOWN.name)}">${RENOWN.emoji}→${Number(g.options && g.options.target) || 10}</span></div>${msg}`;
}

function handChips(vm, esc) {
  if (!vm.seat || !vm.seat.hand) return "";
  return RESOURCE_ORDER.map((r) => {
    const n = Number(vm.hand[r]) || 0;
    return `<span class="tw-res${n ? "" : " tw-zero"}" title="${esc(resName(r))}">${resIcon(r, esc)}<b>${n}</b></span>`;
  }).join("");
}

function buildBar(vm, esc) {
  const seat = vm.seat;
  const left = (seat && seat.pieces_left) || {};
  const free = (seat && Number(seat.free_paths)) || 0;
  const items = [
    { kind: "path", left: left.path },
    { kind: "hut", left: left.hut },
    { kind: "lodge", left: left.lodge },
    { kind: "discovery", left: vm.discoveryLeft },
  ];
  return items.map((it) => {
    const cost = vm.costs[it.kind];
    const isFree = it.kind === "path" && free > 0;
    const afford = isFree || canPay(cost, vm.hand);
    const hasLeft = (Number(it.left) || 0) > 0;
    const enabled = vm.inBuild && !vm.pending && hasLeft && afford;
    const on = vm.sel.mode === it.kind;
    const hint = vm.showAfford && vm.inBuild && hasLeft && !afford
      ? `<span class="tw-need">${Object.entries(shortfall(cost, vm.hand)).map(([r, n]) => `−${n}${resEmoji(r)}`).join(" ")}</span>` : "";
    const cls = `tw-build${on ? " tw-on" : ""}${vm.showAfford && enabled ? " tw-afford" : ""}`;
    const sub = isFree ? `<span class="tw-free">${esc(UI.free)} ×${free}</span>` : `<span class="tw-cost">${costHtml(cost, esc)}</span>`;
    return `<button type="button" class="${cls}" data-tw="${it.kind === "discovery" ? "buy" : "mode"}" data-v="${it.kind}" ${enabled ? "" : "disabled"} aria-pressed="${on}">
        <span class="tw-build-name">${PIECES[it.kind].emoji} ${esc(PIECES[it.kind].name)}</span>${sub}
        <span class="tw-left">${esc(UI.piecesLeft(Number(it.left) || 0))}</span>${hint}</button>`;
  }).join("");
}

function discoveryCards(vm, esc) {
  const list = vm.seat && Array.isArray(vm.seat.discoveries) ? vm.seat.discoveries : [];
  if (!list.length) return `<div class="tw-empty">${esc(UI.noCards)}</div>`;
  const usedThisRound = vm.seat.played_card_round === vm.round;
  return list.map((c, i) => {
    const meta = CARDS[c.card] || { text: "" };
    const isNew = c.bought_round === vm.round;
    const monument = c.card === "monument";
    const playable = vm.inBuild && !vm.pending && !monument && !isNew && !usedThisRound;
    const note = monument ? UI.cardHidden : isNew ? UI.cardNew : usedThisRound ? UI.cardUsed : meta.text;
    const on = (vm.sel.mode === "ranger" && c.card === "ranger") || vm.sel.flow === c.card;
    return `<button type="button" class="tw-card${on ? " tw-on" : ""}${monument ? " tw-card-monument" : ""}" data-tw="card" data-v="${esc(c.card)}" data-i="${i}" ${playable ? "" : "disabled"} title="${esc(meta.text)}">
        <span class="tw-card-emoji">${cardEmoji(c.card)}</span><span class="tw-card-body"><b>${esc(cardName(c.card))}</b><small>${esc(note)}</small></span></button>`;
  }).join("");
}

export function handHtml(vm, esc) {
  if (!vm.seat) return "";
  const seat = vm.seat;
  const doneEnabled = vm.inBuild && !vm.pending;
  const done = Boolean(seat.done);
  return `<div class="tw-hand-head"><span class="tw-h">${esc(UI.hand)}</span><div class="tw-res-row">${handChips(vm, esc)}</div></div>
    <div class="tw-buildbar">${buildBar(vm, esc)}</div>
    <div class="tw-h tw-h-sub">${esc(UI.cards)}</div>
    <div class="tw-cards">${discoveryCards(vm, esc)}</div>
    <div class="tw-done-row">
      <button type="button" class="tw-tradebtn${vm.trade.open ? " tw-on" : ""}" data-tw="trade-toggle" aria-expanded="${vm.trade.open}">🤝 ${esc(vm.trade.open ? UI.tradeClose : UI.trade)}</button>
      <button type="button" class="tw-done${done ? " tw-on" : ""}" data-tw="done" ${doneEnabled ? "" : "disabled"} aria-pressed="${done}">${esc(done ? UI.doneOn : UI.doneIdle)}</button>
    </div>`;
}

export function scoresHtml(vm, esc) {
  const head = `<tr><th class="tw-l">${esc(UI.colPlayer)}</th><th title="${esc(RENOWN.name)}">${UI.renownShort}</th><th>${UI.cardsShort}</th><th>${UI.discShort}</th><th>${UI.rangersShort}</th><th>${UI.pathShort}</th><th></th></tr>`;
  const rows = vm.rows.map((r) => {
    const badges = [
      r.captain ? `<span class="tw-badge" title="${esc(UI.captainTitle)}">${CAPTAIN.emoji}</span>` : "",
      r.causeway ? `<span class="tw-badge" title="${esc(AWARDS.causeway.name)}: ${esc(AWARDS.causeway.text)}">${AWARDS.causeway.emoji}</span>` : "",
      r.chief ? `<span class="tw-badge" title="${esc(AWARDS.chief_ranger.name)}: ${esc(AWARDS.chief_ranger.text)}">${AWARDS.chief_ranger.emoji}</span>` : "",
    ].join("");
    const skip = r.skip
      ? `<button type="button" class="tw-skip${r.skip.mine ? " tw-on" : ""}" data-tw="skip" data-v="${esc(r.mark)}" aria-pressed="${r.skip.mine}" title="${esc(UI.skipTitle(r.name))}">${esc(UI.skipVote(r.skip.votes, r.skip.needed))}</button>` : "";
    const chip = r.statusText ? `<span class="tw-pill tw-pill-${r.statusKey}">${esc(r.statusText)}</span>` : "";
    return `<tr class="${r.isMe ? "tw-me" : ""}">
        <td class="tw-l"><div class="tw-seat">${swatch(r.color, esc)}<span class="tw-name">${r.icon ? `${esc(r.icon)} ` : ""}${esc(r.name)}${r.isMe ? ` <em>(${esc(UI.you)})</em>` : ""}</span>${badges}</div></td>
        <td class="tw-num tw-renown">${r.renown}</td><td class="tw-num">${r.cards}</td><td class="tw-num">${r.discoveries}</td>
        <td class="tw-num">${r.rangers}</td><td class="tw-num">${r.longest}</td>
        <td><div class="tw-status">${chip}${skip}</div></td></tr>`;
  }).join("");
  return `<table class="tw-scores"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

// Event text never names players: the actor (mark), trade partner and monkey
// victim are rendered here from the room roster, around the server's text.
function logLine(vm, e, esc) {
  const who = (m) => `<b>${esc(vm.iconOf(m) ? `${vm.iconOf(m)} ` : "")}${esc(vm.name(m))}</b>`;
  const lead = e.mark ? who(e.mark) : esc(LOG.table(e.type));
  let tail = "";
  if (e.type === "trade" && e.partner) tail = ` ${esc(LOG.with)} ${who(e.partner)}`;
  if (e.type === "monkey" && e.victim) tail = ` (${who(e.victim)})`;
  const icon = LOG.icons[e.type] ? `${LOG.icons[e.type]} ` : "";
  return `${icon}${lead} ${esc(e.text)}${tail}`;
}

export function logHtml(vm, esc) {
  const events = [...vm.events].sort((a, b) => (b.seq || 0) - (a.seq || 0)).filter((e) => e.text).slice(0, 8);
  const items = events.length
    ? events.map((e) => `<li>${e.mark ? swatch(vm.colorOf(e.mark), esc) : `<span class="tw-swatch tw-swatch-none"></span>`}<span>${logLine(vm, e, esc)}</span></li>`).join("")
    : `<li class="tw-empty">${esc(UI.logEmpty)}</li>`;
  return `<div class="tw-h">${esc(UI.log)}</div><ul class="tw-log-list">${items}</ul>`;
}

// Static rules text — painted once with the skeleton so its open/closed state
// survives every snapshot.
export function helpHtml(esc) {
  return `<details class="tw-help"><summary>${esc(UI.help)}</summary><ul>${HELP.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></details>`;
}

export function resultsHtml(vm, esc) {
  const rows = vm.results.map((r) => `<tr class="${r.winner ? "tw-win" : ""}${r.isMe ? " tw-me" : ""}">
      <td class="tw-num">${r.winner ? "👑" : esc(String(r.rank || ""))}</td>
      <td class="tw-l"><div class="tw-seat">${swatch(r.color, esc)}<span class="tw-name">${r.icon ? `${esc(r.icon)} ` : ""}${esc(r.name)}${r.isMe ? ` <em>(${esc(UI.you)})</em>` : ""}</span></div></td>
      <td class="tw-num tw-total">${Number(r.renown) || 0} ${RENOWN.emoji}</td></tr>`).join("");
  return `<div class="tw-banner">🏝️ ${esc(UI.winner(vm.winnerNames))}</div>
    <table class="tw-scores tw-results-table"><thead><tr><th>${esc(UI.rank)}</th><th class="tw-l">${esc(UI.colPlayer)}</th><th>${esc(UI.total)}</th></tr></thead><tbody>${rows}</tbody></table>`;
}
