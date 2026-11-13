// Last Orders — server-authoritative flow for an ORIGINAL tavern-brawl card
// game (the "two tracks that meet, buy rivals drinks, react, gamble, last one
// standing" family). Pure logic: no routing/auth/persistence, no DOM, no
// timers. The Worker calls setLastOrdersOptions at /api/room/start, then
// initLastOrdersSeats. Bots play through the SAME validated path a human
// move uses (./ai.js decides, the do* functions below validate + apply).
//
// TURN MODEL: classic order around the table (discard → action → order a
// drink → drink), plus short TIMED reaction windows that anyone may answer.
// The Worker has no timers, so every deadline (reaction close, bot think
// time) is a timestamp; the projection carries `next_due_at` and a seated
// human's phone sends TICK when it passes. Any arriving action first catches
// the table up to "now".
//
// Design + wire contract: src/sogotable/static/games/last-orders/PLAN.md.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { cleanGameId } from "../../game-catalog.js";
import { castSkipVote, normalizeSkipVotes, pruneSkipVotes } from "../skip-vote.js";
import {
  EXPANSION_IDS, cardDef, characterDef, charactersFor, characterDeckIds, drinkDeckIds, eventDeckIds, entryOf, plainDef,
} from "./catalog.js";
import {
  BASE, EVENT_CAP, setEngineRandom, random, shuffle, living, isLiving, isBotLike, traitOf, handSize, maxGrit,
  pushEvent, nextUid, drawCards, takeFromHand, nextDrink, flipEvent, escalation, resolveStack, startGamble,
  finishGamble, checkOuts,
} from "./engine.js";
import { playableFor, canPass, windowEligible, topItem, orderTargets, discardLimit } from "./legal.js";
import { botPickCharacter, botDiscard, botAction, botOrder, botReact } from "./ai.js";

export const LAST_ORDERS_GAME_ID = GAME_IDS.lastOrders;
export const REACT_SECONDS = [5, 8, 12, 20];
export const LAST_ORDERS_DEFAULT_OPTIONS = Object.freeze({
  react_seconds: 8, expansions: [], closing_time: true, random_characters: false, show_playable: true,
});
const MIN_PLAYERS = 2;
const GUARD = 20000;

export function isLastOrdersGame(game) {
  if (!game || !game.game_id) return false;
  try { return cleanGameId(game.game_id) === LAST_ORDERS_GAME_ID; } catch { return String(game.game_id).trim() === LAST_ORDERS_GAME_ID; }
}

// ---------- seams ----------

let clock = () => Date.now();
export function setLastOrdersClock(fn) {
  clock = typeof fn === "function" ? fn : () => Date.now();
}
export function setLastOrdersRandom(fn) {
  setEngineRandom(fn);
}

// ---------- options ----------

function toBool(value, fallback) {
  if (value === true || value === false) return value;
  if (value === "true" || value === "on" || value === 1 || value === "1") return true;
  if (value === "false" || value === "off" || value === 0 || value === "0") return false;
  return fallback;
}
const clampInt = (v, min, max, fb) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fb;
};

export function normalizeLastOrdersOptions(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const d = LAST_ORDERS_DEFAULT_OPTIONS;
  const rs = Number(o.react_seconds);
  return {
    react_seconds: REACT_SECONDS.includes(rs) ? rs : d.react_seconds,
    expansions: Array.isArray(o.expansions) ? [...new Set(o.expansions.map(String))].filter((id) => EXPANSION_IDS.includes(id)) : [],
    closing_time: toBool(o.closing_time, d.closing_time),
    random_characters: toBool(o.random_characters, d.random_characters),
    show_playable: toBool(o.show_playable, d.show_playable),
  };
}

// payload.lo_options from /api/room/start; a payload without it keeps the
// current options (the reset path carries options first).
export function setLastOrdersOptions(game, payload) {
  const raw = payload && payload.lo_options;
  game.options = normalizeLastOrdersOptions(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : game.options);
  return game.options;
}

// ---------- timing ----------

