// Tradewind Isles — bot decision policy. Pure: reads the game, returns ONE
// action in the same shape a phone sends; rules.js applies it through the
// human validation path ("bots run the human path"). Levels: 1 easy (loose,
// random-ish), 2 normal, 3–4 sharp (better spots, careful trades).
import {
  RESOURCES, TERRAIN_YIELD, PIPS, graphOf, setupHutSpots, setupPathsFor, hutSpots, pathSpots, lodgeSpots,
  hutSpotFree, marksOnHex, portRates,
} from "./board.js";

export const COSTS = Object.freeze({
  path: Object.freeze({ timber: 1, clay: 1 }),
  hut: Object.freeze({ timber: 1, clay: 1, fiber: 1, fruit: 1 }),
  lodge: Object.freeze({ fruit: 2, stone: 3 }),
  discovery: Object.freeze({ fiber: 1, fruit: 1, stone: 1 }),
});

export const handTotal = (hand) => RESOURCES.reduce((n, r) => n + (hand[r] || 0), 0);
export const canPay = (hand, cost) => Object.keys(cost).every((r) => (hand[r] || 0) >= cost[r]);
const missing = (hand, cost) => Object.keys(cost).reduce((n, r) => n + Math.max(0, cost[r] - (hand[r] || 0)), 0);

// Value of a corner: pips of producing neighbours, a nudge for variety and docks.
function vertexValue(game, v, mark) {
  const { vertices, hexById } = graphOf(game.board);
  const vert = vertices[v];
  if (!vert) return 0;
  const owned = new Set();
  if (mark) {
    Object.keys(game.pieces.huts).concat(Object.keys(game.pieces.lodges)).forEach((w) => {
      if ((game.pieces.huts[w] || game.pieces.lodges[w]) !== mark) return;
      vertices[w].hexes.forEach((h) => { const res = TERRAIN_YIELD[hexById[h].terrain]; if (res) owned.add(res); });
    });
  }
  let value = 0;
  const kinds = new Set();
  vert.hexes.forEach((h) => {
    const hex = hexById[h];
    const res = TERRAIN_YIELD[hex.terrain];
    if (!res) return;
    let pips = PIPS[hex.number] || 0;
    if (hex.id === game.monkey) pips *= 0.4;
    value += pips;
    if (!owned.has(res)) value += 1.2;
    kinds.add(res);
  });
  value += kinds.size * 0.6;
  if (vert.port) value += 0.8;
  return value;
}

function pick(list, scoreFn, level, random) {
  if (!list.length) return null;
  if (level <= 1 && random() < 0.35) return list[Math.floor(random() * list.length)];
  let best = null;
  let bestScore = -Infinity;
  list.forEach((item) => {
    const s = scoreFn(item) + (level <= 2 ? random() * 1.5 : random() * 0.2);
    if (s > bestScore) { bestScore = s; best = item; }
  });
  return best;
}

// Best open corner reachable within two edges from vertex v (for path aim).
function reachValue(game, v, mark) {
  const { vertices } = graphOf(game.board);
  let best = 0;
  vertices[v].adj.forEach((w) => {
    if (hutSpotFree(game.board, game.pieces, w)) best = Math.max(best, vertexValue(game, w, mark));
    vertices[w].adj.forEach((u) => {
      if (u !== v && hutSpotFree(game.board, game.pieces, u)) best = Math.max(best, vertexValue(game, u, mark) * 0.8);
    });
  });
  return best;
}

export function chooseSetup(game, mark, random) {
  const level = game.players[mark].level;
  const hut = pick(setupHutSpots(game.board, game.pieces), (v) => vertexValue(game, v, mark), level, random);
  if (!hut) return null;
  const { edges } = graphOf(game.board);
  const path = pick(setupPathsFor(game.board, game.pieces, hut), (e) => {
    const other = edges[e].a === hut ? edges[e].b : edges[e].a;
    return reachValue(game, other, mark);
  }, level, random);
  return { type: "SETUP_PLACE", hut, path };
}

