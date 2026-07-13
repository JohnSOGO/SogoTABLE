import { api, fetchJson, isAlreadyClaimedError, isUnclaimedError, isStaleOwnerTokenError, setOwnerTokenHealer } from "./api-client.js";
import { wireHouses, renderHouseControls, renderPlayerPicker, buildPlayerCard, resetPlayerPicker } from "./controllers/houses.js";
import {
  colorWithAlpha,
  getContrastAwareTextColor,
  isHexColor,
  mixColorWithWhite,
} from "./color-utils.js";
import { avatarHtml, escapeHtml } from "./html-utils.js";
import {
  wireAppearancePicker,
  renderAppearanceChoices,
  getSelectedAppearance,
  resetAppearance,
  setAppearanceFrom,
} from "./controllers/player-appearance.js";
import { createRealtimeController } from "./realtime.js";
import { GAME_REGISTRY, GAME_IDS } from "./games/registry.js";
import { createGameKinds } from "./games/game-kinds.js";
import { renderGameList } from "./games/game-list-view.js";
import { buildRoomRenderKey } from "./games/render-keys.js";
import { renderBoxesGame } from "./games/boxes/client.js";
import { renderQuoridorGame, resetQuoridorDraft } from "./games/quoridor/client.js";
import { renderBattleshipGame, clearBattleshipDraft } from "./games/battleship/client.js";
import { randomBattleshipAttackPhrase, randomBattleshipResultPhrase } from "./games/battleship/phrases.js";
import { confirmAction, showInfoPrompt, promptForPasscode, wirePromptControls } from "./controllers/prompts.js";
import { wireGameOptions } from "./controllers/game-options.js";
import { refreshGameStats, renderGameStatsLink, applyGameStats, resetGameStatsKey, wireGameStats } from "./controllers/game-stats.js";
import { scheduleWinOverlay, hideWinOverlay, wireWinOverlay, resetWinCelebration } from "./controllers/win-overlay.js";
import { downloadReviewZip } from "./review-export.js";
import {
  wireSuperuser,
  isSogoSuperuser,
  isSogoSuperuserSelected,
  verifySogoSuperuserPasscode,
  ensureSogoSuperuserPasscode,
  hasSogoSuperuserPasscode,
  forgetSogoAdmin,
} from "./controllers/superuser.js";
import {
  wireLocalSeat,
  isLocalModeRoom,
  localGameHomePlayerId,
  forgetLocalGameHomePlayer,
} from "./controllers/local-seat.js";
import { wireRoomSounds, playRoomStateSounds } from "./controllers/room-sounds.js";
import {
  initSessionStore,
  getSelectedPlayerId,
  setSelectedPlayerId,
  getDeviceSelectedPlayerId,
  setDeviceSelectedPlayerId,
  getDeviceSelectionHash,
  saveDeviceIdentity,
} from "./client/session-store.js";
import {
  wireInvites,
  openInvitePlayerModal,
  openBotOpponentModal,
  openLocalOpponentModal,
  closeInvitePlayerModal,
  closeInvitePlayerModalOnBackdrop,
  refreshPendingInvites,
  showInvitePrompt,
  respondToInvite,
} from "./controllers/invites.js";
import {
  forgetSogoSuperuserPasscode,
  PLAYER_OWNER_TOKEN_STORAGE_KEY,
  loadPlayerOwnerTokens,
  actionLabelStyle,
  setActionLabelStyle,
  purgeDeprecatedLocalRoster,
  migrateStorageNamespace,
} from "./storage.js";
import { wireLobby, renderRoomSlots, renderRoomInviteStatus } from "./games/lobby.js";
import { renderSuperTicTacToeBoard } from "./games/super-tic-tac-toe/render.js";
import { renderTenThousandGame } from "./games/ten-thousand/render.js";
import { wireTenThousandFarkleAck, maybeAutoAckTenThousandFarkle } from "./games/ten-thousand/farkle-ack.js";
import { renderZombieDiceGame } from "./games/zombie-dice/render.js";
import { renderLiarsDiceGame } from "./games/liars-dice/render.js";
import { renderNoThanksGame } from "./games/no-thanks/render.js";
import { renderHeartsGame } from "./games/hearts/render.js";
import { renderYahtzeeGame } from "./games/yahtzee/render.js";
import { renderMazewrightGame } from "./games/mazewright/render.js";
import { renderRttaGame } from "./games/rtta/render.js";
import { renderPotionLabGame } from "./games/potion-lab/render.js";
import { renderMysticWoodGame } from "./games/mystic-wood/render.js";
import {
  isSoundEnabled,
  soundVolumeLevel,
  setSoundEnabled,
  setSoundVolumeLevel,
  playBattleshipHit,
  playBattleshipMiss,
  playClick,
  playConfirm,
  playInvalidMove,
  playRoomCreated,
  toggleSound,
  unlockAudio,
} from "./sound.js";

