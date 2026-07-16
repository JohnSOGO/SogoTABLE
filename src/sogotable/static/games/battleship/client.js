// Browser-side controller for Battleship (Phase 2). This module owns the WHOLE
// battleship presentation state machine — relocated out of the app shell so the
// shell stops carrying a single game's view logic (ownership Golden Rule / no
// Feature Envy). It owns: the setup/play/grid renderers and their geometry +
// draft helpers; the reveal-animation subsystem (the queued hit/miss reveals,
// their timer, and the offence/defence view mode); the completed-game review
// mark; and the move-submit action. One-way dependency: this module NEVER imports
// the shell. The shell injects its capabilities once via wireBattleship(ctx) and
// drives the exported entry points (renderBattleshipGame, showBattleshipAttackReveal,
// syncBattleshipReviewMark, visibleBattleshipPlayerMark, get/setBattleshipReviewMark).
// clearBattleshipDraft stays exported for the shell's fleet-POST path.
import { actionLabelStyle } from "../../storage.js";
import { randomBattleshipAttackPhrase, randomBattleshipResultPhrase } from "./phrases.js";
import { playBattleshipHit, playBattleshipMiss, playClick, playInvalidMove } from "../../sound.js";

// Module-private fleet-placement state (was on the app shell).
let battleshipSelectedShipId = "carrier";
let battleshipDrafts = {};
// Latest render ctx, stored so the cell/button handlers created during a render
// see current shell state when they fire.
let ctx = null;

// Reveal-animation subsystem state (relocated from the app shell). This module
// owns the battleship presentation state machine: the queued hit/miss reveals,
// their timer, the offence/defence view mode, and the review-mark that the
// completed-game player switch reads/writes.
let battleshipViewMode = "auto";
let battleshipResultReveal = null;
let battleshipResultTimer = null;
let battleshipRevealQueue = [];
let battleshipReviewMark = "";

const BATTLESHIP_RADAR_MS = 1000;          // radar scan before the hit/miss lands
const BATTLESHIP_RESULT_MS = 2000;         // how long the hit/miss stays up
const BATTLESHIP_DEFENCE_SETTLE_MS = 250;  // let the defence board settle before an incoming reveal

// Shell capabilities injected once via wireBattleship(). One-way: this module
// never imports app.js; the shell hands it these hooks and calls the exports.
let shell = {
  getRoom: () => null,
  getPendingMove: () => null,
  setPendingMove: () => {},
  selectedPlayer: () => null,
  isBattleshipGameState: () => false,
  isBotPlayer: () => false,
  moveIntentKey: () => "",
  getDeviceSelectedPlayerId: () => "",
  getSelectedPlayerId: () => "",
  ensureOwnerToken: async () => "",
  api: async () => ({}),
  setRoom: () => {},
  rerender: () => {},
  showTurnStatus: () => {},
  setTurnStatusText: () => {},
  setTurnColorVariables: () => {},
  scheduleWinOverlay: () => {},
  showInfoPrompt: () => {},
  isHexColor: () => false,
  mixColorWithWhite: () => "",
  colorWithAlpha: () => "",
};

export function wireBattleship(context) {
  shell = { ...shell, ...context };
}

// Build the per-frame render ctx the renderers read. Values are snapshotted at
// frame time (matching the old shell, which passed a fresh bag each renderGame);
// deferred cell/button handlers re-read the module-level `ctx`, so they see the
// latest frame. Battleship state/functions are now module-local; shell-generic
// helpers come from the injected `shell`.
function buildRenderCtx() {
  return {
    room: shell.getRoom(),
    pendingMove: shell.getPendingMove(),
    viewMode: battleshipViewMode,
    setViewMode: (mode) => { battleshipViewMode = mode; },
    reviewMark: battleshipReviewMark,
    setReviewMark: (mark) => { battleshipReviewMark = mark; },
    viewerSeat: battleshipViewerSeat,
    visiblePlayer: battleshipVisiblePlayer,
    activeReveal: activeBattleshipResultReveal,
    makeAction: makeBattleshipAction,
    clearReveals: clearBattleshipReveals,
    rerender: shell.rerender,
    showTurnStatus: shell.showTurnStatus,
    setTurnStatusText: shell.setTurnStatusText,
    setTurnColorVariables: shell.setTurnColorVariables,
    scheduleWinOverlay: shell.scheduleWinOverlay,
    isHexColor: shell.isHexColor,
    mixColorWithWhite: shell.mixColorWithWhite,
    colorWithAlpha: shell.colorWithAlpha,
  };
}

