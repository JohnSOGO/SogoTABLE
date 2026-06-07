import { api, fetchJson } from "./api-client.js";
import {
  colorWithAlpha,
  getContrastAwareTextColor,
  isHexColor,
  mixColorWithWhite,
  normalizePlayerColor,
} from "./color-utils.js";
import { avatarHtml, escapeHtml } from "./html-utils.js";

const icons = ["🙂", "😎", "🤖", "🦊", "🐲", "⭐", "🌮", "🎲"];
const colors = ["#1f7a5f", "#1e63d6", "#c43d5d", "#8a4bd1", "#b7791f", "#0f766e"];
const randomIcons = ["🙂", "😎", "🤖", "🦊", "🐲", "⭐", "🌮", "🎲", "🎯", "🚀", "🌈", "🍕", "🎸", "🧠", "🔥", "🍀"];
const paletteColors = [
  "#1f7a5f",
  "#1e63d6",
  "#c43d5d",
  "#8a4bd1",
  "#b7791f",
  "#0f766e",
  "#dc2626",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#4f46e5",
  "#be123c",
  "#334155",
];
const LEGACY_STORAGE_PREFIX = ["sogo", "games"].join("");
const games = [
  {
    id: "super_tic_tac_toe",
    name: "Super Tic Tac Toe",
    summary: "A nested tic tac toe duel where every move sends the next player to a target board.",
    players: "2 players",
    status: "Ready",
    availability: "ready",
  },
];
const winLines = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

migrateStorageNamespace();

let players = [];
let selectedPlayerId = localStorage.getItem("sogotable.selectedPlayerId") || "";
let deviceSelectedPlayerId = localStorage.getItem("sogotable.deviceSelectedPlayerId") || selectedPlayerId;
let deviceSelectionHash = localStorage.getItem("sogotable.deviceSelectionHash") || randomTenDigitHash();
if (!selectedPlayerId && deviceSelectedPlayerId) selectedPlayerId = deviceSelectedPlayerId;
let selectedGameId = localStorage.getItem("sogotable.selectedGameId") || games[0].id;
let selectedIcon = randomIcon();
let selectedColor = paletteColors[0];
let currentRoom = null;
let currentInvite = null;
let hostInviteStatus = null;
let activeGameRoom = null;
let currentGameRooms = [];
let lobbyPlayers = [];
let opponentPickerMode = "remote";
let playerApiAvailable = true;
let pollTimer = null;
let roomListTimer = null;
let inviteTimer = null;
let lobbyPresenceTimer = null;
let lastLegalBoardsKey = "";
let lastCelebratedWinKey = "";
let winOverlayTimer = null;
let localGameHomePlayers = loadLocalGameHomePlayers();
let pendingConfirmAction = null;
let handledResetRequestKey = "";
localStorage.setItem("sogotable.deviceSelectionHash", deviceSelectionHash);

document.addEventListener("DOMContentLoaded", () => {
  purgeDeprecatedLocalRoster();
  registerServiceWorker();
  refreshRevisionSummary();
  bindNavigation();
  renderGames();
  renderChoices();
  refreshPlayers();
  renderSelectedGame();
  renderSelectedPlayer();
  renderCurrentPlayer();
  document.getElementById("playerForm").addEventListener("submit", createPlayer);
  document.getElementById("openSelectPlayerModal").addEventListener("click", () => openPlayerModal("select"));
  document.getElementById("openCreatePlayerModal").addEventListener("click", () => openPlayerModal("create"));
  document.getElementById("closePlayerModal").addEventListener("click", closePlayerModal);
  document.getElementById("playerModal").addEventListener("click", closePlayerModalOnBackdrop);
  document.getElementById("playerIconText").addEventListener("input", updateSelectedIcon);
  document.getElementById("playerIconText").addEventListener("focus", clearEmojiField);
  document.getElementById("playerIconText").addEventListener("blur", resetBlankEmojiField);
  document.getElementById("playerColorText").addEventListener("input", updateSelectedColorFromText);
  document.getElementById("playerColorText").addEventListener("blur", normalizeSelectedColorText);
  document.getElementById("playerColorNative").addEventListener("input", updateSelectedColorFromNative);
  document.getElementById("closeInvitePlayerModal").addEventListener("click", closeInvitePlayerModal);
  document.getElementById("invitePlayerModal").addEventListener("click", closeInvitePlayerModalOnBackdrop);
  document.getElementById("createGame").addEventListener("click", createRoom);
  document.getElementById("refreshGameList").addEventListener("click", refreshGameRooms);
  document.getElementById("acceptInvite").addEventListener("click", () => respondToInvite(true));
  document.getElementById("declineInvite").addEventListener("click", () => respondToInvite(false));
  document.getElementById("closeGame").addEventListener("click", closeGame);
  document.getElementById("resetGame").addEventListener("click", resetGame);
  document.getElementById("confirmYes").addEventListener("click", () => resolveConfirmPrompt(true));
  document.getElementById("confirmNo").addEventListener("click", () => resolveConfirmPrompt(false));
  document.getElementById("confirmPrompt").addEventListener("click", closeConfirmPromptOnBackdrop);
  const closeWinOverlay = document.getElementById("closeWinOverlay");
  if (closeWinOverlay) closeWinOverlay.addEventListener("click", hideWinOverlay);
  startRoomListPolling();
  startInvitePolling();
});

async function refreshRevisionSummary() {
  const host = document.getElementById("revisionSummary");
  if (!host) return;
  try {
    const data = await fetchRevisionStatus();
    host.textContent = data.status.summary;
  } catch {
    host.textContent = "revision unavailable";
  }
}

async function fetchRevisionStatus() {
  const endpoints = ["/api/status", "/revision.json"];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("application/json")) continue;
      const data = await response.json();
      if (data.ok && data.status && data.status.summary) return data;
    } catch {
      // Try the next revision source. Static Pages does not provide /api/status.
    }
  }
  throw new Error("revision unavailable");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((error) => {
      console.warn("SogoTable service worker unavailable.", error);
    });
  });
}

function bindNavigation() {
  document.querySelectorAll("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.screen));
  });
}

function showScreen(name) {
  if (name === "game" && !currentRoom) return;
  if (name === "gameSelected" && !selectedGame()) return;
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.toggle("active", screen.id === name);
  });
  if (name === "game") startPolling();
  if (name === "gameSelected") {
    renderGameSelected();
    refreshGameRooms();
    updateLobbyPresence();
    startLobbyPresencePolling();
  } else {
    stopLobbyPresencePolling();
  }
}

