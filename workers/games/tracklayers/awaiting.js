// Which seats this game is waiting on, read from its public projection (the
// toDict output — the same fields the client renders from). Pure; consumed by
// handlers.js awaitingMarksForGame for the room wire dict (awaiting_marks).
import { marksWhere } from "../util.js";

// A seat with tickets to keep still needs to act even after committing.
export function tracklayersAwaitingMarks(view) {
  if (view.status !== "playing") return [];
  return marksWhere(view, (s) => !s.skipped && (s.has_pending_tickets || !s.has_committed));
}