export function chooseDiscard(hand, count) {
  const h = { ...hand };
  const out = {};
  for (let i = 0; i < count; i += 1) {
    const r = RESOURCES.reduce((a, b) => ((h[b] || 0) > (h[a] || 0) ? b : a), RESOURCES[0]);
    if (!h[r]) break;
    h[r] -= 1;
    out[r] = (out[r] || 0) + 1;
  }
  return out;
}

export function renownOf(game, mark, includeHidden) {
  const p = game.players[mark];
  let n = Object.values(game.pieces.huts).filter((m) => m === mark).length
    + 2 * Object.values(game.pieces.lodges).filter((m) => m === mark).length;
  if (game.awards.causeway === mark) n += 2;
  if (game.awards.chief_ranger === mark) n += 2;
  if (includeHidden) n += p.discoveries.filter((d) => d.card === "monument").length;
  return n;
}

function leaderAmong(game, marks) {
  return marks.reduce((best, m) => (best === null || renownOf(game, m, false) > renownOf(game, best, false) ? m : best), null);
}

export function monkeyVictims(game, mover, hexId) {
  const minRenown = game.options.friendly_monkey ? 3 : 0;
  return marksOnHex(game.board, game.pieces, hexId)
    .filter((m) => m !== mover && handTotal(game.players[m].hand) > 0 && renownOf(game, m, false) >= minRenown);
}

export function chooseMonkey(game, mark, random) {
  const level = game.players[mark].level;
  const hexes = game.board.hexes.filter((h) => h.id !== game.monkey);
  const target = pick(hexes, (h) => {
    const marks = marksOnHex(game.board, game.pieces, h.id);
    if (marks.includes(mark)) return -10;
    const pips = PIPS[h.number] || 0;
    return marks.reduce((s, m) => s + pips + renownOf(game, m, false), 0) + (monkeyVictims(game, mark, h.id).length ? 2 : 0);
  }, level, random);
  const victims = monkeyVictims(game, mark, target.id);
  return { hex: target.id, victim: victims.length ? leaderAmong(game, victims) : null };
}

// What the bot is saving for right now.
function goalCost(game, mark) {
  const p = game.players[mark];
  if (p.pieces_left.lodge > 0 && lodgeSpots(game.pieces, mark).length) {
    if (missing(p.hand, COSTS.lodge) <= 2 || p.pieces_left.hut === 0) return COSTS.lodge;
  }
  if (p.pieces_left.hut > 0 && hutSpots(game.board, game.pieces, mark).length) return COSTS.hut;
  if (p.pieces_left.path > 0 && missing(p.hand, COSTS.hut) <= 1 && pathSpots(game.board, game.pieces, mark).length) return COSTS.path;
  if (game.deck.length) return COSTS.discovery;
  return COSTS.path;
}

// One bank trade that moves the bot toward its goal, or null.
function goalTrade(game, mark, goal) {
  const p = game.players[mark];
  const rates = portRates(game.board, game.pieces, mark);
  const need = RESOURCES.find((r) => (goal[r] || 0) > (p.hand[r] || 0) && game.bank[r] > 0);
  if (!need) return null;
  const give = RESOURCES
    .filter((r) => r !== need && (p.hand[r] || 0) - (goal[r] || 0) >= rates[r])
    .sort((a, b) => rates[a] - rates[b] || (p.hand[b] || 0) - (p.hand[a] || 0))[0];
  return give ? { type: "BANK_TRADE", give, get: need } : null;
}

function playableCard(game, mark, card) {
  const p = game.players[mark];
  return p.played_card_round !== game.round && p.discoveries.some((d) => d.card === card && d.bought_round < game.round);
}

