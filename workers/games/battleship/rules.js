// Battleship — server-authoritative rules + the per-viewer hidden-information
// sanitizer. Phase 2 game module, esbuild-bundled into the Worker. Pure logic:
// no routing, auth, or persistence. The Worker keeps the isBattleshipGame
// dispatch predicate and the room-coupled ensureBattleshipBotFleets wrapper, and
// calls the exports below.
//
// DANGER ZONE: battleshipGameToDictForViewer (+ sanitizeBattleshipShot/Move and
// battleshipSunkShips) is the ONLY thing that hides the opponent's ships and
// ship_ids from a viewer. Keep its behaviour exactly.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { isOverlordBot } from "../bots.js";

const BATTLESHIP_GAME_ID = GAME_IDS.battleship;

function otherMark(mark) {
  return mark === "X" ? "O" : "X";
}

function battleshipGameToDictForViewer(game, viewerMark, roomStatusValue) {
  const projected = structuredClone(game);
  if (!projected.players) return projected;
  const revealShips = roomStatusValue === "completed" || projected.phase === "complete";
  const viewerState = viewerMark ? projected.players[viewerMark] : null;
  const viewerShots = viewerState ? viewerState.shots || [] : [];
  ["X", "O"].forEach((mark) => {
    const state = projected.players[mark];
    if (!state) return;
    const isViewer = mark === viewerMark;
    state.shots = (state.shots || []).map((shot) => sanitizeBattleshipShot(shot, revealShips));
    // Hide the opponent's fleet during play, but reveal the ships the viewer has
    // already sunk so the attacker can mark them red and see which ship went down.
    if (!isViewer && !revealShips) state.ships = battleshipSunkShips(state.ships, viewerShots);
  });
  if (!revealShips) {
    projected.last_move = sanitizeBattleshipMove(projected.last_move);
    projected.events = (projected.events || []).map(sanitizeBattleshipMove);
  }
  return projected;
}

function battleshipSunkShips(defenderShips, attackerShots) {
  const hits = new Set((attackerShots || []).filter((shot) => shot.hit).map((shot) => `${shot.row}:${shot.col}`));
  return (defenderShips || []).filter((ship) => battleshipShipCells(ship).every((cell) => hits.has(`${cell.row}:${cell.col}`)));
}

function sanitizeBattleshipShot(shot, revealShips) {
  if (!shot || revealShips || !("ship_id" in shot)) return shot;
  const { ship_id, ...publicShot } = shot;
  return publicShot;
}

function sanitizeBattleshipMove(move) {
  if (!move || move.type !== "attack" || move.sunk) return move;
  const { ship_id, ...publicMove } = move;
  return publicMove;
}

const BATTLESHIP_SIZE = 10;
const BATTLESHIP_FLEET = [
  { id: "carrier", name: "Carrier", size: 5 },
  { id: "battleship", name: "Battleship", size: 4 },
  { id: "cruiser", name: "Cruiser", size: 3 },
  { id: "submarine", name: "Submarine", size: 3 },
  { id: "destroyer", name: "Destroyer", size: 2 },
];

function newBattleshipGame() {
  return {
    game_id: BATTLESHIP_GAME_ID,
    board_size: BATTLESHIP_SIZE,
    phase: "setup",
    status: "setup",
    current_player: null,
    winner: null,
    move_count: 0,
    fleet: BATTLESHIP_FLEET.map((ship) => ({ ...ship })),
    players: {
      X: newBattleshipPlayerState(),
      O: newBattleshipPlayerState(),
    },
    last_move: null,
    events: [],
  };
}

function newBattleshipPlayerState() {
  return {
    ready: false,
    ships: [],
    shots: [],
  };
}


