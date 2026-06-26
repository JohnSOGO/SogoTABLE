// Game metadata is shared with the browser app from one registry module so the
// two can't drift. esbuild bundles this relative import into the Worker.
import { GAME_REGISTRY, GAME_IDS } from "../src/sogotable/static/games/registry.js";
// Per-game rules modules (Phase 2). The Worker keeps the dispatch predicates and
// routing; each game's server-authoritative rules live in its own module.
import {
  newBoxesGame,
  boxesGameToDict,
  boxesLegalMoves,
  makeBoxesMove,
  chooseBoxesBotMove,
} from "./games/boxes/rules.js";
import { OVERLORD_BOT_ID } from "./games/bots.js";
import {
  BATTLESHIP_FLEET,
  newBattleshipGame,
  ensureBattleshipState,
  battleshipGameToDict,
  makeBattleshipMove,
  placeBattleshipFleet,
  battleshipLegalMoves,
  chooseBattleshipBotFleet,
  chooseBattleshipBotMove,
  battleshipGameToDictForViewer,
} from "./games/battleship/rules.js";
import { clampInteger } from "./games/util.js";
import {
  newTenThousandGame,
  initTenThousandSeats,
  setTenThousandOpeningBase,
  tenThousandGameToDict,
  makeTenThousandMove,
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
} from "./games/ten-thousand/rules.js";

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
const GAME_DEFINITIONS = GAME_REGISTRY;
const DEFAULT_GAME_ID = GAME_IDS.classic;
const TACTICAL_GAME_ID = GAME_IDS.tactical;
const BOXES_GAME_ID = GAME_IDS.boxes;
const BATTLESHIP_GAME_ID = GAME_IDS.battleship;
const QUORIDOR_GAME_ID = GAME_IDS.quoridor;
const TEN_THOUSAND_GAME_ID = GAME_IDS.tenThousand;
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
const OWNER_TOKEN_BYTES = 24;
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
const MUTATION_RATE_LIMIT_RETRY_SECONDS = 60;
const SUPERUSER_RATE_LIMIT_RETRY_SECONDS = 60;

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
      const rateLimited = await rateLimitRequest(request, env, url);
      if (rateLimited) return rateLimited;
      let payload = {};
      if (request.method === "POST") payload = await readJson(request);
      if (request.method === "POST" && roomFactoryPath(url.pathname)) {
        if (!env.ROOM_FACTORY && !directRoomAuthorityAllowed(env)) {
          return json({ ok: false, error: "Room authority unavailable." }, 503, corsHeaders);
        }
      }
      if (request.method === "POST" && roomAuthorityPath(url.pathname)) {
        if (!env.ROOM_OBJECT && !directRoomAuthorityAllowed(env)) {
          return json({ ok: false, error: "Room authority unavailable." }, 503, corsHeaders);
        }
      }
      if (request.method === "POST" && roomFactoryPath(url.pathname) && env.ROOM_FACTORY) {
        const response = await roomFactoryRequest(env, url.pathname, payload);
        return json(responseForViewer(response, viewerPlayerIdForPayload(payload)), response.ok === false ? 400 : 200, corsHeaders);
      }
      if (request.method === "POST" && roomAuthorityPath(url.pathname) && env.ROOM_OBJECT) {
        const response = await roomAuthorityRequest(env, url.pathname, payload);
        return json(responseForViewer(response, viewerPlayerIdForPayload(payload)), response.ok === false ? 400 : 200, corsHeaders);
      }
      const data = await loadState(env);
      const response = await routeRequest(request.method, url, payload, data, {
        superuserPasscode: env.SOGOTABLE_SUPERUSER_PASSCODE,
        superuserPlayerIds: env.SOGOTABLE_SUPERUSER_PLAYER_IDS,
        ownerAuthBypass: env.__SOGOTABLE_TEST_OWNER_BYPASS,
      });
      // Read-only POSTs (passcode/verify, bug-report export) must not rewrite the
      // shared state blob or fan out room/event notifications.
      const readOnlyPost = url.pathname === "/api/superuser/verify" || url.pathname === "/api/bug-reports/list";
      if (request.method !== "GET" && !readOnlyPost) {
        await saveState(env, data);
        await notifyRoomObject(env, response);
        await notifyEventHub(env, data, response);
      }
      return json(responseForViewer(response, viewerPlayerIdForRequest(url, payload)), 200, corsHeaders);
    } catch (error) {
      return json({ ok: false, error: error.message || "Request failed." }, 400, corsHeaders);
    }
  },
};

