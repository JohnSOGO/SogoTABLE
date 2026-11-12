// Tradewind Isles — the contextual action panel that sits right under the
// board: setup placement, monkey / ranger victim choice, build confirmation,
// discard picker, and the Bountiful Tide / Market Day resource pickers.
// Display only: the lists offered (setup paths, monkey victims) are the
// server's `game.legal`, and Confirm buttons only gate on "has the player
// picked everything the action needs"; the server validates every send.
import { MONKEY, PIECES, RESOURCE_ORDER, UI, cardEmoji, cardName, resName } from "./branding.js";
import { resIcon } from "./panels.js";

function bar(left, right) {
  return `<div class="tw-act-row"><div class="tw-act-text">${left}</div><div class="tw-act-btns">${right}</div></div>`;
}
const btn = (verb, label, enabled, extra = "") => `<button type="button" class="tw-act-btn ${extra}" data-tw="${verb}" ${enabled ? "" : "disabled"}>${label}</button>`;

function victimChips(vm, esc) {
  const victims = (vm.sel.hex && vm.legal.monkey_victims && vm.legal.monkey_victims[vm.sel.hex]) || [];
  if (!vm.sel.hex) return "";
  if (!victims.length) return `<div class="tw-chips"><span class="tw-chip tw-chip-static">${esc(UI.noVictim)}</span></div>`;
  return `<div class="tw-chips"><span class="tw-chips-label">${esc(UI.pickVictim)}</span>${victims.map((m) => {
    const on = vm.sel.victim === m;
    const p = vm.players[m] || {};
    return `<button type="button" class="tw-chip${on ? " tw-on" : ""}" data-tw="victim" data-v="${esc(m)}" aria-pressed="${on}"><span class="tw-swatch" style="background:${esc(vm.colorOf(m))}"></span>${esc(vm.name(m))} · 🃏${Number(p.hand_count) || 0}</button>`;
  }).join("")}</div>`;
}

function monkeyPanel(vm, esc, isRanger) {
  const victims = (vm.sel.hex && vm.legal.monkey_victims && vm.legal.monkey_victims[vm.sel.hex]) || [];
  const ready = Boolean(vm.sel.hex) && (!victims.length || Boolean(vm.sel.victim)) && !vm.pending;
  const title = isRanger ? `${cardEmoji("ranger")} ${esc(cardName("ranger"))}` : `${MONKEY.emoji} ${esc(MONKEY.name)}`;
  const text = `<b>${title}</b> <span>${esc(vm.sel.hex ? UI.promptMonkeyVictim : (isRanger ? UI.rangerHint : UI.promptMonkeyMine))}</span>`;
  const cancel = isRanger ? btn("cancel", esc(UI.cancel), !vm.pending, "tw-ghost") : "";
  return bar(text, cancel + btn(isRanger ? "ranger-go" : "monkey-go", esc(UI.confirm), ready, "tw-primary")) + victimChips(vm, esc);
}

function setupPanel(vm, esc) {
  const hut = vm.sel.hut ? "✅" : "⬜";
  const path = vm.sel.path ? "✅" : "⬜";
  const text = `<span>${hut} ${PIECES.hut.emoji} ${esc(PIECES.hut.name)}</span> <span>${path} ${PIECES.path.emoji} ${esc(PIECES.path.name)}</span>`;
  return bar(text, btn("cancel", esc(UI.cancel), Boolean(vm.sel.hut) && !vm.pending, "tw-ghost")
    + btn("setup-go", esc(UI.place), Boolean(vm.sel.hut && vm.sel.path) && !vm.pending, "tw-primary"));
}

function buildPanel(vm, esc) {
  const piece = PIECES[vm.sel.mode];
  const text = vm.sel.target
    ? `<b>${piece.emoji} ${esc(piece.name)}</b>`
    : `<span>${esc(UI.promptPickTarget(piece.name.toLowerCase()))}</span>`;
  const free = vm.sel.mode === "path" && vm.seat && Number(vm.seat.free_paths) > 0;
  return bar(text, (free ? "" : btn("cancel", esc(UI.cancel), !vm.pending, "tw-ghost"))
    + btn("build-go", esc(UI.buildHere(piece.name)), Boolean(vm.sel.target) && !vm.pending, "tw-primary"));
}

function resourcePicker(vm, esc, max) {
  const picks = vm.sel.picks || [];
  return `<div class="tw-chips">${RESOURCE_ORDER.map((r) => {
    const n = picks.filter((x) => x === r).length;
    const empty = max === 2 && !(Number(vm.bank[r]) > 0);
    return `<button type="button" class="tw-chip${n ? " tw-on" : ""}" data-tw="pick" data-v="${r}" ${empty || vm.pending ? "disabled" : ""} aria-pressed="${n > 0}">${resIcon(r, esc)} ${esc(resName(r))}${n > 1 ? " ×2" : ""}</button>`;
  }).join("")}</div>`;
}

function cardFlowPanel(vm, esc) {
  const card = vm.sel.flow;
  const max = card === "bounty" ? 2 : 1;
  const picks = vm.sel.picks || [];
  const text = `<b>${cardEmoji(card)} ${esc(cardName(card))}</b> <span>${esc(max === 2 ? UI.pickTwo : UI.pickOne)}</span>`;
  return bar(text, btn("cancel", esc(UI.cancel), !vm.pending, "tw-ghost") + btn("flow-go", esc(UI.play), picks.length === max && !vm.pending, "tw-primary"))
    + resourcePicker(vm, esc, max);
}

function discardPanel(vm, esc) {
  const need = Number(vm.seat.must_discard) || 0;
  const picks = vm.sel.discard || {};
  const total = RESOURCE_ORDER.reduce((a, r) => a + (picks[r] || 0), 0);
  const rows = RESOURCE_ORDER.map((r) => {
    const have = Number(vm.hand[r]) || 0;
    const n = picks[r] || 0;
    return `<div class="tw-step"><span class="tw-step-res">${resIcon(r, esc)}<small>${have}</small></span>
      <button type="button" class="tw-stepbtn" data-tw="disc-" data-v="${r}" ${n > 0 && !vm.pending ? "" : "disabled"} aria-label="−">−</button>
      <b class="tw-step-n">${n}</b>
      <button type="button" class="tw-stepbtn" data-tw="disc+" data-v="${r}" ${n < have && total < need && !vm.pending ? "" : "disabled"} aria-label="+">+</button></div>`;
  }).join("");
  return bar(`<b>${esc(UI.discardTitle(need))}</b> <span>${esc(UI.discardPicked(total, need))}</span>`, btn("discard-go", esc(UI.discardSend), total === need && !vm.pending, "tw-primary"))
    + `<div class="tw-steps">${rows}</div>`;
}

// Returns "" when there is nothing contextual to show (the panel then hides).
export function actionHtml(vm, esc) {
  if (!vm.playing || !vm.seat || vm.seat.skipped) return "";
  const sel = vm.sel;
  if (sel.mode === "setup") return setupPanel(vm, esc);
  if (sel.mode === "monkey") return monkeyPanel(vm, esc, false);
  if (vm.phase === "discard" && Number(vm.seat.must_discard) > 0) return discardPanel(vm, esc);
  if (sel.mode === "ranger") return monkeyPanel(vm, esc, true);
  if (sel.flow === "bounty" || sel.flow === "market") return cardFlowPanel(vm, esc);
  if (sel.mode === "path" || sel.mode === "hut" || sel.mode === "lodge") return buildPanel(vm, esc);
  return "";
}
