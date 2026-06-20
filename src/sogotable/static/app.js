import { api, fetchJson } from "./api-client.js";
import {
  colorWithAlpha,
  getContrastAwareTextColor,
  isHexColor,
  mixColorWithWhite,
  normalizePlayerColor,
} from "./color-utils.js";
import { avatarHtml, escapeHtml } from "./html-utils.js";
import { createRealtimeController } from "./realtime.js";
import { renderSuperTicTacToeBoard } from "./games/super-tic-tac-toe/render.js";
import {
  isSoundEnabled,
  soundVolumeLevel,
  playBattleshipHit,
  playBattleshipMiss,
  playCancel,
  playClick,
  playConfirm,
  playInvalidMove,
  playInviteReceived,
  playLose,
  playPlayerJoined,
  playRoomCreated,
  playTurnChanged,
  playWin,
  toggleSound,
  unlockAudio,
} from "./sound.js";

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
const CLASSIC_GAME_ID = "a3f19c6e42b8";
const TACTICAL_GAME_ID = "d7e4a91f0c23";
const BOXES_GAME_ID = "4b7e2d9a6c10";
const BATTLESHIP_GAME_ID = "9c2f7a81d4e6";
const QUORIDOR_GAME_ID = "8f5d2c7a1b90";
const BATTLESHIP_ATTACK_PHRASES = [
  "Incoming!",
  "Fire!",
  "Taking the shot.",
  "Attack launched.",
  "Target acquired.",
  "Weapons hot.",
  "Locked and loaded.",
  "Let it fly.",
];
const BATTLESHIP_HIT_PHRASES = [
  "Direct hit!",
  "Boom. Contact.",
  "Target damaged.",
  "That one landed.",
  "Good hit.",
  "Impact confirmed.",
  "That hurt.",
];
const BATTLESHIP_MISS_PHRASES = [
  "Splash... nothing.",
  "Empty water.",
  "No contact.",
  "Shot went wide.",
  "Just waves.",
  "Clean miss.",
  "Ghost target.",
];
const BATTLESHIP_SUNK_PHRASES = [
  "Target sunk!",
  "One less problem.",
  "Enemy down.",
  "They're going under.",
  "Scratch one.",
  "Sent to the deep.",
  "Confirmed kill.",
];
const fallbackGames = [
  {
    id: CLASSIC_GAME_ID,
    aliases: ["super_tic_tac_toe"],
    name: "Super Tic Tac Toe",
    summary: "A nested tic tac toe duel where every move sends the next player to a target board.",
    players: "2 players",
    status: "Ready",
    availability: "ready",
  },
  {
    id: TACTICAL_GAME_ID,
    aliases: ["super_tactical_tac_toe"],
    name: "Super Tic Tactical Toe",
    summary: "Ultimate tic tac toe with tactical coin and treasure pickups for bonus points.",
    players: "2 players",
    status: "Ready",
    availability: "ready",
  },
  {
    id: BOXES_GAME_ID,
    aliases: ["boxes", "dots_and_boxes", "dots_and_dashes"],
    name: "Dots and Boxes",
    summary: "Claim edges between dots, complete boxes, and keep the turn when you score.",
    players: "2 players",
    status: "Ready",
    availability: "ready",
  },
  {
    id: BATTLESHIP_GAME_ID,
    aliases: ["battleship", "battle_ship"],
    name: "Battleship",
    summary: "Place your fleet, switch between defence and offence, and sink the enemy ships.",
    players: "2 players",
    status: "Ready",
    availability: "ready",
  },
  {
    id: QUORIDOR_GAME_ID,
    aliases: ["quoridor"],
    name: "Quoridor",
    summary: "Race your pawn across the board while placing walls to slow your opponent.",
    players: "2 players",
    status: "Ready",
    availability: "ready",
  },
];
let games = [...fallbackGames];

migrateStorageNamespace();

let players = [];
let selectedPlayerId = localStorage.getItem("sogotable.selectedPlayerId") || "";
let deviceSelectedPlayerId = localStorage.getItem("sogotable.deviceSelectedPlayerId") || selectedPlayerId;
let deviceSelectionHash = localStorage.getItem("sogotable.deviceSelectionHash") || randomTenDigitHash();
if (!selectedPlayerId && deviceSelectedPlayerId) selectedPlayerId = deviceSelectedPlayerId;
let selectedGameId = localStorage.getItem("sogotable.selectedGameId") || games[0].id;
selectedGameId = canonicalGameId(selectedGameId);
let selectedIcon = randomIcon();
let selectedColor = paletteColors[0];
let editingPlayerId = "";
let playerModalMode = "select";
let currentRoom = null;
let currentInvite = null;
let hostInviteStatus = null;
let activeGameRoom = null;
let currentGameRooms = [];
let lobbyPlayers = [];
let availableBots = [];
let currentGameStats = { high_scores: [], ratings: [] };
let selectedPlayerStats = [];
let lastLobbyPlayersKey = "";
let lastCurrentGameRoomsKey = "";
let lastActiveGameNoticeKey = "";
let lastGameStatsKey = "";
let lastSelectedPlayerStatsKey = "";
let lastInviteSoundKey = "";
let lastPlayerJoinedSoundKey = "";
let lastTurnSoundKey = "";
let lastGameEventSoundKey = "";
let lastGameOverSoundKey = "";
let selectedPlayerStatsRequestId = 0;
let opponentPickerMode = "remote";
let playerApiAvailable = true;
let lastLegalBoardsKey = "";
let battleshipViewMode = "auto";
let battleshipSelectedShipId = "carrier";
let battleshipDrafts = {};
let battleshipResultReveal = null;
let battleshipResultTimer = null;
let battleshipQueuedReveal = null;
let battleshipPendingDefence = null;
let battleshipPendingDefenceTimer = null;
let battleshipReviewMark = "";
let quoridorMode = "pawn";
let quoridorDraftWall = null;
let quoridorWallHoldTimer = null;
let quoridorWallHoldButton = null;
let lastRenderedRoomKey = "";
let lastCelebratedWinKey = "";
let pendingMove = null;
const BATTLESHIP_RESULT_REVEAL_DELAY_MS = 1000;
let winOverlayTimer = null;
let localGameHomePlayers = loadLocalGameHomePlayers();
let pendingConfirmAction = null;
let handledResetRequestKey = "";
const realtime = createRealtimeController({
  getAppSubscription: () => ({
    gameId: selectedGame().id,
    playerId: deviceSelectedPlayerId,
  }),
  onAppMessage: handleAppEventMessage,
  onRoomMessage: handleRoomSocketMessage,
  onRoomReconnect: () => showTurnStatus(null, "Reconnecting to room..."),
  refreshRoom,
  shouldReconnectRoom: () => Boolean(currentRoom),
});
localStorage.setItem("sogotable.deviceSelectionHash", deviceSelectionHash);

document.addEventListener("DOMContentLoaded", () => {
  purgeDeprecatedLocalRoster();
  registerServiceWorker();
  refreshRevisionSummary();
  bindNavigation();
  bindSoundControls();
  refreshGameDefinitions();
  renderGames();
  renderChoices();
  refreshPlayers();
  renderSelectedGame();
  renderSelectedPlayer();
  renderCurrentPlayer();
  document.getElementById("playerForm").addEventListener("submit", createPlayer);
  document.getElementById("clearPlayerStats").addEventListener("click", clearEditingPlayerStats);
  document.getElementById("openEditPlayerModal").addEventListener("click", openSelectedPlayerEditor);
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
  document.getElementById("openGameStats").addEventListener("click", openGameStatsModal);
  document.getElementById("closeGameStatsModal").addEventListener("click", closeGameStatsModal);
  document.getElementById("gameStatsModal").addEventListener("click", closeGameStatsModalOnBackdrop);
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
  bindRefreshTitleControls();
  realtime.connectAppEvents();
});

function bindSoundControls() {
  renderSoundControls();
  document.addEventListener("pointerdown", unlockAudio, { once: true });
  document.addEventListener("keydown", unlockAudio, { once: true });
  document.addEventListener("click", playControlClickSound);
  document.querySelectorAll("[data-sound-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleSound();
      renderSoundControls();
      playConfirm();
    });
  });
}

function renderSoundControls() {
  const enabled = isSoundEnabled();
  const level = soundVolumeLevel();
  document.querySelectorAll("[data-sound-toggle]").forEach((button) => {
    button.classList.toggle("muted", !enabled);
    button.textContent = enabled ? "🔊" : "🔇";
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute("aria-label", enabled ? "Mute sound" : "Unmute sound");
    button.title = enabled ? "Mute sound" : "Unmute sound";
    button.dataset.volumeLevel = enabled ? String(level) : "0";
    button.innerHTML = `<span aria-hidden="true">${enabled ? "🔊" : "🔇"}</span>`;
    button.setAttribute("aria-label", enabled ? `Sound volume ${level} of 5` : "Sound muted");
    button.title = enabled ? `Sound volume ${level} of 5` : "Sound muted";
  });
}

function playControlClickSound(event) {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  if (button.classList.contains("cell")) return;
  if (button.matches("[data-sound-toggle]")) return;
  playClick();
}

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
  if (name === "game") startRoomLiveUpdates();
  if (name === "gameSelected") {
    renderGameSelected();
    refreshSelectedGameView();
  }
}

function bindRefreshTitleControls() {
  bindRefreshTitleControl("selectedGameTitle", "Refresh game view", refreshSelectedGameView);
  bindRefreshTitleControl("roomTitle", "Refresh room view", refreshCurrentRoomView);
}

function bindRefreshTitleControl(elementId, label, refreshAction) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.classList.add("refreshable-title");
  element.setAttribute("role", "button");
  element.setAttribute("tabindex", "0");
  element.setAttribute("aria-label", label);
  element.title = label;
  const triggerRefresh = () => {
    void refreshAction();
  };
  element.addEventListener("click", triggerRefresh);
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    triggerRefresh();
  });
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
  renderGameStatsLink();
  lastLobbyPlayersKey = "";
  lastCurrentGameRoomsKey = "";
  lastActiveGameNoticeKey = "";
  lastGameStatsKey = "";
  renderCurrentGames();
  renderCreateGameButton();
  renderActiveGameNotice();
}

async function refreshSelectedGameView() {
  if (!selectedGame()) return;
  realtime.sendAppEventSubscription();
  await Promise.all([
    refreshLobbyPlayers(),
    refreshGameStats(),
    refreshGameRooms(),
    refreshPendingInvites(),
    updateLobbyPresence(),
  ]);
}

async function refreshGameDefinitions() {
  try {
    const data = await fetchJson("/api/games");
    if (!data.ok || !Array.isArray(data.games) || !data.games.length) throw new Error(data.error || "Could not load games.");
    games = normalizeGameDefinitions(data.games);
    selectedGameId = canonicalGameId(selectedGameId);
    saveSelectedGame();
    renderGames();
    renderSelectedGame();
    if (document.getElementById("gameSelected").classList.contains("active")) {
      renderGameSelected();
      refreshSelectedGameView();
    }
  } catch {
    games = [...fallbackGames];
    selectedGameId = canonicalGameId(selectedGameId);
    renderGames();
    renderSelectedGame();
    if (document.getElementById("gameSelected").classList.contains("active")) {
      renderGameSelected();
      refreshSelectedGameView();
    }
  }
}

function normalizeGameDefinitions(definitions) {
  return definitions.map((game) => ({
    id: String(game.id || "").trim(),
    aliases: Array.isArray(game.aliases) ? game.aliases.map((alias) => String(alias)) : [],
    name: String(game.name || "Game").trim() || "Game",
    summary: String(game.summary || "").trim(),
    players: String(game.players || "2 players").trim(),
    status: String(game.status || "Ready").trim(),
    availability: String(game.availability || "ready").trim(),
  })).filter((game) => game.id);
}