// Dark-mode board palette ("dark ocean"). The light naval palette lives in
// styles-games.css; this small block re-skins only the dark theme and is
// injected from the module so the shared (line-capped) stylesheet stays light.
// The .ship/.hit "soft" fills are set inline by JS (mixColorWithWhite), so they
// are re-declared here toward navy; the player-color borders/outlines are kept.
const BATTLESHIP_DARK_CSS = `
:root[data-theme="dark"] .battle-cell {
  background: #0d1b2a;
  border-color: #22384e;
  color: #7fb2d9;
}
:root[data-theme="dark"] .battle-cell.ship {
  background: #10362b;
  border-color: #1f7a5f;
  color: #5fd0a8;
}
:root[data-theme="dark"] .battle-cell.ship.selected-ship {
  background: color-mix(in srgb, var(--battle-owner-color, #1f7a5f) 26%, #0d1b2a);
}
:root[data-theme="dark"] .battle-cell.hit,
:root[data-theme="dark"] .battle-cell.hit.sunk-hit {
  background: #3a1620;
  border-color: #ef4d52;
  color: #ff9b9e;
}
:root[data-theme="dark"] .battle-cell.hit.damaged-hit {
  background: color-mix(in srgb, var(--battle-reveal-color, #1f7a5f) 26%, #0d1b2a);
  border-color: var(--battle-reveal-color, #5fd0a8);
  color: var(--battle-reveal-color, #5fd0a8);
}
:root[data-theme="dark"] .battle-cell.miss {
  background: #15212e;
  border-color: #37506a;
  color: #8aa6bf;
}
:root[data-theme="dark"] .battle-cell.battle-result-reveal {
  background: color-mix(in srgb, var(--battle-reveal-color, #1f7a5f) 30%, #0d1b2a);
}
:root[data-theme="dark"] .battleship-toolbar .selected,
:root[data-theme="dark"] .battleship-ship.selected {
  background: var(--secondary-bg);
}
:root[data-theme="dark"] .battleship-toolbar .active-mode {
  background: #16352a;
  border-color: #16a34a;
  color: #86e3b3;
}`;

// Inject the dark palette once. CSS is theme-gated, so it is inert in light mode.
function ensureBattleshipTheme() {
  if (document.getElementById("battleship-theme")) return;
  const styleEl = document.createElement("style");
  styleEl.id = "battleship-theme";
  styleEl.textContent = BATTLESHIP_DARK_CSS;
  document.head.appendChild(styleEl);
}

function renderBattleshipGame() {
  ensureBattleshipTheme();
  ctx = buildRenderCtx();
  const game = ctx.room.game;
  const host = document.getElementById("macroBoard");
  host.className = "macro-board battleship-room-board";
  host.innerHTML = "";
  const selectedSeat = ctx.viewerSeat(ctx.room);
  const currentTurnPlayer = ctx.room.players.find((player) => player.mark === game.current_player);
  ctx.setTurnColorVariables(host, currentTurnPlayer ? currentTurnPlayer.color : selectedSeat ? selectedSeat.color : "#1f7a5f");
  if (!ctx.room.started) {
    ctx.showTurnStatus(null, "Waiting for opponent.");
    return;
  }
  const phase = game.status === "setup" ? "setup" : game.status === "playing" ? "playing" : "complete";
  const playerState = selectedSeat ? game.players && game.players[selectedSeat.mark] : null;
  const opponent = selectedSeat ? ctx.room.players.find((player) => player.mark && player.mark !== selectedSeat.mark) : null;
  const opponentState = opponent ? game.players && game.players[opponent.mark] : null;
  if (phase === "setup") {
    ctx.showTurnStatus(selectedSeat, playerState && playerState.ready ? "Fleet ready. Waiting for opponent." : "Place your fleet.");
    renderBattleshipSetup(host, game, selectedSeat, playerState);
    return;
  }
  if (phase === "complete") {
    const winner = ctx.room.players.find((player) => player.mark === game.winner);
    ctx.showTurnStatus(winner, `${winner ? winner.name : game.winner} won.`);
    const reviewSeat = ctx.room.players.find((player) => player.mark === ctx.reviewMark)
      || selectedSeat
      || ctx.room.players.find((player) => player.mark);
    ctx.setReviewMark(reviewSeat && reviewSeat.mark || "");
    const reviewState = reviewSeat ? game.players && game.players[reviewSeat.mark] : null;
    const reviewOpponent = reviewSeat ? ctx.room.players.find((player) => player.mark && player.mark !== reviewSeat.mark) : null;
    const reviewOpponentState = reviewOpponent ? game.players && game.players[reviewOpponent.mark] : null;
    const activeView = ctx.viewMode === "defence" ? "defence" : "offence";
    renderBattleshipPlay(host, game, reviewSeat, reviewState, reviewOpponent, reviewOpponentState, activeView);
    ctx.scheduleWinOverlay(winner, game.winner);
    return;
  }
  const yourTurn = selectedSeat && selectedSeat.mark === game.current_player;
  host.classList.toggle("your-turn", Boolean(yourTurn));
  host.classList.toggle("waiting", Boolean(!yourTurn));
  const reveal = ctx.activeReveal(ctx.room, selectedSeat);
  const activeView = reveal && reveal.view
    ? reveal.view
    : ctx.viewMode === "auto" ? (yourTurn ? "offence" : "defence") : ctx.viewMode;
  const boardPlayer = ctx.visiblePlayer(activeView, reveal, selectedSeat, opponent, currentTurnPlayer);
  ctx.setTurnColorVariables(host, boardPlayer ? boardPlayer.color : selectedSeat ? selectedSeat.color : "#1f7a5f");
  showBattleshipTurnStatus(activeView, reveal, selectedSeat, opponent, currentTurnPlayer);
  renderBattleshipPlay(host, game, selectedSeat, playerState, opponent, opponentState, activeView, reveal);
}

