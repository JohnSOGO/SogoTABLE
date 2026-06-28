// Mazewright client module — the offline AI/ controller, repackaged against the
// SogoTable shell ctx bag. Build editing and the fog crawl run locally (the
// shared core); only the barrier events cross to the server:
//   SUBMIT_MAZE  — commit the built maze code (build barrier)
//   POST_RESULT  — commit a finished maze's {moves, loot} (run progress)
// The leaderboard + the three prizes come from the server projection (ctx.game).
import {
  PHASE, MAX_WALLS, MIN_WALLS, createGame, edgeKey, mazeCode,
  interiorEdges, perimeterEdges, isExit, wallCount, canAddWall, canSubmit,
  applyAction, loadRunFromCode,
} from "./rules.js";
import { renderHostStartLobby } from "../host-lobby.js";
import { playClick, playConfirm, playCancel, playInvalidMove, playScorePick, playWin } from "../../sound.js";

const PAD = 26, VIEW = 420;
const DIRS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
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
let runState = null;
let runLoaded = -1;     // deck index runState is built for
let dragging = false;
let posting = false;    // guard against double POST_RESULT
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
    '<span class="mw-turnname"></span></div><span class="mw-tag"></span></div>' +
    '<div class="mw-sub"></div><div class="mw-meters"></div></div>' +
    '<div class="mw-inventory mw-panel"></div>' +
    '<div class="mw-board"></div>' +
    '<div class="mw-controls"><button class="mw-auto">🎲 Auto map</button>' +
    '<button class="mw-reset">↺ Reset</button><button class="mw-go">Submit my maze</button></div>' +
    '<div class="mw-codebar mw-panel"><span class="mw-codelabel">🔑 Maze code</span>' +
    '<input class="mw-codeinput" spellcheck="false" autocomplete="off" />' +
    '<button class="mw-codeload">Load</button></div>' +
    '<div class="mw-done mw-panel"></div>' +
    '<div class="mw-table mw-panel"></div></div>';
  q(".mw-auto").addEventListener("click", () => commitBuild({ type: "AUTO_BUILD" }));
  q(".mw-reset").addEventListener("click", () => commitBuild({ type: "RESET_BUILD" }));
  q(".mw-go").addEventListener("click", submitMaze);
  q(".mw-codeload").addEventListener("click", () => commitBuild({ type: "LOAD_CODE", code: q(".mw-codeinput").value }));
  q(".mw-codeinput").addEventListener("keydown", (e) => { if (e.key === "Enter") commitBuild({ type: "LOAD_CODE", code: e.target.value }); });
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
  show(".mw-board");
  hide(".mw-inventory"); hide(".mw-done");

  const rk = `${ctx.room.code}:${ctx.room.game_epoch || 0}`;
  if (rk !== buildKey) { buildKey = rk; wonSound = false; buildState = createGame({ seats: [{ name: "You", color: seatProfile(myMark).color, emoji: seatProfile(myMark).icon }] }); }
  runState = null; runLoaded = -1;

  const me = seatProfile(myMark);
  setDot(me.color || "#7c6cff");
  setText(".mw-turnname", `${me.icon || "🧙"} your dungeon`);
  tag("Build", "build");

  if (submitted) {
    setText(".mw-sub", "Maze locked in — waiting for the other builders…");
    q(".mw-controls").style.display = "none";
    hide(".mw-codebar");
    renderBoardInto(buildState, "build", { readOnly: true });
    return;
  }
  setText(".mw-sub", "Tap a slot to add/remove a wall. Tap a border for the golden exit. Drag your pawn and loot. Then Submit.");
  q(".mw-controls").style.display = "flex";
  q(".mw-controls").innerHTML = '<button class="mw-auto">🎲 Auto map</button><button class="mw-reset">↺ Reset</button>' +
    '<button class="mw-go" ' + (canSubmit(buildState) ? "" : "disabled") + '>Submit my maze</button>';
  q(".mw-auto").addEventListener("click", () => commitBuild({ type: "AUTO_BUILD" }));
  q(".mw-reset").addEventListener("click", () => commitBuild({ type: "RESET_BUILD" }));
  q(".mw-go").addEventListener("click", submitMaze);
  const walls = wallCount(buildState);
  const meters = `<span class="mw-meter ${walls >= MIN_WALLS ? "ok" : ""}">Walls <b>${walls}</b> / ${MAX_WALLS} · min ${MIN_WALLS}</span>` +
    `<span class="mw-meter ${buildState.exit ? "ok" : ""}">Exit ${buildState.exit ? "set 🏛️" : "not set"}</span>`;
  q(".mw-meters").innerHTML = meters;
  show(".mw-codebar");
  const input = q(".mw-codeinput");
  if (document.activeElement !== input) input.value = mazeCode(buildState);
  renderBoardInto(buildState, "build", {});
}

