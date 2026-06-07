import { appEventsSocketUrl, roomSocketUrl } from "./api-client.js";

const ROOM_SUMMARY_FALLBACK_INTERVAL_MS = 15000;
const INVITE_FALLBACK_INTERVAL_MS = 30000;
const LOBBY_FALLBACK_INTERVAL_MS = 15000;
const ROOM_SOCKET_FALLBACK_INTERVAL_MS = 15000;
const MAX_RECONNECT_DELAY_MS = 30000;

export function createRealtimeController(callbacks) {
  let roomSocket = null;
  let roomSocketFallbackTimer = null;
  let roomReconnectTimer = null;
  let roomSocketReconnectAttempts = 0;
  let roomCode = "";
  let appEventsSocket = null;
  let appEventsReconnectTimer = null;
  let appEventsReconnectAttempts = 0;
  let roomListTimer = null;
  let inviteTimer = null;
  let lobbyPresenceTimer = null;

  function startRoomLiveUpdates(nextRoomCode) {
    roomCode = nextRoomCode || "";
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
    if (appEventsSocket && appEventsSocket.readyState <= WebSocket.OPEN) return;
    stopAppEvents(false);
    try {
      appEventsSocket = new WebSocket(appEventsSocketUrl(callbacks.getAppSubscription()));
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
    if (!appEventsSocket || appEventsSocket.readyState !== WebSocket.OPEN) return;
    const subscription = callbacks.getAppSubscription();
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
    lobbyPresenceTimer = setInterval(() => {
      callbacks.updateLobbyPresence();
      callbacks.refreshGameRooms();
    }, LOBBY_FALLBACK_INTERVAL_MS);
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
