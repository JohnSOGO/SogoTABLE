import { escapeHtml } from "../../html-utils.js";

export function renderBohnanza(host, view, options = {}) {
  if (!host) return;
  const players = Array.isArray(view?.players) ? view.players : [];
  const market = Array.isArray(view?.market) ? view.market : [];
  const selectedPlayerNumber = Number(options.selectedPlayerNumber || options.activePlayerNumber || 1);
  host.innerHTML = `
    <section class="bohnanza-board">
      <header class="bohnanza-header">
        <div>
          <h2>Bohnanza Lab</h2>
          <p class="bohnanza-status-line">
            <span>Phase: ${escapeHtml(view?.phase || "setup")}</span>
            <span>Round: ${escapeHtml(String(view?.round || 1))}</span>
            <span>Deck ${escapeHtml(String(view?.deckCount ?? 0))}</span>
            <span>Discard ${escapeHtml(String(view?.discardCount ?? 0))}</span>
          </p>
        </div>
      </header>
      <section class="bohnanza-block">
        <h3>Players</h3>
        <table class="player-stat-table bohnanza-player-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Hand</th>
              <th>Fields</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            ${players.map(renderPlayerTableRow).join("")}
          </tbody>
        </table>
      </section>
      <section class="bohnanza-block">
        <h3>Public Market</h3>
        <div class="bohnanza-market">
          ${market.length ? market.map(renderCard).join("") : `<div class="bohnanza-empty">No public cards yet.</div>`}
        </div>
      </section>
      <footer class="bohnanza-footer">
        <span>Viewing player #${escapeHtml(String(selectedPlayerNumber))}</span>
        <span>Hidden hand stays on that device only.</span>
      </footer>
    </section>
  `;
}

function renderPlayerTableRow(player) {
  const fields = Array.isArray(player.fields) ? player.fields : [];
  return `
    <tr>
      <th>#${escapeHtml(String(player.playerNumber ?? player.seat ?? "?"))} ${escapeHtml(player.name || "Player")}</th>
      <td>${escapeHtml(String(player.handCount ?? 0))}</td>
      <td>${escapeHtml(String(fields.filter((field) => field.length).length))}</td>
      <td>${escapeHtml(String(player.score ?? 0))}</td>
    </tr>
  `;
}

function renderCard(card, compact = false) {
  const style = `--card-color:${escapeHtml(String(card.color || "#999999"))}`;
  return `
    <div class="bean-card ${compact ? "compact" : ""}" style="${style}">
      <strong>${escapeHtml(card.beanName || "Bean")}</strong>
      <span>${escapeHtml(String(card.value ?? ""))}</span>
    </div>
  `;
}