async function rateLimitRequest(request, env, url) {
  if (request.method === "POST" && (url.pathname === "/api/superuser/verify" || url.pathname === "/api/player/reclaim" || url.pathname === "/api/bug-reports/clear")) {
    const limited = await rateLimitBinding(env.SUPERUSER_RATE_LIMITER, `superuser:${clientRateLimitKey(request)}`);
    if (limited) return rateLimitResponse("Too many superuser attempts. Try again shortly.", SUPERUSER_RATE_LIMIT_RETRY_SECONDS, corsHeadersFor(request));
  }
  if (!mutationRateLimitedMethod(request.method)) return null;
  const limited = await rateLimitBinding(env.API_MUTATION_RATE_LIMITER, `mutation:${clientRateLimitKey(request)}`);
  if (!limited) return null;
  return rateLimitResponse("Too many requests. Try again shortly.", MUTATION_RATE_LIMIT_RETRY_SECONDS, corsHeadersFor(request));
}

function mutationRateLimitedMethod(method) {
  return ["POST", "DELETE"].includes(method);
}

async function rateLimitBinding(binding, key) {
  if (!binding || typeof binding.limit !== "function") return false;
  const outcome = await binding.limit({ key });
  return outcome && outcome.success === false;
}

function clientRateLimitKey(request) {
  const headers = request.headers;
  const value = headers.get("cf-connecting-ip") || headers.get("x-forwarded-for") || headers.get("x-real-ip") || "unknown";
  return String(value).split(",")[0].trim() || "unknown";
}