function ensureBattleshipState(game) {
  game.game_id = BATTLESHIP_GAME_ID;
  game.board_size = Number.isInteger(game.board_size) ? Math.min(12, Math.max(6, game.board_size)) : BATTLESHIP_SIZE;
  game.phase = game.phase === "complete" ? "complete" : game.phase === "playing" ? "playing" : "setup";
  game.status = ["setup", "playing", "x_won", "o_won", "draw"].includes(game.status) ? game.status : game.phase;
  game.fleet = BATTLESHIP_FLEET.map((ship) => ({ ...ship }));
  if (!game.players) game.players = {};
  ["X", "O"].forEach((mark) => {
    const player = game.players[mark] || {};
    game.players[mark] = {
      ready: Boolean(player.ready),
      ships: normalizeBattleshipShips(player.ships, game.board_size),
      shots: normalizeBattleshipShots(player.shots, game.board_size),
    };
  });
  if (!Array.isArray(game.events)) game.events = [];
  if (!Number.isFinite(Number(game.move_count))) game.move_count = 0;
}

function battleshipGameToDict(game) {
  ensureBattleshipState(game);
  return {
    ...game,
    game_id: BATTLESHIP_GAME_ID,
    legal_attacks: battleshipLegalMoves(game).map((move) => ({ row: move.row, col: move.col })),
  };
}

function makeBattleshipMove(game, mark, action) {
  ensureBattleshipState(game);
  const type = String(action && action.type || "").trim();
  if (game.status === "setup") {
    if (type === "auto_place") return placeBattleshipFleet(game, mark, autoBattleshipFleet(mark === "O"));
    if (type === "place_fleet") return placeBattleshipFleet(game, mark, action.ships);
    throw new Error("Place your fleet before attacking.");
  }
  if (game.status !== "playing") throw new Error("Game is already over.");
  if (type !== "attack") throw new Error("Attack action is required.");
  if (mark !== game.current_player) throw new Error(`It is ${game.current_player}'s turn.`);
  return attackBattleshipCell(game, mark, Number(action.row), Number(action.col));
}


function placeBattleshipFleet(game, mark, ships) {
  const normalized = normalizeBattleshipShips(ships, game.board_size);
  validateBattleshipFleet(normalized, game.board_size);
  game.players[mark].ships = normalized;
  game.players[mark].ready = true;
  game.last_move = { type: "fleetPlaced", player: mark };
  game.events.push(game.last_move);
  game.events = game.events.slice(-30);
  if (game.players.X.ready && game.players.O.ready) {
    game.phase = "playing";
    game.status = "playing";
    game.current_player = "X";
  }
}

function attackBattleshipCell(game, mark, row, col) {
  if (!Number.isInteger(row) || row < 0 || row >= game.board_size || !Number.isInteger(col) || col < 0 || col >= game.board_size) {
    throw new Error("Attack is outside the board.");
  }
  const attacker = game.players[mark];
  const defenderMark = otherMark(mark);
  const defender = game.players[defenderMark];
  if (attacker.shots.some((shot) => shot.row === row && shot.col === col)) throw new Error("That cell was already targeted.");
  const target = battleshipShipAt(defender.ships, row, col);
  const hit = Boolean(target);
  attacker.shots.push({ row, col, hit, ship_id: target ? target.id : null });
  game.move_count += 1;
  const sunk = target ? battleshipShipSunk(defender, attacker.shots, target.id) : false;
  game.last_move = { type: "attack", player: mark, row, col, hit, sunk, ship_id: target ? target.id : null };
  game.events.push(game.last_move);
  game.events = game.events.slice(-40);
  if (battleshipFleetSunk(defender, attacker.shots)) {
    game.status = mark === "X" ? "x_won" : "o_won";
    game.phase = "complete";
    game.winner = mark;
    game.current_player = null;
    return;
  }
  game.current_player = defenderMark;
}

function battleshipLegalMoves(game) {
  if (!game || game.status !== "playing" || !game.current_player) return [];
  ensureBattleshipState(game);
  const shots = new Set(game.players[game.current_player].shots.map((shot) => `${shot.row}:${shot.col}`));
  const moves = [];
  for (let row = 0; row < game.board_size; row += 1) {
    for (let col = 0; col < game.board_size; col += 1) {
      if (!shots.has(`${row}:${col}`)) moves.push({ type: "attack", row, col });
    }
  }
  return moves;
}

