// Hidden Isles — swappable assets.
//
// HOW TO SWAP ART OR SOUNDS
//   1. Drop your file into this folder (src/sogotable/static/games/hidden-isles/),
//      e.g. `island-parrot.webp`, `kraken.svg`, `reveal.mp3`.
//   2. Set the matching key below to its URL. Use a URL relative to THIS file
//      via `new URL("./kraken.svg", import.meta.url).href` (works no matter
//      where the app is hosted), or any absolute URL. When replacing a file
//      later, change its name (or add `?v=2`) so phones drop the cached copy.
//   3. `null` (the default everywhere) = use the built-in inline-SVG art /
//      synthesized sound. Nothing else needs to change.
//
//   art:    { A, B, neutral, trap } — picture shown on a REVEALED card of that
//           key (A/B = each crew's island). Drawn centred, contained, above the
//           word. `sea` — background picture behind the 5×5 chart.
//   sounds: { clue, reveal_good, reveal_bad, sandbar, kraken, turn, win, lose,
//             mark, deal } — audio files for each cue.
//
// The palette drives every colour (cards, crews, art); `light` and `dark`
// follow the platform theme (<html data-theme>). styles.js turns each entry
// into a `--hi-<kebab-name>` CSS token, so a re-skin is a hex edit here.
export const ASSETS = {
  palette: {
    light: {
      sea: "#cfeaf2", seaDeep: "#a7d6e6", seaLine: "rgba(31,98,128,.16)",
      card: "#fff8e8", cardEdge: "#e2d2ad", cardInk: "#2c2a33", cardShadow: "rgba(60,48,20,.18)",
      crewA: "#ec6a57", crewASoft: "#ffe0d9", crewAInk: "#8c2a1c",
      crewB: "#169c92", crewBSoft: "#cdf0eb", crewBInk: "#0b5a54",
      sand: "#e6cd8f", sandSoft: "#f6ebcb", sandInk: "#7a5f22",
      kraken: "#7a48b8", krakenSoft: "#e9dcf8", krakenInk: "#46227a", krakenText: "#ffffff",
      leaf: "#3d9a4e", trunk: "#9b6b3c", beak: "#ffc23d", foam: "#ffffff",
      highlight: "#ffcf26",
      panel: "#ffffff", ink: "#22303a", muted: "#5f6f7a", line: "#d8e3e8", chip: "#eef4f6",
      btn: "#1d6f8f", btnInk: "#ffffff", danger: "#b3261e",
    },
    dark: {
      sea: "#0f2a36", seaDeep: "#0a1f29", seaLine: "rgba(140,210,235,.10)",
      card: "#26323b", cardEdge: "#3a4954", cardInk: "#eef3f5", cardShadow: "rgba(0,0,0,.45)",
      crewA: "#ff8a77", crewASoft: "#4a2a26", crewAInk: "#ffc7bd",
      crewB: "#38c9bc", crewBSoft: "#173f3c", crewBInk: "#a6efe7",
      sand: "#c9ab68", sandSoft: "#3b3424", sandInk: "#ecd9a6",
      kraken: "#a77ce6", krakenSoft: "#33244c", krakenInk: "#dccaff", krakenText: "#1b0f2e",
      leaf: "#4fb35f", trunk: "#a9784a", beak: "#ffcb52", foam: "#e8f4f8",
      highlight: "#ffd84a",
      panel: "#17232b", ink: "#e6eef2", muted: "#9db0bb", line: "#2c3c46", chip: "#22313b",
      btn: "#3aa0c8", btnInk: "#06141b", danger: "#ff8a80",
    },
  },
  art: { A: null, B: null, neutral: null, trap: null, sea: null },
  sounds: {
    clue: null, reveal_good: null, reveal_bad: null, sandbar: null, kraken: null,
    turn: null, win: null, lose: null, mark: null, deal: null,
  },
};

export function paletteFor(theme) {
  return theme === "dark" ? ASSETS.palette.dark : ASSETS.palette.light;
}
