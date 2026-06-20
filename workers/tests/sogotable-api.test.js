import assert from "node:assert/strict";
import test from "node:test";

import worker, { EventHubDurableObject, RoomDurableObject } from "../sogotable-api.js";

const CLASSIC_GAME_ID = "a3f19c6e42b8";
const TACTICAL_GAME_ID = "d7e4a91f0c23";
const BOXES_GAME_ID = "4b7e2d9a6c10";
const BATTLESHIP_GAME_ID = "9c2f7a81d4e6";
const QUORIDOR_GAME_ID = "8f5d2c7a1b90";
const HEX_ID_PATTERN = /^[a-f0-9]{12}$/;

class InMemoryD1 {
  constructor() {
    this.rows = new Map();
    this.writeCount = 0;
    this.forceNextUpdateConflict = false;
  }

  prepare(sql) {
    return new Statement(this, sql);
  }
}

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  async first() {
    if (this.sql.startsWith("SELECT value, version FROM app_state")) {
      const row = this.db.rows.get(this.params[0]);
      return row === undefined ? null : { value: row.value, version: row.version };
    }
    throw new Error(`Unhandled first() query: ${this.sql}`);
  }

  async run() {
    if (this.sql.startsWith("CREATE TABLE")) return { success: true };
    if (this.sql.startsWith("ALTER TABLE")) return { success: true };
    if (this.sql.startsWith("INSERT INTO app_state")) {
      if (this.db.rows.has(this.params[0])) return { success: true, meta: { changes: 0 } };
      this.db.writeCount += 1;
      this.db.rows.set(this.params[0], { value: this.params[1], version: 0 });
      return { success: true, meta: { changes: 1 } };
    }
    if (this.sql.startsWith("UPDATE app_state")) {
      const [value, key, version] = this.params;
      const row = this.db.rows.get(key);
      if (this.db.forceNextUpdateConflict) {
        this.db.forceNextUpdateConflict = false;
        return { success: true, meta: { changes: 0 } };
      }
      if (!row || row.version !== version) return { success: true, meta: { changes: 0 } };
      this.db.writeCount += 1;
      this.db.rows.set(key, { value, version: row.version + 1 });
      return { success: true, meta: { changes: 1 } };
    }
    throw new Error(`Unhandled run() query: ${this.sql}`);
  }
}

function makeEnv() {
  return { SOGOTABLE_STATE: new InMemoryD1() };
}

function makeEnvWithRooms() {
  const env = { SOGOTABLE_STATE: new InMemoryD1() };
  env.ROOM_OBJECT = new MockRoomNamespace(env);
  return env;
}

function makeEnvWithEvents() {
  const env = {
    SOGOTABLE_STATE: new InMemoryD1(),
    EVENT_HUB: new MockEventHubNamespace(),
  };
  env.ROOM_OBJECT = new MockRoomNamespace(env);
  return env;
}

class MockRoomNamespace {
  constructor(env) {
    this.env = env;
    this.objects = new Map();
  }

  getByName(name) {
    if (!this.objects.has(name)) this.objects.set(name, new MockRoomObject(name, this.env));
    return this.objects.get(name);
  }
}

class MockRoomObject {
  constructor(name, env) {
    this.name = name;
    this.env = env;
    this.snapshots = [];
    this.closed = [];
    this.actions = [];
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/__room_action") {
      const { pathname, payload } = await request.json();
      this.actions.push(pathname);
      const delegatedEnv = { ...this.env, ROOM_OBJECT: null };
      const response = await worker.fetch(new Request(`https://sogotable.test${pathname}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }), delegatedEnv);
      const body = await response.clone().json();
      if (body.room) this.snapshots.push(body.room);
      if (body.closed && body.room_code) this.closed.push(body.room_code);
      return response;
    }
    if (request.method === "POST" && url.pathname === "/__room_snapshot") {
      this.snapshots.push(await request.json());
      return Response.json({ ok: true });
    }
    if (request.method === "POST" && url.pathname === "/__room_close") {
      const { code } = await request.json();
      this.closed.push(code);
      return Response.json({ ok: true });
    }
    return Response.json({ ok: false, error: "Unhandled mock room request." }, { status: 404 });
  }

  async setRoomSnapshot(room) {
    this.snapshots.push(room);
  }

  async closeRoom(code) {
    this.closed.push(code);
  }
}

class MockEventHubNamespace {
  constructor() {
    this.objects = new Map();
  }

  getByName(name) {
    if (!this.objects.has(name)) this.objects.set(name, new MockEventHubObject(name));
    return this.objects.get(name);
  }
}

class MockEventHubObject {
  constructor(name) {
    this.name = name;
    this.snapshots = [];
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/__app_snapshot") {
      this.snapshots.push(await request.json());
      return Response.json({ ok: true });
    }
    return Response.json({ ok: false, error: "Unhandled mock event request." }, { status: 404 });
  }
}

class MockHibernatedSocket {
  constructor(attachment = {}) {
    this.attachment = attachment;
    this.sent = [];
    this.closed = false;
  }

  send(message) {
    this.sent.push(JSON.parse(message));
  }

  close() {
    this.closed = true;
  }

  serializeAttachment(attachment) {
    this.attachment = attachment;
  }

  deserializeAttachment() {
    return this.attachment;
  }
}

function player(id, name = id, color = "#1f7a5f") {
  return { id, name, icon: name.slice(0, 1), color };
}

async function request(env, method, path, body, headers = {}) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json", ...headers };
    init.body = JSON.stringify(body);
  } else {
    init.headers = headers;
  }
  const response = await worker.fetch(new Request(`https://sogotable.test${path}`, init), env);
  const json = await response.json();
  return { response, json };
}

const get = async (env, path, headers) => (await request(env, "GET", path, undefined, headers)).json;
const post = async (env, path, body, headers) => (await request(env, "POST", path, body, headers)).json;

async function createActiveRoom(env) {
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  await post(env, "/api/players/create", { player: host });
  await post(env, "/api/players/create", { player: guest });
  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "ABCD" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  return { room: joined.room, host, guest };
}

function withMockRandom(values, action) {
  const original = Math.random;
  let index = 0;
  Math.random = () => values[Math.min(index++, values.length - 1)];
  return Promise.resolve()
    .then(action)
    .finally(() => {
      Math.random = original;
    });
}

function mutateState(env, mutator) {
  const row = env.SOGOTABLE_STATE.rows.get("state");
  const data = JSON.parse(row.value);
  mutator(data);
  row.value = JSON.stringify(data);
}

test("creates, lists, and deletes players", async () => {
  const env = makeEnv();
  const created = await post(env, "/api/players/create", { player: player("p1", "Player One") });

  assert.equal(created.ok, true);
  assert.equal(created.player.name, "Player One");

  const listed = await get(env, "/api/players");
  assert.deepEqual(listed.players.map((item) => item.id), ["p1"]);

  const deleted = await post(env, "/api/players/delete", { id: "p1" });
  assert.equal(deleted.ok, true);
  assert.deepEqual(deleted.players, []);
});

test("reserved Codex test players are hidden from public roster and lobby", async () => {
  const env = makeEnv();
  await post(env, "/api/players/create", { player: { id: "codex-test-player-1" } });
  await post(env, "/api/lobby/presence", { game_id: "super_tic_tac_toe", id: "codex-test-player-1" });

  const listed = await get(env, "/api/players");
  const lobby = await get(env, "/api/lobby?game_id=super_tic_tac_toe");

  assert.equal(listed.players.some((item) => item.id === "codex-test-player-1"), false);
  assert.equal(lobby.players.some((item) => item.id === "codex-test-player-1"), false);
});

test("lists ready games from the hosted game registry", async () => {
  const env = makeEnv();
  const listed = await get(env, "/api/games");

  assert.equal(listed.ok, true);
  assert.deepEqual(listed.games.map((game) => game.id), [CLASSIC_GAME_ID, TACTICAL_GAME_ID, BOXES_GAME_ID, BATTLESHIP_GAME_ID, QUORIDOR_GAME_ID]);
  assert.deepEqual(listed.games.map((game) => game.availability), ["ready", "ready", "ready", "ready", "ready"]);
  assert.equal(listed.games[0].name, "Super Tic Tac Toe");
  assert.equal(listed.games[1].name, "Super Tic Tactical Toe");
  assert.equal(listed.games[2].name, "Dots and Boxes");
  assert.equal(listed.games[3].name, "Battleship");
  assert.equal(listed.games[4].name, "Quoridor");
  assert.equal(listed.games.every((game) => HEX_ID_PATTERN.test(game.id)), true);
  assert.equal(listed.games.every((game) => typeof game.summary === "string" && game.summary.length > 0), true);
});

test("player delete is blocked while seated and cleans pending player state otherwise", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  await post(env, "/api/players/create", { player: host });
  await post(env, "/api/players/create", { player: guest });
  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "DLET" });
  const blocked = await post(env, "/api/players/delete", { id: host.id });
  await post(env, "/api/lobby/presence", { game_id: "super_tic_tac_toe", player: guest });
  const invite = await post(env, "/api/invite/create", { code: created.room.code, host_id: host.id, player: guest });
  const deleted = await post(env, "/api/players/delete", { id: guest.id });
  const lobby = await get(env, "/api/lobby?game_id=super_tic_tac_toe");
  const invites = await get(env, `/api/invites?player_id=${encodeURIComponent(guest.id)}`);

  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, "Player is seated in an unfinished room.");
  assert.equal(invite.ok, true);
  assert.equal(deleted.ok, true);
  assert.equal(lobby.players.some((item) => item.id === guest.id), false);
  assert.equal(invites.invites.length, 0);
});