function showBattleshipTurnStatus(activeView, reveal, selectedSeat, opponent, currentTurnPlayer) {
  const host = document.getElementById("turnStatus");
  if (!host) return;
  host.classList.remove("your-turn", "waiting");
  ctx.setTurnColorVariables(host, selectedSeat ? selectedSeat.color : "#1f7a5f");
  if (!selectedSeat) {
    host.textContent = "Select your player.";
    host.classList.add("waiting");
    return;
  }
  if (reveal && reveal.view === "offence") {
    const phase = battleshipRevealPhase(reveal);
    ctx.setTurnStatusText(host, phase === "result" ? reveal.resultText || battleshipDefaultResultText(reveal) : reveal.attackText || "Taking the shot.");
    host.classList.add("your-turn");
    return;
  }
  if (reveal && reveal.view === "defence") {
    const phase = battleshipRevealPhase(reveal);
    ctx.setTurnStatusText(host, phase === "result" ? reveal.resultText || battleshipDefaultResultText(reveal) : reveal.attackText || "Incoming!");
    host.classList.add("waiting");
    return;
  }
  if (activeView === "offence" && selectedSeat.mark === ctx.room.game.current_player) {
    ctx.setTurnStatusText(host, `It's your turn, ${selectedSeat.name}.`);
    host.classList.add("your-turn");
    return;
  }
  if (activeView === "defence") {
    ctx.setTurnStatusText(host, `Waiting for ${opponent ? opponent.name : "Player2"}`);
    host.classList.add("waiting");
    return;
  }
  ctx.showTurnStatus(currentTurnPlayer);
}

function battleshipRevealPhase(reveal) {
  if (!reveal) return "";
  const now = Date.now();
  if (reveal.pendingUntil && now < reveal.pendingUntil) return "pending";
  if (reveal.radarUntil && now < reveal.radarUntil) return "radar";
  return "result";
}

function battleshipDefaultResultText(reveal) {
  if (reveal && reveal.sunk) return "Target sunk!";
  return reveal && reveal.hit ? "HIT!" : "MISS!";
}

