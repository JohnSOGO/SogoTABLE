// Chess Tutor — "Watch it played": auto-plays a line move by move with the
// note for each move, at an adjustable speed. Not graded; no input on the board.

import { escapeHtml } from "../../html-utils.js";
import { playClick } from "../../sound.js";
import { createBoard } from "./board.js";
import { formatHistory } from "./drill-view.js";

export const WATCH_SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 4];
const BASE_DELAY_MS = 2600; // per move at 1×; long notes get a little more time
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function watchDelay(speed, note = "") {
  const s = WATCH_SPEEDS.includes(Number(speed)) ? Number(speed) : 1;
  const reading = Math.min(2500, String(note).length * 18);
  return Math.round((BASE_DELAY_MS + reading) / s);
}

// lines: [{ line }...] played back to back. Returns a disposer.
export function mountWatch(host, { opening, lines, speed, onSpeed, onPractice, onExit }) {
  let lineIndex = 0;
  let ply = 0;
  let playing = true;
  let timer = null;
  let disposed = false;
  let currentSpeed = WATCH_SPEEDS.includes(Number(speed)) ? Number(speed) : 1;
  const sideName = opening.side === "w" ? "White" : "Black";

  host.innerHTML = `
    <div class="ct-drill">
      <div class="ct-board" data-board></div>
      <div class="ct-side">
        <div class="ct-card">
          <div class="ct-title"><h3>${escapeHtml(opening.name)}</h3><span class="ct-badge">Watch</span></div>
          <div class="ct-muted" data-sub></div>
        </div>
        <div class="ct-watch-controls" role="group" aria-label="Playback">
          <button type="button" class="ct-btn ct-secondary" data-w="restart" aria-label="Restart" title="Restart">⏮</button>
          <button type="button" class="ct-btn ct-secondary" data-w="back" aria-label="Previous move" title="Previous move">◀</button>
          <button type="button" class="ct-btn" data-w="play" aria-label="Play or pause" title="Play / pause"></button>
          <button type="button" class="ct-btn ct-secondary" data-w="fwd" aria-label="Next move" title="Next move">▶</button>
        </div>
        <label class="ct-speed">Speed <input type="range" min="0" max="${WATCH_SPEEDS.length - 1}" step="1" data-w="speed" aria-label="Playback speed"><output data-w="speedOut"></output></label>
        <div data-note></div>
        <div class="ct-moves" data-moves></div>
        <div class="ct-row">
          <button type="button" class="ct-btn" data-w="practice">Practice this line</button>
          <button type="button" class="ct-btn ct-secondary" data-w="exit">Back</button>
        </div>
      </div>
    </div>`;
  const $ = (sel) => host.querySelector(sel);
  const board = createBoard($("[data-board]"), { fen: START_FEN, side: opening.side, onMove: () => false });
  board.disableInput();
  const speedInput = $('[data-w="speed"]');
  speedInput.value = String(WATCH_SPEEDS.indexOf(currentSpeed));

  const line = () => lines[lineIndex];

  function render(animate) {
    const current = line();
    const plies = current.plies;
    const fen = ply === 0 ? START_FEN : plies[ply - 1].fenAfter;
    board.clearAnnotations();
    board.setFen(fen, animate);
    $("[data-sub]").textContent = `${current.name} · you play ${sideName}${lines.length > 1 ? ` · line ${lineIndex + 1} of ${lines.length}` : ""}`;
    $("[data-moves]").textContent = ply ? formatHistory(plies.slice(0, ply).map((p) => p.san)) : "Starting position";
    if (ply === 0) {
      $("[data-note]").innerHTML = `<div class="ct-note"><div class="ct-note-head">${escapeHtml(current.name)}</div>${escapeHtml(opening.blurb)}</div>`;
    } else {
      const p = plies[ply - 1];
      board.arrow(p.from, p.to, p.student ? "book" : "defender");
      const who = p.student ? "You" : "Opponent";
      const num = `${Math.floor((ply - 1) / 2) + 1}.${p.color === "b" ? ".." : ""}`;
      $("[data-note]").innerHTML = `<div class="ct-note ${p.student ? "ct-good" : ""}"><div class="ct-note-head">${who}: ${num} ${escapeHtml(p.san)}</div>${escapeHtml(p.note || "")}</div>`;
    }
    const atEnd = ply >= plies.length && lineIndex >= lines.length - 1;
    if (atEnd) playing = false;
    $('[data-w="play"]').textContent = playing ? "⏸ Pause" : atEnd ? "↺ Replay" : "▶ Play";
    $('[data-w="speedOut"]').textContent = `${currentSpeed}×`;
    $('[data-w="back"]').disabled = ply === 0 && lineIndex === 0;
    $('[data-w="fwd"]').disabled = atEnd;
    schedule();
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!playing || disposed) return;
    const plies = line().plies;
    const next = plies[ply];
    const note = ply ? plies[ply - 1].note : "";
    const wait = next ? watchDelay(currentSpeed, note) : watchDelay(currentSpeed, "x".repeat(80));
    timer = setTimeout(() => forward(true), ply === 0 ? Math.min(wait, 1200 / currentSpeed + 400) : wait);
  }

  function forward(auto) {
    if (disposed) return;
    const plies = line().plies;
    if (ply < plies.length) {
      ply += 1;
      if (auto) playClick();
    } else if (lineIndex < lines.length - 1) {
      lineIndex += 1;
      ply = 0;
    }
    render(true);
  }

  function back() {
    if (ply > 0) ply -= 1;
    else if (lineIndex > 0) { lineIndex -= 1; ply = line().plies.length; }
    render(false);
  }

  $('[data-w="play"]').addEventListener("click", () => {
    const atEnd = ply >= line().plies.length && lineIndex >= lines.length - 1;
    if (atEnd) { lineIndex = 0; ply = 0; playing = true; render(false); return; }
    playing = !playing;
    render(false);
  });
  $('[data-w="restart"]').addEventListener("click", () => { ply = 0; render(false); });
  $('[data-w="back"]').addEventListener("click", () => { playing = false; back(); });
  $('[data-w="fwd"]').addEventListener("click", () => { playing = false; forward(false); });
  speedInput.addEventListener("input", () => {
    currentSpeed = WATCH_SPEEDS[Number(speedInput.value)] || 1;
    $('[data-w="speedOut"]').textContent = `${currentSpeed}×`;
    onSpeed(currentSpeed);
    schedule();
  });
  $('[data-w="practice"]').addEventListener("click", () => { const id = line().id; dispose(); onPractice(id); });
  $('[data-w="exit"]').addEventListener("click", () => { dispose(); onExit(); });

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (timer) clearTimeout(timer);
    board.destroy();
  }

  render(false);
  return { dispose };
}
