// Tradewind Isles — server-authoritative rules for an ORIGINAL island trading
// game (resource hexes, dice production, boardwalks/huts/lodges, trading, a
// blocking monkey, discovery cards). Pure logic: no DOM, no timers, no storage.
// The Worker calls setTradewindsOptions at /api/room/start, then
// initTradewindsSeats. Bots act through the SAME validated action path a phone
// uses, with the decision policy in ./ai.js. Wire contract + design:
// src/sogotable/static/games/tradewinds/PLAN.md.
//
// PARALLEL ROUNDS: one server roll per round for the whole table, then every
// seat builds and trades at once. Builds resolve IMMEDIATELY in server order:
// if two seats reach for one corner, the later build is rejected with a reason
// and keeps its cards. When every human has tapped Done (or been skipped) the
// bots build, then the next round rolls. A 7 opens a discard step and the
// round's captain moves the monkey before building starts.
//
// Secrets: the discovery deck order (stripped for everyone), hands and
// discovery cards (masked per viewer until the game ends).
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { cleanGameId } from "../../game-catalog.js";
import { castSkipVote, normalizeSkipVotes, pruneSkipVotes } from "../skip-vote.js";
import {
  RESOURCES, TERRAIN_YIELD, graphOf, generateBoard, layoutFor, setupHutSpots, setupPathsFor, hutSpots, pathSpots,
  lodgeSpots, hutSpotFree, productionClaims, portRates, longestPath, boardToDict,
} from "./board.js";
import {
  COSTS, canPay, handTotal, renownOf, monkeyVictims, chooseSetup, chooseDiscard, chooseMonkey, nextBotAction, botWouldAccept,
} from "./ai.js";

export const TRADEWINDS_GAME_ID = GAME_IDS.tradewinds;
const EVENT_CAP = 60;
const ROUND_CAP = 400; // an all-bot table can never spin forever
const CARDS = ["ranger", "monument", "trailblaze", "bounty", "market"];
const PLAYABLE = ["ranger", "trailblaze", "bounty", "market"];
const PIECES = { path: 15, hut: 5, lodge: 4 };
export const TRADEWINDS_DEFAULT_OPTIONS = Object.freeze({
  target: 10, hand_limit: 7, board: "auto", quick_setup: false, friendly_monkey: false,
  show_spots: true, show_pips: true, show_afford: true,
});

let twRandom = Math.random;
export function setTradewindsRandom(fn) {
  twRandom = typeof fn === "function" ? fn : Math.random;
}

export function isTradewindsGame(game) {
  if (!game || !game.game_id) return false;
  try { return cleanGameId(game.game_id) === TRADEWINDS_GAME_ID; } catch { return String(game.game_id).trim() === TRADEWINDS_GAME_ID; }
}

const clampInt = (v, lo, hi, d) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);

export function normalizeTradewindsOptions(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const d = TRADEWINDS_DEFAULT_OPTIONS;
  return {
    target: oneOf(Number(o.target), [8, 10, 12, 14], d.target),
    hand_limit: oneOf(Number(o.hand_limit), [7, 9, 11], d.hand_limit),
    board: oneOf(o.board, ["auto", "small", "large"], d.board),
    quick_setup: bool(o.quick_setup, d.quick_setup),
    friendly_monkey: bool(o.friendly_monkey, d.friendly_monkey),
    show_spots: bool(o.show_spots, d.show_spots),
    show_pips: bool(o.show_pips, d.show_pips),
    show_afford: bool(o.show_afford, d.show_afford),
  };
}

export function setTradewindsOptions(game, payload) {
  const raw = payload && (payload.ti_options || payload.options || payload);
  game.options = normalizeTradewindsOptions(raw);
}