function renderLobbyPlayers() {
  const host = document.getElementById("lobbyPlayers");
  if (!host) return;
  const nextKey = lobbyPlayersSignature(lobbyPlayers);
  if (nextKey === lastLobbyPlayersKey) return;
  lastLobbyPlayersKey = nextKey;
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

async function refreshGameStats() {
  const game = selectedGame();
  if (!game) return;
  try {
    const data = await fetchJson(`/api/stats?game_id=${encodeURIComponent(game.id)}`);
    if (!data.ok) throw new Error(data.error || "Could not load stats.");
    currentGameStats = data.stats || { high_scores: [], ratings: [] };
    renderGameStats();
  } catch {
    currentGameStats = { high_scores: [], ratings: [] };
    renderGameStats();
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
    if (response.stats) {
      currentGameStats = response.stats;
      renderGameStats();
    }
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
    // A transient read failure should not strand the screen; the next explicit refresh or socket update can recover.
  }
}

function renderCurrentGames(errorMessage = "") {
  const openHost = document.getElementById("openGamesList");
  const closedHost = document.getElementById("closedGamesList");
  if (!openHost || !closedHost) return;
  const nextKey = errorMessage ? `error:${errorMessage}` : gameRoomsSignature(currentGameRooms);
  if (nextKey === lastCurrentGameRoomsKey) return;
  lastCurrentGameRoomsKey = nextKey;
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
      <button type="button" class="${canReenter || canJoin ? "secondary" : "ghost"}">${escapeHtml(actionText)}</button>
      <div class="room-summary-players">${room.players.map((player) => avatarHtml(player)).join("")}</div>
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
  const nextKey = errorMessage
    ? `error:${errorMessage}`
    : existing ? JSON.stringify({ selectedPlayerId: deviceSelectedPlayerId, room: roomSummarySignature(existing) }) : "hidden";
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
  host.querySelector("button").addEventListener("click", () => enterRoomSummary(existing));
}

function lobbyPlayersSignature(items) {
  const orderedPlayers = [...items].sort((left, right) => {
    if (left.id === deviceSelectedPlayerId) return -1;
    if (right.id === deviceSelectedPlayerId) return 1;
    return String(left.name || "").localeCompare(String(right.name || ""), undefined, { sensitivity: "base" });
  });
  return JSON.stringify(orderedPlayers.map((player) => playerSignature(player)));
}

function gameRoomsSignature(rooms) {
  return JSON.stringify({
    selectedPlayerId: deviceSelectedPlayerId,
    rooms: [...rooms]
      .sort((left, right) => String(left.code || "").localeCompare(String(right.code || "")))
      .map((room) => roomSummarySignature(room)),
  });
}

function renderGameStats() {
  const host = document.getElementById("gameStats");
  if (!host) return;
  const game = selectedGame();
  const gameId = canonicalGameId(game && game.id);
  const nextKey = JSON.stringify({ gameId, stats: currentGameStats || {} });
  if (nextKey === lastGameStatsKey) return;
  lastGameStatsKey = nextKey;
  host.innerHTML = "";
  if (gameId === TACTICAL_GAME_ID || gameId === BOXES_GAME_ID) {
    host.appendChild(lobbyStatsTable("High Scores", currentGameStats.high_scores || [], "Score", "score", "No scores yet."));
  } else {
    host.appendChild(lobbyStatsTable("ELO Ratings", currentGameStats.ratings || [], "ELO", "rating", "No ratings yet."));
  }
}

function renderGameStatsLink() {
  const button = document.getElementById("openGameStats");
  const title = document.getElementById("gameStatsTitle");
  const gameId = canonicalGameId(selectedGame().id);
  const label = gameId === TACTICAL_GAME_ID || gameId === BOXES_GAME_ID ? "High Scores" : "ELO";
  if (button) button.textContent = label;
  if (title) title.textContent = label;
}

async function openGameStatsModal() {
  renderGameStatsLink();
  await refreshGameStats();
  document.getElementById("gameStatsModal").classList.remove("hidden");
}

function closeGameStatsModal() {
  document.getElementById("gameStatsModal").classList.add("hidden");
}

function closeGameStatsModalOnBackdrop(event) {
  if (event.target.id === "gameStatsModal") closeGameStatsModal();
}

function lobbyStatsTable(title, items, valueLabel, valueKey, emptyText) {
  const table = document.createElement("table");
  table.className = "lobby-stat-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th scope="col">${escapeHtml(title)}</th>
        <th scope="col">${escapeHtml(valueLabel)}</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const body = table.querySelector("tbody");
  const rows = items;
  if (!rows.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<th scope="row">${escapeHtml(emptyText)}</th><td>-</td>`;
    body.appendChild(row);
    return table;
  }
  rows.forEach((item, index) => {
    const row = document.createElement("tr");
    const value = Number(item[valueKey] || (valueKey === "rating" ? 1000 : 0));
    row.innerHTML = `
      <th scope="row">${index + 1}. ${escapeHtml(item.player_icon || "")} ${escapeHtml(item.player_name || "Player")}</th>
      <td>${value}</td>
    `;
    body.appendChild(row);
  });
  return table;
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

function playerSignature(player) {
  return {
    id: player.id,
    name: player.name,
    icon: player.icon,
    color: player.color,
    mark: player.mark,
  };
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
  const wasEditing = Boolean(editingPlayerId);
  const player = {
    id: editingPlayerId || newOpaquePlayerId(),
    name,
    icon: selectedIcon || randomIcon(),
    color: normalizePlayerColor(selectedColor, paletteColors[0]),
  };
  try {
    const response = await api("/api/players/create", { player });
    players = response.players;
    finishPlayerSave(response.player.id, input, wasEditing);
    playConfirm();
  } catch (error) {
    alert(error.message);
  }
}

function finishPlayerSave(playerId, input, wasEditing = false) {
  if (!wasEditing || playerId === deviceSelectedPlayerId) setDeviceSelectedPlayer(playerId);
  renderPlayers();
  renderSelectedPlayer();
  renderCurrentPlayer();
  renderGames();
  refreshSelectedPlayerStats();
  updateLobbyPresence();
  renderCreateGameButton();
  closePlayerModal();
}

function newOpaquePlayerId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function resetPlayerForm(input = document.getElementById("playerName")) {
  editingPlayerId = "";
  if (input) input.value = "";
  selectedIcon = randomIcon();
  selectedColor = paletteColors[0];
  setPlayerFormMode("create");
  renderChoices();
}

function setPlayerFormMode(mode) {
  const editing = mode === "edit";
  const title = document.getElementById("playerFormTitle");
  const submit = document.getElementById("playerFormSubmit");
  const clearStats = document.getElementById("clearPlayerStats");
  if (title) title.textContent = editing ? "Edit Player" : "Create New Player";
  if (submit) submit.textContent = editing ? "Save Changes" : "Create Player";
  if (clearStats) clearStats.classList.toggle("hidden", !editing);
}

function renderPlayers() {
  const host = document.getElementById("playerList");
  host.innerHTML = "";
  const visiblePlayers = playerModalMode === "edit" && editingPlayerId
    ? players.filter((player) => player.id === editingPlayerId)
    : players;
  if (!visiblePlayers.length) {
    const empty = document.createElement("p");
    empty.textContent = "Create a player to start.";
    host.appendChild(empty);
    return;
  }
  visiblePlayers.forEach((player) => {
    const editing = playerModalMode === "edit" && player.id === editingPlayerId;
    const card = document.createElement("div");
    card.className = `player-card ${player.id === deviceSelectedPlayerId ? "selected" : ""} ${editing ? "editing" : ""}`;
    card.innerHTML = `
      ${avatarHtml(player)}
      <strong>${escapeHtml(player.name)}</strong>
      <div class="player-actions ${editing ? "hidden" : ""}">
        <button type="button" class="secondary edit-player">Edit</button>
        <button type="button" class="delete-player">Delete</button>
      </div>
    `;
    card.addEventListener("click", () => selectPlayer(player.id, { closeModal: true }));
    card.querySelector(".edit-player").addEventListener("click", (event) => {
      event.stopPropagation();
      editPlayer(player.id);
    });
    card.querySelector(".delete-player").addEventListener("click", (event) => {
      event.stopPropagation();
      deletePlayer(player.id);
    });
    host.appendChild(card);
  });
}

function editPlayer(playerId) {
  const player = players.find((item) => item.id === playerId);
  if (!player) return;
  playerModalMode = "edit";
  editingPlayerId = player.id;
  document.getElementById("playerName").value = player.name;
  selectedIcon = player.icon || randomIcon();
  selectedColor = normalizePlayerColor(player.color, paletteColors[0]);
  setExistingPlayersVisible(true);
  setPlayerFormVisible(true);
  setPlayerFormMode("edit");
  renderChoices();
  renderPlayers();
  const form = document.getElementById("playerForm");
  form.scrollIntoView({ block: "nearest" });
  form.focus();
}

function openSelectedPlayerEditor() {
  const player = deviceSelectedPlayer();
  if (!player) return;
  openPlayerModal("select");
  editPlayer(player.id);
}

async function clearEditingPlayerStats() {
  const player = players.find((item) => item.id === editingPlayerId);
  if (!player) return;
  if (!confirm(`Clear all stats for ${player.name}?`)) return;
  try {
    const response = await api("/api/player/stats/clear", { player_id: player.id });
    if (player.id === deviceSelectedPlayerId) {
      selectedPlayerStats = response.stats || [];
      renderSelectedPlayerStats();
    }
    await refreshSelectedPlayerStats();
    await refreshGameStats(selectedGame());
    playConfirm();
    alert(`Stats cleared for ${player.name}.`);
  } catch (error) {
    alert(error.message);
  }
}

function renderSelectedPlayer() {
  const host = document.getElementById("selectedPlayer");
  const player = deviceSelectedPlayer();
  if (host) host.innerHTML = player ? `${avatarHtml(player)}<strong>${escapeHtml(player.name)}</strong>` : "Create or select a player first.";
  renderSelectedPlayerStats();
  renderRoomHostSummary();
}

async function refreshSelectedPlayerStats() {
  const playerId = deviceSelectedPlayerId;
  const requestId = selectedPlayerStatsRequestId + 1;
  selectedPlayerStatsRequestId = requestId;
  if (!playerId) {
    selectedPlayerStats = [];
    renderSelectedPlayerStats();
    return;
  }
  try {
    const data = await fetchJson(`/api/player/stats?player_id=${encodeURIComponent(playerId)}`);
    if (requestId !== selectedPlayerStatsRequestId) return;
    if (!data.ok) throw new Error(data.error || "Could not load player stats.");
    selectedPlayerStats = data.stats || [];
    renderSelectedPlayerStats();
  } catch {
    if (requestId !== selectedPlayerStatsRequestId) return;
    selectedPlayerStats = [];
    renderSelectedPlayerStats("Stats unavailable.");
  }
}

function renderSelectedPlayerStats(message = "") {
  const host = document.getElementById("selectedPlayerStats");
  if (!host) return;
  const player = deviceSelectedPlayer();
  if (!player) {
    host.classList.add("hidden");
    host.innerHTML = "";
    lastSelectedPlayerStatsKey = "hidden";
    return;
  }
  const nextKey = JSON.stringify({ playerId: player.id, message, stats: selectedPlayerStats });
  if (nextKey === lastSelectedPlayerStatsKey) return;
  lastSelectedPlayerStatsKey = nextKey;
  host.classList.remove("hidden");
  if (message) {
    host.innerHTML = `<span class="label">Player Stats</span><p>${escapeHtml(message)}</p>`;
    return;
  }
  const rows = (selectedPlayerStats || []).map((item) => `
    <tr>
      <th scope="row">${escapeHtml(item.game_name || "Game")}</th>
      <td>${Number(item.games_played || 0)}</td>
      <td>${Number(item.games_won || 0)}</td>
      <td>${Number(item.personal_high_score || 0)}</td>
      <td>${Number(item.elo || 1000)}</td>
    </tr>
  `).join("");
  host.innerHTML = `
    <span class="label">Player Stats</span>
    <table class="player-stat-table">
      <thead>
        <tr>
          <th scope="col">Game</th>
          <th scope="col">Played</th>
          <th scope="col">Won</th>
          <th scope="col">High</th>
          <th scope="col">ELO</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderCurrentPlayer() {
  const host = document.getElementById("currentPlayer");
  const player = deviceSelectedPlayer();
  host.innerHTML = player ? `${avatarHtml(player)}<strong>${escapeHtml(player.name)}</strong>` : "No player selected";
  document.getElementById("openEditPlayerModal").disabled = !player;
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
  refreshSelectedPlayerStats();
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
  refreshSelectedPlayerStats();
  updateLobbyPresence();
  renderCreateGameButton();
}

function openPlayerModal(mode = "select") {
  playerModalMode = mode;
  setExistingPlayersVisible(mode !== "create");
  setPlayerFormVisible(mode !== "select");
  document.getElementById("playerModal").classList.remove("hidden");
  if (mode === "create") {
    resetPlayerForm();
    const form = document.getElementById("playerForm");
    form.scrollIntoView({ block: "nearest" });
    form.focus();
  } else {
    resetPlayerForm();
    renderPlayers();
  }
}

function closePlayerModal() {
  resetPlayerForm();
  playerModalMode = "select";
  setExistingPlayersVisible(true);
  setPlayerFormVisible(true);
  document.getElementById("playerModal").classList.add("hidden");
}

function closePlayerModalOnBackdrop(event) {
  if (event.target.id === "playerModal") closePlayerModal();
}

function setExistingPlayersVisible(visible) {
  document.getElementById("existingPlayersSection").classList.toggle("hidden", !visible);
}

function setPlayerFormVisible(visible) {
  document.getElementById("playerForm").classList.toggle("hidden", !visible);
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

async function openBotOpponentModal() {
  opponentPickerMode = "bot";
  document.getElementById("invitePlayerTitle").textContent = "Invite Bot";
  const host = document.getElementById("invitePlayerList");
  host.textContent = "Loading bots...";
  document.getElementById("invitePlayerModal").classList.remove("hidden");
  await refreshAvailableBots();
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
  const available = opponentPickerMode === "bot"
    ? availableBots.filter((bot) => !seated.has(bot.id))
    : opponentPickerMode === "local"
    ? players.filter((player) => !seated.has(player.id))
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
    const data = await fetchJson(`/api/bots?game_id=${encodeURIComponent(selectedGame().id)}`);
    availableBots = data.ok ? data.bots || [] : [];
  } catch {
    availableBots = [];
  }
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

async function joinBotOpponent(bot) {
  if (!currentRoom) return;
  try {
    const response = await api("/api/room/join-bot", {
      code: currentRoom.code,
      host_id: currentRoom.host_id,
      bot_id: bot.id,
    });
    hostInviteStatus = null;
    setRoom(response.room);
    closeInvitePlayerModal();
    playConfirm();
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
    playConfirm();
  } catch (error) {
    alert(error.message);
  }
}

async function refreshPendingInvites() {
  const player = deviceSelectedPlayer();
  if (!player || !document.getElementById("invitePrompt").classList.contains("hidden")) return;
  try {
    const data = await fetchJson(`/api/invites?player_id=${encodeURIComponent(player.id)}`);
    if (data.ok && data.invites.length) showInvitePrompt(data.invites[0]);
  } catch {
    // Invite refresh is best-effort; room actions still work without it.
  }
}

function showInvitePrompt(invite) {
  currentInvite = invite;
  document.getElementById("invitePromptText").textContent = `${invite.host_name} invited you to play ${gameName(invite.game_id)}.`;
  document.getElementById("invitePrompt").classList.remove("hidden");
  const soundKey = invite.id || `${invite.room_code || ""}:${invite.host_id || ""}:${invite.game_id || ""}`;
  if (soundKey && soundKey !== lastInviteSoundKey) {
    lastInviteSoundKey = soundKey;
    playInviteReceived();
  }
}

async function respondToInvite(accept) {
  const player = deviceSelectedPlayer();
  if (!currentInvite || !player) return;
  try {
    const response = await api("/api/invite/respond", { invite_id: currentInvite.id, accept, player });
    document.getElementById("invitePrompt").classList.add("hidden");
    currentInvite = null;
    if (accept) playConfirm();
    else playCancel();
    if (response.accepted && response.room) {
      selectedGameId = canonicalGameId(response.room.game_id);
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
    playRoomCreated();
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
  stopRoomLiveUpdates();
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

async function makeMove(board, cell, lineId = "") {
  const player = selectedPlayer();
  if (!player || !currentRoom) return;
  const selectedSeat = currentRoom.players.find((seat) => seat.id === player.id);
  if (!canRoomSeatMove(selectedSeat, currentRoom.game)) return;
  const moveKey = moveIntentKey(currentRoom, player.id, board, cell, lineId);
  if (pendingMove) return;
  playClick();
  pendingMove = {
    key: moveKey,
    roomCode: currentRoom.code,
    moveCount: currentRoom.game.move_count,
  };
  renderGame();
  try {
    const response = await api("/api/room/move", {
      code: currentRoom.code,
      player_id: player.id,
      board,
      cell,
      line_id: lineId,
    });
    pendingMove = null;
    setRoom(response.room);
  } catch (error) {
    pendingMove = null;
    renderGame();
    showTurnStatus(null, error.message);
    playInvalidMove();
  }
}

async function makeBattleshipAction(action) {
  const player = selectedPlayer();
  if (!player || !currentRoom || !isBattleshipGameState(currentRoom.game)) return;
  const selectedSeat = currentRoom.players.find((seat) => seat.id === player.id);
  if (!selectedSeat || isBotPlayer(selectedSeat)) return;
  if (currentRoom.game.status === "playing" && selectedSeat.mark !== currentRoom.game.current_player) return;
  const moveKey = moveIntentKey(currentRoom, player.id, null, null, JSON.stringify(action));
  if (pendingMove) return;
  playClick();
  const attackPreview = action.type === "attack" ? battleshipAttackPreview(currentRoom.game, selectedSeat.mark, Number(action.row), Number(action.col)) : null;
  if (attackPreview) {
    showBattleshipResultReveal({
      code: currentRoom.code,
      player: selectedSeat.mark,
      view: "offence",
      row: Number(action.row),
      col: Number(action.col),
      hit: attackPreview.hit,
      sunk: Boolean(attackPreview.sunk),
      attackText: randomBattleshipPhrase(BATTLESHIP_ATTACK_PHRASES),
      resultText: randomBattleshipResultPhrase(attackPreview.hit, attackPreview.sunk),
      durationMs: 2000,
      radarMs: BATTLESHIP_RESULT_REVEAL_DELAY_MS,
    });
    scheduleBattleshipPendingDefence(currentRoom.code, selectedSeat.mark);
    if (attackPreview.sunk && attackPreview.shipName) {
      window.setTimeout(() => {
        showInfoPrompt("Battleship", `You sunk my ${attackPreview.shipName}!`);
      }, BATTLESHIP_RESULT_REVEAL_DELAY_MS + 150);
    }
  }
  pendingMove = {
    key: moveKey,
    roomCode: currentRoom.code,
    moveCount: currentRoom.game.move_count,
  };
  renderGame();
  try {
    const response = await api("/api/room/move", {
      code: currentRoom.code,
      player_id: player.id,
      action,
    });
    pendingMove = null;
    clearBattleshipPendingDefence();
    if (action.type === "place_fleet" || action.type === "auto_place") {
      const selectedSeatAfterMove = currentRoom.players.find((seat) => seat.id === player.id);
      clearBattleshipDraft(currentRoom.code, selectedSeatAfterMove && selectedSeatAfterMove.mark);
    }
    setRoom(response.room);
  } catch (error) {
    pendingMove = null;
    clearBattleshipPendingDefence();
    renderGame();
    showTurnStatus(null, error.message);
    playInvalidMove();
  }
}

async function makeQuoridorAction(action) {
  const player = selectedPlayer();
  if (!player || !currentRoom || !isQuoridorGameState(currentRoom.game)) return;
  const selectedSeat = currentRoom.players.find((seat) => seat.id === player.id);
  if (!selectedSeat || isBotPlayer(selectedSeat) || selectedSeat.mark !== currentRoom.game.current_player || pendingMove) return;
  playClick();
  pendingMove = {
    key: moveIntentKey(currentRoom, player.id, null, null, JSON.stringify(action)),
    roomCode: currentRoom.code,
    moveCount: currentRoom.game.move_count,
  };
  renderGame();
  try {
    const response = await api("/api/room/move", {
      code: currentRoom.code,
      player_id: player.id,
      action,
    });
    clearQuoridorWallHold();
    quoridorDraftWall = null;
    pendingMove = null;
    setRoom(response.room);
  } catch (error) {
    pendingMove = null;
    renderGame();
    showTurnStatus(null, error.message);
    playInvalidMove();
  }
}

function showBattleshipResultReveal(result) {
  const durationMs = Math.max(1000, Number(result.durationMs || 1000));
  const radarMs = Math.max(0, Number(result.radarMs || 0));
  const now = Date.now();
  battleshipResultReveal = {
    ...result,
    radarUntil: radarMs ? now + radarMs : 0,
    until: now + durationMs,
  };
  if (radarMs) {
    window.setTimeout(() => {
      if (battleshipResultReveal && battleshipResultReveal.code === result.code && battleshipResultReveal.row === result.row && battleshipResultReveal.col === result.col) {
        if (result.hit) playBattleshipHit();
        else playBattleshipMiss();
        renderGame();
      }
    }, radarMs);
  } else if (result.hit) playBattleshipHit();
  else playBattleshipMiss();
  renderGame();
  window.clearTimeout(battleshipResultTimer);
  battleshipResultTimer = window.setTimeout(() => {
    battleshipResultReveal = null;
    const queued = battleshipQueuedReveal;
    battleshipQueuedReveal = null;
    if (queued) {
      showBattleshipResultReveal(queued);
      return;
    }
    renderGame();
  }, durationMs + 50);
}

function scheduleBattleshipPendingDefence(code, playerMark) {
  clearBattleshipPendingDefence();
  if (battleshipViewMode !== "auto") return;
  battleshipPendingDefenceTimer = window.setTimeout(() => {
    if (!pendingMove || !currentRoom || currentRoom.code !== code) return;
    battleshipPendingDefence = {
      code,
      player: playerMark,
    };
    renderGame();
  }, 2000);
}

function clearBattleshipPendingDefence() {
  window.clearTimeout(battleshipPendingDefenceTimer);
  battleshipPendingDefenceTimer = null;
  battleshipPendingDefence = null;
}

function confirmAction(title, message) {
  const prompt = document.getElementById("confirmPrompt");
  prompt.classList.remove("info-prompt");
  configureConfirmPromptButtons("Yes", "No", false);
  document.getElementById("confirmPromptTitle").textContent = title;
  document.getElementById("confirmPromptText").textContent = message;
  prompt.classList.remove("hidden");
  return new Promise((resolve) => {
    pendingConfirmAction = resolve;
  });
}

function showInfoPrompt(title, message) {
  const prompt = document.getElementById("confirmPrompt");
  prompt.classList.add("info-prompt");
  configureConfirmPromptButtons("OK", "", true);
  document.getElementById("confirmPromptTitle").textContent = title;
  document.getElementById("confirmPromptText").textContent = message;
  prompt.classList.remove("hidden");
  return new Promise((resolve) => {
    pendingConfirmAction = resolve;
  });
}

function configureConfirmPromptButtons(yesText, noText, hideNo) {
  const yes = document.getElementById("confirmYes");
  const no = document.getElementById("confirmNo");
  yes.textContent = yesText;
  no.textContent = noText;
  no.classList.toggle("hidden", Boolean(hideNo));
}

function resolveConfirmPrompt(confirmed) {
  const prompt = document.getElementById("confirmPrompt");
  prompt.classList.add("hidden");
  prompt.classList.remove("info-prompt");
  if (confirmed) playConfirm();
  else playCancel();
  if (!pendingConfirmAction) return;
  const resolve = pendingConfirmAction;
  pendingConfirmAction = null;
  resolve(confirmed);
}

function closeConfirmPromptOnBackdrop(event) {
  if (event.target.id === "confirmPrompt") resolveConfirmPrompt(false);
}

function setRoom(room) {
  if (isStaleRoomSnapshot(currentRoom, room)) return;
  const previousRoom = currentRoom;
  currentRoom = room;
  clearResolvedPendingMove(room);
  const roomKey = roomRenderKey(room);
  if (roomKey === lastRenderedRoomKey) return;
  lastRenderedRoomKey = roomKey;
  syncHostInviteStatusFromRoom(room);
  syncSelectedPlayerForLocalRoom();
  playRoomStateSounds(previousRoom, room);
  showIncomingBattleshipAttackReveal(previousRoom, room);
  document.getElementById("roomTitle").textContent = gameName(room.game_id);
  renderRoomSlots();
  renderGame();
  handleIncomingResetRequest();
}

function isStaleRoomSnapshot(current, next) {
  if (!current || !next || current.code !== next.code) return false;
  const currentRevision = Number(current.revision || 0);
  const nextRevision = Number(next.revision || 0);
  if (currentRevision && nextRevision) return nextRevision < currentRevision;
  const currentEpoch = Number(current.game_epoch || 0);
  const nextEpoch = Number(next.game_epoch || 0);
  if (currentEpoch && nextEpoch && nextEpoch !== currentEpoch) return nextEpoch < currentEpoch;
  const currentMoveCount = Number(current.game && current.game.move_count || 0);
  const nextMoveCount = Number(next.game && next.game.move_count || 0);
  if (nextMoveCount < currentMoveCount) return true;
  if (nextMoveCount > currentMoveCount) return false;
  const currentStatusRank = roomStatusRank(current);
  const nextStatusRank = roomStatusRank(next);
  if (nextStatusRank < currentStatusRank) return true;
  return false;
}

function roomStatusRank(room) {
  const gameStatus = room && room.game && room.game.status;
  if (room && room.status === "completed") return 3;
  if (["x_won", "o_won", "draw"].includes(gameStatus)) return 3;
  if (room && room.status === "active") return 2;
  if (room && room.started) return 2;
  if (room && room.status === "waiting_for_player") return 1;
  return 0;
}

function playRoomStateSounds(previousRoom, room) {
  if (!room || !previousRoom || previousRoom.code !== room.code) return;
  playPlayerJoinedSound(previousRoom, room);
  playTurnChangedSound(previousRoom, room);
  playTacticalEventSound(previousRoom, room);
  playBoxesEventSound(previousRoom, room);
  playGameOverSound(previousRoom, room);
}

function playPlayerJoinedSound(previousRoom, room) {
  const previousIds = new Set((previousRoom.players || []).map((player) => player.id));
  const joinedPlayers = (room.players || []).filter((player) => !previousIds.has(player.id));
  if (!joinedPlayers.length) return;
  const soundKey = `${room.code}:${joinedPlayers.map((player) => player.id).sort().join(",")}`;
  if (soundKey === lastPlayerJoinedSoundKey) return;
  lastPlayerJoinedSoundKey = soundKey;
  playPlayerJoined();
}

function playTurnChangedSound(previousRoom, room) {
  if (!room.started || !room.game || room.game.status !== "playing") return;
  if (!previousRoom.game || previousRoom.game.current_player === room.game.current_player) return;
  const currentTurnPlayer = room.players.find((player) => player.mark === room.game.current_player);
  if (isBotPlayer(currentTurnPlayer)) return;
  const soundKey = `${room.code}:${room.game.move_count}:${room.game.current_player}`;
  if (soundKey === lastTurnSoundKey) return;
  lastTurnSoundKey = soundKey;
  playTurnChanged(room.game.current_player);
}

function playTacticalEventSound(previousRoom, room) {
  if (!isTacticalGameState(room.game) || !room.game.last_event) return;
  const previousEventKey = tacticalSoundEventKey(previousRoom.game && previousRoom.game.last_event);
  const nextEventKey = tacticalSoundEventKey(room.game.last_event);
  if (!nextEventKey || previousEventKey === nextEventKey || nextEventKey === lastGameEventSoundKey) return;
  lastGameEventSoundKey = nextEventKey;
  playConfirm();
}

function playBoxesEventSound(previousRoom, room) {
  if (!isBoxesGameState(room.game) || !room.game.last_move || room.game.status !== "playing") return;
  const previousMoveKey = boxesSoundMoveKey(previousRoom.game && previousRoom.game.last_move);
  const nextMoveKey = boxesSoundMoveKey(room.game.last_move);
  if (!nextMoveKey || previousMoveKey === nextMoveKey || nextMoveKey === lastGameEventSoundKey) return;
  if (!Array.isArray(room.game.last_move.captured) || !room.game.last_move.captured.length) return;
  lastGameEventSoundKey = nextMoveKey;
  playConfirm();
}

function showIncomingBattleshipAttackReveal(previousRoom, room) {
  if (battleshipViewMode !== "auto") return;
  if (!isBattleshipGameState(room.game) || !room.game.last_move || room.game.last_move.type !== "attack") return;
  if (!previousRoom || !previousRoom.game) return;
  const previousMoveKey = battleshipSoundMoveKey(previousRoom.game.last_move);
  const nextMoveKey = battleshipSoundMoveKey(room.game.last_move);
  if (!nextMoveKey || previousMoveKey === nextMoveKey) return;
  const selectedSeat = room.players.find((player) => player.id === selectedPlayerId || player.id === deviceSelectedPlayerId);
  if (!selectedSeat || room.game.last_move.player === selectedSeat.mark) return;
  clearBattleshipPendingDefence();
  const reveal = {
    code: room.code,
    player: selectedSeat.mark,
    view: "defence",
    row: Number(room.game.last_move.row),
    col: Number(room.game.last_move.col),
    hit: Boolean(room.game.last_move.hit),
    sunk: Boolean(room.game.last_move.sunk),
    attackText: randomBattleshipPhrase(BATTLESHIP_ATTACK_PHRASES),
    resultText: randomBattleshipResultPhrase(Boolean(room.game.last_move.hit), Boolean(room.game.last_move.sunk)),
    durationMs: 3000,
    radarMs: BATTLESHIP_RESULT_REVEAL_DELAY_MS,
  };
  if (battleshipResultReveal && battleshipResultReveal.view === "offence") {
    battleshipQueuedReveal = reveal;
    return;
  }
  showBattleshipResultReveal(reveal);
}

function battleshipSoundMoveKey(move) {
  if (!move || move.type !== "attack") return "";
  return JSON.stringify({
    type: "battleshipAttack",
    player: move.player,
    row: move.row,
    col: move.col,
    hit: Boolean(move.hit),
    sunk: Boolean(move.sunk),
    ship: move.ship_id || "",
  });
}

function playGameOverSound(previousRoom, room) {
  if (!room.game || room.game.status === "playing") return;
  if (previousRoom.game && previousRoom.game.status !== "playing") return;
  const soundKey = `${room.code}:${room.game.move_count}:${room.game.status}:${room.game.winner || ""}`;
  if (soundKey === lastGameOverSoundKey) return;
  lastGameOverSoundKey = soundKey;
  const selectedSeat = room.players.find((player) => player.id === selectedPlayerId || player.id === deviceSelectedPlayerId);
  if (!room.game.winner || room.game.status === "draw") {
    playConfirm();
    return;
  }
  if (selectedSeat && selectedSeat.mark === room.game.winner) playWin();
  else playLose();
}

function tacticalSoundEventKey(event) {
  if (!event || !["pickupCaptured", "sectorCaptured"].includes(event.type)) return "";
  return JSON.stringify({
    type: event.type,
    player: event.player,
    board: event.board,
    cell: event.cell,
    sector: event.sector,
    points: event.points,
    pickup_type: event.pickup_type,
  });
}

function boxesSoundMoveKey(move) {
  if (!move || !move.line_id) return "";
  const capturedCount = Array.isArray(move.captured) ? move.captured.length : 0;
  if (!capturedCount) return "";
  return JSON.stringify({
    type: "boxesCaptured",
    player: move.player,
    line: move.line_id,
    capturedCount,
  });
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
      <button id="inviteBotOpponent" class="secondary" type="button">Invite Bot</button>
    `;
    document.getElementById("selectLocalOpponent").addEventListener("click", openLocalOpponentModal);
    document.getElementById("inviteRemoteOpponent").addEventListener("click", openInvitePlayerModal);
    document.getElementById("inviteBotOpponent").addEventListener("click", openBotOpponentModal);
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
  const label = player.kind === "bot" ? `${player.mark || "Waiting"} Bot` : player.mark || "Waiting";
  return `${avatarHtml(player)}<strong>${escapeHtml(player.name)}</strong><span>${escapeHtml(label)}</span>`;
}

function renderGame() {
  if (!currentRoom) return;
  const game = currentRoom.game;
  const meta = document.getElementById("gameMeta");
  const resetButton = document.getElementById("resetGame");
  meta.textContent = `Room ${currentRoom.code}`;
  if (resetButton) {
    const resetLabel = isCompletedRoom(currentRoom) ? "Play Again" : "Reset";
    resetButton.textContent = "🔁";
    resetButton.setAttribute("aria-label", resetLabel);
    resetButton.title = resetLabel;
  }
  document.getElementById("gamePlayersPanel").classList.toggle("hidden", currentRoom.started);
  setGameBoardVisible(true);
  syncBattleshipReviewMark(game);
  renderGamePlayerSwitch();
  if (isBattleshipGameState(game)) {
    renderBattleshipGame(game);
    return;
  }
  if (isQuoridorGameState(game)) {
    renderQuoridorGame(game);
    return;
  }
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

  if (isBoxesGameState(game)) {
    renderBoxesGame(game);
    return;
  }

  lastLegalBoardsKey = renderSuperTicTacToeBoard({
    host: document.getElementById("macroBoard"),
    room: currentRoom,
    selectedPlayerId,
    pendingMove,
    lastLegalBoardsKey,
    setTurnColorVariables,
    canRoomSeatMove,
    applyBoardResultColor,
    applyMarkColor,
    pickupAtCell,
    moveIntentKey,
    makeMove,
  });
}

function syncBattleshipReviewMark(game) {
  if (!isBattleshipGameState(game) || game.phase !== "complete") return;
  const selectedSeat = currentRoom.players.find((player) => player.id === selectedPlayerId && player.mark);
  const currentReviewSeat = currentRoom.players.find((player) => player.mark === battleshipReviewMark);
  if (currentReviewSeat) return;
  battleshipReviewMark = selectedSeat && selectedSeat.mark || (currentRoom.players.find((player) => player.mark) || {}).mark || "";
}

function isCompletedRoom(room) {
  return Boolean(room && (room.status === "completed" || ["x_won", "o_won", "draw"].includes(room.game.status)));
}

function renderBattleshipGame(game) {
  const host = document.getElementById("macroBoard");
  host.className = "macro-board battleship-room-board";
  host.innerHTML = "";
  const selectedSeat = currentRoom.players.find((player) => player.id === selectedPlayerId);
  const currentTurnPlayer = currentRoom.players.find((player) => player.mark === game.current_player);
  setTurnColorVariables(host, currentTurnPlayer ? currentTurnPlayer.color : selectedSeat ? selectedSeat.color : "#1f7a5f");
  if (!currentRoom.started) {
    showTurnStatus(null, "Waiting for opponent.");
    return;
  }
  const phase = game.status === "setup" ? "setup" : game.status === "playing" ? "playing" : "complete";
  const playerState = selectedSeat ? game.players && game.players[selectedSeat.mark] : null;
  const opponent = selectedSeat ? currentRoom.players.find((player) => player.mark && player.mark !== selectedSeat.mark) : null;
  const opponentState = opponent ? game.players && game.players[opponent.mark] : null;
  if (phase === "setup") {
    showTurnStatus(selectedSeat, playerState && playerState.ready ? "Fleet ready. Waiting for opponent." : "Place your fleet.");
    renderBattleshipSetup(host, game, selectedSeat, playerState);
    return;
  }
  if (phase === "complete") {
    const winner = currentRoom.players.find((player) => player.mark === game.winner);
    showTurnStatus(winner, `${winner ? winner.name : game.winner} won.`);
    const reviewSeat = currentRoom.players.find((player) => player.mark === battleshipReviewMark)
      || selectedSeat
      || currentRoom.players.find((player) => player.mark);
    battleshipReviewMark = reviewSeat && reviewSeat.mark || "";
    const reviewState = reviewSeat ? game.players && game.players[reviewSeat.mark] : null;
    const reviewOpponent = reviewSeat ? currentRoom.players.find((player) => player.mark && player.mark !== reviewSeat.mark) : null;
    const reviewOpponentState = reviewOpponent ? game.players && game.players[reviewOpponent.mark] : null;
    const activeView = battleshipViewMode === "defence" ? "defence" : "offence";
    renderBattleshipPlay(host, game, reviewSeat, reviewState, reviewOpponent, reviewOpponentState, activeView);
    scheduleWinOverlay(winner, game.winner);
    return;
  }
  const yourTurn = selectedSeat && selectedSeat.mark === game.current_player;
  host.classList.toggle("your-turn", Boolean(yourTurn));
  host.classList.toggle("waiting", Boolean(!yourTurn));
  const reveal = activeBattleshipResultReveal(currentRoom, selectedSeat);
  const pendingDefence = activeBattleshipPendingDefence(currentRoom, selectedSeat);
  const activeView = reveal && reveal.view ? reveal.view : pendingDefence ? "defence" : battleshipViewMode === "auto" ? (yourTurn ? "offence" : "defence") : battleshipViewMode;
  const boardPlayer = battleshipVisiblePlayer(activeView, reveal, selectedSeat, opponent, currentTurnPlayer);
  setTurnColorVariables(host, boardPlayer ? boardPlayer.color : selectedSeat ? selectedSeat.color : "#1f7a5f");
  showBattleshipTurnStatus(activeView, reveal, selectedSeat, opponent, currentTurnPlayer);
  renderBattleshipPlay(host, game, selectedSeat, playerState, opponent, opponentState, activeView, reveal);
}

function battleshipVisiblePlayer(activeView, reveal, selectedSeat, opponent, currentTurnPlayer) {
  if (reveal && reveal.view === "offence") return selectedSeat;
  if (reveal && reveal.view === "defence") return opponent;
  if (activeView === "offence") return selectedSeat || currentTurnPlayer;
  if (activeView === "defence") return opponent || currentTurnPlayer;
  return currentTurnPlayer || selectedSeat;
}

function showBattleshipTurnStatus(activeView, reveal, selectedSeat, opponent, currentTurnPlayer) {
  const host = document.getElementById("turnStatus");
  if (!host) return;
  host.classList.remove("your-turn", "waiting");
  setTurnColorVariables(host, selectedSeat ? selectedSeat.color : "#1f7a5f");
  if (!selectedSeat) {
    host.textContent = "Select your player.";
    host.classList.add("waiting");
    return;
  }
  if (reveal && reveal.view === "offence") {
    const phase = battleshipRevealPhase(reveal);
    setTurnStatusText(host, phase === "radar" ? reveal.attackText || "Taking the shot." : reveal.resultText || battleshipDefaultResultText(reveal));
    host.classList.add("your-turn");
    return;
  }
  if (reveal && reveal.view === "defence") {
    const phase = battleshipRevealPhase(reveal);
    setTurnStatusText(host, phase === "radar" ? reveal.attackText || "Incoming!" : reveal.resultText || battleshipDefaultResultText(reveal));
    host.classList.add("waiting");
    return;
  }
  if (activeView === "offence" && selectedSeat.mark === currentRoom.game.current_player) {
    setTurnStatusText(host, `It's your turn, ${selectedSeat.name}.`);
    host.classList.add("your-turn");
    return;
  }
  if (activeView === "defence") {
    setTurnStatusText(host, `Waiting for ${opponent ? opponent.name : "Player2"}`);
    host.classList.add("waiting");
    return;
  }
  showTurnStatus(currentTurnPlayer);
}

function battleshipRevealPhase(reveal) {
  if (!reveal) return "";
  if (reveal.radarUntil && Date.now() < reveal.radarUntil) return "radar";
  return "result";
}

function randomBattleshipPhrase(phrases) {
  return phrases[Math.floor(Math.random() * phrases.length)] || "";
}

function randomBattleshipResultPhrase(hit, sunk) {
  if (sunk) return randomBattleshipPhrase(BATTLESHIP_SUNK_PHRASES);
  return randomBattleshipPhrase(hit ? BATTLESHIP_HIT_PHRASES : BATTLESHIP_MISS_PHRASES);
}

function battleshipDefaultResultText(reveal) {
  if (reveal && reveal.sunk) return "Target sunk!";
  return reveal && reveal.hit ? "HIT!" : "MISS!";
}

function renderBattleshipSetup(host, game, selectedSeat, playerState) {
  const draft = battleshipDraftFor(game, selectedSeat, playerState);
  const complete = battleshipFleetComplete(draft, game.fleet);
  const panel = document.createElement("section");
  panel.className = "battleship-panel";
  panel.innerHTML = `
    <div class="battleship-toolbar">
      <button type="button" data-battle-action="auto">Auto Place</button>
      <button type="button" data-battle-action="ready" ${complete && !(playerState && playerState.ready) ? "" : "disabled"}>Ready Fleet</button>
    </div>
    <div class="battleship-ship-list"></div>
    <div class="battleship-grid" role="grid" aria-label="Battleship setup board"></div>
  `;
  const shipList = panel.querySelector(".battleship-ship-list");
  (game.fleet || []).forEach((ship) => {
    const placed = draft.some((item) => item.id === ship.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `battleship-ship ${battleshipSelectedShipId === ship.id ? "selected" : ""} ${placed ? "placed" : ""}`;
    button.textContent = `${ship.name} ${ship.size}`;
    button.disabled = Boolean(playerState && playerState.ready);
    button.addEventListener("click", () => {
      battleshipSelectedShipId = ship.id;
      renderGame();
    });
    shipList.appendChild(button);
  });
  panel.querySelector('[data-battle-action="auto"]').addEventListener("click", () => {
    if (!selectedSeat || playerState && playerState.ready) return;
    battleshipDrafts[battleshipDraftKey(currentRoom.code, selectedSeat.mark)] = randomBattleshipDraft(game);
    renderGame();
  });
  panel.querySelector('[data-battle-action="ready"]').addEventListener("click", () => makeBattleshipAction({ type: "place_fleet", ships: draft }));
  renderBattleshipGrid(panel.querySelector(".battleship-grid"), game, {
    ships: draft,
    shots: [],
    mode: "setup",
    owner: selectedSeat,
    shooter: null,
    selectedShipId: battleshipSelectedShipId,
    disabled: Boolean(!selectedSeat || playerState && playerState.ready),
    onCell: (row, col) => {
      if (!selectedSeat || playerState && playerState.ready) return;
      placeBattleshipDraftShip(game, selectedSeat.mark, battleshipSelectedShipId, row, col);
      renderGame();
    },
  });
  host.appendChild(panel);
}

function renderBattleshipPlay(host, game, selectedSeat, playerState, opponent, opponentState, activeView, reveal = null) {
  const panel = document.createElement("section");
  panel.className = "battleship-panel";
  panel.innerHTML = `
    <div class="battleship-toolbar segmented">
      <button type="button" data-view="auto" class="${battleshipViewMode === "auto" ? "selected" : ""}">Auto</button>
      <button type="button" data-view="offence" class="${activeView === "offence" ? "active-mode" : ""} ${activeView === "offence" && battleshipViewMode !== "auto" ? "selected" : ""}">Offence</button>
      <button type="button" data-view="defence" class="${activeView === "defence" ? "active-mode" : ""} ${activeView === "defence" && battleshipViewMode !== "auto" ? "selected" : ""}">Defence</button>
    </div>
    <div class="battleship-board-title"></div>
    <div class="battleship-grid" role="grid"></div>
  `;
  panel.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      battleshipViewMode = button.dataset.view;
      renderGame();
    });
  });
  const title = panel.querySelector(".battleship-board-title");
  const grid = panel.querySelector(".battleship-grid");
  if (!selectedSeat || !playerState || !opponentState) {
    title.textContent = "Waiting for player view.";
  } else if (activeView === "offence") {
    title.textContent = `Offence: target ${opponent ? opponent.name : "opponent"}`;
    renderBattleshipGrid(grid, game, {
      shots: playerState.shots || [],
      targetShips: opponentState.ships || [],
      mode: "offence",
      shooter: opponent,
      reveal,
      disabled: game.status !== "playing" || selectedSeat.mark !== game.current_player || pendingMove || reveal,
      onCell: (row, col) => makeBattleshipAction({ type: "attack", row, col }),
    });
  } else {
    title.textContent = "Defence: your fleet";
    renderBattleshipGrid(grid, game, {
      ships: playerState.ships || [],
      shots: opponentState.shots || [],
      targetShips: playerState.ships || [],
      mode: "defence",
      owner: selectedSeat,
      shooter: opponent,
      reveal,
      disabled: true,
    });
  }
  host.appendChild(panel);
}

function renderBattleshipGrid(grid, game, options = {}) {
  const size = Number(game.board_size || 10);
  const ships = Array.isArray(options.ships) ? options.ships : [];
  const shots = Array.isArray(options.shots) ? options.shots : [];
  const targetShips = Array.isArray(options.targetShips) ? options.targetShips : ships;
  const ownerIcon = options.owner && options.owner.icon ? options.owner.icon : "#";
  const shooterIcon = options.shooter && options.shooter.icon ? options.shooter.icon : ownerIcon;
  const ownerColor = isHexColor(options.owner && options.owner.color || "") ? options.owner.color : "#1f7a5f";
  const revealColor = isHexColor(options.shooter && options.shooter.color || "") ? options.shooter.color : ownerColor;
  grid.style.setProperty("--battle-size", String(size));
  grid.style.setProperty("--battle-owner-color", ownerColor);
  grid.style.setProperty("--battle-owner-soft", mixColorWithWhite(ownerColor, 0.24));
  grid.style.setProperty("--battle-owner-glow", colorWithAlpha(ownerColor, 0.42));
  grid.style.setProperty("--battle-reveal-color", revealColor);
  grid.style.setProperty("--battle-reveal-soft", mixColorWithWhite(revealColor, 0.24));
  grid.style.setProperty("--battle-reveal-glow", colorWithAlpha(revealColor, 0.42));
  grid.innerHTML = "";
  const revealPhase = battleshipRevealPhase(options.reveal);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const ship = ships.find((item) => battleshipShipCells(item, battleshipShipSize(game, item.id)).some((cell) => cell.row === row && cell.col === col));
      const rawShot = shots.find((item) => item.row === row && item.col === col);
      const radarTarget = options.reveal && revealPhase === "radar" && options.reveal.row === row && options.reveal.col === col;
      const attackLock = Boolean(radarTarget && options.reveal.view === "offence");
      const radarScan = Boolean(options.reveal && revealPhase === "radar" && options.reveal.view !== "offence" && (options.reveal.row === row || options.reveal.col === col));
      const shot = radarTarget ? null : rawShot;
      const reveal = options.reveal && revealPhase !== "radar" && options.reveal.row === row && options.reveal.col === col ? options.reveal : null;
      const selectedShip = ship && options.mode === "setup" && ship.id === options.selectedShipId;
      const hitShip = shot && shot.hit && shot.ship_id ? targetShips.find((item) => item.id === shot.ship_id) : null;
      const sunkHit = hitShip ? battleshipShipSunk(hitShip, game, shots) : false;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `battle-cell ${ship ? "ship" : ""} ${selectedShip ? "selected-ship" : ""} ${shot ? shot.hit ? "hit" : "miss" : ""} ${shot && shot.hit ? sunkHit ? "sunk-hit" : "damaged-hit" : ""} ${radarScan ? "battle-radar-scan" : ""} ${radarTarget ? "battle-radar-target" : ""} ${attackLock ? "battle-attack-lock" : ""} ${reveal ? "battle-result-reveal" : ""} ${reveal && reveal.hit ? "reveal-hit" : ""} ${reveal && !reveal.hit ? "reveal-miss" : ""}`;
      cell.textContent = reveal ? reveal.hit ? "💥" : "•" : shot ? shot.hit ? "💥" : "•" : ship ? ownerIcon : "";
      cell.disabled = Boolean(options.disabled || shot);
      cell.setAttribute("aria-label", `Row ${row + 1}, Column ${col + 1}`);
      cell.addEventListener("click", () => options.onCell && options.onCell(row, col));
      grid.appendChild(cell);
    }
  }
}
function battleshipDraftFor(game, seat, playerState) {
  if (!seat) return [];
  if (playerState && Array.isArray(playerState.ships) && playerState.ships.length) return playerState.ships.map((ship) => ({ ...ship }));
  const key = battleshipDraftKey(currentRoom.code, seat.mark);
  if (!battleshipDrafts[key]) battleshipDrafts[key] = [];
  return battleshipDrafts[key];
}

function randomBattleshipDraft(game) {
  const size = Number(game.board_size || 10);
  const fleet = Array.isArray(game.fleet) ? game.fleet : [];
  for (let fullAttempt = 0; fullAttempt < 80; fullAttempt += 1) {
    const placed = [];
    const occupied = new Set();
    const order = fleet.slice().sort(() => Math.random() - 0.5);
    for (const ship of order) {
      let placedShip = null;
      for (let attempt = 0; attempt < 120 && !placedShip; attempt += 1) {
        const orientation = Math.random() < 0.5 ? "h" : "v";
        const shipSize = Number(ship.size || battleshipShipSize(game, ship.id));
        const rowMax = orientation === "v" ? size - shipSize : size - 1;
        const colMax = orientation === "h" ? size - shipSize : size - 1;
        if (rowMax < 0 || colMax < 0) break;
        const candidate = {
          id: ship.id,
          row: Math.floor(Math.random() * (rowMax + 1)),
          col: Math.floor(Math.random() * (colMax + 1)),
          orientation,
        };
        const cells = battleshipShipCells(candidate, shipSize);
        if (cells.every((cell) => !occupied.has(`${cell.row}:${cell.col}`))) placedShip = candidate;
      }
      if (!placedShip) break;
      battleshipShipCells(placedShip, battleshipShipSize(game, placedShip.id)).forEach((cell) => occupied.add(`${cell.row}:${cell.col}`));
      placed.push(placedShip);
    }
    if (placed.length === fleet.length) return fleet.map((ship) => placed.find((item) => item.id === ship.id));
  }
  return [];
}

function battleshipAttackPreview(game, attackerMark, row, col) {
  if (!game || !game.players || !["X", "O"].includes(attackerMark)) return null;
  const attackerState = game.players[attackerMark];
  const defenderMark = attackerMark === "X" ? "O" : "X";
  const defenderState = game.players[defenderMark];
  if (!attackerState || !defenderState || !Array.isArray(attackerState.shots) || !Array.isArray(defenderState.ships)) return null;
  const target = battleshipShipAt(defenderState.ships, game, row, col);
  if (!target) return { hit: false, sunk: false, shipName: "" };
  const nextShots = [...attackerState.shots, { row, col, hit: true, ship_id: target.id }];
  const shipName = ((game.fleet || []).find((ship) => ship.id === target.id) || target).name || target.id;
  return {
    hit: true,
    sunk: battleshipShipSunk(target, game, nextShots),
    shipName,
  };
}

function battleshipShipAt(ships, game, row, col) {
  return ships.find((ship) => battleshipShipCells(ship, battleshipShipSize(game, ship.id)).some((cell) => cell.row === row && cell.col === col)) || null;
}

function battleshipShipSunk(ship, game, shots) {
  const hits = new Set((shots || []).filter((shot) => shot.hit).map((shot) => `${shot.row}:${shot.col}`));
  return battleshipShipCells(ship, battleshipShipSize(game, ship.id)).every((cell) => hits.has(`${cell.row}:${cell.col}`));
}

function placeBattleshipDraftShip(game, mark, shipId, row, col) {
  const ship = (game.fleet || []).find((item) => item.id === shipId) || (game.fleet || [])[0];
  if (!ship) return;
  const key = battleshipDraftKey(currentRoom.code, mark);
  const existing = (battleshipDrafts[key] || []).find((item) => item.id === ship.id);
  const draft = (battleshipDrafts[key] || []).filter((item) => item.id !== ship.id);
  const orientation = existing ? (existing.orientation === "h" ? "v" : "h") : "h";
  const next = coerceBattleshipPlacement(game, ship.id, row, col, orientation);
  if (battleshipPlacementValid([...draft, next], game)) battleshipDrafts[key] = [...draft, next];
}

function coerceBattleshipPlacement(game, shipId, row, col, orientation) {
  const size = Number(game.board_size || 10);
  const shipSize = battleshipShipSize(game, shipId);
  const centerOffset = Math.floor((shipSize - 1) / 2);
  const maxStart = Math.max(0, size - shipSize);
  const clampedRow = clampNumber(row, 0, size - 1);
  const clampedCol = clampNumber(col, 0, size - 1);
  return {
    id: shipId,
    row: orientation === "v" ? clampNumber(clampedRow - centerOffset, 0, maxStart) : clampedRow,
    col: orientation === "h" ? clampNumber(clampedCol - centerOffset, 0, maxStart) : clampedCol,
    orientation,
  };
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(Number(value) || 0)));
}

