// Which seats this game is waiting on, read from its public projection (the
// toDict output — the same fields the client renders from). Pure; consumed by
// handlers.js awaitingMarksForGame for the room wire dict (awaiting_marks).
import { marksWhere } from "../util.js";

export function reefkeepersAwaitingMarks(view) {
  return view.status === "playing" ? marksWhere(view, (s) => !s.skipped && !s.has_committed) : [];
}
