// Room wire projection: turns internal room/invite state into the public dicts
// the client sees (full room, list summary, viewer-projected room, invite), and
// owns the room's revision/freshness invariants that those dicts carry (clients
// order updates by `revision`/`game_epoch`). Extracted from the Worker entry so
// the entry owns routing and side-effect dispatch, not serialization. Pure:
// depends only on downstream modules (game-catalog / projections / handlers),
// never on the entry.
import { cleanGameId, playerCountForGame } from "./game-catalog.js";
import { roomStatus } from "./projections.js";
import { gameToDict, gameToDictForViewer } from "./games/handlers.js";

export function publicInvite(invite) {
  return { ...invite, game_id: cleanGameId(invite.game_id) };
}

function ensureRoomFreshness(room) {
  if (!room) return;
  const revision = Number(room.revision);
  const gameEpoch = Number(room.game_epoch);
  room.revision = Number.isFinite(revision) && revision > 0 ? revision : 1;
  room.game_epoch = Number.isFinite(gameEpoch) && gameEpoch > 0 ? gameEpoch : 1;
}

export function bumpRoomRevision(room, options = {}) {
  ensureRoomFreshness(room);
  if (options.newGame) room.game_epoch += 1;
  room.revision += 1;
}

function latestInviteForRoom(data, room) {
  if (!data || !data.invites) return null;
  const invites = Object.values(data.invites).filter((invite) => invite.room_code === room.code);
  return invites.length ? publicInvite(invites[invites.length - 1]) : null;
}

function resetRequestForRoom(room) {
  if (!room.reset_votes.length) return null;
  const requesterId = room.reset_votes[0];
  const requester = room.players.find((player) => player.id === requesterId);
  return {
    requester_id: requesterId,
    requester_name: requester ? requester.name : "Player",
    votes: [...room.reset_votes].sort(),
    needed: room.players.length,
  };
}

export function roomToDict(data, room) {
  ensureRoomFreshness(room);
  return {
    code: room.code,
    host_id: room.host_id,
    game_id: cleanGameId(room.game_id),
    revision: room.revision,
    game_epoch: room.game_epoch,
    started: room.started,
    local_mode: room.local_mode,
    status: roomStatus(room),
    players: room.players,
    game: gameToDict(room.game),
    latest_invite: latestInviteForRoom(data, room),
    reset_request: resetRequestForRoom(room),
    stats_recorded: Boolean(room.stats_recorded),
  };
}

export function roomToDictForViewer(data, room, viewerPlayerId = "") {
  const base = room && room.status && room.game_id ? structuredClone(room) : roomToDict(data, room);
  const viewerId = String(viewerPlayerId || "").trim();
  const viewerSeat = base.players.find((player) => player.id === viewerId);
  base.game = gameToDictForViewer(base.game, viewerSeat ? viewerSeat.mark : "", base.status);
  return base;
}

export function responseForViewer(response, viewerPlayerId = "") {
  if (!response || response.ok === false) return response;
  const projected = { ...response };
  if (projected.room) projected.room = roomToDictForViewer(null, projected.room, viewerPlayerId);
  if (projected.active_room) projected.active_room = roomToDictForViewer(null, projected.active_room, viewerPlayerId);
  if (Array.isArray(projected.rooms)) {
    projected.rooms = projected.rooms.map((room) => room && room.game ? roomToDictForViewer(null, room, viewerPlayerId) : room);
  }
  return projected;
}

export function viewerPlayerIdForRequest(url, payload = {}) {
  return String(url.searchParams.get("player_id") || viewerPlayerIdForPayload(payload) || "").trim();
}

export function viewerPlayerIdForPayload(payload = {}) {
  return String(
    payload.player_id ||
    payload.requester_id ||
    payload.host_id ||
    payload.player && payload.player.id ||
    payload.id ||
    "",
  ).trim();
}

export function roomSummary(room) {
  ensureRoomFreshness(room);
  const playerCount = playerCountForGame(room.game_id);
  return {
    code: room.code,
    host_id: room.host_id,
    game_id: cleanGameId(room.game_id),
    revision: room.revision,
    game_epoch: room.game_epoch,
    started: room.started,
    local_mode: room.local_mode,
    status: roomStatus(room),
    players: room.players,
    open_seats: Number.isFinite(playerCount) ? Math.max(0, playerCount - room.players.length) : null,
  };
}