function renderBattleshipSetup(host, game, selectedSeat, playerState) {
  const draft = battleshipDraftFor(game, selectedSeat, playerState);
  const complete = battleshipFleetComplete(draft, game.fleet);
  const panel = document.createElement("section");
  panel.className = "battleship-panel";
  panel.innerHTML = `
    <div class="battleship-toolbar">
      <button type="button" data-battle-action="auto">Auto Place</button>
      <button type="button" data-battle-action="ready" ${complete && !(playerState && playerState.ready) ? "" : "disabled"}>Ready Fleet</button>
    </div>
    <div class="battleship-ship-list"></div>
    <div class="battleship-grid" role="grid" aria-label="Battleship setup board"></div>
  `;
  const shipList = panel.querySelector(".battleship-ship-list");
  (game.fleet || []).forEach((ship) => {
    const placed = draft.some((item) => item.id === ship.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `battleship-ship ${battleshipSelectedShipId === ship.id ? "selected" : ""} ${placed ? "placed" : ""}`;
    button.textContent = `${ship.name} ${ship.size}`;
    button.disabled = Boolean(playerState && playerState.ready);
    button.addEventListener("click", () => {
      battleshipSelectedShipId = ship.id;
      ctx.rerender();
    });
    shipList.appendChild(button);
  });
  panel.querySelector('[data-battle-action="auto"]').addEventListener("click", () => {
    if (!selectedSeat || playerState && playerState.ready) return;
    battleshipDrafts[battleshipDraftKey(ctx.room.code, selectedSeat.mark)] = randomBattleshipDraft(game);
    ctx.rerender();
  });
  panel.querySelector('[data-battle-action="ready"]').addEventListener("click", () => ctx.makeAction({ type: "place_fleet", ships: draft }));
  renderBattleshipGrid(panel.querySelector(".battleship-grid"), game, {
    ships: draft,
    shots: [],
    mode: "setup",
    owner: selectedSeat,
    shooter: null,
    selectedShipId: battleshipSelectedShipId,
    disabled: Boolean(!selectedSeat || playerState && playerState.ready),
    onCell: (row, col) => {
      if (!selectedSeat || playerState && playerState.ready) return;
      placeBattleshipDraftShip(game, selectedSeat.mark, battleshipSelectedShipId, row, col);
      ctx.rerender();
    },
  });
  host.appendChild(panel);
}

function renderBattleshipPlay(host, game, selectedSeat, playerState, opponent, opponentState, activeView, reveal = null) {
  const panel = document.createElement("section");
  panel.className = "battleship-panel";
  // Follow the same per-device label preference as 10,000 (Game Options): emoji
  // by default, plain words when the toggle is on. aria-label keeps the meaning
  // for screen readers in either mode.
  const words = actionLabelStyle() === "words";
  const viewLabel = {
    auto: words ? "Auto" : "🎯🔄🛡️",
    offence: words ? "Offence" : "🎯",
    defence: words ? "Defence" : "🛡️",
  };
  panel.innerHTML = `
    <div class="battleship-toolbar segmented">
      <button type="button" data-view="auto" aria-label="Auto" title="Auto" class="${ctx.viewMode === "auto" ? "selected" : ""}">${viewLabel.auto}</button>
      <button type="button" data-view="offence" aria-label="Offence" title="Offence" class="${activeView === "offence" ? "active-mode" : ""} ${activeView === "offence" && ctx.viewMode !== "auto" ? "selected" : ""}">${viewLabel.offence}</button>
      <button type="button" data-view="defence" aria-label="Defence" title="Defence" class="${activeView === "defence" ? "active-mode" : ""} ${activeView === "defence" && ctx.viewMode !== "auto" ? "selected" : ""}">${viewLabel.defence}</button>
    </div>
    <div class="battleship-board-title"></div>
    <div class="battleship-grid" role="grid"></div>
  `;
  panel.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      ctx.setViewMode(button.dataset.view);
      ctx.clearReveals();
      ctx.rerender();
    });
  });
  const title = panel.querySelector(".battleship-board-title");
  const grid = panel.querySelector(".battleship-grid");
  if (!selectedSeat || !playerState || !opponentState) {
    title.textContent = "Waiting for player view.";
  } else if (activeView === "offence") {
    title.textContent = `Offence: target ${opponent ? opponent.name : "opponent"}`;
    renderBattleshipGrid(grid, game, {
      shots: playerState.shots || [],
      // Opponent ships are hidden until you sink them; the Worker reveals each
      // sunk ship so its cells can be marked. All ships are revealed on complete.
      targetShips: opponentState.ships || [],
      mode: "offence",
      shooter: opponent,
      reveal,
      disabled: game.status !== "playing" || selectedSeat.mark !== game.current_player || ctx.pendingMove || reveal,
      onCell: (row, col) => ctx.makeAction({ type: "attack", row, col }),
    });
  } else {
    title.textContent = "Defence: your fleet";
    renderBattleshipGrid(grid, game, {
      ships: playerState.ships || [],
      shots: opponentState.shots || [],
      targetShips: playerState.ships || [],
      mode: "defence",
      owner: selectedSeat,
      shooter: opponent,
      reveal,
      disabled: true,
    });
  }
  host.appendChild(panel);
}

