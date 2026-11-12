// Chinese Checkers — in-game UI adapter. Renders the prepared server projection
// (PLAN.md) and captures intent; it computes NO rule outcomes. Movable marbles,
// step targets, the hop graph and the legal stop holes all arrive in
// game.legal[myMark] / game.stops[myMark] (server-computed, viewer-trimmed). The
// client only walks that graph to build a path (tap ring by ring, or tap any
// reachable stop and a BFS over the server's hop graph picks a route) and sends
// one MOVE / PASS / RETRACT; the server re-validates and resolves the round.
// Assists (options.assists): "moves" drops reach rings + auto-route; "off" has
// no graph at all — legal_lite only says which marbles may move, each tapped
// hole is appended unchecked and the server's rejection is flashed. Mode
// differences (who may act, strip, action bar) live in controls.js; the
// countdown + TICK in clock.js.
//
// The shell calls renderChineseCheckersGame(ctx) on EVERY snapshot. View state
// (selection, flash, event cursor, round replay) lives in module state keyed by
// room+epoch — the selection additionally by round — so re-renders never reset
// it. The DOM skeleton is kept across snapshots; panels are repainted. All
// wiring is addEventListener; no app.js imports.
import { playClick } from "../../sound.js";
import { ASSETS, paletteFor } from "./assets.js";
import { SP, VIEWBOX, buildBoardSvg, holeXY, marbleDefsFor, marbleSvg } from "./board-svg.js";
import { TICKER, UI } from "./branding.js";
import { renderChineseCheckersLobby } from "./lobby.js";
import { clockHtml, clockSecondsLeft, syncClock } from "./clock.js";
import { assistsOf, canActNow, controlsHtml, controlsModel, isLiveMode, modeOf, seatOrder, seatStatus, skipFor, stripModel } from "./controls.js";
import { resultsHtml, stripHtml, tableHtml } from "./panels.js";
import { consumeEvents, playCue } from "./sfx.js";
import { CHINESE_CHECKERS_CSS } from "./styles.js";

const FLASH_MS = 4500;
const HIT_RADIUS = 0.72 * SP; // nearest hole within this distance takes the tap

let stylesInjected = false;
let themeObserved = false;
let S = freshState("");

function freshState(key) {
  return {
    key, selKey: "", from: null, path: [], sending: false, flash: null, flashTimer: null,
    anim: null, lastMarbles: null, sawPlaying: false, winPlayed: false, lastCtx: null,
    tickerSeq: -1, tickerPage: 0, lastCurrent: undefined,
  };
}

function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-cc-styles", "");
  style.textContent = CHINESE_CHECKERS_CSS;
  document.head.appendChild(style);
  stylesInjected = true;
}

function observeTheme() {
  if (themeObserved || typeof MutationObserver === "undefined") return;
  themeObserved = true;
  new MutationObserver(() => repaint())
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}

// Repaint from a timer / theme change — only while our board is still mounted.
function repaint() {
  const ctx = S.lastCtx;
  if (!ctx || !ctx.started || !ctx.host || !ctx.host.isConnected) return;
  const root = ctx.host.querySelector(":scope > .cc-play");
  if (root && root.getAttribute("data-cc-key") === S.key) paint(ctx);
}

const currentTheme = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

