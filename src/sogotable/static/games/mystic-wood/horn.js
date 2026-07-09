// The Mystic Wood — the Mystic Horn scatter effect (presentation only).
// The server has already applied the scatter (engine.js resolveSpell) and announces it as a
// seq'd event on game.horn; this module only PLAYS it: a ~2s tour that carries every token
// through each knight's landing place one at a time before it settles on its own, a horn call,
// and a narrating banner over the chronicle strip. Nothing here derives a rule or a position —
// waypoints come from game.horn.tour and the final cells from the projection.
// render.js is the only caller; it injects the grid stride and the pre-render token positions.
import { playMysticHorn } from "../../sound.js";

export const HORN_MS = 2000;   // the whole tour, start to final cell

let seenSeq = 0;      // highest horn seq already played — a re-render/reload must not replay it
let dismissed = true; // the banner has been closed (or never opened) for the current seq
let animUntil = 0;    // ms timestamp the token tour ends; while it runs the horn owns the tokens
let flashUntil = 0;   // ms timestamp the banner stops flashing (it stays, static, until dismissed)
let timers = [];

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
const reducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
function clearTimers() { timers.forEach(clearTimeout); timers = []; }

// True while the tour is in flight: render.js must not also glide the tokens.
export function hornOwnsTokens() { return Date.now() < animUntil; }

// Fresh mount (new room / reload): adopt the current seq without playing it, and show no banner.
export function resetHorn(seq) { clearTimers(); seenSeq = seq || 0; dismissed = true; animUntil = 0; flashUntil = 0; }

// Called on every render. Starts the effect on a NEW horn seq; otherwise re-mounts the banner
// (the log strip is rebuilt from scratch each render) until the player silences it.
// opts: { cw, ch, prevPos } — grid stride and each mark's pre-render cell, both owned by render.js.
export function syncHorn(root, game, opts) {
  const horn = game && game.horn;
  if (!horn || !horn.seq) return;
  if (horn.seq > seenSeq) {
    seenSeq = horn.seq;
    dismissed = false;
    clearTimers();
    animUntil = Date.now() + HORN_MS;
    flashUntil = animUntil;
    playMysticHorn();
    startTour(root, game, horn, opts);
  }
  if (horn.seq === seenSeq && !dismissed) mountBanner(root, horn);
}

/* ------------------------------ the tour -------------------------------- */
// Every scattered token walks the same itinerary — each knight's landing place in seat order —
// and only then drops onto its own. That is the point: you SEE your token travel, so you can
// follow it, instead of finding it teleported somewhere across the wood.
function startTour(root, game, horn, opts) {
  const { cw, ch, prevPos } = opts;
  if (reducedMotion()) { animUntil = Date.now(); return; }   // no motion: tokens are already placed
  (horn.marks || []).forEach((mark) => {
    const tok = root.querySelector(`.tok[data-mark="${mark}"]`);
    const seat = (game.players || []).find((p) => p.mark === mark);
    if (!tok || !seat) return;
    const final = { r: seat.r, c: seat.c };
    const start = prevPos[mark] || final;
    // start → every landing place that isn't ours → ours. (A knight who moved again after the
    // horn — a bot's turn resolves in the same broadcast — still ends on its projected cell.)
    const stops = (horn.tour || [])
      .map(([r, c]) => ({ r, c }))
      .filter((p) => !(p.r === final.r && p.c === final.c))
      .concat([final]);
    animateTok(tok, [start].concat(stops), final, HORN_MS / stops.length, cw, ch);
  });
}
// Tokens are positioned by left/top at their FINAL cell, so every waypoint is a transform offset
// from it and the tour lands on translate(0,0) — no layout write, and an interrupted render just
// leaves the token correctly placed.
function animateTok(tok, cells, final, segMs, cw, ch) {
  const off = (p) => `translate(${((p.c - final.c) * cw).toFixed(1)}px,${((p.r - final.r) * ch).toFixed(1)}px)`;
  tok.classList.add("mw-tok-horn");
  tok.style.transition = "none";
  tok.style.transform = off(cells[0]);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    let i = 1;
    const step = () => {
      if (i >= cells.length) { tok.classList.remove("mw-tok-horn"); tok.style.transition = ""; tok.style.transform = "translate(0,0)"; return; }
      tok.style.transition = `transform ${segMs.toFixed(0)}ms cubic-bezier(.4,0,.5,1)`;
      tok.style.transform = off(cells[i]);
      i += 1;
      timers.push(setTimeout(step, segMs));
    };
    step();
  }));
}

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
  const left = flashUntil - Date.now();
  const el = document.createElement("div");
  el.className = "mw-horn" + (left > 0 ? " mw-horn-flash" : "");
  el.innerHTML = `<div class="mw-horn-title">📯 The Mystic Horn</div>`
    + `<div class="mw-horn-tale">${taleHtml(horn)}</div>`
    + `<button class="mw-horn-exit" type="button">✕ Silence the Mystic Horn</button>`;
  el.querySelector(".mw-horn-exit").addEventListener("click", () => { dismissed = true; el.remove(); });
  log.appendChild(el);
  // Flashing stops with the tour; the tale stays until the player closes it.
  if (left > 0) timers.push(setTimeout(() => el.classList.remove("mw-horn-flash"), left));
}
