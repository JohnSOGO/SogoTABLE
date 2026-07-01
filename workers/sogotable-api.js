// Game metadata is shared with the browser app from one registry module so the
// two can't drift. esbuild bundles this relative import into the Worker.
import { GAME_IDS } from "../src/sogotable/static/games/registry.js";
// Platform + persistence helpers (extracted so the Worker entry owns routing, not
// HTTP/CORS/rate-limit/storage plumbing).
import { json, readJson, corsHeadersFor } from "./platform/http.js";
import { rateLimitRequest } from "./platform/rate-limit.js";
import {
  assertPlayerOwner, assertSogoSuperuser, isSogoSuperuser,
  configuredSogoSuperuserIds, generateOwnerToken, ownerTokenHash,
} from "./platform/auth.js";
import { reservedTestPlayerFromId } from "./test-players.js";
import {
  isHiddenPlayer, publicPlayers, publicPlayer, isHiddenTestRoom, publicBot, botDifficultyLevel,
} from "./projections.js";
import {
  GAME_DEFINITIONS, DEFAULT_GAME_ID, cleanGameId, publicGameDefinition, gameIdsForLookup,
  gameIdMatches, playerCountForGame, isSoloGameId, gameUsesHostStart,
} from "./game-catalog.js";
import { loadState, saveState, withStateRetry } from "./persistence/state.js";
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
  isTenThousandGame,
} from "./games/ten-thousand/rules.js";
import {
  newYahtzeeGame,
  initYahtzeeSeats,
  makeYahtzeeMove,
  yahtzeeGameToDict,
  yahtzeeScoreByMark,
  isYahtzeeGame,
} from "./games/yahtzee/rules.js";
import {
  newQuoridorGame,
  quoridorGameToDict,
  makeQuoridorMove,
  quoridorLegalMoves,
  chooseQuoridorBotMove,
} from "./games/quoridor/rules.js";
import {
  TACTICAL_PICKUP_CONFIG,
  legalBoards,
  boardAvailable,
  makeClassicMove,
  makeTacticalMove,
  smallBoardResult,
  macroWinnerFor,
  ensureTacticalState,
  pickupAt,
  tacticalBoardFilledWinner,
  tacticalLineWinner,
} from "./games/super-tic-tac-toe/rules.js";
import { chooseScoredBotMove } from "./games/super-tic-tac-toe/bot.js";
import {
  MAZEWRIGHT_GAME_ID,
  isMazewrightGame,
  newMazewrightGame,
  initMazewrightSeats,
  makeMazewrightMove,
  mazewrightGameToDict,
  mazewrightScoreByMark,
} from "./games/mazewright/rules.js";

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
const TACTICAL_GAME_ID = GAME_IDS.tactical;
const BOXES_GAME_ID = GAME_IDS.boxes;
const BATTLESHIP_GAME_ID = GAME_IDS.battleship;
const QUORIDOR_GAME_ID = GAME_IDS.quoridor;
const TEN_THOUSAND_GAME_ID = GAME_IDS.tenThousand;
const YAHTZEE_GAME_ID = GAME_IDS.yahtzee;
const BOT_MOVE_DELAY_MS = 700;
const BOT_DEFINITIONS = [
  { id: "7c91a4e2b6d0", name: "Sprout", icon: "\uD83C\uDF31", color: "#16a34a", rating: 900, strategy: "random", difficulty: "novice", difficulty_label: "Novice" },
  { id: "5e2c8a71d0f4", name: "Buddy", icon: "\uD83E\uDD1D", color: "#2563eb", rating: 980, strategy: "random", difficulty: "casual", difficulty_label: "Casual" },
  { id: "b64d20f19a8c", name: "Cipher", icon: "\uD83D\uDD11", color: "#7c3aed", rating: 1100, strategy: "smart", difficulty: "strategist", difficulty_label: "Strategist" },
  { id: "0f8a3c9d1e72", name: "Overlord", icon: "\uD83D\uDC51", color: "#dc2626", rating: 1250, strategy: "smart", difficulty: "master", difficulty_label: "Master" },
];
const DEFAULT_ELO_RATING = 1000;
const ELO_K_FACTOR = 32;

