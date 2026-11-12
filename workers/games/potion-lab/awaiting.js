// Which seats this game is waiting on, read from its public projection (the
// toDict output — the same fields the client renders from). Pure; consumed by
// handlers.js awaitingMarksForGame for the room wire dict (awaiting_marks).
import { marksWhere } from "../util.js";

export function potionLabAwaitingMarks(view) {
  if (view.status !== "playing") return [];
  if (view.phase === "review") return marksWhere(view, (s) => !s.ready_next);
  return marksWhere(view, (s) => !s.has_committed);
}