function renderBattleshipGrid(grid, game, options = {}) {
  const size = Number(game.board_size || 10);
  const ships = Array.isArray(options.ships) ? options.ships : [];
  const shots = Array.isArray(options.shots) ? options.shots : [];
  const targetShips = Array.isArray(options.targetShips) ? options.targetShips : ships;
  const ownerIcon = options.owner && options.owner.icon ? options.owner.icon : "#";
  const shooterIcon = options.shooter && options.shooter.icon ? options.shooter.icon : ownerIcon;
  const ownerColor = ctx.isHexColor(options.owner && options.owner.color || "") ? options.owner.color : "#1f7a5f";
  const revealColor = ctx.isHexColor(options.shooter && options.shooter.color || "") ? options.shooter.color : ownerColor;
  grid.style.setProperty("--battle-size", String(size));
  grid.style.setProperty("--battle-owner-color", ownerColor);
  grid.style.setProperty("--battle-owner-soft", ctx.mixColorWithWhite(ownerColor, 0.24));
  grid.style.setProperty("--battle-owner-glow", ctx.colorWithAlpha(ownerColor, 0.42));
  grid.style.setProperty("--battle-reveal-color", revealColor);
  grid.style.setProperty("--battle-reveal-soft", ctx.mixColorWithWhite(revealColor, 0.24));
  grid.style.setProperty("--battle-reveal-glow", ctx.colorWithAlpha(revealColor, 0.42));
  grid.innerHTML = "";
  const revealPhase = battleshipRevealPhase(options.reveal);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const ship = ships.find((item) => battleshipShipCells(item, battleshipShipSize(game, item.id)).some((cell) => cell.row === row && cell.col === col));
      const rawShot = shots.find((item) => item.row === row && item.col === col);
      const revealCell = Boolean(options.reveal && options.reveal.row === row && options.reveal.col === col);
      const radarTarget = revealCell && revealPhase === "radar";
      const pendingTarget = revealCell && revealPhase === "pending";
      const attackLock = Boolean(radarTarget && options.reveal.view === "offence");
      const radarScan = Boolean(options.reveal && revealPhase === "radar" && options.reveal.view !== "offence" && (options.reveal.row === row || options.reveal.col === col));
      // Keep the landed shot hidden through the settle and radar phases so the result lands as a reveal, not a spoiler.
      const shot = (radarTarget || pendingTarget) ? null : rawShot;
      const reveal = revealCell && revealPhase === "result" ? options.reveal : null;
      const selectedShip = ship && options.mode === "setup" && ship.id === options.selectedShipId;
      // Identify the hit's ship by position (shot.ship_id is stripped from the
      // viewer projection); targetShips holds the fleet whose cells can be marked.
      const hitShip = shot && shot.hit ? battleshipShipAt(targetShips, game, row, col) : null;
      const sunkHit = hitShip ? battleshipShipSunk(hitShip, game, shots) : false;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `battle-cell ${ship ? "ship" : ""} ${selectedShip ? "selected-ship" : ""} ${shot ? shot.hit ? "hit" : "miss" : ""} ${shot && shot.hit ? sunkHit ? "sunk-hit" : "damaged-hit" : ""} ${radarScan ? "battle-radar-scan" : ""} ${radarTarget ? "battle-radar-target" : ""} ${attackLock ? "battle-attack-lock" : ""} ${reveal ? "battle-result-reveal" : ""} ${reveal && reveal.hit ? "reveal-hit" : ""} ${reveal && !reveal.hit ? "reveal-miss" : ""}`;
      cell.textContent = reveal ? reveal.hit ? "💥" : "•" : shot ? shot.hit ? "💥" : "•" : ship ? ownerIcon : "";
      cell.disabled = Boolean(options.disabled || shot);
      cell.setAttribute("aria-label", `Row ${row + 1}, Column ${col + 1}`);
      cell.addEventListener("click", () => options.onCell && options.onCell(row, col));
      grid.appendChild(cell);
    }
  }
}
function battleshipDraftFor(game, seat, playerState) {
  if (!seat) return [];
  if (playerState && Array.isArray(playerState.ships) && playerState.ships.length) return playerState.ships.map((ship) => ({ ...ship }));
  const key = battleshipDraftKey(ctx.room.code, seat.mark);
  if (!battleshipDrafts[key]) battleshipDrafts[key] = [];
  return battleshipDrafts[key];
}

function randomBattleshipDraft(game) {
  const size = Number(game.board_size || 10);
  const fleet = Array.isArray(game.fleet) ? game.fleet : [];
  for (let fullAttempt = 0; fullAttempt < 80; fullAttempt += 1) {
    const placed = [];
    const occupied = new Set();
    const order = fleet.slice().sort(() => Math.random() - 0.5);
    for (const ship of order) {
      let placedShip = null;
      for (let attempt = 0; attempt < 120 && !placedShip; attempt += 1) {
        const orientation = Math.random() < 0.5 ? "h" : "v";
        const shipSize = Number(ship.size || battleshipShipSize(game, ship.id));
        const rowMax = orientation === "v" ? size - shipSize : size - 1;
        const colMax = orientation === "h" ? size - shipSize : size - 1;
        if (rowMax < 0 || colMax < 0) break;
        const candidate = {
          id: ship.id,
          row: Math.floor(Math.random() * (rowMax + 1)),
          col: Math.floor(Math.random() * (colMax + 1)),
          orientation,
        };
        const cells = battleshipShipCells(candidate, shipSize);
        if (cells.every((cell) => !occupied.has(`${cell.row}:${cell.col}`))) placedShip = candidate;
      }
      if (!placedShip) break;
      battleshipShipCells(placedShip, battleshipShipSize(game, placedShip.id)).forEach((cell) => occupied.add(`${cell.row}:${cell.col}`));
      placed.push(placedShip);
    }
    if (placed.length === fleet.length) return fleet.map((ship) => placed.find((item) => item.id === ship.id));
  }
  return [];
}