function commitBuild(action) {
  try { applyAction(buildState, action); } catch (e) { playCancel(); flash(e.message.replace(/^MW:\s*/, "")); return; }
  playClick();
  renderBuildPhase(ctx.game || {}, localMark());
}

function submitMaze() {
  if (!buildState || !canSubmit(buildState)) {
    playCancel();
    flash(`Place at least ${MIN_WALLS} walls and an exit your start can reach.`);
    return;
  }
  playConfirm();
  ctx.makeMove({ type: "SUBMIT_MAZE", code: mazeCode(buildState) });
}

// ---------- run phase ----------
function renderRunPhase(game, myMark) {
  const seat = serverSeat(game, myMark);
  const deck = game.deck || [];
  show(".mw-board"); show(".mw-inventory");
  q(".mw-controls").style.display = "none";
  hide(".mw-codebar");

  if (!seat || seat.run_done) {
    setText(".mw-turnname", "🏁 all mazes run"); tag("Done", "crawl");
    setText(".mw-sub", "You're out of every dungeon — waiting for the others to finish…");
    hide(".mw-done"); hide(".mw-inventory");
    q(".mw-board").innerHTML = "";
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
    tag("Revealed", "crawl");
    setText(".mw-sub", "Maze revealed — see whose dungeon you escaped, then continue.");
    renderBoardInto(runState, "reveal", {});
    const last = idx + 1 >= deck.length;
    const dia = runState.inventory.filter((x) => x === "diamond" || x === "gem").length;
    const coin = runState.inventory.filter((x) => x === "coin").length;
    const done = q(".mw-done"); show(".mw-done");
    done.innerHTML = `<div style="font-weight:700;">Maze ${idx + 1}/${deck.length} cleared — ` +
      `${author.icon || "🧙"} ${author.name || "?"}${mine ? '<span class="mw-mine"> · your maze!</span>' : "'s maze"}</div>` +
      `<div class="mw-help" style="margin-top:4px;">${runState.moves} moves → <b>${runState.moves} pts</b> to ${author.name || "?"} · 💎${dia} 🪙${coin}</div>` +
      `<button class="mw-next mw-go-btn" style="margin-top:12px;">${last ? "Post final result →" : "Next maze →"}</button>`;
    done.querySelector(".mw-next").addEventListener("click", postRunResult);
    return;
  }
  hide(".mw-done");
  tag("Crawl", "crawl");
  setText(".mw-sub", "It's dark — move with the pads or arrow keys. Walls reveal on a bump; the arch shows when you reach it.");
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
  runLoaded = -1;   // force-load the next maze when the server confirms
  ctx.makeMove({ type: "POST_RESULT", moves: runState.moves, loot });
}

