// Battleship — effects mapping (view only). Turns a cell's shot state and the
// active reveal into effect markup + classes: the explosion / splash burst when
// a result lands, lingering fire on damaged cells, the sinking ship, and the
// board shake. It runs NO timers of its own: client.js's existing reveal
// timeline (radar → result) decides when a burst shows, and each burst carries
// a negative animation-delay equal to the time already elapsed, so a rerender
// mid-animation continues it instead of restarting it.
//
// Levels: "full" (everything), "lite" (one-layer bursts, no debris/smoke/shake,
// static fire), "off" (static markers only). prefers-reduced-motion forces "off".

const DEBRIS = [[-1, -1.3], [1.1, -1.1], [-1.4, 0.2], [1.3, 0.4], [-0.4, 1.2], [0.6, -1.6]];
const DROPS = [[-0.9, -1.4], [0.9, -1.3], [-0.3, -1.8], [0.4, -1.7], [0, -2.1]];

function reducedMotion() {
  try { return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { return false; }
}

export function effectiveFxLevel(view) {
  if (reducedMotion()) return "off";
  return view && ["full", "lite", "off"].includes(view.fx) ? view.fx : "full";
}

// Milliseconds since the reveal's result landed (0 before it).
export function resultElapsed(reveal, now = Date.now()) {
  if (!reveal || !reveal.radarUntil) return 0;
  return Math.max(0, now - reveal.radarUntil);
}

const delay = (ms) => `animation-delay:-${Math.round(ms)}ms`;

// One-shot burst shown in the revealed cell during the result phase.
export function burstMarkup(reveal, level, elapsed) {
  if (!reveal || level === "off") return "";
  const d = delay(elapsed);
  if (reveal.hit) {
    let out = `<span class="bs-fx bs-flash" style="${d}"></span><span class="bs-fx bs-fireball" style="${d}"></span>`;
    if (level === "full") {
      out += `<span class="bs-fx bs-shock" style="${d}"></span>`;
      DEBRIS.forEach(([x, y], i) => {
        out += `<span class="bs-fx bs-debris" style="--dx:${x};--dy:${y};${delay(elapsed - i * 12)}"></span>`;
      });
      out += `<span class="bs-fx bs-smoke-puff" style="${d}"></span>`;
    }
    return out;
  }
  let out = `<span class="bs-fx bs-ring" style="${d}"></span>`;
  if (level === "full") {
    out += `<span class="bs-fx bs-ring bs-ring2" style="${delay(elapsed - 180)}"></span><span class="bs-fx bs-column" style="${d}"></span>`;
    DROPS.forEach(([x, y], i) => {
      out += `<span class="bs-fx bs-drop" style="--dx:${x};--dy:${y};${delay(elapsed - i * 20)}"></span>`;
    });
  }
  return out;
}

// Persistent marker for a resolved shot: "miss" | "damaged" | "sunk".
export function markMarkup(state, level) {
  if (state === "miss") return `<span class="bs-peg bs-peg-miss"></span>`;
  if (state === "sunk") return `<span class="bs-peg bs-peg-sunk"></span>`;
  if (state === "damaged") {
    const fire = level === "full"
      ? `<span class="bs-fire bs-fire-live"></span><span class="bs-smoke"></span>`
      : `<span class="bs-fire"></span>`;
    return `${fire}<span class="bs-peg bs-peg-hit"></span>`;
  }
  return "";
}

// Classes for a ship overlay: a sinking animation while its sinking reveal
// plays, a wreck after.
export function shipFxClass(sunk, sinkingNow, level) {
  if (!sunk) return "";
  if (sinkingNow && level !== "off") return "bs-sinking";
  return "bs-wreck";
}

// Board shake on a landed hit (full only).
export function shakeClass(reveal, level) {
  return reveal && reveal.hit && level === "full" ? "bs-shake" : "";
}
