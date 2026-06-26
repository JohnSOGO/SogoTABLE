// Browser-side adapter for Battleship (Phase 2): the setup/play/grid renderers
// and their geometry + draft helpers. The hard part of this game is the reveal
// animation system, which STAYS in the app shell (the scheduler owns the timers
// and the reveal/queue/view-mode/review-mark state). This module renders from a
// ctx bag each frame and calls back through it: it reads the active reveal via
// ctx.activeReveal(), reads/writes view-mode + review-mark via ctx getters/
// setters, and triggers moves/clears/repaints via ctx.makeAction/clearReveals/
// rerender. The shell keeps battleshipViewerSeat, battleshipVisiblePlayer, the
// phrase pickers, activeBattleshipResultReveal, makeBattleshipAction, and the
// isBattleshipGameState predicate. Only the ship-placement draft state lives
// here (module-private); clearBattleshipDraft is exported for the shell's POST.
import { actionLabelStyle } from "../../storage.js";

// Module-private fleet-placement state (was on the app shell).
let battleshipSelectedShipId = "carrier";
let battleshipDrafts = {};
// Latest render ctx, stored so the cell/button handlers created during a render
// see current shell state when they fire.
let ctx = null;

function renderBattleshipGame(renderCtx) {
  ctx = renderCtx;
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

export { renderBattleshipGame, clearBattleshipDraft };
