// Last Orders — animations (pure view effects; decides nothing).
//
// render.js paints the table from the snapshot, THEN hands this module the
// batch of new server events (diffed by sfx.js, so a first snapshot or a
// reload never replays) and the stack items that just landed. Everything
// here is a transient overlay or a Web Animations API run on an element that
// is already in its final state, so a repaint mid-animation never leaves the
// table wrong — at worst an animation is cut short.
//   grit / buzz / gold → "+2" / "−3" floats over that seat's stat chip
//   grit damage        → the seat shakes
//   new stack card     → flies in from whoever played it (drinks flip over)
//   drink ordered      → a mug slides from the buyer to the drinker's seat
//   gamble ante/raise  → coins slide from each gambler into the pot
//   gamble win / steal → coins slide from the pot / the victim to the winner
//   out                → a tipsy wobble, then the seat slumps (CSS end state)
//   win                → confetti-ish cheers over the winner
// prefers-reduced-motion: nothing runs (render.js still shows end states).
import { coinSvg, mugIconSvg } from "./art.js";

let FX = { key: "", potRect: null, seenItems: new Set(), primed: false };

export function reducedMotion() {
  try { return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { return false; }
}

export function fxReset(key) {
  if (FX.key === key) return;
  FX = { key, potRect: null, seenItems: new Set(), primed: false };
}

const canAnimate = (el) => Boolean(el && typeof el.animate === "function");

function rectIn(root, el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const o = root.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height, cx: r.left - o.left + r.width / 2, cy: r.top - o.top + r.height / 2 };
}

const seatEl = (root, mark) => (mark ? root.querySelector(`[data-lo-seat="${CSS.escape(String(mark))}"]`) : null);
const statEl = (root, mark, stat) => (mark ? root.querySelector(`[data-lo-stat="${CSS.escape(`${mark}:${stat}`)}"]`) : null);

function layer(root) {
  return root.querySelector(":scope > .lo-fx");
}

function float(root, el, text, cls, delay = 0) {
  const L = layer(root);
  const r = rectIn(root, el);
  if (!L || !r) return;
  const node = document.createElement("div");
  node.className = `lo-float ${cls}`;
  node.textContent = text;
  node.style.left = `${r.cx}px`;
  node.style.top = `${r.y}px`;
  L.appendChild(node);
  if (!canAnimate(node)) { setTimeout(() => node.remove(), 1200); return; }
  node.animate([
    { transform: "translate(-50%, 4px) scale(.6)", opacity: 0 },
    { transform: "translate(-50%, -6px) scale(1.15)", opacity: 1, offset: 0.18 },
    { transform: "translate(-50%, -14px) scale(1)", opacity: 1, offset: 0.65 },
    { transform: "translate(-50%, -40px) scale(1)", opacity: 0 },
  ], { duration: 1300, delay, easing: "ease-out", fill: "both" }).onfinish = () => node.remove();
}

function shake(el, strong) {
  if (!canAnimate(el)) return;
  const d = strong ? 7 : 4;
  el.animate([
    { transform: "translateX(0)" }, { transform: `translateX(-${d}px) rotate(-1deg)` }, { transform: `translateX(${d}px) rotate(1deg)` },
    { transform: `translateX(-${d / 2}px)` }, { transform: `translateX(${d / 2}px)` }, { transform: "translateX(0)" },
  ], { duration: 420, easing: "ease-out" });
  el.animate([{ boxShadow: "0 0 0 3px rgba(226,71,91,.85)" }, { boxShadow: "0 0 0 0 rgba(226,71,91,0)" }], { duration: 700, easing: "ease-out" });
}

function wobbleOut(el) {
  if (!canAnimate(el)) return;
  el.animate([
    { transform: "rotate(0) translateY(0)", filter: "none" },
    { transform: "rotate(-6deg) translateY(-2px)", offset: 0.2 },
    { transform: "rotate(5deg) translateY(0)", offset: 0.4 },
    { transform: "rotate(-4deg) translateY(1px)", offset: 0.6 },
    { transform: "rotate(3deg) translateY(2px)", offset: 0.78 },
    { transform: "rotate(-3deg) translateY(4px)", filter: "grayscale(.7)" },
  ], { duration: 1300, easing: "ease-in-out" });
}

