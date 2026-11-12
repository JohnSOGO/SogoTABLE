// Last Orders — hand slide animations (FLIP: First, Last, Invert, Play).
//
// snapHand() records where every hand card sits (keyed by card uid) just
// before the hand repaints; slideHand() runs right after and animates the
// difference with the Web Animations API:
//   • a card that moved (re-sort, a card left from its left) slides to its new spot;
//   • a new card (drawn) slides in from the right, staggered;
//   • a card that left (played, discarded, spiked) is ghosted in the fx layer
//     and slides up and away.
// Display only: no game state, no decisions. Honors prefers-reduced-motion.
import { reducedMotion } from "./fx.js";

const MOVE_MS = 260;
const ENTER_MS = 320;
const LEAVE_MS = 340;
const EASE = "cubic-bezier(.2,.8,.2,1)";

const cardsIn = (root) => [...root.querySelectorAll(".lo-hand .lo-hand-row [data-lo-act=\"card\"][data-v]")];

export function snapHand(root) {
  const snap = new Map();
  if (!root) return snap;
  cardsIn(root).forEach((el) => {
    const r = el.getBoundingClientRect();
    snap.set(el.getAttribute("data-v"), { left: r.left, top: r.top, w: r.width, h: r.height, el });
  });
  return snap;
}

export function slideHand(root, before) {
  if (!root || !before || reducedMotion() || typeof Element === "undefined" || !Element.prototype.animate) return;
  const after = cardsIn(root);
  if (!after.length && !before.size) return;
  const host = root.getBoundingClientRect();
  const seen = new Set();
  let entering = 0;
  after.forEach((el) => {
    const uid = el.getAttribute("data-v");
    seen.add(uid);
    const r = el.getBoundingClientRect();
    const old = before.get(uid);
    if (old) {
      if (old.el === el) return; // section did not repaint
      const dx = old.left - r.left;
      const dy = old.top - r.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], { duration: MOVE_MS, easing: EASE });
    } else if (before.size || after.length > 1) {
      el.animate(
        [{ transform: "translateX(70px) rotate(4deg)", opacity: 0 }, { transform: "none", opacity: 1 }],
        { duration: ENTER_MS, easing: EASE, delay: entering * 45, fill: "backwards" },
      );
      entering += 1;
    }
  });
  const layer = root.querySelector(".lo-fx");
  if (!layer) return;
  before.forEach((old, uid) => {
    if (seen.has(uid) || old.el.isConnected) return;
    const ghost = old.el.cloneNode(true);
    ghost.removeAttribute("data-lo-act");
    ghost.setAttribute("aria-hidden", "true");
    ghost.disabled = true;
    Object.assign(ghost.style, {
      position: "absolute", margin: "0", left: `${old.left - host.left}px`, top: `${old.top - host.top}px`,
      width: `${old.w}px`, height: `${old.h}px`, pointerEvents: "none",
    });
    layer.appendChild(ghost);
    const anim = ghost.animate(
      [{ transform: "none", opacity: 1 }, { transform: "translateY(-90px) scale(.85) rotate(-6deg)", opacity: 0 }],
      { duration: LEAVE_MS, easing: "ease-in", fill: "forwards" },
    );
    anim.onfinish = () => ghost.remove();
    anim.oncancel = () => ghost.remove();
  });
}