function battleshipPlacementValid(ships, game) {
  const size = Number(game.board_size || 10);
  const occupied = new Set();
  return ships.every((ship) => battleshipShipCells(ship, battleshipShipSize(game, ship.id)).every((cell) => {
    if (cell.row < 0 || cell.col < 0 || cell.row >= size || cell.col >= size) return false;
    const key = `${cell.row}:${cell.col}`;
    if (occupied.has(key)) return false;
    occupied.add(key);
    return true;
  }));
}

function battleshipFleetComplete(ships, fleet) {
  return Array.isArray(fleet) && fleet.length > 0 && fleet.every((ship) => ships.some((item) => item.id === ship.id));
}

function battleshipShipSize(game, shipId) {
  return ((game.fleet || []).find((ship) => ship.id === shipId) || {}).size || 0;
}

function battleshipShipCells(ship, size) {
  return Array.from({ length: size }, (_, index) => ({
    row: Number(ship.row) + (ship.orientation === "v" ? index : 0),
    col: Number(ship.col) + (ship.orientation === "h" ? index : 0),
  }));
}

function battleshipDraftKey(code, mark) {
  return `${code || ""}:${mark || ""}`;
}

function clearBattleshipDraft(code, mark) {
  if (!code || !mark) return;
  delete battleshipDrafts[battleshipDraftKey(code, mark)];
}

