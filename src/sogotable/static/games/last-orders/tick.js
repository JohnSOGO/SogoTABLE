// Last Orders — table clock nudger (timing only; decides nothing).
//
// The Worker has no timers. The projection carries `next_due_at` (server
// epoch ms: the earliest of the open window's close and every bot's think /
// step time) plus `server_now`. A seated human's client sends
// `{ type: "TICK" }` when it passes, and the server catches the table up.
// One timer, rescheduled on every snapshot:
//   local fire time = next_due_at − (server_now − Date.now()) + stagger
// where stagger = my index among human seats × 600 ms + 150 ms, so phones at
// one table don't all tick at once (the first wins; the rest get "Nothing is
// due yet.", rejected with no write — ignored silently). Never ticks while my
// own action is in flight; retries shortly after. Port of realmwright/bot-tick.js.
const STAGGER_MS = 600;
const BASE_MS = 150;
const BUSY_RETRY_MS = 400;
const MAX_RETRIES = 6;

const offsets = new WeakMap();
let T = { key: "", timer: null, sig: "", retries: 0, inFlight: null, last: null };

function cancel() {
  clearTimeout(T.timer);
  T.timer = null;
}

export function tickInFlight() {
  return T.inFlight;
}

// Server clock offset (server − local) for a snapshot, measured once when the
// snapshot object first arrives. Shared with the countdown ring.
export function clockOffset(game) {
  if (!game || typeof game !== "object") return 0;
  if (!offsets.has(game)) {
    const sn = Number(game.server_now);
    offsets.set(game, Number.isFinite(sn) && sn > 0 ? sn - Date.now() : 0);
  }
  return offsets.get(game);
}

// hooks: { mounted(): bool, busy(): bool, send(action): Promise<string|undefined> }
export function syncTick(key, game, myMark, hooks) {
  if (T.key !== key) { cancel(); T = { key, timer: null, sig: "", retries: 0, inFlight: null, last: null }; }
  T.last = { game, myMark, hooks };
  const players = Array.isArray(game && game.players) ? game.players : [];
  const me = players.find((p) => p.mark === myMark);
  const due = Number(game && game.next_due_at) || 0;
  if (!me || me.is_bot || game.status !== "playing" || !due) { cancel(); return; }
  const offset = clockOffset(game);
  const order = Array.isArray(game.seat_order) ? game.seat_order : players.map((p) => p.mark);
  const humans = order.filter((m) => { const p = players.find((x) => x.mark === m); return p && !p.is_bot; });
  const stagger = Math.max(0, humans.indexOf(myMark)) * STAGGER_MS + BASE_MS;
  const sig = `${game.step}|${due}`;
  if (sig !== T.sig) { T.sig = sig; T.retries = 0; }
  if (T.inFlight) return; // its outcome reschedules
  arm(due - offset + stagger - Date.now(), hooks);
}

export function stopTick() {
  cancel();
  T = { key: "", timer: null, sig: "", retries: 0, inFlight: null, last: null };
}

function arm(wait, hooks) {
  cancel();
  T.timer = setTimeout(() => fire(hooks), Math.max(0, wait));
}

function fire(hooks) {
  T.timer = null;
  if (!hooks.mounted()) return;
  if (hooks.busy()) { arm(BUSY_RETRY_MS, hooks); return; }
  const sig = T.sig;
  const key = T.key;
  let result;
  try { result = Promise.resolve(hooks.send({ type: "TICK" })); } catch { result = Promise.resolve("error"); }
  T.inFlight = result.catch(() => "error").then((error) => {
    if (T.key !== key) return;
    T.inFlight = null;
    // Success (or the table moved on): re-plan from the latest snapshot, which
    // may have arrived while this tick was still in flight.
    if (!error || T.sig !== sig) { if (T.last) syncTick(key, T.last.game, T.last.myMark, T.last.hooks); return; }
    const msg = String(error);
    if (/^Not sent/i.test(msg)) { arm(BUSY_RETRY_MS, hooks); return; }
    // "Nothing is due yet." (clock skew) or a transient failure: back off a bit.
    T.retries += 1;
    if (T.retries <= MAX_RETRIES) arm(500 * T.retries, hooks);
  });
}
