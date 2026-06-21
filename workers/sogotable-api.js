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
  {
    id: "4b7e2d9a6c10",
    name: "Dots and Boxes",
    summary: "Claim edges between dots, complete boxes, and keep the turn when you score.",
    players: "2 players",
    status: "Ready",
    availability: "ready",
    aliases: ["boxes", "dots_and_boxes", "dots_and_dashes"],
  },
  {
    id: "9c2f7a81d4e6",
    name: "Battleship",
    summary: "Place your fleet, switch between defence and offence, and sink the enemy ships.",
    players: "2 players",
    status: "Ready",
    availability: "ready",
    aliases: ["battleship", "battle_ship"],
  },
  {
    id: "8f5d2c7a1b90",
    name: "Quoridor",
    summary: "Race your pawn across the board while placing walls that slow your opponent without blocking every path.",
    players: "2 players",
    status: "Ready",
    availability: "ready",
    aliases: ["quoridor"],
  },
  {
    id: "6d10f4a2c8b3",
    name: "10,000",
    summary: "Roll six dice, keep the scoring dice, press your luck, and bank your way to 10,000.",
    players: "1+ players",
    player_count: null,
    host_start: true,
    status: "Ready",
    availability: "ready",
    aliases: ["ten_thousand", "10000", "dice_10000"],
  },
];
const DEFAULT_GAME_ID = GAME_DEFINITIONS[0].id;
const TACTICAL_GAME_ID = GAME_DEFINITIONS[1].id;
const BOXES_GAME_ID = GAME_DEFINITIONS[2].id;
const BATTLESHIP_GAME_ID = GAME_DEFINITIONS[3].id;
const QUORIDOR_GAME_ID = GAME_DEFINITIONS[4].id;
const TEN_THOUSAND_GAME_ID = GAME_DEFINITIONS[5].id;
const GAME_ID_ALIASES = new Map();
GAME_DEFINITIONS.forEach((game) => {
  GAME_ID_ALIASES.set(game.id, game.id);
  (game.aliases || []).forEach((alias) => GAME_ID_ALIASES.set(alias, game.id));
});
const BOT_MOVE_DELAY_MS = 700;
const BOT_DEFINITIONS = [
  { id: "7c91a4e2b6d0", name: "Sprout", icon: "\uD83C\uDF31", color: "#16a34a", rating: 900, strategy: "random", difficulty: "novice", difficulty_label: "Novice" },
  { id: "5e2c8a71d0f4", name: "Buddy", icon: "\uD83E\uDD1D", color: "#2563eb", rating: 980, strategy: "random", difficulty: "casual", difficulty_label: "Casual" },
  { id: "b64d20f19a8c", name: "Cipher", icon: "\uD83D\uDD11", color: "#7c3aed", rating: 1100, strategy: "smart", difficulty: "strategist", difficulty_label: "Strategist" },
  { id: "0f8a3c9d1e72", name: "Overlord", icon: "\uD83D\uDC51", color: "#dc2626", rating: 1250, strategy: "smart", difficulty: "master", difficulty_label: "Master" },
];
const RESERVED_TEST_PLAYERS = [
  { id: "codex-test-player-1", name: "Codex Test 1", icon: "\uD83E\uDDEA", color: "#4f46e5", kind: "test", hidden: true },
  { id: "codex-test-player-2", name: "Codex Test 2", icon: "\uD83E\uDDEA", color: "#be123c", kind: "test", hidden: true },
];
const RESERVED_TEST_PLAYER_IDS = new Set(RESERVED_TEST_PLAYERS.map((player) => player.id));
const OVERLORD_BOT_ID = "0f8a3c9d1e72";
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
  if (method === "GET" && url.pathname === "/api/players") return { ok: true, players: publicPlayers(data) };
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
      return { ok: true, player, players: publicPlayers(data), rooms };
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
      return { ok: true, players: publicPlayers(data) };
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
        .filter((room) => !isHiddenTestRoom(room))
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
      activateRoomIfReady(room);
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
      if (isSoloGameId(room.game_id)) throw new Error("Solo games do not use bot opponents.");
      if (hostId !== room.host_id) throw new Error("Only the host can invite a bot.");
      if (roomStatus(room) !== "waiting_for_player") throw new Error("Bot can only join a waiting room.");
      const playerCount = playerCountForGame(room.game_id);
      if (Number.isFinite(playerCount) && room.players.length >= playerCount) throw new Error("Room is full.");
      const bot = botPlayerFromId(payload.bot_id);
      addPlayerToRoom(room, bot);
      activateRoomIfReady(room);
      ensureBattleshipBotFleets(room);
      bumpRoomRevision(room);
      if (autoBotMoves) runBotTurns(data, room);
      return { ok: true, room: roomToDict(data, room), bot };
    }
    if (method === "POST" && url.pathname === "/api/room/start") {
      const room = roomFromPayload(data, payload);
      const hostId = String(payload.host_id || "").trim();
      if (hostId !== room.host_id) throw new Error("Only the host can start the game.");
      if (room.started) throw new Error("Game already started.");
      if (!room.players.length) throw new Error("Add at least one player.");
      startRoom(room);
      bumpRoomRevision(room);
      return { ok: true, room: roomToDict(data, room) };
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
      if (isTenThousandGame(room.game)) {
        makeTenThousandMove(room.game, mark, payload.action || payload);
        bumpRoomRevision(room);
        recordCompletedRoomStats(data, room);
        return { ok: true, room: roomToDict(data, room) };
      }
      if (isBattleshipGame(room.game)) {
        ensureBattleshipBotFleets(room);
        makeBattleshipMove(room.game, mark, payload.action || payload);
        bumpRoomRevision(room);
        recordCompletedRoomStats(data, room);
        if (autoBotMoves) runBotTurns(data, room);
        return { ok: true, room: roomToDict(data, room) };
      }
      if (isQuoridorGame(room.game)) {
        makeQuoridorMove(room.game, mark, payload.action || payload);
        bumpRoomRevision(room);
        recordCompletedRoomStats(data, room);
        if (autoBotMoves) runBotTurns(data, room);
        return { ok: true, room: roomToDict(data, room) };
      }
      if (mark !== room.game.current_player) throw new Error(`It is ${room.game.current_player}'s turn.`);
      makeMove(room.game, Number(payload.board), Number(payload.cell), payload.line_id);
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
      if (isSoloGameId(room.game_id)) throw new Error("Solo games do not use invites.");
      const hostId = String(payload.host_id || "").trim();
      if (hostId !== room.host_id) throw new Error("Only the host can invite a player.");
      const playerCount = playerCountForGame(room.game_id);
      if (Number.isFinite(playerCount) && room.players.length >= playerCount) throw new Error("Room is full.");
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
      .filter((room) => !isHiddenTestRoom(room))
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
  const playerCount = playerCountForGame(game.id);
  return {
    id: game.id,
    name: game.name,
    summary: game.summary,
    players: game.players,
    player_count: Number.isFinite(playerCount) ? playerCount : null,
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

function playerCountForGame(gameId) {
  const game = GAME_DEFINITIONS.find((item) => item.id === cleanGameId(gameId));
  const count = Number(game && game.player_count);
  if (Number.isFinite(count) && count > 0) return count;
  return game && game.host_start ? Number.POSITIVE_INFINITY : 2;
}

function isSoloGameId(gameId) {
  return playerCountForGame(gameId) === 1;
}

// Host-start games seat a variable number of players and do not auto-activate;
// the host starts them explicitly. Seats get indexed marks (P1..PN) rather
// than the binary X/O the two-player games use.
function gameUsesHostStart(gameId) {
  const game = GAME_DEFINITIONS.find((item) => item.id === cleanGameId(gameId));
  return Boolean(game && game.host_start);
}

function playerFromPayload(payload) {
  const player = payload.player || payload;
  const rawId = String(player.id || "").trim().slice(0, 80);
  const reservedTestPlayer = reservedTestPlayerFromId(rawId);
  if (reservedTestPlayer) return { ...reservedTestPlayer };
  const clean = {
    id: rawId,
    name: String(player.name || "").trim().slice(0, 24),
    icon: String(player.icon || "🙂").slice(0, 8),
    color: safeHexColor(player.color || "#2f80ed"),
    kind: player.kind === "bot" ? "bot" : "human",
  };
  if (player.bot_id) clean.bot_id = String(player.bot_id).trim().slice(0, 80);
  if (!clean.id || !clean.name) throw new Error("Player id and name are required.");
  return clean;
}

function reservedTestPlayerFromId(playerId) {
  return RESERVED_TEST_PLAYERS.find((player) => player.id === playerId) || null;
}

function isHiddenPlayer(player) {
  return Boolean(player && (player.hidden || player.kind === "test" || RESERVED_TEST_PLAYER_IDS.has(player.id)));
}

function publicPlayers(data) {
  return (data.players || []).filter((player) => !isHiddenPlayer(player));
}

function isHiddenTestRoom(room) {
  return Boolean(room && Array.isArray(room.players) && room.players.some(isHiddenPlayer));
}

function publicBot(bot) {
  const botLevel = botDifficultyLevel(bot);
  return {
    id: bot.id,
    bot_id: bot.id,
    kind: "bot",
    name: bot.name,
    icon: bot.icon,
    color: bot.color,
    strategy: bot.strategy || "random",
    strategy_icon: bot.strategy === "smart" ? "\uD83E\uDDE0" : "\uD83C\uDFB2",
    strategy_label: bot.difficulty_label || (bot.strategy === "smart" ? "Smart move scoring" : "Random legal moves"),
    difficulty: bot.difficulty || "novice",
    difficulty_label: bot.difficulty_label || "Novice",
    bot_level: botLevel,
    level: botLevel,
  };
}

function botDifficultyLevel(bot) {
  const difficulty = String(bot && bot.difficulty || "").toLowerCase();
  if (difficulty === "novice") return 1;
  if (difficulty === "casual") return 2;
  if (difficulty === "strategist") return 3;
  if (difficulty === "master") return 4;
  return 2;
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
  if (["x_won", "o_won", "draw", "complete"].includes(room.game.status)) return "completed";
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
  const playerCount = playerCountForGame(room.game_id);
  if (Number.isFinite(playerCount) && room.players.length >= playerCount) throw new Error(playerCount === 2 ? "Room already has two players." : "Room is full.");
  const mark = gameUsesHostStart(room.game_id)
    ? `P${room.players.length + 1}`
    : (playerCount === 1 ? "X" : room.players.length ? "X" : "");
  const seatedPlayer = { ...player, mark };
  if (room.players.length) seatedPlayer.color = nonConflictingRoomColor(seatedPlayer.color, room.players.map((seat) => seat.color));
  room.players.push(seatedPlayer);
  ensureRoomSeatColors(room);
}

function activateRoomIfReady(room) {
  if (gameUsesHostStart(room.game_id)) return; // host starts explicitly via /api/room/start
  const playerCount = playerCountForGame(room.game_id);
  if (room.started || room.players.length < playerCount) return;
  if (playerCount === 1) {
    room.players[0].mark = "X";
    room.started = true;
    return;
  }
  const marks = Math.random() < 0.5 ? ["X", "O"] : ["O", "X"];
  room.players.forEach((seat, index) => {
    seat.mark = marks[index];
  });
  room.started = true;
}

// Explicit start for host-start games. Seats already carry P1..PN marks from
// addPlayerToRoom; this flips the room live and initialises per-seat game state.
function startRoom(room) {
  if (room.started) return;
  room.started = true;
  if (isTenThousandGame(room.game)) initTenThousandSeats(room.game, room.players);
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
  const maxMoves = Math.max(4, legalMoves(room.game).length);
  while (moves < maxMoves) {
    const bot = botSeatForCurrentTurn(room);
    if (!bot) break;
    const move = chooseBotMove(room.game, bot);
    if (!move) break;
    if (isBattleshipGame(room.game)) makeBattleshipMove(room.game, bot.mark, move);
    else if (isQuoridorGame(room.game)) makeQuoridorMove(room.game, bot.mark, move);
    else makeMove(room.game, move.board, move.cell, move.line_id);
    bumpRoomRevision(room);
    recordCompletedRoomStats(data, room);
    moves += 1;
  }
  return moves ? { ok: true, room: roomToDict(data, room), bot_moves: moves } : null;
}

function chooseBotMove(game, bot = null) {
  const moves = legalMoves(game);
  if (!moves.length) return null;
  if (isBattleshipGame(game)) return chooseBattleshipBotMove(game, bot, moves);
  if (isQuoridorGame(game)) return chooseQuoridorBotMove(game, bot, moves);
  if (isBoxesGame(game)) return chooseBoxesBotMove(game, moves);
  if (bot && bot.strategy === "smart") return chooseScoredBotMove(game, bot, moves);
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
  if (isTenThousandGame(game)) return []; // dice game; bots resolve via their own engine
  if (isBattleshipGame(game)) return battleshipLegalMoves(game);
  if (isQuoridorGame(game)) return quoridorLegalMoves(game);
  if (isBoxesGame(game)) return boxesLegalMoves(game);
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
  // Host-start games seed per-seat state at startRoom; a reset must re-seed it
  // too, otherwise the room stays started with an empty game (e.g. Ten Thousand
  // ends up with no seats and a dead board).
  if (room.started && isTenThousandGame(room.game)) initTenThousandSeats(room.game, room.players);
  bumpRoomRevision(room, { newGame: true });
  room.stats_recorded = false;
  return null;
}

function lobbyViewers(data, gameId) {
  pruneLobbyViewers(data);
  return Object.values(data.lobbyViewers)
    .filter((viewer) => !gameId || gameIdMatches(viewer.game_id, gameId))
    .filter((viewer) => !isHiddenPlayer(viewer.player))
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
  if (canonicalGameId === BATTLESHIP_GAME_ID) return newBattleshipGame();
  if (canonicalGameId === QUORIDOR_GAME_ID) return newQuoridorGame();
  if (canonicalGameId === BOXES_GAME_ID) return newBoxesGame();
  if (canonicalGameId === TEN_THOUSAND_GAME_ID) return newTenThousandGame();
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
  if (isTenThousandGame(game)) return tenThousandGameToDict(game);
  if (isBattleshipGame(game)) return battleshipGameToDict(game);
  if (isQuoridorGame(game)) return quoridorGameToDict(game);
  if (isBoxesGame(game)) return boxesGameToDict(game);
  return { ...game, game_id: cleanGameId(game.game_id), legal_boards: legalBoards(game) };
}

const TEN_THOUSAND_TARGET_SCORE = 10000;
const TEN_THOUSAND_OPENING_MINIMUM = 500; // first bank must get you "on the board"
const TEN_THOUSAND_BANK_MINIMUM = 50; // smallest legal bank once on the board
const TEN_THOUSAND_DICE_COUNT = 6;
const TEN_THOUSAND_PHASES = ["ready", "rolled", "selected", "farkled", "done"];
const TEN_THOUSAND_FINISH_STATES = ["active", "banked", "farkled_pending_ack", "farkled_acked"];
// Level 2 (Kitchen Table) bank thresholds by dice remaining, per
// docs/bots/farkle_ai_players_4_levels.md. Used to resolve bot rounds server-side.
const TEN_THOUSAND_BOT_BANK = { 6: 1000, 5: 750, 4: 600, 3: 450, 2: 350, 1: 250 };

function newTenThousandGame() {
  return {
    game_id: TEN_THOUSAND_GAME_ID,
    target_score: TEN_THOUSAND_TARGET_SCORE,
    opening_minimum: TEN_THOUSAND_OPENING_MINIMUM,
    status: "playing",
    round: 1,
    round_pending_advance: false,
    final_round: false,
    final_trigger: null,
    winner: null,
    seat_order: [],
    players: {},
    move_count: 0,
    last_move: null,
  };
}

function isTenThousandGame(game) {
  return Boolean(game && cleanGameId(game.game_id) === TEN_THOUSAND_GAME_ID);
}

// Populate the per-seat sub-games once the room starts. `seats` is the ordered
// room.players list; each seat plays an independent 10,000 and resolves its own
// round. Bot seats are resolved immediately for round 1.
function initTenThousandSeats(game, seats) {
  game.seat_order = [];
  game.players = {};
  (Array.isArray(seats) ? seats : []).forEach((seat) => {
    const mark = String(seat && seat.mark || "").trim();
    if (!mark) return;
    game.seat_order.push(mark);
    game.players[mark] = newTenThousandSeat(seat);
  });
  game.round = 1;
  game.final_round = false;
  game.final_trigger = null;
  game.winner = null;
  game.status = "playing";
  game.move_count = 0;
  game.last_move = null;
  game.round_pending_advance = false;
  resolveTenThousandBots(game);
}

function newTenThousandSeat(seat) {
  return {
    score: 0,
    turn_score: 0,
    round_score: 0,
    farkles: 0,
    dice: tenThousandBlankDice(),
    phase: "ready",
    resolved: false,
    is_bot: Boolean(seat && seat.kind === "bot"),
    level: tenThousandBotLevel(seat),
    roll_count: 0, // rolls + rerolls this round (drives the bot "play-along" display)
    bot_trajectory: [], // per-roll running-total snapshots for a bot's resolved round
  };
}

function tenThousandBotLevel(seat) {
  // Accept both the room player (kind "bot", carries bot_level) and the in-game
  // seat (is_bot, carries the resolved level). Previously this only checked
  // `kind`, so the in-game seat — which has no `kind` — always resolved to 0 and
  // every tier silently played as the level-0 default.
  if (!seat || (seat.kind !== "bot" && seat.is_bot !== true)) return 0;
  const level = Number(seat.bot_level !== undefined ? seat.bot_level : seat.level);
  if (Number.isInteger(level) && level >= 1 && level <= 4) return level;
  return 2; // Kitchen Table default
}

function tenThousandGameToDict(game) {
  normalizeTenThousandGame(game);
  const players = game.seat_order.map((mark) => {
    const seat = game.players[mark];
    return {
      mark,
      score: seat.score,
      turn_score: seat.turn_score,
      round_score: seat.round_score,
      farkles: seat.farkles,
      finish_state: seat.finish_state,
      phase: seat.phase,
      resolved: seat.resolved,
      is_bot: seat.is_bot,
      dice: seat.dice,
      roll_count: seat.roll_count || 0,
      bot_trajectory: Array.isArray(seat.bot_trajectory) ? seat.bot_trajectory : [],
      scoring_options: tenThousandScoringOptions(seat),
      can_roll: tenThousandCanRoll(game, seat),
      can_reroll: tenThousandCanReroll(game, seat),
      can_bank: tenThousandCanBank(game, seat),
    };
  });
  return {
    ...game,
    game_id: TEN_THOUSAND_GAME_ID,
    players,
  };
}

function normalizeTenThousandGame(game) {
  game.game_id = TEN_THOUSAND_GAME_ID;
  game.target_score = TEN_THOUSAND_TARGET_SCORE;
  game.opening_minimum = TEN_THOUSAND_OPENING_MINIMUM;
  game.status = game.status === "complete" ? "complete" : "playing";
  game.round = clampInteger(game.round, 1, 999999, 1);
  game.final_round = Boolean(game.final_round);
  game.final_trigger = game.final_trigger || null;
  game.round_pending_advance = Boolean(game.round_pending_advance);
  game.seat_order = Array.isArray(game.seat_order) ? game.seat_order.map(String) : [];
  if (!game.players || typeof game.players !== "object") game.players = {};
  game.seat_order.forEach((mark) => {
    game.players[mark] = normalizeTenThousandSeat(game.players[mark]);
  });
  game.winner = game.seat_order.includes(game.winner) ? game.winner : null;
  game.move_count = clampInteger(game.move_count, 0, 999999, 0);
  game.last_move = game.last_move || null;
}

function normalizeTenThousandSeat(seat) {
  const source = seat || {};
  const finishState = normalizeTenThousandFinishState(source);
  return {
    score: clampInteger(source.score, 0, 9999999, 0),
    turn_score: clampInteger(source.turn_score, 0, 9999999, 0),
    round_score: clampInteger(source.round_score, 0, 9999999, 0),
    farkles: clampInteger(source.farkles, 0, 999999, 0),
    dice: normalizeTenThousandDice(source.dice),
    finish_state: finishState,
    phase: TEN_THOUSAND_PHASES.includes(source.phase) ? source.phase : "ready",
    resolved: Boolean(source.resolved) || finishState === "banked" || finishState === "farkled_acked",
    is_bot: Boolean(source.is_bot),
    level: Number.isInteger(source.level) ? source.level : (source.is_bot ? 2 : 0),
    roll_count: clampInteger(source.roll_count, 0, 999999, 0),
    bot_trajectory: normalizeTenThousandTrajectory(source.bot_trajectory),
  };
}

function normalizeTenThousandTrajectory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).map((entry) => ({
    total: clampInteger(entry && entry.total, 0, 9999999, 0),
    status: ["rolling", "banked", "farkled"].includes(entry && entry.status) ? entry.status : "rolling",
    hot: clampInteger(entry && entry.hot, 0, 12, 0),
  }));
}

