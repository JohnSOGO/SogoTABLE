// Persistence: the single optimistic-lock D1 state row (load/save/retry +
// schema). Extracted from the Worker so storage has one owner; it makes no game
// decisions. The Worker imports loadState/saveState/withStateRetry; ensureSchema
// and writeChanged stay module-private.

// Finished games are invisible to the UI (the lobby only lists active/waiting)
// but stay in the single state blob forever unless a player explicitly leaves,
// so they accumulate and bloat every read/write. Garbage-collect them on load:
// keep a finished game a short grace window (rematch/review still works), then
// drop it. This is data-lifecycle/retention only — it makes no game decisions,
// and stats live in data.stats so no scores or history are lost.
const COMPLETED_ROOM_TTL_MS = 3 * 60 * 60 * 1000; // ~3 hours
const COMPLETED_ROOM_STATUSES = new Set(["x_won", "o_won", "draw", "complete"]);

function pruneCompletedRooms(data, now) {
  if (!data.rooms) return;
  for (const [code, room] of Object.entries(data.rooms)) {
    const status = room && room.game && room.game.status;
    if (!COMPLETED_ROOM_STATUSES.has(status)) continue;
    // Start the clock the first time we see a game finished (older rooms have no
    // stamp); drop it once the grace window has elapsed.
    if (!room.completed_at) { room.completed_at = now; continue; }
    if (room.completed_at < now - COMPLETED_ROOM_TTL_MS) delete data.rooms[code];
  }
  // Drop invites that point at a room we just removed (or any missing room).
  if (data.invites) {
    for (const [id, invite] of Object.entries(data.invites)) {
      if (invite && invite.room_code && !data.rooms[invite.room_code]) delete data.invites[id];
    }
  }
}

async function loadState(env) {
  await ensureSchema(env);
  const row = await env.SOGOTABLE_STATE.prepare("SELECT value, version FROM app_state WHERE key = ?").bind("state").first();
  const data = row ? JSON.parse(row.value) : { players: [], rooms: {}, invites: {}, lobbyViewers: {} };
  if (!data.stats) data.stats = { high_scores: {}, ratings: {}, personal: {} };
  if (!data.stats.high_scores) data.stats.high_scores = {};
  if (!data.stats.ratings) data.stats.ratings = {};
  if (!data.stats.personal) data.stats.personal = {};
  pruneCompletedRooms(data, Date.now());
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

export { loadState, saveState, withStateRetry };
