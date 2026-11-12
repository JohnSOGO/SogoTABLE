// Hidden Isles — every user-facing word lives here.
//
// Renaming the game, a crew, a tile or a role is a one-file edit: the UI
// modules read names and phrases ONLY from this file. The rules speak only in
// stable ids (team "A"/"B", key "A"/"B"/"neutral"/"trap", role
// "guide"/"guesser") which never change. If you rename the game, also update
// `name` in manifest.js and games/registry.js (the architecture test pins
// those two equal).
export const GAME_NAME = "Hidden Isles";
export const GAME_EMOJI = "🗺️";

// Crews, by rule team id.
export const CREWS = {
  A: { name: "Parrot Crew", short: "Parrots", emoji: "🦜", island: "Parrot island" },
  B: { name: "Dolphin Crew", short: "Dolphins", emoji: "🐬", island: "Dolphin island" },
};

// Chart tiles, by rule key id. Crew keys reuse the crew's island name.
export const TILES = {
  A: { name: CREWS.A.island, emoji: CREWS.A.emoji },
  B: { name: CREWS.B.island, emoji: CREWS.B.emoji },
  neutral: { name: "Sandbar", emoji: "🏝️" },
  trap: { name: "the Kraken", emoji: "🐙" },
};

// Roles, by rule role id.
export const ROLES = {
  guide: { name: "Navigator", emoji: "🧭", blurb: "sees the chart, gives clues" },
  guesser: { name: "Crew", emoji: "🔭", blurb: "taps words" },
};

export const crewName = (team) => (CREWS[team] ? CREWS[team].name : "—");
export const crewEmoji = (team) => (CREWS[team] ? CREWS[team].emoji : "");
export const crewLabel = (team) => `${crewEmoji(team)} ${crewName(team)}`;
export const tileName = (key) => (TILES[key] ? TILES[key].name : "unknown");
export const tileEmoji = (key) => (TILES[key] ? TILES[key].emoji : "");
export const roleName = (role) => (ROLES[role] ? ROLES[role].name : "");
export const otherTeam = (team) => (team === "A" ? "B" : team === "B" ? "A" : null);

