// Browser-side adapter for Quoridor (Phase 2): the board renderer plus its
// interaction state (pawn/wall mode, the draft wall, and the press-and-hold wall
// commit). Unlike the read-only Boxes client, Quoridor owns local UI state, so it
// keeps it module-private here instead of on the app shell. The shell keeps the
// `isQuoridorGameState` predicate and the `makeQuoridorAction` move POST, and
// passes a ctx bag each render; deferred handlers (the hold timer) read the
// latest ctx stored at module scope. `resetQuoridorDraft` lets the shell's POST
// clear the draft after a committed move.

// Module-private interaction state (was on the app shell).
let quoridorMode = "pawn";
let quoridorDraftWall = null;
let quoridorWallHoldTimer = null;
let quoridorWallHoldButton = null;
// Latest render ctx, so event handlers that fire after render (and the 1s wall
// hold timer) see current shell state without threading ctx through every node.
let ctx = null;

export function renderQuoridorGame(renderCtx) {
  ctx = renderCtx;
  const { game, room, selectedPlayerId } = ctx;
  clearQuoridorWallHold();
  const host = document.getElementById("macroBoard");
  host.className = "macro-board quoridor-room-board";
  host.innerHTML = "";
  if (!room.started) {
    ctx.showTurnStatus(null, "Waiting for opponent.");
    return;
  }
  const currentTurnPlayer = room.players.find((player) => player.mark === game.current_player);
  const selectedSeat = room.players.find((player) => player.id === selectedPlayerId);
  const canSelectedPlayerMove = ctx.canRoomSeatMove(selectedSeat, game);
  if (!canSelectedPlayerMove || game.status !== "playing" || !quoridorDraftWall || !quoridorWallIsLegalDraft(game, quoridorDraftWall)) {
    quoridorDraftWall = null;
  }
  ctx.setTurnColorVariables(host, currentTurnPlayer ? currentTurnPlayer.color : "#1f7a5f");
  host.classList.toggle("your-turn", canSelectedPlayerMove && game.status === "playing");
  host.classList.toggle("waiting", game.status === "playing" && !canSelectedPlayerMove);
  if (game.status === "playing") {
    ctx.showTurnStatus(currentTurnPlayer, canSelectedPlayerMove ? `${selectedSeat.name}'s move.` : `Waiting for ${currentTurnPlayer ? currentTurnPlayer.name : "opponent"}.`);
  } else {
    const winner = room.players.find((player) => player.mark === game.winner);
    ctx.showTurnStatus(winner, `${winner ? winner.name : "Player"} wins.`);
    ctx.scheduleWinOverlay(winner, game.winner);
  }

  const table = document.createElement("section");
  table.className = "quoridor-table";
  const controlsDisabled = !canSelectedPlayerMove || game.status !== "playing" || ctx.pendingMove;
  table.innerHTML = `
    <div class="quoridor-score-row">
      ${room.players.map((player) => quoridorScoreHtml(player, game)).join("")}
    </div>
    <div class="quoridor-toolbar" role="group" aria-label="Quoridor move type">
      <button type="button" data-quoridor-mode="pawn" class="${quoridorMode === "pawn" ? "selected" : ""}" ${controlsDisabled ? "disabled" : ""}>Move Pawn</button>
      <button type="button" data-quoridor-mode="wall" class="${quoridorMode === "wall" ? "selected" : ""}" ${controlsDisabled ? "disabled" : ""}>Place Wall</button>
    </div>
    <div class="quoridor-board" role="grid" aria-label="Quoridor board"></div>
  `;
  table.querySelectorAll("[data-quoridor-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.quoridorMode;
      if (mode === "pawn") {
        quoridorMode = "pawn";
        quoridorDraftWall = null;
      } else if (quoridorMode === "wall" && quoridorDraftWall && canSelectedPlayerMove) {
        ctx.makeAction({ type: "place_wall", ...quoridorDraftWall });
        return;
      } else {
        quoridorMode = "wall";
      }
      ctx.rerender();
    });
  });
  renderQuoridorBoard(table.querySelector(".quoridor-board"), game, selectedSeat, canSelectedPlayerMove);
  host.appendChild(table);
}

// Clear the draft + hold state after the shell POSTs a committed move.
export function resetQuoridorDraft() {
  clearQuoridorWallHold();
  quoridorDraftWall = null;
}

function quoridorScoreHtml(player, game) {
  const active = game.status === "playing" && player.mark === game.current_player;
  const walls = Number(game.walls_remaining && game.walls_remaining[player.mark] || 0);
  const color = ctx.safePlayerColor(player);
  return `
    <div class="quoridor-score ${active ? "active" : ""}" style="--player-color:${ctx.escapeHtml(color)}">
      ${ctx.avatarHtml(player)}
      <strong>${ctx.escapeHtml(player.name)}</strong>
      <b>${ctx.escapeHtml(String(walls))}</b>
    </div>
  `;
}