const humansWatching = (game) => game.seat_order.some((m) => !game.players[m].is_bot);
const humansPlaying = (game) => living(game).some((m) => !isBotLike(game.players[m]));
// Pacing (2026-11-13): every play stays on the table for at least SHOW_MS
// while any human is watching (seated or knocked out), so the callout and its
// voice line land before the card resolves; bot steps leave a beat to read.
const SHOW_MS = 2200;
const showMs = (game) => (humansWatching(game) ? SHOW_MS : 0);
function windowMs(game) {
  if (humansPlaying(game)) return game.options.react_seconds * 1000;
  return showMs(game);
}
function botStepMs(game) {
  if (!humansWatching(game)) return 0;
  const [base, spread] = humansPlaying(game) ? [1600, 1200] : [1200, 800];
  return base + Math.floor(random() * spread);
}
function botThinkMs(game) {
  if (!humansWatching(game)) return 0;
  if (!humansPlaying(game)) return 500 + Math.floor(random() * (SHOW_MS - 900));
  const cap = Math.max(400, game.options.react_seconds * 1000 - 900);
  return Math.min(cap, 900 + Math.floor(random() * 1900));
}
const bump = (game) => { game.step = (Number(game.step) || 0) + 1; };

// ---------- lifecycle ----------

export function newLastOrdersGame() {
  return {
    game_id: LAST_ORDERS_GAME_ID, status: "playing", phase: "pick", step: 0, round: 0, move_count: 0,
    options: normalizeLastOrdersOptions(null), seat_order: [], players: {}, turn: null, reaction: null, gamble: null,
    drink_deck: [], drink_discard: [], event_deck: [], event_discard: [], event: null, last_drink: null,
    start_index: 0, uid_seq: 0, out_seq: 0, events: [], skip_votes: {}, winner: null, results: null,
  };
}

function botLevel(seat) {
  if (!seat || seat.kind !== "bot") return 0;
  const level = Number(seat.bot_level !== undefined ? seat.bot_level : seat.level);
  return Number.isInteger(level) && level >= 1 && level <= 4 ? level : 2;
}

export function initLastOrdersSeats(game, seats) {
  game.options = normalizeLastOrdersOptions(game.options);
  const fresh = newLastOrdersGame();
  Object.assign(game, { ...fresh, options: game.options });
  (Array.isArray(seats) ? seats : []).forEach((seat) => {
    const mark = String(seat && seat.mark || "").trim();
    if (!mark || game.players[mark]) return;
    game.seat_order.push(mark);
    game.players[mark] = {
      is_bot: Boolean(seat && seat.kind === "bot"), level: botLevel(seat), auto: false, character: null,
      grit: BASE.grit, buzz: 0, gold: BASE.gold, hand: [], deck: [], discard: [], line: [], out: null, out_order: 0,
    };
  });
  if (game.seat_order.length < MIN_PLAYERS) throw new Error("Last Orders needs at least 2 patrons — invite players or bots to fill the table.");
  if (game.options.random_characters) game.seat_order.forEach((m) => assignCharacter(game, m, null));
  bump(game);
  advance(game, clock());
}

function availableCharacters(game) {
  const pool = charactersFor(game.options.expansions).map((c) => c.id);
  const taken = new Set(game.seat_order.map((m) => game.players[m].character).filter(Boolean));
  const free = pool.filter((id) => !taken.has(id));
  return free.length ? free : pool;
}

function assignCharacter(game, mark, wanted) {
  const avail = availableCharacters(game);
  const id = wanted && avail.includes(wanted) ? wanted : botPickCharacter(avail);
  game.players[mark].character = id;
  pushEvent(game, { type: "pick", mark, character: id });
}

function maybeFinishPick(game, now) {
  const order = game.seat_order;
  const waiting = order.filter((m) => !game.players[m].character && !game.players[m].is_bot);
  if (waiting.length) return false;
  order.filter((m) => !game.players[m].character).forEach((m) => assignCharacter(game, m, null));
  startPlay(game, now);
  return true;
}

