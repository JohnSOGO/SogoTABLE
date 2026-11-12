// Tracklayers — every user-facing word lives here.
//
// Renaming the game, a card colour, or any phrase is a one-file edit: the UI
// modules read names and phrases ONLY from this file. Ids never change (card
// colour ids like "wild", route ids, ticket ids, the opaque game id). If you
// rename the game, also update `name` in manifest.js and games/registry.js
// (the architecture test pins those two equal). City names arrive with the map
// from the server (workers/games/tracklayers/map.js).
export const GAME_NAME = "Tracklayers";
export const GAME_EMOJI = "🚂";

// Card colour id → display name. `wild` is the Lantern card; `gray` routes
// take any one colour.
export const CARD_NAMES = {
  red: "Red", orange: "Orange", yellow: "Yellow", green: "Green",
  blue: "Blue", purple: "Purple", black: "Black", white: "White",
  wild: "Lantern", gray: "Any colour",
};
export const WILD_ICON = "🏮";

export function cardName(color) {
  return CARD_NAMES[color] || String(color || "?");
}

// Lobby copy.
export const LOBBY = {
  heading: "Tracklayers",
  blurb: "Everyone acts at once each round: draw rail cards, claim a route, or take new tickets. Link your secret ticket cities; the longest line earns a bonus. 2–5 seats; bots fill in.",
  trainsLabel: "Trains each",
  trainsHint: "fewer trains = a shorter game",
  trainsNames: { 25: "25 · quick", 35: "35 · standard", 45: "45 · long" },
};

export const UI = {
  round: (n) => `Round ${n}`,
  finalRound: "Final round!",
  finalRoundNext: (n) => `Round ${n} is the final round`,
  deck: (n) => `${n} in deck`,
  tickets: (n) => `${n} tickets left`,
  trains: (n) => `${n} 🚃`,
  priority: "Priority this round",
  // my state line
  sending: "Sending…",
  chooseTickets: "Choose which tickets to keep first.",
  pickAction: "Pick one action: draw 2 cards, claim a route, or take new tickets.",
  lockedIn: (names) => (names.length ? `Locked in — waiting for ${listNames(names)}…` : "Locked in — the round is resolving…"),
  skipped: "You were skipped this round — you're back next round.",
  spectating: "Watching the rails grow.",
  gameOver: "The last train has run!",
  // action area
  drawTitle: "Draw cards",
  drawHint: "Pick 2: face-up cards or the deck. A face-up Lantern counts as both.",
  deckButton: "Deck",
  deckLeft: (n) => `${n} left`,
  draw: (labels) => (labels.length ? `Draw ${labels.join(" + ")}` : "Draw"),
  drawPickMore: "Pick one more card",
  claimTitle: "Claim a route",
  claimHint: "Tap a route on the map.",
  routeName: (a, b) => `${a} – ${b}`,
  routeCost: (len, colorName) => `${len} × ${colorName}`,
  routePoints: (p) => `+${p} pts`,
  payWith: "Pay with",
  pays: (n, colorName, wilds) => (wilds ? `${n} ${colorName} + ${wilds} ${CARD_NAMES.wild}` : `${n} ${colorName}`),
  allWild: (n) => `${n} ${CARD_NAMES.wild}`,
  claim: "Claim",
  claimed: (name) => `Owned by ${name}`,
  twinBlocked: "Its twin is taken — with 3 or fewer seats only one track of a double route may be used.",
  twinMine: "You already own the parallel track.",
  noTrains: (n) => `Needs ${n} trains`,
  cantAfford: "Not enough cards yet.",
  clearRoute: "Clear",
  ticketsTitle: "New tickets",
  ticketsHint: "Draw 3 tickets at the end of the round; keep at least 1.",
  ticketsButton: "Take tickets",
  ticketsEmpty: "No tickets left",
  // ticket picker
  pickerTitle: "Choose your tickets",
  pickerHint: (min) => `Keep at least ${min}. Returned tickets go to the bottom of the pile.`,
  keep: (n) => `Keep ${n}`,
  keepMore: (min) => `Pick at least ${min}`,
  // hand / tickets
  handTitle: "Your cards",
  myTickets: "Your tickets",
  noTickets: "No tickets yet.",
  ticketDone: "done",
  ticketOpen: "not yet",
  ticketMissed: "missed",
  ticketPts: (p) => `${p}`,
  committed: (text) => `Your move: ${text}`,
  commitDraw: (labels) => `draw ${labels.join(" + ")}`,
  commitClaim: (a, b, colorName) => `claim ${a} – ${b} with ${colorName}`,
  commitTickets: "take new tickets",
  // table
  colPlayer: "Player",
  colScore: "Pts",
  colTrains: "🚃",
  colCards: "🂠",
  colTickets: "🎫",
  colStatus: "Status",
  you: "you",
  statusReady: "Ready",
  statusWaiting: "Waiting",
  statusTickets: "Choosing tickets",
  statusSkipped: "Skipped",
  statusBot: "Bot",
  skipVote: (votes, needed) => `⏭ ${votes}/${needed}`,
  skipTitle: (name) => `Vote to skip ${name} this round (everyone who has locked in must agree)`,
  // log
  logTitle: "Last round",
  logEmpty: "Nothing yet — the first round is under way.",
  // helps
  helpsTitle: "Helps",
  helps: {
    path: "Ticket path",
    afford: "Glow routes I can claim",
    progress: "Ticket progress",
  },
  zoomIn: "Zoom map",
  zoomOut: "Fit map",
  // results
  results: "Final tally",
  winner: (names) => `${listNames(names)} ${names.length > 1 ? "share the line" : "wins"}!`,
  resRoutes: "Routes",
  resTickets: "Tickets",
  resLongest: "Longest",
  resTotal: "Total",
  resTicketsDone: (done, failed) => `${done} ✓ · ${failed} ✗`,
  longestBonus: (n) => `+${n} longest line`,
  ticketHit: "✓",
  ticketMiss: "✗",
};

export function listNames(names) {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  if (list.length === 2) return `${list[0]} & ${list[1]}`;
  if (list.length > 3) return `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
  return `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
}

// Event kind → small icon for the round log (text comes from the server, with
// seat marks swapped for player names on the client).
export const EVENT_ICONS = {
  draw: "🂠", fallback: "🂠", claim: "🛤️", conflict: "⚔️", tickets: "🎫", keep: "🎫",
  final_round: "🔔", end: "🏁", score: "🧮", winner: "🏆", skip: "⏭", start: "🚂", round: "🔄",
  market_reset: "♻️", reshuffle: "♻️",
};
