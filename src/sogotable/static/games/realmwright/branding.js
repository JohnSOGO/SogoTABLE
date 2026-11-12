// Realmwright — every user-facing word lives here.
//
// Renaming the game (or the piece, or a feature) is a one-file edit: the UI
// modules read names and phrases ONLY from this file. The opaque game id
// ("realmwright") never changes. If you rename the game, also update `name`
// in manifest.js and games/registry.js (the architecture test pins those two
// equal).
export const GAME_NAME = "Realmwright";
export const GAME_EMOJI = "🏰";

// The little worker piece.
export const PIECE_NAME = "meeple";
export const PIECE_PLURAL = "meeples";
export const FARMER_NAME = "farmer";

// Feature kinds → display names. Unknown kinds (future expansions) fall back
// to the raw kind via featureName().
export const FEATURE_NAMES = {
  city: "city",
  road: "road",
  cloister: "abbey",
  field: "field",
};
export const FEATURE_ICONS = { city: "🏰", road: "🛤️", cloister: "⛪", field: "🌾" };

export function featureName(kind) {
  return FEATURE_NAMES[kind] || String(kind || "feature");
}
export function capitalize(text) {
  const s = String(text || "");
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
export function pieceWord(n) {
  return n === 1 ? PIECE_NAME : PIECE_PLURAL;
}

// Lobby copy.
export const LOBBY = {
  heading: "Realm builders",
  blurb: "Everyone lays a land tile at once each round — no waiting for turns. Join roads, wall in cities, and stand your meeples on what you build. 1+ players; bots fill in.",
  bigDeckHint: "5+ builders? The Big bag gives everyone more tiles.",
  options: {
    farmers: { label: "Farmers", hint: "meeples may lie in fields; fields score 3 per finished city at the end" },
    live_tally: { label: "Live tally", hint: "scoreboard shows what everyone would have if the game ended now" },
    show_spots: { label: "Show valid spots", hint: "glow where your tile fits; off = find the spots yourself" },
    meeples: { label: "Meeples each", hint: "how many little workers every builder gets" },
    small_city: { label: "Small cities", hint: "a finished 2-tile city scores 2 instead of 4" },
    deck: { label: "Tile bag", hint: "Quick ≈ half · Standard 72 · Big ×2 for large tables" },
  },
  deckNames: { quick: "Quick", standard: "Standard", big: "Big" },
  on: "On",
  off: "Off",
};

// Direction words used to tell two same-kind features apart ("road · north").
export const DIRECTIONS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export const CENTER_WORD = "centre";

// Status strip, buttons, table.
export const UI = {
  round: (n) => `Round ${n}`,
  bag: (n) => `${n} in bag`,
  ready: "You're ready — place your tile anywhere.",
  readyPick: "Tap a glowing spot to place your tile.",
  previewing: "Rotate, pick a meeple spot, then Confirm.",
  noFit: "Doesn't fit like that. Tap the tile to rotate, or try another spot.",
  findSpot: "Tap a spot next to the board to try your tile there.",
  sending: "Placing…",
  placed: (waitingNames) => waitingNames.length
    ? `Placed! Waiting for ${listNames(waitingNames)}…`
    : "Placed! Next round is coming up…",
  skipped: "You were skipped this round — you're back next round.",
  noTile: "No tile for you this round — sit back and watch.",
  spectating: "Watching the realm grow.",
  gameOver: "The realm is complete!",
  takenSpot: "Someone just built there — pick another spot.",
  claimedFeature: (kind) => `That ${featureName(kind)} was just claimed — your ${PIECE_NAME} stays home.`,
  redrawn: "Your tile no longer fit anywhere — you drew a new one.",
  noSpots: "No legal spot for this tile right now.",
  rotate: "Rotate",
  confirm: "Confirm",
  noMeeple: () => `No ${PIECE_NAME}`,
  pickSpotFirst: "Tap a glowing spot first",
  pickSpotFree: "Tap a spot next to the board first",
  meeplesLeft: (n) => `${n} left`,
  yourTile: "Your tile",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fit: "Fit",
  colPlayer: "Builder",
  colScore: "Score",
  colLive: "Live",
  colMeeples: "🧍",
  colStatus: "Status",
  statusReady: "Ready",
  statusPlaced: "Placed",
  statusSkipped: "Skipped",
  statusBot: "Bot",
  statusOut: "Sitting out",
  statusThinking: "🤔 thinking…",
  roundBanner: (n) => `Round ${n}`,
  tilesLeft: "Tiles left",
  tilesLeftExact: (n) => `${n} in the bag`,
  tilesLeftApprox: (n) => `${n} in the bag · approximate`,
  close: "Close",
  bagOpen: (n) => `${n} in bag — tap to see which tiles are left`,
  skipVote: (votes, needed) => `⏭ ${votes}/${needed}`,
  skipTitle: (name) => `Vote to skip ${name} this round (everyone who has placed must agree)`,
  results: "Final tally",
  winner: (names) => `${listNames(names)} ${names.length > 1 ? "share the crown" : "wins the realm"}!`,
  total: "Total",
  you: "you",
};

// Ticker phrases built from server events.
export const TICKER = {
  place: (name, meepleKind) => meepleKind
    ? `${name} placed a tile and a ${PIECE_NAME} on a ${featureName(meepleKind)}`
    : `${name} placed a tile`,
  score: (names, kind, points) => `${listNames(names)} closed a ${featureName(kind)} +${points}`,
  scoreNobody: (kind) => `A ${featureName(kind)} was closed`,
  redraw: (name) => `${name}'s tile no longer fit — redrawn`,
  skip: (name) => `${name} was skipped this round`,
  round: (n) => `Round ${n} — new tiles dealt`,
  end: "Game over — final scoring",
};

export function listNames(names) {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  if (list.length === 2) return `${list[0]} & ${list[1]}`;
  if (list.length > 3) return `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
  return `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
}
