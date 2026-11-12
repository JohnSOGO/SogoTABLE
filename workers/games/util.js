// Tiny shared helpers used by the Worker and by per-game rules modules. Pure,
// imports nothing from the Worker (so no circular dependency).

// Coerce to an integer within [min, max], or `fallback` if not an integer.
export function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

// A public game projection's seats as a list of { mark, ...seat }, whether the
// projection carries them as an array (with `mark`) or a mark-keyed object.
// Used by the per-game awaiting.js modules (who the table is waiting on).
export function publicSeats(view) {
  const players = view && view.players;
  if (Array.isArray(players)) return players.filter((seat) => seat && seat.mark);
  if (players && typeof players === "object") return Object.entries(players).map(([mark, seat]) => ({ ...seat, mark }));
  return [];
}

// Marks of the seats that pass `pred`.
export function marksWhere(view, pred) {
  return publicSeats(view).filter(pred).map((seat) => seat.mark);
}