export function renderChineseCheckersGame(ctx) {
  const { host, game } = ctx;
  if (!host) return;
  injectStyles();
  observeTheme();
  if (!ctx.started || !game) {
    host.className = "macro-board chinese-checkers-table";
    renderChineseCheckersLobby(host, ctx);
    return;
  }
  const key = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}`;
  if (S.key !== key) {
    clearTimeout(S.flashTimer);
    S = freshState(key);
  }
  S.lastCtx = ctx;
  const me = seatInfo(ctx);
  handleEvents(ctx);
  reconcileSelection(ctx, me);
  paint(ctx);
  S.lastMarbles = { ...(game.marbles || {}) };
  syncClock({
    key, root: host.querySelector(":scope > .cc-play"), game, seated: Boolean(me.mySeat),
    sendTick: () => ctx.makeMove({ type: "TICK" }),
  });
}

// ---------- derived seat info ----------
function seatInfo(ctx) {
  const { game, room } = ctx;
  const roomPlayers = (room && Array.isArray(room.players)) ? room.players : [];
  const local = roomPlayers.find((p) => p.id === ctx.localPlayerId) || null;
  const myMark = local ? local.mark : null;
  const players = Array.isArray(game.players) ? game.players : [];
  const mySeat = players.find((p) => p.mark === myMark) || null;
  const legal = (mySeat && game.legal && game.legal[myMark]) || {};
  const stops = (mySeat && game.stops && game.stops[myMark]) || {};
  const assists = assistsOf(game);
  const lite = (mySeat && game.legal_lite && game.legal_lite[myMark]) || {};
  const movable = assists === "off" ? Object.keys(lite).filter((k) => lite[k]) : Object.keys(legal);
  return { myMark, mySeat, legal, stops, assists, movable, roomPlayers, players };
}

function nameOf(ctx, mark) {
  const p = ((ctx.room && ctx.room.players) || []).find((x) => x.mark === mark);
  return p ? p.name : String(mark || "?");
}
function colorOf(ctx, mark) {
  const p = ((ctx.room && ctx.room.players) || []).find((x) => x.mark === mark);
  if (p && typeof p.color === "string" && /^#[0-9a-f]{3,8}$/i.test(p.color)) return p.color;
  const order = Array.isArray(ctx.game.seat_order) ? ctx.game.seat_order : [];
  const i = Math.max(0, order.indexOf(mark));
  return ASSETS.seatFallback[i % ASSETS.seatFallback.length];
}

function setFlash(text, kind = "info") {
  S.flash = { text, kind, until: Date.now() + FLASH_MS };
  clearTimeout(S.flashTimer);
  S.flashTimer = setTimeout(() => { S.flash = null; repaint(); }, FLASH_MS + 50);
}

// ---------- events → replay, sounds ----------
function handleEvents(ctx) {
  const { game } = ctx;
  const fresh = consumeEvents(S.key, game.events);
  const moves = fresh.filter((e) => e.type === "move");
  const watching = typeof document === "undefined" || !document.hidden;
  const myMark = seatInfo(ctx).myMark;
  if (fresh.some((e) => e.type === "timeout" && e.mark === myMark)) setFlash(UI.timedOut, "error");
  const turnNow = modeOf(game) === "turns" && game.status === "playing" ? game.current : null;
  if (turnNow !== S.lastCurrent) {
    if (S.lastCurrent !== undefined && turnNow && turnNow === myMark && watching) playCue("turn");
    S.lastCurrent = turnNow;
  }
  if (moves.length && S.lastMarbles && watching) startReplay(ctx, moves, fresh);
  else if (fresh.length && watching) {
    if (fresh.some((e) => e.type === "finish")) playCue("finish");
    else if (fresh.some((e) => e.type === "round")) playCue("round");
  }
  if (game.status === "playing") S.sawPlaying = true;
  if (game.status === "complete" && S.sawPlaying && !S.winPlayed && !S.anim) {
    S.winPlayed = true;
    playCue("win");
  }
}

const hexDist = (a, b) => {
  const [aq, ar] = a.split(",").map(Number); const [bq, br] = b.split(",").map(Number);
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(aq + ar - bq - br)) / 2;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

// Replays the new moves in event order (rounds: priority order; blitz / live /
// turns: as they applied, one or a few per snapshot) on a copy of the board
// this client last saw. Skipped unless the moves replay cleanly from that base.
function replaysFrom(base, moves) {
  const b = { ...base };
  return moves.every((e) => {
    if (e.outcome === "bounced") return true;
    if (b[e.from] !== e.mark || !e.to) return false;
    delete b[e.from]; b[e.to] = e.mark;
    (Array.isArray(e.captured) ? e.captured : []).forEach((c) => { delete b[c.from]; b[c.to] = c.mark; });
    return true;
  });
}

function startReplay(ctx, moves, fresh) {
  const base = { ...S.lastMarbles };
  if (!replaysFrom(base, moves)) return;
  if (S.anim) S.anim.cancelled = true;
  const token = { board: base, shake: new Set(), cancelled: false };
  S.anim = token;
  const speed = moves.length > 4 ? 0.7 : 1;
  runReplay(ctx, token, moves, fresh, speed).catch(() => {}).finally(() => {
    if (S.anim === token) S.anim = null;
    repaint();
    const live = S.lastCtx;
    if (live && live.game && live.game.status === "complete" && S.sawPlaying && !S.winPlayed) { S.winPlayed = true; playCue("win"); }
  });
}

async function runReplay(ctx, A, moves, fresh, speed) {
  const alive = () => !A.cancelled && S.anim === A;
  await wait(180);
  for (const e of moves) {
    if (!alive()) return;
    if (e.outcome === "bounced" || !Array.isArray(e.path) || !e.path.length) {
      await shake(A, e.from, alive);
      continue;
    }
    const idx = e.to ? e.path.indexOf(e.to) : e.path.length - 1;
    const route = [e.from, ...(idx >= 0 ? e.path.slice(0, idx + 1) : [e.to])];
    delete A.board[e.from];
    repaint();
    const color = colorOf(ctx, e.mark);
    const isStep = route.length === 2 && hexDist(route[0], route[1]) === 1;
    for (let i = 1; i < route.length && alive(); i += 1) {
      await fly(A, route[i - 1], route[i], color, isStep ? 190 / speed : 260 / speed, isStep ? 0 : 0.55);
      playCue(isStep ? "step" : "hop", i - 1);
    }
    if (!alive()) return;
    const to = route[route.length - 1];
    A.board[to] = e.mark;
    clearAnimLayer();
    repaint();
    playCue("land");
    if (e.outcome === "cut") await shake(A, to, alive);
    for (const c of (Array.isArray(e.captured) ? e.captured : [])) {
      if (!alive()) return;
      await wait(120);
      delete A.board[c.from];
      repaint();
      playCue("capture");
      await fly(A, c.from, c.to, colorOf(ctx, c.mark), 520 / speed, 1.6);
      A.board[c.to] = c.mark;
      clearAnimLayer();
      repaint();
    }
    await wait(140 / speed);
  }
  if (!alive()) return;
  if (fresh.some((x) => x.type === "finish")) playCue("finish");
  else if (fresh.some((x) => x.type === "round")) playCue("round");
}

async function shake(A, k, alive) {
  if (!k) return;
  A.shake = new Set([k]);
  repaint();
  playCue("bounce");
  await wait(480);
  if (alive()) { A.shake = new Set(); repaint(); }
}

function clearAnimLayer() {
  const layer = document.querySelector(".chinese-checkers-root .cc-anim");
  if (layer) layer.innerHTML = "";
}

// Moves one marble along an arc from hole a to hole b (lift in spacings).
function fly(A, a, b, color, ms, lift) {
  const rot = boardRot(S.lastCtx);
  const p0 = holeXY(a, rot); const p1 = holeXY(b, rot);
  const markup = `<defs>${marbleDefsFor(color, "Fly")}</defs><g class="cc-fly-pos">${marbleSvg(0, 0, "Fly", color, { cls: "cc-flying" })}</g>`;
  return new Promise((resolve) => {
    setTimeout(resolve, ms + 250); // rAF stalls in a background tab — never hang the replay
    const t0 = performance.now();
    const frame = (now) => {
      if (A.cancelled || S.anim !== A) { resolve(); return; }
      const t = Math.min(1, (now - t0) / ms);
      const k = ease(t);
      const h = Math.sin(Math.PI * t) * lift * SP;
      const x = p0.x + (p1.x - p0.x) * k; const y = p0.y + (p1.y - p0.y) * k - h;
      const s = 1 + 0.18 * Math.sin(Math.PI * t) * Math.min(1, lift);
      const layer = document.querySelector(".chinese-checkers-root .cc-anim");
      if (layer) {
        if (!layer.firstElementChild || layer.getAttribute("data-c") !== color) {
          layer.setAttribute("data-c", color);
          layer.innerHTML = markup;
        }
        layer.querySelector(".cc-fly-pos").setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(3)})`);
      }
      if (t < 1) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
}

