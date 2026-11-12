// Hidden Isles — in-game UI adapter. Renders the prepared server projection
// and captures intent; it computes NO rule outcomes. Which keys are visible,
// whose turn it is, guesses left, islands remaining, clue legality and the
// winner all arrive decided by the server; the client only trims the clue it
// sends and shows the server's error string when an action is refused.
//
// The shell calls renderHiddenIslesGame(ctx) on EVERY snapshot. All view
// state (selected card, clue draft, flash, log open, reveal animations, event
// cursor) lives in module state keyed by room+epoch — the card selection
// additionally by `${room.code}:${game_epoch}:${turn}` — so re-renders never
// reset it. The skeleton is kept across snapshots and each region is only
// rewritten when its HTML changes (keeps focus, the clue input and running
// animations alive). All wiring is delegated addEventListener on the root.
import { playClick } from "../../sound.js";
import { seaChart } from "./art.js";
import { gridHtml } from "./board-view.js";
import { RESULTS, TICKER, UI } from "./branding.js";
import { renderHiddenIslesLobby } from "./lobby.js";
import { botTickInFlight, syncBotTick } from "./bot-tick.js";
import { actionsHtml, bannerHtml, logHtml, resultsHtml, setupHtml, stripHtml } from "./panels.js";
import { consumeEvents } from "./sfx.js";
import { HIDDEN_ISLES_CSS } from "./styles.js";

const FALLBACK_COLORS = ["#d94141", "#2f6fd6", "#e0b100", "#2e9e5b", "#8a4fc9", "#e07a1f", "#1fa3a3", "#d0499a", "#6b7a8f", "#7a5230", "#94b814", "#3b3b3b"];
const FLASH_MS = 4500;
const ANIM_WINDOW_MS = 2600;
const CLUE_POP_MS = 700;

let stylesInjected = false;
let S = freshState("");
const offsets = new WeakMap();

function freshState(key) {
  return {
    key, selKey: "", sel: null, sending: null, flash: null, flashTimer: null, lastCtx: null,
    clueDraft: "", clueCount: null, clueUnlimited: false, ideaIdx: null, logOpen: null,
    seenRevealed: null, flipAt: {}, clueSeen: null, clueFreshAt: 0, markChain: Promise.resolve(),
    nudgeTimer: null, animTimer: null,
  };
}

function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-hi-styles", "");
  style.textContent = HIDDEN_ISLES_CSS;
  document.head.appendChild(style);
  stylesInjected = true;
}

