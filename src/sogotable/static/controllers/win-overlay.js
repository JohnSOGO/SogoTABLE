// Win-celebration overlay: the winner banner + confetti, with a per-win dedup so
// the same win only celebrates once. Self-contained except the dedup key needs
// the current room — the shell provides getRoom via wireWinOverlay(ctx). The
// shell imports scheduleWinOverlay (called from render / passed into game ctx)
// and hideWinOverlay (screen transitions).
import { getContrastAwareTextColor } from "../color-utils.js";

let lastCelebratedWinKey = "";
let winOverlayTimer = null;
let ctx = null;

function scheduleWinOverlay(player, mark) {
  const winKey = `${ctx.getRoom().code}:${ctx.getRoom().game.move_count}:${mark}`;
  if (lastCelebratedWinKey === winKey) return;
  lastCelebratedWinKey = winKey;
  if (winOverlayTimer) clearTimeout(winOverlayTimer);
  winOverlayTimer = setTimeout(() => showWinOverlay(player, mark), 1000);
}

function showWinOverlay(player, mark) {
  const overlay = document.getElementById("winOverlay");
  const message = document.getElementById("winMessage");
  const winMark = document.getElementById("winMark");
  winMark.textContent = player ? player.icon : mark || "";
  winMark.style.background = player ? player.color : "";
  winMark.style.color = player ? getContrastAwareTextColor(player.color) : "";
  message.textContent = `${player ? player.name : mark} won!`;
  renderConfetti();
  overlay.classList.remove("hidden");
}

function hideWinOverlay() {
  if (winOverlayTimer) clearTimeout(winOverlayTimer);
  winOverlayTimer = null;
  document.getElementById("winOverlay").classList.add("hidden");
}

function renderConfetti() {
  const host = document.getElementById("confetti");
  host.innerHTML = "";
  const colors = ["#1f7a5f", "#1e63d6", "#c43d5d", "#facc15", "#8a4bd1"];
  for (let index = 0; index < 56; index += 1) {
    const piece = document.createElement("span");
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.45}s`;
    piece.style.animationDuration = `${1.6 + Math.random() * 0.8}s`;
    piece.style.transform = `rotate(${Math.random() * 180}deg)`;
    host.appendChild(piece);
  }
}


export function wireWinOverlay(controllerCtx) {
  ctx = controllerCtx;
  const closeWinOverlay = document.getElementById("closeWinOverlay");
  if (closeWinOverlay) closeWinOverlay.addEventListener("click", hideWinOverlay);
}

// Clear the per-win dedup so the next game can celebrate again (shell calls this
// on room reset). Distinct from hideWinOverlay, which only hides the banner.
export function resetWinCelebration() {
  lastCelebratedWinKey = "";
}

export { scheduleWinOverlay, hideWinOverlay };
