// The Mystic Wood — the Mystic Horn scatter effect (presentation only).
// The server has already applied the scatter (engine.js resolveSpell) and announces it as a
// seq'd event on game.horn; this module only PLAYS it: a ~2s tour that carries every token
// through each knight's landing place one at a time before it settles on its own, a horn call,
// and a narrating banner over the chronicle strip. Nothing here derives a rule or a position —
// waypoints come from game.horn.tour and the final cells from the projection.
// render.js is the only caller; it injects the grid stride and the pre-render token positions.
//
// Two things are load-bearing here, and both were bugs before:
//  1. The tour is RE-APPLIED on every render while it is still in flight, resuming from the
//     elapsed segment. A snapshot render rebuilds the tokens from scratch, so a mid-tour
//     re-render (a bot's turn, a poll) used to strand the knights half-way — you'd never see
//     the full scatter. Now the tour picks itself back up on the fresh tokens.
//  2. The banner is a herald, not a permanent takeover: it flashes through the tour, holds the
//     tale a few seconds so it can be read, then CLEARS ITSELF. It used to sit over the chronicle
//     until the player tapped "Silence" — which they rarely did — so the Horn's message lingered
//     across later turns and looked as if it had re-triggered (e.g. while being beaten by a beast).
import { playMysticHorn } from "../../sound.js";

export const HORN_MS = 2000;   // the token tour, start to final cell
const READ_MS = 6000;          // how long the tale then lingers, readable, before it clears itself
const FLASH_MS = 700;          // the banner flashes for this long when it arrives (after the tour)

let seenSeq = 0;      // highest horn seq already played — a re-render/reload must not replay it
let dismissed = true; // the banner has been closed (or auto-cleared) for the current seq
let animUntil = 0;    // ms timestamp the token tour ends; while it runs the horn owns the tokens
let flashUntil = 0;   // ms timestamp the banner stops flashing (it stays, static, until it clears)
let bannerUntil = 0;  // ms timestamp the banner clears itself (tour end + READ_MS)
let tourStart = 0;    // ms timestamp the tour began — the resume clock
let tour = null;      // { cells: { mark: [{r,c}, …] }, segMs } captured at horn time; survives re-renders
let tourTimers = [];  // pending per-segment step timers (cancelled/rebuilt each render)
let bannerTimer = null; // the single self-clear timer
let bannerShowTimer = null; // fires at tour-end to raise the banner (the tour steps without a render)

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
const reducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
function clearTourTimers() { tourTimers.forEach(clearTimeout); tourTimers = []; }

// True while the tour is in flight: render.js must not also glide the tokens.
export function hornOwnsTokens() { return Date.now() < animUntil; }

// Fresh mount (new room / reload): adopt the current seq without playing it, and show no banner.
export function resetHorn(seq) {
  clearTourTimers();
  clearTimeout(bannerTimer); bannerTimer = null;
  clearTimeout(bannerShowTimer); bannerShowTimer = null;
  seenSeq = seq || 0; dismissed = true;
  animUntil = 0; flashUntil = 0; bannerUntil = 0; tour = null;
}

// Called on every render. Starts the effect on a NEW horn seq; on later renders it RESUMES the
// in-flight tour on the freshly-rendered tokens and re-mounts the (self-clearing) banner.
// opts: { cw, ch, prevPos } — grid stride and each mark's pre-render cell, both owned by render.js.
export function syncHorn(root, game, opts) {
  const horn = game && game.horn;
  if (!horn || !horn.seq) return;
  if (horn.seq > seenSeq) {
    seenSeq = horn.seq;
    dismissed = false;
    clearTourTimers();
    tourStart = Date.now();
    animUntil = tourStart + (reducedMotion() ? 0 : HORN_MS);   // reduced motion: no tour, render.js glides
    // The tale is a herald, not a curtain: the tokens travel FIRST (you watch them move), and only
    // once the tour lands does the banner flash up and hold. It never overlaps the movement.
    flashUntil = animUntil + (reducedMotion() ? 0 : FLASH_MS);
    bannerUntil = animUntil + READ_MS;
    buildTour(game, horn, opts);
    playMysticHorn();
    scheduleBannerShow(horn);
    scheduleBannerClear();
  }
  if (horn.seq !== seenSeq) return;
  // Resume the tour on whatever tokens exist now (a re-render replaced the old ones).
  if (Date.now() < animUntil && tour) applyTour(root, opts);
  // The banner clears itself; once its window has passed, stop re-mounting it.
  if (Date.now() >= bannerUntil) dismissed = true;
  // Hold the banner back until the token tour has landed — movement first, then the tale.
  if (!dismissed && Date.now() >= animUntil) mountBanner(root, horn);
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

/* ----------------------------- the banner ------------------------------- */
// §Spells — the Horn: every knight still abroad in the wood is carried to the point opposite,
// mirrored through its heart; the Tower's prisoners and the Enchantress's captives keep their
// places; and the knight who woke the Horn has no breath left for anything else this turn.
function taleHtml(horn) {
  const who = esc(horn.byName || "A knight");
  return `<b>${who}</b> sets a horn of old to their lips, and the wood answers.<br>`
    + `Every path unwinds at once: the knights are torn from their trails, swept through glade after glade — `
    + `and set down at last on the far side of the wood, mirrored through its heart.<br>`
    + `Those held in the Tower, and those bound by the Enchantress, never hear it. `
    + `<span class="muted">The horn-blast ends ${who}'s turn.</span>`;
}
function mountBanner(root, horn) {
  const log = root.querySelector(".mw-log");
  if (!log || log.querySelector(".mw-horn")) return;
  const flashing = Date.now() < flashUntil;
  const el = document.createElement("div");
  el.className = "mw-horn" + (flashing ? " mw-horn-flash" : "");
  el.innerHTML = `<div class="mw-horn-title">📯 The Mystic Horn</div>`
    + `<div class="mw-horn-tale">${taleHtml(horn)}</div>`
    + `<button class="mw-horn-exit" type="button">✕ Silence the Mystic Horn</button>`;
  el.querySelector(".mw-horn-exit").addEventListener("click", () => { dismissed = true; clearTimeout(bannerTimer); el.remove(); });
  log.appendChild(el);
  // Flashing stops with the tour; the tale then stays static until it clears itself.
  if (flashing) tourTimers.push(setTimeout(() => el.classList.remove("mw-horn-flash"), flashUntil - Date.now()));
}
// The tour steps the tokens with bare timers (no re-render), so a render may never land exactly at
// tour-end to raise the banner. This timer does it: the tale appears the moment the tokens settle.
function scheduleBannerShow(horn) {
  clearTimeout(bannerShowTimer);
  bannerShowTimer = setTimeout(() => {
    if (dismissed || Date.now() >= bannerUntil) return;
    const root = document.querySelector(".mystic-wood-root");
    if (root) mountBanner(root, horn);
  }, Math.max(0, animUntil - Date.now()));
}
// The herald clears itself so the chronicle returns — the Horn's message must not linger across
// later turns (it once sat there until manually silenced, and read as a phantom re-trigger).
function scheduleBannerClear() {
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    dismissed = true;
    const el = document.querySelector(".mystic-wood-root .mw-horn");
    if (el) el.remove();
  }, Math.max(0, bannerUntil - Date.now()));
}
