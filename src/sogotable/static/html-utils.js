import { getContrastAwareTextColor, isHexColor } from "./color-utils.js";

export function avatarHtml(player) {
  const background = isHexColor(player.color || "") ? player.color : "#1f7a5f";
  const foreground = getContrastAwareTextColor(background);
  return `<span class="avatar" style="background:${escapeHtml(background)};color:${foreground}">${escapeHtml(player.icon)}</span>`;
}

// Trim an icon field down to a single emoji/grapheme. Intl.Segmenter keeps
// multi-codepoint clusters (ZWJ families, skin tones, flags) intact; the spread
// fallback at least respects surrogate pairs on older engines.
export function firstEmoji(value) {
  const text = String(value).trim();
  if (!text) return "";
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) return segment;
  }
  return [...text][0] || "";
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
