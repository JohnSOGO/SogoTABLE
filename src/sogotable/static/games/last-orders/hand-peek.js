// Last Orders — peek at my hand by card type (pure view; decides nothing).
//
// The top bar shows one small chip per hand-card type (action, reaction,
// gamble, spike) with how many I hold; tapping a chip opens a popover listing
// those cards with what they do. And when I lift a card that STARTS a gamble,
// a strip under my hand lists my gamble cards, so I can judge how well I can
// fight for the pot before committing. Everything comes from the projected
// me.hand + defs; nothing here judges strength, legality or odds. render.js
// owns the open/closed state, the clicks and mounting.
import { HAND_PEEK as L, KINDS } from "./branding.js";
import { CARDS } from "./content.js";
import { describeLines } from "./describe.js";
import { thingName } from "./panels.js";

export const PEEK_KINDS = ["action", "reaction", "gamble", "spike"];

export const isGambleStarter = (def) => Boolean(def && (def.effects || []).some((e) => e && e.op === "gamble"));

// My hand cards of one type, in hand order.
export function cardsOfKind(me, defs, kind) {
  return ((me && me.hand) || []).filter((c) => (defs[c.id] || {}).kind === kind);
}

const cardRow = (vm, c) => {
  const def = vm.defs[c.id] || {};
  const e = CARDS[c.id] || {};
  return `<li class="lo-peek-card"><b>${vm.esc(e.name || thingName(c.id))}</b><small>${vm.esc(describeLines(def, e).join(" "))}</small></li>`;
};

// The chip row for the top bar (empty when I have no hand to peek at).
export function peekChipsHtml(vm, open) {
  if (!vm.me || !vm.mySeat || vm.mySeat.out || vm.game.phase !== "play") return "";
  const chips = PEEK_KINDS.map((k) => {
    const n = cardsOfKind(vm.me, vm.defs, k).length;
    const label = L.chipLabel(n, KINDS[k]);
    return `<button type="button" class="lo-peek-chip${open === k ? " lo-on" : ""}${n ? "" : " lo-peek-none"}" data-lo-act="peek" data-v="${k}" aria-expanded="${open === k}" aria-label="${vm.esc(label)}" title="${vm.esc(label)}"><span aria-hidden="true">${L.icon[k]}</span><b>${n}</b></button>`;
  }).join("");
  return `<span class="lo-peek-chips" role="group" aria-label="${vm.esc(L.groupLabel)}">${chips}</span>`;
}

// The popover for the open chip.
export function peekPopoverHtml(vm, kind) {
  if (!kind || !vm.me || !PEEK_KINDS.includes(kind)) return "";
  const cards = cardsOfKind(vm.me, vm.defs, kind);
  const body = cards.length ? `<ul class="lo-peek-list">${cards.map((c) => cardRow(vm, c)).join("")}</ul>` : `<p class="lo-peek-empty">${vm.esc(L.none(KINDS[kind]))}</p>`;
  return `<div class="lo-peek-pop" data-lo-act="peek" data-v="${kind}">
      <div class="lo-peek-head">${L.icon[kind]} ${vm.esc(L.title(KINDS[kind], cards.length))}<small>${vm.esc(L.close)}</small></div>${body}</div>`;
}

// Under my hand while I hold up a gamble starter: my other gamble cards.
export function starterPeekHtml(vm) {
  const me = vm.me;
  if (!me || !vm.sel) return "";
  const card = (me.hand || []).find((c) => c.uid === vm.sel);
  if (!card || !isGambleStarter(vm.defs[card.id])) return "";
  const cards = cardsOfKind(me, vm.defs, "gamble").filter((c) => c.uid !== vm.sel);
  const body = cards.length ? `<ul class="lo-peek-list lo-peek-row">${cards.map((c) => cardRow(vm, c)).join("")}</ul>` : `<p class="lo-peek-empty">${vm.esc(L.noBackup)}</p>`;
  return `<div class="lo-peek-strip"><div class="lo-peek-head">${L.icon.gamble} ${vm.esc(L.backup(cards.length))}</div>${body}</div>`;
}
