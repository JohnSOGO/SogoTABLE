// Shared pre-game lobby — mode-driven (fixed-capacity/auto-start + host-start).
//
// Two lobby shapes live here:
//   - renderHostStartLobby: the room-create / invite "table" screen every
//     host-start (Game-Locked) game shows before it starts, so they all match.
//   - renderRoomSlots / renderRoomInviteStatus: the 2-player "fixedCapacity"
//     room slots (host + opponent) the shell shows for invite-driven games.
// The 2-player renderers reach shell state through a ctx injected via
// wireLobby() — a getter for the current room, a getter+setter for the host
// invite status (so its mutations stay shell-owned), the shell helpers, and the
// three opponent-picker modal openers. This module lives under games/ and MUST
// NOT import app.js; everything it needs comes through ctx or a pure import from
// ../html-utils.js (mirrors controllers/invites.js).
//
// Host-start lobby
//
// Emits the canonical `.ten-thousand-lobby` / `.tt-lobby-*` markup (the look
// Yahtzee and 10,000 already use) and wires the shell-provided ctx callbacks
// (`invitePlayer`, `addBot`, `startGame`). A game's renderer calls this when
// `ctx.started` is false instead of hand-rolling its own invite UI.
//
// opts:
//   wrap        - optional wrapper class (e.g. "mazewright-root") so a game's
//                 own #macroBoard neutralizer CSS applies to the lobby too.
//   heading     - roster heading (default "Players").
//   blurb       - one-line description shown above the controls.
//   extraHtml   - host-only markup injected above the action buttons (e.g. an
//                 options <select>); wire it up in onMount.
//   getStartArg - (host) => value passed to ctx.startGame() (for games whose
//                 start carries an option, like 10,000's opening score).
//   onMount     - (host) => void, called after render so the game can wire any
//                 extraHtml controls.
import { avatarHtml, escapeHtml } from "../html-utils.js";

export function renderHostStartLobby(host, ctx, opts = {}) {
  const esc = ctx.escapeHtml || ((s) => s);
  const seats = Array.isArray(ctx.room && ctx.room.players) ? ctx.room.players : [];
  const roster = seats.length
    ? seats.map((seat, i) => `
      <li class="tt-lobby-player">
        <span class="tt-lobby-player-no">${i + 1}</span>
        <div class="tt-lobby-player-body">
          <strong>${seat.icon ? esc(seat.icon) + " " : ""}${esc(seat.name)}</strong>
          <span>${esc(seat.kind === "bot" ? "Bot" : "Player")} ${esc(seat.mark || "")}</span>
        </div>
      </li>`).join("")
    : `<li class="tt-lobby-empty">No players yet.</li>`;
  const hostControls = ctx.isHost
    ? `${opts.extraHtml || ""}
      <div class="tt-lobby-actions">
        <button class="secondary" type="button" data-lobby="invite">Invite Remote Opponent</button>
        <button class="secondary" type="button" data-lobby="bot">Invite Bot</button>
        <button class="primary" type="button" data-lobby="start" ${seats.length ? "" : "disabled"}>Start Game</button>
      </div>`
    : `<p class="ten-thousand-message">Waiting for the host to start...</p>`;
  const section = `<section class="ten-thousand-lobby">
      <h3>${esc(opts.heading || "Players")}</h3>
      <ul class="tt-lobby-roster">${roster}</ul>
      <p class="ten-thousand-message">${esc(opts.blurb || "Invite players or bots, then start.")}</p>
      ${hostControls}
    </section>`;
  host.innerHTML = opts.wrap ? `<div class="${opts.wrap}">${section}</div>` : section;
  if (!ctx.isHost) return;
  const wire = (key, fn) => {
    const b = host.querySelector(`[data-lobby="${key}"]`);
    if (b && fn) b.addEventListener("click", () => { if (!b.disabled) fn(); });
  };
  wire("invite", ctx.invitePlayer);
  wire("bot", ctx.addBot);
  wire("start", () => ctx.startGame(opts.getStartArg ? opts.getStartArg(host) : undefined));
  if (opts.onMount) opts.onMount(host);
}

