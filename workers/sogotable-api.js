const LOBBY_VIEWER_TTL_SECONDS = 10;
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const STATE_KEY = "super_tic_tac_toe";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return json({ ok: false, error: "Unknown endpoint." }, 404);
    try {
      const data = await loadState(env);
      const payload = request.method === "POST" ? await readJson(request) : {};
      const response = await routeRequest(request.method, url, payload, data);
      await saveState(env, data);
      return json(response);
    } catch (error) {
      return json({ ok: false, error: error.message || "Request failed." }, 400);
    }
  },
};

async function routeRequest(method, url, payload, data) {
  if (method === "GET" && url.pathname === "/api/players") return { ok: true, players: data.players };
    if (method === "POST" && url.pathname === "/api/players/create") {
      const player = playerFromPayload(payload);
      upsertPlayer(data, player);
      refreshActiveRoomPlayer(data, player);
      return { ok: true, player, players: data.players };
    }
    if ((method === "POST" && url.pathname === "/api/players/delete") || (method === "DELETE" && url.pathname === "/api/players")) {
      const playerId = String(payload.id || url.searchParams.get("id") || "").trim();
      if (!playerId) throw new Error("Player id is required.");
      data.players = data.players.filter((player) => player.id !== playerId);
      return { ok: true, players: data.players };
    }
    if (method === "GET" && url.pathname === "/api/lobby") {
      return { ok: true, players: lobbyViewers(data, url.searchParams.get("game_id") || "") };
    }
    if (method === "POST" && url.pathname === "/api/lobby/presence") {
      const gameId = cleanGameId(payload.game_id);
      const player = playerFromPayload(payload);
      data.lobbyViewers[player.id] = { game_id: gameId, player, updated_at: Date.now() };
      return { ok: true, players: lobbyViewers(data, gameId) };
    }
    if (method === "GET" && url.pathname === "/api/rooms") {
      const playerId = url.searchParams.get("player_id") || "";
      const gameId = cleanGameId(url.searchParams.get("game_id") || "super_tic_tac_toe");
      if (playerId && gameId) {
        const activeRoom = activeRoomForPlayer(data, playerId, gameId);
        return { ok: true, active_room: activeRoom ? roomToDict(data, activeRoom) : null };
      }
      const rooms = Object.values(data.rooms)
        .filter((room) => ["waiting_for_player", "active"].includes(roomStatus(room)))
        .filter((room) => !gameId || room.game_id === gameId)
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
        started: false,
        local_mode: false,
        game: newGame(),
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
      return { ok: true, room: roomToDict(data, room) };
    }
    if (method === "POST" && (url.pathname === "/api/room/leave" || url.pathname === "/api/room/close")) {
      const code = cleanRoomCode(payload.code || "");
      const room = data.rooms[code];
      if (room) delete data.rooms[code];
      return { ok: true, closed: true };
    }
    if (method === "POST" && url.pathname === "/api/room/move") {
      const room = roomFromPayload(data, payload);
      if (!room.started) throw new Error("Room is waiting for another player.");
      const mark = playerMark(room, String(payload.player_id || ""));
      if (!mark) throw new Error("Player is not in this room.");
      if (mark !== room.game.current_player) throw new Error(`It is ${room.game.current_player}'s turn.`);
      makeMove(room.game, Number(payload.board), Number(payload.cell));
      return { ok: true, room: roomToDict(data, room) };
    }
    if (method === "POST" && url.pathname === "/api/room/reset") {
      const room = roomFromPayload(data, payload);
      const requesterId = String(payload.requester_id || "").trim();
      if (!requesterId) throw new Error("Requester id is required.");
      if (!room.players.some((player) => player.id === requesterId)) throw new Error("Only a seated player can reset the game.");
      const resetStatus = handleResetVote(room, requesterId, payload.approve !== false);
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
      });
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
        game_id: room.game_id,
        host_id: room.host_id,
        host_name: host ? host.name : "Host",
        target_id: target.id,
        target_name: target.name,
        status: "pending",
      };
      data.invites[invite.id] = invite;
      return { ok: true, invite };
    }
    if (method === "POST" && url.pathname === "/api/invite/respond") {
      const invite = data.invites[String(payload.invite_id || "").trim()];
      if (!invite || invite.status !== "pending") throw new Error("Invite not found.");
      const player = playerFromPayload(payload);
      if (player.id !== invite.target_id) throw new Error("Invite belongs to a different player.");
      if (!payload.accept) {
        invite.status = "declined";
        return { ok: true, accepted: false };
      }
      const room = data.rooms[invite.room_code];
      if (!room) {
        invite.status = "expired";
        throw new Error("Room not found.");
      }
      addPlayerToRoom(room, player);
      activateRoomIfReady(room);
      invite.status = "accepted";
      return { ok: true, accepted: true, room: roomToDict(data, room) };
    }
  throw new Error("Unknown endpoint.");
}

