// Quoridor — server-authoritative rules + bot (rookie→master negamax search).
// Phase 2 game module, esbuild-bundled into the Worker. Pure logic. The Worker
// keeps the isQuoridorGame dispatch predicate and calls the exports below.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { clampInteger } from "../util.js";
import { OVERLORD_BOT_ID } from "../bots.js";

const QUORIDOR_GAME_ID = GAME_IDS.quoridor;

function otherMark(mark) {
  return mark === "X" ? "O" : "X";
}

const QUORIDOR_SIZE = 9;
const QUORIDOR_WALLS = 10;

function newQuoridorGame() {
  return {
    game_id: QUORIDOR_GAME_ID,
    board_size: QUORIDOR_SIZE,
    walls_per_player: QUORIDOR_WALLS,
    pawns: {
      X: { row: QUORIDOR_SIZE - 1, col: Math.floor(QUORIDOR_SIZE / 2), goal: 0 },
      O: { row: 0, col: Math.floor(QUORIDOR_SIZE / 2), goal: QUORIDOR_SIZE - 1 },
    },
    walls_remaining: { X: QUORIDOR_WALLS, O: QUORIDOR_WALLS },
    walls: [],
    current_player: "X",
    status: "playing",
    winner: null,
    move_count: 0,
    last_move: null,
  };
}


function ensureQuoridorState(game) {
  game.game_id = QUORIDOR_GAME_ID;
  game.board_size = QUORIDOR_SIZE;
  game.walls_per_player = QUORIDOR_WALLS;
  if (!game.pawns) game.pawns = {};
  game.pawns.X = normalizeQuoridorPawn(game.pawns.X, "X");
  game.pawns.O = normalizeQuoridorPawn(game.pawns.O, "O");
  game.walls_remaining = {
    X: clampInteger(game.walls_remaining && game.walls_remaining.X, 0, QUORIDOR_WALLS, QUORIDOR_WALLS),
    O: clampInteger(game.walls_remaining && game.walls_remaining.O, 0, QUORIDOR_WALLS, QUORIDOR_WALLS),
  };
  game.walls = Array.isArray(game.walls) ? game.walls.map(normalizeQuoridorWall).filter(Boolean).sort(compareQuoridorWalls) : [];
  game.current_player = ["X", "O"].includes(game.current_player) ? game.current_player : game.status === "playing" ? "X" : null;
  game.status = ["playing", "x_won", "o_won", "draw"].includes(game.status) ? game.status : "playing";
  game.winner = ["X", "O"].includes(game.winner) ? game.winner : null;
  if (!Number.isFinite(Number(game.move_count))) game.move_count = 0;
}

function normalizeQuoridorPawn(pawn, mark) {
  const startRow = mark === "X" ? QUORIDOR_SIZE - 1 : 0;
  const goal = mark === "X" ? 0 : QUORIDOR_SIZE - 1;
  return {
    row: clampInteger(pawn && pawn.row, 0, QUORIDOR_SIZE - 1, startRow),
    col: clampInteger(pawn && pawn.col, 0, QUORIDOR_SIZE - 1, Math.floor(QUORIDOR_SIZE / 2)),
    goal,
  };
}


function quoridorGameToDict(game) {
  ensureQuoridorState(game);
  return {
    ...game,
    game_id: QUORIDOR_GAME_ID,
    legal_pawn_moves: game.status === "playing" ? quoridorPawnMoves(game, game.current_player) : [],
    legal_walls: game.status === "playing" && game.walls_remaining[game.current_player] > 0
      ? allQuoridorWallSlots().filter((wall) => quoridorWallLegal(game, wall))
      : [],
  };
}

function quoridorLegalMoves(game) {
  ensureQuoridorState(game);
  if (game.status !== "playing") return [];
  const pawnMoves = quoridorPawnMoves(game, game.current_player).map((move) => ({ type: "move_pawn", row: move.row, col: move.col }));
  if (game.walls_remaining[game.current_player] <= 0) return pawnMoves;
  const wallMoves = allQuoridorWallSlots()
    .filter((wall) => quoridorWallLegal(game, wall))
    .map((wall) => ({ type: "place_wall", ...wall }));
  return [...pawnMoves, ...wallMoves];
}

