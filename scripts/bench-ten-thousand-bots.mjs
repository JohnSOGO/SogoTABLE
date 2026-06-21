import worker, { __test } from "../workers/sogotable-api.js";

const TEN_THOUSAND_GAME_ID = "6d10f4a2c8b3";
const BOT_IDS = [
  { id: "7c91a4e2b6d0", name: "Sprout" },
  { id: "5e2c8a71d0f4", name: "Buddy" },
  { id: "b64d20f19a8c", name: "Cipher" },
  { id: "0f8a3c9d1e72", name: "Overlord" },
];

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
    if (this.sql.startsWith("CREATE TABLE") || this.sql.startsWith("ALTER TABLE")) {
      return { success: true };
    }
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

function player(id, name, color = "#1f7a5f") {
  return { id, name, icon: name.slice(0, 1), color };
}

async function request(env, method, path, body) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const response = await worker.fetch(new Request(`https://sogotable.test${path}`, init), env);
  return { json: await response.json() };
}

const get = async (env, path) => (await request(env, "GET", path)).json;
const post = async (env, path, body) => (await request(env, "POST", path, body)).json;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function withSeed(seed, fn) {
  const original = Math.random;
  Math.random = seededRandom(seed);
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

async function roomAction(env, path, body) {
  const result = await post(env, path, body);
  if (!result || result.ok !== true) {
    throw new Error(`${path} failed: ${JSON.stringify(result)}`);
  }
  if (!result.room) {
    throw new Error(`${path} returned no room: ${JSON.stringify(result)}`);
  }
  return result.room;
}

// The benchmark's "human" opponent takes the maximal scoring keep (the real
// worker scorer, so doubling / two-triplets stay in sync) and banks on a simple
// fixed policy. It is a constant baseline across all bot matchups.
function chooseScoringDiceIds(dice) {
  return __test.bestTenThousandKeep(dice || []).ids;
}

function shouldBank(seat, game) {
  // Cannot bank below the opening minimum (the server enforces it); press on.
  if (!seat.can_bank) return false;
  if (seat.score + seat.turn_score >= game.target_score) return true;
  const remaining = (seat.dice || []).filter((die) => !die.scored).length;
  if (remaining <= 2 && seat.turn_score >= 400) return true;
  if (seat.turn_score >= 750) return true;
  return false;
}

async function playGame(bot, gameIndex) {
  const env = makeEnv();
  const host = player(`host-${bot.id}-${gameIndex}`, `Host ${gameIndex}`);
  const roomCode = `R${String(gameIndex).padStart(3, "0")}`.slice(-4).toUpperCase();

  await post(env, "/api/players/create", { player: host });
  await post(env, "/api/room/create", { game_id: TEN_THOUSAND_GAME_ID, player: host, code: roomCode });
  await post(env, "/api/room/join-bot", { code: roomCode, host_id: host.id, bot_id: bot.id });
  let room = await roomAction(env, "/api/room/start", { code: roomCode, host_id: host.id });
  const humanSeat = room.players.find((seat) => !seat.is_bot);
  if (!humanSeat) throw new Error(`Human seat not found for ${roomCode}.`);

  let safety = 0;
  while (room && room.status !== "completed" && safety < 400) {
    safety += 1;
    const seat = room.game.players.find((entry) => entry.mark === humanSeat.mark);
    if (!seat) throw new Error(`Seat ${humanSeat.mark} not found.`);

    if (seat.phase === "farkled") {
      room = await roomAction(env, "/api/room/move", {
        code: room.code,
        player_id: humanSeat.id,
        action: { type: "ack_farkle" },
      });
      continue;
    }

    if (seat.phase === "ready") {
      room = await roomAction(env, "/api/room/move", {
        code: room.code,
        player_id: humanSeat.id,
        action: { type: "roll" },
      });
      continue;
    }

    if (seat.phase === "rolled") {
      const keepIds = chooseScoringDiceIds(seat.dice || []);
      // Rolls no longer auto-farkle: with no scoring play, the player declares
      // their own farkle (then acknowledges it on the next pass).
      const action = keepIds.length
        ? { type: "select", dice_ids: keepIds }
        : { type: "declare_farkle" };
      room = await roomAction(env, "/api/room/move", {
        code: room.code,
        player_id: humanSeat.id,
        action,
      });
      continue;
    }

    if (seat.phase === "selected") {
      const action = shouldBank(seat, room.game) ? "bank" : "reroll";
      room = await roomAction(env, "/api/room/move", {
        code: room.code,
        player_id: humanSeat.id,
        action: { type: action },
      });
      continue;
    }

    if (seat.phase === "done" && room.game.round_pending_advance && seat.can_roll) {
      room = await roomAction(env, "/api/room/move", {
        code: room.code,
        player_id: humanSeat.id,
        action: { type: "roll" },
      });
      continue;
    }

    if (seat.phase === "done") break;

    throw new Error(`Unhandled 10,000 seat phase: ${seat.phase}`);
  }

  if (room.status !== "completed") {
    throw new Error(`Game ${roomCode} did not complete.`);
  }

  const botRoomSeat = room.players.find((seat) => seat.id === bot.id);
  const hostRoomSeat = room.players.find((seat) => seat.id === host.id);
  const botSeat = room.game.players.find((seat) => seat.mark === botRoomSeat?.mark);
  const hostSeat = room.game.players.find((seat) => seat.mark === hostRoomSeat?.mark);
  return {
    bot: bot.name,
    botScore: botSeat ? botSeat.score : 0,
    hostScore: hostSeat ? hostSeat.score : 0,
    winner: room.game.winner === botRoomSeat?.mark ? "bot" : room.game.winner === hostRoomSeat?.mark ? "host" : null,
  };
}

async function run() {
  const runsPerBot = 100;
  const results = [];

  for (const bot of BOT_IDS) {
    let botScoreTotal = 0;
    let hostScoreTotal = 0;
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let completed = 0;

    for (let index = 0; index < runsPerBot; index += 1) {
      const seed = 1000 + index + bot.id.length;
      const result = await withSeed(seed, () => playGame(bot, index + 1));
      completed += 1;
      botScoreTotal += result.botScore;
      hostScoreTotal += result.hostScore;
      if (result.winner === "bot") wins += 1;
      else if (result.winner === "host") losses += 1;
      else draws += 1;
    }

    results.push({
      bot: bot.name,
      completed,
      wins,
      losses,
      draws,
      avgBotScore: botScoreTotal / completed,
      avgHostScore: hostScoreTotal / completed,
    });
  }

  results.sort((left, right) => right.avgBotScore - left.avgBotScore);

  console.log(`10,000 bot benchmark over ${runsPerBot} games per bot`);
  console.table(results.map((row) => ({
    bot: row.bot,
    completed: row.completed,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    avgBotScore: row.avgBotScore.toFixed(1),
    avgHostScore: row.avgHostScore.toFixed(1),
  })));

  const top = results[0];
  console.log(`Highest average score: ${top.bot} (${top.avgBotScore.toFixed(1)})`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
