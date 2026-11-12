// Which seats this game is waiting on, read from its public projection (the
// toDict output — the same fields the client renders from). Pure; consumed by
// handlers.js awaitingMarksForGame for the room wire dict (awaiting_marks).
import { marksWhere } from "../util.js";

// round_end is a shared "continue" anyone can press, so it waits on no one.
export function heartsAwaitingMarks(view) {
  if (view.status !== "playing") return [];
  if (view.phase === "passing") return marksWhere(view, (s) => !s.has_passed);
  return view.phase === "playing" && view.current_player ? [view.current_player] : [];
}
