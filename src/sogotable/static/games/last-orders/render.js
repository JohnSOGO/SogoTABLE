// Last Orders — in-game UI adapter. Renders the prepared server projection and
// captures intent; it computes NO rule outcomes. What may be played, on whom,
// how many cards may be discarded and who may be bought a drink arrive
// decided in game.me (server-computed, viewer-trimmed); the client only lets
// the player pick among them and sends one action, stamped with game.step.
//
// The shell calls renderLastOrdersGame(ctx) on EVERY snapshot. View state
// (selection, toast, menus, the "resolving" ghost of the last stack) lives in
// module state keyed by room+epoch, and the selection additionally by the
// turn / window it was made in, so re-renders never reset it by accident.
// The DOM skeleton is kept across snapshots; each section repaints only when
// its markup changes, and one delegated click listener handles every control.
import { playClick } from "../../sound.js";
import { tableBgCssUrl } from "./art.js";
import { GAME_EMOJI, GAME_NAME, UI } from "./branding.js";
import { calloutFeed, calloutReset } from "./callout.js";
import { fxAfterPaint, fxReset, reducedMotion } from "./fx.js";
import { controlsHtml, handHtml, statLabels } from "./hand.js";
import { wireGestures } from "./gestures.js";
import { snapHand, slideHand } from "./hand-fx.js";
import { renderLastOrdersLobby } from "./lobby.js";
import { turnStepsHtml, artBegin, barHtml, mineHtml, oppsHtml, pickHtml, primerHtml, resultsHtml, tickerHtml } from "./panels.js";
import { consumeEvents, playCue } from "./sfx.js";
import { LAST_ORDERS_CSS } from "./styles.js";
import { clockOffset, stopTick, syncTick, tickInFlight } from "./tick.js";

const FALLBACK_COLORS = ["#d94141", "#2f6fd6", "#e0b100", "#2e9e5b", "#8a4fc9", "#e07a1f", "#1fa3a3", "#d0499a"];
const TOAST_MS = 4500;
const STEP_TIP_MS = 7000;
const GHOST_MS = 1700;
const AUTO_PASS_MS = 650;
const PREFS_KEY = "sogotable.lastOrders.prefs";
const PREF_DEFAULTS = { tips: true, primer: true, autopass: true, callouts: true, voice: true };
const SECTIONS = ["top", "menu", "primer", "results", "pick", "opps", "bar", "mine", "controls", "hand", "ticker", "toast"];

let stylesInjected = false;
let themeObserved = false;
let countTimer = null;
let S = freshState("");

function freshState(key) {
  return {
    key, lastCtx: null, sending: false, selKey: "", sel: null, target: null, discardSel: new Set(), orderTarget: null, orderSpike: null, handHome: false,
    toast: null, toastTimer: null, ghost: null, ghostTimer: null, prevStack: null, menuOpen: false, primerOpen: false, stepTip: "", stepTimer: null,
    autoPassStep: -1, autoPassTimer: null, autoPassed: -1, sawPlaying: false, winPlayed: false, lastBeep: -1, bgTheme: "",
  };
}

// ---------- per-device prefs (best effort) ----------
let prefsCache = null;
function prefs() {
  if (prefsCache) return prefsCache;
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch { stored = {}; }
  prefsCache = { ...PREF_DEFAULTS };
  Object.keys(PREF_DEFAULTS).forEach((k) => { if (typeof stored[k] === "boolean") prefsCache[k] = stored[k]; });
  return prefsCache;
}
function setPref(name, value) {
  prefs()[name] = value;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefsCache)); } catch { /* private mode */ }
}

function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-lo-styles", "");
  style.textContent = LAST_ORDERS_CSS;
  document.head.appendChild(style);
  stylesInjected = true;
}

