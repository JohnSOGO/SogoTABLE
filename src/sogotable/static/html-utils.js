import { getContrastAwareTextColor, isHexColor } from "./color-utils.js";

export function avatarHtml(player) {
  const background = isHexColor(player.color || "") ? player.color : "#1f7a5f";
  const foreground = getContrastAwareTextColor(background);
  return `<span class="avatar" style="background:${escapeHtml(background)};color:${foreground}">${escapeHtml(player.icon)}</span>`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
