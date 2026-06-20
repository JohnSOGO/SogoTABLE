const FACE_PIPS = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

const ROLL_MOVE_TYPES = new Set(["roll", "reroll", "farkle"]);
// Tracks the move_count we last animated, so a roll tumbles once and other
// re-renders (selecting, socket echoes, the pending render) stay still.
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

// ---------------------------------------------------------------------------
// Lobby (host assembles the table, then starts)
// ---------------------------------------------------------------------------

function renderTenThousandLobby(host, ctx) {
  const { room, isHost, escapeHtml } = ctx;
  const seats = Array.isArray(room.players) ? room.players : [];
  const max = 6;
  const seatRows = seats
    .map((seat, index) => `
      <li class="tt-lobby-seat">
        <span class="tt-seat-no">${index + 1}</span>
        <span class="tt-seat-name">${escapeHtml(seat.name)}</span>
        <span class="tt-seat-tag">${seat.kind === "bot" ? "🤖 Bot" : "🧑 Player"}</span>
      </li>`)
    .join("");
  const openSeats = Math.max(0, max - seats.length);
  const hostControls = isHost
    ? `
      <div class="tt-lobby-actions">
        <button class="secondary" type="button" data-lobby="bot" ${openSeats ? "" : "disabled"}>Add Bot</button>
        <button class="secondary" type="button" data-lobby="invite" ${openSeats ? "" : "disabled"}>Invite Player</button>
        <button class="secondary" type="button" data-lobby="local" ${openSeats ? "" : "disabled"}>Add Local</button>
        <button class="primary" type="button" data-lobby="start" ${seats.length ? "" : "disabled"}>Start Game</button>
      </div>`
    : `<p class="ten-thousand-message">Waiting for the host to start…</p>`;

  host.innerHTML = `
    <section class="ten-thousand-lobby">
      <h3>Table (${seats.length}/${max})</h3>
      <ul class="tt-lobby-seats">${seatRows}</ul>
      ${hostControls}
    </section>`;

  if (!isHost) return;
  const wire = (key, fn) => {
    const button = host.querySelector(`[data-lobby="${key}"]`);
    if (button && fn) button.addEventListener("click", () => { if (!button.disabled) fn(); });
  };
  wire("bot", ctx.addBot);
  wire("invite", ctx.invitePlayer);
  wire("local", ctx.addLocal);
  wire("start", ctx.startGame);
}

// ---------------------------------------------------------------------------
// Active play (local player's tray + live standings)
// ---------------------------------------------------------------------------

function renderTenThousandPlay(host, ctx) {
  const { room, game, pendingMove, escapeHtml } = ctx;
  const seats = Array.isArray(game.players) ? game.players : [];
  const localMark = markForPlayer(room, ctx.localPlayerId);
  const localSeat = seats.find((seat) => seat.mark === localMark) || null;
  const complete = game.status === "complete";

  const roundLabel = complete
    ? "Game over"
    : `Round ${game.round}${game.final_round ? " · Final round!" : ""}`;

  host.innerHTML = `
    <section class="ten-thousand-roundbar">${escapeHtml(roundLabel)}</section>
    ${localSeat && !complete ? trayHtml(localSeat, game, pendingMove) : ""}
    ${standingsHtml(seats, room, game, localMark)}
  `;

  if (localSeat && !complete) wireTray(host, localSeat, game, ctx);
}

function trayHtml(seat, game, pendingMove) {
  const resolved = Boolean(seat.resolved);
  const farkled = seat.phase === "farkled";
  const canAct = game.status === "playing" && !resolved && !pendingMove;
  const dice = Array.isArray(seat.dice) ? seat.dice : [];
  const lastMove = game.last_move || {};
  const moveCount = Number(game.move_count || 0);
  const animate = !pendingMove
    && lastMove.mark === seat.mark
    && ROLL_MOVE_TYPES.has(lastMove.type)
    && moveCount !== lastAnimatedMoveCount;
  const rolledIds = animate
    ? new Set((Array.isArray(lastMove.dice) ? lastMove.dice : []).map((die) => die.id))
    : new Set();
  if (animate) lastAnimatedMoveCount = moveCount;

  const diceHtml = dice
    .map((die) => dieHtml(die, { rolling: rolledIds.has(die.id), bust: farkled }))
    .join("");

  return `
    <section class="ten-thousand-tray">
      <div class="ten-thousand-scoreboard">
        <div><span class="label">Banked</span><strong>${fmt(seat.score)}</strong></div>
        <div><span class="label">This turn</span><strong>${fmt(seat.turn_score)}</strong></div>
        <div><span class="label">Farkles</span><strong>${fmt(seat.farkles)}</strong></div>
      </div>
      <div class="ten-thousand-dice" aria-label="Dice">${diceHtml}</div>
      <div class="ten-thousand-actions" aria-label="Dice actions">
        <button class="primary" type="button" data-action="roll" ${canAct && seat.can_roll ? "" : "disabled"}>Roll</button>
        <button class="secondary" type="button" data-action="select" disabled>Score Selected</button>
        <button class="secondary" type="button" data-action="reroll" ${canAct && seat.can_reroll ? "" : "disabled"} aria-label="Press your luck and roll the remaining dice">Press</button>
        <button class="primary" type="button" data-action="bank" ${canAct && seat.can_bank ? "" : "disabled"}>Bank</button>
      </div>
      <p class="ten-thousand-message">${trayMessage(seat, game)}</p>
    </section>`;
}

