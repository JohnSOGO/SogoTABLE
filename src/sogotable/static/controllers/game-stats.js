// Game-stats controller: the lobby High-Scores/ELO panel and the stats modal.
// Owns currentGameStats (the shell's lobby + realtime push updates apply through
// applyGameStats). Imports its data/markup/id deps directly; the shell provides
// selectedGame/isCurrentSelectedGame/canonicalGameId via wireGameStats(ctx).
import { fetchJson } from "../api-client.js";
import { escapeHtml } from "../html-utils.js";
import { GAME_IDS } from "../games/registry.js";

const TACTICAL_GAME_ID = GAME_IDS.tactical;
const BOXES_GAME_ID = GAME_IDS.boxes;
const TEN_THOUSAND_GAME_ID = GAME_IDS.tenThousand;

let currentGameStats = { high_scores: [], ratings: [] };
let lastGameStatsKey = "";
let ctx = null;

async function refreshGameStats(game = ctx.selectedGame()) {
  if (!game) return;
  try {
    const data = await fetchJson(`/api/stats?game_id=${encodeURIComponent(game.id)}`);
    if (!data.ok) throw new Error(data.error || "Could not load stats.");
    if (!ctx.isCurrentSelectedGame(game)) return;
    currentGameStats = data.stats || { high_scores: [], ratings: [] };
    renderGameStats();
  } catch {
    if (!ctx.isCurrentSelectedGame(game)) return;
    currentGameStats = { high_scores: [], ratings: [] };
    renderGameStats();
  }
}

function renderGameStats() {
  const host = document.getElementById("gameStats");
  if (!host) return;
  const game = ctx.selectedGame();
  const gameId = ctx.canonicalGameId(game && game.id);
  const nextKey = JSON.stringify({ gameId, stats: currentGameStats || {} });
  if (nextKey === lastGameStatsKey) return;
  lastGameStatsKey = nextKey;
  host.innerHTML = "";
  if (gameId === TACTICAL_GAME_ID || gameId === BOXES_GAME_ID || gameId === TEN_THOUSAND_GAME_ID) {
    host.appendChild(lobbyStatsTable("High Scores", currentGameStats.high_scores || [], "Score", "score", "No scores yet."));
  } else {
    host.appendChild(lobbyStatsTable("ELO Ratings", currentGameStats.ratings || [], "ELO", "rating", "No ratings yet."));
  }
}

function renderGameStatsLink() {
  const button = document.getElementById("openGameStats");
  const title = document.getElementById("gameStatsTitle");
  const gameId = ctx.canonicalGameId(ctx.selectedGame().id);
  const label = gameId === TACTICAL_GAME_ID || gameId === BOXES_GAME_ID || gameId === TEN_THOUSAND_GAME_ID ? "High Scores" : "ELO";
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

// The lobby and the realtime socket both push fresh stats; they apply through
// this bridge instead of touching the controller's state directly.
export function applyGameStats(stats) {
  currentGameStats = stats;
  renderGameStats();
}

export function resetGameStatsKey() {
  lastGameStatsKey = "";
}

export function wireGameStats(controllerCtx) {
  ctx = controllerCtx;
  document.getElementById("openGameStats").addEventListener("click", openGameStatsModal);
  document.getElementById("closeGameStatsModal").addEventListener("click", closeGameStatsModal);
  document.getElementById("gameStatsModal").addEventListener("click", closeGameStatsModalOnBackdrop);
}

export { refreshGameStats, renderGameStats, renderGameStatsLink, openGameStatsModal };