function activeBattleshipResultReveal(room, selectedSeat) {
  if (!room || !selectedSeat || !battleshipResultReveal) return null;
  if (battleshipResultReveal.code !== room.code || battleshipResultReveal.player !== selectedSeat.mark) return null;
  if (Date.now() > battleshipResultReveal.until) {
    battleshipResultReveal = null;
    return null;
  }
  return battleshipResultReveal;
}

function activeBattleshipPendingDefence(room, selectedSeat) {
  if (battleshipViewMode !== "auto" || !room || !selectedSeat || !battleshipPendingDefence) return null;
  if (battleshipPendingDefence.code !== room.code || battleshipPendingDefence.player !== selectedSeat.mark) return null;
  return battleshipPendingDefence;
}

function renderQuoridorGame(game) {
  clearQuoridorWallHold();
  const host = document.getElementById("macroBoard");
  host.className = "macro-board quoridor-room-board";
  host.innerHTML = "";
  if (!currentRoom.started) {
    showTurnStatus(null, "Waiting for opponent.");
    return;
  }
  const currentTurnPlayer = currentRoom.players.find((player) => player.mark === game.current_player);
  const selectedSeat = currentRoom.players.find((player) => player.id === selectedPlayerId);
  const canSelectedPlayerMove = canRoomSeatMove(selectedSeat, game);
  if (!canSelectedPlayerMove || game.status !== "playing" || !quoridorDraftWall || !quoridorWallIsLegalDraft(game, quoridorDraftWall)) {
    quoridorDraftWall = null;
  }
  setTurnColorVariables(host, currentTurnPlayer ? currentTurnPlayer.color : "#1f7a5f");
  host.classList.toggle("your-turn", canSelectedPlayerMove && game.status === "playing");
  host.classList.toggle("waiting", game.status === "playing" && !canSelectedPlayerMove);
  if (game.status === "playing") {
    showTurnStatus(currentTurnPlayer, canSelectedPlayerMove ? `${selectedSeat.name}'s move.` : `Waiting for ${currentTurnPlayer ? currentTurnPlayer.name : "opponent"}.`);
  } else {
    const winner = currentRoom.players.find((player) => player.mark === game.winner);
    showTurnStatus(winner, `${winner ? winner.name : "Player"} wins.`);
    scheduleWinOverlay(winner, game.winner);
  }

  const table = document.createElement("section");
  table.className = "quoridor-table";
  const controlsDisabled = !canSelectedPlayerMove || game.status !== "playing" || pendingMove;
  table.innerHTML = `
    <div class="quoridor-score-row">
      ${currentRoom.players.map((player) => quoridorScoreHtml(player, game)).join("")}
    </div>
    <div class="quoridor-toolbar" role="group" aria-label="Quoridor move type">
      <button type="button" data-quoridor-mode="pawn" class="${quoridorMode === "pawn" ? "selected" : ""}" ${controlsDisabled ? "disabled" : ""}>Move Pawn</button>
      <button type="button" data-quoridor-mode="wall" class="${quoridorMode === "wall" ? "selected" : ""}" ${controlsDisabled ? "disabled" : ""}>Place Wall</button>
    </div>
    <div class="quoridor-board" role="grid" aria-label="Quoridor board"></div>
  `;
  table.querySelectorAll("[data-quoridor-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.quoridorMode;
      if (mode === "pawn") {
        quoridorMode = "pawn";
        quoridorDraftWall = null;
      } else if (quoridorMode === "wall" && quoridorDraftWall && canSelectedPlayerMove) {
        makeQuoridorAction({ type: "place_wall", ...quoridorDraftWall });
        return;
      } else {
        quoridorMode = "wall";
      }
      if (currentRoom && isQuoridorGameState(currentRoom.game)) renderQuoridorGame(currentRoom.game);
    });
  });
  renderQuoridorBoard(table.querySelector(".quoridor-board"), game, selectedSeat, canSelectedPlayerMove);
  host.appendChild(table);
}

