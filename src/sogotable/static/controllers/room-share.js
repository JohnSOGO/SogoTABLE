// Room join-link sharing. Owns three things:
//   1. the `?join=CODE` deep link: read once at start-up, stripped from the
//      address bar, held until a player is selected, then handed to the shell's
//      existing join flow (ctx.joinRoomByCode) — this module never fetches;
//   2. the share panel on the room screen: the link, a native share sheet
//      (navigator.share) with copy-to-clipboard fallback, and a QR code so a
//      second phone at the table can just point its camera;
//   3. when sharing makes sense: only a remote (not hot-seat), multi-player room
//      that has not started yet — seats are fixed once a game starts.
import qrcode from "../vendor/qrcode-generator.js";
import { showToast } from "./toast.js";

const JOIN_PARAM = "join";
const CODE_PATTERN = /^[A-Z0-9]{3,12}$/;

let pendingJoinCode = "";
let lastRenderedKey = "";
let ctx = {
  joinRoomByCode: async () => {},
  hasSelectedPlayer: () => false,
  isSoloRoom: () => false,
};

export function wireRoomShare(context) {
  ctx = { ...ctx, ...context };
}

export function joinLinkFor(code) {
  const origin = typeof location !== "undefined" ? location.origin : "https://sogotable.sogodojo.com";
  return `${origin}/?${JOIN_PARAM}=${encodeURIComponent(code)}`;
}

// Start-up: remember ?join=CODE and clean the address bar so a refresh or a
// re-shared screenshot does not re-trigger the join.
export function captureJoinLink() {
  if (typeof location === "undefined") return "";
  const params = new URLSearchParams(location.search);
  const raw = String(params.get(JOIN_PARAM) || "").trim().toUpperCase();
  if (!params.has(JOIN_PARAM)) return "";
  params.delete(JOIN_PARAM);
  const rest = params.toString();
  try { history.replaceState(null, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`); } catch (_) { /* ignore */ }
  pendingJoinCode = CODE_PATTERN.test(raw) ? raw : "";
  if (!pendingJoinCode) showToast("That join link is not valid.");
  return pendingJoinCode;
}

export function hasPendingJoin() {
  return Boolean(pendingJoinCode);
}

// Called at start-up and whenever a player gets selected. Joins once.
let promptedForPlayer = false;
export async function resumePendingJoin() {
  if (!pendingJoinCode) return false;
  if (!ctx.hasSelectedPlayer()) {
    if (!promptedForPlayer) showToast(`Tap Start Playing and pick your player to join table ${pendingJoinCode}.`, { kind: "info", durationMs: 8000 });
    promptedForPlayer = true;
    return false;
  }
  const code = pendingJoinCode;
  pendingJoinCode = "";
  await ctx.joinRoomByCode(code);
  return true;
}

function shouldShare(room, viewerId) {
  if (!room || room.started || room.local_mode || ctx.isSoloRoom(room)) return false;
  return room.players.some((seat) => seat.id === viewerId);
}

function qrSvg(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

async function shareLink(code) {
  const url = joinLinkFor(code);
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title: "Join my SogoTable game", text: `Join table ${code} on SogoTable`, url });
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return; // they closed the sheet
    }
  }
  await copyLink(code);
}

async function copyLink(code) {
  try {
    await navigator.clipboard.writeText(joinLinkFor(code));
    showToast("Join link copied.", { kind: "success" });
  } catch (_) {
    showToast(`Share this code instead: ${code}`, { kind: "info" });
  }
}

// Render fan hook: draws (or hides) the share panel for the current room.
export function renderRoomShare(room, viewerId) {
  const host = typeof document !== "undefined" ? document.getElementById("roomSharePanel") : null;
  if (!host) return;
  const visible = shouldShare(room, viewerId);
  const key = visible ? room.code : "";
  if (key === lastRenderedKey) return;
  lastRenderedKey = key;
  host.classList.toggle("hidden", !visible);
  host.innerHTML = "";
  if (!visible) return;
  const url = joinLinkFor(room.code);
  host.innerHTML = `
    <div class="room-share-qr" role="img" aria-label="QR code that opens the join link">${qrSvg(url)}</div>
    <div class="room-share-body">
      <span class="label">Invite at the table</span>
      <p class="room-share-hint">Scan with a phone camera, or send the link.</p>
      <div class="room-share-code">Table code <strong>${room.code}</strong></div>
      <div class="room-share-actions">
        <button type="button" class="primary compact" data-share-link>Share link</button>
        <button type="button" class="secondary compact" data-copy-link>Copy</button>
      </div>
    </div>
  `;
  host.querySelector("[data-share-link]").addEventListener("click", () => shareLink(room.code));
  host.querySelector("[data-copy-link]").addEventListener("click", () => copyLink(room.code));
}
