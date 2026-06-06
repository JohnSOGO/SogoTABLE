const icons = ["🙂", "😎", "🤖", "🦊", "🐲", "⭐", "🌮", "🎲"];
const colors = ["#1f7a5f", "#1e63d6", "#c43d5d", "#8a4bd1", "#b7791f", "#0f766e"];

let players = loadPlayers();
let selectedPlayerId = localStorage.getItem("sogogames.selectedPlayerId") || "";
let selectedIcon = icons[0];
let selectedColor = colors[0];
let currentRoom = null;
let pollTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  renderChoices();
  renderPlayers();
  renderSelectedPlayer();
  document.getElementById("playerForm").addEventListener("submit", createPlayer);
  document.getElementById("createRoom").addEventListener("click", createRoom);
  document.getElementById("joinRoom").addEventListener("click", joinRoom);
  document.getElementById("joinSelected").addEventListener("click", joinSelectedPlayer);
  document.getElementById("openGame").addEventListener("click", () => showScreen("game"));
  document.getElementById("resetGame").addEventListener("click", resetGame);
});

function bindNavigation() {
  document.querySelectorAll("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.screen));
  });
}

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.toggle("active", screen.id === name);
  });
  if (name === "game") startPolling();
}

function renderChoices() {
  const iconHost = document.getElementById("iconChoices");
  iconHost.innerHTML = "";
  icons.forEach((icon) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `choice ${icon === selectedIcon ? "selected" : ""}`;
    button.textContent = icon;
    button.addEventListener("click", () => {
      selectedIcon = icon;
      renderChoices();
    });
    iconHost.appendChild(button);
  });

  const colorHost = document.getElementById("colorChoices");
  colorHost.innerHTML = "";
  colors.forEach((color) => {
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

function createPlayer(event) {
  event.preventDefault();
  const input = document.getElementById("playerName");
  const name = input.value.trim();
  if (!name) return;
  const player = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name,
    icon: selectedIcon,
    color: selectedColor,
  };
  players.push(player);
  selectedPlayerId = player.id;
  savePlayers();
  input.value = "";
  renderPlayers();
  renderSelectedPlayer();
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
    const card = document.createElement("button");
    card.type = "button";
    card.className = `player-card ${player.id === selectedPlayerId ? "selected" : ""}`;
    card.innerHTML = `${avatarHtml(player)}<strong>${escapeHtml(player.name)}</strong><span>${player.id === selectedPlayerId ? "Selected" : "Pick"}</span>`;
    card.addEventListener("click", () => {
      selectedPlayerId = player.id;
      savePlayers();
      renderPlayers();
      renderSelectedPlayer();
    });
    host.appendChild(card);
  });
}

function renderSelectedPlayer() {
  const host = document.getElementById("selectedPlayer");
  const player = selectedPlayer();
  host.innerHTML = player ? `${avatarHtml(player)}<strong>${escapeHtml(player.name)}</strong>` : "Create or select a player first.";
}

async function createRoom() {
  const player = selectedPlayer();
  if (!player) return alert("Select a player first.");
  const response = await api("/api/room/create", { player });
  setRoom(response.room);
}

async function joinRoom() {
  const player = selectedPlayer();
  if (!player) return alert("Select a player first.");
  const code = document.getElementById("joinCode").value.trim().toUpperCase();
  const response = await api("/api/room/join", { code, player });
  setRoom(response.room);
}

async function joinSelectedPlayer() {
  const player = selectedPlayer();
  if (!player || !currentRoom) return;
  const response = await api("/api/room/join", { code: currentRoom.code, player });
  setRoom(response.room);
}

async function resetGame() {
  if (!currentRoom) return;
  const response = await api("/api/room/reset", { code: currentRoom.code });
  setRoom(response.room);
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
    showStatus(error.message);
  }
}

function setRoom(room) {
  currentRoom = room;
  document.getElementById("roomPanel").classList.remove("hidden");
  document.getElementById("roomCode").textContent = room.code;
  renderRoomPlayers();
  renderGame();
}

function renderRoomPlayers() {
  if (!currentRoom) return;
  const host = document.getElementById("roomPlayers");
  host.innerHTML = "";
  currentRoom.players.forEach((player) => {
    const row = document.createElement("div");
    row.className = "player-card";
    row.innerHTML = `${avatarHtml(player)}<strong>${escapeHtml(player.name)}</strong><span>${player.mark}</span>`;
    host.appendChild(row);
  });
}

function renderGame() {
  if (!currentRoom) return;
  const game = currentRoom.game;
  const meta = document.getElementById("gameMeta");
  meta.textContent = `Room ${currentRoom.code}`;
  if (game.status === "playing") {
    const current = currentRoom.players.find((player) => player.mark === game.current_player);
    showStatus(`${game.current_player} turn${current ? `: ${current.name}` : ""}`);
  } else if (game.status === "draw") {
    showStatus("Draw game.");
  } else {
    showStatus(`${game.winner} wins.`);
  }

  const host = document.getElementById("macroBoard");
  host.innerHTML = "";
  game.boards.forEach((board, boardIndex) => {
    const small = document.createElement("div");
    const legal = game.legal_boards.includes(boardIndex);
    const result = game.small_winners[boardIndex];
    small.className = `small-board ${legal ? "legal" : ""} ${result ? "done" : ""}`;
    board.forEach((value, cellIndex) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `cell ${value ? value.toLowerCase() : ""}`;
      cell.textContent = value || "";
      cell.disabled = Boolean(value || result || !legal || game.status !== "playing");
      cell.addEventListener("click", () => makeMove(boardIndex, cellIndex));
      small.appendChild(cell);
    });
    if (result) {
      const winner = document.createElement("div");
      winner.className = `board-winner ${result.toLowerCase()}`;
      winner.textContent = result;
      small.appendChild(winner);
    }
    host.appendChild(small);
  });
}

function showStatus(text) {
  document.getElementById("statusLine").textContent = text;
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refreshRoom, 1500);
  refreshRoom();
}

async function refreshRoom() {
  if (!currentRoom) return;
  try {
    const response = await fetch(`/api/room?code=${encodeURIComponent(currentRoom.code)}`);
    const data = await response.json();
    if (data.ok) setRoom(data.room);
  } catch {
    showStatus("Room refresh failed.");
  }
}

async function api(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function selectedPlayer() {
  return players.find((player) => player.id === selectedPlayerId) || null;
}

function loadPlayers() {
  try {
    return JSON.parse(localStorage.getItem("sogogames.players") || "[]");
  } catch {
    return [];
  }
}

function savePlayers() {
  localStorage.setItem("sogogames.players", JSON.stringify(players));
  localStorage.setItem("sogogames.selectedPlayerId", selectedPlayerId);
}

function avatarHtml(player) {
  return `<span class="avatar" style="background:${escapeHtml(player.color)}">${escapeHtml(player.icon)}</span>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
