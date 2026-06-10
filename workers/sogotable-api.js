const LOBBY_VIEWER_TTL_SECONDS = 45;
const ROOM_SEAT_COLORS = [
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
const COLOR_SIMILARITY_THRESHOLD = 110;
const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];
const GAME_DEFINITIONS = [
  {
    id: "a3f19c6e42b8",
    name: "Super Tic Tac Toe",
    summary: "A nested tic tac toe duel where every move sends the next player to a target board.",
    players: "2 players",
    status: "Ready",
    availability: "ready",
    aliases: ["super_tic_tac_toe"],
  },
  {
    id: "d7e4a91f0c23",
    name: "Super Tic Tactical Toe",
    summary: "Ultimate tic tac toe with tactical coin and treasure pickups for bonus points.",
    players: "2 players",
    status: "Ready",
    availability: "ready",
    aliases: ["super_tactical_tac_toe"],
  },
];
const DEFAULT_GAME_ID = GAME_DEFINITIONS[0].id;
const TACTICAL_GAME_ID = GAME_DEFINITIONS[1].id;
const GAME_ID_ALIASES = new Map();
GAME_DEFINITIONS.forEach((game) => {
  GAME_ID_ALIASES.set(game.id, game.id);
  (game.aliases || []).forEach((alias) => GAME_ID_ALIASES.set(alias, game.id));
});
const BOT_MOVE_DELAY_MS = 700;
const BOT_DEFINITIONS = [
  { id: "7c91a4e2b6d0", name: "Sogo Bot", icon: "\uD83E\uDD16", color: "#4f46e5", rating: 1000, strategy: "random" },
  { id: "0f8a3c9d1e72", name: "Tactical Tess", icon: "\uD83C\uDFAF", color: "#c43d5d", rating: 1000, strategy: "smart" },
  { id: "b64d20f19a8c", name: "Corner Cade", icon: "\u2B50", color: "#1f7a5f", rating: 1000, strategy: "random" },
  { id: "5e2c8a71d0f4", name: "Lucky Lina", icon: "\uD83C\uDF40", color: "#b7791f", rating: 1000, strategy: "random" },
];
const TACTICAL_TESS_BOT_ID = "0f8a3c9d1e72";
const TACTICAL_PICKUP_CONFIG = {
  coin: {
    emoji: "\uD83E\uDE99",
    label: "Coin",
    points: 10,
    maxActive: 5,
  },
  treasureChest: {
    emoji: "\uD83C\uDF81",
    label: "Treasure Chest",
    points: 25,
    maxActive: 3,
  },
};
const DEFAULT_ELO_RATING = 1000;
const ELO_K_FACTOR = 32;

const allowedOrigins = new Set([
  "https://sogotable.sogodojo.com",
  "https://sogotable.pages.dev",
]);

const baseCorsHeaders = {
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    const corsHeaders = corsHeadersFor(request);
    if (!corsHeaders) return json({ ok: false, error: "Origin is not allowed." }, 403, {});
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return json({ ok: false, error: "Unknown endpoint." }, 404, corsHeaders);
    if (request.method === "GET" && url.pathname === "/api/room/socket") return roomSocket(request, env, url);
    if (request.method === "GET" && url.pathname === "/api/events/socket") return appEventsSocket(request, env, url);
    try {
      if (request.method === "POST" && roomAuthorityPath(url.pathname) && env.ROOM_OBJECT) {
        const payload = await readJson(request);
        const response = await roomAuthorityRequest(env, url.pathname, payload);
        return json(response, response.ok === false ? 400 : 200, corsHeaders);
      }
      const data = await loadState(env);
      const payload = request.method === "POST" ? await readJson(request) : {};
      const response = await routeRequest(request.method, url, payload, data);
      if (request.method !== "GET") {
        await saveState(env, data);
        await notifyRoomObject(env, response);
        await notifyEventHub(env, data, response);
      }
      return json(response, 200, corsHeaders);
    } catch (error) {
      return json({ ok: false, error: error.message || "Request failed." }, 400, corsHeaders);
    }
  },
};

export class RoomDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/__room_action") {
      const { pathname, payload } = await request.json();
      return this.handleRoomAction(pathname, payload || {});
    }
    if (request.method === "POST" && url.pathname === "/__room_snapshot") {
      const room = await request.json();
      await this.storeRoomSnapshot(room);
      return json({ ok: true });
    }
    if (request.method === "POST" && url.pathname === "/__room_close") {
      const { code } = await request.json();
      await this.storeRoomClosed(code);
      return json({ ok: true });
    }
    const upgrade = request.headers.get("Upgrade") || "";
    if (upgrade.toLowerCase() !== "websocket") return json({ ok: false, error: "Expected WebSocket upgrade." }, 426);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const hibernating = acceptDurableWebSocket(this.state, server);
    setSocketAttachment(server, { type: "room", connected_at: Date.now() });
    this.sessions.add(server);
    if (!hibernating) {
      server.addEventListener("close", () => this.webSocketClose(server));
      server.addEventListener("error", (event) => this.webSocketError(server, event.error));
    }
    const snapshot = await this.state.storage.get("room");
    if (snapshot) safeSend(server, { type: "room_snapshot", room: snapshot });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage() {}

  webSocketClose(ws, code, reason) {
    this.sessions.delete(ws);
    closeSocketQuietly(ws, code, reason);
  }

  webSocketError(ws) {
    this.sessions.delete(ws);
  }

  async storeRoomSnapshot(room) {
    await this.state.storage.put("room", room);
    this.broadcast({ type: "room_snapshot", room });
  }

  async storeRoomClosed(code) {
    await this.state.storage.delete("room");
    this.broadcast({ type: "room_closed", code });
  }

  async handleRoomAction(pathname, payload) {
    try {
      const response = await withStateRetry(async () => {
        const data = await loadState(this.env);
        const result = await routeRequest("POST", new URL(`https://room.object${pathname}`), payload, data, { autoBotMoves: false });
        await saveState(this.env, data);
        await this.publishRoomResult(result);
        await notifyEventHub(this.env, data, result);
        return result;
      });
      const botResponse = await this.runDelayedBotTurns(response);
      return json(botResponse || response);
    } catch (error) {
      return json({ ok: false, error: error.message || "Room action failed." }, 400);
    }
  }

  async publishRoomResult(response) {
    if (!response || response.ok === false) return;
    if (response.room && response.room.code) {
      await this.storeRoomSnapshot(response.room);
      return;
    }
    if (response.closed && response.room_code) await this.storeRoomClosed(response.room_code);
  }

  async runDelayedBotTurns(response) {
    if (!response || !response.room || !botSeatForCurrentTurn(response.room)) return;
    await sleep(BOT_MOVE_DELAY_MS);
    return withStateRetry(async () => {
      const data = await loadState(this.env);
      const room = data.rooms[response.room.code];
      const result = runBotTurns(data, room);
      if (!result) return null;
      await saveState(this.env, data);
      await this.publishRoomResult(result);
      await notifyEventHub(this.env, data, result);
      return result;
    });
  }

  broadcast(message) {
    for (const session of durableWebSockets(this.state, this.sessions)) safeSend(session, message);
  }
}

