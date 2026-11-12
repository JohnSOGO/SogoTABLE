// The Mystic Wood — pictures with fallback. Turns a slot id into an <img> when assets.js maps one,
// otherwise into the game's existing emoji / initial crest. Presentation only; knows no rule.
import { ASSETS } from "./assets.js";
import { DEN, KNIGHTS, THINGS } from "./content.js";
import { E } from "./util.js";

const img = (url, cls, alt) => (url ? `<img class="${cls}" src="${E(url)}" alt="${E(alt)}" decoding="async">` : "");

// A card-sized picture for an encounter popup or a peek; "" when there is none (the emoji title stays).
export const denPic = (id) => img(ASSETS.denizens[id], "mw-pic", (DEN[id] || {}).name || "");
export const thingPic = (id) => img(ASSETS.things[id], "mw-pic mw-pic-thing", (THINGS[id] || {}).name || "");

// The round crest beside a knight's name: their portrait, or the coloured initial it always was.
export function knightCrest(knightId, color, letter) {
  const url = ASSETS.knights[knightId];
  const inner = url ? img(url, "mw-crest-img", (KNIGHTS[knightId] || {}).name || "") : E(letter || "?");
  return `<span class="crest${url ? " has-img" : ""}" style="background:${E(color)}">${inner}</span>`;
}
