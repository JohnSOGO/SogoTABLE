// Roll Through the Ages — server-side bot turn generator.
//
// Bots ROLL REAL DICE and run the same pure turn maths as the human client
// (imported from the client rules module — one source of truth, no duplicated
// tables): roll → hold → tally → upkeep (feeding, famine, drought/invasion/
// revolt, and honest skulls, so a bot CAN pestilence the table) → collect
// goods → spend workers → buy ONE development with this turn's actual coins +
// whole goods stacks → discard to 6. The commit it returns is exactly the
// payload a human client posts.
//
// The difficulty ladder is strategy, not free resources:
//   level 1 — takes the first roll as it lands, short monument lookahead
//   level 2 — one reroll (default)
//   level 3 — full three rolls, chases workers, deep monument lookahead
//   level 4 — as 3, and buys the highest-VP development it can afford
import {
  FACES, MONUMENTS, DEVELOPMENTS, CITY_COSTS, MIN_CITIES, MAX_ROLLS,
  tallyFaces, upkeepPlan, collectGoods, discardExcess,
  goodValue, coinFaceValue, buildCommitPayload,
} from "../../../src/sogotable/static/games/rtta/rules.js";

function botLevel(seat) {
  const lvl = Number(seat && (seat.bot_level !== undefined ? seat.bot_level : seat.level));
  return Number.isInteger(lvl) && lvl >= 1 && lvl <= 4 ? lvl : 2;
}

// Roll `cities` dice with up to `maxRolls` passes. Hold policy: skulls freeze
// (rule); workers, the choice die, and goods always stay (goods compound into
// development money); food stays while the larder is thin and is rerolled once
// sated; coins stay at low levels and are chased away at 3-4 (worker hunt).
function rollDice(cities, maxRolls, foodStored, level, rng) {
  const dice = Array.from({ length: cities }, () => ({ face: null, locked: false }));
  for (let pass = 0; pass < maxRolls; pass++) {
    for (const d of dice) {
      if (d.face && d.locked) continue;
      d.face = FACES[Math.floor(rng() * FACES.length)];
      const f = d.face;
      if (f.skullFace || f.work || f.choice || f.good) d.locked = true;
      else if (f.food) d.locked = foodStored < cities + 3;
      else d.locked = level <= 2;   // coins
    }
  }
  return dice;
}

export function chooseRttaTurn(game, mark, rng = Math.random) {
  const seat = game.players[mark];
  const level = botLevel(seat);
  const owns = new Set(seat.developments || []);
  const cities = seat.cities;

  // --- roll + tally (choice dice feed the cities first, then work) ----------
  const maxRolls = level <= 1 ? 1 : level === 2 ? 2 : MAX_ROLLS;
  const dice = rollDice(cities, maxRolls, seat.food || 0, level, rng);
  const hasGreatWall = (game.monuments["Great Wall"] || []).includes(mark);
  // Leadership (owned at turn start, like a human's): one reroll after the
  // last roll, spent dodging the bot's own disaster — a skull rerolled at
  // exactly 2 skulls (drought, unless Irrigation) or 4 (invasion, unless the
  // Great Wall). 3 skulls stay: pestilence strikes the OPPONENTS. Honest
  // dice — the reroll may land another skull.
  if (owns.has("Leadership")) {
    const skullIdx = dice.map((d, i) => (d.face.skullFace ? i : -1)).filter((i) => i >= 0);
    const dodge = (skullIdx.length === 2 && !owns.has("Irrigation"))
      || (skullIdx.length === 4 && !hasGreatWall);
    if (dodge) dice[skullIdx[0]].face = FACES[Math.floor(rng() * FACES.length)];
  }
  let plannedFood = dice.reduce((a, d) => a + (d.face.food || 0), 0);
  const keys = dice.map((d) => {
    if (!d.face.choice) return { key: d.face.key, choice: null };
    const choice = ((seat.food || 0) + plannedFood < cities) ? "food" : "worker";
    if (choice === "food") plannedFood += 2;
    return { key: "choice", choice };
  });
  const tally = tallyFaces(keys, owns);

  // --- upkeep: feed, famine, self-disasters (same plan the human board runs) --
  const plan = upkeepPlan({
    harvest: tally.food, foodStored: seat.food || 0, diceCount: cities,
    skulls: tally.skull, owns, hasGreatWall,
  });
  let goods = collectGoods(seat.goods || [0, 0, 0, 0, 0], tally.good, owns);
  if (plan.revolt) goods = [0, 0, 0, 0, 0];

  // --- build: cheapest unclaimed in-play monuments, then city boxes ----------
  let workers = tally.work;
  const boxes = { ...(seat.monumentBoxes || {}) };
  const seatCount = (game.seat_order || []).length;
  const targets = MONUMENTS
    .filter((m) => !(m.notAt || []).includes(seatCount))
    .filter((m) => (game.monuments[m.name] || []).length === 0)
    .sort((a, b) => a.w - b.w);
  const reach = level >= 3 ? targets.length : Math.min(2, targets.length);
  for (let i = 0; i < reach && workers > 0; i++) {
    const m = targets[i];
    const put = Math.min(m.w - (boxes[m.name] || 0), workers);
    if (put <= 0) continue;
    boxes[m.name] = (boxes[m.name] || 0) + put;
    workers -= put;
  }
  const cityCosts = CITY_COSTS.slice(MIN_CITIES);
  const cityBoxes = (Array.isArray(seat.cityBoxes) && seat.cityBoxes.length === cityCosts.length)
    ? seat.cityBoxes.slice()
    : cityCosts.map((cost, i) => (i < cities - MIN_CITIES ? cost : 0));
  for (let i = 0; i < cityBoxes.length && workers > 0; i++) {
    const put = Math.min(cityCosts[i] - cityBoxes[i], workers);
    if (put <= 0) continue;
    cityBoxes[i] += put;
    workers -= put;
  }

  // --- buy ONE development with real money: this turn's coins + whole stacks --
  let devBought = null;
  const coins = tally.coin * coinFaceValue(owns);
  const missing = DEVELOPMENTS.filter((d) => !owns.has(d.name));
  const pool = level >= 4
    ? missing.slice().sort((a, b) => b.vp - a.vp)
    : missing.slice().sort((a, b) => a.cost - b.cost);
  const goodsTotal = goods.reduce((sum, q, i) => sum + goodValue(i, q), 0);
  if (pool.length && rng() < 0.25 + 0.15 * level) {
    const pick = pool.find((d) => coins + goodsTotal >= d.cost);
    if (pick) {
      devBought = pick.name;
      let due = pick.cost - coins;   // coins first (they vanish anyway), then stacks — no change
      for (let i = 0; i < goods.length && due > 0; i++) {
        const v = goodValue(i, goods[i]);
        if (v <= 0) continue;
        due -= v;
        goods[i] = 0;
      }
    }
  }

  goods = discardExcess(goods, owns);

  return buildCommitPayload({
    cities, cityBoxes,
    food: plan.foodAfterFeeding,
    goods,
    monumentBoxes: boxes,
    devBought,
    skulls: tally.skull,                            // honest — bots can cause disasters
    pointsLostSelf: plan.famine + plan.disasterPts, // and suffer them
  });
}