function normalizeTenThousandFinishState(source) {
  const finishState = String(source && source.finish_state || "").trim();
  if (TEN_THOUSAND_FINISH_STATES.includes(finishState)) return finishState;
  if (source && source.phase === "farkled") return source.resolved ? "farkled_acked" : "farkled_pending_ack";
  if (source && source.resolved) return "banked";
  return "active";
}

function tenThousandBlankDice() {
  return Array.from({ length: TEN_THOUSAND_DICE_COUNT }, (_, index) => ({
    id: `d${index + 1}`,
    value: null,
    selected: false,
    scored: false,
    rolling: false,
  }));
}

function normalizeTenThousandDice(dice) {
  const source = Array.isArray(dice) ? dice : [];
  return Array.from({ length: TEN_THOUSAND_DICE_COUNT }, (_, index) => {
    const die = source[index] || {};
    const value = Number(die.value);
    return {
      id: String(die.id || `d${index + 1}`).slice(0, 16),
      value: Number.isInteger(value) && value >= 1 && value <= 6 ? value : null,
      selected: Boolean(die.selected),
      scored: Boolean(die.scored),
      rolling: false,
    };
  });
}

function makeTenThousandMove(game, mark, action) {
  normalizeTenThousandGame(game);
  if (game.status === "complete") throw new Error("Game is complete.");
  const seat = game.players[mark];
  if (!seat) throw new Error("You are not seated in this game.");
  if (seat.is_bot) throw new Error("Bot seats are resolved automatically.");
  const type = String(action && action.type || "").trim();
  if (seat.resolved && !(type === "roll" && game.round_pending_advance)) throw new Error("You already finished this round. Wait for the next round.");
  if (seat.phase === "farkled" && type !== "ack_farkle") throw new Error("Acknowledge the farkle to continue.");
  if (type === "roll" && game.round_pending_advance) startTenThousandRound(game);
  if (type === "roll") rollTenThousandDice(seat);
  else if (type === "select") selectTenThousandDice(seat, action.dice_ids || action.diceIds || []);
  else if (type === "reroll") rerollTenThousandDice(seat);
  else if (type === "bank") bankTenThousandScore(game, mark, seat);
  else if (type === "declare_farkle") declareTenThousandFarkle(seat);
  else if (type === "ack_farkle") acknowledgeTenThousandFarkle(game, seat);
  else throw new Error("10,000 action is required.");
  game.move_count += 1;
  const farkled = seat.phase === "farkled";
  game.last_move = {
    type: farkled ? "farkle" : type,
    mark,
    round: game.round,
    move_count: game.move_count,
    dice: (farkled || type === "roll" || type === "reroll")
      ? seat.dice.map((die) => ({ id: die.id, value: die.value, scored: die.scored }))
      : undefined,
  };
  maybeAdvanceTenThousandRound(game);
}

