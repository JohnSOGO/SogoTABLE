import { appEventsSocketUrl, roomSocketUrl } from "./api-client.js";

const MAX_RECONNECT_DELAY_MS = 30000;
const ROOM_POLL_MS = 7000;   // safety-net re-fetch cadence while WAITING on another player (see recovery below)

export function createRealtimeController(callbacks) {
  let roomSocket = null;
  let roomReconnectTimer = null;
  let roomPollTimer = null;
  let roomSocketReconnectAttempts = 0;
  let roomCode = "";
  let connectedRoomCode = "";
  let connectedRoomPlayerId = "";
  let appEventsSocket = null;
  let appEventsGameId = "";
  let appEventsReconnectTimer = null;
  let appEventsReconnectAttempts = 0;

  function startRoomLiveUpdates(nextRoomCode) {
    const nextCode = nextRoomCode || "";
    if (connectedRoomCode && connectedRoomCode !== nextCode) stopRoomSocket();
    roomCode = nextCode;
    if (roomSocket && connectedRoomPlayerId && connectedRoomPlayerId !== callbacks.getRoomPlayerId()) stopRoomSocket();
    connectRoomSocket();
    callbacks.refreshRoom();
    armRoomPoll();
  }

  function stopRoomLiveUpdates() {
    stopRoomSocket();
    roomCode = "";
    disarmRoomPoll();
  }

  // The WebSocket is the primary sync path; these are backstops for a snapshot the client NEVER received —
  // a mobile tab that backgrounded (iOS freezes the socket without a clean `close`, so no reconnect fires)
  // or a frame dropped under lag. With two humans this deadlocks: a missed "it's your turn" broadcast
  // leaves the game WAITING on a stale client, so no further broadcast ever comes to unstick it, and the
  // player has to restart the app (room HSYF). Both paths only RE-FETCH (callbacks.refreshRoom); setRoom's
  // isStaleRoomSnapshot revision guard makes a late/older reply safe — no new mutation or broadcast.
  function refreshRoomLiveUpdates() {   // foreground return: reconnect the (maybe frozen) socket AND re-pull
    if (!roomCode) return;
    stopRoomSocket();
    connectRoomSocket();
    callbacks.refreshRoom();
  }
  function onForeground() { if (roomCode) refreshRoomLiveUpdates(); }
  function armRoomPoll() {
    disarmRoomPoll();
    roomPollTimer = setInterval(() => {
      if (!roomCode) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;   // hidden → onForeground re-pulls on return
      if (callbacks.shouldPollRoom && callbacks.shouldPollRoom()) callbacks.refreshRoom();      // only while it's NOT my turn
    }, ROOM_POLL_MS);
  }
  function disarmRoomPoll() { if (roomPollTimer) { clearInterval(roomPollTimer); roomPollTimer = null; } }
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") onForeground(); });
  if (typeof window !== "undefined") window.addEventListener("pageshow", onForeground);

  function connectRoomSocket() {
    if (!roomCode || !("WebSocket" in window)) return;
    if (roomSocket && roomSocket.readyState <= WebSocket.OPEN) return;
    stopRoomSocket(false);
    try {
      const playerId = callbacks.getRoomPlayerId();
      roomSocket = new WebSocket(roomSocketUrl(roomCode, playerId));
      connectedRoomPlayerId = playerId;
    } catch {
      scheduleRoomReconnect();
      return;
    }
    roomSocket.addEventListener("open", () => {
      const wasReconnecting = roomSocketReconnectAttempts > 0;
      connectedRoomCode = roomCode;
      roomSocketReconnectAttempts = 0;
      if (wasReconnecting) callbacks.refreshRoom();
    });
    roomSocket.addEventListener("message", callbacks.onRoomMessage);
    roomSocket.addEventListener("close", () => {
      roomSocket = null;
      if (callbacks.shouldReconnectRoom()) {
        callbacks.onRoomReconnect();
        scheduleRoomReconnect();
      }
    });
    roomSocket.addEventListener("error", () => {
      if (roomSocket) roomSocket.close();
    });
  }

  function stopRoomSocket(clearReconnect = true) {
    connectedRoomCode = "";
    connectedRoomPlayerId = "";
    if (roomSocket) {
      const socket = roomSocket;
      roomSocket = null;
      socket.close();
    }
    if (clearReconnect && roomReconnectTimer) {
      clearTimeout(roomReconnectTimer);
      roomReconnectTimer = null;
    }
  }

  function scheduleRoomReconnect() {
    if (roomReconnectTimer || !callbacks.shouldReconnectRoom()) return;
    const delay = reconnectDelay(roomSocketReconnectAttempts);
    roomSocketReconnectAttempts += 1;
    roomReconnectTimer = setTimeout(() => {
      roomReconnectTimer = null;
      connectRoomSocket();
    }, delay);
  }

  function connectAppEvents() {
    if (!("WebSocket" in window)) return;
    const subscription = callbacks.getAppSubscription();
    if (appEventsSocket && appEventsSocket.readyState <= WebSocket.OPEN && appEventsGameId === subscription.gameId) return;
    stopAppEvents(false);
    try {
      appEventsGameId = subscription.gameId;
      appEventsSocket = new WebSocket(appEventsSocketUrl(subscription));
    } catch {
      scheduleAppEventsReconnect();
      return;
    }
    appEventsSocket.addEventListener("open", () => {
      appEventsReconnectAttempts = 0;
      sendAppEventSubscription();
    });
    appEventsSocket.addEventListener("message", callbacks.onAppMessage);
    appEventsSocket.addEventListener("close", () => {
      appEventsSocket = null;
      scheduleAppEventsReconnect();
    });
    appEventsSocket.addEventListener("error", () => {
      if (appEventsSocket) appEventsSocket.close();
    });
  }

  function stopAppEvents(clearReconnect = true) {
    appEventsGameId = "";
    if (appEventsSocket) {
      const socket = appEventsSocket;
      appEventsSocket = null;
      socket.close();
    }
    if (clearReconnect && appEventsReconnectTimer) {
      clearTimeout(appEventsReconnectTimer);
      appEventsReconnectTimer = null;
    }
  }

  function scheduleAppEventsReconnect() {
    if (appEventsReconnectTimer) return;
    const delay = reconnectDelay(appEventsReconnectAttempts);
    appEventsReconnectAttempts += 1;
    appEventsReconnectTimer = setTimeout(() => {
      appEventsReconnectTimer = null;
      connectAppEvents();
    }, delay);
  }

  function sendAppEventSubscription() {
    const subscription = callbacks.getAppSubscription();
    if (!appEventsSocket || appEventsSocket.readyState !== WebSocket.OPEN || appEventsGameId !== subscription.gameId) {
      connectAppEvents();
      return;
    }
    appEventsSocket.send(JSON.stringify({
      type: "subscribe",
      game_id: subscription.gameId,
      player_id: subscription.playerId,
    }));
  }

  return {
    connectAppEvents,
    refreshRoomLiveUpdates,
    sendAppEventSubscription,
    startRoomLiveUpdates,
    stopRoomLiveUpdates,
  };
}

function reconnectDelay(attempts) {
  return Math.min(MAX_RECONNECT_DELAY_MS, 2000 * 2 ** attempts);
}
