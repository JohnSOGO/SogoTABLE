// Which seats this game is waiting on, read from its public projection (the
// toDict output — the same fields the client renders from). Pure; consumed by
// handlers.js awaitingMarksForGame for the room wire dict (awaiting_marks).
import { marksWhere } from "../util.js";

export function battleshipAwaitingMarks(view) {
  if (view.phase === "setup" || view.status === "setup") return marksWhere(view, (s) => !s.ready);
  return view.status === "playing" && view.current_player ? [view.current_player] : [];
}