function renderGames() {
  const host = document.getElementById("gamesList");
  host.innerHTML = "";
  const hasPlayer = Boolean(deviceSelectedPlayer());
  games.forEach((game) => {
    const ready = gameIsReady(game);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `game-card ${game.id === selectedGameId ? "selected" : ""}`;
    button.dataset.gameId = game.id;
    button.textContent = game.name;
    button.disabled = !hasPlayer || !ready;
    if (!hasPlayer) {
      button.title = "Select or create a player first.";
      button.setAttribute("aria-label", `${game.name}. Select or create a player first.`);
    } else if (!ready) {
      button.title = gameAvailabilityText(game);
      button.setAttribute("aria-label", `${game.name}. ${gameAvailabilityText(game)}`);
    }
    button.addEventListener("click", () => {
      if (!ready) return;
      selectedGameId = game.id;
      currentRoom = null;
      activeGameRoom = null;
      saveSelectedGame();
      renderGames();
      renderSelectedGame();
      showScreen("gameSelected");
    });
    host.appendChild(button);
  });
}

function renderSelectedGame() {
  const host = document.getElementById("selectedGame");
  if (!host) return;
  const game = selectedGame();
  host.innerHTML = game ? `<span>Game</span><strong>${escapeHtml(game.name)}</strong>` : "";
}

function renderGameSelected() {
  const game = selectedGame();
  document.getElementById("selectedGameTitle").textContent = game ? game.name : "Game";
  document.getElementById("selectedGameDescription").textContent = game ? game.summary : "";
  refreshLobbyPlayers();
  renderCurrentGames();
  renderCreateGameButton();
  renderActiveGameNotice();
}

