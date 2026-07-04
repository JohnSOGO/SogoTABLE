// Mazewright client module — the offline AI/ controller, repackaged against the
// SogoTable shell ctx bag. Build editing and the fog crawl run locally (the
// shared core); only the barrier events cross to the server:
//   SUBMIT_MAZE  — commit the built maze code (build barrier)
//   POST_RESULT  — commit a finished maze's {moves, loot} (run progress)
// The leaderboard + the three prizes come from the server projection (ctx.game).
import {
  PHASE, MAX_WALLS, MIN_WALLS, createGame, edgeKey, mazeCode,
  interiorEdges, perimeterEdges, isExit, wallCount, canAddWall, canSubmit,
  allLootReachable, pathExists, applyAction, loadRunFromCode,
} from "./rules.js";
import { renderHostStartLobby } from "../lobby.js";
import { playClick, playConfirm, playCancel, playInvalidMove, playScorePick, playWin } from "../../sound.js";
import { MW_CSS } from "./styles.js";

const PAD = 26, VIEW = 420;
const SVG_DEFS =
  '<defs><pattern id="mwbrick" width="14" height="8" patternUnits="userSpaceOnUse">' +
  '<rect width="14" height="8" fill="#4a1d14"/>' +
  '<rect x="0.6" y="0.6" width="5.7" height="2.8" rx="0.6" fill="#b85436"/>' +
  '<rect x="7" y="0.6" width="6.4" height="2.8" rx="0.6" fill="#b85436"/>' +
  '<rect x="-3" y="4.6" width="5.7" height="2.8" rx="0.6" fill="#9c4029"/>' +
  '<rect x="3.7" y="4.6" width="5.7" height="2.8" rx="0.6" fill="#9c4029"/>' +
  '<rect x="10.4" y="4.6" width="5.7" height="2.8" rx="0.6" fill="#9c4029"/>' +
  '</pattern>' +
  '<linearGradient id="mwgold" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="#f7e08e"/><stop offset="0.5" stop-color="#e3b94e"/>' +
  '<stop offset="1" stop-color="#a9791f"/></linearGradient></defs>';

let ctx = null;
let styled = false;
let keyBound = false;
let buildState = null;
let buildKey = "";      // room:epoch — rebuild buildState on a new game
let buildMode = "walls"; // walls | start | loot | exit — explicit edit mode
let selectedItem = null; // loot index picked up in Loot mode (tap-to-place)
let scoreView = "raw";   // raw | rank | weighted — tappable score-table lens
let runState = null;
let runLoaded = -1;     // deck index runState is built for
let dragging = false;
let posting = false;    // guard against double POST_RESULT
let submittedCode = ""; // the mazeCode actually sent — a rejoin must not pass a blank draft off as the locked maze
let wonSound = false;   // play the win fanfare once per game

const root = () => ctx.host.querySelector(".mazewright-root");
const q = (sel) => { const r = root(); return r ? r.querySelector(sel) : null; };

export function renderMazewrightGame(controllerCtx) {
  ctx = controllerCtx;
  injectStyles();
  if (!ctx.started) { showLobby(); return; }   // shared host-start lobby (overwrites host)
  ensureScaffold();
  const game = ctx.game || {};
  const myMark = localMark();

  const status = game.status;
  if (status === "running") renderRunPhase(game, myMark);
  else if (status === "complete") renderComplete(game, myMark);
  else renderBuildPhase(game, myMark);   // "waiting" / "building"
  renderLeaderboard(game, myMark);
}

function localMark() {
  const seat = (ctx.room && ctx.room.players || []).find((p) => p.id === ctx.localPlayerId);
  return seat ? seat.mark : null;
}
function seatProfile(mark) {
  return (ctx.room && ctx.room.players || []).find((p) => p.mark === mark) || {};
}
function serverSeat(game, mark) {
  return (game.players || []).find((p) => p.mark === mark) || null;
}