function startPlay(game, now) {
  game.phase = "play";
  game.seat_order.forEach((m) => {
    const seat = game.players[m];
    const t = traitOf(seat);
    seat.grit = maxGrit(seat);
    seat.gold = Math.max(1, BASE.gold + t.start_gold);
    seat.buzz = Math.max(0, t.start_buzz);
    seat.deck = shuffle(characterDeckIds(seat.character));
    seat.discard = [];
    seat.hand = [];
    seat.line = [];
    drawCards(game, m, handSize(seat));
  });
  game.drink_deck = shuffle(drinkDeckIds(game.options.expansions));
  game.event_deck = shuffle(eventDeckIds(game.options.expansions));
  game.start_index = Math.floor(random() * game.seat_order.length);
  game.round = 1;
  if (game.event_deck.length) flipEvent(game);
  checkOuts(game);
  beginTurn(game, game.seat_order[game.start_index], now);
}

function beginTurn(game, mark, now) {
  const seat = game.players[mark];
  game.turn = { mark, phase: "discard", actions_left: 1, act_at: isBotLike(seat) ? now + botStepMs(game) : 0 };
  game.skip_votes = {};
  pushEvent(game, { type: "turn", mark });
  bump(game);
}

function nextTurn(game, now) {
  const order = game.seat_order;
  const n = order.length;
  const dist = (m) => (order.indexOf(m) - game.start_index + n) % n;
  const from = game.turn ? game.turn.mark : order[game.start_index];
  let next = null;
  for (let k = 1; k <= n; k += 1) {
    const m = order[(order.indexOf(from) + k) % n];
    if (isLiving(game, m)) { next = m; break; }
  }
  if (!next) return;
  if (dist(next) <= dist(from)) {
    game.round += 1;
    pushEvent(game, { type: "round", round: game.round, escalation: escalation(game) });
    if (game.event_deck.length || game.event_discard.length) flipEvent(game);
    checkOuts(game);
    if (game.status !== "playing") return;
    if (!isLiving(game, next)) { game.turn.mark = next; nextTurn(game, now); return; }
  }
  beginTurn(game, next, now);
}

// ---------- windows ----------

function openWindow(game, kind, now) {
  game.reaction = { kind, stack: [], closes_at: now + windowMs(game), passed: [], plans: {} };
  if (kind === "gamble") planBots(game, now);
  bump(game);
}

function pushItem(game, item, now) {
  const w = game.reaction;
  w.stack.push(item);
  w.passed = [];
  w.closes_at = now + windowMs(game);
  w.show_until = now + showMs(game);
  planBots(game, now);
  pushEvent(game, { type: w.stack.length > 1 ? "react" : "play", uid: item.uid, mark: item.by, card: item.card, kind: item.kind, target: item.target, spikes: item.spikes });
  bump(game);
}

// Every bot-like seat that may act gets a decision AND a think time, whether
// it will react or pass, so nobody can tell early which bots hold answers.
function planBots(game, now) {
  const w = game.reaction;
  w.plans = {};
  windowEligible(game).forEach((m) => {
    const seat = game.players[m];
    if (!isBotLike(seat)) return;
    const choice = botReact(game, m, seat.level || 2);
    const at = now + botThinkMs(game);
    w.plans[m] = choice ? { at, uid: choice.uid, target: choice.target } : { at, pass: true };
  });
}

function stepWindow(game, now) {
  const w = game.reaction;
  const due = Object.keys(w.plans).filter((m) => w.plans[m].at <= now).sort((a, b) => w.plans[a].at - w.plans[b].at);
  if (due.length) {
    const m = due[0];
    const plan = w.plans[m];
    delete w.plans[m];
    const playable = playableFor(game, m);
    if (!plan.pass && playable[plan.uid]) playCard(game, m, plan.uid, plan.target, now);
    else if (canPass(game, m)) w.passed.push(m);
    return true;
  }
  const eligible = windowEligible(game);
  const allPassed = eligible.every((m) => w.passed.includes(m));
  if ((allPassed && now >= (Number(w.show_until) || 0)) || now >= w.closes_at) {
    closeWindow(game, now);
    return true;
  }
  return false;
}

