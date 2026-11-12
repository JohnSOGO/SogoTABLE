// Realmwright — animation timeline (pure view state; decides nothing).
//
// New server events (diffed by sfx.js consumeEvents, so a first snapshot or a
// reload never replays) are laid onto ONE queue of timed beats:
//   place  → the tile drops in (scale + soft shadow), then its meeple ~1 s later
//   score  → every meeple that stood on the feature jumps for joy, "+N" floats
//   round  → a "Round N" banner slides in
// Each beat has absolute start times, so any re-render (the shell repaints on
// every snapshot) draws the same frame: CSS animations get a negative
// animation-delay equal to the time already elapsed. fxFrame(now) answers what
// the board should show right now (tiles still waiting are hidden, meeples
// that already went home stay drawn through their celebration) plus the next
// time something changes, so render.js can schedule one repaint.
// State is keyed by room+epoch; prefers-reduced-motion skips straight to the
// end state (render.js then never enqueues).
import { featureAnchor } from "./art.js";
import { playCue } from "./sfx.js";

export const TILE_MS = 380;
const MEEPLE_DELAY = 1000;   // another seat's meeple lands ~1 s after its tile
const MY_MEEPLE_DELAY = 420; // my own: same drop, no long wait
const MEEPLE_MS = 380;
const STAGGER = 1300;        // placements play one at a time
const CELEB_MS = 1200;
const PULSE_MS = 1400;
const BANNER_MS = 1700;
const COUNT_MS = 650;
const MAX_LAG_MS = 8000;

let FX = blank("");

function blank(key) {
  return { key, items: [], queueEnd: 0, lastPlaceStart: -Infinity, timers: [], counters: new Map() };
}

