const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

// Dark-mode board palette (shared by Super Tic Tac Toe and the Tactical
// variant, which renders through this module). The light board lives in
// styles-games.css; this theme-gated block re-skins only the dark theme and is
// injected from the module so the line-capped shared stylesheet stays light
// (see Battleship/Quoridor). Marks (--x/--o), turn-soft boards, and the amber
// win/pickup cues are already theme-aware or pop on dark, so only the neutral
// board/cell surfaces and the pickup tints are darkened here.
const SUPER_TTT_DARK_CSS = `
:root[data-theme="dark"] .small-board {
  border-color: #3a4456;
  background: #1b232f;
}
:root[data-theme="dark"] .cell {
  border-color: #33404f;
  background: #222c3a;
}
:root[data-theme="dark"] .cell.pickup {
  background: #2c2613;
  border-color: #6a5a26;
}
:root[data-theme="dark"] .cell.pickup.treasureChest {
  background: #241b33;
  border-color: #5b4a82;
}`;

// Inject the dark palette once. CSS is theme-gated, so it is inert in light mode.
function ensureSuperTttTheme() {
  if (typeof document === "undefined" || document.getElementById("super-ttt-theme")) return;
  const styleEl = document.createElement("style");
  styleEl.id = "super-ttt-theme";
  styleEl.textContent = SUPER_TTT_DARK_CSS;
  document.head.appendChild(styleEl);
}

export function renderSuperTicTacToeBoard({
  host,
  room,
  selectedPlayerId,
  pendingMove,
  lastLegalBoardsKey = "",
  setTurnColorVariables,
  canRoomSeatMove,
  applyBoardResultColor,
  applyMarkColor,
  pickupAtCell,
  moveIntentKey,
  makeMove,
}) {
  if (!host || !room || !room.game) return lastLegalBoardsKey;
  ensureSuperTttTheme();
  const game = room.game;
  host.className = "macro-board";
  host.innerHTML = "";

  const currentTurnPlayer = room.players.find((player) => player.mark === game.current_player);
  setTurnColorVariables(host, currentTurnPlayer ? currentTurnPlayer.color : "#1f7a5f");

  const legalBoards = Array.isArray(game.legal_boards) ? game.legal_boards : [];
  const legalBoardsKey = legalBoards.join(",");
  const shouldFlashLegalBoards = legalBoardsKey !== lastLegalBoardsKey;
  const macroWinLine = winningLineFor(game.small_winners || [], game.line_winner || game.winner);
  const selectedSeat = room.players.find((player) => player.id === selectedPlayerId);
  const canSelectedPlayerMove = canRoomSeatMove(selectedSeat, game);

  host.classList.toggle("your-turn", canSelectedPlayerMove && game.status === "playing");
  host.classList.toggle("waiting", game.status === "playing" && !canSelectedPlayerMove);

  (game.boards || []).forEach((board, boardIndex) => {
    const small = document.createElement("div");
    const legal = room.started && legalBoards.includes(boardIndex);
    const result = game.small_winners && game.small_winners[boardIndex];
    const smallWinLine = winningLineFor(board, result);
    const macroWinner = macroWinLine.includes(boardIndex);
    small.className = `small-board ${legal ? "legal" : ""} ${legal && shouldFlashLegalBoards ? "flash" : ""} ${result ? "done" : ""} ${macroWinner ? "macro-win-cell" : ""}`;
    applyBoardResultColor(small, result);

    (board || []).forEach((value, cellIndex) => {
      const pickup = value ? null : pickupAtCell(game, boardIndex, cellIndex);
      const cell = document.createElement("button");
      cell.type = "button";
      const smallWinner = smallWinLine.includes(cellIndex);
      cell.className = `cell ${value ? value.toLowerCase() : ""} ${pickup ? `pickup ${pickup.type}` : ""} ${smallWinner ? "small-win-cell" : ""}`;
      cell.textContent = value || (pickup ? pickup.emoji : "");
      if (pickup && !value) cell.title = `${pickup.label || pickup.type} +${pickup.points}`;
      applyMarkColor(cell, value);

      const moveKey = moveIntentKey(room, selectedPlayerId, boardIndex, cellIndex);
      const isPendingMove = Boolean(pendingMove && pendingMove.key === moveKey);
      cell.disabled = Boolean(value || result || !legal || game.status !== "playing" || !canSelectedPlayerMove || pendingMove);
      cell.classList.toggle("pending", isPendingMove);
      cell.addEventListener("click", () => makeMove(boardIndex, cellIndex));
      cell.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse") return;
        event.preventDefault();
        makeMove(boardIndex, cellIndex);
      });
      small.appendChild(cell);
    });

    if (result) {
      const winner = document.createElement("div");
      winner.className = `board-winner ${result.toLowerCase()}`;
      winner.textContent = result;
      applyMarkColor(winner, result, 0.34);
      small.appendChild(winner);
    }

    host.appendChild(small);
  });

  if (macroWinLine.length) {
    const line = document.createElement("div");
    line.className = `macro-win-line ${winLineClass(macroWinLine)}`;
    host.appendChild(line);
  }

  return legalBoardsKey;
}

export function winningLineFor(values, winner) {
  if (!winner || winner === "D") return [];
  const line = WIN_LINES.find(([a, b, c]) => values[a] === winner && values[b] === winner && values[c] === winner);
  return line || [];
}

function winLineClass(line) {
  const key = line.join("-");
  const classes = {
    "0-1-2": "row-0",
    "3-4-5": "row-1",
    "6-7-8": "row-2",
    "0-3-6": "col-0",
    "1-4-7": "col-1",
    "2-5-8": "col-2",
    "0-4-8": "diag-down",
    "2-4-6": "diag-up",
  };
  return classes[key] || "";
}

