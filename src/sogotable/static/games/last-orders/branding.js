// Last Orders — every user-facing word lives here.
//
// Renaming the game, a stat, a phase or a button is a one-file edit: the UI
// modules (render, panels, hand, lobby, describe) read words ONLY from this
// file and from content.js (names/flavor of patrons, cards, drinks, events).
// The opaque game id never changes. If you rename the game, also update
// `name` in manifest.js and games/registry.js (the architecture test pins
// those two equal).
export const GAME_NAME = "Last Orders";
export const GAME_EMOJI = "🍻";

// The three numbers every patron has (rules ids grit / buzz / gold).
export const STATS = {
  grit: { name: "Grit", icon: "❤️", hint: "how much punishment you can take" },
  buzz: { name: "Buzz", icon: "🍺", hint: "how drunk you are — out when it reaches your Grit" },
  gold: { name: "Coins", one: "Coin", icon: "🪙", hint: "your purse — out when it hits 0" },
};
export const coinWord = (n) => (Math.abs(Number(n)) === 1 ? STATS.gold.one : STATS.gold.name);
export const cardWord = (n) => (Math.abs(Number(n)) === 1 ? "card" : "cards");
export const drinkWord = (n) => (Math.abs(Number(n)) === 1 ? "drink" : "drinks");

export const PHASES = {
  discard: "Discard & draw",
  action: "Action",
  order: "Order a round",
  drink: "Drink",
  done: "Last sip",
  pick: "Pick a patron",
};

export const KINDS = {
  action: "Action",
  reaction: "Reaction",
  gamble: "Gamble",
  spike: "Spike",
  drink: "Drink",
  event: "Event",
};

export const OUT_REASONS = {
  passed_out: "passed out",
  knocked_out: "knocked out",
  broke: "broke",
};
export const OUT_ICONS = { passed_out: "😵", knocked_out: "💫", broke: "🪙" };
export const outText = (why) => OUT_REASONS[why] || "out";

export const BARKEEP = "the barkeep";

// Words describe.js stitches into rules text.
export const RULES_WORDS = {
  you: "you",
  rival: "a rival",
  thatRival: "that rival",
  everyRival: "every rival",
  everyone: "everyone",
  drinker: "the drinker",
  free: "Free — doesn't use your action.",
  unstoppable: "Can't be canceled.",
  chaser: "Chaser — drink another one straight after.",
  house: "On the house — everyone still in drinks it.",
  unrefusable: "Can't be refused or canceled.",
  answerAny: "Answer any card or drink.",
  answers: { action: "an action", drink: "a drink", gamble: "a gamble play", reaction: "a reaction" },
  aimedAtYou: " aimed at you",
  thisRound: "this round",
};

// Main game screen copy.
export const UI = {
  pickTitle: "Pick your patron",
  pickHint: "Everyone picks at once. Each patron brings their own deck.",
  pickTaken: (name) => `Taken by ${name}`,
  pickYours: "Your patron",
  pickWaiting: "Still choosing",
  pickDone: "Chosen",
  pickSending: "Pulling up a stool…",
  pickedWait: "Locked in — waiting for the others to choose.",
  deckSize: (n) => `${n}-card deck`,
  you: "You",
  yourTurn: "Your turn",
  turnOf: (name) => `${name}'s turn`,
  round: (n) => `Round ${n}`,
  closing: (n) => `Closing time +${n}`,
  closingHint: "Every drink gives extra Buzz now.",
  spectating: "Watching from the bar.",
  youAreOut: (why) => `You're ${why} — enjoy the show.`,
  sending: "Sending…",
  movedOn: "The table moved on — have another look.",
  // phase prompts (mine)
  discardPrompt: (max) => `Tap up to ${max} ${cardWord(max)} to throw away, then draw back up.`,
  discardBtn: (n) => (n ? `Discard ${n} & draw` : "Keep all & draw"),
  actionPrompt: "Play one action card — or move on.",
  actionPromptMore: (n) => `You may play ${n} more ${n === 1 ? "action" : "actions"}.`,
  actionPick: "Tap a card to play it, or drag it onto a rival.",
  endAction: "Done with actions",
  playOn: (name) => `Tap who gets ${name}:`,
  orderPrompt: "Buy a rival a drink. To spike it, tap a spike card first (or drag the spike onto them).",
  orderPick: "Tap who's drinking:",
  spikeNone: "No spike",
  spikeWith: (name) => `Spiked with ${name}`,
  drinkPrompt: "Bottoms up…",
  // windows
  reactPrompt: "Anyone can answer! Tap a card to play it, or pass.",
  reactMine: "Your card is on top — the others may answer.",
  reactNothing: "You've nothing that answers this.",
  passBtn: "Pass",
  passed: "Passed — waiting for the table.",
  autoPassed: "Auto-passed (nothing to answer with).",
  gamblePrompt: (leader, pot) => `Gamble! ${leader} leads a pot of ${pot}. Tap a gamble card to take the lead, or pass.`,
  gambleLeading: (pot) => `You lead a pot of ${pot}. Hold on…`,
  potLabel: "Pot",
  leads: (name) => `${name} leads`,
  closesIn: "closes in",
  waitingOn: (names) => `Waiting on ${names.join(", ")}`,
  otherTurn: (name, phase) => `${name} — ${phase}`,
  // stack + bar
  barTop: "The bar top",
  quiet: "All quiet at the bar.",
  lastDrink: "Last drink",
  boughtBy: (name) => `from ${name}`,
  barkeepPour: "poured by the barkeep",
  drankBy: (name) => `${name} drank`,
  refused: "refused!",
  eventNow: "Tonight",
  canceled: "canceled",
  softened: (n) => `−${n} softened`,
  arrow: "→",
  spiked: "spiked",
  // seats
  handCount: (n) => `${n} in hand`,
  lineCount: (n) => `${n} ${drinkWord(n)} waiting`,
  bot: "bot",
  auto: "auto",
  // skip
  skipBtn: "Skip (auto-play)",
  skipVotes: (have, need) => `${have}/${need} votes`,
  skipHint: (name) => `${name} seems stuck?`,
  // results
  resultsTitle: "Closing time!",
  winner: "Last one standing",
  place: (n) => ["", "1st", "2nd", "3rd"][n] || `${n}th`,
  // settings
  settings: "Settings",
  tipsLabel: "Card tips",
  tipsHint: "show rules text under each card",
  primerLabel: "Rules primer",
  primerHint: "how-to-play notes at the top",
  autoPassLabel: "Auto-pass",
  autoPassHint: "pass for me when I hold nothing that answers",
  calloutsLabel: "Play callouts",
  calloutsHint: "show who just played what, with their portrait",
  voiceLabel: "Voices",
  voiceHint: "each patron says the card they play (follows the sound button)",
  on: "On",
  off: "Off",
  close: "Close",
  tapToExpand: "tap for details",
  emptyHand: "No cards in hand.",
  yourHand: "Your hand",
  playable: "playable",
};

