const FACE_PIPS = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

const ROLL_MOVE_TYPES = new Set(["roll", "reroll", "farkle"]);
// Tracks the move_count we last played the tumble animation for, so a roll
// animates exactly once and re-renders (select, bank, pending, socket echoes)
// stay still instead of replaying the roll.
let lastAnimatedMoveCount = -1;

export function renderTenThousandGame({
  host,
  game,
  room,
  selectedPlayerId,
  pendingMove,
  makeMove,
  escapeHtml,
}) {
  if (!host || !game) return;
  host.className = "macro-board ten-thousand-table";
  const selectedSeat = room.players.find((seat) => seat.id === selectedPlayerId);
  const canAct = Boolean(selectedSeat && selectedSeat.mark === game.current_player && game.status === "playing" && !pendingMove);
  const selectedDice = new Set();
  const dice = Array.isArray(game.dice) ? game.dice : [];
  const lastMove = game.last_move || {};
  const moveCount = Number(game.move_count || 0);
  const isFreshRoll = ROLL_MOVE_TYPES.has(lastMove.type) && moveCount !== lastAnimatedMoveCount && !pendingMove;
  const rolledIds = isFreshRoll
    ? new Set((Array.isArray(lastMove.dice) ? lastMove.dice : []).map((die) => die.id))
    : new Set();
  if (isFreshRoll) lastAnimatedMoveCount = moveCount;
  host.innerHTML = `
    <section class="ten-thousand-scoreboard">
      <div><span class="label">Banked</span><strong>${Number(game.score || 0).toLocaleString()}</strong></div>
      <div><span class="label">Turn</span><strong>${Number(game.turn_score || 0).toLocaleString()}</strong></div>
      <div><span class="label">Farkles</span><strong>${Number(game.farkles || 0).toLocaleString()}</strong></div>
    </section>
    <section class="ten-thousand-dice" aria-label="Dice">
      ${dice.map((die) => dieHtml(die, rolledIds.has(die.id))).join("")}
    </section>
    <section class="ten-thousand-actions" aria-label="Dice actions">
      <button class="primary" type="button" data-action="roll" ${!canAct || !game.can_roll ? "disabled" : ""}>Roll</button>
      <button class="secondary" type="button" data-action="select" disabled>Score Selected</button>
      <button class="secondary" type="button" data-action="reroll" ${!canAct || !game.can_reroll ? "disabled" : ""} aria-label="Press your luck and roll the remaining dice">Press</button>
      <button class="primary" type="button" data-action="bank" ${!canAct || !game.can_bank ? "disabled" : ""}>Bank</button>
    </section>
    <p class="ten-thousand-message">${escapeHtml(statusText(game))}</p>
  `;

  const selectButton = host.querySelector('[data-action="select"]');
  const valueById = new Map(dice.map((die) => [die.id, Number(die.value) || 0]));
  const dieButtons = [...host.querySelectorAll(".ten-thousand-die")];

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
    // Enable scoring only when every selected die contributes (matches the
    // worker, which rejects a selection with any non-scoring die).
    selectButton.disabled = !selected.length || selected.some((die) => !scoringIds.has(die.id));
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
  host.querySelector('[data-action="roll"]').addEventListener("click", () => makeMove({ type: "roll" }));
  host.querySelector('[data-action="reroll"]').addEventListener("click", () => makeMove({ type: "reroll" }));
  host.querySelector('[data-action="bank"]').addEventListener("click", () => makeMove({ type: "bank" }));
  selectButton.addEventListener("click", () => makeMove({ type: "select", dice_ids: [...selectedDice] }));
}

// Mirrors the worker's scoring rules so dice can be coloured live as they are
// tapped (selection never round-trips to the server). Returns the set of
// selected die ids that contribute to a score; the rest are non-scoring (red).
function tenThousandScoringIds(selected) {
  const scoring = new Set();
  if (!selected.length) return scoring;
  if (selected.length === 6) {
    const counts = [0, 0, 0, 0, 0, 0];
    selected.forEach((die) => {
      if (die.value >= 1 && die.value <= 6) counts[die.value - 1] += 1;
    });
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
    if (face === 1 || face === 5) {
      ids.forEach((id) => scoring.add(id)); // single 1s and 5s always score
    } else if (ids.length >= 3) {
      ids.slice(0, 3).forEach((id) => scoring.add(id)); // one triple scores; extras do not
    }
  });
  return scoring;
}

function dieHtml(die, rolling = false) {
  const value = Number(die.value || 1);
  const disabled = die.scored || !die.value;
  const classes = [
    "ten-thousand-die",
    die.scored ? "scored" : "",
    die.selected ? "selected" : "",
    die.value ? "landed" : "blank",
  ].filter(Boolean).join(" ");
  const cubeClasses = ["die-cube", `die-face-${value}`, rolling ? "rolling" : ""].filter(Boolean).join(" ");
  return `
    <button class="${classes}" type="button" data-die-id="${die.id}" ${disabled ? "disabled" : ""} aria-label="Die ${die.id}, ${die.value || "not rolled"}">
      <span class="${cubeClasses}">
        ${[1, 2, 3, 4, 5, 6].map((face) => faceHtml(face)).join("")}
      </span>
    </button>
  `;
}

function faceHtml(face) {
  const pips = new Set(FACE_PIPS[face] || []);
  return `
    <span class="die-face face-${face}">
      ${Array.from({ length: 9 }, (_, index) => `<span class="${pips.has(index + 1) ? "pip" : ""}"></span>`).join("")}
    </span>
  `;
}

function statusText(game) {
  if (game.phase === "complete") return `You banked ${Number(game.score || 0).toLocaleString()} and reached 10,000.`;
  if (game.phase === "farkled") return "Farkle. Turn points are gone. Roll again.";
  if (game.phase === "rolled") return "Select scoring dice.";
  if (game.phase === "selected") return "Bank the turn score or press your luck.";
  return "Roll the dice.";
}
