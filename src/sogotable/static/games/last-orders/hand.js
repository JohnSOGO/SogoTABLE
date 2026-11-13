// Last Orders — my hand and the phase bar (prompt + controls).
//
// What is playable, who a card may target, how many cards may be discarded
// and who may be bought a drink all arrive decided in `game.me` (server-
// computed). These builders only show it: controls are disabled, never
// hidden, so the bar keeps its height and nothing jumps.
import { KINDS, STATS, UI, outText } from "./branding.js";
import { CARDS } from "./content.js";
import { describeLines } from "./describe.js";
import { handCardHtml, phaseName, skipButton, thingName } from "./panels.js";

// Keep-or-draw groups the hand by card type (action, reaction, gamble, spike),
// stable within a type, so the choice of what to throw back is easy to scan.
const KIND_ORDER = Object.keys(KINDS);
const kindRank = (vm, c) => {
  const i = KIND_ORDER.indexOf((vm.defs[c.id] || {}).kind);
  return i < 0 ? KIND_ORDER.length : i;
};

export function handHtml(vm) {
  const me = vm.me;
  if (!me) return "";
  const hand = Array.isArray(me.hand) ? me.hand : [];
  if (!hand.length) return `<div class="lo-hand-empty">${vm.esc(UI.emptyHand)}</div>`;
  const playable = new Set(me.playable || []);
  const mode = vm.mode;
  // Playable cards slide to the left (stable, so the rest keep their order).
  // Only while the playable glow is on: with the help off, order stays a secret.
  const sortPlayable = vm.showPlayable && mode !== "discard";
  const ordered = mode === "discard"
    ? [...hand].sort((a, b) => kindRank(vm, a) - kindRank(vm, b))
    : sortPlayable
      ? [...hand.filter((c) => playable.has(c.uid)), ...hand.filter((c) => !playable.has(c.uid))]
      : hand;
  const cards = ordered.map((c) => {
    const isPlayable = playable.has(c.uid);
    const def = vm.defs[c.id] || {};
    const state = {
      glow: vm.showPlayable && isPlayable && mode !== "discard",
      sel: vm.sel === c.uid && mode !== "discard" && mode !== "order",
      discard: mode === "discard" && vm.discardSel.has(c.uid),
      spike: mode === "order" && vm.orderSpike === c.uid,
      dim: vm.showPlayable && (mode === "window" || mode === "action" || mode === "order") && !isPlayable && def.kind !== undefined,
    };
    return handCardHtml(vm, c, state);
  }).join("");
  return `<div class="lo-hand-row" role="list">${cards}</div>`;
}

function btn(vm, act, label, { value = "", primary = false, disabled = false, extra = "" } = {}) {
  return `<button type="button" class="lo-btn${primary ? " lo-btn-primary" : ""}${extra}" data-lo-act="${act}"${value ? ` data-v="${vm.esc(value)}"` : ""} ${disabled || vm.sending ? "disabled" : ""}>${vm.esc(label)}</button>`;
}

// The selected card's full text (the "tap to expand" view). With tips on, the
// big hand card already shows that text, so the phase bar stays short.
function detailHtml(vm) {
  const me = vm.me;
  if (!me || !vm.sel || vm.prefs.tips) return "";
  const card = (me.hand || []).find((c) => c.uid === vm.sel);
  if (!card) return "";
  const def = vm.defs[card.id] || {};
  const e = CARDS[card.id] || {};
  return `<div class="lo-detail"><b>${vm.esc(e.name || thingName(card.id))}</b> ${vm.esc(describeLines(def, e).join(" "))}${e.flavor ? ` <i>${vm.esc(e.flavor)}</i>` : ""}</div>`;
}

// What a lifted card does next (no chips, no Play button: the drop confirms).
function playControls(vm) {
  const me = vm.me;
  const selOk = vm.sel && (me.playable || []).includes(vm.sel);
  if (!selOk) return { targets: "" };
  const targets = (me.targets && me.targets[vm.sel]) || [];
  const card = (me.hand || []).find((c) => c.uid === vm.sel);
  const name = card ? (CARDS[card.id] || {}).name || thingName(card.id) : "";
  return { targets: `<div class="lo-lift-hint">${vm.esc(targets.length > 1 ? UI.liftedTarget(name) : UI.liftedTable(name))}</div>` };
}