test("GET requests do not rewrite D1 state", async () => {
  const env = makeEnv();
  await post(env, "/api/players/create", { player: player("p1", "Player One") });
  const writesAfterPost = env.SOGOTABLE_STATE.writeCount;

  await get(env, "/api/players");
  await get(env, "/api/rooms?game_id=super_tic_tac_toe");

  assert.equal(env.SOGOTABLE_STATE.writeCount, writesAfterPost);
});

test("rejects writes when the state version changed while saving", async () => {
  const env = makeEnv();
  await post(env, "/api/players/create", { player: player("p1", "Player One") });
  env.SOGOTABLE_STATE.forceNextUpdateConflict = true;

  const result = await post(env, "/api/players/create", { player: player("p2", "Player Two") });

  assert.equal(result.ok, false);
  assert.equal(result.error, "State changed while saving. Please retry.");

  const listed = await get(env, "/api/players");
  assert.deepEqual(listed.players.map((item) => item.id), ["p1"]);
});

test("allows known browser origins and blocks unknown browser origins", async () => {
  const env = makeEnv();
  const allowed = await request(
    env,
    "POST",
    "/api/players/create",
    { player: player("p1", "Player One") },
    { Origin: "https://sogotable.sogodojo.com" },
  );
  const blocked = await request(
    env,
    "POST",
    "/api/players/create",
    { player: player("p2", "Player Two") },
    { Origin: "https://example.com" },
  );
  const localPreview = await request(
    env,
    "GET",
    "/api/players",
    undefined,
    { Origin: "http://127.0.0.1:8788" },
  );

  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.response.headers.get("Access-Control-Allow-Origin"), "https://sogotable.sogodojo.com");
  assert.equal(allowed.json.ok, true);
  assert.equal(localPreview.response.status, 200);
  assert.equal(localPreview.response.headers.get("Access-Control-Allow-Origin"), "http://127.0.0.1:8788");
  assert.equal(blocked.response.status, 403);
  assert.equal(blocked.response.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(blocked.json.ok, false);
});

test("creates a room, joins a second player, and rejects a third player", async () => {
  const env = makeEnv();
  const { room } = await createActiveRoom(env);

  assert.equal(room.ok, undefined);
  assert.equal(room.status, "active");
  assert.equal(room.players.length, 2);
  assert.deepEqual([...new Set(room.players.map((seat) => seat.mark))].sort(), ["O", "X"]);

  const third = await post(env, "/api/room/join", { code: room.code, player: player("third", "Third", "#c43d5d") });
  assert.equal(third.ok, false);
  assert.equal(third.error, "Room already has two players.");
});

test("lists bots and lets the host seat a bot opponent", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=super_tic_tac_toe");
  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "BOTS" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });

  assert.equal(bots.ok, true);
  assert.equal(bots.bots.length >= 3, true);
  assert.equal(bots.bots.every((bot) => bot.kind === "bot"), true);
  assert.equal(bots.bots.every((bot) => HEX_ID_PATTERN.test(bot.id) && bot.id === bot.bot_id), true);
  assert.equal(bots.bots.find((bot) => bot.name === "Tactical Tess").strategy_icon, "🧠");
  assert.equal(bots.bots.filter((bot) => bot.name !== "Tactical Tess").every((bot) => bot.strategy_icon === "🎲"), true);
  assert.equal(joined.ok, true);
  assert.equal(joined.room.status, "active");
  assert.equal(joined.room.players.length, 2);
  assert.equal(joined.room.players.some((seat) => seat.kind === "bot"), true);
}));

test("rejects bot seating by non-hosts and in active rooms", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest");
  const bots = await get(env, "/api/bots?game_id=super_tic_tac_toe");
  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "NOPE" });
  const nonHost = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: guest.id, bot_id: bots.bots[0].id });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const fullRoom = await post(env, "/api/room/join-bot", { code: joined.room.code, host_id: host.id, bot_id: bots.bots[0].id });

  assert.equal(nonHost.ok, false);
  assert.equal(nonHost.error, "Only the host can invite a bot.");
  assert.equal(fullRoom.ok, false);
  assert.equal(fullRoom.error, "Bot can only join a waiting room.");
}));

test("bot responds with a legal move through the normal move pipeline", async () => withMockRandom([0, 0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=super_tic_tac_toe");
  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "MOVE" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const moved = await post(env, "/api/room/move", { code: joined.room.code, player_id: humanSeat.id, board: 0, cell: 0 });
  const filledCells = moved.room.game.boards.flat().filter(Boolean);

  assert.equal(moved.ok, true);
  assert.equal(filledCells.length, 2);
  assert.equal(moved.room.game.current_player, humanSeat.mark);
  assert.equal(moved.room.game.boards[0][0], humanSeat.mark);
}));

test("Tactical Tess blocks an immediate zone win", async () => withMockRandom([0, 0, 0, 0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=super_tactical_tac_toe");
  const tess = bots.bots.find((bot) => bot.name === "Tactical Tess");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "TBLK" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: tess.id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const tessSeat = joined.room.players.find((seat) => seat.id === tess.id);

  mutateState(env, (data) => {
    const game = data.rooms.TBLK.game;
    game.current_player = humanSeat.mark;
    game.next_board = 1;
    game.boards[0][0] = humanSeat.mark;
    game.boards[0][1] = humanSeat.mark;
    game.move_count = 6;
  });

  const moved = await post(env, "/api/room/move", { code: "TBLK", player_id: humanSeat.id, board: 1, cell: 0 });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.boards[0][2], tessSeat.mark);
}));

