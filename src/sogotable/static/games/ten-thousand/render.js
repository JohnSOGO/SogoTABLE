const FACE_PIPS = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

const ROLL_MOVE_TYPES = new Set(["roll", "reroll", "farkle"]);
let lastAnimatedMoveCount = -1;

export function renderTenThousandGame(ctx) {
  const { host, game } = ctx;
  if (!host || !game) return;
  host.className = "macro-board ten-thousand-table";
  if (!ctx.started) {
    renderTenThousandLobby(host, ctx);
    return;
  }
  renderTenThousandPlay(host, ctx);
}

function renderTenThousandLobby(host, ctx) {
  const { room, isHost, escapeHtml } = ctx;
  const seats = Array.isArray(room.players) ? room.players : [];
  const roster = seats.length
    ? seats.map((seat, index) => `
      <li class="tt-lobby-player">
        <span class="tt-lobby-player-no">${index + 1}</span>
        <div class="tt-lobby-player-body">
          <strong>${escapeHtml(seat.name)}</strong>
          <span>${escapeHtml(seat.kind === "bot" ? "Bot" : "Player")} ${escapeHtml(seat.mark || "")}</span>
        </div>
      </li>`).join("")
    : `<li class="tt-lobby-empty">No players yet.</li>`;

  const hostControls = isHost
    ? `
      <div class="tt-lobby-actions">
        <button class="secondary" type="button" data-lobby="invite">Invite Remote Opponent</button>
        <button class="secondary" type="button" data-lobby="bot">Invite Bot</button>
        <button class="primary" type="button" data-lobby="start" ${seats.length ? "" : "disabled"}>Start Game</button>
      </div>`
    : `<p class="ten-thousand-message">Waiting for the host to start...</p>`;

  host.innerHTML = `
    <section class="ten-thousand-lobby">
      <h3>Hosts</h3>
      <ul class="tt-lobby-roster">${roster}</ul>
      <p class="ten-thousand-message">Invite remote opponents or bots, then start whenever you're ready.</p>
      ${hostControls}
    </section>`;

  if (!isHost) return;
  const wire = (key, fn) => {
    const button = host.querySelector(`[data-lobby="${key}"]`);
    if (button && fn) button.addEventListener("click", () => {
      if (!button.disabled) fn();
    });
  };
  wire("invite", ctx.invitePlayer);
  wire("bot", ctx.addBot);
  wire("start", ctx.startGame);
}

function renderTenThousandPlay(host, ctx) {
  const { room, game, pendingMove, escapeHtml = escapeText } = ctx;
  const seats = Array.isArray(game.players) ? game.players : [];
  const localMark = markForPlayer(room, ctx.localPlayerId);
  const localSeat = seats.find((seat) => seat.mark === localMark) || null;
  const complete = game.status === "complete";

  host.innerHTML = `
    ${localSeat && !complete ? trayHtml(localSeat, game, pendingMove, ctx.statusText || "", escapeHtml) : ""}
    ${standingsHtml(seats, room, game)}
  `;

  if (localSeat && !complete) wireTray(host, localSeat, game, ctx);
  wireStandings(host);
}

function trayHtml(seat, game, pendingMove, statusText = "", escapeHtml = escapeText) {
  const resolved = Boolean(seat.resolved);
  const farkled = seat.phase === "farkled";
  const canAct = game.status === "playing" && !resolved && !pendingMove;
  const dice = Array.isArray(seat.dice) ? seat.dice : [];
  const displayDice = farkled
    ? dice.map((die) => ({ ...die, selected: false, scored: false }))
    : dice;
  const lastMove = game.last_move || {};
  const moveCount = Number(game.move_count || 0);
  const animate = !pendingMove
    && lastMove.mark === seat.mark
    && ROLL_MOVE_TYPES.has(lastMove.type)
    && moveCount !== lastAnimatedMoveCount;
  const rolledIds = animate
    ? new Set((Array.isArray(lastMove.dice) ? lastMove.dice : []).filter((die) => !die.scored).map((die) => die.id))
    : new Set();
  if (animate) lastAnimatedMoveCount = moveCount;

  const diceHtml = displayDice
    .map((die) => dieHtml(die, { rolling: rolledIds.has(die.id), bust: farkled }))
    .join("");

  return `
    <section class="ten-thousand-tray">
      <div class="ten-thousand-scoreboard">
        <div><span class="label">Banked</span><strong>${fmt(seat.score)}</strong></div>
        <div><span class="label">This turn</span><strong data-turn-score>${fmt(seat.turn_score)}</strong></div>
        <div><span class="label">Farkles</span><strong>${fmt(seat.farkles)}</strong></div>
      </div>
      <div class="ten-thousand-dice" aria-label="Dice">${diceHtml}</div>
      <div class="ten-thousand-actions" aria-label="Dice actions">
        <button class="primary" type="button" data-action="roll" ${canAct && seat.can_roll ? "" : "disabled"}>Roll</button>
        <button class="secondary" type="button" data-action="select" disabled>Score Selected</button>
        <button class="secondary" type="button" data-action="reroll" ${canAct && seat.can_reroll ? "" : "disabled"} aria-label="Press your luck and roll the remaining dice">Press</button>
        <button class="primary" type="button" data-action="bank" ${canAct && seat.can_bank ? "" : "disabled"}>Bank</button>
      </div>
      <p class="ten-thousand-message">${escapeHtml(statusText || trayMessage(seat))}</p>
    </section>`;
}

