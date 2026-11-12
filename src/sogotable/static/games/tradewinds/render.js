// Tradewind Isles — in-game UI adapter. Renders the prepared server projection
// and captures intent; it computes NO rule outcomes. Legal spots, monkey hexes
// and victims arrive in game.legal (server-computed, viewer-trimmed); costs in
// game.costs; renown, awards and results arrive decided. Every action is sent
// with `round: game.round`; an error string from makeMove is shown and the
// reject cue plays.
//
// The shell calls renderTradewindsGame(ctx) on EVERY snapshot. View state
// lives in module state: S (room+epoch: trade drawer, flash, sending) and SEL
// (keyed `${code}:${epoch}:${round}:${phase}:${setupIndex}` — the selection
// resets automatically when the barrier advances). The DOM skeleton is kept
// across snapshots with ONE delegated click listener; sections are repainted.
import { playClick } from "../../sound.js";
import { paletteFor } from "./assets.js";
import { buildBoardSvg, nearestTarget } from "./board-svg.js";
import { UI } from "./branding.js";
import { actionHtml } from "./flows.js";
import { renderTradewindsLobby } from "./lobby.js";
import { handHtml, helpHtml, logHtml, resultsHtml, scoresHtml, topHtml } from "./panels.js";
import { consumeEvents, playCue } from "./sfx.js";
import { TRADEWINDS_CSS } from "./styles.js";
import { tradeHtml } from "./trade.js";
import { buildViewModel, seatOf } from "./view.js";

const FLASH_MS = 4500;
let stylesInjected = false;
let themeObserved = false;
let S = freshState("");
let SEL = freshSel("");

function freshState(key) {
  return {
    key, sending: false, zoom: false, targets: null, flash: null, flashTimer: null, lastCtx: null, actKey: null, sawPlaying: false, winPlayed: false,
    trade: { open: false, bankGive: null, bankGet: null, offerGive: {}, offerWant: {}, offerTo: null },
  };
}
function freshSel(key) {
  return { key, mode: null, hut: null, path: null, target: null, hex: null, victim: null, flow: null, picks: [], discard: {} };
}

