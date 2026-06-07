import assert from "node:assert/strict";
import test from "node:test";

import worker from "../sogotable-api.js";

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
  assert.deepEqual(roomObject.actions, ["/api/room/join"]);

  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  await post(env, "/api/room/move", { code: "PUSH", player_id: xSeat.id, board: 0, cell: 0 });
  assert.equal(roomObject.snapshots.at(-1).game.move_count, 1);

  await post(env, "/api/room/leave", { code: "PUSH", player_id: host.id, requester_id: host.id });
  assert.deepEqual(roomObject.closed, ["PUSH"]);
  assert.deepEqual(roomObject.actions, ["/api/room/join", "/api/room/move", "/api/room/leave"]);
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
  assert.equal(firstMove.room.game.game_id, "super_tactical_tac_toe");
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
  const highScore = stats.stats.high_scores.find((entry) => entry.player_id === xSeat.id);
  const rating = stats.stats.ratings.find((entry) => entry.player_id === xSeat.id);

  assert.equal(edited.ok, true);
  assert.equal(edited.player.id, xSeat.id);
  assert.equal(highScore.player_name, "Renamed Player");
  assert.equal(highScore.player_icon, "ZZ");
  assert.equal(rating.player_name, "Renamed Player");
  assert.equal(rating.player_icon, "ZZ");
}));

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
  let eventHub = env.EVENT_HUB.getByName("super_tic_tac_toe");
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

test("routes tactical lobby snapshots through the tactical event hub", async () => {
  const env = makeEnvWithEvents();
  const host = player("host", "Host");

  const presence = await post(env, "/api/lobby/presence", { game_id: "super_tactical_tac_toe", player: host });
  const tacticalHub = env.EVENT_HUB.getByName("super_tactical_tac_toe");
  const classicHub = env.EVENT_HUB.getByName("super_tic_tac_toe");

  assert.equal(presence.ok, true);
  assert.equal(tacticalHub.snapshots.at(-1).game_id, "super_tactical_tac_toe");
  assert.deepEqual(tacticalHub.snapshots.at(-1).lobby_players.map((item) => item.id), ["host"]);
  assert.equal(classicHub.snapshots.length, 0);
});
