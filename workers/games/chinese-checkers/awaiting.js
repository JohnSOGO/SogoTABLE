// Which seats this game is waiting on, read from its public projection (the
// toDict output — the same fields the client renders from). Pure; consumed by
// handlers.js awaitingMarksForGame for the room wire dict (awaiting_marks).
import { marksWhere } from "../util.js";

// Mirrors the client's canActNow: "turns" mode waits on the seat whose turn it
// is; blitz/live count a move (or pass) as done; rounds wait for the commit.
export function chineseCheckersAwaitingMarks(view) {
  if (view.status !== "playing") return [];
  const mode = view.options && view.options.mode;
  if (mode === "turns") return view.current ? [view.current] : [];
  const live = mode === "blitz" || mode === "live";
  return marksWhere(view, (s) => !s.finished && !s.skipped && !(live ? (s.moved || s.committed) : s.committed));
}