// ---------- ticker ----------
function tickerModel(ctx) {
  const events = Array.isArray(ctx.game.events) ? ctx.game.events : [];
  if (!events.length) return null;
  const maxSeq = events.reduce((m, e) => Math.max(m, e.seq || 0), 0);
  if (maxSeq !== S.tickerSeq) { S.tickerSeq = maxSeq; S.tickerPage = 0; }
  const resolved = events.filter((e) => e.type !== "round" && e.type !== "turn");
  const lastRound = resolved.reduce((m, e) => Math.max(m, e.round || 0), 0);
  const name = (m) => nameOf(ctx, m);
  const top = []; const mid = []; const low = [];
  events.filter((e) => e.type !== "round" && e.type !== "turn" && e.round === lastRound).forEach((e) => {
    if (e.type === "end") top.unshift(TICKER.end((e.winners || []).map(name)));
    else if (e.type === "finish") top.push(TICKER.finish(name(e.mark), e.rank));
    else if (e.type === "move") {
      if (e.outcome === "cut") mid.push(TICKER.cut(name(e.mark), e.by ? name(e.by) : ""));
      else if (e.outcome === "bounced") mid.push(TICKER.bounced(name(e.mark), e.by ? name(e.by) : ""));
      if (Array.isArray(e.captured) && e.captured.length) mid.push(TICKER.captured(name(e.mark), e.captured.map((c) => name(c.mark))));
      const hops = Array.isArray(e.path) ? e.path.length : 0;
      if (e.outcome === "ok") {
        if (hops > 1) mid.push(TICKER.hops(name(e.mark), hops));
        else low.push(hops === 1 && hexDist(e.from, e.path[0]) === 1 ? TICKER.step(name(e.mark)) : TICKER.hops(name(e.mark), 1));
      }
    } else if (e.type === "pass") low.push(TICKER.pass(name(e.mark)));
    else if (e.type === "skip") mid.push(TICKER.skip(name(e.mark)));
    else if (e.type === "timeout") mid.push(TICKER.timeout(name(e.mark)));
  });
  const roundEv = events.filter((e) => e.type === "round").sort((a, b) => b.seq - a.seq)[0];
  const pages = [...top, ...mid, ...low];
  const mode = modeOf(ctx.game);
  if (roundEv && ctx.game.status === "playing" && mode !== "turns") {
    pages.push(mode === "rounds" ? TICKER.round(roundEv.round, name((roundEv.priority || [])[0])) : TICKER.liveRound(roundEv.round));
  }
  if (!pages.length) return null;
  const page = S.tickerPage % pages.length;
  return { text: pages[page], page, pages: pages.length };
}

