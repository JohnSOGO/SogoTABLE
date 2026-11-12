// Bloomwork — in-game UI adapter. Renders the prepared server projection and
// captures intent; it computes NO rule outcomes. The server validates every
// PICK / READY_NEXT / SKIP_PLAYER and resolves clashes; the Helps highlight is
// a display-only mirror in hints.js.
//
// The shell calls renderBloomworkGame(ctx) on EVERY snapshot. View state
// (selection, in-flight latch, flash message, animation clock, event cursor)
// lives in module state keyed by room+epoch, and the selection additionally
// by `${room.code}:${game_epoch}:${round}:${pick}` so it resets when the pick
// step advances. The root element is kept across snapshots (one delegated
// click listener); only its body is repainted. No app.js imports.
import { playClick } from "../../sound.js";
import { ASSETS } from "./assets.js";
import { spriteSvg } from "./art.js";
import { compostHtml, gardenHtml, marketHtml } from "./board.js";
import { UI, WORDS } from "./branding.js";
import { renderBloomworkLobby } from "./lobby.js";
import { logHtml, opponentsHtml, resultsHtml, reviewHtml, seatsHtml, statusHtml } from "./panels.js";
import { consumeEvents, playCue } from "./sfx.js";
import { BLOOMWORK_CSS } from "./styles.js";

const FALLBACK_COLORS = ["#d94141", "#2f6fd6", "#e0b100", "#2e9e5b", "#8a4fc9", "#e07a1f"];
const FLASH_MS = 6000;
const POP_MS = 420;
const BLOOM_MS = 1600;

let stylesInjected = false;
let S = freshState("");

function freshState(key) {
  return {
    key, sel: null, sending: false, pending: null, flash: null, flashTimer: null,
    lastCtx: null, prev: null, prevRound: null, fx: new Map(), fxTimer: null, winPlayed: false, sawPlaying: false,
  };
}

function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-bw-styles", "");
  style.textContent = BLOOMWORK_CSS;
  document.head.appendChild(style);
  stylesInjected = true;
}

