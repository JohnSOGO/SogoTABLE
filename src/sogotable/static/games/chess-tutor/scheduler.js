// Chess Tutor — spaced repetition (Leitner boxes, Chessable-style intervals).
//
// One card per position where it is the student's move (key = opening|position).
// Pure: the clock is passed in, nothing touches storage.
//
//   box 0  new or just failed  → due now (re-drilled this session)
//   box 1  4 hours   box 2  1 day    box 3  3 days   box 4  1 week
//   box 5  2 weeks   box 6  1 month  box 7  3 months (cap)
//
// Grading (from docs/game-chess-tutor.md):
//   correct, no help    → up one box (only when the card was due; early
//                         practice never inflates the schedule)
//   correct with a hint → stays in its box, due again on the box interval
//   wrong               → back to box 0, due now

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const BOX_INTERVALS = [0, 4 * HOUR, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 90 * DAY];
export const MAX_BOX = BOX_INTERVALS.length - 1;
export const MASTERED_BOX = 5;

export function newCard() {
  return { box: 0, due: 0, reps: 0, lapses: 0, seen: 0 };
}

function clampCard(card) {
  const c = card && typeof card === "object" ? card : newCard();
  const box = Math.min(MAX_BOX, Math.max(0, Math.trunc(Number(c.box) || 0)));
  return {
    box,
    due: Number.isFinite(Number(c.due)) ? Number(c.due) : 0,
    reps: Math.max(0, Math.trunc(Number(c.reps) || 0)),
    lapses: Math.max(0, Math.trunc(Number(c.lapses) || 0)),
    seen: Number.isFinite(Number(c.seen)) ? Number(c.seen) : 0,
  };
}

export function isDue(card, now) {
  if (!card) return true;
  return clampCard(card).due <= now;
}

// grade: "correct" | "hinted" | "wrong". Returns a new card.
export function gradeCard(card, grade, now) {
  const c = clampCard(card);
  const wasDue = c.due <= now;
  if (grade === "wrong") {
    return { ...c, box: 0, due: now, lapses: c.lapses + 1, reps: c.reps + 1, seen: now };
  }
  let box = c.box;
  if (grade === "correct" && wasDue) box = Math.min(MAX_BOX, box + 1);
  if (grade === "hinted") box = Math.max(1, box);
  // A card answered early keeps its existing due date unless it was failed.
  const due = wasDue || grade === "hinted" ? now + BOX_INTERVALS[box] : c.due;
  return { ...c, box, due, reps: c.reps + 1, seen: now };
}

// Status of a set of cards (a line or an opening).
export function summarize(cardKeys, cards, now) {
  let fresh = 0, due = 0, learning = 0, mastered = 0;
  for (const key of cardKeys) {
    const card = cards[key];
    if (!card || !card.seen) { fresh += 1; continue; }
    const c = clampCard(card);
    if (c.due <= now) due += 1;
    if (c.box >= MASTERED_BOX) mastered += 1; else learning += 1;
  }
  return { total: cardKeys.length, fresh, due, learning, mastered };
}

// Line state for the picker: "new" (never studied), "due", "learning" or "mastered".
export function lineState(cardKeys, cards, now) {
  const s = summarize(cardKeys, cards, now);
  if (s.fresh > 0) return "new";
  if (s.due > 0) return "due";
  if (s.mastered === s.total) return "mastered";
  return "learning";
}

// Earliest due time among studied cards (for "next review in …").
export function nextDue(cardKeys, cards) {
  let best = Infinity;
  for (const key of cardKeys) {
    const card = cards[key];
    if (card && card.seen) best = Math.min(best, clampCard(card).due);
  }
  return best;
}

export function formatWait(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "now";
  const h = ms / HOUR;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))} min`;
  if (h < 36) return `${Math.round(h)} h`;
  return `${Math.round(ms / DAY)} days`;
}