export function capitalize(text) {
  const s = String(text || "");
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function listNames(names) {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  if (list.length === 2) return `${list[0]} & ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
}

// Host lobby (before the game starts).
export const LOBBY = {
  heading: "Crew roster",
  blurb: "Two crews race to find their islands on a sea chart of words. Needs 4+ seats — two per crew (a Navigator and at least one shipmate). Bots can fill any seat.",
  options: {
    pack: { label: "Word pack", hint: "Classic · Easy (kid-friendly) · Mixed" },
    clue_ideas: { label: "Clue ideas", hint: "Navigators see suggested clues (a strong help)" },
    team_marks: { label: "Crew pointers", hint: "shipmates see which words each other are eyeing" },
  },
  packNames: { classic: "Classic", easy: "Easy", mixed: "Mixed" },
  on: "On",
  off: "Off",
};

// Setup screen (after Start, before the deal).
export const SETUP = {
  title: "Pick your crews",
  join: (team) => `Join ${CREWS[team].short}`,
  beGuide: `Be ${ROLES.guide.name}`,
  youAreGuide: `You're ${ROLES.guide.name}`,
  shuffle: "Shuffle crews",
  deal: "⛵ Set sail",
  dealing: "Setting sail…",
  empty: "No one yet",
  you: "you",
  bot: "Bot",
  spectator: "You're watching — the crews are picking sides.",
  howTitle: "How to play",
  how: [
    `Each crew has one ${ROLES.guide.emoji} ${ROLES.guide.name} who can see the secret sea chart.`,
    `On your turn the ${ROLES.guide.name} gives ONE word and a number — how many of your islands it points to.`,
    "Shipmates tap words: find your own islands, avoid the other crew's, and sandbars end the turn.",
    `First crew to find all its islands wins — but tap ${TILES.trap.emoji} ${TILES.trap.name} and your crew loses at once!`,
  ],
};

// Play screen.
export const UI = {
  turnOf: (team) => `${crewName(team)}'s turn`,
  islandsLeft: (n) => `${n} left`,
  islandsLeftAria: (team, n) => `${crewName(team)}: ${n} ${n === 1 ? "island" : "islands"} left`,
  youAre: (team, role) => `You: ${crewEmoji(team)} ${roleName(role)}`,
  watching: "You're watching",
  clueSays: (team) => `${crewEmoji(team)} ${ROLES.guide.name} says`,
  unlimited: "∞",
  guessesLeft: (n) => (n === null || n === undefined ? "guess freely" : `${n} ${n === 1 ? "guess" : "guesses"} left`),
  waitingGuide: (team) => `Waiting for the ${crewEmoji(team)} ${ROLES.guide.name}…`,
  botGuideThinking: (team) => `${crewEmoji(team)} ${ROLES.guide.name} (bot) is studying the chart…`,
  yourClueTurn: "Your crew is waiting — give a clue!",
  clueHowTo: "One word + how many of your islands it points to.",
  // action area
  clueLabel: "Your clue (one word)",
  cluePlaceholder: "e.g. OCEAN",
  numberLabel: "How many islands?",
  giveClue: "Give clue",
  giving: "Sending…",
  pickNumber: "Pick a number",
  ideas: "Clue ideas",
  notYourClue: (team) => `Clues unlock on your crew's turn · now: ${crewLabel(team)}`,
  guideWatching: "Your shipmates are guessing — fingers crossed!",
  reveal: "Reveal",
  revealing: "Revealing…",
  endTurn: "End turn",
  tapToPick: "Tap a word to pick it, tap again to reveal.",
  tapAgain: (word) => `Tap ${word} again (or Reveal) to dig there.`,
  needOneGuess: "Make at least one guess before ending the turn.",
  waitClue: "Waiting for your Navigator's clue…",
  otherCrewGuessing: (team) => `${crewLabel(team)} is guessing…`,
  otherCrewClue: (team) => `${crewLabel(team)} is getting a clue…`,
  botsGuessing: (team) => `${crewEmoji(team)} bot shipmates are guessing…`,
  spectating: "Watching the voyage.",
  nudge: "Player away? Let a bot cover",
  nudging: "Calling a bot…",
  // cards
  cardUnrevealed: (word) => `${word}, unrevealed`,
  cardRevealed: (word, key) => `${word}, ${tileName(key)}`,
  cardChart: (word, key) => `${word}, unrevealed, chart says ${tileName(key)}`,
  cardMarked: (names) => `marked by ${listNames(names)}`,
  cardSelected: "selected",
  // log
  logTitle: (n) => `Ship's log · ${n} ${n === 1 ? "clue" : "clues"}`,
  logEmpty: "No clues yet.",
  logNoGuess: "no guesses",
  // flashes
  stale: "The table moved on — refreshing.",
};

// Ticker lines built from server events.
export const TICKER = {
  deal: (team) => `New chart! ${crewLabel(team)} sails first.`,
  clue: (team, word, count) => `${crewEmoji(team)} clue: ${word} · ${count}`,
  reveal: (name, word, key) => `${name} tapped ${word} — ${tileEmoji(key)} ${tileName(key)}!`,
  turn: (team, reason) => {
    const why = { sandbar: "hit a sandbar", rival: "found a rival island", out_of_guesses: "out of guesses", pass: "ended the turn", nudge: "a bot took over" }[reason];
    return why ? `${capitalize(why)} → ${crewLabel(team)}'s turn` : `${crewLabel(team)}'s turn`;
  },
  win: (team, reason) => (reason === "kraken"
    ? `${TILES.trap.emoji} The Kraken woke! ${crewLabel(team)} wins.`
    : `${crewLabel(team)} found every island!`),
};

// Results panel.
export const RESULTS = {
  winner: (team) => `${crewLabel(team)} wins!`,
  voyageOver: "Voyage over",
  reason: (team, reason) => (reason === "kraken"
    ? `The ${crewName(otherTeam(team))} woke ${TILES.trap.name} ${TILES.trap.emoji}`
    : `Found all ${crewEmoji(team)} islands`),
  youWon: "Your crew wins — great sailing!",
  youLost: "So close — next voyage!",
  chart: "The full sea chart",
  unfound: "not found",
};