// ---------- complete (prizes) ----------
function renderComplete(game, myMark) {
  hide(".mw-board"); hide(".mw-inventory"); hide(".mw-codebar"); q(".mw-controls").style.display = "none";
  if (!wonSound) { wonSound = true; playWin(); }
  setText(".mw-turnname", "🏆 Prizes"); tag("Done", "crawl"); setText(".mw-sub", "");
  q(".mw-meters").innerHTML = "";
  const prizes = game.prizes || {};
  const seatOf = (mark) => serverSeat(game, mark) || {};
  const who = (mark) => { const p = seatProfile(mark); return `${p.icon || "🧙"} ${p.name || mark}${mark === myMark ? " (you)" : ""}`; };
  const card = (icon, name, mark, detail) =>
    `<div class="mw-prize${mark === myMark ? " mine" : ""}"><span class="mw-pzico">${icon}</span>` +
    `<span class="mw-pzbody"><b>${name}</b><br>${who(mark)} <span class="mw-pzdetail">· ${detail}</span></span></div>`;
  const done = q(".mw-done"); show(".mw-done");
  done.innerHTML =
    card("🧱", "Mazewright", prizes.mazewright, `${seatOf(prizes.mazewright).author_points || 0} moves lost in their maze`) +
    card("🏃", "Mazerunner", prizes.mazerunner, `${seatOf(prizes.mazerunner).runner_moves || 0} moves total`) +
    card("💎", "Treasure Hunter", prizes.treasureHunter, `${seatOf(prizes.treasureHunter).runner_loot || 0} loot`);
}

// ---------- leaderboard ----------
function renderLeaderboard(game, myMark) {
  const status = game.status;
  const rows = (game.players || []).map((seat) => {
    const you = seat.mark === myMark;
    const p = seatProfile(seat.mark);
    let stat;
    if (status === "building") stat = seat.built ? "maze ready ✅" : "building…";
    else if (status === "running") stat = seat.run_done ? "🏁 done" : `maze ${Math.min(seat.run_index + 1, seat.run_total)}/${seat.run_total}`;
    else stat = `🧱${seat.author_points} · 🏃${seat.runner_moves} · 💎${seat.runner_loot}`;
    return `<div class="mw-prow ${you ? "you" : "muted"}${seat.run_done ? " done" : ""}">` +
      `<span class="mw-pname"><span class="mw-pdot" style="background:${p.color || "#7c6cff"}"></span>${p.icon || "🧙"} ${seat.name}${you ? " (you)" : ""}${seat.is_bot ? " 🤖" : ""}</span>` +
      `<span class="mw-pstat">${stat}</span></div>`;
  }).join("");
  const title = status === "complete" ? "Final standings · 🧱author · 🏃moves · 💎loot"
    : status === "running" ? "Run progress · each on their own race"
    : "Builders · each making a dungeon";
  const table = q(".mw-table"); table.style.display = "block";
  table.innerHTML = `<div class="mw-ptitle">${title}</div>${rows}`;
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

  for (let c = 0; c < state.cols; c++) for (let r = 0; r < state.rows; r++) {
    let cls = "mw-cell";
    if (building) { if (c === state.start[0] && r === state.start[1]) cls += " start"; if (!opts.readOnly) cls += " tap"; }
    else { const here = c === state.pos[0] && r === state.pos[1]; const seen = state.visited[`${c},${r}`];
      cls += here ? " here" : (seen ? " seen" : (reveal ? "" : " fog")); }
    const cell = add("rect", { x: x(c) + 1.5, y: y(r) + 1.5, width: size - 3, height: size - 3, rx: 4, class: cls });
    if (building && !opts.readOnly) cell.addEventListener("click", () => commitBuild({ type: "SET_START", cell: [c, r] }));
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
    for (const edge of interiorEdges(state)) {
      const key = edgeKey(edge[0], edge[1]); const s = interiorSeg(g, edge[0], edge[1]); const [mx, my] = mid(s);
      const target = add("rect", { ...brickRect(s, 7), rx: 1.5, fill: "url(#mwbrick)", class: state.walls[key] ? "mw-wall" : "mw-wallprev" });
      const hit = add("circle", { cx: mx, cy: my, r: size * 0.26, class: "mw-hit" });
      hit.addEventListener("mouseenter", () => lite(target, true));
      hit.addEventListener("mouseleave", () => lite(target, false));
      hit.addEventListener("click", () => commitBuild({ type: "TOGGLE_WALL", edge }));
    }
    for (const { cell, dir } of perimeterEdges(state)) {
      const s = perimSeg(g, cell, dir); const [mx, my] = mid(s);
      const target = add("rect", { ...brickRect(s, 9), rx: 1.5, class: "mw-exitprev" });
      const hit = add("circle", { cx: mx, cy: my, r: size * 0.24, class: "mw-hit" });
      hit.addEventListener("mouseenter", () => lite(target, true));
      hit.addEventListener("mouseleave", () => lite(target, false));
      hit.addEventListener("click", () => commitBuild({ type: "TOGGLE_EXIT", cell, dir }));
    }
    state.items.forEach((it, i) => drawToken(add, g, svg, state, it.cell, it.type === "diamond" ? "💎" : "🪙", null,
      (cl) => commitBuild({ type: "SET_ITEM", index: i, cell: cl })));
    drawToken(add, g, svg, state, state.pos, meEmoji, meColor, (cl) => commitBuild({ type: "SET_START", cell: cl }));
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
    const px = cx(state.pos[0]), py = cy(state.pos[1]);
    add("circle", { cx: px, cy: py, r: size * 0.34, fill: meColor, "fill-opacity": 0.3, stroke: meColor, "stroke-width": 2 });
    add("text", { x: px, y: py, class: "mw-emoji" }).textContent = meEmoji;
    const onExit = state.exit && state.pos[0] === state.exit.cell[0] && state.pos[1] === state.exit.cell[1];
    for (const [dir, [dc, dr]] of Object.entries(DIRS)) {
      const padx = px + dc * size * 0.5, pady = py + dr * size * 0.5;
      const pad = add("circle", { cx: padx, cy: pady, r: size * 0.15, class: "mw-pad" + (onExit && dir === state.exit.dir ? " exit" : "") });
      pad.addEventListener("click", () => commitRun({ type: "MOVE", dir }));
      add("text", { x: padx, y: pady, class: "mw-padarrow" }).textContent = { N: "▲", E: "▶", S: "▼", W: "◀" }[dir];
    }
  }
  const wrap = q(".mw-board"); wrap.innerHTML = ""; wrap.appendChild(svg);
}