function normalizeBattleshipShips(ships, boardSize) {
  if (!Array.isArray(ships)) return [];
  return ships.map((ship) => ({
    id: String(ship && ship.id || "").trim(),
    row: Number(ship && ship.row),
    col: Number(ship && ship.col),
    orientation: ship && ship.orientation === "v" ? "v" : "h",
  })).filter((ship) => (
    ship.id &&
    Number.isInteger(ship.row) &&
    Number.isInteger(ship.col) &&
    ship.row >= 0 &&
    ship.col >= 0 &&
    ship.row < boardSize &&
    ship.col < boardSize
  ));
}

function normalizeBattleshipShots(shots, boardSize) {
  if (!Array.isArray(shots)) return [];
  return shots.map((shot) => ({
    row: Number(shot && shot.row),
    col: Number(shot && shot.col),
    hit: Boolean(shot && shot.hit),
    ship_id: shot && shot.ship_id ? String(shot.ship_id) : null,
  })).filter((shot) => Number.isInteger(shot.row) && Number.isInteger(shot.col) && shot.row >= 0 && shot.col >= 0 && shot.row < boardSize && shot.col < boardSize);
}

function validateBattleshipFleet(ships, boardSize) {
  if (ships.length !== BATTLESHIP_FLEET.length) throw new Error("Place every ship before readying fleet.");
  const occupied = new Set();
  BATTLESHIP_FLEET.forEach((required) => {
    const ship = ships.find((item) => item.id === required.id);
    if (!ship) throw new Error(`${required.name} is not placed.`);
    const cells = battleshipShipCells(ship, required.size);
    if (!cells.length) throw new Error(`${required.name} is not placed.`);
    cells.forEach((cell) => {
      if (cell.row < 0 || cell.col < 0 || cell.row >= boardSize || cell.col >= boardSize) throw new Error(`${required.name} is outside the board.`);
      const key = `${cell.row}:${cell.col}`;
      if (occupied.has(key)) throw new Error("Ships cannot overlap.");
      occupied.add(key);
    });
  });
}

function battleshipShipCells(ship, size = battleshipShipSize(ship.id)) {
  if (!size) return [];
  return Array.from({ length: size }, (_, index) => ({
    row: ship.row + (ship.orientation === "v" ? index : 0),
    col: ship.col + (ship.orientation === "h" ? index : 0),
  }));
}

function battleshipShipSize(shipId) {
  return (BATTLESHIP_FLEET.find((ship) => ship.id === shipId) || {}).size || 0;
}

function battleshipShipAt(ships, row, col) {
  return ships.find((ship) => battleshipShipCells(ship).some((cell) => cell.row === row && cell.col === col)) || null;
}

function battleshipShipSunk(defender, attackerShots, shipId) {
  const ship = defender.ships.find((item) => item.id === shipId);
  if (!ship) return false;
  const hits = new Set(attackerShots.filter((shot) => shot.hit).map((shot) => `${shot.row}:${shot.col}`));
  return battleshipShipCells(ship).every((cell) => hits.has(`${cell.row}:${cell.col}`));
}

function battleshipFleetSunk(defender, attackerShots) {
  return defender.ships.length === BATTLESHIP_FLEET.length && defender.ships.every((ship) => battleshipShipSunk(defender, attackerShots, ship.id));
}

function autoBattleshipFleet() {
  const randomFleet = generateRandomBattleshipFleet(BATTLESHIP_SIZE, BATTLESHIP_FLEET);
  if (randomFleet.length === BATTLESHIP_FLEET.length) return randomFleet;
  return [
    { id: "carrier", row: 0, col: 0, orientation: "h" },
    { id: "battleship", row: 2, col: 0, orientation: "h" },
    { id: "cruiser", row: 4, col: 0, orientation: "h" },
    { id: "submarine", row: 6, col: 0, orientation: "h" },
    { id: "destroyer", row: 8, col: 0, orientation: "h" },
  ];
}

function chooseBattleshipBotFleet(bot = null) {
  if (!isOverlordBot(bot)) return autoBattleshipFleet();
  return chooseStrongBattleshipFleet(BATTLESHIP_SIZE, BATTLESHIP_FLEET, 5000);
}

