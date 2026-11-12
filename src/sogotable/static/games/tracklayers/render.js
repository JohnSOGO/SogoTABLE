// Tracklayers — in-game UI adapter. Renders the prepared server projection
// (PLAN.md "Projection") and captures intent; it computes NO rule outcomes.
// Each round every seat sends one hidden COMMIT (DRAW / CLAIM / TICKETS); a seat
// holding pending tickets answers KEEP_TICKETS first. The server re-validates
// everything at the barrier. Buttons are pre-disabled only for obviously
// impossible picks (UX); the "helps" (advice.js) are display-only hints.
//
// The shell calls renderTracklayersGame(ctx) on EVERY snapshot. View state
// (selected route + payment colour, draw picks, ticket keeps, flash, zoom)
// lives in module state keyed by room+epoch; the selection additionally by
// `${room.code}:${game_epoch}:${round}` so it resets when the barrier
// advances. The DOM skeleton is kept across snapshots (the map viewport keeps
// its scroll); panels are repainted. One delegated click listener; no app.js
// imports.
import { playClick } from "../../sound.js";
import { paletteFor } from "./assets.js";
import { affordableRoutes, claimBlocker, payOptions, routeById, routeState, suggestedPlan, ticketsConnected } from "./advice.js";
import { EVENT_ICONS, UI, cardName } from "./branding.js";
import { renderTracklayersLobby } from "./lobby.js";
import { buildMapSvg, nearestRoute } from "./map-svg.js";
import { actionsHtml, handHtml, helpsHtml, logHtml, pickerHtml, resultsHtml, stripHtml, tableHtml } from "./panels.js";
import { consumeEvents, playCue } from "./sfx.js";
import { TRACKLAYERS_CSS } from "./styles.js";

const FALLBACK_COLORS = ["#d94141", "#2f6fd6", "#e0b100", "#2e9e5b", "#8a4fc9", "#e07a1f", "#1fa3a3", "#d0499a"];
const FLASH_MS = 5000;
const LABEL_PX = 10.5; // city label size on screen at fit-width
const TAP_PX = 26; // a tap this close (screen px) to a track selects it
const POINTS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 15 };

let stylesInjected = false;
let themeObserved = false;
let zoomed = false; // per device, survives games
let S = freshState("");

function freshState(key) {
  return {
    key, selKey: "", route: null, pay: null, picks: [], keepKey: "", keep: new Set(),
    sending: false, flash: null, flashTimer: null, lastCtx: null, sawPlaying: false, winPlayed: false,
  };
}

// ---------- per-device helps (best effort) ----------
const PREFS_KEY = "sogotable.tracklayers.helps";
const PREF_DEFAULTS = { path: true, afford: true, progress: true };
let prefsCache = null;
function helps() {
  if (prefsCache) return prefsCache;
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch { stored = {}; }
  prefsCache = { ...PREF_DEFAULTS };
  Object.keys(PREF_DEFAULTS).forEach((k) => { if (typeof stored[k] === "boolean") prefsCache[k] = stored[k]; });
  return prefsCache;
}
function toggleHelp(name) {
  if (!(name in PREF_DEFAULTS)) return;
  helps()[name] = !helps()[name];
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefsCache)); } catch { /* private mode */ }
}

function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-tl-styles", "");
  style.textContent = TRACKLAYERS_CSS;
  document.head.appendChild(style);
  stylesInjected = true;
}

function observeTheme() {
  if (themeObserved || typeof MutationObserver === "undefined") return;
  themeObserved = true;
  new MutationObserver(() => repaint())
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}

const currentTheme = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

function mountedRoot() {
  const ctx = S.lastCtx;
  if (!ctx || !ctx.started || !ctx.host || !ctx.host.isConnected) return null;
  const root = ctx.host.querySelector(":scope > .tl-play");
  return root && root.getAttribute("data-tl-key") === S.key ? root : null;
}
function repaint() {
  if (mountedRoot()) paint(S.lastCtx);
}

