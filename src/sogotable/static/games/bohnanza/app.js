import { bohnanzaManifest } from "./manifest.js";
import { applyAction, getLegalActions, getPublicView } from "./rules.js";
import { createInitialState, normalizeState } from "./state.js";
import { renderBohnanza } from "./render.js";
import { escapeHtml } from "../../html-utils.js";

const STORAGE_KEY = "sogotable.bohnanza.lab.state";
const VIEW_KEY = "sogotable.bohnanza.lab.playerNumber";

const els = {
  playerCount: document.getElementById("playerCount"),
  localPlayerNumber: document.getElementById("localPlayerNumber"),
  seedValue: document.getElementById("seedValue"),
  newTable: document.getElementById("newTable"),
  publicBoard: document.getElementById("publicBoard"),
  privateHand: document.getElementById("privateHand"),
  handHint: document.getElementById("handHint"),
  controlHint: document.getElementById("controlHint"),
  turnLabel: document.getElementById("turnLabel"),
  phaseLabel: document.getElementById("phaseLabel"),
  plantFront: document.getElementById("plantFront"),
  harvestField: document.getElementById("harvestField"),
  endTurn: document.getElementById("endTurn"),
  queryPanel: document.getElementById("queryPanel"),
};

let state = loadState() || createInitialState(defaultPlayerIds(Number(els.playerCount.value || 4)), Number(els.seedValue.value || 42));
let activeTab = "players";
let selectedFieldIndex = 0;

syncControlsFromState();
bindEvents();
render();

function bindEvents() {
  els.newTable.addEventListener("click", () => {
    const playerCount = clamp(Number(els.playerCount.value || 4), 2, 7);
    const seed = Number(els.seedValue.value || 42);
    state = createInitialState(defaultPlayerIds(playerCount), seed);
    state = normalizeState(applyAction(state, { type: "start_game" }));
    saveState();
    render();
  });

  els.playerCount.addEventListener("change", () => {
    els.playerCount.value = String(clamp(Number(els.playerCount.value || 4), 2, 7));
  });

  els.localPlayerNumber.addEventListener("change", () => {
    els.localPlayerNumber.value = String(clamp(Number(els.localPlayerNumber.value || 1), 1, 7));
    localStorage.setItem(VIEW_KEY, els.localPlayerNumber.value);
    render();
  });

  els.seedValue.addEventListener("change", () => {
    localStorage.setItem("sogotable.bohnanza.lab.seed", String(Number(els.seedValue.value || 42)));
  });

  els.plantFront.addEventListener("click", () => act({ type: "plant_front" }));
  els.harvestField.addEventListener("click", () => {
    const activePlayer = state.players[state.activePlayerIndex];
    const fieldIndex = activePlayer ? activePlayer.fields.findIndex((field) => field.length) : -1;
    if (fieldIndex < 0) {
      els.controlHint.textContent = "No harvestable field yet.";
      return;
    }
    act({ type: "harvest_field", fieldIndex });
  });
  els.endTurn.addEventListener("click", () => act({ type: "end_turn" }));

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab;
      document.querySelectorAll("[data-tab]").forEach((tab) => tab.classList.toggle("active", tab === button));
      renderQueryPanel();
    });
  });
}

function act(action) {
  try {
    state = normalizeState(applyAction(state, action));
    saveState();
    render();
  } catch (error) {
    els.controlHint.textContent = error.message;
  }
}

function render() {
  state = normalizeState(state);
  document.body.classList.toggle("bohnanza-started", state.phase !== "setup");
  const publicView = getPublicView(state);
  const localPlayerNumber = clamp(Number(els.localPlayerNumber.value || 1), 1, 7);
  const activePlayer = state.players[publicView.activePlayerIndex] || null;
  const localPlayer = state.players.find((player) => player.playerNumber === localPlayerNumber) || state.players[0] || null;
  const activePlayerNumber = activePlayer ? activePlayer.playerNumber : "?";
  const canAct = Boolean(localPlayer && activePlayer && localPlayer.playerNumber === activePlayer.playerNumber && state.phase !== "complete");

  renderBohnanza(els.publicBoard, publicView, { selectedPlayerNumber: localPlayerNumber });
  renderPrivateHand(localPlayer, canAct, activePlayerNumber);
  renderQueryPanel();
  renderControls(publicView, canAct, localPlayer, activePlayer);
  updateHeaderState(localPlayerNumber);
  syncControlsFromState();
}

