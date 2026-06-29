// The player-edit form's appearance picker: the emoji icon field + the colour
// swatch grid. This controller owns the in-flight selection (selectedIcon /
// selectedColor) and the palette/emoji pools while a player is being created or
// edited. The shell (app.js) drives it through a narrow surface:
//   - wireAppearancePicker()      bind the icon/colour input handlers once at init
//   - renderAppearanceChoices()   repaint the swatch grid / sync the inputs
//   - resetAppearance()           new-player defaults (random icon, first colour)
//   - setAppearanceFrom(player)   seed from the player being edited
//   - getSelectedAppearance()     read {icon, color} when saving (fallbacks applied)
// It performs no persistence and makes no player decisions — it only captures the
// chosen look. Rendering is DOM-construction (no innerHTML of user text).
import { normalizePlayerColor } from "../color-utils.js";
import { firstEmoji } from "../html-utils.js";

const RANDOM_ICONS = ["🙂", "😎", "🤖", "🦊", "🐲", "⭐", "🌮", "🎲", "🎯", "🚀", "🌈", "🍕", "🎸", "🧠", "🔥", "🍀"];
const PALETTE_COLORS = [
  "#1f7a5f",
  "#1e63d6",
  "#c43d5d",
  "#8a4bd1",
  "#b7791f",
  "#0f766e",
  "#dc2626",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#4f46e5",
  "#be123c",
  "#334155",
];

let selectedIcon = randomIcon();
let selectedColor = PALETTE_COLORS[0];

function randomIcon() {
  return RANDOM_ICONS[Math.floor(Math.random() * RANDOM_ICONS.length)];
}

// The chosen look, with the same fallbacks the form applied inline before: an
// empty icon field falls back to a random icon, and the colour is normalised.
export function getSelectedAppearance() {
  return {
    icon: selectedIcon || randomIcon(),
    color: normalizePlayerColor(selectedColor, PALETTE_COLORS[0]),
  };
}

export function resetAppearance() {
  selectedIcon = randomIcon();
  selectedColor = PALETTE_COLORS[0];
}

export function setAppearanceFrom(player) {
  selectedIcon = (player && player.icon) || randomIcon();
  selectedColor = normalizePlayerColor(player && player.color, PALETTE_COLORS[0]);
}

export function renderAppearanceChoices() {
  const iconInput = document.getElementById("playerIconText");
  if (iconInput && iconInput.value !== selectedIcon) iconInput.value = selectedIcon;
  const colorText = document.getElementById("playerColorText");
  const safeColor = normalizePlayerColor(selectedColor, PALETTE_COLORS[0]);
  selectedColor = safeColor;
  if (colorText && colorText.value !== safeColor) colorText.value = safeColor;
  const colorNative = document.getElementById("playerColorNative");
  if (colorNative && colorNative.value !== safeColor) colorNative.value = safeColor;
  const colorHost = document.getElementById("colorChoices");
  colorHost.innerHTML = "";
  PALETTE_COLORS.forEach((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `choice swatch ${color === selectedColor ? "selected" : ""}`;
    button.style.background = color;
    button.setAttribute("aria-label", color);
    button.addEventListener("click", () => {
      selectedColor = color;
      renderAppearanceChoices();
    });
    colorHost.appendChild(button);
  });
}

function updateSelectedColorFromText(event) {
  const value = event.target.value.trim();
  const normalized = normalizePlayerColor(value, selectedColor, PALETTE_COLORS[0]);
  if (selectedColor !== normalized) {
    selectedColor = normalized;
  }
  event.target.value = normalized;
  const colorNative = document.getElementById("playerColorNative");
  if (colorNative) colorNative.value = normalized;
  renderAppearanceChoices();
}

function normalizeSelectedColorText(event) {
  const normalized = normalizePlayerColor(event.target.value, selectedColor, PALETTE_COLORS[0]);
  selectedColor = normalized;
  event.target.value = normalized;
  const colorNative = document.getElementById("playerColorNative");
  if (colorNative) colorNative.value = normalized;
}

function updateSelectedColorFromNative(event) {
  const normalized = normalizePlayerColor(event.target.value, selectedColor, PALETTE_COLORS[0]);
  selectedColor = normalized;
  const colorText = document.getElementById("playerColorText");
  if (colorText) colorText.value = normalized;
  renderAppearanceChoices();
}

function updateSelectedIcon(event) {
  selectedIcon = event.target.value = firstEmoji(event.target.value);
}

function clearEmojiField(event) {
  event.target.value = "";
  if (event.target.id === "playerIconText") selectedIcon = "";
}

function resetBlankEmojiField(event) {
  if (event.target.value.trim()) return;
  const icon = randomIcon();
  event.target.value = icon;
  if (event.target.id === "playerIconText") selectedIcon = icon;
}

export function wireAppearancePicker() {
  document.getElementById("playerIconText").addEventListener("input", updateSelectedIcon);
  document.getElementById("playerIconText").addEventListener("focus", clearEmojiField);
  document.getElementById("playerIconText").addEventListener("blur", resetBlankEmojiField);
  document.getElementById("playerColorText").addEventListener("input", updateSelectedColorFromText);
  document.getElementById("playerColorText").addEventListener("blur", normalizeSelectedColorText);
  document.getElementById("playerColorNative").addEventListener("input", updateSelectedColorFromNative);
}
