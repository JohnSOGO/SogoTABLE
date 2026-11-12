// Hidden Isles — bot think-time nudger (timing only; decides nothing).
//
// The server gives a waiting bot seat an `act_at` (server epoch ms) and only
// releases it when some action arrives after that time. A seated human's
// client therefore sends `{ type: "BOT_TICK", turn }` when the earliest
// bot's act_at passes. One timer, rescheduled on every snapshot:
//   local fire time = act_at − (server_now − Date.now()) + stagger
// where stagger = my index among human seats × 600 ms + 150 ms, so phones at
// one table don't all tick at once (the first wins; the rest get a "not
// ready" / stale error which is ignored). Only while the game is playing in
// the clue or guess phase. Never ticks while my own action is in flight.
const STAGGER_MS = 600;
const BASE_MS = 150;
const BUSY_RETRY_MS = 450;
const MAX_RETRIES = 6;

const offsets = new WeakMap();
let T = { key: "", timer: null, sig: "", retries: 0, inFlight: null, last: null };

function cancel() {
  clearTimeout(T.timer);
  T.timer = null;
}

export function botTickInFlight() {
  return T.inFlight;
}

// hooks: { mounted(): bool, busy(): bool, send(action): Promise<string|undefined> }
export function syncBotTick(key, game, myMark, hooks) {
  if (T.key !== key) { cancel(); T = { key, timer: null, sig: "", retries: 0, inFlight: null, last: null }; }
  T.last = { game, myMark, hooks };
  const players = Array.isArray(game && game.players) ? game.players : [];
  const me = players.find((p) => p.mark === myMark);
  const live = game && game.status === "playing" && (game.phase === "clue" || game.phase === "guess");
  if (!me || me.is_bot || !live) { cancel(); return; }
  const waiting = players.filter((p) => p.is_bot && Number(p.act_at) > 0);
  if (!waiting.length) { cancel(); return; }
  const due = Math.min(...waiting.map((p) => Number(p.act_at)));
  // Clock offset is measured once, when this snapshot object first arrives.
  if (!offsets.has(game)) {
    const sn = Number(game.server_now);
    offsets.set(game, Number.isFinite(sn) && sn > 0 ? sn - Date.now() : 0);
  }
  const offset = offsets.get(game);
  const humans = players.filter((p) => !p.is_bot).map((p) => p.mark);
  const stagger = Math.max(0, humans.indexOf(myMark)) * STAGGER_MS + BASE_MS;
  const sig = `${game.turn}|${game.phase}|${due}`;
  if (sig !== T.sig) { T.sig = sig; T.retries = 0; }
  if (T.inFlight) return; // its outcome reschedules
  arm(due - offset + stagger - Date.now(), game.turn, hooks);
}

function arm(wait, turn, hooks) {
  cancel();
  T.timer = setTimeout(() => fire(turn, hooks), Math.max(0, wait));
}

function fire(turn, hooks) {
  T.timer = null;
  if (!hooks.mounted()) return;
  if (hooks.busy()) { arm(BUSY_RETRY_MS, turn, hooks); return; }
  const sig = T.sig;
  const key = T.key;
  let result;
  try { result = Promise.resolve(hooks.send({ type: "BOT_TICK", turn })); } catch { result = Promise.resolve("error"); }
  T.inFlight = result.catch(() => "error").then((error) => {
    if (T.key !== key) return;
    T.inFlight = null;
    // Success (or the table moved on): re-plan from the latest snapshot, which
    // may have arrived while this tick was still in flight.
    if (!error || T.sig !== sig) { if (T.last) syncBotTick(key, T.last.game, T.last.myMark, T.last.hooks); return; }
    const msg = String(error);
    if (/^Not sent/i.test(msg)) { arm(BUSY_RETRY_MS, turn, hooks); return; }
    // "No bot is ready yet." (clock skew) or a transient failure: back off a bit.
    T.retries += 1;
    if (T.retries <= MAX_RETRIES) arm(800 * T.retries, turn, hooks);
  });
}
