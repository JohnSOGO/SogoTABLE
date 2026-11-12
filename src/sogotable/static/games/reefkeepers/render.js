// Reefkeepers — in-game UI adapter. Renders the prepared server projection and
// captures intent; it computes NO rule outcomes. Legal spots for my pending
// tile arrive in players[me].legal (server-computed, viewer-masked); scores,
// claim order, hints and results arrive decided. The client only previews a
// placement, keeps a 1st/2nd/3rd ranking of the offer, and sends one COMMIT
// per round; the server re-validates everything.
//
// The shell calls renderReefkeepersGame(ctx) on EVERY snapshot. View state
// (selection, rotation, ranking, expanded reef, flash) lives in module state:
// the game key is room+epoch, and the selection is additionally keyed to the
// barrier `${room.code}:${game_epoch}:${round}` so it resets on each new round.
// All wiring is addEventListener on the freshly painted root; no app.js imports.
import { playClick } from "../../sound.js";
import { artDefs } from "./art.js";
import { DIR, reachWindow, reefSvg } from "./board-view.js";
import { UI } from "./branding.js";
import { renderReefkeepersLobby } from "./lobby.js";
import { draftHtml, lockBarHtml, logHtml, logLine, othersHtml, reefCardHtml, resultsHtml, stripHtml, tableHtml } from "./panels.js";
import { consumeEvents, playCue } from "./sfx.js";
import { REEFKEEPERS_CSS } from "./styles.js";

const FALLBACK_COLORS = ["#e4572e", "#2f6fd6", "#e0a100", "#2e9e5b", "#8a4fc9", "#e07a1f", "#1fa3a3", "#d0499a"];
const FLASH_MS = 4500;
const LOG_LINES = 14;

let stylesInjected = false;
let S = freshState("");

function freshState(key) {
  return { key, selKey: "", picks: [], tap: null, rot: 0, sending: false, flash: null, flashTimer: null, expanded: null, lastCtx: null };
}

function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-rk-styles", "");
  style.textContent = REEFKEEPERS_CSS;
  document.head.appendChild(style);
  stylesInjected = true;
}

