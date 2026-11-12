// Realmwright — in-game UI adapter. Renders the prepared server projection and
// captures intent; it computes NO rule outcomes. Legal cells, rotations and
// meeple spots arrive in game.legal[myMark] (server-computed, viewer-trimmed);
// scores, projections and statuses arrive decided. The client only previews
// (pick a cell, rotate among the server's rotations, pick a listed meeple
// spot) and sends one PLACE_TILE; the server re-validates on commit.
//
// The shell calls renderRealmwrightGame(ctx) on EVERY snapshot. All view state
// (camera, rotation, previewed cell + meeple, event cursor, flash message)
// lives in module state keyed by room+epoch — and the selection additionally
// by round + tile_serial — so re-renders never reset it. The DOM skeleton
// (incl. the gesture-wired viewport) is kept across snapshots; only the panel
// contents are repainted. All wiring is addEventListener; no app.js imports.
import { playClick } from "../../sound.js";
import { paletteFor } from "./assets.js";
import { featureAnchor } from "./art.js";
import { applyCamera, attachGestures, fitCamera, newCamera, zoomAt } from "./board-view.js";
import { boardBounds, buildBoardMarkup } from "./board-svg.js";
import { TICKER, UI } from "./branding.js";
import { renderRealmwrightLobby } from "./lobby.js";
import { meepleChoices, resultsHtml, stripHtml, tableHtml, trayHtml } from "./panels.js";
import { consumeEvents, playCue } from "./sfx.js";
import { REALMWRIGHT_CSS } from "./styles.js";

const FALLBACK_COLORS = ["#d94141", "#2f6fd6", "#e0b100", "#2e9e5b", "#8a4fc9", "#e07a1f", "#1fa3a3", "#d0499a", "#6b7a8f", "#7a5230", "#94b814", "#3b3b3b"];
const FLASH_MS = 4500;
const GLOW_MS = 2600;

let stylesInjected = false;
let themeObserved = false;
let S = freshState("");

function freshState(key) {
  return {
    key, cam: newCamera(), selKey: "", rot: 0, sel: null, meeple: null, sending: false,
    flash: null, flashTimer: null, glow: { cells: [], start: 0 }, glowTimer: null, sawPlaying: false, winPlayed: false, lastCtx: null,
  };
}

function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-rw-styles", "");
  style.textContent = REALMWRIGHT_CSS;
  document.head.appendChild(style);
  stylesInjected = true;
}

function observeTheme() {
  if (themeObserved || typeof MutationObserver === "undefined") return;
  themeObserved = true;
  new MutationObserver(() => repaint())
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}

// Repaint from a timer / theme change — only while our board is still mounted
// (never hijack #macroBoard after the shell has moved on to another screen).
function repaint() {
  const ctx = S.lastCtx;
  if (!ctx || !ctx.started || !ctx.host || !ctx.host.isConnected) return;
  const root = ctx.host.querySelector(":scope > .rw-play");
  if (root && root.getAttribute("data-rw-key") === S.key) paint(ctx);
}

const currentTheme = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

