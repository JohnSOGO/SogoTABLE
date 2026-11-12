// Which seats this game is waiting on, read from its public projection (the
// toDict output — the same fields the client renders from). Pure; consumed by
// handlers.js awaitingMarksForGame for the room wire dict (awaiting_marks).
import { marksWhere } from "../util.js";

// The crew on turn: its Navigator (role "guide") gives the clue, its guessers guess.
export function hiddenIslesAwaitingMarks(view) {
  if (view.status !== "playing" || !view.turn_team) return [];
  const role = view.phase === "clue" ? "guide" : view.phase === "guess" ? "guesser" : "";
  return role ? marksWhere(view, (s) => s.team === view.turn_team && s.role === role) : [];
}
