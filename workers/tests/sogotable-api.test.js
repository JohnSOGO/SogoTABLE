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

  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.response.headers.get("Access-Control-Allow-Origin"), "https://sogotable.sogodojo.com");
  assert.equal(allowed.json.ok, true);
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
