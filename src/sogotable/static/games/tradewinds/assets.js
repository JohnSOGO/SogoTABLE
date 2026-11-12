// Tradewind Isles — swappable assets.
//
// HOW TO SWAP ART OR SOUNDS
//   1. Drop your file into this folder (src/sogotable/static/games/tradewinds/),
//      e.g. `grove.webp`, `hut.svg`, `roll.mp3`.
//   2. Set the matching key below to its URL. Use a URL relative to THIS file
//      via `new URL("./grove.webp", import.meta.url).href` (works no matter
//      where the app is hosted), or any absolute URL.
//   3. `null` (the default everywhere) = use the built-in procedural SVG art /
//      emoji / synthesized sound. Nothing else needs to change.
//
//   terrain:   { grove, clay, meadow, orchard, quarry, volcano } — a square-ish
//              image clipped to the hex (pointy-top, centred).
//   resources: { timber, clay, fiber, fruit, stone } — small icon used on
//              chips/buttons instead of the emoji in branding.js.
//   pieces:    { hut, lodge } — one image drawn over a player-coloured disc.
//   monkey:    image drawn instead of the 🐒 emoji.
//   sounds:    { roll, produce, build, upgrade, buy, play, trade, steal,
//                monkey, award, win, reject, yourTurn } — audio files.
//
// The palette drives every procedural colour; `light` and `dark` follow the
// platform theme (<html data-theme>). Change a hex here to re-skin the board.
export const ASSETS = {
  palette: {
    light: {
      sea: "#7cc6d9", seaDeep: "#4aa6c2", seaFoam: "rgba(255,255,255,.55)", sand: "#f1dfa8", sandEdge: "#d9bf7c",
      grove: "#5fae57", groveDark: "#3e8a3c", trunk: "#8a5a2b", frond: "#2f7d38",
      clay: "#d98455", clayDark: "#b25e35", clayLight: "#eeb08a",
      meadow: "#b9d870", meadowDark: "#93b84a", tuft: "#7a9b34", flower: "#fff6c8",
      orchard: "#8fc45a", orchardDark: "#6aa23d", treeTop: "#3f8a3a", mango: "#f5a623",
      quarry: "#9aa0a6", quarryDark: "#6e747b", rock: "#c4c9ce", rockDark: "#575d63",
      volcano: "#a9846a", volcanoDark: "#6b4c3a", lava: "#ff6a2b", smoke: "rgba(90,90,90,.35)",
      token: "#fff8e6", tokenEdge: "#8a6d3b", tokenInk: "#3a2c18", tokenHot: "#c62f1f", pip: "#3a2c18",
      dock: "#9b6b3c", dockInk: "#2d2216", dockBadge: "#fffdf4",
      hexEdge: "rgba(60,45,25,.35)", glow: "#ffd23f", glowFill: "rgba(255,210,63,.35)", select: "#ff3d7f",
      pieceEdge: "#1d1712",
    },
    dark: {
      sea: "#14394a", seaDeep: "#0d2a38", seaFoam: "rgba(200,235,255,.18)", sand: "#7d6d47", sandEdge: "#5d5034",
      grove: "#3d7a3a", groveDark: "#2b5c29", trunk: "#6a4520", frond: "#1f5726",
      clay: "#a8603c", clayDark: "#7f4427", clayLight: "#c07e5c",
      meadow: "#7f9a48", meadowDark: "#647d35", tuft: "#4f6627", flower: "#d6cf9c",
      orchard: "#5d8a3a", orchardDark: "#466c2a", treeTop: "#2a5f28", mango: "#d48a1c",
      quarry: "#6a7076", quarryDark: "#4b5056", rock: "#8d9399", rockDark: "#363a3f",
      volcano: "#6d5444", volcanoDark: "#45332a", lava: "#ff7a3d", smoke: "rgba(200,200,200,.18)",
      token: "#efe4c8", tokenEdge: "#6b5430", tokenInk: "#2a2012", tokenHot: "#b3261e", pip: "#2a2012",
      dock: "#7a5330", dockInk: "#efe4c8", dockBadge: "#2a2a24",
      hexEdge: "rgba(0,0,0,.45)", glow: "#ffd23f", glowFill: "rgba(255,210,63,.28)", select: "#ff5c93",
      pieceEdge: "#0b0906",
    },
  },
  terrain: { grove: null, clay: null, meadow: null, orchard: null, quarry: null, volcano: null },
  resources: { timber: null, clay: null, fiber: null, fruit: null, stone: null },
  pieces: { hut: null, lodge: null },
  monkey: null,
  sounds: {
    roll: null, produce: null, build: null, upgrade: null, buy: null, play: null, trade: null,
    steal: null, monkey: null, award: null, win: null, reject: null, yourTurn: null,
  },
};

export function paletteFor(theme) {
  return theme === "dark" ? ASSETS.palette.dark : ASSETS.palette.light;
}