test("Tactical Tess avoids sending the opponent to a winning destination zone", async () => withMockRandom([0, 0, 0, 0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=super_tactical_tac_toe");
  const tess = bots.bots.find((bot) => bot.name === "Tactical Tess");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "TDST" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: tess.id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const tessSeat = joined.room.players.find((seat) => seat.id === tess.id);

  mutateState(env, (data) => {
    const game = data.rooms.TDST.game;
    game.current_player = humanSeat.mark;
    game.next_board = 1;
    game.boards[2][0] = humanSeat.mark;
    game.boards[2][1] = humanSeat.mark;
    game.move_count = 6;
  });

  const moved = await post(env, "/api/room/move", { code: "TDST", player_id: humanSeat.id, board: 1, cell: 0 });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.boards[0][2], null);
  assert.equal(moved.room.game.boards[0].some((cell, index) => index !== 2 && cell === tessSeat.mark), true);
  assert.notEqual(moved.room.game.next_board, 2);
}));

test("Tactical Tess values a treasure pickup over a plain center cell", async () => withMockRandom([0, 0, 0, 0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=super_tactical_tac_toe");
  const tess = bots.bots.find((bot) => bot.name === "Tactical Tess");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "TPWR" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: tess.id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const tessSeat = joined.room.players.find((seat) => seat.id === tess.id);

  mutateState(env, (data) => {
    const game = data.rooms.TPWR.game;
    game.current_player = humanSeat.mark;
    game.next_board = 1;
    game.pickups = [{
      id: "manual-treasure",
      type: "treasureChest",
      label: "Treasure Chest",
      emoji: "\uD83C\uDF81",
      points: 25,
      board: 0,
      sector: 0,
      cell: 5,
      created_at_turn: 6,
    }];
    game.move_count = 6;
  });

  const moved = await post(env, "/api/room/move", { code: "TPWR", player_id: humanSeat.id, board: 1, cell: 0 });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.boards[0][5], tessSeat.mark);
  assert.equal(moved.room.game.scores[tessSeat.mark], 25);
}));

test("room durable object returns the latest bot-applied snapshot", async () => withMockRandom([0, 0], async () => {
  const env = makeEnvWithRooms();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=super_tic_tac_toe");
  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "DORB" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const moved = await post(env, "/api/room/move", { code: joined.room.code, player_id: humanSeat.id, board: 0, cell: 0 });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.move_count, 2);
  assert.equal(env.ROOM_OBJECT.getByName("DORB").snapshots.at(-1).game.move_count, 2);
}));

test("bot auto-agrees to reset and play-again requests", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=super_tic_tac_toe");
  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "RSET" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");

  mutateState(env, (data) => {
    const game = data.rooms.RSET.game;
    game.boards[0][0] = humanSeat.mark;
    game.move_count = 1;
  });

  const reset = await post(env, "/api/room/reset", { code: "RSET", requester_id: humanSeat.id });

  assert.equal(reset.ok, true);
  assert.equal(reset.reset, undefined);
  assert.equal(reset.room.reset_request, null);
  assert.equal(reset.room.game.move_count, 0);
}));

test("bot games update human stats without exposing bot leaderboard rows", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=super_tactical_tac_toe");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "BWIN" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");

  mutateState(env, (data) => {
    const room = data.rooms.BWIN;
    const game = room.game;
    game.small_winners[0] = humanSeat.mark;
    game.small_winners[1] = humanSeat.mark;
    game.boards[2][0] = humanSeat.mark;
    game.boards[2][1] = humanSeat.mark;
    game.scores = { X: 0, O: 0, [humanSeat.mark]: 50 };
    game.current_player = humanSeat.mark;
    game.next_board = 2;
    game.move_count = 20;
  });

  const moved = await post(env, "/api/room/move", { code: "BWIN", player_id: humanSeat.id, board: 2, cell: 2 });
  const stats = await get(env, "/api/stats?game_id=super_tactical_tac_toe");
  const playerStats = await get(env, `/api/player/stats?player_id=${encodeURIComponent(humanSeat.id)}`);
  const tacticalStats = playerStats.stats.find((entry) => entry.game_id === TACTICAL_GAME_ID);

  assert.equal(moved.ok, true);
  assert.equal(tacticalStats.games_played, 1);
  assert.equal(tacticalStats.games_won, 1);
  assert.equal(tacticalStats.personal_high_score, 50);
  assert.equal(bots.bots.every((bot) => !String(bot.id).includes(String(bot.name).toLowerCase().split(" ")[0])), true);
  assert.equal(stats.stats.ratings.every((entry) => !entry.bot), true);
}));

test("canonical opaque game ids work while legacy game ids remain aliases", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const legacyCreated = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "OPAQ" });
  const canonicalCreated = await post(env, "/api/room/create", { game_id: TACTICAL_GAME_ID, player: guest, code: "OPQ2" });
  const legacyRooms = await get(env, "/api/rooms?game_id=super_tic_tac_toe");
  const canonicalRooms = await get(env, `/api/rooms?game_id=${encodeURIComponent(TACTICAL_GAME_ID)}`);
  const legacyStats = await get(env, "/api/stats?game_id=super_tactical_tac_toe");

  assert.equal(legacyCreated.ok, true);
  assert.equal(legacyCreated.room.game_id, CLASSIC_GAME_ID);
  assert.equal(legacyCreated.room.game.game_id, CLASSIC_GAME_ID);
  assert.equal(canonicalCreated.ok, true);
  assert.equal(canonicalCreated.room.game_id, TACTICAL_GAME_ID);
  assert.equal(canonicalCreated.room.game.game_id, TACTICAL_GAME_ID);
  assert.equal(legacyRooms.rooms.some((room) => room.code === "OPAQ" && room.game_id === CLASSIC_GAME_ID), true);
  assert.equal(canonicalRooms.rooms.some((room) => room.code === "OPQ2" && room.game_id === TACTICAL_GAME_ID), true);
  assert.equal(legacyStats.game_id, TACTICAL_GAME_ID);
}));

test("reuses an unfinished active room for the same player and game", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const first = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "WXYZ" });
  const second = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host });

  assert.equal(second.ok, true);
  assert.equal(second.existing, true);
  assert.equal(second.room.code, first.room.code);
});

test("accepts valid moves and rejects out-of-turn moves", async () => {
  const env = makeEnv();
  const { room } = await createActiveRoom(env);
  const xSeat = room.players.find((seat) => seat.mark === "X");
  const oSeat = room.players.find((seat) => seat.mark === "O");

  const wrongTurn = await post(env, "/api/room/move", { code: room.code, player_id: oSeat.id, board: 0, cell: 0 });
  assert.equal(wrongTurn.ok, false);
  assert.equal(wrongTurn.error, "It is X's turn.");

  const moved = await post(env, "/api/room/move", { code: room.code, player_id: xSeat.id, board: 0, cell: 0 });
  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.boards[0][0], "X");
  assert.equal(moved.room.game.current_player, "O");
  assert.deepEqual(moved.room.game.legal_boards, [0]);
});

test("creates Dots and Boxes rooms and applies line moves", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "boxes", player: host, code: "BOX1" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const oSeat = joined.room.players.find((seat) => seat.mark === "O");

  const wrongTurn = await post(env, "/api/room/move", { code: "BOX1", player_id: oSeat.id, line_id: "h-0-0" });
  const moved = await post(env, "/api/room/move", { code: "BOX1", player_id: xSeat.id, line_id: "h-0-0" });
  const duplicate = await post(env, "/api/room/move", { code: "BOX1", player_id: oSeat.id, line_id: "h-0-0" });

  assert.equal(joined.room.game_id, BOXES_GAME_ID);
  assert.equal(joined.room.game.game_id, BOXES_GAME_ID);
  assert.equal(joined.room.game.rows, 8);
  assert.equal(joined.room.game.cols, 5);
  assert.equal(joined.room.game.legal_lines.length, 93);
  assert.equal(wrongTurn.ok, false);
  assert.equal(wrongTurn.error, "It is X's turn.");
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.room.game.lines, ["h-0-0"]);
  assert.equal(moved.room.game.current_player, "O");
  assert.equal(moved.room.game.legal_lines.length, 92);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error, "Line is already claimed.");
});

