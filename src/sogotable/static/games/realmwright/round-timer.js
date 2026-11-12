// Realmwright — the round clock (timed play): view + warning sounds only.
//
// The server owns the clock: `round_deadline` (server epoch ms, 0 = untimed
// or paused) and `timer_paused_left` (ms left while paused). This module maps
// the deadline onto the local clock (server_now offset, measured once per
// snapshot), repaints the countdown in the status strip several times a
// second, and plays the warning: a wooden tick each second from 10 s, a
// sharper tick for the last 3, and a gong at zero — only for a player who
// still has a tile to place. Closing the round is the server's job (bot-tick.js
// nudges it at the deadline).
import { playCue } from "./sfx.js";

const WARN_FROM_S = 10;
const URGENT_FROM_S = 3;
const FRAME_MS = 200;

const offsets = new WeakMap();
let C = { key: "", interval: null, last: null, lastSec: null, gonged: "" };

function offsetFor(game) {
  if (!offsets.has(game)) {
    const sn = Number(game.server_now);
    offsets.set(game, Number.isFinite(sn) && sn > 0 ? sn - Date.now() : 0);
  }
  return offsets.get(game);
}

// { paused, msLeft } for a timed round in play, else null.
export function clockState(game, now = Date.now()) {
  if (!game || game.status !== "playing") return null;
  const pausedLeft = Number(game.timer_paused_left) || 0;
  if (pausedLeft > 0) return { paused: true, msLeft: pausedLeft };
  const deadline = Number(game.round_deadline) || 0;
  if (deadline <= 0) return null;
  return { paused: false, msLeft: Math.max(0, deadline - offsetFor(game) - now) };
}

export function clockText(ms) {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const clockWarn = (state) => Boolean(state && !state.paused && state.msLeft <= WARN_FROM_S * 1000);

function stillToPlay(game, myMark) {
  const me = (Array.isArray(game.players) ? game.players : []).find((p) => p.mark === myMark);
  return Boolean(me && !me.is_bot && !me.placed && !me.skipped && me.tile);
}

function frame() {
  const last = C.last;
  if (!last) return;
  const root = last.getRoot();
  const state = clockState(last.game);
  if (!root || !state) { stop(); return; }
  const el = root.querySelector(".rw-clock");
  if (el) {
    const time = el.querySelector(".rw-clock-time");
    if (time) time.textContent = clockText(state.msLeft);
    el.classList.toggle("rw-clock-warn", clockWarn(state));
  }
  if (state.paused) { C.lastSec = null; return; }
  const sec = Math.ceil(state.msLeft / 1000);
  if (sec === C.lastSec) return;
  C.lastSec = sec;
  if (!stillToPlay(last.game, last.myMark)) return;
  const roundKey = `${C.key}|${last.game.round}`;
  if (sec === 0 && C.gonged !== roundKey) { C.gonged = roundKey; playCue("timeUp"); }
  else if (sec > 0 && sec <= URGENT_FROM_S) playCue("tickUrgent");
  else if (sec > 0 && sec <= WARN_FROM_S) playCue("tick");
}

function stop() {
  clearInterval(C.interval);
  C.interval = null;
}

// Called on every paint. getRoot() returns the mounted game root or null.
export function syncRoundClock(key, game, myMark, getRoot) {
  if (C.key !== key) { stop(); C = { key, interval: null, last: null, lastSec: null, gonged: "" }; }
  C.last = { game, myMark, getRoot };
  if (!clockState(game)) { stop(); return; }
  if (!C.interval) C.interval = setInterval(frame, FRAME_MS);
  frame();
}
