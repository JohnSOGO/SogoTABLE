// Game Names admin screen: the Sogo admin gives any game an optional
// alternate name (e.g. Tracklayers -> "Ticket to Ride") that every player sees
// in parentheses under the published name. Lazy-loaded by app.js through
// ADMIN_SCREENS; it reaches the shell only through ctx and never changes the
// registry. The server (workers/game-alt-names.js) cleans, caps and stores it.
import { fetchJson } from "../api-client.js";
import { escapeHtml } from "../html-utils.js";
import { showToast } from "../controllers/toast.js";

const LIMIT = 60;
let ctx = { api: async () => ({}), passcode: async () => "", onGamesChanged: () => {} };
let wired = false;
let games = [];

const root = () => document.querySelector("#gameNames .game-names-root");

function render() {
  const host = root();
  if (!host) return;
  host.innerHTML = `
    <p class="game-description">Shown to every player in brackets under the game's name, for example “Tracklayers (Ticket to Ride)”. Leave a box empty to show no second name.</p>
    <div class="game-names-list">${games.map((g) => `
      <form class="panel game-names-row" data-game-id="${escapeHtml(g.id)}">
        <label><strong>${escapeHtml(g.name)}</strong>
          <input type="text" name="alt" maxlength="${LIMIT}" value="${escapeHtml(g.alt_name || "")}" placeholder="Alternate name" autocomplete="off" />
        </label>
        <button type="submit" class="secondary">Save</button>
        <span class="game-names-state" aria-live="polite"></span>
      </form>`).join("")}
    </div>`;
}

async function save(form) {
  const input = form.querySelector("input[name=alt]");
  const state = form.querySelector(".game-names-state");
  const button = form.querySelector("button");
  button.disabled = true;
  state.textContent = "Saving…";
  try {
    const passcode = await ctx.passcode();
    if (!passcode) throw new Error("The Sogo passcode is needed to save.");
    const data = await ctx.api("/api/game-alt-names/set", { passcode, game_id: form.dataset.gameId, alt_name: input.value });
    input.value = data.alt_name || "";
    const game = games.find((g) => g.id === form.dataset.gameId);
    if (game) game.alt_name = data.alt_name || "";
    state.textContent = data.alt_name ? "Saved" : "Cleared";
    ctx.onGamesChanged();
  } catch (error) {
    state.textContent = "";
    showToast(error.message || "Could not save.");
  } finally {
    button.disabled = false;
  }
}

// ctx: { api(url, payload), passcode(): Promise<string>, onGamesChanged() }
export function wireGameNames(shellCtx) {
  ctx = { ...ctx, ...(shellCtx || {}) };
  const host = root();
  if (wired || !host) return;
  wired = true;
  host.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target.closest(".game-names-row");
    if (form) void save(form);
  });
  host.addEventListener("input", (event) => {
    const state = event.target.closest(".game-names-row")?.querySelector(".game-names-state");
    if (state) state.textContent = "";
  });
}

export async function openGameNames() {
  const host = root();
  if (!host) return;
  host.innerHTML = `<p class="game-description">Loading games…</p>`;
  try {
    const data = await fetchJson("/api/games");
    if (!data.ok || !Array.isArray(data.games)) throw new Error(data.error || "Could not load games.");
    games = data.games.map((g) => ({ id: g.id, name: g.name, alt_name: g.alt_name || "" }));
    render();
  } catch (error) {
    host.innerHTML = `<p class="game-description">${escapeHtml(error.message || "Could not load games.")}</p>`;
  }
}
