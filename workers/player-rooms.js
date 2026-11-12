// Player↔room membership queries over data.rooms: which unfinished tables a
// player is seated at. Read-only selection — no projection (room-view.js owns
// the wire dicts) and no mutation. Must not import the Worker entry.
import { gameIdMatches } from "./game-catalog.js";
import { roomStatus } from "./projections.js";

const UNFINISHED = ["waiting_for_player", "active"];

function isUnfinishedSeat(room, playerId) {
  return UNFINISHED.includes(roomStatus(room)) && room.players.some((player) => player.id === playerId);
}

export function activeRoomForPlayer(data, playerId, gameId) {
  return Object.values(data.rooms).find((room) => (
    gameIdMatches(room.game_id, gameId) && isUnfinishedSeat(room, playerId)
  )) || null;
}

export function playerHasUnfinishedRoom(data, playerId) {
  return Object.values(data.rooms).some((room) => isUnfinishedSeat(room, playerId));
}
