// Reefkeepers — every user-facing word lives here.
//
// Renaming the game, a habitat, or the pearls is a one-file edit: the UI
// modules read names and phrases ONLY from this file. The rule ids ("kelp",
// "trench", …) and the opaque game id never change. If you rename the game,
// also update `name` in manifest.js and games/registry.js (the architecture
// test pins those two equal).
export const GAME_NAME = "Reefkeepers";
export const GAME_EMOJI = "🐚";

export const HABITAT_IDS = ["sand", "kelp", "lagoon", "seagrass", "coral", "trench"];
export const HABITAT_NAMES = {
  sand: "Sandbar",
  kelp: "Kelp Forest",
  lagoon: "Lagoon",
  seagrass: "Seagrass Meadow",
  coral: "Coral Garden",
  trench: "Deep Trench",
};
export function habitatName(id) {
  return HABITAT_NAMES[id] || String(id || "habitat");
}

export const HOME_NAME = "Grotto";
export const PEARL = "pearl";
export const PEARLS = "pearls";
export const pearlWord = (n) => (n === 1 ? PEARL : PEARLS);
export const ordinal = (i) => ["1st", "2nd", "3rd"][i] || `${i + 1}th`;

export const LOBBY = {
  heading: "Reefkeepers",
  blurb: "Everyone places a tile and ranks the tiles they want at the same time — no waiting for turns. Grow a reef around your Grotto; each habitat patch scores cells × pearls. 1–8 players; bots fill in.",
  rulesHeading: "Rules",
  helpsHeading: "Optional helps",
  helpsNote: "Helps never change the rules — switch them off for a tougher game.",
  options: {
    size: { label: "Reef size", hint: "Grand reef is 7×7 with twice the rounds" },
    heart_bonus: { label: "Heart of the reef", hint: "+10 if your Grotto sits dead centre of a full-size reef" },
    full_bonus: { label: "Full reef", hint: "+5 if your reef fills its whole square" },
    show_spots: { label: "Show spots", hint: "highlight where your tile fits" },
    live_score: { label: "Live scores", hint: "show everyone's running score during play" },
    hints: { label: "Hints", hint: "suggest a placement and a pick" },
  },
  sizeNames: { 5: "5×5", 7: "7×7 Grand" },
  on: "On",
  off: "Off",
};

export const UI = {
  round: (r, total) => `Round ${r} / ${total}`,
  finalRound: "Final round — place only",
  claimOrder: "Who chooses first",
  draftHeading: "Rank the tiles you want",
  draftHelp: "Tap to rank 1st, 2nd, 3rd · tap again to unrank",
  draftEmpty: "No new tiles — just place your last one.",
  draftFirst: "Round 1: rank the tiles you want — you'll place yours next round.",
  myReef: "Your reef",
  pendingLabel: "Your tile",
  noPending: "No tile to place this round.",
  rotate: "Rotate",
  tapToPlace: "Tap your reef to place it.",
  tapToPlaceFree: "Tap a cell to try the tile there.",
  previewOk: "Looks good. Tap again to turn it.",
  previewBad: "That spot doesn't fit. Try another cell or turn it.",
  cantFit: "This tile can't fit — it will drift away.",
  lockIn: "Lock in",
  locking: "Locking in…",
  lockedIn: "Locked in. Waiting for others",
  needPick: "Rank at least one tile",
  needPlace: "Place your tile",
  skipped: "You were skipped — the autopilot plays this round for you.",
  spectating: "You're watching this game.",
  waitingFor: (names) => (names.length ? `Waiting for ${names.join(", ")}` : "Revealing…"),
  readyHeading: "Table",
  ready: "locked in",
  thinking: "thinking…",
  autopilot: "autopilot",
  botLast: "plays last",
  skipBtn: (name) => `Skip ${name}`,
  skipVotes: (n) => `${n} voted`,
  hintPick: "Suggested",
  hintPlace: "Hint",
  hintLine: "Hint: the dashed outline is a good spot.",
  othersHeading: "Other reefs",
  tapToView: "Tap a reef to look closer",
  close: "Close",
  score: (n) => `${n}`,
  pts: "pts",
  scoreHidden: "—",
  logHeading: "Round log",
  logEmpty: "Nothing yet — lock in to start the tide.",
  discards: (n) => `${n} drifted`,
  tilesLeft: (n) => `${n} tiles left`,
  resultsHeading: "Final reefs",
  winner: (name) => `${name} wins!`,
  tie: "It's a tie!",
  largest: "largest patch",
  heartBonus: "Heart",
  fullBonus: "Full",
  total: "Total",
  you: "you",
  gameOver: "Game over",
};

// Round log lines (from server events).
const list = (names) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
export const LOG = {
  placed: (name, n) => (n ? `${name} placed tile ${n}.` : `${name} placed a tile.`),
  discarded: (name) => `${name}'s tile couldn't fit and drifted away.`,
  picked: (name, n, choice) => `${name} claimed tile ${n || "?"}${choice ? ` (${ordinal(choice - 1)} choice)` : ""}.`,
  bumped: (name, by, n) => `${name}'s picks were taken${by.length ? ` — ${list(by)} chose first` : ""}${n ? `, so they got tile ${n}` : ""}.`,
  skipped: (name) => `${name} was skipped — the autopilot plays this round for them.`,
  round: (r) => `Round ${r} begins.`,
  final: "The tide is out — final scores!",
};
