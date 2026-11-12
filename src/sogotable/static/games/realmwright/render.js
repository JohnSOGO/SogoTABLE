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
import { paletteFor } from "./assets.js";
import { featureAnchor } from "./art.js";
import { applyCamera, attachGestures, cancelTween, fitCamera, newCamera, tweenCamera, ZOOM_MAX, zoomAt } from "./board-view.js";
import { boardBounds, buildBoardMarkup } from "./board-svg.js";
import { TICKER, UI } from "./branding.js";
import { renderRealmwrightLobby } from "./lobby.js";
import { botTickInFlight, syncBotTick } from "./bot-tick.js";
import { clockState, clockText, clockWarn, syncRoundClock } from "./round-timer.js";
import { countShown, fxEnqueue, fxFrame, fxMineUntil, fxOverlayMarkup, fxReset, reducedMotion, runCounters } from "./fx.js";
import { bagPanelHtml, meepleChoices, resultsHtml, stripHtml, tableHtml, tilesLeft, trayHtml } from "./panels.js";
import { consumeEvents, playCue } from "./sfx.js";
import { REALMWRIGHT_CSS } from "./styles.js";

const FALLBACK_COLORS = ["#d94141", "#2f6fd6", "#e0b100", "#2e9e5b", "#8a4fc9", "#e07a1f", "#1fa3a3", "#d0499a", "#6b7a8f", "#7a5230", "#94b814", "#3b3b3b"];
const FLASH_MS = 4500;
const ZOOM_MS = 1000; // auto-zoom in on a tapped spot, back out after Confirm, Fit button
const STEP_ZOOM_MS = 350; // the + / - buttons
const ZOOM_TILE_SHARE = 0.6; // the previewed tile fills ~60% of the shorter side

let stylesInjected = false;
let themeObserved = false;
let S = freshState("");

function freshState(key) {
  return {
    key, cam: newCamera(), selKey: "", rot: 0, sel: null, meeple: null, sending: false,
    flash: null, flashTimer: null, sawPlaying: false, winPlayed: false, lastCtx: null,
    zoomReturn: null, zoomTimer: null, placedAt: null, bagOpen: false, fxTimer: null, dealtKey: null, fxBusy: false,
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
  if (mountedRoot()) paint(S.lastCtx);
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
    clearTimeout(S.flashTimer); clearTimeout(S.fxTimer);
    S = freshState(key);
    fxReset(key);
  }
  S.lastCtx = ctx;
  const me = seatInfo(ctx);
  handleEvents(ctx, me);
  reconcileSelection(game, me);
  paint(ctx);
  syncBotTick(key, game, me.myMark, {
    mounted: () => Boolean(mountedRoot()),
    busy: () => S.sending || (typeof ctx.isMovePending === "function" && ctx.isMovePending()),
    send: (action) => (S.lastCtx || ctx).makeMove(action),
  });
  syncRoundClock(key, game, me.myMark, mountedRoot);
}

function mountedRoot() {
  const ctx = S.lastCtx;
  if (!ctx || !ctx.started || !ctx.host || !ctx.host.isConnected) return null;
  const root = ctx.host.querySelector(":scope > .rw-play");
  return root && root.getAttribute("data-rw-key") === S.key ? root : null;
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
// New events go onto the fx queue (which also times their sounds); with
// reduced motion they just play their cues, as before, with no animation.
function handleEvents(ctx, me) {
  const reduced = reducedMotion();
  const fresh = consumeEvents(S.key, ctx.game.events, me.myMark, { silent: !reduced });
  if (!reduced && fresh.length) {
    fxEnqueue(fresh, { board: Array.isArray(ctx.game.board) ? ctx.game.board : [], myMark: me.myMark, round: ctx.game.round });
  }
  if (fresh.some((e) => e.type === "redraw" && e.mark === me.myMark)) setFlash(UI.redrawn, "info");
  if (fresh.some((e) => e.type === "skip" && e.timeout && e.mark === me.myMark)) setFlash(UI.timedOut, "error");
  if (ctx.game.status === "playing") S.sawPlaying = true;
}

// A tile newly dealt to me (not the first snapshot): a short buzz on phones.
function buzzOnDeal(selKey, seat) {
  const first = S.dealtKey === null;
  if (selKey === S.dealtKey) return;
  S.dealtKey = selKey;
  if (first || !seat || !seat.tile) return;
  try { if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(30); } catch { /* unsupported */ }
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
    case "skip": return e.timeout ? TICKER.timeout(name(e.mark)) : TICKER.skip(name(e.mark));
    case "pause": return TICKER.pause(name(e.mark));
    case "resume": return TICKER.resume(name(e.mark));
    case "round": return TICKER.round(e.round);
    case "end": return TICKER.end;
    default: return "";
  }
}