function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-tw-styles", "");
  style.textContent = TRADEWINDS_CSS;
  document.head.appendChild(style);
  stylesInjected = true;
}
function observeTheme() {
  if (themeObserved || typeof MutationObserver === "undefined") return;
  themeObserved = true;
  new MutationObserver(() => repaint()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}
const currentTheme = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

export function renderTradewindsGame(ctx) {
  const { host, game } = ctx;
  if (!host) return;
  injectStyles();
  observeTheme();
  if (!ctx.started || !game) {
    host.className = "macro-board tradewinds-table";
    renderTradewindsLobby(host, ctx);
    return;
  }
  const key = `${ctx.room ? ctx.room.code : ""}:${ctx.room ? ctx.room.game_epoch : ""}`;
  if (S.key !== key) { clearTimeout(S.flashTimer); S = freshState(key); }
  S.lastCtx = ctx;
  const me = seatOf(ctx);
  consumeEvents(key, game.events, me.myMark);
  reconcile(ctx, me);
  cueYourTurn(game, me);
  if (game.status === "playing") S.sawPlaying = true;
  if (game.status === "complete" && S.sawPlaying && !S.winPlayed) { S.winPlayed = true; playCue("win"); }
  paint(ctx);
}

function mountedRoot() {
  const ctx = S.lastCtx;
  if (!ctx || !ctx.started || !ctx.host || !ctx.host.isConnected) return null;
  const root = ctx.host.querySelector(":scope > .tw-play");
  return root && root.getAttribute("data-tw-key") === S.key ? root : null;
}
function repaint() { if (mountedRoot()) paint(S.lastCtx); }

function setFlash(text, kind = "error") {
  S.flash = { text, kind, until: Date.now() + FLASH_MS };
  clearTimeout(S.flashTimer);
  S.flashTimer = setTimeout(() => { S.flash = null; repaint(); }, FLASH_MS + 50);
}

// ---------- selection (keyed to the barrier) ----------
function reconcile(ctx, me) {
  const g = ctx.game;
  const setupIndex = g.setup ? g.setup.index : "";
  const selKey = `${S.key}:${g.round}:${g.phase}:${setupIndex}`;
  if (SEL.key !== selKey) SEL = freshSel(selKey);
  const seat = me.seat;
  const playing = g.status === "playing" && seat && !seat.skipped;
  if (!playing) { SEL = freshSel(selKey); return; }
  if (g.phase === "setup") SEL.mode = g.setup && g.setup.current === me.myMark ? "setup" : null;
  else if (g.phase === "monkey") SEL.mode = g.captain === me.myMark ? "monkey" : null;
  else if (g.phase === "build" && !SEL.mode && !SEL.flow && Number(seat.free_paths) > 0) SEL.mode = "path";
  // A spot that just stopped being legal (someone beat us to it) drops out.
  const legal = g.legal || {};
  const showSpots = !(g.options && g.options.show_spots === false);
  const list = { path: legal.paths, hut: legal.huts, lodge: legal.lodges }[SEL.mode];
  if (showSpots && SEL.target && Array.isArray(list) && !list.includes(SEL.target)) {
    SEL.target = null;
    if (!S.sending) setFlash(UI.takenSpot);
  }
  if (SEL.mode === "setup" && SEL.hut && Array.isArray(legal.setup_huts) && showSpots && !legal.setup_huts.includes(SEL.hut)) {
    SEL.hut = null; SEL.path = null;
    if (!S.sending) setFlash(UI.takenSpot);
  }
}

function cueYourTurn(game, me) {
  let k = "";
  if (game.status === "playing" && me.seat && !me.seat.skipped) {
    if (game.phase === "setup" && game.setup && game.setup.current === me.myMark) k = `s${game.setup.index}`;
    else if (game.phase === "discard" && Number(me.seat.must_discard) > 0) k = `d${game.round}`;
    else if (game.phase === "monkey" && game.captain === me.myMark) k = `m${game.round}`;
  }
  const first = S.actKey === null;
  if (k !== S.actKey) {
    S.actKey = k;
    if (k && !first) {
      playCue("yourTurn");
      try { if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(30); } catch { /* unsupported */ }
    }
  }
}

// ---------- sending ----------
function pending(ctx) {
  return S.sending || (typeof ctx.isMovePending === "function" && ctx.isMovePending());
}
async function send(action, onOk) {
  const ctx = S.lastCtx;
  if (!ctx || pending(ctx)) return;
  S.sending = true;
  repaint();
  let error;
  try {
    error = await ctx.makeMove({ ...action, round: ctx.game.round });
  } catch (err) {
    error = (err && err.message) || String(err);
  }
  S.sending = false;
  if (typeof error === "string" && error) {
    setFlash(error, "error");
    playCue("reject");
  } else if (onOk) {
    onOk();
  }
  repaint();
}

function clearPick() {
  Object.assign(SEL, { mode: SEL.mode === "setup" || SEL.mode === "monkey" ? SEL.mode : null, hut: null, path: null, target: null, hex: null, victim: null, flow: null, picks: [] });
}

// ---------- intents ----------
function victimsFor(ctx, hex) {
  const l = ctx.game.legal || {};
  return (l.monkey_victims && l.monkey_victims[hex]) || [];
}

function onBoardTap(kind, id) {
  const ctx = S.lastCtx;
  if (!ctx || pending(ctx) || ctx.game.status !== "playing") return;
  const mode = SEL.mode;
  if (mode === "setup") {
    if (kind === "vertex") { SEL.hut = SEL.hut === id ? null : id; SEL.path = null; }
    else if (kind === "edge" && SEL.hut) SEL.path = id;
    else return;
  } else if ((mode === "monkey" || mode === "ranger") && kind === "hex") {
    SEL.hex = id;
    const v = victimsFor(ctx, id);
    SEL.victim = v.length === 1 ? v[0] : null;
  } else if ((mode === "path" && kind === "edge") || ((mode === "hut" || mode === "lodge") && kind === "vertex")) {
    if (SEL.target === id) { buildGo(); return; }
    SEL.target = id;
  } else {
    return;
  }
  playClick();
  repaint();
}

function buildGo() {
  if (!SEL.target || !SEL.mode) return;
  send({ type: "BUILD", kind: SEL.mode, at: SEL.target }, () => { SEL.target = null; SEL.mode = null; });
}

function bump(obj, r, d) {
  const n = (Number(obj[r]) || 0) + d;
  if (n <= 0) delete obj[r]; else obj[r] = n;
}

const HANDLERS = {
  mode: (v) => {
    if (SEL.mode === v) clearPick();
    else Object.assign(SEL, { mode: v, target: null, hex: null, victim: null, flow: null, picks: [] });
  },
  cancel: () => clearPick(),
  buy: () => send({ type: "BUY_DISCOVERY" }),
  card: (v) => {
    if (v === "ranger") Object.assign(SEL, { mode: SEL.mode === "ranger" ? null : "ranger", hex: null, victim: null, flow: null, target: null });
    else if (v === "trailblaze") send({ type: "PLAY_DISCOVERY", card: "trailblaze" }, () => { SEL.mode = "path"; SEL.target = null; });
    else if (v === "bounty" || v === "market") Object.assign(SEL, { flow: SEL.flow === v ? null : v, picks: [], mode: null, target: null });
  },
  pick: (v) => {
    if (SEL.flow === "market") SEL.picks = [v];
    else if (SEL.picks.length >= 2) SEL.picks = [v];
    else SEL.picks = [...SEL.picks, v];
  },
  victim: (v) => { SEL.victim = v; },
  "setup-go": () => send({ type: "SETUP_PLACE", hut: SEL.hut, path: SEL.path }, () => { SEL.hut = null; SEL.path = null; }),
  "monkey-go": () => send({ type: "MOVE_MONKEY", hex: SEL.hex, victim: SEL.victim || null }, () => { SEL.hex = null; }),
  "ranger-go": () => send({ type: "PLAY_DISCOVERY", card: "ranger", hex: SEL.hex, victim: SEL.victim || null }, () => clearPick()),
  "build-go": () => buildGo(),
  "flow-go": () => {
    const action = SEL.flow === "bounty"
      ? { type: "PLAY_DISCOVERY", card: "bounty", picks: SEL.picks.slice(0, 2) }
      : { type: "PLAY_DISCOVERY", card: "market", resource: SEL.picks[0] };
    send(action, () => clearPick());
  },
  "disc+": (v) => bump(SEL.discard, v, 1),
  "disc-": (v) => bump(SEL.discard, v, -1),
  "discard-go": () => send({ type: "DISCARD", cards: { ...SEL.discard } }, () => { SEL.discard = {}; }),
  done: () => {
    const seat = seatOf(S.lastCtx).seat;
    if (seat) send({ type: "DONE", done: !seat.done });
  },
  skip: (v) => send({ type: "SKIP_PLAYER", target: v }),
  "trade-toggle": () => { S.trade.open = !S.trade.open; },
  zoom: () => { S.zoom = !S.zoom; },
  "bank-give": (v) => { S.trade.bankGive = S.trade.bankGive === v ? null : v; if (S.trade.bankGet === v) S.trade.bankGet = null; },
  "bank-get": (v) => { S.trade.bankGet = S.trade.bankGet === v ? null : v; },
  "bank-go": () => send({ type: "BANK_TRADE", give: S.trade.bankGive, get: S.trade.bankGet }),
  "og+": (v) => bump(S.trade.offerGive, v, 1),
  "og-": (v) => bump(S.trade.offerGive, v, -1),
  "ow+": (v) => bump(S.trade.offerWant, v, 1),
  "ow-": (v) => bump(S.trade.offerWant, v, -1),
  "offer-to": (v) => { S.trade.offerTo = v || null; },
  "offer-post": () => {
    const t = S.trade;
    const action = { type: "OFFER", give: { ...t.offerGive }, want: { ...t.offerWant } };
    if (t.offerTo) action.to = t.offerTo;
    send(action, () => { t.offerGive = {}; t.offerWant = {}; });
  },
  "offer-cancel": (v) => send({ type: "CANCEL_OFFER", offer_id: offerId(v) }),
  "offer-accept": (v, el) => send({ type: "ACCEPT_OFFER", offer_id: offerId(v), accept: el.getAttribute("data-a") === "1" }),
  "trade-confirm": (v, el) => send({ type: "CONFIRM_TRADE", offer_id: offerId(v), partner: el.getAttribute("data-p") }),
};
// Offer ids are numbers on the wire; data attributes are strings.
const offerId = (v) => (/^\d+$/.test(v) ? Number(v) : v);
const SENDS = new Set(["buy", "setup-go", "monkey-go", "ranger-go", "build-go", "flow-go", "discard-go", "done", "skip", "bank-go", "offer-post", "offer-cancel", "offer-accept", "trade-confirm"]);

// A tap on the board resolves to the NEAREST target of the current mode, so
// every point of the board is a hit area (vertices sit ~24px apart on a phone).
function boardTap(e, svg) {
  const ctx = S.lastCtx;
  if (!ctx || !ctx.game.board || !S.targets || !S.targets.kind || typeof svg.getScreenCTM !== "function") return false;
  const m = svg.getScreenCTM();
  if (!m) return false;
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  const hit = nearestTarget(ctx.game.board, S.targets, pt.x, pt.y);
  if (hit) onBoardTap(hit.kind, hit.id);
  return true;
}

function onRootClick(e) {
  const svg = e.target && e.target.closest ? e.target.closest("svg.tw-board") : null;
  if (svg && boardTap(e, svg)) return;
  const el = e.target && e.target.closest ? e.target.closest("[data-tw], [data-tw-t]") : null;
  if (!el || el.disabled) return;
  if (el.hasAttribute("data-tw-t")) { onBoardTap(el.getAttribute("data-tw-t"), el.getAttribute("data-id")); return; }
  const verb = el.getAttribute("data-tw");
  const fn = HANDLERS[verb];
  if (!fn) return;
  const v = el.getAttribute("data-v");
  if (verb === "card" && v === "trailblaze") { fn(v, el); return; }
  if (!SENDS.has(verb)) playClick();
  fn(v, el);
  repaint();
}

// ---------- paint ----------
const escapeText = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function ensureSkeleton(host) {
  let root = host.querySelector(":scope > .tw-play");
  if (root && root.getAttribute("data-tw-key") === S.key) return root;
  host.className = "macro-board tradewinds-table";
  host.innerHTML = `<div class="tradewinds-root tw-play" data-tw-key="">
      <div class="tw-top" aria-live="polite"></div>
      <div class="tw-results" hidden></div>
      <div class="tw-main">
        <div class="tw-boardcol">
          <div class="tw-boardframe">
            <div class="tw-boardwrap"><svg class="tw-board" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"></svg></div>
            <button type="button" class="tw-zoom" data-tw="zoom" aria-label="${escapeText(UI.zoom)}" title="${escapeText(UI.zoom)}">🔍</button>
          </div>
          <div class="tw-action tw-panel" hidden></div>
        </div>
        <div class="tw-side">
          <div class="tw-hand tw-panel"></div>
          <div class="tw-trade tw-panel" hidden></div>
          <div class="tw-scorebox tw-panel"></div>
          <div class="tw-log tw-panel"></div>
          <div class="tw-helpbox tw-panel">${helpHtml(escapeText)}</div>
        </div>
      </div>
    </div>`;
  root = host.querySelector(".tw-play");
  root.setAttribute("data-tw-key", S.key);
  root.addEventListener("click", onRootClick);
  return root;
}

const painted = new WeakMap();
function setSection(el, html) {
  el.hidden = !html;
  if (painted.get(el) === html) return; // unchanged: keep scroll + focus
  painted.set(el, html);
  el.innerHTML = html;
}

function paint(ctx) {
  if (!ctx || !ctx.host || !ctx.game) return;
  const esc = ctx.escapeHtml || escapeText;
  S.lastCtx = ctx;
  const vm = buildViewModel(ctx, S, SEL, paletteFor(currentTheme()));
  const root = ensureSkeleton(ctx.host);
  root.classList.toggle("tw-complete", vm.complete);
  root.classList.toggle("tw-targeting", Boolean(vm.targets.kind));
  root.classList.toggle("tw-zoomed", S.zoom);
  S.targets = vm.playing ? vm.targets : null;
  root.querySelector(".tw-top").innerHTML = topHtml(vm, esc);
  setSection(root.querySelector(".tw-results"), vm.complete ? resultsHtml(vm, esc) : "");

  const g = ctx.game;
  const svg = root.querySelector(".tw-board");
  if (g.board) {
    const ghost = SEL.mode === "hut" || SEL.mode === "setup" ? "hut" : SEL.mode === "lodge" ? "lodge" : null;
    const board = buildBoardSvg({
      board: g.board, pieces: g.pieces, monkey: g.monkey, palette: vm.palette, colorOf: vm.colorOf, myColor: vm.myColor,
      showPips: vm.showPips, targets: vm.playing ? vm.targets : { kind: null, legal: [] },
      selected: { vertex: SEL.mode === "setup" ? SEL.hut : (SEL.mode === "hut" || SEL.mode === "lodge" ? SEL.target : null), edge: SEL.mode === "setup" ? SEL.path : (SEL.mode === "path" ? SEL.target : null), hex: SEL.hex },
      ghost,
    });
    if (svg.getAttribute("viewBox") !== board.viewBox) svg.setAttribute("viewBox", board.viewBox);
    svg.innerHTML = board.markup;
  }
  setSection(root.querySelector(".tw-action"), vm.complete ? "" : actionHtml(vm, esc));
  setSection(root.querySelector(".tw-hand"), vm.complete ? "" : handHtml(vm, esc));
  setSection(root.querySelector(".tw-trade"), vm.complete ? "" : tradeHtml(vm, esc));
  setSection(root.querySelector(".tw-scorebox"), scoresHtml(vm, esc));
  setSection(root.querySelector(".tw-log"), logHtml(vm, esc));
}