test("Dots and Boxes captures boxes and keeps the turn", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: BOXES_GAME_ID, player: host, code: "BOX2" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");

  mutateState(env, (data) => {
    const game = data.rooms.BOX2.game;
    game.current_player = xSeat.mark;
    game.lines = ["h-0-0", "h-1-0", "v-0-0"];
    game.move_count = 3;
  });
  const moved = await post(env, "/api/room/move", { code: "BOX2", player_id: xSeat.id, line_id: "v-0-1" });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.boxes[0][0], xSeat.mark);
  assert.equal(moved.room.game.scores[xSeat.mark], 1);
  assert.equal(moved.room.game.current_player, xSeat.mark);
  assert.equal(moved.room.game.last_move.captured.length, 1);
});

test("Dots and Boxes bot responds through the normal move pipeline", async () => withMockRandom([0, 0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=boxes");
  const created = await post(env, "/api/room/create", { game_id: "boxes", player: host, code: "BOXB" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const moved = await post(env, "/api/room/move", { code: "BOXB", player_id: humanSeat.id, line_id: "h-0-0" });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.lines.length, 2);
  assert.equal(moved.room.game.lines.includes("h-0-0"), true);
  assert.equal(moved.room.game.current_player, humanSeat.mark);
}));

test("Dots and Boxes all-bot room plays through capture chains without stalling", async () => withMockRandom([0, 0], async () => {
  const env = makeEnv();
  const botHost = {
    id: "bot-host",
    bot_id: "bot-host",
    kind: "bot",
    name: "Bot Host",
    icon: "🤖",
    color: "#1f7a5f",
  };
  const bots = await get(env, "/api/bots?game_id=boxes");
  const created = await post(env, "/api/room/create", { game_id: "boxes", player: botHost, code: "BBOT" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: botHost.id, bot_id: bots.bots[0].id });

  assert.equal(joined.ok, true);
  assert.equal(joined.room.status, "completed");
  assert.equal(joined.room.game.lines.length, 93);
  assert.equal(joined.room.game.legal_lines.length, 0);
  assert.notEqual(joined.room.game.status, "playing");
}));

test("creates Quoridor rooms and applies pawn moves", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "quoridor", player: host, code: "QOR1" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const oSeat = joined.room.players.find((seat) => seat.mark === "O");

  const wrongTurn = await post(env, "/api/room/move", { code: "QOR1", player_id: oSeat.id, action: { type: "move_pawn", row: 7, col: 4 } });
  const moved = await post(env, "/api/room/move", { code: "QOR1", player_id: xSeat.id, action: { type: "move_pawn", row: 7, col: 4 } });

  assert.equal(joined.room.game_id, QUORIDOR_GAME_ID);
  assert.equal(joined.room.game.board_size, 9);
  assert.equal(joined.room.game.walls_remaining.X, 10);
  assert.equal(joined.room.game.legal_pawn_moves.length, 3);
  assert.equal(wrongTurn.ok, false);
  assert.equal(wrongTurn.error, "It is X's turn.");
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.room.game.pawns.X, { row: 7, col: 4, goal: 0 });
  assert.equal(moved.room.game.current_player, "O");
});

test("Quoridor places walls and rejects overlap crossing and sealed paths", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  await post(env, "/api/room/create", { game_id: "quoridor", player: host, code: "QOR2" });
  const joined = await post(env, "/api/room/join", { code: "QOR2", player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const oSeat = joined.room.players.find((seat) => seat.mark === "O");

  const wall = await post(env, "/api/room/move", { code: "QOR2", player_id: xSeat.id, action: { type: "place_wall", orientation: "h", row: 7, col: 3 } });
  const overlap = await post(env, "/api/room/move", { code: "QOR2", player_id: oSeat.id, action: { type: "place_wall", orientation: "h", row: 7, col: 4 } });
  const crossing = await post(env, "/api/room/move", { code: "QOR2", player_id: oSeat.id, action: { type: "place_wall", orientation: "v", row: 7, col: 3 } });

  mutateState(env, (data) => {
    const game = data.rooms.QOR2.game;
    game.current_player = oSeat.mark;
    game.walls_remaining[oSeat.mark] = 10;
    game.walls = [
      { orientation: "h", row: 7, col: 0 },
      { orientation: "h", row: 7, col: 2 },
      { orientation: "h", row: 7, col: 4 },
      { orientation: "v", row: 7, col: 7 },
    ];
    game.pawns.X = { row: 8, col: 0, goal: 0 };
  });
  const sealed = await post(env, "/api/room/move", { code: "QOR2", player_id: oSeat.id, action: { type: "place_wall", orientation: "h", row: 7, col: 6 } });

  assert.equal(wall.ok, true);
  assert.equal(wall.room.game.walls_remaining.X, 9);
  assert.equal(overlap.ok, false);
  assert.equal(overlap.error, "Wall placement is not legal.");
  assert.equal(crossing.ok, false);
  assert.equal(crossing.error, "Wall placement is not legal.");
  assert.equal(sealed.ok, false);
  assert.equal(sealed.error, "Wall placement is not legal.");
});

test("Quoridor supports jumps and detects wins", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  await post(env, "/api/room/create", { game_id: "quoridor", player: host, code: "QOR3" });
  const joined = await post(env, "/api/room/join", { code: "QOR3", player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");

  mutateState(env, (data) => {
    const game = data.rooms.QOR3.game;
    game.current_player = xSeat.mark;
    game.pawns.X = { row: 4, col: 4, goal: 0 };
    game.pawns.O = { row: 3, col: 4, goal: 8 };
  });
  const jump = await post(env, "/api/room/move", { code: "QOR3", player_id: xSeat.id, action: { type: "move_pawn", row: 2, col: 4 } });

  mutateState(env, (data) => {
    const game = data.rooms.QOR3.game;
    game.current_player = xSeat.mark;
    game.pawns.X = { row: 1, col: 4, goal: 0 };
    game.pawns.O = { row: 8, col: 4, goal: 8 };
  });
  const win = await post(env, "/api/room/move", { code: "QOR3", player_id: xSeat.id, action: { type: "move_pawn", row: 0, col: 4 } });

  assert.equal(jump.ok, true);
  assert.deepEqual(jump.room.game.pawns.X, { row: 2, col: 4, goal: 0 });
  assert.equal(win.ok, true);
  assert.equal(win.room.game.status, "x_won");
  assert.equal(win.room.game.winner, "X");
});

test("Quoridor bot responds through the normal move pipeline", async () => withMockRandom([0, 0.9, 0.9], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=quoridor");
  const created = await post(env, "/api/room/create", { game_id: "quoridor", player: host, code: "QBOT" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const moved = await post(env, "/api/room/move", { code: "QBOT", player_id: humanSeat.id, action: { type: "move_pawn", row: 7, col: 4 } });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.move_count >= 2, true);
  assert.equal(["X", "O"].includes(moved.room.game.current_player), true);
}));

const fleet = (offset = 0) => [
  { id: "carrier", row: offset, col: 0, orientation: "h" },
  { id: "battleship", row: offset + 1, col: 0, orientation: "h" },
  { id: "cruiser", row: offset + 2, col: 0, orientation: "h" },
  { id: "submarine", row: offset + 3, col: 0, orientation: "h" },
  { id: "destroyer", row: offset + 4, col: 0, orientation: "h" },
];

test("Battleship setup requires valid fleets and starts after both players are ready", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "battleship", player: host, code: "SHIP" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const oSeat = joined.room.players.find((seat) => seat.mark === "O");
  const invalid = await post(env, "/api/room/move", {
    code: "SHIP",
    player_id: xSeat.id,
    action: { type: "place_fleet", ships: [{ id: "carrier", row: 0, col: 0, orientation: "h" }] },
  });
  const xReady = await post(env, "/api/room/move", { code: "SHIP", player_id: xSeat.id, action: { type: "place_fleet", ships: fleet(0) } });
  const oReady = await post(env, "/api/room/move", { code: "SHIP", player_id: oSeat.id, action: { type: "place_fleet", ships: fleet(5) } });

  assert.equal(joined.room.game_id, BATTLESHIP_GAME_ID);
  assert.equal(joined.room.game.status, "setup");
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error, "Place every ship before readying fleet.");
  assert.equal(xReady.room.game.status, "setup");
  assert.equal(oReady.room.game.status, "playing");
  assert.equal(oReady.room.game.current_player, "X");
});