export function renderRealmwrightGame(ctx) {
  const { host, game } = ctx;
  if (!host) return;
  injectStyles();
  observeTheme();
  if (!ctx.started || !game) {
    host.className = "macro-board realmwright-table";
    renderRealmwrightLobby(host, ctx);
    return;
  }
  const key = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}`;
  if (S.key !== key) {
    clearTimeout(S.flashTimer); clearTimeout(S.glowTimer);
    S = freshState(key);
  }
  S.lastCtx = ctx;
  const me = seatInfo(ctx);
  handleEvents(ctx, me);
  reconcileSelection(game, me);
  paint(ctx);
}

// ---------- derived seat info ----------
function seatInfo(ctx) {
  const { game, room } = ctx;
  const roomPlayers = (room && Array.isArray(room.players)) ? room.players : [];
  const local = roomPlayers.find((p) => p.id === ctx.localPlayerId) || null;
  const myMark = local ? local.mark : null;
  const players = Array.isArray(game.players) ? game.players : [];
  const mySeat = players.find((p) => p.mark === myMark) || null;
  const legal = (game.legal && myMark && Array.isArray(game.legal[myMark])) ? game.legal[myMark] : [];
  return { myMark, mySeat, legal, roomPlayers };
}

function nameOf(ctx, mark) {
  const p = (ctx.room && ctx.room.players || []).find((x) => x.mark === mark);
  return p ? p.name : String(mark || "?");
}
function colorOf(ctx, mark) {
  const players = (ctx.room && ctx.room.players) || [];
  const p = players.find((x) => x.mark === mark);
  if (p && typeof p.color === "string" && /^#[0-9a-f]{3,8}$/i.test(p.color)) return p.color;
  const order = Array.isArray(ctx.game.seat_order) ? ctx.game.seat_order : [];
  const i = Math.max(0, order.indexOf(mark));
  return FALLBACK_COLORS[i % FALLBACK_COLORS.length];
}

function setFlash(text, kind = "info") {
  S.flash = { text, kind, until: Date.now() + FLASH_MS };
  clearTimeout(S.flashTimer);
  S.flashTimer = setTimeout(() => { S.flash = null; repaint(); }, FLASH_MS + 50);
}

// ---------- events → sounds, glow, ticker ----------
function handleEvents(ctx, me) {
  const fresh = consumeEvents(S.key, ctx.game.events, me.myMark);
  const scored = fresh.filter((e) => e.type === "score" && Array.isArray(e.cells) && e.cells.length);
  if (scored.length) {
    S.glow = { cells: scored.flatMap((e) => e.cells), start: Date.now() };
    clearTimeout(S.glowTimer);
    S.glowTimer = setTimeout(() => { S.glow = { cells: [], start: 0 }; repaint(); }, GLOW_MS + 50);
  }
  if (fresh.some((e) => e.type === "redraw" && e.mark === me.myMark)) setFlash(UI.redrawn, "info");
  if (ctx.game.status === "playing") S.sawPlaying = true;
  // Fanfare once, and only for a game this client watched finish (not on a
  // later visit to an already-finished room).
  if (ctx.game.status === "complete" && S.sawPlaying && !S.winPlayed) {
    S.winPlayed = true;
    playCue("win");
  }
}

function tickerText(ctx) {
  const events = Array.isArray(ctx.game.events) ? ctx.game.events : [];
  const e = events.reduce((best, x) => (!best || x.seq > best.seq ? x : best), null);
  if (!e) return "";
  const name = (m) => nameOf(ctx, m);
  switch (e.type) {
    case "place": return TICKER.place(name(e.mark), e.meeple || null);
    case "score": return Array.isArray(e.marks) && e.marks.length
      ? TICKER.score(e.marks.map(name), e.kind, e.points)
      : TICKER.scoreNobody(e.kind);
    case "redraw": return TICKER.redraw(name(e.mark));
    case "skip": return TICKER.skip(name(e.mark));
    case "round": return TICKER.round(e.round);
    case "end": return TICKER.end;
    default: return "";
  }
}

// ---------- selection ----------
const entriesAt = (legal, x, y) => legal.filter((e) => e.x === x && e.y === y);
const rotsAt = (legal, x, y) => [...new Set(entriesAt(legal, x, y).map((e) => e.r))].sort((a, b) => a - b);
function selectedEntry(legal) {
  if (!S.sel) return null;
  return legal.find((e) => e.x === S.sel.x && e.y === S.sel.y && e.r === S.sel.r) || null;
}

function reconcileSelection(game, me) {
  const seat = me.mySeat;
  const selKey = seat ? `${game.round}|${seat.tile_serial}|${seat.tile}` : "";
  if (selKey !== S.selKey) {
    S.selKey = selKey;
    S.sel = null; S.meeple = null;
    const rots = [...new Set(me.legal.map((e) => e.r))].sort((a, b) => a - b);
    S.rot = rots.includes(0) || !rots.length ? 0 : rots[0];
    return;
  }
  if (!S.sel) return;
  if (!seat || seat.placed || seat.skipped || game.status !== "playing") { S.sel = null; S.meeple = null; return; }
  const entry = selectedEntry(me.legal);
  if (!entry) {
    S.sel = null; S.meeple = null;
    if (!S.sending) setFlash(UI.takenSpot, "error");
    return;
  }
  if (S.meeple !== null && !entry.meeples.includes(S.meeple)) {
    const def = game.tile_defs && game.tile_defs[seat.tile];
    const kind = def && def.features[S.meeple] ? def.features[S.meeple].kind : "feature";
    S.meeple = null;
    setFlash(UI.claimedFeature(kind), "error");
  }
}

function canAct(ctx, me) {
  const seat = me.mySeat;
  return Boolean(ctx.game.status === "playing" && seat && !seat.placed && !seat.skipped && seat.tile && me.legal.length);
}
function movePending(ctx) {
  return S.sending || (typeof ctx.isMovePending === "function" && ctx.isMovePending());
}

// ---------- intents ----------
function onBoardTap(wx, wy) {
  const ctx = S.lastCtx;
  if (!ctx) return;
  const me = seatInfo(ctx);
  if (!canAct(ctx, me) || movePending(ctx)) return;
  const x = Math.floor(wx / 100); const y = Math.floor(wy / 100);
  if (S.sel && S.sel.x === x && S.sel.y === y) {
    const entry = selectedEntry(me.legal);
    const def = ctx.game.tile_defs[me.mySeat.tile];
    if (entry && def) {
      let best = null; let bestD = 22;
      entry.meeples.forEach((idx) => {
        const [u, v] = featureAnchor(def, idx, S.sel.r);
        const d = Math.hypot(wx - (x + u) * 100, wy - (y + v) * 100);
        if (d < bestD) { bestD = d; best = idx; }
      });
      if (best !== null) {
        S.meeple = S.meeple === best ? null : best;
        playClick();
        paint(ctx);
        return;
      }
    }
    rotate(ctx, me);
    return;
  }
  const rots = rotsAt(me.legal, x, y);
  if (!rots.length) return;
  const r = rots.includes(S.rot) ? S.rot : rots[0];
  S.sel = { x, y, r };
  S.rot = r;
  S.meeple = null;
  playClick();
  paint(ctx);
}

function rotate(ctx, me) {
  if (S.sel) {
    const rots = rotsAt(me.legal, S.sel.x, S.sel.y);
    if (rots.length > 1) {
      const next = rots.find((r) => r > S.sel.r);
      S.sel.r = next !== undefined ? next : rots[0];
      S.rot = S.sel.r;
      const entry = selectedEntry(me.legal);
      if (S.meeple !== null && (!entry || !entry.meeples.includes(S.meeple))) S.meeple = null;
    }
  } else {
    S.rot = (S.rot + 1) % 4;
  }
  playClick();
  paint(ctx);
}

async function confirm(ctx, me) {
  if (!S.sel || !canAct(ctx, me) || movePending(ctx)) return;
  const action = { type: "PLACE_TILE", round: ctx.game.round, serial: me.mySeat.tile_serial, x: S.sel.x, y: S.sel.y, r: S.sel.r, meeple: S.meeple };
  const withMeeple = S.meeple !== null;
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
    S.sel = null; S.meeple = null;
    setFlash(error, "error");
    playCue("reject");
  } else {
    S.sel = null; S.meeple = null;
    playCue("place");
    if (withMeeple) setTimeout(() => playCue("meeple"), 140);
  }
  repaint();
}

function voteSkip(ctx, target) {
  if (movePending(ctx)) return;
  playClick();
  Promise.resolve(ctx.makeMove({ type: "SKIP_PLAYER", target, round: ctx.game.round })).then((error) => {
    if (typeof error === "string" && error) { setFlash(error, "error"); playCue("reject"); repaint(); }
  }).catch(() => {});
}

// ---------- view model ----------
function buildViewModel(ctx, me) {
  const { game } = ctx;
  const palette = paletteFor(currentTheme());
  const seat = me.mySeat;
  const acting = canAct(ctx, me);
  const pending = movePending(ctx);
  const defs = game.tile_defs || {};
  const myTile = seat && seat.tile && defs[seat.tile] ? seat.tile : null;
  const entry = selectedEntry(me.legal);
  const preview = acting && S.sel && entry ? { ...S.sel, meeple: S.meeple, spots: entry.meeples } : null;
  const cellMap = new Map();
  if (acting) {
    me.legal.forEach((e) => {
      const k = `${e.x},${e.y}`;
      const c = cellMap.get(k) || { x: e.x, y: e.y, strong: false };
      if (e.r === S.rot) c.strong = true;
      cellMap.set(k, c);
    });
  }
  const candidates = [...cellMap.values()];
  const players = Array.isArray(game.players) ? game.players : [];
  const humansWaiting = players.filter((p) => !p.is_bot && !p.placed && !p.skipped && p.tile);
  const eligibleVoters = players.filter((p) => !p.is_bot && p.placed && !p.skipped);
  const iCanVote = Boolean(game.status === "playing" && seat && !seat.is_bot && seat.placed && !seat.skipped);
  const votes = game.skip_votes || {};

  let myStateText;
  if (game.status === "complete") myStateText = UI.gameOver;
  else if (!seat) myStateText = UI.spectating;
  else if (S.sending) myStateText = UI.sending;
  else if (seat.placed) myStateText = UI.placed(humansWaiting.map((p) => nameOf(ctx, p.mark)));
  else if (seat.skipped) myStateText = UI.skipped;
  else if (!seat.tile) myStateText = UI.noTile;
  else if (!me.legal.length) myStateText = UI.noSpots;
  else if (preview) myStateText = UI.previewing;
  else myStateText = UI.ready;

  const rows = players.map((p) => {
    const rp = me.roomPlayers.find((x) => x.mark === p.mark) || {};
    let statusKey = "ready"; let statusText = UI.statusReady;
    if (p.skipped) { statusKey = "skipped"; statusText = UI.statusSkipped; }
    else if (p.placed) { statusKey = "placed"; statusText = UI.statusPlaced; }
    else if (!p.tile) { statusKey = "out"; statusText = UI.statusOut; }
    else if (p.is_bot) { statusKey = "bot"; statusText = UI.statusBot; }
    const voters = Array.isArray(votes[p.mark]) ? votes[p.mark] : [];
    const skip = iCanVote && !p.is_bot && !p.placed && !p.skipped && p.tile && p.mark !== me.myMark
      ? { votes: voters.length, needed: eligibleVoters.length, mine: voters.includes(me.myMark) }
      : null;
    return {
      mark: p.mark, name: nameOf(ctx, p.mark), icon: rp.icon || "", color: colorOf(ctx, p.mark), isMe: p.mark === me.myMark,
      score: p.score || 0, projected: p.projected !== undefined ? p.projected : (p.score || 0),
      breakdown: p.breakdown, projectedBreakdown: p.projected_breakdown,
      meeplesLeft: p.meeples_left, meeplesTotal: p.meeples_total, statusKey, statusText, skip,
    };
  });

  let results = [];
  let winnerNames = [];
  if (game.status === "complete") {
    const list = Array.isArray(game.results) && game.results.length ? game.results : players.map((p) => ({ mark: p.mark, score: p.score, breakdown: p.breakdown })).sort((a, b) => b.score - a.score);
    const top = list.length ? Math.max(...list.map((r) => r.score || 0)) : 0;
    results = list.map((r) => {
      const rp = me.roomPlayers.find((x) => x.mark === r.mark) || {};
      return { ...r, name: nameOf(ctx, r.mark), icon: rp.icon || "", color: colorOf(ctx, r.mark), isMe: r.mark === me.myMark, winner: (r.score || 0) === top };
    });
    winnerNames = results.filter((r) => r.winner).map((r) => r.name);
  }

  return {
    palette, defs, board: Array.isArray(game.board) ? game.board : [], round: game.round, bagCount: game.bag_count || 0,
    colorOf: (m) => colorOf(ctx, m), myColor: colorOf(ctx, me.myMark), myTile, myTileDef: myTile ? defs[myTile] : null,
    rot: S.rot, handRot: preview ? preview.r : S.rot, candidates, preview,
    choices: preview ? meepleChoices(defs[myTile], preview.spots, preview.r) : [],
    glow: S.glow.cells.length ? { cells: S.glow.cells, elapsed: Date.now() - S.glow.start } : null,
    canAct: acting && !pending, sending: S.sending,
    canRotate: acting && !pending && (!S.sel || rotsAt(me.legal, S.sel.x, S.sel.y).length > 1),
    canConfirm: acting && !pending && Boolean(preview),
    meeplesLeft: seat ? seat.meeples_left : 0,
    idleChoiceText: acting ? UI.pickSpotFirst : (seat && seat.placed ? UI.statusPlaced : seat && seat.skipped ? UI.statusSkipped : ""),
    myStateText, ticker: tickerText(ctx), flash: S.flash && S.flash.until > Date.now() ? S.flash : null,
    liveTally: Boolean(game.options && game.options.live_tally), rows, results, winnerNames,
    complete: game.status === "complete",
  };
}

// ---------- paint ----------
function ensureSkeleton(host) {
  let root = host.querySelector(":scope > .rw-play");
  if (root && root.getAttribute("data-rw-key") === S.key) return { root, fresh: false };
  host.className = "macro-board realmwright-table";
  host.innerHTML = `<div class="realmwright-root rw-play" data-rw-key="">
      <div class="rw-strip" aria-live="polite"></div>
      <div class="rw-results" hidden></div>
      <div class="rw-viewport">
        <svg class="rw-board" xmlns="http://www.w3.org/2000/svg"><g class="rw-cam"></g></svg>
        <div class="rw-zoom">
          <button type="button" class="rw-zbtn" data-rw-zoom="in" aria-label="${UI.zoomIn}">+</button>
          <button type="button" class="rw-zbtn" data-rw-zoom="out" aria-label="${UI.zoomOut}">−</button>
          <button type="button" class="rw-zbtn rw-zfit" data-rw-zoom="fit" aria-label="${UI.fit}">⤢</button>
        </div>
      </div>
      <div class="rw-tray"></div>
      <div class="rw-table"></div>
    </div>`;
  root = host.querySelector(".rw-play");
  root.setAttribute("data-rw-key", S.key);
  const viewport = root.querySelector(".rw-viewport");
  attachGestures(viewport, { getCam: () => S.cam, onTap: onBoardTap });
  root.querySelectorAll("[data-rw-zoom]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.getAttribute("data-rw-zoom");
      const w = viewport.clientWidth; const h = viewport.clientHeight;
      if (kind === "fit") fitToBoard(viewport);
      else zoomAt(S.cam, kind === "in" ? 1.25 : 0.8, w / 2, h / 2);
      applyCamera(viewport, S.cam);
    });
  });
  return { root, fresh: true };
}

function fitToBoard(viewport) {
  const ctx = S.lastCtx;
  if (!ctx) return false;
  const me = seatInfo(ctx);
  const board = Array.isArray(ctx.game.board) ? ctx.game.board : [];
  return fitCamera(S.cam, boardBounds(board, canAct(ctx, me) ? me.legal : []), viewport.clientWidth, viewport.clientHeight);
}

function paint(ctx) {
  const host = ctx.host;
  if (!host || !ctx.game) return;
  const esc = ctx.escapeHtml || ((s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
  const me = seatInfo(ctx);
  const vm = buildViewModel(ctx, me);
  const { root } = ensureSkeleton(host);
  root.classList.toggle("rw-complete", vm.complete);
  root.querySelector(".rw-strip").innerHTML = stripHtml(vm, esc);

  const results = root.querySelector(".rw-results");
  results.hidden = !vm.complete;
  results.innerHTML = vm.complete ? resultsHtml(vm, esc) : "";

  const viewport = root.querySelector(".rw-viewport");
  viewport.style.background = vm.palette.boardBg;
  viewport.classList.toggle("rw-can-act", vm.canAct);
  root.querySelector(".rw-cam").innerHTML = buildBoardMarkup(vm);
  if (!S.cam.fitted) {
    if (!fitToBoard(viewport)) requestAnimationFrame(() => { if (!S.cam.fitted && fitToBoard(viewport)) applyCamera(viewport, S.cam); });
  }
  applyCamera(viewport, S.cam);

  const tray = root.querySelector(".rw-tray");
  tray.hidden = vm.complete;
  tray.innerHTML = vm.complete ? "" : trayHtml(vm, esc);
  tray.querySelectorAll("[data-rw-act]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      const live = S.lastCtx || ctx;
      const info = seatInfo(live);
      if (button.getAttribute("data-rw-act") === "rotate") rotate(live, info);
      else confirm(live, info);
    });
  });
  tray.querySelectorAll("[data-rw-meeple]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      const v = button.getAttribute("data-rw-meeple");
      S.meeple = v === "none" ? null : Number(v);
      playClick();
      paint(S.lastCtx || ctx);
    });
  });

  const table = root.querySelector(".rw-table");
  table.hidden = vm.complete;
  table.innerHTML = vm.complete ? "" : tableHtml(vm, esc);
  table.querySelectorAll("[data-rw-skip]").forEach((button) => {
    button.addEventListener("click", () => voteSkip(S.lastCtx || ctx, button.getAttribute("data-rw-skip")));
  });
}