export function reducedMotion() {
  try { return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { return false; }
}

export function fxReset(key) {
  if (FX.key === key) return;
  FX.timers.forEach(clearTimeout);
  FX = blank(key);
}

const meepleKey = (x, y, f, mark) => `${x},${y},${f},${mark}`;

function cueAt(at, name, arg) {
  const key = FX.key;
  const wait = Math.max(0, at - Date.now());
  FX.timers.push(setTimeout(() => { if (FX.key === key) playCue(name, arg); }, wait));
}

// Which feature the place event's meeple stands on: from the board entry, or
// (when it already scored and went home) from a score event in this batch.
function placedMeeple(e, board, batch) {
  if (!e.meeple) return null;
  const tile = board.find((b) => b.x === e.x && b.y === e.y);
  const m = tile && Array.isArray(tile.meeples) ? tile.meeples.find((mm) => mm.mark === e.mark) : null;
  if (m) return { f: m.f, mark: m.mark };
  for (const s of batch) {
    if (s.type !== "score" || !Array.isArray(s.meeples)) continue;
    const hit = s.meeples.find((mm) => mm.x === e.x && mm.y === e.y && mm.mark === e.mark);
    if (hit) return { f: hit.f, mark: hit.mark };
  }
  return null;
}

// fresh: new events (seq order). Only the current and previous round animate,
// so a socket resume after a long sleep never plays a backlog.
export function fxEnqueue(fresh, { board, myMark, round, now = Date.now() }) {
  const batch = fresh.filter((e) => (Number(e.round) || 0) >= (Number(round) || 0) - 1);
  if (!batch.length) return;
  // Never fall far behind the table: if a backlog built up (a burst of
  // snapshots), drop what is still waiting and show the board as it is.
  if (FX.queueEnd - now > MAX_LAG_MS) {
    FX.timers.forEach(clearTimeout);
    FX.timers = []; FX.items = []; FX.queueEnd = now; FX.lastPlaceStart = -Infinity;
  }
  let t = Math.max(now, FX.queueEnd);
  const finals = batch.filter((e) => e.type === "score" && e.final).length;
  const finalStep = finals ? Math.max(260, Math.min(650, 6500 / finals)) : 0;
  let finalCues = 0;
  batch.forEach((e) => {
    if (e.type === "place") {
      const mine = e.mark === myMark;
      const start = Math.max(t, FX.lastPlaceStart + (mine ? 0 : STAGGER));
      const meeple = placedMeeple(e, board, batch);
      const meepleAt = meeple ? start + (mine ? MY_MEEPLE_DELAY : MEEPLE_DELAY) : 0;
      const landed = meeple ? meepleAt + MEEPLE_MS : start + TILE_MS;
      FX.items.push({ type: "place", x: e.x, y: e.y, mark: e.mark, start, meeple, meepleAt, end: Math.max(landed, start + TILE_MS + PULSE_MS) });
      cueAt(start, "place");
      if (meeple) cueAt(meepleAt, "meeple");
      FX.lastPlaceStart = start;
      t = landed + (meeple ? 250 : 0);
    } else if (e.type === "score") {
      const start = e.final ? t : t + 120;
      const meeples = Array.isArray(e.meeples) ? e.meeples : [];
      const marks = Array.isArray(e.marks) ? e.marks : [];
      FX.items.push({ type: "score", start, end: start + CELEB_MS, meeples, marks, points: Number(e.points) || 0, cells: Array.isArray(e.cells) ? e.cells : [] });
      if (!e.final || finalCues < 3) { finalCues += e.final ? 1 : 0; cueAt(start, "complete", Number(e.points) || 0); }
      t = e.final ? start + finalStep : start + CELEB_MS;
    } else if (e.type === "round") {
      const start = t + 100;
      FX.items.push({ type: "round", round: e.round, start, end: start + BANNER_MS });
      cueAt(start, "round");
      t = start + 250;
    }
  });
  FX.queueEnd = t;
}

// What to draw at `now`. defsAt(x, y) → { def, r } for a board cell.
export function fxFrame(now = Date.now()) {
  FX.items = FX.items.filter((it) => it.end > now);
  const frame = {
    hideTiles: new Set(), drops: new Map(), pulses: [], hideMeeples: new Set(), meepleDrops: new Map(),
    extras: [], jumps: new Map(), pops: [], glow: [], banner: null, pendingMarks: new Set(), pendingPoints: {},
    busy: FX.items.length > 0, next: Infinity,
  };
  const mark = (at) => { if (at > now && at < frame.next) frame.next = at; };
  FX.items.forEach((it) => {
    mark(it.start); mark(it.end);
    if (it.type === "place") {
      const k = `${it.x},${it.y}`;
      const el = now - it.start;
      if (el < 0) { frame.hideTiles.add(k); frame.pendingMarks.add(it.mark); }
      else if (el < TILE_MS) frame.drops.set(k, el);
      mark(it.start + TILE_MS);
      if (el >= TILE_MS && el < TILE_MS + PULSE_MS) frame.pulses.push({ x: it.x, y: it.y, mark: it.mark, elapsed: el - TILE_MS });
      if (it.meeple) {
        const mk = meepleKey(it.x, it.y, it.meeple.f, it.meeple.mark);
        const mel = now - it.meepleAt;
        if (mel < 0) frame.hideMeeples.add(mk);
        else if (mel < MEEPLE_MS) frame.meepleDrops.set(mk, mel);
        mark(it.meepleAt); mark(it.meepleAt + MEEPLE_MS);
      }
    } else if (it.type === "score") {
      const el = now - it.start;
      it.meeples.forEach((m) => frame.extras.push(m));
      if (el < 0) {
        it.marks.forEach((mk) => { frame.pendingPoints[mk] = (frame.pendingPoints[mk] || 0) + it.points; });
        return;
      }
      if (it.cells.length) frame.glow.push({ cells: it.cells, elapsed: el });
      it.meeples.forEach((m) => {
        frame.jumps.set(meepleKey(m.x, m.y, m.f, m.mark), el);
        frame.pops.push({ ...m, text: `+${it.marks.includes(m.mark) ? it.points : 0}`, elapsed: el });
      });
    } else if (it.type === "round" && now >= it.start) {
      frame.banner = { round: it.round, elapsed: now - it.start };
    }
  });
  return frame;
}

export const meepleFxKey = meepleKey;

// Overlay markup drawn on top of the board (inside the camera group).
export function fxOverlayMarkup(frame, { defAt, colorOf, zoom }) {
  let out = "";
  frame.pulses.forEach((p) => {
    out += `<rect class="rw-pulse rw-fxa" style="animation-delay:-${Math.round(p.elapsed)}ms" x="${p.x * 100 + 2}" y="${p.y * 100 + 2}" width="96" height="96" rx="6" fill="none" stroke="${colorOf(p.mark)}"/>`;
  });
  const size = Math.max(24, Math.min(64, 17 / (zoom || 1)));
  frame.pops.forEach((p) => {
    const tile = defAt(p.x, p.y);
    const [u, v] = tile ? featureAnchor(tile.def, p.f, tile.r) : [0.5, 0.5];
    out += `<g transform="translate(${(p.x + u) * 100} ${(p.y + v) * 100 - 24})"><text class="rw-pop rw-fxa" style="animation-delay:-${Math.round(p.elapsed)}ms;font-size:${size.toFixed(1)}px" text-anchor="middle" fill="${colorOf(p.mark)}">${p.text}</text></g>`;
  });
  return out;
}

// ---- score count-up (display only; the server's number is the truth) ----
function countValue(c, now) {
  if (reducedMotion() || now >= c.start + COUNT_MS) return c.to;
  const k = Math.max(0, (now - c.start) / COUNT_MS);
  return Math.round(c.from + (c.to - c.from) * (1 - (1 - k) ** 3));
}

// The score to show for `mark` now, easing toward `target` when it changes.
export function countShown(mark, target, now = Date.now()) {
  let c = FX.counters.get(mark);
  if (!c) { c = { from: target, to: target, start: 0 }; FX.counters.set(mark, c); }
  if (c.to !== target) { c.from = countValue(c, now); c.to = target; c.start = now; }
  return countValue(c, now);
}

let countRaf = 0;
// Ticks the [data-rw-count] spans under root until every counter settles.
export function runCounters(root) {
  if (countRaf || typeof requestAnimationFrame === "undefined") return;
  const step = () => {
    countRaf = 0;
    if (!root.isConnected) return;
    const now = Date.now();
    let active = false;
    root.querySelectorAll("[data-rw-count]").forEach((el) => {
      const c = FX.counters.get(el.getAttribute("data-rw-count"));
      if (!c) return;
      const v = countValue(c, now);
      if (el.textContent !== String(v)) el.textContent = String(v);
      const running = v !== c.to;
      el.classList.toggle("rw-counting", running);
      if (running) active = true;
    });
    if (active) countRaf = requestAnimationFrame(step);
  };
  countRaf = requestAnimationFrame(step);
}
