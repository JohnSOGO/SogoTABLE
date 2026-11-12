// Chess Tutor — session planning: which line to study or review next.
// Pure: works on the compiled course + the progress cards + a clock.

import { cardKey } from "./course.js";
import { lineState, summarize, nextDue, MASTERED_BOX } from "./scheduler.js";

export function lineCardKeys(opening, line) {
  const keys = [];
  for (const ply of line.plies) {
    if (!ply.student) continue;
    const key = cardKey(opening.id, ply.fenBefore);
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

export function openingCardKeys(opening) {
  const keys = new Set();
  for (const line of opening.lines) for (const key of lineCardKeys(opening, line)) keys.add(key);
  return [...keys];
}

export function lineStatus(opening, line, cards, now) {
  return lineState(lineCardKeys(opening, line), cards, now);
}

export function openingSummary(opening, cards, now) {
  const keys = openingCardKeys(opening);
  const summary = summarize(keys, cards, now);
  const lines = opening.lines.map((line) => lineStatus(opening, line, cards, now));
  return {
    ...summary,
    linesNew: lines.filter((s) => s === "new").length,
    linesDue: lines.filter((s) => s === "due").length,
    linesMastered: lines.filter((s) => s === "mastered").length,
    nextDue: nextDue(keys, cards),
  };
}

// Studied lines with at least one due card, most overdue first, interleaved
// across openings (round-robin) so a review session mixes repertoires.
export function dueLines(openings, cards, now) {
  const perOpening = openings.map((opening) => opening.lines
    .filter((line) => lineStatus(opening, line, cards, now) === "due")
    .map((line) => {
      const keys = lineCardKeys(opening, line);
      const due = Math.min(...keys.map((k) => (cards[k] ? Number(cards[k].due) || 0 : 0)));
      return { openingId: opening.id, lineId: line.id, due };
    })
    .sort((a, b) => a.due - b.due));
  const out = [];
  for (let round = 0; perOpening.some((list) => list.length > round); round += 1) {
    for (const list of perOpening) if (list[round]) out.push(list[round]);
  }
  return out;
}

// The next line to learn in an opening: main lines first, then by popularity.
export function nextNewLine(opening, cards, now) {
  const order = { main: 0, sideline: 1, trap: 2 };
  return opening.lines
    .filter((line) => lineStatus(opening, line, cards, now) === "new")
    .sort((a, b) => (order[a.kind] ?? 1) - (order[b.kind] ?? 1) || b.weight - a.weight)[0] || null;
}

// Spar weighting: lines with failed or due cards come up three times as often.
export function weaknessFor(opening, cards, now) {
  const weak = new Map();
  for (const line of opening.lines) {
    const keys = lineCardKeys(opening, line);
    const shaky = keys.some((k) => {
      const c = cards[k];
      return !c || !c.seen || Number(c.due) <= now || (Number(c.lapses) > 0 && Number(c.box) < MASTERED_BOX);
    });
    weak.set(line.id, shaky ? 3 : 1);
  }
  return (lineId) => weak.get(lineId) || 1;
}
