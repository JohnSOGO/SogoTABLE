// Ten Thousand farkle auto-acknowledge. Farkle is player-declared (the Red X):
// once declared, the server marks the seat "farkled_pending_ack" and the tray
// shows the red dice + "You Farkled" banner. Hold that for
// TEN_THOUSAND_FARKLE_ACK_MS, then auto-acknowledge so the round can advance —
// the player already chose to bust, so no extra tap. The module owns its own
// dedupe key + timer; wireTenThousandFarkleAck injects the shell's game-state
// predicate, seat resolver, live-room getter, and action sender.

let ctx = {
  isTenThousandGameState: () => false,
  localRoomSeat: () => null,
  getCurrentRoom: () => null,
  makeTenThousandAction: () => {},
};

const TEN_THOUSAND_FARKLE_ACK_MS = 2000;
let farkleAckKey = ""; // dedupe so each declared bust schedules once
let farkleAckTimer = null;

export function wireTenThousandFarkleAck(context) {
  ctx = { ...ctx, ...context };
}

export function maybeAutoAckTenThousandFarkle(room) {
  if (!room || !ctx.isTenThousandGameState(room.game)) return;
  const localSeat = ctx.localRoomSeat(room);
  if (!localSeat) return;
  const seatState = (room.game.players || []).find((seat) => seat.mark === localSeat.mark);
  if (!seatState || seatState.finish_state !== "farkled_pending_ack") return;
  const key = `${room.code}:${localSeat.mark}:${room.game.move_count}`;
  if (key === farkleAckKey) return;
  farkleAckKey = key;
  if (farkleAckTimer) clearTimeout(farkleAckTimer);
  farkleAckTimer = setTimeout(() => {
    farkleAckTimer = null;
    // Only acknowledge if the bust is still pending (the player may have already
    // tapped through, or the room may have moved on).
    const currentRoom = ctx.getCurrentRoom();
    if (!currentRoom || !ctx.isTenThousandGameState(currentRoom.game)) return;
    const seat = ctx.localRoomSeat(currentRoom);
    const state = seat && (currentRoom.game.players || []).find((entry) => entry.mark === seat.mark);
    if (state && state.finish_state === "farkled_pending_ack") ctx.makeTenThousandAction({ type: "ack_farkle" });
  }, TEN_THOUSAND_FARKLE_ACK_MS);
}