function renderLobbyPlayers() {
  const host = document.getElementById("lobbyPlayers");
  if (!host) return;
  host.innerHTML = "";
  if (!lobbyPlayers.length) {
    host.textContent = "No players are looking at this game right now.";
    return;
  }
  const orderedPlayers = [...lobbyPlayers].sort((left, right) => {
    if (left.id === deviceSelectedPlayerId) return -1;
    if (right.id === deviceSelectedPlayerId) return 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
  orderedPlayers.forEach((player) => {
    const row = document.createElement("div");
    row.className = `roster-player ${player.id === deviceSelectedPlayerId ? "selected" : ""}`;
    row.innerHTML = `${avatarHtml(player)}<strong>${escapeHtml(player.name)}</strong>`;
    host.appendChild(row);
  });
}

async function refreshLobbyPlayers() {
  const game = selectedGame();
  if (!game) return;
  try {
    const data = await fetchJson(`/api/lobby?game_id=${encodeURIComponent(game.id)}`);
    if (!data.ok) throw new Error(data.error || "Could not load lobby players.");
    lobbyPlayers = data.players;
    renderLobbyPlayers();
  } catch {
    lobbyPlayers = [];
    renderLobbyPlayers();
  }
}

async function updateLobbyPresence() {
  const player = deviceSelectedPlayer();
  const game = selectedGame();
  if (!player || !game || !document.getElementById("gameSelected").classList.contains("active")) return;
  try {
    const response = await api("/api/lobby/presence", { game_id: game.id, player });
    lobbyPlayers = response.players;
    renderLobbyPlayers();
  } catch {
    refreshLobbyPlayers();
  }
}

async function refreshGameRooms() {
  const game = selectedGame();
  if (!game) return;
  try {
    const data = await fetchJson(`/api/rooms?game_id=${encodeURIComponent(game.id)}`);
    if (!data.ok) throw new Error(data.error || "Could not load games.");
    currentGameRooms = data.rooms;
    renderCurrentGames();
    renderCreateGameButton();
    renderActiveGameNotice();
    autoOpenActiveRoomForSelectedPlayer();
  } catch (error) {
    currentGameRooms = [];
    playerApiAvailable = false;
    renderCurrentGames(error.message);
    renderCreateGameButton();
    renderActiveGameNotice(error.message);
  }
}

async function autoOpenActiveRoomForSelectedPlayer() {
  const player = deviceSelectedPlayer();
  const gameSelectedScreen = document.getElementById("gameSelected");
  if (!player || !gameSelectedScreen || !gameSelectedScreen.classList.contains("active")) return;
  const room = currentGameRooms.find((item) => (
    item.status === "active" &&
    item.players.some((seat) => seat.id === player.id)
  ));
  if (!room || (currentRoom && currentRoom.code === room.code)) return;
  try {
    const data = await fetchJson(`/api/room?code=${encodeURIComponent(room.code)}`);
    if (!data.ok) return;
    activeGameRoom = data.room;
    setRoom(data.room);
    showScreen("game");
  } catch {
    // The room list will continue polling; a transient read failure should not strand the screen.
  }
}

function renderCurrentGames(errorMessage = "") {
  const openHost = document.getElementById("openGamesList");
  const closedHost = document.getElementById("closedGamesList");
  if (!openHost || !closedHost) return;
  openHost.innerHTML = "";
  closedHost.innerHTML = "";
  if (errorMessage) {
    openHost.textContent = errorMessage;
    closedHost.textContent = "Could not refresh games.";
    return;
  }
  const openRooms = currentGameRooms.filter((room) => room.status === "waiting_for_player");
  const closedRooms = currentGameRooms.filter((room) => room.status === "active");
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
    const selectedSeat = room.players.find((player) => player.id === deviceSelectedPlayerId);
    const isOpen = room.status === "waiting_for_player";
    const canJoin = Boolean(deviceSelectedPlayer() && isOpen && !selectedSeat && room.open_seats > 0);
    const canReenter = Boolean(selectedSeat);
    const actionText = canReenter ? "Re-enter Game" : canJoin ? "Join Game" : room.status === "active" ? "In Progress" : "Join Game";
    card.innerHTML = `
      <div class="room-summary-main">
        <strong>${escapeHtml(hostPlayer ? `${hostPlayer.name}'s Game` : "Game")}</strong>
        <span>Code ${escapeHtml(room.code)}</span>
      </div>
      <div class="room-summary-players">${room.players.map((player) => avatarHtml(player)).join("")}</div>
      <button type="button" class="${canReenter || canJoin ? "secondary" : "ghost"}">${escapeHtml(actionText)}</button>
    `;
    const button = card.querySelector("button");
    button.disabled = !(canReenter || canJoin);
    button.addEventListener("click", () => enterRoomSummary(room));
    host.appendChild(card);
  });
}

function renderCreateGameButton() {
  const button = document.getElementById("createGame");
  if (!button) return;
  const player = deviceSelectedPlayer();
  const game = selectedGame();
  const existing = player ? currentGameRooms.find((room) => room.players.some((seat) => seat.id === player.id)) : null;
  button.disabled = !player || !gameIsReady(game) || !playerApiAvailable;
  button.textContent = existing ? "Re-enter Game" : "Create Game";
  button.title = !player
    ? "Select or create a player first."
    : !playerApiAvailable
      ? "Online game server is not connected on this site yet."
      : gameIsReady(game) ? "" : gameAvailabilityText(game);
}

async function enterRoomSummary(summary) {
  const player = deviceSelectedPlayer();
  if (!player) return alert("Select a player first.");
  let freshSummary = summary;
  try {
    const data = await fetchJson(`/api/room?code=${encodeURIComponent(summary.code)}`);
    if (!data.ok) return alert(data.error || "Game not found.");
    freshSummary = data.room;
  } catch (error) {
    alert(error.message);
    return;
  }
  const selectedSeat = freshSummary.players.find((seat) => seat.id === player.id);
  if (selectedSeat) {
    setRoom(freshSummary);
    showScreen("game");
    return;
  }
  if (freshSummary.status !== "waiting_for_player" || freshSummary.open_seats <= 0) {
    alert("That game is no longer open.");
    refreshGameRooms();
    return;
  }
  try {
    const response = await api("/api/room/join", { code: freshSummary.code, player });
    setRoom(response.room);
    refreshGameRooms();
    showScreen("game");
  } catch (error) {
    alert(error.message);
  }
}

function renderActiveGameNotice(errorMessage = "") {
  const host = document.getElementById("activeGameNotice");
  if (!host) return;
  const player = deviceSelectedPlayer();
  const existing = player ? currentGameRooms.find((room) => room.players.some((seat) => seat.id === player.id)) : null;
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
  host.querySelector("button").addEventListener("click", () => enterRoomSummary(existing));
}

function renderChoices() {
  const iconInput = document.getElementById("playerIconText");
  if (iconInput && iconInput.value !== selectedIcon) iconInput.value = selectedIcon;
  const colorText = document.getElementById("playerColorText");
  const safeColor = normalizePlayerColor(selectedColor, paletteColors[0]);
  selectedColor = safeColor;
  if (colorText && colorText.value !== safeColor) colorText.value = safeColor;
  const colorNative = document.getElementById("playerColorNative");
  if (colorNative && colorNative.value !== safeColor) colorNative.value = safeColor;
  const colorHost = document.getElementById("colorChoices");
  colorHost.innerHTML = "";
  paletteColors.forEach((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `choice swatch ${color === selectedColor ? "selected" : ""}`;
    button.style.background = color;
    button.setAttribute("aria-label", color);
    button.addEventListener("click", () => {
      selectedColor = color;
      renderChoices();
    });
    colorHost.appendChild(button);
  });
}

function updateSelectedColorFromText(event) {
  const value = event.target.value.trim();
  const normalized = normalizePlayerColor(value, selectedColor, paletteColors[0]);
  if (selectedColor !== normalized) {
    selectedColor = normalized;
  }
  event.target.value = normalized;
  const colorNative = document.getElementById("playerColorNative");
  if (colorNative) colorNative.value = normalized;
  renderChoices();
}

function normalizeSelectedColorText(event) {
  const normalized = normalizePlayerColor(event.target.value, selectedColor, paletteColors[0]);
  selectedColor = normalized;
  event.target.value = normalized;
  const colorNative = document.getElementById("playerColorNative");
  if (colorNative) colorNative.value = normalized;
}

function updateSelectedColorFromNative(event) {
  const normalized = normalizePlayerColor(event.target.value, selectedColor, paletteColors[0]);
  selectedColor = normalized;
  const colorText = document.getElementById("playerColorText");
  if (colorText) colorText.value = normalized;
  renderChoices();
}

function setTurnColorVariables(element, color) {
  if (!element) return;
  const safeColor = isHexColor(color || "") ? color : "#1f7a5f";
  const turnSoft = mixColorWithWhite(safeColor, 0.14);
  const turnSoftStrong = mixColorWithWhite(safeColor, 0.26);
  element.style.setProperty("--turn-color", safeColor);
  element.style.setProperty("--turn-text", getContrastAwareTextColor(turnSoft));
  element.style.setProperty("--turn-soft", turnSoft);
  element.style.setProperty("--turn-soft-strong", turnSoftStrong);
  element.style.setProperty("--turn-glow", colorWithAlpha(safeColor, 0.35));
}

function updateSelectedIcon(event) {
  const value = event.target.value.trim();
  selectedIcon = value;
}

function clearEmojiField(event) {
  event.target.value = "";
  if (event.target.id === "playerIconText") selectedIcon = "";
}

function resetBlankEmojiField(event) {
  if (event.target.value.trim()) return;
  const icon = randomIcon();
  event.target.value = icon;
  if (event.target.id === "playerIconText") selectedIcon = icon;
}

function randomIcon() {
  return randomIcons[Math.floor(Math.random() * randomIcons.length)];
}

function randomTenDigitHash() {
  return String(Math.floor(1000000000 + Math.random() * 9000000000));
}

async function createPlayer(event) {
  event.preventDefault();
  const input = document.getElementById("playerName");
  const name = input.value.trim();
  if (!name) return;
  const player = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name,
    icon: selectedIcon || randomIcon(),
    color: normalizePlayerColor(selectedColor, paletteColors[0]),
  };
  try {
    const response = await api("/api/players/create", { player });
    players = response.players;
    finishPlayerSave(response.player.id, input);
  } catch (error) {
    alert(error.message);
  }
}

function finishPlayerSave(playerId, input) {
  setDeviceSelectedPlayer(playerId);
  input.value = "";
  selectedIcon = randomIcon();
  renderChoices();
  renderPlayers();
  renderSelectedPlayer();
  renderCurrentPlayer();
  renderGames();
  updateLobbyPresence();
  renderCreateGameButton();
  closePlayerModal();
}

function renderPlayers() {
  const host = document.getElementById("playerList");
  host.innerHTML = "";
  if (!players.length) {
    const empty = document.createElement("p");
    empty.textContent = "Create a player to start.";
    host.appendChild(empty);
    return;
  }
  players.forEach((player) => {
    const card = document.createElement("div");
    card.className = `player-card ${player.id === deviceSelectedPlayerId ? "selected" : ""}`;
    card.innerHTML = `${avatarHtml(player)}<strong>${escapeHtml(player.name)}</strong><button type="button" class="delete-player">Delete</button>`;
    card.addEventListener("click", () => selectPlayer(player.id, { closeModal: true }));
    card.querySelector(".delete-player").addEventListener("click", (event) => {
      event.stopPropagation();
      deletePlayer(player.id);
    });
    host.appendChild(card);
  });
}

function renderSelectedPlayer() {
  const host = document.getElementById("selectedPlayer");
  const player = deviceSelectedPlayer();
  if (host) host.innerHTML = player ? `${avatarHtml(player)}<strong>${escapeHtml(player.name)}</strong>` : "Create or select a player first.";
  renderRoomHostSummary();
}

function renderCurrentPlayer() {
  const host = document.getElementById("currentPlayer");
  const player = deviceSelectedPlayer();
  host.innerHTML = player ? `${avatarHtml(player)}<strong>${escapeHtml(player.name)}</strong>` : "No player selected";
}

function renderRoomHostSummary() {
  const host = document.getElementById("roomHostSummary");
  if (!host) return;
  const player = deviceSelectedPlayer();
  if (!player) {
    host.innerHTML = `<span class="label">Host</span><strong>No player selected</strong>`;
    return;
  }
  host.innerHTML = `<span class="label">Host</span>${avatarHtml(player)}<strong>${escapeHtml(player.name)}</strong>`;
}

function selectPlayer(playerId, options = {}) {
  setDeviceSelectedPlayer(playerId);
  renderPlayers();
  renderSelectedPlayer();
  renderCurrentPlayer();
  renderGames();
  updateLobbyPresence();
  renderCreateGameButton();
  if (options.closeModal) closePlayerModal();
}

async function deletePlayer(playerId) {
  const player = players.find((item) => item.id === playerId);
  if (!player) return;
  if (!confirm(`Delete ${player.name} from the shared player roster?`)) return;
  try {
    const response = await api("/api/players/delete", { id: playerId });
    players = response.players;
    finishPlayerDelete(playerId);
  } catch (error) {
    alert(error.message);
  }
}

function finishPlayerDelete(playerId) {
  if (selectedPlayerId === playerId) selectedPlayerId = "";
  if (deviceSelectedPlayerId === playerId) deviceSelectedPlayerId = "";
  saveSelectedPlayer();
  renderPlayers();
  renderSelectedPlayer();
  renderCurrentPlayer();
  renderGames();
  updateLobbyPresence();
  renderCreateGameButton();
}

function openPlayerModal(mode = "select") {
  document.getElementById("playerModal").classList.remove("hidden");
  if (mode === "create") {
    const form = document.getElementById("playerForm");
    form.scrollIntoView({ block: "nearest" });
    form.focus();
  }
}

function closePlayerModal() {
  document.getElementById("playerModal").classList.add("hidden");
}

function closePlayerModalOnBackdrop(event) {
  if (event.target.id === "playerModal") closePlayerModal();
}

async function openInvitePlayerModal() {
  opponentPickerMode = "remote";
  document.getElementById("invitePlayerTitle").textContent = "Invite Remote Opponent";
  const host = document.getElementById("invitePlayerList");
  host.textContent = "Checking lobby...";
  document.getElementById("invitePlayerModal").classList.remove("hidden");
  await refreshRemoteInviteSources();
  renderInvitePlayerList();
}

function openLocalOpponentModal() {
  opponentPickerMode = "local";
  document.getElementById("invitePlayerTitle").textContent = "Select Local Opponent";
  renderInvitePlayerList();
  document.getElementById("invitePlayerModal").classList.remove("hidden");
}

function closeInvitePlayerModal() {
  document.getElementById("invitePlayerModal").classList.add("hidden");
}

function closeInvitePlayerModalOnBackdrop(event) {
  if (event.target.id === "invitePlayerModal") closeInvitePlayerModal();
}

function renderInvitePlayerList() {
  const host = document.getElementById("invitePlayerList");
  host.innerHTML = "";
  if (!currentRoom) return;
  const seated = new Set(currentRoom.players.map((player) => player.id));
  const available = opponentPickerMode === "local"
    ? players.filter((player) => !seated.has(player.id))
    : remoteInviteCandidates(seated);
  if (!available.length) {
    host.textContent = opponentPickerMode === "remote" ? "No players in lobby." : "No available players.";
    return;
  }
  available.forEach((player) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "roster-player";
    button.innerHTML = `${avatarHtml(player)}<strong>${escapeHtml(player.name)}</strong>`;
    button.addEventListener("click", () => {
      if (opponentPickerMode === "local") joinLocalOpponent(player);
      else invitePlayer(player);
    });
    host.appendChild(button);
  });
}

async function refreshRemoteInviteSources() {
  try {
    await Promise.all([refreshLobbyPlayers(), refreshGameRooms()]);
  } catch {
    // Rendering falls back to the last known lobby/room lists.
  }
}

function remoteInviteCandidates(seated) {
  const busyPlayerIds = new Set(seated);
  currentGameRooms
    .filter((room) => room.status === "waiting_for_player" || room.status === "active")
    .forEach((room) => room.players.forEach((player) => busyPlayerIds.add(player.id)));
  return lobbyPlayers.filter((player) => !busyPlayerIds.has(player.id));
}

async function joinLocalOpponent(player) {
  if (!currentRoom) return;
  const homePlayerId = deviceSelectedPlayerId || selectedPlayerId;
  rememberLocalGameHomePlayer(currentRoom.code, homePlayerId);
  try {
    const response = await api("/api/room/join", { code: currentRoom.code, player, local: true });
    hostInviteStatus = null;
    setRoom(response.room);
    closeInvitePlayerModal();
  } catch (error) {
    alert(error.message);
  }
}

async function invitePlayer(player) {
  if (!currentRoom) return;
  try {
    const response = await api("/api/invite/create", { code: currentRoom.code, host_id: currentRoom.host_id, player });
    hostInviteStatus = response.invite;
    renderRoomInviteStatus();
    closeInvitePlayerModal();
  } catch (error) {
    alert(error.message);
  }
}

async function pollInvites() {
  const player = deviceSelectedPlayer();
  if (!player || !document.getElementById("invitePrompt").classList.contains("hidden")) return;
  try {
    const data = await fetchJson(`/api/invites?player_id=${encodeURIComponent(player.id)}`);
    if (data.ok && data.invites.length) showInvitePrompt(data.invites[0]);
  } catch {
    // Invite polling is best-effort; room actions still work without it.
  }
}

function showInvitePrompt(invite) {
  currentInvite = invite;
  document.getElementById("invitePromptText").textContent = `${invite.host_name} invited you to play ${gameName(invite.game_id)}.`;
  document.getElementById("invitePrompt").classList.remove("hidden");
}

async function respondToInvite(accept) {
  const player = deviceSelectedPlayer();
  if (!currentInvite || !player) return;
  try {
    const response = await api("/api/invite/respond", { invite_id: currentInvite.id, accept, player });
    document.getElementById("invitePrompt").classList.add("hidden");
    currentInvite = null;
    if (response.accepted && response.room) {
      selectedGameId = response.room.game_id;
      saveSelectedGame();
      hostInviteStatus = null;
      activeGameRoom = response.room;
      setRoom(response.room);
      renderGames();
      renderGameSelected();
      showScreen("game");
    }
  } catch (error) {
    alert(error.message);
  }
}

async function updatePlayerIcon(playerId, icon) {
  const player = players.find((item) => item.id === playerId);
  if (!player) return;
  const updated = { ...player, icon: icon.trim() || randomIcon() };
  updated.color = normalizePlayerColor(updated.color, selectedColor, paletteColors[0]);
  try {
    const response = await api("/api/players/create", { player: updated });
    players = response.players;
    if (deviceSelectedPlayerId === response.player.id) setDeviceSelectedPlayer(response.player.id);
    if (selectedPlayerId === response.player.id) selectedPlayerId = response.player.id;
    renderPlayers();
    renderSelectedPlayer();
    renderCurrentPlayer();
    updateLobbyPresence();
    renderCreateGameButton();
    if (currentRoom) renderGame();
  } catch (error) {
    alert(error.message);
  }
}

async function createRoom() {
  const player = deviceSelectedPlayer();
  if (!player) return alert("Select a player first.");
  try {
    const response = await api("/api/room/create", { game_id: selectedGameId, player });
    hostInviteStatus = null;
    activeGameRoom = response.room;
    setRoom(response.room);
    renderGames();
    refreshGameRooms();
    showScreen("game");
  } catch (error) {
    playerApiAvailable = false;
    renderCreateGameButton();
    alert(error.message);
  }
}

async function closeGame() {
  const confirmed = await confirmAction("Exit game?", "Exit this game and return to the game lobby?");
  if (!confirmed) return;
  const roomToClose = currentRoom;
  restoreLocalGameHomePlayer(roomToClose);
  if (roomToClose) {
    try {
      const exitingPlayerId = selectedPlayerId || deviceSelectedPlayerId;
      await api("/api/room/leave", { code: roomToClose.code, player_id: exitingPlayerId, requester_id: exitingPlayerId });
    } catch (error) {
      alert(error.message);
      return;
    }
  }
  forgetLocalGameHomePlayer(roomToClose);
  hostInviteStatus = null;
  currentRoom = null;
  activeGameRoom = null;
  hideWinOverlay();
  stopPolling();
  refreshGameRooms();
  showScreen("gameSelected");
}

async function resetGame() {
  if (!currentRoom) return;
  const completed = isCompletedRoom(currentRoom);
  const message = completed
    ? "Request a new game with these same players? The other player must agree."
    : "Request a board reset? The other player must agree.";
  const confirmed = await confirmAction("Are you sure?", message);
  if (!confirmed) return;
  hideWinOverlay();
  lastCelebratedWinKey = "";
  const response = await api("/api/room/reset", { code: currentRoom.code, requester_id: selectedPlayerId || deviceSelectedPlayerId });
  setRoom(response.room);
  if (response.reset === "pending") showTurnStatus(null, "Waiting for the other player to agree.");
}

async function makeMove(board, cell) {
  const player = selectedPlayer();
  if (!player || !currentRoom) return;
  try {
    const response = await api("/api/room/move", {
      code: currentRoom.code,
      player_id: player.id,
      board,
      cell,
    });
    setRoom(response.room);
  } catch (error) {
    showTurnStatus(null, error.message);
  }
}

function confirmAction(title, message) {
  const prompt = document.getElementById("confirmPrompt");
  document.getElementById("confirmPromptTitle").textContent = title;
  document.getElementById("confirmPromptText").textContent = message;
  prompt.classList.remove("hidden");
  return new Promise((resolve) => {
    pendingConfirmAction = resolve;
  });
}

function resolveConfirmPrompt(confirmed) {
  document.getElementById("confirmPrompt").classList.add("hidden");
  if (!pendingConfirmAction) return;
  const resolve = pendingConfirmAction;
  pendingConfirmAction = null;
  resolve(confirmed);
}

function closeConfirmPromptOnBackdrop(event) {
  if (event.target.id === "confirmPrompt") resolveConfirmPrompt(false);
}

function setRoom(room) {
  currentRoom = room;
  syncHostInviteStatusFromRoom(room);
  syncSelectedPlayerForLocalRoom();
  document.getElementById("roomTitle").textContent = gameName(room.game_id);
  renderRoomSlots();
  renderGame();
  handleIncomingResetRequest();
}

async function handleIncomingResetRequest() {
  if (!currentRoom || !currentRoom.reset_request) {
    handledResetRequestKey = "";
    return;
  }
  if (pendingConfirmAction) return;
  const request = currentRoom.reset_request;
  const localPlayer = selectedPlayer();
  if (!localPlayer || localPlayer.id === request.requester_id) return;
  const requestKey = `${currentRoom.code}:${request.requester_id}:${request.votes.join(",")}`;
  if (handledResetRequestKey === requestKey) return;
  handledResetRequestKey = requestKey;
  const confirmed = await confirmAction("Reset requested", `${request.requester_name} wants to reset this game. Agree?`);
  try {
    const response = await api("/api/room/reset", {
      code: currentRoom.code,
      requester_id: localPlayer.id,
      approve: confirmed,
    });
    setRoom(response.room);
  } catch (error) {
    alert(error.message);
  }
}

function syncHostInviteStatusFromRoom(room) {
  if (!room || room.started) return;
  hostInviteStatus = room.latest_invite || hostInviteStatus;
}

function renderRoomSlots() {
  if (!currentRoom) return;
  const hostSlot = document.getElementById("roomHostSlot");
  const opponentSlot = document.getElementById("roomOpponentSlot");
  const hostPlayer = currentRoom.players.find((player) => player.id === currentRoom.host_id);
  const opponent = currentRoom.players.find((player) => player.id !== currentRoom.host_id);
  hostSlot.innerHTML = hostPlayer ? roomPlayerHtml(hostPlayer) : "Host missing.";
  opponentSlot.classList.remove("status-only");
  if (opponent) {
    opponentSlot.innerHTML = roomPlayerHtml(opponent);
    hostInviteStatus = null;
    renderRoomInviteStatus();
    return;
  }
  if (currentRoom.host_id === deviceSelectedPlayerId) {
    opponentSlot.innerHTML = `
      <button id="selectLocalOpponent" class="secondary" type="button">Select Local Opponent</button>
      <button id="inviteRemoteOpponent" class="secondary" type="button">Invite Remote Opponent</button>
    `;
    document.getElementById("selectLocalOpponent").addEventListener("click", openLocalOpponentModal);
    document.getElementById("inviteRemoteOpponent").addEventListener("click", openInvitePlayerModal);
    renderRoomInviteStatus();
    return;
  }
  renderRoomInviteStatus();
  opponentSlot.textContent = hostInviteStatus ? inviteStatusText(hostInviteStatus) : "Waiting for host to invite a player.";
  opponentSlot.classList.add("status-only");
}

function renderRoomInviteStatus() {
  const host = document.getElementById("roomInviteStatus");
  if (!host) return;
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
  return `${avatarHtml(player)}<strong>${escapeHtml(player.name)}</strong><span>${escapeHtml(player.mark || "Waiting")}</span>`;
}

async function leaveRoom(playerId) {
  if (!currentRoom) return;
  try {
    const response = await api("/api/room/leave", { code: currentRoom.code, player_id: playerId, requester_id: selectedPlayerId });
    setRoom(response.room);
    refreshRooms();
  } catch (error) {
    alert(error.message);
  }
}

function renderGame() {
  if (!currentRoom) return;
  const game = currentRoom.game;
  const meta = document.getElementById("gameMeta");
  const resetButton = document.getElementById("resetGame");
  meta.textContent = `Room ${currentRoom.code}`;
  if (resetButton) resetButton.textContent = isCompletedRoom(currentRoom) ? "Play Again" : "Reset";
  document.getElementById("gamePlayersPanel").classList.toggle("hidden", currentRoom.started);
  setGameBoardVisible(true);
  renderGamePlayerSwitch();
  if (!currentRoom.started) {
    showTurnStatus(null, "Waiting for opponent.");
    lastLegalBoardsKey = "";
  } else if (game.status === "playing") {
    const current = currentRoom.players.find((player) => player.mark === game.current_player);
    showTurnStatus(current);
  } else if (game.status === "draw") {
    showTurnStatus(null, "Draw game.");
  } else {
    const winner = currentRoom.players.find((player) => player.mark === game.winner);
    showTurnStatus(winner, `${winner ? winner.name : game.winner} won.`);
    scheduleWinOverlay(winner, game.winner);
  }
  if (currentRoom.reset_request) {
    showTurnStatus(null, `${currentRoom.reset_request.requester_name} requested reset. Waiting for agreement.`);
  }

  const host = document.getElementById("macroBoard");
  host.innerHTML = "";
  const currentTurnPlayer = currentRoom.players.find((player) => player.mark === game.current_player);
  setTurnColorVariables(host, currentTurnPlayer ? currentTurnPlayer.color : "#1f7a5f");
  const legalBoardsKey = game.legal_boards.join(",");
  const shouldFlashLegalBoards = legalBoardsKey !== lastLegalBoardsKey;
  const macroWinLine = winningLineFor(game.small_winners, game.winner);
  const selectedSeat = currentRoom.players.find((player) => player.id === selectedPlayerId);
  const canSelectedPlayerMove = Boolean(currentRoom.started && selectedSeat && selectedSeat.mark === game.current_player);
  host.classList.toggle("your-turn", canSelectedPlayerMove && game.status === "playing");
  host.classList.toggle("waiting", game.status === "playing" && !canSelectedPlayerMove);
  game.boards.forEach((board, boardIndex) => {
    const small = document.createElement("div");
    const legal = currentRoom.started && game.legal_boards.includes(boardIndex);
    const result = game.small_winners[boardIndex];
    const smallWinLine = winningLineFor(board, result);
    const macroWinner = macroWinLine.includes(boardIndex);
    small.className = `small-board ${legal ? "legal" : ""} ${legal && shouldFlashLegalBoards ? "flash" : ""} ${result ? "done" : ""} ${macroWinner ? "macro-win-cell" : ""}`;
    applyBoardResultColor(small, result);
    board.forEach((value, cellIndex) => {
      const cell = document.createElement("button");
      cell.type = "button";
      const smallWinner = smallWinLine.includes(cellIndex);
      cell.className = `cell ${value ? value.toLowerCase() : ""} ${smallWinner ? "small-win-cell" : ""}`;
      cell.textContent = value || "";
      applyMarkColor(cell, value);
      cell.disabled = Boolean(value || result || !legal || game.status !== "playing" || !canSelectedPlayerMove);
      cell.addEventListener("click", () => makeMove(boardIndex, cellIndex));
      small.appendChild(cell);
    });
    if (result) {
      const winner = document.createElement("div");
      winner.className = `board-winner ${result.toLowerCase()}`;
      winner.textContent = result;
      applyMarkColor(winner, result, 0.34);
      small.appendChild(winner);
    }
    host.appendChild(small);
  });
  if (macroWinLine.length) {
    const line = document.createElement("div");
    line.className = `macro-win-line ${winLineClass(macroWinLine)}`;
    host.appendChild(line);
  }
  lastLegalBoardsKey = legalBoardsKey;
}

function isCompletedRoom(room) {
  return Boolean(room && (room.status === "completed" || ["x_won", "o_won", "draw"].includes(room.game.status)));
}

function setGameBoardVisible(visible) {
  document.getElementById("gamePlayerSwitch").classList.toggle("hidden", !visible);
  document.getElementById("turnStatus").classList.toggle("hidden", !visible);
  document.getElementById("macroBoard").classList.toggle("hidden", !visible);
}

function applyMarkColor(element, mark, tintAmount = 0.18) {
  const player = playerForMark(mark);
  if (!element || !player) return;
  const playerColor = safePlayerColor(player);
  const background = mixColorWithWhite(playerColor, tintAmount);
  element.style.background = background;
  element.style.borderColor = mixColorWithWhite(playerColor, 0.55);
  element.style.color = getContrastAwareTextColor(background);
}

function applyBoardResultColor(element, result) {
  const player = playerForMark(result);
  if (!element || !player) return;
  const playerColor = safePlayerColor(player);
  const background = mixColorWithWhite(playerColor, 0.22);
  element.style.background = background;
  element.style.borderColor = mixColorWithWhite(playerColor, 0.68);
  element.style.boxShadow = `0 0 0 3px ${colorWithAlpha(playerColor, 0.22)}`;
}

function playerForMark(mark) {
  if (!currentRoom || !mark || mark === "D") return null;
  return currentRoom.players.find((player) => player.mark === mark) || null;
}

function safePlayerColor(player) {
  return isHexColor(player && player.color ? player.color : "") ? player.color : "#1f7a5f";
}

function renderGamePlayerSwitch() {
  const host = document.getElementById("gamePlayerSwitch");
  host.innerHTML = "";
  if (!currentRoom || !currentRoom.started) return;

  currentRoom.players.forEach((roomPlayer) => {
    const isCurrentTurn = roomPlayer.mark === currentRoom.game.current_player && currentRoom.game.status === "playing";
    const label = document.createElement("div");
    label.className = `player-switch-button ${isCurrentTurn ? "current-turn" : ""}`;
    label.setAttribute("aria-current", isCurrentTurn ? "true" : "false");
    if (isCurrentTurn) applyPlayerLabelTurnColor(label, roomPlayer);
    label.innerHTML = `${avatarHtml(roomPlayer)}<span><strong>${escapeHtml(roomPlayer.mark)}</strong> ${escapeHtml(roomPlayer.name)}</span>`;
    host.appendChild(label);
  });
}

function applyPlayerLabelTurnColor(element, player) {
  if (!element || !player) return;
  const playerColor = safePlayerColor(player);
  const background = mixColorWithWhite(playerColor, 0.16);
  element.style.background = background;
  element.style.borderColor = mixColorWithWhite(playerColor, 0.64);
  element.style.color = getContrastAwareTextColor(background);
  element.style.boxShadow = `0 0 0 2px ${colorWithAlpha(playerColor, 0.18)}`;
}

function showTurnStatus(currentPlayer, overrideText = "") {
  const host = document.getElementById("turnStatus");
  if (!host) return;
  host.classList.remove("your-turn", "waiting");
  setTurnColorVariables(host, currentPlayer ? currentPlayer.color : "#1f7a5f");
  if (overrideText) {
    host.textContent = overrideText;
    return;
  }
  const selectedSeat = currentRoom.players.find((player) => player.id === selectedPlayerId);
  if (!selectedSeat) {
    host.textContent = "Select your player.";
    host.classList.add("waiting");
    return;
  }
  if (selectedSeat.mark === currentRoom.game.current_player) {
    setTurnColorVariables(host, selectedSeat.color);
    host.textContent = `It's Your Turn ${selectedSeat.name}; Place an ${selectedSeat.mark}`;
    host.classList.add("your-turn");
    return;
  }
  host.textContent = `Waiting for ${currentPlayer ? currentPlayer.name : currentRoom.game.current_player}.`;
  host.classList.add("waiting");
}

function scheduleWinOverlay(player, mark) {
  const winKey = `${currentRoom.code}:${currentRoom.game.move_count}:${mark}`;
  if (lastCelebratedWinKey === winKey) return;
  lastCelebratedWinKey = winKey;
  if (winOverlayTimer) clearTimeout(winOverlayTimer);
  winOverlayTimer = setTimeout(() => showWinOverlay(player, mark), 1000);
}

function showWinOverlay(player, mark) {
  const overlay = document.getElementById("winOverlay");
  const message = document.getElementById("winMessage");
  const winMark = document.getElementById("winMark");
  winMark.textContent = player ? player.icon : mark || "";
  winMark.style.background = player ? player.color : "";
  winMark.style.color = player ? getContrastAwareTextColor(player.color) : "";
  message.textContent = `${player ? player.name : mark} won!`;
  renderConfetti();
  overlay.classList.remove("hidden");
}

function hideWinOverlay() {
  if (winOverlayTimer) clearTimeout(winOverlayTimer);
  winOverlayTimer = null;
  document.getElementById("winOverlay").classList.add("hidden");
}

function renderConfetti() {
  const host = document.getElementById("confetti");
  host.innerHTML = "";
  const colors = ["#1f7a5f", "#1e63d6", "#c43d5d", "#facc15", "#8a4bd1"];
  for (let index = 0; index < 56; index += 1) {
    const piece = document.createElement("span");
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.45}s`;
    piece.style.animationDuration = `${1.6 + Math.random() * 0.8}s`;
    piece.style.transform = `rotate(${Math.random() * 180}deg)`;
    host.appendChild(piece);
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refreshRoom, 1500);
  refreshRoom();
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function startRoomListPolling() {
  if (roomListTimer) clearInterval(roomListTimer);
  roomListTimer = setInterval(refreshRooms, 2500);
  refreshRooms();
}

function startInvitePolling() {
  if (inviteTimer) clearInterval(inviteTimer);
  inviteTimer = setInterval(pollInvites, 1500);
  pollInvites();
}

async function refreshRooms() {
  try {
    await refreshCurrentRoomSummary();
  } catch {
    if (currentRoom) showTurnStatus(null, "Room refresh failed.");
  }
}

function startLobbyPresencePolling() {
  if (lobbyPresenceTimer) clearInterval(lobbyPresenceTimer);
  lobbyPresenceTimer = setInterval(() => {
    updateLobbyPresence();
    refreshGameRooms();
  }, 3000);
}

function stopLobbyPresencePolling() {
  if (lobbyPresenceTimer) clearInterval(lobbyPresenceTimer);
  lobbyPresenceTimer = null;
}

async function refreshCurrentRoomSummary() {
  if (!currentRoom) return;
  const wasStarted = currentRoom.started;
  const data = await fetchJson(`/api/room?code=${encodeURIComponent(currentRoom.code)}`);
  if (data.ok) {
    setRoom(data.room);
    refreshHostInviteStatus();
    if (!wasStarted && data.room.started && document.getElementById("game").classList.contains("active")) {
      showScreen("game");
    }
  } else {
    leaveClosedRoom();
  }
}

async function refreshRoom() {
  if (!currentRoom) return;
  try {
    const data = await fetchJson(`/api/room?code=${encodeURIComponent(currentRoom.code)}`);
    if (data.ok) {
      setRoom(data.room);
      await refreshHostInviteStatus();
    } else leaveClosedRoom();
  } catch {
    showTurnStatus(null, "Room refresh failed.");
  }
}

async function refreshHostInviteStatus() {
  if (!currentRoom || currentRoom.started || currentRoom.host_id !== deviceSelectedPlayerId) {
    if (hostInviteStatus) {
      hostInviteStatus = null;
      renderRoomInviteStatus();
    }
    return;
  }
  try {
    const url = `/api/invites?host_id=${encodeURIComponent(currentRoom.host_id)}&room_code=${encodeURIComponent(currentRoom.code)}`;
    const data = await fetchJson(url);
    if (!data.ok || !data.invites.length) return;
    hostInviteStatus = data.invites[data.invites.length - 1];
    renderRoomInviteStatus();
  } catch {
    // Host invite status is helpful feedback, not required to play.
  }
}

function leaveClosedRoom() {
  restoreLocalGameHomePlayer(currentRoom);
  forgetLocalGameHomePlayer(currentRoom);
  hostInviteStatus = null;
  currentRoom = null;
  activeGameRoom = null;
  hideWinOverlay();
  stopPolling();
  renderGames();
  refreshGameRooms();
  showScreen("gameSelected");
}

function selectedPlayer() {
  return players.find((player) => player.id === selectedPlayerId) || null;
}

function deviceSelectedPlayer() {
  return players.find((player) => player.id === deviceSelectedPlayerId) || null;
}

function setDeviceSelectedPlayer(playerId) {
  deviceSelectedPlayerId = playerId;
  selectedPlayerId = playerId;
  saveSelectedPlayer();
}

function syncSelectedPlayerForLocalRoom() {
  if (!isLocalModeRoom(currentRoom)) return;
  const currentTurnPlayer = currentRoom.players.find((player) => player.mark === currentRoom.game.current_player);
  const homePlayerId = localGameHomePlayerId(currentRoom);
  const targetPlayerId = currentRoom.started && currentRoom.game.status === "playing" && currentTurnPlayer
    ? currentTurnPlayer.id
    : homePlayerId;
  if (!targetPlayerId || selectedPlayerId === targetPlayerId) return;
  selectedPlayerId = targetPlayerId;
  renderPlayers();
  renderSelectedPlayer();
  renderCurrentPlayer();
  renderGames();
  updateLobbyPresence();
  renderCreateGameButton();
}

function isLocalModeRoom(room) {
  return Boolean(room && (room.local_mode || localGameHomePlayers[room.code]));
}

function localGameHomePlayerId(room) {
  if (!room) return "";
  const remembered = localGameHomePlayers[room.code];
  if (typeof remembered === "string") return remembered;
  if (remembered && remembered.device_hash === deviceSelectionHash) return remembered.player_id || "";
  return deviceSelectedPlayerId || room.host_id || "";
}

function rememberLocalGameHomePlayer(roomCode, playerId) {
  if (!roomCode || !playerId) return;
  localGameHomePlayers[roomCode] = {
    player_id: playerId,
    device_hash: deviceSelectionHash,
  };
  saveLocalGameHomePlayers();
}

function restoreLocalGameHomePlayer(room) {
  const homePlayerId = localGameHomePlayerId(room);
  if (!homePlayerId) return;
  const changed = selectedPlayerId !== homePlayerId || deviceSelectedPlayerId !== homePlayerId;
  selectedPlayerId = homePlayerId;
  if (deviceSelectedPlayerId !== homePlayerId) {
    deviceSelectedPlayerId = homePlayerId;
    saveSelectedPlayer();
  }
  if (!changed) return;
  renderPlayers();
  renderSelectedPlayer();
  renderCurrentPlayer();
  renderGames();
  updateLobbyPresence();
  renderCreateGameButton();
}

function forgetLocalGameHomePlayer(room) {
  if (!room || !localGameHomePlayers[room.code]) return;
  delete localGameHomePlayers[room.code];
  saveLocalGameHomePlayers();
}

function selectedGame() {
  return games.find((game) => game.id === selectedGameId) || games.find(gameIsReady) || games[0];
}

function gameName(gameId) {
  const game = games.find((item) => item.id === gameId);
  return game ? game.name : "Game";
}

function gameIsReady(game) {
  return Boolean(game && game.availability === "ready");
}

function gameAvailabilityText(game) {
  if (!game) return "Game unavailable.";
  if (game.availability === "ready") return "Ready";
  if (game.availability === "coming_soon") return "Coming soon.";
  return "Game unavailable.";
}

function winningLineFor(values, winner) {
  if (!winner || winner === "D") return [];
  const line = winLines.find(([a, b, c]) => values[a] === winner && values[b] === winner && values[c] === winner);
  return line || [];
}

function winLineClass(line) {
  const key = line.join("-");
  const classes = {
    "0-1-2": "row-0",
    "3-4-5": "row-1",
    "6-7-8": "row-2",
    "0-3-6": "col-0",
    "1-4-7": "col-1",
    "2-5-8": "col-2",
    "0-4-8": "diag-down",
    "2-4-6": "diag-up",
  };
  return classes[key] || "";
}

async function refreshPlayers() {
  try {
    const data = await fetchJson("/api/players");
    if (!data.ok) throw new Error(data.error || "Could not load players.");
    playerApiAvailable = true;
    players = data.players;
    if (!selectedPlayerId && deviceSelectedPlayerId) selectedPlayerId = deviceSelectedPlayerId;
    saveSelectedPlayer();
    renderPlayers();
    renderSelectedPlayer();
    renderCurrentPlayer();
    renderGames();
    updateLobbyPresence();
    renderCreateGameButton();
  } catch (error) {
    playerApiAvailable = false;
    players = [];
    renderPlayers();
    renderSelectedPlayer();
    renderCurrentPlayer();
    renderGames();
    renderCreateGameButton();
    showRosterError(error.message);
  }
}

function loadLocalGameHomePlayers() {
  try {
    return JSON.parse(localStorage.getItem("sogotable.localGameHomePlayers") || "{}");
  } catch {
    return {};
  }
}

function saveLocalGameHomePlayers() {
  localStorage.setItem("sogotable.localGameHomePlayers", JSON.stringify(localGameHomePlayers));
}

function saveSelectedPlayer() {
  localStorage.setItem("sogotable.deviceSelectedPlayerId", deviceSelectedPlayerId);
  localStorage.setItem("sogotable.selectedPlayerId", deviceSelectedPlayerId);
  localStorage.setItem("sogotable.deviceSelectionHash", deviceSelectionHash);
}

function purgeDeprecatedLocalRoster() {
  localStorage.removeItem("sogotable.players");
  localStorage.removeItem("sogotable.playersMigrated");
  localStorage.removeItem(`${LEGACY_STORAGE_PREFIX}.players`);
  localStorage.removeItem(`${LEGACY_STORAGE_PREFIX}.playersMigrated`);
}

function migrateStorageNamespace() {
  const keys = [
    "selectedPlayerId",
    "deviceSelectedPlayerId",
    "deviceSelectionHash",
    "selectedGameId",
    "localGameHomePlayers",
  ];
  keys.forEach((key) => {
    const oldKey = `${LEGACY_STORAGE_PREFIX}.${key}`;
    const newKey = `sogotable.${key}`;
    if (localStorage.getItem(newKey) === null && localStorage.getItem(oldKey) !== null) {
      localStorage.setItem(newKey, localStorage.getItem(oldKey));
    }
  });
}

function showRosterError(message) {
  const host = document.getElementById("playerList");
  host.innerHTML = `<p>${escapeHtml(message)}</p>`;
}

function saveSelectedGame() {
  localStorage.setItem("sogotable.selectedGameId", selectedGameId);
}

