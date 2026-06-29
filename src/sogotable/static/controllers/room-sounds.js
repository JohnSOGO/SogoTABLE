// Room-snapshot -> sound effects. Given the previous and current room snapshots,
// fire the right cue once: a player joined, the turn changed, a tactical/boxes
// capture, a 10,000 dice event, or game over. Pure reaction — it plays sounds and
// dedupes via its own per-cue keys; it mutates NO shell state, so a bug here is at
// worst a wrong/missing sound, never a broken game. wireRoomSounds injects the
// shell's localRoomSeat resolver + the game-state predicates.
import {
  playBank, playConfirm, playDiceRoll, playFarkle, playLose, playPlayerJoined,
  playScorePick, playTurnChanged, playWin,
} from "../sound.js";

let ctx = {
  localRoomSeat: () => null,
  isTenThousandGameState: () => false,
  isTacticalGameState: () => false,
  isBoxesGameState: () => false,
  isBotPlayer: () => false,
};

let lastPlayerJoinedSoundKey = "";
let lastTurnSoundKey = "";
let lastGameEventSoundKey = "";
let lastGameOverSoundKey = "";
let lastTenThousandSoundKey = "";

export function wireRoomSounds(context) {
  ctx = { ...ctx, ...context };
}

export function playRoomStateSounds(previousRoom, room) {
  if (!room || !previousRoom || previousRoom.code !== room.code) return;
  playPlayerJoinedSound(previousRoom, room);
  playTurnChangedSound(previousRoom, room);
  playTacticalEventSound(previousRoom, room);
  playBoxesEventSound(previousRoom, room);
  playTenThousandEventSound(previousRoom, room);
  playGameOverSound(previousRoom, room);
}

// 10,000 has no shared current_player, so the turn-change sound never fires.
// Drive its audio off last_move instead: dice tumble on a roll/reroll, a blip on
// set-aside, a cash-in on bank, a bust on the declared farkle. Only voice this
// device's own seat — parallel play broadcasts every seat's move to every device.
function playTenThousandEventSound(previousRoom, room) {
  if (!ctx.isTenThousandGameState(room.game)) return;
  const move = room.game.last_move;
  if (!move || !move.type) return;
  const localSeat = ctx.localRoomSeat(room);
  if (!localSeat || !localSeat.mark || move.mark !== localSeat.mark) return;
  const soundKey = `${room.code}:${move.move_count}:${move.type}:${move.mark || ""}`;
  if (soundKey === lastTenThousandSoundKey) return;
  lastTenThousandSoundKey = soundKey;
  if (move.type === "roll" || move.type === "reroll") playDiceRoll();
  else if (move.type === "select") playScorePick();
  else if (move.type === "bank") playBank();
  else if (move.type === "farkle") playFarkle();
}

function playPlayerJoinedSound(previousRoom, room) {
  const previousIds = new Set((previousRoom.players || []).map((player) => player.id));
  const joinedPlayers = (room.players || []).filter((player) => !previousIds.has(player.id));
  if (!joinedPlayers.length) return;
  const soundKey = `${room.code}:${joinedPlayers.map((player) => player.id).sort().join(",")}`;
  if (soundKey === lastPlayerJoinedSoundKey) return;
  lastPlayerJoinedSoundKey = soundKey;
  playPlayerJoined();
}

function playTurnChangedSound(previousRoom, room) {
  if (!room.started || !room.game || room.game.status !== "playing") return;
  if (!previousRoom.game || previousRoom.game.current_player === room.game.current_player) return;
  const currentTurnPlayer = room.players.find((player) => player.mark === room.game.current_player);
  if (ctx.isBotPlayer(currentTurnPlayer)) return;
  const soundKey = `${room.code}:${room.game.move_count}:${room.game.current_player}`;
  if (soundKey === lastTurnSoundKey) return;
  lastTurnSoundKey = soundKey;
  playTurnChanged(room.game.current_player);
}

function playTacticalEventSound(previousRoom, room) {
  if (!ctx.isTacticalGameState(room.game) || !room.game.last_event) return;
  const previousEventKey = tacticalSoundEventKey(previousRoom.game && previousRoom.game.last_event);
  const nextEventKey = tacticalSoundEventKey(room.game.last_event);
  if (!nextEventKey || previousEventKey === nextEventKey || nextEventKey === lastGameEventSoundKey) return;
  lastGameEventSoundKey = nextEventKey;
  playConfirm();
}

function playBoxesEventSound(previousRoom, room) {
  if (!ctx.isBoxesGameState(room.game) || !room.game.last_move || room.game.status !== "playing") return;
  const previousMoveKey = boxesSoundMoveKey(previousRoom.game && previousRoom.game.last_move);
  const nextMoveKey = boxesSoundMoveKey(room.game.last_move);
  if (!nextMoveKey || previousMoveKey === nextMoveKey || nextMoveKey === lastGameEventSoundKey) return;
  if (!Array.isArray(room.game.last_move.captured) || !room.game.last_move.captured.length) return;
  lastGameEventSoundKey = nextMoveKey;
  playConfirm();
}

function playGameOverSound(previousRoom, room) {
  if (!room.game || room.game.status === "playing") return;
  if (previousRoom.game && previousRoom.game.status !== "playing") return;
  const soundKey = `${room.code}:${room.game.move_count}:${room.game.status}:${room.game.winner || ""}`;
  if (soundKey === lastGameOverSoundKey) return;
  lastGameOverSoundKey = soundKey;
  const selectedSeat = ctx.localRoomSeat(room);
  if (!room.game.winner || room.game.status === "draw") {
    playConfirm();
    return;
  }
  if (selectedSeat && selectedSeat.mark === room.game.winner) playWin();
  else playLose();
}

function tacticalSoundEventKey(event) {
  if (!event || !["pickupCaptured", "sectorCaptured"].includes(event.type)) return "";
  return JSON.stringify({
    type: event.type,
    player: event.player,
    board: event.board,
    cell: event.cell,
    sector: event.sector,
    points: event.points,
    pickup_type: event.pickup_type,
  });
}

function boxesSoundMoveKey(move) {
  if (!move || !move.line_id) return "";
  const capturedCount = Array.isArray(move.captured) ? move.captured.length : 0;
  if (!capturedCount) return "";
  return JSON.stringify({
    type: "boxesCaptured",
    player: move.player,
    line: move.line_id,
    capturedCount,
  });
}