test("Battleship resolves attacks and rejects duplicate shots", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: BATTLESHIP_GAME_ID, player: host, code: "BATT" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const oSeat = joined.room.players.find((seat) => seat.mark === "O");
  await post(env, "/api/room/move", { code: "BATT", player_id: xSeat.id, action: { type: "place_fleet", ships: fleet(0) } });
  await post(env, "/api/room/move", { code: "BATT", player_id: oSeat.id, action: { type: "place_fleet", ships: fleet(5) } });

  const hit = await post(env, "/api/room/move", { code: "BATT", player_id: xSeat.id, action: { type: "attack", row: 5, col: 0 } });
  const duplicate = await post(env, "/api/room/move", { code: "BATT", player_id: xSeat.id, action: { type: "attack", row: 5, col: 0 } });

  assert.equal(hit.ok, true);
  assert.equal(hit.room.game.last_move.hit, true);
  assert.equal(hit.room.game.current_player, "O");
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error, "It is O's turn.");
});

test("Battleship detects a sunk fleet winner", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "battleship", player: host, code: "SINK" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const oSeat = joined.room.players.find((seat) => seat.mark === "O");
  mutateState(env, (data) => {
    const game = data.rooms.SINK.game;
    game.status = "playing";
    game.phase = "playing";
    game.current_player = "X";
    game.players.X.ready = true;
    game.players.O.ready = true;
    game.players.X.ships = fleet(0);
    game.players.O.ships = fleet(5);
    game.players.X.shots = [
      ...Array.from({ length: 5 }, (_, col) => ({ row: 5, col, hit: true, ship_id: "carrier" })),
      ...Array.from({ length: 4 }, (_, col) => ({ row: 6, col, hit: true, ship_id: "battleship" })),
      ...Array.from({ length: 3 }, (_, col) => ({ row: 7, col, hit: true, ship_id: "cruiser" })),
      ...Array.from({ length: 3 }, (_, col) => ({ row: 8, col, hit: true, ship_id: "submarine" })),
      { row: 9, col: 0, hit: true, ship_id: "destroyer" },
    ];
    game.players.O.shots = [];
  });
  const won = await post(env, "/api/room/move", { code: "SINK", player_id: xSeat.id, action: { type: "attack", row: 9, col: 1 } });

  assert.equal(oSeat.mark, "O");
  assert.equal(won.room.status, "completed");
  assert.equal(won.room.game.status, "x_won");
  assert.equal(won.room.game.winner, "X");
});

test("Battleship bot auto-places fleet and responds with legal attacks", async () => withMockRandom([0.9, 0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=battleship");
  const created = await post(env, "/api/room/create", { game_id: "battleship", player: host, code: "BOTP" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });
  assert.equal(joined.ok, true, joined.error);
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const ready = await post(env, "/api/room/move", { code: "BOTP", player_id: humanSeat.id, action: { type: "auto_place" } });

  assert.equal(joined.room.game.players[joined.room.players.find((seat) => seat.kind === "bot").mark].ready, true);
  assert.equal(ready.ok, true);
  assert.equal(ready.room.game.move_count >= 1, true);
  assert.equal(ready.room.game.players.X.shots.length + ready.room.game.players.O.shots.length >= 1, true);
}));

test("Battleship repairs missing bot setup when the human readies fleet", async () => withMockRandom([0.9, 0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=battleship");
  const created = await post(env, "/api/room/create", { game_id: "battleship", player: host, code: "BRDY" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const botSeat = joined.room.players.find((seat) => seat.kind === "bot");

  mutateState(env, (data) => {
    const botState = data.rooms.BRDY.game.players[botSeat.mark];
    botState.ready = false;
    botState.ships = [];
  });

  const ready = await post(env, "/api/room/move", {
    code: "BRDY",
    player_id: humanSeat.id,
    action: { type: "place_fleet", ships: fleet(0) },
  });

  assert.equal(ready.ok, true, ready.error);
  assert.equal(ready.room.game.players[botSeat.mark].ready, true);
  assert.equal(ready.room.game.players[botSeat.mark].ships.length, 5);
  assert.notEqual(ready.room.game.status, "setup");
}));

test("Battleship Tactical Tess places a complete non-overlapping fleet", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=battleship");
  const tess = bots.bots.find((bot) => bot.name === "Tactical Tess");
  const created = await post(env, "/api/room/create", { game_id: "battleship", player: host, code: "BTTP" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: tess.id });
  const botSeat = joined.room.players.find((seat) => seat.kind === "bot");
  const ships = joined.room.game.players[botSeat.mark].ships;
  const occupied = new Set();

  assert.equal(ships.length, 5);
  ships.forEach((ship) => {
    const required = joined.room.game.fleet.find((item) => item.id === ship.id);
    const cells = Array.from({ length: required.size }, (_, index) => ({
      row: ship.row + (ship.orientation === "v" ? index : 0),
      col: ship.col + (ship.orientation === "h" ? index : 0),
    }));
    assert.equal(cells.length, required.size);
    cells.forEach((cell) => {
      assert.equal(cell.row >= 0 && cell.row < 10 && cell.col >= 0 && cell.col < 10, true);
      const key = `${cell.row}:${cell.col}`;
      assert.equal(occupied.has(key), false);
      occupied.add(key);
    });
  });
});

test("Battleship Tactical Tess extends a known hit line", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=battleship");
  const tess = bots.bots.find((bot) => bot.name === "Tactical Tess");
  const created = await post(env, "/api/room/create", { game_id: "battleship", player: host, code: "BTTG" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: tess.id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const botSeat = joined.room.players.find((seat) => seat.kind === "bot");
  await post(env, "/api/room/move", { code: "BTTG", player_id: humanSeat.id, action: { type: "auto_place" } });
  mutateState(env, (data) => {
    const game = data.rooms.BTTG.game;
    game.current_player = humanSeat.mark;
    game.players[humanSeat.mark].ships = fleet(0);
    game.players[botSeat.mark].shots = [
      { row: 0, col: 0, hit: true, ship_id: "carrier" },
      { row: 0, col: 1, hit: true, ship_id: "carrier" },
    ];
  });

  const after = await post(env, "/api/room/move", { code: "BTTG", player_id: humanSeat.id, action: { type: "attack", row: 9, col: 9 } });
  const botShots = after.room.game.players[botSeat.mark].shots;

  assert.equal(botShots.some((shot) => shot.row === 0 && shot.col === 2), true);
});

test("Battleship basic bots hunt next to unresolved hits", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=battleship");
  const basicBot = bots.bots.find((bot) => bot.name === "Sogo Bot");
  const created = await post(env, "/api/room/create", { game_id: "battleship", player: host, code: "BHTG" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: basicBot.id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const botSeat = joined.room.players.find((seat) => seat.kind === "bot");
  await post(env, "/api/room/move", { code: "BHTG", player_id: humanSeat.id, action: { type: "auto_place" } });
  mutateState(env, (data) => {
    const game = data.rooms.BHTG.game;
    game.current_player = humanSeat.mark;
    game.players[humanSeat.mark].ships = fleet(0);
    game.players[botSeat.mark].shots = [
      { row: 0, col: 0, hit: true, ship_id: "carrier" },
      { row: 0, col: 1, hit: true, ship_id: "carrier" },
    ];
  });

  const after = await post(env, "/api/room/move", { code: "BHTG", player_id: humanSeat.id, action: { type: "attack", row: 9, col: 9 } });
  const botShots = after.room.game.players[botSeat.mark].shots;

  assert.equal(botShots.some((shot) => shot.row === 0 && shot.col === 2), true);
});

test("tracks reset votes and resets only after both seated players agree", async () => {
  const env = makeEnv();
  const { room } = await createActiveRoom(env);
  const [first, second] = room.players;

  const pending = await post(env, "/api/room/reset", { code: room.code, requester_id: first.id });
  assert.equal(pending.ok, true);
  assert.equal(pending.reset, "pending");
  assert.equal(pending.room.reset_request.needed, 2);

  const reset = await post(env, "/api/room/reset", { code: room.code, requester_id: second.id });
  assert.equal(reset.ok, true);
  assert.equal(reset.reset, undefined);
  assert.equal(reset.room.game.move_count, 0);
  assert.equal(reset.room.game_epoch, room.game_epoch + 1);
  assert.equal(reset.room.revision > pending.room.revision, true);
  assert.equal(reset.room.reset_request, null);
});

test("creates invites and handles decline and accept", async () => {
  const declinedEnv = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest");
  const declinedRoom = await post(declinedEnv, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "DECL" });
  const invite = await post(declinedEnv, "/api/invite/create", { code: declinedRoom.room.code, host_id: host.id, player: guest });
  const declined = await post(declinedEnv, "/api/invite/respond", { invite_id: invite.invite.id, accept: false, player: guest });

  assert.equal(invite.ok, true);
  assert.equal(declined.ok, true);
  assert.equal(declined.accepted, false);

  const acceptedEnv = makeEnv();
  const acceptedRoom = await post(acceptedEnv, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "ACPT" });
  const acceptedInvite = await post(acceptedEnv, "/api/invite/create", { code: acceptedRoom.room.code, host_id: host.id, player: guest });
  const accepted = await post(acceptedEnv, "/api/invite/respond", { invite_id: acceptedInvite.invite.id, accept: true, player: guest });

  assert.equal(accepted.ok, true);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.room.status, "active");
  assert.equal(accepted.room.players.length, 2);
});

