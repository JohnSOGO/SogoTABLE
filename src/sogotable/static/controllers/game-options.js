// Game Options menu controller: the per-device sound + action-label settings and
// the bug-report form. Extracted from the shell. Imports its storage/sound deps
// directly; the shell provides rerender + api + the bug-report context (which
// reads shell state) via wireGameOptions(ctx).
import { actionLabelStyle, setActionLabelStyle } from "../storage.js";
import { isSoundEnabled, soundVolumeLevel, setSoundEnabled, setSoundVolumeLevel, unlockAudio, playConfirm } from "../sound.js";

let ctx = null;

function openGameOptionsModal() {
  const checkbox = document.getElementById("optionActionWords");
  if (checkbox) checkbox.checked = actionLabelStyle() === "words";
  syncVolumeOption();
  const status = document.getElementById("bugReportStatus");
  if (status) status.textContent = "";
  document.getElementById("gameOptionsModal").classList.remove("hidden");
}

// The sound control now lives in the menu: a 0-5 slider where 0 mutes. Keeps the
// existing model (enabled flag + 1-5 level) in sync.
function syncVolumeOption() {
  const slider = document.getElementById("optionVolume");
  const value = document.getElementById("optionVolumeValue");
  const level = isSoundEnabled() ? soundVolumeLevel() : 0;
  // Don't fight the user's drag; only seed the slider when it isn't being moved.
  if (slider && document.activeElement !== slider) slider.value = String(level);
  if (value) value.textContent = level === 0 ? "🔇 Muted" : `🔊 ${level} / 5`;
}

function onVolumeOptionInput(event) {
  const level = Math.round(Number(event.target.value) || 0);
  if (level <= 0) {
    setSoundEnabled(false);
  } else {
    setSoundEnabled(true);
    setSoundVolumeLevel(level);
    unlockAudio();
    playConfirm(); // a beep at the new level so the change is audible
  }
  syncVolumeOption();
}

function closeGameOptionsModal() {
  document.getElementById("gameOptionsModal").classList.add("hidden");
}

function closeGameOptionsModalOnBackdrop(event) {
  if (event.target.id === "gameOptionsModal") closeGameOptionsModal();
}

function onActionWordsToggle(event) {
  setActionLabelStyle(event.target.checked);
  ctx.rerender();
}


async function submitBugReport() {
  const textarea = document.getElementById("bugReportText");
  const status = document.getElementById("bugReportStatus");
  const button = document.getElementById("submitBugReport");
  const description = (textarea.value || "").trim();
  if (!description) {
    status.textContent = "Please add a description first.";
    return;
  }
  button.disabled = true;
  status.textContent = "Sending…";
  try {
    await ctx.api("/api/bug-report", { ...ctx.bugContext(), description, user_agent: navigator.userAgent });
    textarea.value = "";
    status.textContent = "Thanks — sent!";
    playConfirm();
  } catch (error) {
    status.textContent = error.message || "Could not send the report.";
  } finally {
    button.disabled = false;
  }
}

// Wire the menu controls (was inline in the shell's init).
export function wireGameOptions(controllerCtx) {
  ctx = controllerCtx;
  document.querySelectorAll("[data-open-menu]").forEach((button) => button.addEventListener("click", openGameOptionsModal));
  document.getElementById("closeGameOptionsModal").addEventListener("click", closeGameOptionsModal);
  document.getElementById("gameOptionsModal").addEventListener("click", closeGameOptionsModalOnBackdrop);
  document.getElementById("optionActionWords").addEventListener("change", onActionWordsToggle);
  const volumeSlider = document.getElementById("optionVolume");
  if (volumeSlider) volumeSlider.addEventListener("input", onVolumeOptionInput);
  document.getElementById("submitBugReport").addEventListener("click", submitBugReport);
}