function quoridorScoreHtml(player, game) {
  const active = game.status === "playing" && player.mark === game.current_player;
  const walls = Number(game.walls_remaining && game.walls_remaining[player.mark] || 0);
  const color = safePlayerColor(player);
  return `
    <div class="quoridor-score ${active ? "active" : ""}" style="--player-color:${escapeHtml(color)}">
      ${avatarHtml(player)}
      <strong>${escapeHtml(player.name)}</strong>
      <b>${escapeHtml(String(walls))}</b>
    </div>
  `;
}

function renderQuoridorBoard(grid, game, selectedSeat, canSelectedPlayerMove) {
  const size = Number(game.board_size || 9);
  const legalPawnMoves = new Set((game.legal_pawn_moves || []).map((move) => `${move.row}:${move.col}`));
  const legalWalls = new Set((game.legal_walls || []).map((wall) => quoridorWallId(wall.orientation, wall.row, wall.col)));
  const wallList = [...(game.walls || []), ...(quoridorDraftWall ? [{ ...quoridorDraftWall, temporary: true }] : [])];
  const currentColor = selectedSeat ? safePlayerColor(selectedSeat) : "#1f7a5f";
  grid.style.setProperty("--quoridor-active-color", currentColor);
  grid.innerHTML = "";
  grid.addEventListener("click", (event) => {
    if (!canSelectedPlayerMove || pendingMove || quoridorMode === "wall") return;
    if (event.target.closest(".quoridor-wall-dot")) return;
    if (event.target.closest(".quoridor-cell.legal")) return;
    if (event.target.closest(".quoridor-cell.own-pawn-control")) return;
    quoridorMode = "wall";
    quoridorDraftWall = null;
    renderQuoridorGame(currentRoom.game);
  });
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      grid.appendChild(quoridorCellButton(game, row, col, legalPawnMoves, canSelectedPlayerMove, selectedSeat));
    }
  }
  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      grid.appendChild(quoridorWallVisual("h", row, col, wallList));
      grid.appendChild(quoridorWallVisual("v", row, col, wallList));
      if (quoridorMode === "wall") {
        const dot = quoridorWallDot(row, col, legalWalls, canSelectedPlayerMove);
        if (dot) grid.appendChild(dot);
      }
    }
  }
}