function discardItem(game, item) {
  if (item.kind === "drink") {
    game.drink_discard.push(item.card);
    (item.spikes || []).forEach((id) => { if (item.by && game.players[item.by]) game.players[item.by].discard.push(id); });
  } else if (item.by && game.players[item.by]) {
    game.players[item.by].discard.push(item.card);
  }
}

function closeWindow(game, now) {
  const w = game.reaction;
  if (w.kind === "gamble" && !w.stack.length) {
    game.reaction = null;
    finishGamble(game);
    checkOuts(game);
    bump(game);
    return;
  }
  const base = resolveStack(game);
  w.stack.forEach((it) => discardItem(game, it));
  game.reaction = null;
  if (base && base.kind === "drink") {
    game.last_drink = { drink: base.card, spikes: [...(base.spikes || [])], by: base.by, target: base.target, canceled: Boolean(base.canceled) };
  }
  checkOuts(game);
  bump(game);
  if (game.status !== "playing") return;
  advanceBotClock(game, now); // a bot turn player pauses a beat after every resolution
  if (game.pending_gamble) {
    const leader = game.pending_gamble;
    game.pending_gamble = null;
    if (isLiving(game, leader) && living(game).length >= 2) {
      startGamble(game, leader);
      openWindow(game, "gamble", now);
    }
    return;
  }
  if (base && base.kind === "gamble" && game.gamble) {
    game.gamble.in = game.gamble.in.filter((m) => isLiving(game, m));
    openWindow(game, "gamble", now);
    return;
  }
  if (base && base.kind === "drink") {
    const chaser = game.pending_chaser;
    game.pending_chaser = null;
    if (chaser && isLiving(game, chaser.target)) {
      const drink = nextDrink(game);
      if (drink) {
        openWindow(game, "react", now);
        pushItem(game, { uid: nextUid(game), by: null, kind: "drink", card: drink, target: chaser.target, spikes: [], chain: chaser.chain }, now);
        return;
      }
    }
    if (game.turn) game.turn.phase = "done";
  }
}

// ---------- the moves (humans and bots share these) ----------

function playCard(game, mark, uid, target, now) {
  const playable = playableFor(game, mark);
  if (!playable[uid]) throw new Error("You can't play that card right now.");
  const targets = playable[uid];
  if (targets.length && !targets.includes(target)) throw new Error("Pick who that card is for.");
  const seat = game.players[mark];
  const card = takeFromHand(seat, uid);
  const def = cardDef(card.id);
  if (game.reaction) {
    const top = topItem(game);
    if (def.kind === "gamble") {
      pushItem(game, { uid, by: mark, kind: "gamble", card: card.id, target: game.gamble ? game.gamble.leader : null }, now);
    } else {
      const redirect = (def.effects || []).some((e) => e.op === "redirect");
      pushItem(game, { uid, by: mark, kind: "reaction", card: card.id, target: redirect ? target : (top ? top.by : null) }, now);
    }
    return;
  }
  if (!def.free) game.turn.actions_left -= 1;
  openWindow(game, "react", now);
  pushItem(game, { uid, by: mark, kind: "action", card: card.id, target: targets.length ? target : null }, now);
}

function doDiscard(game, mark, uids, now) {
  const max = discardLimit(game, mark);
  if (!game.turn || game.turn.mark !== mark || game.turn.phase !== "discard" || game.reaction) throw new Error("It isn't your discard step.");
  const list = [...new Set((Array.isArray(uids) ? uids : []).map(String))];
  if (list.length > max) throw new Error(`You may discard at most ${max} cards.`);
  const seat = game.players[mark];
  list.forEach((uid) => { if (!seat.hand.some((c) => c.uid === uid)) throw new Error("That card isn't in your hand."); });
  list.forEach((uid) => seat.discard.push(takeFromHand(seat, uid).id));
  const need = Math.max(0, handSize(seat) - seat.hand.length);
  const drawn = drawCards(game, mark, need);
  pushEvent(game, { type: "discard", mark, n: list.length, drew: drawn });
  game.turn.phase = "action";
  advanceBotClock(game, now);
  bump(game);
}