function chooseStrongBattleshipFleet(boardSize, fleet, attempts = 5000) {
  const enemyHeatMap = buildBattleshipEmptyBoardHeatMap(boardSize, fleet);
  const candidates = [];
  for (let index = 0; index < attempts; index += 1) {
    const layout = generateRandomBattleshipFleet(boardSize, fleet);
    if (!layout.length) continue;
    candidates.push({
      fleet: layout,
      score: scoreBattleshipFleetPlacement(layout, enemyHeatMap, boardSize),
    });
  }
  candidates.sort((left, right) => left.score - right.score);
  const topCount = Math.min(candidates.length, Math.max(10, Math.floor(attempts * 0.02)));
  const top = candidates.slice(0, topCount);
  return (top[Math.floor(Math.random() * top.length)] || candidates[0] || { fleet: autoBattleshipFleet() }).fleet;
}

function generateRandomBattleshipFleet(boardSize, fleet) {
  const placed = [];
  const occupied = new Set();
  const shuffled = fleet.slice().sort(() => Math.random() - 0.5);
  for (const ship of shuffled) {
    let placedShip = null;
    for (let attempt = 0; attempt < 120 && !placedShip; attempt += 1) {
      const orientation = Math.random() < 0.5 ? "h" : "v";
      const rowMax = orientation === "v" ? boardSize - ship.size : boardSize - 1;
      const colMax = orientation === "h" ? boardSize - ship.size : boardSize - 1;
      const candidate = {
        id: ship.id,
        row: Math.floor(Math.random() * (rowMax + 1)),
        col: Math.floor(Math.random() * (colMax + 1)),
        orientation,
      };
      const cells = battleshipShipCells(candidate, ship.size);
      if (cells.every((cell) => !occupied.has(`${cell.row}:${cell.col}`))) placedShip = candidate;
    }
    if (!placedShip) return [];
    battleshipShipCells(placedShip, ship.size).forEach((cell) => occupied.add(`${cell.row}:${cell.col}`));
    placed.push(placedShip);
  }
  return fleet.map((ship) => placed.find((item) => item.id === ship.id));
}

function buildBattleshipEmptyBoardHeatMap(boardSize, fleet) {
  const heat = zeroBattleshipGrid(boardSize);
  fleet.forEach((ship) => {
    allBattleshipPlacements(boardSize, ship.size).forEach((placement) => {
      battleshipShipCells(placement, ship.size).forEach((cell) => {
        heat[cell.row][cell.col] += 1;
      });
    });
  });
  return heat;
}

function scoreBattleshipFleetPlacement(fleet, enemyHeatMap, boardSize) {
  return scoreBattleshipEnemyHeat(fleet, enemyHeatMap)
    + scoreBattleshipClustering(fleet)
    + scoreBattleshipEdgeOveruse(fleet, boardSize)
    + scoreBattleshipOrientationBalance(fleet)
    + Math.random() * 10;
}

function scoreBattleshipEnemyHeat(fleet, enemyHeatMap) {
  return fleet.reduce((total, ship) => total + battleshipShipCells(ship).reduce((shipTotal, cell) => shipTotal + enemyHeatMap[cell.row][cell.col], 0), 0);
}

function scoreBattleshipClustering(fleet) {
  const cells = fleet.flatMap((ship) => battleshipShipCells(ship));
  let penalty = 0;
  for (let left = 0; left < cells.length; left += 1) {
    for (let right = left + 1; right < cells.length; right += 1) {
      const distance = Math.abs(cells[left].row - cells[right].row) + Math.abs(cells[left].col - cells[right].col);
      if (distance === 1) penalty += 8;
      else if (distance === 2) penalty += 3;
    }
  }
  return penalty;
}

function scoreBattleshipEdgeOveruse(fleet, boardSize) {
  const cells = fleet.flatMap((ship) => battleshipShipCells(ship));
  const edgeCells = cells.filter((cell) => cell.row === 0 || cell.col === 0 || cell.row === boardSize - 1 || cell.col === boardSize - 1).length;
  const edgeRatio = edgeCells / Math.max(1, cells.length);
  return edgeRatio > 0.45 ? (edgeRatio - 0.45) * 100 : 0;
}