export class EventHubDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/__app_snapshot") {
      const snapshot = await request.json();
      this.broadcastSnapshot(snapshot);
      return json({ ok: true });
    }
    const upgrade = request.headers.get("Upgrade") || "";
    if (upgrade.toLowerCase() !== "websocket") return json({ ok: false, error: "Expected WebSocket upgrade." }, 426);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const subscription = {
      game_id: safeGameIdForEvents(url.searchParams.get("game_id") || DEFAULT_GAME_ID),
      player_id: String(url.searchParams.get("player_id") || "").trim(),
      connected_at: Date.now(),
    };
    const hibernating = acceptDurableWebSocket(this.state, server);
    setSocketAttachment(server, subscription);
    this.sessions.set(server, subscription);
    if (!hibernating) {
      server.addEventListener("message", (event) => this.handleSessionMessage(server, event.data));
      server.addEventListener("close", () => this.webSocketClose(server));
      server.addEventListener("error", (event) => this.webSocketError(server, event.error));
    }
    await this.sendInitialSnapshot(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    await this.handleSessionMessage(ws, message);
  }

  webSocketClose(ws, code, reason) {
    this.sessions.delete(ws);
    closeSocketQuietly(ws, code, reason);
  }

  webSocketError(ws) {
    this.sessions.delete(ws);
  }

  async handleSessionMessage(session, data) {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    if (message.type !== "subscribe") return;
    const subscription = {
      game_id: safeGameIdForEvents(message.game_id || DEFAULT_GAME_ID),
      player_id: String(message.player_id || "").trim(),
      connected_at: socketAttachment(session).connected_at || Date.now(),
      subscribed_at: Date.now(),
    };
    setSocketAttachment(session, subscription);
    this.sessions.set(session, subscription);
    await this.sendInitialSnapshot(session);
  }

  async sendInitialSnapshot(session) {
    const subscription = this.subscriptionForSession(session);
    if (!subscription) return;
    try {
      const data = await loadState(this.env);
      const snapshot = eventSnapshotForGame(data, subscription.game_id);
      safeSend(session, appSnapshotForSubscription(snapshot, subscription));
    } catch (error) {
      safeSend(session, { type: "app_snapshot_error", error: error.message || "Unable to load app snapshot." });
    }
  }

  broadcastSnapshot(snapshot) {
    for (const session of durableWebSockets(this.state, this.sessions)) {
      const subscription = this.subscriptionForSession(session);
      if (!subscription) continue;
      if (subscription.game_id !== snapshot.game_id) continue;
      safeSend(session, appSnapshotForSubscription(snapshot, subscription));
    }
  }

  subscriptionForSession(session) {
    const subscription = socketAttachment(session);
    if (subscription.game_id) return subscription;
    return this.sessions.get(session);
  }
}

function acceptDurableWebSocket(state, server) {
  if (state && typeof state.acceptWebSocket === "function") {
    state.acceptWebSocket(server);
    return true;
  }
  server.accept();
  return false;
}

function durableWebSockets(state, fallbackSessions) {
  if (state && typeof state.getWebSockets === "function") return state.getWebSockets();
  if (fallbackSessions instanceof Map) return Array.from(fallbackSessions.keys());
  return Array.from(fallbackSessions || []);
}

function setSocketAttachment(socket, metadata) {
  if (socket && typeof socket.serializeAttachment === "function") socket.serializeAttachment(metadata);
}

function socketAttachment(socket) {
  if (!socket || typeof socket.deserializeAttachment !== "function") return {};
  return socket.deserializeAttachment() || {};
}

function closeSocketQuietly(socket, code, reason) {
  if (!socket || typeof socket.close !== "function") return;
  try {
    socket.close(code, reason);
  } catch {}
}