// ---------- selection ----------
const isStep = (entry, k) => Boolean(entry && Array.isArray(entry.steps) && entry.steps.includes(k));
const hopsAt = (entry, node) => (entry && entry.hops && Array.isArray(entry.hops[node]) ? entry.hops[node] : []);

function walkable(entry, from, path) {
  if (!path.length) return true;
  if (isStep(entry, path[0])) return path.length === 1;
  let cur = from;
  const seen = new Set([from]);
  for (const k of path) {
    if (seen.has(k) || !hopsAt(entry, cur).includes(k)) return false;
    seen.add(k); cur = k;
  }
  return true;
}

// Next hop landings from the end of the current chain (graph walk only).
function nextHops(me) {
  if (!S.from) return [];
  const entry = me.legal[S.from];
  if (S.path.length && isStep(entry, S.path[0])) return [];
  const cur = S.path.length ? S.path[S.path.length - 1] : S.from;
  return hopsAt(entry, cur).filter((k) => k !== S.from && !S.path.includes(k));
}

// Shortest chain over the server's hop graph from `start` to `target`,
// never revisiting `from` or holes in `avoid`.
function bfs(entry, from, start, target, avoid) {
  const prev = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const node = queue.shift();
    if (node === target) break;
    hopsAt(entry, node).forEach((n) => {
      if (n === from || avoid.has(n) || prev.has(n)) return;
      prev.set(n, node);
      queue.push(n);
    });
  }
  if (!prev.has(target)) return null;
  const out = [];
  for (let n = target; n !== start; n = prev.get(n)) out.unshift(n);
  return out;
}

