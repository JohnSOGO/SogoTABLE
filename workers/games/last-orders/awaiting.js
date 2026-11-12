// Which seats this game is waiting on, read from its public projection (the
// toDict output — the same fields the client renders from). Pure; consumed by
// handlers.js awaitingMarksForGame for the room wire dict (awaiting_marks).
import { marksWhere } from "../util.js";

// A reaction window (including a gamble) waits on its eligible seats that have
// not passed; otherwise the pick phase waits on unpicked seats, and play on the
// seat whose turn it is.
export function lastOrdersAwaitingMarks(view) {
  if (view.status !== "playing") return [];
  const w = view.reaction;
  if (w) return (w.eligible || []).filter((m) => !(w.passed || []).includes(m));
  if (view.phase === "pick") return marksWhere(view, (s) => !s.picked && !s.out);
  return view.turn && view.turn.mark ? [view.turn.mark] : [];
}
