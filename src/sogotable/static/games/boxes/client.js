// Browser-side adapter for Dots and Boxes (Phase 2): the board renderer and the
// edge-click action. Extracted from the app shell, it follows the same contract
// as the other render modules — a single entry that receives a ctx bag of the
// shell helpers it needs, so it owns no global state. The shell keeps the
// `isBoxesGameState` predicate, the capture sound, and the render-cache fields.
//
// NOTE: this is the live app's Boxes client. It is separate from the standalone
// `games/boxes/` lab files (render.js/rules.js/state.js), which use a different
// data model and are not wired into the app.

export function renderBoxesGame(ctx) {
  const { host, game, room, selectedPlayerId, pendingMove, canRoomSeatMove, setTurnColorVariables } = ctx;
  host.className = "macro-board";
  host.innerHTML = "";
  host.className = "macro-board boxes-room-board";
  const currentTurnPlayer = room.players.find((player) => player.mark === game.current_player);
  const selectedSeat = room.players.find((player) => player.id === selectedPlayerId);
  const canSelectedPlayerMove = canRoomSeatMove(selectedSeat, game);
  setTurnColorVariables(host, currentTurnPlayer ? currentTurnPlayer.color : "#1f7a5f");
  host.classList.toggle("your-turn", canSelectedPlayerMove && game.status === "playing");
  host.classList.toggle("waiting", game.status === "playing" && !canSelectedPlayerMove);

  const lines = new Set(game.lines || []);
  const rows = Number(game.rows || 4);
  const cols = Number(game.cols || 4);
  const table = document.createElement("section");
  table.className = "boxes-room-table";
  table.style.setProperty("--boxes-grid-cols", String(cols * 2 + 1));
  table.style.setProperty("--boxes-grid-rows", String(rows * 2 + 1));
  table.innerHTML = `
    <div class="boxes-room-score-row">
      ${room.players.map((player) => boxesScoreHtml(player, game, ctx)).join("")}
    </div>
    <div class="boxes-room-grid" role="grid" aria-label="Dots and Boxes board"></div>
  `;
  const grid = table.querySelector(".boxes-room-grid");
  for (let visualRow = 0; visualRow <= rows * 2; visualRow += 1) {
    for (let visualCol = 0; visualCol <= cols * 2; visualCol += 1) {
      if (visualRow % 2 === 0 && visualCol % 2 === 0) {
        const dot = document.createElement("span");
        dot.className = "boxes-dot";
        dot.setAttribute("aria-hidden", "true");
        grid.appendChild(dot);
      } else if (visualRow % 2 === 0) {
        const lineId = boxesLineId("h", visualRow / 2, Math.floor(visualCol / 2));
        grid.appendChild(boxesLineButton(lineId, "horizontal", game, lines, canSelectedPlayerMove, ctx));
      } else if (visualCol % 2 === 0) {
        const lineId = boxesLineId("v", Math.floor(visualRow / 2), visualCol / 2);
        grid.appendChild(boxesLineButton(lineId, "vertical", game, lines, canSelectedPlayerMove, ctx));
      } else {
        grid.appendChild(boxesCell(game, Math.floor(visualRow / 2), Math.floor(visualCol / 2), lines, ctx));
      }
    }
  }
  host.appendChild(table);
}

function boxesScoreHtml(player, game, ctx) {
  const { safePlayerColor, escapeHtml, avatarHtml } = ctx;
  const active = game.status === "playing" && player.mark === game.current_player;
  const score = Number(game.scores && game.scores[player.mark] || 0);
  const color = safePlayerColor(player);
  return `
    <div class="boxes-room-score ${active ? "active" : ""}" style="--player-color:${escapeHtml(color)}">
      ${avatarHtml(player)}
      <strong>${escapeHtml(player.name)}</strong>
      <b>${escapeHtml(String(score))}</b>
    </div>
  `;
}

function boxesLineButton(lineId, orientation, game, lines, canSelectedPlayerMove, ctx) {
  const { room, selectedPlayerId, pendingMove, safePlayerColor, moveIntentKey, makeMove } = ctx;
  const claimed = lines.has(lineId);
  const owner = claimed ? boxesLineOwner(game, lineId) : null;
  const ownerPlayer = owner ? room.players.find((player) => player.mark === owner) : null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `boxes-edge boxes-edge-${orientation} ${claimed ? "claimed" : ""} ${game.last_move && game.last_move.line_id === lineId ? "last-move" : ""}`;
  button.dataset.lineId = lineId;
  button.setAttribute("aria-label", claimed ? `Claimed edge ${lineId}` : `Claim edge ${lineId}`);
  if (ownerPlayer) button.style.setProperty("--owner-color", safePlayerColor(ownerPlayer));
  const moveKey = moveIntentKey(room, selectedPlayerId, null, null, lineId);
  button.classList.toggle("pending", Boolean(pendingMove && pendingMove.key === moveKey));
  button.disabled = Boolean(claimed || game.status !== "playing" || !canSelectedPlayerMove || pendingMove);
  button.addEventListener("click", () => makeMove(null, null, lineId));
  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    event.preventDefault();
    makeMove(null, null, lineId);
  });
  return button;
}

function boxesCell(game, row, col, lines, ctx) {
  const { room, safePlayerColor } = ctx;
  const owner = game.boxes && game.boxes[row] && game.boxes[row][col];
  const ownerPlayer = owner ? room.players.find((player) => player.mark === owner) : null;
  const sides = boxesBoxLineIds(row, col).filter((lineId) => lines.has(lineId)).length;
  const cell = document.createElement("div");
  cell.className = `boxes-cell ${owner ? "owned" : ""} ${!owner && sides === 3 ? "danger" : ""}`;
  if (ownerPlayer) {
    cell.style.setProperty("--owner-color", safePlayerColor(ownerPlayer));
    const ownerIndex = room.players.indexOf(ownerPlayer);
    const mark = document.createElement("span");
    mark.textContent = ownerPlayer.icon || (ownerIndex === 1 ? "😎" : "🙂");
    mark.setAttribute("aria-label", `${ownerPlayer.name || "Player"} claimed this box`);
    cell.appendChild(mark);
  }
  return cell;
}

function boxesLineOwner(game, lineId) {
  const entry = (game.events || []).slice().reverse().find((event) => event.line_id === lineId);
  return entry ? entry.player : game.last_move && game.last_move.line_id === lineId ? game.last_move.player : null;
}

function boxesLineId(orientation, row, col) {
  return `${orientation === "v" ? "v" : "h"}-${Number(row)}-${Number(col)}`;
}

function boxesBoxLineIds(row, col) {
  return [
    boxesLineId("h", row, col),
    boxesLineId("h", row + 1, col),
    boxesLineId("v", row, col),
    boxesLineId("v", row, col + 1),
  ];
}
