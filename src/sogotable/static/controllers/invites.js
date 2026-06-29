// Getting a second player into the room, both directions:
//   - host side: the opponent picker modal (remote invite / bot / local seat)
//   - guest side: the incoming invite prompt (accept / decline)
// Extracted from the shell. It owns the picker mode, the fetched bot list, the
// current incoming invite, and the invite-sound dedup key. Everything else —
// the room, rosters, owner tokens, and the shell-owned hostInviteStatus /
// activeGameRoom / selectedGameId — it reaches through wireInvites(ctx), which
// exposes getters for live shell state and setters for the three shell vars it
// must update. These flows mutate room membership, so the ctx is deliberately
// explicit rather than reaching into shell globals.
import { api, fetchJson } from "../api-client.js";
import { escapeHtml, avatarHtml } from "../html-utils.js";
import { playConfirm, playCancel, playInviteReceived } from "../sound.js";
import { rememberLocalGameHomePlayer } from "./local-seat.js";
import { homePlayerId } from "../client/session-store.js";

let ctx = {
  getCurrentRoom: () => null,
  getPlayers: () => [],
  getLobbyPlayers: () => [],
  getCurrentGameRooms: () => [],
  setSelectedGameId: () => {},
  setHostInviteStatus: () => {},
  setActiveGameRoom: () => {},
  refreshLobbyPlayers: async () => {},
  refreshGameRooms: async () => {},
  selectedGame: () => ({ id: "" }),
  ensureOwnerToken: async () => "",
  setRoom: () => {},
  renderRoomInviteStatus: () => {},
  deviceSelectedPlayer: () => null,
  gameName: () => "Game",
  canonicalGameId: (id) => id,
  saveSelectedGame: () => {},
  renderGames: () => {},
  renderGameSelected: () => {},
  showScreen: () => {},
};

let opponentPickerMode = "remote";
let availableBots = [];
let currentInvite = null;
let lastInviteSoundKey = "";

export function wireInvites(context) {
  ctx = { ...ctx, ...context };
}

export async function openInvitePlayerModal() {
  opponentPickerMode = "remote";
  document.getElementById("invitePlayerTitle").textContent = "Invite Remote Opponent";
  const host = document.getElementById("invitePlayerList");
  host.textContent = "Checking lobby...";
  document.getElementById("invitePlayerModal").classList.remove("hidden");
  await refreshRemoteInviteSources();
  renderInvitePlayerList();
}

export async function openBotOpponentModal() {
  opponentPickerMode = "bot";
  document.getElementById("invitePlayerTitle").textContent = "Invite Bot";
  const host = document.getElementById("invitePlayerList");
  host.textContent = "Loading bots...";
  document.getElementById("invitePlayerModal").classList.remove("hidden");
  await refreshAvailableBots();
  renderInvitePlayerList();
}

export function openLocalOpponentModal() {
  opponentPickerMode = "local";
  document.getElementById("invitePlayerTitle").textContent = "Select Local Opponent";
  renderInvitePlayerList();
  document.getElementById("invitePlayerModal").classList.remove("hidden");
}

export function closeInvitePlayerModal() {
  document.getElementById("invitePlayerModal").classList.add("hidden");
}

export function closeInvitePlayerModalOnBackdrop(event) {
  if (event.target.id === "invitePlayerModal") closeInvitePlayerModal();
}

function renderInvitePlayerList() {
  const host = document.getElementById("invitePlayerList");
  host.innerHTML = "";
  const currentRoom = ctx.getCurrentRoom();
  if (!currentRoom) return;
  const seated = new Set(currentRoom.players.map((player) => player.id));
  const available = opponentPickerMode === "bot"
    ? availableBots.filter((bot) => !seated.has(bot.id))
    : opponentPickerMode === "local"
    ? ctx.getPlayers().filter((player) => !seated.has(player.id))
    : remoteInviteCandidates(seated);
  if (!available.length) {
    host.textContent = opponentPickerMode === "remote"
      ? "No players in lobby."
      : opponentPickerMode === "bot" ? "No bots available." : "No available players.";
    return;
  }
  available.forEach((player) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "roster-player";
    button.innerHTML = opponentPickerMode === "bot"
      ? `${avatarHtml(player)}<strong>${escapeHtml(botDisplayName(player))}</strong>`
      : `${avatarHtml(player)}<strong>${escapeHtml(player.name)}</strong>`;
    button.addEventListener("click", () => {
      if (opponentPickerMode === "bot") joinBotOpponent(player);
      else if (opponentPickerMode === "local") joinLocalOpponent(player);
      else invitePlayer(player);
    });
    host.appendChild(button);
  });
}

