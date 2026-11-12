// Battleship — swappable assets.
//
// HOW TO SWAP ART OR SOUNDS
//   1. Drop your file into this folder (src/sogotable/static/games/battleship/),
//      e.g. `carrier.png`, `explosion.mp3`.
//   2. Set the matching key below to its URL. Use a URL relative to THIS file
//      via `new URL("./carrier.png", import.meta.url).href` (works no matter
//      where the app is hosted), or any absolute URL.
//   3. `null` (the default everywhere) = use the built-in SVG ship art /
//      synthesised sound. Nothing else needs to change.
//
//   ships:  { [shipId]: url } — a top-down image of the ship drawn HORIZONTAL
//           with the bow pointing RIGHT, roughly `size` × 1 cells. Vertical
//           ships are rotated by the board. Ids come from the server fleet:
//           carrier, battleship, cruiser, submarine, destroyer.
//   sounds: { fire, incoming, hit, miss, sunk } — audio files.
//           fire = your shot launching, incoming = enemy shot on its way,
//           hit / miss = the result landing, sunk = a ship going down.
//
// The palette drives every procedural colour; `light` and `dark` follow the
// platform theme (<html data-theme>). Change a hex here to re-skin the sea
// and the fleet.
export const ASSETS = {
  palette: {
    light: {
      seaDeep: "#1d5f8f", seaMid: "#2b7fb4", seaLight: "#5cb3dd", foam: "rgba(255,255,255,.55)",
      gridLine: "rgba(255,255,255,.22)",
      hull: "#7d8a96", hullLight: "#b9c4cc", hullDark: "#47525c", waterline: "#8c2f2f",
      deck: "#9aa6ae", deckLight: "#c4ccd2", wood: "#b08a5a",
      tower: "#d8dee2", towerDark: "#8b969e", gun: "#3b444c", window: "#2a3640",
      subHull: "#3f4a52", subLight: "#6b7880",
      shadow: "rgba(4,24,40,.45)", wreck: "#3a3330",
      fire: "#ff8a1f", fireCore: "#ffe27a", smoke: "rgba(60,60,64,.55)",
      missPeg: "#f4f8fb", hitPeg: "#e3342f",
    },
    dark: {
      seaDeep: "#071a2b", seaMid: "#0d2c45", seaLight: "#1b4d73", foam: "rgba(170,210,240,.32)",
      gridLine: "rgba(140,190,230,.14)",
      hull: "#5f6c77", hullLight: "#93a0aa", hullDark: "#2e3840", waterline: "#6e2525",
      deck: "#76838c", deckLight: "#9eabb3", wood: "#8a6b45",
      tower: "#aeb8bf", towerDark: "#66727b", gun: "#232a30", window: "#9fd3ff",
      subHull: "#2c353c", subLight: "#4c5961",
      shadow: "rgba(0,0,0,.55)", wreck: "#29231f",
      fire: "#ff7a14", fireCore: "#ffd45e", smoke: "rgba(30,30,34,.6)",
      missPeg: "#cfe3f2", hitPeg: "#ff4d4a",
    },
  },
  ships: { carrier: null, battleship: null, cruiser: null, submarine: null, destroyer: null },
  sounds: { fire: null, incoming: null, hit: null, miss: null, sunk: null },
};

export function paletteFor(theme) {
  return theme === "dark" ? ASSETS.palette.dark : ASSETS.palette.light;
}