function quoridorCellButton(game, row, col, legalPawnMoves, canSelectedPlayerMove, selectedSeat) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "quoridor-cell";
  button.style.gridRow = String(row * 2 + 1);
  button.style.gridColumn = String(col * 2 + 1);
  button.setAttribute("aria-label", `Row ${row + 1}, Column ${col + 1}`);
  const occupant = currentRoom.players.find((player) => {
    const pawn = game.pawns && game.pawns[player.mark];
    return pawn && pawn.row === row && pawn.col === col;
  });
  if (occupant) {
    button.classList.add("occupied");
    button.style.setProperty("--pawn-color", safePlayerColor(occupant));
    button.textContent = occupant.icon || "🙂";
    button.setAttribute("aria-label", `${occupant.name} pawn`);
  }
  const legal = canSelectedPlayerMove && quoridorMode === "pawn" && legalPawnMoves.has(`${row}:${col}`);
  const ownPawnControl = canSelectedPlayerMove && occupant && selectedSeat && occupant.mark === selectedSeat.mark;
  button.classList.toggle("legal", legal);
  button.classList.toggle("own-pawn-control", ownPawnControl);
  button.disabled = Boolean(pendingMove);
  if (legal) button.addEventListener("click", () => makeQuoridorAction({ type: "move_pawn", row, col }));
  else if (ownPawnControl) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      quoridorMode = "pawn";
      quoridorDraftWall = null;
      renderQuoridorGame(currentRoom.game);
    });
  } else if (canSelectedPlayerMove) {
    button.addEventListener("click", () => {
      if (pendingMove || quoridorMode === "wall") return;
      quoridorMode = "wall";
      quoridorDraftWall = null;
      renderQuoridorGame(currentRoom.game);
    });
  }
  return button;
}

