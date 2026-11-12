// "A game needs you" alert delivery for a room the player is not viewing:
// an in-app toast with a jump button, a short chime, and — when the page is
// hidden and the player allowed it — a system notification (Notification API,
// shown through the service worker registration first because
// `new Notification()` throws on Android Chrome). Tapping either jumps back
// into that room. Decides nothing about turns: active-games.js says when.
// Browser globals are touched only at call time so the module imports in Node.
import { showToast } from "../controllers/toast.js";
import { playInviteReceived } from "../sound.js";

const ICON = "/assets/icon-192.png";
let openRoom = () => {};

export function notificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

// Must be called from a user gesture (a tap in the switcher).
export async function requestNotificationPermission() {
  if (notificationPermission() !== "default") return notificationPermission();
  try { return await Notification.requestPermission(); } catch { return notificationPermission(); }
}

// onOpen(code) re-enters a room. Also wires the service worker's
// notificationclick message and a cold-start `?room=CODE` link it may open.
export function wireGameAlerts(onOpen) {
  openRoom = onOpen;
  if (typeof navigator !== "undefined" && navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = event.data || {};
      if (data.type === "open-room" && data.code) openRoom(String(data.code));
    });
  }
}

// A `?room=CODE` the service worker opened the app with, consumed once.
export function takeRoomFromUrl() {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  const code = (url.searchParams.get("room") || "").trim().toUpperCase();
  if (!code) return "";
  url.searchParams.delete("room");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  return /^[A-Z0-9]{4,8}$/.test(code) ? code : "";
}

async function showSystemNotification(title, body, code) {
  const options = { body, tag: `sogotable-room-${code}`, renotify: true, icon: ICON, badge: ICON, data: { code } };
  try {
    const registration = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (registration && registration.showNotification) { await registration.showNotification(title, options); return; }
  } catch { /* fall through to the page-level API */ }
  try {
    const note = new Notification(title, options);
    note.onclick = () => { window.focus(); note.close(); openRoom(code); };
  } catch { /* unsupported here — the toast still shows */ }
}

// title: the game's name; text: what is waiting ("It's your move").
export function alertNeedsMe({ code, title, text }) {
  const body = `${text} · table ${code}`;
  showToast(`${title}: ${text}`, { kind: "info", durationMs: 9000, action: { label: "Go", onClick: () => openRoom(code) } });
  playInviteReceived();
  try { if (navigator.vibrate) navigator.vibrate([40, 30, 40]); } catch { /* unsupported */ }
  const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  if (hidden && notificationPermission() === "granted") void showSystemNotification(title, body, code);
}