function renderQuoridorBoard(grid, game, selectedSeat, canSelectedPlayerMove) {
  const size = Number(game.board_size || 9);
  const legalPawnMoves = new Set((game.legal_pawn_moves || []).map((move) => `${move.row}:${move.col}`));
  const legalWalls = new Set((game.legal_walls || []).map((wall) => quoridorWallId(wall.orientation, wall.row, wall.col)));
  const wallList = [...(game.walls || []), ...(quoridorDraftWall ? [{ ...quoridorDraftWall, temporary: true }] : [])];
  const currentColor = selectedSeat ? ctx.safePlayerColor(selectedSeat) : "#1f7a5f";
  grid.style.setProperty("--quoridor-active-color", currentColor);
  grid.innerHTML = "";
  grid.addEventListener("click", (event) => {
    if (!canSelectedPlayerMove || ctx.pendingMove || quoridorMode === "wall") return;
    if (event.target.closest(".quoridor-wall-dot")) return;
    if (event.target.closest(".quoridor-cell.legal")) return;
    if (event.target.closest(".quoridor-cell.own-pawn-control")) return;
    quoridorMode = "wall";
    quoridorDraftWall = null;
    ctx.rerender();
  });
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      grid.appendChild(quoridorCellButton(game, row, col, legalPawnMoves, canSelectedPlayerMove, selectedSeat));
    }
  }
  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      grid.appendChild(quoridorWallVisual("h", row, col, wallList));
      grid.appendChild(quoridorWallVisual("v", row, col, wallList));
      if (quoridorMode === "wall") {
        const dot = quoridorWallDot(row, col, legalWalls, canSelectedPlayerMove);
        if (dot) grid.appendChild(dot);
      }
    }
  }
}

function quoridorCellButton(game, row, col, legalPawnMoves, canSelectedPlayerMove, selectedSeat) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "quoridor-cell";
  button.style.gridRow = String(row * 2 + 1);
  button.style.gridColumn = String(col * 2 + 1);
  button.setAttribute("aria-label", `Row ${row + 1}, Column ${col + 1}`);
  const occupant = ctx.room.players.find((player) => {
    const pawn = game.pawns && game.pawns[player.mark];
    return pawn && pawn.row === row && pawn.col === col;
  });
  if (occupant) {
    button.classList.add("occupied");
    button.style.setProperty("--pawn-color", ctx.safePlayerColor(occupant));
    button.textContent = occupant.icon || "🙂";
    button.setAttribute("aria-label", `${occupant.name} pawn`);
  }
  const legal = canSelectedPlayerMove && quoridorMode === "pawn" && legalPawnMoves.has(`${row}:${col}`);
  const ownPawnControl = canSelectedPlayerMove && occupant && selectedSeat && occupant.mark === selectedSeat.mark;
  button.classList.toggle("legal", legal);
  button.classList.toggle("own-pawn-control", ownPawnControl);
  // Goal-row tint: each player's goal row (the far edge they race toward) is
  // faintly washed in that player's colour so the destination is visible. A
  // player's start row is the opponent's goal, so while the home pawn sits on it
  // its own cell keeps the stronger pawn styling and the rest of the row reads as
  // the opponent's colour — once the pawn steps off, the whole row does. The wash
  // is skipped on occupied and legal-move cells so it never hides those cues.
  const goalOwner = ctx.room.players.find((player) => {
    const pawn = game.pawns && game.pawns[player.mark];
    return pawn && Number(pawn.goal) === row;
  });
  if (goalOwner && !occupant && !legal) {
    button.classList.add("goal");
    button.style.setProperty("--goal-color", ctx.safePlayerColor(goalOwner));
    button.setAttribute("aria-label", `Row ${row + 1}, Column ${col + 1}, ${goalOwner.name}'s goal`);
  }
  button.disabled = Boolean(ctx.pendingMove);
  if (legal) button.addEventListener("click", () => ctx.makeAction({ type: "move_pawn", row, col }));
  else if (ownPawnControl) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      quoridorMode = "pawn";
      quoridorDraftWall = null;
      ctx.rerender();
    });
  } else if (canSelectedPlayerMove) {
    button.addEventListener("click", () => {
      if (ctx.pendingMove || quoridorMode === "wall") return;
      quoridorMode = "wall";
      quoridorDraftWall = null;
      ctx.rerender();
    });
  }
  return button;
}