const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function renderBloomworkGame(ctx) {
  const { host, game } = ctx;
  if (!host) return;
  injectStyles();
  if (!ctx.started || !game) {
    host.className = "macro-board bloomwork-table";
    renderBloomworkLobby(host, ctx);
    return;
  }
  const key = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}`;
  if (S.key !== key) {
    clearTimeout(S.flashTimer); clearTimeout(S.fxTimer);
    S = freshState(key);
  }
  S.lastCtx = ctx;
  const myMark = myMarkOf(ctx);
  consumeEvents(key, game.events, myMark);
  trackFx(game);
  if (game.status === "playing") S.sawPlaying = true;
  if (game.status === "complete" && S.sawPlaying && !S.winPlayed) {
    S.winPlayed = true;
    playCue("win");
  }
  paint(ctx);
}

function myMarkOf(ctx) {
  const players = (ctx.room && Array.isArray(ctx.room.players)) ? ctx.room.players : [];
  const local = players.find((p) => p.id === ctx.localPlayerId);
  return local ? local.mark : null;
}

function mountedRoot() {
  const ctx = S.lastCtx;
  if (!ctx || !ctx.started || !ctx.host || !ctx.host.isConnected) return null;
  const root = ctx.host.querySelector(":scope > .bw-play");
  return root && root.getAttribute("data-bw-key") === S.key ? root : null;
}
function repaint() {
  if (mountedRoot()) paint(S.lastCtx);
}

function setFlash(text) {
  S.flash = text ? { text: String(text), key: S.lastCtx ? stepKey(S.lastCtx) : "" } : null;
  clearTimeout(S.flashTimer);
  if (text) S.flashTimer = setTimeout(() => { S.flash = null; repaint(); }, FLASH_MS);
}

const stepKey = (ctx) => `${ctx.room ? ctx.room.code : ""}:${ctx.room ? ctx.room.game_epoch : ""}:${ctx.game.round}:${ctx.game.pick}`;

// ---------- animation clock (view only) ----------
// Diff each snapshot against the last one: tiles that newly landed in a
// planter row / compost heap pop, flowers newly planted in a bed bloom, and
// a freshly refilled market pops in stall by stall. The first snapshot only
// primes (no replay on reconnect). Entries carry an absolute start time and
// render with a negative/positive animation-delay, so repaints never restart.
function trackFx(game) {
  const now = Date.now();
  const players = Array.isArray(game.players) ? game.players : [];
  const snap = {};
  players.forEach((p) => { snap[p.mark] = { rows: p.rows.map((l) => ({ ...l })), bed: p.bed.map((l) => l.slice()), compost: (p.compost || []).length }; });
  if (S.prev && !reducedMotion()) {
    let bloomAt = now;
    players.forEach((p) => {
      const old = S.prev[p.mark];
      if (!old) return;
      p.rows.forEach((line, r) => {
        const was = old.rows[r] || { count: 0, flower: null };
        const from = was.flower === line.flower ? was.count : 0;
        for (let i = from; i < line.count; i += 1) S.fx.set(`row:${p.mark}:${r}:${i}`, { at: now + (i - from) * 70, ms: POP_MS, cls: "bw-pop" });
      });
      for (let i = old.compost; i < (p.compost || []).length; i += 1) S.fx.set(`heap:${p.mark}:${i}`, { at: now + (i - old.compost) * 70, ms: POP_MS, cls: "bw-pop" });
      p.bed.forEach((line, r) => line.forEach((on, c) => {
        if (on && !(old.bed[r] && old.bed[r][c])) {
          S.fx.set(`bed:${p.mark}:${r}:${c}`, { at: bloomAt, ms: BLOOM_MS, cls: "bw-bloom" });
          bloomAt += 220;
        }
      }));
    });
    if (S.prevRound !== null && S.prevRound !== game.round) {
      (game.stalls || []).forEach((stall, i) => stall.forEach((_, j) => S.fx.set(`stall:${i}:${j}`, { at: now + i * 60 + j * 25, ms: POP_MS, cls: "bw-pop" })));
    }
  }
  S.prev = snap;
  S.prevRound = game.round;
  let last = 0;
  S.fx.forEach((e, k) => { if (e.at + e.ms < now) S.fx.delete(k); else last = Math.max(last, e.at + e.ms); });
  clearTimeout(S.fxTimer);
  if (last) S.fxTimer = setTimeout(() => { S.fx.clear(); }, last - now + 50);
}
function fxFor(key) {
  const e = S.fx.get(key);
  if (!e) return null;
  const delay = e.at - Date.now();
  if (delay + e.ms < 0) return null;
  return { cls: e.cls, style: `animation-delay:${delay}ms` };
}

// ---------- view model ----------
function buildView(ctx) {
  const { game, room } = ctx;
  const esc = ctx.escapeHtml || ((s) => String(s));
  const roomPlayers = (room && Array.isArray(room.players)) ? room.players : [];
  const myMark = myMarkOf(ctx);
  const seats = Array.isArray(game.players) ? game.players : [];
  const me = seats.find((p) => p.mark === myMark) || null;
  const order = Array.isArray(game.seat_order) ? game.seat_order : seats.map((p) => p.mark);
  const rp = (mark) => roomPlayers.find((p) => p.mark === mark) || null;
  const key = stepKey(ctx);
  if (S.sel && S.sel.key !== key) S.sel = null;
  if (S.pending && S.pending.key !== key) S.pending = null;
  if (S.flash && S.flash.key !== key && !S.sending) S.flash = null;
  const drafting = game.status === "playing" && game.phase === "drafting";
  const committed = me && me.committed ? { ...me.committed } : (S.pending ? { ...S.pending } : null);
  const locked = !me || !drafting || Boolean(me.has_committed) || Boolean(me.skipped) || S.sending || Boolean(S.pending);
  if (locked) S.sel = null;
  if (S.sel && !(S.sel.source === "center" ? game.center : (game.stalls || [])[S.sel.source] || []).includes(S.sel.flower)) S.sel = null;
  return {
    game, me, myMark, esc, key, drafting, locked, sending: S.sending,
    helps: !(game.options && game.options.helps === false),
    sel: S.sel, pending: drafting ? committed : null,
    fx: fxFor,
    attr: (s) => esc(String(s)),
    name: (mark) => (mark === myMark ? WORDS.you : esc(rp(mark) ? rp(mark).name : String(mark || "?"))),
    icon: (mark) => (rp(mark) && rp(mark).icon ? `${esc(rp(mark).icon)} ` : ""),
    color: (mark) => {
      const p = rp(mark);
      if (p && typeof p.color === "string" && /^#[0-9a-f]{3,8}$/i.test(p.color)) return p.color;
      return FALLBACK_COLORS[Math.max(0, order.indexOf(mark)) % FALLBACK_COLORS.length];
    },
  };
}

// ---------- hint line (fixed height; instruction / waiting / error) ----------
function hintHtml(view) {
  const { game, me } = view;
  let text = "";
  let cls = "";
  if (S.flash) { text = view.esc(S.flash.text); cls = "bw-err"; }
  else if (!me) text = UI.spectating;
  else if (S.sending) { text = UI.sending; cls = "bw-locked"; }
  else if (me.skipped) text = UI.skippedYou;
  else if (me.has_committed || view.pending) {
    const waiting = game.players.filter((p) => !p.is_bot && !p.has_committed && !p.skipped && p.mark !== view.myMark).map((p) => view.name(p.mark));
    text = `<b>${UI.picked}</b> ${waiting.length ? UI.waitingFor(waiting.join(", ")) : UI.waitingAll}`;
    cls = "bw-locked";
  } else if (view.sel) {
    const n = (view.sel.source === "center" ? game.center : game.stalls[view.sel.source]).filter((f) => f === view.sel.flower).length;
    text = UI.selected(n, view.sel.flower);
  } else text = UI.tapFlower;
  const clear = `<button type="button" class="bw-clear" data-act="clear"${view.sel && !view.locked ? "" : " disabled"}>${UI.clear}</button>`;
  return `<div class="bw-hint ${cls}" role="status" aria-live="polite"><span class="bw-hint-text">${text}</span>${clear}</div>`;
}

function myBoardHtml(view) {
  const { me } = view;
  if (!me) return "";
  const interactive = view.drafting;
  const target = view.sel ? ` bw-target${view.helps ? " bw-helps" : ""}` : "";
  return `<section class="bw-board bw-panel${target}">
      <div class="bw-board-head"><b>${WORDS.yourGarden}</b><span>${WORDS.rows} › ${WORDS.bed}</span>
        <span class="bw-pts">${Number(me.score) || 0} ${WORDS.pts}</span></div>
      ${gardenHtml(me, view, { interactive })}
      ${compostHtml(me, view, { interactive })}
    </section>`;
}

// ---------- paint ----------
function paint(ctx) {
  if (!ctx || !ctx.host) return;
  const host = ctx.host;
  let root = host.querySelector(":scope > .bw-play");
  if (!root || root.getAttribute("data-bw-key") !== S.key) {
    host.className = "macro-board bloomwork-table";
    host.innerHTML = `<div class="bloomwork-root bw-play" data-bw-key="${S.key.replace(/"/g, "")}">${spriteSvg()}<div class="bw-body"></div></div>`;
    root = host.querySelector(":scope > .bw-play");
    root.addEventListener("click", onClick);
    if (ASSETS.tableBg) root.style.backgroundImage = `url("${String(ASSETS.tableBg).replace(/"/g, "%22")}")`;
  }
  const view = buildView(ctx);
  const { game } = view;
  const others = (Array.isArray(game.players) ? game.players : []).filter((p) => p.mark !== view.myMark);
  let top;
  if (game.status === "complete") top = resultsHtml(view);
  else if (game.phase === "review") top = `${reviewHtml(view)}${S.flash ? hintHtml(view) : ""}`;
  else top = `${marketHtml(view)}${hintHtml(view)}`;
  root.querySelector(".bw-body").innerHTML = `
    ${seatsHtml(view)}
    ${statusHtml(view)}
    ${top}
    ${myBoardHtml(view)}
    ${opponentsHtml(view, others)}
    ${game.status === "playing" && game.phase === "drafting" ? logHtml(view) : ""}`;
}

