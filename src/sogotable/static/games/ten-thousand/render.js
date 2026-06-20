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
  host.querySelectorAll(".ten-thousand-die").forEach((button) => {
    button.addEventListener("click", () => {
      if (!canAct || button.disabled) return;
      const id = button.dataset.dieId;
      if (selectedDice.has(id)) selectedDice.delete(id);
      else selectedDice.add(id);
      button.classList.toggle("pending", selectedDice.has(id));
      selectButton.disabled = selectedDice.size === 0;
    });
  });
  host.querySelector('[data-action="roll"]').addEventListener("click", () => makeMove({ type: "roll" }));
  host.querySelector('[data-action="reroll"]').addEventListener("click", () => makeMove({ type: "reroll" }));
  host.querySelector('[data-action="bank"]').addEventListener("click", () => makeMove({ type: "bank" }));
  selectButton.addEventListener("click", () => makeMove({ type: "select", dice_ids: [...selectedDice] }));
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