function quoridorWallVisual(orientation, row, col, walls) {
  const wall = document.createElement("div");
  const placed = walls.find((item) => item.orientation === orientation && item.row === row && item.col === col);
  wall.className = `quoridor-wall quoridor-wall-${orientation} ${placed ? "placed" : ""} ${placed && placed.temporary ? "temporary" : ""}`;
  wall.style.gridRow = orientation === "h" ? String(row * 2 + 2) : `${row * 2 + 1} / span 3`;
  wall.style.gridColumn = orientation === "h" ? `${col * 2 + 1} / span 3` : String(col * 2 + 2);
  wall.setAttribute("aria-hidden", "true");
  return wall;
}

function quoridorWallDot(row, col, legalWalls, canSelectedPlayerMove) {
  const horizontalLegal = legalWalls.has(quoridorWallId("h", row, col));
  const verticalLegal = legalWalls.has(quoridorWallId("v", row, col));
  const legal = canSelectedPlayerMove && (horizontalLegal || verticalLegal);
  if (!legal) return null;
  const button = document.createElement("button");
  button.type = "button";
  const selected = quoridorDraftWall && quoridorDraftWall.row === row && quoridorDraftWall.col === col;
  button.className = `quoridor-wall-dot ${selected ? "selected" : ""}`;
  button.style.gridRow = String(row * 2 + 2);
  button.style.gridColumn = String(col * 2 + 2);
  button.setAttribute("aria-label", `Wall anchor ${row + 1}, ${col + 1}`);
  button.innerHTML = '<span class="quoridor-wall-hold-progress" aria-hidden="true"></span>';
  button.disabled = Boolean(ctx.pendingMove);
  button.addEventListener("click", () => {
    if (button.dataset.wallHold === "committed") {
      button.dataset.wallHold = "";
      return;
    }
    quoridorDraftWall = nextQuoridorDraftWall(row, col, horizontalLegal, verticalLegal);
    ctx.rerender();
  });
  if (selected) {
    button.addEventListener("pointerdown", (event) => startQuoridorWallHold(event, button));
    button.addEventListener("pointerup", () => cancelQuoridorWallHold(button));
    button.addEventListener("pointercancel", () => cancelQuoridorWallHold(button));
    button.addEventListener("pointerleave", () => cancelQuoridorWallHold(button));
    button.addEventListener("contextmenu", (event) => event.preventDefault());
  }
  return button;
}

function startQuoridorWallHold(event, button) {
  if (!quoridorDraftWall || ctx.pendingMove || !ctx.game) return;
  if (!quoridorWallIsLegalDraft(ctx.game, quoridorDraftWall)) return;
  event.preventDefault();
  clearQuoridorWallHold();
  quoridorWallHoldButton = button;
  button.dataset.wallHold = "pending";
  button.classList.add("holding");
  if (event.pointerId !== undefined && button.setPointerCapture) {
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort on older mobile browsers.
    }
  }
  quoridorWallHoldTimer = setTimeout(() => {
    if (!quoridorDraftWall || button.dataset.wallHold !== "pending") return;
    button.dataset.wallHold = "committed";
    button.classList.remove("holding");
    ctx.makeAction({ type: "place_wall", ...quoridorDraftWall });
  }, 1000);
}

function cancelQuoridorWallHold(button) {
  if (!button || button.dataset.wallHold === "committed") return;
  clearQuoridorWallHold();
}

function clearQuoridorWallHold() {
  if (quoridorWallHoldTimer) clearTimeout(quoridorWallHoldTimer);
  quoridorWallHoldTimer = null;
  if (quoridorWallHoldButton) {
    quoridorWallHoldButton.classList.remove("holding");
    if (quoridorWallHoldButton.dataset.wallHold !== "committed") quoridorWallHoldButton.dataset.wallHold = "";
  }
  quoridorWallHoldButton = null;
}

function nextQuoridorDraftWall(row, col, horizontalLegal, verticalLegal) {
  if (quoridorDraftWall && quoridorDraftWall.row === row && quoridorDraftWall.col === col) {
    const nextOrientation = quoridorDraftWall.orientation === "h" ? "v" : "h";
    if (nextOrientation === "h" && horizontalLegal) return { orientation: "h", row, col };
    if (nextOrientation === "v" && verticalLegal) return { orientation: "v", row, col };
    return { ...quoridorDraftWall };
  }
  if (horizontalLegal) return { orientation: "h", row, col };
  return { orientation: "v", row, col };
}

function quoridorWallIsLegalDraft(game, wall) {
  if (!wall) return false;
  return (game.legal_walls || []).some((item) => item.orientation === wall.orientation && item.row === wall.row && item.col === wall.col);
}

function quoridorWallId(orientation, row, col) {
  return `${orientation === "v" ? "v" : "h"}-${Number(row)}-${Number(col)}`;
}