function drawToken(add, g, svg, state, cell, glyph, color, onDrop) {
  const tx = g.cx(cell[0]), ty = g.cy(cell[1]);
  if (color) add("circle", { cx: tx, cy: ty, r: g.size * 0.34, fill: color, "fill-opacity": 0.28, stroke: color, "stroke-width": 2 });
  const glyphEl = add("text", { x: tx, y: ty, class: "mw-emoji" + (color ? "" : " mw-treasure") }); glyphEl.textContent = glyph;
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

const MW_CSS = `
#macroBoard:has(.mazewright-root){display:block;aspect-ratio:auto;background:none;border:none;}
.mazewright-root{display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;
 padding:14px 10px;border-radius:16px;background:var(--mw-stage);
 --mw-panel:#211d31;--mw-ink:#f3effa;--mw-muted:#9b93b5;--mw-grid:#3a3350;--mw-cellc:#2a2540;
 --mw-start:#33406b;--mw-exit:#46d18a;--mw-gold:#e9c45a;--mw-accent:#7c6cff;
 --mw-fog:#131019;--mw-stage:#16121f;--mw-padink:#ffffff;--mw-pad:rgba(124,108,255,.25);--mw-trail:rgba(255,255,255,.8);
 color:var(--mw-ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}
/* Theme: the dark dungeon is the default look; light mode is a parchment variant.
   Both blocks cover the lobby ("table") and the live board ("game"), scoped to
   .mazewright-root so the rest of the platform stays untouched. data-theme is set
   on <html> before paint (index.html) from the saved choice or the device. */
:root[data-theme="light"] .mazewright-root{
 --mw-panel:#ffffff;--mw-ink:#2a2440;--mw-muted:#6b6486;--mw-grid:#d8d0ee;--mw-cellc:#ece8fa;
 --mw-start:#bcd0f7;--mw-exit:#1f9d62;--mw-gold:#b07d12;--mw-accent:#6a5be0;
 --mw-fog:#cfc8e0;--mw-stage:#f3f0fb;--mw-padink:#241f3a;--mw-pad:rgba(106,91,224,.18);--mw-trail:rgba(60,48,110,.7);}
/* The lobby is shared platform chrome (host-lobby.js) drawn with the platform
   tokens; in dark mode flip those tokens (scoped here) so the "table" matches the
   dark board instead of staying light. Light mode keeps the platform defaults. */
:root[data-theme="dark"] .mazewright-root{--ink:#f3effa;--muted:#9b93b5;--line:#3a3350;--panel:#211d31;--turn-soft:#2a2540;}
:root[data-theme="dark"] .mazewright-root .ten-thousand-message{background:#1b1727;border-color:#3a3350;}
:root[data-theme="dark"] .mazewright-root .secondary{background:#2a2540;border-color:#3a3350;color:#cfc6f5;}
.mazewright-root .mw-panel{width:100%;max-width:460px;background:var(--mw-panel);border:1px solid var(--mw-grid);border-radius:14px;padding:12px 14px;}
.mazewright-root .mw-hudrow{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.mazewright-root .mw-turn{display:flex;align-items:center;gap:9px;font-weight:700;font-size:1.02rem;}
.mazewright-root .mw-dot{width:14px;height:14px;border-radius:50%;flex:none;background:var(--mw-accent);}
.mazewright-root .mw-tag{font-size:.72rem;text-transform:uppercase;letter-spacing:1px;padding:4px 9px;border-radius:999px;background:var(--mw-cellc);color:var(--mw-muted);border:1px solid var(--mw-grid);}
.mazewright-root .mw-tag.build{color:#d98a4a;border-color:#d98a4a;}
.mazewright-root .mw-tag.crawl{color:var(--mw-exit);border-color:var(--mw-exit);}
.mazewright-root .mw-sub{margin-top:5px;color:var(--mw-muted);font-size:.85rem;min-height:1.2em;}
.mazewright-root .mw-meters{display:flex;gap:8px;margin-top:9px;flex-wrap:wrap;}
.mazewright-root .mw-meter{font-size:.82rem;padding:5px 10px;border-radius:999px;background:var(--mw-cellc);border:1px solid var(--mw-grid);}
.mazewright-root .mw-meter b{color:var(--mw-ink);} .mazewright-root .mw-meter.ok{color:var(--mw-gold);border-color:var(--mw-gold);}
.mazewright-root .mw-board{width:100%;max-width:460px;}
.mazewright-root svg{width:100%;height:auto;display:block;touch-action:manipulation;}
.mazewright-root .mw-cell{fill:var(--mw-cellc);} .mazewright-root .mw-cell.start{fill:var(--mw-start);}
.mazewright-root .mw-cell.tap{cursor:pointer;} .mazewright-root .mw-cell.fog{fill:var(--mw-fog);}
.mazewright-root .mw-cell.seen{fill:var(--mw-cellc);} .mazewright-root .mw-cell.here{fill:var(--mw-start);}
.mazewright-root .mw-wall,.mazewright-root .mw-perim{stroke:#2a0f0a;stroke-width:.5;}
.mazewright-root .mw-arch{filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.55));}
.mazewright-root .mw-wallprev{opacity:0;transition:opacity .07s ease;} .mazewright-root .mw-wallprev.lit{opacity:.85;}
.mazewright-root .mw-exitprev{fill:var(--mw-gold);opacity:0;transition:opacity .07s ease;} .mazewright-root .mw-exitprev.lit{opacity:.8;}
.mazewright-root .mw-wall.lit{filter:drop-shadow(0 0 4px #ffd45a);} .mazewright-root .mw-perim.lit{filter:drop-shadow(0 0 5px var(--mw-gold));}
.mazewright-root .mw-hit{fill:transparent;stroke:none;cursor:pointer;}
.mazewright-root .mw-emoji{font-size:26px;text-anchor:middle;dominant-baseline:central;pointer-events:none;}
.mazewright-root .mw-trail{fill:var(--mw-trail);}
.mazewright-root .mw-treasure{filter:drop-shadow(0 0 4px rgba(120,210,255,.7));}
.mazewright-root .mw-grab{fill:transparent;cursor:grab;} .mazewright-root .mw-grab:active{cursor:grabbing;}
.mazewright-root .mw-pad{fill:var(--mw-pad);stroke:var(--mw-accent);stroke-width:1.5;cursor:pointer;}
.mazewright-root .mw-pad:hover{fill:rgba(124,108,255,.55);} .mazewright-root .mw-pad.exit{fill:rgba(233,196,90,.5);stroke:var(--mw-gold);}
.mazewright-root .mw-padarrow{font-size:13px;text-anchor:middle;dominant-baseline:central;fill:var(--mw-padink);pointer-events:none;}
.mazewright-root .mw-inventory{display:none;font-size:1.1rem;}
.mazewright-root .mw-invlabel{color:var(--mw-muted);text-transform:uppercase;letter-spacing:1px;font-size:.74rem;margin-right:8px;}
.mazewright-root .mw-invempty{color:var(--mw-muted);opacity:.65;font-size:.85rem;}
.mazewright-root .mw-controls{display:flex;width:100%;max-width:460px;gap:8px;}
.mazewright-root .mw-controls button{flex:1;padding:12px;border-radius:10px;font-weight:700;cursor:pointer;border:1px solid var(--mw-grid);background:var(--mw-cellc);color:var(--mw-ink);}
.mazewright-root .mw-go,.mazewright-root .mw-go-btn{background:var(--mw-exit);border-color:var(--mw-exit);color:#0c2417;}
.mazewright-root .mw-go:disabled{opacity:.4;cursor:not-allowed;}
.mazewright-root .mw-codebar{display:none;align-items:center;gap:8px;}
.mazewright-root .mw-codelabel{font-size:.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--mw-muted);white-space:nowrap;}
.mazewright-root .mw-codeinput{flex:1;min-width:0;font-family:ui-monospace,monospace;font-size:.82rem;padding:8px 9px;border-radius:8px;border:1px solid var(--mw-grid);background:var(--mw-cellc);color:var(--mw-ink);}
.mazewright-root .mw-codebar button{padding:8px 13px;border-radius:8px;border:1px solid var(--mw-grid);background:var(--mw-cellc);color:var(--mw-ink);font-weight:700;cursor:pointer;}
.mazewright-root .mw-done{display:none;text-align:center;} .mazewright-root .mw-mine{color:var(--mw-gold);font-weight:800;}
.mazewright-root .mw-help{color:var(--mw-muted);font-size:.84rem;line-height:1.5;}
.mazewright-root .mw-table{display:none;}
.mazewright-root .mw-ptitle{font-size:.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--mw-muted);margin-bottom:8px;}
.mazewright-root .mw-prow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:9px;border:1px solid transparent;}
.mazewright-root .mw-prow+.mw-prow{margin-top:5px;} .mazewright-root .mw-prow.you{background:var(--mw-cellc);border-color:var(--mw-ink);}
.mazewright-root .mw-prow.muted{opacity:.6;} .mazewright-root .mw-prow.done .mw-pstat{color:var(--mw-exit);}
.mazewright-root .mw-pname{display:flex;align-items:center;gap:8px;font-weight:600;}
.mazewright-root .mw-pdot{width:11px;height:11px;border-radius:50%;flex:none;}
.mazewright-root .mw-pstat{font-size:.82rem;color:var(--mw-muted);white-space:nowrap;} .mazewright-root .mw-prow.you .mw-pstat{color:var(--mw-ink);}
.mazewright-root .mw-prize{display:flex;align-items:center;gap:11px;text-align:left;margin:8px 0;padding:10px 12px;border-radius:11px;background:var(--mw-cellc);border:1px solid var(--mw-grid);}
.mazewright-root .mw-prize.mine{border-color:var(--mw-gold);}
.mazewright-root .mw-pzico{font-size:1.7rem;flex:none;} .mazewright-root .mw-pzbody{font-size:.92rem;line-height:1.35;}
.mazewright-root .mw-pzdetail{color:var(--mw-muted);font-size:.82rem;}
.mw-flying{position:fixed;z-index:50;font-size:26px;pointer-events:none;transform:translate(-50%,-50%) scale(1.4);transition:left .6s cubic-bezier(.35,.1,.2,1),top .6s cubic-bezier(.35,.1,.2,1),transform .6s,opacity .6s;filter:drop-shadow(0 0 7px rgba(120,210,255,.9));}
`;
