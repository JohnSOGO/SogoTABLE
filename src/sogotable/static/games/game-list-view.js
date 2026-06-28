// Game-select view: builds the grouped game-picker cards.
//
// Pure view module — it owns layout only. Callers pass the current games,
// the selection state, and the behaviour callbacks; this never reaches into
// app state or game rules. Cards are grouped by the registry's
// GAME_CATEGORIES (Pen and Paper / Dice / Board), in registry-defined order.

import { GAME_CATEGORIES } from "./registry.js";

export function renderGameList(host, games, { selectedGameId, isReady, availabilityText, onSelect }) {
  host.innerHTML = "";

  const makeCard = (game) => {
    const ready = isReady(game);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `game-card ${game.id === selectedGameId ? "selected" : ""}`;
    button.dataset.gameId = game.id;
    button.textContent = game.name;
    button.disabled = !ready;
    if (!ready) {
      button.title = availabilityText(game);
      button.setAttribute("aria-label", `${game.name}. ${availabilityText(game)}`);
    }
    button.addEventListener("click", () => {
      if (!ready) return;
      onSelect(game);
    });
    return button;
  };

  const renderGroup = (label, groupGames) => {
    if (!groupGames.length) return;
    const group = document.createElement("div");
    group.className = "games-group";
    const heading = document.createElement("h3");
    heading.className = "games-group-title";
    heading.textContent = label;
    group.appendChild(heading);
    const grid = document.createElement("div");
    grid.className = "games-grid";
    groupGames.forEach((game) => grid.appendChild(makeCard(game)));
    group.appendChild(grid);
    host.appendChild(group);
  };

  // Any game whose category is missing or unknown still shows up, gathered into
  // a trailing group so a new game is never silently hidden from the picker.
  const grouped = new Set();
  GAME_CATEGORIES.forEach((category) => {
    const groupGames = games.filter((game) => game.category === category.id);
    groupGames.forEach((game) => grouped.add(game.id));
    renderGroup(category.label, groupGames);
  });
  renderGroup(
    "More Games",
    games.filter((game) => !grouped.has(game.id)),
  );
}
