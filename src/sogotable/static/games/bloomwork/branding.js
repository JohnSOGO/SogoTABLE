// Bloomwork — every user-facing word lives here.
//
// Renaming the game, a flower, or any table word is a one-file edit: the UI
// modules read names and phrases ONLY from this file. Rule ids ("rose",
// "center", "bird", …) never change — saved games key off them. If you rename
// the game, also update `name` in manifest.js and games/registry.js (the
// architecture test pins those two equal).
export const GAME_NAME = "Bloomwork";
export const GAME_EMOJI = "🌷";

// Flower ids (rules) → display words. Colours + pictures live in assets.js / art.js.
export const FLOWERS = {
  rose: { name: "Rose", plural: "Roses" },
  iris: { name: "Iris", plural: "Irises" },
  sun: { name: "Sunflower", plural: "Sunflowers" },
  lilac: { name: "Lilac", plural: "Lilacs" },
  fern: { name: "Fern", plural: "Ferns" },
};
export function flowerWord(id, count = 1) {
  const f = FLOWERS[id];
  if (!f) return String(id || "flower");
  return count === 1 ? f.name : f.plural;
}

// Table words.
export const WORDS = {
  stalls: "Market stalls",
  stall: (i) => `stall ${Number(i) + 1}`,
  square: "the Square",
  Square: "The Square",
  rows: "Planter rows",
  row: (r) => `row ${Number(r) + 1}`,
  bed: "Garden bed",
  compost: "compost heap",
  Compost: "Compost",
  bird: "Early Bird",
  you: "You",
  yourGarden: "Your garden",
  pts: "pts",
};
export function sourceWord(source) {
  return source === "center" ? WORDS.square : WORDS.stall(source);
}
export function rowWord(row) {
  return Number(row) === -1 ? `the ${WORDS.compost}` : WORDS.row(row);
}

// Lobby copy (lobby.js).
export const LOBBY = {
  heading: "Gardeners",
  blurb: "Draft flowers from the market stalls, fill your planter rows and grow a garden bed. Everyone picks at the same time — no waiting for turns. 2–6 gardeners; bots fill empty seats.",
  options: {
    length: { label: "Game length", hint: "Standard ends after someone finishes a bed row · Quick also ends after round 3" },
    helps: { label: "Helps", hint: "light up the rows where your flowers fit and preview the points" },
  },
  lengthNames: { standard: "Standard", quick: "Quick" },
  on: "On",
  off: "Off",
};

// Status line, buttons, labels (render.js / panels.js).
export const UI = {
  round: (n) => `Round ${n}`,
  pickN: (n) => `pick ${Number(n) + 1}`,
  priority: "Priority",
  priorityHint: "Clashes go to whoever is first",
  tapFlower: "Tap a flower in a stall or the Square.",
  selected: (count, id) => `${count} ${flowerWord(id, count)} selected — tap a planter row or the compost heap.`,
  selectedNoHelps: (count, id) => `${count} ${flowerWord(id, count)} selected — tap a planter row or the compost heap.`,
  clear: "Clear",
  sending: "Planting your pick…",
  picked: "Picked!",
  waitingFor: (names) => `Waiting for ${names}…`,
  waitingAll: "Everyone's in — blooming…",
  skippedYou: "You were skipped this round — back next round.",
  spectating: "Watching the garden.",
  reviewTitle: (n) => `Round ${n} in bloom`,
  nextRound: "Next round",
  readyWaiting: (names) => `Ready! Waiting for ${names}…`,
  ready: "Ready",
  thinking: "Picking…",
  done: "Picked",
  bot: "bot",
  skipVote: "Skip",
  skipVoteTitle: (name) => `Vote to skip ${name} for now`,
  bird: "Early Bird — first from the Square takes it, costs a compost slot, leads next round",
  birdShort: "leads",
  lastPick: "Last pick",
  noEvents: "Nothing yet — the market just opened.",
  planted: "planted",
  noPlant: "No row filled",
  compostLoss: (n) => `compost ${n}`,
  scoreLine: (before, after) => `${before} → ${after}`,
  fits: "fits",
  spill: (n) => `${n} to compost`,
  goal: "Finish a full row in your garden bed to end the game.",
  quickGoal: "Quick game: ends after round 3 (or a finished bed row).",
  bagLeft: (n) => `${n} in the bag`,
  emptySquare: "empty",
  yourPick: "your pick",
};

// One line per event (panels.js "Last pick" log + the status ticker).
export const TICKER = {
  take: (who, count, flower, source, row, composted, bird) => {
    const dest = row === -1 ? `the ${WORDS.compost}` : WORDS.row(row);
    let s = `${who} took ${count} ${flowerWord(flower, count)} from ${sourceWord(source)} → ${dest}`;
    if (composted && row !== -1) s += ` (${composted} to compost)`;
    if (bird) s += ` + the ${WORDS.bird}`;
    return s;
  },
  bumped: (by, stall) => `${by} emptied ${WORDS.stall(stall)} first`,
  missed: (who, flower, by) => (by
    ? `${who} missed the ${flowerWord(flower, 2)} — ${by} got there first`
    : `${who} missed the ${flowerWord(flower, 2)} — none left`),
  plant: (who, flower, points) => `${who} planted a ${flowerWord(flower)} (+${points})`,
  compost: (who, points) => `${who} lost ${Math.abs(points)} to the ${WORDS.compost}`,
  bonus: (who, points) => `${who} earned ${points} bonus points`,
  skip: (who) => `${who} was skipped`,
  round: (n, first) => `Round ${n} — ${first} picks first`,
  gameOver: (who) => `${who} wins the garden!`,
};

// Results panel.
export const RESULTS = {
  title: "The garden is finished",
  winner: (name) => `${name} grows the finest garden!`,
  youWin: "You grow the finest garden!",
  tie: (names) => `A shared win: ${names}!`,
  place: (n) => ["1st", "2nd", "3rd"][n - 1] || `${n}th`,
  bonusRows: (n) => `${n} row${n === 1 ? "" : "s"} ×2`,
  bonusCols: (n) => `${n} column${n === 1 ? "" : "s"} ×7`,
  bonusKinds: (n) => `${n} full kind${n === 1 ? "" : "s"} ×10`,
  noBonus: "no bonus",
  points: "points",
  rematch: "Use the room menu to start a rematch.",
};
