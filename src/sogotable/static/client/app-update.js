// Auto-update: notice a new deploy, reload safely, and put the player back where
// they were. Three parts, one concern ("keep open tabs on the current build"):
//   1. Detect — compare /revision.json (stamped per Pages build) to the revision
//      this page booted with. Checks run on foreground/focus/online, on a slow
//      visible-only interval, after a socket reconnect (a Worker deploy drops
//      sockets), and when the Worker reports a new deploy id (skew hint).
//   2. Reload — only when the front-end revision really changed, and never while
//      a move is in flight or the player is typing. Mid-game it also waits for the
//      player's turn to finish (see turnSettled): a turn-based game reloads once
//      it is someone else's turn; a parallel or solo game reloads right after
//      the player's next action lands. A hidden tab reloads straight away. A short-lived sessionStorage
//      marker records where the player was (screen, game, room code).
//   3. Resume — the next page load reads the marker, re-enters that room or
//      screen, then fades the logo overlay out. Room state itself lives on the
//      server; the seat comes from the device session store, so nothing is lost.
// The shell injects everything app-specific through wireAppUpdate(ctx). Load-safe:
// nothing runs at import time (listeners/timers start in wireAppUpdate). Must not
// import app.js.

import { APP_UPDATE_RESUME_KEY } from "../storage.js";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;     // slow backstop; events do the real work
const SKEW_RECHECK_DELAYS_MS = [15000, 45000, 90000, 180000]; // Pages can trail a Worker deploy
const DEFER_RETRY_MS = 1500;
const RESUME_MAX_AGE_MS = 60 * 1000;
const OVERLAY_MIN_MS = 600;                  // long enough to read as intentional, not a flicker
const MAX_AUTO_RELOADS = 3;                  // per tab per window, guards a reload loop
const RELOAD_WINDOW_MS = 10 * 60 * 1000;

let ctx = null;
let bootRevision = "";
let workerVersion = "";
let checking = false;
let reloading = false;
let skewTimers = [];
let actionCount = 0;      // this tab's successful room actions (noteActionCompleted)
let turnSnapshot = null;  // turn state when the pending reload was first held back

export function wireAppUpdate(context) {
  ctx = context;
  if (typeof window === "undefined") return;
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkForUpdate("foreground"); });
  window.addEventListener("focus", () => checkForUpdate("focus"));
  window.addEventListener("online", () => checkForUpdate("online"));
  setInterval(() => { if (document.visibilityState === "visible") checkForUpdate("interval"); }, CHECK_INTERVAL_MS);
}


// The transport reports each successful POST; room actions mark a turn boundary
// for games with no shared "whose turn" (parallel play, solo).
export function noteActionCompleted(url) {
  if (String(url || "").startsWith("/api/room/")) actionCount += 1;
}

// ctx.turnState() → { inPlay, myTurn, turnKey }. turnKey names the current turn
// ("" when the game has no shared turn order). Safe to reload when nobody is
// mid-turn here: not in a live game, someone else's turn, the turn has moved on
// since the update was found, or (no turn order) an action of ours has landed.
export function turnSettled(state, snapshot, actions) {
  if (!state || !state.inPlay) return true;
  if (state.turnKey) return !state.myTurn || Boolean(snapshot && snapshot.turnKey !== state.turnKey);
  return Boolean(snapshot && actions > snapshot.actions);
}

// The transport reports the Worker deploy id it saw on a response. A change means
// the backend was redeployed; the matching front end may land a little later, so
// re-check now and a few more times over the next few minutes.
export function noteWorkerVersion(version) {
  const next = String(version || "");
  if (!next) return;
  if (!workerVersion) { workerVersion = next; return; }
  if (next === workerVersion) return;
  workerVersion = next;
  console.info(`[update] worker redeployed (${next}) — checking for a new front end`);
  skewTimers.forEach(clearTimeout);
  checkForUpdate("worker-version");
  skewTimers = SKEW_RECHECK_DELAYS_MS.map((delay) => setTimeout(() => checkForUpdate("worker-version-recheck"), delay));
}

export async function checkForUpdate(reason = "manual") {
  if (!ctx || checking || reloading || !bootRevision) return false;
  checking = true;
  try {
    const latest = (await fetchRevisionStatus()).status.revision;
    if (!latest || latest === bootRevision) return false;
    console.info(`[update] new build ${latest} (running ${bootRevision}, via ${reason})`);
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
      navigator.serviceWorker.getRegistration().then((reg) => reg && reg.update()).catch(() => {});
    }
    reloadWhenSafe(latest);
    return true;
  } catch {
    return false;   // Pages can briefly 404 mid-deploy; the next trigger retries
  } finally {
    checking = false;
  }
}