// ---- 2-player "fixedCapacity" room slots -----------------------------------
// The shell injects live state + helpers here via wireLobby(); these renderers
// never import app.js. hostInviteStatus stays a shell-owned global, so the
// `= null` mutations route back through ctx.setHostInviteStatus(null).
let ctx = {
  getCurrentRoom: () => null,
  getHostInviteStatus: () => null,
  setHostInviteStatus: () => {},
  isSoloRoom: () => false,
  getDeviceSelectedPlayerId: () => "",
  openLocalOpponentModal: () => {},
  openInvitePlayerModal: () => {},
  openBotOpponentModal: () => {},
};

export function wireLobby(context) {
  ctx = { ...ctx, ...context };
}

export function renderRoomSlots() {
  const currentRoom = ctx.getCurrentRoom();
  if (!currentRoom) return;
  const hostSlot = document.getElementById("roomHostSlot");
  const opponentSlot = document.getElementById("roomOpponentSlot");
  const hostPlayer = currentRoom.players.find((player) => player.id === currentRoom.host_id);
  const opponent = currentRoom.players.find((player) => player.id !== currentRoom.host_id);
  hostSlot.innerHTML = hostPlayer ? roomPlayerHtml(hostPlayer) : "Host missing.";
  opponentSlot.classList.remove("status-only");
  opponentSlot.parentElement.classList.toggle("hidden", ctx.isSoloRoom(currentRoom));
  if (ctx.isSoloRoom(currentRoom)) {
    ctx.setHostInviteStatus(null);
    renderRoomInviteStatus();
    return;
  }
  if (opponent) {
    opponentSlot.innerHTML = roomPlayerHtml(opponent);
    ctx.setHostInviteStatus(null);
    renderRoomInviteStatus();
    return;
  }
  if (currentRoom.host_id === ctx.getDeviceSelectedPlayerId()) {
    opponentSlot.innerHTML = `
      <button id="selectLocalOpponent" class="secondary" type="button">Select Local Opponent</button>
      <button id="inviteRemoteOpponent" class="secondary" type="button">Invite Remote Opponent</button>
      <button id="inviteBotOpponent" class="secondary" type="button">Invite Bot</button>
    `;
    document.getElementById("selectLocalOpponent").addEventListener("click", ctx.openLocalOpponentModal);
    document.getElementById("inviteRemoteOpponent").addEventListener("click", ctx.openInvitePlayerModal);
    document.getElementById("inviteBotOpponent").addEventListener("click", ctx.openBotOpponentModal);
    renderRoomInviteStatus();
    return;
  }
  renderRoomInviteStatus();
  const hostInviteStatus = ctx.getHostInviteStatus();
  opponentSlot.textContent = hostInviteStatus ? inviteStatusText(hostInviteStatus) : "Waiting for host to invite a player.";
  opponentSlot.classList.add("status-only");
}

export function renderRoomInviteStatus() {
  const host = document.getElementById("roomInviteStatus");
  if (!host) return;
  const currentRoom = ctx.getCurrentRoom();
  const hostInviteStatus = ctx.getHostInviteStatus();
  const visible = Boolean(currentRoom && !currentRoom.started && hostInviteStatus);
  host.classList.toggle("hidden", !visible);
  if (!visible) {
    host.textContent = "";
    return;
  }
  host.textContent = inviteStatusText(hostInviteStatus);
}

function inviteStatusText(invite) {
  const targetName = invite.target_name || "player";
  if (invite.status === "accepted") return `${targetName} accepted. Starting game.`;
  if (invite.status === "declined") return `${targetName} declined the invite.`;
  if (invite.status === "expired") return `Invite to ${targetName} expired.`;
  return `Invite sent to ${targetName}. Waiting for response.`;
}

function roomPlayerHtml(player) {
  const label = player.kind === "bot" ? `${player.mark || "Waiting"} Bot` : player.mark || "Waiting";
  return `${avatarHtml(player)}<strong>${escapeHtml(player.name)}</strong><span>${escapeHtml(label)}</span>`;
}