const CLASSIC_GAME_ID = GAME_IDS.classic;
// Shown only when the games fetch fails; the registry is the single source of
// truth shared with the Worker (see games/registry.js).
const fallbackGames = GAME_REGISTRY;
let games = [...fallbackGames];

// Game-kind predicates live in the pure games/game-kinds.js leaf; wire them
// with the shell's `canonicalGameId` (hoisted below) so alias resolution keeps
// tracking the live games list.
const {
  isTacticalGameState,
  isBoxesGameState,
  isBattleshipGameState,
  isQuoridorGameState,
  isTenThousandGameState,
  isYahtzeeGameState,
  isMazewrightGameState, isRttaGameState, isZombieDiceGameState, isLiarsDiceGameState, isNoThanksGameState, isHeartsGameState, isPotionLabGameState, isMysticWoodGameState,
} = createGameKinds(canonicalGameId);

migrateStorageNamespace();
initSessionStore(); // device identity now lives in client/session-store.js

let players = [];
let selectedGameId = localStorage.getItem("sogotable.selectedGameId") || games[0].id;
selectedGameId = canonicalGameId(selectedGameId);
let editingPlayerId = "";
let playerModalMode = "select";
let currentRoom = null;
let hostInviteStatus = null;
let activeGameRoom = null;
let currentGameRooms = [];
let lobbyPlayers = [];
let selectedPlayerStats = [];
let playerStatsCollapsed = true;
let playerStatsCollapsePlayerId = "";
let lastLobbyPlayersKey = "";
let lastCurrentGameRoomsKey = "";
let lastActiveGameNoticeKey = "";
let lastSelectedPlayerStatsKey = "";
let selectedPlayerStatsRequestId = 0;
let playerApiAvailable = true;
let lastLegalBoardsKey = "";
let battleshipViewMode = "auto";
let battleshipResultReveal = null;
let battleshipResultTimer = null;
let battleshipRevealQueue = [];
let battleshipReviewMark = "";
let lastRenderedRoomKey = "";
let pendingMove = null;
const BATTLESHIP_RADAR_MS = 1000;          // radar scan before the hit/miss lands
const BATTLESHIP_RESULT_MS = 2000;         // how long the hit/miss stays up
const BATTLESHIP_DEFENCE_SETTLE_MS = 250;  // let the defence board settle before an incoming reveal
let playerOwnerTokens = loadPlayerOwnerTokens(); setOwnerTokenHealer((pid) => { delete playerOwnerTokens[pid]; savePlayerOwnerTokens(); return ensureOwnerToken(pid); });
let handledResetRequestKey = "";
let selectedGameEntryRequestId = 0;
const realtime = createRealtimeController({
  getAppSubscription: () => ({
    gameId: selectedGame().id,
    playerId: getDeviceSelectedPlayerId(),
  }),
  getRoomPlayerId: () => getDeviceSelectedPlayerId() || getSelectedPlayerId() || "",
  onAppMessage: handleAppEventMessage,
  onRoomMessage: handleRoomSocketMessage,
  onRoomReconnect: () => showTurnStatus(null, "Reconnecting to table..."),
  refreshRoom,
  shouldReconnectRoom: () => Boolean(currentRoom),
  shouldPollRoom: () => { const seat = currentRoom && localRoomSeat(currentRoom); return Boolean(seat && currentRoom.started && !isSoloRoom(currentRoom) && currentRoom.game && currentRoom.game.status === "playing" && seat.mark !== currentRoom.game.current_player); },
});