function rollTenThousandDice(seat) {
  if (seat.phase !== "ready") throw new Error("Roll is not available.");
  seat.roll_count = clampInteger(seat.roll_count, 0, 999999, 0) + 1;
  seat.dice = tenThousandBlankDice();
  tenThousandRollDiceByIds(seat, seat.dice.map((die) => die.id));
  finishTenThousandRoll(seat);
}

function rerollTenThousandDice(seat) {
  if (seat.phase !== "selected") throw new Error("Reroll is not available.");
  seat.roll_count = clampInteger(seat.roll_count, 0, 999999, 0) + 1;
  const hotDice = seat.dice.every((die) => die.scored);
  if (hotDice) {
    seat.dice = tenThousandBlankDice();
    tenThousandRollDiceByIds(seat, seat.dice.map((die) => die.id));
  } else {
    tenThousandRollDiceByIds(seat, seat.dice.filter((die) => !die.scored).map((die) => die.id));
  }
  finishTenThousandRoll(seat);
}

function tenThousandRollDiceByIds(seat, ids) {
  const rollingIds = new Set(ids);
  seat.dice.forEach((die) => {
    if (!rollingIds.has(die.id)) return;
    die.value = 1 + Math.floor(Math.random() * 6);
    die.selected = false;
    die.scored = false;
    die.rolling = true;
  });
}

// A roll always lands as a live "rolled" state. The farkle is NOT auto-detected:
// a human must spot (or fail to spot) a scoring play and declare a farkle
// themselves via declare_farkle. Bots evaluate their own keep in
// playTenThousandBotRound and farkle there when no scoring dice remain. Not
// revealing the bust is deliberate — an auto-farkle would tell the player a
// valid play exists whenever it does NOT fire.
function finishTenThousandRoll(seat) {
  seat.dice.forEach((die) => { die.rolling = false; });
  seat.phase = "rolled";
  seat.finish_state = "active";
}

// The player declares their own farkle (the "Red X"). It always busts the turn,
// even if a scoring play was actually available — that risk is the whole point.
function declareTenThousandFarkle(seat) {
  if (seat.phase !== "rolled") throw new Error("Roll before declaring a farkle.");
  resolveTenThousandFarkle(seat, false);
}

function acknowledgeTenThousandFarkle(game, seat) {
  if (seat.phase !== "farkled") throw new Error("There is no farkle to acknowledge.");
  resolveTenThousandFarkle(seat, true, false);
}

function selectTenThousandDice(seat, diceIds) {
  if (seat.phase !== "rolled" && seat.phase !== "selected") throw new Error("Roll before selecting dice.");
  const ids = new Set((Array.isArray(diceIds) ? diceIds : []).map((id) => String(id)));
  if (!ids.size) throw new Error("Select at least one die.");
  const dice = seat.dice.filter((die) => ids.has(die.id));
  if (dice.length !== ids.size || dice.some((die) => die.scored || !die.value)) throw new Error("Selected dice are not available.");
  const score = tenThousandScoreValues(dice.map((die) => die.value));
  if (!score.valid || score.score <= 0) throw new Error("Selected dice must all score.");
  dice.forEach((die) => {
    die.selected = true;
    die.scored = true;
  });
  seat.turn_score += score.score;
  seat.phase = "selected";
  seat.finish_state = "active";
}

function bankTenThousandScore(game, mark, seat) {
  if (seat.phase !== "selected" || seat.turn_score <= 0) throw new Error("Select scoring dice before banking.");
  if (seat.turn_score < tenThousandBankMinimum(seat)) {
    throw new Error(`Score at least ${TEN_THOUSAND_OPENING_MINIMUM} to get on the board before you can bank.`);
  }
  seat.score += seat.turn_score;
  seat.round_score = seat.turn_score;
  seat.turn_score = 0;
  seat.dice = tenThousandBlankDice();
  seat.phase = "done";
  seat.finish_state = "banked";
  seat.resolved = true;
  if (seat.score >= game.target_score && !game.final_round) {
    game.final_round = true;
    game.final_trigger = mark;
  }
}

// Barrier: a round ends only once every seat has resolved (banked or farkled
// and acknowledged). The next round does not start until someone rolls again.
function maybeAdvanceTenThousandRound(game) {
  const marks = game.seat_order;
  if (!marks.length) return;
  if (!marks.every((mark) => game.players[mark].resolved)) return;
  if (marks.some((mark) => game.players[mark].score >= game.target_score)) {
    game.status = "complete";
    game.winner = tenThousandLeader(game);
    marks.forEach((mark) => { game.players[mark].phase = "done"; });
    game.last_move = { type: "complete", round: game.round, winner: game.winner };
    return;
  }
  game.round_pending_advance = true;
}

function startTenThousandRound(game) {
  const marks = game.seat_order;
  if (!marks.length) return;
  if (!game.round_pending_advance && !marks.every((mark) => game.players[mark].resolved)) return;
  game.round += 1;
  game.round_pending_advance = false;
  marks.forEach((mark) => {
    const seat = game.players[mark];
    seat.turn_score = 0;
    seat.round_score = 0;
    seat.dice = tenThousandBlankDice();
    seat.phase = "ready";
    seat.finish_state = "active";
    seat.resolved = false;
    seat.roll_count = 0;
    seat.bot_trajectory = [];
  });
  resolveTenThousandBots(game);
}

function tenThousandLeader(game) {
  let leader = null;
  let best = -1;
  game.seat_order.forEach((mark) => {
    const score = game.players[mark].score;
    if (score > best) { best = score; leader = mark; }
  });
  return leader;
}

function resolveTenThousandBots(game) {
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    if (seat.is_bot && !seat.resolved) playTenThousandBotRound(game, mark, seat);
  });
}

function resolveTenThousandFarkle(seat, acknowledged = false, countFarkle = true) {
  seat.turn_score = 0;
  seat.round_score = 0;
  if (countFarkle) seat.farkles += 1;
  seat.phase = acknowledged ? "done" : "farkled";
  seat.finish_state = acknowledged ? "farkled_acked" : "farkled_pending_ack";
  seat.resolved = Boolean(acknowledged);
}

// Plays a bot's entire round in one shot (Level 2 policy by default). Records a
// per-roll trajectory of running-total snapshots so the client can replay the
// bot "playing along" in step with the human's rolls. trajectory[0] is the
// pre-roll baseline (the bot's carried score); each later entry is the state
// after one of the bot's rolls. total = score + turn_score, which is the
// running total while rolling, the new total after banking, and the carried
// total after a farkle. `hot` accumulates each time the bot scores all six dice.
function playTenThousandBotRound(game, mark, seat) {
  const trajectory = [{ total: seat.score, status: "rolling", hot: 0 }];
  let hot = 0;
  const snap = (status) => trajectory.push({ total: seat.score + seat.turn_score, status, hot });
  const finish = () => { seat.bot_trajectory = trajectory; };
  for (let guard = 0; guard < 50; guard += 1) {
    if (seat.phase === "ready") rollTenThousandDice(seat);
    else if (seat.phase === "selected") rerollTenThousandDice(seat);
    if (seat.resolved) { finish(); return; }
    const level = tenThousandBotLevel(seat);
    const overlord = level === 4;
    // Decide which dice to keep. The Overlord may keep a single die as part of a
    // triple hunt (huntReroll), which forces a re-roll below.
    let keepIds;
    let huntReroll = false;
    if (overlord) {
      const plan = overlordKeepPlan(seat.dice);
      keepIds = plan.ids;
      huntReroll = plan.hunt;
    } else {
      const keepPlan = tenThousandBotKeep(level, seat.dice);
      const keep = tenThousandBotShouldMisplay(level)
        ? tenThousandBotAlternativeKeep(seat.dice, keepPlan.ids)
        : keepPlan;
      keepIds = keep.ids;
    }
    // No scoring dice (rolls are no longer auto-farkled) is the bot's bust: it
    // resolves and acknowledges in one step, counting the farkle.
    if (!keepIds.length) { resolveTenThousandFarkle(seat, true, true); snap("farkled"); finish(); return; }
    selectTenThousandDice(seat, keepIds);
    if (seat.dice.length && seat.dice.every((die) => die.scored)) hot += 1; // hot dice
    let wantBank;
    if (overlord) {
      const remaining = seat.dice.filter((die) => !die.scored).length;
      const wouldWin = seat.score + seat.turn_score >= game.target_score;
      // Press through the hunt; with only 1-2 dice left to throw, bank a turn
      // worth more than 400, otherwise keep pressing. Always bank a winning turn.
      wantBank = wouldWin || (!huntReroll && (remaining === 1 || remaining === 2) && seat.turn_score > 400);
    } else {
      const shouldBank = tenThousandBotShouldBank(game, seat, level);
      wantBank = tenThousandBotShouldMisplay(level) ? !shouldBank : shouldBank;
    }
    // Only bank when it is legal: below the opening minimum the bot must keep
    // pressing (or eventually bust), exactly like a human with bank disabled.
    if (wantBank && tenThousandCanBank(game, seat)) {
      bankTenThousandScore(game, mark, seat);
      snap("banked");
      finish();
      return;
    }
    snap("rolling");
  }
  // Safety: never loop forever — bank whatever is on the table if it is legal,
  // otherwise resolve without banking so the round can still advance.
  if (tenThousandCanBank(game, seat)) { bankTenThousandScore(game, mark, seat); snap("banked"); }
  else if (!seat.resolved) { resolveTenThousandFarkle(seat, true, false); snap("farkled"); }
  finish();
}

function tenThousandBotKeep(level, dice) {
  if (level <= 1) return sproutTenThousandKeep(dice);
  return bestTenThousandKeep(dice);
}

// Overlord (level 4) plays a high-variance three-of-a-kind hunt: when it rolls
// 4+ dice with no triple and cannot clear them all, it keeps a single die — a 1,
// or a 5 only if there are no 1s — and re-rolls the rest fishing for a triple.
// With a triple in hand, all dice scoring, or 3 or fewer dice, it takes the best
// keep and plays normally. Returns { ids, hunt }; the bank side (press through
// the hunt; bank over 400 with 1-2 dice left) lives in playTenThousandBotRound.
function overlordKeepPlan(dice) {
  const avail = (Array.isArray(dice) ? dice : []).filter((die) => !die.scored && die.value >= 1 && die.value <= 6);
  const best = bestTenThousandKeep(dice);
  const clearsAll = best.score > 0 && best.ids.length === avail.length;
  const counts = tenThousandCounts(avail.map((die) => die.value));
  const hasTriple = counts.some((count) => count >= 3);
  if (avail.length >= 4 && !clearsAll && !hasTriple) {
    const one = avail.find((die) => die.value === 1);
    const five = avail.find((die) => die.value === 5);
    const pick = one || five;
    if (pick) return { ids: [pick.id], hunt: true };
    return { ids: [], hunt: false }; // no 1/5 and no triple — a true farkle
  }
  return { ids: best.ids, hunt: false };
}

function tenThousandBotShouldMisplay(level) {
  return Math.random() < tenThousandBotErrorRate(level);
}

function tenThousandBotErrorRate(level) {
  if (level <= 1) return 0.3;
  if (level === 2) return 0.2;
  if (level === 3) return 0.1;
  return 0;
}

function tenThousandBotAlternativeKeep(dice, preferredIds) {
  const options = tenThousandAllKeepOptions(dice)
    .filter((choice) => choice.ids.length && !setsEqual(choice.ids, preferredIds))
    .sort((left, right) => left.score - right.score || left.ids.length - right.ids.length);
  return options[0] || { ids: [], score: 0 };
}

function tenThousandBotShouldBank(game, seat, level) {
  if (seat.score + seat.turn_score >= game.target_score) return true;
  const remaining = tenThousandRemainingDice(seat);
  const threshold = TEN_THOUSAND_BOT_BANK[remaining] || 350;
  if (level <= 1) return seat.turn_score >= Math.max(50, threshold + 500);
  if (level === 2) return seat.turn_score >= Math.max(50, threshold + 250);
  if (level === 3) return seat.turn_score >= threshold;
  if (remaining <= 2) return seat.turn_score >= Math.max(50, threshold - 200);
  if (remaining >= 5) return seat.turn_score >= threshold - 25;
  return seat.turn_score >= Math.max(50, threshold - 100);
}

