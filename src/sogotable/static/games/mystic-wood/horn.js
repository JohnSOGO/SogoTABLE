// The Mystic Wood — the Mystic Horn scatter effect (presentation only).
// The server has already applied the scatter (spells.js resolveSpell) and announces it as a
// seq'd event on game.horn; this module only PLAYS it: a ~2s tour that carries every token
// through each knight's landing place one at a time before it settles on its own, and a horn
// call. Nothing here derives a rule or a position — waypoints come from game.horn.tour and the
// final cells from the projection. The tale it tells is raised as a herald (herald.js owns the
// banner's lifecycle); this module owns the tour and the Horn's own words.
// render.js is the only caller; it injects the grid stride and the pre-render token positions.
//
// One thing is load-bearing here, and it was a bug before: the tour is RE-APPLIED on every render
// while it is still in flight, resuming from the elapsed segment. A snapshot render rebuilds the
// tokens from scratch, so a mid-tour re-render (a bot's turn, a poll) used to strand the knights
// half-way — you'd never see the full scatter. Now the tour picks itself back up on the fresh tokens.
import { playMysticHorn } from "../../sound.js";
import { raiseHerald } from "./herald.js";
import { E } from "./util.js";

export const HORN_MS = 2400;   // the token tour, start to final cell (a touch longer so it's easy to follow)

let seenSeq = 0;      // highest horn seq already played — a re-render/reload must not replay it
let animUntil = 0;    // ms timestamp the token tour ends; while it runs the horn owns the tokens
let tourStart = 0;    // ms timestamp the tour began — the resume clock
let tour = null;      // { cells: { mark: [{r,c}, …] }, segMs } captured at horn time; survives re-renders
let tourTimers = [];  // pending per-segment step timers (cancelled/rebuilt each render)

const reducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
function clearTourTimers() { tourTimers.forEach(clearTimeout); tourTimers = []; }

// True while the tour is in flight: render.js must not also glide the tokens.
export function hornOwnsTokens() { return Date.now() < animUntil; }
// Ms left until the tour lands — render.js holds any result/encounter modal off the map until then, so a
// popup never covers the tokens mid-flight (bug mrh6ewl2). Zero once the tour is done.
export function hornRemainingMs() { return Math.max(0, animUntil - Date.now()); }

// Fresh mount (new room / reload): adopt the current seq without playing it, and raise no herald.
// (render.js clears the heralds themselves — resetHeralds() — on the same fresh mount.)
export function resetHorn(seq) {
  clearTourTimers();
  seenSeq = seq || 0;
  animUntil = 0; tour = null;
}

// Called on every render. Starts the effect on a NEW horn seq; on later renders it RESUMES the
// in-flight tour on the freshly-rendered tokens. The herald (raised here, mounted by herald.js on
// each render) tells the tale once the tour has landed.
// opts: { cw, ch, prevPos } — grid stride and each mark's pre-render cell, both owned by render.js.
export function syncHorn(root, game, opts) {
  const horn = game && game.horn;
  if (!horn || !horn.seq) return;
  if (horn.seq > seenSeq) {
    seenSeq = horn.seq;
    clearTourTimers();
    tourStart = Date.now();
    animUntil = tourStart + (reducedMotion() ? 0 : HORN_MS);   // reduced motion: no tour, render.js glides
    buildTour(game, horn, opts);
    playMysticHorn();
    // The tale is a herald, not a curtain: the tokens travel FIRST (you watch them move), and only
    // once the tour lands does the banner flash up and hold. It never overlaps the movement.
    raiseHerald({
      key: "horn", seq: horn.seq, variant: "horn", title: "📯 The Mystic Horn",
      tale: taleHtml(horn), dismissLabel: "✕ Silence the Mystic Horn",
      delayMs: Math.max(0, animUntil - Date.now()),
    });
  }
  if (horn.seq !== seenSeq) return;
  // Resume the tour on whatever tokens exist now (a re-render replaced the old ones).
  if (Date.now() < animUntil && tour) applyTour(root, opts);
}

