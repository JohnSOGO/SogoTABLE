// Chess Tutor — the drill engine. Pure: no DOM, no storage, RNG passed in.
//
// A drill walks one opening line (learn / quiz / review) or wanders the whole
// opening tree (spar), alternating the student's move and the defender's
// reply. The student's move is checked against the book; a wrong move is
// explained (curated text first, then simple chess heuristics) and has to be
// corrected before the drill continues. Each student position gets one grade
// per drill, which the scheduler turns into the spaced-repetition update.
//
//   mode "learn"  every student move is shown first (arrow + why); not graded
//   mode "quiz"   the same line straight after learning, from memory; graded
//   mode "review" a due line from memory; graded
//   mode "spar"   the defender picks book replies, weighted by popularity and
//                 by the student's weak lines; graded

import { Chess } from "../../vendor/chessjs/chess.js";
import { bookMoves, cardKey } from "./course.js";

export const PIECE_NAMES = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

export function createDrill(opening, { mode = "review", lineId = null } = {}) {
  const line = lineId ? opening.lines.find((l) => l.id === lineId) : null;
  if (mode !== "spar" && !line) throw new Error(`Unknown line "${lineId}" in ${opening.id}.`);
  return {
    openingId: opening.id,
    side: opening.side,
    mode,
    lineId: line ? line.id : null,
    ply: 0,
    fen: new Chess().fen(),
    history: [],
    lineIds: line ? [line.id] : opening.lines.map((l) => l.id),
    hintLevel: 0,
    tries: 0,
    mistakes: 0,
    grades: {},
    done: false,
    lastMove: null,
  };
}

function turnOf(fen) {
  return fen.split(" ")[1];
}

export function isStudentTurn(drill) {
  return !drill.done && turnOf(drill.fen) === drill.side;
}

// The book move the student should play now, or null.
export function expectedMove(opening, drill) {
  if (drill.done || !isStudentTurn(drill)) return null;
  if (drill.mode === "spar") {
    const candidates = bookMoves(opening, drill.fen).filter((n) => n.color === drill.side && n.lineIds.some((id) => drill.lineIds.includes(id)));
    return candidates[0] || null;
  }
  const line = opening.lines.find((l) => l.id === drill.lineId);
  return line.plies[drill.ply] || null;
}

function finishIfOutOfBook(opening, drill) {
  if (drill.mode !== "spar") {
    const line = opening.lines.find((l) => l.id === drill.lineId);
    if (drill.ply >= line.plies.length) drill.done = true;
    return;
  }
  const options = bookMoves(opening, drill.fen).filter((n) => n.lineIds.some((id) => drill.lineIds.includes(id)));
  if (!options.length) drill.done = true;
}

function advance(opening, drill, ply) {
  const chess = new Chess(drill.fen);
  const move = chess.move(ply.san);
  drill.fen = chess.fen();
  drill.history.push(move.san);
  drill.lastMove = { from: move.from, to: move.to, san: move.san, color: move.color };
  drill.ply += 1;
  // In spar mode, narrow to the lines that still match the moves played.
  const node = bookMoves(opening, move.before).find((n) => n.san === move.san);
  if (node && drill.mode === "spar") drill.lineIds = drill.lineIds.filter((id) => node.lineIds.includes(id));
  drill.hintLevel = 0;
  drill.tries = 0;
  finishIfOutOfBook(opening, drill);
}

// Student attempt. input: { from, to, promotion? } or { san }.
// Returns { drill, outcome } where outcome.kind is
//   "illegal" | "correct" | "alternative" | "wrong" | "not-your-turn".
export function submitMove(opening, drill, input) {
  const next = structuredClone(drill);
  if (!isStudentTurn(next)) return { drill: next, outcome: { kind: "not-your-turn" } };
  const expected = expectedMove(opening, next);
  const chess = new Chess(next.fen);
  let move;
  try {
    move = chess.move(input.san ? input.san : { from: input.from, to: input.to, promotion: input.promotion || "q" });
  } catch {
    return { drill: next, outcome: { kind: "illegal" } };
  }
  const key = cardKey(opening.id, next.fen);
  if (expected && move.san === expected.san) {
    const grade = next.hintLevel > 0 ? "hinted" : "correct";
    if (next.mode !== "learn" && !next.grades[key]) next.grades[key] = grade;
    const note = expected.note;
    advance(opening, next, expected);
    return { drill: next, outcome: { kind: "correct", san: move.san, note, grade } };
  }
  if (expected && expected.ok && expected.ok[move.san]) {
    return { drill: next, outcome: { kind: "alternative", san: move.san, message: expected.ok[move.san], book: bookInfo(expected) } };
  }
  next.tries += 1;
  next.mistakes += 1;
  if (next.mode !== "learn") next.grades[key] = "wrong";
  return {
    drill: next,
    outcome: { kind: "wrong", san: move.san, from: move.from, to: move.to, ...explainMistake(drill.fen, move, expected) },
  };
}

