// Potion Lab — card pictures with fallback. Presentation only: no scoring or legality here.
import { ASSETS } from "./assets.js";

// The in-hand card face: the picture (with `badge` — e.g. the potion value or moon count — on top),
// or `fallbackHtml`, the emoji face, when no picture is mapped.
export function cardArt(type, name, badge, fallbackHtml) {
  const url = ASSETS.cards[type];
  if (!url) return fallbackHtml;
  return `<span class="pl-face pl-pic"><img src="${url}" alt="${name}" decoding="async">${badge ? `<b class="pl-badge">${badge}</b>` : ""}</span>`;
}
