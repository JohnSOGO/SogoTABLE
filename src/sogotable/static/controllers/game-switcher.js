// Active-games switcher: a 🎲 trigger (with a "needs you" badge) in the game
// header and the dashboard top bars, and a sheet listing every table the
// player sits at — which ones wait on them, a tap to jump in, "back to games
// and keep my seat", and the one-tap opt-in for system alerts. Render + intent
// only: the prepared list comes from client/active-games.js via ctx.
import { avatarHtml, escapeHtml } from "../html-utils.js";

// ctx: getGames(), getBadgeCount(), getViewedCode(), gameName(gameId),
// onOpen(code), onKeepSeatBack(), alertState() → "default"|"granted"|"denied"|"unsupported",
// onEnableAlerts()
let ctx = null;
let sheet = null;

export function wireGameSwitcher(context) {
  ctx = context;
  document.querySelectorAll("[data-game-switcher]").forEach((button) => {
    button.addEventListener("click", () => openSwitcher());
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sheet && !sheet.classList.contains("hidden")) closeSwitcher();
  });
  renderGameSwitcher();
}

function statusText(entry) {
  if (entry.localMode) return "Pass-and-play table";
  if (entry.status !== "active") return "In the lobby";
  if (entry.needsMe) return entry.solo ? "Your move" : "Your move!";
  const names = entry.players.filter((seat) => entry.awaiting.includes(seat.mark)).map((seat) => seat.name);
  return names.length ? `Waiting on ${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}` : "Waiting on the table";
}

// Repaint the triggers' badges and, if open, the sheet. Cheap; call on any change.
export function renderGameSwitcher() {
  if (!ctx || typeof document === "undefined") return;
  const games = ctx.getGames();
  const count = ctx.getBadgeCount();
  document.querySelectorAll("[data-game-switcher]").forEach((button) => {
    const inGame = Boolean(button.closest("#game"));
    button.classList.toggle("hidden", !inGame && !games.length);
    button.classList.toggle("switcher-needs-you", count > 0);
    const badge = count > 0 ? `<span class="switcher-badge">${count}</span>` : "";
    button.innerHTML = `🎲${badge}`;
    const label = count ? `Your games — ${count} waiting on you` : "Your games";
    button.setAttribute("aria-label", label);
    button.title = label;
  });
  if (sheet && !sheet.classList.contains("hidden")) renderSheet();
}

function ensureSheet() {
  if (sheet) return sheet;
  sheet = document.createElement("div");
  sheet.id = "gameSwitcher";
  sheet.className = "switcher-backdrop hidden";
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet) closeSwitcher();
  });
  document.body.appendChild(sheet);
  return sheet;
}

export function openSwitcher() {
  ensureSheet().classList.remove("hidden");
  renderSheet();
  const first = sheet.querySelector("button");
  if (first) first.focus();
}

export function closeSwitcher() {
  if (sheet) sheet.classList.add("hidden");
}

function renderSheet() {
  const games = ctx.getGames();
  const viewed = ctx.getViewedCode();
  const alerts = ctx.alertState();
  const rows = games.map((entry) => `
    <li class="switcher-row ${entry.needsMe && !entry.solo ? "needs-you" : ""} ${entry.viewing ? "viewing" : ""}">
      <button type="button" data-open="${escapeHtml(entry.code)}" ${entry.viewing ? "disabled" : ""}>
        <span class="switcher-name">${escapeHtml(ctx.gameName(entry.gameId))}</span>
        <span class="switcher-status">${escapeHtml(entry.viewing ? "You're here" : statusText(entry))}</span>
        <span class="switcher-seats">${entry.players.slice(0, 6).map((seat) => avatarHtml(seat)).join("")}<em>${escapeHtml(entry.code)}</em></span>
      </button>
    </li>`).join("");
  sheet.innerHTML = `
    <div class="switcher-sheet" role="dialog" aria-modal="true" aria-labelledby="switcherTitle">
      <header class="switcher-head">
        <h2 id="switcherTitle">Your games</h2>
        <button type="button" class="ghost icon-button" data-close aria-label="Close">✕</button>
      </header>
      ${games.length ? `<ul class="switcher-list">${rows}</ul>` : `<p class="switcher-empty">No other games yet. Start one from the games list — you keep your seat here.</p>`}
      <div class="switcher-actions">
        ${viewed ? `<button type="button" class="secondary" data-keep-seat>🏠 Back to games — keep my seat</button>` : ""}
        ${alerts === "default" ? `<button type="button" class="ghost" data-alerts>🔔 Alert me when a game needs me</button>` : ""}
        ${alerts === "denied" ? `<p class="switcher-note">Alerts are blocked in this browser's site settings; you'll still get in-app alerts.</p>` : ""}
      </div>
    </div>`;
  sheet.querySelector("[data-close]").addEventListener("click", closeSwitcher);
  sheet.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => { closeSwitcher(); ctx.onOpen(button.dataset.open); });
  });
  const keep = sheet.querySelector("[data-keep-seat]");
  if (keep) keep.addEventListener("click", () => { closeSwitcher(); ctx.onKeepSeatBack(); });
  const enable = sheet.querySelector("[data-alerts]");
  if (enable) enable.addEventListener("click", async () => { await ctx.onEnableAlerts(); renderSheet(); });
}
