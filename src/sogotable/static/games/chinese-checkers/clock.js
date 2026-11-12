// Chinese Checkers — the round / turn countdown (PLAN.md "Clock").
//
// The server owns time: the projection carries `deadline` (server epoch ms or
// null) and `server_now` (server epoch ms when the projection was made). On
// each NEW snapshot (new server_now) we take offset = server_now − Date.now(),
// so the local estimate of server time is Date.now() + offset and phones with a
// wrong clock still count down correctly.
//
// A local interval repaints ONLY the clock bar and any [data-cc-secs] spans in
// the play root — never the board. In the last 3 seconds the bar turns the warn
// colour and a soft tick plays once a second. At zero the client sends exactly
// one { type: "TICK" } per deadline per device, and only when this viewer holds
// a seat; the server enforces deadlines lazily, so TICK is what closes a round
// in a room where nobody else acts. A TICK that arrives early is a silent no-op
// server-side; the next snapshot (or another device's TICK) moves things on.
import { UI } from "./branding.js";
import { playCue } from "./sfx.js";

const PERIOD_MS = 200;
const WARN_MS = 3000;
const TICK_RETRY_MS = 2500;
const TICK_GRACE_MS = 150; // fire just after zero, so rounding never makes us early

let C = fresh("");

function fresh(key) {
  return { key, deadline: null, total: 0, offset: 0, serverNow: null, sentFor: null, lastSec: null, root: null, seated: false, send: null, timer: null };
}

export const clockHtml = () => `<div class="cc-clock" hidden title="${UI.clockTitle}" role="timer" aria-live="off">
    <span class="cc-clock-secs"></span><span class="cc-clock-bar"><span class="cc-clock-fill"></span></span>
  </div>`;

// Server time estimate (ms).
const serverNow = () => Date.now() + C.offset;

// Whole seconds left on the current deadline (null when no clock runs).
export function clockSecondsLeft() {
  if (!C.deadline) return null;
  return Math.max(0, Math.ceil((C.deadline - serverNow()) / 1000));
}

// Called on every snapshot. key = room+epoch; root = the .cc-play element;
// sendTick() posts { type: "TICK" } (errors are ignored by the caller).
export function syncClock({ key, root, game, seated, sendTick }) {
  if (C.key !== key) { stop(); C = fresh(key); }
  if (Number.isFinite(game.server_now) && game.server_now !== C.serverNow) {
    C.serverNow = game.server_now;
    C.offset = game.server_now - Date.now();
  }
  const playing = game.status === "playing";
  const deadline = playing && Number.isFinite(game.deadline) ? game.deadline : null;
  C.deadline = deadline;
  C.total = Math.max(1, Number(game.options && game.options.timer) || 0) * 1000;
  C.root = root;
  C.seated = Boolean(seated);
  C.send = sendTick;
  if (deadline && !C.timer) C.timer = setInterval(tick, PERIOD_MS);
  if (!deadline) stop();
  tick();
}

function stop() {
  if (C.timer) clearInterval(C.timer);
  C.timer = null;
  if (C.root) {
    const el = C.root.querySelector(".cc-clock");
    if (el) el.hidden = true;
  }
}

function tick() {
  const root = C.root;
  if (!root || !root.isConnected) { stop(); return; }
  const el = root.querySelector(".cc-clock");
  if (!C.deadline) { if (el) el.hidden = true; return; }
  const left = C.deadline - serverNow();
  const secs = Math.max(0, Math.ceil(left / 1000));
  const warn = left <= WARN_MS;
  if (el) {
    el.hidden = false;
    el.classList.toggle("cc-clock-warn", warn);
    el.classList.toggle("cc-clock-zero", left <= 0);
    const frac = Math.max(0, Math.min(1, left / C.total));
    el.style.setProperty("--cc-clock", `${(frac * 100).toFixed(1)}%`);
    el.querySelector(".cc-clock-secs").textContent = `${secs}s`;
  }
  root.querySelectorAll("[data-cc-secs]").forEach((span) => { span.textContent = String(secs); });
  if (secs !== C.lastSec) {
    if (warn && secs > 0 && C.lastSec !== null && !(typeof document !== "undefined" && document.hidden)) playCue("tick", secs);
    C.lastSec = secs;
  }
  // Each device waits a random 0–600 ms past zero so that, at a full table, the
  // first TICK usually lands and its snapshot reaches the others before they
  // fire (fewer D1 writes). One retry 2.5 s later covers a TICK that arrived a
  // hair early and was ignored.
  if (C.jitter == null) C.jitter = Math.floor(Math.random() * 600);
  const firstDue = left <= -(TICK_GRACE_MS + C.jitter) && C.sentFor !== C.deadline;
  const retryDue = C.sentFor === C.deadline && !C.retried && left <= -(TICK_GRACE_MS + C.jitter + TICK_RETRY_MS);
  if ((firstDue || retryDue) && C.seated && typeof C.send === "function") {
    if (retryDue) C.retried = true; else { C.sentFor = C.deadline; C.retried = false; }
    try { Promise.resolve(C.send()).catch(() => {}); } catch (err) { /* ignored: any later action or device advances the clock */ }
  }
}
