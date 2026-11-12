// Reefkeepers — swappable assets.
//
// HOW TO SWAP ART OR SOUNDS
//   1. Drop your file into this folder (src/sogotable/static/games/reefkeepers/),
//      e.g. `habitat-coral.png`, `grotto.svg`, `place.mp3`.
//   2. Set the matching key below to its URL. Use a URL relative to THIS file
//      via `new URL("./habitat-coral.png", import.meta.url).href` (works no
//      matter where the app is hosted), or any absolute URL.
//   3. `null` (the default everywhere) = use the built-in procedural SVG art /
//      synthesized sound. Nothing else needs to change.
//   When replacing a file later, change its name (`coral-v2.png`) so phones
//   never show a cached copy.
//
//   habitats: { [habitatId]: url } — a square image for one half-tile of that
//             habitat (sand, kelp, lagoon, seagrass, coral, trench). Pearls are
//             drawn on top of it.
//   grotto:   url — a square image for the home tile.
//   pearl:    url — a small round image used for every pearl.
//   sounds:   { place, pick, bumped, round, score, win } — audio files.
//
// The palette drives every procedural colour; `light` and `dark` follow the
// platform theme (<html data-theme>) and are emitted as --rk-* CSS tokens by
// styles.js, so a theme flip needs no repaint. Change a hex here to re-skin.
export const ASSETS = {
  palette: {
    light: {
      // table + chrome
      bg: "#eef7f6", panel: "#ffffff", ink: "#16323a", muted: "#5d7a80", line: "#cfe3e3", chip: "#e3f2f1",
      accent: "#0f8f8a", accentInk: "#ffffff", warn: "#c0392b", good: "#2e8b57", gold: "#f2b52c", win: "#fff3cf",
      water: "#cdeaee", waterDeep: "#b4dde3", empty: "#e6f5f6", emptyLine: "#a9d3da", spot: "#f2b52c",
      // habitats
      sandBg: "#efd9a3", sandInk: "#c69f57", sandHi: "#fbecc6",
      kelpBg: "#2c7656", kelpInk: "#7bc96b", kelpHi: "#b6ea8d",
      lagoonBg: "#3dbacb", lagoonInk: "#e8fbff", lagoonHi: "#8fe3ee",
      seagrassBg: "#a8cf63", seagrassInk: "#4f8a2a", seagrassHi: "#e1f2a6",
      coralBg: "#f8b9a8", coralInk: "#de4766", coralHi: "#fff0e8",
      trenchBg: "#28326f", trenchInk: "#0d1336", trenchHi: "#86f4ff",
      grottoBg: "#a9dfe6", grottoShell: "#fbd3b0", grottoRib: "#d9875a", grottoDoor: "#5b3d73",
      pearl: "#ffffff", pearlShade: "#b9c3dc", pearlRim: "rgba(20,40,60,.62)",
    },
    dark: {
      bg: "#0d171c", panel: "#14232a", ink: "#e3f2f2", muted: "#8eaab0", line: "#24404a", chip: "#1a2f37",
      accent: "#2cc3bb", accentInk: "#06201f", warn: "#ff6b5e", good: "#5fd08c", gold: "#ffd166", win: "#3b3417",
      water: "#0f2a33", waterDeep: "#0b222a", empty: "#14313b", emptyLine: "#2c5662", spot: "#ffd166",
      sandBg: "#cdb47e", sandInk: "#9a7a3e", sandHi: "#e6d3a2",
      kelpBg: "#1f5d43", kelpInk: "#62b45a", kelpHi: "#9bd97a",
      lagoonBg: "#2a98a9", lagoonInk: "#d4f7ff", lagoonHi: "#6fd3e2",
      seagrassBg: "#87ad4a", seagrassInk: "#3b6d1d", seagrassHi: "#c5e08a",
      coralBg: "#e3998a", coralInk: "#c42f53", coralHi: "#ffe1d6",
      trenchBg: "#2b3784", trenchInk: "#0a0f2e", trenchHi: "#7ff6ff",
      grottoBg: "#3f8f9b", grottoShell: "#efc29c", grottoRib: "#c0703f", grottoDoor: "#3a2650",
      pearl: "#f4f7ff", pearlShade: "#97a3c2", pearlRim: "rgba(0,0,0,.55)",
    },
  },
  habitats: { sand: null, kelp: null, lagoon: null, seagrass: null, coral: null, trench: null },
  grotto: null,
  pearl: null,
  sounds: { place: null, pick: null, bumped: null, round: null, score: null, win: null },
};
