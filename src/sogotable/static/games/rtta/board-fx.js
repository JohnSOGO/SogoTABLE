// Roll Through the Ages — dice + upkeep motion FX (pure presentation).
//
// Extracted from board.js when it pressed the god-file line cap: the flying
// 🌾/💀 emoji animations, the food-track fills, the dice-roll flicker, and the
// timed upkeep sequences (harvest → food track → feed dice → disaster skulls).
// Nothing in here owns game state — board.js passes elements and counts in and
// keeps every state mutation (food, lost points, dice faces) on its side; these
// helpers only create elements, animate them, and remove them.

// Fill the idx-th food-track box.
export function fillFood(root, idx) { const a = root.querySelectorAll("#foodRoll .box")[idx]; if (a) a.classList.add("filled"); }

// A 🌾 flies from src to the idx-th food-track box, which fills on arrival.
function flyFood(root, src, target, idx) {
  const s = src.getBoundingClientRect(), t = target.getBoundingClientRect();
  if (!t.width) { fillFood(root, idx); return; }
  const fly = document.createElement("div"); fly.className = "rtta-fly"; fly.textContent = "🌾";
  fly.style.left = (s.left + s.width / 2 - 10) + "px"; fly.style.top = (s.top + s.height / 2 - 10) + "px";
  document.body.appendChild(fly);
  requestAnimationFrame(() => {
    fly.style.transform = "translate(" + (t.left - s.left + (t.width - s.width) / 2) + "px," + (t.top - s.top + (t.height - s.height) / 2) + "px) scale(.6)";
    fly.style.opacity = "0.35";
  });
  setTimeout(() => { fillFood(root, idx); fly.remove(); }, 560);
}

// An emoji arcs from srcEl to targetEl; onArrive fires as it lands.
export function flyEmoji(srcEl, targetEl, emoji, onArrive) {
  const s = srcEl.getBoundingClientRect(), t = targetEl.getBoundingClientRect();
  if (!s.width || !t.width) { onArrive(); return; }
  const fly = document.createElement("div"); fly.className = "rtta-fly arc"; fly.textContent = emoji;
  fly.style.left = (s.left + s.width / 2 - 12) + "px"; fly.style.top = (s.top + s.height / 2 - 12) + "px";
  fly.style.setProperty("--dx", (t.left - s.left + (t.width - s.width) / 2) + "px");
  fly.style.setProperty("--dy", (t.top - s.top + (t.height - s.height) / 2) + "px");
  document.body.appendChild(fly);
  setTimeout(() => { onArrive(); fly.remove(); }, 950);
}

// A 🌾 flies from its track box to a die, which pulses "fed".
function flyFoodToDie(srcBox, die) {
  if (!srcBox || !die) return;
  srcBox.classList.remove("filled");
  flyEmoji(srcBox, die, "🌾", () => { die.classList.add("fed"); setTimeout(() => die.classList.remove("fed"), 450); });
}

// Restart the flash-red pulse on the first food-track box; returns it (the
// source element the 💀 famine loss flies from).
export function flashFirstFoodBox(root) {
  const box0 = root.querySelector("#foodRoll .box");
  if (box0) { box0.classList.remove("flash-red"); void box0.offsetWidth; box0.classList.add("flash-red"); }
  return box0;
}

// Spin the given dice elements through random symbols, then settle (the caller
// assigns the real faces inside settle — the flicker is pure show).
export function rollFlicker(els, settle) {
  const SYMS = ["🌾", "⚒️", "📦", "🪙", "💀", "🎲"];
  els.forEach((el) => { el.className = "die rolling"; el.querySelector(".emojis").textContent = "🎲"; });
  const flick = setInterval(() => { els.forEach((el) => { el.querySelector(".emojis").textContent = SYMS[Math.floor(Math.random() * SYMS.length)]; }); }, 90);
  setTimeout(() => { clearInterval(flick); settle(); }, 700);
}

// Harvest banks into the food track: one 🌾 per point flies from the tally stat
// to the next empty box (from → to), decrementing the tally counter as it goes.
export function animateHarvestToFood(root, from, to, done) {
  const counter = root.querySelector("#tFood");
  const src = counter.closest(".stat");
  const boxes = root.querySelectorAll("#foodRoll .box");
  const n = to - from;
  for (let k = 0; k < n; k++) {
    const target = boxes[from + k], idx = from + k; if (!target) break;
    setTimeout(() => {
      flyFood(root, src, target, idx);
      counter.textContent = Math.max(0, (parseInt(counter.textContent, 10) || 0) - 1);
    }, k * 240);
  }
  setTimeout(done, n * 240 + 650);
}

// Cities feed: `feeds` 🌾 fly from the top of the food track to the dice.
export function animateFoodToDice(root, food, feeds, dieEls, done) {
  const filled = [...root.querySelectorAll("#foodRoll .box.filled")];
  for (let k = 0; k < feeds; k++) { const srcBox = filled[food - 1 - k], die = dieEls[k]; setTimeout(() => flyFoodToDie(srcBox, die), k * 240); }
  setTimeout(done, feeds * 240 + 1000);
}

// Famine + disaster losses land one 💀 at a time. The state mutations live in
// the injected loseFoodPoint / losePoint callbacks — this only paces them.
export function resolveDisasters(root, famine, disasterPts, loseFoodPoint, losePoint, done) {
  const skullSrc = root.querySelector("#tSkull").closest(".stat");
  if (famine > 0 || disasterPts > 0) root.querySelector("#disBoxes").scrollIntoView({ block: "center" });
  let delay = 0;
  for (let i = 0; i < famine; i++) { setTimeout(loseFoodPoint, delay); delay += 260; }
  for (let i = 0; i < disasterPts; i++) {
    setTimeout(() => {
      losePoint(skullSrc);
      const sc = root.querySelector("#tSkull"); sc.textContent = Math.max(0, (parseInt(sc.textContent, 10) || 0) - 1);
    }, delay);
    delay += 260;
  }
  setTimeout(done, (famine + disasterPts > 0) ? delay + 1100 : 250);
}