function rateLimitResponse(message, retryAfterSeconds, corsHeaders) {
  return json({ ok: false, error: message }, 429, {
    ...corsHeaders,
    "Retry-After": String(retryAfterSeconds),
  });
}

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
    setSocketAttachment(server, {
      type: "room",
      player_id: String(url.searchParams.get("player_id") || "").trim(),
      connected_at: Date.now(),
    });
    this.sessions.add(server);
    if (!hibernating) {
      server.addEventListener("close", () => this.webSocketClose(server));
      server.addEventListener("error", (event) => this.webSocketError(server, event.error));
    }
    const snapshot = await this.state.storage.get("room");
    if (snapshot) safeSend(server, this.roomMessageForSession(server, snapshot));
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
    this.broadcastRoomSnapshot(room);
  }

  async storeRoomClosed(code) {
    await this.state.storage.delete("room");
    this.broadcast({ type: "room_closed", code });
  }

  async handleRoomAction(pathname, payload) {
    try {
      const response = await withStateRetry(async () => {
        const data = await loadState(this.env);
        const result = await routeRequest("POST", new URL(`https://room.object${pathname}`), payload, data, {
          autoBotMoves: false,
          superuserPasscode: this.env.SOGOTABLE_SUPERUSER_PASSCODE,
          superuserPlayerIds: this.env.SOGOTABLE_SUPERUSER_PLAYER_IDS,
          ownerAuthBypass: this.env.__SOGOTABLE_TEST_OWNER_BYPASS,
        });
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

  broadcastRoomSnapshot(room) {
    for (const session of durableWebSockets(this.state, this.sessions)) safeSend(session, this.roomMessageForSession(session, room));
  }

  roomMessageForSession(session, room) {
    const attachment = socketAttachment(session);
    return {
      type: "room_snapshot",
      room: roomToDictForViewer(null, room, attachment.player_id || ""),
    };
  }
}

export class RoomFactoryDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/__room_create") return json({ ok: false, error: "Unhandled room factory request." }, 404);
    const { pathname, payload } = await request.json();
    if (pathname !== "/api/room/create") return json({ ok: false, error: "Unhandled room factory action." }, 404);
    try {
      const response = await withStateRetry(async () => {
        const data = await loadState(this.env);
        const result = await routeRequest("POST", new URL(`https://room.factory${pathname}`), payload || {}, data, {
          autoBotMoves: false,
          superuserPasscode: this.env.SOGOTABLE_SUPERUSER_PASSCODE,
          superuserPlayerIds: this.env.SOGOTABLE_SUPERUSER_PLAYER_IDS,
          ownerAuthBypass: this.env.__SOGOTABLE_TEST_OWNER_BYPASS,
        });
        await saveState(this.env, data);
        await notifyRoomObject(this.env, result);
        await notifyEventHub(this.env, data, result);
        return result;
      });
      return json(response);
    } catch (error) {
      return json({ ok: false, error: error.message || "Room factory action failed." }, 400);
    }
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
  const superuserPasscode = options.superuserPasscode;
  const superuserPlayerIds = options.superuserPlayerIds;
  if (method === "GET" && url.pathname === "/api/games") return { ok: true, games: GAME_DEFINITIONS.map(publicGameDefinition) };
  if (method === "GET" && url.pathname === "/api/players") return { ok: true, players: publicPlayers(data) };
  if (method === "POST" && url.pathname === "/api/superuser/verify") {
    const requesterId = String(payload.requester_id || "").trim();
    assertSogoSuperuser(data, requesterId, payload.passcode, superuserPasscode, superuserPlayerIds);
    return { ok: true, superuser: true };
  }
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
      await assertPlayerOwner(data, playerId, payload.owner_token, options);
      clearPlayerStats(data, playerId);
      return { ok: true, player_id: playerId, stats: publicPlayerStats(data, playerId), game_ids: GAME_DEFINITIONS.map((game) => game.id) };
  }
  if (method === "GET" && url.pathname === "/api/stats") {
    const gameId = cleanGameId(url.searchParams.get("game_id") || DEFAULT_GAME_ID);
    return { ok: true, game_id: gameId, stats: publicStatsForGame(data, gameId) };
  }
    if (method === "POST" && url.pathname === "/api/players/create") {
      const player = playerFromPayload(payload);
      const existing = data.players.find((item) => item.id === player.id);
      let ownerToken = "";
      if (existing) {
        await assertPlayerOwner(data, player.id, payload.owner_token, options);
        player.owner_token_hash = existing.owner_token_hash;
      } else {
        ownerToken = generateOwnerToken();
        player.owner_token_hash = await ownerTokenHash(ownerToken);
      }
      upsertPlayer(data, player);
      const rooms = refreshActiveRoomPlayer(data, publicPlayer(player)).map((room) => roomToDict(data, room));
      refreshPlayerStats(data, player);
      const response = { ok: true, player: publicPlayer(player), players: publicPlayers(data), rooms };
      if (ownerToken) response.owner_token = ownerToken;
      return response;
    }
    if (method === "POST" && url.pathname === "/api/player/claim") {
      const playerId = String(payload.player_id || payload.id || "").trim();
      const player = data.players.find((item) => item.id === playerId);
      if (!player) throw new Error("Player not found.");
      if (player.owner_token_hash) throw new Error("Player is already claimed.");
      const ownerToken = generateOwnerToken();
      player.owner_token_hash = await ownerTokenHash(ownerToken);
      return { ok: true, player: publicPlayer(player), owner_token: ownerToken };
    }
    if (method === "POST" && url.pathname === "/api/player/unclaim") {
      const requesterId = String(payload.requester_id || "").trim();
      // Passcode-authenticated admin action. Unlike most owner actions this does
      // NOT call assertPlayerOwner: its whole purpose is to recover a player when
      // the claiming device has lost its stored owner token, so requiring that
      // token would defeat it. The Sogo superuser passcode is the gate.
      assertSogoSuperuser(data, requesterId, payload.passcode, superuserPasscode, superuserPlayerIds);
      const targetId = String(payload.player_id || payload.id || "").trim();
      const target = data.players.find((item) => item.id === targetId);
      if (!target) throw new Error("Player not found.");
      delete target.owner_token_hash;
      return { ok: true, player: publicPlayer(target), players: publicPlayers(data) };
    }
    if (method === "POST" && url.pathname === "/api/player/reclaim") {
      // Passcode-gated takeover: lets a second device act as a player that was
      // already claimed elsewhere, by proving knowledge of the shared Sogo
      // passcode. Unlike /claim it accepts an already-claimed player, and unlike
      // /unclaim it does NOT require the caller to be the superuser — the whole
      // point is for any family device that knows the passcode to recover a
      // player whose owner token it never held. Issues a fresh owner token,
      // which invalidates the previous device's token for that player.
      if (!String(superuserPasscode || "").trim() || String(payload.passcode || "") !== String(superuserPasscode)) {
        throw new Error("Sogo passcode is incorrect.");
      }
      const playerId = String(payload.player_id || payload.id || "").trim();
      const player = data.players.find((item) => item.id === playerId);
      if (!player) throw new Error("Player not found.");
      const ownerToken = generateOwnerToken();
      player.owner_token_hash = await ownerTokenHash(ownerToken);
      return { ok: true, player: publicPlayer(player), owner_token: ownerToken };
    }
    if (method === "POST" && url.pathname === "/api/bug-report") {
      const description = String(payload.description || "").trim();
      if (!description) throw new Error("Bug description is required.");
      if (!Array.isArray(data.bug_reports)) data.bug_reports = [];
      const report = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        created_at: Date.now(),
        player_id: String(payload.player_id || ""),
        player_name: String(payload.player_name || "").slice(0, 120),
        screen: String(payload.screen || "").slice(0, 120),
        game: String(payload.game || "").slice(0, 120),
        game_id: String(payload.game_id || "").slice(0, 60),
        room_code: String(payload.room_code || "").slice(0, 12),
        user_agent: String(payload.user_agent || "").slice(0, 400),
        description: description.slice(0, 4000),
      };
      data.bug_reports.push(report);
      data.bug_reports = data.bug_reports.slice(-500);
      return { ok: true, id: report.id };
    }
    if (method === "POST" && url.pathname === "/api/bug-reports/list") {
      // Admin export, gated by the Sogo passcode alone (no player context — this
      // is called by the local export script, not a seated player).
      if (!String(superuserPasscode || "").trim() || String(payload.passcode || "") !== String(superuserPasscode)) {
        throw new Error("Sogo passcode is incorrect.");
      }
      return { ok: true, reports: Array.isArray(data.bug_reports) ? data.bug_reports : [] };
    }
    if (method === "POST" && url.pathname === "/api/bug-reports/clear") {
      // Admin housekeeping: empty the bug-report store once a batch is handled.
      // Gated by the Sogo passcode alone, like the export. Mutating (persists).
      if (!String(superuserPasscode || "").trim() || String(payload.passcode || "") !== String(superuserPasscode)) {
        throw new Error("Sogo passcode is incorrect.");
      }
      const cleared = Array.isArray(data.bug_reports) ? data.bug_reports.length : 0;
      data.bug_reports = [];
      return { ok: true, cleared };
    }
    if ((method === "POST" && url.pathname === "/api/players/delete") || (method === "DELETE" && url.pathname === "/api/players")) {
      const playerId = String(payload.id || url.searchParams.get("id") || "").trim();
      if (!playerId) throw new Error("Player id is required.");
      await assertPlayerOwner(data, playerId, payload.owner_token, options);
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
      await assertPlayerOwner(data, player.id, payload.owner_token, options);
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
      const player = playerFromPayload(payload);
      await assertPlayerOwner(data, player.id, payload.owner_token, options);
      if (payload.local) room.local_mode = true;
      addPlayerToRoom(room, player);
      activateRoomIfReady(room);
      bumpRoomRevision(room);
      if (autoBotMoves) runBotTurns(data, room);
      return { ok: true, room: roomToDict(data, room) };
    }
    if (method === "POST" && url.pathname === "/api/room/join-bot") {
      const room = roomFromPayload(data, payload);
      const hostId = String(payload.host_id || "").trim();
      await assertPlayerOwner(data, hostId, payload.owner_token, options);
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
      await assertPlayerOwner(data, hostId, payload.owner_token, options);
      if (hostId !== room.host_id) throw new Error("Only the host can start the game.");
      if (room.started) throw new Error("Game already started.");
      if (!room.players.length) throw new Error("Add at least one player.");
      // 10,000 host option: the opening "get on the board" bar, chosen in the
      // lobby. Clamp defensively; normalize re-derives the round-aware minimum.
      if (isTenThousandGame(room.game) && payload.opening_minimum !== undefined && payload.opening_minimum !== null) {
        setTenThousandOpeningBase(room.game, payload.opening_minimum);
      }
      startRoom(room);
      bumpRoomRevision(room);
      return { ok: true, room: roomToDict(data, room) };
    }
    if (method === "POST" && url.pathname === "/api/room/leave") {
      const code = cleanRoomCode(payload.code || "");
      const requesterId = String(payload.requester_id || payload.player_id || "").trim();
      if (requesterId) await assertPlayerOwner(data, requesterId, payload.owner_token, options);
      const room = data.rooms[code];
      if (room) delete data.rooms[code];
      return { ok: true, closed: true, room_code: code };
    }
    if (method === "POST" && url.pathname === "/api/room/close") {
      const code = cleanRoomCode(payload.code || "");
      const requesterId = String(payload.requester_id || "").trim();
      await assertPlayerOwner(data, requesterId, payload.owner_token, options);
      assertSogoSuperuser(data, requesterId, payload.passcode, superuserPasscode, superuserPlayerIds);
      const room = data.rooms[code];
      if (room) delete data.rooms[code];
      return { ok: true, closed: true, room_code: code, superuser: true };
    }
    if (method === "POST" && url.pathname === "/api/room/move") {
      const room = roomFromPayload(data, payload);
      if (!room.started) throw new Error("Room is waiting for another player.");
      const playerId = String(payload.player_id || "");
      await assertPlayerOwner(data, playerId, payload.owner_token, options);
      const mark = playerMark(room, playerId);
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
      await assertPlayerOwner(data, requesterId, payload.owner_token, options);
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
      await assertPlayerOwner(data, hostId, payload.owner_token, options);
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
      await assertPlayerOwner(data, player.id, payload.owner_token, options);
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
    if (method === "POST" && url.pathname === "/api/invite/cancel") {
      const requesterId = String(payload.requester_id || "").trim();
      // Passcode-authenticated admin cleanup: deletes pending invites so a target
      // stuck on an invite popup (e.g. one it can't respond to) is freed without
      // needing that target's owner token.
      assertSogoSuperuser(data, requesterId, payload.passcode, superuserPasscode, superuserPlayerIds);
      const targetId = String(payload.target_id || payload.player_id || "").trim();
      const hostId = String(payload.host_id || "").trim();
      const removed = [];
      Object.keys(data.invites).forEach((id) => {
        const invite = data.invites[id];
        if (targetId && invite.target_id !== targetId) return;
        if (hostId && invite.host_id !== hostId) return;
        removed.push(id);
        delete data.invites[id];
      });
      return { ok: true, removed };
    }
  throw new Error("Unknown endpoint.");
}

function roomSocket(request, env, url) {
  if (!env.ROOM_OBJECT) return json({ ok: false, error: "Room live updates are not configured." }, 503);
  const code = cleanRoomCode(url.searchParams.get("code") || "");
  return env.ROOM_OBJECT.getByName(code).fetch(request);
}

function directRoomAuthorityAllowed(env) {
  return Boolean(env && env.__SOGOTABLE_TEST_DIRECT_ROOM_AUTHORITY);
}

function roomAuthorityPath(pathname) {
  return [
    "/api/room/join-bot",
    "/api/room/join",
    "/api/room/leave",
    "/api/room/close",
    "/api/room/move",
    "/api/room/reset",
    "/api/invite/create",
    "/api/invite/respond",
  ].includes(pathname);
}

function roomFactoryPath(pathname) {
  return pathname === "/api/room/create";
}

async function roomFactoryRequest(env, pathname, payload) {
  const response = await env.ROOM_FACTORY.getByName("room-factory").fetch(new Request("https://room.factory/__room_create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pathname, payload }),
  }));
  return response.json();
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
  return (data.players || []).filter((player) => !isHiddenPlayer(player)).map(publicPlayer);
}

