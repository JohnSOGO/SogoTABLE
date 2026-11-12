// Last Orders — swappable assets.
//
// HOW TO SWAP ART OR SOUNDS
//   1. Drop your file into this folder (src/sogotable/static/games/last-orders/),
//      e.g. `gorrum.png`, `card-back.webp`, `coins.mp3`.
//   2. Set the matching key below to its URL. Use a URL relative to THIS file
//      via `new URL("./gorrum.png", import.meta.url).href` (works no matter
//      where the app is hosted), or any absolute URL.
//   3. `null` / missing (the default everywhere) = use the built-in procedural
//      SVG art in art.js / synthesized sound. Nothing else needs to change.
//
//   portraits: { [characterId]: url } — a square bust image (e.g. "base:gorrum").
//              Shown cropped to a rounded square, so keep the face centred.
//   cards:     { [cardId]: url }  — card illustration (square), e.g.
//              "base:gorrum:headbutt". Missing ids use the effect icon art.
//   drinks:    { [drinkId]: url } — drink illustration (square).
//   cardBack / drinkBack / tableBg: url — one image each (tableBg tiles/covers).
//   sounds:    { play, react, drink, coins, hit, gamble, out, win, tick, turn }.
//
// The palette drives every procedural colour; `light` and `dark` follow the
// platform theme (<html data-theme>). Change a hex here to re-skin the game.
// Character skin/hair colours live with their drawings in art.js; only the
// frames, backdrops, icons, card kinds and table come from here.
export const ASSETS = {
  palette: {
    light: {
      ink: "#3b2a1f", inkSoft: "rgba(59,42,31,.55)", paper: "#fbf3e2", glow: "#ffe3a6",
      backdropLift: 0.55, backdropDrop: 0, // portrait backdrop: mix toward white / black
      frame: "#8a5a35", frameLight: "#d6a86f",
      tableA: "#c99460", tableB: "#bb8653", tableC: "#d4a06b", tableGrain: "rgba(96,54,22,.16)", tableSeam: "rgba(70,38,14,.32)",
      action: "#d4573b", reaction: "#3d7dbf", gamble: "#8a52b8", spike: "#4f9a4a", generic: "#9a7a55",
      cardGlow: "rgba(255,246,214,.55)",
      gold: "#f4c34a", goldDark: "#b6822a", goldLight: "#fff0b0",
      heart: "#e2475b", heartDark: "#a82c3e", buzz: "#e46fa3", buzzLight: "#ffd1e6",
      bolt: "#ffd23f", foam: "#fffaf0", pewter: "#aab0b4", pewterDark: "#727a80",
      woodVessel: "#9c6233", woodVesselDark: "#6e4020", glass: "rgba(214,238,246,.55)", glassEdge: "#7fa6b4",
      skinFist: "#efbf94", bone: "#f6ecd6",
      cardBackA: "#7c2f2a", cardBackB: "#561d1b", cardBackTrim: "#e8b95a",
      drinkBackA: "#2f5f51", drinkBackB: "#1d3d35", drinkBackTrim: "#e8c46a",
      badge: "#fff7e3",
    },
    dark: {
      ink: "#1c130d", inkSoft: "rgba(255,236,210,.45)", paper: "#2a211b", glow: "#7a5a2e",
      backdropLift: 0, backdropDrop: 0.42,
      frame: "#5e3d24", frameLight: "#a77d4c",
      tableA: "#4a3222", tableB: "#412b1d", tableC: "#523827", tableGrain: "rgba(0,0,0,.22)", tableSeam: "rgba(0,0,0,.45)",
      action: "#b4472f", reaction: "#33689f", gamble: "#73449b", spike: "#41803d", generic: "#7c6346",
      cardGlow: "rgba(255,226,170,.22)",
      gold: "#e7b43c", goldDark: "#94671c", goldLight: "#ffe596",
      heart: "#cf3d51", heartDark: "#8a2333", buzz: "#d35f93", buzzLight: "#f5b5d2",
      bolt: "#f5c52c", foam: "#f4ead6", pewter: "#9aa0a4", pewterDark: "#5f666b",
      woodVessel: "#8a5529", woodVesselDark: "#5a3418", glass: "rgba(190,220,232,.45)", glassEdge: "#6c92a0",
      skinFist: "#e2b087", bone: "#e9dcc2",
      cardBackA: "#5e2320", cardBackB: "#3c1412", cardBackTrim: "#d3a447",
      drinkBackA: "#23493f", drinkBackB: "#132b25", drinkBackTrim: "#d0ad57",
      badge: "#f6ead0",
    },
  },
  portraits: {},
  cards: {},
  drinks: {},
  cardBack: null,
  drinkBack: null,
  tableBg: null,
  sounds: {
    play: new URL("./sounds/play.mp3", import.meta.url).href,
    react: null, drink: null,
    coins: new URL("./sounds/coins.mp3", import.meta.url).href,
    hit: null, gamble: null, out: null, win: null, tick: null, turn: null,
  },
};

export function paletteFor(theme) {
  return theme === "dark" ? ASSETS.palette.dark : ASSETS.palette.light;
}