function makeQuoridorMove(game, mark, action) {
  ensureQuoridorState(game);
  if (game.status !== "playing") throw new Error("Game is already over.");
  if (mark !== game.current_player) throw new Error(`It is ${game.current_player}'s turn.`);
  const type = String(action && action.type || "").trim();
  if (type === "move_pawn") return moveQuoridorPawn(game, mark, Number(action.row), Number(action.col));
  if (type === "place_wall") return placeQuoridorWall(game, mark, {
    orientation: action.orientation,
    row: Number(action.row),
    col: Number(action.col),
  });
  throw new Error("Quoridor action is required.");
}

function moveQuoridorPawn(game, mark, row, col) {
  const legal = quoridorPawnMoves(game, mark).some((move) => move.row === row && move.col === col);
  if (!legal) throw new Error("Pawn move is not legal.");
  game.pawns[mark].row = row;
  game.pawns[mark].col = col;
  game.move_count += 1;
  game.last_move = { type: "move_pawn", player: mark, row, col };
  if (row === game.pawns[mark].goal) {
    game.status = mark === "X" ? "x_won" : "o_won";
    game.winner = mark;
    game.current_player = null;
    return;
  }
  game.current_player = otherMark(mark);
}

function placeQuoridorWall(game, mark, wall) {
  const clean = normalizeQuoridorWall(wall);
  if (!clean || !quoridorWallLegal(game, clean)) throw new Error("Wall placement is not legal.");
  game.walls.push(clean);
  game.walls.sort(compareQuoridorWalls);
  game.walls_remaining[mark] -= 1;
  game.move_count += 1;
  game.last_move = { type: "place_wall", player: mark, ...clean };
  game.current_player = otherMark(mark);
}

function quoridorPawnMoves(game, mark) {
  ensureQuoridorState(game);
  const pawn = game.pawns[mark];
  const opponent = game.pawns[otherMark(mark)];
  const moves = [];
  quoridorDirections().forEach((direction) => {
    const next = { row: pawn.row + direction.dr, col: pawn.col + direction.dc };
    if (!quoridorCellInBounds(next) || quoridorBlocked(game, pawn, next)) return;
    if (next.row !== opponent.row || next.col !== opponent.col) {
      moves.push(next);
      return;
    }
    const jump = { row: opponent.row + direction.dr, col: opponent.col + direction.dc };
    if (quoridorCellInBounds(jump) && !quoridorBlocked(game, opponent, jump)) {
      moves.push(jump);
      return;
    }
    quoridorPerpendicularDirections(direction).forEach((side) => {
      const diagonal = { row: opponent.row + side.dr, col: opponent.col + side.dc };
      if (quoridorCellInBounds(diagonal) && !quoridorBlocked(game, opponent, diagonal)) moves.push(diagonal);
    });
  });
  return uniqueQuoridorCells(moves);
}

function quoridorDirections() {
  return [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];
}

function quoridorPerpendicularDirections(direction) {
  return direction.dr ? [{ dr: 0, dc: -1 }, { dr: 0, dc: 1 }] : [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }];
}