function trayMessage(seat, game) {
  if (seat.resolved) {
    if (seat.phase === "farkled") return "Farkle! Waiting for the other players…";
    return `Banked ${fmt(seat.round_score)} this round. Waiting for the other players…`;
  }
  if (seat.phase === "rolled") return "Select the dice you want to score.";
  if (seat.phase === "selected") return "Bank your turn score or press your luck.";
  return "Roll the dice.";
}

function wireTray(host, seat, game, ctx) {
  const { makeMove } = ctx;
  const selectedDice = new Set();
  const selectButton = host.querySelector('[data-action="select"]');
  const dice = Array.isArray(seat.dice) ? seat.dice : [];
  const valueById = new Map(dice.map((die) => [die.id, Number(die.value) || 0]));
  const dieButtons = [...host.querySelectorAll(".ten-thousand-die")];
  const canAct = game.status === "playing" && !seat.resolved;

  function refreshSelection() {
    const selected = [...selectedDice].map((id) => ({ id, value: valueById.get(id) }));
    const scoringIds = tenThousandScoringIds(selected);
    dieButtons.forEach((button) => {
      const id = button.dataset.dieId;
      const isSelected = selectedDice.has(id);
      const scores = isSelected && scoringIds.has(id);
      button.classList.toggle("pending", isSelected);
      button.classList.toggle("select-score", scores);
      button.classList.toggle("select-bust", isSelected && !scores);
    });
    if (selectButton) selectButton.disabled = !selected.length || selected.some((die) => !scoringIds.has(die.id));
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
    if (button) button.addEventListener("click", () => { if (!button.disabled) makeMove(build()); });
  };
  action('[data-action="roll"]', () => ({ type: "roll" }));
  action('[data-action="reroll"]', () => ({ type: "reroll" }));
  action('[data-action="bank"]', () => ({ type: "bank" }));
  if (selectButton) selectButton.addEventListener("click", () => {
    if (!selectButton.disabled) makeMove({ type: "select", dice_ids: [...selectedDice] });
  });
}

// ---------------------------------------------------------------------------
// Standings table
// ---------------------------------------------------------------------------

function standingsHtml(seats, room, game, localMark) {
  const leader = seats.reduce((best, seat) => (seat.score > (best ? best.score : -1) ? seat : best), null);
  const rows = seats
    .slice()
    .sort((left, right) => right.score - left.score)
    .map((seat) => standingsRow(seat, room, game, leader, localMark))
    .join("");
  return `
    <section class="ten-thousand-standings" aria-label="Standings">
      <table>
        <thead><tr><th>Player</th><th>Round</th><th>Score</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function standingsRow(seat, room, game, leader, localMark) {
  const name = seatName(room, seat.mark);
  const isLocal = seat.mark === localMark;
  const isLeader = leader && seat.mark === leader.mark && seat.score > 0;
  const classes = [
    "tt-standing",
    isLocal ? "is-local" : "",
    seat.resolved ? "is-resolved" : "",
    seat.phase === "farkled" ? "is-farkle" : "",
  ].filter(Boolean).join(" ");
  let status;
  if (game.status === "complete") status = game.winner === seat.mark ? "🏆 Winner" : "—";
  else if (seat.phase === "farkled") status = "Farkle";
  else if (seat.resolved) status = `+${fmt(seat.round_score)} ✓`;
  else if (seat.turn_score > 0) status = `${fmt(seat.turn_score)}…`;
  else status = seat.is_bot ? "🤖" : "Rolling…";
  return `
    <tr class="${classes}">
      <td>${isLeader ? "👑 " : ""}${escapeName(name)}${seat.is_bot ? " 🤖" : ""}</td>
      <td>${status}</td>
      <td><strong>${fmt(seat.score)}</strong></td>
    </tr>`;
}

// ---------------------------------------------------------------------------
// Dice rendering
// ---------------------------------------------------------------------------

function dieHtml(die, { rolling = false, bust = false } = {}) {
  const value = Number(die.value || 1);
  const blank = !die.value;
  const disabled = die.scored || blank || bust;
  const classes = [
    "ten-thousand-die",
    die.scored ? "scored" : "",
    bust ? "select-bust pending" : "",
    die.value ? "landed" : "blank",
  ].filter(Boolean).join(" ");
  const cubeClasses = ["die-cube", `die-face-${value}`, rolling ? "rolling" : ""].filter(Boolean).join(" ");
  return `
    <button class="${classes}" type="button" data-die-id="${die.id}" ${disabled ? "disabled" : ""} aria-label="Die ${die.id}, ${die.value || "not rolled"}">
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

// Mirrors the worker's scoring so dice colour live as they are tapped: green
// when a die contributes to a score, red when selected but non-scoring.
function tenThousandScoringIds(selected) {
  const scoring = new Set();
  if (!selected.length) return scoring;
  if (selected.length === 6) {
    const counts = [0, 0, 0, 0, 0, 0];
    selected.forEach((die) => { if (die.value >= 1 && die.value <= 6) counts[die.value - 1] += 1; });
    const straight = counts.every((count) => count === 1);
    const threePairs = counts.filter((count) => count === 2).length === 3;
    if (straight || threePairs) {
      selected.forEach((die) => scoring.add(die.id));
      return scoring;
    }
  }
  const byFace = new Map();
  selected.forEach((die) => {
    if (!byFace.has(die.value)) byFace.set(die.value, []);
    byFace.get(die.value).push(die.id);
  });
  byFace.forEach((ids, face) => {
    if (face === 1 || face === 5) ids.forEach((id) => scoring.add(id));
    else if (ids.length >= 3) ids.slice(0, 3).forEach((id) => scoring.add(id));
  });
  return scoring;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function markForPlayer(room, playerId) {
  const seat = (room.players || []).find((player) => player.id === playerId);
  return seat ? seat.mark : null;
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