function tenThousandRemainingDice(seat) {
  const unscored = seat.dice.filter((die) => !die.scored).length;
  return unscored === 0 ? TEN_THOUSAND_DICE_COUNT : unscored;
}

// Maximal scoring subset of the seat's still-rollable dice (used by bots and as
// the canonical "take everything that scores" keep).
function bestTenThousandKeep(dice) {
  const options = tenThousandAllKeepOptions(dice)
    .sort((left, right) => right.score - left.score || right.ids.length - left.ids.length);
  return options[0] || { ids: [], score: 0 };
}

function tenThousandAllKeepOptions(dice) {
  const avail = dice.filter((die) => !die.scored && die.value);
  const choices = [];
  if (avail.length === TEN_THOUSAND_DICE_COUNT) {
    const counts = tenThousandCounts(avail.map((die) => die.value));
    if (counts.every((count) => count === 1) || counts.filter((count) => count === 2).length === 3) {
      choices.push({ ids: avail.map((die) => die.id), score: 1500 });
    }
  }
  const total = 1 << avail.length;
  for (let mask = 1; mask < total; mask += 1) {
    const ids = [];
    const values = [];
    for (let index = 0; index < avail.length; index += 1) {
      if ((mask & (1 << index)) === 0) continue;
      ids.push(avail[index].id);
      values.push(avail[index].value);
    }
    const score = tenThousandScoreValues(values);
    if (score.valid) choices.push({ ids, score: score.score });
  }
  return choices;
}

function sproutTenThousandKeep(dice) {
  const avail = dice.filter((die) => !die.scored && die.value);
  if (!avail.length) return { ids: [], score: 0 };
  if (avail.length === TEN_THOUSAND_DICE_COUNT) {
    const counts = tenThousandCounts(avail.map((die) => die.value));
    if (counts.every((count) => count === 1) || counts.filter((count) => count === 2).length === 3) {
      return { ids: avail.map((die) => die.id), score: 1500 };
    }
  }
  const byFace = new Map();
  avail.forEach((die) => {
    if (!byFace.has(die.value)) byFace.set(die.value, []);
    byFace.get(die.value).push(die);
  });
  const triples = [...byFace.entries()]
    .filter(([face, list]) => list.length >= 3)
    .map(([face, list]) => ({
      face: Number(face),
      ids: list.slice(0, 3).map((die) => die.id),
      score: tenThousandScoreValues(list.slice(0, 3).map((die) => die.value)).score,
    }))
    .sort((left, right) => right.score - left.score || left.face - right.face);
  if (triples.length) return { ids: triples[0].ids, score: triples[0].score };
  if (byFace.has(1)) return { ids: byFace.get(1).map((die) => die.id), score: byFace.get(1).length * 100 };
  if (byFace.has(5)) return { ids: byFace.get(5).map((die) => die.id), score: byFace.get(5).length * 50 };
  return { ids: [], score: 0 };
}

function setsEqual(left, right) {
  const a = [...new Set((Array.isArray(left) ? left : []).map(String))].sort();
  const b = [...new Set((Array.isArray(right) ? right : []).map(String))].sort();
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function tenThousandCanRoll(game, seat) {
  if (game.status !== "playing") return false;
  // When the round is complete, any resolved seat may roll to start the next one.
  if (game.round_pending_advance) return true;
  return !seat.resolved && seat.phase === "ready";
}

function tenThousandCanReroll(game, seat) {
  return game.status === "playing" && !seat.resolved && seat.phase === "selected";
}

function tenThousandCanBank(game, seat) {
  return game.status === "playing" && !seat.resolved && seat.phase === "selected"
    && seat.turn_score >= tenThousandBankMinimum(seat);
}

// Opening rule: until a seat is "on the board" (has banked anything) the first
// bank must reach the opening minimum. After that any positive score may bank.
function tenThousandBankMinimum(seat) {
  return seat.score > 0 ? TEN_THOUSAND_BANK_MINIMUM : TEN_THOUSAND_OPENING_MINIMUM;
}

function tenThousandScoringOptions(seat) {
  if (seat.phase !== "rolled" && seat.phase !== "selected") return [];
  return seat.dice
    .filter((die) => !die.scored && die.value)
    .filter((die) => tenThousandScoreValues([die.value]).valid)
    .map((die) => die.id);
}

function tenThousandHasAnyScoringSet(values) {
  const clean = values.filter((value) => Number.isInteger(value) && value >= 1 && value <= 6);
  if (!clean.length) return false;
  if (clean.some((value) => value === 1 || value === 5)) return true;
  const counts = tenThousandCounts(clean);
  if (counts.some((count) => count >= 3)) return true;
  // Three pairs is a scoring combo even with no 1s, 5s, or triple (e.g. 2 2 4 4 6 6).
  if (clean.length === 6 && counts.filter((count) => count === 2).length === 3) return true;
  return false;
}

// Scores a selected set of dice values per the Default Scoring Set:
//   1. Full six-dice combos (highest priority): straight / three pairs / two
//      triplets, each consuming all six dice.
//   2. n-of-a-kind with the doubling rule: each die past three doubles the
//      three-of-a-kind value (four x2, five x4, six x8).
//   3. Leftover single 1s (100) and 5s (50).
// Any other leftover die makes the whole set invalid (it cannot be set aside).
function tenThousandScoreValues(values) {
  const clean = values.map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 6);
  if (clean.length !== values.length || !clean.length) return { valid: false, score: 0 };
  const counts = tenThousandCounts(clean);
  if (clean.length === 6) {
    if (counts.every((count) => count === 1)) return { valid: true, score: 1500 }; // straight
    if (counts.filter((count) => count === 2).length === 3) return { valid: true, score: 1500 }; // three pairs
    if (counts.filter((count) => count === 3).length === 2) return { valid: true, score: 2500 }; // two triplets
  }
  let score = 0;
  for (let index = 0; index < counts.length; index += 1) {
    const face = index + 1;
    if (counts[index] >= 3) {
      const base = face === 1 ? 1000 : face * 100;
      score += base * Math.pow(2, counts[index] - 3); // doubling: 4->x2, 5->x4, 6->x8
      counts[index] = 0;
    }
  }
  score += counts[0] * 100;
  counts[0] = 0;
  score += counts[4] * 50;
  counts[4] = 0;
  if (counts.some((count) => count > 0)) return { valid: false, score: 0 };
  return { valid: score > 0, score };
}

function tenThousandCounts(values) {
  const counts = [0, 0, 0, 0, 0, 0];
  values.forEach((value) => {
    counts[value - 1] += 1;
  });
  return counts;
}

const BATTLESHIP_SIZE = 10;
const BATTLESHIP_FLEET = [
  { id: "carrier", name: "Carrier", size: 5 },
  { id: "battleship", name: "Battleship", size: 4 },
  { id: "cruiser", name: "Cruiser", size: 3 },
  { id: "submarine", name: "Submarine", size: 3 },
  { id: "destroyer", name: "Destroyer", size: 2 },
];

function newBattleshipGame() {
  return {
    game_id: BATTLESHIP_GAME_ID,
    board_size: BATTLESHIP_SIZE,
    phase: "setup",
    status: "setup",
    current_player: null,
    winner: null,
    move_count: 0,
    fleet: BATTLESHIP_FLEET.map((ship) => ({ ...ship })),
    players: {
      X: newBattleshipPlayerState(),
      O: newBattleshipPlayerState(),
    },
    last_move: null,
    events: [],
  };
}

function newBattleshipPlayerState() {
  return {
    ready: false,
    ships: [],
    shots: [],
  };
}

function isBattleshipGame(game) {
  return Boolean(game && (cleanGameId(game.game_id) === BATTLESHIP_GAME_ID || game.phase === "setup" && game.players && game.fleet));
}

function ensureBattleshipState(game) {
  game.game_id = BATTLESHIP_GAME_ID;
  game.board_size = Number.isInteger(game.board_size) ? Math.min(12, Math.max(6, game.board_size)) : BATTLESHIP_SIZE;
  game.phase = game.phase === "complete" ? "complete" : game.phase === "playing" ? "playing" : "setup";
  game.status = ["setup", "playing", "x_won", "o_won", "draw"].includes(game.status) ? game.status : game.phase;
  game.fleet = BATTLESHIP_FLEET.map((ship) => ({ ...ship }));
  if (!game.players) game.players = {};
  ["X", "O"].forEach((mark) => {
    const player = game.players[mark] || {};
    game.players[mark] = {
      ready: Boolean(player.ready),
      ships: normalizeBattleshipShips(player.ships, game.board_size),
      shots: normalizeBattleshipShots(player.shots, game.board_size),
    };
  });
  if (!Array.isArray(game.events)) game.events = [];
  if (!Number.isFinite(Number(game.move_count))) game.move_count = 0;
}

function battleshipGameToDict(game) {
  ensureBattleshipState(game);
  return {
    ...game,
    game_id: BATTLESHIP_GAME_ID,
    legal_attacks: battleshipLegalMoves(game).map((move) => ({ row: move.row, col: move.col })),
  };
}

function makeBattleshipMove(game, mark, action) {
  ensureBattleshipState(game);
  const type = String(action && action.type || "").trim();
  if (game.status === "setup") {
    if (type === "auto_place") return placeBattleshipFleet(game, mark, autoBattleshipFleet(mark === "O"));
    if (type === "place_fleet") return placeBattleshipFleet(game, mark, action.ships);
    throw new Error("Place your fleet before attacking.");
  }
  if (game.status !== "playing") throw new Error("Game is already over.");
  if (type !== "attack") throw new Error("Attack action is required.");
  if (mark !== game.current_player) throw new Error(`It is ${game.current_player}'s turn.`);
  return attackBattleshipCell(game, mark, Number(action.row), Number(action.col));
}

function ensureBattleshipBotFleets(room) {
  if (!room || !isBattleshipGame(room.game) || !room.started) return false;
  ensureBattleshipState(room.game);
  let changed = false;
  room.players.filter(isBotSeat).forEach((bot) => {
    if (!bot.mark || !room.game.players[bot.mark]) return;
    const state = room.game.players[bot.mark];
    const hasCompleteFleet = state.ready && Array.isArray(state.ships) && state.ships.length === BATTLESHIP_FLEET.length;
    if (hasCompleteFleet) return;
    placeBattleshipFleet(room.game, bot.mark, chooseBattleshipBotFleet(bot));
    changed = true;
  });
  return changed;
}

function placeBattleshipFleet(game, mark, ships) {
  const normalized = normalizeBattleshipShips(ships, game.board_size);
  validateBattleshipFleet(normalized, game.board_size);
  game.players[mark].ships = normalized;
  game.players[mark].ready = true;
  game.last_move = { type: "fleetPlaced", player: mark };
  game.events.push(game.last_move);
  game.events = game.events.slice(-30);
  if (game.players.X.ready && game.players.O.ready) {
    game.phase = "playing";
    game.status = "playing";
    game.current_player = "X";
  }
}

function attackBattleshipCell(game, mark, row, col) {
  if (!Number.isInteger(row) || row < 0 || row >= game.board_size || !Number.isInteger(col) || col < 0 || col >= game.board_size) {
    throw new Error("Attack is outside the board.");
  }
  const attacker = game.players[mark];
  const defenderMark = otherMark(mark);
  const defender = game.players[defenderMark];
  if (attacker.shots.some((shot) => shot.row === row && shot.col === col)) throw new Error("That cell was already targeted.");
  const target = battleshipShipAt(defender.ships, row, col);
  const hit = Boolean(target);
  attacker.shots.push({ row, col, hit, ship_id: target ? target.id : null });
  game.move_count += 1;
  const sunk = target ? battleshipShipSunk(defender, attacker.shots, target.id) : false;
  game.last_move = { type: "attack", player: mark, row, col, hit, sunk, ship_id: target ? target.id : null };
  game.events.push(game.last_move);
  game.events = game.events.slice(-40);
  if (battleshipFleetSunk(defender, attacker.shots)) {
    game.status = mark === "X" ? "x_won" : "o_won";
    game.phase = "complete";
    game.winner = mark;
    game.current_player = null;
    return;
  }
  game.current_player = defenderMark;
}

