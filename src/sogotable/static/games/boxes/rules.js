import {
  adjacentBoxesForLine,
  allLineIds,
  boxLineIds,
  compareLineIds,
  normalizeLineId,
  normalizeState,
} from "./state.js";

export function getLegalActions(state) {
  const current = normalizeState(state);
  if (current.status === "complete") return [];
  const claimed = new Set(current.lines);
  return allLineIds(current.rows, current.cols)
    .filter((lineId) => !claimed.has(lineId))
    .map((lineId) => ({ type: "claim_line", lineId }));
}

export function applyAction(state, action) {
  const current = normalizeState(state);
  if (current.status === "complete") throw new Error("The game is already complete.");
  if (!action || action.type !== "claim_line") throw new Error("Action must claim a line.");
  const lineId = normalizeLineId(action.lineId);
  if (!lineId) throw new Error("Line id is required.");
  const legal = getLegalActions(current).some((item) => item.lineId === lineId);
  if (!legal) throw new Error("That line is not available.");

  const player = current.players[current.currentPlayerIndex];
  const claimedLines = new Set(current.lines);
  claimedLines.add(lineId);
  const nextLines = Array.from(claimedLines).sort(compareLineIds);
  const boxes = current.boxes.map((row) => row.slice());
  const captured = [];

  for (const box of adjacentBoxesForLine(lineId, current.rows, current.cols)) {
    if (boxes[box.row][box.col]) continue;
    if (boxLineIds(box.row, box.col).every((id) => claimedLines.has(id))) {
      boxes[box.row][box.col] = player.id;
      captured.push(box);
    }
  }

  const players = scorePlayers(current.players, boxes);
  const allClaimed = nextLines.length >= allLineIds(current.rows, current.cols).length;
  const result = allClaimed ? calculateResult(players) : null;
  const nextPlayerIndex = captured.length
    ? current.currentPlayerIndex
    : (current.currentPlayerIndex + 1) % players.length;

  return normalizeState({
    ...current,
    status: allClaimed ? "complete" : "playing",
    currentPlayerIndex: allClaimed ? current.currentPlayerIndex : nextPlayerIndex,
    players,
    lines: nextLines,
    boxes,
    moveCount: current.moveCount + 1,
    lastMove: {
      playerId: player.id,
      lineId,
      captured,
    },
    result,
    log: [
      ...current.log,
      {
        type: "claim_line",
        playerId: player.id,
        lineId,
        captured,
      },
    ],
  });
}

export function getPublicView(state) {
  const current = normalizeState(state);
  const totalBoxes = current.rows * current.cols;
  const totalLines = allLineIds(current.rows, current.cols).length;
  return {
    gameId: current.gameId,
    rows: current.rows,
    cols: current.cols,
    status: current.status,
    currentPlayerIndex: current.currentPlayerIndex,
    currentPlayerId: current.players[current.currentPlayerIndex]?.id || "",
    players: current.players.map((player) => ({ ...player })),
    lines: current.lines.slice(),
    boxes: current.boxes.map((row) => row.slice()),
    moveCount: current.moveCount,
    totalBoxes,
    totalLines,
    claimedLineCount: current.lines.length,
    openLineCount: totalLines - current.lines.length,
    lastMove: current.lastMove,
    result: current.result,
    log: current.log.slice(-20),
  };
}

export function chooseBotMove(state) {
  const current = normalizeState(state);
  const legal = getLegalActions(current).map((action) => action.lineId);
  if (!legal.length) return null;
  const captures = legal
    .map((lineId) => ({ lineId, captures: captureCountAfterLine(current, lineId) }))
    .filter((item) => item.captures > 0)
    .sort((left, right) => right.captures - left.captures || left.lineId.localeCompare(right.lineId));
  if (captures.length) return { type: "claim_line", lineId: captures[0].lineId };

  const safe = legal.filter((lineId) => !createsThreeSidedBox(current, lineId));
  const candidates = safe.length ? safe : legal;
  candidates.sort(compareLineIds);
  return { type: "claim_line", lineId: candidates[0] };
}

export function isGameOver(state) {
  return normalizeState(state).status === "complete";
}

export function getScore(state) {
  return normalizeState(state).players.map((player) => ({
    playerId: player.id,
    score: Number(player.score || 0),
  }));
}

export function countBoxSides(state, row, col, extraLineId = "") {
  const current = normalizeState(state);
  const claimed = new Set(current.lines);
  if (extraLineId) claimed.add(extraLineId);
  return boxLineIds(row, col).filter((lineId) => claimed.has(lineId)).length;
}

function captureCountAfterLine(state, lineId) {
  return adjacentBoxesForLine(lineId, state.rows, state.cols)
    .filter((box) => !state.boxes[box.row][box.col])
    .filter((box) => countBoxSides(state, box.row, box.col, lineId) === 4)
    .length;
}

function createsThreeSidedBox(state, lineId) {
  return adjacentBoxesForLine(lineId, state.rows, state.cols)
    .filter((box) => !state.boxes[box.row][box.col])
    .some((box) => countBoxSides(state, box.row, box.col, lineId) === 3);
}

function scorePlayers(players, boxes) {
  return players.map((player) => ({
    ...player,
    score: boxes.flat().filter((ownerId) => ownerId === player.id).length,
  }));
}

function calculateResult(players) {
  const sorted = players.slice().sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
  if (!sorted.length || Number(sorted[0].score || 0) === Number(sorted[1]?.score || 0)) {
    return { outcome: "draw", winnerId: null };
  }
  return { outcome: "win", winnerId: sorted[0].id };
}