async function routeRequest(method, url, payload, data, options = {}) {
  const autoBotMoves = options.autoBotMoves !== false;
  if (method === "GET" && url.pathname === "/api/games") return { ok: true, games: GAME_DEFINITIONS.map(publicGameDefinition) };
  if (method === "GET" && url.pathname === "/api/players") return { ok: true, players: data.players };
  if (method === "GET" && url.pathname === "/api/bots") {
    cleanGameId(url.searchParams.get("game_id") || DEFAULT_GAME_ID);
    return { ok: true, bots: BOT_DEFINITIONS.map(publicBot) };
  }
  if (method === "GET" && url.pathname === "/api/player/stats") {
    const playerId = String(url.searchParams.get("player_id") || "").trim();
    if (!playerId) throw new Error("Player id is required.");
    return { ok: true, player_id: playerId, stats: publicPlayerStats(data, playerId) };
  }
    if (method === "POST" && url.pathname === "/api/player/stats/clear") {
      const playerId = String(payload.player_id || payload.id || "").trim();
      if (!playerId) throw new Error("Player id is required.");
      clearPlayerStats(data, playerId);
      return { ok: true, player_id: playerId, stats: publicPlayerStats(data, playerId), game_ids: GAME_DEFINITIONS.map((game) => game.id) };
  }
  if (method === "GET" && url.pathname === "/api/stats") {
    const gameId = cleanGameId(url.searchParams.get("game_id") || DEFAULT_GAME_ID);
    return { ok: true, game_id: gameId, stats: publicStatsForGame(data, gameId) };
  }
    if (method === "POST" && url.pathname === "/api/players/create") {
      const player = playerFromPayload(payload);
      upsertPlayer(data, player);
      const rooms = refreshActiveRoomPlayer(data, player).map((room) => roomToDict(data, room));
      refreshPlayerStats(data, player);
      return { ok: true, player, players: data.players, rooms };
    }
    if ((method === "POST" && url.pathname === "/api/players/delete") || (method === "DELETE" && url.pathname === "/api/players")) {
      const playerId = String(payload.id || url.searchParams.get("id") || "").trim();
      if (!playerId) throw new Error("Player id is required.");
      if (playerHasUnfinishedRoom(data, playerId)) throw new Error("Player is seated in an unfinished room.");
      data.players = data.players.filter((player) => player.id !== playerId);
      delete data.lobbyViewers[playerId];
      Object.keys(data.invites).forEach((inviteId) => {
        const invite = data.invites[inviteId];
        if (invite.host_id === playerId || invite.target_id === playerId) delete data.invites[inviteId];
      });
      return { ok: true, players: data.players };
    }
    if (method === "GET" && url.pathname === "/api/lobby") {
      return { ok: true, players: lobbyViewers(data, url.searchParams.get("game_id") || "") };
    }
    if (method === "POST" && url.pathname === "/api/lobby/presence") {
      const gameId = cleanGameId(payload.game_id);
      const player = playerFromPayload(payload);
      data.lobbyViewers[player.id] = { game_id: gameId, player, updated_at: Date.now() };
      return { ok: true, game_id: gameId, players: lobbyViewers(data, gameId), stats: publicStatsForGame(data, gameId) };
    }
    if (method === "GET" && url.pathname === "/api/rooms") {
      const playerId = url.searchParams.get("player_id") || "";
      const gameId = cleanGameId(url.searchParams.get("game_id") || DEFAULT_GAME_ID);
      if (playerId && gameId) {
        const activeRoom = activeRoomForPlayer(data, playerId, gameId);
        return { ok: true, active_room: activeRoom ? roomToDict(data, activeRoom) : null };
      }
      const rooms = Object.values(data.rooms)
        .filter((room) => ["waiting_for_player", "active"].includes(roomStatus(room)))
        .filter((room) => !gameId || gameIdMatches(room.game_id, gameId))
        .map((room) => roomSummary(room));
      return { ok: true, rooms };
    }
    if (method === "GET" && url.pathname === "/api/room") {
      const code = cleanRoomCode(url.searchParams.get("code") || "");
      const room = data.rooms[code];
      if (!room) return { ok: false, error: "Room not found." };
      return { ok: true, room: roomToDict(data, room) };
    }
    if (method === "POST" && url.pathname === "/api/room/create") {
      const gameId = cleanGameId(payload.game_id);
      const player = playerFromPayload(payload);
      const existing = activeRoomForPlayer(data, player.id, gameId);
      if (existing) return { ok: true, room: roomToDict(data, existing), existing: true };
      const code = payload.code ? cleanRoomCode(payload.code) : newRoomCode(data);
      if (data.rooms[code]) throw new Error("Room code is already in use.");
      const room = {
        code,
        host_id: player.id,
        game_id: gameId,
        revision: 1,
        game_epoch: 1,
        started: false,
        local_mode: false,
        game: newGame(gameId),
        players: [],
        reset_votes: [],
      };
      addPlayerToRoom(room, player);
      data.rooms[code] = room;
      return { ok: true, room: roomToDict(data, room) };
    }
    if (method === "POST" && url.pathname === "/api/room/join") {
      const room = roomFromPayload(data, payload);
      if (payload.local) room.local_mode = true;
      addPlayerToRoom(room, playerFromPayload(payload));
      activateRoomIfReady(room);
      bumpRoomRevision(room);
      if (autoBotMoves) runBotTurns(data, room);
      return { ok: true, room: roomToDict(data, room) };
    }
    if (method === "POST" && url.pathname === "/api/room/join-bot") {
      const room = roomFromPayload(data, payload);
      const hostId = String(payload.host_id || "").trim();
      if (hostId !== room.host_id) throw new Error("Only the host can invite a bot.");
      if (roomStatus(room) !== "waiting_for_player") throw new Error("Bot can only join a waiting room.");
      if (room.players.length >= 2) throw new Error("Room already has two players.");
      const bot = botPlayerFromId(payload.bot_id);
      addPlayerToRoom(room, bot);
      activateRoomIfReady(room);
      bumpRoomRevision(room);
      if (autoBotMoves) runBotTurns(data, room);
      return { ok: true, room: roomToDict(data, room), bot };
    }
    if (method === "POST" && (url.pathname === "/api/room/leave" || url.pathname === "/api/room/close")) {
      const code = cleanRoomCode(payload.code || "");
      const room = data.rooms[code];
      if (room) delete data.rooms[code];
      return { ok: true, closed: true, room_code: code };
    }
    if (method === "POST" && url.pathname === "/api/room/move") {
      const room = roomFromPayload(data, payload);
      if (!room.started) throw new Error("Room is waiting for another player.");
      const mark = playerMark(room, String(payload.player_id || ""));
      if (!mark) throw new Error("Player is not in this room.");
      if (mark !== room.game.current_player) throw new Error(`It is ${room.game.current_player}'s turn.`);
      makeMove(room.game, Number(payload.board), Number(payload.cell));
      bumpRoomRevision(room);
      recordCompletedRoomStats(data, room);
      if (autoBotMoves) runBotTurns(data, room);
      return { ok: true, room: roomToDict(data, room) };
    }
    if (method === "POST" && url.pathname === "/api/room/reset") {
      const room = roomFromPayload(data, payload);
      const requesterId = String(payload.requester_id || "").trim();
      if (!requesterId) throw new Error("Requester id is required.");
      if (!room.players.some((player) => player.id === requesterId)) throw new Error("Only a seated player can reset the game.");
      const resetStatus = handleResetVote(room, requesterId, payload.approve !== false);
      if (autoBotMoves && !resetStatus) runBotTurns(data, room);
      const result = { ok: true, room: roomToDict(data, room) };
      if (resetStatus) result.reset = resetStatus;
      return result;
    }
    if (method === "GET" && url.pathname === "/api/invites") {
      const playerId = url.searchParams.get("player_id") || "";
      const hostId = url.searchParams.get("host_id") || "";
      const roomCode = (url.searchParams.get("room_code") || "").toUpperCase();
      const invites = Object.values(data.invites).filter((invite) => {
        if (hostId) return invite.host_id === hostId && (!roomCode || invite.room_code === roomCode);
        return invite.target_id === playerId && invite.status === "pending";
      }).map(publicInvite);
      return { ok: true, invites };
    }
    if (method === "POST" && url.pathname === "/api/invite/create") {
      const room = roomFromPayload(data, payload);
      const hostId = String(payload.host_id || "").trim();
      if (hostId !== room.host_id) throw new Error("Only the host can invite a player.");
      if (room.players.length >= 2) throw new Error("Room already has two players.");
      const target = playerFromPayload(payload.player || {});
      if (target.id === hostId) throw new Error("Host is already in the room.");
      const host = room.players.find((player) => player.id === room.host_id);
      const invite = {
        id: `${room.code}:${target.id}`,
        room_code: room.code,
        game_id: cleanGameId(room.game_id),
        host_id: room.host_id,
        host_name: host ? host.name : "Host",
        target_id: target.id,
        target_name: target.name,
        status: "pending",
      };
      data.invites[invite.id] = invite;
      return { ok: true, invite: publicInvite(invite), room: roomToDict(data, room) };
    }
    if (method === "POST" && url.pathname === "/api/invite/respond") {
      const invite = data.invites[String(payload.invite_id || "").trim()];
      if (!invite || invite.status !== "pending") throw new Error("Invite not found.");
      const player = playerFromPayload(payload);
      if (player.id !== invite.target_id) throw new Error("Invite belongs to a different player.");
      if (!payload.accept) {
        invite.status = "declined";
        const room = data.rooms[invite.room_code];
        return { ok: true, accepted: false, room: room ? roomToDict(data, room) : null };
      }
      const room = data.rooms[invite.room_code];
      if (!room) {
        invite.status = "expired";
        throw new Error("Room not found.");
      }
      addPlayerToRoom(room, player);
      activateRoomIfReady(room);
      bumpRoomRevision(room);
      invite.status = "accepted";
      return { ok: true, accepted: true, room: roomToDict(data, room) };
    }
  throw new Error("Unknown endpoint.");
}

function roomSocket(request, env, url) {
  if (!env.ROOM_OBJECT) return json({ ok: false, error: "Room live updates are not configured." }, 503);
  const code = cleanRoomCode(url.searchParams.get("code") || "");
  return env.ROOM_OBJECT.getByName(code).fetch(request);
}

function roomAuthorityPath(pathname) {
  return [
    "/api/room/join",
    "/api/room/join-bot",
    "/api/room/leave",
    "/api/room/close",
    "/api/room/move",
    "/api/room/reset",
    "/api/invite/respond",
  ].includes(pathname);
}

async function roomAuthorityRequest(env, pathname, payload) {
  const code = cleanRoomCode(payload.code || payload.room_code || roomCodeFromInviteId(payload.invite_id) || "");
  const response = await env.ROOM_OBJECT.getByName(code).fetch(new Request("https://room.object/__room_action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pathname, payload }),
  }));
  return response.json();
}

function roomCodeFromInviteId(inviteId) {
  const value = String(inviteId || "").trim();
  const [code] = value.split(":");
  return code || "";
}

function appEventsSocket(request, env, url) {
  if (!env.EVENT_HUB) return json({ ok: false, error: "App event updates are not configured." }, 503);
  const gameId = safeGameIdForEvents(url.searchParams.get("game_id") || DEFAULT_GAME_ID);
  return env.EVENT_HUB.getByName(gameId).fetch(request);
}

async function notifyRoomObject(env, response) {
  if (!env.ROOM_OBJECT || !response || response.ok === false) return;
  if (response.room && response.room.code) {
    await env.ROOM_OBJECT.getByName(response.room.code).fetch(new Request("https://room.object/__room_snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response.room),
    }));
    return;
  }
  if (Array.isArray(response.rooms)) {
    for (const room of response.rooms) {
      if (!room || !room.code) continue;
      await env.ROOM_OBJECT.getByName(room.code).fetch(new Request("https://room.object/__room_snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(room),
      }));
    }
    return;
  }
  if (response.closed && response.room_code) {
    await env.ROOM_OBJECT.getByName(response.room_code).fetch(new Request("https://room.object/__room_close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: response.room_code }),
    }));
  }
}

