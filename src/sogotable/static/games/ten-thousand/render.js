const FACE_PIPS = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

// Only actual dice rolls tumble. A declared farkle acts on the dice already on
// the table — they just turn red in place, no re-animation.
const ROLL_MOVE_TYPES = new Set(["roll", "reroll"]);
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
  const { room, game, pendingMove } = ctx;
  const seats = Array.isArray(game.players) ? game.players : [];
  const localMark = markForPlayer(room, ctx.localPlayerId);
  const localSeat = seats.find((seat) => seat.mark === localMark) || null;
  const complete = game.status === "complete";
  // Bot rows replay in step with how many times the local human has rolled this
  // round; once the human's turn ends (or the game is over) the bots' final
  // results are shown.
  const pacing = {
    rollCount: localSeat ? Number(localSeat.roll_count || 0) : 0,
    humanDone: complete || Boolean(localSeat && localSeat.resolved),
  };

  host.innerHTML = `
    ${localSeat && !complete ? trayHtml(localSeat, game, pendingMove) : ""}
    ${standingsHtml(seats, room, game, pacing)}
  `;

  if (localSeat && !complete) wireTray(host, localSeat, game, ctx);
  wireStandings(host);
}

function trayHtml(seat, game, pendingMove) {
  const resolved = Boolean(seat.resolved);
  const farkled = seat.phase === "farkled";
  // Keep the busted roll red for the whole farkle state. Drive it off the phase
  // (reliably "farkled" while busted) AND the finish_state (so it persists after
  // acknowledging), until the next round resets the dice. A farkle only happens
  // after the player declares it themselves (the Red X), so showing red here is
  // always intentional.
  const showBust = farkled
    || seat.finish_state === "farkled_pending_ack"
    || seat.finish_state === "farkled_acked";
  const canAct = game.status === "playing" && !resolved && !pendingMove;
  // Roll has its own gate: it stays available to a resolved seat while the round
  // is pending advance, so "Roll to start the next round" works.
  const canRoll = game.status === "playing" && !pendingMove && Boolean(seat.can_roll);
  const dice = Array.isArray(seat.dice) ? seat.dice : [];
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

  // On a farkle, the unscored dice are red — except any that were actually part
  // of a scoring play, which are marked yellow to show the player the move they
  // missed. (Empty when the bust was a true farkle with no play.)
  const missedIds = showBust ? tenThousandMissedScoringIds(dice) : new Set();
  const diceHtml = dice
    .map((die) => dieHtml(die, {
      rolling: rolledIds.has(die.id),
      missed: showBust && !die.scored && missedIds.has(die.id),
      bust: showBust && !die.scored && !missedIds.has(die.id),
    }))
    .join("");
  // The first slot is "Play+Dice" to roll, but once a roll is on the table it
  // becomes the "Red X": the player must declare their own farkle. There is no
  // auto-detect, so the game never reveals whether a scoring play exists — you
  // either find one and select it, or you give up and bust yourself. The Red X
  // only enables while a fresh roll is unselected (phase "rolled").
  const canDeclareFarkle = canAct && seat.phase === "rolled";
  const firstButton = canRoll
    ? `<button class="tt-action" type="button" data-action="roll" aria-label="Play dice">▶️🎲</button>`
    : `<button class="tt-action tt-farkle-x" type="button" data-action="declare-farkle" ${canDeclareFarkle ? "" : "disabled"} aria-label="No scoring play — declare a farkle">❌</button>`;
  const actionsHtml = farkled && !resolved
    ? `<button class="primary tt-ack" type="button" data-action="ack" disabled>You Farkled!</button>`
    : `
      ${firstButton}
      <button class="tt-action" type="button" data-action="select" disabled aria-label="Score selected dice">✏️📈</button>
      <button class="tt-action" type="button" data-action="reroll" ${canAct && seat.can_reroll ? "" : "disabled"} aria-label="Press your luck and roll the remaining dice">🎰🎲</button>
      <button class="tt-action" type="button" data-action="bank" ${canAct && seat.can_bank ? "" : "disabled"} aria-label="Bank turn score">🏦</button>`;

  // Opening rule: a seat that has not yet banked must reach the opening minimum
  // before banking unlocks. Explain the disabled bank button so it is not silent.
  const openingMinimum = Number(game.opening_minimum || 0);
  const turnScore = Number(seat.turn_score || 0);
  const needsOpening = !showBust && !resolved && Number(seat.score || 0) === 0
    && openingMinimum > 0 && turnScore > 0 && turnScore < openingMinimum
    && (seat.phase === "rolled" || seat.phase === "selected");
  const hintHtml = needsOpening
    ? `<p class="ten-thousand-message tt-opening-hint">Reach ${fmt(openingMinimum)} this turn to get on the board.</p>`
    : "";

  return `
    <section class="ten-thousand-tray">
      <div class="ten-thousand-scoreboard">
        <div><span class="label">Banked</span><strong>${fmt(seat.score)}</strong></div>
        <div><span class="label">This turn</span><strong data-turn-score>${fmt(seat.turn_score)}</strong></div>
        <div><span class="label">Farkles</span><strong>${fmt(seat.farkles)}</strong></div>
      </div>
      <div class="ten-thousand-dice" aria-label="Dice">${diceHtml}</div>
      <div class="ten-thousand-actions" aria-label="Dice actions">${actionsHtml}</div>
      ${hintHtml}
    </section>`;
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
  action('[data-action="ack"]', () => ({ type: "ack_farkle" }));
  action('[data-action="roll"]', () => ({ type: "roll" }));
  action('[data-action="declare-farkle"]', () => ({ type: "declare_farkle" }));
  action('[data-action="reroll"]', () => ({ type: "reroll" }));
  action('[data-action="bank"]', () => ({ type: "bank" }));
  if (selectButton) selectButton.addEventListener("click", () => {
    if (!selectButton.disabled) makeMove({ type: "select", dice_ids: [...selectedDice] });
  });

  refreshSelection();
}

