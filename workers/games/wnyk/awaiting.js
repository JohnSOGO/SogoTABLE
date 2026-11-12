// Which seats this game is waiting on, read from its public projection (the
// toDict output — the same fields the client renders from). Pure; consumed by
// handlers.js awaitingMarksForGame for the room wire dict (awaiting_marks).
import { marksWhere } from "../util.js";

export function wnykAwaitingMarks(view) {
  if (view.status !== "playing") return [];
  if (view.phase === "submitting") return marksWhere(view, (s) => !s.is_judge && !s.submitted && !s.skipped);
  if (view.phase === "prompt" || view.phase === "judging") return view.judge ? [view.judge] : [];
  return [];
}
