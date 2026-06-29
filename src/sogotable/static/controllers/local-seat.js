// Local hot-seat seat persistence: which player THIS device drives in a local
// (pass-and-play) room. Keyed by room code + a device hash so a refresh or rejoin
// restores the right seat instead of snapping to the host. Pure device-local
// storage — no server state, no game rules. The shell's sync/restore orchestrators
// call these to resolve and update the home seat; wireLocalSeat injects live reads
// of the device hash + selected player id and loads the saved map (after the shell
// has run its storage-namespace migration, hence load-on-wire not on import).
import { loadLocalGameHomePlayers, LOCAL_GAME_HOME_PLAYERS_KEY } from "../storage.js";

let ctx = {
  getDeviceSelectionHash: () => "",
  getDeviceSelectedPlayerId: () => "",
};
let localGameHomePlayers = {};

export function wireLocalSeat(context) {
  ctx = { ...ctx, ...context };
  localGameHomePlayers = loadLocalGameHomePlayers();
}

export function isLocalModeRoom(room) {
  return Boolean(room && (room.local_mode || localGameHomePlayers[room.code]));
}

export function localGameHomePlayerId(room) {
  if (!room) return "";
  const remembered = localGameHomePlayers[room.code];
  if (typeof remembered === "string") return remembered;
  if (remembered && remembered.device_hash === ctx.getDeviceSelectionHash()) return remembered.player_id || "";
  return ctx.getDeviceSelectedPlayerId() || room.host_id || "";
}

export function rememberLocalGameHomePlayer(roomCode, playerId) {
  if (!roomCode || !playerId) return;
  localGameHomePlayers[roomCode] = {
    player_id: playerId,
    device_hash: ctx.getDeviceSelectionHash(),
  };
  saveLocalGameHomePlayers();
}

export function forgetLocalGameHomePlayer(room) {
  if (!room || !localGameHomePlayers[room.code]) return;
  delete localGameHomePlayers[room.code];
  saveLocalGameHomePlayers();
}

function saveLocalGameHomePlayers() {
  localStorage.setItem(LOCAL_GAME_HOME_PLAYERS_KEY, JSON.stringify(localGameHomePlayers));
}
