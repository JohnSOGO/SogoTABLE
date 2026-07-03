// Super Tic-Tac-Toe + Super-Tactical-Toe — server-authoritative rules for the
// platform's two default games (they share the 9x9 macro board, win lines, and
// move validation; Tactical adds pickups/treasure and score-based winners).
// Phase 2 game module, esbuild-bundled into the Worker. Pure logic.
//
// The Worker keeps the dispatch glue that weaves these in: the makeMove router,
// the inline newGame board creation, and the scored bot (chooseScoredBotMove/
// scoreBotMove) — all of which call the exports below. The isTacticalGame
// predicate moved here alongside the other games' isXGame exports when
// workers/stats.js was extracted. pushGameEvent lives here because only these
// games emit events.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { cleanGameId } from "../../game-catalog.js";

const TACTICAL_GAME_ID = GAME_IDS.tactical;

export function isTacticalGame(game) {
  return game && (cleanGameId(game.game_id) === TACTICAL_GAME_ID || Array.isArray(game.pickups));
}

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

const TACTICAL_PICKUP_CONFIG = {
  coin: {
    emoji: "\uD83E\uDE99",
    label: "Coin",
    points: 10,
    maxActive: 5,
  },
  treasureChest: {
    emoji: "\uD83C\uDF81",
    label: "Treasure Chest",
    points: 25,
    maxActive: 3,
  },
};

function legalBoards(game) {
  if (game.status !== "playing") return [];
  if (game.next_board !== null && boardAvailable(game, game.next_board)) return [game.next_board];
  return game.boards.map((_, index) => index).filter((index) => boardAvailable(game, index));
}

function boardAvailable(game, boardIndex) {
  return game.small_winners[boardIndex] === null && game.boards[boardIndex].some((cell) => cell === null);
}

function makeClassicMove(game, boardIndex, cellIndex) {
  validateMove(game, boardIndex, cellIndex);
  const player = game.current_player;
  game.boards[boardIndex][cellIndex] = player;
  game.move_count += 1;
  game.small_winners[boardIndex] = smallBoardResult(game.boards[boardIndex]);
  const macroWinner = macroWinnerFor(game.small_winners);
  if (macroWinner) {
    game.status = macroWinner === "X" ? "x_won" : "o_won";
    game.winner = macroWinner;
    game.next_board = null;
    return;
  }
  if (game.small_winners.every((result) => result !== null)) {
    game.status = "draw";
    game.winner = null;
    game.next_board = null;
    return;
  }
  game.current_player = player === "X" ? "O" : "X";
  game.next_board = boardAvailable(game, cellIndex) ? cellIndex : null;
}

function makeTacticalMove(game, boardIndex, cellIndex) {
  validateMove(game, boardIndex, cellIndex);
  ensureTacticalState(game);
  const player = game.current_player;
  const pickup = pickupAt(game, boardIndex, cellIndex);

  game.boards[boardIndex][cellIndex] = player;
  game.move_count += 1;
  pushGameEvent(game, {
    type: "movePlaced",
    player,
    board: boardIndex,
    sector: boardIndex,
    cell: cellIndex,
  });

  if (pickup) capturePickup(game, pickup, player);

  const previousSectorResult = game.small_winners[boardIndex];
  game.small_winners[boardIndex] = smallBoardResult(game.boards[boardIndex]);
  const capturedSector = previousSectorResult === null && ["X", "O"].includes(game.small_winners[boardIndex]);
  if (capturedSector) {
    pushGameEvent(game, {
      type: "sectorCaptured",
      player,
      board: boardIndex,
      sector: boardIndex,
    });
    spawnRandomPickup(game, "treasureChest");
  }

  spawnRandomPickup(game, "coin");

  const lineWinner = macroWinnerFor(game.small_winners);
  if (lineWinner) {
    const winner = tacticalLineWinner(game, lineWinner);
    game.line_winner = lineWinner;
    game.status = winner ? (winner === "X" ? "x_won" : "o_won") : "draw";
    game.winner = winner;
    game.next_board = null;
    return;
  }
  if (game.small_winners.every((result) => result !== null)) {
    const tiebreakWinner = tacticalBoardFilledWinner(game);
    game.status = tiebreakWinner ? (tiebreakWinner === "X" ? "x_won" : "o_won") : "draw";
    game.winner = tiebreakWinner;
    game.next_board = null;
    return;
  }

  game.current_player = player === "X" ? "O" : "X";
  game.next_board = boardAvailable(game, cellIndex) ? cellIndex : null;
}

function validateMove(game, boardIndex, cellIndex) {
  if (game.status !== "playing") throw new Error("Game is already over.");
  if (!Number.isInteger(boardIndex) || boardIndex < 0 || boardIndex > 8) throw new Error("Board index must be 0 through 8.");
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 8) throw new Error("Cell index must be 0 through 8.");
  if (!legalBoards(game).includes(boardIndex)) throw new Error("Move must be played in the required board.");
  if (game.boards[boardIndex][cellIndex] !== null) throw new Error("Cell is already occupied.");
}