export const PRIMER = {
  title: "How to play",
  lines: [
    "Everyone has Grit ❤️, Buzz 🍺 and Coins 🪙. You're out if your Buzz reaches your Grit (passed out), your Grit hits 0 (knocked out) or your Coins run out (broke). Last patron standing wins.",
    "Your turn: 1) discard up to 3 and draw back up, 2) play one action card, 3) buy a rival a drink (it goes face-down on their line — you may spike it), 4) drink the top drink of your own line.",
    "Every card or drink opens a short reaction window. Anyone may answer with a reaction card; the newest card resolves first, so a cancel can itself be canceled.",
    "Gambles: everyone antes into the pot and the starter leads. Play a gamble card to take the lead — whoever leads when the window closes wins the pot.",
  ],
};

// Event log ticker lines. Names arrive already resolved (player name, card name).
// The play callout banner (callout.js): "<who> plays <card> on <target>".
export const CALLOUT = {
  plays: "plays",
  answers: "answers with",
  drinks: "raises",
  on: "on",
  you: "you",
};

export const TICKER = {
  turn: (who) => `${who}'s turn.`,
  round: (n, esc) => (esc ? `Round ${n} — closing time +${esc}!` : `Round ${n}.`),
  pick: (who, patron) => `${who} is ${patron}.`,
  discard: (who, n) => (n ? `${who} swapped ${n} ${cardWord(n)}.` : `${who} kept their hand.`),
  play: (who, card, target) => (target ? `${who} plays ${card} on ${target}.` : `${who} plays ${card}.`),
  drinkUp: (who, drink) => `${who} raises ${drink}…`,
  react: (who, card) => `${who} answers with ${card}!`,
  negated: (card) => `${card} is canceled!`,
  redirect: (card, to) => `${card} now goes to ${to}.`,
  grit: (who, n) => (n < 0 ? `${who} takes ${-n} damage.` : `${who} recovers ${n} Grit.`),
  buzz: (who, n) => (n > 0 ? `${who} +${n} Buzz.` : `${who} sobers up ${-n}.`),
  gold: (who, n) => (n > 0 ? `${who} +${n} ${coinWord(n)}.` : `${who} −${-n} ${coinWord(n)}.`),
  draw: (who, n) => `${who} draws ${n} ${cardWord(n)}.`,
  order: (by, who, spiked) => `${by} buys ${who} a drink${spiked ? " (spiked!)" : ""}.`,
  drink: (who, drink, house) => (house ? `${drink} — on the house for everyone!` : `${who} drinks ${drink}.`),
  gambleStart: (who, pot) => `${who} starts a gamble — pot ${pot}.`,
  gambleLead: (who, pot) => `${who} takes the lead — pot ${pot}.`,
  gambleWin: (who, pot) => `${who} wins the pot of ${pot}!`,
  out: (who, why) => `${who} is ${why}!`,
  eventFlip: (name) => `Tonight: ${name}.`,
  win: (who) => `${who} is the last one standing!`,
  skip: (who) => `${who} is on auto-pilot.`,
};

// Lobby copy.
export const LOBBY = {
  heading: "Patrons",
  blurb: "An original tavern brawl: pick a patron, brawl, buy rivals drinks, gamble, and answer tricks in quick reaction windows. Last one standing wins. 2–8 players; bots fill in.",
  packsTitle: "Expansion packs",
  options: {
    react_seconds: { label: "Reaction window", hint: "seconds everyone gets to answer a card" },
    closing_time: { label: "Closing time", hint: "from round 8, every drink hits harder — keeps games short" },
    random_characters: { label: "Random patrons", hint: "deal patrons out instead of picking" },
    show_playable: { label: "Show playable cards", hint: "glow on cards you can play right now" },
  },
  seconds: (n) => `${n}s`,
  on: "On",
  off: "Off",
};