function quoridorWallVisual(orientation, row, col, walls) {
  const wall = document.createElement("div");
  const placed = walls.find((item) => item.orientation === orientation && item.row === row && item.col === col);
  wall.className = `quoridor-wall quoridor-wall-${orientation} ${placed ? "placed" : ""} ${placed && placed.temporary ? "temporary" : ""}`;
  wall.style.gridRow = orientation === "h" ? String(row * 2 + 2) : `${row * 2 + 1} / span 3`;
  wall.style.gridColumn = orientation === "h" ? `${col * 2 + 1} / span 3` : String(col * 2 + 2);
  wall.setAttribute("aria-hidden", "true");
  return wall;
}

function quoridorWallDot(row, col, legalWalls, canSelectedPlayerMove) {
  const horizontalLegal = legalWalls.has(quoridorWallId("h", row, col));
  const verticalLegal = legalWalls.has(quoridorWallId("v", row, col));
  const legal = canSelectedPlayerMove && (horizontalLegal || verticalLegal);
  if (!legal) return null;
  const button = document.createElement("button");
  button.type = "button";
  const selected = quoridorDraftWall && quoridorDraftWall.row === row && quoridorDraftWall.col === col;
  button.className = `quoridor-wall-dot ${selected ? "selected" : ""}`;
  button.style.gridRow = String(row * 2 + 2);
  button.style.gridColumn = String(col * 2 + 2);
  button.setAttribute("aria-label", `Wall anchor ${row + 1}, ${col + 1}`);
  button.innerHTML = '<span class="quoridor-wall-hold-progress" aria-hidden="true"></span>';
  button.disabled = Boolean(pendingMove);
  button.addEventListener("click", () => {
    if (button.dataset.wallHold === "committed") {
      button.dataset.wallHold = "";
      return;
    }
    quoridorDraftWall = nextQuoridorDraftWall(row, col, horizontalLegal, verticalLegal);
    renderQuoridorGame(currentRoom.game);
  });
  if (selected) {
    button.addEventListener("pointerdown", (event) => startQuoridorWallHold(event, button));
    button.addEventListener("pointerup", () => cancelQuoridorWallHold(button));
    button.addEventListener("pointercancel", () => cancelQuoridorWallHold(button));
    button.addEventListener("pointerleave", () => cancelQuoridorWallHold(button));
    button.addEventListener("contextmenu", (event) => event.preventDefault());
  }
  return button;
}

function startQuoridorWallHold(event, button) {
  if (!quoridorDraftWall || pendingMove || !currentRoom || !isQuoridorGameState(currentRoom.game)) return;
  if (!quoridorWallIsLegalDraft(currentRoom.game, quoridorDraftWall)) return;
  event.preventDefault();
  clearQuoridorWallHold();
  quoridorWallHoldButton = button;
  button.dataset.wallHold = "pending";
  button.classList.add("holding");
  if (event.pointerId !== undefined && button.setPointerCapture) {
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort on older mobile browsers.
    }
  }
  quoridorWallHoldTimer = setTimeout(() => {
    if (!quoridorDraftWall || button.dataset.wallHold !== "pending") return;
    button.dataset.wallHold = "committed";
    button.classList.remove("holding");
    makeQuoridorAction({ type: "place_wall", ...quoridorDraftWall });
  }, 1000);
}

function cancelQuoridorWallHold(button) {
  if (!button || button.dataset.wallHold === "committed") return;
  clearQuoridorWallHold();
}

function clearQuoridorWallHold() {
  if (quoridorWallHoldTimer) clearTimeout(quoridorWallHoldTimer);
  quoridorWallHoldTimer = null;
  if (quoridorWallHoldButton) {
    quoridorWallHoldButton.classList.remove("holding");
    if (quoridorWallHoldButton.dataset.wallHold !== "committed") quoridorWallHoldButton.dataset.wallHold = "";
  }
  quoridorWallHoldButton = null;
}

function nextQuoridorDraftWall(row, col, horizontalLegal, verticalLegal) {
  if (quoridorDraftWall && quoridorDraftWall.row === row && quoridorDraftWall.col === col) {
    const nextOrientation = quoridorDraftWall.orientation === "h" ? "v" : "h";
    if (nextOrientation === "h" && horizontalLegal) return { orientation: "h", row, col };
    if (nextOrientation === "v" && verticalLegal) return { orientation: "v", row, col };
    return { ...quoridorDraftWall };
  }
  if (horizontalLegal) return { orientation: "h", row, col };
  return { orientation: "v", row, col };
}

function quoridorWallIsLegalDraft(game, wall) {
  if (!wall) return false;
  return (game.legal_walls || []).some((item) => item.orientation === wall.orientation && item.row === wall.row && item.col === wall.col);
}

function quoridorWallId(orientation, row, col) {
  return `${orientation === "v" ? "v" : "h"}-${Number(row)}-${Number(col)}`;
}

function renderBoxesGame(game) {
  const host = document.getElementById("macroBoard");
  host.className = "macro-board";
  host.innerHTML = "";
  host.className = "macro-board boxes-room-board";
  const currentTurnPlayer = currentRoom.players.find((player) => player.mark === game.current_player);
  const selectedSeat = currentRoom.players.find((player) => player.id === selectedPlayerId);
  const canSelectedPlayerMove = canRoomSeatMove(selectedSeat, game);
  setTurnColorVariables(host, currentTurnPlayer ? currentTurnPlayer.color : "#1f7a5f");
  host.classList.toggle("your-turn", canSelectedPlayerMove && game.status === "playing");
  host.classList.toggle("waiting", game.status === "playing" && !canSelectedPlayerMove);

  const lines = new Set(game.lines || []);
  const rows = Number(game.rows || 4);
  const cols = Number(game.cols || 4);
  const table = document.createElement("section");
  table.className = "boxes-room-table";
  table.style.setProperty("--boxes-grid-cols", String(cols * 2 + 1));
  table.style.setProperty("--boxes-grid-rows", String(rows * 2 + 1));
  table.innerHTML = `
    <div class="boxes-room-score-row">
      ${currentRoom.players.map((player) => boxesScoreHtml(player, game)).join("")}
    </div>
    <div class="boxes-room-grid" role="grid" aria-label="Dots and Boxes board"></div>
  `;
  const grid = table.querySelector(".boxes-room-grid");
  for (let visualRow = 0; visualRow <= rows * 2; visualRow += 1) {
    for (let visualCol = 0; visualCol <= cols * 2; visualCol += 1) {
      if (visualRow % 2 === 0 && visualCol % 2 === 0) {
        const dot = document.createElement("span");
        dot.className = "boxes-dot";
        dot.setAttribute("aria-hidden", "true");
        grid.appendChild(dot);
      } else if (visualRow % 2 === 0) {
        const lineId = boxesLineId("h", visualRow / 2, Math.floor(visualCol / 2));
        grid.appendChild(boxesLineButton(lineId, "horizontal", game, lines, canSelectedPlayerMove));
      } else if (visualCol % 2 === 0) {
        const lineId = boxesLineId("v", Math.floor(visualRow / 2), visualCol / 2);
        grid.appendChild(boxesLineButton(lineId, "vertical", game, lines, canSelectedPlayerMove));
      } else {
        grid.appendChild(boxesCell(game, Math.floor(visualRow / 2), Math.floor(visualCol / 2), lines));
      }
    }
  }
  host.appendChild(table);
}

function boxesScoreHtml(player, game) {
  const active = game.status === "playing" && player.mark === game.current_player;
  const score = Number(game.scores && game.scores[player.mark] || 0);
  const color = safePlayerColor(player);
  return `
    <div class="boxes-room-score ${active ? "active" : ""}" style="--player-color:${escapeHtml(color)}">
      ${avatarHtml(player)}
      <strong>${escapeHtml(player.name)}</strong>
      <b>${escapeHtml(String(score))}</b>
    </div>
  `;
}

function boxesLineButton(lineId, orientation, game, lines, canSelectedPlayerMove) {
  const claimed = lines.has(lineId);
  const owner = claimed ? boxesLineOwner(game, lineId) : null;
  const ownerPlayer = owner ? currentRoom.players.find((player) => player.mark === owner) : null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `boxes-edge boxes-edge-${orientation} ${claimed ? "claimed" : ""} ${game.last_move && game.last_move.line_id === lineId ? "last-move" : ""}`;
  button.dataset.lineId = lineId;
  button.setAttribute("aria-label", claimed ? `Claimed edge ${lineId}` : `Claim edge ${lineId}`);
  if (ownerPlayer) button.style.setProperty("--owner-color", safePlayerColor(ownerPlayer));
  const moveKey = moveIntentKey(currentRoom, selectedPlayerId, null, null, lineId);
  button.classList.toggle("pending", Boolean(pendingMove && pendingMove.key === moveKey));
  button.disabled = Boolean(claimed || game.status !== "playing" || !canSelectedPlayerMove || pendingMove);
  button.addEventListener("click", () => makeMove(null, null, lineId));
  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    event.preventDefault();
    makeMove(null, null, lineId);
  });
  return button;
}

function boxesCell(game, row, col, lines) {
  const owner = game.boxes && game.boxes[row] && game.boxes[row][col];
  const ownerPlayer = owner ? currentRoom.players.find((player) => player.mark === owner) : null;
  const sides = boxesBoxLineIds(row, col).filter((lineId) => lines.has(lineId)).length;
  const cell = document.createElement("div");
  cell.className = `boxes-cell ${owner ? "owned" : ""} ${!owner && sides === 3 ? "danger" : ""}`;
  if (ownerPlayer) {
    cell.style.setProperty("--owner-color", safePlayerColor(ownerPlayer));
    const ownerIndex = currentRoom.players.indexOf(ownerPlayer);
    const mark = document.createElement("span");
    mark.textContent = ownerPlayer.icon || (ownerIndex === 1 ? "😎" : "🙂");
    mark.setAttribute("aria-label", `${ownerPlayer.name || "Player"} claimed this box`);
    cell.appendChild(mark);
  }
  return cell;
}

