// Pure Battleship fleet geometry: ship cells, sizes, placement validity,
// clamping/coercion of a tapped placement, random fleet drafts, hit/sunk
// lookups, and the draft-store key. No DOM, no ctx, no module state — the
// client controller (client.js) owns the draft store and imports these.
// randomBattleshipDraft uses Math.random (non-deterministic by design).

export function randomBattleshipDraft(game) {
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

export function battleshipShipAt(ships, game, row, col) {
  return ships.find((ship) => battleshipShipCells(ship, battleshipShipSize(game, ship.id)).some((cell) => cell.row === row && cell.col === col)) || null;
}

export function battleshipShipSunk(ship, game, shots) {
  const hits = new Set((shots || []).filter((shot) => shot.hit).map((shot) => `${shot.row}:${shot.col}`));
  return battleshipShipCells(ship, battleshipShipSize(game, ship.id)).every((cell) => hits.has(`${cell.row}:${cell.col}`));
}

export function coerceBattleshipPlacement(game, shipId, row, col, orientation) {
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

export function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(Number(value) || 0)));
}

export function battleshipPlacementValid(ships, game) {
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

export function battleshipFleetComplete(ships, fleet) {
  return Array.isArray(fleet) && fleet.length > 0 && fleet.every((ship) => ships.some((item) => item.id === ship.id));
}

export function battleshipShipSize(game, shipId) {
  return ((game.fleet || []).find((ship) => ship.id === shipId) || {}).size || 0;
}

export function battleshipShipCells(ship, size) {
  return Array.from({ length: size }, (_, index) => ({
    row: Number(ship.row) + (ship.orientation === "v" ? index : 0),
    col: Number(ship.col) + (ship.orientation === "h" ? index : 0),
  }));
}

export function battleshipDraftKey(code, mark) {
  return `${code || ""}:${mark || ""}`;
}