// { prompt, body } for the phase bar.
function phaseParts(vm) {
  const g = vm.game;
  const me = vm.me;
  const seat = vm.mySeat;
  if (g.status === "complete") return { prompt: "", body: "" };
  if (!me || !seat) return { prompt: UI.spectating, body: "" };
  if (seat.out) return { prompt: UI.youAreOut(outText(seat.out)), body: "" };
  const w = g.reaction;
  const turn = g.turn;
  const myTurn = turn && turn.mark === vm.myMark;
  if (vm.sending) return { prompt: UI.sending, body: "" };
  if (w) {
    const top = w.stack.length ? w.stack[w.stack.length - 1] : null;
    let prompt = UI.reactPrompt;
    if (w.kind === "gamble" && !top) {
      prompt = g.gamble && g.gamble.leader === vm.myMark ? UI.gambleLeading(g.gamble.pot) : UI.gamblePrompt(vm.nameOf(g.gamble ? g.gamble.leader : ""), g.gamble ? g.gamble.pot : 0);
    } else if (top && top.by === vm.myMark) prompt = UI.reactMine;
    if (me.can_pass) {
      if (!(me.playable || []).length) prompt = `${prompt} ${UI.reactNothing}`;
      const pc = playControls(vm);
      return { prompt, body: `${pc.targets}<div class="lo-btns">${btn(vm, "pass", UI.passBtn)}</div>` };
    }
    if ((w.passed || []).includes(vm.myMark)) return { prompt: vm.autoPassedStep ? UI.autoPassed : UI.passed, body: waitingOn(vm) };
    return { prompt, body: waitingOn(vm) };
  }
  if (!myTurn) {
    const name = turn ? vm.nameOf(turn.mark) : "";
    return { prompt: turn ? UI.otherTurn(name, phaseName(turn.phase)) : "", body: vm.skip ? `<div class="lo-btns lo-skip-row"><span class="lo-skip-hint">${vm.esc(UI.skipHint(name))}</span>${skipButton(vm)}</div>` : "" };
  }
  if (turn.phase === "discard") {
    const n = vm.discardSel.size;
    return { prompt: UI.discardPrompt(me.discard_max || 0), body: `<div class="lo-btns">${btn(vm, "discard", UI.discardBtn(n), { primary: true })}</div>` };
  }
  if (turn.phase === "action") {
    const pc = playControls(vm);
    const more = turn.actions_left > 1 ? ` ${UI.actionPromptMore(turn.actions_left)}` : "";
    return { prompt: `${UI.actionPrompt}${more} ${vm.sel ? "" : UI.actionPick}`.trim(), body: `${pc.targets}<div class="lo-btns">${btn(vm, "end_action", UI.endAction)}</div>` };
  }
  if (turn.phase === "order") {
    const spikeCard = vm.orderSpike ? (me.hand || []).find((c) => c.uid === vm.orderSpike) : null;
    const spikeName = spikeCard ? thingName(spikeCard.id) : "";
    return {
      prompt: UI.orderPrompt,
      body: spikeCard ? `<div class="lo-btns"><span class="lo-spike-state">${vm.esc(UI.spikeWith(spikeName))}</span></div>` : "",
    };
  }
  return { prompt: UI.drinkPrompt, body: "" };
}

function waitingOn(vm) {
  const w = vm.game.reaction;
  if (!w) return "";
  const waiting = (w.eligible || []).filter((m) => !(w.passed || []).includes(m));
  return waiting.length ? `<div class="lo-waiting">${vm.esc(UI.waitingOn(waiting.map((m) => vm.nameOf(m))))}</div>` : "";
}

export function controlsHtml(vm) {
  const { prompt, body } = phaseParts(vm);
  const mineTurn = vm.game.turn && vm.game.turn.mark === vm.myMark && !vm.game.reaction;
  const heading = vm.game.reaction ? "" : mineTurn ? `<span class="lo-phase-tag">${vm.esc(UI.yourTurn)} · ${vm.esc(phaseName(vm.game.turn.phase))}</span>` : "";
  return `<div class="lo-prompt">${heading}<span>${vm.esc(prompt)}</span></div>${body}${detailHtml(vm)}`;
}

export const statLabels = { grit: STATS.grit.name, buzz: STATS.buzz.name, gold: STATS.gold.name };