function battleshipLegalMoves(game) {
  if (!game || game.status !== "playing" || !game.current_player) return [];
  ensureBattleshipState(game);
  const shots = new Set(game.players[game.current_player].shots.map((shot) => `${shot.row}:${shot.col}`));
  const moves = [];
  for (let row = 0; row < game.board_size; row += 1) {
    for (let col = 0; col < game.board_size; col += 1) {
      if (!shots.has(`${row}:${col}`)) moves.push({ type: "attack", row, col });
    }
  }
  return moves;
}

function normalizeBattleshipShips(ships, boardSize) {
  if (!Array.isArray(ships)) return [];
  return ships.map((ship) => ({
    id: String(ship && ship.id || "").trim(),
    row: Number(ship && ship.row),
    col: Number(ship && ship.col),
    orientation: ship && ship.orientation === "v" ? "v" : "h",
  })).filter((ship) => (
    ship.id &&
    Number.isInteger(ship.row) &&
    Number.isInteger(ship.col) &&
    ship.row >= 0 &&
    ship.col >= 0 &&
    ship.row < boardSize &&
    ship.col < boardSize
  ));
}

function normalizeBattleshipShots(shots, boardSize) {
  if (!Array.isArray(shots)) return [];
  return shots.map((shot) => ({
    row: Number(shot && shot.row),
    col: Number(shot && shot.col),
    hit: Boolean(shot && shot.hit),
    ship_id: shot && shot.ship_id ? String(shot.ship_id) : null,
  })).filter((shot) => Number.isInteger(shot.row) && Number.isInteger(shot.col) && shot.row >= 0 && shot.col >= 0 && shot.row < boardSize && shot.col < boardSize);
}

function validateBattleshipFleet(ships, boardSize) {
  if (ships.length !== BATTLESHIP_FLEET.length) throw new Error("Place every ship before readying fleet.");
  const occupied = new Set();
  BATTLESHIP_FLEET.forEach((required) => {
    const ship = ships.find((item) => item.id === required.id);
    if (!ship) throw new Error(`${required.name} is not placed.`);
    const cells = battleshipShipCells(ship, required.size);
    if (!cells.length) throw new Error(`${required.name} is not placed.`);
    cells.forEach((cell) => {
      if (cell.row < 0 || cell.col < 0 || cell.row >= boardSize || cell.col >= boardSize) throw new Error(`${required.name} is outside the board.`);
      const key = `${cell.row}:${cell.col}`;
      if (occupied.has(key)) throw new Error("Ships cannot overlap.");
      occupied.add(key);
    });
  });
}

function battleshipShipCells(ship, size = battleshipShipSize(ship.id)) {
  if (!size) return [];
  return Array.from({ length: size }, (_, index) => ({
    row: ship.row + (ship.orientation === "v" ? index : 0),
    col: ship.col + (ship.orientation === "h" ? index : 0),
  }));
}

function battleshipShipSize(shipId) {
  return (BATTLESHIP_FLEET.find((ship) => ship.id === shipId) || {}).size || 0;
}

function battleshipShipAt(ships, row, col) {
  return ships.find((ship) => battleshipShipCells(ship).some((cell) => cell.row === row && cell.col === col)) || null;
}

function battleshipShipSunk(defender, attackerShots, shipId) {
  const ship = defender.ships.find((item) => item.id === shipId);
  if (!ship) return false;
  const hits = new Set(attackerShots.filter((shot) => shot.hit).map((shot) => `${shot.row}:${shot.col}`));
  return battleshipShipCells(ship).every((cell) => hits.has(`${cell.row}:${cell.col}`));
}

function battleshipFleetSunk(defender, attackerShots) {
  return defender.ships.length === BATTLESHIP_FLEET.length && defender.ships.every((ship) => battleshipShipSunk(defender, attackerShots, ship.id));
}

function autoBattleshipFleet() {
  const randomFleet = generateRandomBattleshipFleet(BATTLESHIP_SIZE, BATTLESHIP_FLEET);
  if (randomFleet.length === BATTLESHIP_FLEET.length) return randomFleet;
  return [
    { id: "carrier", row: 0, col: 0, orientation: "h" },
    { id: "battleship", row: 2, col: 0, orientation: "h" },
    { id: "cruiser", row: 4, col: 0, orientation: "h" },
    { id: "submarine", row: 6, col: 0, orientation: "h" },
    { id: "destroyer", row: 8, col: 0, orientation: "h" },
  ];
}

function chooseBattleshipBotFleet(bot = null) {
  if (!isOverlordBot(bot)) return autoBattleshipFleet();
  return chooseStrongBattleshipFleet(BATTLESHIP_SIZE, BATTLESHIP_FLEET, 5000);
}

function chooseStrongBattleshipFleet(boardSize, fleet, attempts = 5000) {
  const enemyHeatMap = buildBattleshipEmptyBoardHeatMap(boardSize, fleet);
  const candidates = [];
  for (let index = 0; index < attempts; index += 1) {
    const layout = generateRandomBattleshipFleet(boardSize, fleet);
    if (!layout.length) continue;
    candidates.push({
      fleet: layout,
      score: scoreBattleshipFleetPlacement(layout, enemyHeatMap, boardSize),
    });
  }
  candidates.sort((left, right) => left.score - right.score);
  const topCount = Math.min(candidates.length, Math.max(10, Math.floor(attempts * 0.02)));
  const top = candidates.slice(0, topCount);
  return (top[Math.floor(Math.random() * top.length)] || candidates[0] || { fleet: autoBattleshipFleet() }).fleet;
}

function generateRandomBattleshipFleet(boardSize, fleet) {
  const placed = [];
  const occupied = new Set();
  const shuffled = fleet.slice().sort(() => Math.random() - 0.5);
  for (const ship of shuffled) {
    let placedShip = null;
    for (let attempt = 0; attempt < 120 && !placedShip; attempt += 1) {
      const orientation = Math.random() < 0.5 ? "h" : "v";
      const rowMax = orientation === "v" ? boardSize - ship.size : boardSize - 1;
      const colMax = orientation === "h" ? boardSize - ship.size : boardSize - 1;
      const candidate = {
        id: ship.id,
        row: Math.floor(Math.random() * (rowMax + 1)),
        col: Math.floor(Math.random() * (colMax + 1)),
        orientation,
      };
      const cells = battleshipShipCells(candidate, ship.size);
      if (cells.every((cell) => !occupied.has(`${cell.row}:${cell.col}`))) placedShip = candidate;
    }
    if (!placedShip) return [];
    battleshipShipCells(placedShip, ship.size).forEach((cell) => occupied.add(`${cell.row}:${cell.col}`));
    placed.push(placedShip);
  }
  return fleet.map((ship) => placed.find((item) => item.id === ship.id));
}

function buildBattleshipEmptyBoardHeatMap(boardSize, fleet) {
  const heat = zeroBattleshipGrid(boardSize);
  fleet.forEach((ship) => {
    allBattleshipPlacements(boardSize, ship.size).forEach((placement) => {
      battleshipShipCells(placement, ship.size).forEach((cell) => {
        heat[cell.row][cell.col] += 1;
      });
    });
  });
  return heat;
}

function scoreBattleshipFleetPlacement(fleet, enemyHeatMap, boardSize) {
  return scoreBattleshipEnemyHeat(fleet, enemyHeatMap)
    + scoreBattleshipClustering(fleet)
    + scoreBattleshipEdgeOveruse(fleet, boardSize)
    + scoreBattleshipOrientationBalance(fleet)
    + Math.random() * 10;
}

function scoreBattleshipEnemyHeat(fleet, enemyHeatMap) {
  return fleet.reduce((total, ship) => total + battleshipShipCells(ship).reduce((shipTotal, cell) => shipTotal + enemyHeatMap[cell.row][cell.col], 0), 0);
}

function scoreBattleshipClustering(fleet) {
  const cells = fleet.flatMap((ship) => battleshipShipCells(ship));
  let penalty = 0;
  for (let left = 0; left < cells.length; left += 1) {
    for (let right = left + 1; right < cells.length; right += 1) {
      const distance = Math.abs(cells[left].row - cells[right].row) + Math.abs(cells[left].col - cells[right].col);
      if (distance === 1) penalty += 8;
      else if (distance === 2) penalty += 3;
    }
  }
  return penalty;
}

function scoreBattleshipEdgeOveruse(fleet, boardSize) {
  const cells = fleet.flatMap((ship) => battleshipShipCells(ship));
  const edgeCells = cells.filter((cell) => cell.row === 0 || cell.col === 0 || cell.row === boardSize - 1 || cell.col === boardSize - 1).length;
  const edgeRatio = edgeCells / Math.max(1, cells.length);
  return edgeRatio > 0.45 ? (edgeRatio - 0.45) * 100 : 0;
}

function scoreBattleshipOrientationBalance(fleet) {
  const horizontal = fleet.filter((ship) => ship.orientation === "h").length;
  const vertical = fleet.length - horizontal;
  return Math.abs(horizontal - vertical) * 6;
}

function chooseBattleshipBotMove(game, bot, moves) {
  const mark = game.current_player;
  const knowledge = battleshipKnowledgeBoard(game, mark);
  const remainingShips = battleshipRemainingShipsFromShots(game.players[mark].shots || []);
  const heat = buildBattleshipAttackHeatMap(knowledge, remainingShips);
  const target = chooseBattleshipTargetMove(knowledge, heat, remainingShips);
  if (target) return target;
  if (!isOverlordBot(bot)) return moves[Math.floor(Math.random() * moves.length)];
  return chooseBattleshipHuntMove(knowledge, heat, remainingShips, moves);
}

function battleshipKnowledgeBoard(game, mark) {
  const board = Array.from({ length: game.board_size }, () => Array.from({ length: game.board_size }, () => ({ state: "unknown", ship_id: null })));
  (game.players[mark].shots || []).forEach((shot) => {
    board[shot.row][shot.col] = { state: shot.hit ? "hit" : "miss", ship_id: shot.ship_id || null };
  });
  return board;
}

function battleshipRemainingShipsFromShots(shots) {
  const hitsByShip = new Map();
  (shots || []).filter((shot) => shot.hit && shot.ship_id).forEach((shot) => {
    hitsByShip.set(shot.ship_id, (hitsByShip.get(shot.ship_id) || 0) + 1);
  });
  return BATTLESHIP_FLEET.filter((ship) => (hitsByShip.get(ship.id) || 0) < ship.size);
}

function buildBattleshipAttackHeatMap(board, remainingShips) {
  const boardSize = board.length;
  const heat = zeroBattleshipGrid(boardSize);
  remainingShips.forEach((ship) => {
    allBattleshipPlacements(boardSize, ship.size).forEach((placement) => {
      const cells = battleshipShipCells(placement, ship.size);
      if (!cells.every((cell) => board[cell.row][cell.col].state !== "miss")) return;
      cells.forEach((cell) => {
        if (board[cell.row][cell.col].state === "unknown") heat[cell.row][cell.col] += 1;
      });
    });
  });
  return heat;
}

function chooseBattleshipTargetMove(board, heat, remainingShips) {
  const clusters = battleshipHitClusters(board).filter((cluster) => !battleshipClusterSunk(cluster, remainingShips));
  const candidates = clusters.flatMap((cluster) => battleshipTargetCandidatesForCluster(board, cluster));
  return bestBattleshipCell(candidates, (cell) => heat[cell.row][cell.col] * 10 + battleshipInformationValue(cell, board, remainingShips));
}

