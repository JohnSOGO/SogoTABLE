// Bloomwork — swappable assets.
//
// HOW TO SWAP ART OR SOUNDS
//   1. Drop your file into this folder (src/sogotable/static/games/bloomwork/),
//      e.g. `rose.png`, `bird.webp`, `plant.mp3`.
//   2. Set the matching key below to its URL. Use a URL relative to THIS file
//      via `new URL("./rose.png", import.meta.url).href` (works no matter
//      where the app is hosted), or any absolute URL.
//   3. `null` / missing (the default everywhere) = use the built-in procedural
//      SVG art in art.js / synthesized sound in sfx.js. Nothing else changes.
//   When you REPLACE a file later, change its name (rose-v2.png) so phones
//   don't keep a cached copy.
//
//   flowerArt: { rose, iris, sun, lilac, fern } — a square tile picture. It is
//              drawn inside the rounded tile, so keep a little margin.
//   birdArt:   the Early Bird token (square, shown in a circle).
//   tableBg:   one image behind the whole table (tiles/covers).
//   sounds:    { pick, take, clash, plant, compost, round, turn, win, tick, reject }.
//
// The palette drives every procedural colour; `light` and `dark` follow the
// platform theme (<html data-theme>). styles.js turns each entry into a CSS
// custom property (`--bw-<flower>-<part>`, `--bw-<key>`), so a theme flip
// restyles the SVG art with no re-render. Change a hex here to re-skin.
export const ASSETS = {
  palette: {
    light: {
      flowers: {
        rose: { tile: "#fde3e6", petal: "#e0475e", deep: "#a52440", heart: "#ffd0d8" },
        iris: { tile: "#e1e9fd", petal: "#4a6fe0", deep: "#2a3f99", heart: "#f2c94c" },
        sun: { tile: "#fff1c4", petal: "#f2b315", deep: "#c47f05", heart: "#6b3f1d" },
        lilac: { tile: "#efe2fb", petal: "#9a5bd6", deep: "#6a33a3", heart: "#f6e8ff" },
        fern: { tile: "#dff3e2", petal: "#3f9d55", deep: "#23703a", heart: "#a7dcae" },
      },
      leaf: "#4c9a5a", leafDark: "#2f6e3c",
      soil: "#7a5236", soilDark: "#5b3a24", soilSpeck: "rgba(255,236,210,.18)",
      pot: "#d9774a", potDark: "#a8532c", potRim: "#eb9466",
      stone: "#e9e2d2", stoneDark: "#cfc4ad",
      birdBody: "#e0653a", birdWing: "#9c3c1f", birdBelly: "#ffd9a8", birdBeak: "#f2b315", birdEye: "#2b1a12",
      tileEdge: "rgba(60,40,30,.18)",
    },
    dark: {
      flowers: {
        rose: { tile: "#4a2730", petal: "#ff6f86", deep: "#c23a57", heart: "#ffd0d8" },
        iris: { tile: "#26304d", petal: "#7d9cff", deep: "#4462d6", heart: "#f2c94c" },
        sun: { tile: "#46391a", petal: "#ffcd3c", deep: "#d99a10", heart: "#5a3416" },
        lilac: { tile: "#3a2950", petal: "#c08af2", deep: "#8a4fcf", heart: "#f3e3ff" },
        fern: { tile: "#21402a", petal: "#5cc475", deep: "#2f8a49", heart: "#a7dcae" },
      },
      leaf: "#4f9d5d", leafDark: "#2a6337",
      soil: "#4a3324", soilDark: "#2f1f15", soilSpeck: "rgba(255,236,210,.10)",
      pot: "#a85a36", potDark: "#733b20", potRim: "#c47149",
      stone: "#3a3630", stoneDark: "#2b2823",
      birdBody: "#e8744a", birdWing: "#a5462a", birdBelly: "#ffd9a8", birdBeak: "#f6c02a", birdEye: "#1a100b",
      tileEdge: "rgba(0,0,0,.35)",
    },
  },
  // Illustrated tiles (docs/PICTURES.md); set a key to null to go back to the drawn SVG.
  flowerArt: Object.fromEntries("rose iris sun lilac fern".split(" ").map((f) => [f, new URL(`./img/flower-${f}.webp`, import.meta.url).href])),
  birdArt: new URL("./img/bird.webp", import.meta.url).href,
  tableBg: null,
  sounds: { pick: null, take: null, clash: null, plant: null, compost: null, round: null, turn: null, win: null, tick: null, reject: null },
};

export function paletteFor(theme) {
  return theme === "dark" ? ASSETS.palette.dark : ASSETS.palette.light;
}

// The palette as CSS custom-property declarations (styles.js puts the light
// set on .bloomwork-root and the dark set under html[data-theme="dark"]).
export function paletteCssVars(theme) {
  const p = paletteFor(theme);
  const out = [];
  Object.entries(p.flowers).forEach(([id, parts]) => {
    Object.entries(parts).forEach(([part, value]) => out.push(`--bw-${id}-${part}:${value}`));
  });
  Object.entries(p).forEach(([key, value]) => {
    if (typeof value === "string") out.push(`--bw-${key}:${value}`);
  });
  return out.join(";");
}
