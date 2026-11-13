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
//            "base:gorrum:headbutt". Missing ids use the effect icon art.
//   drinks:    { [drinkId]: url } — drink illustration (square).
//   cardBack / drinkBack / tableBg: url — one image each (tableBg tiles/covers).
//   sounds:    { play, react, drink, coins, hit, gamble, out, win, tick, turn, attacked }.
//
// PICTURES (docs/PICTURES.md): illustrated WebP files live in ./img/, named after
// the slot id with ":" turned into "-" (base:gorrum:headbutt -> base-gorrum-headbutt.webp).
// Only ids listed below are mapped, and every listed file is committed (a test
// checks), so any id not listed keeps its SVG art.
//
// The palette drives every procedural colour; `light` and `dark` follow the
// platform theme (<html data-theme>). Change a hex here to re-skin the game.
// Character skin/hair colours live with their drawings in art.js; only the
// frames, backdrops, icons, card kinds and table come from here.
const pic = (id) => new URL(`./img/${id.replace(/:/g, "-")}.webp`, import.meta.url).href;
// "pack:who": "card-a card-b ..." -> { "pack:who:card-a": url, ... }
const picsOf = (groups) => Object.fromEntries(Object.entries(groups).flatMap(([prefix, names]) =>
  names.split(" ").map((n) => [`${prefix}:${n}`, pic(`${prefix}:${n}`)])));
const CHARACTER_IDS = "base:gorrum base:tilly base:ansel base:zephyrine harbor:marrow harbor:nessa frost:hrolga frost:sable masquerade:verrin masquerade:bim clockwork:sprocket clockwork:brassbell";
const CARD_PICS = {
  "base:gorrum": "headbutt shoulder-barge bear-hug table-flip shake-down knuckle-crack arm-wrestle not-on-my-watch no-thanks-big-fella thick-skull bouncer-says-no toss-it-back lucky-knuckles slam-the-table make-it-a-double knuckle-salt",
  "base:tilly": "lift-a-purse quick-fingers pass-the-hat count-the-take shin-kick trip-wire dice-up-the-sleeve wasnt-me under-the-table oops-spilled-it slippery-as-soap lucky-thimble sneaky-peek double-or-nothing pinch-of-pepper mystery-drops",
  "base:ansel": "herbal-tonic sobering-brew staff-sweep stern-lecture collection-plate quiet-meditation calm-the-room charity-coin-toss i-took-a-vow serene-step gentle-palm peace-brother humble-wager blessed-raise monastery-reserve bitter-herbs",
  "base:zephyrine": "mirror-image sparkle-dart time-hiccup phantom-pint dazzle prism-burst illusory-coins smoke-and-mirrors look-over-there not-really-here vanishing-glass unweave shimmering-cards illusion-of-wealth fizzy-glitter starlight-shot",
  "harbor:marrow": "next-ones-on-me keelhaul cutlass-swipe buried-treasure harbor-toll rum-ration wager-at-sea all-hands over-the-rail batten-down belay-that captains-call raise-the-anchor splash-of-brine sailors-measure",
  "harbor:nessa": "siren-shanty undertow seashell-lullaby turn-the-tide salt-spray pearl-wager tidal-mist riptide foam-and-fizzle oceans-hush shell-game high-tide kelp-garnish mermaid-kiss",
  "frost:hrolga": "keg-toss mallet-tap tasting-flight brewers-tab hearty-stew cask-wager stone-belly seen-worse oaken-shield hall-rules rune-dice stack-the-steins fire-mead-dash smoked-malt",
  "frost:sable": "pinpoint-jab snare snowball read-the-tracks sell-a-pelt follow-the-jingle fox-and-hound tuck-and-roll sniff-it-out vanish-in-snow quick-as-a-fox tail-flick silver-bet frostberry-squeeze pine-needle-shot",
  "masquerade:verrin": "draining-glance velvet-slap noble-tithe old-money tomato-juice-toast backhanded-compliment high-stakes-soiree cape-swirl only-tomato-juice how-dare-you i-insist family-fortune silk-purse ruby-cordial garlic-twist",
  "masquerade:bim": "pie-in-the-face juggling-jugs whoopee-cushion confetti-shower lily-pad-hop hat-trick leapfrog-bet wrong-pond boing spit-take punchline rubber-chicken jingle-the-bells swamp-fizz bubble-pop",
  "clockwork:sprocket": "spring-loaded-glove overclock blueprint-scribble boom-bottle coin-magnet gizmo-gamble pop-up-umbrella rocket-boots bounce-plate spanner-in-the-works rigged-roulette chain-reaction jackpot-o-matic rocket-fizz sparkplug-shot",
  "clockwork:brassbell": "piston-punch clang polish-the-glasses overtime-tips tip-jar-sweep coin-sorting-routine beverage-rejected reinforced-plating rustproof-lining servo-sidestep does-not-compute calculated-odds insert-coin motor-oil-twist steam-shot",
};
const DRINK_PICS = {
  "base:drink": "house-ale barrel-stout cinder-whiskey well-water warm-milk mystery-jug bubbly-mead barkeeps-special grannys-cordial sour-cider fancy-port lucky-penny-punch the-dare",
  "harbor:drink": "ships-grog bilge-water squid-ink-stout farewell-shanty seafoam-tea",
  "frost:drink": "frostmead glacier-melt yeti-nog avalanche",
  "masquerade:drink": "masked-punch midnight-tea bubbly-fountain mystery-flute",
  "clockwork:drink": "fizzbang-soda steam-cider coolant-cooler unstable-tonic",
};

// VOICES (docs/voices.md): one MP3 per card id in ./voice/, named like the
// pictures (base:gorrum:headbutt -> base-gorrum-headbutt.mp3), spoken by the
// card's patron in their Kokoro voice (voice.js VOICE_PROFILES). Only ids
// listed here are mapped (a test checks every listed file is committed); any
// other card falls back to the browser's speech voice.
const voiceClip = (id) => new URL(`./voice/${id.replace(/:/g, "-")}.mp3`, import.meta.url).href;
export const VOICE_IDS = [];

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
  portraits: Object.fromEntries(CHARACTER_IDS.split(" ").map((id) => [id, pic(id)])),
  cards: picsOf(CARD_PICS),
  drinks: picsOf(DRINK_PICS),
  cardBack: pic("card-back"),
  drinkBack: pic("drink-back"),
  tableBg: pic("table"),
  voices: Object.fromEntries(VOICE_IDS.map((id) => [id, voiceClip(id)])),
  sounds: {
    play: new URL("./sounds/play.mp3", import.meta.url).href,
    react: null, drink: null,
    coins: new URL("./sounds/coins.mp3", import.meta.url).href,
    hit: null, gamble: null, out: null, win: null, tick: null, turn: null, attacked: null,
  },
};

export function paletteFor(theme) {
  return theme === "dark" ? ASSETS.palette.dark : ASSETS.palette.light;
}
