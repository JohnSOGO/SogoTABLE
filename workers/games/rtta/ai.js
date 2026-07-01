// Roll Through the Ages — server-side bot turn generator.
//
// Produces one COMMIT_TURN payload per round, the same shape a human client
// POSTs. The strategy is deliberately light (a family-game opponent, not an
// optimiser): accumulate a rough worker yield, push the cheapest monument no one
// has claimed yet (completing it when it is reached), otherwise grow a city, and
// buy the cheapest development it still lacks now and then. It never keeps
// skulls, so bots never trigger disasters. Small cost tables are duplicated here
// on purpose so this module does not import rules.js (no import cycle).
const MONUMENT_COST = {
  "Step Pyramid": 3, "Stone Circle": 5, "Temple": 7, "Obelisk": 9,
  "Hanging Gardens": 11, "Great Wall": 13, "Great Pyramid": 15,
};
const DEV_COST = {
  Leadership: 10, Irrigation: 10, Agriculture: 15, Quarrying: 15, Medicine: 15,
  Coinage: 20, Caravans: 20, Religion: 20, Granaries: 30, Masonry: 30,
  Engineering: 40, Architecture: 50, Empire: 60,
};

function botLevel(seat) {
  const lvl = Number(seat && (seat.bot_level !== undefined ? seat.bot_level : seat.level));
  return Number.isInteger(lvl) && lvl >= 1 && lvl <= 4 ? lvl : 2;
}

export function chooseRttaTurn(game, mark, rng = Math.random) {
  const seat = game.players[mark];
  const level = botLevel(seat);
  const boxes = { ...(seat.monumentBoxes || {}) };
  let cities = seat.cities;
  let workers = cities * 2 + 1; // rough worker yield for the round
  const completed = [];

  // Cheapest monument no one has claimed and we have not finished — pour workers
  // in, complete when the cost is reached. Higher levels look a touch further.
  const targets = Object.keys(MONUMENT_COST)
    .filter((n) => (game.monuments[n] || []).length === 0)
    .sort((a, b) => MONUMENT_COST[a] - MONUMENT_COST[b]);
  const reach = level >= 3 ? targets.length : Math.min(2, targets.length);
  for (let i = 0; i < reach && workers > 0; i += 1) {
    const name = targets[i];
    const cost = MONUMENT_COST[name];
    const have = boxes[name] || 0;
    const need = cost - have;
    if (need <= 0) continue;
    const put = Math.min(need, workers);
    boxes[name] = have + put;
    workers -= put;
    if (boxes[name] >= cost) completed.push(name);
  }

  // Leftover workers grow a city (city N costs N workers; capped at 7).
  if (cities < 7 && workers >= cities) { workers -= cities; cities += 1; }

  // Buy the cheapest development we still lack, now and then (more eagerly at
  // higher levels). Buying developments is also how a bot drives the game to end.
  let devBought = null;
  const owned = new Set(seat.developments || []);
  const affordable = Object.keys(DEV_COST)
    .filter((d) => !owned.has(d))
    .sort((a, b) => DEV_COST[a] - DEV_COST[b]);
  const buyChance = 0.25 + 0.15 * level;
  if (affordable.length && rng() < buyChance) devBought = affordable[0];

  return {
    type: "COMMIT_TURN",
    cities,
    food: cities, // fed itself; never in famine
    goods: (seat.goods || [0, 0, 0, 0, 0]).slice(),
    monumentBoxes: boxes,
    monumentsCompleted: completed,
    devBought,
    skulls: 0,
    pointsLostSelf: 0,
  };
}
