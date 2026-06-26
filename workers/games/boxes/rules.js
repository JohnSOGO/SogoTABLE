// Dots and Boxes — server-authoritative rules engine. Extracted from the Worker
// god-file as the first Phase 2 game module. Pure game logic: no routing, auth,
// persistence, or HTTP. esbuild bundles this into the Worker; the Worker keeps
// the `isBoxesGame` dispatch predicate and calls the exports below.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";

const BOXES_GAME_ID = GAME_IDS.boxes;

function otherMark(mark) {
  return mark === "X" ? "O" : "X";
}

export function newBoxesGame() {
  const rows = 8;
  const cols = 5;
  return {
    game_id: BOXES_GAME_ID,
    rows,
    cols,
    lines: [],
    boxes: Array.from({ length: rows }, () => Array.from({ length: cols }, () => null)),
    current_player: "X",
    status: "playing",
    winner: null,
    move_count: 0,
    last_move: null,
    events: [],
    scores: { X: 0, O: 0 },
  };
}

export function boxesGameToDict(game) {
  ensureBoxesState(game);
  return {
    ...game,
    game_id: BOXES_GAME_ID,
    legal_lines: boxesLegalMoves(game).map((move) => move.line_id),
  };
}

function ensureBoxesState(game) {
  game.game_id = BOXES_GAME_ID;
  game.rows = Number.isInteger(game.rows) ? Math.min(8, Math.max(2, game.rows)) : 8;
  game.cols = Number.isInteger(game.cols) ? Math.min(8, Math.max(2, game.cols)) : 5;
  if (!Array.isArray(game.lines)) game.lines = [];
  game.lines = [...new Set(game.lines.map(normalizeBoxesLineId).filter((lineId) => boxesLineInBounds(game, lineId)))].sort(compareBoxesLineIds);
  if (!Array.isArray(game.boxes)) game.boxes = [];
  game.boxes = Array.from({ length: game.rows }, (_, row) => (
    Array.from({ length: game.cols }, (_, col) => {
      const owner = game.boxes[row] && game.boxes[row][col];
      return owner === "X" || owner === "O" ? owner : null;
    })
  ));
  if (!game.scores) game.scores = { X: 0, O: 0 };
  game.scores = boxesScores(game.boxes);
  if (!Array.isArray(game.events)) game.events = [];
  game.events = game.events
    .filter((event) => event && event.type === "lineClaimed" && ["X", "O"].includes(event.player))
    .map((event) => ({
      type: "lineClaimed",
      player: event.player,
      line_id: normalizeBoxesLineId(event.line_id),
      captured: Array.isArray(event.captured) ? event.captured : [],
    }))
    .filter((event) => event.line_id);
  if (game.current_player !== "O") game.current_player = "X";
  if (!["playing", "x_won", "o_won", "draw"].includes(game.status)) game.status = "playing";
  if (!Number.isFinite(Number(game.move_count))) game.move_count = game.lines.length;
}

export function boxesLegalMoves(game) {
  if (!game || game.status !== "playing") return [];
  ensureBoxesState(game);
  const claimed = new Set(game.lines);
  return allBoxesLineIds(game.rows, game.cols)
    .filter((lineId) => !claimed.has(lineId))
    .map((lineId) => ({ line_id: lineId }));
}

export function makeBoxesMove(game, lineId) {
  ensureBoxesState(game);
  if (game.status !== "playing") throw new Error("Game is already over.");
  const cleanLineId = normalizeBoxesLineId(lineId);
  if (!cleanLineId || !boxesLineInBounds(game, cleanLineId)) throw new Error("Line id is not valid.");
  if (game.lines.includes(cleanLineId)) throw new Error("Line is already claimed.");

  const player = game.current_player;
  game.lines.push(cleanLineId);
  game.lines.sort(compareBoxesLineIds);
  const claimed = new Set(game.lines);
  const captured = [];
  boxesAdjacentBoxes(game, cleanLineId).forEach((box) => {
    if (game.boxes[box.row][box.col]) return;
    if (boxesBoxLineIds(box.row, box.col).every((id) => claimed.has(id))) {
      game.boxes[box.row][box.col] = player;
      captured.push(box);
    }
  });
  game.move_count += 1;
  game.scores = boxesScores(game.boxes);
  game.last_move = { player, line_id: cleanLineId, captured };
  game.events.push({ type: "lineClaimed", player, line_id: cleanLineId, captured });
  game.events = game.events.slice(-80);
  if (game.lines.length >= allBoxesLineIds(game.rows, game.cols).length) {
    if (game.scores.X > game.scores.O) {
      game.status = "x_won";
      game.winner = "X";
    } else if (game.scores.O > game.scores.X) {
      game.status = "o_won";
      game.winner = "O";
    } else {
      game.status = "draw";
      game.winner = null;
    }
    return;
  }
  if (!captured.length) game.current_player = otherMark(player);
}