function doEndAction(game, mark, now) {
  if (!game.turn || game.turn.mark !== mark || game.turn.phase !== "action" || game.reaction) throw new Error("It isn't your action step.");
  game.turn.phase = "order";
  advanceBotClock(game, now);
  bump(game);
}

function doOrder(game, mark, target, spikeUid, now) {
  const targets = orderTargets(game, mark);
  if (!targets.length) throw new Error("It isn't time to order a drink.");
  if (!targets.includes(target)) throw new Error("Pick who the drink is for.");
  const seat = game.players[mark];
  const spikes = [];
  if (spikeUid) {
    const playable = playableFor(game, mark);
    const card = seat.hand.find((c) => c.uid === spikeUid);
    if (!card || !playable[spikeUid] || (cardDef(card.id) || {}).kind !== "spike") throw new Error("That card can't spike a drink.");
    spikes.push(takeFromHand(seat, spikeUid).id);
  }
  const drink = nextDrink(game);
  if (drink) game.players[target].line.push({ drink, spikes, by: mark });
  else spikes.forEach((id) => seat.discard.push(id));
  pushEvent(game, { type: "order", mark: target, by: mark, spiked: spikes.length > 0 });
  game.turn.phase = "drink";
  advanceBotClock(game, now);
  bump(game);
}

function startDrink(game, now) {
  const mark = game.turn.mark;
  const seat = game.players[mark];
  const entry = seat.line.shift() || { drink: nextDrink(game), spikes: [], by: null };
  if (!entry.drink) { game.turn.phase = "done"; return; }
  openWindow(game, "react", now);
  pushItem(game, { uid: nextUid(game), by: entry.by || null, kind: "drink", card: entry.drink, target: mark, spikes: entry.spikes || [] }, now);
}

function advanceBotClock(game, now) {
  if (game.turn && isBotLike(game.players[game.turn.mark])) game.turn.act_at = now + botStepMs(game);
}

function botTurnStep(game, mark, now) {
  const seat = game.players[mark];
  const level = seat.level || 2;
  const t = game.turn;
  if (t.phase === "discard") return doDiscard(game, mark, botDiscard(game, mark, level), now);
  if (t.phase === "action") {
    const choice = botAction(game, mark, level);
    if (choice) { playCard(game, mark, choice.uid, choice.target, now); advanceBotClock(game, now); return; }
    return doEndAction(game, mark, now);
  }
  if (t.phase === "order") {
    const choice = botOrder(game, mark, level);
    return doOrder(game, mark, choice.target, choice.spike, now);
  }
}

function stepTurn(game, now) {
  const t = game.turn;
  if (!t) return false;
  if (!isLiving(game, t.mark) || t.phase === "done") { nextTurn(game, now); return true; }
  if (t.phase === "drink") { startDrink(game, now); return true; }
  const seat = game.players[t.mark];
  if (!isBotLike(seat)) {
    // A human with no action left to play moves straight on to ordering.
    if (t.phase === "action" && !Object.keys(playableFor(game, t.mark)).length) { t.phase = "order"; bump(game); return true; }
    return false;
  }
  if (t.act_at > now) return false;
  botTurnStep(game, t.mark, now);
  return true;
}

// Catch the table up to `now`: due bot plans, expired windows, bot turns,
// automatic steps. An all-bot table plays straight through (bounded).
function advance(game, now) {
  let guard = 0;
  while (game.status === "playing" && guard < GUARD) {
    guard += 1;
    let moved;
    if (game.phase === "pick") moved = maybeFinishPick(game, now);
    else if (game.reaction) moved = stepWindow(game, now);
    else moved = stepTurn(game, now);
    if (!moved) return;
  }
}