// ---------- selection ----------
const entriesAt = (legal, x, y) => legal.filter((e) => e.x === x && e.y === y);
const rotsAt = (legal, x, y) => [...new Set(entriesAt(legal, x, y).map((e) => e.r))].sort((a, b) => a - b);
// "Show valid spots" off: no glow, any free cell next to the board can be
// tried in any rotation, and a spot that doesn't fit previews red with
// Confirm disabled. Legality still comes only from the server's legal list.
const spotsShown = (game) => !(game && game.options && game.options.show_spots === false);
function freeNextToBoard(game, x, y) {
  const taken = new Set((Array.isArray(game.board) ? game.board : []).map((b) => `${b.x},${b.y}`));
  if (taken.has(`${x},${y}`)) return false;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => taken.has(`${x + dx},${y + dy}`));
}
function selectedEntry(legal) {
  if (!S.sel) return null;
  return legal.find((e) => e.x === S.sel.x && e.y === S.sel.y && e.r === S.sel.r) || null;
}

function reconcileSelection(game, me) {
  const seat = me.mySeat;
  const selKey = seat ? `${game.round}|${seat.tile_serial}|${seat.tile}` : "";
  buzzOnDeal(selKey, seat);
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
  if (!entry && !spotsShown(game) && freeNextToBoard(game, S.sel.x, S.sel.y)) { S.meeple = null; return; }
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
// A background BOT_TICK in flight does not count: my controls stay live and
// a Confirm tapped meanwhile waits for it (see confirm).
function movePending(ctx) {
  return S.sending || (!botTickInFlight() && typeof ctx.isMovePending === "function" && ctx.isMovePending());
}

// ---------- auto-zoom for the meeple step ----------
function viewportEl() {
  const root = mountedRoot();
  return root ? root.querySelector(".rw-viewport") : null;
}
function zoomToCell(x, y) {
  const vp = viewportEl();
  if (!vp || !vp.clientWidth || !vp.clientHeight) return;
  const w = vp.clientWidth; const h = vp.clientHeight;
  if (!S.zoomReturn) S.zoomReturn = { x: S.cam.x, y: S.cam.y, z: S.cam.z };
  const z = Math.min(ZOOM_MAX, (ZOOM_TILE_SHARE * Math.min(w, h)) / 100);
  tweenCamera(vp, S.cam, { x: w / 2 - (x * 100 + 50) * z, y: h / 2 - (y * 100 + 50) * z, z }, { ms: ZOOM_MS, reduced: reducedMotion() });
}
// Out of the auto-zoom (after confirm, clear or reject): glide to the whole
// board, centred.
function zoomBack(viewport) {
  const back = S.zoomReturn;
  S.zoomReturn = null;
  if (back && viewport) glideToFit(viewport);
}
// A manual pan / pinch / wheel / zoom button keeps the view the player chose.
function onManualCamera() {
  S.zoomReturn = null;
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
        playCue("tap");
        paint(ctx);
        return;
      }
    }
    rotate(ctx, me);
    return;
  }
  const rots = rotsAt(me.legal, x, y);
  const free = !spotsShown(ctx.game);
  if (!rots.length && !(free && freeNextToBoard(ctx.game, x, y))) return;
  const r = free || rots.includes(S.rot) ? S.rot : rots[0];
  S.sel = { x, y, r };
  S.rot = r;
  S.meeple = null;
  playCue("tap");
  zoomToCell(x, y);
  paint(ctx);
}

function rotate(ctx, me) {
  if (S.sel && !spotsShown(ctx.game)) {
    S.sel.r = (S.sel.r + 1) % 4;
    S.rot = S.sel.r;
    const entry = selectedEntry(me.legal);
    if (S.meeple !== null && (!entry || !entry.meeples.includes(S.meeple))) S.meeple = null;
  } else if (S.sel) {
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
  playCue("tap");
  paint(ctx);
}

async function confirm(ctx, me) {
  if (!S.sel || !canAct(ctx, me) || movePending(ctx)) return;
  const tick = botTickInFlight();
  if (tick) {
    S.sending = true; paint(ctx);
    await tick;
    S.sending = false;
    ctx = S.lastCtx || ctx; me = seatInfo(ctx);
    if (!S.sel || !canAct(ctx, me) || movePending(ctx)) { repaint(); return; }
  }
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
    S.sel = null; S.meeple = null; S.placedAt = null;
    setFlash(error, "error");
    playCue("reject");
  } else {
    S.sel = null; S.meeple = null;
    S.placedAt = { x: action.x, y: action.y, at: Date.now() };
    // With animation on, the fx queue plays these as my tile drops in.
    if (reducedMotion()) {
      playCue("place");
      if (withMeeple) setTimeout(() => playCue("meeple"), 140);
    }
  }
  repaint();
}

