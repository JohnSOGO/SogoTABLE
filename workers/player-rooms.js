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

// Every unfinished table the player is seated at, across all games, ordered by
// room code so the list is stable (the my-rooms list behind the game switcher).
export function unfinishedRoomsForPlayer(data, playerId) {
  if (!playerId) return [];
  return Object.values(data.rooms)
    .filter((room) => isUnfinishedSeat(room, playerId))
    .sort((left, right) => String(left.code).localeCompare(String(right.code)));
}