function nextDueAt(game) {
  if (game.status !== "playing" || game.phase !== "play") return 0;
  const w = game.reaction;
  if (w) {
    const plans = Object.values(w.plans).map((p) => p.at);
    const allPassed = windowEligible(game).every((m) => w.passed.includes(m));
    return Math.min(w.closes_at, ...plans, ...(allPassed ? [Math.max(Number(w.show_until) || 0, 1)] : []));
  }
  const t = game.turn;
  return t && isBotLike(game.players[t.mark]) ? t.act_at : 0;
}

// ---------- skip vote (a stuck human is auto-played until they return) ----------

function skipTarget(game) {
  if (game.phase === "pick") return null;
  const t = game.turn;
  if (!t || game.reaction) return null;
  const seat = game.players[t.mark];
  return seat && !seat.is_bot && !seat.auto && isLiving(game, t.mark) ? t.mark : null;
}
function skipVoters(game, target) {
  if (game.phase === "pick") {
    const seat = game.players[target];
    if (!seat || seat.is_bot || seat.character) return null;
    return game.seat_order.filter((m) => !game.players[m].is_bot && game.players[m].character);
  }
  if (skipTarget(game) !== target) return null;
  return game.seat_order.filter((m) => m !== target && !game.players[m].is_bot);
}

function doSkip(game, mark, target, now) {
  const voters = skipVoters(game, target);
  if (!voters || !voters.length) throw new Error("That player can't be skipped right now.");
  if (!voters.includes(mark)) throw new Error("You can't vote on that skip.");
  const result = castSkipVote(game.skip_votes, mark, target, voters);
  game.skip_votes = result.votes;
  if (!result.unanimous) return;
  game.skip_votes = {};
  pushEvent(game, { type: "skip", mark: target });
  if (game.phase === "pick") { assignCharacter(game, target, null); bump(game); return; }
  game.players[target].auto = true;
  game.turn.act_at = now + botStepMs(game);
  bump(game);
}

// ---------- entry ----------

export function makeLastOrdersMove(game, mark, action) {
  normalizeLastOrdersGame(game);
  if (game.status === "complete") throw new Error("The night is over — start a rematch for another round.");
  const seat = game.players[mark];
  if (!seat) throw new Error("You are not seated at this table.");
  if (seat.is_bot) throw new Error("Bot seats play automatically.");
  const a = action && typeof action === "object" ? action : {};
  const type = String(a.type || "").toUpperCase();
  const now = clock();
  if (type === "TICK") {
    const due = nextDueAt(game);
    if (!due || due > now) throw new Error("Nothing is due yet.");
    advance(game, now);
    finish(game);
    return;
  }
  advance(game, now);
  if (game.status === "complete") { finish(game); return; }
  if (type === "SKIP_PLAYER") { doSkip(game, mark, String(a.target || ""), now); advance(game, now); finish(game); return; }
  const stamped = a.step == null ? NaN : Math.trunc(Number(a.step));
  if (type !== "PICK" && Number.isFinite(stamped) && stamped !== game.step) throw new Error("The table moved on — have another look and try again.");
  if (type !== "PICK" && seat.out) throw new Error("You're out for the night — enjoy the show.");
  seat.auto = false; // any real move means they're back
  switch (type) {
    case "PICK": {
      if (game.phase !== "pick") throw new Error("Characters are already chosen.");
      if (seat.character) break; // duplicate tap: first pick stands
      const wanted = String(a.character || "");
      if (!characterDef(wanted) || !charactersFor(game.options.expansions).some((c) => c.id === wanted)) throw new Error("Pick a patron from the list.");
      if (!availableCharacters(game).includes(wanted)) throw new Error("Someone just took that patron — pick another.");
      assignCharacter(game, mark, wanted);
      bump(game);
      break;
    }
    case "DISCARD": doDiscard(game, mark, a.uids, now); break;
    case "PLAY": playCard(game, mark, String(a.uid || ""), a.target == null ? null : String(a.target), now); break;
    case "END_ACTION": doEndAction(game, mark, now); break;
    case "ORDER": doOrder(game, mark, String(a.target || ""), a.spike ? String(a.spike) : null, now); break;
    case "PASS":
      if (!canPass(game, mark)) {
        if (game.reaction && game.reaction.passed.includes(mark)) break; // duplicate pass
        throw new Error("There's nothing to pass on right now.");
      }
      game.reaction.passed.push(mark);
      break;
    default: throw new Error(`Unknown action "${type}".`);
  }
  advance(game, now);
  finish(game);
}