function publicPlayer(player) {
  if (!player) return player;
  const { owner_token_hash, ...clean } = player;
  return { ...clean, claimed: Boolean(owner_token_hash) };
}

async function assertPlayerOwner(data, playerId, ownerToken, options = {}) {
  const id = String(playerId || "").trim();
  if (options.ownerAuthBypass || RESERVED_TEST_PLAYER_IDS.has(id)) return;
  if (!id) throw new Error("Player id is required.");
  const player = (data.players || []).find((item) => item.id === id);
  if (!player) throw new Error("Player not found.");
  if (!player.owner_token_hash) throw new Error("Player must be claimed before this action.");
  const token = String(ownerToken || "").trim();
  if (!token) throw new Error("Player owner token is required.");
  const hash = await ownerTokenHash(token);
  if (hash !== player.owner_token_hash) throw new Error("Player owner token is incorrect.");
}

function assertSogoSuperuser(data, playerId, passcode, configuredPasscode, configuredPlayerIds) {
  if (!isSogoSuperuser(data, playerId, configuredPlayerIds)) throw new Error("Only the configured Sogo superuser can do this.");
  if (!String(configuredPasscode || "").trim()) throw new Error("Sogo superuser passcode is not configured.");
  if (String(passcode || "") !== String(configuredPasscode)) throw new Error("Sogo passcode is incorrect.");
}

