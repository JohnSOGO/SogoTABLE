// Last Orders — hand-card gestures (input capture only, no rules).
//
// Recognises, on hand cards, with pointer events (touch, pen and mouse alike):
//   • hold   — press ~0.45 s without moving: onHold(uid);
//   • drag   — press and pull the card up/out of the hand, then let go:
//              onDrop(uid, drop) with drop = a seat mark, "bar", or null;
//   • it also stops the long-press text selection / callout / context menu.
// It reports raw facts only. render.js decides, from server-computed game.me,
// whether the hold or drop means a play, and ignores anything illegal.
// A plain tap still arrives as the ordinary click; the click that follows a
// hold or a drag is swallowed so it isn't counted twice.
const HOLD_MS = 450;
const MOVE_PX = 10;
const CARD = '.lo-hand [data-lo-act="card"][data-v]';

export function wireGestures(root, { canDrag, onHold, onDrop }) {
  let g = null; // { id, uid, el, x, y, timer, ghost, dx, dy, hot }
  let swallowUntil = 0;

  const clearHot = () => { if (g && g.hot) { g.hot.classList.remove("lo-drop-hot"); g.hot = null; } };
  const end = () => {
    if (!g) return;
    clearTimeout(g.timer);
    clearHot();
    if (g.ghost) g.ghost.remove();
    if (g.el) g.el.classList.remove("lo-dragging");
    g = null;
  };

  // Where the dragged card is over: a seat, the bar, or nothing.
  const dropAt = (x, y) => {
    const el = typeof document !== "undefined" && document.elementFromPoint ? document.elementFromPoint(x, y) : null;
    if (!el || !root.contains(el)) return { el: null, drop: null };
    const seat = el.closest("[data-lo-seat]");
    if (seat && !seat.closest(".lo-results")) return { el: seat, drop: seat.getAttribute("data-lo-seat") };
    const bar = el.closest(".lo-bar");
    return bar ? { el: bar, drop: "bar" } : { el: null, drop: null };
  };

  const startDrag = () => {
    const r = g.el.getBoundingClientRect();
    const ghost = g.el.cloneNode(true);
    ghost.removeAttribute("data-lo-act");
    ghost.classList.add("lo-drag-ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.width = `${r.width}px`;
    ghost.style.left = `${r.left}px`;
    ghost.style.top = `${r.top}px`;
    ghost.style.transformOrigin = `${g.x - r.left}px ${g.y - r.top}px`; // shrinks around the finger
    root.appendChild(ghost);
    g.ghost = ghost;
    g.el.classList.add("lo-dragging");
  };

  root.addEventListener("contextmenu", (e) => { if (e.target.closest && e.target.closest(CARD)) e.preventDefault(); });

  root.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || g) return;
    const el = e.target.closest ? e.target.closest(CARD) : null;
    if (!el || el.disabled) return;
    const uid = el.getAttribute("data-v");
    g = { id: e.pointerId, uid, el, x: e.clientX, y: e.clientY, ghost: null, hot: null, timer: 0 };
    g.timer = setTimeout(() => {
      if (!g || g.ghost) return;
      const held = g.uid;
      swallowUntil = Date.now() + 700;
      end();
      try { if (navigator.vibrate) navigator.vibrate(20); } catch { /* unsupported */ }
      onHold(held);
    }, HOLD_MS);
  });

  root.addEventListener("pointermove", (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.ghost) {
      if (Math.hypot(dx, dy) < MOVE_PX) return;
      clearTimeout(g.timer);
      // Sideways is the hand scrolling; only a pull upward picks the card up.
      if (dy > -MOVE_PX || Math.abs(dy) < Math.abs(dx) || !canDrag(g.uid)) { end(); return; }
      try { g.el.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
      startDrag();
    }
    e.preventDefault();
    g.ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(-4deg) scale(.6)`;
    const { el } = dropAt(e.clientX, e.clientY);
    if (el !== g.hot) { clearHot(); if (el) { el.classList.add("lo-drop-hot"); g.hot = el; } }
  });

  root.addEventListener("pointerup", (e) => {
    if (!g || e.pointerId !== g.id) return;
    if (!g.ghost) { end(); return; } // a tap: the click handles it
    const uid = g.uid;
    const { drop } = dropAt(e.clientX, e.clientY);
    swallowUntil = Date.now() + 400;
    end();
    onDrop(uid, drop);
  });
  root.addEventListener("pointercancel", end);

  // Swallow the click a hold or a drag leaves behind.
  root.addEventListener("click", (e) => {
    if (Date.now() < swallowUntil && e.target.closest && e.target.closest(CARD)) { e.stopPropagation(); e.preventDefault(); swallowUntil = 0; }
  }, true);
}
