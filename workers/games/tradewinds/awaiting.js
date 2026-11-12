// Which seats this game is waiting on, read from its public projection (the
// toDict output — the same fields the client renders from). Pure; consumed by
// handlers.js awaitingMarksForGame for the room wire dict (awaiting_marks).
import { marksWhere } from "../util.js";

// setup: the seat placing; monkey: the captain; discard: seats over the hand
// limit; build: every seat that has not ended its build (DONE).
export function tradewindsAwaitingMarks(view) {
  if (view.status !== "playing") return [];
  if (view.phase === "setup") return view.setup && view.setup.current ? [view.setup.current] : [];
  if (view.phase === "monkey") return view.captain ? [view.captain] : [];
  if (view.phase === "discard") return marksWhere(view, (s) => Number(s.must_discard) > 0);
  if (view.phase === "build") return marksWhere(view, (s) => !s.skipped && !s.done);
  return [];
}