function battleshipShipAt(ships, game, row, col) {
  return ships.find((ship) => battleshipShipCells(ship, battleshipShipSize(game, ship.id)).some((cell) => cell.row === row && cell.col === col)) || null;
}

function battleshipShipSunk(ship, game, shots) {
  const hits = new Set((shots || []).filter((shot) => shot.hit).map((shot) => `${shot.row}:${shot.col}`));
  return battleshipShipCells(ship, battleshipShipSize(game, ship.id)).every((cell) => hits.has(`${cell.row}:${cell.col}`));
}

function placeBattleshipDraftShip(game, mark, shipId, row, col) {
  const ship = (game.fleet || []).find((item) => item.id === shipId) || (game.fleet || [])[0];
  if (!ship) return;
  const key = battleshipDraftKey(ctx.room.code, mark);
  const existing = (battleshipDrafts[key] || []).find((item) => item.id === ship.id);
  const draft = (battleshipDrafts[key] || []).filter((item) => item.id !== ship.id);
  const orientation = existing ? (existing.orientation === "h" ? "v" : "h") : "h";
  const next = coerceBattleshipPlacement(game, ship.id, row, col, orientation);
  if (battleshipPlacementValid([...draft, next], game)) battleshipDrafts[key] = [...draft, next];
}

function coerceBattleshipPlacement(game, shipId, row, col, orientation) {
  const size = Number(game.board_size || 10);
  const shipSize = battleshipShipSize(game, shipId);
  const centerOffset = Math.floor((shipSize - 1) / 2);
  const maxStart = Math.max(0, size - shipSize);
  const clampedRow = clampNumber(row, 0, size - 1);
  const clampedCol = clampNumber(col, 0, size - 1);
  return {
    id: shipId,
    row: orientation === "v" ? clampNumber(clampedRow - centerOffset, 0, maxStart) : clampedRow,
    col: orientation === "h" ? clampNumber(clampedCol - centerOffset, 0, maxStart) : clampedCol,
    orientation,
  };
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(Number(value) || 0)));
}

function battleshipPlacementValid(ships, game) {
  const size = Number(game.board_size || 10);
  const occupied = new Set();
  return ships.every((ship) => battleshipShipCells(ship, battleshipShipSize(game, ship.id)).every((cell) => {
    if (cell.row < 0 || cell.col < 0 || cell.row >= size || cell.col >= size) return false;
    const key = `${cell.row}:${cell.col}`;
    if (occupied.has(key)) return false;
    occupied.add(key);
    return true;
  }));
}

function battleshipFleetComplete(ships, fleet) {
  return Array.isArray(fleet) && fleet.length > 0 && fleet.every((ship) => ships.some((item) => item.id === ship.id));
}

function battleshipShipSize(game, shipId) {
  return ((game.fleet || []).find((ship) => ship.id === shipId) || {}).size || 0;
}

function battleshipShipCells(ship, size) {
  return Array.from({ length: size }, (_, index) => ({
    row: Number(ship.row) + (ship.orientation === "v" ? index : 0),
    col: Number(ship.col) + (ship.orientation === "h" ? index : 0),
  }));
}

function battleshipDraftKey(code, mark) {
  return `${code || ""}:${mark || ""}`;
}

function clearBattleshipDraft(code, mark) {
  if (!code || !mark) return;
  delete battleshipDrafts[battleshipDraftKey(code, mark)];
}

// --- Reveal subsystem + move action (relocated from the app shell) ---------

