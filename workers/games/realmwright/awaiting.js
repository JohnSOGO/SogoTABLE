// Which seats this game is waiting on, read from its public projection (the
// toDict output — the same fields the client renders from). Pure; consumed by
// handlers.js awaitingMarksForGame for the room wire dict (awaiting_marks).
import { marksWhere } from "../util.js";

export function realmwrightAwaitingMarks(view) {
  return view.status === "playing" ? marksWhere(view, (s) => !s.placed && !s.skipped && Boolean(s.tile)) : [];
}