// Per-route side effects, declared not inferred. GET is read-only; any other
// method defaults to a full mutation (save + notify rooms + notify app hub). A
// read-only or partial-profile route declares itself in ROUTE_SIDE_EFFECTS.
const MUTATING = { mutates: true, notifyRooms: true, notifyApp: true };
const READ_ONLY = { mutates: false, notifyRooms: false, notifyApp: false };
const ROUTE_SIDE_EFFECTS = new Map([
  ["POST /api/superuser/verify", READ_ONLY],
  ["POST /api/bug-reports/list", READ_ONLY],
]);
function sideEffectsFor(method, pathname) {
  if (method === "GET") return READ_ONLY;
  return ROUTE_SIDE_EFFECTS.get(`${method} ${pathname}`) || MUTATING;
}

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
          return json({ ok: false, error: "Table authority unavailable." }, 503, corsHeaders);
        }
      }
      if (request.method === "POST" && roomAuthorityPath(url.pathname)) {
        if (!env.ROOM_OBJECT && !directRoomAuthorityAllowed(env)) {
          return json({ ok: false, error: "Table authority unavailable." }, 503, corsHeaders);
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
      // Apply only the side effects this route declares (see ROUTE_SIDE_EFFECTS).
      const effects = sideEffectsFor(request.method, url.pathname);
      if (effects.mutates) await saveState(env, data);
      if (effects.notifyRooms) await notifyRoomObject(env, response);
      if (effects.notifyApp) await notifyEventHub(env, data, response);
      return json(responseForViewer(response, viewerPlayerIdForRequest(url, payload)), 200, corsHeaders);
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
      return json({ ok: false, error: error.message || "Table action failed." }, 400);
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
    if (request.method !== "POST" || url.pathname !== "/__room_create") return json({ ok: false, error: "Unhandled table factory request." }, 404);
    const { pathname, payload } = await request.json();
    if (pathname !== "/api/room/create") return json({ ok: false, error: "Unhandled table factory action." }, 404);
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
      return json({ ok: false, error: error.message || "Table factory action failed." }, 400);
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
        if (!player.house_id && existing.house_id) { player.house_id = existing.house_id; player.house_name = existing.house_name; }
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
      // Takeover: lets a device act as a player already claimed elsewhere (or whose
      // token this device lost), issuing a fresh owner token that invalidates the
      // previous one. Only the Sogo ADMIN account is passcode-protected; any other
      // player can be moved to a device freely (the family trusts each other), so a
      // device that confirms the move re-binds with no passcode.
      const playerId = String(payload.player_id || payload.id || "").trim();
      const player = data.players.find((item) => item.id === playerId);
      if (!player) throw new Error("Player not found.");
      if (isSogoSuperuser(data, playerId, superuserPlayerIds)) {
        if (!String(superuserPasscode || "").trim() || String(payload.passcode || "") !== String(superuserPasscode)) {
          throw new Error("Sogo passcode is incorrect.");
        }
      }
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
      if (playerHasUnfinishedRoom(data, playerId)) throw new Error("Player is seated at an unfinished table.");
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
      if (!room) return { ok: false, error: "Table not found." };
      return { ok: true, room: roomToDict(data, room) };
    }
    if (method === "POST" && url.pathname === "/api/room/create") {
      const gameId = cleanGameId(payload.game_id);
      const player = playerFromPayload(payload);
      await assertPlayerOwner(data, player.id, payload.owner_token, options);
      const existing = activeRoomForPlayer(data, player.id, gameId);
      if (existing) return { ok: true, room: roomToDict(data, existing), existing: true };
      const code = payload.code ? cleanRoomCode(payload.code) : newRoomCode(data);
      if (data.rooms[code]) throw new Error("Table code is already in use.");
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
      if (roomStatus(room) !== "waiting_for_player") throw new Error("Bot can only join a waiting table.");
      const playerCount = playerCountForGame(room.game_id);
      if (Number.isFinite(playerCount) && room.players.length >= playerCount) throw new Error("Table is full.");
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
      if (!room.started) throw new Error("Table is waiting for another player.");
      const playerId = String(payload.player_id || "");
      await assertPlayerOwner(data, playerId, payload.owner_token, options);
      const mark = playerMark(room, playerId);
      if (!mark) throw new Error("Player is not at this table.");
      const moveHandler = GAME_HANDLERS.find((entry) => entry.applyAction && entry.is(room.game));
      if (moveHandler) {
        if (moveHandler.preMove) moveHandler.preMove(room);
        if (moveHandler.enforcesTurnOrder && mark !== room.game.current_player) throw new Error(`It is ${room.game.current_player}'s turn.`);
        moveHandler.applyAction(room.game, mark, payload);
        bumpRoomRevision(room);
        recordCompletedRoomStats(data, room);
        if (!moveHandler.resolvesBotsInternally && autoBotMoves) runBotTurns(data, room);
        return { ok: true, room: roomToDict(data, room) };
      }
      // Super Tic Tac Toe / Tactical — the default macro-board family.
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
      if (Number.isFinite(playerCount) && room.players.length >= playerCount) throw new Error("Table is full.");
      const target = playerFromPayload(payload.player || {});
      if (target.id === hostId) throw new Error("Host is already at the table.");
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
        throw new Error("Table not found.");
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
  if (!env.ROOM_OBJECT) return json({ ok: false, error: "Table live updates are not configured." }, 503);
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
      session.close(1011, "Unable to send table update.");
    } catch {
      // The connection is already gone.
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  // House (clan) membership rides on the player object. Carried only when present
  // so a plain profile edit can't blank it (the create route restores it too).
  if (player.house_id) {
    clean.house_id = String(player.house_id).trim().slice(0, 80);
    clean.house_name = String(player.house_name || "").trim().slice(0, 24);
  }
  if (!clean.id || !clean.name) throw new Error("Player id and name are required.");
  return clean;
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
  if (!/^[A-Z0-9]{4}$/.test(value)) throw new Error("Table code must be 4 letters or numbers.");
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
  if (!room) throw new Error("Table not found.");
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
  if (Number.isFinite(playerCount) && room.players.length >= playerCount) throw new Error(playerCount === 2 ? "Table already has two players." : "Table is full.");
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
  if (isYahtzeeGame(room.game)) initYahtzeeSeats(room.game, room.players);
  if (isMazewrightGame(room.game)) initMazewrightSeats(room.game, room.players);
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
    const moveHandler = GAME_HANDLERS.find((entry) => entry.applyAction && entry.is(room.game));
    if (moveHandler) moveHandler.applyAction(room.game, bot.mark, move);
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
  const handler = GAME_HANDLERS.find((entry) => entry.bot && entry.is(game));
  if (handler) return handler.bot(game, bot, moves);
  if (bot && bot.strategy === "smart") return chooseScoredBotMove(game, bot, moves);
  return moves[Math.floor(Math.random() * moves.length)];
}


function legalMoves(game) {
  const handler = GAME_HANDLERS.find((entry) => entry.is(game));
  if (handler) return handler.legalMoves(game);
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
  if (room.started && isYahtzeeGame(room.game)) initYahtzeeSeats(room.game, room.players);
  if (room.started && isMazewrightGame(room.game)) initMazewrightSeats(room.game, room.players);
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

// Per-game dispatch table. Now that every game's rules live in a module, the
// newGame/gameToDict/legalMoves/chooseBotMove dispatchers route through this one
// table instead of parallel if/else chains — adding a game is one row here (plus
// its rules module and `is<Game>Game` predicate). Super-Tic-Tac-Toe and Tactical
// are the inline default fallthrough (they share board creation and the macro
// `legal_boards` projection), so they have no row. `bot` is absent where a game
// resolves bots through its own engine (10,000) or has no entry.
// applyAction(game, mark, payload) normalises the heterogeneous per-game move
// signatures so /api/room/move and bot turns dispatch through this table too.
// Flags capture each game's real differences: enforcesTurnOrder (shell rejects
// out-of-turn moves vs rules validating internally), preMove (setup before the
// move, e.g. lazy bot fleets), resolvesBotsInternally (game runs its own bot
// turns, so the shell skips runBotTurns). Classic/Tactical stay the default.
const GAME_HANDLERS = [
  { id: TEN_THOUSAND_GAME_ID, is: isTenThousandGame, create: newTenThousandGame, toDict: tenThousandGameToDict, legalMoves: () => [],
    applyAction: (game, mark, payload) => makeTenThousandMove(game, mark, payload.action || payload), resolvesBotsInternally: true },
  { id: YAHTZEE_GAME_ID, is: isYahtzeeGame, create: newYahtzeeGame, toDict: yahtzeeGameToDict, legalMoves: () => [],
    applyAction: (game, mark, payload) => makeYahtzeeMove(game, mark, payload.action || payload), resolvesBotsInternally: true },
  { id: MAZEWRIGHT_GAME_ID, is: isMazewrightGame, create: newMazewrightGame, toDict: mazewrightGameToDict, legalMoves: () => [],
    applyAction: (game, mark, payload) => makeMazewrightMove(game, mark, payload.action || payload), resolvesBotsInternally: true },
  { id: BATTLESHIP_GAME_ID, is: isBattleshipGame, create: newBattleshipGame, toDict: battleshipGameToDict, legalMoves: battleshipLegalMoves, bot: (game, bot, moves) => chooseBattleshipBotMove(game, bot, moves),
    applyAction: (game, mark, payload) => makeBattleshipMove(game, mark, payload.action || payload), preMove: (room) => ensureBattleshipBotFleets(room) },
  { id: QUORIDOR_GAME_ID, is: isQuoridorGame, create: newQuoridorGame, toDict: quoridorGameToDict, legalMoves: quoridorLegalMoves, bot: (game, bot, moves) => chooseQuoridorBotMove(game, bot, moves),
    applyAction: (game, mark, payload) => makeQuoridorMove(game, mark, payload.action || payload) },
  { id: BOXES_GAME_ID, is: isBoxesGame, create: newBoxesGame, toDict: boxesGameToDict, legalMoves: boxesLegalMoves, bot: (game, bot, moves) => chooseBoxesBotMove(game, moves),
    applyAction: (game, mark, payload) => makeBoxesMove(game, payload.line_id), enforcesTurnOrder: true },
];

function newGame(gameId = DEFAULT_GAME_ID) {
  const canonicalGameId = cleanGameId(gameId);
  const handler = GAME_HANDLERS.find((entry) => entry.id === canonicalGameId);
  if (handler) return handler.create();
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
  const handler = GAME_HANDLERS.find((entry) => entry.is(game));
  if (handler) return handler.toDict(game);
  return { ...game, game_id: cleanGameId(game.game_id), legal_boards: legalBoards(game) };
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

function isQuoridorGame(game) {
  return Boolean(game && (cleanGameId(game.game_id) === QUORIDOR_GAME_ID || game.pawns && game.walls_remaining && Array.isArray(game.walls)));
}

function isBoxesGame(game) {
  return Boolean(game && (cleanGameId(game.game_id) === BOXES_GAME_ID || Array.isArray(game.lines) && Array.isArray(game.boxes)));
}

function makeMove(game, boardIndex, cellIndex, lineId = "") {
  if (isBoxesGame(game)) return makeBoxesMove(game, lineId);
  if (isTacticalGame(game)) return makeTacticalMove(game, boardIndex, cellIndex);
  return makeClassicMove(game, boardIndex, cellIndex);
}

function isTacticalGame(game) {
  return game && (cleanGameId(game.game_id) === TACTICAL_GAME_ID || Array.isArray(game.pickups));
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
  if (isYahtzeeGame(room.game)) {
    return yahtzeeScoreByMark(room.game);
  }
  if (isMazewrightGame(room.game)) {
    return mazewrightScoreByMark(room.game);
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
  sideEffectsFor,
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