// Submit a battleship move (fleet placement or an attack) and reconcile the
// resulting room snapshot. Reads the live room via shell.getRoom() at each
// access — including after the await — so a mid-flight broadcast is honored
// exactly as it was when this lived on the shell.
async function makeBattleshipAction(action) {
  const player = shell.selectedPlayer();
  if (!player || !shell.getRoom() || !shell.isBattleshipGameState(shell.getRoom().game)) return;
  const selectedSeat = shell.getRoom().players.find((seat) => seat.id === player.id);
  if (!selectedSeat || shell.isBotPlayer(selectedSeat)) return;
  if (shell.getRoom().game.status === "playing" && selectedSeat.mark !== shell.getRoom().game.current_player) return;
  const moveKey = shell.moveIntentKey(shell.getRoom(), player.id, null, null, JSON.stringify(action));
  if (shell.getPendingMove()) return;
  playClick();
  shell.setPendingMove({
    key: moveKey,
    roomCode: shell.getRoom().code,
    moveCount: shell.getRoom().game.move_count,
  });
  shell.rerender();
  try {
    const response = await shell.api("/api/room/move", {
      code: shell.getRoom().code,
      player_id: player.id,
      owner_token: await shell.ensureOwnerToken(player.id),
      action, game_epoch: shell.getRoom().game_epoch,
    });
    shell.setPendingMove(null);
    // Don't clear reveals here: setRoom enqueues the fresh ones from the event
    // diff, and a live WebSocket broadcast may already be playing this move's
    // reveal before this response resolves.
    if (action.type === "place_fleet" || action.type === "auto_place") {
      const selectedSeatAfterMove = shell.getRoom().players.find((seat) => seat.id === player.id);
      clearBattleshipDraft(shell.getRoom().code, selectedSeatAfterMove && selectedSeatAfterMove.mark);
    }
    shell.setRoom(response.room);
  } catch (error) {
    shell.setPendingMove(null);
    clearBattleshipReveals();
    shell.rerender();
    shell.showTurnStatus(null, error.message);
    playInvalidMove();
  }
}

// A reveal plays in up to three phases: an optional "settle" pause (so the
// board can switch to the defending view), a radar scan, then the hit/miss
// result. Reveals are queued so a player's own offence reveal and the incoming
// defence reveal play back to back instead of clobbering each other.
function enqueueBattleshipReveals(reveals) {
  if (!reveals.length) return;
  battleshipRevealQueue.push(...reveals);
  if (!battleshipResultReveal) advanceBattleshipRevealQueue();
}

function advanceBattleshipRevealQueue() {
  const next = battleshipRevealQueue.shift();
  if (!next) {
    shell.rerender();
    return;
  }
  showBattleshipResultReveal(next);
}

function showBattleshipResultReveal(reveal) {
  const settleMs = Math.max(0, Number(reveal.settleMs || 0));
  const now = Date.now();
  const radarStart = now + settleMs;
  const radarUntil = radarStart + BATTLESHIP_RADAR_MS;
  const active = {
    ...reveal,
    pendingUntil: settleMs ? radarStart : 0,
    radarUntil,
    until: radarUntil + BATTLESHIP_RESULT_MS,
  };
  battleshipResultReveal = active;
  window.clearTimeout(battleshipResultTimer);
  // Repaint when the radar scan begins (after the settle pause)...
  if (settleMs) {
    window.setTimeout(() => {
      if (battleshipResultReveal === active) shell.rerender();
    }, settleMs);
  }
  // ...play the hit/miss cue and repaint when the scan resolves...
  window.setTimeout(() => {
    if (battleshipResultReveal !== active) return;
    if (active.hit) playBattleshipHit();
    else playBattleshipMiss();
    shell.rerender();
  }, radarUntil - now);
  // ...then clear and move on to the next queued reveal.
  battleshipResultTimer = window.setTimeout(() => {
    if (battleshipResultReveal !== active) return;
    battleshipResultReveal = null;
    advanceBattleshipRevealQueue();
  }, active.until - now);
  shell.rerender();
}

function clearBattleshipReveals() {
  battleshipRevealQueue = [];
  battleshipResultReveal = null;
  window.clearTimeout(battleshipResultTimer);
  battleshipResultTimer = null;
}