export function renderReefkeepersGame(ctx) {
  const { host, game } = ctx;
  if (!host) return;
  injectStyles();
  if (!ctx.started || !game) {
    host.className = "macro-board reefkeepers-table";
    renderReefkeepersLobby(host, ctx);
    return;
  }
  const key = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}`;
  if (S.key !== key) { clearTimeout(S.flashTimer); S = freshState(key); }
  S.lastCtx = ctx;
  const me = seatInfo(ctx);
  consumeEvents(key, game.events, me.myMark, game.status === "complete" ? game.winner : null);
  reconcileSelection(ctx, me);
  paint(ctx);
}

function mounted() {
  const ctx = S.lastCtx;
  if (!ctx || !ctx.host || !ctx.host.isConnected) return null;
  const root = ctx.host.querySelector(":scope > .rk-play");
  return root && root.getAttribute("data-rk-key") === S.key ? root : null;
}
function repaint() {
  if (mounted()) paint(S.lastCtx);
}

// ---------- seat info ----------
function seatInfo(ctx) {
  const roomPlayers = (ctx.room && Array.isArray(ctx.room.players)) ? ctx.room.players : [];
  const local = roomPlayers.find((p) => p.id === ctx.localPlayerId) || null;
  const myMark = local ? local.mark : null;
  const players = ctx.game.players && typeof ctx.game.players === "object" ? ctx.game.players : {};
  return { myMark, mySeat: myMark && players[myMark] ? players[myMark] : null, players, roomPlayers };
}
function nameOf(ctx, mark) {
  const p = ((ctx.room && ctx.room.players) || []).find((x) => x.mark === mark);
  if (p && p.name) return p.name;
  const seat = ctx.game.players && ctx.game.players[mark];
  return seat && seat.name ? seat.name : String(mark || "?");
}
function colorOf(ctx, mark) {
  const p = ((ctx.room && ctx.room.players) || []).find((x) => x.mark === mark);
  if (p && typeof p.color === "string" && /^#[0-9a-f]{3,8}$/i.test(p.color)) return p.color;
  const order = Array.isArray(ctx.game.seat_order) ? ctx.game.seat_order : [];
  return FALLBACK_COLORS[Math.max(0, order.indexOf(mark)) % FALLBACK_COLORS.length];
}
function personOf(ctx, me, mark) {
  const rp = me.roomPlayers.find((x) => x.mark === mark) || {};
  return { mark, name: nameOf(ctx, mark), icon: rp.icon || "", color: colorOf(ctx, mark), isMe: mark === me.myMark };
}

function setFlash(text, kind = "info") {
  S.flash = { text, kind };
  clearTimeout(S.flashTimer);
  S.flashTimer = setTimeout(() => { S.flash = null; repaint(); }, FLASH_MS);
}

// ---------- selection (keyed to the barrier) ----------
const spotsShown = (game) => !(game.options && game.options.show_spots === false);
const legalOf = (seat) => (seat && Array.isArray(seat.legal) ? seat.legal : []);
const sameSpot = (a, b) => a && b && a.x === b.x && a.y === b.y && Number(a.rot) === Number(b.rot);
const bCell = (e) => ({ x: e.x + DIR[e.rot][0], y: e.y + DIR[e.rot][1] });

function reconcileSelection(ctx, me) {
  const { game, room } = ctx;
  const selKey = `${room ? room.code : ""}:${room ? room.game_epoch : ""}:${game.round}`;
  if (selKey !== S.selKey) {
    S.selKey = selKey; S.picks = []; S.tap = null; S.rot = 0;
    return;
  }
  const ids = new Set((Array.isArray(game.offer) ? game.offer : []).map((t) => t.id));
  S.picks = S.picks.filter((id) => ids.has(id));
  if (!me.mySeat || !me.mySeat.pending) S.tap = null;
}

// Legal entries for rotation `rot` that cover the tapped cell (A half first).
function coveringEntries(legal, tap, rot) {
  const atA = legal.filter((e) => e.rot === rot && e.x === tap.x && e.y === tap.y);
  const atB = legal.filter((e) => e.rot === rot && bCell(e).x === tap.x && bCell(e).y === tap.y);
  return atA.concat(atB);
}

// The previewed placement: from the server's list when spots are shown; the
// raw tapped spot (checked only for membership in `legal`) when they are not.
function currentPreview(game, seat) {
  if (!S.tap || !seat || !seat.pending) return null;
  const legal = legalOf(seat);
  if (spotsShown(game)) {
    const hit = coveringEntries(legal, S.tap, S.rot)[0];
    return hit ? { place: { x: hit.x, y: hit.y, rot: hit.rot }, bad: false } : { place: { x: S.tap.x, y: S.tap.y, rot: S.rot }, bad: true };
  }
  const place = { x: S.tap.x, y: S.tap.y, rot: S.rot };
  return { place, bad: !legal.some((e) => sameSpot(e, place)) };
}

function canAct(game, seat) {
  return Boolean(game.status === "playing" && seat && !seat.has_committed && !seat.skipped);
}
const movePending = (ctx) => S.sending || (typeof ctx.isMovePending === "function" && ctx.isMovePending());

// ---------- intents ----------
function onCell(ctx, x, y) {
  const me = seatInfo(ctx);
  const seat = me.mySeat;
  if (!canAct(ctx.game, seat) || !seat.pending || movePending(ctx)) return;
  const legal = legalOf(seat);
  if (!legal.length) return;
  if (S.tap && S.tap.x === x && S.tap.y === y) { rotate(ctx); return; }
  if (spotsShown(ctx.game)) {
    const rots = [0, 1, 2, 3].filter((r) => coveringEntries(legal, { x, y }, r).length);
    if (!rots.length) return;
    if (!rots.includes(S.rot)) S.rot = rots[0];
  }
  S.tap = { x, y };
  playClick();
  paint(ctx);
}

function rotate(ctx) {
  const me = seatInfo(ctx);
  const seat = me.mySeat;
  if (!canAct(ctx.game, seat) || !seat.pending) return;
  if (S.tap && spotsShown(ctx.game)) {
    const legal = legalOf(seat);
    for (let i = 1; i <= 4; i += 1) {
      const r = (S.rot + i) % 4;
      if (coveringEntries(legal, S.tap, r).length) { S.rot = r; break; }
    }
  } else {
    S.rot = (S.rot + 1) % 4;
  }
  playClick();
  paint(ctx);
}

function togglePick(ctx, id) {
  if (!canAct(ctx.game, seatInfo(ctx).mySeat) || movePending(ctx)) return;
  const at = S.picks.indexOf(id);
  if (at >= 0) { S.picks.splice(at, 1); playClick(); }
  else if (S.picks.length < 3) { S.picks.push(id); playCue("pick", S.picks.length - 1); }
  else { setFlash(UI.draftHelp, "info"); }
  paint(ctx);
}

function lockState(ctx, me) {
  const { game } = ctx;
  const seat = me.mySeat;
  const offer = Array.isArray(game.offer) ? game.offer : [];
  const preview = currentPreview(game, seat);
  const mustPlace = Boolean(seat && seat.pending && legalOf(seat).length);
  let blocker = "";
  if (offer.length && !S.picks.length) blocker = UI.needPick;
  else if (mustPlace && (!preview || preview.bad)) blocker = UI.needPlace;
  return { preview, mustPlace, offer, blocker, ok: canAct(game, seat) && !blocker && !movePending(ctx) };
}

async function lockIn(ctx) {
  const me = seatInfo(ctx);
  const ls = lockState(ctx, me);
  if (!ls.ok) return;
  const place = ls.mustPlace ? { x: ls.preview.place.x, y: ls.preview.place.y, rot: ls.preview.place.rot } : null;
  const action = { type: "COMMIT", round: ctx.game.round, place, picks: ls.offer.length ? S.picks.slice(0, 3) : [] };
  S.sending = true;
  paint(ctx);
  let error;
  try { error = await ctx.makeMove(action); } catch (err) { error = (err && err.message) || String(err); }
  S.sending = false;
  if (typeof error === "string" && error) setFlash(error, "error");
  else if (place) playCue("place");
  repaint();
}

function voteSkip(ctx, target) {
  if (movePending(ctx)) return;
  playClick();
  Promise.resolve(ctx.makeMove({ type: "SKIP_PLAYER", target })).then((error) => {
    if (typeof error === "string" && error) { setFlash(error, "error"); repaint(); }
  }).catch(() => {});
}

// ---------- view model ----------
function buildViewModel(ctx, me) {
  const { game } = ctx;
  const seat = me.mySeat;
  const size = Number(game.options && game.options.size) || 5;
  const order = Array.isArray(game.seat_order) ? game.seat_order : Object.keys(me.players);
  const complete = game.status === "complete";
  const acting = canAct(game, seat);
  const ls = lockState(ctx, me);
  const legal = legalOf(seat);
  const pending = seat && seat.pending ? seat.pending : null;
  const committed = seat && seat.committed ? seat.committed : null;
  const locked = Boolean(seat && (seat.has_committed || seat.skipped));
  const hint = seat && seat.hint && game.options && game.options.hints ? seat.hint : null;

  // my reef
  let spots = null; let strong = null;
  if (acting && pending && spotsShown(game)) {
    spots = new Set(); strong = new Set();
    legal.forEach((e) => {
      const cells = [`${e.x},${e.y}`, `${bCell(e).x},${bCell(e).y}`];
      cells.forEach((k) => { spots.add(k); if (e.rot === S.rot) strong.add(k); });
    });
  }
  const myCells = seat && Array.isArray(seat.cells) ? seat.cells : [];
  const preview = acting && ls.preview ? { tile: pending, place: ls.preview.place, bad: ls.preview.bad } : null;
  const ghost = !acting && committed && committed.place && pending ? { tile: pending, place: committed.place } : null;
  const myReefSvg = reefSvg({
    cells: myCells, win: reachWindow(myCells, size), interactive: acting && Boolean(pending) && legal.length > 0,
    spots, strong, preview, ghost, hint: acting && hint && hint.place && !preview ? hint : null,
  });

  const cantFit = Boolean(pending && !legal.length && !complete);
  let toolText = "";
  if (cantFit) toolText = UI.cantFit;
  else if (!acting) toolText = locked && seat.skipped ? UI.skipped : UI.lockedIn;
  else if (preview) toolText = preview.bad ? UI.previewBad : UI.previewOk;
  else toolText = spotsShown(game) ? UI.tapToPlace : UI.tapToPlaceFree;
  if (acting && hint && hint.place && !preview && !cantFit) toolText = `${toolText} ${UI.hintLine}`;

  const scoreOf = (s) => (s && s.score && typeof s.score.total === "number" ? s.score.total : null);
  // Bots commit last, when the barrier closes — only humans hold the table up.
  const waiting = order.filter((m) => me.players[m] && !me.players[m].is_bot && !me.players[m].has_committed && !me.players[m].skipped);
  const votes = game.skip_votes || {};
  const iCanVote = Boolean(game.status === "playing" && seat && !seat.is_bot && seat.has_committed && !seat.skipped);
  const seats = order.filter((m) => me.players[m]).map((m) => {
    const p = me.players[m];
    let status = "thinking"; let statusText = UI.thinking;
    if (p.skipped) { status = "skipped"; statusText = UI.autopilot; }
    else if (p.has_committed) { status = "ready"; statusText = UI.ready; }
    else if (p.is_bot) { status = "bot"; statusText = UI.botLast; }
    const voters = Array.isArray(votes[m]) ? votes[m] : [];
    const skip = iCanVote && !p.is_bot && !p.has_committed && !p.skipped && m !== me.myMark
      ? { votes: voters.length, mine: voters.includes(me.myMark) } : null;
    return { ...personOf(ctx, me, m), status, statusText, score: scoreOf(p), skip };
  });

  const others = order.filter((m) => m !== me.myMark && me.players[m]).map((m) => {
    const p = me.players[m];
    return { ...personOf(ctx, me, m), cells: Array.isArray(p.cells) ? p.cells : [], score: scoreOf(p), scoreObj: p.score || null, discards: Number(p.discards) || 0 };
  });

  const events = Array.isArray(game.events) ? game.events : [];
  const log = events.slice().sort((a, b) => b.seq - a.seq)
    .map((e) => ({ type: e.type, mine: e.mark === me.myMark && Boolean(me.myMark), text: logLine(e, (m) => nameOf(ctx, m)) }))
    .filter((l) => l.text).slice(0, LOG_LINES);

  const results = complete && Array.isArray(game.results) ? game.results.map((r) => ({
    ...personOf(ctx, me, r.mark), total: r.total, largest: r.largest, pearls: r.pearls, rank: Number(r.rank) || 0,
    scoreObj: me.players[r.mark] ? me.players[r.mark].score : null,
  })) : [];

  let stateText;
  if (complete) stateText = UI.gameOver;
  else if (!seat) stateText = UI.spectating;
  else if (S.sending) stateText = UI.locking;
  else if (seat.skipped) stateText = UI.skipped;
  else if (locked) stateText = UI.waitingFor(waiting.map((m) => nameOf(ctx, m)));
  else stateText = ls.blocker || UI.lockIn;

  const offer = (Array.isArray(game.offer) ? game.offer : []).slice().sort((a, b) => a.n - b.n);
  return {
    round: game.round, roundsTotal: game.rounds_total, size, complete,
    finalRound: !complete && !offer.length && game.round > 1,
    firstRound: !pending && !committed && game.round === 1,
    deckCount: typeof game.deck_count === "number" && !complete ? game.deck_count : null,
    flash: S.flash, stateText, sending: S.sending,
    claimOrder: (Array.isArray(game.claim_order) ? game.claim_order : []).map((m) => personOf(ctx, me, m)),
    offer, picks: committed && Array.isArray(committed.picks) && !acting ? committed.picks : S.picks,
    draftLocked: !acting || movePending(ctx), hintPick: acting && hint ? hint.pick : null,
    mySeat: seat, myScore: scoreOf(seat), pending, rot: ghost ? Number(committed.place.rot) || 0 : (ls.preview ? ls.preview.place.rot : S.rot),
    canRotate: acting && legal.length > 0, cantFit, toolText, myReefSvg, finalDone: complete,
    locked, canLock: ls.ok, lockBlocker: acting ? ls.blocker : "",
    waitingNames: waiting.map((m) => nameOf(ctx, m)),
    seats, others, expanded: S.expanded, log, results,
  };
}

// ---------- paint + wiring ----------
function paint(ctx) {
  if (!ctx) return;
  const { host } = ctx;
  const esc = ctx.escapeHtml || ((x) => String(x));
  const me = seatInfo(ctx);
  const vm = buildViewModel(ctx, me);
  host.className = "macro-board reefkeepers-table";
  host.innerHTML = `<div class="reefkeepers-root rk-play${vm.complete ? " rk-complete" : ""}" data-rk-key="${esc(S.key)}">
      ${artDefs()}
      ${stripHtml(vm, esc)}
      ${resultsHtml(vm, esc)}
      <div class="rk-layout">
        <div class="rk-col rk-col-main">
          <div class="rk-a-reef">${reefCardHtml(vm, esc)}</div>
          <div class="rk-a-others">${othersHtml(vm, esc)}</div>
        </div>
        <div class="rk-col rk-col-side">
          <div class="rk-a-draft">${vm.complete ? "" : draftHtml(vm, esc)}</div>
          <div class="rk-a-lock">${lockBarHtml(vm, esc)}</div>
          <div class="rk-a-table">${vm.complete ? "" : tableHtml(vm, esc)}</div>
          <div class="rk-a-log">${logHtml(vm, esc)}</div>
        </div>
      </div>
    </div>`;
  wire(host.querySelector(":scope > .rk-play"));
}

function wire(root) {
  if (!root) return;
  const ctx = () => S.lastCtx;
  root.addEventListener("click", (ev) => {
    const target = ev.target instanceof Element ? ev.target : null;
    if (!target) return;
    const cell = target.closest("[data-cell]");
    if (cell) {
      const [x, y] = cell.getAttribute("data-cell").split(",").map(Number);
      onCell(ctx(), x, y);
      return;
    }
    const button = target.closest("button");
    if (!button || button.disabled) return;
    if (button.hasAttribute("data-pick")) togglePick(ctx(), button.getAttribute("data-pick"));
    else if (button.hasAttribute("data-rotate")) rotate(ctx());
    else if (button.hasAttribute("data-lock")) lockIn(ctx());
    else if (button.hasAttribute("data-skip")) voteSkip(ctx(), button.getAttribute("data-skip"));
    else if (button.hasAttribute("data-expand")) {
      const mark = button.getAttribute("data-expand");
      S.expanded = S.expanded === mark ? null : mark;
      playClick();
      paint(ctx());
    }
  });
}
