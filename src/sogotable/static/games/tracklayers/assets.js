// Tracklayers — swappable assets.
//
// HOW TO SWAP ART OR SOUNDS
//   1. Drop your file into this folder (src/sogotable/static/games/tracklayers/),
//      e.g. `sea.jpg`, `card-red.png`, `claim.mp3`.
//   2. Set the matching key below to its URL. Use a URL relative to THIS file
//      via `new URL("./claim.mp3", import.meta.url).href` (works no matter where
//      the app is hosted), or any absolute URL. When replacing a file, change
//      its name (`claim-v2.mp3`) so phones never keep a cached copy.
//   3. `null` (the default everywhere) = the built-in procedural SVG map and
//      synthesised sounds. Nothing else needs to change.
//
//   seaImage:  url — an image drawn under the whole map (1000×700 board units,
//              stretched to fit). The procedural islands still draw on top.
//   cardArt:   { [color]: url } — an image shown inside a card chip for that
//              card colour (`red` … `white`, `wild`). The colour band stays.
//   sounds:    { draw, claim, claimOther, tickets, reject, finalRound, win }.
//
// The palette drives every procedural colour; `light` and `dark` follow the
// platform theme (<html data-theme>). Change a hex here to re-skin the board.
// `cards` are the 8 rail colours + `wild` (the Lantern card) + `gray` (routes
// that take any one colour). Card ids never change — only their colours here
// and their names in branding.js.
export const ASSETS = {
  palette: {
    light: {
      sea: "#bfe0ea", seaDeep: "#9ccbdc", wave: "rgba(255,255,255,.55)",
      shore: "#efe2bd", land: "#cfe3a8", landShade: "#b9d48e", landEdge: "rgba(96,120,60,.35)",
      city: "#fffaf0", cityRing: "#3b3326", label: "#2b2418", labelHalo: "rgba(255,252,240,.92)",
      carEdge: "rgba(30,24,16,.55)", claimedEdge: "#1b1610", window: "rgba(255,255,255,.85)",
      select: "#ffcf33", afford: "#ffe066", path: "#e2376b", ticketRing: "#e2376b", locked: 0.28,
      cards: {
        red: "#d8433b", orange: "#ec8a2c", yellow: "#f2cb2f", green: "#3f9e4d",
        blue: "#2f6fd0", purple: "#8c4fc4", black: "#2e2e33", white: "#f4f1e8",
        wild: "#ffb627", gray: "#a6a39c",
      },
      cardInk: {
        red: "#fff", orange: "#2a1a08", yellow: "#2a2108", green: "#fff",
        blue: "#fff", purple: "#fff", black: "#fff", white: "#2a2418",
        wild: "#2a1a08", gray: "#1f1d1a",
      },
    },
    dark: {
      sea: "#14303b", seaDeep: "#0f2630", wave: "rgba(170,220,235,.14)",
      shore: "#5d5640", land: "#34503a", landShade: "#2c4632", landEdge: "rgba(150,190,130,.25)",
      city: "#f4ecd8", cityRing: "#0d0b08", label: "#f1ead8", labelHalo: "rgba(10,18,20,.9)",
      carEdge: "rgba(0,0,0,.7)", claimedEdge: "#000", window: "rgba(255,255,255,.8)",
      select: "#ffd84a", afford: "#ffe98a", path: "#ff6f9a", ticketRing: "#ff6f9a", locked: 0.25,
      cards: {
        red: "#e2554c", orange: "#f0953a", yellow: "#f0cd3c", green: "#4fb35e",
        blue: "#4a86e3", purple: "#a06ad6", black: "#18181c", white: "#ece8dc",
        wild: "#ffbf3f", gray: "#8d8a83",
      },
      cardInk: {
        red: "#fff", orange: "#1f1405", yellow: "#1f1905", green: "#06140a",
        blue: "#fff", purple: "#fff", black: "#f1ead8", white: "#1d1912",
        wild: "#1f1405", gray: "#121110",
      },
    },
  },
  seaImage: null,
  cardArt: { red: null, orange: null, yellow: null, green: null, blue: null, purple: null, black: null, white: null, wild: null },
  // Shared Kenney CC0 files from static/sounds/ (docs/SOUNDS.md); null = synth.
  sounds: {
    draw: new URL("../../sounds/card-deal.mp3", import.meta.url).href,
    claim: null, claimOther: null,
    tickets: new URL("../../sounds/trick-take.mp3", import.meta.url).href,
    reject: null, finalRound: null,
    win: null, // the shell already plays the global win/lose jingle at game end
  },
};

export function paletteFor(theme) {
  return theme === "dark" ? ASSETS.palette.dark : ASSETS.palette.light;
}