function smallBoardResult(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every((cell) => cell !== null) ? "D" : null;
}

function macroWinnerFor(smallWinners) {
  for (const [a, b, c] of WIN_LINES) {
    if (["X", "O"].includes(smallWinners[a]) && smallWinners[a] === smallWinners[b] && smallWinners[a] === smallWinners[c]) {
      return smallWinners[a];
    }
  }
  return null;
}

function ensureTacticalState(game) {
  if (!game.pickups) game.pickups = [];
  if (!game.scores) game.scores = { X: 0, O: 0 };
  if (!game.captures) {
    game.captures = {
      X: { coin: 0, treasureChest: 0 },
      O: { coin: 0, treasureChest: 0 },
    };
  }
  if (!game.events) game.events = [];
}

function pickupAt(game, boardIndex, cellIndex) {
  ensureTacticalState(game);
  return game.pickups.find((pickup) => pickup.board === boardIndex && pickup.cell === cellIndex) || null;
}

function capturePickup(game, pickup, player) {
  const config = TACTICAL_PICKUP_CONFIG[pickup.type];
  if (!config) return;
  game.scores[player] = Number(game.scores[player] || 0) + config.points;
  game.pickups = game.pickups.filter((item) => item.id !== pickup.id);
  if (!game.captures[player]) game.captures[player] = { coin: 0, treasureChest: 0 };
  game.captures[player][pickup.type] = Number(game.captures[player][pickup.type] || 0) + 1;
  pushGameEvent(game, {
    type: "pickupCaptured",
    player,
    pickup_type: pickup.type,
    pickup_label: config.label,
    points: config.points,
    emoji: config.emoji,
  });
}

function spawnRandomPickup(game, type) {
  ensureTacticalState(game);
  const config = TACTICAL_PICKUP_CONFIG[type];
  if (!config) return;
  const openCells = tacticalOpenCells(game);
  if (!openCells.length) return;
  const cell = openCells[Math.floor(Math.random() * openCells.length)];
  const existingOfType = game.pickups.filter((pickup) => pickup.type === type);
  if (existingOfType.length >= config.maxActive) {
    const oldest = existingOfType.sort((left, right) => left.created_at_turn - right.created_at_turn)[0];
    game.pickups = game.pickups.filter((pickup) => pickup.id !== oldest.id);
  }
  const pickup = {
    id: `${type}:${game.move_count}:${Math.random().toString(36).slice(2, 8)}`,
    type,
    label: config.label,
    emoji: config.emoji,
    points: config.points,
    board: cell.board,
    sector: cell.board,
    cell: cell.cell,
    created_at_turn: game.move_count,
  };
  game.pickups.push(pickup);
  pushGameEvent(game, {
    type: "pickupSpawned",
    pickup_type: type,
    pickup_label: config.label,
    board: cell.board,
    sector: cell.board,
    cell: cell.cell,
    emoji: config.emoji,
    points: config.points,
  });
}

function tacticalOpenCells(game) {
  const occupiedPickupCells = new Set(game.pickups.map((pickup) => `${pickup.board}:${pickup.cell}`));
  const cells = [];
  game.boards.forEach((board, boardIndex) => {
    if (!boardAvailable(game, boardIndex)) return;
    board.forEach((mark, cellIndex) => {
      if (mark !== null) return;
      if (occupiedPickupCells.has(`${boardIndex}:${cellIndex}`)) return;
      cells.push({ board: boardIndex, cell: cellIndex });
    });
  });
  return cells;
}

function tacticalBoardFilledWinner(game) {
  return tacticalScoreWinner(game);
}

function tacticalLineWinner(game, lineWinner) {
  return tacticalScoreWinner(game) || lineWinner;
}

function tacticalScoreWinner(game) {
  const xScore = Number(game.scores.X || 0);
  const oScore = Number(game.scores.O || 0);
  if (xScore > oScore) return "X";
  if (oScore > xScore) return "O";
  return null;
}

function pushGameEvent(game, event) {
  if (!["movePlaced", "pickupSpawned"].includes(event.type)) game.last_event = event;
  game.events.push({ ...event, turn: game.move_count });
  if (game.events.length > 12) game.events = game.events.slice(-12);
}

export {
  TACTICAL_PICKUP_CONFIG,
  legalBoards,
  boardAvailable,
  makeClassicMove,
  makeTacticalMove,
  smallBoardResult,
  macroWinnerFor,
  ensureTacticalState,
  pickupAt,
  tacticalBoardFilledWinner,
  tacticalLineWinner,
};