// Reveal every attack that landed since the last snapshot, in order. A bot
// game folds the human's shot and the bot's reply into one snapshot, so the
// diff (not last_move, which is always the bot's) is what surfaces the
// player's own offence reveal alongside the incoming defence reveal.
function showBattleshipAttackReveal(previousRoom, room) {
  if (!shell.isBattleshipGameState(room.game)) return;
  if (!previousRoom || !previousRoom.game || previousRoom.code !== room.code) return;
  const selectedSeat = battleshipViewerSeat(room);
  if (!selectedSeat) return;
  // Detect new attacks by content, not array index. The Worker caps game.events
  // to a sliding window (slice(-40)), so once a long game fills it the length
  // stops growing and an index diff would miss every later attack — that's why
  // reveals "stopped after a while". Cells are unique per player, so key on those.
  const attackKey = (move) => `${move.player}:${move.row}:${move.col}`;
  const seenAttacks = new Set(
    (Array.isArray(previousRoom.game.events) ? previousRoom.game.events : [])
      .filter((move) => move && move.type === "attack")
      .map(attackKey),
  );
  const events = Array.isArray(room.game.events) ? room.game.events : [];
  const newAttacks = events.filter((move) => move && move.type === "attack" && !seenAttacks.has(attackKey(move)));
  const reveals = [];
  const sunkByYou = [];
  for (const move of newAttacks) {
    const ownAttack = move.player === selectedSeat.mark;
    // The Worker keeps ship_id on a sinking move, so name the ship you just sank.
    if (ownAttack && move.sunk) {
      const ship = (room.game.fleet || []).find((item) => item.id === move.ship_id);
      sunkByYou.push(ship ? ship.name : "ship");
    }
    const view = ownAttack ? "offence" : "defence";
    if (battleshipViewMode !== "auto" && battleshipViewMode !== view) continue;
    reveals.push({
      code: room.code,
      player: selectedSeat.mark,
      view,
      row: Number(move.row),
      col: Number(move.col),
      hit: Boolean(move.hit),
      sunk: Boolean(move.sunk),
      attackText: randomBattleshipAttackPhrase(),
      resultText: randomBattleshipResultPhrase(Boolean(move.hit), Boolean(move.sunk)),
      settleMs: view === "defence" && battleshipViewMode === "auto" ? BATTLESHIP_DEFENCE_SETTLE_MS : 0,
    });
  }
  enqueueBattleshipReveals(reveals);
  for (const shipName of sunkByYou) shell.showInfoPrompt("Battleship", `You sunk my ${shipName}!`);
}

function syncBattleshipReviewMark(game) {
  if (!shell.isBattleshipGameState(game) || game.phase !== "complete") return;
  const room = shell.getRoom();
  const selectedSeat = battleshipViewerSeat(room);
  const currentReviewSeat = room.players.find((player) => player.mark === battleshipReviewMark);
  if (currentReviewSeat) return;
  battleshipReviewMark = selectedSeat && selectedSeat.mark || (room.players.find((player) => player.mark) || {}).mark || "";
}

function battleshipViewerSeat(room) {
  if (!room || !Array.isArray(room.players)) return null;
  return room.players.find((player) => player.id === shell.getDeviceSelectedPlayerId() && player.mark)
    || room.players.find((player) => player.id === shell.getSelectedPlayerId() && player.mark)
    || null;
}

function battleshipVisiblePlayer(activeView, reveal, selectedSeat, opponent, currentTurnPlayer) {
  if (reveal && reveal.view === "offence") return selectedSeat;
  if (reveal && reveal.view === "defence") return selectedSeat;
  if (activeView === "offence") return selectedSeat || currentTurnPlayer;
  if (activeView === "defence") return selectedSeat || currentTurnPlayer;
  return currentTurnPlayer || selectedSeat;
}

function activeBattleshipResultReveal(room, selectedSeat) {
  if (!room || !selectedSeat || !battleshipResultReveal) return null;
  if (battleshipResultReveal.code !== room.code || battleshipResultReveal.player !== selectedSeat.mark) return null;
  if (Date.now() > battleshipResultReveal.until) {
    battleshipResultReveal = null;
    return null;
  }
  return battleshipResultReveal;
}

// The mark whose board the player switch should highlight during live play.
function visibleBattleshipPlayerMark(room) {
  const selectedSeat = battleshipViewerSeat(room);
  const opponent = selectedSeat ? room.players.find((player) => player.mark && player.mark !== selectedSeat.mark) : null;
  const currentTurnPlayer = room.players.find((player) => player.mark === room.game.current_player);
  const reveal = activeBattleshipResultReveal(room, selectedSeat);
  const yourTurn = selectedSeat && selectedSeat.mark === room.game.current_player;
  const activeView = reveal && reveal.view
    ? reveal.view
    : battleshipViewMode === "auto" ? (yourTurn ? "offence" : "defence") : battleshipViewMode;
  const visiblePlayer = battleshipVisiblePlayer(activeView, reveal, selectedSeat, opponent, currentTurnPlayer);
  return visiblePlayer && visiblePlayer.mark || "";
}

// Review-mark accessors for the shell's completed-game player switch.
function getBattleshipReviewMark() {
  return battleshipReviewMark;
}

function setBattleshipReviewMark(mark) {
  battleshipReviewMark = mark;
}

export {
  renderBattleshipGame,
  clearBattleshipDraft,
  showBattleshipAttackReveal,
  syncBattleshipReviewMark,
  visibleBattleshipPlayerMark,
  getBattleshipReviewMark,
  setBattleshipReviewMark,
};
