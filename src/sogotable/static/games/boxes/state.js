export const DEFAULT_ROWS = 8;
export const DEFAULT_COLS = 5;

export function createInitialState(options = {}) {
  const rows = clampSize(options.rows, DEFAULT_ROWS);
  const cols = clampSize(options.cols, DEFAULT_COLS);
  const players = normalizePlayers(options.players);
  return normalizeState({
    gameId: "boxes",
    rows,
    cols,
    status: "playing",
    currentPlayerIndex: 0,
    players,
    lines: [],
    boxes: createEmptyBoxes(rows, cols),
    moveCount: 0,
    lastMove: null,
    result: null,
    log: [],
  });
}

export function normalizeState(state) {
  const rows = clampSize(state?.rows, DEFAULT_ROWS);
  const cols = clampSize(state?.cols, DEFAULT_COLS);
  const boxes = normalizeBoxes(state?.boxes, rows, cols);
  const lines = Array.from(new Set((Array.isArray(state?.lines) ? state.lines : [])
    .map((lineId) => normalizeLineId(lineId))
    .filter((lineId) => isLineInBounds(lineId, rows, cols))))
    .sort(compareLineIds);
  const players = normalizePlayers(state?.players);
  const currentPlayerIndex = clampIndex(state?.currentPlayerIndex, players.length);
  return {
    gameId: "boxes",
    rows,
    cols,
    status: state?.status === "complete" ? "complete" : "playing",
    currentPlayerIndex,
    players,
    lines,
    boxes,
    moveCount: Number.isFinite(Number(state?.moveCount)) ? Number(state.moveCount) : lines.length,
    lastMove: state?.lastMove || null,
    result: state?.result || null,
    log: Array.isArray(state?.log) ? state.log.slice(-50) : [],
  };
}

export function normalizePlayers(players) {
  const source = Array.isArray(players) && players.length >= 2
    ? players.slice(0, 2)
    : [
        { id: "player-1", name: "Player 1", mark: "A", color: "#2563eb", kind: "human" },
        { id: "player-2", name: "Player 2", mark: "B", color: "#dc2626", kind: "human" },
      ];
  return source.map((player, index) => ({
    id: String(player?.id || `player-${index + 1}`),
    name: String(player?.name || `Player ${index + 1}`),
    mark: String(player?.mark || (index === 0 ? "A" : "B")).slice(0, 2),
    icon: String(player?.icon || (index === 0 ? "🙂" : "😎")).slice(0, 4),
    color: String(player?.color || (index === 0 ? "#2563eb" : "#dc2626")),
    kind: String(player?.kind || "human"),
    score: Number.isFinite(Number(player?.score)) ? Number(player.score) : 0,
  }));
}

export function createLineId(orientation, row, col) {
  const cleanOrientation = orientation === "v" ? "v" : "h";
  return `${cleanOrientation}-${Number(row)}-${Number(col)}`;
}

export function normalizeLineId(lineId) {
  if (typeof lineId !== "string") return "";
  const [orientation, row, col] = lineId.split("-");
  if (orientation !== "h" && orientation !== "v") return "";
  const cleanRow = Number(row);
  const cleanCol = Number(col);
  if (!Number.isInteger(cleanRow) || !Number.isInteger(cleanCol)) return "";
  return createLineId(orientation, cleanRow, cleanCol);
}

export function parseLineId(lineId) {
  const normalized = normalizeLineId(lineId);
  if (!normalized) return null;
  const [orientation, row, col] = normalized.split("-");
  return { orientation, row: Number(row), col: Number(col), id: normalized };
}

export function isLineInBounds(lineId, rows, cols) {
  const line = parseLineId(lineId);
  if (!line) return false;
  if (line.orientation === "h") {
    return line.row >= 0 && line.row <= rows && line.col >= 0 && line.col < cols;
  }
  return line.row >= 0 && line.row < rows && line.col >= 0 && line.col <= cols;
}

export function allLineIds(rows = DEFAULT_ROWS, cols = DEFAULT_COLS) {
  const lines = [];
  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col < cols; col += 1) lines.push(createLineId("h", row, col));
  }
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col <= cols; col += 1) lines.push(createLineId("v", row, col));
  }
  return lines;
}

export function adjacentBoxesForLine(lineId, rows, cols) {
  const line = parseLineId(lineId);
  if (!line) return [];
  const boxes = [];
  if (line.orientation === "h") {
    if (line.row > 0) boxes.push({ row: line.row - 1, col: line.col });
    if (line.row < rows) boxes.push({ row: line.row, col: line.col });
  } else {
    if (line.col > 0) boxes.push({ row: line.row, col: line.col - 1 });
    if (line.col < cols) boxes.push({ row: line.row, col: line.col });
  }
  return boxes;
}

export function boxLineIds(row, col) {
  return [
    createLineId("h", row, col),
    createLineId("h", row + 1, col),
    createLineId("v", row, col),
    createLineId("v", row, col + 1),
  ];
}

export function createEmptyBoxes(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

export function compareLineIds(left, right) {
  const a = parseLineId(left);
  const b = parseLineId(right);
  if (!a || !b) return String(left).localeCompare(String(right));
  if (a.orientation !== b.orientation) return a.orientation.localeCompare(b.orientation);
  if (a.row !== b.row) return a.row - b.row;
  return a.col - b.col;
}

function normalizeBoxes(boxes, rows, cols) {
  const next = createEmptyBoxes(rows, cols);
  if (!Array.isArray(boxes)) return next;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const owner = boxes[row]?.[col];
      next[row][col] = owner === null || owner === undefined ? null : String(owner);
    }
  }
  return next;
}

function clampSize(value, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(8, Math.max(2, number));
}

function clampIndex(value, playerCount) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number >= playerCount) return 0;
  return number;
}