async function notifyEventHub(env, data, response) {
  if (!env.EVENT_HUB || !response || response.ok === false) return;
  if (Array.isArray(response.rooms) && response.rooms.length) {
    const gameIds = [...new Set(response.rooms.map((room) => room.game_id).filter(Boolean).map(safeGameIdForEvents))];
    for (const gameId of gameIds) {
      const snapshot = eventSnapshotForGame(data, gameId);
      await env.EVENT_HUB.getByName(gameId).fetch(new Request("https://event.hub/__app_snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      }));
    }
    return;
  }
  if (Array.isArray(response.game_ids) && response.game_ids.length) {
    for (const gameId of [...new Set(response.game_ids.map(safeGameIdForEvents))]) {
      const snapshot = eventSnapshotForGame(data, gameId);
      await env.EVENT_HUB.getByName(gameId).fetch(new Request("https://event.hub/__app_snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      }));
    }
    return;
  }
  const gameId = response.room && response.room.game_id
    ? response.room.game_id
    : response.invite && response.invite.game_id
      ? response.invite.game_id
      : response.game_id || DEFAULT_GAME_ID;
  const snapshot = eventSnapshotForGame(data, gameId);
  const canonicalGameId = safeGameIdForEvents(gameId);
  await env.EVENT_HUB.getByName(canonicalGameId).fetch(new Request("https://event.hub/__app_snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  }));
}

function eventSnapshotForGame(data, gameId) {
  const cleanId = safeGameIdForEvents(gameId);
  const lookupIds = gameIdsForLookup(cleanId);
  const pendingInvitesByPlayer = {};
  Object.values(data.invites).forEach((invite) => {
    if (!lookupIds.includes(cleanGameId(invite.game_id)) || invite.status !== "pending") return;
    if (!pendingInvitesByPlayer[invite.target_id]) pendingInvitesByPlayer[invite.target_id] = [];
    pendingInvitesByPlayer[invite.target_id].push(publicInvite(invite));
  });
  return {
    type: "app_snapshot",
    game_id: cleanId,
    rooms: Object.values(data.rooms)
      .filter((room) => ["waiting_for_player", "active"].includes(roomStatus(room)))
      .filter((room) => gameIdMatches(room.game_id, cleanId))
      .map((room) => roomSummary(room)),
    lobby_players: lobbyViewers(data, cleanId),
    pending_invites_by_player: pendingInvitesByPlayer,
    stats: publicStatsForGame(data, cleanId),
  };
}

function appSnapshotForSubscription(snapshot, subscription) {
  return {
    type: "app_snapshot",
    game_id: snapshot.game_id,
    rooms: snapshot.rooms,
    lobby_players: snapshot.lobby_players,
    pending_invites: subscription.player_id ? (snapshot.pending_invites_by_player[subscription.player_id] || []) : [],
    stats: snapshot.stats,
  };
}

function safeGameIdForEvents(gameId) {
  try {
    return cleanGameId(gameId || DEFAULT_GAME_ID);
  } catch {
    return DEFAULT_GAME_ID;
  }
}

function safeSend(session, message) {
  try {
    session.send(JSON.stringify(message));
  } catch {
    try {
      session.close(1011, "Unable to send room update.");
    } catch {
      // The connection is already gone.
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadState(env) {
  await ensureSchema(env);
  const row = await env.SOGOTABLE_STATE.prepare("SELECT value, version FROM app_state WHERE key = ?").bind("state").first();
  const data = row ? JSON.parse(row.value) : { players: [], rooms: {}, invites: {}, lobbyViewers: {} };
  if (!data.stats) data.stats = { high_scores: {}, ratings: {}, personal: {} };
  if (!data.stats.high_scores) data.stats.high_scores = {};
  if (!data.stats.ratings) data.stats.ratings = {};
  if (!data.stats.personal) data.stats.personal = {};
  Object.defineProperties(data, {
    __stateExists: { value: Boolean(row), enumerable: false },
    __version: { value: row ? Number(row.version || 0) : 0, enumerable: false },
  });
  return data;
}

async function saveState(env, data) {
  await ensureSchema(env);
  const value = JSON.stringify(data);
  if (!data.__stateExists) {
    const inserted = await env.SOGOTABLE_STATE.prepare(
      "INSERT INTO app_state (key, value, version) VALUES (?, ?, 0) ON CONFLICT(key) DO NOTHING"
    ).bind("state", value).run();
    if (writeChanged(inserted)) return;
    throw new Error("State changed while saving. Please retry.");
  }
  const updated = await env.SOGOTABLE_STATE.prepare(
    "UPDATE app_state SET value = ?, version = version + 1 WHERE key = ? AND version = ?"
  ).bind(value, "state", data.__version).run();
  if (!writeChanged(updated)) throw new Error("State changed while saving. Please retry.");
}

async function withStateRetry(action) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (!String(error.message || "").includes("State changed while saving")) throw error;
    }
  }
  throw lastError;
}

async function ensureSchema(env) {
  await env.SOGOTABLE_STATE.prepare(
    "CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0)"
  ).run();
  try {
    await env.SOGOTABLE_STATE.prepare(
      "ALTER TABLE app_state ADD COLUMN version INTEGER NOT NULL DEFAULT 0"
    ).run();
  } catch {
    // Existing databases already have this column after the first migration.
  }
}

async function readJson(request) {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

function json(payload, status = 200, headers = baseCorsHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function corsHeadersFor(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return { ...baseCorsHeaders, "Access-Control-Allow-Origin": "*" };
  if (
    allowedOrigins.has(origin) ||
    /^https:\/\/[a-z0-9-]+\.sogotable\.pages\.dev$/.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
  ) {
    return { ...baseCorsHeaders, "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  }
  return null;
}

function writeChanged(result) {
  const changes = result && result.meta && typeof result.meta.changes === "number" ? result.meta.changes : 1;
  return changes > 0;
}

function cleanGameId(gameId) {
  const value = String(gameId || DEFAULT_GAME_ID).trim() || DEFAULT_GAME_ID;
  const canonical = GAME_ID_ALIASES.get(value);
  if (!canonical) throw new Error("Game is not available yet.");
  return canonical;
}

function gameDefinitionFor(gameId) {
  const canonical = cleanGameId(gameId);
  return GAME_DEFINITIONS.find((game) => game.id === canonical);
}

function publicGameDefinition(game) {
  return {
    id: game.id,
    name: game.name,
    summary: game.summary,
    players: game.players,
    status: game.status,
    availability: game.availability,
    aliases: [...(game.aliases || [])],
  };
}

function gameIdsForLookup(gameId) {
  const game = gameDefinitionFor(gameId);
  return [game.id, ...(game.aliases || [])];
}

function gameIdMatches(candidate, gameId) {
  return cleanGameId(candidate) === cleanGameId(gameId);
}

function playerFromPayload(payload) {
  const player = payload.player || payload;
  const clean = {
    id: String(player.id || "").trim().slice(0, 80),
    name: String(player.name || "").trim().slice(0, 24),
    icon: String(player.icon || "🙂").slice(0, 8),
    color: safeHexColor(player.color || "#2f80ed"),
    kind: player.kind === "bot" ? "bot" : "human",
  };
  if (player.bot_id) clean.bot_id = String(player.bot_id).trim().slice(0, 80);
  if (!clean.id || !clean.name) throw new Error("Player id and name are required.");
  return clean;
}

function publicBot(bot) {
  return {
    id: bot.id,
    bot_id: bot.id,
    kind: "bot",
    name: bot.name,
    icon: bot.icon,
    color: bot.color,
    strategy: bot.strategy || "random",
    strategy_icon: bot.strategy === "smart" ? "\uD83E\uDDE0" : "\uD83C\uDFB2",
    strategy_label: bot.strategy === "smart" ? "Smart move scoring" : "Random legal moves",
  };
}

function publicInvite(invite) {
  return { ...invite, game_id: cleanGameId(invite.game_id) };
}

function botPlayerFromId(botId) {
  const id = String(botId || "").trim();
  const bot = BOT_DEFINITIONS.find((item) => item.id === id);
  if (!bot) throw new Error("Bot is not available.");
  return publicBot(bot);
}

function upsertPlayer(data, player) {
  const index = data.players.findIndex((item) => item.id === player.id);
  if (index >= 0) data.players[index] = player;
  else data.players.push(player);
  data.players.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

function refreshActiveRoomPlayer(data, player) {
  const changedRooms = [];
  Object.values(data.rooms).forEach((room) => {
    let changed = false;
    room.players.forEach((seat) => {
      if (seat.id === player.id) {
        Object.assign(seat, player);
        changed = true;
      }
    });
    if (changed) {
      ensureRoomSeatColors(room);
      bumpRoomRevision(room);
      changedRooms.push(room);
    }
  });
  return changedRooms;
}

function refreshPlayerStats(data, player) {
  ensureStats(data);
  Object.values(data.stats.high_scores).forEach((entries) => {
    entries.forEach((entry) => {
      if (entry.player_id === player.id) {
        entry.player_name = player.name;
        entry.player_icon = player.icon;
      }
    });
  });
  Object.values(data.stats.ratings).forEach((ratings) => {
    const entry = ratings[player.id];
    if (!entry) return;
    entry.player_name = player.name;
    entry.player_icon = player.icon;
  });
  Object.values(data.stats.personal).forEach((entries) => {
    const entry = entries[player.id];
    if (!entry) return;
    entry.player_name = player.name;
    entry.player_icon = player.icon;
  });
}

function cleanRoomCode(code) {
  const value = String(code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(value)) throw new Error("Room code must be 4 letters or numbers.");
  return value;
}

function newRoomCode(data) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (;;) {
    let code = "";
    for (let index = 0; index < 4; index += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!data.rooms[code]) return code;
  }
}

function roomFromPayload(data, payload) {
  const code = cleanRoomCode(payload.code || "");
  const room = data.rooms[code];
  if (!room) throw new Error("Room not found.");
  return room;
}

function roomStatus(room) {
  if (["x_won", "o_won", "draw"].includes(room.game.status)) return "completed";
  if (room.started) return "active";
  return "waiting_for_player";
}

function roomToDict(data, room) {
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

function roomSummary(room) {
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
    open_seats: Math.max(0, 2 - room.players.length),
  };
}

function ensureRoomFreshness(room) {
  if (!room) return;
  const revision = Number(room.revision);
  const gameEpoch = Number(room.game_epoch);
  room.revision = Number.isFinite(revision) && revision > 0 ? revision : 1;
  room.game_epoch = Number.isFinite(gameEpoch) && gameEpoch > 0 ? gameEpoch : 1;
}

function bumpRoomRevision(room, options = {}) {
  ensureRoomFreshness(room);
  if (options.newGame) room.game_epoch += 1;
  room.revision += 1;
}

function latestInviteForRoom(data, room) {
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

function activeRoomForPlayer(data, playerId, gameId) {
  return Object.values(data.rooms).find((room) => (
    gameIdMatches(room.game_id, gameId) &&
    ["waiting_for_player", "active"].includes(roomStatus(room)) &&
    room.players.some((player) => player.id === playerId)
  )) || null;
}

function playerHasUnfinishedRoom(data, playerId) {
  return Object.values(data.rooms).some((room) => (
    ["waiting_for_player", "active"].includes(roomStatus(room)) &&
    room.players.some((player) => player.id === playerId)
  ));
}

function addPlayerToRoom(room, player) {
  if (room.players.some((seat) => seat.id === player.id)) return;
  if (room.players.length >= 2) throw new Error("Room already has two players.");
  const seatedPlayer = { ...player, mark: room.players.length ? ("X") : "" };
  if (room.players.length) seatedPlayer.color = nonConflictingRoomColor(seatedPlayer.color, room.players.map((seat) => seat.color));
  room.players.push(seatedPlayer);
  ensureRoomSeatColors(room);
}

function activateRoomIfReady(room) {
  if (room.started || room.players.length < 2) return;
  const marks = Math.random() < 0.5 ? ["X", "O"] : ["O", "X"];
  room.players.forEach((seat, index) => {
    seat.mark = marks[index];
  });
  room.started = true;
}

function playerMark(room, playerId) {
  const player = room.players.find((seat) => seat.id === playerId);
  return player ? player.mark : null;
}

function isBotSeat(seat) {
  return Boolean(seat && seat.kind === "bot");
}

function botSeatForCurrentTurn(room) {
  if (!room || !room.started || !room.game || room.game.status !== "playing") return null;
  return room.players.find((seat) => isBotSeat(seat) && seat.mark === room.game.current_player) || null;
}

function runBotTurns(data, room) {
  if (!room) return null;
  let moves = 0;
  while (moves < 4) {
    const bot = botSeatForCurrentTurn(room);
    if (!bot) break;
    const move = chooseBotMove(room.game, bot);
    if (!move) break;
    makeMove(room.game, move.board, move.cell);
    bumpRoomRevision(room);
    recordCompletedRoomStats(data, room);
    moves += 1;
  }
  return moves ? { ok: true, room: roomToDict(data, room), bot_moves: moves } : null;
}

function chooseBotMove(game, bot = null) {
  const moves = legalMoves(game);
  if (!moves.length) return null;
  if (bot && (bot.bot_id === TACTICAL_TESS_BOT_ID || bot.id === TACTICAL_TESS_BOT_ID)) return chooseScoredBotMove(game, bot, moves);
  return moves[Math.floor(Math.random() * moves.length)];
}

function chooseScoredBotMove(game, bot, moves) {
  const player = game.current_player;
  const scoredMoves = moves.map((move) => ({
    move,
    score: scoreBotMove(game, move, player),
  }));
  const bestScore = Math.max(...scoredMoves.map((item) => item.score));
  const bestMoves = scoredMoves.filter((item) => item.score === bestScore);
  return bestMoves[Math.floor(Math.random() * bestMoves.length)].move;
}

function scoreBotMove(game, move, player) {
  const opponent = otherMark(player);
  const preview = previewMove(game, move, player);
  let score = 100;
  if (preview.winner === player) score += 100000;
  if (blocksOpponentGameWin(game, move, opponent)) score += 50000;
  if (preview.capturedBoard && preview.boardWinner === player) score += 10000;
  if (blocksOpponentZoneWin(game, move, opponent)) score += 7000;
  score += scoreThreats(preview.game, player, opponent);
  score += scoreZoneShape(move.board);
  score += scoreCellShape(move.cell);
  score += scoreDestination(preview.game, player, opponent);
  score += scorePickup(game, move);
  if (preview.game.small_winners[move.board] === "D") score -= 3000;
  return score;
}

function previewMove(game, move, player) {
  const next = cloneGameForPreview(game);
  const previousBoardResult = next.small_winners[move.board];
  const pickup = isTacticalGame(next) ? pickupAt(next, move.board, move.cell) : null;
  if (pickup) {
    ensureTacticalState(next);
    const config = TACTICAL_PICKUP_CONFIG[pickup.type];
    if (config) next.scores[player] = Number(next.scores[player] || 0) + config.points;
    next.pickups = next.pickups.filter((item) => item.id !== pickup.id);
  }
  next.boards[move.board][move.cell] = player;
  next.move_count = Number(next.move_count || 0) + 1;
  const boardWinner = smallBoardResult(next.boards[move.board]);
  next.small_winners[move.board] = boardWinner;
  const capturedBoard = previousBoardResult === null && ["X", "O"].includes(boardWinner);
  const lineWinner = macroWinnerFor(next.small_winners);
  if (lineWinner) {
    const winner = isTacticalGame(next) ? tacticalLineWinner(next, lineWinner) : lineWinner;
    next.line_winner = lineWinner;
    next.status = winner ? (winner === "X" ? "x_won" : "o_won") : "draw";
    next.winner = winner;
    next.next_board = null;
  } else if (next.small_winners.every((result) => result !== null)) {
    const winner = isTacticalGame(next) ? tacticalBoardFilledWinner(next) : null;
    next.status = winner ? (winner === "X" ? "x_won" : "o_won") : "draw";
    next.winner = winner;
    next.next_board = null;
  } else {
    next.current_player = otherMark(player);
    next.next_board = boardAvailable(next, move.cell) ? move.cell : null;
  }
  return { game: next, boardWinner, capturedBoard, winner: next.winner };
}

function cloneGameForPreview(game) {
  return JSON.parse(JSON.stringify(game));
}

function otherMark(mark) {
  return mark === "X" ? "O" : "X";
}

function blocksOpponentGameWin(game, move, opponent) {
  if (!blocksOpponentZoneWin(game, move, opponent)) return false;
  const winners = [...game.small_winners];
  winners[move.board] = opponent;
  return macroWinnerFor(winners) === opponent;
}

function blocksOpponentZoneWin(game, move, opponent) {
  if (game.small_winners[move.board] !== null) return false;
  if (game.boards[move.board][move.cell] !== null) return false;
  const board = [...game.boards[move.board]];
  board[move.cell] = opponent;
  return smallBoardResult(board) === opponent;
}

function scoreThreats(game, player, opponent) {
  const playerThreats = countImmediateZoneWins(game, player);
  const opponentThreats = countImmediateZoneWins(game, opponent);
  return (playerThreats >= 2 ? 3000 : 0) - (opponentThreats >= 2 ? 3000 : 0);
}

function countImmediateZoneWins(game, player) {
  return legalMoves(game).filter((move) => {
    if (game.small_winners[move.board] !== null) return false;
    const board = [...game.boards[move.board]];
    board[move.cell] = player;
    return smallBoardResult(board) === player;
  }).length;
}

function scoreCellShape(cellIndex) {
  if (cellIndex === 4) return 1000;
  if ([0, 2, 6, 8].includes(cellIndex)) return 700;
  return 250;
}

function scoreZoneShape(boardIndex) {
  if (boardIndex === 4) return 2000;
  if ([0, 2, 6, 8].includes(boardIndex)) return 1500;
  return 500;
}

function scoreDestination(gameAfterMove, player, opponent) {
  if (gameAfterMove.status !== "playing") return 0;
  const destination = gameAfterMove.next_board;
  if (destination === null || !boardAvailable(gameAfterMove, destination)) return -1000;
  let score = 0;
  if (gameAfterMove.small_winners[destination] === player) score += 700;
  if (gameAfterMove.small_winners[destination] !== null) score += 900;
  const opponentWinningMoves = legalMoves(gameAfterMove).filter((move) => {
    const preview = previewMove(gameAfterMove, move, opponent);
    return preview.winner === opponent || (preview.capturedBoard && preview.boardWinner === opponent);
  });
  if (opponentWinningMoves.some((move) => {
    const preview = previewMove(gameAfterMove, move, opponent);
    return preview.winner === opponent;
  })) score -= 5000;
  if (opponentWinningMoves.some((move) => {
    const preview = previewMove(gameAfterMove, move, opponent);
    return preview.capturedBoard && preview.boardWinner === opponent;
  })) score -= 3000;
  return score;
}

function scorePickup(game, move) {
  if (!isTacticalGame(game)) return 0;
  const pickup = pickupAt(game, move.board, move.cell);
  if (!pickup) return 0;
  const config = TACTICAL_PICKUP_CONFIG[pickup.type];
  return config ? config.points * 120 : 0;
}

function legalMoves(game) {
  if (!game || game.status !== "playing") return [];
  const moves = [];
  legalBoards(game).forEach((boardIndex) => {
    game.boards[boardIndex].forEach((value, cellIndex) => {
      if (value === null) moves.push({ board: boardIndex, cell: cellIndex });
    });
  });
  return moves;
}

function handleResetVote(room, requesterId, approve) {
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
  room.game = newGame(room.game_id);
  bumpRoomRevision(room, { newGame: true });
  room.stats_recorded = false;
  return null;
}

function lobbyViewers(data, gameId) {
  pruneLobbyViewers(data);
  return Object.values(data.lobbyViewers)
    .filter((viewer) => !gameId || gameIdMatches(viewer.game_id, gameId))
    .map((viewer) => viewer.player);
}

function pruneLobbyViewers(data) {
  const cutoff = Date.now() - LOBBY_VIEWER_TTL_SECONDS * 1000;
  Object.entries(data.lobbyViewers).forEach(([playerId, viewer]) => {
    if (viewer.updated_at < cutoff) delete data.lobbyViewers[playerId];
  });
}

function newGame(gameId = DEFAULT_GAME_ID) {
  const canonicalGameId = cleanGameId(gameId);
  const game = {
    game_id: canonicalGameId,
    boards: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null)),
    small_winners: Array.from({ length: 9 }, () => null),
    current_player: "X",
    next_board: null,
    status: "playing",
    winner: null,
    line_winner: null,
    move_count: 0,
  };
  if (canonicalGameId === TACTICAL_GAME_ID) {
    game.pickups = [];
    game.scores = { X: 0, O: 0 };
    game.captures = {
      X: { coin: 0, treasureChest: 0 },
      O: { coin: 0, treasureChest: 0 },
    };
    game.events = [];
    game.last_event = null;
  }
  return game;
}

function gameToDict(game) {
  return { ...game, game_id: cleanGameId(game.game_id), legal_boards: legalBoards(game) };
}

function legalBoards(game) {
  if (game.status !== "playing") return [];
  if (game.next_board !== null && boardAvailable(game, game.next_board)) return [game.next_board];
  return game.boards.map((_, index) => index).filter((index) => boardAvailable(game, index));
}

function boardAvailable(game, boardIndex) {
  return game.small_winners[boardIndex] === null && game.boards[boardIndex].some((cell) => cell === null);
}

function makeMove(game, boardIndex, cellIndex) {
  if (isTacticalGame(game)) return makeTacticalMove(game, boardIndex, cellIndex);
  return makeClassicMove(game, boardIndex, cellIndex);
}

function makeClassicMove(game, boardIndex, cellIndex) {
  validateMove(game, boardIndex, cellIndex);
  const player = game.current_player;
  game.boards[boardIndex][cellIndex] = player;
  game.move_count += 1;
  game.small_winners[boardIndex] = smallBoardResult(game.boards[boardIndex]);
  const macroWinner = macroWinnerFor(game.small_winners);
  if (macroWinner) {
    game.status = macroWinner === "X" ? "x_won" : "o_won";
    game.winner = macroWinner;
    game.next_board = null;
    return;
  }
  if (game.small_winners.every((result) => result !== null)) {
    game.status = "draw";
    game.winner = null;
    game.next_board = null;
    return;
  }
  game.current_player = player === "X" ? "O" : "X";
  game.next_board = boardAvailable(game, cellIndex) ? cellIndex : null;
}

function makeTacticalMove(game, boardIndex, cellIndex) {
  validateMove(game, boardIndex, cellIndex);
  ensureTacticalState(game);
  const player = game.current_player;
  const pickup = pickupAt(game, boardIndex, cellIndex);

  game.boards[boardIndex][cellIndex] = player;
  game.move_count += 1;
  pushGameEvent(game, {
    type: "movePlaced",
    player,
    board: boardIndex,
    sector: boardIndex,
    cell: cellIndex,
  });

  if (pickup) capturePickup(game, pickup, player);

  const previousSectorResult = game.small_winners[boardIndex];
  game.small_winners[boardIndex] = smallBoardResult(game.boards[boardIndex]);
  const capturedSector = previousSectorResult === null && ["X", "O"].includes(game.small_winners[boardIndex]);
  if (capturedSector) {
    pushGameEvent(game, {
      type: "sectorCaptured",
      player,
      board: boardIndex,
      sector: boardIndex,
    });
    spawnRandomPickup(game, "treasureChest");
  }

  spawnRandomPickup(game, "coin");

  const lineWinner = macroWinnerFor(game.small_winners);
  if (lineWinner) {
    const winner = tacticalLineWinner(game, lineWinner);
    game.line_winner = lineWinner;
    game.status = winner ? (winner === "X" ? "x_won" : "o_won") : "draw";
    game.winner = winner;
    game.next_board = null;
    return;
  }
  if (game.small_winners.every((result) => result !== null)) {
    const tiebreakWinner = tacticalBoardFilledWinner(game);
    game.status = tiebreakWinner ? (tiebreakWinner === "X" ? "x_won" : "o_won") : "draw";
    game.winner = tiebreakWinner;
    game.next_board = null;
    return;
  }

  game.current_player = player === "X" ? "O" : "X";
  game.next_board = boardAvailable(game, cellIndex) ? cellIndex : null;
}

function validateMove(game, boardIndex, cellIndex) {
  if (game.status !== "playing") throw new Error("Game is already over.");
  if (!Number.isInteger(boardIndex) || boardIndex < 0 || boardIndex > 8) throw new Error("Board index must be 0 through 8.");
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 8) throw new Error("Cell index must be 0 through 8.");
  if (!legalBoards(game).includes(boardIndex)) throw new Error("Move must be played in the required board.");
  if (game.boards[boardIndex][cellIndex] !== null) throw new Error("Cell is already occupied.");
}

function smallBoardResult(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every((cell) => cell !== null) ? "D" : null;
}

function macroWinnerFor(smallWinners) {
  for (const [a, b, c] of WIN_LINES) {
    if (["X", "O"].includes(smallWinners[a]) && smallWinners[a] === smallWinners[b] && smallWinners[a] === smallWinners[c]) {
      return smallWinners[a];
    }
  }
  return null;
}

function isTacticalGame(game) {
  return game && (cleanGameId(game.game_id) === TACTICAL_GAME_ID || Array.isArray(game.pickups));
}

function ensureTacticalState(game) {
  if (!game.pickups) game.pickups = [];
  if (!game.scores) game.scores = { X: 0, O: 0 };
  if (!game.captures) {
    game.captures = {
      X: { coin: 0, treasureChest: 0 },
      O: { coin: 0, treasureChest: 0 },
    };
  }
  if (!game.events) game.events = [];
}

function pickupAt(game, boardIndex, cellIndex) {
  ensureTacticalState(game);
  return game.pickups.find((pickup) => pickup.board === boardIndex && pickup.cell === cellIndex) || null;
}

function capturePickup(game, pickup, player) {
  const config = TACTICAL_PICKUP_CONFIG[pickup.type];
  if (!config) return;
  game.scores[player] = Number(game.scores[player] || 0) + config.points;
  game.pickups = game.pickups.filter((item) => item.id !== pickup.id);
  if (!game.captures[player]) game.captures[player] = { coin: 0, treasureChest: 0 };
  game.captures[player][pickup.type] = Number(game.captures[player][pickup.type] || 0) + 1;
  pushGameEvent(game, {
    type: "pickupCaptured",
    player,
    pickup_type: pickup.type,
    pickup_label: config.label,
    points: config.points,
    emoji: config.emoji,
  });
}

function spawnRandomPickup(game, type) {
  ensureTacticalState(game);
  const config = TACTICAL_PICKUP_CONFIG[type];
  if (!config) return;
  const openCells = tacticalOpenCells(game);
  if (!openCells.length) return;
  const cell = openCells[Math.floor(Math.random() * openCells.length)];
  const existingOfType = game.pickups.filter((pickup) => pickup.type === type);
  if (existingOfType.length >= config.maxActive) {
    const oldest = existingOfType.sort((left, right) => left.created_at_turn - right.created_at_turn)[0];
    game.pickups = game.pickups.filter((pickup) => pickup.id !== oldest.id);
  }
  const pickup = {
    id: `${type}:${game.move_count}:${Math.random().toString(36).slice(2, 8)}`,
    type,
    label: config.label,
    emoji: config.emoji,
    points: config.points,
    board: cell.board,
    sector: cell.board,
    cell: cell.cell,
    created_at_turn: game.move_count,
  };
  game.pickups.push(pickup);
  pushGameEvent(game, {
    type: "pickupSpawned",
    pickup_type: type,
    pickup_label: config.label,
    board: cell.board,
    sector: cell.board,
    cell: cell.cell,
    emoji: config.emoji,
    points: config.points,
  });
}

function tacticalOpenCells(game) {
  const occupiedPickupCells = new Set(game.pickups.map((pickup) => `${pickup.board}:${pickup.cell}`));
  const cells = [];
  game.boards.forEach((board, boardIndex) => {
    if (!boardAvailable(game, boardIndex)) return;
    board.forEach((mark, cellIndex) => {
      if (mark !== null) return;
      if (occupiedPickupCells.has(`${boardIndex}:${cellIndex}`)) return;
      cells.push({ board: boardIndex, cell: cellIndex });
    });
  });
  return cells;
}

function tacticalBoardFilledWinner(game) {
  return tacticalScoreWinner(game);
}

function tacticalLineWinner(game, lineWinner) {
  return tacticalScoreWinner(game) || lineWinner;
}

function tacticalScoreWinner(game) {
  const xScore = Number(game.scores.X || 0);
  const oScore = Number(game.scores.O || 0);
  if (xScore > oScore) return "X";
  if (oScore > xScore) return "O";
  return null;
}

function pushGameEvent(game, event) {
  if (!["movePlaced", "pickupSpawned"].includes(event.type)) game.last_event = event;
  game.events.push({ ...event, turn: game.move_count });
  if (game.events.length > 12) game.events = game.events.slice(-12);
}

function recordCompletedRoomStats(data, room) {
  if (!room || room.stats_recorded || roomStatus(room) !== "completed") return;
  ensureStats(data);
  const result = roomResultForStats(room);
  updateHighScores(data, room, result);
  updatePersonalStats(data, room, result);
  updateEloRatings(data, room, result);
  room.stats_recorded = true;
}

function roomResultForStats(room) {
  const scoreByMark = scoreByMarkForRoom(room);
  const winnerMark = room.game.winner || null;
  const winner = winnerMark ? room.players.find((seat) => seat.mark === winnerMark) || null : null;
  return {
    winner_mark: winnerMark,
    winner_id: winner ? winner.id : null,
    score_by_mark: scoreByMark,
  };
}

function scoreByMarkForRoom(room) {
  if (isTacticalGame(room.game)) {
    return {
      X: Number(room.game.scores && room.game.scores.X || 0),
      O: Number(room.game.scores && room.game.scores.O || 0),
    };
  }
  return {
    X: room.game.winner === "X" ? 1 : 0,
    O: room.game.winner === "O" ? 1 : 0,
  };
}

function ensureStats(data) {
  if (!data.stats) data.stats = { high_scores: {}, ratings: {}, personal: {} };
  if (!data.stats.high_scores) data.stats.high_scores = {};
  if (!data.stats.ratings) data.stats.ratings = {};
  if (!data.stats.personal) data.stats.personal = {};
}

function updateHighScores(data, room, result) {
  const gameId = cleanGameId(room.game_id);
  if (!data.stats.high_scores[gameId]) data.stats.high_scores[gameId] = [];
  const entries = data.stats.high_scores[gameId];
  room.players.forEach((seat) => {
    if (isBotSeat(seat)) return;
    const score = Number(result.score_by_mark[seat.mark] || 0);
    if (score <= 0) return;
    entries.push({
      player_id: seat.id,
      player_name: seat.name,
      player_icon: seat.icon,
      score,
      room_code: room.code,
      mark: seat.mark,
      recorded_at: new Date().toISOString(),
    });
  });
  data.stats.high_scores[gameId] = entries
    .sort((left, right) => right.score - left.score || String(left.recorded_at).localeCompare(String(right.recorded_at)));
}

function updateEloRatings(data, room, result) {
  if (room.players.length !== 2) return;
  const gameId = cleanGameId(room.game_id);
  if (!data.stats.ratings[gameId]) data.stats.ratings[gameId] = {};
  const ratings = data.stats.ratings[gameId];
  const [left, right] = room.players;
  const leftRating = ratingEntry(ratings, left);
  const rightRating = ratingEntry(ratings, right);
  const leftScore = eloScoreFor(left, result);
  const rightScore = 1 - leftScore;
  const leftExpected = expectedEloScore(leftRating.rating, rightRating.rating);
  const rightExpected = expectedEloScore(rightRating.rating, leftRating.rating);
  leftRating.rating = Math.round(leftRating.rating + ELO_K_FACTOR * (leftScore - leftExpected));
  rightRating.rating = Math.round(rightRating.rating + ELO_K_FACTOR * (rightScore - rightExpected));
  applyEloRecord(leftRating, leftScore);
  applyEloRecord(rightRating, rightScore);
}

function updatePersonalStats(data, room, result) {
  const gameId = cleanGameId(room.game_id);
  if (!data.stats.personal[gameId]) data.stats.personal[gameId] = {};
  const personal = data.stats.personal[gameId];
  room.players.forEach((seat) => {
    if (isBotSeat(seat)) return;
    if (!personal[seat.id]) {
      personal[seat.id] = {
        player_id: seat.id,
        player_name: seat.name,
        player_icon: seat.icon,
        games_played: 0,
        games_won: 0,
        personal_high_score: 0,
      };
    }
    const entry = personal[seat.id];
    entry.player_name = seat.name;
    entry.player_icon = seat.icon;
    entry.games_played += 1;
    if (result.winner_id && result.winner_id === seat.id) entry.games_won += 1;
    entry.personal_high_score = Math.max(entry.personal_high_score || 0, Number(result.score_by_mark[seat.mark] || 0));
  });
}

function ratingEntry(ratings, player) {
  if (!ratings[player.id]) {
    const botDefinition = isBotSeat(player) ? BOT_DEFINITIONS.find((bot) => bot.id === player.bot_id || bot.id === player.id) : null;
    ratings[player.id] = {
      player_id: player.id,
      player_name: player.name,
      player_icon: player.icon,
      rating: botDefinition ? Number(botDefinition.rating || DEFAULT_ELO_RATING) : DEFAULT_ELO_RATING,
      bot: isBotSeat(player),
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    };
  }
  ratings[player.id].player_name = player.name;
  ratings[player.id].player_icon = player.icon;
  ratings[player.id].bot = isBotSeat(player);
  return ratings[player.id];
}

function eloScoreFor(player, result) {
  if (!result.winner_id) return 0.5;
  return player.id === result.winner_id ? 1 : 0;
}

function expectedEloScore(rating, opponentRating) {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

function applyEloRecord(entry, score) {
  entry.games += 1;
  if (score === 1) entry.wins += 1;
  else if (score === 0) entry.losses += 1;
  else entry.draws += 1;
}

function publicStatsForGame(data, gameId) {
  ensureStats(data);
  const lookupIds = gameIdsForLookup(gameId);
  const selectablePlayerIds = new Set((data.players || []).map((player) => player.id));
  const ratingsByPlayer = new Map();
  lookupIds.forEach((id) => {
    Object.values(data.stats.ratings[id] || {}).forEach((entry) => {
      if (!ratingsByPlayer.has(entry.player_id) || Number(entry.games || 0) > Number(ratingsByPlayer.get(entry.player_id).games || 0)) {
        ratingsByPlayer.set(entry.player_id, entry);
      }
    });
  });
  const ratings = [...ratingsByPlayer.values()]
    .filter((entry) => !entry.bot && selectablePlayerIds.has(entry.player_id))
    .sort((left, right) => right.rating - left.rating || String(left.player_name).localeCompare(String(right.player_name)));
  const highScores = lookupIds
    .flatMap((id) => data.stats.high_scores[id] || [])
    .filter((entry) => selectablePlayerIds.has(entry.player_id))
    .sort((left, right) => right.score - left.score || String(left.recorded_at).localeCompare(String(right.recorded_at)));
  return {
    high_scores: highScores,
    ratings,
  };
}

function publicPlayerStats(data, playerId) {
  ensureStats(data);
  return GAME_DEFINITIONS.map((game) => {
    const lookupIds = gameIdsForLookup(game.id);
    const personalEntries = lookupIds.map((id) => data.stats.personal[id] && data.stats.personal[id][playerId] || null).filter(Boolean);
    const ratingEntries = lookupIds.map((id) => data.stats.ratings[id] && data.stats.ratings[id][playerId] || null).filter(Boolean);
    const topScore = lookupIds.flatMap((id) => data.stats.high_scores[id] || [])
      .filter((entry) => entry.player_id === playerId)
      .reduce((best, entry) => Math.max(best, Number(entry.score || 0)), 0);
    const personal = personalEntries.reduce((total, entry) => ({
      games_played: total.games_played + Number(entry.games_played || 0),
      games_won: total.games_won + Number(entry.games_won || 0),
      personal_high_score: Math.max(total.personal_high_score, Number(entry.personal_high_score || 0)),
    }), { games_played: 0, games_won: 0, personal_high_score: 0 });
    const rating = ratingEntries[0] || {};
    return {
      game_id: game.id,
      game_name: game.name,
      games_played: personalEntries.length ? personal.games_played : Number(rating.games || 0),
      games_won: personalEntries.length ? personal.games_won : Number(rating.wins || 0),
      personal_high_score: Number(personal.personal_high_score ?? topScore ?? 0),
      elo: Number(rating.rating || DEFAULT_ELO_RATING),
    };
  });
}

function clearPlayerStats(data, playerId) {
  ensureStats(data);
  Object.keys(data.stats.high_scores).forEach((gameId) => {
    data.stats.high_scores[gameId] = (data.stats.high_scores[gameId] || []).filter((entry) => entry.player_id !== playerId);
  });
  Object.values(data.stats.ratings).forEach((ratings) => {
    delete ratings[playerId];
  });
  Object.values(data.stats.personal).forEach((entries) => {
    delete entries[playerId];
  });
}

function ensureRoomSeatColors(room) {
  const existingColors = [];
  room.players.forEach((seat) => {
    seat.color = nonConflictingRoomColor(seat.color, existingColors);
    existingColors.push(seat.color);
  });
}

function nonConflictingRoomColor(color, existingColors) {
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

function colorsAreTooSimilar(left, right) {
  return colorDistance(left, right) < COLOR_SIMILARITY_THRESHOLD;
}

function colorDistance(left, right) {
  const leftRgb = hexToRgb(safeHexColor(left));
  const rightRgb = hexToRgb(safeHexColor(right));
  return Math.sqrt(leftRgb.reduce((total, channel, index) => total + (channel - rightRgb[index]) ** 2, 0));
}

function safeHexColor(color) {
  const value = String(color || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : ROOM_SEAT_COLORS[0];
}

function hexToRgb(color) {
  const clean = color.replace("#", "");
  return [0, 2, 4].map((start) => parseInt(clean.slice(start, start + 2), 16));
}
