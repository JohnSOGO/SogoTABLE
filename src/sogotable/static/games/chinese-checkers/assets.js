// Chinese Checkers — swappable assets.
//
// HOW TO SWAP ART OR SOUNDS
//   1. Drop your file into this folder (src/sogotable/static/games/chinese-checkers/),
//      e.g. `marble.png`, `board.jpg`, `hop.mp3`.
//   2. Set the matching key below to its URL. Use a URL relative to THIS file via
//      `new URL("./hop.mp3", import.meta.url).href` (works wherever the app is
//      hosted), or any absolute URL. When replacing a file later, change its
//      name (`hop-v2.mp3`) so phones don't keep a cached copy.
//   3. `null` (the default everywhere) = the built-in procedural SVG art /
//      synthesised sound. Nothing else needs to change.
//
//   marble: url — ONE image drawn for every marble (square, transparent
//           background). It is laid over a disc in the seat colour, so players
//           stay distinguishable; a mostly-transparent glass highlight works best.
//   board:  url — an image laid under the holes, fitted to the star's bounding
//           square (viewer's home arm at the bottom; the image is rotated with the
//           board). Holes, tints and highlights are still drawn on top.
//   sounds: { step, hop, land, capture, bounce, lock, round, finish, win, reject, tick, turn }.
//
// The palette drives every procedural colour; `light` and `dark` follow the
// platform theme (<html data-theme>). Change a hex here to re-skin the board.
// Seat colours come from the room (room.players[].color); `seatFallback` is used
// only when a seat has none.
export const ASSETS = {
  palette: {
    light: {
      table: "#e9dfc9", tableEdge: "#d8c9a8",
      woodLight: "#e2b97c", woodMid: "#c8904f", woodDark: "#8f5a2b", woodGrain: "rgba(92,52,18,.10)", woodRim: "#6f421c",
      inlay: "#efd3a1", inlayEdge: "rgba(110,66,28,.35)", lines: "rgba(96,58,22,.22)",
      holeDeep: "#4a2d14", holeMid: "#7a4d25", holeRim: "rgba(255,240,210,.55)",
      armTint: 0.5, armTintNeutral: "rgba(255,255,255,0)",
      select: "#ffd23f", step: "#ffffff", hop: "#ffd23f", reach: "rgba(255,255,255,.75)",
      path: "#fff6d6", pathEdge: "rgba(60,35,10,.55)", goal: "#ffffff",
      shadow: "rgba(40,20,5,.45)",
    },
    dark: {
      table: "#161b19", tableEdge: "#232a27",
      woodLight: "#8e6236", woodMid: "#6c4523", woodDark: "#3e2610", woodGrain: "rgba(0,0,0,.10)", woodRim: "#2a180a",
      inlay: "#7f5a33", inlayEdge: "rgba(0,0,0,.4)", lines: "rgba(0,0,0,.28)",
      holeDeep: "#120a04", holeMid: "#2d1b0c", holeRim: "rgba(255,220,170,.22)",
      armTint: 0.45, armTintNeutral: "rgba(0,0,0,0)",
      select: "#ffd23f", step: "#f4f1e8", hop: "#ffd23f", reach: "rgba(244,241,232,.6)",
      path: "#fff2c4", pathEdge: "rgba(0,0,0,.6)", goal: "#f4f1e8",
      shadow: "rgba(0,0,0,.6)",
    },
  },
  // Used when room.players[].color is missing (index = seat_order position).
  seatFallback: ["#e23b3b", "#2f6fe0", "#f2b705", "#22a35a", "#9b4fd6", "#f07a1a"],
  // Glass look: how far the gradient lightens/darkens the seat colour.
  marbleLook: { highlight: 0.62, core: 0.08, edge: 0.42, specular: 0.85, radius: 0.40 },
  marble: null,
  // Illustrated wood inlay (docs/PICTURES.md); the star clip and holes are drawn on top.
  board: new URL("./img/board.webp", import.meta.url).href,
  sounds: { step: null, hop: null, land: null, capture: null, bounce: null, lock: null, round: null, finish: null, win: null, reject: null, tick: null, turn: null },
};

export function paletteFor(theme) {
  return theme === "dark" ? ASSETS.palette.dark : ASSETS.palette.light;
}