function reloadWhenSafe(latest) {
  if (reloading) return;
  if (!canAutoReload()) {
    console.warn("[update] too many automatic reloads — waiting for a manual refresh");
    return;
  }
  if (isBusy()) {
    setTimeout(() => reloadWhenSafe(latest), DEFER_RETRY_MS);
    return;
  }
  reloading = true;
  showUpdateOverlay();
  writeResumeMarker(latest);
  recordAutoReload();
  // One frame so the overlay paints before the page goes away.
  setTimeout(() => window.location.reload(), 120);
}

function isBusy() {
  if (ctx.isBusy && ctx.isBusy()) return true;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;   // nobody watching: reload now
  const state = ctx.turnState ? ctx.turnState() : null;
  if (!turnSnapshot) turnSnapshot = { turnKey: state && state.turnKey, actions: actionCount };
  if (!turnSettled(state, turnSnapshot, actionCount)) return true;
  const active = document.activeElement;
  if (!active) return false;
  const tag = (active.tagName || "").toLowerCase();
  return tag === "textarea" || (tag === "input" && !["button", "checkbox", "radio", "range"].includes(active.type)) || active.isContentEditable;
}

function writeResumeMarker(revision) {
  try {
    const state = (ctx.getResumeState && ctx.getResumeState()) || {};
    sessionStorage.setItem(APP_UPDATE_RESUME_KEY, JSON.stringify({ ...state, revision, ts: Date.now() }));
  } catch {
    // Storage blocked: the reload still happens; the player re-enters by hand.
  }
}

// Reads and clears the marker. Returns the saved position or null.
export function takeResumeMarker() {
  try {
    const raw = sessionStorage.getItem(APP_UPDATE_RESUME_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(APP_UPDATE_RESUME_KEY);
    const marker = JSON.parse(raw);
    if (!marker || Date.now() - Number(marker.ts || 0) > RESUME_MAX_AGE_MS) return null;
    return marker;
  } catch {
    return null;
  }
}

// Boot path: if this load came from an auto-update, put the player back, then
// fade the overlay. The overlay is already up (index.html sets it before paint).
export async function resumeAfterUpdate() {
  const marker = takeResumeMarker();
  if (!marker) { hideUpdateOverlay(); return false; }
  const started = Date.now();
  try {
    if (ctx && ctx.resume) await ctx.resume(marker);
  } catch (error) {
    console.warn("[update] could not restore position after update", error);
  }
  const wait = Math.max(0, OVERLAY_MIN_MS - (Date.now() - started));
  setTimeout(hideUpdateOverlay, wait);
  return true;
}

export function showUpdateOverlay() {
  document.documentElement.setAttribute("data-updating", "true");
}

export function hideUpdateOverlay() {
  const root = document.documentElement;
  if (root.getAttribute("data-updating") !== "true") return;
  root.setAttribute("data-updating", "done");      // CSS fades it out
  setTimeout(() => { if (root.getAttribute("data-updating") === "done") root.removeAttribute("data-updating"); }, 400);
}

function canAutoReload() {
  return recentReloads().length < MAX_AUTO_RELOADS;
}

function recordAutoReload() {
  try {
    sessionStorage.setItem(`${APP_UPDATE_RESUME_KEY}.reloads`, JSON.stringify([...recentReloads(), Date.now()]));
  } catch { /* ignore */ }
}

function recentReloads() {
  try {
    const list = JSON.parse(sessionStorage.getItem(`${APP_UPDATE_RESUME_KEY}.reloads`) || "[]");
    return Array.isArray(list) ? list.filter((ts) => Date.now() - ts < RELOAD_WINDOW_MS) : [];
  } catch {
    return [];
  }
}

export async function refreshRevisionSummary() {
  const host = document.getElementById("revisionSummary") || { textContent: "" };
  try {
    const data = await fetchRevisionStatus();
    if (!bootRevision && data.status.revision) bootRevision = String(data.status.revision);   // the build this page runs
    host.textContent = data.status.summary;
  } catch {
    host.textContent = "revision unavailable";
  }
}

export async function fetchRevisionStatus() {
  try {
    const response = await fetch("/revision.json", { cache: "no-store" });
    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.includes("application/json")) {
      const data = await response.json();
      if (data.ok && data.status && data.status.summary) return data;
    }
  } catch {
    // Static Pages can briefly lag the asset refresh.
  }
  throw new Error("revision unavailable");
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((error) => {
      console.warn("SogoTable service worker unavailable.", error);
    });
  });
}