document.addEventListener("DOMContentLoaded", () => {
  wireSuperuser({ deviceSelectedPlayer, renderAdminActions: renderIntroAdminActions, renderPlayers });
  wireLocalSeat();
  wireLobby({
    getCurrentRoom: () => currentRoom,
    getHostInviteStatus: () => hostInviteStatus,
    setHostInviteStatus: (value) => { hostInviteStatus = value; },
    isSoloRoom,
    getDeviceSelectedPlayerId,
    openLocalOpponentModal,
    openInvitePlayerModal,
    openBotOpponentModal,
  });
  wireRoomSounds({ localRoomSeat, isTenThousandGameState, isTacticalGameState, isBoxesGameState, isBotPlayer });
  wireTenThousandFarkleAck({ isTenThousandGameState, localRoomSeat, getCurrentRoom: () => currentRoom, makeTenThousandAction });
  wireInvites({
    getCurrentRoom: () => currentRoom,
    getPlayers: () => players,
    getLobbyPlayers: () => lobbyPlayers,
    getCurrentGameRooms: () => currentGameRooms,
    setSelectedGameId: (id) => { selectedGameId = id; },
    setHostInviteStatus: (value) => { hostInviteStatus = value; },
    setActiveGameRoom: (value) => { activeGameRoom = value; },
    refreshLobbyPlayers, refreshGameRooms, selectedGame, ensureOwnerToken, setRoom,
    renderRoomInviteStatus, deviceSelectedPlayer, gameName, canonicalGameId,
    saveSelectedGame, renderGames, renderGameSelected, showScreen,
  });
  purgeDeprecatedLocalRoster();
  registerServiceWorker();
  refreshRevisionSummary();
  document.documentElement.classList.toggle("is-mac", /Mac|iP(hone|ad|od)/i.test(navigator.platform || navigator.userAgent || ""));
  bindNavigation();
  bindSoundControls();
  bindTouchZoomGuard();
  refreshGameDefinitions();
  renderGames();
  renderAppearanceChoices();
  refreshPlayers();
  renderSelectedGame();
  renderSelectedPlayer();
  renderCurrentPlayer();
  document.getElementById("playerForm").addEventListener("submit", createPlayer);
  document.getElementById("clearPlayerStats").addEventListener("click", clearEditingPlayerStats);
  wireHouses({
    getPlayers: () => players,
    ensureOwnerToken,
    setPlayers: (next) => { players = next; renderPlayers(); },
    selectPlayer: (id) => { void selectPlayer(id, { closeModal: true }); },
    editPlayer,
    deletePlayer,
    unclaimPlayer: unclaimPlayerAsSuperuser,
    isSuperuserSelected: isSogoSuperuserSelected,
    setPlayerFormVisible,
    rerender: renderPlayers,
  });
  document.getElementById("openEditPlayerModal").addEventListener("click", openSelectedPlayerEditor);
  document.getElementById("openSelectPlayerModal").addEventListener("click", () => openPlayerModal("select"));
  document.getElementById("openCreatePlayerModal").addEventListener("click", () => openPlayerModal("create"));
  document.getElementById("closePlayerModal").addEventListener("click", closePlayerModal);
  document.getElementById("playerModal").addEventListener("click", closePlayerModalOnBackdrop);
  document.getElementById("exportReviewZip").addEventListener("click", exportReviewZip);
  document.getElementById("forgetSogoAdmin").addEventListener("click", forgetSogoAdmin);
  wireAppearancePicker();
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
  if (name === "games") void gateSuperuserOnEntry();
  if (name === "game") startRoomLiveUpdates();
}

// SOGO is remembered/auto-selected like any player; its superuser passcode is
// enforced once on entry (Start Playing). Cancel it and SOGO is deselected.
async function gateSuperuserOnEntry() {
  const player = deviceSelectedPlayer();
  if (!isSogoSuperuser(player) || hasSogoSuperuserPasscode()) return;
  const ok = await ensureSogoSuperuserPasscode(player);
  if (!ok) {
    setDeviceSelectedPlayerId("");
    setSelectedPlayerId("");
    saveSelectedPlayer();
  }
  renderPlayers();
  renderSelectedPlayer();
  renderCurrentPlayer();
  renderGames();
  renderCreateGameButton();
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
  bindRefreshTitleControl("roomTitle", "Refresh table view", refreshCurrentRoomView);
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
    if (left.id === getDeviceSelectedPlayerId()) return -1;
    if (right.id === getDeviceSelectedPlayerId()) return 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
  orderedPlayers.forEach((player) => {
    const row = document.createElement("div");
    row.className = `roster-player ${player.id === getDeviceSelectedPlayerId() ? "selected" : ""}`;
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
    const selectedSeat = room.players.find((player) => player.id === getDeviceSelectedPlayerId());
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
      <button type="button" class="ghost danger room-super-close ${canSuperClose ? "" : "hidden"}" aria-label="Close table ${escapeHtml(room.code)} as Sogo" title="Close table as Sogo">X</button>
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
    : existing ? JSON.stringify({ selectedPlayerId: getDeviceSelectedPlayerId(), room: roomSummarySignature(existing) }) : "hidden";
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
    if (left.id === getDeviceSelectedPlayerId()) return -1;
    if (right.id === getDeviceSelectedPlayerId()) return 1;
    return String(left.name || "").localeCompare(String(right.name || ""), undefined, { sensitivity: "base" });
  });
  return JSON.stringify(orderedPlayers.map((player) => playerSignature(player)));
}

function gameRoomsSignature(rooms) {
  return JSON.stringify({
    selectedPlayerId: getDeviceSelectedPlayerId(),
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
    player_id: player ? player.id : (getDeviceSelectedPlayerId() || ""),
    player_name: player ? player.name : "",
    game_state: captureGameState(),
  };
}

// A bounded JSON snapshot of the live game projection, attached to a bug report so the fix agent
// sees the actual board/seat/pending state + chronicle instead of reasoning blind (Tier 1 capture,
// docs/observability-and-debug.md). Bounded so a long game can't bloat a D1 row: drop the heavy
// board, then trim, before ever exceeding the cap.
function captureGameState() {
  try {
    const g = currentRoom && currentRoom.game;
    if (!g) return "";
    const CAP = 40000;
    let s = JSON.stringify(g);
    if (s.length > CAP) s = JSON.stringify({ ...g, board: "(omitted — snapshot too large)" });
    if (s.length > CAP && Array.isArray(g.log)) s = JSON.stringify({ ...g, board: "(omitted)", log: g.log.slice(-80) });
    return s.length > CAP ? "" : s;   // give up rather than store a truncated, unparseable blob
  } catch (_e) { return ""; }
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

async function createPlayer(event) {
  event.preventDefault();
  const input = document.getElementById("playerName");
  const name = input.value.trim();
  if (!name) return;
  const wasEditing = Boolean(editingPlayerId);
  const appearance = getSelectedAppearance();
  const player = {
    id: editingPlayerId || newOpaquePlayerId(),
    name,
    icon: appearance.icon,
    color: appearance.color,
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
  if (!wasEditing || playerId === getDeviceSelectedPlayerId()) {
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
  if (wasEditing) closePlayerModal(); else editPlayer(playerId);
  return true;
}

function newOpaquePlayerId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function resetPlayerForm(input = document.getElementById("playerName")) {
  editingPlayerId = "";
  if (input) input.value = "";
  resetAppearance();
  setPlayerFormMode("create");
  renderAppearanceChoices();
}

function setPlayerFormMode(mode) {
  const editing = mode === "edit";
  const title = document.getElementById("playerFormTitle");
  const submit = document.getElementById("playerFormSubmit");
  const clearStats = document.getElementById("clearPlayerStats");
  if (title) title.textContent = editing ? "Edit Player" : "Create New Player";
  if (submit) submit.textContent = editing ? "Save Changes" : "Create Player";
  if (clearStats) clearStats.classList.toggle("hidden", !editing);
  renderHouseControls(editing ? players.find((player) => player.id === editingPlayerId) : null);
}

function renderPlayers() {
  const host = document.getElementById("playerList");
  host.innerHTML = "";
  // Edit mode shows just the edited player's (inert) card; every other mode is the
  // House-organised selection picker (owned by the houses controller).
  if (playerModalMode === "edit" && editingPlayerId) {
    const player = players.find((item) => item.id === editingPlayerId);
    if (player) host.appendChild(buildPlayerCard(player, { editing: true }));
    return;
  }
  renderPlayerPicker(host);
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
    if (String(error.message || "").toLowerCase().includes("passcode")) forgetSogoSuperuserPasscode();
    alert(error.message);
  }
}

function editPlayer(playerId) {
  const player = players.find((item) => item.id === playerId);
  if (!player) return;
  playerModalMode = "edit";
  editingPlayerId = player.id;
  document.getElementById("playerName").value = player.name;
  setAppearanceFrom(player);
  setExistingPlayersVisible(true);
  setPlayerFormVisible(true);
  setPlayerFormMode("edit");
  renderAppearanceChoices();
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
    if (player.id === getDeviceSelectedPlayerId()) {
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
  const playerId = getDeviceSelectedPlayerId();
  if (playerId !== playerStatsCollapsePlayerId) { // a freshly selected player starts collapsed
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
  host.innerHTML = `<button type="button" class="player-stats-toggle label" aria-expanded="${!playerStatsCollapsed}">Player Stats</button><div class="player-stats-body${playerStatsCollapsed ? " hidden" : ""}">${body}</div>`;
  const toggleButton = host.querySelector(".player-stats-toggle");
  if (toggleButton) toggleButton.onclick = () => {
    playerStatsCollapsed = !playerStatsCollapsed;
    renderSelectedPlayerStats(message);
  };
}

function renderCurrentPlayer() {
  const host = document.getElementById("currentPlayer");
  const player = deviceSelectedPlayer();
  host.innerHTML = player ? `${avatarHtml(player)}<strong>${escapeHtml(player.name)}</strong>` : "No player selected";
  document.getElementById("openEditPlayerModal").disabled = !player;
  renderIntroAdminActions();
}

function renderIntroAdminActions() {
  const active = isSogoSuperuserSelected();
  const exportButton = document.getElementById("exportReviewZip");
  if (exportButton) exportButton.classList.toggle("hidden", !active);
  const forgetButton = document.getElementById("forgetSogoAdmin");
  if (forgetButton) forgetButton.classList.toggle("hidden", !active);
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
    forgetSogoSuperuserPasscode();
  }
  setDeviceSelectedPlayer(playerId);
  void ensureOwnerToken(playerId).catch(() => {}); // claim on select; House/edit need no separate claim
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
  if (getSelectedPlayerId() === playerId) setSelectedPlayerId("");
  if (getDeviceSelectedPlayerId() === playerId) {
    setDeviceSelectedPlayerId("");
    forgetSogoSuperuserPasscode();
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
  resetPlayerPicker();
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
  resetPlayerPicker();
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
      const exitingPlayerId = getSelectedPlayerId() || getDeviceSelectedPlayerId();
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
  const confirmed = await confirmAction("Close table?", `Close table ${code} for everyone?`);
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
    if (String(error.message || "").toLowerCase().includes("passcode")) forgetSogoSuperuserPasscode();
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
    currentRoom.players.find((seat) => seat.id === getSelectedPlayerId() || seat.id === getDeviceSelectedPlayerId())
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
      line_id: lineId, game_epoch: currentRoom.game_epoch,
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
      action, game_epoch: currentRoom.game_epoch,
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
      action, game_epoch: currentRoom.game_epoch,
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
      action, game_epoch: currentRoom.game_epoch,
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

// Game-Locked move poster — resolves to an error message on failure; RTTA unlatches Submit/Ready on it (#turnStatus is hidden for these games).
async function postRoomAction(action) {
  const player = selectedPlayer();
  if (!player || !currentRoom || !currentRoom.game || pendingMove) return "Not sent — another action is still on its way. Try again.";
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
      action, game_epoch: currentRoom.game_epoch,
    });
    pendingMove = null;
    setRoom(response.room);
  } catch (error) {
    pendingMove = null;
    renderGame();   // BOTH terminal paths must re-render: a game's UI clears its own "working" latch there, so a rejected action left it up forever and the game looked frozen (mrhihqe8/mrhieiyh)
    showTurnStatus(null, error.message);
    return error.message || "The move failed to send. Try again.";
  }
}

// Host-only: uninvite a seated bot from a not-yet-started room (the lobby's
// per-bot ✕). The worker re-packs host-start marks so the next joiner can't
// collide with a surviving higher mark.
async function removeBotFromRoom(botId) {
  if (!currentRoom || currentRoom.started) return;
  try {
    const response = await api("/api/room/remove-bot", {
      code: currentRoom.code,
      host_id: currentRoom.host_id,
      owner_token: await ensureOwnerToken(currentRoom.host_id),
      bot_id: botId,
    });
    setRoom(response.room);
    playConfirm();
  } catch (error) {
    alert(error.message);
  }
}

// Shared host-start poster. `options`, when the game's lobby collects any
// (Hearts' rules picker), spreads into the start payload for the dispatch
// table's applyStartOptions field.
async function startYahtzeeGame(options) {
  if (!currentRoom || currentRoom.started) return;
  try {
    const response = await api("/api/room/start", {
      code: currentRoom.code,
      host_id: currentRoom.host_id,
      owner_token: await ensureOwnerToken(currentRoom.host_id),
      ...(options && typeof options === "object" ? options : {}),
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
  if (currentRoom && room && currentRoom.code === room.code && Number(room.revision) > Number(currentRoom.revision || 0) + 1) console.info(`[sync] recovered ${Number(room.revision) - Number(currentRoom.revision) - 1} missed broadcast(s) — rev ${currentRoom.revision}→${room.revision}`);
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

// The seat this device is actually playing. Prefer deviceSelectedPlayerId
// (per-tab sessionStorage) over the shared selectedPlayerId (localStorage), so
// two browser tabs — or any device where the two diverge — each resolve to their
// OWN seat. A loose `a || b` match could land on the host's seat and leak its
// SFX / view to a guest.
function localRoomSeat(room) {
  if (!room || !Array.isArray(room.players)) return null;
  return room.players.find((player) => player.id === getDeviceSelectedPlayerId() && player.mark)
    || room.players.find((player) => player.id === getSelectedPlayerId() && player.mark)
    || null;
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
      attackText: randomBattleshipAttackPhrase(),
      resultText: randomBattleshipResultPhrase(Boolean(move.hit), Boolean(move.sunk)),
      settleMs: view === "defence" && battleshipViewMode === "auto" ? BATTLESHIP_DEFENCE_SETTLE_MS : 0,
    });
  }
  enqueueBattleshipReveals(reveals);
  for (const shipName of sunkByYou) showInfoPrompt("Battleship", `You sunk my ${shipName}!`);
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

function renderGame() {
  if (!currentRoom) return;
  const game = currentRoom.game;
  const meta = document.getElementById("gameMeta");
  const resetButton = document.getElementById("resetGame");
  meta.textContent = `Table ${currentRoom.code}`;
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
      selectedPlayerId: getSelectedPlayerId(),
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
      isHost: currentRoom.host_id === getDeviceSelectedPlayerId(),
      localPlayerId: localSeat ? localSeat.id : (getSelectedPlayerId() || getDeviceSelectedPlayerId()),
      pendingMove,
      makeMove: makeTenThousandAction,
      startGame: startTenThousandGame,
      addBot: openBotOpponentModal,
      removeBot: removeBotFromRoom,
      invitePlayer: openInvitePlayerModal,
      escapeHtml,
      actionLabels: actionLabelStyle(),
    });
    return;
  }
  if (isYahtzeeGameState(game) || isMazewrightGameState(game) || isRttaGameState(game) || isZombieDiceGameState(game) || isLiarsDiceGameState(game) || isNoThanksGameState(game) || isHeartsGameState(game) || isPotionLabGameState(game) || isMysticWoodGameState(game)) {
    ["gamePlayersPanel", "turnStatus"].forEach((id) => document.getElementById(id).classList.add("hidden"));
    const localSeat = localRoomSeat(currentRoom);
    (isMazewrightGameState(game) ? renderMazewrightGame : isRttaGameState(game) ? renderRttaGame : isZombieDiceGameState(game) ? renderZombieDiceGame : isLiarsDiceGameState(game) ? renderLiarsDiceGame : isNoThanksGameState(game) ? renderNoThanksGame : isHeartsGameState(game) ? renderHeartsGame : isPotionLabGameState(game) ? renderPotionLabGame : isMysticWoodGameState(game) ? renderMysticWoodGame : renderYahtzeeGame)({
      host: document.getElementById("macroBoard"),
      game,
      room: currentRoom,
      started: currentRoom.started,
      isHost: currentRoom.host_id === getDeviceSelectedPlayerId(),
      localPlayerId: localSeat ? localSeat.id : (getSelectedPlayerId() || getDeviceSelectedPlayerId()),
      pendingMove,
      isMovePending: () => Boolean(pendingMove), // live check for renders driven by a game's own timers
      makeMove: postRoomAction,
      startGame: startYahtzeeGame,
      addBot: openBotOpponentModal,
      removeBot: removeBotFromRoom,
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
      selectedPlayerId: getSelectedPlayerId(),
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
    selectedPlayerId: getSelectedPlayerId(),
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
  return room.players.find((player) => player.id === getDeviceSelectedPlayerId() && player.mark)
    || room.players.find((player) => player.id === getSelectedPlayerId() && player.mark)
    || null;
}

function battleshipVisiblePlayer(activeView, reveal, selectedSeat, opponent, currentTurnPlayer) {
  if (reveal && reveal.view === "offence") return selectedSeat;
  if (reveal && reveal.view === "defence") return selectedSeat;
  if (activeView === "offence") return selectedSeat || currentTurnPlayer;
  if (activeView === "defence") return selectedSeat || currentTurnPlayer;
  return currentTurnPlayer || selectedSeat;
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
  if (isTenThousandGameState(currentRoom.game) || isYahtzeeGameState(currentRoom.game) || isMazewrightGameState(currentRoom.game) || isRttaGameState(currentRoom.game) || isZombieDiceGameState(currentRoom.game) || isLiarsDiceGameState(currentRoom.game) || isNoThanksGameState(currentRoom.game) || isHeartsGameState(currentRoom.game) || isPotionLabGameState(currentRoom.game) || isMysticWoodGameState(currentRoom.game)) {
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
  const selectedSeat = currentRoom.players.find((player) => player.id === getSelectedPlayerId());
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
    if (currentRoom) showTurnStatus(null, "Table refresh failed.");
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
    showTurnStatus(null, "Table refresh failed.");
  }
}

async function refreshHostInviteStatus() {
  if (!currentRoom || currentRoom.started || currentRoom.host_id !== getDeviceSelectedPlayerId()) {
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
  const playerId = getSelectedPlayerId() || getDeviceSelectedPlayerId() || "";
  const query = new URLSearchParams({ code });
  if (playerId) query.set("player_id", playerId);
  return `/api/room?${query.toString()}`;
}

function selectedPlayer() {
  return players.find((player) => player.id === getDeviceSelectedPlayerId())
    || players.find((player) => player.id === getSelectedPlayerId())
    || null;
}

function deviceSelectedPlayer() {
  return players.find((player) => player.id === getDeviceSelectedPlayerId()) || null;
}

function setDeviceSelectedPlayer(playerId) {
  const nextPlayer = players.find((player) => player.id === playerId) || null;
  if (!isSogoSuperuser(nextPlayer)) forgetSogoSuperuserPasscode();
  const previousPlayerId = getDeviceSelectedPlayerId();
  setDeviceSelectedPlayerId(playerId);
  setSelectedPlayerId(playerId);
  saveSelectedPlayer();
  realtime.sendAppEventSubscription();
  if (currentRoom && previousPlayerId !== getDeviceSelectedPlayerId()) realtime.refreshRoomLiveUpdates();
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
  // selectedPlayer()/board/makeMove resolve deviceSelectedPlayerId FIRST, so the
  // device seat must follow the turn here too — moving only selectedPlayerId left
  // hot-seat stuck on the previous seat (every edge disabled). Mirror restore.
  if (!targetPlayerId || getDeviceSelectedPlayerId() === targetPlayerId) return;
  setSelectedPlayerId(targetPlayerId);
  setDeviceSelectedPlayerId(targetPlayerId);
  saveSelectedPlayer();
  renderPlayers();
  renderSelectedPlayer();
  renderCurrentPlayer();
  renderGames();
  refreshSelectedPlayerStats();
  updateLobbyPresence();
  renderCreateGameButton();
}

function restoreLocalGameHomePlayer(room) {
  const homePlayerId = localGameHomePlayerId(room);
  if (!homePlayerId) return;
  const changed = getSelectedPlayerId() !== homePlayerId || getDeviceSelectedPlayerId() !== homePlayerId;
  setSelectedPlayerId(homePlayerId);
  if (getDeviceSelectedPlayerId() !== homePlayerId) {
    setDeviceSelectedPlayerId(homePlayerId);
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
    if (!getSelectedPlayerId() && getDeviceSelectedPlayerId()) setSelectedPlayerId(getDeviceSelectedPlayerId());
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

function playerDisplayName(playerId) {
  const seat = (players || []).find((item) => item.id === playerId);
  return seat && seat.name ? seat.name : "This player";
}

// Passcode-gated takeover for a player claimed on another device. Prompts for
// the shared Sogo passcode, then mints a fresh owner token for this device
// (invalidating the other device's). Returns the token, or null if cancelled.
async function reclaimOwnerToken(playerId) {
  const { value: passcode } = await promptForPasscode(`Sogo passcode to use ${playerDisplayName(playerId)} here`);
  if (!passcode) return null;
  const response = await api("/api/player/reclaim", { player_id: playerId, passcode });
  rememberOwnerToken(playerId, response.owner_token);
  return response.owner_token;
}

function saveSelectedPlayer() {
  saveDeviceIdentity();
}

function showRosterError(message) {
  const host = document.getElementById("playerList");
  host.innerHTML = `<p>${escapeHtml(message)}</p>`;
}

function saveSelectedGame() {
  localStorage.setItem("sogotable.selectedGameId", selectedGameId);
}