async function loadState(env) {
  const stored = await env.SOGOTABLE_STATE.get(STATE_KEY, "json");
  return stored || { players: [], rooms: {}, invites: {}, lobbyViewers: {} };
}

async function saveState(env, data) {
  await env.SOGOTABLE_STATE.put(STATE_KEY, JSON.stringify(data));
}

async function readJson(request) {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
  });
}

function cleanGameId(gameId) {
  const value = String(gameId || "super_tic_tac_toe").trim() || "super_tic_tac_toe";
  if (value !== "super_tic_tac_toe") throw new Error("Game is not available yet.");
  return value;
}

function playerFromPayload(payload) {
  const player = payload.player || payload;
  const clean = {
    id: String(player.id || "").trim().slice(0, 80),
    name: String(player.name || "").trim().slice(0, 24),
    icon: String(player.icon || "🙂").slice(0, 8),
    color: safeHexColor(player.color || "#2f80ed"),
  };
  if (!clean.id || !clean.name) throw new Error("Player id and name are required.");
  return clean;
}

function upsertPlayer(data, player) {
  const index = data.players.findIndex((item) => item.id === player.id);
  if (index >= 0) data.players[index] = player;
  else data.players.push(player);
  data.players.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

function refreshActiveRoomPlayer(data, player) {
  Object.values(data.rooms).forEach((room) => {
    room.players.forEach((seat) => {
      if (seat.id === player.id) Object.assign(seat, player);
    });
    ensureRoomSeatColors(room);
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
  return {
    code: room.code,
    host_id: room.host_id,
    game_id: room.game_id,
    started: room.started,
    local_mode: room.local_mode,
    status: roomStatus(room),
    players: room.players,
    game: gameToDict(room.game),
    latest_invite: latestInviteForRoom(data, room),
    reset_request: resetRequestForRoom(room),
  };
}

function roomSummary(room) {
  return {
    code: room.code,
    host_id: room.host_id,
    game_id: room.game_id,
    started: room.started,
    local_mode: room.local_mode,
    status: roomStatus(room),
    players: room.players,
    open_seats: Math.max(0, 2 - room.players.length),
  };
}

function latestInviteForRoom(data, room) {
  const invites = Object.values(data.invites).filter((invite) => invite.room_code === room.code);
  return invites.length ? invites[invites.length - 1] : null;
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
    room.game_id === gameId &&
    ["waiting_for_player", "active"].includes(roomStatus(room)) &&
    room.players.some((player) => player.id === playerId)
  )) || null;
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

function handleResetVote(room, requesterId, approve) {
  if (!approve) {
    room.reset_votes = [];
    return "declined";
  }
  if (!room.reset_votes.includes(requesterId)) room.reset_votes.push(requesterId);
  if (room.players.length > 1 && room.reset_votes.length < room.players.length) return "pending";
  room.reset_votes = [];
  room.game = newGame();
  return null;
}

function lobbyViewers(data, gameId) {
  pruneLobbyViewers(data);
  return Object.values(data.lobbyViewers)
    .filter((viewer) => !gameId || viewer.game_id === gameId)
    .map((viewer) => viewer.player);
}

function pruneLobbyViewers(data) {
  const cutoff = Date.now() - LOBBY_VIEWER_TTL_SECONDS * 1000;
  Object.entries(data.lobbyViewers).forEach(([playerId, viewer]) => {
    if (viewer.updated_at < cutoff) delete data.lobbyViewers[playerId];
  });
}

function newGame() {
  return {
    boards: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null)),
    small_winners: Array.from({ length: 9 }, () => null),
    current_player: "X",
    next_board: null,
    status: "playing",
    winner: null,
    move_count: 0,
  };
}

function gameToDict(game) {
  return { ...game, legal_boards: legalBoards(game) };
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
