// House (clan) controls for the player-edit modal. A player can create a House
// (auto-joining it) or join an existing one. Membership rides on the player
// object as house_id/house_name and is persisted through the normal player upsert
// (owner-token authenticated, like every other player edit). The joinable-house
// list is derived from the roster — a House exists as long as one member carries
// it. House membership is surfaced ONLY in the player modal; every other screen
// shows the bare player name.
import { api } from "../api-client.js";
import { escapeHtml } from "../html-utils.js";

// ctx (from wireHouses): { getPlayers(), ensureOwnerToken(id), setPlayers(list) }.
let ctx = null;
let editingPlayer = null; // the player whose House we are editing, or null
let panelMode = "idle"; // "idle" | "create" | "join"

export function wireHouses(context) {
  ctx = context;
}

// Modal-only display: "Name house of House" when in a clan, else just the name.
export function playerModalDisplayName(player) {
  if (player && player.house_name) return `${player.name} house of ${player.house_name}`;
  return player ? player.name : "";
}

// Render the Create/Join controls for the player being edited. Pass a falsy
// player to hide them (create/select mode).
export function renderHouseControls(player) {
  const host = document.getElementById("houseControls");
  if (!host) return;
  editingPlayer = player || null;
  if (!editingPlayer) {
    panelMode = "idle";
    host.classList.add("hidden");
    host.innerHTML = "";
    return;
  }
  host.classList.remove("hidden");
  if (panelMode === "create") renderCreatePanel(host);
  else if (panelMode === "join") renderJoinPanel(host);
  else renderIdle(host);
}

function renderIdle(host) {
  const current = editingPlayer.house_name
    ? `<p class="house-current">In House of ${escapeHtml(editingPlayer.house_name)}</p>`
    : "";
  host.innerHTML = `
    ${current}
    <div class="house-buttons">
      <button type="button" class="secondary house-create">Create House</button>
      <button type="button" class="secondary house-join">Join House</button>
    </div>
  `;
  host.querySelector(".house-create").addEventListener("click", () => switchMode("create"));
  host.querySelector(".house-join").addEventListener("click", () => switchMode("join"));
}

function renderCreatePanel(host) {
  host.innerHTML = `
    <div class="house-panel">
      <label class="house-name-field">House name
        <input id="houseNameInput" maxlength="24" placeholder="Enter House Name"
          autocomplete="off" autocapitalize="words" spellcheck="false" />
      </label>
      <div class="house-buttons">
        <button type="button" class="secondary house-cancel">Cancel</button>
        <button type="button" class="primary house-save">Create</button>
      </div>
    </div>
  `;
  const input = host.querySelector("#houseNameInput");
  setTimeout(() => input.focus(), 0);
  host.querySelector(".house-cancel").addEventListener("click", () => switchMode("idle"));
  host.querySelector(".house-save").addEventListener("click", () => createHouse(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); createHouse(input.value); }
  });
}

function renderJoinPanel(host) {
  const houses = listHouses().filter((house) => house.id !== editingPlayer.house_id);
  const options = houses.length
    ? houses
        .map((house) => `<button type="button" class="secondary house-option" data-id="${escapeHtml(house.id)}" data-name="${escapeHtml(house.name)}">${escapeHtml(house.name)}</button>`)
        .join("")
    : `<p class="house-empty">No other Houses yet — create one instead.</p>`;
  host.innerHTML = `
    <div class="house-panel">
      <span class="label">Join a House</span>
      <div class="house-options">${options}</div>
      <button type="button" class="secondary house-cancel">Cancel</button>
    </div>
  `;
  host.querySelector(".house-cancel").addEventListener("click", () => switchMode("idle"));
  host.querySelectorAll(".house-option").forEach((button) => {
    button.addEventListener("click", () => saveHouse(button.dataset.id, button.dataset.name));
  });
}

function switchMode(mode) {
  panelMode = mode;
  renderHouseControls(editingPlayer);
}

// Distinct Houses across the roster, keyed by id, sorted by name.
function listHouses() {
  const byId = new Map();
  ctx.getPlayers().forEach((player) => {
    if (player.house_id && player.house_name && !byId.has(player.house_id)) {
      byId.set(player.house_id, { id: player.house_id, name: player.house_name });
    }
  });
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

function newHouseId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `house-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function createHouse(rawName) {
  const name = String(rawName || "").trim();
  if (!name) return;
  // Re-use an existing House id when the name matches (case-insensitive) so two
  // people typing "Dragons" land in the same clan rather than two look-alikes.
  const existing = listHouses().find((house) => house.name.toLowerCase() === name.toLowerCase());
  await saveHouse(existing ? existing.id : newHouseId(), name);
}

// Persist the player's House through the normal player upsert. We send only the
// player's own fields plus the House; the Worker preserves everything else.
async function saveHouse(houseId, houseName) {
  const player = editingPlayer;
  if (!player) return;
  try {
    const owner_token = await ctx.ensureOwnerToken(player.id);
    const response = await api("/api/players/create", {
      player: { id: player.id, name: player.name, icon: player.icon, color: player.color, house_id: houseId, house_name: houseName },
      owner_token,
    });
    panelMode = "idle";
    ctx.setPlayers(response.players);
    renderHouseControls(response.players.find((item) => item.id === player.id) || player);
  } catch (error) {
    alert(error.message);
  }
}
