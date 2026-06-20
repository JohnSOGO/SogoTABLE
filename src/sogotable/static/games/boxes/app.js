import { applyAction, chooseBotMove, getLegalActions, getPublicView } from "./rules.js";
import { createInitialState, normalizeState } from "./state.js";
import { renderBoxes } from "./render.js";
import {
  playClick,
  playConfirm,
  playInvalidMove,
  playLose,
  playTurnChanged,
  playWin,
  unlockAudio,
} from "../../sound.js";

const STORAGE_KEY = "sogotable.boxes.lab.state";
const MODE_KEY = "sogotable.boxes.lab.mode";

const els = {
  mode: document.getElementById("mode"),
  rows: document.getElementById("rows"),
  cols: document.getElementById("cols"),
  newGame: document.getElementById("newGame"),
  board: document.getElementById("board"),
  status: document.getElementById("status"),
  hint: document.getElementById("hint"),
  remoteNote: document.getElementById("remoteNote"),
};

let mode = localStorage.getItem(MODE_KEY) || "local";
let state = loadState() || newState();

syncControls();
bindEvents();
render();

function bindEvents() {
  document.addEventListener("pointerdown", unlockAudio, { once: true });
  document.addEventListener("keydown", unlockAudio, { once: true });

  els.newGame.addEventListener("click", () => {
    state = newState();
    saveState();
    render();
  });

  els.mode.addEventListener("change", () => {
    mode = els.mode.value;
    localStorage.setItem(MODE_KEY, mode);
    state = newState();
    saveState();
    render();
  });

  els.rows.addEventListener("change", () => {
    els.rows.value = String(clamp(Number(els.rows.value || 8), 2, 8));
  });

  els.cols.addEventListener("change", () => {
    els.cols.value = String(clamp(Number(els.cols.value || 5), 2, 8));
  });

  els.board.addEventListener("click", (event) => {
    const button = event.target.closest("[data-line-id]");
    if (button?.dataset.pointerHandled === "true") {
      delete button.dataset.pointerHandled;
      return;
    }
    if (!button || button.disabled) return;
    claimLine(button.dataset.lineId);
  });

  els.board.addEventListener("pointerdown", (event) => {
    const button = event.target.closest("[data-line-id]");
    if (!button || button.disabled) return;
    button.dataset.pointerHandled = "true";
    claimLine(button.dataset.lineId);
  });
}

function claimLine(lineId) {
  try {
    const previous = state;
    state = normalizeState(applyAction(state, { type: "claim_line", lineId }));
    playBoxesStateSound(previous, state, true);
    saveState();
    render();
    maybeBotMove();
  } catch (error) {
    playInvalidMove();
    els.hint.textContent = error.message;
  }
}

function maybeBotMove() {
  if (mode !== "bot" || state.status === "complete") return;
  const current = state.players[state.currentPlayerIndex];
  if (current?.kind !== "bot") return;
  window.setTimeout(() => {
    const move = chooseBotMove(state);
    if (!move) return;
    try {
      const previous = state;
      state = normalizeState(applyAction(state, move));
      playBoxesStateSound(previous, state, false);
      saveState();
      render();
      maybeBotMove();
    } catch (error) {
      playInvalidMove();
      els.hint.textContent = error.message;
    }
  }, 450);
}

function playBoxesStateSound(previous, next, humanIntent) {
  if (!next || !previous) return;
  if (next.status === "complete" && previous.status !== "complete") {
    const activePlayer = next.players[next.currentPlayerIndex];
    if (next.result?.outcome === "draw") playConfirm();
    else if (activePlayer && next.result?.winnerId === activePlayer.id) playWin();
    else playLose();
    return;
  }
  const capturedCount = Array.isArray(next.lastMove?.captured) ? next.lastMove.captured.length : 0;
  if (capturedCount) {
    playConfirm();
    return;
  }
  if (humanIntent) playClick();
  if (previous.currentPlayerIndex !== next.currentPlayerIndex) {
    const player = next.players[next.currentPlayerIndex];
    playTurnChanged(player?.mark || (next.currentPlayerIndex === 1 ? "O" : "X"));
  }
}

function render() {
  state = normalizeState(state);
  const view = getPublicView(state);
  renderBoxes(els.board, view);
  renderStatus(view);
  renderModeNote();
}

function renderStatus(view) {
  const current = view.players[view.currentPlayerIndex];
  const legalCount = getLegalActions(state).length;
  if (view.status === "complete") {
    if (view.result?.outcome === "draw") {
      els.status.textContent = "Draw game.";
    } else {
      const winner = view.players.find((player) => player.id === view.result?.winnerId);
      els.status.textContent = winner ? `${winner.name} wins ${winner.score}-${otherScore(winner, view)}.` : "Game complete.";
    }
    els.hint.textContent = "Start a new game to play again.";
    return;
  }
  els.status.textContent = current ? `${current.name}'s turn` : "Waiting";
  if (mode === "bot" && current?.kind === "bot") {
    els.hint.textContent = "Bot is choosing an edge.";
    return;
  }
  const lastMove = view.lastMove;
  const mover = view.players.find((player) => player.id === lastMove?.playerId);
  if (mover && Array.isArray(lastMove.captured) && lastMove.captured.length) {
    els.hint.textContent = `${mover.name} claimed ${lastMove.captured.length} box${lastMove.captured.length === 1 ? "" : "es"} and plays again.`;
    return;
  }
  if (mover && lastMove?.lineId) {
    els.hint.textContent = `${mover.name} claimed ${lastMove.lineId}. ${legalCount} edges remain.`;
    return;
  }
  els.hint.textContent = `${legalCount} edges available. Complete a box to keep the turn.`;
}

function renderModeNote() {
  els.remoteNote.hidden = mode !== "remote";
  if (mode === "remote") {
    els.remoteNote.textContent = "Remote hosted play is planned for the Worker room path. This lab keeps the board playable locally so the game can still be tested.";
  }
}

function newState() {
  const rows = clamp(Number(els.rows?.value || 8), 2, 8);
  const cols = clamp(Number(els.cols?.value || 5), 2, 8);
  const players = mode === "bot"
    ? [
        { id: "player-1", name: "Player 1", mark: "P1", icon: "🙂", color: "#2563eb", kind: "human" },
        { id: "bot-1", name: "Box Bot", mark: "AI", icon: "🤖", color: "#dc2626", kind: "bot" },
      ]
    : [
        { id: "player-1", name: "Player 1", mark: "P1", icon: "🙂", color: "#2563eb", kind: "human" },
        { id: "player-2", name: "Player 2", mark: "P2", icon: "😎", color: "#dc2626", kind: "human" },
      ];
  return createInitialState({ rows, cols, players });
}

function syncControls() {
  els.mode.value = mode;
  els.rows.value = String(state.rows || 8);
  els.cols.value = String(state.cols || 5);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function otherScore(winner, view) {
  return view.players.find((player) => player.id !== winner.id)?.score || 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
