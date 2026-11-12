// Chess Tutor — the one module that reads/writes progress. Everything else
// works on the plain progress object. Device-local (localStorage via
// storage.js), keyed by the selected SogoTable player.

import { loadChessTutorProgress, saveChessTutorProgress } from "../../storage.js";
import { gradeCard } from "./scheduler.js";

export const DEFAULT_HELPS = {
  explain: true,     // show the "why" note after each move
  hints: true,       // show the Hint button
  arrows: true,      // arrow for the defender's last move
  mistakeDetail: true, // explain why a wrong move is wrong
};

export function emptyProgress() {
  return { version: 1, cards: {}, helps: { ...DEFAULT_HELPS }, watchSpeed: 1, stats: { drills: 0, perfect: 0, days: [], lastDay: "" } };
}

export function normalizeProgress(raw) {
  const base = emptyProgress();
  if (!raw || typeof raw !== "object") return base;
  const cards = raw.cards && typeof raw.cards === "object" ? raw.cards : {};
  const helps = { ...DEFAULT_HELPS };
  for (const key of Object.keys(DEFAULT_HELPS)) {
    if (raw.helps && typeof raw.helps[key] === "boolean") helps[key] = raw.helps[key];
  }
  const stats = { ...base.stats, ...(raw.stats && typeof raw.stats === "object" ? raw.stats : {}) };
  stats.days = Array.isArray(stats.days) ? stats.days.filter((d) => typeof d === "string").slice(-60) : [];
  const speed = Number(raw.watchSpeed);
  const watchSpeed = Number.isFinite(speed) && speed >= 0.25 && speed <= 4 ? speed : 1;
  return { version: 1, cards, helps, watchSpeed, stats };
}

export function loadProgress(playerId) {
  return normalizeProgress(loadChessTutorProgress(playerId));
}

export function saveProgress(playerId, progress) {
  return saveChessTutorProgress(playerId, progress);
}

function dayStamp(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Apply a finished (or abandoned) drill's grades. Pure: returns a new object.
export function recordDrill(progress, drill, now, { completed = true } = {}) {
  const next = normalizeProgress(structuredClone(progress));
  for (const [key, grade] of Object.entries(drill.grades || {})) {
    next.cards[key] = gradeCard(next.cards[key], grade, now);
  }
  if (completed && drill.mode !== "learn") {
    next.stats.drills += 1;
    if (!drill.mistakes) next.stats.perfect += 1;
    const today = dayStamp(now);
    if (!next.stats.days.includes(today)) next.stats.days = [...next.stats.days, today].slice(-60);
    next.stats.lastDay = today;
  }
  return next;
}

// Consecutive practice days ending today (or yesterday, so a streak isn't
// "lost" before today's session).
export function streak(progress, now) {
  const days = new Set(progress.stats.days);
  let count = 0;
  let t = now;
  if (!days.has(dayStamp(t))) t -= 86400000;
  while (days.has(dayStamp(t))) { count += 1; t -= 86400000; }
  return count;
}