// Pause / resume the round clock (any seated player; the server decides).
function toggleClock() {
  const ctx = S.lastCtx;
  if (!ctx || movePending(ctx)) return;
  const me = seatInfo(ctx);
  const state = clockState(ctx.game);
  if (!state || !me.mySeat || me.mySeat.is_bot) return;
  playCue("tap");
  Promise.resolve(ctx.makeMove({ type: state.paused ? "RESUME_TIMER" : "PAUSE_TIMER", round: ctx.game.round })).then((error) => {
    if (typeof error === "string" && error) { setFlash(error, "error"); repaint(); }
  }).catch(() => {});
}

function voteSkip(ctx, target) {
  if (movePending(ctx)) return;
  playCue("tap");
  Promise.resolve(ctx.makeMove({ type: "SKIP_PLAYER", target, round: ctx.game.round })).then((error) => {
    if (typeof error === "string" && error) { setFlash(error, "error"); playCue("reject"); repaint(); }
  }).catch(() => {});
}

// ---------- view model ----------
function buildViewModel(ctx, me, frame) {
  const { game } = ctx;
  const palette = paletteFor(currentTheme());
  const seat = me.mySeat;
  const acting = canAct(ctx, me);
  const pending = movePending(ctx);
  const defs = game.tile_defs || {};
  const myTile = seat && seat.tile && defs[seat.tile] ? seat.tile : null;
  const entry = selectedEntry(me.legal);
  const showSpots = spotsShown(game);
  let preview = null;
  if (acting && S.sel && entry) preview = { ...S.sel, meeple: S.meeple, spots: entry.meeples, bad: false };
  else if (acting && S.sel && !showSpots) preview = { ...S.sel, meeple: null, spots: [], bad: true };
  const cellMap = new Map();
  if (acting && showSpots) {
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
  else if (preview && preview.bad) myStateText = UI.noFit;
  else if (preview) myStateText = UI.previewing;
  else if (!showSpots) myStateText = UI.findSpot;
  else myStateText = UI.ready;

  const rows = players.map((p) => {
    const rp = me.roomPlayers.find((x) => x.mark === p.mark) || {};
    let statusKey = "ready"; let statusText = UI.statusReady;
    if (p.skipped) { statusKey = "skipped"; statusText = UI.statusSkipped; }
    else if (p.placed) { statusKey = "placed"; statusText = UI.statusPlaced; }
    else if (!p.tile) { statusKey = "out"; statusText = UI.statusOut; }
    else if (p.is_bot) { statusKey = "thinking"; statusText = UI.statusThinking; }
    // A bot whose placement is still waiting in the animation queue keeps
    // "thinking" until its tile drops in.
    if (p.is_bot && p.placed && frame.pendingMarks.has(p.mark)) { statusKey = "thinking"; statusText = UI.statusThinking; }
    const voters = Array.isArray(votes[p.mark]) ? votes[p.mark] : [];
    const skip = iCanVote && !p.is_bot && !p.placed && !p.skipped && p.tile && p.mark !== me.myMark
      ? { votes: voters.length, needed: eligibleVoters.length, mine: voters.includes(me.myMark) }
      : null;
    return {
      mark: p.mark, name: nameOf(ctx, p.mark), icon: rp.icon || "", color: colorOf(ctx, p.mark), isMe: p.mark === me.myMark,
      score: p.score || 0, shownScore: countShown(p.mark, (p.score || 0) - (frame.pendingPoints[p.mark] || 0)), projected: p.projected !== undefined ? p.projected : (p.score || 0),
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
    choices: preview && !preview.bad ? meepleChoices(defs[myTile], preview.spots, preview.r) : [],
    fx: frame, bagOpen: S.bagOpen, tilesLeft: S.bagOpen ? tilesLeft(game) : null,
    canAct: acting && !pending, sending: S.sending,
    canRotate: acting && !pending && (!S.sel || !showSpots || rotsAt(me.legal, S.sel.x, S.sel.y).length > 1),
    canConfirm: acting && !pending && Boolean(preview) && !preview.bad,
    meeplesLeft: seat ? seat.meeples_left : 0,
    idleChoiceText: acting ? (showSpots ? UI.pickSpotFirst : UI.pickSpotFree) : (seat && seat.placed ? UI.statusPlaced : seat && seat.skipped ? UI.statusSkipped : ""),
    myStateText, ticker: tickerText(ctx), flash: S.flash && S.flash.until > Date.now() ? S.flash : null,
    liveTally: Boolean(game.options && game.options.live_tally), rows, results, winnerNames,
    clock: clockView(game, seat),
    complete: game.status === "complete",
  };
}

function clockView(game, seat) {
  const state = clockState(game);
  if (!state) return null;
  return { text: clockText(state.msLeft), paused: state.paused, warn: clockWarn(state), canToggle: Boolean(seat && !seat.is_bot) };
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
        <div class="rw-banner" aria-live="polite"></div>
        <div class="rw-bagpanel rw-overlay" hidden></div>
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
  attachGestures(viewport, { getCam: () => S.cam, onTap: onBoardTap, onManual: onManualCamera });
  // Bag chip (strip, repainted) and the panel's ✕ both toggle the panel.
  root.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest("[data-rw-clock]")) { toggleClock(); return; }
    if (!e.target.closest || !e.target.closest("[data-rw-bag]")) return;
    S.bagOpen = !S.bagOpen;
    playCue("tap");
    repaint();
  });
  root.querySelectorAll("[data-rw-zoom]").forEach((button) => {
    button.addEventListener("click", () => {
      onManualCamera();
      const kind = button.getAttribute("data-rw-zoom");
      const w = viewport.clientWidth; const h = viewport.clientHeight;
      // The buttons glide too: fit over the full zoom time, +/- in a short step.
      if (kind === "fit") { glideToFit(viewport); return; }
      const to = { x: S.cam.x, y: S.cam.y, z: S.cam.z };
      if (S.cam.tween) Object.assign(to, S.cam.tween.to); // stack quick taps
      zoomAt(to, kind === "in" ? 1.25 : 0.8, w / 2, h / 2);
      if (kind === "out") centreOnBoard(to, w, h); // zooming out also pans the realm to the middle
      tweenCamera(viewport, S.cam, to, { ms: STEP_ZOOM_MS, reduced: reducedMotion() });
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

function centreOnBoard(cam, w, h) {
  const board = S.lastCtx && Array.isArray(S.lastCtx.game.board) ? S.lastCtx.game.board : [];
  const b = boardBounds(board, []);
  cam.x = w / 2 - ((b.minX + b.maxX + 1) / 2) * 100 * cam.z;
  cam.y = h / 2 - ((b.minY + b.maxY + 1) / 2) * 100 * cam.z;
}

function glideToFit(viewport) {
  const ctx = S.lastCtx;
  if (!ctx) return;
  const me = seatInfo(ctx);
  const board = Array.isArray(ctx.game.board) ? ctx.game.board : [];
  const target = { x: S.cam.x, y: S.cam.y, z: S.cam.z };
  if (!fitCamera(target, boardBounds(board, canAct(ctx, me) ? me.legal : []), viewport.clientWidth, viewport.clientHeight)) return;
  S.cam.fitted = true;
  tweenCamera(viewport, S.cam, target, { ms: ZOOM_MS, reduced: reducedMotion() });
}

// Zoom-out waits for my placement to show on the board (the move reply can
// beat the snapshot) and for its animations; never longer than ~6 s.
function zoomHoldUntil(ctx, me) {
  const placed = S.placedAt;
  if (!placed) return 0;
  const board = Array.isArray(ctx.game.board) ? ctx.game.board : [];
  const onBoard = board.some((b) => b.x === placed.x && b.y === placed.y);
  const cap = placed.at + 6000;
  if (!onBoard) return Math.min(cap, Date.now() + 200);
  return Math.min(cap, Math.max(fxMineUntil(), placed.at));
}

// True when every legal cell sits fully inside the visible viewport.
function legalOnScreen(legal, viewport) {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  if (!w || !h) return true;
  const { x, y, z } = S.cam;
  return legal.every((e) => {
    const left = e.x * 100 * z + x;
    const top = e.y * 100 * z + y;
    return left >= 0 && top >= 0 && left + 100 * z <= w && top + 100 * z <= h;
  });
}

function paint(ctx) {
  const host = ctx.host;
  if (!host || !ctx.game) return;
  const esc = ctx.escapeHtml || ((s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
  const me = seatInfo(ctx);
  const now = Date.now();
  const frame = fxFrame(now);
  const vm = buildViewModel(ctx, me, frame);
  const { root } = ensureSkeleton(host);
  // Game over: the final scores celebrate first, then the results appear
  // (a whole-screen transition, so swapping the panels here is fine).
  const showResults = vm.complete && !frame.busy;
  if (showResults && S.sawPlaying && !S.winPlayed) { S.winPlayed = true; playCue("win"); }
  root.classList.toggle("rw-complete", showResults);
  root.querySelector(".rw-strip").innerHTML = stripHtml(vm, esc);

  const results = root.querySelector(".rw-results");
  results.hidden = !showResults;
  results.innerHTML = showResults ? resultsHtml(vm, esc) : "";

  const viewport = root.querySelector(".rw-viewport");
  viewport.style.background = vm.palette.boardBg;
  viewport.classList.toggle("rw-can-act", vm.canAct);
  const board = vm.board;
  vm.fxOverlay = fxOverlayMarkup(frame, {
    defAt: (x, y) => { const b = board.find((t) => t.x === x && t.y === y); return b && vm.defs[b.t] ? { def: vm.defs[b.t], r: b.r } : null; },
    colorOf: vm.colorOf, zoom: S.cam.z,
  });
  root.querySelector(".rw-cam").innerHTML = buildBoardMarkup(vm);
  const banner = root.querySelector(".rw-banner");
  const bannerKey = frame.banner ? String(frame.banner.round) : "";
  if (banner.getAttribute("data-k") !== bannerKey) {
    banner.setAttribute("data-k", bannerKey);
    banner.innerHTML = frame.banner ? `<span class="rw-banner-in" style="animation-delay:-${Math.round(frame.banner.elapsed)}ms">${esc(UI.roundBanner(frame.banner.round))}</span>` : "";
  }
  const bag = root.querySelector(".rw-bagpanel");
  bag.hidden = !S.bagOpen;
  bag.innerHTML = S.bagOpen ? bagPanelHtml(vm, esc) : "";
  // One repaint at the next animation boundary (a tile due to drop, a
  // celebration starting, the queue draining).
  clearTimeout(S.fxTimer);
  if (Number.isFinite(frame.next)) S.fxTimer = setTimeout(repaint, Math.max(16, frame.next - Date.now() + 8));
  // Auto-zoom returns once the selection is gone (confirmed, cleared, rejected).
  // After Confirm it waits for my tile, meeple and any scoring to finish
  // playing (zoomed in), then zooms out.
  if (S.zoomReturn && !S.sel && !S.sending) {
    const hold = zoomHoldUntil(ctx, me);
    if (Date.now() >= hold) zoomBack(viewport);
    else { clearTimeout(S.zoomTimer); S.zoomTimer = setTimeout(repaint, hold - Date.now() + 16); }
  }
  // A fresh tile in hand (new round or redraw) re-fits the camera when any of
  // its glowing spots sit off screen, so the realm growing past the edge never
  // hides where you can build. Panning within a round is never overridden.
  const tileKey = me.mySeat ? `${ctx.game.round}:${me.mySeat.tile_serial}` : "";
  const camBusy = Boolean(S.cam.tween || S.zoomReturn);
  if (!camBusy) {
    if (S.cam.fitted && tileKey && S.cam.tileKey !== tileKey && canAct(ctx, me) && !legalOnScreen(me.legal, viewport)) S.cam.fitted = false;
    S.cam.tileKey = tileKey;
  }
  if (!S.cam.fitted && !camBusy) {
    // The first fit is instant; a later re-fit (new tile's spots off screen)
    // glides there so the view never jumps.
    if (S.cam.tileKeyFitted) glideToFit(viewport);
    else if (!fitToBoard(viewport)) requestAnimationFrame(() => { if (!S.cam.fitted && fitToBoard(viewport)) applyCamera(viewport, S.cam); });
    if (S.cam.fitted) S.cam.tileKeyFitted = true;
  }
  applyCamera(viewport, S.cam);

  const tray = root.querySelector(".rw-tray");
  const chipsScroll = tray.querySelector(".rw-chips") ? tray.querySelector(".rw-chips").scrollLeft : 0;
  tray.hidden = showResults;
  tray.innerHTML = showResults ? "" : trayHtml(vm, esc);
  const chips = tray.querySelector(".rw-chips");
  if (chips && chipsScroll) chips.scrollLeft = chipsScroll;
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
      playCue("tap");
      paint(S.lastCtx || ctx);
    });
  });

  const table = root.querySelector(".rw-table");
  table.hidden = showResults;
  table.innerHTML = showResults ? "" : tableHtml(vm, esc);
  runCounters(root);
  table.querySelectorAll("[data-rw-skip]").forEach((button) => {
    button.addEventListener("click", () => voteSkip(S.lastCtx || ctx, button.getAttribute("data-rw-skip")));
  });
}
