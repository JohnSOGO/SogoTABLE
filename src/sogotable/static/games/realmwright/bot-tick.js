// Realmwright — bot think-time nudger (timing only; decides nothing).
//
// The server gives every unplaced bot an `act_at` (server epoch ms) and only
// releases it when some action arrives after that time. A seated human's
// client therefore sends `{ type: "BOT_TICK", round }` when the earliest
// bot's act_at passes. One timer, rescheduled on every snapshot:
//   local fire time = act_at − (server_now − Date.now()) + stagger
// where stagger = my index among human seats × 600 ms + 150 ms, so phones at
// one table don't all tick at once (the first wins; the rest get "No bot is
// ready yet." which the server rejects with no write — ignored silently).
// Never ticks while my own action is in flight; retries shortly after.
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
  if (!me || me.is_bot || game.status !== "playing") { cancel(); return; }
  const waiting = players.filter((p) => p.is_bot && !p.placed && !p.skipped && Number(p.act_at) > 0);
  if (!waiting.length) { cancel(); return; }
  const due = Math.min(...waiting.map((p) => Number(p.act_at)));
  // Clock offset is measured once, when this snapshot object first arrives.
  if (!offsets.has(game)) {
    const sn = Number(game.server_now);
    offsets.set(game, Number.isFinite(sn) && sn > 0 ? sn - Date.now() : 0);
  }
  const offset = offsets.get(game);
  const order = Array.isArray(game.seat_order) ? game.seat_order : players.map((p) => p.mark);
  const humans = order.filter((m) => { const p = players.find((x) => x.mark === m); return p && !p.is_bot; });
  const stagger = Math.max(0, humans.indexOf(myMark)) * STAGGER_MS + BASE_MS;
  const sig = `${game.round}|${due}`;
  if (sig !== T.sig) { T.sig = sig; T.retries = 0; }
  if (T.inFlight) return; // its outcome reschedules
  arm(due - offset + stagger - Date.now(), game.round, hooks);
}

function arm(wait, round, hooks) {
  cancel();
  T.timer = setTimeout(() => fire(round, hooks), Math.max(0, wait));
}

function fire(round, hooks) {
  T.timer = null;
  if (!hooks.mounted()) return;
  if (hooks.busy()) { arm(BUSY_RETRY_MS, round, hooks); return; }
  const sig = T.sig;
  const key = T.key;
  let result;
  try { result = Promise.resolve(hooks.send({ type: "BOT_TICK", round })); } catch { result = Promise.resolve("error"); }
  T.inFlight = result.catch(() => "error").then((error) => {
    if (T.key !== key) return;
    T.inFlight = null;
    // Success (or the table moved on): re-plan from the latest snapshot, which
    // may have arrived while this tick was still in flight.
    if (!error || T.sig !== sig) { if (T.last) syncBotTick(key, T.last.game, T.last.myMark, T.last.hooks); return; }
    const msg = String(error);
    if (/^Not sent/i.test(msg)) { arm(BUSY_RETRY_MS, round, hooks); return; }
    // "No bot is ready yet." (clock skew) or a transient failure: back off a bit.
    T.retries += 1;
    if (T.retries <= MAX_RETRIES) arm(800 * T.retries, round, hooks);
  });
}