// ---------- scaffold + styles ----------
function ensureScaffold() {
  if (ctx.host.querySelector(".mw-board")) return;   // game scaffold present (not the lobby)
  ctx.host.innerHTML =
    '<div class="mazewright-root">' +
    '<div class="mw-hud mw-panel"><div class="mw-hudrow"><div class="mw-turn"><span class="mw-dot"></span>' +
    '<span class="mw-turnname"></span></div><span class="mw-tag"></span><span class="mw-caret">▾</span></div>' +
    '<div class="mw-sub"></div><div class="mw-meters"></div></div>' +
    '<div class="mw-inventory mw-panel"></div>' +
    '<div class="mw-modes"><button class="mw-mode" data-mode="walls">🧱 Walls</button>' +
    '<button class="mw-mode" data-mode="start">⛳ Start</button>' +
    '<button class="mw-mode" data-mode="loot">💎 Loot</button>' +
    '<button class="mw-mode" data-mode="exit">🏛️ Exit</button></div>' +
    '<div class="mw-board"></div>' +
    '<div class="mw-dpad"><button class="mw-dbtn n" data-dir="N" aria-label="Move up">▲</button>' +
    '<button class="mw-dbtn w" data-dir="W" aria-label="Move left">◀</button>' +
    '<button class="mw-dbtn e" data-dir="E" aria-label="Move right">▶</button>' +
    '<button class="mw-dbtn s" data-dir="S" aria-label="Move down">▼</button></div>' +
    '<div class="mw-controls"><button class="mw-auto">🎲 Auto map</button>' +
    '<button class="mw-reset">↺ Reset</button><button class="mw-go">Submit my maze</button></div>' +
    '<details class="mw-advanced mw-panel"><summary>⚙️ Advanced · share or paste a maze code</summary>' +
    '<div class="mw-codebar"><span class="mw-codelabel">🔑 Maze code</span>' +
    '<input class="mw-codeinput" spellcheck="false" autocomplete="off" />' +
    '<button class="mw-codeload">Load</button></div></details>' +
    '<div class="mw-done mw-panel"></div>' +
    '<div class="mw-table mw-panel"></div></div>';
  q(".mw-auto").addEventListener("click", () => commitBuild({ type: "AUTO_BUILD" }));
  q(".mw-reset").addEventListener("click", () => commitBuild({ type: "RESET_BUILD" }));
  q(".mw-go").addEventListener("click", submitMaze);
  q(".mw-codeload").addEventListener("click", () => commitBuild({ type: "LOAD_CODE", code: q(".mw-codeinput").value }));
  q(".mw-codeinput").addEventListener("keydown", (e) => { if (e.key === "Enter") commitBuild({ type: "LOAD_CODE", code: e.target.value }); });
  // pointerdown, not click: rapid taps fire every press immediately. The browser's
  // double-tap detection swallows fast consecutive `click`s (moves once then stalls);
  // pointerdown/touchstart aren't debounced that way. No click listener → no double-move.
  q(".mw-dpad").addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".mw-dbtn");
    if (!btn) return;
    e.preventDefault();   // act on press, suppress the lagged synthetic click
    if (runState && runState.phase === PHASE.CRAWL) commitRun({ type: "MOVE", dir: btn.dataset.dir });
  });
  q(".mw-hud").addEventListener("click", () => { const h = q(".mw-hud"); if (h) h.classList.toggle("collapsed"); });
  q(".mw-table").addEventListener("click", () => {
    scoreView = scoreView === "raw" ? "rank" : scoreView === "rank" ? "weighted" : "raw";
    renderLeaderboard(ctx.game || {}, localMark());
  });
  q(".mw-modes").addEventListener("click", (e) => {
    const btn = e.target.closest(".mw-mode");
    if (!btn) return;
    buildMode = btn.dataset.mode;
    selectedItem = null;   // dropping a held gem doesn't carry across modes
    playClick();
    renderBuildPhase(ctx.game || {}, localMark());
  });
  bindSwipe();
  if (!keyBound) {
    keyBound = true;
    window.addEventListener("keydown", (e) => {
      if (!runState || runState.phase !== PHASE.CRAWL || !root()) return;
      const dir = { ArrowUp: "N", ArrowDown: "S", ArrowLeft: "W", ArrowRight: "E", w: "N", s: "S", a: "W", d: "E" }[e.key];
      if (!dir) return;
      e.preventDefault();
      commitRun({ type: "MOVE", dir });
    });
  }
}

function injectStyles() {
  if (styled || document.getElementById("mazewright-styles")) { styled = true; return; }
  styled = true;
  const css = document.createElement("style");
  css.id = "mazewright-styles";
  css.textContent = MW_CSS;
  document.head.appendChild(css);
}

// ---------- lobby (room not started) — the shared host-start invite screen ----------
function showLobby() {
  renderHostStartLobby(ctx.host, ctx, {
    wrap: "mazewright-root",   // so the #macroBoard grid-neutralizer CSS applies
    heading: "Players",
    blurb: "Everyone builds their own dungeon, then races every player's maze blind. Invite players or bots, then start.",
  });
}