function coins(root, from, to, n, delay = 0) {
  const L = layer(root);
  if (!L || !from || !to) return;
  const count = Math.max(1, Math.min(5, n));
  for (let i = 0; i < count; i += 1) {
    const node = document.createElement("div");
    node.className = "lo-flycoin";
    node.innerHTML = coinSvg({ size: 22 });
    node.style.left = `${from.cx - 11}px`;
    node.style.top = `${from.cy - 11}px`;
    L.appendChild(node);
    if (!canAnimate(node)) { node.remove(); continue; }
    const dx = to.cx - from.cx; const dy = to.cy - from.cy;
    const lift = -Math.min(60, 20 + Math.abs(dx) * 0.15);
    node.animate([
      { transform: "translate(0,0) scale(.7)", opacity: 0 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + lift}px) scale(1.05)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(.8)`, opacity: 0.2 },
    ], { duration: 950, delay: delay + i * 110, easing: "ease-in-out", fill: "both" }).onfinish = () => node.remove();
  }
}

function mugFlight(root, from, to) {
  const L = layer(root);
  if (!L || !from || !to) return;
  const node = document.createElement("div");
  node.className = "lo-flycoin lo-flymug";
  node.innerHTML = mugIconSvg({ size: 28 });
  node.style.left = `${from.cx - 14}px`;
  node.style.top = `${from.cy - 14}px`;
  L.appendChild(node);
  if (!canAnimate(node)) { node.remove(); return; }
  const dx = to.cx - from.cx; const dy = to.cy - from.cy;
  node.animate([
    { transform: "translate(0,0) scale(.6) rotate(0)", opacity: 0 },
    { transform: `translate(${dx * 0.15}px, ${dy * 0.15 - 10}px) scale(1.2) rotate(-8deg)`, opacity: 1, offset: 0.2 },
    { transform: `translate(${dx * 0.85}px, ${dy * 0.85 - 10}px) scale(1.1) rotate(6deg)`, opacity: 1, offset: 0.8 },
    { transform: `translate(${dx}px, ${dy}px) scale(.7) rotate(0)`, opacity: 0 },
  ], { duration: 1000, easing: "ease-in-out", fill: "both" }).onfinish = () => node.remove();
}

// Gold moves: a steal/collect is a loss (by = the taker) followed at once by
// the taker's matching gain, so those coins fly payer → taker (drawn on the
// loss; the paired gain is skipped). Any other gain flies from the bank (the
// bar) to the seat, any other loss from the seat into the bank.
function isTransferGain(prev, e) {
  return prev && prev.type === "gold" && Number(prev.n) < 0 && prev.by === e.mark && Number(prev.n) === -Number(e.n);
}
function goldFlight(root, e, prev, next) {
  const n = Number(e.n) || 0;
  if (!n || !e.mark) return;
  const seat = rectIn(root, statEl(root, e.mark, "gold"));
  const bank = rectIn(root, root.querySelector("[data-lo-pot]") || root.querySelector(":scope > .lo-bar"));
  if (n > 0) {
    if (isTransferGain(prev, e)) return;
    coins(root, bank, seat, n);
  } else if (next && next.type === "gold" && e.by && e.by !== e.mark && next.mark === e.by && Number(next.n) === -n) {
    coins(root, seat, rectIn(root, statEl(root, e.by, "gold")), -n);
  } else {
    coins(root, seat, bank, -n);
  }
}

function flyIn(root, el, fromRect, isDrink) {
  if (!canAnimate(el)) return;
  const to = rectIn(root, el);
  if (!to) return;
  const dx = fromRect ? fromRect.cx - to.cx : 0;
  const dy = fromRect ? fromRect.cy - to.cy : -60;
  if (isDrink) {
    el.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(.45) rotateY(180deg)`, opacity: 0.4 },
      { transform: "translate(0,0) scale(1.06) rotateY(90deg)", opacity: 1, offset: 0.55 },
      { transform: "translate(0,0) scale(1) rotateY(0deg)", opacity: 1 },
    ], { duration: 620, easing: "cubic-bezier(.2,.7,.3,1)" });
  } else {
    // Slide out of the player's seat face-down, flip up big over the bar
    // (the reveal beat), then settle onto the stack.
    el.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(.35) rotate(-14deg) rotateY(180deg)`, opacity: 0.35 },
      { transform: `translate(${dx * 0.3}px, ${dy * 0.3 - 24}px) scale(.9) rotate(-6deg) rotateY(90deg)`, opacity: 1, offset: 0.45 },
      { transform: "translate(0,-14px) scale(1.28) rotate(2deg) rotateY(0deg)", opacity: 1, offset: 0.68 },
      { transform: "translate(0,-14px) scale(1.28) rotate(2deg)", opacity: 1, offset: 0.84 },
      { transform: "translate(0,0) scale(1) rotate(0)", opacity: 1 },
    ], { duration: 1150, easing: "cubic-bezier(.25,.7,.3,1)" });
  }
}

const CONFETTI = ["#f4c34a", "#e2475b", "#3d7dbf", "#4f9a4a", "#e46fa3", "#8a52b8", "#ff9f43"];
function cheers(root, mark) {
  const L = layer(root);
  if (!L) return;
  const seat = rectIn(root, seatEl(root, mark));
  const box = root.getBoundingClientRect();
  const ox = seat ? seat.cx : box.width / 2;
  const oy = seat ? seat.cy : box.height / 3;
  for (let i = 0; i < 40; i += 1) {
    const node = document.createElement("div");
    node.className = "lo-confetti";
    node.style.background = CONFETTI[i % CONFETTI.length];
    node.style.left = `${ox}px`;
    node.style.top = `${oy}px`;
    L.appendChild(node);
    if (!canAnimate(node)) { node.remove(); continue; }
    const a = (Math.PI * 2 * i) / 40 + Math.random() * 0.3;
    const dist = 60 + Math.random() * 120;
    const dx = Math.cos(a) * dist; const dy = Math.sin(a) * dist * 0.7 - 50;
    node.animate([
      { transform: "translate(-50%,-50%) rotate(0) scale(1)", opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${200 + Math.random() * 300}deg) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy + 140}px)) rotate(${420 + Math.random() * 300}deg) scale(.7)`, opacity: 0 },
    ], { duration: 1500 + Math.random() * 700, delay: Math.random() * 200, easing: "cubic-bezier(.15,.6,.4,1)", fill: "both" }).onfinish = () => node.remove();
  }
  const s = seatEl(root, mark);
  if (canAnimate(s)) {
    s.animate([{ transform: "translateY(0)" }, { transform: "translateY(-8px) scale(1.04)" }, { transform: "translateY(0)" }, { transform: "translateY(-5px)" }, { transform: "translateY(0)" }], { duration: 900, easing: "ease-out" });
  }
}