function standingsHtml(seats, room, game, pacing) {
  const rows = seats
    .slice()
    .sort((left, right) => right.score - left.score)
    .map((seat) => standingsRow(seat, room, game, pacing))
    .join("");
  return `
    <section class="ten-thousand-standings" aria-label="Standings">
      <table>
        <thead><tr><th>Player</th><th aria-label="Status">Status</th><th>Farkle</th><th>Score</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

// Status emoji shared by humans and bots: a slot machine while rolling/pressing,
// a bank once banked, a red X on a farkle.
function tenThousandStatusEmoji(status) {
  if (status === "banked") return "\u{1F3E6}"; // 🏦
  if (status === "farkled") return "❌"; // ❌
  return "\u{1F3B0}"; // 🎰 rolling / pressing
}

function tenThousandSeatStatus(seat) {
  if (seat.finish_state === "banked") return "banked";
  if (seat.finish_state === "farkled_pending_ack" || seat.finish_state === "farkled_acked" || seat.phase === "farkled") return "farkled";
  return "rolling";
}

function standingsRow(seat, room, game, pacing) {
  const name = seatName(room, seat.mark);
  const emoji = seatEmoji(room, seat.mark);
  const complete = game.status === "complete";
  const paced = seat.is_bot ? tenThousandBotPaced(seat, pacing) : null;

  let statusHtml;
  let statusTitle;
  let scoreHtml;
  let rowStatus;
  let farkleCell;
  if (complete && seat.mark === game.winner) {
    statusHtml = "\u{1F3C6}"; // 🏆
    statusTitle = "Winner";
    rowStatus = "banked";
    scoreHtml = `<strong>${fmt(seat.score)}</strong>`;
    farkleCell = fmt(seat.farkles);
  } else if (paced) {
    // Mirror the human row: the running gain rides next to the emoji in the
    // status column and as "+gain" in the score column — always shown, so a bank
    // keeps showing how much was banked and a farkle shows +0.
    const flames = paced.hot > 0 ? "\u{1F525}".repeat(paced.hot) : ""; // 🔥 per hot-dice completion
    statusHtml = `${flames}${tenThousandStatusEmoji(paced.status)}<span class="tt-status-inline">${fmt(paced.gain)}</span>`;
    statusTitle = paced.status === "banked" ? `Banked ${fmt(paced.gain)}` : paced.status === "farkled" ? "Farkled, +0" : `Rolling, ${fmt(paced.gain)} this turn`;
    rowStatus = paced.status;
    scoreHtml = `<strong>${fmt(paced.carried)}</strong><span class="tt-standing-turn">+${fmt(paced.gain)}</span>`;
    farkleCell = fmt(paced.farkles);
  } else {
    const status = tenThousandSeatStatus(seat);
    const round = Number(seat.round_score || 0);
    const gain = Number(seat.turn_score || 0) + round; // live while rolling, banked amount once banked, 0 on farkle
    const carried = Math.max(0, Number(seat.score || 0) - round);
    statusHtml = `${tenThousandStatusEmoji(status)}<span class="tt-status-inline">${fmt(gain)}</span>`;
    statusTitle = status === "banked" ? `Banked ${fmt(gain)}` : status === "farkled" ? "Farkled, +0" : `Rolling, ${fmt(gain)} this turn`;
    rowStatus = status;
    scoreHtml = `<strong>${fmt(carried)}</strong><span class="tt-standing-turn">+${fmt(gain)}</span>`;
    farkleCell = fmt(seat.farkles);
  }

  const classes = ["tt-standing"];
  if (rowStatus === "banked") classes.push("is-finished");
  if (rowStatus === "farkled") classes.push("is-farkle");

  return `
    <tr class="${classes.join(" ")}">
      <td>
        <button class="tt-standing-player" type="button" data-standing-player="${seat.mark}" title="Tap to show name">
          <span class="tt-standing-player-icon">${emoji}</span>
          <span class="tt-standing-player-name">${escapeName(name)}</span>
        </button>
      </td>
      <td class="tt-standing-status" title="${escapeName(statusTitle)}">${statusHtml}</td>
      <td>${farkleCell}</td>
      <td>${scoreHtml}</td>
    </tr>`;
}

// Maps a bot's resolved-round trajectory to the snapshot the human should see
// right now: indexed by the local human's roll count, clamped to the final
// entry once the human's turn ends. The farkle tally is paced too, so a bot's
// bust is not revealed by the count ticking up before the status does.
function tenThousandBotPaced(seat, pacing) {
  const traj = Array.isArray(seat.bot_trajectory) ? seat.bot_trajectory : [];
  if (!traj.length) return null;
  const lastIndex = traj.length - 1;
  const index = pacing.humanDone ? lastIndex : Math.min(Math.max(pacing.rollCount, 0), lastIndex);
  const snap = traj[index];
  const farkledThisRound = traj[lastIndex].status === "farkled";
  const baseFarkles = Math.max(0, Number(seat.farkles || 0) - (farkledThisRound ? 1 : 0));
  // carried = the bot's score before this round; gain = this turn's contribution
  // (the live accrual while rolling, the banked amount once banked, and 0 on a
  // farkle, since the total drops back to the baseline). Mirrors the human row.
  const carried = Number((traj[0] && traj[0].total) || 0);
  return {
    carried,
    gain: Math.max(0, Number(snap.total || 0) - carried),
    status: snap.status,
    hot: Number(snap.hot || 0),
    farkles: baseFarkles + (snap.status === "farkled" ? 1 : 0),
  };
}

function wireStandings(host) {
  [...host.querySelectorAll("[data-standing-player]")].forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.toggle("is-expanded");
    });
  });
}

function dieHtml(die, { rolling = false, bust = false, missed = false } = {}) {
  const rawValue = Number(die.value);
  const hasValue = Number.isInteger(rawValue) && rawValue >= 1 && rawValue <= 6;
  if ((bust || missed) && !hasValue) throw new Error("Ten Thousand farkle dice must preserve their rolled values.");
  const value = hasValue ? rawValue : 1;
  const blank = !hasValue;
  const disabled = die.scored || blank;
  // On a declared farkle, a die that was actually part of a scoring play is
  // marked yellow (the move you missed) rather than red.
  const classes = [
    "ten-thousand-die",
    die.scored ? "scored" : "",
    missed ? "tt-missed pending" : "",
    bust ? "select-bust pending farkled" : "",
    hasValue ? "landed" : "blank",
  ].filter(Boolean).join(" ");
  const cubeClasses = ["die-cube", `die-face-${value}`, rolling ? "rolling" : ""].filter(Boolean).join(" ");
  const label = missed ? `, missed scoring die ${value}` : "";
  return `
    <button class="${classes}" type="button" data-die-id="${die.id}" ${disabled ? "disabled" : ""} aria-label="Die ${die.id}, ${hasValue ? value : "not rolled"}${label}">
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

// The ids of the best-scoring keep among the still-rollable dice — i.e. the play
// the player had available. Empty when there was genuinely no scoring play.
// Brute-forces the (at most 2^6) subsets and keeps the highest-scoring valid one.
function tenThousandMissedScoringIds(dice) {
  const avail = (Array.isArray(dice) ? dice : [])
    .filter((die) => !die.scored && Number(die.value) >= 1 && Number(die.value) <= 6);
  let bestIds = new Set();
  let bestScore = 0;
  const total = 1 << avail.length;
  for (let mask = 1; mask < total; mask += 1) {
    const subset = [];
    for (let index = 0; index < avail.length; index += 1) {
      if (mask & (1 << index)) subset.push(avail[index]);
    }
    const result = tenThousandSelectionScore(subset);
    if (result.valid && result.score > bestScore) {
      bestScore = result.score;
      bestIds = new Set(subset.map((die) => die.id));
    }
  }
  return bestIds;
}

function tenThousandSelectionScore(selected) {
  const source = Array.isArray(selected) ? selected : [];
  const scoringIds = new Set();
  if (!source.length) return { scoringIds, score: 0, valid: false };
  // Keep this in lockstep with the worker scorer (tenThousandScoreValues):
  // full six-dice combos first (straight / three pairs / two triplets), then
  // n-of-a-kind with the doubling rule (four x2, five x4, six x8), then leftover
  // single 1s/5s. Any other leftover die does not score, so a full selection
  // that includes one is invalid. This drives the live preview the player sees.
  const byFace = new Map();
  source.forEach((die) => {
    if (die.value >= 1 && die.value <= 6) {
      if (!byFace.has(die.value)) byFace.set(die.value, []);
      byFace.get(die.value).push(die.id);
    }
  });
  if (source.length === 6) {
    const counts = [0, 0, 0, 0, 0, 0];
    byFace.forEach((ids, face) => { counts[face - 1] = ids.length; });
    const straight = counts.every((count) => count === 1);
    const threePairs = counts.filter((count) => count === 2).length === 3;
    const twoTriplets = counts.filter((count) => count === 3).length === 2;
    if (straight || threePairs || twoTriplets) {
      source.forEach((die) => scoringIds.add(die.id));
      return { scoringIds, score: twoTriplets ? 2500 : 1500, valid: true };
    }
  }
  let score = 0;
  byFace.forEach((ids, face) => {
    const count = ids.length;
    let used = 0;
    if (count >= 3) {
      const base = face === 1 ? 1000 : face * 100;
      score += base * Math.pow(2, count - 3);
      used = count;
    } else if (face === 1) {
      score += count * 100;
      used = count;
    } else if (face === 5) {
      score += count * 50;
      used = count;
    }
    ids.slice(0, used).forEach((id) => scoringIds.add(id));
  });
  return { scoringIds, score, valid: scoringIds.size === source.length };
}

function markForPlayer(room, playerId) {
  const seat = (room.players || []).find((player) => player.id === playerId);
  return seat ? seat.mark : null;
}

function seatEmoji(room, mark) {
  const seat = (room.players || []).find((player) => player.mark === mark);
  return seat && seat.icon ? seat.icon : "\u{1F642}";
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