function finish(game) {
  game.move_count += 1;
  game.skip_votes = pruneSkipVotes(game.skip_votes, (t) => skipVoters(game, t));
}

// ---------- projection ----------

function privateFor(game, mark) {
  const seat = game.players[mark];
  const playable = playableFor(game, mark);
  return {
    mark,
    hand: seat.hand.map((c) => ({ uid: c.uid, id: c.id })),
    playable: Object.keys(playable),
    targets: playable,
    can_pass: canPass(game, mark),
    discard_max: discardLimit(game, mark),
    order_targets: orderTargets(game, mark),
  };
}

export function lastOrdersGameToDict(game) {
  normalizeLastOrdersGame(game);
  const w = game.reaction;
  const priv = {};
  game.seat_order.forEach((m) => { if (!game.players[m].is_bot) priv[m] = privateFor(game, m); });
  return {
    game_id: LAST_ORDERS_GAME_ID, status: game.status, phase: game.phase, step: game.step, round: game.round,
    move_count: game.move_count, options: { ...game.options, expansions: [...game.options.expansions] },
    server_now: clock(), next_due_at: nextDueAt(game), escalation: escalation(game),
    seat_order: [...game.seat_order], winner: game.winner,
    results: game.results ? game.results.map((r) => ({ ...r })) : null,
    characters: charactersFor(game.options.expansions).map((c) => ({ id: c.id, pack: entryOf(c.id).pack, trait: { ...(c.trait || {}) }, deck_size: characterDeckIds(c.id).length })),
    players: game.seat_order.map((m) => {
      const s = game.players[m];
      return {
        mark: m, is_bot: s.is_bot, level: s.level, auto: Boolean(s.auto), character: s.character, picked: Boolean(s.character),
        grit: s.grit, max_grit: s.character ? maxGrit(s) : BASE.grit, buzz: s.buzz, gold: s.gold, out: s.out, out_order: s.out_order,
        hand_count: s.hand.length, deck_count: s.deck.length, discard_count: s.discard.length, line_count: s.line.length,
      };
    }),
    turn: game.turn ? { mark: game.turn.mark, phase: game.turn.phase, actions_left: game.turn.actions_left } : null,
    reaction: w ? {
      kind: w.kind, closes_at: w.closes_at, passed: [...w.passed], eligible: windowEligible(game),
      stack: w.stack.map((it) => ({ uid: it.uid, by: it.by, kind: it.kind, card: it.card, target: it.target, canceled: Boolean(it.canceled), soften: it.soften || 0, spikes: [...(it.spikes || [])] })),
    } : null,
    gamble: game.gamble ? { leader: game.gamble.leader, pot: game.gamble.pot, in: [...game.gamble.in] } : null,
    event: game.event, drink_deck_count: game.drink_deck.length, last_drink: game.last_drink ? { ...game.last_drink, spikes: [...game.last_drink.spikes] } : null,
    events: game.events.map((e) => ({ ...e })), skip_votes: normalizeSkipVotes(game.skip_votes),
    private: priv, // stripped per viewer — never sent whole
  };
}