const signed = (n) => (n > 0 ? `+${n}` : `−${-n}`);

// After every paint. fresh: new server events (seq order); items: the current
// window stack ([{uid, by, kind, target}]); game: the snapshot.
export function fxAfterPaint(root, { fresh, items, game, labels }) {
  if (!root) return;
  const pot = root.querySelector("[data-lo-pot]");
  const potRect = pot ? rectIn(root, pot) : null;
  const prevPot = FX.potRect;
  if (potRect) FX.potRect = potRect;
  const newItems = (items || []).filter((it) => !FX.seenItems.has(it.uid));
  (items || []).forEach((it) => FX.seenItems.add(it.uid));
  if (!FX.primed) { FX.primed = true; return; }
  if (reducedMotion()) return;

  newItems.forEach((it) => {
    const el = root.querySelector(`[data-lo-item="${CSS.escape(String(it.uid))}"]`);
    const from = it.kind === "drink" ? rectIn(root, seatEl(root, it.target)) : rectIn(root, seatEl(root, it.by));
    flyIn(root, el, from, it.kind === "drink");
  });

  // Sum stat changes per seat so a round on the house doesn't spam.
  const sums = new Map();
  (fresh || []).forEach((e) => {
    if (!["grit", "buzz", "gold"].includes(e.type) || !e.mark) return;
    const k = `${e.mark}:${e.type}`;
    sums.set(k, (sums.get(k) || 0) + (Number(e.n) || 0));
  });
  let delay = 0;
  sums.forEach((n, k) => {
    if (!n) return;
    const [mark, stat] = [k.slice(0, k.lastIndexOf(":")), k.slice(k.lastIndexOf(":") + 1)];
    const label = labels && labels[stat] ? ` ${labels[stat]}` : "";
    float(root, statEl(root, mark, stat), `${signed(n)}${label}`, `lo-float-${stat} ${n < 0 ? "lo-float-down" : "lo-float-up"}`, delay);
    delay += 90;
    if (stat === "grit" && n < 0) shake(seatEl(root, mark), n <= -3);
  });

  (fresh || []).forEach((e, i) => {
    if (e.type === "gold") {
      goldFlight(root, e, fresh[i - 1], fresh[i + 1]);
    } else if (e.type === "gamble_start" || (e.type === "gamble_lead" && potRect)) {
      const marks = game && game.gamble ? game.gamble.in : [];
      if (e.type === "gamble_start") marks.forEach((m, i) => coins(root, rectIn(root, statEl(root, m, "gold")), potRect, 1, i * 60));
      if (potRect && pot) float(root, pot, `${e.pot}`, "lo-float-gold lo-float-up", 200);
    } else if (e.type === "gamble_win") {
      const from = potRect || prevPot;
      coins(root, from, rectIn(root, statEl(root, e.mark, "gold")), Number(e.pot) || 3);
    } else if (e.type === "order" && e.by && e.mark && e.by !== e.mark) {
      mugFlight(root, rectIn(root, seatEl(root, e.by)), rectIn(root, seatEl(root, e.mark)));
    } else if (e.type === "out") {
      wobbleOut(seatEl(root, e.mark));
    } else if (e.type === "win" && e.mark) {
      setTimeout(() => { if (root.isConnected) cheers(root, e.mark); }, 250);
    }
  });
}