// ---------- intents ----------
function onClick(event) {
  const el = event.target.closest("[data-act]");
  if (!el || el.disabled || !S.lastCtx) return;
  const act = el.getAttribute("data-act");
  if (act === "tile") return pickTile(el.getAttribute("data-src"), el.getAttribute("data-f"));
  if (act === "row") return commitPick(Number(el.getAttribute("data-row")));
  if (act === "clear") { S.sel = null; playClick(); return repaint(); }
  if (act === "next") return send({ type: "READY_NEXT", round: S.lastCtx.game.round });
  if (act === "skip") return send({ type: "SKIP_PLAYER", target: el.getAttribute("data-target"), round: S.lastCtx.game.round });
  return undefined;
}

function pickTile(rawSource, flower) {
  const ctx = S.lastCtx;
  const source = rawSource === "center" ? "center" : Number(rawSource);
  const key = stepKey(ctx);
  if (S.sel && S.sel.source === source && S.sel.flower === flower) S.sel = null;
  else S.sel = { key, source, flower };
  S.flash = null;
  playClick();
  repaint();
}

async function commitPick(row) {
  const ctx = S.lastCtx;
  const sel = S.sel;
  if (!sel || S.sending || !Number.isInteger(row)) return;
  const game = ctx.game;
  S.sending = true;
  S.flash = null;
  playCue("pick");
  repaint();
  let err;
  try {
    err = await ctx.makeMove({ type: "PICK", round: game.round, pick: game.pick, source: sel.source, flower: sel.flower, row });
  } catch (e) {
    err = (e && e.message) || String(e);
  }
  S.sending = false;
  if (err) {
    setFlash(err);
    playCue("reject");
  } else {
    S.pending = { key: sel.key, source: sel.source, flower: sel.flower, row };
    S.sel = null;
  }
  repaint();
}

async function send(action) {
  const ctx = S.lastCtx;
  if (S.sending) return;
  S.sending = true;
  playClick();
  repaint();
  let err;
  try { err = await ctx.makeMove(action); } catch (e) { err = (e && e.message) || String(e); }
  S.sending = false;
  if (err) { setFlash(err); playCue("reject"); }
  repaint();
}