function bookInfo(ply) {
  return ply ? { san: ply.san, from: ply.from, to: ply.to, note: ply.note } : null;
}

// Defender reply. rng() in [0,1). weakness(lineId) → multiplier ≥ 1 that makes
// weak or due lines come up more often in spar mode.
export function chooseDefenderMove(opening, drill, rng = Math.random, weakness = () => 1) {
  if (drill.done || isStudentTurn(drill)) return null;
  if (drill.mode !== "spar") {
    const line = opening.lines.find((l) => l.id === drill.lineId);
    return line.plies[drill.ply] || null;
  }
  const options = bookMoves(opening, drill.fen).filter((n) => n.color !== drill.side && n.lineIds.some((id) => drill.lineIds.includes(id)));
  if (!options.length) return null;
  const weights = options.map((n) => {
    const boost = Math.max(...n.lineIds.filter((id) => drill.lineIds.includes(id)).map((id) => Math.max(1, Number(weakness(id)) || 1)));
    return Math.max(0.01, n.weight * boost);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.min(0.999999, Math.max(0, rng())) * total;
  for (let i = 0; i < options.length; i += 1) {
    roll -= weights[i];
    if (roll < 0) return options[i];
  }
  return options[options.length - 1];
}

export function playDefenderMove(opening, drill, rng, weakness) {
  const next = structuredClone(drill);
  const ply = chooseDefenderMove(opening, next, rng, weakness);
  if (!ply) {
    next.done = true;
    return { drill: next, ply: null };
  }
  advance(opening, next, ply);
  return { drill: next, ply };
}

// Hint ladder: 1 = highlight the piece to move, 2 = show the arrow.
export function takeHint(drill) {
  const next = structuredClone(drill);
  next.hintLevel = Math.min(2, next.hintLevel + 1);
  return next;
}

// ---- Mistake explanations ------------------------------------------------

function pieceName(type) {
  return PIECE_NAMES[type] || "piece";
}

function prefix(color) {
  return color === "w" ? "" : "…";
}

// Why is `move` (a chess.js Move played from fenBefore) worse than the book?
// Returns { reasons: [string], book: {san, from, to, note} | null }.
export function explainMistake(fenBefore, move, expected) {
  const reasons = [];
  if (expected && expected.wrong && expected.wrong[move.san]) reasons.push(expected.wrong[move.san]);
  const after = new Chess(fenBefore);
  after.move(move.san);
  const replies = after.moves({ verbose: true });

  const mate = replies.find((r) => {
    const probe = new Chess(after.fen());
    probe.move(r.san);
    return probe.isCheckmate();
  });
  if (mate) reasons.push(`It allows checkmate: ${prefix(mate.color)}${mate.san}.`);

  if (!mate) {
    let worst = null;
    for (const r of replies) {
      if (!r.captured) continue;
      const gain = PIECE_VALUES[r.captured];
      if (gain < 3 && r.to !== move.to) continue;
      const probe = new Chess(after.fen());
      probe.move(r.san);
      const defended = probe.moves({ verbose: true }).some((m) => m.to === r.to);
      const loss = defended ? gain - PIECE_VALUES[r.piece] : gain;
      if (loss > 0 && (!worst || loss > worst.loss)) worst = { loss, r, defended };
    }
    if (worst) {
      const what = `${pieceName(worst.r.captured)} on ${worst.r.to}`;
      reasons.push(worst.defended
        ? `Your ${what} can be taken by ${prefix(worst.r.color)}${worst.r.san}, and you lose material in the trade.`
        : `Your ${what} would be left hanging: ${prefix(worst.r.color)}${worst.r.san} takes it for free.`);
    }
  }

  const fullMove = Number(fenBefore.split(" ")[5]) || 1;
  const curated = reasons.length > 0 && expected && expected.wrong && expected.wrong[move.san];
  // Style rules of thumb only when no curated text already explains the move.
  if (curated) return { reasons, book: bookInfo(expected) };
  if (move.piece === "q" && fullMove <= 6 && !move.captured) {
    reasons.push("Bringing the queen out this early lets your opponent develop while chasing it.");
  }
  if (move.piece === "k" && !move.flags.includes("k") && !move.flags.includes("q")) {
    reasons.push("Moving the king gives up the right to castle, and your king stays in the middle.");
  }
  if (move.piece === "n" && /^[ah]/.test(move.to) && fullMove <= 10) {
    reasons.push("A knight on the edge controls fewer squares (\"a knight on the rim is dim\").");
  }
  if (move.piece === "p" && /^[abgh]/.test(move.from) && fullMove <= 6) {
    reasons.push("An edge pawn move this early does little for the centre or your development.");
  }
  if (!reasons.length && expected) {
    reasons.push("It is playable, but it is not the plan this course teaches here.");
  }
  return { reasons, book: bookInfo(expected) };
}