function battleshipHitClusters(board) {
  const visited = new Set();
  const clusters = [];
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board.length; col += 1) {
      if (board[row][col].state !== "hit" || visited.has(`${row}:${col}`)) continue;
      const cluster = [];
      const stack = [{ row, col }];
      visited.add(`${row}:${col}`);
      while (stack.length) {
        const cell = stack.pop();
        cluster.push(cell);
        battleshipNeighbors(cell, board.length).forEach((next) => {
          const key = `${next.row}:${next.col}`;
          if (visited.has(key) || board[next.row][next.col].state !== "hit") return;
          visited.add(key);
          stack.push(next);
        });
      }
      clusters.push(cluster);
    }
  }
  return clusters;
}

function battleshipClusterSunk(cluster, remainingShips) {
  const ids = [...new Set(cluster.map((cell) => cell.ship_id).filter(Boolean))];
  return ids.length === 1 && !remainingShips.some((ship) => ship.id === ids[0]);
}

function battleshipTargetCandidatesForCluster(board, cluster) {
  if (!cluster.length) return [];
  if (cluster.length === 1) return battleshipNeighbors(cluster[0], board.length).filter((cell) => board[cell.row][cell.col].state === "unknown");
  const sameRow = cluster.every((cell) => cell.row === cluster[0].row);
  const sameCol = cluster.every((cell) => cell.col === cluster[0].col);
  if (!sameRow && !sameCol) return cluster.flatMap((cell) => battleshipNeighbors(cell, board.length)).filter((cell) => board[cell.row][cell.col].state === "unknown");
  const sorted = cluster.slice().sort((left, right) => sameRow ? left.col - right.col : left.row - right.row);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const ends = sameRow
    ? [{ row: first.row, col: first.col - 1 }, { row: last.row, col: last.col + 1 }]
    : [{ row: first.row - 1, col: first.col }, { row: last.row + 1, col: last.col }];
  return ends.filter((cell) => cell.row >= 0 && cell.col >= 0 && cell.row < board.length && cell.col < board.length && board[cell.row][cell.col].state === "unknown");
}

function chooseBattleshipHuntMove(board, heat, remainingShips, moves) {
  return bestBattleshipCell(moves, (cell) => {
    const smallestShip = Math.min(...remainingShips.map((ship) => ship.size));
    return heat[cell.row][cell.col] * 10
      + battleshipParityBonus(cell, smallestShip)
      + battleshipInformationValue(cell, board, remainingShips);
  });
}

function battleshipParityBonus(cell, smallestShip) {
  if (smallestShip <= 2) return (cell.row + cell.col) % 2 === 0 ? 5 : 0;
  if (smallestShip === 3) return (cell.row + cell.col) % 3 === 0 ? 5 : 0;
  return 0;
}

function battleshipInformationValue(cell, board, remainingShips) {
  const maxShipSize = Math.max(...remainingShips.map((ship) => ship.size), 2);
  const horizontal = countBattleshipOpenCells(cell, board, 0, -1) + countBattleshipOpenCells(cell, board, 0, 1) + 1;
  const vertical = countBattleshipOpenCells(cell, board, -1, 0) + countBattleshipOpenCells(cell, board, 1, 0) + 1;
  return (horizontal >= maxShipSize ? 2 : 0) + (vertical >= maxShipSize ? 2 : 0) + Math.min(horizontal, vertical);
}

function countBattleshipOpenCells(cell, board, rowStep, colStep) {
  let count = 0;
  let row = cell.row + rowStep;
  let col = cell.col + colStep;
  while (row >= 0 && col >= 0 && row < board.length && col < board.length && board[row][col].state === "unknown") {
    count += 1;
    row += rowStep;
    col += colStep;
  }
  return count;
}

function bestBattleshipCell(cells, scoreCell) {
  if (!cells.length) return null;
  let bestScore = -Infinity;
  let best = [];
  cells.forEach((cell) => {
    const score = scoreCell(cell);
    if (score > bestScore) {
      bestScore = score;
      best = [cell];
    } else if (score === bestScore) {
      best.push(cell);
    }
  });
  const picked = best[Math.floor(Math.random() * best.length)];
  return picked ? { type: "attack", row: picked.row, col: picked.col } : null;
}

function battleshipNeighbors(cell, boardSize) {
  return [
    { row: cell.row - 1, col: cell.col },
    { row: cell.row + 1, col: cell.col },
    { row: cell.row, col: cell.col - 1 },
    { row: cell.row, col: cell.col + 1 },
  ].filter((item) => item.row >= 0 && item.col >= 0 && item.row < boardSize && item.col < boardSize);
}

function allBattleshipPlacements(boardSize, shipSize) {
  const placements = [];
  for (let row = 0; row < boardSize; row += 1) {
    for (let col = 0; col <= boardSize - shipSize; col += 1) placements.push({ row, col, orientation: "h" });
  }
  for (let row = 0; row <= boardSize - shipSize; row += 1) {
    for (let col = 0; col < boardSize; col += 1) placements.push({ row, col, orientation: "v" });
  }
  return placements;
}

function zeroBattleshipGrid(boardSize) {
  return Array.from({ length: boardSize }, () => Array.from({ length: boardSize }, () => 0));
}

function isOverlordBot(bot) {
  return Boolean(bot && (bot.bot_id === OVERLORD_BOT_ID || bot.id === OVERLORD_BOT_ID));
}

const QUORIDOR_SIZE = 9;
const QUORIDOR_WALLS = 10;

function newQuoridorGame() {
  return {
    game_id: QUORIDOR_GAME_ID,
    board_size: QUORIDOR_SIZE,
    walls_per_player: QUORIDOR_WALLS,
    pawns: {
      X: { row: QUORIDOR_SIZE - 1, col: Math.floor(QUORIDOR_SIZE / 2), goal: 0 },
      O: { row: 0, col: Math.floor(QUORIDOR_SIZE / 2), goal: QUORIDOR_SIZE - 1 },
    },
    walls_remaining: { X: QUORIDOR_WALLS, O: QUORIDOR_WALLS },
    walls: [],
    current_player: "X",
    status: "playing",
    winner: null,
    move_count: 0,
    last_move: null,
  };
}

function isQuoridorGame(game) {
  return Boolean(game && (cleanGameId(game.game_id) === QUORIDOR_GAME_ID || game.pawns && game.walls_remaining && Array.isArray(game.walls)));
}

function ensureQuoridorState(game) {
  game.game_id = QUORIDOR_GAME_ID;
  game.board_size = QUORIDOR_SIZE;
  game.walls_per_player = QUORIDOR_WALLS;
  if (!game.pawns) game.pawns = {};
  game.pawns.X = normalizeQuoridorPawn(game.pawns.X, "X");
  game.pawns.O = normalizeQuoridorPawn(game.pawns.O, "O");
  game.walls_remaining = {
    X: clampInteger(game.walls_remaining && game.walls_remaining.X, 0, QUORIDOR_WALLS, QUORIDOR_WALLS),
    O: clampInteger(game.walls_remaining && game.walls_remaining.O, 0, QUORIDOR_WALLS, QUORIDOR_WALLS),
  };
  game.walls = Array.isArray(game.walls) ? game.walls.map(normalizeQuoridorWall).filter(Boolean).sort(compareQuoridorWalls) : [];
  game.current_player = ["X", "O"].includes(game.current_player) ? game.current_player : game.status === "playing" ? "X" : null;
  game.status = ["playing", "x_won", "o_won", "draw"].includes(game.status) ? game.status : "playing";
  game.winner = ["X", "O"].includes(game.winner) ? game.winner : null;
  if (!Number.isFinite(Number(game.move_count))) game.move_count = 0;
}

function normalizeQuoridorPawn(pawn, mark) {
  const startRow = mark === "X" ? QUORIDOR_SIZE - 1 : 0;
  const goal = mark === "X" ? 0 : QUORIDOR_SIZE - 1;
  return {
    row: clampInteger(pawn && pawn.row, 0, QUORIDOR_SIZE - 1, startRow),
    col: clampInteger(pawn && pawn.col, 0, QUORIDOR_SIZE - 1, Math.floor(QUORIDOR_SIZE / 2)),
    goal,
  };
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function quoridorGameToDict(game) {
  ensureQuoridorState(game);
  return {
    ...game,
    game_id: QUORIDOR_GAME_ID,
    legal_pawn_moves: game.status === "playing" ? quoridorPawnMoves(game, game.current_player) : [],
    legal_walls: game.status === "playing" && game.walls_remaining[game.current_player] > 0
      ? allQuoridorWallSlots().filter((wall) => quoridorWallLegal(game, wall))
      : [],
  };
}

function quoridorLegalMoves(game) {
  ensureQuoridorState(game);
  if (game.status !== "playing") return [];
  const pawnMoves = quoridorPawnMoves(game, game.current_player).map((move) => ({ type: "move_pawn", row: move.row, col: move.col }));
  if (game.walls_remaining[game.current_player] <= 0) return pawnMoves;
  const wallMoves = allQuoridorWallSlots()
    .filter((wall) => quoridorWallLegal(game, wall))
    .map((wall) => ({ type: "place_wall", ...wall }));
  return [...pawnMoves, ...wallMoves];
}

function makeQuoridorMove(game, mark, action) {
  ensureQuoridorState(game);
  if (game.status !== "playing") throw new Error("Game is already over.");
  if (mark !== game.current_player) throw new Error(`It is ${game.current_player}'s turn.`);
  const type = String(action && action.type || "").trim();
  if (type === "move_pawn") return moveQuoridorPawn(game, mark, Number(action.row), Number(action.col));
  if (type === "place_wall") return placeQuoridorWall(game, mark, {
    orientation: action.orientation,
    row: Number(action.row),
    col: Number(action.col),
  });
  throw new Error("Quoridor action is required.");
}

function moveQuoridorPawn(game, mark, row, col) {
  const legal = quoridorPawnMoves(game, mark).some((move) => move.row === row && move.col === col);
  if (!legal) throw new Error("Pawn move is not legal.");
  game.pawns[mark].row = row;
  game.pawns[mark].col = col;
  game.move_count += 1;
  game.last_move = { type: "move_pawn", player: mark, row, col };
  if (row === game.pawns[mark].goal) {
    game.status = mark === "X" ? "x_won" : "o_won";
    game.winner = mark;
    game.current_player = null;
    return;
  }
  game.current_player = otherMark(mark);
}

function placeQuoridorWall(game, mark, wall) {
  const clean = normalizeQuoridorWall(wall);
  if (!clean || !quoridorWallLegal(game, clean)) throw new Error("Wall placement is not legal.");
  game.walls.push(clean);
  game.walls.sort(compareQuoridorWalls);
  game.walls_remaining[mark] -= 1;
  game.move_count += 1;
  game.last_move = { type: "place_wall", player: mark, ...clean };
  game.current_player = otherMark(mark);
}

function quoridorPawnMoves(game, mark) {
  ensureQuoridorState(game);
  const pawn = game.pawns[mark];
  const opponent = game.pawns[otherMark(mark)];
  const moves = [];
  quoridorDirections().forEach((direction) => {
    const next = { row: pawn.row + direction.dr, col: pawn.col + direction.dc };
    if (!quoridorCellInBounds(next) || quoridorBlocked(game, pawn, next)) return;
    if (next.row !== opponent.row || next.col !== opponent.col) {
      moves.push(next);
      return;
    }
    const jump = { row: opponent.row + direction.dr, col: opponent.col + direction.dc };
    if (quoridorCellInBounds(jump) && !quoridorBlocked(game, opponent, jump)) {
      moves.push(jump);
      return;
    }
    quoridorPerpendicularDirections(direction).forEach((side) => {
      const diagonal = { row: opponent.row + side.dr, col: opponent.col + side.dc };
      if (quoridorCellInBounds(diagonal) && !quoridorBlocked(game, opponent, diagonal)) moves.push(diagonal);
    });
  });
  return uniqueQuoridorCells(moves);
}

function quoridorDirections() {
  return [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];
}

function quoridorPerpendicularDirections(direction) {
  return direction.dr ? [{ dr: 0, dc: -1 }, { dr: 0, dc: 1 }] : [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }];
}