const stopsFor = (me) => (S.from && Array.isArray(me.stops[S.from]) ? me.stops[S.from] : []);
const pathEnd = () => (S.path.length ? S.path[S.path.length - 1] : null);

function reconcileSelection(ctx, me) {
  const { game } = ctx;
  const selKey = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}#${game.round}`;
  if (selKey !== S.selKey) { S.selKey = selKey; S.from = null; S.path = []; return; }
  if (!S.from) return;
  if (!canAct(ctx, me) && !S.sending) { S.from = null; S.path = []; return; }
  if (!me.movable.includes(S.from)) { S.from = null; S.path = []; if (!S.sending) setFlash(UI.takenNow, "error"); return; }
  if (me.assists !== "off" && !walkable(me.legal[S.from], S.from, S.path)) S.path = [];
}

const canAct = (ctx, me) => canActNow(ctx.game, me.mySeat);
// Another seat's move animating blocks input only where moves resolve together
// (rounds / turns); in blitz / live the board keeps taking taps meanwhile.
const animBlocks = (ctx) => Boolean(S.anim) && !isLiveMode(modeOf(ctx.game));
// Assists "off": any path is sendable (the server judges it); else it must end on a stop.
const canSubmit = (me) => Boolean(S.from && pathEnd() && (me.assists === "off" || stopsFor(me).includes(pathEnd())));
const movePending = (ctx) => S.sending || (typeof ctx.isMovePending === "function" && ctx.isMovePending());

// ---------- intents ----------
function onTap(k) {
  const ctx = S.lastCtx;
  if (!ctx) return;
  if (animBlocks(ctx)) { S.anim.cancelled = true; S.anim = null; clearAnimLayer(); repaint(); return; }
  const me = seatInfo(ctx);
  if (!k || !canAct(ctx, me) || movePending(ctx)) return;
  const mine = me.movable.includes(k);
  const select = (key) => { S.from = key; S.path = []; playClick(); paint(ctx); };
  if (!S.from) { if (mine) select(k); return; }
  if (k === S.from) { if (S.path.length) S.path = []; else S.from = null; playClick(); paint(ctx); return; }
  const entry = me.legal[S.from];
  const at = S.path.indexOf(k);
  if (at >= 0) { if (at < S.path.length - 1) { S.path = S.path.slice(0, at + 1); playClick(); paint(ctx); } return; }
  if (me.assists === "off") { // unchecked: the server validates on Move
    if (mine && !S.path.length) select(k); else { S.path.push(k); playCue("hop", S.path.length - 1); paint(ctx); }
    return;
  }
  if (isStep(entry, k)) { S.path = [k]; playCue("step"); paint(ctx); return; }
  if (nextHops(me).includes(k)) { S.path.push(k); playCue("hop", S.path.length - 1); paint(ctx); return; }
  if (mine) { select(k); return; }
  if (me.assists !== "full") return; // no tap-far auto-route below full assists
  // A distant reachable hole: extend the current chain if it can get there,
  // otherwise route afresh from the marble (BFS over the server's hop graph).
  const chainOk = S.path.length && !isStep(entry, S.path[0]);
  const ext = chainOk ? bfs(entry, S.from, pathEnd(), k, new Set(S.path)) : null;
  const route = ext ? [...S.path, ...ext] : bfs(entry, S.from, S.from, k, new Set());
  if (route && route.length) { S.path = route; playCue("hop", route.length - 1); paint(ctx); }
}

