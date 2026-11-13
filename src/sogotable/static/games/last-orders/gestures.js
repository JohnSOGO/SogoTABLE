// Last Orders — hand-card gestures (input capture only, no rules).
//
// Recognises, on hand cards, with pointer events (touch, pen and mouse alike):
//   • hold   — press ~0.4 s and let go without moving: onHold(uid);
//   • drag   — press and pull the card up/out of the hand (or, after a hold,
//              in any direction the browser lets us have), then let go; a
//              table thing marked data-lo-drag (the drink deck), or a card in
//              a hand that doesn't scroll (touch-action:none), drags any way:
//              onDrop(uid, drop) with drop = a seat mark, "bar", or null;
//   • it also stops the long-press text selection / callout / context menu.
// It reports raw facts only. render.js decides, from server-computed game.me,
// whether the hold or drop means a play, and ignores anything illegal.
// A plain tap still arrives as the ordinary click; the click that follows a
// hold or a drag is swallowed so it isn't counted twice.
//
// Robustness (phones): a hold only ARMS the card (it acts on release), so a
// press that pauses before dragging still drags; move/up/cancel are heard on
// the window, so a finger lifted outside the table can't leave a stuck
// gesture; and a new press always clears any half-finished one.
const HOLD_MS = 400;
const MOVE_PX = 8;
const CARD = '.lo-hand [data-lo-act="card"][data-v]';
const SOURCE = `${CARD}, [data-lo-drag]`; // hand cards, plus table things you can pick up (the drink deck)

const noScroll = (el) => {
  try { return getComputedStyle(el).touchAction === "none"; } catch { return false; }
};

export function wireGestures(root, { canDrag, onHold, onDrop, onDragStart = () => {}, onDragEnd = () => {} }) {
  let g = null; // { id, uid, el, x, y, timer, held, ghost, hot }
  let swallowUntil = 0;

  const clearHot = () => { if (g && g.hot) { g.hot.classList.remove("lo-drop-hot"); g.hot = null; } };
  const end = () => {
    if (!g) return;
    if (g.ghost) onDragEnd(g.uid);
    clearTimeout(g.timer);
    clearHot();
    if (g.ghost) g.ghost.remove();
    if (g.el) g.el.classList.remove("lo-dragging", "lo-held");
    try { if (root.hasPointerCapture && root.hasPointerCapture(g.id)) root.releasePointerCapture(g.id); } catch { /* gone */ }
    g = null;
  };

  // Where the dragged card is over: a seat, the bar, or nothing.
  // Looks through anything floating on top (a tip, the callout banner).
  const dropAt = (x, y) => {
    const stack = typeof document !== "undefined" && document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
    for (const el of stack) {
      if (!root.contains(el) || el.closest(".lo-drag-ghost")) continue;
      const seat = el.closest("[data-lo-seat]");
      if (seat && !seat.closest(".lo-results")) return { el: seat, drop: seat.getAttribute("data-lo-seat") };
      const bar = el.closest(".lo-bar");
      if (bar) return { el: bar, drop: "bar" };
    }
    return { el: null, drop: null };
  };

  const startDrag = () => {
    // The hand may have repainted under the finger: pick up the live card.
    if (!g.el.isConnected) g.el = root.querySelector(g.free ? `[data-lo-drag="${CSS.escape(g.uid)}"]` : `${CARD}[data-v="${CSS.escape(g.uid)}"]`) || g.el;
    const r = g.el.getBoundingClientRect();
    const ghost = g.el.cloneNode(true);
    ghost.removeAttribute("data-lo-act");
    ghost.classList.remove("lo-held");
    ghost.classList.add("lo-drag-ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.width = `${r.width}px`;
    ghost.style.left = `${r.left}px`;
    ghost.style.top = `${r.top}px`;
    ghost.style.transformOrigin = `${g.x - r.left}px ${g.y - r.top}px`; // shrinks around the finger
    root.appendChild(ghost);
    g.ghost = ghost;
    g.el.classList.add("lo-dragging");
    g.el.classList.remove("lo-held");
    onDragStart(g.uid);
  };

  const onMove = (e) => {
    if (!g || e.pointerId !== g.id) return;
    if (!root.isConnected) { end(); return; }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.ghost) {
      if (Math.hypot(dx, dy) < MOVE_PX) return;
      // Before a hold, sideways is the hand scrolling; a pull up (even a
      // slanting one) picks the card up. After a hold, any direction does.
      const upward = dy < 0 && -dy >= Math.abs(dx) * 0.6;
      if (!(g.held || g.free || upward) || !canDrag(g.uid)) { end(); return; }
      clearTimeout(g.timer);
      try { root.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
      startDrag();
    }
    if (e.cancelable) e.preventDefault();
    g.ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(-4deg) scale(.6)`;
    const { el } = dropAt(e.clientX, e.clientY);
    if (el !== g.hot) { clearHot(); if (el) { el.classList.add("lo-drop-hot"); g.hot = el; } }
  };

  const onUp = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const { uid, held, ghost } = g;
    const drop = ghost ? dropAt(e.clientX, e.clientY).drop : null;
    end();
    if (!root.isConnected) return;
    if (ghost) { swallowUntil = Date.now() + 500; onDrop(uid, drop); return; }
    if (held) { swallowUntil = Date.now() + 500; onHold(uid); }
    // otherwise a plain tap: the click handles it
  };

  const onCancel = (e) => { if (g && e.pointerId === g.id) end(); };

  root.addEventListener("contextmenu", (e) => { if (e.target.closest && e.target.closest(SOURCE)) e.preventDefault(); });

  root.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    end(); // never let a half-finished gesture block a new one
    const el = e.target.closest ? e.target.closest(SOURCE) : null;
    if (!el || el.disabled || !root.contains(el)) return;
    // Not in a scrolling hand (the drink deck, or a play-focus hand that wraps
    // and sets touch-action:none): any direction picks it up.
    const free = el.hasAttribute("data-lo-drag") || noScroll(el);
    g = { id: e.pointerId, uid: el.getAttribute("data-v") || el.getAttribute("data-lo-drag"), el, free, x: e.clientX, y: e.clientY, timer: 0, held: false, ghost: null, hot: null };
    g.timer = setTimeout(() => {
      if (!g || g.ghost) return;
      g.held = true; // armed: let go to play it, or drag it where it goes
      g.el.classList.add("lo-held");
      try { if (navigator.vibrate) navigator.vibrate(15); } catch { /* unsupported */ }
    }, HOLD_MS);
  });

  if (typeof window !== "undefined") {
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  // Swallow the click a hold or a drag leaves behind.
  root.addEventListener("click", (e) => {
    if (Date.now() < swallowUntil && e.target.closest && e.target.closest(SOURCE)) { e.stopPropagation(); e.preventDefault(); swallowUntil = 0; }
  }, true);
}
