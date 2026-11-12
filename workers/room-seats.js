// Room seat roster lifecycle — seat/mark assignment + seat colours,
// activation/start, host-start mark re-pack, and the reset-vote tally. Extracted
// from the Worker entry (workers/sogotable-api.js) so the entry only routes;
// this module must never import the entry file.
import { playerCountForGame, gameUsesHostStart } from "./game-catalog.js";
import { isBotSeat } from "./games/bots.js";
import { initGameSeats, resetRoomGame } from "./games/handlers.js";
import { bumpRoomRevision } from "./room-view.js";

export const ROOM_SEAT_COLORS = [
  "#1f7a5f",
  "#1e63d6",
  "#c43d5d",
  "#8a4bd1",
  "#b7791f",
  "#0f766e",
  "#dc2626",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#4f46e5",
  "#be123c",
  "#334155",
];
export const COLOR_SIMILARITY_THRESHOLD = 110;

export function addPlayerToRoom(room, player) {
  if (room.players.some((seat) => seat.id === player.id)) return;
  const playerCount = playerCountForGame(room.game_id);
  if (Number.isFinite(playerCount) && room.players.length >= playerCount) throw new Error(playerCount === 2 ? "Table already has two players." : "Table is full.");
  const mark = gameUsesHostStart(room.game_id)
    ? `P${room.players.length + 1}`
    : (playerCount === 1 ? "X" : room.players.length ? "X" : "");
  const seatedPlayer = { ...player, mark };
  if (room.players.length) seatedPlayer.color = nonConflictingRoomColor(seatedPlayer.color, room.players.map((seat) => seat.color));
  room.players.push(seatedPlayer);
  ensureRoomSeatColors(room);
}

export function activateRoomIfReady(room) {
  if (gameUsesHostStart(room.game_id)) return; // host starts explicitly via /api/room/start
  const playerCount = playerCountForGame(room.game_id);
  if (room.started || room.players.length < playerCount) return;
  if (playerCount === 1) {
    room.players[0].mark = "X";
    room.started = true;
    return;
  }
  const marks = Math.random() < 0.5 ? ["X", "O"] : ["O", "X"];
  room.players.forEach((seat, index) => {
    seat.mark = marks[index];
  });
  room.started = true;
}

// Explicit start for host-start games. Seats already carry P1..PN marks from
// addPlayerToRoom; this flips the room live and initialises per-seat game state
// via the dispatch table's initSeats field.
export function startRoom(room) {
  if (room.started) return;
  room.started = true;
  initGameSeats(room.game, room.players);
}

export function playerMark(room, playerId) {
  const player = room.players.find((seat) => seat.id === playerId);
  return player ? player.mark : null;
}

export function handleResetVote(room, requesterId, approve) {
  if (!approve) {
    room.reset_votes = [];
    return "declined";
  }
  if (!room.reset_votes.includes(requesterId)) room.reset_votes.push(requesterId);
  room.players.filter(isBotSeat).forEach((bot) => {
    if (!room.reset_votes.includes(bot.id)) room.reset_votes.push(bot.id);
  });
  if (room.players.length > 1 && room.reset_votes.length < room.players.length) return "pending";
  room.reset_votes = [];
  // Fresh game, carrying per-game host options and re-seeding per-seat state for
  // started host-start games — dispatch-table owned (carryOptionsOnReset/initSeats).
  resetRoomGame(room);
  bumpRoomRevision(room, { newGame: true });
  room.stats_recorded = false;
  return null;
}

export function ensureRoomSeatColors(room) {
  const existingColors = [];
  room.players.forEach((seat) => {
    seat.color = nonConflictingRoomColor(seat.color, existingColors);
    existingColors.push(seat.color);
  });
}

export function nonConflictingRoomColor(color, existingColors) {
  const safeColor = safeHexColor(color);
  if (!existingColors.length) return safeColor;
  if (existingColors.every((existing) => !colorsAreTooSimilar(safeColor, existing))) return safeColor;
  const taken = new Set(existingColors.map((existing) => existing.toLowerCase()));
  const candidates = ROOM_SEAT_COLORS.filter((candidate) => !taken.has(candidate.toLowerCase()));
  if (!candidates.length) return safeColor;
  return candidates.sort((left, right) => (
    Math.min(...existingColors.map((existing) => colorDistance(right, existing))) -
    Math.min(...existingColors.map((existing) => colorDistance(left, existing)))
  ))[0];
}

export function colorsAreTooSimilar(left, right) {
  return colorDistance(left, right) < COLOR_SIMILARITY_THRESHOLD;
}

export function colorDistance(left, right) {
  const leftRgb = hexToRgb(safeHexColor(left));
  const rightRgb = hexToRgb(safeHexColor(right));
  return Math.sqrt(leftRgb.reduce((total, channel, index) => total + (channel - rightRgb[index]) ** 2, 0));
}

export function safeHexColor(color) {
  const value = String(color || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : ROOM_SEAT_COLORS[0];
}

export function hexToRgb(color) {
  const clean = color.replace("#", "");
  return [0, 2, 4].map((start) => parseInt(clean.slice(start, start + 2), 16));
}

// Host-start marks are assigned as P<count+1>; after a pre-start seat removal,
// re-pack them so the next joiner can't collide with a surviving higher mark.
// No-op for fixed-capacity games.
export function repackHostStartMarks(room) {
  if (gameUsesHostStart(room.game_id)) room.players.forEach((seat, index) => { seat.mark = `P${index + 1}`; });
}