function uniqueQuoridorCells(cells) {
  const seen = new Set();
  return cells.filter((cell) => {
    const key = `${cell.row}:${cell.col}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => left.row - right.row || left.col - right.col);
}

function quoridorCellInBounds(cell) {
  return cell.row >= 0 && cell.row < QUORIDOR_SIZE && cell.col >= 0 && cell.col < QUORIDOR_SIZE;
}

function quoridorBlocked(game, from, to) {
  const row = Math.min(from.row, to.row);
  const col = Math.min(from.col, to.col);
  if (from.row !== to.row) {
    return game.walls.some((wall) => wall.orientation === "h" && wall.row === row && (wall.col === col || wall.col === col - 1));
  }
  return game.walls.some((wall) => wall.orientation === "v" && wall.col === col && (wall.row === row || wall.row === row - 1));
}

function normalizeQuoridorWall(wall) {
  const orientation = String(wall && wall.orientation || "").toLowerCase();
  const row = Number(wall && wall.row);
  const col = Number(wall && wall.col);
  if (!["h", "v"].includes(orientation) || !Number.isInteger(row) || !Number.isInteger(col)) return null;
  if (row < 0 || row >= QUORIDOR_SIZE - 1 || col < 0 || col >= QUORIDOR_SIZE - 1) return null;
  return { orientation, row, col };
}

function allQuoridorWallSlots() {
  const slots = [];
  for (let row = 0; row < QUORIDOR_SIZE - 1; row += 1) {
    for (let col = 0; col < QUORIDOR_SIZE - 1; col += 1) {
      slots.push({ orientation: "h", row, col }, { orientation: "v", row, col });
    }
  }
  return slots;
}

function quoridorWallLegal(game, wall) {
  ensureQuoridorState(game);
  const clean = normalizeQuoridorWall(wall);
  if (!clean || game.walls_remaining[game.current_player] <= 0) return false;
  if (game.walls.some((existing) => quoridorWallsConflict(existing, clean))) return false;
  const next = { ...game, walls: [...game.walls, clean] };
  return quoridorHasGoalPath(next, "X") && quoridorHasGoalPath(next, "O");
}

function quoridorWallsConflict(a, b) {
  if (a.orientation !== b.orientation) return a.row === b.row && a.col === b.col;
  if (a.orientation === "h") return a.row === b.row && Math.abs(a.col - b.col) < 2;
  return a.col === b.col && Math.abs(a.row - b.row) < 2;
}

function quoridorHasGoalPath(game, mark) {
  const start = game.pawns[mark];
  const queue = [{ row: start.row, col: start.col }];
  const visited = new Set([`${start.row}:${start.col}`]);
  while (queue.length) {
    const cell = queue.shift();
    if (cell.row === start.goal) return true;
    quoridorDirections().forEach((direction) => {
      const next = { row: cell.row + direction.dr, col: cell.col + direction.dc };
      const key = `${next.row}:${next.col}`;
      if (!quoridorCellInBounds(next) || visited.has(key) || quoridorBlocked(game, cell, next)) return;
      visited.add(key);
      queue.push(next);
    });
  }
  return false;
}

function quoridorShortestPath(game, mark) {
  const start = game.pawns[mark];
  const queue = [{ row: start.row, col: start.col, path: [] }];
  const visited = new Set([`${start.row}:${start.col}`]);
  while (queue.length) {
    const cell = queue.shift();
    if (cell.row === start.goal) return cell.path;
    quoridorDirections().forEach((direction) => {
      const next = { row: cell.row + direction.dr, col: cell.col + direction.dc };
      const key = `${next.row}:${next.col}`;
      if (!quoridorCellInBounds(next) || visited.has(key) || quoridorBlocked(game, cell, next)) return;
      visited.add(key);
      queue.push({ ...next, path: [...cell.path, next] });
    });
  }
  return [];
}

function chooseQuoridorBotMove(game, bot, moves) {
  ensureQuoridorState(game);
  const difficulty = quoridorBotDifficulty(bot);
  if (difficulty === "rookie") return chooseRookieQuoridorMove(game, moves);
  if (difficulty === "tactician") return chooseTacticianQuoridorMove(game, moves);
  if (difficulty === "master") return chooseMasterQuoridorMove(game, moves);
  return chooseScoutQuoridorMove(game, moves);
}

function quoridorBotDifficulty(bot) {
  const id = bot && (bot.bot_id || bot.id);
  if (id === "5e2c8a71d0f4") return "rookie";
  if (id === "b64d20f19a8c") return "tactician";
  if (id === OVERLORD_BOT_ID) return "master";
  return "scout";
}

function chooseRookieQuoridorMove(game, moves) {
  const win = quoridorImmediateWinMove(game, game.current_player, moves);
  if (win) return win;
  const pawnMoves = moves.filter((move) => move.type === "move_pawn");
  const wallMoves = quoridorUsefulWallMoves(game, moves).filter((item) => item.selfPain <= 1).map((item) => item.move);
  if (wallMoves.length && Math.random() < 0.25) return wallMoves[Math.floor(Math.random() * wallMoves.length)];
  const pathMove = quoridorShortestPathMove(game, game.current_player, moves);
  if (pathMove && Math.random() < 0.7) return pathMove;
  return pawnMoves[Math.floor(Math.random() * pawnMoves.length)] || pathMove || moves[0] || null;
}

function chooseScoutQuoridorMove(game, moves) {
  const mark = game.current_player;
  const win = quoridorImmediateWinMove(game, mark, moves);
  if (win) return win;
  const emergencyWall = quoridorEmergencyWall(game, moves);
  if (emergencyWall) return emergencyWall;
  const bestMove = quoridorBestPawnMove(game, mark, moves);
  const bestWall = quoridorBestSimpleWall(game, moves);
  if (!bestWall) return bestMove && bestMove.move || moves[0] || null;
  const myDistance = quoridorShortestPath(game, mark).length;
  const opponentDistance = quoridorShortestPath(game, otherMark(mark)).length;
  if (myDistance + 1 < opponentDistance && bestWall.opponentGain < 3) return bestMove.move;
  return bestWall.score > bestMove.score ? bestWall.move : bestMove.move;
}

function chooseTacticianQuoridorMove(game, moves) {
  const mark = game.current_player;
  const win = quoridorImmediateWinMove(game, mark, moves);
  if (win) return win;
  const emergencyWall = quoridorEmergencyWall(game, moves);
  if (emergencyWall) return emergencyWall;
  const candidates = [
    ...moves.filter((move) => move.type === "move_pawn").map((move) => ({
      move,
      score: quoridorEvaluateAfterMove(game, move, mark),
    })),
    ...quoridorUsefulWallMoves(game, moves).map((item) => ({
      move: item.move,
      score: quoridorEvaluateAfterMove(game, item.move, mark) + item.score,
    })),
  ].sort((left, right) => right.score - left.score);
  if (!candidates.length) return moves[0] || null;
  if (candidates.length > 1 && Math.random() < 0.08) return candidates[Math.floor(Math.random() * Math.min(3, candidates.length))].move;
  return candidates[0].move;
}

function chooseMasterQuoridorMove(game, moves) {
  const mark = game.current_player;
  const win = quoridorImmediateWinMove(game, mark, moves);
  if (win) return win;
  const emergencyWall = quoridorEmergencyWall(game, moves);
  if (emergencyWall) return emergencyWall;
  const depth = quoridorChooseSearchDepth(game, mark);
  const candidates = quoridorOrderedCandidates(game, moves, mark);
  let best = null;
  let alpha = -Infinity;
  const cache = new Map();
  candidates.forEach((move) => {
    const preview = quoridorPreviewMove(game, move);
    const score = -quoridorNegamax(preview, otherMark(mark), mark, depth - 1, -Infinity, -alpha, cache);
    if (!best || score > best.score) {
      best = { move, score };
      alpha = Math.max(alpha, score);
    }
  });
  return best ? best.move : chooseTacticianQuoridorMove(game, moves);
}

function quoridorImmediateWinMove(game, mark, moves) {
  return moves.find((move) => move.type === "move_pawn" && move.row === game.pawns[mark].goal) || null;
}

function quoridorEmergencyWall(game, moves) {
  const opponent = otherMark(game.current_player);
  const opponentMoves = quoridorPawnMoves(game, opponent).map((move) => ({ type: "move_pawn", row: move.row, col: move.col }));
  if (!quoridorImmediateWinMove(game, opponent, opponentMoves)) return null;
  return moves.filter((move) => move.type === "place_wall").find((move) => {
    const preview = quoridorPreviewMove(game, move);
    return !quoridorPawnMoves(preview, opponent).some((pawnMove) => pawnMove.row === preview.pawns[opponent].goal);
  }) || null;
}

function quoridorShortestPathMove(game, mark, moves) {
  const next = quoridorShortestPath(game, mark)[0];
  return next ? moves.find((move) => move.type === "move_pawn" && move.row === next.row && move.col === next.col) || null : null;
}

function quoridorBestPawnMove(game, mark, moves) {
  const currentDistance = quoridorShortestPath(game, mark).length;
  const opponent = otherMark(mark);
  const scored = moves.filter((move) => move.type === "move_pawn").map((move) => {
    const preview = quoridorPreviewMove(game, move);
    const myDistance = quoridorShortestPath(preview, mark).length;
    const opponentDistance = quoridorShortestPath(preview, opponent).length;
    return { move, score: 4 * (currentDistance - myDistance) + (opponentDistance - myDistance) };
  }).sort((left, right) => right.score - left.score);
  return scored[0] || { move: quoridorShortestPathMove(game, mark, moves), score: 0 };
}

function quoridorBestSimpleWall(game, moves) {
  return quoridorUsefulWallMoves(game, moves).sort((left, right) => right.score - left.score)[0] || null;
}

function quoridorUsefulWallMoves(game, moves) {
  const mark = game.current_player;
  const opponent = otherMark(mark);
  const myDistance = quoridorShortestPath(game, mark).length;
  const opponentDistance = quoridorShortestPath(game, opponent).length;
  const opponentPath = quoridorShortestPath(game, opponent);
  return moves.filter((move) => move.type === "place_wall").map((move) => {
    const preview = quoridorPreviewMove(game, move);
    const newOpponentDistance = quoridorShortestPath(preview, opponent).length;
    const newMyDistance = quoridorShortestPath(preview, mark).length;
    const opponentGain = newOpponentDistance - opponentDistance;
    const selfPain = newMyDistance - myDistance;
    const nearPath = quoridorWallNearPath(move, opponentPath);
    return {
      move,
      opponentGain,
      selfPain,
      score: 3 * opponentGain - 2 * selfPain + (nearPath ? 1 : 0),
    };
  }).filter((item) => item.opponentGain > 0 && item.selfPain <= 1 && item.score > 0)
    .filter((item) => game.walls_remaining[mark] > 1 || item.opponentGain >= 2);
}

function quoridorWallNearPath(wall, path) {
  return path.some((cell) => Math.abs(cell.row - wall.row) + Math.abs(cell.col - wall.col) <= 2);
}

function quoridorEvaluateAfterMove(game, move, aiMark) {
  return quoridorEvaluateState(quoridorPreviewMove(game, move), aiMark);
}

function quoridorEvaluateState(game, aiMark) {
  if (game.winner === aiMark) return 100000;
  if (game.winner === otherMark(aiMark)) return -100000;
  const opponent = otherMark(aiMark);
  const myDistance = quoridorShortestPath(game, aiMark).length;
  const opponentDistance = quoridorShortestPath(game, opponent).length;
  const mobility = quoridorPawnMoves(game, aiMark).length - quoridorPawnMoves(game, opponent).length;
  const walls = Number(game.walls_remaining[aiMark] || 0) - Number(game.walls_remaining[opponent] || 0);
  return 12 * (opponentDistance - myDistance) + 2 * walls + 4 * mobility;
}

function quoridorPreviewMove(game, move) {
  const next = JSON.parse(JSON.stringify(game));
  ensureQuoridorState(next);
  if (move.type === "move_pawn") moveQuoridorPawn(next, next.current_player, move.row, move.col);
  else placeQuoridorWall(next, next.current_player, move);
  return next;
}

function quoridorOrderedCandidates(game, moves, aiMark) {
  const walls = quoridorUsefulWallMoves(game, moves).map((item) => item.move).slice(0, 12);
  const pawns = moves.filter((move) => move.type === "move_pawn");
  return [...pawns, ...walls]
    .map((move) => ({ move, score: quoridorEvaluateAfterMove(game, move, aiMark) }))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.move);
}

function quoridorChooseSearchDepth(game, mark) {
  const totalWalls = Number(game.walls_remaining.X || 0) + Number(game.walls_remaining.O || 0);
  const myDistance = quoridorShortestPath(game, mark).length;
  const opponentDistance = quoridorShortestPath(game, otherMark(mark)).length;
  return myDistance <= 3 || opponentDistance <= 3 || totalWalls <= 4 ? 3 : 2;
}

function quoridorNegamax(game, playerToMove, aiMark, depth, alpha, beta, cache) {
  if (game.status !== "playing" || depth <= 0) return quoridorEvaluateState(game, aiMark);
  game.current_player = playerToMove;
  const key = quoridorStateKey(game, depth);
  if (cache.has(key)) return cache.get(key);
  const moves = quoridorOrderedCandidates(game, quoridorLegalMoves(game), aiMark);
  let best = -Infinity;
  for (const move of moves) {
    const preview = quoridorPreviewMove(game, move);
    const score = -quoridorNegamax(preview, otherMark(playerToMove), aiMark, depth - 1, -beta, -alpha, cache);
    best = Math.max(best, score);
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }
  cache.set(key, best);
  return best;
}

function quoridorStateKey(game, depth) {
  return JSON.stringify({
    depth,
    current: game.current_player,
    pawns: game.pawns,
    walls: game.walls,
    remaining: game.walls_remaining,
  });
}

function compareQuoridorWalls(left, right) {
  if (left.orientation !== right.orientation) return left.orientation.localeCompare(right.orientation);
  if (left.row !== right.row) return left.row - right.row;
  return left.col - right.col;
}

export {
  newQuoridorGame,
  quoridorGameToDict,
  makeQuoridorMove,
  quoridorLegalMoves,
  chooseQuoridorBotMove,
};