function scoreBattleshipOrientationBalance(fleet) {
  const horizontal = fleet.filter((ship) => ship.orientation === "h").length;
  const vertical = fleet.length - horizontal;
  return Math.abs(horizontal - vertical) * 6;
}

function chooseBattleshipBotMove(game, bot, moves) {
  const mark = game.current_player;
  const knowledge = battleshipKnowledgeBoard(game, mark);
  const remainingShips = battleshipRemainingShipsFromShots(game.players[mark].shots || []);
  const heat = buildBattleshipAttackHeatMap(knowledge, remainingShips);
  const target = chooseBattleshipTargetMove(knowledge, heat, remainingShips);
  if (target) return target;
  if (!isOverlordBot(bot)) return moves[Math.floor(Math.random() * moves.length)];
  return chooseBattleshipHuntMove(knowledge, heat, remainingShips, moves);
}

function battleshipKnowledgeBoard(game, mark) {
  const board = Array.from({ length: game.board_size }, () => Array.from({ length: game.board_size }, () => ({ state: "unknown", ship_id: null })));
  (game.players[mark].shots || []).forEach((shot) => {
    board[shot.row][shot.col] = { state: shot.hit ? "hit" : "miss", ship_id: shot.ship_id || null };
  });
  return board;
}

function battleshipRemainingShipsFromShots(shots) {
  const hitsByShip = new Map();
  (shots || []).filter((shot) => shot.hit && shot.ship_id).forEach((shot) => {
    hitsByShip.set(shot.ship_id, (hitsByShip.get(shot.ship_id) || 0) + 1);
  });
  return BATTLESHIP_FLEET.filter((ship) => (hitsByShip.get(ship.id) || 0) < ship.size);
}

function buildBattleshipAttackHeatMap(board, remainingShips) {
  const boardSize = board.length;
  const heat = zeroBattleshipGrid(boardSize);
  remainingShips.forEach((ship) => {
    allBattleshipPlacements(boardSize, ship.size).forEach((placement) => {
      const cells = battleshipShipCells(placement, ship.size);
      if (!cells.every((cell) => board[cell.row][cell.col].state !== "miss")) return;
      cells.forEach((cell) => {
        if (board[cell.row][cell.col].state === "unknown") heat[cell.row][cell.col] += 1;
      });
    });
  });
  return heat;
}

function chooseBattleshipTargetMove(board, heat, remainingShips) {
  const clusters = battleshipHitClusters(board).filter((cluster) => !battleshipClusterSunk(cluster, remainingShips));
  const candidates = clusters.flatMap((cluster) => battleshipTargetCandidatesForCluster(board, cluster));
  return bestBattleshipCell(candidates, (cell) => heat[cell.row][cell.col] * 10 + battleshipInformationValue(cell, board, remainingShips));
}

function battleshipHitClusters(board) {
  const visited = new Set();
  const clusters = [];
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board.length; col += 1) {
      if (board[row][col].state !== "hit" || visited.has(`${row}:${col}`)) continue;
      const cluster = [];
      const stack = [{ row, col }];
      visited.add(`${row}:${col}`);
      while (stack.length) {
        const cell = stack.pop();
        cluster.push(cell);
        battleshipNeighbors(cell, board.length).forEach((next) => {
          const key = `${next.row}:${next.col}`;
          if (visited.has(key) || board[next.row][next.col].state !== "hit") return;
          visited.add(key);
          stack.push(next);
        });
      }
      clusters.push(cluster);
    }
  }
  return clusters;
}

function battleshipClusterSunk(cluster, remainingShips) {
  const ids = [...new Set(cluster.map((cell) => cell.ship_id).filter(Boolean))];
  return ids.length === 1 && !remainingShips.some((ship) => ship.id === ids[0]);
}

