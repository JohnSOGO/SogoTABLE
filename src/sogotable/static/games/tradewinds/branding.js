// Tradewind Isles — every user-facing word lives here.
//
// Renaming the game, a resource, a terrain or a card is a one-file edit: the
// UI modules read names, emoji and phrases ONLY from this file. Rule ids
// ("timber", "grove", "ranger", "path"…) never change. If you rename the game,
// also update `name` in manifest.js and games/registry.js (the architecture
// test pins those two equal).
export const GAME_NAME = "Tradewind Isles";
export const GAME_EMOJI = "🏝️";

export const RESOURCES = {
  timber: { name: "Timber", emoji: "🪵" },
  clay: { name: "Clay", emoji: "🧱" },
  fiber: { name: "Fiber", emoji: "🧶" },
  fruit: { name: "Fruit", emoji: "🥭" },
  stone: { name: "Stone", emoji: "🪨" },
};
export const RESOURCE_ORDER = ["timber", "clay", "fiber", "fruit", "stone"];

export const TERRAIN = {
  grove: { name: "Palm Grove", emoji: "🌴" },
  clay: { name: "Clay Cliffs", emoji: "🧱" },
  meadow: { name: "Sisal Meadow", emoji: "🌾" },
  orchard: { name: "Mango Orchard", emoji: "🥭" },
  quarry: { name: "Basalt Quarry", emoji: "🪨" },
  volcano: { name: "Volcano", emoji: "🌋" },
};

export const PIECES = {
  path: { name: "Boardwalk", emoji: "🪜", plural: "boardwalks" },
  hut: { name: "Hut", emoji: "🛖", plural: "huts" },
  lodge: { name: "Lodge", emoji: "🏘️", plural: "lodges" },
  discovery: { name: "Discovery", emoji: "🎴", plural: "discoveries" },
};

export const CARDS = {
  ranger: { name: "Ranger", emoji: "🧭", text: "Move the monkey and steal one card." },
  monument: { name: "Monument", emoji: "🗿", text: "+1 renown. Stays secret until the end." },
  trailblaze: { name: "Trailblaze", emoji: "🪓", text: "Build 2 boardwalks for free." },
  bounty: { name: "Bountiful Tide", emoji: "🌊", text: "Take any 2 resources from the bank." },
  market: { name: "Market Day", emoji: "🛶", text: "Name a resource: every opponent hands you all of theirs." },
};

export const AWARDS = {
  causeway: { name: "Grand Causeway", emoji: "🛤️", text: "Longest boardwalk (5+): +2 renown" },
  chief_ranger: { name: "Chief Ranger", emoji: "🎖️", text: "Most rangers played (3+): +2 renown" },
};

export const MONKEY = { name: "Mischief Monkey", emoji: "🐒" };
export const RENOWN = { name: "Renown", emoji: "⭐" };
export const DOCK = { name: "Dock", emoji: "⚓" };
export const CAPTAIN = { name: "Captain", emoji: "🧢" };

export const resName = (r) => (RESOURCES[r] ? RESOURCES[r].name : String(r || ""));
export const resEmoji = (r) => (RESOURCES[r] ? RESOURCES[r].emoji : "•");
export const cardName = (c) => (CARDS[c] ? CARDS[c].name : String(c || ""));
export const cardEmoji = (c) => (CARDS[c] ? CARDS[c].emoji : "🎴");

// Lobby copy.
export const LOBBY = {
  heading: "Islanders",
  blurb: "One roll feeds the whole table, then everyone builds and trades at once — no waiting for turns. 2–6 players; bots fill in.",
  options: {
    target: { label: "Renown to win", hint: "first to reach it wins on the spot" },
    hand_limit: { label: "Hand limit", hint: "on a 7, anyone holding more discards half" },
    board: { label: "Island size", hint: "Auto picks Large for 5+ players" },
    quick_setup: { label: "Quick setup", hint: "auto-place everyone's first huts and boardwalks" },
    friendly_monkey: { label: "Friendly monkey", hint: "the monkey can't rob anyone with 2 renown or less" },
    show_spots: { label: "Show valid spots", hint: "glow where you can build; off = find them yourself" },
    show_pips: { label: "Show odds dots", hint: "dots under each number: more dots, rolled more often" },
    show_afford: { label: "Affordability hints", hint: "highlight what you can build and how to trade for it" },
  },
  boardNames: { auto: "Auto", small: "Small", large: "Large" },
  on: "On",
  off: "Off",
};

export const HELP = [
  "Each round the table rolls once. Every hex with that number pays its neighbours: 1 card per hut, 2 per lodge. The Mischief Monkey's hex pays nothing.",
  "Then everyone builds, trades and plays cards at the same time. Tap Done when you're finished; when every player is done the bots build and the next round rolls.",
  "If two players reach for the same spot, the first build the table receives wins; the other keeps their cards.",
  "A 7 pays nobody: anyone over the hand limit discards half, then the round's captain moves the monkey and steals a card.",
  "Discovery cards can't be played the round you buy them, and you may play one per round. Monuments count by themselves.",
];