/* ------------------------------ the tour -------------------------------- */
// Every scattered token walks the same itinerary — each knight's landing place in seat order —
// and only then drops onto its own. That is the point: you SEE your token travel, so you can
// follow it, instead of finding it teleported somewhere across the wood. The itinerary is fixed
// at horn time (start = pre-render cell, ending on the knight's projected cell) so re-renders can
// resume it without re-deriving anything.
function buildTour(game, horn, opts) {
  const prevPos = (opts && opts.prevPos) || {};
  tour = { cells: {}, segMs: HORN_MS };
  (horn.marks || []).forEach((mark) => {
    const seat = (game.players || []).find((p) => p.mark === mark);
    if (!seat) return;
    const final = { r: seat.r, c: seat.c };
    const start = prevPos[mark] || final;
    // start → every landing place that isn't ours → ours. (A knight who moved again after the
    // horn — a bot's turn resolves in the same broadcast — still ends on its projected cell.)
    const stops = (horn.tour || [])
      .map(([r, c]) => ({ r, c }))
      .filter((p) => !(p.r === final.r && p.c === final.c))
      .concat([final]);
    tour.cells[mark] = [start].concat(stops);
  });
  const any = Object.keys(tour.cells)[0];
  tour.segMs = any && tour.cells[any].length > 1 ? HORN_MS / (tour.cells[any].length - 1) : HORN_MS;
}
// (Re)drive the tour on the current tokens, resuming from the segment the elapsed time is in.
// Tokens are positioned by left/top at their FINAL cell, so every waypoint is a transform offset
// from it and the tour lands on translate(0,0) — no layout write, and an interrupted render just
// leaves the token correctly placed.
function applyTour(root, opts) {
  const { cw, ch } = opts;
  clearTourTimers();   // drop the previous render's steps (they target now-detached tokens)
  const now = Date.now();
  Object.keys(tour.cells).forEach((mark) => {
    const cells = tour.cells[mark];
    const tok = root.querySelector(`.tok[data-mark="${mark}"]`);
    if (!tok || cells.length < 2) return;
    const final = cells[cells.length - 1];
    const off = (p) => `translate(${((p.c - final.c) * cw).toFixed(1)}px,${((p.r - final.r) * ch).toFixed(1)}px)`;
    const segMs = tour.segMs;
    const seg = Math.floor((now - tourStart) / segMs);   // segment currently in flight
    if (seg >= cells.length - 1) { settle(tok); return; }
    tok.classList.add("mw-tok-horn");
    tok.style.transition = "none";
    tok.style.transform = off(cells[Math.max(0, seg)]);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      let i = Math.max(1, seg + 1);
      const step = () => {
        if (i >= cells.length) { settle(tok); return; }
        tok.style.transition = `transform ${segMs.toFixed(0)}ms cubic-bezier(.4,0,.5,1)`;
        tok.style.transform = off(cells[i]);
        i += 1;
        tourTimers.push(setTimeout(step, segMs));
      };
      step();
    }));
  });
}
function settle(tok) { tok.classList.remove("mw-tok-horn"); tok.style.transition = ""; tok.style.transform = "translate(0,0)"; }

/* ------------------------------- the tale ------------------------------- */
// §Spells — the Horn: every knight still abroad in the wood is carried to the point opposite,
// mirrored through its heart; the Tower's prisoners and the Enchantress's captives keep their
// places; and the knight who woke the Horn has no breath left for anything else this turn.
function taleHtml(horn) {
  const who = E(horn.byName || "A knight");
  return `<b>${who}</b> sets a horn of old to their lips, and the wood answers.<br>`
    + `Every path unwinds at once: the knights are torn from their trails, swept through glade after glade — `
    + `and set down at last on the far side of the wood, mirrored through its heart.<br>`
    + `Those held in the Tower, and those bound by the Enchantress, never hear it. `
    + `<span class="muted">The horn-blast ends ${who}'s turn.</span>`;
}