test("invite accept routes through room authority", async () => {
  const env = makeEnvWithRooms();
  const host = player("host", "Host");
  const guest = player("guest", "Guest");
  const room = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "AUTH" });
  const invite = await post(env, "/api/invite/create", { code: room.room.code, host_id: host.id, player: guest });
  const accepted = await post(env, "/api/invite/respond", { invite_id: invite.invite.id, accept: true, player: guest });
  const roomObject = env.ROOM_OBJECT.getByName("AUTH");

  assert.equal(accepted.ok, true);
  assert.equal(accepted.room.status, "active");
  assert.equal(roomObject.actions.includes("/api/invite/respond"), true);
  assert.equal(roomObject.snapshots.at(-1).players.some((seat) => seat.id === guest.id), true);
});

test("notifies the room durable object after meaningful room changes", async () => {
  const env = makeEnvWithRooms();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "PUSH" });
  const roomObject = env.ROOM_OBJECT.getByName("PUSH");

  assert.equal(created.ok, true);
  assert.equal(roomObject.snapshots.length, 1);
  assert.equal(roomObject.snapshots[0].status, "waiting_for_player");

  const invite = await post(env, "/api/invite/create", { code: "PUSH", host_id: host.id, player: guest });
  assert.equal(invite.ok, true);
  assert.equal(roomObject.snapshots.at(-1).latest_invite.status, "pending");

  const declined = await post(env, "/api/invite/respond", { invite_id: invite.invite.id, accept: false, player: guest });
  assert.equal(declined.ok, true);
  assert.equal(roomObject.snapshots.at(-1).latest_invite.status, "declined");

  const joined = await post(env, "/api/room/join", { code: "PUSH", player: guest });
  assert.equal(joined.ok, true);
  assert.equal(roomObject.snapshots.at(-1).status, "active");
  assert.deepEqual(roomObject.actions, ["/api/invite/respond", "/api/room/join"]);

  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  await post(env, "/api/room/move", { code: "PUSH", player_id: xSeat.id, board: 0, cell: 0 });
  assert.equal(roomObject.snapshots.at(-1).game.move_count, 1);

  await post(env, "/api/room/leave", { code: "PUSH", player_id: host.id, requester_id: host.id });
  assert.deepEqual(roomObject.closed, ["PUSH"]);
  assert.deepEqual(roomObject.actions, ["/api/invite/respond", "/api/room/join", "/api/room/move", "/api/room/leave"]);
});

test("creates tactical rooms with authoritative pickups and scores", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "TACT" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const oSeat = joined.room.players.find((seat) => seat.mark === "O");

  const firstMove = await post(env, "/api/room/move", { code: "TACT", player_id: xSeat.id, board: 0, cell: 0 });
  assert.equal(firstMove.ok, true);
  assert.equal(firstMove.room.game.game_id, TACTICAL_GAME_ID);
  assert.equal(firstMove.room.game.pickups.length, 1);
  assert.equal(firstMove.room.game.pickups[0].type, "coin");
  assert.equal(firstMove.room.game.pickups[0].board, 0);
  assert.equal(firstMove.room.game.pickups[0].cell, 1);

  const capture = await post(env, "/api/room/move", { code: "TACT", player_id: oSeat.id, board: 0, cell: 1 });
  assert.equal(capture.ok, true);
  assert.equal(capture.room.game.scores[oSeat.mark], 10);
  assert.equal(capture.room.game.last_event.type, "pickupCaptured");
  assert.equal(capture.room.game.events.some((event) => event.type === "pickupCaptured" && event.points === 10), true);
}));

test("spawns treasure when a tactical sector is captured", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "TRSR" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");

  mutateState(env, (data) => {
    const game = data.rooms.TRSR.game;
    game.boards[0][0] = "X";
    game.boards[0][1] = "X";
    game.current_player = "X";
    game.next_board = 0;
    game.move_count = 4;
  });

  const moved = await post(env, "/api/room/move", { code: "TRSR", player_id: xSeat.id, board: 0, cell: 2 });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.small_winners[0], "X");
  assert.equal(moved.room.game.pickups.some((pickup) => pickup.type === "treasureChest"), true);
  assert.equal(moved.room.game.pickups.some((pickup) => pickup.type === "coin"), true);
}));

test("tactical game ends on sector line and highest score wins", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  await post(env, "/api/players/create", { player: host });
  await post(env, "/api/players/create", { player: guest });
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "SCOR" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");

  mutateState(env, (data) => {
    const room = data.rooms.SCOR;
    const game = room.game;
    game.small_winners[0] = "X";
    game.small_winners[1] = "X";
    game.boards[2][0] = "X";
    game.boards[2][1] = "X";
    game.scores = { X: 20, O: 90 };
    game.current_player = "X";
    game.next_board = 2;
    game.move_count = 20;
  });

  const moved = await post(env, "/api/room/move", { code: "SCOR", player_id: xSeat.id, board: 2, cell: 2 });
  const stats = await get(env, "/api/stats?game_id=super_tactical_tac_toe");

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.small_winners[2], "X");
  assert.equal(moved.room.game.line_winner, "X");
  assert.equal(moved.room.game.status, "o_won");
  assert.equal(moved.room.game.winner, "O");
  assert.equal(moved.room.stats_recorded, true);
  assert.deepEqual(stats.stats.high_scores.map((entry) => entry.score), [90, 20]);
  const oRating = stats.stats.ratings.find((entry) => entry.player_id === joined.room.players.find((seat) => seat.mark === "O").id);
  const xRating = stats.stats.ratings.find((entry) => entry.player_id === xSeat.id);
  assert.equal(oRating.rating > xRating.rating, true);

  const repeatStats = await get(env, "/api/stats?game_id=super_tactical_tac_toe");
  assert.equal(repeatStats.stats.high_scores.length, 2);
}));

