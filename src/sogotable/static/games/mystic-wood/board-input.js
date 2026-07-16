// The Mystic Wood — board pointer-gesture input (leaf). Board tap / double-tap / drag-pan are resolved
// from POINTER events, NOT click, because iOS Safari treats a double-tap as a gesture and withholds the
// 2nd click, so click-based zoom never fires on iPhone; pointerdown/up land for every tap. This module
// owns the live gesture and the tap timers. It reaches render.js's shared view/peek state and its
// zoom/peek helpers through the deps injected once by render.js (initBoardInput) — a one-way hook, like
// encounter.js's initEncounter, so there is no import cycle back into the renderer.
import { signalWorking } from "./encounter.js";

// render.js hands us its accessors once at module load (initBoardInput). Injection (not an import) keeps
// the dependency one-way: render.js -> board-input.js, never back. `d` exposes the shell constants and
// getters/setters for the shared view / storm / peek state plus the zoom + peek helpers.
let d = null;
export function initBoardInput(deps) { d = deps; }

let clickTimer = null; // deferred single-tap move (cancelled when a 2nd tap makes it a double-tap zoom)
let lastTapAt = 0;      // timestamp of the previous board tap, for pointer-based double-tap detection
let gesture = null;     // active board pointer gesture (tap / double-tap / drag-pan), from pointer events

const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

// pointerdown records the gesture; the document-level move/up handlers below resolve tap / double-tap /
// drag-pan. Called by render.js's wireBoard on every render, against the freshly-mounted board wrap.
export function wireBoardPointer(root, ctx, game, me) {
  const wrapEl = root.querySelector(".mw-boardwrap");
  if (!wrapEl) return;
  wrapEl.addEventListener("pointerdown", (e) => {
    const view = d.getView();
    const zoomed = (view.zoom || 0) > 0;
    const vw = wrapEl.clientWidth || 1, scale = vw / ((d.ZOOM_WIDTHS[view.zoom] || 7) * d.CW);
    gesture = {
      id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, ctx,
      onHoldable: !!e.target.closest(".holdable"),          // a peek target → tap peeks, don't move
      f0: zoomed ? currentFocus(game, me) : null, scale,
    };
  });
}
// Which cell a screen point falls on, mapped back through the board's live transform (so a tap on a token,
// badge, or the tile padding still resolves to the tile beneath it — not just direct .cell hits).
function cellAtPoint(px, py) {
  const board = d.getUiRoot() && d.getUiRoot().querySelector(".board");
  if (!board) return null;
  const rect = board.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const bw = 7 * d.CW - 3 + d.PAD * 2, s = rect.width / bw;    // effective scale from the rendered box
  const ix = (px - rect.left) / s - d.PAD, iy = (py - rect.top) / s - d.PAD;
  return { r: clampN(Math.floor(iy / d.CH), 0, 8), c: clampN(Math.floor(ix / d.CW), 0, 6) };
}
// The board's current centre in fractional cell coords: an explicit focus (double-tap / prior pan) or my knight.
function currentFocus(game, me) {
  const view = d.getView();
  if (view.focus) return { r: view.focus.r, c: view.focus.c };
  const seat = (game.players || []).find((p) => p.mark === me);
  return seat ? { r: seat.r, c: seat.c } : { r: 4, c: 3 };
}
function onBoardMove(e) {
  if (!gesture || e.pointerId !== gesture.id) return;
  const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
  if (!gesture.moved && Math.hypot(dx, dy) < 10) return;       // small movement stays a tap
  gesture.moved = true;
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; } // a drag cancels the pending single-tap move
  // A peek is a PRESS-AND-HOLD: dragging the finger off the badge is how you get your thumb out of the way
  // and actually READ it. Killing the pop on the first millimetre of drag made peeking on a phone almost
  // impossible ("if I peek let me drag my finger away and see the screen… disappear when lift finger",
  // bug mrhc666h). So while a peek is up, a drag neither hides it NOR pans the board — the gesture belongs
  // to the peek until the finger lifts (onBoardUp / onBoardCancel).
  if (gesture.onHoldable && d.getPopEl()) return;
  d.hidePop();                                                 // a drag that is NOT a peek cancels any stray pop
  if (gesture.f0) {                                            // zoomed → pan; finger right reveals content left
    const dc = -dx / (gesture.scale * d.CW), dr = -dy / (gesture.scale * d.CH);
    d.getView().focus = { r: clampN(gesture.f0.r + dr, 0, 8), c: clampN(gesture.f0.c + dc, 0, 6) };
    d.applyZoom(false);                                        // recompute + clamp the transform to bounds
  }
}
function onBoardUp(e) {
  if (!gesture || e.pointerId !== gesture.id) return;
  const g = gesture; gesture = null;
  // Lifting the finger ends a peek AT ONCE (bug mrhc666h) — but only a real press-and-hold: a quick TAP on a
  // badge also peeks, and that pop must survive the release long enough to be read (requestHide's floor).
  if (g.onHoldable && d.getPopEl() && (g.moved || Date.now() - d.getPopAt() > 350)) { d.hidePop(); return; }
  if (g.moved) return;                                        // a pan/drag, not a tap
  const cell = cellAtPoint(g.x, g.y); if (!cell) return;      // couldn't map to a tile (off the board)
  const { r, c } = cell, ctx = g.ctx, now = Date.now();
  if (now - lastTapAt < 400) {                                // DOUBLE TAP → zoom in on this tile (even on a token)
    lastTapAt = 0;
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
    const view = d.getView();
    view.focus = { r, c }; view.zoom = Math.min(d.ZOOM_WIDTHS.length - 1, (view.zoom || 0) + 1); d.applyZoom(true);
    return;
  }
  lastTapAt = now;                                            // register the tap so a 2nd tap can pair into a zoom
  if (g.onHoldable) return;                                   // tap on a peek target → peek only, never a move
  if (clickTimer) clearTimeout(clickTimer);
  clickTimer = setTimeout(() => {                             // deferred single-tap move (a 2nd tap cancels it)
    clickTimer = null;
    const el = d.getUiRoot() && d.getUiRoot().querySelector(`.cell[data-cell="${r},${c}"]`);
    if (!el || (ctx.isMovePending && ctx.isMovePending())) return;
    if (d.getStormMode()) {                                   // targeting a storm: tap a valid area to raise it
      if (el.classList.contains("storm-target")) { d.setStormMode(false); signalWorking(); ctx.makeMove({ type: "storm", r, c }); }
      return;
    }
    if (el.classList.contains("reachable")) { signalWorking(); ctx.makeMove({ type: "move", r, c }); }
  }, 400);
}
function onBoardCancel(e) { if (gesture && e.pointerId === gesture.id) { gesture = null; d.hidePop(); } }
document.addEventListener("pointermove", onBoardMove);
document.addEventListener("pointerup", onBoardUp);
document.addEventListener("pointercancel", onBoardCancel);
