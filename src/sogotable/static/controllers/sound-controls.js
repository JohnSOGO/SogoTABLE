// Sound-control UI wiring: the mute/volume toggle buttons, the one-time audio
// unlock on first interaction, and the global control-click SFX. Pure chrome —
// it reads/toggles the sound preference via sound.js and mutates NO shell state,
// so a bug here is at worst a wrong/missing sound, never a broken game. Wired once
// from the shell's DOMContentLoaded via wireSoundControls(); it needs no ctx.
import {
  isSoundEnabled,
  soundVolumeLevel,
  toggleSound,
  unlockAudio,
  playClick,
  playConfirm,
} from "../sound.js";

export function wireSoundControls() {
  renderSoundControls();
  document.addEventListener("pointerdown", unlockAudio, { once: true });
  document.addEventListener("keydown", unlockAudio, { once: true });
  document.addEventListener("click", playControlClickSound);
  document.querySelectorAll("[data-sound-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleSound();
      renderSoundControls();
      playConfirm();
    });
  });
}

function renderSoundControls() {
  const enabled = isSoundEnabled();
  const level = soundVolumeLevel();
  document.querySelectorAll("[data-sound-toggle]").forEach((button) => {
    button.classList.toggle("muted", !enabled);
    button.textContent = enabled ? "🔊" : "🔇";
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute("aria-label", enabled ? "Mute sound" : "Unmute sound");
    button.title = enabled ? "Mute sound" : "Unmute sound";
    button.dataset.volumeLevel = enabled ? String(level) : "0";
    button.innerHTML = `<span aria-hidden="true">${enabled ? "🔊" : "🔇"}</span>`;
    button.setAttribute("aria-label", enabled ? `Sound volume ${level} of 5` : "Sound muted");
    button.title = enabled ? `Sound volume ${level} of 5` : "Sound muted";
  });
}

function playControlClickSound(event) {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  if (button.classList.contains("cell")) return;
  if (button.matches("[data-sound-toggle]")) return;
  playClick();
}