test("tactical tied score on sector line awards the line completer", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "TIED" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");

  mutateState(env, (data) => {
    const room = data.rooms.TIED;
    const game = room.game;
    game.small_winners[0] = "X";
    game.small_winners[1] = "X";
    game.boards[2][0] = "X";
    game.boards[2][1] = "X";
    game.scores = { X: 40, O: 40 };
    game.current_player = "X";
    game.next_board = 2;
    game.move_count = 20;
  });

  const moved = await post(env, "/api/room/move", { code: "TIED", player_id: xSeat.id, board: 2, cell: 2 });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.line_winner, "X");
  assert.equal(moved.room.game.status, "x_won");
  assert.equal(moved.room.game.winner, "X");
  assert.equal(moved.room.stats_recorded, true);
}));

test("player profile edits refresh stats display names and icons", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host", "#d946ef");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "EDIT" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");

  mutateState(env, (data) => {
    const room = data.rooms.EDIT;
    const game = room.game;
    game.small_winners[0] = "X";
    game.small_winners[1] = "X";
    game.boards[2][0] = "X";
    game.boards[2][1] = "X";
    game.scores = { X: 50, O: 10 };
    game.current_player = "X";
    game.next_board = 2;
    game.move_count = 20;
  });

  await post(env, "/api/room/move", { code: "EDIT", player_id: xSeat.id, board: 2, cell: 2 });
  const edited = await post(env, "/api/players/create", {
    player: { ...xSeat, name: "Renamed Player", icon: "ZZ", color: "#16a34a" },
  });
  const stats = await get(env, "/api/stats?game_id=super_tactical_tac_toe");
  const playerStats = await get(env, `/api/player/stats?player_id=${encodeURIComponent(xSeat.id)}`);
  const highScore = stats.stats.high_scores.find((entry) => entry.player_id === xSeat.id);
  const rating = stats.stats.ratings.find((entry) => entry.player_id === xSeat.id);
  const tacticalStats = playerStats.stats.find((entry) => entry.game_id === TACTICAL_GAME_ID);
  const classicStats = playerStats.stats.find((entry) => entry.game_id === CLASSIC_GAME_ID);

  assert.equal(edited.ok, true);
  assert.equal(edited.player.id, xSeat.id);
  assert.equal(highScore.player_name, "Renamed Player");
  assert.equal(highScore.player_icon, "ZZ");
  assert.equal(rating.player_name, "Renamed Player");
  assert.equal(rating.player_icon, "ZZ");
  assert.equal(tacticalStats.games_played, 1);
  assert.equal(tacticalStats.games_won, 1);
  assert.equal(tacticalStats.personal_high_score, 50);
  assert.equal(tacticalStats.elo > 1000, true);
  assert.equal(classicStats.games_played, 0);
  assert.equal(classicStats.games_won, 0);
  assert.equal(classicStats.personal_high_score, 0);
  assert.equal(classicStats.elo, 1000);

  const cleared = await post(env, "/api/player/stats/clear", { player_id: xSeat.id });
  const clearedGameStats = await get(env, "/api/stats?game_id=super_tactical_tac_toe");
  const clearedTacticalStats = cleared.stats.find((entry) => entry.game_id === TACTICAL_GAME_ID);

  assert.equal(cleared.ok, true);
  assert.equal(clearedTacticalStats.games_played, 0);
  assert.equal(clearedTacticalStats.games_won, 0);
  assert.equal(clearedTacticalStats.personal_high_score, 0);
  assert.equal(clearedTacticalStats.elo, 1000);
  assert.equal(clearedGameStats.stats.high_scores.some((entry) => entry.player_id === xSeat.id), false);
  assert.equal(clearedGameStats.stats.ratings.some((entry) => entry.player_id === xSeat.id), false);
}));

test("player edit broadcasts affected room snapshots", async () => {
  const env = makeEnvWithEvents();
  const host = player("host", "Host", "#d946ef");
  const guest = player("guest", "Guest", "#2563eb");
  await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "EDIT" });
  await post(env, "/api/room/join", { code: "EDIT", player: guest });
  const edited = await post(env, "/api/players/create", {
    player: { ...host, name: "Host Renamed", icon: "HR", color: "#16a34a" },
  });
  const roomObject = env.ROOM_OBJECT.getByName("EDIT");
  const tacticalHub = env.EVENT_HUB.getByName(TACTICAL_GAME_ID);

  assert.equal(edited.ok, true);
  assert.equal(edited.rooms.length, 1);
  assert.equal(roomObject.snapshots.at(-1).players.find((seat) => seat.id === host.id).name, "Host Renamed");
  assert.equal(tacticalHub.snapshots.at(-1).rooms.find((room) => room.code === "EDIT").players.find((seat) => seat.id === host.id).name, "Host Renamed");
});

test("stats clear notifies all ready game event hubs", async () => {
  const env = makeEnvWithEvents();
  const host = player("host", "Host");
  await post(env, "/api/players/create", { player: host });
  mutateState(env, (data) => {
    data.stats = {
      high_scores: {
        [TACTICAL_GAME_ID]: [{ player_id: host.id, player_name: host.name, player_icon: host.icon, score: 50 }],
      },
      ratings: {
        [TACTICAL_GAME_ID]: { [host.id]: { player_id: host.id, player_name: host.name, player_icon: host.icon, rating: 1016, games: 1, wins: 1, losses: 0, draws: 0 } },
      },
      personal: {
        [TACTICAL_GAME_ID]: { [host.id]: { player_id: host.id, player_name: host.name, player_icon: host.icon, games_played: 1, games_won: 1, personal_high_score: 50 } },
      },
    };
  });

  const cleared = await post(env, "/api/player/stats/clear", { player_id: host.id });
  const tacticalHub = env.EVENT_HUB.getByName(TACTICAL_GAME_ID);
  const classicHub = env.EVENT_HUB.getByName(CLASSIC_GAME_ID);

  assert.equal(cleared.ok, true);
  assert.equal(tacticalHub.snapshots.at(-1).stats.high_scores.some((entry) => entry.player_id === host.id), false);
  assert.equal(tacticalHub.snapshots.at(-1).stats.ratings.some((entry) => entry.player_id === host.id), false);
  assert.equal(classicHub.snapshots.at(-1).game_id, CLASSIC_GAME_ID);
});

test("public game stats exclude missing players without capping rows", async () => {
  const env = makeEnv();
  const roster = Array.from({ length: 6 }, (_, index) => player(`p${index + 1}`, `Player ${index + 1}`));
  for (const item of roster) {
    await post(env, "/api/players/create", { player: item });
  }
  mutateState(env, (data) => {
    data.stats = {
      high_scores: {
        [TACTICAL_GAME_ID]: [
          ...roster.map((item, index) => ({
            player_id: item.id,
            player_name: item.name,
            player_icon: item.icon,
            score: 100 - index,
            recorded_at: `2026-06-09T00:00:0${index}Z`,
          })),
          { player_id: "missing", player_name: "Missing", player_icon: "M", score: 999, recorded_at: "2026-06-09T00:00:09Z" },
        ],
      },
      ratings: {
        [TACTICAL_GAME_ID]: {
          ...Object.fromEntries(roster.map((item, index) => [item.id, {
            player_id: item.id,
            player_name: item.name,
            player_icon: item.icon,
            rating: 1100 - index,
            games: 1,
            wins: 1,
            losses: 0,
            draws: 0,
          }])),
          missing: {
            player_id: "missing",
            player_name: "Missing",
            player_icon: "M",
            rating: 9999,
            games: 1,
            wins: 1,
            losses: 0,
            draws: 0,
          },
        },
      },
      personal: {},
    };
  });

  const stats = await get(env, `/api/stats?game_id=${TACTICAL_GAME_ID}`);

  assert.equal(stats.ok, true);
  assert.equal(stats.stats.high_scores.length, 6);
  assert.equal(stats.stats.ratings.length, 6);
  assert.equal(stats.stats.high_scores.some((entry) => entry.player_id === "missing"), false);
  assert.equal(stats.stats.ratings.some((entry) => entry.player_id === "missing"), false);
});

