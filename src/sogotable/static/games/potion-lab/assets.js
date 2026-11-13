// Potion Lab — picture slots (docs/PICTURES.md). Data only: card type -> committed WebP URL.
// A type left out keeps its emoji face (art.js).
const pic = (type) => new URL(`./img/${type}.webp`, import.meta.url).href;

export const ASSETS = {
  cards: Object.fromEntries("potion fire frog mushroom herb moondust ice wizard".split(" ").map((t) => [t, pic(t)])),
};
