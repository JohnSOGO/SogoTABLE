// Chess Tutor — the drill screen: board + coaching panel for one line.
// The drill engine (rules.js) decides everything; this view renders its state,
// forwards board input, and paces the defender's replies.

import { escapeHtml } from "../../html-utils.js";
import { playClick, playInvalidMove, playConfirm } from "../../sound.js";
import { createBoard } from "./board.js";
import { createDrill, submitMove, playDefenderMove, takeHint, expectedMove, isStudentTurn } from "./rules.js";

const MODE_LABEL = { learn: "Learn", quiz: "From memory", review: "Review", spar: "Spar" };
const DEFENDER_DELAY_MS = 550;

export function formatHistory(history) {
  return history.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}.${san}` : san)).join(" ");
}

function sideName(side) {
  return side === "w" ? "White" : "Black";
}

// item: { openingId, lineId, mode }. Returns a disposer.
export function mountDrill(host, { opening, item, helps, weakness, queueLeft, onFinish, onExit, onNext }) {
  let drill = createDrill(opening, { mode: item.mode, lineId: item.lineId });
  let timer = null;
  let finished = false;
  let disposed = false;
  const line = item.lineId ? opening.lines.find((l) => l.id === item.lineId) : null;
  const title = line ? line.name : "Spar the defender";

  host.innerHTML = `
    <div class="ct-drill">
      <div class="ct-board" data-board></div>
      <div class="ct-side">
        <div class="ct-card">
          <div class="ct-title"><h3>${escapeHtml(opening.name)}</h3><span class="ct-badge">${MODE_LABEL[item.mode]}</span></div>
          <div class="ct-muted">${escapeHtml(title)} · you play ${sideName(opening.side)}${queueLeft ? ` · ${queueLeft} more after this` : ""}</div>
        </div>
        <div class="ct-prompt" data-prompt></div>
        <div data-note></div>
        <div class="ct-row" data-controls>
          <button type="button" class="ct-btn ct-secondary" data-action="hint">Hint</button>
          <button type="button" class="ct-btn ct-secondary" data-action="show">Show move</button>
        </div>
        <div class="ct-moves" data-moves></div>
        <div class="ct-row"><button type="button" class="ct-btn ct-secondary" data-action="exit">Stop drill</button></div>
      </div>
    </div>`;
  const $ = (sel) => host.querySelector(sel);
  const hintButton = $('[data-action="hint"]');
  const showButton = $('[data-action="show"]');
  hintButton.hidden = !helps.hints;

  const board = createBoard($("[data-board]"), { fen: drill.fen, side: opening.side, onMove: handleBoardMove });

  // A short coaching log: the last few notes, newest at the bottom. Transient
  // notes (a mistake, "play this") are replaced by whatever comes next.
  let notes = [];
  function setNote(html, tone = "", { transient = false } = {}) {
    notes = notes.filter((n) => !n.transient);
    if (html) notes.push({ html, tone, transient });
    notes = notes.slice(-3);
    $("[data-note]").innerHTML = notes.map((n) => `<div class="ct-note ${n.tone}">${n.html}</div>`).join("");
  }

  function setPrompt(text) {
    $("[data-prompt]").textContent = text;
  }

  function renderMoves() {
    $("[data-moves]").textContent = drill.history.length ? formatHistory(drill.history) : "Starting position";
  }

  function showBookMove(expected, kind = "book") {
    board.arrow(expected.from, expected.to, kind);
  }

  function step() {
    if (disposed) return;
    renderMoves();
    if (drill.done) { finish(); return; }
    if (isStudentTurn(drill)) {
      const expected = expectedMove(opening, drill);
      setPrompt(`Your move as ${sideName(opening.side)}`);
      $("[data-controls]").hidden = false;
      if (drill.mode === "learn" && expected) {
        showBookMove(expected);
        setNote(`<div class="ct-note-head">Play <b>${escapeHtml(expected.san)}</b></div>${escapeHtml(expected.note)}`, "", { transient: true });
      }
      board.enableInput();
      return;
    }
    board.disableInput();
    $("[data-controls]").hidden = true;
    setPrompt("The defender is replying…");
    timer = setTimeout(defenderTurn, DEFENDER_DELAY_MS);
  }

  function defenderTurn() {
    timer = null;
    if (disposed) return;
    const result = playDefenderMove(opening, drill, Math.random, weakness);
    drill = result.drill;
    if (result.ply) {
      board.clearAnnotations();
      board.setFen(drill.fen, true);
      if (helps.arrows) board.arrow(result.ply.from, result.ply.to, "defender");
      playClick();
      const prefix = result.ply.color === "b" ? "…" : "";
      if (helps.explain && result.ply.note) {
        setNote(`<div class="ct-note-head">Defender: ${prefix}${escapeHtml(result.ply.san)}</div>${escapeHtml(result.ply.note)}`);
      }
    }
    step();
  }

  function handleBoardMove({ from, to }) {
    if (disposed || !isStudentTurn(drill)) return false;
    const { drill: next, outcome } = submitMove(opening, drill, { from, to });
    if (outcome.kind === "illegal") {
      playInvalidMove();
      return false;
    }
    drill = next;
    if (outcome.kind === "correct") {
      board.clearAnnotations();
      board.disableInput();
      // Re-sync after the board drops the piece (castling moves the rook too).
      setTimeout(() => !disposed && board.setFen(drill.fen, false), 0);
      playConfirm();
      const head = `<div class="ct-note-head">✓ ${escapeHtml(outcome.san)}${outcome.grade === "hinted" ? " (with help)" : ""}</div>`;
      setNote(helps.explain && outcome.note && drill.mode !== "learn" ? head + escapeHtml(outcome.note) : head, "ct-good");
      step();
      return true;
    }
    if (outcome.kind === "alternative") {
      setNote(`<div class="ct-note-head">${escapeHtml(outcome.san)} is also fine</div>${escapeHtml(outcome.message)} Try the course move.`, "", { transient: true });
      return false;
    }
    // wrong
    playInvalidMove();
    board.clearAnnotations();
    board.mark(from, "wrong");
    board.mark(to, "wrong");
    if (drill.mode === "learn" && expectedMove(opening, drill)) showBookMove(expectedMove(opening, drill));
    const reasons = helps.mistakeDetail && outcome.reasons.length
      ? `<ul>${outcome.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>` : "";
    setNote(`<div class="ct-note-head">✗ ${escapeHtml(outcome.san)} is not the move here</div>${reasons}<div>Try again, or tap <b>Show move</b>.</div>`, "ct-bad", { transient: true });
    return false;
  }

  hintButton.addEventListener("click", () => {
    if (!isStudentTurn(drill)) return;
    const expected = expectedMove(opening, drill);
    if (!expected) return;
    drill = takeHint(drill);
    if (drill.hintLevel === 1) board.mark(expected.from, "hint");
    else showBookMove(expected, "hint");
  });

  showButton.addEventListener("click", () => {
    if (!isStudentTurn(drill)) return;
    const expected = expectedMove(opening, drill);
    if (!expected) return;
    drill = takeHint(takeHint(drill));
    board.clearAnnotations();
    showBookMove(expected, "hint");
    setNote(`<div class="ct-note-head">The move is <b>${escapeHtml(expected.san)}</b></div>${escapeHtml(expected.note)}`, "", { transient: true });
  });

  $('[data-action="exit"]').addEventListener("click", () => {
    const snapshot = drill;
    dispose();
    onExit(snapshot);
  });

  function finish() {
    if (finished) return;
    finished = true;
    board.disableInput();
    $("[data-controls]").hidden = true;
    const summary = onFinish(drill);
    const perfect = !drill.mistakes;
    const learn = drill.mode === "learn";
    setPrompt(learn ? "Line learned. Now play it from memory." : perfect ? "Perfect line!" : "Line complete");
    setNote("");
    const note = $("[data-note]").innerHTML;
    const detail = learn ? "" : perfect
      ? `<div class="ct-big">🏆</div><div>No mistakes. ${escapeHtml(summary.nextText || "")}</div>`
      : `<div class="ct-big">💪</div><div>${drill.mistakes} mistake${drill.mistakes === 1 ? "" : "s"}. The positions you missed come back soon${summary.requeued ? ", and this line repeats at the end of the session" : ""}.</div>`;
    $("[data-note]").innerHTML = `${note}<div class="ct-card ct-summary">${detail}
      <button type="button" class="ct-btn" data-action="next">${escapeHtml(summary.nextLabel)}</button></div>`;
    $('[data-action="next"]').addEventListener("click", () => {
      dispose();
      onNext();
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (timer) clearTimeout(timer);
    board.destroy();
  }

  step();
  return { dispose, current: () => drill };
}