function boxesLineOwner(game, lineId) {
  const entry = (game.events || []).slice().reverse().find((event) => event.line_id === lineId);
  return entry ? entry.player : game.last_move && game.last_move.line_id === lineId ? game.last_move.player : null;
}

function boxesLineId(orientation, row, col) {
  return `${orientation === "v" ? "v" : "h"}-${Number(row)}-${Number(col)}`;
}

function boxesBoxLineIds(row, col) {
  return [
    boxesLineId("h", row, col),
    boxesLineId("h", row + 1, col),
    boxesLineId("v", row, col),
    boxesLineId("v", row, col + 1),
  ];
}

function canRoomSeatMove(seat, game) {
  return Boolean(
    currentRoom &&
    currentRoom.started &&
    seat &&
    !isBotPlayer(seat) &&
    game &&
    game.status === "playing" &&
    seat.mark === game.current_player
  );
}

function isBotPlayer(player) {
  return Boolean(player && player.kind === "bot");
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
  const isBattleship = isBattleshipGameState(currentRoom.game);
  const isBattleshipReview = isBattleship && currentRoom.game && currentRoom.game.phase === "complete";
  const battleshipActiveMark = isBattleship && !isBattleshipReview ? visibleBattleshipPlayerMark(currentRoom) : "";

  currentRoom.players.forEach((roomPlayer) => {
    const isCurrentTurn = roomPlayer.mark === currentRoom.game.current_player && currentRoom.game.status === "playing";
    const isVisibleBattleshipPlayer = Boolean(battleshipActiveMark && roomPlayer.mark === battleshipActiveMark);
    const highlighted = isBattleship && !isBattleshipReview ? isVisibleBattleshipPlayer : isCurrentTurn;
    const scoreText = tacticalScoreText(roomPlayer);
    const label = document.createElement(isBattleshipReview ? "button" : "div");
    if (isBattleshipReview) label.type = "button";
    const selectedReview = isBattleshipReview && roomPlayer.mark === (battleshipReviewMark || currentRoom.players[0].mark);
    label.className = `player-switch-button ${highlighted ? "current-turn" : ""} ${selectedReview ? "current-turn" : ""}`;
    label.setAttribute("aria-current", highlighted ? "true" : "false");
    if (highlighted || selectedReview) applyPlayerLabelTurnColor(label, roomPlayer);
    label.innerHTML = `${avatarHtml(roomPlayer)}<span>${escapeHtml(roomPlayer.name)}${scoreText}</span>`;
    if (isBattleshipReview) {
      label.setAttribute("aria-pressed", selectedReview ? "true" : "false");
      label.addEventListener("click", () => {
        battleshipReviewMark = roomPlayer.mark;
        renderGame();
      });
    }
    host.appendChild(label);
  });
}

function visibleBattleshipPlayerMark(room) {
  const selectedSeat = room.players.find((player) => player.id === selectedPlayerId);
  const opponent = selectedSeat ? room.players.find((player) => player.mark && player.mark !== selectedSeat.mark) : null;
  const currentTurnPlayer = room.players.find((player) => player.mark === room.game.current_player);
  const reveal = activeBattleshipResultReveal(room, selectedSeat);
  const pendingDefence = activeBattleshipPendingDefence(room, selectedSeat);
  const yourTurn = selectedSeat && selectedSeat.mark === room.game.current_player;
  const activeView = reveal && reveal.view ? reveal.view : pendingDefence ? "defence" : battleshipViewMode === "auto" ? (yourTurn ? "offence" : "defence") : battleshipViewMode;
  const visiblePlayer = battleshipVisiblePlayer(activeView, reveal, selectedSeat, opponent, currentTurnPlayer);
  return visiblePlayer && visiblePlayer.mark || "";
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
    const moveText = isBattleshipGameState(currentRoom.game)
      ? `It's your turn, ${selectedSeat.name}.`
      : `It's Your Turn ${selectedSeat.name}; Place an ${selectedSeat.mark}`;
    setTurnStatusText(host, pendingMove ? "Placing move..." : moveText);
    host.classList.add("your-turn");
    return;
  }
  const waitingText = isBotPlayer(currentPlayer)
    ? `${currentPlayer.name} is thinking...`
    : `Waiting for ${currentPlayer ? currentPlayer.name : isBattleshipGameState(currentRoom.game) ? "the other player" : currentRoom.game.current_player}.`;
  setTurnStatusText(host, waitingText);
  host.classList.add("waiting");
}

function setTurnStatusText(host, text) {
  const eventText = tacticalEventText();
  if (!eventText) {
    host.textContent = text;
    return;
  }
  host.innerHTML = `<span>${escapeHtml(text)}</span><small>${escapeHtml(eventText)}</small>`;
}

function tacticalScoreText(roomPlayer) {
  if (!isTacticalGameState(currentRoom && currentRoom.game) || !roomPlayer.mark) return "";
  const score = Number(currentRoom.game.scores && currentRoom.game.scores[roomPlayer.mark] || 0);
  return ` <em>${score}</em>`;
}

function tacticalEventText() {
  if (!isTacticalGameState(currentRoom && currentRoom.game) || !currentRoom.game.last_event) return "";
  const event = currentRoom.game.last_event;
  if (event.type === "pickupCaptured") {
    const player = currentRoom.players.find((seat) => seat.mark === event.player);
    return `${player ? player.name : event.player} captured ${event.emoji || ""} ${event.pickup_label || "Pickup"}! +${event.points}`;
  }
  if (event.type === "sectorCaptured") {
    const player = currentRoom.players.find((seat) => seat.mark === event.player);
    return `${player ? player.name : event.player} captured Sector ${Number(event.sector) + 1}.`;
  }
  return "";
}

function pickupAtCell(game, boardIndex, cellIndex) {
  if (!isTacticalGameState(game) || !Array.isArray(game.pickups)) return null;
  return game.pickups.find((pickup) => pickup.board === boardIndex && pickup.cell === cellIndex) || null;
}

function isTacticalGameState(game) {
  return Boolean(game && (canonicalGameId(game.game_id) === "d7e4a91f0c23" || Array.isArray(game.pickups)));
}

function isBoxesGameState(game) {
  return Boolean(game && (canonicalGameId(game.game_id) === BOXES_GAME_ID || Array.isArray(game.lines) && Array.isArray(game.boxes)));
}

function isBattleshipGameState(game) {
  return Boolean(game && (canonicalGameId(game.game_id) === BATTLESHIP_GAME_ID || game.phase === "setup" && game.players && game.fleet));
}

function isQuoridorGameState(game) {
  return Boolean(game && (canonicalGameId(game.game_id) === QUORIDOR_GAME_ID || game.pawns && game.walls_remaining && Array.isArray(game.walls)));
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

function startRoomLiveUpdates() {
  if (!currentRoom) return;
  realtime.startRoomLiveUpdates(currentRoom.code);
}

function stopRoomLiveUpdates() {
  realtime.stopRoomLiveUpdates();
}

function handleRoomSocketMessage(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }
  if (message.type === "room_snapshot" && message.room) {
    setRoom(message.room);
    return;
  }
  if (message.type === "room_closed") {
    leaveClosedRoom();
  }
}

function handleAppEventMessage(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }
  if (message.type !== "app_snapshot" || canonicalGameId(message.game_id) !== selectedGame().id) return;
  if (Array.isArray(message.rooms)) {
    currentGameRooms = message.rooms;
    renderCurrentGames();
    renderCreateGameButton();
    renderActiveGameNotice();
    autoOpenActiveRoomForSelectedPlayer();
  }
  if (Array.isArray(message.lobby_players)) {
    lobbyPlayers = message.lobby_players;
    renderLobbyPlayers();
  }
  if (message.stats) {
    currentGameStats = message.stats;
    renderGameStats();
  }
  if (
    Array.isArray(message.pending_invites) &&
    message.pending_invites.length &&
    document.getElementById("invitePrompt").classList.contains("hidden")
  ) {
    showInvitePrompt(message.pending_invites[0]);
  }
}

async function refreshRooms() {
  try {
    await refreshCurrentRoomSummary();
  } catch {
    if (currentRoom) showTurnStatus(null, "Room refresh failed.");
  }
}

async function refreshCurrentRoomView() {
  await refreshRooms();
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
  lastRenderedRoomKey = "";
  hideWinOverlay();
  stopRoomLiveUpdates();
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
  realtime.sendAppEventSubscription();
}

function syncSelectedPlayerForLocalRoom() {
  if (!isLocalModeRoom(currentRoom)) return;
  const currentTurnPlayer = currentRoom.players.find((player) => player.mark === currentRoom.game.current_player);
  const setupPlayer = isBattleshipGameState(currentRoom.game) && currentRoom.game.status === "setup"
    ? currentRoom.players.find((player) => player.mark && !(currentRoom.game.players && currentRoom.game.players[player.mark] && currentRoom.game.players[player.mark].ready))
    : null;
  const homePlayerId = localGameHomePlayerId(currentRoom);
  const targetPlayerId = setupPlayer
    ? setupPlayer.id
    : currentRoom.started && currentRoom.game.status === "playing" && currentTurnPlayer
    ? currentTurnPlayer.id
    : homePlayerId;
  if (!targetPlayerId || selectedPlayerId === targetPlayerId) return;
  selectedPlayerId = targetPlayerId;
  renderPlayers();
  renderSelectedPlayer();
  renderCurrentPlayer();
  renderGames();
  refreshSelectedPlayerStats();
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
  return games.find((game) => game.id === canonicalGameId(selectedGameId)) || games.find(gameIsReady) || games[0];
}

function gameName(gameId) {
  const game = games.find((item) => item.id === canonicalGameId(gameId));
  return game ? game.name : "Game";
}

function canonicalGameId(gameId) {
  const value = String(gameId || games[0].id).trim() || games[0].id;
  return games.find((game) => game.id === value || (game.aliases || []).includes(value))?.id || games[0].id;
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

function roomRenderKey(room) {
  if (!room) return "";
  return JSON.stringify({
    code: room.code,
    started: room.started,
    status: room.status,
    local_mode: room.local_mode,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      icon: player.icon,
      color: player.color,
      mark: player.mark,
    })),
    game: {
      game_id: canonicalGameId(room.game.game_id),
      boards: room.game.boards,
      small_winners: room.game.small_winners,
      current_player: room.game.current_player,
      next_board: room.game.next_board,
      status: room.game.status,
      winner: room.game.winner,
      line_winner: room.game.line_winner,
      move_count: room.game.move_count,
      legal_boards: room.game.legal_boards,
      lines: room.game.lines,
      boxes: room.game.boxes,
      scores: room.game.scores,
      legal_lines: room.game.legal_lines,
      last_move: room.game.last_move,
      events: room.game.events,
      phase: room.game.phase,
      board_size: room.game.board_size,
      fleet: room.game.fleet,
      players_state: room.game.players,
      pawns: room.game.pawns,
      walls_remaining: room.game.walls_remaining,
      walls: room.game.walls,
      legal_pawn_moves: room.game.legal_pawn_moves,
      legal_walls: room.game.legal_walls,
      pickups: room.game.pickups,
      last_event: room.game.last_event,
    },
    latest_invite: room.latest_invite ? {
      id: room.latest_invite.id,
      status: room.latest_invite.status,
      target_name: room.latest_invite.target_name,
    } : null,
    reset_request: room.reset_request,
  });
}

function moveIntentKey(room, playerId, board, cell, lineId = "") {
  if (!room) return "";
  return `${room.code}:${room.game.move_count}:${playerId}:${lineId || `${board}:${cell}`}`;
}

function clearResolvedPendingMove(room) {
  if (!pendingMove || !room || room.code !== pendingMove.roomCode) {
    pendingMove = null;
    return;
  }
  if (room.game.move_count > pendingMove.moveCount || room.game.status !== "playing") pendingMove = null;
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
    refreshSelectedPlayerStats();
    updateLobbyPresence();
    renderCreateGameButton();
  } catch (error) {
    playerApiAvailable = false;
    players = [];
    selectedPlayerStats = [];
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