export function renderTracklayersGame(ctx) {
  const { host, game } = ctx;
  if (!host) return;
  injectStyles();
  observeTheme();
  if (!ctx.started || !game) {
    host.className = "macro-board tracklayers-table";
    renderTracklayersLobby(host, ctx);
    return;
  }
  const key = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}`;
  if (S.key !== key) {
    clearTimeout(S.flashTimer);
    S = freshState(key);
  }
  S.lastCtx = ctx;
  const me = seatInfo(ctx);
  consumeEvents(key, game.events, me.myMark);
  if (game.status === "playing") S.sawPlaying = true;
  reconcileSelection(ctx, me);
  paint(ctx);
}

// ---------- derived seat info ----------
function seatInfo(ctx) {
  const { game, room } = ctx;
  const roomPlayers = (room && Array.isArray(room.players)) ? room.players : [];
  const local = roomPlayers.find((p) => p.id === ctx.localPlayerId) || null;
  const myMark = local ? local.mark : null;
  const players = game.players && typeof game.players === "object" ? game.players : {};
  const seat = myMark && players[myMark] ? players[myMark] : null;
  return { myMark, seat, roomPlayers, players };
}
function nameOf(ctx, mark) {
  const p = (ctx.room && ctx.room.players || []).find((x) => x.mark === mark);
  return p ? p.name : String(mark || "?");
}
function colorOf(ctx, mark) {
  const p = (ctx.room && ctx.room.players || []).find((x) => x.mark === mark);
  if (p && typeof p.color === "string" && /^#[0-9a-f]{3,8}$/i.test(p.color)) return p.color;
  const order = Array.isArray(ctx.game.seat_order) ? ctx.game.seat_order : [];
  return FALLBACK_COLORS[Math.max(0, order.indexOf(mark)) % FALLBACK_COLORS.length];
}
const cityName = (game, id) => {
  const c = game.map && Array.isArray(game.map.cities) ? game.map.cities.find((x) => x.id === id) : null;
  return c ? c.name : String(id);
};
function ticketView(game, id) {
  const t = (game.tickets_catalog || {})[id] || { a: "?", b: "?", points: 0 };
  return { id, aName: cityName(game, t.a), bName: cityName(game, t.b), points: t.points, a: t.a, b: t.b };
}

function setFlash(text, kind = "info") {
  S.flash = { text, kind, until: Date.now() + FLASH_MS };
  clearTimeout(S.flashTimer);
  S.flashTimer = setTimeout(() => { S.flash = null; repaint(); }, FLASH_MS + 50);
}

const movePending = (ctx) => S.sending || (typeof ctx.isMovePending === "function" && ctx.isMovePending());
const pendingTickets = (seat) => (seat && Array.isArray(seat.pending_tickets) ? seat.pending_tickets : []);

function canAct(ctx, me) {
  const seat = me.seat;
  return Boolean(ctx.game.status === "playing" && seat && !seat.skipped && !seat.has_committed
    && !seat.has_pending_tickets && !pendingTickets(seat).length);
}

// ---------- selection (barrier-keyed) ----------
function reconcileSelection(ctx, me) {
  const { game, room } = ctx;
  const selKey = `${room ? room.code : ""}:${room ? room.game_epoch : ""}:${game.round}`;
  if (selKey !== S.selKey) {
    S.selKey = selKey;
    S.picks = []; S.pay = null;
    if (S.route && game.routes && game.routes[S.route]) S.route = null;
  }
  const pend = pendingTickets(me.seat);
  const keepKey = pend.join(",");
  if (keepKey !== S.keepKey) {
    S.keepKey = keepKey;
    S.keep = new Set(pend);
  }
}

function minKeep(seat) {
  const pend = pendingTickets(seat);
  const declared = Number(seat && seat.min_keep);
  const min = Number.isFinite(declared) && declared > 0 ? declared : (seat && Array.isArray(seat.tickets) && seat.tickets.length ? 1 : 2);
  return Math.min(min, pend.length || min);
}

// ---------- intents ----------
async function send(ctx, action, onOk) {
  if (movePending(ctx)) return;
  S.sending = true;
  paint(ctx);
  let error;
  try {
    error = await ctx.makeMove(action);
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

function onAct(name, ctx, me) {
  const round = ctx.game.round;
  if (name === "keep") {
    const keep = pendingTickets(me.seat).filter((id) => S.keep.has(id));
    send(ctx, { type: "KEEP_TICKETS", round, keep }, () => playCue("tickets"));
  } else if (name === "draw") {
    const picks = S.picks.map((p) => p.color);
    send(ctx, { type: "COMMIT", round, action: { type: "DRAW", picks } }, () => { S.picks = []; playCue("draw"); });
  } else if (name === "claim") {
    const route = routeById(ctx.game, S.route);
    const opt = route ? currentPay(ctx.game, me, route) : null;
    if (!route || !opt) return;
    send(ctx, { type: "COMMIT", round, action: { type: "CLAIM", route: route.id, color: opt.color } }, () => { S.route = null; S.pay = null; playClick(); });
  } else if (name === "tickets") {
    send(ctx, { type: "COMMIT", round, action: { type: "TICKETS" } }, () => playClick());
  } else if (name === "clear") {
    S.route = null; S.pay = null;
    playClick();
    paint(ctx);
  }
}

function pickMarket(ctx, i) {
  const color = (ctx.game.market || [])[i];
  if (!color) return;
  const at = S.picks.findIndex((p) => p.src === i);
  if (at >= 0) S.picks.splice(at, 1);
  else if (color === "wild") S.picks = [{ src: i, color }];
  else if (S.picks.length < 2) S.picks.push({ src: i, color });
  playClick();
  paint(ctx);
}

function pickDeck(ctx) {
  const decks = S.picks.filter((p) => p.src === "deck").length;
  const hasWild = S.picks.some((p) => p.color === "wild");
  if (!hasWild && S.picks.length < 2) S.picks.push({ src: "deck", color: "deck" });
  else if (decks) S.picks.splice(S.picks.map((p) => p.src).lastIndexOf("deck"), 1);
  playClick();
  paint(ctx);
}

function onMapTap(ctx, event) {
  const svg = event.currentTarget.querySelector("svg.tl-map");
  if (!svg || !ctx.game.map || typeof svg.getScreenCTM !== "function") return;
  const m = svg.getScreenCTM();
  if (!m) return;
  const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
  const board = ctx.game.map.board || { width: 1000 };
  const scale = svg.getBoundingClientRect().width / board.width || 1;
  const hit = nearestRoute(ctx.game.map, pt.x, pt.y, Math.max(16, TAP_PX / scale));
  if (!hit) return;
  S.route = S.route === hit ? null : hit;
  S.pay = null;
  playClick();
  paint(ctx);
}

function voteSkip(ctx, target) {
  if (movePending(ctx)) return;
  playClick();
  Promise.resolve(ctx.makeMove({ type: "SKIP_PLAYER", target, round: ctx.game.round })).then((error) => {
    if (typeof error === "string" && error) { setFlash(error, "error"); playCue("reject"); repaint(); }
  }).catch(() => {});
}

// ---------- view model ----------
function currentPay(game, me, route) {
  const opts = me.seat ? payOptions(game, me.seat.hand, route) : [];
  return opts.find((o) => o.color === S.pay) || opts[0] || null;
}

function blockerText(ctx, me, route) {
  const reason = me.seat ? claimBlocker(ctx.game, me.seat, route, me.myMark) : routeState(ctx.game, route, me.myMark);
  switch (reason) {
    case "owned": return UI.claimed(nameOf(ctx, ctx.game.routes[route.id]));
    case "twinMine": return UI.twinMine;
    case "twinLocked": return UI.twinBlocked;
    case "trains": return UI.noTrains(route.len);
    case "cards": return UI.cantAfford;
    default: return null;
  }
}

function committedText(game, seat) {
  const c = seat && seat.committed;
  if (!c || typeof c !== "object") return "";
  if (c.type === "DRAW") return UI.commitDraw((c.picks || []).map((p) => (p === "deck" ? UI.deckButton : cardName(p))));
  if (c.type === "CLAIM") {
    const r = routeById(game, c.route);
    return r ? UI.commitClaim(cityName(game, r.a), cityName(game, r.b), cardName(c.color)) : "";
  }
  if (c.type === "TICKETS") return UI.commitTickets;
  return "";
}

function lastRoundEvents(ctx) {
  const { game } = ctx;
  const events = Array.isArray(game.events) ? game.events : [];
  const marks = Array.isArray(game.seat_order) ? game.seat_order : [];
  const names = (text) => String(text || "").replace(/\bP\d+\b/g, (m) => (marks.includes(m) ? nameOf(ctx, m) : m));
  // The round that last resolved (events are stamped with the round they
  // resolved in); before the first resolution, the opening events.
  const target = game.status === "playing" ? game.round - 1 : game.round;
  let list = events.filter((e) => Number(e.round) === target && e.kind !== "round");
  let round = target;
  if (!list.length) { round = null; list = events.filter((e) => Number(e.round) === game.round); }
  list = list.sort((a, b) => a.seq - b.seq).slice(-14).map((e) => ({ icon: EVENT_ICONS[e.kind] || "•", text: names(e.text) }));
  return { round, list };
}

function buildViewModel(ctx, me) {
  const { game } = ctx;
  const palette = paletteFor(currentTheme());
  const seat = me.seat;
  const prefs = helps();
  const acting = canAct(ctx, me);
  const pending = movePending(ctx);
  const live = acting && !pending;
  const playing = game.status === "playing";
  const order = Array.isArray(game.seat_order) ? game.seat_order : Object.keys(me.players);
  const pend = playing ? pendingTickets(seat) : [];

  const waiting = order.filter((m) => {
    const p = me.players[m];
    return p && !p.is_bot && !p.skipped && !p.has_committed && m !== me.myMark;
  }).map((m) => nameOf(ctx, m));
  let myStateText;
  if (!playing) myStateText = UI.gameOver;
  else if (!seat) myStateText = UI.spectating;
  else if (seat.skipped) myStateText = UI.skipped;
  else if (S.sending) myStateText = UI.sending;
  else if (pend.length) myStateText = UI.chooseTickets;
  else if (seat.has_committed) myStateText = UI.lockedIn(waiting);
  else myStateText = UI.pickAction;

  // draw picks
  const market = Array.isArray(game.market) ? game.market : [];
  const hasWild = S.picks.some((p) => p.color === "wild");
  const deckPicks = S.picks.filter((p) => p.src === "deck").length;
  const supply = (Number(game.deck_count) || 0) + (Number(game.discard_count) || 0);
  const mkt = market.map((color, i) => {
    const at = S.picks.findIndex((p) => p.src === i);
    const on = at >= 0;
    const blocked = !on && (S.picks.length >= 2 || hasWild || (color === "wild" && S.picks.length > 0));
    return { i, color, on, order: at + 1, disabled: !live || blocked };
  });
  const otherCards = market.some((c, i) => c !== "wild" && !S.picks.some((p) => p.src === i));
  const drawReady = S.picks.length === 2 || (S.picks.length === 1 && (hasWild || (supply <= deckPicks && !otherCards)));
  const pickLabels = S.picks.map((p) => (p.src === "deck" ? UI.deckButton : cardName(p.color)));

  // selected route
  let route = null;
  const sel = S.route ? routeById(game, S.route) : null;
  if (sel) {
    const blocker = blockerText(ctx, me, sel);
    const chosen = blocker ? null : currentPay(game, me, sel);
    const options = blocker || !seat ? [] : payOptions(game, seat.hand, sel).map((o) => ({
      color: o.color, on: chosen && chosen.color === o.color,
      label: o.color === "wild" ? UI.allWild(o.wilds) : UI.pays(o.own, cardName(o.color), o.wilds),
    }));
    route = {
      id: sel.id, aName: cityName(game, sel.a), bName: cityName(game, sel.b), len: sel.len, color: sel.color,
      points: (game.route_points && game.route_points[sel.len]) || POINTS[sel.len] || 0, blocker, options,
    };
  }

  // tickets + map advice
  const myTickets = seat && Array.isArray(seat.tickets) ? seat.tickets : [];
  const results = seat && Array.isArray(seat.ticket_results) ? seat.ticket_results : null;
  const connected = me.myMark ? ticketsConnected(game, me.myMark, myTickets) : {};
  const myTicketViews = myTickets.map((id) => {
    const r = results && results.find((x) => x.id === id);
    return { ...ticketView(game, id), done: r ? Boolean(r.done) : (id in connected ? connected[id] : null) };
  });
  const open = myTicketViews.filter((t) => !t.done).map((t) => t.id);
  const plan = prefs.path && me.myMark && playing ? suggestedPlan(game, me.myMark, [...open, ...pend]) : { routes: new Set(), cities: new Set() };
  const lockedIds = new Set();
  (game.map && Array.isArray(game.map.routes) ? game.map.routes : []).forEach((r) => {
    const st = routeState(game, r, me.myMark);
    if (st === "twinLocked" || st === "twinMine") lockedIds.add(r.id);
  });

  // table
  const votes = game.skip_votes || {};
  const iCanVote = Boolean(playing && seat && !seat.is_bot && seat.has_committed && !seat.skipped);
  const voters = order.filter((m) => { const p = me.players[m]; return p && !p.is_bot && p.has_committed && !p.skipped; });
  const rows = order.map((m) => {
    const p = me.players[m] || {};
    const rp = me.roomPlayers.find((x) => x.mark === m) || {};
    let statusKey = "waiting"; let statusText = UI.statusWaiting;
    if (!playing) { statusKey = "done"; statusText = ""; }
    else if (p.skipped) { statusKey = "skipped"; statusText = UI.statusSkipped; }
    else if (p.has_pending_tickets) { statusKey = "tickets"; statusText = UI.statusTickets; }
    else if (p.has_committed) { statusKey = "ready"; statusText = UI.statusReady; }
    else if (p.is_bot) { statusKey = "bot"; statusText = UI.statusBot; }
    const list = Array.isArray(votes[m]) ? votes[m] : [];
    const skip = iCanVote && !p.is_bot && !p.has_committed && !p.skipped && m !== me.myMark
      ? { votes: list.length, needed: voters.length, mine: list.includes(me.myMark) } : null;
    return {
      mark: m, name: nameOf(ctx, m), icon: rp.icon || "", color: colorOf(ctx, m), isMe: m === me.myMark,
      score: p.score || 0, trains: p.trains ?? "–", cards: p.hand_count ?? "–", tickets: p.ticket_count ?? "–", statusKey, statusText, skip,
    };
  });

  let resultRows = [];
  let winnerNames = [];
  if (!playing) {
    const list = Array.isArray(game.results) && game.results.length ? game.results
      : order.map((m) => ({ mark: m, total: (me.players[m] || {}).score || 0 })).sort((a, b) => b.total - a.total);
    const top = list.length ? list[0].total : 0;
    const winners = Array.isArray(game.winner) ? game.winner : game.winner ? [game.winner] : list.filter((r) => r.total === top).map((r) => r.mark);
    resultRows = list.map((r) => {
      const p = me.players[r.mark] || {};
      const ticketList = (Array.isArray(p.ticket_results) ? p.ticket_results : []).map((t) => ({ ...ticketView(game, t.id), points: t.points, done: t.done }));
      return {
        route_points: 0, ticket_points: 0, tickets_done: 0, tickets_failed: 0, longest: 0, longest_bonus: 0, ...r,
        name: nameOf(ctx, r.mark), color: colorOf(ctx, r.mark), isMe: r.mark === me.myMark, winner: winners.includes(r.mark), ticketList,
      };
    });
    winnerNames = resultRows.filter((r) => r.winner).map((r) => r.name);
  }

  const log = lastRoundEvents(ctx);
  const final = Number(game.final_round) || 0;
  return {
    palette, round: game.round, deckCount: Number(game.deck_count) || 0, ticketDeckCount: Number(game.ticket_deck_count) || 0,
    trains: seat ? seat.trains : "–",
    finalBanner: playing && final ? (game.round >= final ? UI.finalRound : UI.finalRoundNext(final)) : "",
    priority: (Array.isArray(game.priority_order) ? game.priority_order : order).map((m) => ({ mark: m, name: nameOf(ctx, m), color: colorOf(ctx, m), isMe: m === me.myMark })),
    myStateText, flash: S.flash && S.flash.until > Date.now() ? S.flash : null,
    picker: pend.length && !seat.skipped ? {
      tickets: pend.map((id) => ({ ...ticketView(game, id), on: S.keep.has(id) })), min: minKeep(seat), count: pend.filter((id) => S.keep.has(id)).length,
      disabled: pending, sending: S.sending,
      canKeep: !pending && pend.filter((id) => S.keep.has(id)).length >= minKeep(seat),
    } : null,
    locked: !live, market: mkt,
    deck: { picks: deckPicks, order: S.picks.findIndex((p) => p.src === "deck") + 1, count: Number(game.deck_count) || 0, disabled: !live || hasWild || (S.picks.length >= 2 && !deckPicks) || (supply <= deckPicks && !deckPicks) },
    canDraw: live && drawReady, drawLabel: S.sending ? UI.sending : drawReady ? UI.draw(pickLabels) : S.picks.length === 1 ? UI.drawPickMore : UI.draw([]),
    route, canClaim: live && Boolean(route && !route.blocker && route.options.length),
    canTickets: live && (Number(game.ticket_deck_count) || 0) > 0,
    committedText: playing && seat && seat.has_committed ? committedText(game, seat) : "",
    hand: (Array.isArray(game.colors) ? [...game.colors, "wild"] : []).map((c) => ({ color: c, count: seat && seat.hand ? Number(seat.hand[c]) || 0 : 0 })),
    myTickets: myTicketViews, helps: prefs, rows,
    events: log.list, logTitle: log.round ? `${UI.logTitle} · ${UI.round(log.round)}` : UI.logTitle,
    complete: !playing, results: resultRows, winnerNames,
    mapVm: {
      map: game.map, palette, owners: game.routes || {}, colorOf: (m) => colorOf(ctx, m), myMark: me.myMark, selected: S.route,
      affordable: prefs.afford && live ? affordableRoutes(game, seat, me.myMark) : new Set(),
      pathRoutes: plan.routes, ticketCities: plan.cities, lockedIds, labelSize: 20,
    },
  };
}

// ---------- paint ----------
function ensureSkeleton(host) {
  let root = host.querySelector(":scope > .tl-play");
  if (root && root.getAttribute("data-tl-key") === S.key) return root;
  host.className = "macro-board tracklayers-table";
  host.innerHTML = `<div class="tracklayers-root tl-play" data-tl-key="">
      <div class="tl-strip"></div>
      <div class="tl-main">
        <div class="tl-mapcol">
          <div class="tl-mapwrap">
            <div class="tl-viewport"><div class="tl-mapinner"></div></div>
            <button type="button" class="tl-zoom" data-tl-zoom></button>
          </div>
          <div class="tl-helps"></div>
        </div>
        <div class="tl-side">
          <div class="tl-results tl-panel" hidden></div>
          <div class="tl-picker-host"></div>
          <div class="tl-action-host"></div>
          <div class="tl-hand-host tl-panel"></div>
          <div class="tl-table tl-panel"></div>
          <div class="tl-logbox tl-panel"></div>
        </div>
      </div>
    </div>`;
  root = host.querySelector(".tl-play");
  root.setAttribute("data-tl-key", S.key);
  root.querySelector(".tl-viewport").addEventListener("click", (e) => { if (S.lastCtx) onMapTap(S.lastCtx, e); });
  root.addEventListener("click", (e) => {
    const ctx = S.lastCtx;
    const el = e.target.closest ? e.target.closest("button") : null;
    if (!ctx || !el || el.disabled || !root.contains(el)) return;
    const me = seatInfo(ctx);
    if (el.hasAttribute("data-tl-zoom")) { toggleZoom(root); return; }
    if (el.hasAttribute("data-tl-deck")) { pickDeck(ctx); return; }
    const mkt = el.getAttribute("data-tl-mkt");
    if (mkt !== null) { pickMarket(ctx, Number(mkt)); return; }
    const pay = el.getAttribute("data-tl-pay");
    if (pay !== null) { S.pay = pay; playClick(); paint(ctx); return; }
    const keep = el.getAttribute("data-tl-keep");
    if (keep !== null) { if (S.keep.has(keep)) S.keep.delete(keep); else S.keep.add(keep); playClick(); paint(ctx); return; }
    const help = el.getAttribute("data-tl-help");
    if (help !== null) { toggleHelp(help); playClick(); paint(ctx); return; }
    const skip = el.getAttribute("data-tl-skip");
    if (skip !== null) { voteSkip(ctx, skip); return; }
    const act = el.getAttribute("data-tl-act");
    if (act) onAct(act, ctx, me);
  });
  return root;
}

function toggleZoom(root) {
  zoomed = !zoomed;
  playClick();
  paint(S.lastCtx);
  const vp = root.querySelector(".tl-viewport");
  // Centre the zoomed view on the selected route (or the middle of the map).
  const ctx = S.lastCtx;
  const sel = S.route && ctx ? routeById(ctx.game, S.route) : null;
  const board = (ctx && ctx.game.map && ctx.game.map.board) || { width: 1000, height: 700 };
  const cities = ctx && ctx.game.map ? ctx.game.map.cities : [];
  const a = sel && cities.find((c) => c.id === sel.a); const b = sel && cities.find((c) => c.id === sel.b);
  const fx = a && b ? (a.x + b.x) / 2 / board.width : 0.5;
  const fy = a && b ? (a.y + b.y) / 2 / board.height : 0.5;
  vp.scrollLeft = Math.max(0, vp.scrollWidth * fx - vp.clientWidth / 2);
  vp.scrollTop = Math.max(0, vp.scrollHeight * fy - vp.clientHeight / 2);
}

function paint(ctx) {
  const host = ctx && ctx.host;
  if (!host || !ctx.game) return;
  const esc = ctx.escapeHtml || ((s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
  const me = seatInfo(ctx);
  const vm = buildViewModel(ctx, me);
  const root = ensureSkeleton(host);
  if (vm.complete && S.sawPlaying && !S.winPlayed) { S.winPlayed = true; playCue("win"); }
  root.classList.toggle("tl-complete", vm.complete);
  root.querySelector(".tl-strip").innerHTML = stripHtml(vm, esc);

  const vp = root.querySelector(".tl-viewport");
  vp.classList.toggle("tl-zoomed", zoomed);
  const zbtn = root.querySelector("[data-tl-zoom]");
  zbtn.textContent = zoomed ? "⤢" : "🔍";
  zbtn.setAttribute("aria-label", zoomed ? UI.zoomOut : UI.zoomIn);
  zbtn.title = zoomed ? UI.zoomOut : UI.zoomIn;
  if (vm.mapVm.map && Array.isArray(vm.mapVm.map.routes)) {
    const board = vm.mapVm.map.board || { width: 1000 };
    const shown = (vp.clientWidth || 360) * (zoomed ? zoomFactor(vp) : 1);
    vm.mapVm.labelSize = Math.max(15, Math.min(34, LABEL_PX / (shown / board.width)));
    root.querySelector(".tl-mapinner").innerHTML = buildMapSvg(vm.mapVm);
  }
  root.querySelector(".tl-helps").innerHTML = vm.complete ? "" : helpsHtml(vm, esc);

  const results = root.querySelector(".tl-results");
  results.hidden = !vm.complete;
  results.innerHTML = vm.complete ? resultsHtml(vm, esc) : "";
  root.querySelector(".tl-picker-host").innerHTML = vm.picker ? pickerHtml(vm, esc) : "";
  const actions = root.querySelector(".tl-action-host");
  actions.hidden = vm.complete || Boolean(vm.picker);
  actions.innerHTML = actions.hidden ? "" : actionsHtml(vm, esc);
  root.querySelector(".tl-hand-host").innerHTML = me.seat ? handHtml(vm, esc) : "";
  root.querySelector(".tl-hand-host").hidden = !me.seat;
  root.querySelector(".tl-table").hidden = vm.complete;
  root.querySelector(".tl-table").innerHTML = vm.complete ? "" : tableHtml(vm, esc);
  root.querySelector(".tl-logbox").innerHTML = logHtml(vm, esc);
}

// Matches the CSS widths of .tl-viewport.tl-zoomed .tl-mapinner.
function zoomFactor(vp) {
  return (vp.clientWidth || 360) < 700 ? 2.4 : 1.6;
}