async function send(ctx, action, onOk) {
  if (movePending(ctx)) return;
  S.sending = true;
  paint(ctx);
  let error;
  try { error = await ctx.makeMove(action); } catch (err) { error = (err && err.message) || String(err); }
  S.sending = false;
  if (typeof error === "string" && error) { setFlash(error, "error"); playCue("reject"); } else if (onOk) onOk();
  repaint();
}

function lockIn(ctx, me) {
  if (!canSubmit(me) || !canAct(ctx, me)) return;
  send(ctx, { type: "MOVE", round: ctx.game.round, from: S.from, path: [...S.path] }, () => { S.from = null; S.path = []; playCue("lock"); });
}
function pass(ctx, me) {
  if (!canAct(ctx, me)) return;
  send(ctx, { type: "PASS", round: ctx.game.round }, () => { S.from = null; S.path = []; playCue("lock"); });
}
function retract(ctx, me) {
  const seat = me.mySeat;
  if (!seat || !seat.committed || ctx.game.status !== "playing") return;
  const prior = seat.commit && seat.commit.from ? { from: seat.commit.from, path: [...(seat.commit.path || [])] } : null;
  send(ctx, { type: "RETRACT", round: ctx.game.round }, () => {
    playClick();
    if (prior) { S.from = prior.from; S.path = prior.path; }
  });
}
function voteSkip(ctx, target) {
  if (movePending(ctx)) return;
  playClick();
  Promise.resolve(ctx.makeMove({ type: "SKIP_PLAYER", round: ctx.game.round, target })).then((error) => {
    if (typeof error === "string" && error) { setFlash(error, "error"); playCue("reject"); repaint(); }
  }).catch(() => {});
}

// ---------- view model ----------
function boardRot(ctx) {
  const me = ctx ? seatInfo(ctx) : null;
  const arm = me && me.mySeat && Number.isInteger(me.mySeat.arm) ? me.mySeat.arm : 0;
  return (6 - arm) % 6;
}

function boardModel(ctx, me) {
  const { game } = ctx;
  const palette = paletteFor(currentTheme());
  const armColor = {};
  me.players.forEach((p) => { if (Number.isInteger(p.arm)) armColor[p.arm] = colorOf(ctx, p.mark); });
  const model = {
    cells: game.cells, marbles: S.anim ? S.anim.board : (game.marbles || {}), rot: boardRot(ctx), palette,
    colorOf: (m) => colorOf(ctx, m), armColor,
    goalArm: me.mySeat ? me.mySeat.goal_arm : null, goalColor: me.mySeat ? colorOf(ctx, me.myMark) : null,
    shake: S.anim ? S.anim.shake : null,
  };
  const seat = me.mySeat;
  if (seat && seat.committed && seat.commit && seat.commit.from && !S.anim) {
    model.committedPath = [seat.commit.from, ...(seat.commit.path || [])];
    model.committedMark = me.myMark;
  }
  if (animBlocks(ctx) || !canAct(ctx, me)) return model;
  if (!S.from) { if (me.assists !== "off") model.movable = me.movable; return model; }
  model.selected = S.from;
  if (me.assists === "off") { // plain outline + the typed path, no rings or glows
    model.selectedPlain = true;
    if (S.path.length) { model.path = [S.from, ...S.path]; model.pathEnd = "stop"; model.ghostMark = me.myMark; }
    return model;
  }
  const entry = me.legal[S.from];
  const stops = stopsFor(me);
  if (me.assists === "full") model.reach = stops;
  if (!S.path.length) model.steps = (entry && entry.steps) || [];
  model.hops = nextHops(me);
  if (S.path.length) {
    model.path = [S.from, ...S.path];
    model.pathEnd = stops.includes(pathEnd()) ? "stop" : "through";
    model.ghostMark = me.myMark;
  }
  return model;
}