export const UI = {
  round: (n) => `Round ${n}`,
  setupRound: "Setup",
  you: "you",
  bot: "bot",
  sending: "Sending…",
  waitingFor: (names) => (names.length ? `Waiting for ${listNames(names)}…` : "Next round is rolling…"),
  // phase prompts
  promptSetupMine: "Your turn: place a hut + boardwalk",
  promptSetupPickPath: "Now tap a boardwalk next to your hut",
  promptSetupReady: "Tap Place to confirm",
  promptSetupOther: (name) => `${name} is placing a hut + boardwalk…`,
  promptDiscard: (n) => `Discard ${n} card${n === 1 ? "" : "s"}`,
  promptDiscardWait: (names) => `Waiting for ${listNames(names)} to discard…`,
  promptMonkeyMine: "Move the monkey: tap a hex",
  promptMonkeyVictim: "Pick who to rob, then Confirm",
  promptMonkeyOther: (name) => `${name} is moving the monkey…`,
  promptBuild: "Build, trade, then tap Done",
  promptBuildDone: (names) => `Done. ${names.length ? `Waiting for ${listNames(names)}…` : "Next round is rolling…"}`,
  promptFreePaths: (n) => `Trailblaze: build ${n} free boardwalk${n === 1 ? "" : "s"}`,
  promptPickTarget: (kind) => `Tap a spot for your ${kind}`,
  promptSkipped: "You were skipped this round — back next round.",
  promptSpectate: "Watching the islands.",
  promptOver: "The islands have a winner!",
  // controls
  doneIdle: "I'm done",
  doneOn: "Done ✓ · undo",
  confirm: "Confirm",
  place: "Place",
  build: "Build",
  cancel: "Cancel",
  buy: "Buy",
  play: "Play",
  buildHere: (piece) => `Build ${piece}`,
  noVictim: "Rob nobody",
  pickVictim: "Rob whom?",
  hand: "Your hand",
  handEmpty: "No cards yet",
  cards: "Your discoveries",
  noCards: "No discoveries",
  cardNew: "new — next round",
  cardUsed: "one per round",
  cardHidden: "counts at the end",
  piecesLeft: (n) => `${n} left`,
  free: "free",
  discardTitle: (n) => `Discard ${n}`,
  discardPicked: (k, n) => `${k} / ${n} chosen`,
  discardSend: "Discard",
  pickTwo: "Pick 2 resources",
  pickOne: "Name a resource",
  rangerHint: "Tap a hex to send the monkey",
  // trade
  trade: "Trade",
  tradeClose: "Close trade",
  bankTrade: "Bank",
  give: "Give",
  get: "Get",
  rate: (n) => `${n}:1`,
  bankEmpty: "bank empty",
  bankDo: (n, g, r) => `Trade ${n} ${g} → 1 ${r}`,
  bankPick: "Pick what to give and what to get",
  offers: "Player offers",
  offerCompose: "New offer",
  offerWant: "Want",
  offerTo: "To",
  offerAnyone: "Anyone",
  offerPost: "Post offer",
  offerNone: "No open offers",
  offerYours: "Your offer",
  offerFrom: (name) => `${name} offers`,
  offerFor: "for",
  offerToYou: "to you",
  offerToName: (name) => `to ${name}`,
  offerAccepts: "Accepts:",
  offerNobody: "Nobody yet",
  tradeWith: (name) => `Trade with ${name}`,
  accept: "Accept",
  unaccept: "Withdraw",
  accepted: "You accepted",
  cancelOffer: "Cancel",
  // scoreboard
  colPlayer: "Islander",
  renownShort: "⭐",
  cardsShort: "🃏",
  discShort: "🎴",
  rangersShort: "🧭",
  pathShort: "🛤️",
  statusDone: "Done",
  statusBuilding: "Building",
  statusSkipped: "Skipped",
  statusBot: "Bot",
  statusPlacing: "Placing",
  statusDiscard: "Discarding",
  statusMonkey: "Monkey",
  skipVote: (votes, needed) => `⏭ ${votes}/${needed}`,
  skipTitle: (name) => `Vote to skip ${name} this round (everyone already done must agree)`,
  captainTitle: "Captain this round — moves the monkey on a 7",
  // log + results
  log: "Island log",
  logEmpty: "Nothing yet.",
  help: "How to play",
  bank: "Bank",
  deck: (n) => `🎴 ${n}`,
  results: "Final renown",
  winner: (names) => `${listNames(names)} ${names.length > 1 ? "share the islands" : "rules the islands"}!`,
  rank: "#",
  total: "Renown",
  dice: (a, b) => `Rolled ${a + b}`,
  noRoll: "No roll yet",
  rolledSeven: "7 — the monkey stirs!",
  zoom: "Zoom the board",
  pickSpotFirst: "Tap a spot on the board first",
  takenSpot: "Someone just built there — pick another spot.",
};

// Island log: icons per event type; the actor's name comes from the roster.
export const LOG = {
  icons: { roll: "🎲", seven: "🎲", setup: "🛖", discard: "🗑️", monkey: "🐒", steal: "🫳", build: "🔨", upgrade: "🏘️", buy: "🎴", play: "✨", bank_trade: "🏦", trade: "🤝", offer: "📣", award: "🏅", win: "🏆", skip: "⏭" },
  table: (type) => (type === "setup" ? "" : "The table"),
  with: "with",
};

export function listNames(names) {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  if (list.length === 2) return `${list[0]} & ${list[1]}`;
  if (list.length > 3) return `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
  return `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
}