export function chooseBoxesBotMove(game, moves) {
  const capturing = moves
    .map((move) => ({ move, captures: boxesCaptureCountAfterLine(game, move.line_id) }))
    .filter((item) => item.captures > 0)
    .sort((left, right) => right.captures - left.captures || left.move.line_id.localeCompare(right.move.line_id));
  if (capturing.length) return capturing[0].move;
  const safe = moves.filter((move) => !boxesCreatesThreeSidedBox(game, move.line_id));
  const candidates = (safe.length ? safe : moves).slice().sort((left, right) => left.line_id.localeCompare(right.line_id));
  return candidates[0] || null;
}

function boxesCaptureCountAfterLine(game, lineId) {
  ensureBoxesState(game);
  const claimed = new Set(game.lines);
  claimed.add(lineId);
  return boxesAdjacentBoxes(game, lineId)
    .filter((box) => !game.boxes[box.row][box.col])
    .filter((box) => boxesBoxLineIds(box.row, box.col).every((id) => claimed.has(id)))
    .length;
}

function boxesCreatesThreeSidedBox(game, lineId) {
  ensureBoxesState(game);
  const claimed = new Set(game.lines);
  claimed.add(lineId);
  return boxesAdjacentBoxes(game, lineId)
    .filter((box) => !game.boxes[box.row][box.col])
    .some((box) => boxesBoxLineIds(box.row, box.col).filter((id) => claimed.has(id)).length === 3);
}

function boxesScores(boxes) {
  return {
    X: boxes.flat().filter((owner) => owner === "X").length,
    O: boxes.flat().filter((owner) => owner === "O").length,
  };
}

function allBoxesLineIds(rows, cols) {
  const lines = [];
  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col < cols; col += 1) lines.push(boxesLineId("h", row, col));
  }
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col <= cols; col += 1) lines.push(boxesLineId("v", row, col));
  }
  return lines;
}

function boxesLineId(orientation, row, col) {
  return `${orientation === "v" ? "v" : "h"}-${Number(row)}-${Number(col)}`;
}

function normalizeBoxesLineId(lineId) {
  const parts = String(lineId || "").trim().split("-");
  if (parts.length !== 3 || !["h", "v"].includes(parts[0])) return "";
  const row = Number(parts[1]);
  const col = Number(parts[2]);
  if (!Number.isInteger(row) || !Number.isInteger(col)) return "";
  return boxesLineId(parts[0], row, col);
}

function boxesLineInBounds(game, lineId) {
  const line = parseBoxesLineId(lineId);
  if (!line) return false;
  if (line.orientation === "h") return line.row >= 0 && line.row <= game.rows && line.col >= 0 && line.col < game.cols;
  return line.row >= 0 && line.row < game.rows && line.col >= 0 && line.col <= game.cols;
}

function parseBoxesLineId(lineId) {
  const cleanLineId = normalizeBoxesLineId(lineId);
  if (!cleanLineId) return null;
  const [orientation, row, col] = cleanLineId.split("-");
  return { orientation, row: Number(row), col: Number(col), id: cleanLineId };
}

function compareBoxesLineIds(left, right) {
  const a = parseBoxesLineId(left);
  const b = parseBoxesLineId(right);
  if (!a || !b) return String(left).localeCompare(String(right));
  if (a.orientation !== b.orientation) return a.orientation.localeCompare(b.orientation);
  if (a.row !== b.row) return a.row - b.row;
  return a.col - b.col;
}

function boxesAdjacentBoxes(game, lineId) {
  const line = parseBoxesLineId(lineId);
  if (!line) return [];
  const boxes = [];
  if (line.orientation === "h") {
    if (line.row > 0) boxes.push({ row: line.row - 1, col: line.col });
    if (line.row < game.rows) boxes.push({ row: line.row, col: line.col });
  } else {
    if (line.col > 0) boxes.push({ row: line.row, col: line.col - 1 });
    if (line.col < game.cols) boxes.push({ row: line.row, col: line.col });
  }
  return boxes;
}

function boxesBoxLineIds(row, col) {
  return [
    boxesLineId("h", row, col),
    boxesLineId("h", row + 1, col),
    boxesLineId("v", row, col),
    boxesLineId("v", row, col + 1),
  ];
}