function buildViewModel(ctx, me) {
  const { game } = ctx;
  const seat = me.mySeat;
  const acting = canAct(ctx, me);
  const pending = movePending(ctx);
  const players = me.players;
  const mode = modeOf(game);
  const name = (m) => nameOf(ctx, m);
  const strip = stripModel({
    game, seat, myMark: me.myMark, anim: Boolean(S.anim), sending: S.sending, from: S.from, pathLen: S.path.length,
    endOk: Boolean(pathEnd() && stopsFor(me).includes(pathEnd())), movable: me.movable.length, assists: me.assists, nameOf: name,
  });

  const rows = players.map((p) => {
    const rp = me.roomPlayers.find((x) => x.mark === p.mark) || {};
    return {
      mark: p.mark, name: name(p.mark), icon: rp.icon || "", color: colorOf(ctx, p.mark), isMe: p.mark === me.myMark,
      team: game.options && game.options.teams_active ? p.team : null,
      inGoal: p.in_goal || 0, total: p.marbles_total || 0, distance: p.distance || 0,
      ...seatStatus(p, game), skip: skipFor(p, game, me), order: seatOrder(p, game),
    };
  });

  let results = []; let winnerText = "";
  if (game.status === "complete") {
    const winners = Array.isArray(game.winners) ? game.winners : (game.winner ? [game.winner] : []);
    const list = Array.isArray(game.results) && game.results.length
      ? [...game.results].sort((a, b) => (a.rank || 99) - (b.rank || 99))
      : players.map((p) => ({ mark: p.mark, rank: p.rank, finished: p.finished, distance: p.distance, score: p.score, team: p.team }));
    results = list.map((r) => {
      const rp = me.roomPlayers.find((x) => x.mark === r.mark) || {};
      return { ...r, name: nameOf(ctx, r.mark), icon: rp.icon || "", color: colorOf(ctx, r.mark), isMe: r.mark === me.myMark, winner: winners.includes(r.mark), team: game.options && game.options.teams_active ? r.team : null };
    });
    const names = winners.map((m) => nameOf(ctx, m));
    const first = results.find((r) => r.winner);
    winnerText = game.options && game.options.teams_active && first && first.team !== null && first.team !== undefined
      ? UI.teamWinner(first.team, names) : UI.winner(names);
  }

  return {
    strip, secsLeft: clockSecondsLeft(), ticker: tickerModel(ctx),
    orderIsPriority: mode === "rounds", orderN: (Array.isArray(game.priority_order) ? game.priority_order : players).length,
    flash: S.flash && S.flash.until > Date.now() ? S.flash : null,
    controls: controlsModel({
      game, seat, acting, pending, busy: pending || animBlocks(ctx), sending: S.sending,
      hasPath: S.path.length > 0, hasSel: Boolean(S.from), canSubmit: canSubmit(me), movable: me.movable.length,
    }),
    rows, results, winnerText, complete: game.status === "complete",
  };
}