// ---------- build phase ----------
function renderBuildPhase(game, myMark) {
  const seat = serverSeat(game, myMark);
  const submitted = seat && seat.built;
  show(".mw-board"); setDpad(false);
  q(".mw-hud").style.display = "";   // restored after a complete screen (rematch)
  hide(".mw-inventory"); hide(".mw-done");

  const rk = `${ctx.room.code}:${ctx.room.game_epoch || 0}`;
  if (rk !== buildKey) { buildKey = rk; wonSound = false; selectedItem = null; submittedCode = ""; buildState = createGame({ seats: [{ name: "You", color: seatProfile(myMark).color, emoji: seatProfile(myMark).icon }] }); }
  runState = null; runLoaded = -1;

  const me = seatProfile(myMark);
  setDot(me.color || "#7c6cff");
  setText(".mw-turnname", `${me.icon || "🧙"} your dungeon`);
  tag("Build", "build");

  if (submitted) {
    setText(".mw-sub", seat.skipped
      ? "You were skipped at the barrier — an auto-maze plays for you this game."
      : "Locked in — waiting for the others…");
    q(".mw-controls").style.display = "none";
    hide(".mw-advanced"); hide(".mw-modes");
    if (submittedCode && mazeCode(buildState) === submittedCode) {
      renderBoardInto(buildState, "build", { readOnly: true });
    } else {
      // Rejoined after submitting: the local draft is a blank default, not the
      // locked maze (the projection hides mazes until the runs) — tell the truth
      // instead of rendering a fake empty board as "your" dungeon.
      q(".mw-board").innerHTML = '<div class="mw-lockednote">🔒 Your maze is locked in.<br>It stays hidden until the runs begin.</div>';
    }
    renderSkipRow(game, "building", "an auto-maze fills their seat");
    return;
  }
  const modes = q(".mw-modes"); modes.style.display = "flex";
  modes.querySelectorAll(".mw-mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === buildMode));
  const hints = {
    walls: "Tap between two cells to add/remove a wall.",
    start: "Tap a cell to set your start.",
    loot: selectedItem != null ? "Tap a cell to drop the 💎 (tap again to cancel)." : "Tap a 💎, then a cell to hide it.",
    exit: "Tap a border edge to set the exit.",
  };
  setText(".mw-sub", hints[buildMode]);
  q(".mw-controls").style.display = "flex";
  q(".mw-controls").innerHTML = '<button class="mw-auto">🎲 Auto map</button><button class="mw-reset">↺ Reset</button>' +
    '<button class="mw-go" ' + (canSubmit(buildState) ? "" : "disabled") + '>Submit my maze</button>';
  q(".mw-auto").addEventListener("click", () => commitBuild({ type: "AUTO_BUILD" }));
  q(".mw-reset").addEventListener("click", () => commitBuild({ type: "RESET_BUILD" }));
  q(".mw-go").addEventListener("click", submitMaze);
  const walls = wallCount(buildState);
  const lootOk = allLootReachable(buildState);
  const meters = `<span class="mw-meter ${walls >= MIN_WALLS ? "ok" : ""}">Walls <b>${walls}</b> / ${MAX_WALLS} · min ${MIN_WALLS}</span>` +
    `<span class="mw-meter ${buildState.exit ? "ok" : ""}">Exit ${buildState.exit ? "set 🏛️" : "not set"}</span>` +
    `<span class="mw-meter ${lootOk ? "ok" : ""}">Treasure ${lootOk ? "reachable 💎" : "blocked"}</span>`;
  q(".mw-meters").innerHTML = meters;
  show(".mw-advanced");
  const input = q(".mw-codeinput");
  if (document.activeElement !== input) input.value = mazeCode(buildState);
  renderBoardInto(buildState, "build", {});
}

function selectItem(i) {
  selectedItem = i;
  playClick();
  renderBuildPhase(ctx.game || {}, localMark());
}

function commitBuild(action) {
  try { applyAction(buildState, action); } catch (e) { playCancel(); flash(e.message.replace(/^MW:\s*/, "")); return; }
  playClick();
  renderBuildPhase(ctx.game || {}, localMark());
  // Re-run validation after EVERY edit (walls, start, loot, paste): a dragged loot
  // or moved start can strand treasure the wall guard never saw. Flag it loudly.
  if (!allLootReachable(buildState)) { playCancel(); flash("A treasure is walled off — clear a path."); }
  else if (buildState.exit && !pathExists(buildState, buildState.start, buildState.exit.cell)) { playCancel(); flash("Your start can't reach the exit."); }
}

function submitMaze() {
  if (!buildState || !canSubmit(buildState)) {
    playCancel();
    flash(`Need ${MIN_WALLS}+ walls, a reachable exit & treasure.`);
    return;
  }
  playConfirm();
  submittedCode = mazeCode(buildState);
  ctx.makeMove({ type: "SUBMIT_MAZE", code: submittedCode });
}

// Barrier escape hatch UI — intent capture only: one tap = one vote (tap
// again to retract). The proposal state is the server-projected skip_votes —
// every phone shows the same highlighted buttons and vote counts; the skip
// executes server-side only when ALL done players have voted (skip-vote.js).
function renderSkipRow(game, phase, consequence) {
  const stuck = (game.players || []).filter((s) => !s.is_bot && (phase === "building" ? !s.built : !s.run_done));
  if (!stuck.length) { hide(".mw-done"); return; }
  const votes = game.skip_votes || {};
  const needed = (game.players || []).filter((s) => !s.is_bot && (phase === "building" ? s.built : s.run_done)).length;
  const done = q(".mw-done"); show(".mw-done");
  done.innerHTML = `<div class="mw-help">Waiting on a player who dropped? Vote to skip them — ALL done players must agree — ${consequence}.</div>` +
    `<div class="mw-skiprow">` + stuck.map((s) => {
      const cast = Array.isArray(votes[s.mark]) ? votes[s.mark].length : 0;
      const name = seatProfile(s.mark).name || s.name || s.mark;
      return `<button class="mw-skip${cast ? " armed" : ""}" data-mark="${s.mark}">⏭ Skip ${name}${cast ? ` (${cast}/${needed})` : ""}</button>`;
    }).join("") + `</div>`;
  done.querySelectorAll(".mw-skip").forEach((b) => b.addEventListener("click", () =>
    ctx.makeMove({ type: "SKIP_PLAYER", target: b.dataset.mark })));
}

// ---------- run phase ----------
function renderRunPhase(game, myMark) {
  const seat = serverSeat(game, myMark);
  const deck = game.deck || [];
  show(".mw-board"); show(".mw-inventory");
  q(".mw-controls").style.display = "none";
  q(".mw-hud").style.display = "";   // restored after a complete screen (rematch)
  hide(".mw-advanced"); hide(".mw-modes");
  q(".mw-meters").innerHTML = "";   // drop the build meters once we're crawling

  if (!seat || seat.run_done) {
    setText(".mw-turnname", "🏁 all mazes run"); tag("Done", "crawl");
    setText(".mw-sub", seat && seat.skipped
      ? "You were skipped — simulated runs were posted for you."
      : "All mazes done — waiting for the others…");
    hide(".mw-done"); hide(".mw-inventory"); setDpad(false);
    q(".mw-board").innerHTML = "";
    if (seat) renderSkipRow(game, "running", "simulated runs fill their results");
    return;
  }
  const idx = Math.min(seat.run_index, deck.length - 1);
  if (runLoaded !== idx || !runState) {
    runState = createGame({ seats: [{ name: "You", color: seatProfile(myMark).color, emoji: seatProfile(myMark).icon }] });
    loadRunFromCode(runState, deck[idx].code, deck[idx].transform);
    runLoaded = idx;
    posting = false;
  }
  renderRunView(game, myMark, idx, deck);
}

function renderRunView(game, myMark, idx, deck) {
  const me = seatProfile(myMark);
  setDot(me.color || "#7c6cff");
  const author = seatProfile(deck[idx].author);
  const mine = deck[idx].author === myMark;
  setText(".mw-turnname", `Maze ${idx + 1}/${deck.length} · ${author.icon || "🧙"} ${author.name || "?"}${mine ? " (yours)" : ""}`);
  renderInventory();

  if (runState.phase === PHASE.MAZE_DONE) {
    setDpad(false);
    tag("Revealed", "crawl");
    setText(".mw-sub", "Maze revealed — continue below.");
    renderBoardInto(runState, "reveal", {});
    const last = idx + 1 >= deck.length;
    const done = q(".mw-done"); show(".mw-done");
    done.innerHTML = `<div style="font-weight:700;">Maze ${idx + 1}/${deck.length} cleared — ` +
      `${author.icon || "🧙"} ${author.name || "?"}${mine ? '<span class="mw-mine"> · your maze!</span>' : "'s maze"}</div>` +
      `<div class="mw-help" style="margin-top:4px;">Escaped in <b>${runState.moves}</b> moves · 💎${runState.inventory.length}</div>` +
      `<button class="mw-next mw-go-btn" style="margin-top:12px;">${last ? "Post final result →" : "Next maze →"}</button>`;
    done.querySelector(".mw-next").addEventListener("click", postRunResult);
    return;
  }
  hide(".mw-done"); setDpad(true);
  tag("Crawl", "crawl");
  setText(".mw-sub", isTouchDevice()
    ? "Swipe the maze to move · walls reveal on a bump."
    : "Arrow keys to move · walls reveal on a bump.");
  renderBoardInto(runState, "crawl", {});
}

function commitRun(action) {
  const before = runState.inventory.length;
  const posBefore = runState.pos.join(",");
  const moveBefore = runState.moves;
  try { applyAction(runState, action); } catch (e) { return; }
  const gained = runState.inventory.slice(before);
  if (runState.phase === PHASE.MAZE_DONE) playConfirm();       // escaped through the arch
  else if (gained.length) playScorePick();                     // found loot
  else if (runState.pos.join(",") !== posBefore) playClick();  // stepped
  else if (runState.moves > moveBefore) playInvalidMove();      // bumped a wall/border
  renderRunView(ctx.game || {}, localMark(), runLoaded, (ctx.game && ctx.game.deck) || []);
  if (gained.length && runState.phase === PHASE.CRAWL) animateCollect(gained);
}

function postRunResult() {
  if (posting) return;
  posting = true;
  const loot = runState.inventory.length;
  const index = runLoaded;   // stamp which deck slot this result is for — the server rejects a mismatch (duplicate/lagging tab)
  runLoaded = -1;   // force-load the next maze when the server confirms
  ctx.makeMove({ type: "POST_RESULT", index, moves: runState.moves, loot });
}

// ---------- complete (champion + standings) ----------
function renderComplete(game, myMark) {
  hide(".mw-board"); hide(".mw-inventory"); hide(".mw-advanced"); hide(".mw-modes"); setDpad(false); q(".mw-controls").style.display = "none";
  q(".mw-hud").style.display = "none";   // the champion hero replaces the HUD strip here
  if (!wonSound) { wonSound = true; playWin(); }
  const prizes = game.prizes || {};
  const winner = game.winner;
  const seatOf = (mark) => serverSeat(game, mark) || {};
  const prof = (mark) => seatProfile(mark);
  const youtag = (mark) => (mark === myMark ? ' <span class="mw-youtag">you</span>' : "");
  // which medals a player holds (used for the champion why-line)
  const medalNames = (mark) => [
    prizes.mazewright === mark ? "🧱 Mazewright" : null,
    prizes.mazerunner === mark ? "🏃 Mazerunner" : null,
    prizes.treasureHunter === mark ? "💎 Treasure Hunter" : null,
  ].filter(Boolean);

  const done = q(".mw-done"); show(".mw-done");
  let html = "";
  if (winner) {
    const wp = prof(winner);
    const won = medalNames(winner);
    const why = won.length ? `Won ${won.join(" + ")}` : "Best all-rounder across every maze";
    html += `<div class="mw-hero${winner === myMark ? " you" : ""}">` +
      `<div class="mw-herocrown">🏆</div>` +
      `<div class="mw-heroname"><span class="mw-heroav" style="background:${wp.color || "#7c6cff"}">${wp.icon || "🧙"}</span>` +
      `<b>${wp.name || winner}</b>${youtag(winner)}</div>` +
      `<div class="mw-heropts"><b>${seatOf(winner).composite || 0}</b> pts</div>` +
      `<div class="mw-herowhy">${why}</div></div>`;
  }
  // per-player score table — shows the addition math: each weighted category column
  // sums to the Total. No rank #, trophy, or colour dot (just icon + name), per request.
  const ranked = (game.players || []).slice().sort((a, b) => (b.composite || 0) - (a.composite || 0));
  const trows = ranked.map((seat) => {
    const you = seat.mark === myMark, isChamp = seat.mark === winner;
    return `<tr class="${isChamp ? "champ " : ""}${you ? "you" : ""}">` +
      `<td class="mw-scname" data-field="player-name">${prof(seat.mark).icon || "🧙"} ${seat.name}${seat.is_bot ? " 🤖" : ""}${youtag(seat.mark)}</td>` +
      `<td data-field="pts-maze">${seat.pts_author ?? 0}</td><td data-field="pts-runner">${seat.pts_runner ?? 0}</td>` +
      `<td data-field="pts-treasure">${seat.pts_treasure ?? 0}</td>` +
      `<td class="mw-sctotal" data-field="pts-total">${seat.composite ?? 0}</td></tr>`;
  }).join("");
  html += `<table class="mw-sctable"><thead><tr><th class="mw-scname">Player</th>` +
    `<th data-field="col-maze" title="Maze design ×5">🧱</th><th data-field="col-runner" title="Fewest moves ×3">🏃</th>` +
    `<th data-field="col-treasure" title="Treasure ×3">💎</th><th data-field="col-total">Total</th></tr></thead>` +
    `<tbody>${trows}</tbody></table>`;
  html += `<div class="mw-legend">Each column is your placing in that contest, weighted: 🧱 maze design ×5 · 🏃 fewest moves ×3 · 💎 treasure ×3 — added across the row for your Total.</div>`;
  done.innerHTML = html;
}

// ---------- live scores (bottom of every screen, including the end) ----------
// One table, three tappable lenses on the same standings (scoreView):
//   raw      — the actual tallies (maze score / moves / treasure)
//   rank     — each player's placing per contest (best = N-1, ties share .5)
//   weighted — rank × 5/3/3, summing to the composite Total that picks the champion
// Everything derives from fields already in the projection (raw stats + the weighted
// pts_*; rank = pts / weight), so this is render-only — no server change.
const fmt = (x) => Math.round((Number(x) || 0) * 10) / 10;

function renderLeaderboard(game, myMark) {
  const status = game.status;
  const table = q(".mw-table");
  if (!table) return;
  table.style.display = "block";
  const statusChip = (seat) =>
    seat.skipped ? "skipped ⏭"
      : status === "building" ? (seat.built ? "ready ✅" : "building…")
      : seat.run_done ? "🏁" : `maze ${Math.min(seat.run_index + 1, seat.run_total)}/${seat.run_total}`;

  // per-view column values + the optional total column
  const aRank = (s) => fmt((s.pts_author ?? 0) / 5), mRank = (s) => fmt((s.pts_runner ?? 0) / 3), tRank = (s) => fmt((s.pts_treasure ?? 0) / 3);
  const VIEWS = {
    raw: { label: "Raw", cols: (s) => [s.author_points ?? 0, s.runner_moves ?? 0, s.runner_loot ?? 0], total: null },
    rank: { label: "Rank", cols: (s) => [aRank(s), mRank(s), tRank(s)], totalHead: "Σ", total: (s) => fmt(aRank(s) + mRank(s) + tRank(s)) },
    weighted: { label: "Weighted", cols: (s) => [fmt(s.pts_author), fmt(s.pts_runner), fmt(s.pts_treasure)], totalHead: "Total", total: (s) => fmt(s.composite) },
  };
  const view = VIEWS[scoreView] || VIEWS.raw;
  const hasTotal = !!view.total;

  const players = (game.players || []);
  const ranked = scoreView === "raw" ? players : players.slice().sort((a, b) => (view.total ? view.total(b) - view.total(a) : 0));
  const rows = ranked.map((seat) => {
    const you = seat.mark === myMark;
    const p = seatProfile(seat.mark);
    const [c1, c2, c3] = view.cols(seat);
    return `<tr class="${you ? "you" : ""}">` +
      `<td class="mw-scname">${p.icon || "🧙"} ${seat.name}${seat.is_bot ? " 🤖" : ""}${you ? ' <span class="mw-youtag">you</span>' : ""}` +
      ` <span class="mw-pstat">${statusChip(seat)}</span></td>` +
      `<td>${c1}</td><td>${c2}</td><td>${c3}</td>` +
      (hasTotal ? `<td class="mw-sctotal">${view.total(seat)}</td>` : "") + `</tr>`;
  }).join("");

  const note = scoreView === "raw" ? "the actual tallies"
    : scoreView === "rank" ? "your placing in each contest (top = best)"
    : "rank × 5/3/3 → Total (decides the champion)";
  table.innerHTML =
    `<div class="mw-ptitle">Scores · <b>${view.label}</b> — ${note} <span class="mw-viewhint">tap: Raw→Rank→Weighted</span></div>` +
    `<table class="mw-sctable"><thead><tr><th class="mw-scname">Player</th>` +
    `<th title="Maze design">🧱</th><th title="Running">🏃</th><th title="Treasure">💎</th>` +
    (hasTotal ? `<th>${view.totalHead}</th>` : "") + `</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderInventory() {
  const inv = q(".mw-inventory");
  inv.style.display = "block";
  const glyphs = { diamond: "💎", coin: "🪙", gem: "💎" };
  const items = (runState && runState.inventory || []).map((i) => glyphs[i] || "❓").join(" ");
  inv.innerHTML = `<span class="mw-invlabel">Inventory</span>` + (items || '<span class="mw-invempty">— empty —</span>');
}

// ---------- board rendering (lifted from the standalone) ----------
function geo(state) {
  const span = VIEW - PAD * 2;
  const size = span / Math.max(state.cols, state.rows);
  const x = (c) => PAD + c * size, y = (r) => PAD + r * size;
  return { size, x, y, cx: (c) => x(c) + size / 2, cy: (r) => y(r) + size / 2 };
}
function interiorSeg(g, a, b) {
  const { size, x, y } = g;
  if (a[0] === b[0]) { const yy = y(Math.max(a[1], b[1])); return { x1: x(a[0]), y1: yy, x2: x(a[0]) + size, y2: yy }; }
  const xx = x(Math.max(a[0], b[0])); return { x1: xx, y1: y(a[1]), x2: xx, y2: y(a[1]) + size };
}
function perimSeg(g, cell, dir) {
  const { size, x, y } = g; const c = cell[0], r = cell[1];
  if (dir === "N") return { x1: x(c), y1: y(r), x2: x(c) + size, y2: y(r) };
  if (dir === "S") return { x1: x(c), y1: y(r) + size, x2: x(c) + size, y2: y(r) + size };
  if (dir === "W") return { x1: x(c), y1: y(r), x2: x(c), y2: y(r) + size };
  return { x1: x(c) + size, y1: y(r), x2: x(c) + size, y2: y(r) + size };
}
const mid = (s) => [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2];
function brickRect(s, t) {
  if (s.x1 === s.x2) return { x: s.x1 - t / 2, y: Math.min(s.y1, s.y2), width: t, height: Math.abs(s.y2 - s.y1) };
  return { x: Math.min(s.x1, s.x2), y: s.y1 - t / 2, width: Math.abs(s.x2 - s.x1), height: t };
}
function eventToCell(state, svg, e) {
  const rect = svg.getBoundingClientRect(); const g = geo(state);
  const Wv = PAD * 2 + g.size * state.cols, Hv = PAD * 2 + g.size * state.rows;
  const c = Math.floor(((e.clientX - rect.left) / rect.width * Wv - PAD) / g.size);
  const r = Math.floor(((e.clientY - rect.top) / rect.height * Hv - PAD) / g.size);
  return (c < 0 || r < 0 || c >= state.cols || r >= state.rows) ? null : [c, r];
}
function drawArch(add, g, cell, dir) {
  const z = g.size, [mx, my] = mid(perimSeg(g, cell, dir));
  const angle = { N: 0, E: 90, S: 180, W: 270 }[dir];
  const w = z * 0.40, wI = z * 0.31, postH = z * 0.06, riseO = z * 0.26, riseI = z * 0.17;
  const hO = 1.333 * riseO, hI = 1.333 * riseI;
  const d = [`M ${-w} 0`, `L ${-w} ${-postH}`, `C ${-w} ${-(postH + hO)} ${w} ${-(postH + hO)} ${w} ${-postH}`,
    `L ${w} 0`, `L ${wI} 0`, `L ${wI} ${-postH}`,
    `C ${wI} ${-(postH + hI)} ${-wI} ${-(postH + hI)} ${-wI} ${-postH}`, `L ${-wI} 0`, "Z"].join(" ");
  const group = add("g", { transform: `translate(${mx} ${my}) rotate(${angle})`, class: "mw-arch" });
  add("path", { d, fill: "url(#mwgold)", "fill-rule": "evenodd", stroke: "#7a571a", "stroke-width": 0.7 }, group);
}

function renderBoardInto(state, mode, opts) {
  const g = geo(state); const { size, x, y, cx, cy } = g;
  const W = PAD * 2 + size * state.cols, H = PAD * 2 + size * state.rows;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.innerHTML = SVG_DEFS;
  const add = (tag, attrs, parent = svg) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent.appendChild(el); return el;
  };
  const lite = (el, on) => el && el.classList.toggle("lit", on);
  const building = mode === "build", reveal = mode === "reveal";
  const me = seatProfile(localMark());
  const meColor = me.color || "#7c6cff", meEmoji = me.icon || "🧙";

  const editable = building && !opts.readOnly;
  const startTap = editable && buildMode === "start";
  const lootPlace = editable && buildMode === "loot" && selectedItem != null;   // a gem is picked up
  for (let c = 0; c < state.cols; c++) for (let r = 0; r < state.rows; r++) {
    let cls = "mw-cell";
    if (building) { if (c === state.start[0] && r === state.start[1]) cls += " start"; if (startTap || lootPlace) cls += " tap"; }
    else { const here = c === state.pos[0] && r === state.pos[1]; const seen = state.visited[`${c},${r}`];
      cls += here ? " here" : (seen ? " seen" : (reveal ? "" : " fog")); }
    const cell = add("rect", { x: x(c) + 1.5, y: y(r) + 1.5, width: size - 3, height: size - 3, rx: 4, class: cls });
    if (startTap) cell.addEventListener("click", () => commitBuild({ type: "SET_START", cell: [c, r] }));
    else if (lootPlace) cell.addEventListener("click", () => { const idx = selectedItem; selectedItem = null; commitBuild({ type: "SET_ITEM", index: idx, cell: [c, r] }); });
  }
  if (building || reveal) {
    for (const { cell, dir } of perimeterEdges(state)) {
      if (isExit(state, cell, dir)) continue;
      add("rect", { ...brickRect(perimSeg(g, cell, dir), 8), rx: 1.5, fill: "url(#mwbrick)", class: "mw-perim" });
    }
  } else for (const k of Object.keys(state.revealedPerim)) {
    const [c, r, dir] = k.split(","); add("rect", { ...brickRect(perimSeg(g, [+c, +r], dir), 8), rx: 1.5, fill: "url(#mwbrick)", class: "mw-perim" });
  }
  if (state.exit && (building || reveal || state.exitRevealed)) drawArch(add, g, state.exit.cell, state.exit.dir);

  const wallKeys = (building || reveal) ? Object.keys(state.walls) : Object.keys(state.revealedWalls);
  for (const k of wallKeys) {
    const [a, b] = k.split("-").map((p) => p.split(",").map(Number));
    add("rect", { ...brickRect(interiorSeg(g, a, b), 7), rx: 1.5, fill: "url(#mwbrick)", class: "mw-wall" });
  }

  if (building && !opts.readOnly) {
    // Each edit mode lights up only its own hitboxes, so a wall tap can't become a
    // stray start move and vice-versa (the overloaded-controls fix). Tokens always
    // show; they're only draggable in their mode.
    if (buildMode === "walls") for (const edge of interiorEdges(state)) {
      const key = edgeKey(edge[0], edge[1]); const s = interiorSeg(g, edge[0], edge[1]); const [mx, my] = mid(s);
      const target = add("rect", { ...brickRect(s, 7), rx: 1.5, fill: "url(#mwbrick)", class: state.walls[key] ? "mw-wall" : "mw-wallprev" });
      const hit = add("circle", { cx: mx, cy: my, r: size * 0.26, class: "mw-hit" });
      hit.addEventListener("mouseenter", () => lite(target, true));
      hit.addEventListener("mouseleave", () => lite(target, false));
      hit.addEventListener("click", () => commitBuild({ type: "TOGGLE_WALL", edge }));
    }
    if (buildMode === "exit") for (const { cell, dir } of perimeterEdges(state)) {
      const s = perimSeg(g, cell, dir); const [mx, my] = mid(s);
      const target = add("rect", { ...brickRect(s, 9), rx: 1.5, class: "mw-exitprev" });
      const hit = add("circle", { cx: mx, cy: my, r: size * 0.24, class: "mw-hit" });
      hit.addEventListener("mouseenter", () => lite(target, true));
      hit.addEventListener("mouseleave", () => lite(target, false));
      hit.addEventListener("click", () => commitBuild({ type: "TOGGLE_EXIT", cell, dir }));
    }
    // Loot: tap a gem to pick it up (highlight), tap a cell to drop it — friendlier
    // on a phone than dragging. In other modes the gems are just shown, static.
    state.items.forEach((it, i) => {
      const glyph = it.type === "diamond" ? "💎" : "🪙";
      const selected = buildMode === "loot" && selectedItem === i;
      if (selected) add("circle", { cx: cx(it.cell[0]), cy: cy(it.cell[1]), r: size * 0.40, class: "mw-selring" });
      add("text", { x: cx(it.cell[0]), y: cy(it.cell[1]), class: "mw-emoji mw-treasure" }).textContent = glyph;
      if (buildMode === "loot") {
        const hit = add("circle", { cx: cx(it.cell[0]), cy: cy(it.cell[1]), r: size * 0.36, class: "mw-hit" });
        hit.addEventListener("click", (e) => { e.stopPropagation(); selectItem(selected ? null : i); });
      }
    });
    drawToken(add, g, svg, state, state.pos, meEmoji, meColor,
      buildMode === "start" ? (cl) => commitBuild({ type: "SET_START", cell: cl }) : null);
    // flag anything the start can't reach — recomputed every render, so it tracks
    // every wall/loot/start edit (the walled-off-diamond case)
    for (const it of state.items) if (!pathExists(state, state.start, it.cell))
      add("circle", { cx: cx(it.cell[0]), cy: cy(it.cell[1]), r: size * 0.42, class: "mw-warnring" });
    if (state.exit && !pathExists(state, state.start, state.exit.cell))
      add("circle", { cx: cx(state.exit.cell[0]), cy: cy(state.exit.cell[1]), r: size * 0.42, class: "mw-warnring" });
  } else if (reveal) {
    for (const k of Object.keys(state.visited)) { const [c, r] = k.split(",").map(Number); add("circle", { cx: cx(c), cy: cy(r), r: size * 0.07, class: "mw-trail" }); }
    for (const it of state.items) { const el = add("text", { x: cx(it.cell[0]), y: cy(it.cell[1]), class: "mw-emoji" + (it.collected ? "" : " mw-treasure") }); el.textContent = it.type === "diamond" ? "💎" : "🪙"; if (it.collected) el.setAttribute("opacity", "0.4"); }
    add("circle", { cx: cx(state.pos[0]), cy: cy(state.pos[1]), r: size * 0.34, fill: meColor, "fill-opacity": 0.3, stroke: meColor, "stroke-width": 2 });
    add("text", { x: cx(state.pos[0]), y: cy(state.pos[1]), class: "mw-emoji" }).textContent = meEmoji;
  } else if (mode === "build" && opts.readOnly) {
    state.items.forEach((it) => { add("text", { x: cx(it.cell[0]), y: cy(it.cell[1]), class: "mw-emoji mw-treasure" }).textContent = it.type === "diamond" ? "💎" : "🪙"; });
    add("circle", { cx: cx(state.pos[0]), cy: cy(state.pos[1]), r: size * 0.34, fill: meColor, "fill-opacity": 0.28, stroke: meColor, "stroke-width": 2 });
    add("text", { x: cx(state.pos[0]), y: cy(state.pos[1]), class: "mw-emoji" }).textContent = meEmoji;
  } else {
    // Crawl: show the uncollected gems through the fog so the runner can decide to
    // chase the shiny or bolt for the exit (the Treasure Hunter tension). Movement
    // is swipe / D-pad / arrow keys — no on-pawn pads (they looked goofy).
    for (const it of state.items) if (!it.collected)
      add("text", { x: cx(it.cell[0]), y: cy(it.cell[1]), class: "mw-emoji mw-treasure" }).textContent = "💎";
    add("circle", { cx: cx(state.pos[0]), cy: cy(state.pos[1]), r: size * 0.34, fill: meColor, "fill-opacity": 0.3, stroke: meColor, "stroke-width": 2 });
    add("text", { x: cx(state.pos[0]), y: cy(state.pos[1]), class: "mw-emoji" }).textContent = meEmoji;
  }
  const wrap = q(".mw-board"); wrap.innerHTML = ""; wrap.appendChild(svg);
}

function drawToken(add, g, svg, state, cell, glyph, color, onDrop) {
  const tx = g.cx(cell[0]), ty = g.cy(cell[1]);
  if (color) add("circle", { cx: tx, cy: ty, r: g.size * 0.34, fill: color, "fill-opacity": 0.28, stroke: color, "stroke-width": 2 });
  const glyphEl = add("text", { x: tx, y: ty, class: "mw-emoji" + (color ? "" : " mw-treasure") }); glyphEl.textContent = glyph;
  if (!onDrop) return;   // static token (not this edit mode) — show it, but no drag handle
  const grab = add("circle", { cx: tx, cy: ty, r: g.size * 0.36, class: "mw-grab" });
  grab.addEventListener("pointerdown", (e) => { e.preventDefault(); dragging = true; try { grab.setPointerCapture(e.pointerId); } catch (_) {} });
  grab.addEventListener("pointermove", (e) => { if (!dragging) return; const cl = eventToCell(state, svg, e); if (cl) { glyphEl.setAttribute("x", g.cx(cl[0])); glyphEl.setAttribute("y", g.cy(cl[1])); } });
  grab.addEventListener("pointerup", (e) => { if (!dragging) return; dragging = false; const cl = eventToCell(state, svg, e); if (cl) onDrop(cl); });
}

function animateCollect(types) {
  const svg = q(".mw-board svg"); if (!svg || !runState) return;
  const rect = svg.getBoundingClientRect(); const g = geo(runState);
  const Wv = PAD * 2 + g.size * runState.cols, Hv = PAD * 2 + g.size * runState.rows;
  const fx = rect.left + g.cx(runState.pos[0]) / Wv * rect.width, fy = rect.top + g.cy(runState.pos[1]) / Hv * rect.height;
  const ir = q(".mw-inventory").getBoundingClientRect();
  const glyphs = { diamond: "💎", coin: "🪙", gem: "💎" };
  types.forEach((type, i) => {
    const el = document.createElement("div"); el.className = "mw-flying"; el.textContent = glyphs[type] || "❓";
    el.style.left = fx + "px"; el.style.top = fy + "px"; document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.left = (ir.left + 70 + i * 22) + "px"; el.style.top = (ir.top + ir.height / 2) + "px";
      el.style.transform = "translate(-50%, -50%) scale(0.7)"; el.style.opacity = "0.3";
    }));
    setTimeout(() => el.remove(), 1300);
  });
}

// ---------- crawl movement: D-pad + full-board swipe ----------
// Phone / tablet (coarse pointer or touch). Used to gate the D-pad + pick the tip.
function isTouchDevice() {
  return (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
    navigator.maxTouchPoints > 0 || "ontouchstart" in window;
}

function setDpad(on) {
  // D-pad is for touch only; PCs use swipe + arrow keys. The crawling class (which
  // sets touch-action:none so a swipe is captured, not a page scroll) applies during
  // any crawl regardless of device.
  const e = q(".mw-dpad"); if (e) e.style.display = (on && isTouchDevice()) ? "grid" : "none";
  const b = q(".mw-board"); if (b) b.classList.toggle("crawling", on);
}

// One-time swipe gesture on the board. Only fires during a crawl, ignores the
// build-phase token drags (the `dragging` flag), and ignores taps under the
// threshold so the on-board arrow pads still register as clicks.
function bindSwipe() {
  // Bind to the CURRENT board element. ensureScaffold rebuilds the scaffold (a fresh
  // board) after every lobby → new game, and calls this once per build — so no global
  // "already bound" guard (that guard left the new board's swipe dead after game 1).
  const board = q(".mw-board");
  if (!board) return;
  const inCrawl = () => runState && runState.phase === PHASE.CRAWL && root();
  const fire = (dx, dy) => {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;   // a tap, not a swipe
    commitRun({ type: "MOVE", dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "E" : "W") : (dy > 0 ? "S" : "N") });
  };
  // Mouse: pointer events (touch is handled separately to avoid double-firing).
  let mx = 0, my = 0, mdown = false;
  board.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch" || dragging || !inCrawl()) return; mx = e.clientX; my = e.clientY; mdown = true; });
  board.addEventListener("pointerup", (e) => { if (!mdown) return; mdown = false; if (e.pointerType === "touch" || !inCrawl()) return; fire(e.clientX - mx, e.clientY - my); });
  // Touch: native touch events. preventDefault once the gesture is clearly a swipe
  // stops the page from scrolling and stealing it (the tap-doesn't-work bug).
  let tx = 0, ty = 0, tmoved = false, touching = false;
  board.addEventListener("touchstart", (e) => {
    if (dragging || !inCrawl() || e.touches.length !== 1) { touching = false; return; }
    tx = e.touches[0].clientX; ty = e.touches[0].clientY; touching = true; tmoved = false;
  }, { passive: true });
  board.addEventListener("touchmove", (e) => {
    if (!touching) return;
    const t = e.touches[0];
    if (Math.max(Math.abs(t.clientX - tx), Math.abs(t.clientY - ty)) > 10) { tmoved = true; e.preventDefault(); }
  }, { passive: false });
  board.addEventListener("touchend", (e) => {
    if (!touching) return;
    touching = false;
    if (!tmoved || !inCrawl()) return;
    const t = e.changedTouches[0];
    fire(t.clientX - tx, t.clientY - ty);
  });
  board.addEventListener("touchcancel", () => { touching = false; });
}

// ---------- tiny DOM helpers ----------
function setText(sel, t) { const e = q(sel); if (e) e.textContent = t; }
function setDot(color) { const e = q(".mw-dot"); if (e) e.style.background = color; }
function tag(label, cls) { const e = q(".mw-tag"); if (e) { e.className = "mw-tag " + cls; e.textContent = label; } }
function show(sel) { const e = q(sel); if (e) e.style.display = sel === ".mw-codebar" ? "flex" : "block"; }
function hide(sel) { const e = q(sel); if (e) e.style.display = "none"; }
let flashTimer = null;
function flash(msg) {
  const e = q(".mw-sub"); if (!e) return; const prev = e.textContent; e.textContent = "⚠ " + msg; e.style.color = "#e85d75";
  clearTimeout(flashTimer); flashTimer = setTimeout(() => { e.style.color = ""; e.textContent = prev; }, 1500);
}
