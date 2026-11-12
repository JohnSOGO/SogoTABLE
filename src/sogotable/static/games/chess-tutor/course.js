// Chess Tutor — compiles the authored repertoire (openings.js) into a playable
// course: every line becomes a list of resolved plies (from/to squares, FENs,
// the inherited note), and every opening gets a position tree so the practice
// defender and the drill engine can ask "what does the book say here?".
//
// Pure: no DOM, no storage. chess.js does all legality / SAN work.

import { Chess } from "../../vendor/chessjs/chess.js";

// A position key without the move clocks, so transpositions share a key.
export function positionKey(fen) {
  return String(fen).split(" ").slice(0, 4).join(" ");
}

export function cardKey(openingId, fen) {
  return `${openingId}|${positionKey(fen)}`;
}

function compileOpening(opening, errors) {
  // tree: positionKey -> Map(san -> { san, from, to, note, wrong, ok, weight, lineIds, fenAfter })
  const tree = new Map();
  const lines = [];
  for (const line of opening.lines) {
    const chess = new Chess();
    const plies = [];
    line.moves.forEach((entry, index) => {
      const [san, note, extras = {}] = Array.isArray(entry) ? entry : [entry];
      const fenBefore = chess.fen();
      let move;
      try {
        move = chess.move(san);
      } catch {
        errors.push(`${opening.id}/${line.id}: ply ${index + 1} "${san}" is illegal`);
        return;
      }
      const key = positionKey(fenBefore);
      if (!tree.has(key)) tree.set(key, new Map());
      const branch = tree.get(key);
      if (!branch.has(move.san)) {
        branch.set(move.san, {
          san: move.san, from: move.from, to: move.to, color: move.color,
          note: "", wrong: {}, ok: {}, weight: 0, lineIds: [], fenAfter: chess.fen(),
        });
      }
      const node = branch.get(move.san);
      if (note && !node.note) node.note = note;
      Object.assign(node.wrong, extras.wrong || {});
      Object.assign(node.ok, extras.ok || {});
      node.weight += Number(line.weight) || 1;
      if (!node.lineIds.includes(line.id)) node.lineIds.push(line.id);
      plies.push({ san: move.san, from: move.from, to: move.to, color: move.color, fenBefore, fenAfter: chess.fen(), key });
    });
    lines.push({ id: line.id, name: line.name, kind: line.kind || "main", weight: Number(line.weight) || 1, plies });
  }
  // Resolve notes/extras from the tree so every ply carries the shared text.
  for (const line of lines) {
    for (const ply of line.plies) {
      const node = tree.get(ply.key).get(ply.san);
      ply.note = node.note;
      ply.wrong = node.wrong;
      ply.ok = node.ok;
      ply.student = ply.color === opening.side;
    }
  }
  return { tree, lines };
}

// Returns { openings: [...compiled], errors: [...] }. The tests require errors
// to be empty; the UI logs them in development and skips broken lines.
export function buildCourse(openings) {
  const errors = [];
  const compiled = openings.map((opening) => {
    const { tree, lines } = compileOpening(opening, errors);
    for (const [key, branch] of tree) {
      const studentMoves = [...branch.values()].filter((n) => n.color === opening.side);
      if (studentMoves.length > 1) {
        errors.push(`${opening.id}: two different student moves (${studentMoves.map((n) => n.san).join(", ")}) at ${key}`);
      }
      for (const node of studentMoves) {
        if (!node.note) errors.push(`${opening.id}: student move ${node.san} at ${key} has no note`);
      }
    }
    for (const line of lines) {
      const last = line.plies[line.plies.length - 1];
      if (last && last.student === false) {
        // Fine: a line may end on the defender's move (the student has seen the reply).
      }
      if (!line.plies.some((p) => p.student)) errors.push(`${opening.id}/${line.id}: no student moves`);
    }
    return { ...opening, lines, tree };
  });
  return { openings: compiled, errors };
}

// Book children of a position, as an array (defender + drill engine).
export function bookMoves(opening, fen) {
  const branch = opening.tree.get(positionKey(fen));
  return branch ? [...branch.values()] : [];
}

// Every student card in an opening: [{ key, lineIds }]
export function studentCards(opening) {
  const cards = new Map();
  for (const line of opening.lines) {
    for (const ply of line.plies) {
      if (!ply.student) continue;
      const key = cardKey(opening.id, ply.fenBefore);
      if (!cards.has(key)) cards.set(key, { key, san: ply.san, lineIds: [] });
      cards.get(key).lineIds.push(line.id);
    }
  }
  return [...cards.values()];
}