function battleshipTargetCandidatesForCluster(board, cluster) {
  if (!cluster.length) return [];
  if (cluster.length === 1) return battleshipNeighbors(cluster[0], board.length).filter((cell) => board[cell.row][cell.col].state === "unknown");
  const sameRow = cluster.every((cell) => cell.row === cluster[0].row);
  const sameCol = cluster.every((cell) => cell.col === cluster[0].col);
  if (!sameRow && !sameCol) return cluster.flatMap((cell) => battleshipNeighbors(cell, board.length)).filter((cell) => board[cell.row][cell.col].state === "unknown");
  const sorted = cluster.slice().sort((left, right) => sameRow ? left.col - right.col : left.row - right.row);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const ends = sameRow
    ? [{ row: first.row, col: first.col - 1 }, { row: last.row, col: last.col + 1 }]
    : [{ row: first.row - 1, col: first.col }, { row: last.row + 1, col: last.col }];
  return ends.filter((cell) => cell.row >= 0 && cell.col >= 0 && cell.row < board.length && cell.col < board.length && board[cell.row][cell.col].state === "unknown");
}

function chooseBattleshipHuntMove(board, heat, remainingShips, moves) {
  return bestBattleshipCell(moves, (cell) => {
    const smallestShip = Math.min(...remainingShips.map((ship) => ship.size));
    return heat[cell.row][cell.col] * 10
      + battleshipParityBonus(cell, smallestShip)
      + battleshipInformationValue(cell, board, remainingShips);
  });
}

function battleshipParityBonus(cell, smallestShip) {
  if (smallestShip <= 2) return (cell.row + cell.col) % 2 === 0 ? 5 : 0;
  if (smallestShip === 3) return (cell.row + cell.col) % 3 === 0 ? 5 : 0;
  return 0;
}

function battleshipInformationValue(cell, board, remainingShips) {
  const maxShipSize = Math.max(...remainingShips.map((ship) => ship.size), 2);
  const horizontal = countBattleshipOpenCells(cell, board, 0, -1) + countBattleshipOpenCells(cell, board, 0, 1) + 1;
  const vertical = countBattleshipOpenCells(cell, board, -1, 0) + countBattleshipOpenCells(cell, board, 1, 0) + 1;
  return (horizontal >= maxShipSize ? 2 : 0) + (vertical >= maxShipSize ? 2 : 0) + Math.min(horizontal, vertical);
}

function countBattleshipOpenCells(cell, board, rowStep, colStep) {
  let count = 0;
  let row = cell.row + rowStep;
  let col = cell.col + colStep;
  while (row >= 0 && col >= 0 && row < board.length && col < board.length && board[row][col].state === "unknown") {
    count += 1;
    row += rowStep;
    col += colStep;
  }
  return count;
}

function bestBattleshipCell(cells, scoreCell) {
  if (!cells.length) return null;
  let bestScore = -Infinity;
  let best = [];
  cells.forEach((cell) => {
    const score = scoreCell(cell);
    if (score > bestScore) {
      bestScore = score;
      best = [cell];
    } else if (score === bestScore) {
      best.push(cell);
    }
  });
  const picked = best[Math.floor(Math.random() * best.length)];
  return picked ? { type: "attack", row: picked.row, col: picked.col } : null;
}

function battleshipNeighbors(cell, boardSize) {
  return [
    { row: cell.row - 1, col: cell.col },
    { row: cell.row + 1, col: cell.col },
    { row: cell.row, col: cell.col - 1 },
    { row: cell.row, col: cell.col + 1 },
  ].filter((item) => item.row >= 0 && item.col >= 0 && item.row < boardSize && item.col < boardSize);
}

function allBattleshipPlacements(boardSize, shipSize) {
  const placements = [];
  for (let row = 0; row < boardSize; row += 1) {
    for (let col = 0; col <= boardSize - shipSize; col += 1) placements.push({ row, col, orientation: "h" });
  }
  for (let row = 0; row <= boardSize - shipSize; row += 1) {
    for (let col = 0; col < boardSize; col += 1) placements.push({ row, col, orientation: "v" });
  }
  return placements;
}

function zeroBattleshipGrid(boardSize) {
  return Array.from({ length: boardSize }, () => Array.from({ length: boardSize }, () => 0));
}

export {
  BATTLESHIP_FLEET,
  newBattleshipGame,
  ensureBattleshipState,
  battleshipGameToDict,
  makeBattleshipMove,
  placeBattleshipFleet,
  battleshipLegalMoves,
  chooseBattleshipBotFleet,
  chooseBattleshipBotMove,
  battleshipGameToDictForViewer,
};
