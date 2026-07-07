// Shared test harness for the Worker suite: the in-memory D1 + Durable Object
// mocks, env factories, and request helpers every test depends on. Extracted from
// sogotable-api.test.js so the test bodies aren't buried under ~320 lines of
// setup, and so future per-domain test files can import one harness.
import worker, { EventHubDurableObject, RoomDurableObject, RoomFactoryDurableObject, __test as tenThousandTest } from "../sogotable-api.js";
const CLASSIC_GAME_ID = "a3f19c6e42b8";
const TACTICAL_GAME_ID = "d7e4a91f0c23";
const BOXES_GAME_ID = "4b7e2d9a6c10";
const BATTLESHIP_GAME_ID = "9c2f7a81d4e6";
const QUORIDOR_GAME_ID = "8f5d2c7a1b90";
const TEN_THOUSAND_GAME_ID = "6d10f4a2c8b3";
const YAHTZEE_GAME_ID = "2c8a5f1e9d74";
const MAZEWRIGHT_GAME_ID = "5e3b9a7c1f04";
const RTTA_GAME_ID = "7a1c3e9f5b28";
const ZOMBIE_DICE_GAME_ID = "3f9b7d2e8a41";
const LIARS_DICE_GAME_ID = "b6e4a2d91f57";
const NO_THANKS_GAME_ID = "c5d9e1f3a627";
const HEARTS_GAME_ID = "f2a8d5c3b917";
const POTION_LAB_GAME_ID = "e7c1a4b9d206";
const MYSTIC_WOOD_GAME_ID = "a9f2c7e14b83";
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
  return tenThousandTest.allowOwnerAuthBypass(
    tenThousandTest.allowDirectRoomAuthority({
      SOGOTABLE_STATE: new InMemoryD1(),
      SOGOTABLE_SUPERUSER_PASSCODE: "1234",
      SOGOTABLE_SUPERUSER_PLAYER_IDS: "sogo-id",
    }),
  );
}

function makeProductionEnv() {
  return {
    SOGOTABLE_STATE: new InMemoryD1(),
    SOGOTABLE_SUPERUSER_PASSCODE: "1234",
    SOGOTABLE_SUPERUSER_PLAYER_IDS: "sogo-id",
  };
}

function makeStrictEnvWithRooms() {
  const env = makeProductionEnv();
  env.ROOM_OBJECT = new MockRoomNamespace(env);
  env.ROOM_FACTORY = new MockRoomFactoryNamespace(env);
  return env;
}

function makeEnvWithRooms() {
  const env = makeEnv();
  env.ROOM_OBJECT = new MockRoomNamespace(env);
  env.ROOM_FACTORY = new MockRoomFactoryNamespace(env);
  return env;
}

function makeEnvWithEvents() {
  const env = makeEnv();
  env.EVENT_HUB = new MockEventHubNamespace();
  env.ROOM_OBJECT = new MockRoomNamespace(env);
  env.ROOM_FACTORY = new MockRoomFactoryNamespace(env);
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
      const delegatedEnv = tenThousandTest.allowDirectRoomAuthority({ ...this.env, ROOM_OBJECT: null });
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

class MockRoomFactoryNamespace {
  constructor(env) {
    this.env = env;
    this.objects = new Map();
  }

  getByName(name) {
    if (!this.objects.has(name)) this.objects.set(name, new MockRoomFactoryObject(name, this.env));
    return this.objects.get(name);
  }
}

class MockRoomFactoryObject {
  constructor(name, env) {
    this.name = name;
    this.env = env;
    this.actions = [];
    this.queue = Promise.resolve();
  }

  async fetch(request) {
    const run = async () => {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/__room_create") {
        const { pathname, payload } = await request.json();
        this.actions.push(pathname);
        const delegatedEnv = tenThousandTest.allowDirectRoomAuthority({ ...this.env, ROOM_FACTORY: null });
        return worker.fetch(new Request(`https://sogotable.test${pathname}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }), delegatedEnv);
      }
      return Response.json({ ok: false, error: "Unhandled mock room factory request." }, { status: 404 });
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
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

class MockRateLimitBinding {
  constructor(limit = Infinity) {
    this.allowed = limit;
    this.calls = [];
    this.counts = new Map();
  }

  async limit({ key }) {
    this.calls.push(key);
    const nextCount = (this.counts.get(key) || 0) + 1;
    this.counts.set(key, nextCount);
    return { success: nextCount <= this.allowed };
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

function stateData(env) {
  return JSON.parse(env.SOGOTABLE_STATE.rows.get("state").value);
}

export {
  EventHubDurableObject, RoomDurableObject, RoomFactoryDurableObject, tenThousandTest,
  MockHibernatedSocket, MockRateLimitBinding,
  CLASSIC_GAME_ID, TACTICAL_GAME_ID, BOXES_GAME_ID, BATTLESHIP_GAME_ID, QUORIDOR_GAME_ID, TEN_THOUSAND_GAME_ID, YAHTZEE_GAME_ID, MAZEWRIGHT_GAME_ID, RTTA_GAME_ID, ZOMBIE_DICE_GAME_ID, LIARS_DICE_GAME_ID, NO_THANKS_GAME_ID, HEARTS_GAME_ID, POTION_LAB_GAME_ID, MYSTIC_WOOD_GAME_ID, HEX_ID_PATTERN,
  makeEnv, makeProductionEnv, makeStrictEnvWithRooms, makeEnvWithRooms, makeEnvWithEvents,
  player, request, get, post, createActiveRoom, withMockRandom, mutateState, stateData,
};
