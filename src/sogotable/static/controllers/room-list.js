// Selected game's room-summary lists (open / in progress) and the "you have a
// game here" re-enter notice. Render-only: the shell owns fetching, setRoom and
// screen changes, and injects the actions through wireRoomList(ctx).
import { avatarHtml, escapeHtml } from "../html-utils.js";

// ctx: getRooms, getDevicePlayer, getDevicePlayerId, isSuperuser,
// onEnter(summary), onSuperClose(code).
let ctx = null;
let lastCurrentGameRoomsKey = "";
let lastActiveGameNoticeKey = "";

export function wireRoomList(context) {
  ctx = context;
}

export function resetRoomListKeys() {
  lastCurrentGameRoomsKey = "";
  lastActiveGameNoticeKey = "";
}

export function renderCurrentGames(errorMessage = "") {
  const openHost = document.getElementById("openGamesList");
  const closedHost = document.getElementById("closedGamesList");
  if (!openHost || !closedHost) return;
  const nextKey = errorMessage ? `error:${errorMessage}` : `${gameRoomsSignature(ctx.getRooms())}:superuser=${ctx.isSuperuser()}`;
  if (nextKey === lastCurrentGameRoomsKey) return;
  lastCurrentGameRoomsKey = nextKey;
  openHost.innerHTML = "";
  closedHost.innerHTML = "";
  if (errorMessage) {
    openHost.textContent = errorMessage;
    closedHost.textContent = "Could not refresh games.";
    return;
  }
  const openRooms = ctx.getRooms().filter((room) => room.status === "waiting_for_player");
  const closedRooms = ctx.getRooms().filter((room) => room.status === "active");
  renderRoomSummaryList(openHost, openRooms, "No open games.");
  renderRoomSummaryList(closedHost, closedRooms, "No games in progress.");
}

function renderRoomSummaryList(host, rooms, emptyText) {
  if (!rooms.length) {
    host.textContent = emptyText;
    return;
  }
  rooms.forEach((room) => {
    const card = document.createElement("div");
    card.className = "room-summary-card";
    const hostPlayer = room.players.find((player) => player.id === room.host_id);
    const selectedSeat = room.players.find((player) => player.id === ctx.getDevicePlayerId());
    const isOpen = room.status === "waiting_for_player";
    const canSuperClose = ctx.isSuperuser();
    const canJoin = Boolean(ctx.getDevicePlayer() && isOpen && !selectedSeat && (room.open_seats == null || room.open_seats > 0));
    const canReenter = Boolean(selectedSeat);
    const actionText = canReenter ? "Re-enter Game" : canJoin ? "Join Game" : room.status === "active" ? "In Progress" : "Join Game";
    card.innerHTML = `
      <div class="room-summary-main">
        <strong>${escapeHtml(hostPlayer ? `${hostPlayer.name}'s Game` : "Game")}</strong>
        <span>Code ${escapeHtml(room.code)}</span>
      </div>
      <button type="button" class="${canReenter || canJoin ? "secondary" : "ghost"}">${escapeHtml(actionText)}</button>
      <button type="button" class="ghost danger room-super-close ${canSuperClose ? "" : "hidden"}" aria-label="Close table ${escapeHtml(room.code)} as Sogo" title="Close table as Sogo">X</button>
      <div class="room-summary-players">${room.players.map((player) => avatarHtml(player)).join("")}</div>
    `;
    const button = card.querySelector("button");
    const superCloseButton = card.querySelector(".room-super-close");
    button.disabled = !(canReenter || canJoin);
    button.addEventListener("click", () => ctx.onEnter(room));
    superCloseButton.addEventListener("click", () => ctx.onSuperClose(room.code));
    host.appendChild(card);
  });
}

export function renderActiveGameNotice(errorMessage = "") {
  const host = document.getElementById("activeGameNotice");
  if (!host) return;
  const player = ctx.getDevicePlayer();
  const existing = player ? ctx.getRooms().find((room) => room.players.some((seat) => seat.id === player.id)) : null;
  const nextKey = errorMessage
    ? `error:${errorMessage}`
    : existing ? JSON.stringify({ selectedPlayerId: ctx.getDevicePlayerId(), room: roomSummarySignature(existing) }) : "hidden";
  if (nextKey === lastActiveGameNoticeKey) return;
  lastActiveGameNoticeKey = nextKey;
  if (errorMessage || !existing) {
    host.classList.add("hidden");
    host.innerHTML = "";
    return;
  }
  const statusText = existing.status === "waiting_for_player" ? "waiting for an opponent" : "in progress";
  host.classList.remove("hidden");
  host.innerHTML = `
    <div>
      <strong>You have a game ${escapeHtml(statusText)}.</strong>
      <span>Re-enter it instead of creating another one.</span>
    </div>
    <button type="button" class="secondary compact">Re-enter Game</button>
  `;
  host.querySelector("button").addEventListener("click", () => ctx.onEnter(existing));
}

function gameRoomsSignature(rooms) {
  return JSON.stringify({
    selectedPlayerId: ctx.getDevicePlayerId(),
    rooms: [...rooms]
      .sort((left, right) => String(left.code || "").localeCompare(String(right.code || "")))
      .map((room) => roomSummarySignature(room)),
  });
}

function roomSummarySignature(room) {
  return {
    code: room.code,
    status: room.status,
    host_id: room.host_id,
    open_seats: room.open_seats,
    players: (room.players || []).map((player) => playerSignature(player)),
  };
}

export function playerSignature(player) {
  return {
    id: player.id,
    name: player.name,
    icon: player.icon,
    color: player.color,
    mark: player.mark,
  };
}
