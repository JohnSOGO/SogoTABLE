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
import { GAME_REGISTRY, GAME_IDS } from "./games/registry.js";
import { renderGameList } from "./games/game-list-view.js";
import { buildRoomRenderKey } from "./games/render-keys.js";
import { renderBoxesGame } from "./games/boxes/client.js";
import { renderQuoridorGame, resetQuoridorDraft } from "./games/quoridor/client.js";
import { renderBattleshipGame, clearBattleshipDraft } from "./games/battleship/client.js";
import { confirmAction, showInfoPrompt, promptForPasscode, wirePromptControls } from "./controllers/prompts.js";
import { wireGameOptions } from "./controllers/game-options.js";
import { refreshGameStats, renderGameStatsLink, applyGameStats, resetGameStatsKey, wireGameStats } from "./controllers/game-stats.js";
import { scheduleWinOverlay, hideWinOverlay, wireWinOverlay, resetWinCelebration } from "./controllers/win-overlay.js";
import { downloadReviewZip } from "./review-export.js";
import {
  SOGO_SUPERUSER_PASSCODE_KEY,
  PLAYER_OWNER_TOKEN_STORAGE_KEY,
  LOCAL_GAME_HOME_PLAYERS_KEY,
  loadLocalGameHomePlayers,
  loadPlayerOwnerTokens,
  actionLabelStyle,
  setActionLabelStyle,
  purgeDeprecatedLocalRoster,
  migrateStorageNamespace,
} from "./storage.js";
import { renderSuperTicTacToeBoard } from "./games/super-tic-tac-toe/render.js";
import { renderTenThousandGame } from "./games/ten-thousand/render.js";
import { renderYahtzeeGame } from "./games/yahtzee/render.js";
import {
  isSoundEnabled,
  soundVolumeLevel,
  setSoundEnabled,
  setSoundVolumeLevel,
  playBattleshipHit,
  playBattleshipMiss,
  playBank,
  playCancel,
  playClick,
  playConfirm,
  playDiceRoll,
  playFarkle,
  playInvalidMove,
  playInviteReceived,
  playLose,
  playPlayerJoined,
  playRoomCreated,
  playScorePick,
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
const CLASSIC_GAME_ID = GAME_IDS.classic;
const TACTICAL_GAME_ID = GAME_IDS.tactical;
const BOXES_GAME_ID = GAME_IDS.boxes;
const BATTLESHIP_GAME_ID = GAME_IDS.battleship;
const QUORIDOR_GAME_ID = GAME_IDS.quoridor;
const TEN_THOUSAND_GAME_ID = GAME_IDS.tenThousand;
const YAHTZEE_GAME_ID = GAME_IDS.yahtzee;
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
// Shown only when the games fetch fails; the registry is the single source of
// truth shared with the Worker (see games/registry.js).
const fallbackGames = GAME_REGISTRY;
let games = [...fallbackGames];

migrateStorageNamespace();

let players = [];
let selectedPlayerId = localStorage.getItem("sogotable.selectedPlayerId") || "";
let deviceSelectedPlayerId = sessionStorage.getItem("sogotable.deviceSelectedPlayerId")
  || localStorage.getItem("sogotable.deviceSelectedPlayerId")
  || selectedPlayerId;
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
let selectedPlayerStats = [];
let playerStatsCollapsed = true;
let playerStatsCollapsePlayerId = "";
let lastLobbyPlayersKey = "";
let lastCurrentGameRoomsKey = "";
let lastActiveGameNoticeKey = "";
let lastSelectedPlayerStatsKey = "";
let lastInviteSoundKey = "";
let lastPlayerJoinedSoundKey = "";
let lastTurnSoundKey = "";
let lastGameEventSoundKey = "";
let lastGameOverSoundKey = "";
let lastTenThousandSoundKey = "";
// Farkle is player-declared (the Red X). Once declared, the red dice and the
// "You Farkled" banner show for a beat, then the bust auto-acknowledges so the
// round can advance.
const TEN_THOUSAND_FARKLE_ACK_MS = 2000;
let tenThousandFarkleAckKey = ""; // dedupe so each declared bust schedules once
let tenThousandFarkleAckTimer = null;
let selectedPlayerStatsRequestId = 0;
let opponentPickerMode = "remote";
let playerApiAvailable = true;
let lastLegalBoardsKey = "";
let battleshipViewMode = "auto";
let battleshipResultReveal = null;
let battleshipResultTimer = null;
let battleshipRevealQueue = [];
let battleshipReviewMark = "";
let lastTenThousandFarkleNoticeKey = "";
let lastRenderedRoomKey = "";
let pendingMove = null;
const BATTLESHIP_RADAR_MS = 1000;          // radar scan before the hit/miss lands
const BATTLESHIP_RESULT_MS = 2000;         // how long the hit/miss stays up
const BATTLESHIP_DEFENCE_SETTLE_MS = 250;  // let the defence board settle before an incoming reveal
let localGameHomePlayers = loadLocalGameHomePlayers();
let playerOwnerTokens = loadPlayerOwnerTokens();
let handledResetRequestKey = "";
let selectedGameEntryRequestId = 0;
const realtime = createRealtimeController({
  getAppSubscription: () => ({
    gameId: selectedGame().id,
    playerId: deviceSelectedPlayerId,
  }),
  getRoomPlayerId: () => deviceSelectedPlayerId || selectedPlayerId || "",
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
  bindTouchZoomGuard();
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
  document.getElementById("exportReviewZip").addEventListener("click", exportReviewZip);
  document.getElementById("playerIconText").addEventListener("input", updateSelectedIcon);
  document.getElementById("playerIconText").addEventListener("focus", clearEmojiField);
  document.getElementById("playerIconText").addEventListener("blur", resetBlankEmojiField);
  document.getElementById("playerColorText").addEventListener("input", updateSelectedColorFromText);
  document.getElementById("playerColorText").addEventListener("blur", normalizeSelectedColorText);
  document.getElementById("playerColorNative").addEventListener("input", updateSelectedColorFromNative);
  document.getElementById("closeInvitePlayerModal").addEventListener("click", closeInvitePlayerModal);
  document.getElementById("invitePlayerModal").addEventListener("click", closeInvitePlayerModalOnBackdrop);
  wireGameStats({ selectedGame, isCurrentSelectedGame, canonicalGameId });
  wireGameOptions({ rerender: renderGame, api, bugContext: bugReportContext });
  document.getElementById("createGame").addEventListener("click", createRoom);
  document.getElementById("refreshGameList").addEventListener("click", refreshGameRooms);
  document.getElementById("acceptInvite").addEventListener("click", () => respondToInvite(true));
  document.getElementById("declineInvite").addEventListener("click", () => respondToInvite(false));
  document.getElementById("closeGame").addEventListener("click", closeGame);
  document.getElementById("superCloseRoom").addEventListener("click", closeCurrentRoomAsSuperuser);
  document.getElementById("resetGame").addEventListener("click", resetGame);
  wirePromptControls();
  wireWinOverlay({ getRoom: () => currentRoom });
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

function bindTouchZoomGuard() {
  let lastTapTime = 0;
  document.addEventListener("touchend", (event) => {
    if (!event || !event.changedTouches || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const now = Date.now();
    const isDoubleTap = now - lastTapTime < 300;
    lastTapTime = now;
    if (isDoubleTap) {
      event.preventDefault();
    }
  }, { passive: false });
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

function setActiveScreen(name) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.toggle("active", screen.id === name);
  });
}

function showScreen(name) {
  if (name === "game" && !currentRoom) return;
  if (name === "gameSelected" && !selectedGame()) return;
  if (name === "gameSelected") {
    void enterSelectedGameScreen();
    return;
  }
  if (name === "intro") renderIntroAdminActions();
  setActiveScreen(name);
  if (name === "game") startRoomLiveUpdates();
}

async function enterSelectedGameScreen() {
  const game = selectedGame();
  if (!game) return;
  const requestId = ++selectedGameEntryRequestId;
  realtime.sendAppEventSubscription();
  await refreshSelectedGameView({ allowHiddenPresence: true });
  if (requestId !== selectedGameEntryRequestId || selectedGame().id !== game.id) return;
  if (await autoOpenActiveRoomForSelectedPlayer({ allowHidden: true })) return;
  renderGameSelected();
  setActiveScreen("gameSelected");
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
  // Hide the games entirely until a player is chosen — the player panel above
  // guides selection, and an empty greyed-out list reads as broken.
  const section = document.getElementById("gamesSection");
  const needPlayer = document.getElementById("gamesNeedPlayer");
  if (section) section.classList.toggle("hidden", !hasPlayer);
  if (needPlayer) needPlayer.classList.toggle("hidden", hasPlayer);
  if (!hasPlayer) return;
  renderGameList(host, games, {
    selectedGameId,
    isReady: gameIsReady,
    availabilityText: gameAvailabilityText,
    onSelect: (game) => {
      selectedGameId = game.id;
      currentRoom = null;
      activeGameRoom = null;
      saveSelectedGame();
      renderGames();
      renderSelectedGame();
      showScreen("gameSelected");
    },
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
  resetGameStatsKey();
  renderCurrentGames();
  renderCreateGameButton();
  renderActiveGameNotice();
}

async function refreshSelectedGameView({ allowHiddenPresence = false } = {}) {
  const game = selectedGame();
  if (!game) return;
  realtime.sendAppEventSubscription();
  await updateLobbyPresence({ game, allowHidden: allowHiddenPresence });
  await Promise.all([
    refreshLobbyPlayers(game),
    refreshGameStats(game),
    refreshGameRooms(game),
    refreshPendingInvites(),
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
    category: game.category ? String(game.category).trim() : "",
    player_count: game.player_count === null || game.player_count === undefined ? null : Number(game.player_count),
    host_start: Boolean(game.host_start),
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

async function refreshLobbyPlayers(game = selectedGame()) {
  if (!game) return;
  try {
    const data = await fetchJson(`/api/lobby?game_id=${encodeURIComponent(game.id)}`);
    if (!data.ok) throw new Error(data.error || "Could not load lobby players.");
    if (!isCurrentSelectedGame(game)) return;
    lobbyPlayers = data.players;
    renderLobbyPlayers();
  } catch {
    if (!isCurrentSelectedGame(game)) return;
    lobbyPlayers = [];
    renderLobbyPlayers();
  }
}


async function updateLobbyPresence({ game = selectedGame(), allowHidden = false } = {}) {
  const player = deviceSelectedPlayer();
  const gameSelectedScreen = document.getElementById("gameSelected");
  if (!player || !game || (!allowHidden && !gameSelectedScreen.classList.contains("active"))) return;
  try {
    const response = await api("/api/lobby/presence", { game_id: game.id, player });
    if (!isCurrentSelectedGame(game)) return;
    lobbyPlayers = response.players;
    renderLobbyPlayers();
    if (response.stats) applyGameStats(response.stats);
  } catch {
    refreshLobbyPlayers(game);
  }
}

async function refreshGameRooms(game = selectedGame()) {
  if (!game) return;
  try {
    const data = await fetchJson(`/api/rooms?game_id=${encodeURIComponent(game.id)}`);
    if (!data.ok) throw new Error(data.error || "Could not load games.");
    if (!isCurrentSelectedGame(game)) return;
    currentGameRooms = data.rooms;
    renderCurrentGames();
    renderCreateGameButton();
    renderActiveGameNotice();
    void autoOpenActiveRoomForSelectedPlayer();
  } catch (error) {
    if (!isCurrentSelectedGame(game)) return;
    currentGameRooms = [];
    playerApiAvailable = false;
    renderCurrentGames(error.message);
    renderCreateGameButton();
    renderActiveGameNotice(error.message);
  }
}

async function autoOpenActiveRoomForSelectedPlayer({ allowHidden = false } = {}) {
  const player = deviceSelectedPlayer();
  const gameSelectedScreen = document.getElementById("gameSelected");
  if (!player || !gameSelectedScreen || (!allowHidden && !gameSelectedScreen.classList.contains("active"))) return false;
  const room = currentGameRooms.find((item) => (
    item.status === "active" &&
    item.players.some((seat) => seat.id === player.id)
  ));
  if (!room || (currentRoom && currentRoom.code === room.code)) return false;
  try {
    const data = await fetchJson(roomReadUrl(room.code));
    if (!data.ok) return false;
    activeGameRoom = data.room;
    setRoom(data.room);
    showScreen("game");
    return true;
  } catch {
    // A transient read failure should not strand the screen; the next explicit refresh or socket update can recover.
    return false;
  }
}

function renderCurrentGames(errorMessage = "") {
  const openHost = document.getElementById("openGamesList");
  const closedHost = document.getElementById("closedGamesList");
  if (!openHost || !closedHost) return;
  const nextKey = errorMessage ? `error:${errorMessage}` : `${gameRoomsSignature(currentGameRooms)}:superuser=${isSogoSuperuserSelected()}`;
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
    const canSuperClose = isSogoSuperuserSelected();
    const canJoin = Boolean(deviceSelectedPlayer() && isOpen && !selectedSeat && (room.open_seats == null || room.open_seats > 0));
    const canReenter = Boolean(selectedSeat);
    const actionText = canReenter ? "Re-enter Game" : canJoin ? "Join Game" : room.status === "active" ? "In Progress" : "Join Game";
    card.innerHTML = `
      <div class="room-summary-main">
        <strong>${escapeHtml(hostPlayer ? `${hostPlayer.name}'s Game` : "Game")}</strong>
        <span>Code ${escapeHtml(room.code)}</span>
      </div>
      <button type="button" class="${canReenter || canJoin ? "secondary" : "ghost"}">${escapeHtml(actionText)}</button>
      <button type="button" class="ghost danger room-super-close ${canSuperClose ? "" : "hidden"}" aria-label="Close room ${escapeHtml(room.code)} as Sogo" title="Close room as Sogo">X</button>
      <div class="room-summary-players">${room.players.map((player) => avatarHtml(player)).join("")}</div>
    `;
    const button = card.querySelector("button");
    const superCloseButton = card.querySelector(".room-super-close");
    button.disabled = !(canReenter || canJoin);
    button.addEventListener("click", () => enterRoomSummary(room));
    superCloseButton.addEventListener("click", () => closeRoomAsSuperuser(room.code));
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
    const data = await fetchJson(roomReadUrl(summary.code));
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
  if (freshSummary.status !== "waiting_for_player" || (freshSummary.open_seats !== null && freshSummary.open_seats !== undefined && freshSummary.open_seats <= 0)) {
    alert("That game is no longer open.");
    refreshGameRooms();
    return;
  }
  try {
    const response = await api("/api/room/join", { code: freshSummary.code, player, owner_token: await ensureOwnerToken(player.id) });
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


// Captures who/where for a bug report: the device's player and the screen they
// are on (and the game/room if any), so reports are actionable without asking.
function bugReportContext() {
  const active = document.querySelector(".screen.active");
  const screenId = active ? active.id : "unknown";
  const screenLabels = {
    intro: "Intro",
    games: "Player & Game Select",
    gameSelected: "Game Lobby",
    game: "In Game",
  };
  const player = deviceSelectedPlayer();
  const game = selectedGame();
  return {
    screen: screenLabels[screenId] || screenId,
    game: currentRoom ? gameName(currentRoom.game_id) : (game ? game.name : ""),
    game_id: currentRoom ? currentRoom.game_id : (game ? game.id : ""),
    room_code: currentRoom ? currentRoom.code : "",
    player_id: player ? player.id : (deviceSelectedPlayerId || ""),
    player_name: player ? player.name : "",
  };
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
    const payload = { player };
    if (wasEditing) payload.owner_token = await ensureOwnerToken(player.id);
    const response = await api("/api/players/create", payload);
    rememberOwnerToken(response.player.id, response.owner_token);
    players = response.players;
    if (await finishPlayerSave(response.player.id, input, wasEditing)) playConfirm();
  } catch (error) {
    alert(error.message);
  }
}

async function finishPlayerSave(playerId, input, wasEditing = false) {
  if (!wasEditing || playerId === deviceSelectedPlayerId) {
    const selected = await selectPlayer(playerId);
    if (!selected) {
      renderPlayers();
      return false;
    }
  }
  renderPlayers();
  renderSelectedPlayer();
  renderCurrentPlayer();
  renderGames();
  refreshSelectedPlayerStats();
  updateLobbyPresence();
  renderCreateGameButton();
  closePlayerModal();
  return true;
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
    // The Sogo superuser can release a claimed player so a device that lost its
    // owner token can re-claim it (the cause of "Player is already claimed").
    const showUnlock = isSogoSuperuserSelected() && player.claimed;
    const card = document.createElement("div");
    card.className = `player-card ${player.id === deviceSelectedPlayerId ? "selected" : ""} ${editing ? "editing" : ""}`;
    card.innerHTML = `
      ${avatarHtml(player)}
      <strong>${escapeHtml(player.name)}</strong>
      <div class="player-actions ${editing ? "hidden" : ""}">
        <button type="button" class="secondary edit-player">Edit</button>
        ${showUnlock ? '<button type="button" class="secondary unlock-player">Unlock</button>' : ""}
        <button type="button" class="delete-player">Delete</button>
      </div>
    `;
    card.addEventListener("click", () => {
      void selectPlayer(player.id, { closeModal: true });
    });
    card.querySelector(".edit-player").addEventListener("click", (event) => {
      event.stopPropagation();
      editPlayer(player.id);
    });
    if (showUnlock) {
      card.querySelector(".unlock-player").addEventListener("click", (event) => {
        event.stopPropagation();
        unclaimPlayerAsSuperuser(player.id);
      });
    }
    card.querySelector(".delete-player").addEventListener("click", (event) => {
      event.stopPropagation();
      deletePlayer(player.id);
    });
    host.appendChild(card);
  });
}

async function unclaimPlayerAsSuperuser(playerId) {
  const superuser = deviceSelectedPlayer();
  if (!superuser || !isSogoSuperuser(superuser)) return;
  const target = players.find((item) => item.id === playerId);
  if (!target) return;
  const passcode = await ensureSogoSuperuserPasscode(superuser);
  if (!passcode) return;
  const confirmed = await confirmAction("Unlock player?", `Release the claim on ${target.name}? Any device can then re-claim it.`);
  if (!confirmed) return;
  try {
    const response = await api("/api/player/unclaim", { player_id: playerId, requester_id: superuser.id, passcode });
    players = response.players;
    delete playerOwnerTokens[playerId];
    savePlayerOwnerTokens();
    renderPlayers();
    playConfirm();
  } catch (error) {
    if (String(error.message || "").toLowerCase().includes("passcode")) clearSogoSuperuserPasscode();
    alert(error.message);
  }
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
    const response = await api("/api/player/stats/clear", { player_id: player.id, owner_token: await ensureOwnerToken(player.id) });
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
  if (playerId !== playerStatsCollapsePlayerId) {
    // A freshly selected player starts with stats hidden behind the toggle.
    playerStatsCollapsed = true;
    playerStatsCollapsePlayerId = playerId || "";
  }
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
  const nextKey = JSON.stringify({ playerId: player.id, message, stats: selectedPlayerStats, collapsed: playerStatsCollapsed });
  if (nextKey === lastSelectedPlayerStatsKey) return;
  lastSelectedPlayerStatsKey = nextKey;
  host.classList.remove("hidden");
  const toggle = `<button type="button" class="player-stats-toggle label" aria-expanded="${!playerStatsCollapsed}">Player Stats</button>`;
  let body;
  if (message) {
    body = `<p>${escapeHtml(message)}</p>`;
  } else {
    const rows = (selectedPlayerStats || []).map((item) => `
    <tr>
      <th scope="row">${escapeHtml(item.game_name || "Game")}</th>
      <td>${Number(item.games_played || 0)}</td>
      <td>${Number(item.games_won || 0)}</td>
      <td>${Number(item.personal_high_score || 0)}</td>
      <td>${Number(item.elo || 1000)}</td>
    </tr>
  `).join("");
    body = `
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
  host.innerHTML = `${toggle}<div class="player-stats-body${playerStatsCollapsed ? " hidden" : ""}">${body}</div>`;
  const toggleButton = host.querySelector(".player-stats-toggle");
  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      playerStatsCollapsed = !playerStatsCollapsed;
      renderSelectedPlayerStats(message);
    });
  }
}

function renderCurrentPlayer() {
  const host = document.getElementById("currentPlayer");
  const player = deviceSelectedPlayer();
  host.innerHTML = player ? `${avatarHtml(player)}<strong>${escapeHtml(player.name)}</strong>` : "No player selected";
  document.getElementById("openEditPlayerModal").disabled = !player;
  renderIntroAdminActions();
}

function renderIntroAdminActions() {
  const exportButton = document.getElementById("exportReviewZip");
  if (!exportButton) return;
  exportButton.classList.toggle("hidden", !isSogoSuperuserSelected());
}

async function exportReviewZip() {
  if (!isSogoSuperuserSelected()) return;
  const button = document.getElementById("exportReviewZip");
  const originalText = button ? button.textContent : "";
  if (button) {
    button.disabled = true;
    button.textContent = "Exporting...";
  }
  try {
    const revision = document.getElementById("revisionSummary");
    const revisionText = revision ? revision.textContent.trim() : "revision unavailable";
    await downloadReviewZip(revisionText);
    playConfirm();
  } catch (error) {
    alert(error.message || "Export failed.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || "Export .ZIP";
    }
  }
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

async function selectPlayer(playerId, options = {}) {
  const player = players.find((item) => item.id === playerId);
  if (!player) return false;
  if (isSogoSuperuser(player)) {
    const verified = await verifySogoSuperuserPasscode(player);
    if (!verified) return false;
  } else {
    clearSogoSuperuserPasscode();
  }
  setDeviceSelectedPlayer(playerId);
  renderPlayers();
  renderSelectedPlayer();
  renderCurrentPlayer();
  renderGames();
  refreshSelectedPlayerStats();
  updateLobbyPresence();
  renderCreateGameButton();
  if (options.closeModal) closePlayerModal();
  return true;
}

async function deletePlayer(playerId) {
  const player = players.find((item) => item.id === playerId);
  if (!player) return;
  if (!confirm(`Delete ${player.name} from the shared player roster?`)) return;
  try {
    const response = await api("/api/players/delete", { id: playerId, owner_token: await ensureOwnerToken(playerId) });
    delete playerOwnerTokens[playerId];
    savePlayerOwnerTokens();
    players = response.players;
    finishPlayerDelete(playerId);
  } catch (error) {
    alert(error.message);
  }
}

function finishPlayerDelete(playerId) {
  if (selectedPlayerId === playerId) selectedPlayerId = "";
  if (deviceSelectedPlayerId === playerId) {
    deviceSelectedPlayerId = "";
    clearSogoSuperuserPasscode();
  }
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
    const response = await api("/api/room/join", { code: currentRoom.code, player, local: true, owner_token: await ensureOwnerToken(player.id) });
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
      owner_token: await ensureOwnerToken(currentRoom.host_id),
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
    const response = await api("/api/invite/create", { code: currentRoom.code, host_id: currentRoom.host_id, player, owner_token: await ensureOwnerToken(currentRoom.host_id) });
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
    const response = await api("/api/invite/respond", { invite_id: currentInvite.id, accept, player, owner_token: await ensureOwnerToken(player.id) });
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
  await attemptCreateRoom(false);
}
async function attemptCreateRoom(retried) {
  const player = deviceSelectedPlayer();
  if (!player) return alert("Select a player first.");
  try {
    const response = await api("/api/room/create", { game_id: selectedGameId, player, owner_token: await ensureOwnerToken(player.id) });
    hostInviteStatus = null;
    activeGameRoom = response.room;
    setRoom(response.room);
    renderGames();
    refreshGameRooms();
    showScreen("game");
    playRoomCreated();
  } catch (error) {
    // A stale token for a player the Sogo admin just unlocked — drop it and
    // re-claim once (an unclaimed player re-claims with no passcode), then retry.
    if (!retried && isUnclaimedError(error)) {
      delete playerOwnerTokens[player.id];
      savePlayerOwnerTokens();
      return attemptCreateRoom(true);
    }
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
      await api("/api/room/leave", { code: roomToClose.code, player_id: exitingPlayerId, requester_id: exitingPlayerId, owner_token: await ensureOwnerToken(exitingPlayerId) });
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

async function closeCurrentRoomAsSuperuser() {
  if (!currentRoom) return;
  await closeRoomAsSuperuser(currentRoom.code);
}

async function closeRoomAsSuperuser(code) {
  const player = deviceSelectedPlayer();
  if (!player || !isSogoSuperuser(player)) return;
  const passcode = await ensureSogoSuperuserPasscode(player);
  if (!passcode) return;
  const confirmed = await confirmAction("Close room?", `Close room ${code} for everyone?`);
  if (!confirmed) return;
  try {
    await api("/api/room/close", { code, requester_id: player.id, passcode, owner_token: await ensureOwnerToken(player.id) });
    if (currentRoom && currentRoom.code === code) {
      restoreLocalGameHomePlayer(currentRoom);
      forgetLocalGameHomePlayer(currentRoom);
      hostInviteStatus = null;
      currentRoom = null;
      activeGameRoom = null;
      lastRenderedRoomKey = "";
      hideWinOverlay();
      stopRoomLiveUpdates();
      showScreen("gameSelected");
    }
    refreshGameRooms();
  } catch (error) {
    if (String(error.message || "").toLowerCase().includes("passcode")) clearSogoSuperuserPasscode();
    alert(error.message);
  }
}

async function resetGame() {
  if (!currentRoom) return;
  const completed = isCompletedRoom(currentRoom);
  // Agreement is only sought when more than one human is seated; bots auto-agree
  // and a solo game resets instantly, so don't claim "the other player must
  // agree" when there is no other player to ask.
  const needsAgreement = (currentRoom.players || []).filter((seat) => !isBotPlayer(seat)).length > 1;
  const message = completed
    ? (needsAgreement
      ? "Request a new game with these same players? The other players must agree."
      : "Start a new game with the same players?")
    : (needsAgreement
      ? "Request a board reset? The other players must agree."
      : "Reset the board and start over?");
  const confirmed = await confirmAction("Are you sure?", message);
  if (!confirmed) return;
  const player =
    currentRoom.players.find((seat) => seat.id === selectedPlayerId || seat.id === deviceSelectedPlayerId)
    || currentRoom.players.find((seat) => seat.id === currentRoom.host_id)
    || currentRoom.players[0]
    || selectedPlayer();
  if (!player) {
    alert("Select your player first.");
    return;
  }
  hideWinOverlay();
  resetWinCelebration();
  lastRenderedRoomKey = "";
  const response = await api("/api/room/reset", { code: currentRoom.code, requester_id: player.id, owner_token: await ensureOwnerToken(player.id) });
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
      owner_token: await ensureOwnerToken(player.id),
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
      owner_token: await ensureOwnerToken(player.id),
      action,
    });
    pendingMove = null;
    // Don't clear reveals here: setRoom enqueues the fresh ones from the event
    // diff, and a live WebSocket broadcast may already be playing this move's
    // reveal before this response resolves.
    if (action.type === "place_fleet" || action.type === "auto_place") {
      const selectedSeatAfterMove = currentRoom.players.find((seat) => seat.id === player.id);
      clearBattleshipDraft(currentRoom.code, selectedSeatAfterMove && selectedSeatAfterMove.mark);
    }
    setRoom(response.room);
  } catch (error) {
    pendingMove = null;
    clearBattleshipReveals();
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
      owner_token: await ensureOwnerToken(player.id),
      action,
    });
    resetQuoridorDraft();
    pendingMove = null;
    setRoom(response.room);
  } catch (error) {
    pendingMove = null;
    renderGame();
    showTurnStatus(null, error.message);
    playInvalidMove();
  }
}

async function makeTenThousandAction(action) {
  const player = selectedPlayer();
  if (!player || !currentRoom || !isTenThousandGameState(currentRoom.game) || pendingMove) return;
  const selectedSeat = currentRoom.players.find((seat) => seat.id === player.id);
  // Simultaneous play: any seated player may act on their own sub-game while it
  // is unresolved. The server is authoritative; no shared current_player.
  if (!selectedSeat) return;
  const seatState = (currentRoom.game.players || []).find((seat) => seat.mark === selectedSeat.mark);
  // A resolved seat may still roll once the round is complete, to start the next round.
  const rollingNextRound = action && action.type === "roll" && currentRoom.game.round_pending_advance;
  if (seatState && seatState.resolved && !rollingNextRound) return;
  playClick();
  pendingMove = {
    key: moveIntentKey(currentRoom, player.id, null, null, JSON.stringify(action)),
    roomCode: currentRoom.code,
    moveCount: currentRoom.game.move_count,
  };
  // Deliberately do NOT re-render here. Re-rendering mid-request snaps the tray
  // back to the pre-commit seat (selection highlight cleared, projected "This
  // turn" dropped to the banked-so-far base) and then jumps again when the
  // server answers, which reads as a glitchy flicker. The pendingMove guard
  // above already blocks double submits, so let the optimistic dice/score the
  // player just set rest until the authoritative snapshot arrives.
  try {
    const response = await api("/api/room/move", {
      code: currentRoom.code,
      player_id: player.id,
      owner_token: await ensureOwnerToken(player.id),
      action,
    });
    pendingMove = null;
    setRoom(response.room);
  } catch (error) {
    pendingMove = null;
    // A stored owner token that the server no longer accepts means this player
    // was reclaimed on another device. Drop the dead token and offer the
    // passcode takeover, then replay the action so the button isn't left inert.
    if (isStaleOwnerTokenError(error)) {
      delete playerOwnerTokens[player.id];
      savePlayerOwnerTokens();
      const token = await reclaimOwnerToken(player.id).catch(() => null);
      if (token) {
        makeTenThousandAction(action);
        return;
      }
    }
    renderGame();
    showTurnStatus(null, error.message);
    playInvalidMove();
  }
}

async function startTenThousandGame(openingMinimum) {
  if (!currentRoom || currentRoom.started) return;
  try {
    const response = await api("/api/room/start", {
      code: currentRoom.code,
      host_id: currentRoom.host_id,
      owner_token: await ensureOwnerToken(currentRoom.host_id),
      ...(Number.isFinite(openingMinimum) ? { opening_minimum: openingMinimum } : {}),
    });
    setRoom(response.room);
    playConfirm();
  } catch (error) {
    alert(error.message);
  }
}

// Game-Locked Yahtzee: the local player runs their own game on-device and posts
// only committed category scores; any unfinished seat may score anytime.
async function makeYahtzeeAction(action) {
  const player = selectedPlayer();
  if (!player || !currentRoom || !isYahtzeeGameState(currentRoom.game) || pendingMove) return;
  pendingMove = {
    key: moveIntentKey(currentRoom, player.id, null, null, JSON.stringify(action)),
    roomCode: currentRoom.code,
    moveCount: currentRoom.game.move_count,
  };
  try {
    const response = await api("/api/room/move", {
      code: currentRoom.code,
      player_id: player.id,
      owner_token: await ensureOwnerToken(player.id),
      action,
    });
    pendingMove = null;
    setRoom(response.room);
  } catch (error) {
    pendingMove = null;
    showTurnStatus(null, error.message);
  }
}

async function startYahtzeeGame() {
  if (!currentRoom || currentRoom.started) return;
  try {
    const response = await api("/api/room/start", {
      code: currentRoom.code,
      host_id: currentRoom.host_id,
      owner_token: await ensureOwnerToken(currentRoom.host_id),
    });
    setRoom(response.room);
    playConfirm();
  } catch (error) {
    alert(error.message);
  }
}

// A reveal plays in up to three phases: an optional "settle" pause (so the
// board can switch to the defending view), a radar scan, then the hit/miss
// result. Reveals are queued so a player's own offence reveal and the incoming
// defence reveal play back to back instead of clobbering each other.
function enqueueBattleshipReveals(reveals) {
  if (!reveals.length) return;
  battleshipRevealQueue.push(...reveals);
  if (!battleshipResultReveal) advanceBattleshipRevealQueue();
}

function advanceBattleshipRevealQueue() {
  const next = battleshipRevealQueue.shift();
  if (!next) {
    renderGame();
    return;
  }
  showBattleshipResultReveal(next);
}

function showBattleshipResultReveal(reveal) {
  const settleMs = Math.max(0, Number(reveal.settleMs || 0));
  const now = Date.now();
  const radarStart = now + settleMs;
  const radarUntil = radarStart + BATTLESHIP_RADAR_MS;
  const active = {
    ...reveal,
    pendingUntil: settleMs ? radarStart : 0,
    radarUntil,
    until: radarUntil + BATTLESHIP_RESULT_MS,
  };
  battleshipResultReveal = active;
  window.clearTimeout(battleshipResultTimer);
  // Repaint when the radar scan begins (after the settle pause)...
  if (settleMs) {
    window.setTimeout(() => {
      if (battleshipResultReveal === active) renderGame();
    }, settleMs);
  }
  // ...play the hit/miss cue and repaint when the scan resolves...
  window.setTimeout(() => {
    if (battleshipResultReveal !== active) return;
    if (active.hit) playBattleshipHit();
    else playBattleshipMiss();
    renderGame();
  }, radarUntil - now);
  // ...then clear and move on to the next queued reveal.
  battleshipResultTimer = window.setTimeout(() => {
    if (battleshipResultReveal !== active) return;
    battleshipResultReveal = null;
    advanceBattleshipRevealQueue();
  }, active.until - now);
  renderGame();
}

function clearBattleshipReveals() {
  battleshipRevealQueue = [];
  battleshipResultReveal = null;
  window.clearTimeout(battleshipResultTimer);
  battleshipResultTimer = null;
}

function setRoom(room) {
  if (isStaleRoomSnapshot(currentRoom, room)) return;
  const previousRoom = currentRoom;
  currentRoom = room;
  clearResolvedPendingMove(room);
  // Farkle is shown inline in the tray (red dice + "You Farkled!" button); no popup.
  const roomKey = roomRenderKey(room);
  if (roomKey === lastRenderedRoomKey) return;
  lastRenderedRoomKey = roomKey;
  syncHostInviteStatusFromRoom(room);
  syncSelectedPlayerForLocalRoom();
  playRoomStateSounds(previousRoom, room);
  showBattleshipAttackReveal(previousRoom, room);
  maybeAutoAckTenThousandFarkle(room);
  document.getElementById("roomTitle").textContent = gameName(room.game_id);
  renderRoomSlots();
  renderGame();
  handleIncomingResetRequest();
}

// After the local player declares a farkle (the Red X), the server marks the
// seat "farkled_pending_ack" and the tray shows the red dice + "You Farkled"
// banner. Hold that for TEN_THOUSAND_FARKLE_ACK_MS, then auto-acknowledge so the
// round can advance — the player already chose to bust, so no extra tap.
function maybeAutoAckTenThousandFarkle(room) {
  if (!room || !isTenThousandGameState(room.game)) return;
  const localSeat = localRoomSeat(room);
  if (!localSeat) return;
  const seatState = (room.game.players || []).find((seat) => seat.mark === localSeat.mark);
  if (!seatState || seatState.finish_state !== "farkled_pending_ack") return;
  const key = `${room.code}:${localSeat.mark}:${room.game.move_count}`;
  if (key === tenThousandFarkleAckKey) return;
  tenThousandFarkleAckKey = key;
  if (tenThousandFarkleAckTimer) clearTimeout(tenThousandFarkleAckTimer);
  tenThousandFarkleAckTimer = setTimeout(() => {
    tenThousandFarkleAckTimer = null;
    // Only acknowledge if the bust is still pending (the player may have already
    // tapped through, or the room may have moved on).
    if (!currentRoom || !isTenThousandGameState(currentRoom.game)) return;
    const seat = localRoomSeat(currentRoom);
    const state = seat && (currentRoom.game.players || []).find((entry) => entry.mark === seat.mark);
    if (state && state.finish_state === "farkled_pending_ack") makeTenThousandAction({ type: "ack_farkle" });
  }, TEN_THOUSAND_FARKLE_ACK_MS);
}

function maybeShowTenThousandFarklePrompt(previousRoom, room) {
  if (!room || !isTenThousandGameState(room.game)) return;
  const localSeat = localRoomSeat(room);
  if (!localSeat) return;
  const seatState = (room.game.players || []).find((seat) => seat.mark === localSeat.mark);
  if (!seatState || seatState.phase !== "farkled") return;
  const previousSeatState = previousRoom && previousRoom.code === room.code
    ? (previousRoom.game && previousRoom.game.players || []).find((seat) => seat.mark === localSeat.mark)
    : null;
  if (previousSeatState && previousSeatState.phase === "farkled") return;
  const lastMove = room.game.last_move || {};
  if (lastMove.type !== "farkle" || lastMove.mark !== localSeat.mark) return;
  const moveCount = Number(room.game.move_count || 0);
  const nextKey = `${room.code}:${localSeat.mark}:${moveCount}`;
  if (nextKey === lastTenThousandFarkleNoticeKey) return;
  lastTenThousandFarkleNoticeKey = nextKey;
  showInfoPrompt("You Farkled!", "Your turn score is lost. Tap OK to continue.")
    .then(async (confirmed) => {
      if (!confirmed) return;
      await makeTenThousandAction({ type: "ack_farkle" });
    });
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
  playTenThousandEventSound(previousRoom, room);
  playGameOverSound(previousRoom, room);
}

// 10,000 has no shared current_player, so the turn-change sound never fires.
// Drive its audio off last_move instead: dice tumble on a roll/reroll, a blip
// when scoring dice are set aside, a cash-in on bank, and a bust when the player
// declares their farkle (the red dice appear at the same moment).
// The seat this device is actually playing. Prefer deviceSelectedPlayerId
// (per-tab sessionStorage) over the shared selectedPlayerId (localStorage), so
// two browser tabs — or any device where the two diverge — each resolve to their
// OWN seat. A loose `a || b` match could land on the host's seat and leak its
// SFX / view to a guest.
function localRoomSeat(room) {
  if (!room || !Array.isArray(room.players)) return null;
  return room.players.find((player) => player.id === deviceSelectedPlayerId && player.mark)
    || room.players.find((player) => player.id === selectedPlayerId && player.mark)
    || null;
}

function playTenThousandEventSound(previousRoom, room) {
  if (!isTenThousandGameState(room.game)) return;
  const move = room.game.last_move;
  if (!move || !move.type) return;
  // Parallel play broadcasts every seat's move to every device. Only voice this
  // device's own seat, so an opponent's roll/bank/farkle doesn't fire SFX here.
  const localSeat = localRoomSeat(room);
  if (!localSeat || !localSeat.mark || move.mark !== localSeat.mark) return;
  const soundKey = `${room.code}:${move.move_count}:${move.type}:${move.mark || ""}`;
  if (soundKey === lastTenThousandSoundKey) return;
  lastTenThousandSoundKey = soundKey;
  if (move.type === "roll" || move.type === "reroll") playDiceRoll();
  else if (move.type === "select") playScorePick();
  else if (move.type === "bank") playBank();
  else if (move.type === "farkle") playFarkle();
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

// Reveal every attack that landed since the last snapshot, in order. A bot
// game folds the human's shot and the bot's reply into one snapshot, so the
// diff (not last_move, which is always the bot's) is what surfaces the
// player's own offence reveal alongside the incoming defence reveal.
function showBattleshipAttackReveal(previousRoom, room) {
  if (!isBattleshipGameState(room.game)) return;
  if (!previousRoom || !previousRoom.game || previousRoom.code !== room.code) return;
  const selectedSeat = battleshipViewerSeat(room);
  if (!selectedSeat) return;
  // Detect new attacks by content, not array index. The Worker caps game.events
  // to a sliding window (slice(-40)), so once a long game fills it the length
  // stops growing and an index diff would miss every later attack — that's why
  // reveals "stopped after a while". Cells are unique per player, so key on those.
  const attackKey = (move) => `${move.player}:${move.row}:${move.col}`;
  const seenAttacks = new Set(
    (Array.isArray(previousRoom.game.events) ? previousRoom.game.events : [])
      .filter((move) => move && move.type === "attack")
      .map(attackKey),
  );
  const events = Array.isArray(room.game.events) ? room.game.events : [];
  const newAttacks = events.filter((move) => move && move.type === "attack" && !seenAttacks.has(attackKey(move)));
  const reveals = [];
  const sunkByYou = [];
  for (const move of newAttacks) {
    const ownAttack = move.player === selectedSeat.mark;
    // The Worker keeps ship_id on a sinking move, so name the ship you just sank.
    if (ownAttack && move.sunk) {
      const ship = (room.game.fleet || []).find((item) => item.id === move.ship_id);
      sunkByYou.push(ship ? ship.name : "ship");
    }
    const view = ownAttack ? "offence" : "defence";
    if (battleshipViewMode !== "auto" && battleshipViewMode !== view) continue;
    reveals.push({
      code: room.code,
      player: selectedSeat.mark,
      view,
      row: Number(move.row),
      col: Number(move.col),
      hit: Boolean(move.hit),
      sunk: Boolean(move.sunk),
      attackText: randomBattleshipPhrase(BATTLESHIP_ATTACK_PHRASES),
      resultText: randomBattleshipResultPhrase(Boolean(move.hit), Boolean(move.sunk)),
      settleMs: view === "defence" && battleshipViewMode === "auto" ? BATTLESHIP_DEFENCE_SETTLE_MS : 0,
    });
  }
  enqueueBattleshipReveals(reveals);
  for (const shipName of sunkByYou) showInfoPrompt("Battleship", `You sunk my ${shipName}!`);
}

function playGameOverSound(previousRoom, room) {
  if (!room.game || room.game.status === "playing") return;
  if (previousRoom.game && previousRoom.game.status !== "playing") return;
  const soundKey = `${room.code}:${room.game.move_count}:${room.game.status}:${room.game.winner || ""}`;
  if (soundKey === lastGameOverSoundKey) return;
  lastGameOverSoundKey = soundKey;
  const selectedSeat = localRoomSeat(room);
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
      owner_token: await ensureOwnerToken(localPlayer.id),
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
  opponentSlot.parentElement.classList.toggle("hidden", isSoloRoom(currentRoom));
  if (isSoloRoom(currentRoom)) {
    hostInviteStatus = null;
    renderRoomInviteStatus();
    return;
  }
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
  // The Sogo close button belongs only to the pre-game lobby/waiting room, not
  // an active game. Once the room has started, hide it — the superuser can still
  // close the room from the Current Games list. (The room-super-close buttons in
  // that list are unaffected.)
  const superCloseButton = document.getElementById("superCloseRoom");
  if (superCloseButton) superCloseButton.classList.toggle("hidden", !isSogoSuperuserSelected() || currentRoom.started);
  document.getElementById("gamePlayersPanel").classList.toggle("hidden", currentRoom.started);
  setGameBoardVisible(true);
  syncBattleshipReviewMark(game);
  renderGamePlayerSwitch();
  if (isBattleshipGameState(game)) {
    renderBattleshipGame({
      room: currentRoom,
      pendingMove,
      viewMode: battleshipViewMode,
      setViewMode: (mode) => { battleshipViewMode = mode; },
      reviewMark: battleshipReviewMark,
      setReviewMark: (mark) => { battleshipReviewMark = mark; },
      viewerSeat: battleshipViewerSeat,
      visiblePlayer: battleshipVisiblePlayer,
      activeReveal: activeBattleshipResultReveal,
      makeAction: makeBattleshipAction,
      clearReveals: clearBattleshipReveals,
      rerender: renderGame,
      showTurnStatus,
      setTurnStatusText,
      setTurnColorVariables,
      scheduleWinOverlay,
      isHexColor,
      mixColorWithWhite,
      colorWithAlpha,
    });
    return;
  }
  if (isQuoridorGameState(game)) {
    renderQuoridorGame({
      game,
      room: currentRoom,
      selectedPlayerId,
      pendingMove,
      canRoomSeatMove,
      setTurnColorVariables,
      safePlayerColor,
      escapeHtml,
      avatarHtml,
      showTurnStatus,
      scheduleWinOverlay,
      makeAction: makeQuoridorAction,
      rerender: renderGame,
    });
    return;
  }
  if (isTenThousandGameState(game)) {
    document.getElementById("gamePlayersPanel").classList.add("hidden");
    showTurnStatus(null, `Round ${game.round}`);
    const localSeat = localRoomSeat(currentRoom);
    renderTenThousandGame({
      host: document.getElementById("macroBoard"),
      game,
      room: currentRoom,
      started: currentRoom.started,
      isHost: currentRoom.host_id === deviceSelectedPlayerId,
      localPlayerId: localSeat ? localSeat.id : (selectedPlayerId || deviceSelectedPlayerId),
      pendingMove,
      makeMove: makeTenThousandAction,
      startGame: startTenThousandGame,
      addBot: openBotOpponentModal,
      invitePlayer: openInvitePlayerModal,
      escapeHtml,
      actionLabels: actionLabelStyle(),
    });
    return;
  }
  if (isYahtzeeGameState(game)) {
    document.getElementById("gamePlayersPanel").classList.add("hidden");
    const localSeat = localRoomSeat(currentRoom);
    renderYahtzeeGame({
      host: document.getElementById("macroBoard"),
      game,
      room: currentRoom,
      started: currentRoom.started,
      isHost: currentRoom.host_id === deviceSelectedPlayerId,
      localPlayerId: localSeat ? localSeat.id : (selectedPlayerId || deviceSelectedPlayerId),
      pendingMove,
      makeMove: makeYahtzeeAction,
      startGame: startYahtzeeGame,
      addBot: openBotOpponentModal,
      invitePlayer: openInvitePlayerModal,
      escapeHtml,
    });
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
    renderBoxesGame({
      host: document.getElementById("macroBoard"),
      game,
      room: currentRoom,
      selectedPlayerId,
      pendingMove,
      canRoomSeatMove,
      setTurnColorVariables,
      safePlayerColor,
      escapeHtml,
      avatarHtml,
      moveIntentKey,
      makeMove,
    });
    return;
  }

  const macroBoard = document.getElementById("macroBoard");
  macroBoard.className = "macro-board";
  lastLegalBoardsKey = renderSuperTicTacToeBoard({
    host: macroBoard,
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
  const selectedSeat = battleshipViewerSeat(currentRoom);
  const currentReviewSeat = currentRoom.players.find((player) => player.mark === battleshipReviewMark);
  if (currentReviewSeat) return;
  battleshipReviewMark = selectedSeat && selectedSeat.mark || (currentRoom.players.find((player) => player.mark) || {}).mark || "";
}

function isCompletedRoom(room) {
  return Boolean(room && (room.status === "completed" || ["x_won", "o_won", "draw"].includes(room.game.status)));
}


function battleshipViewerSeat(room) {
  if (!room || !Array.isArray(room.players)) return null;
  return room.players.find((player) => player.id === deviceSelectedPlayerId && player.mark)
    || room.players.find((player) => player.id === selectedPlayerId && player.mark)
    || null;
}

function battleshipVisiblePlayer(activeView, reveal, selectedSeat, opponent, currentTurnPlayer) {
  if (reveal && reveal.view === "offence") return selectedSeat;
  if (reveal && reveal.view === "defence") return selectedSeat;
  if (activeView === "offence") return selectedSeat || currentTurnPlayer;
  if (activeView === "defence") return selectedSeat || currentTurnPlayer;
  return currentTurnPlayer || selectedSeat;
}


function randomBattleshipPhrase(phrases) {
  return phrases[Math.floor(Math.random() * phrases.length)] || "";
}

function randomBattleshipResultPhrase(hit, sunk) {
  if (sunk) return randomBattleshipPhrase(BATTLESHIP_SUNK_PHRASES);
  return randomBattleshipPhrase(hit ? BATTLESHIP_HIT_PHRASES : BATTLESHIP_MISS_PHRASES);
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
  if (isTenThousandGameState(currentRoom.game) || isYahtzeeGameState(currentRoom.game)) {
    host.classList.add("hidden");
    return;
  }
  host.classList.remove("hidden");
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
  const selectedSeat = battleshipViewerSeat(room);
  const opponent = selectedSeat ? room.players.find((player) => player.mark && player.mark !== selectedSeat.mark) : null;
  const currentTurnPlayer = room.players.find((player) => player.mark === room.game.current_player);
  const reveal = activeBattleshipResultReveal(room, selectedSeat);
  const yourTurn = selectedSeat && selectedSeat.mark === room.game.current_player;
  const activeView = reveal && reveal.view
    ? reveal.view
    : battleshipViewMode === "auto" ? (yourTurn ? "offence" : "defence") : battleshipViewMode;
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
  return Boolean(game && (canonicalGameId(game.game_id) === TACTICAL_GAME_ID || Array.isArray(game.pickups)));
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

function isTenThousandGameState(game) {
  return Boolean(game && canonicalGameId(game.game_id) === TEN_THOUSAND_GAME_ID);
}

function isYahtzeeGameState(game) {
  return Boolean(game && canonicalGameId(game.game_id) === YAHTZEE_GAME_ID);
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
  if (message.stats) applyGameStats(message.stats);
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
  const data = await fetchJson(roomReadUrl(currentRoom.code));
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
    const data = await fetchJson(roomReadUrl(currentRoom.code));
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

function roomReadUrl(code) {
  const playerId = selectedPlayerId || deviceSelectedPlayerId || "";
  const query = new URLSearchParams({ code });
  if (playerId) query.set("player_id", playerId);
  return `/api/room?${query.toString()}`;
}

function selectedPlayer() {
  return players.find((player) => player.id === deviceSelectedPlayerId)
    || players.find((player) => player.id === selectedPlayerId)
    || null;
}

function deviceSelectedPlayer() {
  return players.find((player) => player.id === deviceSelectedPlayerId) || null;
}

function isSogoSuperuserSelected() {
  return isSogoSuperuser(deviceSelectedPlayer()) && hasSogoSuperuserPasscode();
}

function isSogoSuperuser(player) {
  const name = String(player && player.name || "").trim().toLowerCase();
  return name === "sogo" || name === "mojosogo";
}

async function verifySogoSuperuserPasscode(player) {
  if (hasSogoSuperuserPasscode()) return true;
  const passcode = await promptForPasscode("Enter Sogo passcode");
  if (!passcode) {
    clearSogoSuperuserPasscode();
    return false;
  }
  try {
    await api("/api/superuser/verify", { requester_id: player.id, passcode });
    sessionStorage.setItem(SOGO_SUPERUSER_PASSCODE_KEY, passcode);
    return true;
  } catch (error) {
    clearSogoSuperuserPasscode();
    alert(error.message);
    return false;
  }
}

async function ensureSogoSuperuserPasscode(player) {
  const existing = sessionStorage.getItem(SOGO_SUPERUSER_PASSCODE_KEY) || "";
  if (existing) return existing;
  const verified = await verifySogoSuperuserPasscode(player);
  return verified ? sessionStorage.getItem(SOGO_SUPERUSER_PASSCODE_KEY) || "" : "";
}

function hasSogoSuperuserPasscode() {
  return Boolean(sessionStorage.getItem(SOGO_SUPERUSER_PASSCODE_KEY));
}

function clearSogoSuperuserPasscode() {
  sessionStorage.removeItem(SOGO_SUPERUSER_PASSCODE_KEY);
}

function clearLockedSogoSelection() {
  if (!isSogoSuperuser(deviceSelectedPlayer()) || hasSogoSuperuserPasscode()) return;
  deviceSelectedPlayerId = "";
  if (isSogoSuperuser(players.find((player) => player.id === selectedPlayerId))) selectedPlayerId = "";
}

function setDeviceSelectedPlayer(playerId) {
  const nextPlayer = players.find((player) => player.id === playerId) || null;
  if (!isSogoSuperuser(nextPlayer)) clearSogoSuperuserPasscode();
  const previousPlayerId = deviceSelectedPlayerId;
  deviceSelectedPlayerId = playerId;
  selectedPlayerId = playerId;
  saveSelectedPlayer();
  realtime.sendAppEventSubscription();
  if (currentRoom && previousPlayerId !== deviceSelectedPlayerId) realtime.refreshRoomLiveUpdates();
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
    if (currentRoom) realtime.refreshRoomLiveUpdates();
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

function isCurrentSelectedGame(game) {
  return Boolean(game && selectedGame() && canonicalGameId(game.id) === canonicalGameId(selectedGame().id));
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

function playerCountForGame(game) {
  const count = Number(game && game.player_count);
  if (Number.isFinite(count) && count > 0) return count;
  return Boolean(game && game.host_start) ? Number.POSITIVE_INFINITY : 2;
}

function selectedGameIsSolo() {
  return playerCountForGame(selectedGame()) === 1;
}

function isSoloRoom(room) {
  return Boolean(room && playerCountForGame(games.find((game) => game.id === canonicalGameId(room.game_id))) === 1);
}

function gameAvailabilityText(game) {
  if (!game) return "Game unavailable.";
  if (game.availability === "ready") return "Ready";
  if (game.availability === "coming_soon") return "Coming soon.";
  return "Game unavailable.";
}

function roomRenderKey(room) {
  if (!room) return "";
  return buildRoomRenderKey(room, canonicalGameId(room.game.game_id));
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
    clearLockedSogoSelection();
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

function saveLocalGameHomePlayers() {
  localStorage.setItem(LOCAL_GAME_HOME_PLAYERS_KEY, JSON.stringify(localGameHomePlayers));
}

function savePlayerOwnerTokens() {
  localStorage.setItem(PLAYER_OWNER_TOKEN_STORAGE_KEY, JSON.stringify(playerOwnerTokens));
}

function rememberOwnerToken(playerId, ownerToken) {
  if (!playerId || !ownerToken) return;
  playerOwnerTokens[playerId] = ownerToken;
  savePlayerOwnerTokens();
}

async function ensureOwnerToken(playerId) {
  const id = String(playerId || "").trim();
  if (!id) throw new Error("Player id is required.");
  if (playerOwnerTokens[id]) return playerOwnerTokens[id];
  try {
    const response = await api("/api/player/claim", { player_id: id });
    rememberOwnerToken(id, response.owner_token);
    return response.owner_token;
  } catch (error) {
    // The player is claimed elsewhere (or this device lost its token). Offer to
    // move them here — no passcode for regular players, only the Sogo admin.
    if (isAlreadyClaimedError(error)) return movePlayerHere(id);
    throw error;
  }
}

// Offer to move a player claimed on another device (or whose token this device
// lost) to this device. Regular players bind with no passcode (the family trusts
// each other); only the Sogo admin account still requires the passcode.
async function movePlayerHere(id) {
  const name = playerDisplayName(id);
  const move = await confirmAction(`Move ${name} to this device?`, `${name} is in use on another device. Bind ${name} here so you can play as them?`);
  if (!move) throw new Error(`${name} stays on the other device.`);
  try {
    const response = await api("/api/player/reclaim", { player_id: id });
    rememberOwnerToken(id, response.owner_token);
    return response.owner_token;
  } catch (reclaimErr) {
    // The server still requires the passcode — the Sogo admin account.
    const token = await reclaimOwnerToken(id);
    if (token) return token;
    throw reclaimErr;
  }
}

function isAlreadyClaimedError(error) {
  return String(error && error.message || "").toLowerCase().includes("already claimed");
}

// True when an action was rejected because the player has no owner token on the
// server at all (unclaimed) — e.g. the Sogo admin unlocked it. Any token stored on
// this device is stale; drop it and re-claim (no passcode needed for an unclaimed
// player, so this works from any device after an unlock).
function isUnclaimedError(error) {
  return String(error && error.message || "").toLowerCase().includes("must be claimed");
}

// True when an action was rejected because this device's owner token for the
// player no longer matches the server — e.g. the player was reclaimed on a
// different device, invalidating the token stored here.
function isStaleOwnerTokenError(error) {
  return String(error && error.message || "").toLowerCase().includes("owner token is incorrect");
}

function playerDisplayName(playerId) {
  const seat = (players || []).find((item) => item.id === playerId);
  return seat && seat.name ? seat.name : "This player";
}

// Passcode-gated takeover for a player claimed on another device. Prompts for
// the shared Sogo passcode, then mints a fresh owner token for this device
// (invalidating the other device's). Returns the token, or null if cancelled.
async function reclaimOwnerToken(playerId) {
  const passcode = await promptForPasscode(`Sogo passcode to use ${playerDisplayName(playerId)} here`);
  if (!passcode) return null;
  const response = await api("/api/player/reclaim", { player_id: playerId, passcode });
  rememberOwnerToken(playerId, response.owner_token);
  return response.owner_token;
}

function saveSelectedPlayer() {
  sessionStorage.setItem("sogotable.deviceSelectedPlayerId", deviceSelectedPlayerId);
  localStorage.setItem("sogotable.selectedPlayerId", deviceSelectedPlayerId);
  localStorage.setItem("sogotable.deviceSelectionHash", deviceSelectionHash);
}

function showRosterError(message) {
  const host = document.getElementById("playerList");
  host.innerHTML = `<p>${escapeHtml(message)}</p>`;
}

function saveSelectedGame() {
  localStorage.setItem("sogotable.selectedGameId", selectedGameId);
}