export function lastOrdersGameToDictForViewer(dict, viewerMark) {
  const projected = structuredClone(dict);
  const priv = projected.private || {};
  projected.me = viewerMark && priv[viewerMark] ? priv[viewerMark] : null;
  delete projected.private;
  const ids = new Set();
  (projected.me ? projected.me.hand : []).forEach((c) => ids.add(c.id));
  if (projected.reaction) projected.reaction.stack.forEach((it) => { ids.add(it.card); it.spikes.forEach((s) => ids.add(s)); });
  if (projected.last_drink) { ids.add(projected.last_drink.drink); projected.last_drink.spikes.forEach((s) => ids.add(s)); }
  if (projected.event) ids.add(projected.event);
  (projected.events || []).forEach((e) => { ["card", "drink", "event", "source"].forEach((k) => { if (e[k]) ids.add(e[k]); }); });
  projected.defs = {};
  ids.forEach((id) => { const d = plainDef(id); if (d) projected.defs[id] = d; });
  return projected;
}

// Placement points for stats: winner = seat count, first out = 1.
export function lastOrdersScoreByMark(game) {
  normalizeLastOrdersGame(game);
  const scores = {};
  const n = game.seat_order.length;
  (game.results || []).forEach((r) => { scores[r.mark] = n + 1 - r.place; });
  game.seat_order.forEach((m) => { if (scores[m] === undefined) scores[m] = 0; });
  return scores;
}

// Tolerate garbage in stored state: clamp the numbers, drop unknown ids.
function normalizeLastOrdersGame(game) {
  game.game_id = LAST_ORDERS_GAME_ID;
  game.status = game.status === "complete" ? "complete" : "playing";
  game.phase = game.phase === "play" ? "play" : "pick";
  game.options = normalizeLastOrdersOptions(game.options);
  game.step = clampInt(game.step, 0, 1e9, 0);
  game.round = clampInt(game.round, 0, 99999, 0);
  game.move_count = clampInt(game.move_count, 0, 1e9, 0);
  game.seat_order = Array.isArray(game.seat_order) ? [...new Set(game.seat_order.map(String))] : [];
  if (!game.players || typeof game.players !== "object") game.players = {};
  const known = (id) => Boolean(entryOf(id));
  game.seat_order.forEach((m) => {
    const s = game.players[m] || {};
    game.players[m] = {
      ...s,
      is_bot: Boolean(s.is_bot), level: clampInt(s.level, 0, 4, s.is_bot ? 2 : 0), auto: Boolean(s.auto),
      character: s.character && characterDef(s.character) ? s.character : null,
      grit: clampInt(s.grit, 0, 999, BASE.grit), buzz: clampInt(s.buzz, 0, 999, 0), gold: clampInt(s.gold, 0, 9999, BASE.gold),
      hand: Array.isArray(s.hand) ? s.hand.filter((c) => c && typeof c.uid === "string" && cardDef(c.id)) : [],
      deck: Array.isArray(s.deck) ? s.deck.filter((id) => cardDef(id)) : [],
      discard: Array.isArray(s.discard) ? s.discard.filter((id) => cardDef(id)) : [],
      line: Array.isArray(s.line) ? s.line.filter((d) => d && known(d.drink)).map((d) => ({ drink: d.drink, spikes: Array.isArray(d.spikes) ? d.spikes.filter(known) : [], by: d.by || null })) : [],
      out: ["passed_out", "knocked_out", "broke"].includes(s.out) ? s.out : null,
      out_order: clampInt(s.out_order, 0, 999, 0),
    };
  });
  ["drink_deck", "drink_discard", "event_deck", "event_discard"].forEach((k) => {
    game[k] = Array.isArray(game[k]) ? game[k].filter(known) : [];
  });
  game.event = game.event && known(game.event) ? game.event : null;
  game.events = Array.isArray(game.events) ? game.events.filter((e) => e && Number.isInteger(e.seq)).slice(-EVENT_CAP) : [];
  game.skip_votes = normalizeSkipVotes(game.skip_votes);
  game.winner = game.seat_order.includes(game.winner) ? game.winner : null;
  game.results = Array.isArray(game.results) ? game.results : null;
  if (game.turn && !game.players[game.turn.mark]) game.turn = null;
  if (game.reaction && !(Array.isArray(game.reaction.stack) && Array.isArray(game.reaction.passed))) game.reaction = null;
  if (game.reaction && (!game.reaction.plans || typeof game.reaction.plans !== "object")) game.reaction.plans = {};
}
