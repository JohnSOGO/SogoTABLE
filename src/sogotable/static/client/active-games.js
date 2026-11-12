// The player's active rooms across games: the list behind the game switcher and
// the "a game needs you" alerts. Seeded from /api/my-rooms, kept current by the
// viewed room's snapshots and by background room watchers, and remembering
// which rooms this tab stepped out of while keeping its seat ("parked").
//
// It owns no turn logic: "needs me" is read from the server-prepared
// room.awaiting_marks (each game's awaitingMarks) against my seat's mark. It
// owns no sockets (the injected `watch` makes them) and no DOM. Hot-seat rooms
// and solo-vs-bots rooms are listed but never watched or alerted.
import { PARKED_ROOMS_KEY } from "../storage.js";
import { fetchJson } from "../api-client.js";
import { createRoomWatcher } from "../realtime.js";
import { getDeviceSelectedPlayerId } from "./session-store.js";

const DEFAULTS = {
  getPlayerId: getDeviceSelectedPlayerId,
  fetchMyRooms: async () => (await fetchJson(`/api/my-rooms?player_id=${encodeURIComponent(getDeviceSelectedPlayerId() || "")}`)).rooms,
  watch: createRoomWatcher,
};
// deps: onNeedsMe(entry), onChange(); getPlayerId / fetchMyRooms / watch
// default to the real session, HTTP and socket (tests override them).
let deps = null;
let foregroundWired = false;
const rooms = new Map();      // code → latest summary/room dict
const watchers = new Map();   // code → { stop }
const alerted = new Set();    // `${code}:${revision}` already alerted
let viewedCode = "";
let parked = loadParked();
let seededFor = "";

function loadParked() {
  try { return new Set(JSON.parse(sessionStorage.getItem(PARKED_ROOMS_KEY) || "[]")); } catch { return new Set(); }
}
function saveParked() {
  try { sessionStorage.setItem(PARKED_ROOMS_KEY, JSON.stringify([...parked])); } catch { /* storage blocked */ }
}

export function configureActiveGames(dependencies) {
  deps = { ...DEFAULTS, ...dependencies };
  if (foregroundWired || typeof document === "undefined") return;
  foregroundWired = true;
  // Back from the background: re-seed (watcher sockets may have been frozen).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshActiveGames();
  });
}

function playerId() {
  return deps ? String(deps.getPlayerId() || "") : "";
}

function mySeat(room) {
  const id = playerId();
  return id && room && Array.isArray(room.players) ? room.players.find((seat) => seat.id === id && !seat.away) || null : null;
}

function isSolo(room) {
  const id = playerId();
  return !room.players.some((seat) => seat.id !== id && seat.kind !== "bot" && !seat.away);
}

function watchable(room) {
  return Boolean(room && room.status === "active" && !room.local_mode && mySeat(room) && !isSolo(room));
}

function needsMe(room) {
  const seat = mySeat(room);
  return Boolean(seat && seat.mark && room.status === "active" && Array.isArray(room.awaiting_marks) && room.awaiting_marks.includes(seat.mark));
}

// Keep exactly one watcher per watchable room the player is not viewing.
function syncWatchers() {
  if (!deps) return;
  const id = playerId();
  for (const [code, watcher] of watchers) {
    const room = rooms.get(code);
    if (code === viewedCode || !watchable(room)) { watcher.stop(); watchers.delete(code); }
  }
  for (const [code, room] of rooms) {
    if (code === viewedCode || watchers.has(code) || !watchable(room)) continue;
    watchers.set(code, deps.watch(code, id, { onSnapshot: noteRoom, onClosed: dropRoom }));
  }
}

function maybeAlert(room, previous) {
  if (!deps || room.code === viewedCode || !watchable(room) || !needsMe(room)) return;
  if (previous && needsMe(previous)) return; // already waiting on me — alert on the edge only
  const key = `${room.code}:${room.revision}`;
  if (alerted.has(key)) return;
  alerted.add(key);
  deps.onNeedsMe(entryFor(room));
}

// Any room dict or summary for a room the player may sit at (viewed snapshots,
// watcher snapshots, join/create responses).
export function noteRoom(room) {
  if (!room || !room.code) return;
  const previous = rooms.get(room.code);
  if (previous && Number(room.revision || 0) < Number(previous.revision || 0)) return; // stale
  if (!mySeat(room) || room.status === "completed") {
    if (previous) dropRoom(room.code);
    return;
  }
  rooms.set(room.code, room);
  maybeAlert(room, previous);
  syncWatchers();
  if (deps) deps.onChange();
}

function dropRoom(code) {
  rooms.delete(code);
  const watcher = watchers.get(code);
  if (watcher) { watcher.stop(); watchers.delete(code); }
  if (parked.delete(code)) saveParked();
  if (deps) deps.onChange();
}

// Re-seed from the server (boot, foreground, player switch).
export async function refreshActiveGames() {
  if (!deps) return;
  const id = playerId();
  if (!id) { reset(); return; }
  if (seededFor !== id) reset();
  seededFor = id;
  let list;
  try { list = await deps.fetchMyRooms(); } catch { return; }
  if (playerId() !== id || !Array.isArray(list)) return;
  const live = new Set(list.map((room) => room.code));
  for (const code of [...rooms.keys()]) if (!live.has(code)) dropRoom(code);
  list.forEach((room) => {
    const previous = rooms.get(room.code);
    // A summary carries no game; keep a richer dict we already hold at the same revision.
    if (previous && Number(previous.revision || 0) >= Number(room.revision || 0)) return;
    noteRoom(previous && previous.game ? { ...previous, ...room } : room);
  });
  syncWatchers();
  deps.onChange();
}

function reset() {
  for (const watcher of watchers.values()) watcher.stop();
  watchers.clear();
  rooms.clear();
  alerted.clear();
  seededFor = "";
  if (deps) deps.onChange();
}

// The room on screen (null when none). Viewing a room un-parks it.
export function setViewedRoom(code) {
  viewedCode = code || "";
  if (viewedCode && parked.delete(viewedCode)) saveParked();
  syncWatchers();
  if (deps) deps.onChange();
}

export function getViewedRoomCode() {
  return viewedCode;
}

// Stepped out to the dashboard but kept the seat.
export function parkRoom(code) {
  if (!code) return;
  parked.add(code);
  saveParked();
}

export function isParked(code) {
  return parked.has(code);
}

function entryFor(room) {
  const seat = mySeat(room);
  return {
    code: room.code,
    gameId: room.game_id,
    status: room.status,
    started: Boolean(room.started),
    needsMe: needsMe(room),
    viewing: room.code === viewedCode,
    solo: isSolo(room),
    localMode: Boolean(room.local_mode),
    myMark: seat ? seat.mark : "",
    players: room.players,
    awaiting: Array.isArray(room.awaiting_marks) ? room.awaiting_marks : [],
  };
}

// Prepared list for the switcher: games needing me first, then the rest.
export function activeGamesList() {
  return [...rooms.values()]
    .map(entryFor)
    .sort((a, b) => Number(b.needsMe) - Number(a.needsMe) || String(a.code).localeCompare(String(b.code)));
}

// How many games other than the one on screen are waiting on me (solo and
// hot-seat tables always "wait on me", so they never count toward the badge).
export function needsMeElsewhereCount() {
  return activeGamesList().filter((entry) => entry.needsMe && !entry.viewing && !entry.solo && !entry.localMode).length;
}