export function newTradewindsGame() {
  return {
    game_id: TRADEWINDS_GAME_ID, status: "playing", phase: "setup", round: 0, seat_order: [], players: {},
    options: { ...TRADEWINDS_DEFAULT_OPTIONS }, board: null, monkey: null, dice: null,
    pieces: { huts: {}, lodges: {}, paths: {} }, setup: null, bank: {}, deck: [],
    awards: { causeway: null, chief_ranger: null }, offers: [], next_offer: 1,
    skip_votes: {}, events: [], event_seq: 0, winner: null, results: null, move_count: 0,
  };
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(twRandom() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const emptyHand = () => Object.fromEntries(RESOURCES.map((r) => [r, 0]));

export function initTradewindsSeats(game, seats) {
  game.options = normalizeTradewindsOptions(game.options);
  game.seat_order = [];
  game.players = {};
  (Array.isArray(seats) ? seats : []).forEach((seat) => {
    const mark = String(seat && seat.mark || "").trim();
    if (!mark || game.players[mark] || game.seat_order.length >= 6) return;
    game.seat_order.push(mark);
    const isBot = Boolean(seat && seat.kind === "bot");
    game.players[mark] = {
      is_bot: isBot, level: isBot ? clampInt(seat.bot_level ?? seat.level, 1, 4, 2) : 0,
      hand: emptyHand(), discoveries: [], played: { ranger: 0, trailblaze: 0, bounty: 0, market: 0 },
      pieces_left: { ...PIECES }, done: false, skipped: false, must_discard: 0, free_paths: 0, played_card_round: 0, longest: 0,
    };
  });
  if (game.seat_order.length < 2) throw new Error("Tradewind Isles needs at least 2 players — invite players or bots to fill the table.");
  const size = layoutFor(game.options.board, game.seat_order.length);
  game.game_id = TRADEWINDS_GAME_ID;
  game.status = "playing";
  game.board = generateBoard(size, twRandom);
  game.monkey = (game.board.hexes.find((h) => h.terrain === "volcano") || game.board.hexes[0]).id;
  game.pieces = { huts: {}, lodges: {}, paths: {} };
  game.bank = Object.fromEntries(RESOURCES.map((r) => [r, size === "large" ? 24 : 19]));
  const counts = size === "large" ? { ranger: 20, monument: 5, trailblaze: 3, bounty: 3, market: 3 } : { ranger: 14, monument: 5, trailblaze: 2, bounty: 2, market: 2 };
  game.deck = shuffle(CARDS.flatMap((c) => Array(counts[c]).fill(c)));
  game.awards = { causeway: null, chief_ranger: null };
  game.offers = [];
  game.next_offer = 1;
  game.events = [];
  game.event_seq = 0;
  game.skip_votes = {};
  game.winner = null;
  game.results = null;
  game.move_count = 0;
  game.round = 0;
  game.dice = null;
  game.phase = "setup";
  game.setup = { order: [...game.seat_order, ...[...game.seat_order].reverse()], index: 0 };
  pushEvent(game, { type: "setup", text: "The island rises from the sea. Place your first huts." });
  if (game.options.quick_setup) {
    while (game.setup) {
      const mark = game.setup.order[game.setup.index];
      const choice = chooseSetup(game, mark, twRandom);
      placeSetup(game, mark, choice.hut, choice.path);
    }
  }
  advance(game);
}

// ---------- events ----------

function pushEvent(game, event) {
  game.event_seq += 1;
  game.events.push({ seq: game.event_seq, round: game.round, ...event });
  if (game.events.length > EVENT_CAP) game.events = game.events.slice(-EVENT_CAP);
}

const fmt = (bundle) => RESOURCES.filter((r) => bundle[r]).map((r) => `${bundle[r]} ${r}`).join(", ") || "nothing";

// ---------- setup ----------

function placeSetup(game, mark, hut, path) {
  if (!game.setup || game.phase !== "setup") throw new Error("Setup is over.");
  const current = game.setup.order[game.setup.index];
  if (current !== mark) throw new Error("It isn't your turn to place yet — the highlighted player is choosing.");
  if (!hutSpotFree(game.board, game.pieces, hut)) throw new Error("That corner is taken or too close to another hut.");
  if (!setupPathsFor(game.board, game.pieces, hut).includes(path)) throw new Error("Your boardwalk must touch the hut you just placed.");
  const p = game.players[mark];
  game.pieces.huts[hut] = mark;
  game.pieces.paths[path] = mark;
  p.pieces_left.hut -= 1;
  p.pieces_left.path -= 1;
  const second = game.setup.index >= game.seat_order.length;
  const gains = emptyHand();
  if (second) {
    const { vertices, hexById } = graphOf(game.board);
    vertices[hut].hexes.forEach((h) => {
      const res = TERRAIN_YIELD[hexById[h].terrain];
      if (res && game.bank[res] > 0) { game.bank[res] -= 1; p.hand[res] += 1; gains[res] += 1; }
    });
  }
  pushEvent(game, { type: "setup", mark, at: hut, path, gains, text: second ? `placed a second hut and gathered ${fmt(gains)}` : "placed a first hut" });
  game.setup.index += 1;
  if (game.setup.index >= game.setup.order.length) game.setup = null;
}

// ---------- rounds ----------

const humans = (game) => game.seat_order.filter((m) => !game.players[m].is_bot);
const captainOf = (game) => game.seat_order[(Math.max(1, game.round) - 1) % game.seat_order.length];

function startRound(game) {
  game.round += 1;
  game.offers = [];
  game.skip_votes = {};
  game.seat_order.forEach((m) => {
    const p = game.players[m];
    p.done = false;
    p.skipped = false;
    p.must_discard = 0;
    p.free_paths = 0;
  });
  const dice = [1 + Math.floor(twRandom() * 6), 1 + Math.floor(twRandom() * 6)];
  game.dice = dice;
  const total = dice[0] + dice[1];
  if (total === 7) {
    pushEvent(game, { type: "seven", dice, text: "rolled a 7 — the Mischief Monkey wakes up!" });
    game.seat_order.forEach((m) => {
      const p = game.players[m];
      const n = handTotal(p.hand);
      if (n > game.options.hand_limit) p.must_discard = Math.floor(n / 2);
      if (p.is_bot && p.must_discard) discard(game, m, chooseDiscard(p.hand, p.must_discard));
    });
    game.phase = "discard";
    return;
  }
  produce(game, total, dice);
  game.phase = "build";
}

function produce(game, total, dice) {
  const claims = productionClaims(game.board, game.pieces, total, game.monkey);
  const gains = {};
  RESOURCES.forEach((r) => {
    const claimants = Object.keys(claims).filter((m) => claims[m][r]);
    const want = claimants.reduce((s, m) => s + claims[m][r], 0);
    if (!want) return;
    if (want > game.bank[r] && claimants.length > 1) return; // shortage: nobody gets it
    claimants.forEach((m) => {
      const n = Math.min(claims[m][r], game.bank[r]);
      game.bank[r] -= n;
      game.players[m].hand[r] += n;
      gains[m] = gains[m] || {};
      gains[m][r] = (gains[m][r] || 0) + n;
    });
  });
  pushEvent(game, { type: "roll", dice, gains, text: `rolled ${total}` });
}

function discard(game, mark, cards) {
  const p = game.players[mark];
  const bundle = cleanBundle(cards);
  const n = RESOURCES.reduce((s, r) => s + bundle[r], 0);
  if (n !== p.must_discard) throw new Error(`Choose exactly ${p.must_discard} card${p.must_discard === 1 ? "" : "s"} to discard.`);
  if (!canPay(p.hand, bundle)) throw new Error("You don't hold those cards.");
  pay(game, p, bundle);
  p.must_discard = 0;
  pushEvent(game, { type: "discard", mark, count: n, text: `discarded ${n} card${n === 1 ? "" : "s"}` });
}

function randomDiscard(game, mark) {
  const p = game.players[mark];
  const bundle = emptyHand();
  for (let i = 0; i < p.must_discard; i += 1) {
    const pool = RESOURCES.flatMap((r) => Array(p.hand[r] - bundle[r]).fill(r));
    bundle[pool[Math.floor(twRandom() * pool.length)]] += 1;
  }
  discard(game, mark, bundle);
}

function cleanBundle(raw) {
  const out = emptyHand();
  if (raw && typeof raw === "object") RESOURCES.forEach((r) => { out[r] = clampInt(raw[r], 0, 99, 0); });
  return out;
}

function pay(game, p, cost) {
  RESOURCES.forEach((r) => {
    const n = cost[r] || 0;
    p.hand[r] -= n;
    game.bank[r] += n;
  });
}

function moveMonkey(game, mark, hex, victim) {
  const { hexById } = graphOf(game.board);
  if (!hexById[hex]) throw new Error("Pick a hex on the island.");
  if (hex === game.monkey) throw new Error("The monkey has to move to a different hex.");
  const victims = monkeyVictims(game, mark, hex);
  if (victims.length && !victims.includes(victim)) throw new Error("Choose who the monkey steals from.");
  if (!victims.length && victim) throw new Error("Nobody there can be robbed.");
  game.monkey = hex;
  let stole = null;
  if (victim) {
    const v = game.players[victim];
    const pool = RESOURCES.flatMap((r) => Array(v.hand[r]).fill(r));
    stole = pool[Math.floor(twRandom() * pool.length)];
    v.hand[stole] -= 1;
    game.players[mark].hand[stole] += 1;
  }
  pushEvent(game, { type: "monkey", mark, hex, victim: victim || null, text: victim ? "sent the monkey on a raid" : "moved the monkey" });
}

// Drive the table forward until a human must act (or the game ends).
function advance(game) {
  for (let guard = 0; guard < ROUND_CAP * 4 && game.status === "playing"; guard += 1) {
    if (game.phase === "setup") {
      if (!game.setup) { startRound(game); continue; }
      const mark = game.setup.order[game.setup.index];
      if (!game.players[mark].is_bot) return;
      const choice = chooseSetup(game, mark, twRandom);
      placeSetup(game, mark, choice.hut, choice.path);
      continue;
    }
    if (game.phase === "discard") {
      if (game.seat_order.some((m) => game.players[m].must_discard > 0)) return;
      const captain = captainOf(game);
      const cp = game.players[captain];
      if (cp.is_bot) {
        const m = chooseMonkey(game, captain, twRandom);
        moveMonkey(game, captain, m.hex, m.victim);
        game.phase = "build";
      } else game.phase = "monkey";
      continue;
    }
    if (game.phase === "monkey") return;
    if (game.phase === "build") {
      if (!humans(game).every((m) => game.players[m].done || game.players[m].skipped)) return;
      runBots(game);
      if (game.status !== "playing") return;
      if (game.round >= ROUND_CAP) { completeGame(game, null); return; }
      startRound(game);
    }
  }
}

function runBots(game) {
  game.seat_order.filter((m) => game.players[m].is_bot).forEach((mark) => {
    let budget = 4;
    for (let step = 0; step < 30 && game.status === "playing"; step += 1) {
      const action = nextBotAction(game, mark, twRandom, budget);
      if (!action) break;
      if (action.type === "BANK_TRADE") budget -= 1;
      try { applyBuildAction(game, mark, action); } catch { break; }
    }
  });
}

// ---------- build-phase actions (humans and bots) ----------

function applyBuildAction(game, mark, action) {
  const p = game.players[mark];
  switch (action.type) {
    case "BUILD": return build(game, mark, String(action.kind || ""), String(action.at || ""));
    case "BUY_DISCOVERY": {
      if (!game.deck.length) throw new Error("The discovery deck is empty.");
      if (!canPay(p.hand, COSTS.discovery)) throw new Error("You can't afford a discovery card.");
      pay(game, p, COSTS.discovery);
      const card = game.deck.pop();
      p.discoveries.push({ card, bought_round: game.round });
      pushEvent(game, { type: "buy", mark, text: "bought a discovery card" });
      return checkWin(game, mark);
    }
    case "PLAY_DISCOVERY": return playCard(game, mark, action);
    case "BANK_TRADE": {
      const give = String(action.give);
      const get = String(action.get);
      if (!RESOURCES.includes(give) || !RESOURCES.includes(get) || give === get) throw new Error("Pick two different resources.");
      const rate = portRates(game.board, game.pieces, mark)[give];
      if (p.hand[give] < rate) throw new Error(`You need ${rate} ${give} for that trade.`);
      if (game.bank[get] < 1) throw new Error(`The bank is out of ${get}.`);
      p.hand[give] -= rate;
      game.bank[give] += rate;
      p.hand[get] += 1;
      game.bank[get] -= 1;
      pushEvent(game, { type: "bank_trade", mark, give, get, rate, text: `traded ${rate} ${give} to the bank for 1 ${get}` });
      return undefined;
    }
    default: throw new Error(`Unknown action "${action.type}".`);
  }
}

function build(game, mark, kind, at) {
  const p = game.players[mark];
  if (!["path", "hut", "lodge"].includes(kind)) throw new Error("Build a boardwalk, hut or lodge.");
  if (p.pieces_left[kind] <= 0) throw new Error(`You have no ${kind === "path" ? "boardwalks" : `${kind}s`} left.`);
  const free = kind === "path" && p.free_paths > 0;
  if (!free && !canPay(p.hand, COSTS[kind])) throw new Error(`You can't afford a ${kind === "path" ? "boardwalk" : kind}.`);
  if (kind === "path" && !pathSpots(game.board, game.pieces, mark).includes(at)) {
    throw new Error(game.pieces.paths[at] ? "Someone just built a boardwalk there — pick another edge." : "A boardwalk must connect to your own boardwalks or buildings.");
  }
  if (kind === "hut" && !hutSpots(game.board, game.pieces, mark).includes(at)) {
    throw new Error(game.pieces.huts[at] || game.pieces.lodges[at] ? "Someone just built there first — you keep your cards." : "A hut needs your boardwalk and no building on any neighbouring corner.");
  }
  if (kind === "lodge" && game.pieces.huts[at] !== mark) throw new Error("A lodge upgrades one of your own huts.");
  if (free) p.free_paths -= 1;
  else pay(game, p, COSTS[kind]);
  p.pieces_left[kind] -= 1;
  if (kind === "path") game.pieces.paths[at] = mark;
  if (kind === "hut") game.pieces.huts[at] = mark;
  if (kind === "lodge") {
    delete game.pieces.huts[at];
    game.pieces.lodges[at] = mark;
    p.pieces_left.hut += 1;
  }
  const label = { path: "a boardwalk", hut: "a hut", lodge: "a lodge" }[kind];
  pushEvent(game, { type: kind === "lodge" ? "upgrade" : "build", mark, kind, at, text: `built ${label}` });
  if (kind !== "lodge") updateCauseway(game);
  checkWin(game, mark);
}

function playCard(game, mark, action) {
  const p = game.players[mark];
  const card = String(action.card || "");
  if (!PLAYABLE.includes(card)) throw new Error("That card can't be played.");
  if (p.played_card_round === game.round) throw new Error("You've already played a discovery card this round.");
  const idx = p.discoveries.findIndex((d) => d.card === card && d.bought_round < game.round);
  if (idx < 0) throw new Error(p.discoveries.some((d) => d.card === card) ? "Cards bought this round can be played from next round." : "You don't hold that card.");
  if (card === "ranger") moveMonkey(game, mark, String(action.hex || ""), action.victim ? String(action.victim) : null);
  if (card === "trailblaze") {
    if (p.pieces_left.path <= 0 || !pathSpots(game.board, game.pieces, mark).length) throw new Error("You have nowhere to build a boardwalk.");
    p.free_paths = Math.min(2, p.pieces_left.path);
  }
  if (card === "bounty") {
    const picks = Array.isArray(action.picks) ? action.picks.slice(0, 2).map(String) : [];
    if (picks.length !== 2 || !picks.every((r) => RESOURCES.includes(r))) throw new Error("Pick two resources.");
    const need = cleanBundle({});
    picks.forEach((r) => { need[r] += 1; });
    if (!RESOURCES.every((r) => game.bank[r] >= need[r])) throw new Error("The bank doesn't have those.");
    RESOURCES.forEach((r) => { game.bank[r] -= need[r]; p.hand[r] += need[r]; });
  }
  let took = 0;
  if (card === "market") {
    const res = String(action.resource || "");
    if (!RESOURCES.includes(res)) throw new Error("Name a resource.");
    game.seat_order.forEach((m) => {
      if (m === mark) return;
      took += game.players[m].hand[res];
      game.players[mark].hand[res] += game.players[m].hand[res];
      game.players[m].hand[res] = 0;
    });
  }
  p.discoveries.splice(idx, 1);
  p.played[card] += 1;
  p.played_card_round = game.round;
  const text = { ranger: "played a Ranger", trailblaze: "played Trailblaze", bounty: "played Bountiful Tide", market: `played Market Day and collected ${took} ${action.resource}` }[card];
  pushEvent(game, { type: "play", mark, card, text });
  if (card === "ranger") updateChiefRanger(game);
  checkWin(game, mark);
}

// ---------- awards + winning ----------

function updateCauseway(game) {
  const lengths = {};
  game.seat_order.forEach((m) => {
    lengths[m] = longestPath(game.board, game.pieces, m);
    game.players[m].longest = lengths[m];
  });
  const max = Math.max(...Object.values(lengths));
  const holder = game.awards.causeway;
  let next = holder;
  if (max < 5) next = null;
  else if (!holder || lengths[holder] < max) {
    const top = game.seat_order.filter((m) => lengths[m] === max);
    next = top.length === 1 ? top[0] : (top.includes(holder) ? holder : null);
  }
  if (next !== holder) {
    game.awards.causeway = next;
    if (next) pushEvent(game, { type: "award", award: "causeway", mark: next, text: `claimed the Grand Causeway (${max})` });
  }
}

function updateChiefRanger(game) {
  const holder = game.awards.chief_ranger;
  const best = holder ? game.players[holder].played.ranger : 2;
  const top = game.seat_order.find((m) => game.players[m].played.ranger > best);
  if (top && top !== holder) {
    game.awards.chief_ranger = top;
    pushEvent(game, { type: "award", award: "chief_ranger", mark: top, text: "became Chief Ranger" });
  }
}

function checkWin(game, actor) {
  if (game.status !== "playing") return;
  const order = [actor, ...game.seat_order.filter((m) => m !== actor)];
  const winner = order.find((m) => renownOf(game, m, true) >= game.options.target);
  if (winner) completeGame(game, winner);
}

function completeGame(game, winner) {
  const ranked = [...game.seat_order].sort((a, b) => renownOf(game, b, true) - renownOf(game, a, true));
  game.status = "complete";
  game.winner = winner || ranked[0] || null;
  game.offers = [];
  game.results = ranked.map((mark, i) => ({ mark, renown: renownOf(game, mark, true), rank: i + 1 }));
  pushEvent(game, { type: "win", mark: game.winner, text: `wins with ${renownOf(game, game.winner, true)} renown!` });
}

// ---------- trading between players ----------

function offerFor(game, id) {
  const offer = game.offers.find((o) => o.id === Number(id));
  if (!offer) throw new Error("That offer is gone — it was taken or cancelled.");
  return offer;
}

function makeOffer(game, mark, action) {
  const give = cleanBundle(action.give);
  const want = cleanBundle(action.want);
  if (!RESOURCES.some((r) => give[r]) || !RESOURCES.some((r) => want[r])) throw new Error("An offer needs something to give and something to get.");
  if (RESOURCES.some((r) => give[r] && want[r])) throw new Error("Don't offer and ask for the same resource.");
  if (!canPay(game.players[mark].hand, give)) throw new Error("You don't hold what you're offering.");
  const to = action.to && game.players[action.to] && action.to !== mark ? String(action.to) : null;
  if (game.offers.filter((o) => o.from === mark).length >= 3) throw new Error("You can have at most 3 open offers.");
  game.offers.push({ id: game.next_offer, from: mark, to, give, want, acceptors: [] });
  game.next_offer += 1;
  pushEvent(game, { type: "offer", mark, text: `offered ${fmt(give)} for ${fmt(want)}` });
}

function confirmTrade(game, mark, action) {
  const offer = offerFor(game, action.offer_id);
  if (offer.from !== mark) throw new Error("Only the player who made the offer can close it.");
  const partner = String(action.partner || "");
  const pp = game.players[partner];
  if (!pp) throw new Error("Pick who to trade with.");
  const ok = pp.is_bot ? botWouldAccept(game, partner, offer, game.options.target) : offer.acceptors.includes(partner);
  if (!ok) throw new Error("That player hasn't accepted this offer.");
  const me = game.players[mark];
  if (!canPay(me.hand, offer.give)) throw new Error("You no longer hold what you offered.");
  if (!canPay(pp.hand, offer.want)) throw new Error("They no longer hold what you asked for.");
  RESOURCES.forEach((r) => {
    me.hand[r] += offer.want[r] - offer.give[r];
    pp.hand[r] += offer.give[r] - offer.want[r];
  });
  game.offers = game.offers.filter((o) => o.id !== offer.id);
  pushEvent(game, { type: "trade", mark, partner, give: offer.give, want: offer.want, text: `traded ${fmt(offer.give)} for ${fmt(offer.want)}` });
}

// ---------- skip vote ----------

function skippable(game, target) {
  const p = game.players[target];
  if (!p || p.is_bot || p.skipped || game.status !== "playing") return false;
  if (game.phase === "setup") return Boolean(game.setup) && game.setup.order[game.setup.index] === target;
  if (game.phase === "discard") return p.must_discard > 0;
  if (game.phase === "monkey") return captainOf(game) === target;
  return !p.done;
}

function skipVoters(game, target) {
  return humans(game).filter((m) => m !== target && !skippable(game, m));
}

function skipSeat(game, mark) {
  const p = game.players[mark];
  pushEvent(game, { type: "skip", mark, text: "was skipped by the table" });
  if (game.phase === "setup") {
    const choice = chooseSetup(game, mark, twRandom);
    placeSetup(game, mark, choice.hut, choice.path);
  } else if (game.phase === "discard") randomDiscard(game, mark);
  else if (game.phase === "monkey") game.phase = "build";
  else p.skipped = true;
}

function applySkip(game, mark, target) {
  if (target === mark) throw new Error("You can't vote to skip yourself.");
  if (!skippable(game, target)) throw new Error("That player can't be skipped right now.");
  const eligible = skipVoters(game, target);
  if (!eligible.includes(mark)) throw new Error("Only players who aren't holding up the table can vote to skip.");
  const result = castSkipVote(game.skip_votes, mark, target, eligible);
  game.skip_votes = result.votes;
  if (result.unanimous) {
    const next = { ...game.skip_votes };
    delete next[target];
    game.skip_votes = next;
    skipSeat(game, target);
  }
}

// ---------- the one move entry point ----------

export function makeTradewindsMove(game, mark, action) {
  normalizeTradewindsGame(game);
  if (game.status === "complete") throw new Error("The game is over.");
  const p = game.players[mark];
  if (!p) throw new Error("You are not seated in this game.");
  if (p.is_bot) throw new Error("Bot seats play automatically.");
  const a = action && typeof action === "object" ? action : {};
  const stamped = a.round == null ? NaN : Math.trunc(Number(a.round));
  if (Number.isFinite(stamped) && stamped !== game.round) {
    throw new Error(`That move was for round ${stamped} — the table is on round ${game.round}. Refresh to catch up.`);
  }
  const type = String(a.type || "");
  const inBuild = () => {
    if (game.phase !== "build") throw new Error(game.phase === "setup" ? "Finish placing starting huts first." : "Wait for the 7 to be settled (discards and the monkey) first.");
    if (p.skipped) throw new Error("You were skipped this round — you're back in next round.");
  };
  switch (type) {
    case "SETUP_PLACE": placeSetup(game, mark, String(a.hut || ""), String(a.path || "")); break;
    case "DISCARD":
      if (game.phase !== "discard" || !p.must_discard) throw new Error("You don't need to discard.");
      discard(game, mark, a.cards);
      break;
    case "MOVE_MONKEY":
      if (game.phase !== "monkey") throw new Error("The monkey isn't waiting to move.");
      if (captainOf(game) !== mark) throw new Error("This round's captain moves the monkey.");
      moveMonkey(game, mark, String(a.hex || ""), a.victim ? String(a.victim) : null);
      game.phase = "build";
      break;
    case "BUILD": case "BUY_DISCOVERY": case "PLAY_DISCOVERY": case "BANK_TRADE":
      inBuild();
      applyBuildAction(game, mark, { ...a, type });
      break;
    case "OFFER": inBuild(); makeOffer(game, mark, a); break;
    case "CANCEL_OFFER": {
      const offer = offerFor(game, a.offer_id);
      if (offer.from !== mark) throw new Error("That isn't your offer.");
      game.offers = game.offers.filter((o) => o !== offer);
      break;
    }
    case "ACCEPT_OFFER": {
      inBuild();
      const offer = offerFor(game, a.offer_id);
      if (offer.from === mark) throw new Error("You can't accept your own offer.");
      if (offer.to && offer.to !== mark) throw new Error("That offer was made to someone else.");
      const accept = a.accept !== false;
      if (accept && !canPay(p.hand, offer.want)) throw new Error("You don't hold what they're asking for.");
      offer.acceptors = offer.acceptors.filter((m) => m !== mark);
      if (accept) offer.acceptors.push(mark);
      break;
    }
    case "CONFIRM_TRADE": inBuild(); confirmTrade(game, mark, a); break;
    case "DONE":
      if (game.phase !== "build") throw new Error("Nothing to finish yet.");
      p.done = a.done !== false;
      break;
    case "SKIP_PLAYER": applySkip(game, mark, String(a.target || "")); break;
    default: throw new Error(`Unknown action "${type}".`);
  }
  game.move_count += 1;
  advance(game);
  game.skip_votes = pruneSkipVotes(game.skip_votes, (t) => (skippable(game, t) ? skipVoters(game, t) : null));
}

// ---------- projection ----------

function legalFor(game, mark) {
  const p = game.players[mark];
  const legal = { setup_huts: [], setup_paths: {}, huts: [], lodges: [], paths: [], monkey_hexes: [], monkey_victims: {} };
  if (game.status !== "playing") return legal;
  if (game.phase === "setup" && game.setup && game.setup.order[game.setup.index] === mark) {
    legal.setup_huts = setupHutSpots(game.board, game.pieces);
    legal.setup_huts.forEach((v) => { legal.setup_paths[v] = setupPathsFor(game.board, game.pieces, v); });
  }
  if (game.phase === "build" || game.phase === "monkey") {
    if (game.phase === "build") {
      if (p.pieces_left.hut > 0) legal.huts = hutSpots(game.board, game.pieces, mark);
      if (p.pieces_left.lodge > 0) legal.lodges = lodgeSpots(game.pieces, mark);
      if (p.pieces_left.path > 0) legal.paths = pathSpots(game.board, game.pieces, mark);
    }
    legal.monkey_hexes = game.board.hexes.filter((h) => h.id !== game.monkey).map((h) => h.id);
    legal.monkey_hexes.forEach((h) => { legal.monkey_victims[h] = monkeyVictims(game, mark, h); });
  }
  return legal;
}

export function tradewindsGameToDict(game) {
  normalizeTradewindsGame(game);
  const done = game.status === "complete";
  const players = {};
  const legal = {};
  game.seat_order.forEach((mark) => {
    const p = game.players[mark];
    players[mark] = {
      is_bot: p.is_bot, level: p.level,
      hand_count: handTotal(p.hand), hand: { ...p.hand },
      discovery_count: p.discoveries.length, discoveries: p.discoveries.map((d) => ({ ...d })),
      played: { ...p.played },
      renown: renownOf(game, mark, false), renown_total: renownOf(game, mark, true),
      pieces_left: { ...p.pieces_left }, longest_path: p.longest,
      rates: game.board ? portRates(game.board, game.pieces, mark) : {},
      done: p.done, has_committed: p.done, skipped: p.skipped, must_discard: p.must_discard,
      free_paths: p.free_paths, played_card_round: p.played_card_round,
    };
    if (!done && game.board) legal[mark] = legalFor(game, mark);
  });
  return {
    game_id: TRADEWINDS_GAME_ID, status: game.status, phase: game.phase, round: game.round,
    captain: game.round ? captainOf(game) : null,
    seat_order: [...game.seat_order], options: { ...game.options },
    costs: JSON.parse(JSON.stringify(COSTS)), resources: [...RESOURCES],
    board: game.board ? boardToDict(game.board) : null,
    monkey: game.monkey, dice: game.dice ? [...game.dice] : null,
    pieces: { huts: { ...game.pieces.huts }, lodges: { ...game.pieces.lodges }, paths: { ...game.pieces.paths } },
    setup: game.setup ? { order: [...game.setup.order], index: game.setup.index, current: game.setup.order[game.setup.index] } : null,
    bank: { ...game.bank }, discovery_left: game.deck.length, // the deck ORDER never leaves the Worker
    awards: { ...game.awards },
    players,
    offers: game.offers.map((o) => ({
      ...o, give: { ...o.give }, want: { ...o.want }, acceptors: [...o.acceptors],
      bot_acceptors: game.status === "playing" ? game.seat_order.filter((m) => botWouldAccept(game, m, o, game.options.target)) : [],
    })),
    legal,
    skip_votes: normalizeSkipVotes(game.skip_votes),
    events: game.events.map((e) => ({ ...e })),
    winner: game.winner, results: game.results ? game.results.map((r) => ({ ...r })) : null,
    move_count: game.move_count,
  };
}

// Mask other seats' hands, discovery cards and hidden monuments until the end.
export function tradewindsGameToDictForViewer(dict, viewerMark /* , roomStatus */) {
  const projected = structuredClone(dict);
  const reveal = projected.status === "complete";
  Object.keys(projected.players || {}).forEach((mark) => {
    if (reveal || mark === viewerMark) return;
    const p = projected.players[mark];
    p.hand = null;
    p.discoveries = null;
    p.renown_total = null;
  });
  const legal = projected.legal || {};
  projected.legal = viewerMark && legal[viewerMark] ? legal[viewerMark] : {
    setup_huts: [], setup_paths: {}, huts: [], lodges: [], paths: [], monkey_hexes: [], monkey_victims: {},
  };
  return projected;
}

export function tradewindsScoreByMark(game) {
  normalizeTradewindsGame(game);
  const scores = {};
  game.seat_order.forEach((mark) => { scores[mark] = game.board ? renownOf(game, mark, true) : 0; });
  return scores;
}

// Tolerate garbage in stored state: clamp every field to something sane.
function normalizeTradewindsGame(game) {
  game.game_id = TRADEWINDS_GAME_ID;
  game.status = game.status === "complete" ? "complete" : "playing";
  game.phase = oneOf(game.phase, ["setup", "discard", "monkey", "build"], "setup");
  game.round = clampInt(game.round, 0, 99999, 0);
  game.move_count = clampInt(game.move_count, 0, 9999999, 0);
  game.options = normalizeTradewindsOptions(game.options);
  game.seat_order = Array.isArray(game.seat_order) ? [...new Set(game.seat_order.map(String))] : [];
  if (!game.players || typeof game.players !== "object") game.players = {};
  game.seat_order.forEach((mark) => {
    const p = game.players[mark] || {};
    p.is_bot = Boolean(p.is_bot);
    p.level = clampInt(p.level, 0, 4, p.is_bot ? 2 : 0);
    p.hand = cleanBundle(p.hand);
    p.discoveries = Array.isArray(p.discoveries) ? p.discoveries.filter((d) => d && CARDS.includes(d.card)).map((d) => ({ card: d.card, bought_round: clampInt(d.bought_round, 0, 99999, 0) })) : [];
    const played = p.played && typeof p.played === "object" ? p.played : {};
    p.played = Object.fromEntries(PLAYABLE.map((c) => [c, clampInt(played[c], 0, 99, 0)]));
    const left = p.pieces_left && typeof p.pieces_left === "object" ? p.pieces_left : {};
    p.pieces_left = Object.fromEntries(Object.keys(PIECES).map((k) => [k, clampInt(left[k], 0, PIECES[k], PIECES[k])]));
    p.done = Boolean(p.done);
    p.skipped = Boolean(p.skipped);
    p.must_discard = clampInt(p.must_discard, 0, 99, 0);
    p.free_paths = clampInt(p.free_paths, 0, 2, 0);
    p.played_card_round = clampInt(p.played_card_round, 0, 99999, 0);
    p.longest = clampInt(p.longest, 0, 99, 0);
    game.players[mark] = p;
  });
  const pieces = game.pieces && typeof game.pieces === "object" ? game.pieces : {};
  game.pieces = { huts: { ...(pieces.huts || {}) }, lodges: { ...(pieces.lodges || {}) }, paths: { ...(pieces.paths || {}) } };
  game.bank = cleanBundle(game.bank);
  game.deck = Array.isArray(game.deck) ? game.deck.filter((c) => CARDS.includes(c)) : [];
  const awards = game.awards || {};
  game.awards = {
    causeway: game.seat_order.includes(awards.causeway) ? awards.causeway : null,
    chief_ranger: game.seat_order.includes(awards.chief_ranger) ? awards.chief_ranger : null,
  };
  game.offers = Array.isArray(game.offers) ? game.offers.filter((o) => o && game.players[o.from]).map((o) => ({
    id: clampInt(o.id, 1, 9999999, 1), from: o.from, to: game.players[o.to] ? o.to : null,
    give: cleanBundle(o.give), want: cleanBundle(o.want),
    acceptors: Array.isArray(o.acceptors) ? o.acceptors.filter((m) => game.players[m]) : [],
  })) : [];
  game.next_offer = clampInt(game.next_offer, 1, 9999999, 1);
  game.events = Array.isArray(game.events) ? game.events.filter((e) => e && Number.isInteger(e.seq)).slice(-EVENT_CAP) : [];
  game.event_seq = clampInt(game.event_seq, 0, 99999999, 0);
  game.skip_votes = normalizeSkipVotes(game.skip_votes);
  game.winner = game.seat_order.includes(game.winner) ? game.winner : null;
  game.results = Array.isArray(game.results) ? game.results : null;
  if (game.setup && (!Array.isArray(game.setup.order) || !Number.isInteger(game.setup.index))) game.setup = null;
}
