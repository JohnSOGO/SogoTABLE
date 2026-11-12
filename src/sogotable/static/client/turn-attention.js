// Out-of-page "your turn" attention. Consumes a prepared is-my-turn flag (the
// turn-status controller already decides whose turn it is) and turns it into
// device signals: a "● Your turn" tab-title prefix, the installed-app badge, a
// short vibration when the turn arrives, and a Screen Wake Lock while a room is
// open so the phone does not dim mid-game. Owns no turn logic. Browser globals
// are touched only at call time so the module imports cleanly in Node.

const TITLE_PREFIX = "● Your turn · ";
const VIBRATE_PATTERN = [60, 40, 60];

let active = false;
let myTurn = false;
let baseTitle = "";
let wakeLock = null;
let visibilityWired = false;

function setTitle() {
  if (typeof document === "undefined") return;
  if (!baseTitle) baseTitle = document.title.replace(TITLE_PREFIX, "") || "SogoTable";
  document.title = active && myTurn ? `${TITLE_PREFIX}${baseTitle}` : baseTitle;
}

function setBadge() {
  if (typeof navigator === "undefined") return;
  try {
    if (active && myTurn && navigator.setAppBadge) navigator.setAppBadge(1).catch(() => {});
    else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
  } catch (_) { /* badging unsupported */ }
}

async function acquireWakeLock() {
  if (!active || wakeLock || typeof navigator === "undefined" || !navigator.wakeLock) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = null; });
  } catch (_) {
    wakeLock = null; // denied (battery saver, iframe) — the game still works
  }
}

function releaseWakeLock() {
  if (!wakeLock) return;
  const lock = wakeLock;
  wakeLock = null;
  lock.release().catch(() => {});
}

function wireVisibility() {
  if (visibilityWired || typeof document === "undefined") return;
  visibilityWired = true;
  // The browser drops the lock when the tab hides; take it back on return.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") acquireWakeLock();
  });
}

// Room opened (remote multi-phone play only — the shell skips hot-seat and solo).
export function startTurnAttention() {
  active = true;
  wireVisibility();
  acquireWakeLock();
  setTitle();
  setBadge();
}

// Room closed or switched to a mode that needs no signals.
export function stopTurnAttention() {
  active = false;
  myTurn = false;
  releaseWakeLock();
  setTitle();
  setBadge();
}

// Fed on every turn-status render; buzzes only on the not-my-turn → my-turn edge.
export function setMyTurn(isMine) {
  const next = Boolean(isMine);
  const arrived = active && next && !myTurn;
  myTurn = next;
  setTitle();
  setBadge();
  if (arrived && typeof navigator !== "undefined" && navigator.vibrate) {
    try { navigator.vibrate(VIBRATE_PATTERN); } catch (_) { /* unsupported */ }
  }
}

// Shell hook, called with every applied room snapshot (and with null on exit).
// Reads the server-prepared `room.awaiting_marks` (each game's awaitingMarks, so
// simultaneous and phase-driven games light it too), falling back to the
// platform-wide `game.current_player` for an older snapshot without it.
export function syncTurnAttention(room, localSeat, isSolo) {
  const remote = Boolean(room && !room.local_mode && !isSolo);
  if (!remote) {
    if (active) stopTurnAttention();
    return;
  }
  if (!active) startTurnAttention();
  const playing = Boolean(room.started && room.game && room.game.status === "playing");
  const mark = localSeat && localSeat.mark;
  const waitingOnMe = Array.isArray(room.awaiting_marks) ? room.awaiting_marks.includes(mark) : mark === room.game.current_player;
  setMyTurn(Boolean(playing && mark && waitingOnMe));
}