function trayMessage(seat) {
  if (seat.resolved) {
    if (seat.phase === "farkled") return "You Farkled! Tap OK to continue.";
    return "Waiting for the other players to finish the round.";
  }
  if (seat.phase === "rolled") return "Select scoring dice, then bank or press.";
  if (seat.phase === "selected") return "Bank your turn score or press your luck.";
  return "Tap Roll to begin.";
}

function wireTray(host, seat, game, ctx) {
  const { makeMove } = ctx;
  const selectedDice = new Set();
  const selectButton = host.querySelector('[data-action="select"]');
  const turnScoreNode = host.querySelector("[data-turn-score]");
  const dice = Array.isArray(seat.dice) ? seat.dice : [];
  const valueById = new Map(dice.map((die) => [die.id, Number(die.value) || 0]));
  const dieButtons = [...host.querySelectorAll(".ten-thousand-die")];
  const canAct = game.status === "playing" && !seat.resolved;

  function refreshSelection() {
    const selected = [...selectedDice].map((id) => ({ id, value: valueById.get(id) }));
    const scoring = tenThousandSelectionScore(selected);
    dieButtons.forEach((button) => {
      const id = button.dataset.dieId;
      const isSelected = selectedDice.has(id);
      const scores = isSelected && scoring.scoringIds.has(id);
      button.classList.toggle("pending", isSelected);
      button.classList.toggle("select-score", scores);
      button.classList.toggle("select-bust", isSelected && !scores);
    });
    if (turnScoreNode) turnScoreNode.textContent = fmt(Number(seat.turn_score || 0) + scoring.score);
    if (selectButton) selectButton.disabled = !selected.length || !scoring.valid || scoring.score <= 0;
  }

  dieButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!canAct || button.disabled) return;
      const id = button.dataset.dieId;
      if (selectedDice.has(id)) selectedDice.delete(id);
      else selectedDice.add(id);
      refreshSelection();
    });
  });

  const action = (selector, build) => {
    const button = host.querySelector(selector);
    if (button) button.addEventListener("click", () => {
      if (!button.disabled) makeMove(build());
    });
  };
  action('[data-action="roll"]', () => ({ type: "roll" }));
  action('[data-action="reroll"]', () => ({ type: "reroll" }));
  action('[data-action="bank"]', () => ({ type: "bank" }));
  if (selectButton) selectButton.addEventListener("click", () => {
    if (!selectButton.disabled) makeMove({ type: "select", dice_ids: [...selectedDice] });
  });

  refreshSelection();
}

