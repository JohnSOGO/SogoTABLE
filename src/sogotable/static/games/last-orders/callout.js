// Last Orders — play callouts (pure view; decides nothing).
//
// render.js hands this module the batch of NEW server events it already
// diffed (sfx.js consumeEvents — a first snapshot or a reload never replays).
// Every card another patron plays or answers with, and every drink another
// patron raises, becomes one banner in a FIFO queue: the speaker's portrait,
// "Gorrum Ironmug plays Headbutt on Tilly", the card art and its rules text.
// Each banner holds HOLD_MS (shorter when a backlog builds), and a card line
// is spoken in that patron's voice (voice.js) when the Voice pref is on.
// The server keeps every play on the table for at least SHOW_MS (rules.js),
// so the banner and the card on the bar line up. Banners never take taps.
import { cardArtSvg, drinkSvg, portraitSvg } from "./art.js";
import { CALLOUT } from "./branding.js";
import { CARDS, CHARACTERS, DRINKS } from "./content.js";
import { describeLines } from "./describe.js";
import { speakPlay, stopVoice } from "./voice.js";

const HOLD_MS = 2600;
const RUSH_MS = 1400;
const MAX_QUEUE = 6;
const AT_ME_VOICE_DELAY_MS = 520;

let C = { key: "", queue: [], current: null, timer: null, opts: {} };

export function calloutReset(key) {
  if (C.key === key) return;
  clearTimeout(C.timer);
  stopVoice();
  C = { key, queue: [], current: null, timer: null, opts: {} };
}

const nameOfThing = (id) => {
  const e = CARDS[id] || DRINKS[id];
  if (e && e.name) return e.name;
  return (String(id || "").split(":").pop() || "?").replace(/-/g, " ");
};

// view: { myMark, players, defs, nameOf(mark), theme, esc }
function itemFor(e, view) {
  const isDrink = e.kind === "drink";
  const speaker = isDrink ? e.target : e.mark;
  if (!speaker || speaker === view.myMark) return null;
  const seat = (view.players || []).find((p) => p.mark === speaker) || {};
  const def = (view.defs && view.defs[e.card]) || { id: e.card, type: isDrink ? "drink" : "card", kind: e.kind };
  const entry = (isDrink ? DRINKS[e.card] : CARDS[e.card]) || {};
  const who = view.nameOf(speaker);
  const patron = CHARACTERS[seat.character] ? CHARACTERS[seat.character].name : "";
  const card = nameOfThing(e.card);
  const target = !isDrink && e.target && e.target !== speaker ? (e.target === view.myMark ? CALLOUT.you : view.nameOf(e.target)) : "";
  let verb;
  if (isDrink) verb = CALLOUT.drinks;
  else if (e.type === "react") verb = CALLOUT.answers;
  else verb = CALLOUT.plays;
  return {
    seq: e.seq, characterId: seat.character || "", cardId: e.card, card, who, patron, verb, target, isDrink,
    atMe: e.target === view.myMark && !isDrink, kind: isDrink ? "drink" : def.kind || e.kind || "action",
    rules: describeLines(def, entry).join(" "), def, entry, theme: view.theme, esc: view.esc,
  };
}

function bannerHtml(it) {
  const esc = it.esc;
  const face = portraitSvg(it.characterId, { size: 64, theme: it.theme, idPrefix: "loco", label: it.patron || it.who });
  const art = it.isDrink
    ? drinkSvg(it.def, it.entry, { size: 64, theme: it.theme, idPrefix: "locd" })
    : cardArtSvg(it.def, it.entry, { size: 64, theme: it.theme, idPrefix: "locc" });
  const who = it.patron && it.patron !== it.who ? `${esc(it.who)} <small>· ${esc(it.patron)}</small>` : esc(it.who);
  const target = it.target ? ` <span class="lo-co-on">${esc(CALLOUT.on)} <b>${esc(it.target)}</b></span>` : "";
  return `<div class="lo-co lo-co-k-${esc(it.kind)}${it.atMe ? " lo-co-atme" : ""}" role="status">
      <div class="lo-co-face">${face}</div>
      <div class="lo-co-body"><div class="lo-co-who">${who}</div>
        <div class="lo-co-line">${esc(it.verb)} <b class="lo-co-card">${esc(it.card)}</b>${target}</div>
        <div class="lo-co-rules">${esc(it.rules)}</div></div>
      <div class="lo-co-art">${art}</div></div>`;
}

function slot(root) {
  let el = root.querySelector(":scope > .lo-callout");
  if (!el) {
    el = document.createElement("div");
    el.className = "lo-callout";
    el.setAttribute("aria-live", "polite");
    root.prepend(el);
  }
  return el;
}

function showNext(getRoot) {
  const opts = C.opts || {};
  clearTimeout(C.timer);
  C.timer = null;
  const root = getRoot();
  const it = C.queue.shift() || null;
  C.current = it;
  if (!root) { C.queue = []; C.current = null; return; }
  const el = slot(root);
  if (!it) { el.innerHTML = ""; el.classList.remove("lo-co-show"); return; }
  el.innerHTML = bannerHtml(it);
  el.classList.add("lo-co-show");
  let spoke = false;
  const say = () => speakPlay({ characterId: it.characterId, cardId: it.cardId, cardName: it.card });
  if (opts.voice && !it.isDrink) {
    // A card aimed at me lets the sfx.js "ah-ha" sting land first.
    if (it.atMe) { setTimeout(() => { if (C.current === it) say(); }, AT_ME_VOICE_DELAY_MS); spoke = true; } else spoke = say();
  }
  el.firstElementChild.classList.toggle("lo-co-speaking", spoke);
  const hold = C.queue.length >= 2 ? RUSH_MS : HOLD_MS;
  C.timer = setTimeout(() => showNext(getRoot), hold);
}

// After every paint. getRoot(): the mounted table root or null (the banner
// timer outlives a paint). opts: { enabled, voice }.
export function calloutFeed(getRoot, fresh, view, opts) {
  C.opts = opts || {};
  if (!C.opts.enabled) {
    if (C.current || C.queue.length) { C.queue = []; showNext(getRoot); }
    return;
  }
  const root = getRoot();
  if (root && !root.querySelector(":scope > .lo-callout") && C.current) {
    // The skeleton was rebuilt under us: put the current banner back.
    slot(root).innerHTML = bannerHtml(C.current);
    slot(root).classList.add("lo-co-show");
  }
  (fresh || []).forEach((e) => {
    if (e.type !== "play" && e.type !== "react") return;
    const it = itemFor(e, view);
    if (it) C.queue.push(it);
  });
  if (C.queue.length > MAX_QUEUE) C.queue.splice(0, C.queue.length - MAX_QUEUE);
  if (!C.current && C.queue.length) showNext(getRoot);
}