function isSogoSuperuser(data, playerId, configuredPlayerIds) {
  const id = String(playerId || "").trim();
  if (!id) return false;
  const allowed = configuredSogoSuperuserIds(configuredPlayerIds);
  if (!allowed.size) return false;
  if (!allowed.has(id)) return false;
  return Boolean((data.players || []).find((item) => item.id === id));
}

function configuredSogoSuperuserIds(value) {
  return new Set(String(value || "").split(",").map((item) => item.trim()).filter(Boolean));
}

function generateOwnerToken() {
  const bytes = new Uint8Array(OWNER_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function ownerTokenHash(token) {
  const bytes = new TextEncoder().encode(String(token || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

function roomToDictForViewer(data, room, viewerPlayerId = "") {
  const base = room && room.status && room.game_id ? structuredClone(room) : roomToDict(data, room);
  const viewerId = String(viewerPlayerId || "").trim();
  const viewerSeat = base.players.find((player) => player.id === viewerId);
  base.game = gameToDictForViewer(base.game, viewerSeat ? viewerSeat.mark : "", base.status);
  return base;
}

function gameToDictForViewer(game, viewerMark, roomStatusValue) {
  if (!isBattleshipGame(game)) return game;
  return battleshipGameToDictForViewer(game, viewerMark, roomStatusValue);
}

function responseForViewer(response, viewerPlayerId = "") {
  if (!response || response.ok === false) return response;
  const projected = { ...response };
  if (projected.room) projected.room = roomToDictForViewer(null, projected.room, viewerPlayerId);
  if (projected.active_room) projected.active_room = roomToDictForViewer(null, projected.active_room, viewerPlayerId);
  if (Array.isArray(projected.rooms)) {
    projected.rooms = projected.rooms.map((room) => room && room.game ? roomToDictForViewer(null, room, viewerPlayerId) : room);
  }
  return projected;
}

function viewerPlayerIdForRequest(url, payload = {}) {
  return String(url.searchParams.get("player_id") || viewerPlayerIdForPayload(payload) || "").trim();
}

function viewerPlayerIdForPayload(payload = {}) {
  return String(
    payload.player_id ||
    payload.requester_id ||
    payload.host_id ||
    payload.player && payload.player.id ||
    payload.id ||
    "",
  ).trim();
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
  // Carry the host's 10,000 opening-bar choice into the fresh game so a reset
  // keeps the table's chosen rules instead of snapping back to the default.
  const prevOpeningBase = isTenThousandGame(room.game) ? room.game.opening_base : undefined;
  room.game = newGame(room.game_id);
  // Host-start games seed per-seat state at startRoom; a reset must re-seed it
  // too, otherwise the room stays started with an empty game (e.g. Ten Thousand
  // ends up with no seats and a dead board).
  if (room.started && isTenThousandGame(room.game)) {
    if (prevOpeningBase !== undefined) room.game.opening_base = prevOpeningBase;
    initTenThousandSeats(room.game, room.players);
  }
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

function isTenThousandGame(game) {
  return Boolean(game && cleanGameId(game.game_id) === TEN_THOUSAND_GAME_ID);
}

function isBattleshipGame(game) {
  return Boolean(game && (cleanGameId(game.game_id) === BATTLESHIP_GAME_ID || game.phase === "setup" && game.players && game.fleet));
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

function isBoxesGame(game) {
  return Boolean(game && (cleanGameId(game.game_id) === BOXES_GAME_ID || Array.isArray(game.lines) && Array.isArray(game.boxes)));
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
  allowDirectRoomAuthority(env) {
    env.__SOGOTABLE_TEST_DIRECT_ROOM_AUTHORITY = true;
    return env;
  },
  allowOwnerAuthBypass(env) {
    env.__SOGOTABLE_TEST_OWNER_BYPASS = true;
    return env;
  },
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