function renderPrivateHand(player, canAct, activePlayerNumber) {
  els.privateHand.innerHTML = "";
  if (!player) {
    els.privateHand.innerHTML = `<div class="empty-state">No local player selected.</div>`;
    return;
  }
  const cards = Array.isArray(player.hand) ? player.hand : [];
  if (!cards.length) {
    els.privateHand.innerHTML = `<div class="empty-state">No cards in hand.</div>`;
  } else {
    els.privateHand.innerHTML = cards.map((card) => `
      <button class="bean-card hand-card" type="button" style="--card-color:${escapeHtml(card.color)}">
        <strong>${escapeHtml(card.beanName)}</strong>
        <span>${escapeHtml(String(card.value))}</span>
      </button>
    `).join("");
  }
  els.handHint.textContent = canAct
    ? `You are player #${player.playerNumber}. It is your turn.`
    : `You are player #${player.playerNumber}. Waiting for player #${activePlayerNumber}.`;
}

function renderControls(publicView, canAct, localPlayer, activePlayer) {
  const actions = getLegalActions(state);
  const actionLabels = actions.map((action) => action.label).join(" · ");
  els.turnLabel.textContent = activePlayer ? `Active: #${activePlayer.playerNumber}` : "No active player";
  els.phaseLabel.textContent = `${state.phase}`;
  els.plantFront.disabled = !canAct || !actions.some((action) => action.type === "plant_front");
  els.harvestField.disabled = !canAct || !actions.some((action) => action.type === "harvest_field");
  els.endTurn.disabled = !canAct || !actions.some((action) => action.type === "end_turn");
  els.controlHint.textContent = actionLabels || "No actions available yet.";
}

function renderQueryPanel() {
  const players = state.players.slice().sort((left, right) => left.playerNumber - right.playerNumber);
  if (activeTab === "players") {
    els.queryPanel.innerHTML = `
      <table class="player-stat-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Hand</th>
            <th>Fields</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          ${players.map((player) => `
            <tr>
              <th>#${escapeHtml(String(player.playerNumber))} ${escapeHtml(player.name)}</th>
              <td>${escapeHtml(String(player.hand.length))}</td>
              <td>${escapeHtml(String(player.fields.filter((field) => field.length).length))}</td>
              <td>${escapeHtml(String(player.score))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    return;
  }
  if (activeTab === "deck") {
    els.queryPanel.innerHTML = `
      <div class="query-stack">
        <span>Deck: ${state.drawPile.length}</span>
        <span>Discard: ${state.discardPile.length}</span>
        <span>Round: ${state.round}</span>
        <span>Phase: ${state.phase}</span>
      </div>
    `;
    return;
  }
  if (activeTab === "market") {
    els.queryPanel.innerHTML = `
      <div class="query-list">
        ${state.market.length ? state.market.map((card) => `
          <div class="bean-card" style="--card-color:${escapeHtml(card.color)}">
            <strong>${escapeHtml(card.beanName)}</strong>
            <span>${escapeHtml(String(card.value))}</span>
          </div>
        `).join("") : `<div class="empty-state small">No market cards visible.</div>`}
      </div>
    `;
    return;
  }
  els.queryPanel.innerHTML = `
    <div class="query-stack">
      <strong>${escapeHtml(bohnanzaManifest.name)}</strong>
      <span>Ordered hands</span>
      <span>Public fields</span>
      <span>Three bean fields</span>
      <span>Turn order now, round-based later</span>
    </div>
  `;
}

function syncControlsFromState() {
  const savedPlayerNumber = Number(localStorage.getItem(VIEW_KEY) || 1);
  els.localPlayerNumber.value = String(clamp(savedPlayerNumber, 1, 7));
  const playerCount = clamp(Number(els.playerCount.value || state.players.length || 4), 2, 7);
  els.playerCount.value = String(playerCount);
  els.localPlayerNumber.max = String(playerCount);
  els.seedValue.value = String(Number(localStorage.getItem("sogotable.bohnanza.lab.seed") || 42));
}

function updateHeaderState(localPlayerNumber) {
  const shouldShow = state.phase === "setup";
  document.querySelectorAll(".lab-topbar-actions .inline-field, .lab-topbar-actions #newTable").forEach((element) => {
    element.hidden = !shouldShow;
  });
  document.querySelector(".lab-topbar-actions")?.classList.toggle("hidden", !shouldShow);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function defaultPlayerIds(count) {
  return Array.from({ length: count }, (_, index) => `player-${index + 1}`);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
