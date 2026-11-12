// Realmwright — swappable assets.
//
// HOW TO SWAP ART OR SOUNDS
//   1. Drop your file into this folder (src/sogotable/static/games/realmwright/),
//      e.g. `tile-city1.png`, `meeple.svg`, `place.mp3`.
//   2. Set the matching key below to its URL. Use a URL relative to THIS file
//      via `new URL("./tile-city1.png", import.meta.url).href` (works no matter
//      where the app is hosted), or any absolute URL.
//   3. `null` (the default everywhere) = use the built-in procedural SVG art /
//      synthesized sound. Nothing else needs to change.
//
//   tiles:  { [typeId]: url } — a square image of the tile drawn UNROTATED
//           (north up, as the TileDef describes it). The board rotates it.
//           Type ids come from the server's tile_defs (e.g. "base:city1-road").
//   tileFeatureArt: { [kind]: url } — optional small icon drawn at a feature's
//           anchor on procedural tiles (e.g. a custom cloister picture).
//   meeple: url — one image used for every player's piece (it is tinted with
//           a coloured ring underneath so players stay distinguishable).
//   sounds: { tap, place, meeple, complete, reject, round, win } — audio files.
//
// The palette drives every procedural colour; `light` and `dark` follow the
// platform theme (<html data-theme>). Change a hex here to re-skin the board.
export const ASSETS = {
  palette: {
    light: {
      boardBg: "#efe6cf", boardGrid: "rgba(120,96,60,.10)",
      field: "#93c25e", fieldShade: "#7aae49", fieldLight: "#acd47a", grass: "#5f9238",
      flowerA: "#fff3b0", flowerB: "#f4a9bd",
      road: "#ecd7a6", roadEdge: "#a9804b", cobble: "#c9a76f",
      city: "#dcc09a", cityShade: "#c7a67b", wall: "#9b8a72", wallLight: "#cbbb9f", wallDark: "#62523f",
      house: "#f8eedb", roofA: "#c95b3f", roofB: "#a9432f", roofC: "#6f84a8",
      cloisterWall: "#f6eedd", cloisterRoof: "#8d4d39", garden: "#b3da84", hedge: "#4e8a3a",
      pennant: "#2f6fa8", pennantStar: "#f4cd52", pole: "#6b4f2f",
      ink: "#47382a", highlight: "#fff6a8", tileEdge: "rgba(71,56,42,.22)",
    },
    dark: {
      boardBg: "#1a201c", boardGrid: "rgba(200,220,190,.06)",
      field: "#5e8d3f", fieldShade: "#4f7b33", fieldLight: "#6f9d4c", grass: "#3e6526",
      flowerA: "#d9cf8f", flowerB: "#c98aa0",
      road: "#c2ad82", roadEdge: "#7a5d38", cobble: "#a48b5e",
      city: "#a98d68", cityShade: "#957955", wall: "#7b6d5b", wallLight: "#a4957d", wallDark: "#41372b",
      house: "#d9ccb2", roofA: "#a04a35", roofB: "#863a29", roofC: "#57698a",
      cloisterWall: "#dcd2bd", cloisterRoof: "#713e2f", garden: "#7fa95c", hedge: "#365f29",
      pennant: "#3c7fbd", pennantStar: "#e9c34c", pole: "#4d3a24",
      ink: "#211a12", highlight: "#ffe98a", tileEdge: "rgba(0,0,0,.35)",
    },
  },
  tiles: {},
  tileFeatureArt: {},
  meeple: null,
  sounds: { tap: null, place: null, meeple: null, complete: null, reject: null, round: null, win: null },
};

export function paletteFor(theme) {
  return theme === "dark" ? ASSETS.palette.dark : ASSETS.palette.light;
}