export function renderHiddenIslesGame(ctx) {
  const { host, game } = ctx;
  if (!host) return;
  injectStyles();
  if (!ctx.started || !game) {
    host.className = "macro-board hidden-isles-table";
    renderHiddenIslesLobby(host, ctx);
    return;
  }
  const key = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}`;
  if (S.key !== key) {
    clearTimeout(S.flashTimer); clearTimeout(S.nudgeTimer); clearTimeout(S.animTimer);
    S = freshState(key);
  }
  S.lastCtx = ctx;
  if (!offsets.has(game)) {
    const sn = Number(game.server_now);
    offsets.set(game, Number.isFinite(sn) && sn > 0 ? sn - Date.now() : 0);
  }
  const me = seatInfo(ctx);
  handleSnapshot(ctx, me);
  paint(ctx);
  syncBotTick(key, game, me.myMark, {
    mounted: () => Boolean(mountedRoot()),
    busy: () => Boolean(S.sending) || (typeof ctx.isMovePending === "function" && ctx.isMovePending()),
    send: (action) => (S.lastCtx || ctx).makeMove(action),
  });
}

function mountedRoot() {
  const ctx = S.lastCtx;
  if (!ctx || !ctx.started || !ctx.host || !ctx.host.isConnected) return null;
  const root = ctx.host.querySelector(":scope > .hidden-isles-root.hi-game");
  return root && root.getAttribute("data-hi-key") === S.key ? root : null;
}

function repaint() {
  if (mountedRoot()) paint(S.lastCtx);
}

// ---------- seat + name helpers ----------
function seatInfo(ctx) {
  const { game, room } = ctx;
  const roomPlayers = (room && Array.isArray(room.players)) ? room.players : [];
  const local = roomPlayers.find((p) => p.id === ctx.localPlayerId) || null;
  const seats = Array.isArray(game.players) ? game.players : [];
  const you = game.you && game.you.mark ? game.you : null;
  const myMark = you ? you.mark : (local ? local.mark : null);
  const mySeat = seats.find((p) => p.mark === myMark) || null;
  return {
    myMark, mySeat, seats, roomPlayers,
    myTeam: you ? you.team : (mySeat ? mySeat.team : null),
    myRole: you ? you.role : (mySeat ? mySeat.role : null),
    human: Boolean(mySeat && !mySeat.is_bot),
  };
}

function roomPlayer(ctx, mark) {
  return ((ctx.room && ctx.room.players) || []).find((x) => x.mark === mark) || null;
}
function nameOf(ctx, mark) {
  const p = roomPlayer(ctx, mark);
  return p && p.name ? String(p.name) : String(mark || "?");
}
function iconOf(ctx, mark) {
  const p = roomPlayer(ctx, mark);
  return p && p.icon ? String(p.icon) : "🙂";
}
function colorOf(ctx, mark) {
  const p = roomPlayer(ctx, mark);
  if (p && typeof p.color === "string" && /^#[0-9a-f]{3,8}$/i.test(p.color)) return p.color;
  const seats = Array.isArray(ctx.game.players) ? ctx.game.players : [];
  const i = Math.max(0, seats.findIndex((s) => s.mark === mark));
  return FALLBACK_COLORS[i % FALLBACK_COLORS.length];
}

function setFlash(text, kind = "error") {
  S.flash = { text: String(text), kind };
  clearTimeout(S.flashTimer);
  S.flashTimer = setTimeout(() => { S.flash = null; repaint(); }, FLASH_MS);
}

const serverNow = (game) => Date.now() + (offsets.get(game) || 0);

// ---------- per-snapshot bookkeeping: sounds, flips, selection ----------
function handleSnapshot(ctx, me) {
  const { game, room } = ctx;
  consumeEvents(S.key, game.events, { mark: me.myMark, team: me.myTeam });
  const board = Array.isArray(game.board) ? game.board : [];
  const revealed = new Set(board.map((c, i) => (c.revealed ? i : -1)).filter((i) => i >= 0));
  if (S.seenRevealed) {
    revealed.forEach((i) => { if (!S.seenRevealed.has(i)) S.flipAt[i] = Date.now(); });
  }
  S.seenRevealed = revealed;
  const clueSig = game.clue ? `${game.clue.turn}|${game.clue.word}` : "";
  if (S.clueSeen !== null && clueSig && clueSig !== S.clueSeen) S.clueFreshAt = Date.now();
  S.clueSeen = clueSig;
  const selKey = `${room ? room.code : ""}:${room ? room.game_epoch : ""}:${game.turn}`;
  if (selKey !== S.selKey) { S.selKey = selKey; S.sel = null; S.ideaIdx = null; }
  if (S.sel !== null && (!board[S.sel] || board[S.sel].revealed)) S.sel = null;
  if (game.status === "complete") { S.sel = null; if (S.logOpen === null) S.logOpen = true; }
}

// ---------- view model ----------
function buildViewModel(ctx) {
  const { game } = ctx;
  const esc = ctx.escapeHtml || ((s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
  const me = seatInfo(ctx);
  const playing = game.status === "playing";
  const complete = game.status === "complete";
  const turnTeam = game.turn_team || null;
  const myTurn = playing && me.human && me.myTeam && me.myTeam === turnTeam;
  const canGuess = Boolean(myTurn && game.phase === "guess" && me.myRole === "guesser");
  const canClue = Boolean(myTurn && game.phase === "clue" && me.myRole === "guide");
  const now = Date.now();
  const flips = {};
  Object.entries(S.flipAt).forEach(([i, t]) => { if (now - t < ANIM_WINDOW_MS) flips[i] = now - t; });
  const latest = (Array.isArray(game.events) ? game.events : []).reduce((b, e) => (!b || e.seq > b.seq ? e : b), null);
  const ideas = Array.isArray(game.clue_ideas) ? game.clue_ideas : [];
  const idea = S.ideaIdx !== null ? ideas[S.ideaIdx] : null;
  const vm = {
    game, esc, complete, playing, turnTeam,
    board: Array.isArray(game.board) ? game.board : [],
    marks: game.marks || {},
    remaining: { A: Number(game.remaining && game.remaining.A) || 0, B: Number(game.remaining && game.remaining.B) || 0 },
    winnerTeam: game.winner_team || null,
    seats: me.seats, myMark: me.myMark, myTeam: me.myTeam, myRole: me.myRole,
    isSpectator: !me.human,
    canSetup: Boolean(playing && game.phase === "setup" && me.human && !S.sending),
    canGuess, canClue,
    canPass: Boolean(canGuess && Number(game.guesses_made) > 0 && !S.sending),
    canGiveClue: Boolean(canClue && !S.sending && S.clueDraft.trim() && (S.clueUnlimited || S.clueCount !== null)),
    canNudge: nudgeAllowed(game, me),
    selected: S.sel, sending: S.sending, flash: S.flash,
    ticker: tickerText(ctx, latest),
    flips, ideaIdx: S.ideaIdx, ideaTargets: idea && Array.isArray(idea.targets) ? idea.targets : null,
    clueCount: S.clueCount, clueUnlimited: S.clueUnlimited,
    clueFresh: now - S.clueFreshAt < CLUE_POP_MS,
    nameOf: (m) => nameOf(ctx, m), iconOf: (m) => iconOf(ctx, m), colorOf: (m) => colorOf(ctx, m),
  };
  return vm;
}

// Away-player rescue: offered to seated humans who are NOT the ones the
// table is waiting on, once the phase has been open past nudge_after_ms.
// (The server decides whether a nudge is valid; this only gates the button.)
function nudgeAllowed(game, me) {
  if (game.status !== "playing" || !me.human || (game.phase !== "clue" && game.phase !== "guess")) return false;
  const team = game.turn_team;
  const actors = me.seats.filter((p) => p.team === team && (game.phase === "clue" ? p.role === "guide" : p.role === "guesser"));
  const humans = actors.filter((p) => !p.is_bot);
  if (!humans.length || humans.some((p) => p.mark === me.myMark)) return false;
  const after = Number(game.nudge_after_ms);
  const started = Number(game.phase_started_at);
  if (!Number.isFinite(after) || !Number.isFinite(started) || after <= 0 || started <= 0) return false;
  return serverNow(game) >= started + after;
}

function scheduleNudgeRepaint(game) {
  clearTimeout(S.nudgeTimer);
  const due = Number(game.phase_started_at) + Number(game.nudge_after_ms);
  if (game.status !== "playing" || !Number.isFinite(due)) return;
  const wait = due - serverNow(game);
  if (wait > 0 && wait < 3600e3) S.nudgeTimer = setTimeout(repaint, wait + 50);
}

function tickerText(ctx, e) {
  if (!e) return "";
  const team = e.team;
  switch (e.type) {
    case "deal": return TICKER.deal(e.start_team || team);
    case "clue": return TICKER.clue(team, String(e.word || "").toUpperCase(), e.unlimited ? UI.unlimited : e.count);
    case "reveal": return TICKER.reveal(nameOf(ctx, e.by), String(e.word || "").toUpperCase(), e.key);
    case "turn": return TICKER.turn(team, e.reason);
    case "win": return TICKER.win(team, e.reason);
    default: return "";
  }
}

// ---------- DOM ----------
function setHtml(el, html) {
  if (!el || el.__hiHtml === html) return false;
  const active = typeof document !== "undefined" ? document.activeElement : null;
  const focusKey = active && el.contains(active) ? active.getAttribute("data-hi-focus") : null;
  const selStart = focusKey === "clue" ? active.selectionStart : null;
  el.innerHTML = html;
  el.__hiHtml = html;
  if (focusKey) {
    const next = el.querySelector(`[data-hi-focus="${focusKey}"]`);
    if (next && !next.disabled) {
      try { next.focus({ preventScroll: true }); } catch { /* old browsers */ }
      if (selStart !== null && typeof next.setSelectionRange === "function") next.setSelectionRange(selStart, selStart);
    }
  }
  return true;
}

function ensureSkeleton(host, mode) {
  let root = host.querySelector(":scope > .hidden-isles-root.hi-game");
  if (root && root.getAttribute("data-hi-key") === S.key && root.getAttribute("data-hi-mode") === mode) return root;
  host.className = "macro-board hidden-isles-table";
  host.innerHTML = mode === "setup"
    ? `<div class="hidden-isles-root hi-game hi-setup"><div class="hi-setup-body"></div></div>`
    : `<div class="hidden-isles-root hi-game hi-play">
        <div class="hi-results hi-panel" hidden></div>
        <div class="hi-strip hi-panel" aria-live="polite"></div>
        <div class="hi-banner hi-panel"></div>
        <h3 class="hi-section-title hi-chart-title" hidden></h3>
        <div class="hi-sea"><div class="hi-sea-bg">${seaChart()}</div><div class="hi-grid"></div></div>
        <div class="hi-actions hi-panel"></div>
        <div class="hi-log-wrap"></div>
      </div>`;
  root = host.querySelector(".hidden-isles-root.hi-game");
  root.setAttribute("data-hi-key", S.key);
  root.setAttribute("data-hi-mode", mode);
  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("keydown", onKeyDown);
  root.addEventListener("toggle", (e) => { if (e.target.matches && e.target.matches("[data-hi-log]")) S.logOpen = e.target.open; }, true);
  return root;
}

function paint(ctx) {
  if (!ctx || !ctx.host || !ctx.game) return;
  const { game } = ctx;
  const vm = buildViewModel(ctx);
  if (game.phase === "setup" && game.status === "playing") {
    const root = ensureSkeleton(ctx.host, "setup");
    setHtml(root.querySelector(".hi-setup-body"), setupHtml(vm));
    return;
  }
  const root = ensureSkeleton(ctx.host, "play");
  const complete = vm.complete;
  const results = root.querySelector(".hi-results");
  results.hidden = !complete;
  setHtml(results, complete ? resultsHtml(vm) : "");
  setHtml(root.querySelector(".hi-strip"), stripHtml(vm));
  const banner = root.querySelector(".hi-banner");
  banner.hidden = complete;
  banner.className = `hi-banner hi-panel${vm.turnTeam ? ` hi-team-${vm.turnTeam}` : ""}${vm.clueFresh ? " hi-banner-fresh" : ""}`;
  setHtml(banner, complete ? "" : bannerHtml(vm));
  const chartTitle = root.querySelector(".hi-chart-title");
  chartTitle.hidden = !complete;
  chartTitle.textContent = RESULTS.chart;
  setHtml(root.querySelector(".hi-grid"), gridHtml(vm));
  const actions = root.querySelector(".hi-actions");
  actions.hidden = complete;
  if (setHtml(actions, complete ? "" : actionsHtml(vm))) syncClueInput(actions);
  setHtml(root.querySelector(".hi-log-wrap"), logHtml(vm, S.logOpen === true));
  scheduleNudgeRepaint(game);
  // One repaint once running reveal animations are over, so a later rebuild
  // never replays them.
  clearTimeout(S.animTimer);
  const pending = Object.values(vm.flips).length || vm.clueFresh;
  if (pending) S.animTimer = setTimeout(repaint, ANIM_WINDOW_MS);
}

function syncClueInput(scope) {
  const input = scope.querySelector(".hi-clue-input");
  if (input && input.value !== S.clueDraft) input.value = S.clueDraft;
}

// ---------- intents ----------
function liveCtx() {
  return S.lastCtx;
}

async function send(kind, action) {
  const ctx = liveCtx();
  if (!ctx || S.sending) return "busy";
  S.sending = kind;
  repaint();
  let error;
  try {
    const tick = botTickInFlight();
    if (tick) await tick;
    if (kind === "guess") await S.markChain;
    error = await ctx.makeMove(action);
  } catch (err) {
    error = err && err.message ? err.message : "Something went wrong.";
  }
  S.sending = null;
  if (typeof error === "string" && error) setFlash(error, "error");
  repaint();
  return error;
}

function sendMark(index) {
  const ctx = liveCtx();
  if (!ctx) return;
  const action = { type: "MARK", turn: ctx.game.turn, index };
  S.markChain = S.markChain.then(() => Promise.resolve(ctx.makeMove(action)).then((error) => {
    if (typeof error === "string" && error && !/^Not sent/i.test(error)) { setFlash(error, "error"); repaint(); }
  }).catch(() => {}));
}

function onCard(index) {
  const ctx = liveCtx();
  if (!ctx) return;
  const vm = buildViewModel(ctx);
  if (!vm.canGuess || S.sending) return;
  const card = vm.board[index];
  if (!card || card.revealed) return;
  if (S.sel === index) { guess(index); return; }
  S.sel = index;
  playClick();
  repaint();
  const options = ctx.game.options || {};
  const mine = Array.isArray(vm.marks[index]) && vm.marks[index].includes(vm.myMark);
  if (options.team_marks && !mine) sendMark(index);
}

async function guess(index) {
  const ctx = liveCtx();
  if (!ctx || index === null || index === undefined) return;
  const error = await send("guess", { type: "GUESS", turn: ctx.game.turn, index });
  if (!error) S.sel = null;
  repaint();
}

async function giveClue() {
  const ctx = liveCtx();
  if (!ctx) return;
  const vm = buildViewModel(ctx);
  if (!vm.canGiveClue) return;
  const word = S.clueDraft.trim();
  const unlimited = S.clueUnlimited;
  const count = unlimited ? 0 : S.clueCount;
  const error = await send("clue", { type: "CLUE", turn: ctx.game.turn, word, count, unlimited });
  if (!error) { S.clueDraft = ""; S.clueCount = null; S.clueUnlimited = false; S.ideaIdx = null; repaint(); }
}

function onClick(e) {
  const target = e.target.closest ? e.target.closest("button, summary") : null;
  if (!target || target.disabled) return;
  const ctx = liveCtx();
  if (!ctx) return;
  const turn = ctx.game.turn;
  if (target.hasAttribute("data-hi-card")) { onCard(Number(target.getAttribute("data-hi-card"))); return; }
  if (target.hasAttribute("data-hi-num")) {
    const v = target.getAttribute("data-hi-num");
    S.clueUnlimited = v === "inf";
    S.clueCount = v === "inf" ? null : Number(v);
    playClick();
    repaint();
    return;
  }
  if (target.hasAttribute("data-hi-idea")) {
    const i = Number(target.getAttribute("data-hi-idea"));
    const idea = Array.isArray(ctx.game.clue_ideas) ? ctx.game.clue_ideas[i] : null;
    if (!idea) return;
    S.ideaIdx = i;
    S.clueDraft = String(idea.word || "");
    S.clueUnlimited = false;
    S.clueCount = Number(idea.count) || 0;
    playClick();
    const actions = mountedRoot() && mountedRoot().querySelector(".hi-actions");
    repaint();
    if (actions) syncClueInput(actions);
    return;
  }
  const act = target.getAttribute("data-hi-act");
  if (!act) return;
  playClick();
  switch (act) {
    case "join": send("join", { type: "JOIN_TEAM", team: target.getAttribute("data-hi-team") }); break;
    case "guide": send("guide", { type: "BE_GUIDE" }); break;
    case "shuffle": send("shuffle", { type: "SHUFFLE_TEAMS" }); break;
    case "deal": send("deal", { type: "DEAL" }); break;
    case "guess": guess(S.sel); break;
    case "pass": send("pass", { type: "PASS", turn }); break;
    case "clue": giveClue(); break;
    case "nudge": send("nudge", { type: "NUDGE", turn }); break;
    default: break;
  }
}

// Typing never repaints the whole action area (that would blink the phone
// keyboard): update the draft, flip the Give button in place, and refresh
// the region's HTML cache so the next snapshot doesn't rebuild needlessly.
function onInput(e) {
  if (!e.target.classList || !e.target.classList.contains("hi-clue-input")) return;
  S.clueDraft = e.target.value;
  S.ideaIdx = null;
  const ctx = liveCtx();
  const root = mountedRoot();
  if (!ctx || !root) return;
  const vm = buildViewModel(ctx);
  const give = root.querySelector('[data-hi-act="clue"]');
  if (give) give.disabled = !vm.canGiveClue;
  root.querySelectorAll(".hi-idea-chip.hi-on").forEach((chip) => chip.classList.remove("hi-on"));
  root.querySelectorAll(".hi-card.hi-idea").forEach((card) => card.classList.remove("hi-idea"));
  const actions = root.querySelector(".hi-actions");
  if (actions) actions.__hiHtml = actionsHtml(vm);
  const grid = root.querySelector(".hi-grid");
  if (grid) grid.__hiHtml = gridHtml(vm);
}

function onKeyDown(e) {
  if (e.key === "Enter" && e.target.classList && e.target.classList.contains("hi-clue-input")) {
    e.preventDefault();
    giveClue();
  }
}
