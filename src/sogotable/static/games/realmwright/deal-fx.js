// Realmwright — "new tile" intro (view only; decides nothing).
//
// When a tile is dealt to me it appears large over the map for HOLD_MS, then
// glides and shrinks into the hand slot in the tray over FLY_MS. The hand tile
// stays hidden until the flying copy lands, so there is only ever one tile.
// The overlay lives on the game root (not the repainted tray), so re-renders
// during the flight never restart it.
export const HOLD_MS = 1000;
export const FLY_MS = 1000;

let D = { key: "", until: 0, el: null, timer: null };

// True while the hand slot should stay empty (the tile is still on its way).
export function dealIntroActive(now = Date.now()) {
  return now < D.until;
}

export function cancelDealIntro() {
  clearTimeout(D.timer);
  if (D.el && D.el.parentNode) D.el.parentNode.removeChild(D.el);
  D = { key: D.key, until: 0, el: null, timer: null };
}

// root: the mounted game root; tileHtml: the tile's SVG markup; key: one per
// dealt tile (so a repaint never replays it); onLanded: repaint the tray.
export function playDealIntro(root, tileHtml, key, onLanded) {
  if (!root || D.key === key) return;
  cancelDealIntro();
  D.key = key;
  const viewport = root.querySelector(".rw-viewport");
  if (!viewport) return;
  const box = viewport.getBoundingClientRect();
  const size = Math.round(Math.min(box.width, box.height) * 0.55);
  const el = document.createElement("div");
  el.className = "rw-deal";
  el.setAttribute("aria-hidden", "true");
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.left = `${Math.round(box.left + (box.width - size) / 2)}px`;
  el.style.top = `${Math.round(box.top + (box.height - size) / 2)}px`;
  el.innerHTML = tileHtml;
  document.body.appendChild(el);
  D.el = el;
  D.until = Date.now() + HOLD_MS + FLY_MS;
  D.timer = setTimeout(() => {
    const slot = root.querySelector(".rw-hand-tile");
    if (!slot || !el.isConnected) { cancelDealIntro(); onLanded(); return; }
    const to = slot.getBoundingClientRect();
    const from = el.getBoundingClientRect();
    const scale = to.width / from.width;
    el.style.transition = `transform ${FLY_MS}ms cubic-bezier(.45,0,.25,1), box-shadow ${FLY_MS}ms ease`;
    el.style.transformOrigin = "0 0";
    el.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${scale})`;
    el.classList.add("rw-deal-fly");
    D.timer = setTimeout(() => { cancelDealIntro(); onLanded(); }, FLY_MS + 20);
  }, HOLD_MS);
}