function botDisplayName(bot) {
  const strategyIcon = String(bot.strategy_icon || "").trim();
  return `${strategyIcon ? `${strategyIcon} ` : ""}${bot.name}`;
}

async function refreshAvailableBots() {
  try {
    const data = await fetchJson(`/api/bots?game_id=${encodeURIComponent(ctx.selectedGame().id)}`);
    availableBots = data.ok ? data.bots || [] : [];
  } catch {
    availableBots = [];
  }
}

async function refreshRemoteInviteSources() {
  try {
    await Promise.all([ctx.refreshLobbyPlayers(), ctx.refreshGameRooms()]);
  } catch {
    // Rendering falls back to the last known lobby/room lists.
  }
}

function remoteInviteCandidates(seated) {
  const busyPlayerIds = new Set(seated);
  ctx.getCurrentGameRooms()
    .filter((room) => room.status === "waiting_for_player" || room.status === "active")
    .forEach((room) => room.players.forEach((player) => busyPlayerIds.add(player.id)));
  return ctx.getLobbyPlayers().filter((player) => !busyPlayerIds.has(player.id));
}

async function joinLocalOpponent(player) {
  const currentRoom = ctx.getCurrentRoom();
  if (!currentRoom) return;
  rememberLocalGameHomePlayer(currentRoom.code, homePlayerId());
  try {
    const response = await api("/api/room/join", { code: currentRoom.code, player, local: true, owner_token: await ctx.ensureOwnerToken(player.id) });
    ctx.setHostInviteStatus(null);
    ctx.setRoom(response.room);
    closeInvitePlayerModal();
  } catch (error) {
    alert(error.message);
  }
}

async function joinBotOpponent(bot) {
  const currentRoom = ctx.getCurrentRoom();
  if (!currentRoom) return;
  try {
    const response = await api("/api/room/join-bot", {
      code: currentRoom.code,
      host_id: currentRoom.host_id,
      bot_id: bot.id,
      owner_token: await ctx.ensureOwnerToken(currentRoom.host_id),
    });
    ctx.setHostInviteStatus(null);
    ctx.setRoom(response.room);
    closeInvitePlayerModal();
    playConfirm();
  } catch (error) {
    alert(error.message);
  }
}

async function invitePlayer(player) {
  const currentRoom = ctx.getCurrentRoom();
  if (!currentRoom) return;
  try {
    const response = await api("/api/invite/create", { code: currentRoom.code, host_id: currentRoom.host_id, player, owner_token: await ctx.ensureOwnerToken(currentRoom.host_id) });
    ctx.setHostInviteStatus(response.invite);
    ctx.renderRoomInviteStatus();
    closeInvitePlayerModal();
    playConfirm();
  } catch (error) {
    alert(error.message);
  }
}

export async function refreshPendingInvites() {
  const player = ctx.deviceSelectedPlayer();
  if (!player || !document.getElementById("invitePrompt").classList.contains("hidden")) return;
  try {
    const data = await fetchJson(`/api/invites?player_id=${encodeURIComponent(player.id)}`);
    if (data.ok && data.invites.length) showInvitePrompt(data.invites[0]);
  } catch {
    // Invite refresh is best-effort; room actions still work without it.
  }
}

export function showInvitePrompt(invite) {
  currentInvite = invite;
  document.getElementById("invitePromptText").textContent = `${invite.host_name} invited you to play ${ctx.gameName(invite.game_id)}.`;
  document.getElementById("invitePrompt").classList.remove("hidden");
  const soundKey = invite.id || `${invite.room_code || ""}:${invite.host_id || ""}:${invite.game_id || ""}`;
  if (soundKey && soundKey !== lastInviteSoundKey) {
    lastInviteSoundKey = soundKey;
    playInviteReceived();
  }
}

export async function respondToInvite(accept) {
  const player = ctx.deviceSelectedPlayer();
  if (!currentInvite || !player) return;
  try {
    const response = await api("/api/invite/respond", { invite_id: currentInvite.id, accept, player, owner_token: await ctx.ensureOwnerToken(player.id) });
    document.getElementById("invitePrompt").classList.add("hidden");
    currentInvite = null;
    if (accept) playConfirm();
    else playCancel();
    if (response.accepted && response.room) {
      ctx.setSelectedGameId(ctx.canonicalGameId(response.room.game_id));
      ctx.saveSelectedGame();
      ctx.setHostInviteStatus(null);
      ctx.setActiveGameRoom(response.room);
      ctx.setRoom(response.room);
      ctx.renderGames();
      ctx.renderGameSelected();
      ctx.showScreen("game");
    }
  } catch (error) {
    alert(error.message);
  }
}
