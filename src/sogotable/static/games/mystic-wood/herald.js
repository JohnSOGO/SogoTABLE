// The Mystic Wood — the herald banner: one seq'd event's tale, told over the chronicle strip (presentation only).
// A herald is raised by whoever plays a discrete board event (horn.js for the Mystic Horn today): it can wait
// out an animation before it appears, flashes as it arrives, holds the tale long enough to be read, and then
// CLEARS ITSELF — a herald is not a curtain. It also offers a manual dismiss. Nothing here derives a rule, a
// position, or the tale's words: the caller passes the copy, this module owns only the banner's lifecycle.
// A leaf: it imports the shared pure util (escaping) and nothing else — never render.js or horn.js, so the
// module graph stays acyclic (render.js imports both).
//
// The self-clearing is load-bearing, and was a bug before: the banner used to sit over the chronicle until the
// player tapped "Silence" — which they rarely did — so an event's message lingered across later turns and read
// as if it had re-triggered.
import { E } from "./util.js";

const FLASH_MS = 700;    // the banner flashes for this long when it arrives
const READ_MS = 6000;    // how long the tale then lingers, readable, before it clears itself
const ROOT = ".mystic-wood-root";
const STRIP = ".mw-log";  // the chronicle strip the herald takes over (one herald at a time)

// key -> { seq, title, tale, dismissLabel, variant, showAt, flashUntil, clearAt, dismissed, timers }
let heralds = {};

const reducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
function clearTimers(h) {
  if (!h) return;
  clearTimeout(h.showTimer); clearTimeout(h.clearTimer); clearTimeout(h.flashTimer);
  h.showTimer = h.clearTimer = h.flashTimer = null;
}

// Fresh mount (new room / reload): drop every herald's state without playing or clearing anything.
// The caller re-renders the strip from scratch, so no banner survives.
export function resetHeralds() {
  Object.values(heralds).forEach(clearTimers);
  heralds = {};
}

// Raise a herald for event `key` at `seq`. Older/equal seqs are ignored, so a re-render, a reconnect, or a
// reload can never replay one. `delayMs` holds the banner back until the caller's own animation has landed
// (the Horn shows its tale only once the token tour settles — movement first, then the tale).
// Returns true when this call actually raised it.
export function raiseHerald({ key, seq, title, tale, dismissLabel = "✕ Dismiss", variant = "",
  delayMs = 0, flashMs = FLASH_MS, readMs = READ_MS }) {
  const prev = heralds[key];
  if (prev && (seq || 0) <= prev.seq) return false;
  clearTimers(prev);
  const now = Date.now();
  const showAt = now + Math.max(0, delayMs);
  const h = heralds[key] = {
    seq: seq || 0, title, tale, dismissLabel, variant, showAt,
    flashUntil: showAt + (reducedMotion() ? 0 : flashMs),
    clearAt: showAt + readMs,
    dismissed: false, showTimer: null, clearTimer: null, flashTimer: null,
  };
  // The caller's animation steps with bare timers (no re-render), so a render may never land exactly at its
  // end to raise the banner. This timer does it: the tale appears the moment the animation settles.
  h.showTimer = setTimeout(() => {
    if (h.dismissed || Date.now() >= h.clearAt) return;
    const root = document.querySelector(ROOT);
    if (root) mount(root, h);
  }, Math.max(0, h.showAt - now));
  h.clearTimer = setTimeout(() => {
    h.dismissed = true;
    const el = document.querySelector(`${ROOT} .mw-herald`);
    if (el) el.remove();
  }, Math.max(0, h.clearAt - now));
  return true;
}

// Called on every render: re-mount any herald still inside its read window (a snapshot render rebuilt the
// strip from scratch), and stop re-mounting one whose window has passed.
export function syncHerald(root) {
  if (!root) return;
  const now = Date.now();
  for (const h of Object.values(heralds)) {
    if (now >= h.clearAt) h.dismissed = true;
    else if (!h.dismissed && now >= h.showAt) mount(root, h);
  }
}

function mount(root, h) {
  const strip = root.querySelector(STRIP);
  if (!strip || strip.querySelector(".mw-herald")) return;   // the strip carries one herald at a time
  const flashing = Date.now() < h.flashUntil;
  const el = document.createElement("div");
  el.className = "mw-herald" + (h.variant ? ` mw-herald-${h.variant}` : "") + (flashing ? " mw-herald-flash" : "");
  el.innerHTML = `<div class="mw-herald-title">${E(h.title)}</div>`
    + `<div class="mw-herald-tale">${h.tale}</div>`
    + `<button class="mw-herald-exit" type="button">${E(h.dismissLabel)}</button>`;
  el.querySelector(".mw-herald-exit").addEventListener("click", () => { h.dismissed = true; clearTimeout(h.clearTimer); el.remove(); });
  strip.appendChild(el);
  // Flashing stops with the arrival; the tale then stays static until it clears itself.
  if (flashing) h.flashTimer = setTimeout(() => el.classList.remove("mw-herald-flash"), h.flashUntil - Date.now());
}