// ---------- paint ----------
function ensureSkeleton(host) {
  let root = host.querySelector(":scope > .cc-play");
  if (root && root.getAttribute("data-cc-key") === S.key) return root;
  host.className = "macro-board chinese-checkers-table";
  const vb = `${VIEWBOX.x.toFixed(1)} ${VIEWBOX.y.toFixed(1)} ${VIEWBOX.w.toFixed(1)} ${VIEWBOX.h.toFixed(1)}`;
  host.innerHTML = `<div class="chinese-checkers-root cc-play" data-cc-key="">
      <div class="cc-strip" aria-live="polite"></div>
      ${clockHtml()}
      <div class="cc-results" hidden></div>
      <div class="cc-boardwrap"><svg class="cc-board" xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet"></svg></div>
      <div class="cc-controls"></div>
      <div class="cc-table"></div>
    </div>`;
  root = host.querySelector(".cc-play");
  root.setAttribute("data-cc-key", S.key);
  const svg = root.querySelector(".cc-board");
  svg.addEventListener("click", (ev) => onTap(hitTest(svg, ev)));
  root.querySelector(".cc-controls").addEventListener("click", (ev) => {
    const button = ev.target.closest("[data-cc-act]");
    if (!button || button.disabled) return;
    const live = S.lastCtx; const me = seatInfo(live);
    const act = button.getAttribute("data-cc-act");
    if (act === "lock") lockIn(live, me);
    else if (act === "pass") pass(live, me);
    else if (act === "retract") retract(live, me);
    else if (act === "undo") { S.path.pop(); playClick(); paint(live); }
    else if (act === "clear") { S.from = null; S.path = []; playClick(); paint(live); }
  });
  root.querySelector(".cc-table").addEventListener("click", (ev) => {
    const button = ev.target.closest("[data-cc-skip]");
    if (button) voteSkip(S.lastCtx, button.getAttribute("data-cc-skip"));
  });
  root.querySelector(".cc-strip").addEventListener("click", (ev) => {
    if (!ev.target.closest("[data-cc-ticker]")) return;
    S.tickerPage += 1;
    repaint();
  });
  return root;
}

// Nearest hole to the tap (generous zone ≈ one full spacing — ≥ 28 px on phones).
function hitTest(svg, ev) {
  const ctx = S.lastCtx;
  if (!ctx || !svg.getScreenCTM) return null;
  const pt = svg.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const p = pt.matrixTransform(ctm.inverse());
  const rot = boardRot(ctx);
  let best = null; let bestD = HIT_RADIUS;
  (ctx.game.cells || []).forEach((c) => {
    const h = holeXY(c.k, rot);
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    if (d < bestD) { bestD = d; best = c.k; }
  });
  return best;
}

function paint(ctx) {
  const host = ctx.host;
  if (!host || !ctx.game) return;
  const esc = ctx.escapeHtml || ((s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
  const me = seatInfo(ctx);
  const vm = buildViewModel(ctx, me);
  const root = ensureSkeleton(host);
  root.classList.toggle("cc-complete", vm.complete);
  root.classList.toggle("cc-can-act", canAct(ctx, me) && !animBlocks(ctx));
  root.classList.toggle("cc-animating", Boolean(S.anim));
  root.querySelector(".cc-strip").innerHTML = stripHtml(vm, esc);
  const results = root.querySelector(".cc-results");
  results.hidden = !vm.complete;
  results.innerHTML = vm.complete ? resultsHtml(vm, esc) : "";
  const svg = root.querySelector(".cc-board");
  const anim = svg.querySelector(".cc-anim");
  const flying = anim && S.anim ? anim.innerHTML : "";
  svg.innerHTML = buildBoardSvg(boardModel(ctx, me));
  if (flying) svg.querySelector(".cc-anim").innerHTML = flying;
  const controls = root.querySelector(".cc-controls");
  controls.hidden = vm.complete;
  controls.innerHTML = vm.complete ? "" : controlsHtml(vm.controls, esc);
  const table = root.querySelector(".cc-table");
  table.hidden = vm.complete;
  table.innerHTML = vm.complete ? "" : tableHtml(vm, esc);
}
