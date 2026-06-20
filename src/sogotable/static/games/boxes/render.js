import { escapeHtml } from "../../html-utils.js";
import { allLineIds, boxLineIds, createLineId } from "./state.js";

export function renderBoxes(host, view, options = {}) {
  if (!host || !view) return;
  const lines = new Set(view.lines || []);
  const currentPlayer = view.players?.[view.currentPlayerIndex] || null;
  const resultText = resultLabel(view);
  host.innerHTML = `
    <section class="boxes-table" style="--box-cols:${Number(view.cols || 5)}; --box-rows:${Number(view.rows || 8)}; --grid-cols:${Number(view.cols || 5) * 2 + 1}; --grid-rows:${Number(view.rows || 8) * 2 + 1}">
      <header class="boxes-summary">
        <div>
          <h2>Dots and Boxes</h2>
          <p>${escapeHtml(resultText || turnLabel(currentPlayer, view))}</p>
        </div>
        <div class="boxes-metrics">
          <span>${escapeHtml(String(view.claimedLineCount || 0))}/${escapeHtml(String(view.totalLines || 0))} lines</span>
          <span>${escapeHtml(String(view.openLineCount || 0))} open</span>
        </div>
      </header>
      <div class="boxes-score-row">
        ${(view.players || []).map((player, index) => renderScorePill(player, index === view.currentPlayerIndex, view)).join("")}
      </div>
      <div class="boxes-board" role="grid" aria-label="Dots and Boxes board">
        ${renderBoardCells(view, lines, options)}
      </div>
    </section>
  `;
}

function renderBoardCells(view, lines, options) {
  const rows = Number(view.rows || 8);
  const cols = Number(view.cols || 5);
  const cells = [];
  for (let visualRow = 0; visualRow <= rows * 2; visualRow += 1) {
    for (let visualCol = 0; visualCol <= cols * 2; visualCol += 1) {
      if (visualRow % 2 === 0 && visualCol % 2 === 0) {
        cells.push(`<span class="dot" aria-hidden="true"></span>`);
      } else if (visualRow % 2 === 0) {
        const lineId = createLineId("h", visualRow / 2, Math.floor(visualCol / 2));
        cells.push(renderLineButton(lineId, "horizontal", view, lines, options));
      } else if (visualCol % 2 === 0) {
        const lineId = createLineId("v", Math.floor(visualRow / 2), visualCol / 2);
        cells.push(renderLineButton(lineId, "vertical", view, lines, options));
      } else {
        const boxRow = Math.floor(visualRow / 2);
        const boxCol = Math.floor(visualCol / 2);
        cells.push(renderBox(view, boxRow, boxCol, lines));
      }
    }
  }
  return cells.join("");
}

function renderLineButton(lineId, orientation, view, lines, options) {
  const claimed = lines.has(lineId);
  const owner = claimed ? ownerForLine(view, lineId) : null;
  const disabled = claimed || view.status === "complete" || options.disabled;
  const style = owner ? ` style="--owner-color:${escapeHtml(owner.color)}"` : "";
  const lastMove = view.lastMove?.lineId === lineId;
  return `
    <button
      class="edge edge-${orientation} ${claimed ? "claimed" : ""} ${lastMove ? "last-move" : ""}"
      type="button"
      data-line-id="${escapeHtml(lineId)}"
      aria-label="${escapeHtml(claimed ? `Claimed edge ${lineId}` : `Claim edge ${lineId}`)}"
      ${disabled ? "disabled" : ""}
      ${style}
    ></button>
  `;
}

function renderBox(view, row, col, lines) {
  const ownerId = view.boxes?.[row]?.[col] || "";
  const owner = (view.players || []).find((player) => player.id === ownerId);
  const sides = boxLineIds(row, col).filter((lineId) => lines.has(lineId)).length;
  const danger = !owner && sides === 3;
  const style = owner ? ` style="--owner-color:${escapeHtml(owner.color)}"` : "";
  const ownerIcon = owner ? owner.icon || "🙂" : "";
  return `
    <div class="box-cell ${owner ? "owned" : ""} ${danger ? "danger" : ""}"${style}>
      ${owner ? `<span aria-label="${escapeHtml(owner.name)} claimed this box">${escapeHtml(ownerIcon)}</span>` : ""}
    </div>
  `;
}

function renderScorePill(player, active, view) {
  const won = view.result?.winnerId === player.id;
  return `
    <div class="score-pill ${active && view.status !== "complete" ? "active" : ""} ${won ? "winner" : ""}" style="--player-color:${escapeHtml(player.color)}">
      <span class="player-mark">${escapeHtml(player.icon || "🙂")}</span>
      <strong>${escapeHtml(player.name)}</strong>
      <span>${escapeHtml(String(player.score || 0))}</span>
    </div>
  `;
}

function ownerForLine(view, lineId) {
  const entry = (view.log || []).slice().reverse().find((item) => item.lineId === lineId);
  return (view.players || []).find((player) => player.id === entry?.playerId) || null;
}

function turnLabel(player, view) {
  if (!player) return "Waiting for players.";
  const lastCapture = Array.isArray(view.lastMove?.captured) && view.lastMove.captured.length;
  if (lastCapture) return `${player.name} scored and plays again.`;
  return `${player.name}'s turn.`;
}

function resultLabel(view) {
  if (view.status !== "complete") return "";
  if (view.result?.outcome === "draw") return "Draw game.";
  const winner = (view.players || []).find((player) => player.id === view.result?.winnerId);
  return winner ? `${winner.name} wins.` : "Game complete.";
}

export function lineIdsForView(view) {
  return allLineIds(Number(view?.rows || 8), Number(view?.cols || 5));
}
