// Super Tic Tac Toe / Tactical scored bot — extracted from the Worker entry so
// the routing file stays under its line ceiling. Pure heuristic search over the
// shared rules helpers; the Worker imports `chooseScoredBotMove`.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import {
  TACTICAL_PICKUP_CONFIG,
  legalBoards,
  boardAvailable,
  smallBoardResult,
  macroWinnerFor,
  ensureTacticalState,
  pickupAt,
  tacticalBoardFilledWinner,
  tacticalLineWinner,
} from "./rules.js";

const TACTICAL_GAME_ID = GAME_IDS.tactical;

function isTacticalGame(game) {
  return Boolean(game && game.game_id === TACTICAL_GAME_ID);
}

// Classic/tactical move enumeration (the bot only ever runs on this family, so
// it needs no GAME_HANDLERS dispatch — same result as the Worker's legalMoves).
function classicLegalMoves(game) {
  if (!game || game.status !== "playing") return [];
  const moves = [];
  legalBoards(game).forEach((boardIndex) => {
    game.boards[boardIndex].forEach((value, cellIndex) => {
      if (value === null) moves.push({ board: boardIndex, cell: cellIndex });
    });
  });
  return moves;
}

export function chooseScoredBotMove(game, bot, moves) {
  const player = game.current_player;
  const scoredMoves = moves.map((move) => ({
    move,
    score: scoreBotMove(game, move, player),
  }));
  const bestScore = Math.max(...scoredMoves.map((item) => item.score));
  const bestMoves = scoredMoves.filter((item) => item.score === bestScore);
  return bestMoves[Math.floor(Math.random() * bestMoves.length)].move;
}

function scoreBotMove(game, move, player) {
  const opponent = otherMark(player);
  const preview = previewMove(game, move, player);
  let score = 100;
  if (preview.winner === player) score += 100000;
  if (blocksOpponentGameWin(game, move, opponent)) score += 50000;
  if (preview.capturedBoard && preview.boardWinner === player) score += 10000;
  if (blocksOpponentZoneWin(game, move, opponent)) score += 7000;
  score += scoreThreats(preview.game, player, opponent);
  score += scoreZoneShape(move.board);
  score += scoreCellShape(move.cell);
  score += scoreDestination(preview.game, player, opponent);
  score += scorePickup(game, move);
  if (preview.game.small_winners[move.board] === "D") score -= 3000;
  return score;
}

function previewMove(game, move, player) {
  const next = cloneGameForPreview(game);
  const previousBoardResult = next.small_winners[move.board];
  const pickup = isTacticalGame(next) ? pickupAt(next, move.board, move.cell) : null;
  if (pickup) {
    ensureTacticalState(next);
    const config = TACTICAL_PICKUP_CONFIG[pickup.type];
    if (config) next.scores[player] = Number(next.scores[player] || 0) + config.points;
    next.pickups = next.pickups.filter((item) => item.id !== pickup.id);
  }
  next.boards[move.board][move.cell] = player;
  next.move_count = Number(next.move_count || 0) + 1;
  const boardWinner = smallBoardResult(next.boards[move.board]);
  next.small_winners[move.board] = boardWinner;
  const capturedBoard = previousBoardResult === null && ["X", "O"].includes(boardWinner);
  const lineWinner = macroWinnerFor(next.small_winners);
  if (lineWinner) {
    const winner = isTacticalGame(next) ? tacticalLineWinner(next, lineWinner) : lineWinner;
    next.line_winner = lineWinner;
    next.status = winner ? (winner === "X" ? "x_won" : "o_won") : "draw";
    next.winner = winner;
    next.next_board = null;
  } else if (next.small_winners.every((result) => result !== null)) {
    const winner = isTacticalGame(next) ? tacticalBoardFilledWinner(next) : null;
    next.status = winner ? (winner === "X" ? "x_won" : "o_won") : "draw";
    next.winner = winner;
    next.next_board = null;
  } else {
    next.current_player = otherMark(player);
    next.next_board = boardAvailable(next, move.cell) ? move.cell : null;
  }
  return { game: next, boardWinner, capturedBoard, winner: next.winner };
}

function cloneGameForPreview(game) {
  return JSON.parse(JSON.stringify(game));
}

function otherMark(mark) {
  return mark === "X" ? "O" : "X";
}

function blocksOpponentGameWin(game, move, opponent) {
  if (!blocksOpponentZoneWin(game, move, opponent)) return false;
  const winners = [...game.small_winners];
  winners[move.board] = opponent;
  return macroWinnerFor(winners) === opponent;
}

function blocksOpponentZoneWin(game, move, opponent) {
  if (game.small_winners[move.board] !== null) return false;
  if (game.boards[move.board][move.cell] !== null) return false;
  const board = [...game.boards[move.board]];
  board[move.cell] = opponent;
  return smallBoardResult(board) === opponent;
}

function scoreThreats(game, player, opponent) {
  const playerThreats = countImmediateZoneWins(game, player);
  const opponentThreats = countImmediateZoneWins(game, opponent);
  return (playerThreats >= 2 ? 3000 : 0) - (opponentThreats >= 2 ? 3000 : 0);
}

function countImmediateZoneWins(game, player) {
  return classicLegalMoves(game).filter((move) => {
    if (game.small_winners[move.board] !== null) return false;
    const board = [...game.boards[move.board]];
    board[move.cell] = player;
    return smallBoardResult(board) === player;
  }).length;
}

function scoreCellShape(cellIndex) {
  if (cellIndex === 4) return 1000;
  if ([0, 2, 6, 8].includes(cellIndex)) return 700;
  return 250;
}

function scoreZoneShape(boardIndex) {
  if (boardIndex === 4) return 2000;
  if ([0, 2, 6, 8].includes(boardIndex)) return 1500;
  return 500;
}

function scoreDestination(gameAfterMove, player, opponent) {
  if (gameAfterMove.status !== "playing") return 0;
  const destination = gameAfterMove.next_board;
  if (destination === null || !boardAvailable(gameAfterMove, destination)) return -1000;
  let score = 0;
  if (gameAfterMove.small_winners[destination] === player) score += 700;
  if (gameAfterMove.small_winners[destination] !== null) score += 900;
  const opponentWinningMoves = classicLegalMoves(gameAfterMove).filter((move) => {
    const preview = previewMove(gameAfterMove, move, opponent);
    return preview.winner === opponent || (preview.capturedBoard && preview.boardWinner === opponent);
  });
  if (opponentWinningMoves.some((move) => {
    const preview = previewMove(gameAfterMove, move, opponent);
    return preview.winner === opponent;
  })) score -= 5000;
  if (opponentWinningMoves.some((move) => {
    const preview = previewMove(gameAfterMove, move, opponent);
    return preview.capturedBoard && preview.boardWinner === opponent;
  })) score -= 3000;
  return score;
}

function scorePickup(game, move) {
  if (!isTacticalGame(game)) return 0;
  const pickup = pickupAt(game, move.board, move.cell);
  if (!pickup) return 0;
  const config = TACTICAL_PICKUP_CONFIG[pickup.type];
  return config ? config.points * 120 : 0;
}