function standingsHtml(seats, room, game) {
  const rows = seats
    .slice()
    .sort((left, right) => right.score - left.score)
    .map((seat) => standingsRow(seat, room, game))
    .join("");
  return `
    <section class="ten-thousand-standings" aria-label="Standings">
      <table>
        <thead><tr><th>Player</th><th aria-label="Status"></th><th>Farkle</th><th>Score</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function standingsRow(seat, room, game) {
  const name = seatName(room, seat.mark);
  const emoji = seatEmoji(room, seat.mark);
  const classes = [
    "tt-standing",
    seat.resolved ? "is-resolved" : "",
    seat.phase === "farkled" ? "is-farkle" : "",
  ].filter(Boolean).join(" ");
  const status = standingStatusIcon(seat, game);
  return `
    <tr class="${classes}">
      <td>
        <button class="tt-standing-player" type="button" data-standing-player="${seat.mark}" title="Tap to show name">
          <span class="tt-standing-player-icon">${emoji}</span>
          <span class="tt-standing-player-name">${escapeName(name)}</span>
        </button>
      </td>
      <td class="tt-standing-status" title="${status.title}">${status.symbol}</td>
      <td>${fmt(seat.farkles)}</td>
      <td><strong>${fmt(seat.score)}</strong></td>
    </tr>`;
}

function standingStatusIcon(seat, game) {
  if (game.status === "complete") {
    return seat.mark === game.winner
      ? { symbol: "✅", title: "Winner" }
      : { symbol: "—", title: "Finished" };
  }
  if (seat.phase === "farkled") return { symbol: "❌", title: "Farkled this round" };
  if (seat.resolved) return { symbol: "✅", title: "Banked this round" };
  return { symbol: "⏳", title: "Waiting for this player to finish" };
}

function wireStandings(host) {
  [...host.querySelectorAll("[data-standing-player]")].forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.toggle("is-expanded");
    });
  });
}

function dieHtml(die, { rolling = false, bust = false } = {}) {
  const rawValue = Number(die.value);
  const hasValue = Number.isInteger(rawValue) && rawValue >= 1 && rawValue <= 6;
  if (bust && !hasValue) throw new Error("Ten Thousand farkle dice must preserve their rolled values.");
  const value = hasValue ? rawValue : 1;
  const blank = !hasValue;
  const disabled = die.scored || blank || bust;
  const classes = [
    "ten-thousand-die",
    die.scored ? "scored" : "",
    bust ? "select-bust pending" : "",
    hasValue ? "landed" : "blank",
  ].filter(Boolean).join(" ");
  const cubeClasses = ["die-cube", `die-face-${value}`, rolling ? "rolling" : ""].filter(Boolean).join(" ");
  return `
    <button class="${classes}" type="button" data-die-id="${die.id}" ${disabled ? "disabled" : ""} aria-label="Die ${die.id}, ${hasValue ? value : "not rolled"}">
      <span class="${cubeClasses}">
        ${[1, 2, 3, 4, 5, 6].map((face) => faceHtml(face)).join("")}
      </span>
    </button>`;
}

function faceHtml(face) {
  const pips = new Set(FACE_PIPS[face] || []);
  return `
    <span class="die-face face-${face}">
      ${Array.from({ length: 9 }, (_, index) => `<span class="${pips.has(index + 1) ? "pip" : ""}"></span>`).join("")}
    </span>`;
}

function tenThousandScoringIds(selected) {
  return tenThousandSelectionScore(selected).scoringIds;
}

function tenThousandSelectionScore(selected) {
  const source = Array.isArray(selected) ? selected : [];
  const scoringIds = new Set();
  if (!source.length) return { scoringIds, score: 0, valid: false };
  if (source.length === 6) {
    const counts = [0, 0, 0, 0, 0, 0];
    source.forEach((die) => {
      if (die.value >= 1 && die.value <= 6) counts[die.value - 1] += 1;
    });
    const straight = counts.every((count) => count === 1);
    const threePairs = counts.filter((count) => count === 2).length === 3;
    if (straight || threePairs) {
      source.forEach((die) => scoringIds.add(die.id));
      return { scoringIds, score: 1500, valid: true };
    }
  }
  const byFace = new Map();
  source.forEach((die) => {
    if (!byFace.has(die.value)) byFace.set(die.value, []);
    byFace.get(die.value).push(die.id);
  });
  let score = 0;
  byFace.forEach((ids, face) => {
    if (face === 1) {
      ids.forEach((id) => scoringIds.add(id));
      score += ids.length * 100;
    } else if (face === 5) {
      ids.forEach((id) => scoringIds.add(id));
      score += ids.length * 50;
    } else if (ids.length >= 3) {
      ids.slice(0, 3).forEach((id) => scoringIds.add(id));
      score += face * 100;
    }
  });
  return { scoringIds, score, valid: scoringIds.size === source.length };
}

function markForPlayer(room, playerId) {
  const seat = (room.players || []).find((player) => player.id === playerId);
  return seat ? seat.mark : null;
}

function seatEmoji(room, mark) {
  const seat = (room.players || []).find((player) => player.mark === mark);
  return seat && seat.icon ? seat.icon : "🙂";
}

function seatName(room, mark) {
  const seat = (room.players || []).find((player) => player.mark === mark);
  return seat ? seat.name : mark;
}

function fmt(value) {
  return Number(value || 0).toLocaleString();
}

function escapeName(value) {
  return String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function escapeText(value) {
  return String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}