test("public game stats exclude hidden test players", async () => {
  const env = makeEnv();
  const visible = player("visible", "Visible Player");
  await post(env, "/api/players/create", { player: visible });
  await post(env, "/api/players/create", { player: { id: "codex-test-player-1" } });
  mutateState(env, (data) => {
    data.stats = {
      high_scores: {
        [TACTICAL_GAME_ID]: [
          {
            player_id: visible.id,
            player_name: visible.name,
            player_icon: visible.icon,
            score: 12,
            recorded_at: "2026-06-09T00:00:00Z",
          },
          {
            player_id: "codex-test-player-1",
            player_name: "Codex Test 1",
            player_icon: "T",
            score: 999,
            recorded_at: "2026-06-09T00:00:01Z",
          },
        ],
      },
      ratings: {
        [TACTICAL_GAME_ID]: {
          [visible.id]: {
            player_id: visible.id,
            player_name: visible.name,
            player_icon: visible.icon,
            rating: 1000,
            games: 1,
            wins: 0,
            losses: 0,
            draws: 1,
          },
          "codex-test-player-1": {
            player_id: "codex-test-player-1",
            player_name: "Codex Test 1",
            player_icon: "T",
            rating: 3000,
            games: 1,
            wins: 1,
            losses: 0,
            draws: 0,
          },
        },
      },
      personal: {},
    };
  });

  const stats = await get(env, `/api/stats?game_id=${TACTICAL_GAME_ID}`);

  assert.equal(stats.stats.high_scores.length, 1);
  assert.equal(stats.stats.ratings.length, 1);
  assert.equal(stats.stats.high_scores[0].player_id, visible.id);
  assert.equal(stats.stats.ratings[0].player_id, visible.id);
});

test("tactical score goal alone does not end the game", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "GOAL" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");

  mutateState(env, (data) => {
    const game = data.rooms.GOAL.game;
    game.scores = { X: 100, O: 0 };
    game.current_player = "X";
    game.next_board = null;
  });

  const moved = await post(env, "/api/room/move", { code: "GOAL", player_id: xSeat.id, board: 0, cell: 0 });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.status, "playing");
  assert.equal(moved.room.game.winner, null);
}));

test("notifies the app event hub with room, lobby, and invite snapshots", async () => {
  const env = makeEnvWithEvents();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");

  await post(env, "/api/players/create", { player: host });
  let eventHub = env.EVENT_HUB.getByName(CLASSIC_GAME_ID);
  assert.equal(eventHub.snapshots.at(-1).type, "app_snapshot");
  assert.deepEqual(eventHub.snapshots.at(-1).rooms, []);

  const presence = await post(env, "/api/lobby/presence", { game_id: "super_tic_tac_toe", player: host });
  assert.equal(presence.ok, true);
  assert.deepEqual(eventHub.snapshots.at(-1).lobby_players.map((item) => item.id), ["host"]);

  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "EVNT" });
  assert.equal(created.ok, true);
  assert.deepEqual(eventHub.snapshots.at(-1).rooms.map((room) => room.code), ["EVNT"]);

  const invite = await post(env, "/api/invite/create", { code: "EVNT", host_id: host.id, player: guest });
  assert.equal(invite.ok, true);
  assert.equal(eventHub.snapshots.at(-1).pending_invites_by_player.guest[0].id, "EVNT:guest");

  const declined = await post(env, "/api/invite/respond", { invite_id: invite.invite.id, accept: false, player: guest });
  assert.equal(declined.ok, true);
  assert.equal(eventHub.snapshots.at(-1).pending_invites_by_player.guest, undefined);
});

test("event hub sends an initial snapshot for a subscription", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  await post(env, "/api/players/create", { player: host });
  await post(env, "/api/lobby/presence", { game_id: "super_tic_tac_toe", player: host });
  const hub = new EventHubDurableObject({}, env);
  const sent = [];
  const session = { send: (message) => sent.push(JSON.parse(message)) };
  hub.sessions.set(session, { game_id: CLASSIC_GAME_ID, player_id: host.id });

  await hub.sendInitialSnapshot(session);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "app_snapshot");
  assert.equal(sent[0].game_id, CLASSIC_GAME_ID);
  assert.deepEqual(sent[0].lobby_players.map((item) => item.id), [host.id]);
});

test("event hub broadcasts through hibernated sockets with serialized subscriptions", async () => {
  const env = makeEnv();
  const classicSocket = new MockHibernatedSocket({ game_id: CLASSIC_GAME_ID, player_id: "host" });
  const tacticalSocket = new MockHibernatedSocket({ game_id: TACTICAL_GAME_ID, player_id: "guest" });
  const hub = new EventHubDurableObject({ getWebSockets: () => [classicSocket, tacticalSocket] }, env);

  hub.broadcastSnapshot({
    type: "app_snapshot",
    game_id: CLASSIC_GAME_ID,
    rooms: [],
    lobby_players: [player("host", "Host")],
    pending_invites_by_player: { host: [{ id: "ABCD:host" }] },
    stats: {},
  });

  assert.equal(classicSocket.sent.length, 1);
  assert.equal(classicSocket.sent[0].type, "app_snapshot");
  assert.deepEqual(classicSocket.sent[0].pending_invites.map((invite) => invite.id), ["ABCD:host"]);
  assert.equal(tacticalSocket.sent.length, 0);
});

test("event hub subscribe messages update hibernated socket attachments", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  await post(env, "/api/players/create", { player: host });
  const socket = new MockHibernatedSocket({ game_id: CLASSIC_GAME_ID, player_id: "" });
  const hub = new EventHubDurableObject({ getWebSockets: () => [socket] }, env);

  await hub.webSocketMessage(socket, JSON.stringify({ type: "subscribe", game_id: TACTICAL_GAME_ID, player_id: "host" }));

  assert.equal(socket.attachment.game_id, TACTICAL_GAME_ID);
  assert.equal(socket.attachment.player_id, "host");
  assert.equal(socket.sent.length, 1);
  assert.equal(socket.sent[0].game_id, TACTICAL_GAME_ID);
});

test("room broadcasts through hibernated sockets when in-memory sessions are empty", () => {
  const socket = new MockHibernatedSocket({ type: "room" });
  const room = new RoomDurableObject({ getWebSockets: () => [socket] }, makeEnv());

  room.broadcast({ type: "room_closed", code: "ZZZZ" });

  assert.deepEqual(socket.sent, [{ type: "room_closed", code: "ZZZZ" }]);
});

test("routes tactical lobby snapshots through the tactical event hub", async () => {
  const env = makeEnvWithEvents();
  const host = player("host", "Host");

  const presence = await post(env, "/api/lobby/presence", { game_id: "super_tactical_tac_toe", player: host });
  const tacticalHub = env.EVENT_HUB.getByName(TACTICAL_GAME_ID);
  const classicHub = env.EVENT_HUB.getByName(CLASSIC_GAME_ID);

  assert.equal(presence.ok, true);
  assert.equal(tacticalHub.snapshots.at(-1).game_id, TACTICAL_GAME_ID);
  assert.deepEqual(tacticalHub.snapshots.at(-1).lobby_players.map((item) => item.id), ["host"]);
  assert.equal(classicHub.snapshots.length, 0);
});