// Next build-phase action for a bot, or null when it is finished this round.
export function nextBotAction(game, mark, random, budget) {
  const p = game.players[mark];
  const level = p.level;
  const pieces = game.pieces;
  if (playableCard(game, mark, "ranger") && (marksOnHex(game.board, pieces, game.monkey).includes(mark) || p.played.ranger >= 2)) {
    const m = chooseMonkey(game, mark, random);
    return { type: "PLAY_DISCOVERY", card: "ranger", hex: m.hex, victim: m.victim };
  }
  if (p.free_paths > 0 && p.pieces_left.path > 0) {
    const spots = pathSpots(game.board, pieces, mark);
    if (spots.length) return { type: "BUILD", kind: "path", at: bestPath(game, mark, spots, random) };
  }
  if (canPay(p.hand, COSTS.lodge) && p.pieces_left.lodge > 0) {
    const spots = lodgeSpots(pieces, mark);
    if (spots.length) return { type: "BUILD", kind: "lodge", at: pick(spots, (v) => vertexValue(game, v, null), level, random) };
  }
  const hutOpen = p.pieces_left.hut > 0 ? hutSpots(game.board, pieces, mark) : [];
  if (canPay(p.hand, COSTS.hut) && hutOpen.length) {
    return { type: "BUILD", kind: "hut", at: pick(hutOpen, (v) => vertexValue(game, v, mark), level, random) };
  }
  if (playableCard(game, mark, "trailblaze") && !hutOpen.length && p.pieces_left.path >= 2) return { type: "PLAY_DISCOVERY", card: "trailblaze" };
  if (playableCard(game, mark, "bounty")) {
    const goal = goalCost(game, mark);
    const wants = RESOURCES.filter((r) => game.bank[r] > 0).sort((a, b) => ((goal[b] || 0) - (p.hand[b] || 0)) - ((goal[a] || 0) - (p.hand[a] || 0)));
    if (wants.length) return { type: "PLAY_DISCOVERY", card: "bounty", picks: [wants[0], wants[Math.min(1, wants.length - 1)]] };
  }
  if (playableCard(game, mark, "market") && level >= 2) {
    const opp = game.seat_order.filter((m) => m !== mark);
    const res = RESOURCES.map((r) => [r, opp.reduce((s, m) => s + (game.players[m].hand[r] || 0), 0)]).sort((a, b) => b[1] - a[1])[0];
    if (res && res[1] >= 3) return { type: "PLAY_DISCOVERY", card: "market", resource: res[0] };
  }
  if (!hutOpen.length && p.pieces_left.path > 0 && canPay(p.hand, COSTS.path)) {
    const spots = pathSpots(game.board, pieces, mark);
    if (spots.length) return { type: "BUILD", kind: "path", at: bestPath(game, mark, spots, random) };
  }
  if (game.deck.length && canPay(p.hand, COSTS.discovery) && (level >= 2 || random() < 0.5)
    && !(hutOpen.length && missing(p.hand, COSTS.hut) <= 1)) return { type: "BUY_DISCOVERY" };
  if (budget > 0 && (level >= 2 || random() < 0.6)) {
    const trade = goalTrade(game, mark, goalCost(game, mark));
    if (trade) return trade;
  }
  return null;
}

function bestPath(game, mark, spots, random) {
  const { edges } = graphOf(game.board);
  return pick(spots, (e) => Math.max(reachValue(game, edges[e].a, mark), reachValue(game, edges[e].b, mark)), game.players[mark].level, random);
}

// Would bot `mark` take this offer right now? (Shown to the offerer as a
// "bot will trade" chip; checked again at CONFIRM_TRADE.)
export function botWouldAccept(game, mark, offer, target) {
  const p = game.players[mark];
  if (!p || !p.is_bot || offer.from === mark || (offer.to && offer.to !== mark)) return false;
  if (!canPay(p.hand, offer.want)) return false;
  if (renownOf(game, offer.from, false) >= target - 2) return false; // don't feed a near-winner
  const goal = goalCost(game, mark);
  const gain = RESOURCES.reduce((s, r) => s + Math.min(offer.give[r] || 0, Math.max(0, (goal[r] || 0) - (p.hand[r] || 0))), 0);
  const lose = RESOURCES.reduce((s, r) => s + Math.max(0, (offer.want[r] || 0) - Math.max(0, (p.hand[r] || 0) - (goal[r] || 0))), 0);
  const giveN = RESOURCES.reduce((s, r) => s + (offer.give[r] || 0), 0);
  const wantN = RESOURCES.reduce((s, r) => s + (offer.want[r] || 0), 0);
  if (p.level <= 1) return gain > 0 && giveN >= wantN - 1;
  return gain > 0 && lose === 0 && giveN >= wantN;
}
