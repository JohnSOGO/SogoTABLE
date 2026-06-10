import { appEventsSocketUrl, roomSocketUrl } from "./api-client.js";

const ROOM_SUMMARY_FALLBACK_INTERVAL_MS = 60000;
const INVITE_FALLBACK_INTERVAL_MS = 60000;
const LOBBY_FALLBACK_INTERVAL_MS = 60000;
const ROOM_SOCKET_FALLBACK_INTERVAL_MS = 30000;
const MAX_RECONNECT_DELAY_MS = 30000;

export function createRealtimeController(callbacks) {
  let roomSocket = null;
  let roomSocketFallbackTimer = null;
  let roomReconnectTimer = null;
  let roomSocketReconnectAttempts = 0;
  let roomCode = "";
  let connectedRoomCode = "";
  let appEventsSocket = null;
  let appEventsGameId = "";
  let appEventsReconnectTimer = null;
  let appEventsReconnectAttempts = 0;
  let roomListTimer = null;
  let inviteTimer = null;
  let lobbyPresenceTimer = null;

  function startRoomLiveUpdates(nextRoomCode) {
    const nextCode = nextRoomCode || "";
    if (connectedRoomCode && connectedRoomCode !== nextCode) stopRoomSocket();
    roomCode = nextCode;
    connectRoomSocket();
    callbacks.refreshRoom();
  }

  function stopRoomLiveUpdates() {
    stopRoomSocket();
    stopRoomFallbackPolling();
    roomCode = "";
  }

  function connectRoomSocket() {
    if (!roomCode || !("WebSocket" in window)) {
      startRoomFallbackPolling();
      return;
    }
    if (roomSocket && roomSocket.readyState <= WebSocket.OPEN) return;
    stopRoomSocket(false);
    try {
      roomSocket = new WebSocket(roomSocketUrl(roomCode));
    } catch {
      scheduleRoomReconnect();
      return;
    }
    roomSocket.addEventListener("open", () => {
      connectedRoomCode = roomCode;
      roomSocketReconnectAttempts = 0;
      stopRoomFallbackPolling();
    });
    roomSocket.addEventListener("message", callbacks.onRoomMessage);
    roomSocket.addEventListener("close", () => {
      roomSocket = null;
      if (callbacks.shouldReconnectRoom()) {
        callbacks.onRoomReconnect();
        startRoomFallbackPolling();
        scheduleRoomReconnect();
      }
    });
    roomSocket.addEventListener("error", () => {
      if (roomSocket) roomSocket.close();
    });
  }

  function stopRoomSocket(clearReconnect = true) {
    connectedRoomCode = "";
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

  function startRoomFallbackPolling() {
    if (roomSocketFallbackTimer) return;
    roomSocketFallbackTimer = setInterval(callbacks.refreshRoom, ROOM_SOCKET_FALLBACK_INTERVAL_MS);
  }

  function stopRoomFallbackPolling() {
    if (roomSocketFallbackTimer) clearInterval(roomSocketFallbackTimer);
    roomSocketFallbackTimer = null;
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

  function startRoomListFallback() {
    if (roomListTimer) clearInterval(roomListTimer);
    roomListTimer = setInterval(callbacks.refreshRooms, ROOM_SUMMARY_FALLBACK_INTERVAL_MS);
    callbacks.refreshRooms();
  }

  function startInviteFallback() {
    if (inviteTimer) clearInterval(inviteTimer);
    inviteTimer = setInterval(callbacks.pollInvites, INVITE_FALLBACK_INTERVAL_MS);
    callbacks.pollInvites();
  }

  function startLobbyPresenceFallback() {
    if (lobbyPresenceTimer) clearInterval(lobbyPresenceTimer);
    lobbyPresenceTimer = setInterval(callbacks.updateLobbyPresence, LOBBY_FALLBACK_INTERVAL_MS);
  }

  function stopLobbyPresenceFallback() {
    if (lobbyPresenceTimer) clearInterval(lobbyPresenceTimer);
    lobbyPresenceTimer = null;
  }

  return {
    connectAppEvents,
    sendAppEventSubscription,
    startInviteFallback,
    startLobbyPresenceFallback,
    startRoomListFallback,
    startRoomLiveUpdates,
    stopLobbyPresenceFallback,
    stopRoomLiveUpdates,
  };
}

function reconnectDelay(attempts) {
  return Math.min(MAX_RECONNECT_DELAY_MS, 2000 * 2 ** attempts);
}