function observeTheme() {
  if (themeObserved || typeof MutationObserver === "undefined") return;
  themeObserved = true;
  new MutationObserver(() => repaint()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}

const currentTheme = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

function mountedRoot() {
  const ctx = S.lastCtx;
  if (!ctx || !ctx.started || !ctx.host || !ctx.host.isConnected) return null;
  const root = ctx.host.querySelector(":scope > .lo-play");
  return root && root.getAttribute("data-lo-key") === S.key ? root : null;
}
function repaint() {
  if (mountedRoot()) paint(S.lastCtx, []);
}

export function renderLastOrdersGame(ctx) {
  const { host, game } = ctx;
  if (!host) return;
  injectStyles();
  observeTheme();
  if (!ctx.started || !game) {
    stopTick();
    host.className = "macro-board last-orders-table";
    renderLastOrdersLobby(host, ctx);
    return;
  }
  const key = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}`;
  if (S.key !== key) {
    clearTimeout(S.toastTimer); clearTimeout(S.stepTimer); clearTimeout(S.ghostTimer); clearTimeout(S.autoPassTimer);
    S = freshState(key);
    fxReset(key);
    calloutReset(key);
  }
  S.lastCtx = ctx;
  const info = seatInfo(ctx);
  const fresh = consumeEvents(key, game.events, info.myMark);
  if (fresh.some((e) => e.type === "turn" && e.mark === info.myMark)) buzz();
  if (game.status === "playing") S.sawPlaying = true;
  trackGhost(game, fresh);
  reconcile(game, info);
  paint(ctx, fresh);
  syncTick(key, game, info.myMark, {
    mounted: () => Boolean(mountedRoot()),
    busy: () => S.sending || (typeof ctx.isMovePending === "function" && ctx.isMovePending()),
    send: (action) => (S.lastCtx || ctx).makeMove(action),
  });
  maybeAutoPass(ctx, info);
}

// ---------- seats ----------
function seatInfo(ctx) {
  const { game, room } = ctx;
  const roomPlayers = room && Array.isArray(room.players) ? room.players : [];
  const local = roomPlayers.find((p) => p.id === ctx.localPlayerId) || null;
  const myMark = local ? local.mark : null;
  const players = Array.isArray(game.players) ? game.players : [];
  const mySeat = players.find((p) => p.mark === myMark) || null;
  const me = game.me && game.me.mark === myMark ? game.me : null;
  return { myMark, mySeat, me, players, roomPlayers };
}
function nameOf(ctx, mark) {
  const p = ((ctx.room && ctx.room.players) || []).find((x) => x.mark === mark);
  return p ? p.name : String(mark || "?");
}
function colorOf(ctx, mark) {
  const p = ((ctx.room && ctx.room.players) || []).find((x) => x.mark === mark);
  if (p && typeof p.color === "string" && /^#[0-9a-f]{3,8}$/i.test(p.color)) return p.color;
  const order = Array.isArray(ctx.game.seat_order) ? ctx.game.seat_order : [];
  return FALLBACK_COLORS[Math.max(0, order.indexOf(mark)) % FALLBACK_COLORS.length];
}

function buzz() {
  try { if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(30); } catch { /* unsupported */ }
}

function setToast(text, kind = "error") {
  S.toast = { text, kind };
  clearTimeout(S.toastTimer);
  S.toastTimer = setTimeout(() => { S.toast = null; repaint(); }, TOAST_MS);
}

// When a window resolves, keep its stack on the bar for a beat (crossing out
// what the server's events say was canceled), so the play can be read.
function trackGhost(game, fresh) {
  const w = game.reaction;
  const prev = S.prevStack;
  const baseNow = w && w.stack.length ? w.stack[0].uid : null;
  if (prev && prev.length && (!w || baseNow !== prev[0].uid)) {
    const negated = new Set();
    fresh.filter((e) => e.type === "negated").forEach((e) => {
      const hit = prev.find((it) => it.card === e.card && it.kind === e.kind && !negated.has(it.uid));
      if (hit) negated.add(hit.uid);
    });
    S.ghost = { stack: prev, negated };
    clearTimeout(S.ghostTimer);
    S.ghostTimer = setTimeout(() => { S.ghost = null; repaint(); }, GHOST_MS);
  }
  S.prevStack = w && w.stack.length ? w.stack.map((it) => ({ ...it })) : null;
  if (w && w.stack.length) S.ghost = null;
}

// ---------- selection ----------
function modeOf(game, info) {
  const me = info.me;
  if (!me || !info.mySeat || info.mySeat.out || game.status !== "playing" || game.phase !== "play") return "idle";
  if (game.reaction) return me.can_pass ? "window" : "idle";
  const t = game.turn;
  if (!t || t.mark !== info.myMark) return "idle";
  if (t.phase === "discard" || t.phase === "action" || t.phase === "order") return t.phase;
  return "idle";
}

function reconcile(game, info) {
  const w = game.reaction;
  const t = game.turn;
  const top = w && w.stack.length ? w.stack[w.stack.length - 1].uid : "";
  const selKey = `${game.phase}|${t ? `${t.mark}:${t.phase}` : ""}|${w ? `${w.kind}:${w.stack.length}:${top}` : ""}`;
  if (selKey !== S.selKey) {
    S.selKey = selKey;
    S.sel = null; S.target = null; S.discardSel = new Set(); S.orderTarget = null; S.orderSpike = null;
    S.handHome = true; // new step or window: bring the hand back to its start (see paint)
  }
  const me = info.me;
  const hand = me && Array.isArray(me.hand) ? me.hand : [];
  const inHand = (uid) => hand.some((c) => c.uid === uid);
  if (S.sel && !inHand(S.sel)) { S.sel = null; S.target = null; }
  const targets = me && S.sel && me.targets ? me.targets[S.sel] || [] : [];
  if (S.target && !targets.includes(S.target)) S.target = null;
  if (!S.target && targets.length === 1) S.target = targets[0];
  S.discardSel = new Set([...S.discardSel].filter(inHand).slice(0, me ? me.discard_max || 0 : 0));
  const orderTargets = me && Array.isArray(me.order_targets) ? me.order_targets : [];
  if (S.orderTarget && !orderTargets.includes(S.orderTarget)) S.orderTarget = null;
  if (!S.orderTarget && orderTargets.length === 1) S.orderTarget = orderTargets[0];
  if (S.orderSpike && !(me && (me.playable || []).includes(S.orderSpike))) S.orderSpike = null;
}

function skipInfo(ctx, info) {
  const g = ctx.game;
  const seat = info.mySeat;
  if (!seat || seat.is_bot || g.status !== "playing") return null;
  const humans = info.players.filter((p) => !p.is_bot);
  const votes = g.skip_votes || {};
  let target = null; let voters = [];
  if (g.phase === "pick") {
    const stuck = humans.find((p) => !p.picked && p.mark !== info.myMark);
    if (!stuck || !seat.picked) return null;
    target = stuck.mark;
    voters = humans.filter((p) => p.picked).map((p) => p.mark);
  } else {
    const t = g.turn;
    const p = t ? info.players.find((x) => x.mark === t.mark) : null;
    if (!p || g.reaction || p.is_bot || p.auto || p.out || p.mark === info.myMark) return null;
    target = p.mark;
    voters = humans.filter((h) => h.mark !== target).map((h) => h.mark);
  }
  if (!voters.includes(info.myMark)) return null;
  const list = Array.isArray(votes[target]) ? votes[target] : [];
  return { target, votes: list.length, needed: voters.length, mine: list.includes(info.myMark) };
}

// ---------- intents ----------
async function send(action, { stamp = true, quiet = false } = {}) {
  let ctx = S.lastCtx;
  if (!ctx || S.sending) return false;
  const builtStep = ctx.game.step;
  const tick = tickInFlight();
  if (tick) {
    S.sending = true; repaint();
    await tick;
    S.sending = false;
    ctx = S.lastCtx || ctx;
    if (stamp && ctx.game.step !== builtStep) {
      if (!quiet) setToast(UI.movedOn, "info");
      repaint();
      return false;
    }
  }
  if (typeof ctx.isMovePending === "function" && ctx.isMovePending()) return false;
  const payload = stamp ? { ...action, step: builtStep } : { ...action };
  S.sending = true;
  repaint();
  let error;
  try { error = await ctx.makeMove(payload); } catch (err) { error = (err && err.message) || String(err); }
  S.sending = false;
  if (typeof error === "string" && error) {
    if (!quiet) { setToast(error); playCue("reject"); }
    repaint();
    return false;
  }
  repaint();
  return true;
}

function maybeAutoPass(ctx, info) {
  const me = info.me;
  const g = ctx.game;
  if (!prefs().autopass || !me || !me.can_pass || (me.playable || []).length || S.sending) return;
  if (S.autoPassStep === g.step) return;
  S.autoPassStep = g.step;
  clearTimeout(S.autoPassTimer);
  S.autoPassTimer = setTimeout(() => {
    const live = S.lastCtx;
    if (!live || !mountedRoot() || live.game.step !== g.step) return;
    const now = seatInfo(live).me;
    if (!prefs().autopass || !now || !now.can_pass || (now.playable || []).length) return;
    send({ type: "PASS" }, { quiet: true }).then((ok) => { if (ok) { S.autoPassed = g.step; } });
  }, AUTO_PASS_MS);
}

function onAct(act, value) {
  const ctx = S.lastCtx;
  if (!ctx) return;
  const info = seatInfo(ctx);
  const me = info.me;
  const mode = modeOf(ctx.game, info);
  const playable = new Set(me ? me.playable || [] : []);
  switch (act) {
    case "menu": S.menuOpen = !S.menuOpen; playClick(); break;
    case "pref": setPref(value, !prefs()[value]); playClick(); if (value === "autopass") maybeAutoPass(ctx, info); break;
    case "primer": S.primerOpen = !S.primerOpen; playClick(); break;
    case "step": // a turn-step dot: explain that step (tap again, or the tip, to close)
      S.stepTip = S.stepTip === value ? "" : value;
      clearTimeout(S.stepTimer);
      if (S.stepTip) S.stepTimer = setTimeout(() => { S.stepTip = ""; repaint(); }, STEP_TIP_MS);
      playClick();
      break;
    case "pick": playClick(); send({ type: "PICK", character: value }, { stamp: false }); return;
    case "skip": playClick(); send({ type: "SKIP_PLAYER", target: value }, { stamp: false }); return;
    case "card": {
      if (!me) return;
      playClick();
      if (mode === "discard") {
        if (S.discardSel.has(value)) S.discardSel.delete(value);
        else if (S.discardSel.size < (me.discard_max || 0)) S.discardSel.add(value);
        else setToast(UI.discardPrompt(me.discard_max || 0), "info");
      } else if (mode === "order") {
        // A spike rides along with the drink; tapping who drinks sends it.
        if (isSpike(ctx, me, value) && playable.has(value)) S.orderSpike = S.orderSpike === value ? null : value;
        S.sel = S.sel === value ? null : value;
      } else if ((mode === "action" || mode === "window") && playable.has(value)) {
        // Play straight off the card: no confirm. With a choice of targets the
        // card is picked up and the next tap on a rival plays it.
        const targets = (me.targets && me.targets[value]) || [];
        if (targets.length <= 1) { quickPlay(me, value, targets[0]); return; }
        S.sel = S.sel === value ? null : value;
        S.target = null;
      } else {
        S.sel = S.sel === value ? null : value; // not playable now: just look at it
        S.target = null;
      }
      break;
    }
    case "target":
    case "order_target":
      if (mode === "order") { playClick(); quickOrder(me, value, S.orderSpike); return; }
      if (me && S.sel && playable.has(S.sel) && (me.targets[S.sel] || []).includes(value)) { playClick(); quickPlay(me, S.sel, value); return; }
      break;
    case "pass": send({ type: "PASS" }); return;
    case "end_action": send({ type: "END_ACTION" }); return;
    case "discard": send({ type: "DISCARD", uids: [...S.discardSel] }).then((ok) => { if (ok) S.discardSel = new Set(); }); return;
    default: return;
  }
  repaint();
}

const isSpike = (ctx, me, uid) => {
  const card = (me.hand || []).find((c) => c.uid === uid);
  const def = card ? ctx.game.defs[card.id] : null;
  return Boolean(def && def.kind === "spike");
};

// Send a play the moment the card is chosen (tap, hold or drop). Legality is
// game.me's: a card that isn't playable, or a target it can't take, sends nothing.
function quickPlay(me, uid, target) {
  if (!me || !(me.playable || []).includes(uid)) return false;
  const targets = (me.targets && me.targets[uid]) || [];
  if (targets.length && !targets.includes(target)) return false;
  const action = { type: "PLAY", uid };
  if (targets.length) action.target = target;
  S.sel = uid; S.target = target || null;
  send(action).then((ok) => { if (ok) { S.sel = null; S.target = null; } });
  return true;
}
function quickOrder(me, target, spike) {
  if (!me || !(me.order_targets || []).includes(target)) return false;
  const action = { type: "ORDER", target };
  if (spike && (me.playable || []).includes(spike)) action.spike = spike;
  S.orderTarget = target;
  send(action).then((ok) => { if (ok) { S.orderSpike = null; S.orderTarget = null; } });
  return true;
}

// Gestures (gestures.js reports; this decides). Hold = the same as a tap.
// Drop on a rival plays on them; drop on the bar plays a card that needs no
// target (or has only one). Anything else just picks the card up.
function canDragCard(uid) {
  const ctx = S.lastCtx;
  if (!ctx) return false;
  const info = seatInfo(ctx);
  const mode = modeOf(ctx.game, info);
  const me = info.me;
  if (!me || !(me.playable || []).includes(uid)) return false;
  return mode === "action" || mode === "window" || (mode === "order" && isSpike(ctx, me, uid));
}
function onDropCard(uid, drop) {
  const ctx = S.lastCtx;
  if (!ctx || !canDragCard(uid)) return;
  const info = seatInfo(ctx);
  const me = info.me;
  const mode = modeOf(ctx.game, info);
  playClick();
  if (mode === "order") {
    if (drop && drop !== "bar" && quickOrder(me, drop, uid)) return;
    S.orderSpike = uid; S.sel = uid;
    repaint();
    return;
  }
  const targets = (me.targets && me.targets[uid]) || [];
  if (drop && drop !== "bar" && targets.includes(drop) && quickPlay(me, uid, drop)) return;
  if (targets.length <= 1 && drop && quickPlay(me, uid, targets[0])) return;
  S.sel = uid; S.target = null;
  repaint();
}

// ---------- view model ----------
function buildViewModel(ctx, info) {
  const g = ctx.game;
  const esc = ctx.escapeHtml || ((s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
  const mode = modeOf(g, info);
  const me = info.me;
  let targetables = [];
  let chosenTarget = null;
  if (mode === "order") { targetables = me.order_targets || []; chosenTarget = S.orderTarget; }
  else if ((mode === "action" || mode === "window") && S.sel && me.targets && (me.playable || []).includes(S.sel)) {
    targetables = me.targets[S.sel] || []; chosenTarget = S.target;
  }
  return {
    esc, theme: currentTheme(), game: g, me, myMark: info.myMark, mySeat: info.mySeat, players: info.players,
    nameOf: (m) => nameOf(ctx, m), colorOf: (m) => colorOf(ctx, m),
    turnMark: g.turn && g.phase === "play" ? g.turn.mark : null, reaction: g.reaction, gamble: g.gamble, defs: g.defs || {},
    prefs: prefs(), showPlayable: !(g.options && g.options.show_playable === false),
    mode, sel: S.sel, target: S.target, discardSel: S.discardSel, orderTarget: S.orderTarget, orderSpike: S.orderSpike,
    targetables, chosenTarget, sending: S.sending, ghost: S.ghost, primerOpen: S.primerOpen,
    autoPassedStep: S.autoPassed === g.step, skip: skipInfo(ctx, info),
  };
}

function topHtml(vm) {
  const g = vm.game;
  let status;
  if (g.status === "complete") status = UI.resultsTitle;
  else if (g.phase === "pick") status = UI.pickTitle;
  else if (vm.turnMark === vm.myMark) status = UI.yourTurn;
  else status = vm.turnMark ? UI.turnOf(vm.nameOf(vm.turnMark)) : "";
  const steps = turnStepsHtml(vm, S.stepTip);
  return `<span class="lo-title">${GAME_EMOJI} <span class="lo-title-text">${vm.esc(GAME_NAME)}</span></span>${steps}<span class="lo-status">${vm.esc(status)}</span>
    <button type="button" class="lo-gear${S.menuOpen ? " lo-on" : ""}" data-lo-act="menu" aria-expanded="${S.menuOpen}" aria-label="${vm.esc(UI.settings)}">⚙︎</button>`;
}

function menuHtml(vm) {
  if (!S.menuOpen) return "";
  const row = (name, label, hint) => {
    const on = vm.prefs[name];
    return `<button type="button" class="lo-pref" data-lo-act="pref" data-v="${name}" role="switch" aria-checked="${on}">
        <span><b>${vm.esc(label)}</b><small>${vm.esc(hint)}</small></span><span class="lo-switch${on ? " lo-on" : ""}"><i></i></span></button>`;
  };
  return `<div class="lo-menu-card">${row("tips", UI.tipsLabel, UI.tipsHint)}${row("primer", UI.primerLabel, UI.primerHint)}${row("autopass", UI.autoPassLabel, UI.autoPassHint)}
    ${row("callouts", UI.calloutsLabel, UI.calloutsHint)}${vm.prefs.callouts ? row("voice", UI.voiceLabel, UI.voiceHint) : ""}
    <button type="button" class="lo-btn" data-lo-act="menu">${vm.esc(UI.close)}</button></div>`;
}

// What the screen is for right now; styles.js re-shapes the table around it.
// "act" = a decision of mine is open; "big" = pick a card to play from the hand.
function focusOf(vm, offTable) {
  if (offTable) return "";
  const gamble = vm.reaction && vm.reaction.kind === "gamble";
  switch (vm.mode) {
    case "discard": return "act keep";
    case "action": return "act big play";
    case "order": return "act big order";
    case "window": return gamble ? "act big gamble" : "act big react";
    default: return gamble && vm.mySeat && !vm.mySeat.out ? "watch gamble" : "watch";
  }
}

// ---------- paint ----------
function ensureSkeleton(host) {
  let root = host.querySelector(":scope > .lo-play");
  if (root && root.getAttribute("data-lo-key") === S.key) return root;
  host.className = "macro-board last-orders-table";
  host.innerHTML = `<div class="last-orders-root lo-play" data-lo-key="">${SECTIONS.map((s) => `<div class="lo-${s}"></div>`).join("")}<div class="lo-fx" aria-hidden="true"></div></div>`;
  root = host.querySelector(".lo-play");
  root.setAttribute("data-lo-key", S.key);
  root.querySelector(".lo-toast").setAttribute("aria-live", "polite");
  root.querySelector(".lo-controls").setAttribute("aria-live", "polite");
  root.addEventListener("click", (e) => {
    const el = e.target.closest ? e.target.closest("[data-lo-act]") : null;
    if (!el || !root.contains(el) || el.disabled) return;
    onAct(el.getAttribute("data-lo-act"), el.getAttribute("data-v") || "");
  });
  wireGestures(root, { canDrag: canDragCard, onHold: (uid) => onAct("card", uid), onDrop: onDropCard });
  root.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const el = e.target.closest ? e.target.closest("[data-lo-act][role=button]") : null;
    if (!el) return;
    e.preventDefault();
    onAct(el.getAttribute("data-lo-act"), el.getAttribute("data-v") || "");
  });
  return root;
}

function setSection(root, name, html, show = true) {
  const el = root.querySelector(`:scope > .lo-${name}`);
  if (!el) return;
  el.hidden = !show || !html;
  const next = show ? html : "";
  if (el.__loHtml === next) return;
  el.__loHtml = next;
  const scroll = el.querySelector(".lo-hand-row, .lo-opps-row");
  const left = scroll ? scroll.scrollLeft : 0;
  el.innerHTML = next;
  const again = el.querySelector(".lo-hand-row, .lo-opps-row");
  if (again && left) again.scrollLeft = left;
}

function paint(ctx, fresh) {
  const host = ctx.host;
  if (!host || !ctx.game) return;
  const info = seatInfo(ctx);
  artBegin();
  const vm = buildViewModel(ctx, info);
  const root = ensureSkeleton(host);
  const g = ctx.game;
  if (S.bgTheme !== vm.theme) {
    S.bgTheme = vm.theme;
    root.style.setProperty("--lo-table-img", tableBgCssUrl({ theme: vm.theme }));
  }
  const picking = g.phase === "pick" && g.status === "playing";
  const complete = g.status === "complete";
  root.classList.toggle("lo-picking", picking);
  root.classList.toggle("lo-complete", complete);
  setSection(root, "top", topHtml(vm));
  setSection(root, "menu", menuHtml(vm));
  setSection(root, "primer", primerHtml(vm));
  setSection(root, "results", complete ? resultsHtml(vm) : "", complete);
  setSection(root, "pick", picking ? pickHtml(vm) : "", picking);
  setSection(root, "opps", picking ? "" : `<div class="lo-opps-row">${oppsHtml(vm)}</div>`, !picking);
  setSection(root, "bar", picking || complete ? "" : barHtml(vm), !picking && !complete);
  setSection(root, "mine", picking ? "" : mineHtml(vm), !picking);
  setSection(root, "controls", picking || complete ? "" : controlsHtml(vm), !picking && !complete);
  const handBefore = snapHand(root);
  root.setAttribute("data-lo-focus", focusOf(vm, picking || complete));
  setSection(root, "hand", picking || complete ? "" : handHtml(vm), !picking && !complete && !(vm.mySeat && vm.mySeat.out));
  slideHand(root, handBefore);
  scrollHandHome(root, vm.mode);
  setSection(root, "ticker", tickerHtml(vm));
  setSection(root, "toast", S.toast ? `<div class="lo-toast-msg lo-toast-${S.toast.kind}">${vm.esc(S.toast.text)}</div>` : "");
  armRings(root, g);
  ensureCountdown();
  if (complete && S.sawPlaying && !S.winPlayed) { S.winPlayed = true; playCue("win"); }
  fxAfterPaint(root, { fresh, items: g.reaction ? g.reaction.stack : [], game: g, labels: reducedMotion() ? null : statLabels });
  calloutFeed(mountedRoot, fresh, { myMark: vm.myMark, players: vm.players, defs: vm.defs, nameOf: vm.nameOf, theme: vm.theme, esc: vm.esc },
    { enabled: prefs().callouts && g.status === "playing", voice: prefs().voice });
}

// When my action step or a reaction window opens, scroll the hand back to its
// left edge: playable cards sort to the left, so what I can play is in view.
function scrollHandHome(root, mode) {
  if (!S.handHome) return;
  S.handHome = false;
  if (mode !== "action" && mode !== "window") return;
  const row = root.querySelector(".lo-hand-row");
  if (row && row.scrollLeft) row.scrollTo({ left: 0, behavior: reducedMotion() ? "auto" : "smooth" });
}

// ---------- countdown (window.closes_at on the local clock) ----------
function armRings(root, game) {
  const offset = clockOffset(game);
  root.querySelectorAll("[data-lo-ring]").forEach((el) => {
    if (el.getAttribute("data-armed") === "1") return;
    el.setAttribute("data-armed", "1");
    const close = Number(el.getAttribute("data-lo-ring")) - offset;
    const total = Number(el.getAttribute("data-total")) || 8000;
    const remaining = Math.max(0, Math.min(total, close - Date.now()));
    el.style.animation = `lo-ring ${total}ms linear ${-(total - remaining)}ms forwards`;
  });
  updateCounts();
}

function updateCounts() {
  const root = mountedRoot();
  if (!root) return false;
  const els = root.querySelectorAll("[data-lo-count]");
  if (!els.length) return false;
  const ctx = S.lastCtx;
  const offset = clockOffset(ctx.game);
  const info = seatInfo(ctx);
  els.forEach((el) => {
    const left = Math.max(0, Number(el.getAttribute("data-lo-count")) - offset - Date.now());
    const sec = Math.ceil(left / 1000);
    if (el.textContent !== String(sec)) el.textContent = String(sec);
    el.classList.toggle("lo-hurry", sec <= 3);
    if (sec > 0 && sec <= 3 && info.me && info.me.can_pass && (info.me.playable || []).length && S.lastBeep !== sec) {
      S.lastBeep = sec;
      playCue("tick");
    }
  });
  return true;
}

function ensureCountdown() {
  if (countTimer) return;
  if (!updateCounts()) return;
  countTimer = setInterval(() => {
    if (!updateCounts()) { clearInterval(countTimer); countTimer = null; }
  }, 200);
}