function uniqueQuoridorCells(cells) {
  const seen = new Set();
  return cells.filter((cell) => {
    const key = `${cell.row}:${cell.col}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => left.row - right.row || left.col - right.col);
}

function quoridorCellInBounds(cell) {
  return cell.row >= 0 && cell.row < QUORIDOR_SIZE && cell.col >= 0 && cell.col < QUORIDOR_SIZE;
}

function quoridorBlocked(game, from, to) {
  const row = Math.min(from.row, to.row);
  const col = Math.min(from.col, to.col);
  if (from.row !== to.row) {
    return game.walls.some((wall) => wall.orientation === "h" && wall.row === row && (wall.col === col || wall.col === col - 1));
  }
  return game.walls.some((wall) => wall.orientation === "v" && wall.col === col && (wall.row === row || wall.row === row - 1));
}

function normalizeQuoridorWall(wall) {
  const orientation = String(wall && wall.orientation || "").toLowerCase();
  const row = Number(wall && wall.row);
  const col = Number(wall && wall.col);
  if (!["h", "v"].includes(orientation) || !Number.isInteger(row) || !Number.isInteger(col)) return null;
  if (row < 0 || row >= QUORIDOR_SIZE - 1 || col < 0 || col >= QUORIDOR_SIZE - 1) return null;
  return { orientation, row, col };
}

function allQuoridorWallSlots() {
  const slots = [];
  for (let row = 0; row < QUORIDOR_SIZE - 1; row += 1) {
    for (let col = 0; col < QUORIDOR_SIZE - 1; col += 1) {
      slots.push({ orientation: "h", row, col }, { orientation: "v", row, col });
    }
  }
  return slots;
}

function quoridorWallLegal(game, wall) {
  ensureQuoridorState(game);
  const clean = normalizeQuoridorWall(wall);
  if (!clean || game.walls_remaining[game.current_player] <= 0) return false;
  if (game.walls.some((existing) => quoridorWallsConflict(existing, clean))) return false;
  const next = { ...game, walls: [...game.walls, clean] };
  return quoridorHasGoalPath(next, "X") && quoridorHasGoalPath(next, "O");
}

function quoridorWallsConflict(a, b) {
  if (a.orientation !== b.orientation) return a.row === b.row && a.col === b.col;
  if (a.orientation === "h") return a.row === b.row && Math.abs(a.col - b.col) < 2;
  return a.col === b.col && Math.abs(a.row - b.row) < 2;
}

function quoridorHasGoalPath(game, mark) {
  const start = game.pawns[mark];
  const queue = [{ row: start.row, col: start.col }];
  const visited = new Set([`${start.row}:${start.col}`]);
  while (queue.length) {
    const cell = queue.shift();
    if (cell.row === start.goal) return true;
    quoridorDirections().forEach((direction) => {
      const next = { row: cell.row + direction.dr, col: cell.col + direction.dc };
      const key = `${next.row}:${next.col}`;
      if (!quoridorCellInBounds(next) || visited.has(key) || quoridorBlocked(game, cell, next)) return;
      visited.add(key);
      queue.push(next);
    });
  }
  return false;
}

function quoridorShortestPath(game, mark) {
  const start = game.pawns[mark];
  const queue = [{ row: start.row, col: start.col, path: [] }];
  const visited = new Set([`${start.row}:${start.col}`]);
  while (queue.length) {
    const cell = queue.shift();
    if (cell.row === start.goal) return cell.path;
    quoridorDirections().forEach((direction) => {
      const next = { row: cell.row + direction.dr, col: cell.col + direction.dc };
      const key = `${next.row}:${next.col}`;
      if (!quoridorCellInBounds(next) || visited.has(key) || quoridorBlocked(game, cell, next)) return;
      visited.add(key);
      queue.push({ ...next, path: [...cell.path, next] });
    });
  }
  return [];
}

function chooseQuoridorBotMove(game, bot, moves) {
  ensureQuoridorState(game);
  const difficulty = quoridorBotDifficulty(bot);
  if (difficulty === "rookie") return chooseRookieQuoridorMove(game, moves);
  if (difficulty === "tactician") return chooseTacticianQuoridorMove(game, moves);
  if (difficulty === "master") return chooseMasterQuoridorMove(game, moves);
  return chooseScoutQuoridorMove(game, moves);
}

function quoridorBotDifficulty(bot) {
  const id = bot && (bot.bot_id || bot.id);
  if (id === "5e2c8a71d0f4") return "rookie";
  if (id === "b64d20f19a8c") return "tactician";
  if (id === OVERLORD_BOT_ID) return "master";
  return "scout";
}

function chooseRookieQuoridorMove(game, moves) {
  const win = quoridorImmediateWinMove(game, game.current_player, moves);
  if (win) return win;
  const pawnMoves = moves.filter((move) => move.type === "move_pawn");
  const wallMoves = quoridorUsefulWallMoves(game, moves).filter((item) => item.selfPain <= 1).map((item) => item.move);
  if (wallMoves.length && Math.random() < 0.25) return wallMoves[Math.floor(Math.random() * wallMoves.length)];
  const pathMove = quoridorShortestPathMove(game, game.current_player, moves);
  if (pathMove && Math.random() < 0.7) return pathMove;
  return pawnMoves[Math.floor(Math.random() * pawnMoves.length)] || pathMove || moves[0] || null;
}

function chooseScoutQuoridorMove(game, moves) {
  const mark = game.current_player;
  const win = quoridorImmediateWinMove(game, mark, moves);
  if (win) return win;
  const emergencyWall = quoridorEmergencyWall(game, moves);
  if (emergencyWall) return emergencyWall;
  const bestMove = quoridorBestPawnMove(game, mark, moves);
  const bestWall = quoridorBestSimpleWall(game, moves);
  if (!bestWall) return bestMove && bestMove.move || moves[0] || null;
  const myDistance = quoridorShortestPath(game, mark).length;
  const opponentDistance = quoridorShortestPath(game, otherMark(mark)).length;
  if (myDistance + 1 < opponentDistance && bestWall.opponentGain < 3) return bestMove.move;
  return bestWall.score > bestMove.score ? bestWall.move : bestMove.move;
}

function chooseTacticianQuoridorMove(game, moves) {
  const mark = game.current_player;
  const win = quoridorImmediateWinMove(game, mark, moves);
  if (win) return win;
  const emergencyWall = quoridorEmergencyWall(game, moves);
  if (emergencyWall) return emergencyWall;
  const candidates = [
    ...moves.filter((move) => move.type === "move_pawn").map((move) => ({
      move,
      score: quoridorEvaluateAfterMove(game, move, mark),
    })),
    ...quoridorUsefulWallMoves(game, moves).map((item) => ({
      move: item.move,
      score: quoridorEvaluateAfterMove(game, item.move, mark) + item.score,
    })),
  ].sort((left, right) => right.score - left.score);
  if (!candidates.length) return moves[0] || null;
  if (candidates.length > 1 && Math.random() < 0.08) return candidates[Math.floor(Math.random() * Math.min(3, candidates.length))].move;
  return candidates[0].move;
}

function chooseMasterQuoridorMove(game, moves) {
  const mark = game.current_player;
  const win = quoridorImmediateWinMove(game, mark, moves);
  if (win) return win;
  const emergencyWall = quoridorEmergencyWall(game, moves);
  if (emergencyWall) return emergencyWall;
  const depth = quoridorChooseSearchDepth(game, mark);
  const candidates = quoridorOrderedCandidates(game, moves, mark);
  let best = null;
  let alpha = -Infinity;
  const cache = new Map();
  candidates.forEach((move) => {
    const preview = quoridorPreviewMove(game, move);
    const score = -quoridorNegamax(preview, otherMark(mark), mark, depth - 1, -Infinity, -alpha, cache);
    if (!best || score > best.score) {
      best = { move, score };
      alpha = Math.max(alpha, score);
    }
  });
  return best ? best.move : chooseTacticianQuoridorMove(game, moves);
}

function quoridorImmediateWinMove(game, mark, moves) {
  return moves.find((move) => move.type === "move_pawn" && move.row === game.pawns[mark].goal) || null;
}

function quoridorEmergencyWall(game, moves) {
  const opponent = otherMark(game.current_player);
  const opponentMoves = quoridorPawnMoves(game, opponent).map((move) => ({ type: "move_pawn", row: move.row, col: move.col }));
  if (!quoridorImmediateWinMove(game, opponent, opponentMoves)) return null;
  return moves.filter((move) => move.type === "place_wall").find((move) => {
    const preview = quoridorPreviewMove(game, move);
    return !quoridorPawnMoves(preview, opponent).some((pawnMove) => pawnMove.row === preview.pawns[opponent].goal);
  }) || null;
}

function quoridorShortestPathMove(game, mark, moves) {
  const next = quoridorShortestPath(game, mark)[0];
  return next ? moves.find((move) => move.type === "move_pawn" && move.row === next.row && move.col === next.col) || null : null;
}

function quoridorBestPawnMove(game, mark, moves) {
  const currentDistance = quoridorShortestPath(game, mark).length;
  const opponent = otherMark(mark);
  const scored = moves.filter((move) => move.type === "move_pawn").map((move) => {
    const preview = quoridorPreviewMove(game, move);
    const myDistance = quoridorShortestPath(preview, mark).length;
    const opponentDistance = quoridorShortestPath(preview, opponent).length;
    return { move, score: 4 * (currentDistance - myDistance) + (opponentDistance - myDistance) };
  }).sort((left, right) => right.score - left.score);
  return scored[0] || { move: quoridorShortestPathMove(game, mark, moves), score: 0 };
}

function quoridorBestSimpleWall(game, moves) {
  return quoridorUsefulWallMoves(game, moves).sort((left, right) => right.score - left.score)[0] || null;
}

function quoridorUsefulWallMoves(game, moves) {
  const mark = game.current_player;
  const opponent = otherMark(mark);
  const myDistance = quoridorShortestPath(game, mark).length;
  const opponentDistance = quoridorShortestPath(game, opponent).length;
  const opponentPath = quoridorShortestPath(game, opponent);
  return moves.filter((move) => move.type === "place_wall").map((move) => {
    const preview = quoridorPreviewMove(game, move);
    const newOpponentDistance = quoridorShortestPath(preview, opponent).length;
    const newMyDistance = quoridorShortestPath(preview, mark).length;
    const opponentGain = newOpponentDistance - opponentDistance;
    const selfPain = newMyDistance - myDistance;
    const nearPath = quoridorWallNearPath(move, opponentPath);
    return {
      move,
      opponentGain,
      selfPain,
      score: 3 * opponentGain - 2 * selfPain + (nearPath ? 1 : 0),
    };
  }).filter((item) => item.opponentGain > 0 && item.selfPain <= 1 && item.score > 0)
    .filter((item) => game.walls_remaining[mark] > 1 || item.opponentGain >= 2);
}

function quoridorWallNearPath(wall, path) {
  return path.some((cell) => Math.abs(cell.row - wall.row) + Math.abs(cell.col - wall.col) <= 2);
}

function quoridorEvaluateAfterMove(game, move, aiMark) {
  return quoridorEvaluateState(quoridorPreviewMove(game, move), aiMark);
}

function quoridorEvaluateState(game, aiMark) {
  if (game.winner === aiMark) return 100000;
  if (game.winner === otherMark(aiMark)) return -100000;
  const opponent = otherMark(aiMark);
  const myDistance = quoridorShortestPath(game, aiMark).length;
  const opponentDistance = quoridorShortestPath(game, opponent).length;
  const mobility = quoridorPawnMoves(game, aiMark).length - quoridorPawnMoves(game, opponent).length;
  const walls = Number(game.walls_remaining[aiMark] || 0) - Number(game.walls_remaining[opponent] || 0);
  return 12 * (opponentDistance - myDistance) + 2 * walls + 4 * mobility;
}

function quoridorPreviewMove(game, move) {
  const next = JSON.parse(JSON.stringify(game));
  ensureQuoridorState(next);
  if (move.type === "move_pawn") moveQuoridorPawn(next, next.current_player, move.row, move.col);
  else placeQuoridorWall(next, next.current_player, move);
  return next;
}

function quoridorOrderedCandidates(game, moves, aiMark) {
  const walls = quoridorUsefulWallMoves(game, moves).map((item) => item.move).slice(0, 12);
  const pawns = moves.filter((move) => move.type === "move_pawn");
  return [...pawns, ...walls]
    .map((move) => ({ move, score: quoridorEvaluateAfterMove(game, move, aiMark) }))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.move);
}

function quoridorChooseSearchDepth(game, mark) {
  const totalWalls = Number(game.walls_remaining.X || 0) + Number(game.walls_remaining.O || 0);
  const myDistance = quoridorShortestPath(game, mark).length;
  const opponentDistance = quoridorShortestPath(game, otherMark(mark)).length;
  return myDistance <= 3 || opponentDistance <= 3 || totalWalls <= 4 ? 3 : 2;
}

function quoridorNegamax(game, playerToMove, aiMark, depth, alpha, beta, cache) {
  if (game.status !== "playing" || depth <= 0) return quoridorEvaluateState(game, aiMark);
  game.current_player = playerToMove;
  const key = quoridorStateKey(game, depth);
  if (cache.has(key)) return cache.get(key);
  const moves = quoridorOrderedCandidates(game, quoridorLegalMoves(game), aiMark);
  let best = -Infinity;
  for (const move of moves) {
    const preview = quoridorPreviewMove(game, move);
    const score = -quoridorNegamax(preview, otherMark(playerToMove), aiMark, depth - 1, -beta, -alpha, cache);
    best = Math.max(best, score);
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }
  cache.set(key, best);
  return best;
}

function quoridorStateKey(game, depth) {
  return JSON.stringify({
    depth,
    current: game.current_player,
    pawns: game.pawns,
    walls: game.walls,
    remaining: game.walls_remaining,
  });
}

function compareQuoridorWalls(left, right) {
  if (left.orientation !== right.orientation) return left.orientation.localeCompare(right.orientation);
  if (left.row !== right.row) return left.row - right.row;
  return left.col - right.col;
}

function legalBoards(game) {
  if (game.status !== "playing") return [];
  if (game.next_board !== null && boardAvailable(game, game.next_board)) return [game.next_board];
  return game.boards.map((_, index) => index).filter((index) => boardAvailable(game, index));
}

function boardAvailable(game, boardIndex) {
  return game.small_winners[boardIndex] === null && game.boards[boardIndex].some((cell) => cell === null);
}

function newBoxesGame() {
  const rows = 8;
  const cols = 5;
  return {
    game_id: BOXES_GAME_ID,
    rows,
    cols,
    lines: [],
    boxes: Array.from({ length: rows }, () => Array.from({ length: cols }, () => null)),
    current_player: "X",
    status: "playing",
    winner: null,
    move_count: 0,
    last_move: null,
    events: [],
    scores: { X: 0, O: 0 },
  };
}

function isBoxesGame(game) {
  return Boolean(game && (cleanGameId(game.game_id) === BOXES_GAME_ID || Array.isArray(game.lines) && Array.isArray(game.boxes)));
}

function boxesGameToDict(game) {
  ensureBoxesState(game);
  return {
    ...game,
    game_id: BOXES_GAME_ID,
    legal_lines: boxesLegalMoves(game).map((move) => move.line_id),
  };
}

function ensureBoxesState(game) {
  game.game_id = BOXES_GAME_ID;
  game.rows = Number.isInteger(game.rows) ? Math.min(8, Math.max(2, game.rows)) : 8;
  game.cols = Number.isInteger(game.cols) ? Math.min(8, Math.max(2, game.cols)) : 5;
  if (!Array.isArray(game.lines)) game.lines = [];
  game.lines = [...new Set(game.lines.map(normalizeBoxesLineId).filter((lineId) => boxesLineInBounds(game, lineId)))].sort(compareBoxesLineIds);
  if (!Array.isArray(game.boxes)) game.boxes = [];
  game.boxes = Array.from({ length: game.rows }, (_, row) => (
    Array.from({ length: game.cols }, (_, col) => {
      const owner = game.boxes[row] && game.boxes[row][col];
      return owner === "X" || owner === "O" ? owner : null;
    })
  ));
  if (!game.scores) game.scores = { X: 0, O: 0 };
  game.scores = boxesScores(game.boxes);
  if (!Array.isArray(game.events)) game.events = [];
  game.events = game.events
    .filter((event) => event && event.type === "lineClaimed" && ["X", "O"].includes(event.player))
    .map((event) => ({
      type: "lineClaimed",
      player: event.player,
      line_id: normalizeBoxesLineId(event.line_id),
      captured: Array.isArray(event.captured) ? event.captured : [],
    }))
    .filter((event) => event.line_id);
  if (game.current_player !== "O") game.current_player = "X";
  if (!["playing", "x_won", "o_won", "draw"].includes(game.status)) game.status = "playing";
  if (!Number.isFinite(Number(game.move_count))) game.move_count = game.lines.length;
}

function boxesLegalMoves(game) {
  if (!game || game.status !== "playing") return [];
  ensureBoxesState(game);
  const claimed = new Set(game.lines);
  return allBoxesLineIds(game.rows, game.cols)
    .filter((lineId) => !claimed.has(lineId))
    .map((lineId) => ({ line_id: lineId }));
}

function makeBoxesMove(game, lineId) {
  ensureBoxesState(game);
  if (game.status !== "playing") throw new Error("Game is already over.");
  const cleanLineId = normalizeBoxesLineId(lineId);
  if (!cleanLineId || !boxesLineInBounds(game, cleanLineId)) throw new Error("Line id is not valid.");
  if (game.lines.includes(cleanLineId)) throw new Error("Line is already claimed.");

  const player = game.current_player;
  game.lines.push(cleanLineId);
  game.lines.sort(compareBoxesLineIds);
  const claimed = new Set(game.lines);
  const captured = [];
  boxesAdjacentBoxes(game, cleanLineId).forEach((box) => {
    if (game.boxes[box.row][box.col]) return;
    if (boxesBoxLineIds(box.row, box.col).every((id) => claimed.has(id))) {
      game.boxes[box.row][box.col] = player;
      captured.push(box);
    }
  });
  game.move_count += 1;
  game.scores = boxesScores(game.boxes);
  game.last_move = { player, line_id: cleanLineId, captured };
  game.events.push({ type: "lineClaimed", player, line_id: cleanLineId, captured });
  game.events = game.events.slice(-80);
  if (game.lines.length >= allBoxesLineIds(game.rows, game.cols).length) {
    if (game.scores.X > game.scores.O) {
      game.status = "x_won";
      game.winner = "X";
    } else if (game.scores.O > game.scores.X) {
      game.status = "o_won";
      game.winner = "O";
    } else {
      game.status = "draw";
      game.winner = null;
    }
    return;
  }
  if (!captured.length) game.current_player = otherMark(player);
}

function chooseBoxesBotMove(game, moves) {
  const capturing = moves
    .map((move) => ({ move, captures: boxesCaptureCountAfterLine(game, move.line_id) }))
    .filter((item) => item.captures > 0)
    .sort((left, right) => right.captures - left.captures || left.move.line_id.localeCompare(right.move.line_id));
  if (capturing.length) return capturing[0].move;
  const safe = moves.filter((move) => !boxesCreatesThreeSidedBox(game, move.line_id));
  const candidates = (safe.length ? safe : moves).slice().sort((left, right) => left.line_id.localeCompare(right.line_id));
  return candidates[0] || null;
}

function boxesCaptureCountAfterLine(game, lineId) {
  ensureBoxesState(game);
  const claimed = new Set(game.lines);
  claimed.add(lineId);
  return boxesAdjacentBoxes(game, lineId)
    .filter((box) => !game.boxes[box.row][box.col])
    .filter((box) => boxesBoxLineIds(box.row, box.col).every((id) => claimed.has(id)))
    .length;
}

function boxesCreatesThreeSidedBox(game, lineId) {
  ensureBoxesState(game);
  const claimed = new Set(game.lines);
  claimed.add(lineId);
  return boxesAdjacentBoxes(game, lineId)
    .filter((box) => !game.boxes[box.row][box.col])
    .some((box) => boxesBoxLineIds(box.row, box.col).filter((id) => claimed.has(id)).length === 3);
}

function boxesScores(boxes) {
  return {
    X: boxes.flat().filter((owner) => owner === "X").length,
    O: boxes.flat().filter((owner) => owner === "O").length,
  };
}

function allBoxesLineIds(rows, cols) {
  const lines = [];
  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col < cols; col += 1) lines.push(boxesLineId("h", row, col));
  }
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col <= cols; col += 1) lines.push(boxesLineId("v", row, col));
  }
  return lines;
}

function boxesLineId(orientation, row, col) {
  return `${orientation === "v" ? "v" : "h"}-${Number(row)}-${Number(col)}`;
}

function normalizeBoxesLineId(lineId) {
  const parts = String(lineId || "").trim().split("-");
  if (parts.length !== 3 || !["h", "v"].includes(parts[0])) return "";
  const row = Number(parts[1]);
  const col = Number(parts[2]);
  if (!Number.isInteger(row) || !Number.isInteger(col)) return "";
  return boxesLineId(parts[0], row, col);
}

function boxesLineInBounds(game, lineId) {
  const line = parseBoxesLineId(lineId);
  if (!line) return false;
  if (line.orientation === "h") return line.row >= 0 && line.row <= game.rows && line.col >= 0 && line.col < game.cols;
  return line.row >= 0 && line.row < game.rows && line.col >= 0 && line.col <= game.cols;
}

function parseBoxesLineId(lineId) {
  const cleanLineId = normalizeBoxesLineId(lineId);
  if (!cleanLineId) return null;
  const [orientation, row, col] = cleanLineId.split("-");
  return { orientation, row: Number(row), col: Number(col), id: cleanLineId };
}

function compareBoxesLineIds(left, right) {
  const a = parseBoxesLineId(left);
  const b = parseBoxesLineId(right);
  if (!a || !b) return String(left).localeCompare(String(right));
  if (a.orientation !== b.orientation) return a.orientation.localeCompare(b.orientation);
  if (a.row !== b.row) return a.row - b.row;
  return a.col - b.col;
}

function boxesAdjacentBoxes(game, lineId) {
  const line = parseBoxesLineId(lineId);
  if (!line) return [];
  const boxes = [];
  if (line.orientation === "h") {
    if (line.row > 0) boxes.push({ row: line.row - 1, col: line.col });
    if (line.row < game.rows) boxes.push({ row: line.row, col: line.col });
  } else {
    if (line.col > 0) boxes.push({ row: line.row, col: line.col - 1 });
    if (line.col < game.cols) boxes.push({ row: line.row, col: line.col });
  }
  return boxes;
}

function boxesBoxLineIds(row, col) {
  return [
    boxesLineId("h", row, col),
    boxesLineId("h", row + 1, col),
    boxesLineId("v", row, col),
    boxesLineId("v", row, col + 1),
  ];
}

function makeMove(game, boardIndex, cellIndex, lineId = "") {
  if (isBoxesGame(game)) return makeBoxesMove(game, lineId);
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
  if (isTenThousandGame(room.game)) {
    const scores = {};
    (room.game.seat_order || []).forEach((mark) => {
      const seat = room.game.players && room.game.players[mark];
      scores[mark] = Number(seat && seat.score || 0);
    });
    return scores;
  }
  if (isBoxesGame(room.game)) {
    return {
      X: Number(room.game.scores && room.game.scores.X || 0),
      O: Number(room.game.scores && room.game.scores.O || 0),
    };
  }
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
  const selectablePlayerIds = new Set(publicPlayers(data).map((player) => player.id));
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

export const __test = {
  tenThousandBotKeep,
  tenThousandBotShouldBank,
  tenThousandBotErrorRate,
  tenThousandBotShouldMisplay,
  tenThousandBotAlternativeKeep,
  bestTenThousandKeep,
  sproutTenThousandKeep,
  overlordKeepPlan,
  tenThousandScoreValues,
  tenThousandHasAnyScoringSet,
};
