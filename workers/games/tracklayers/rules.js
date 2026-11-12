// Tracklayers — server-authoritative rules for an ORIGINAL train-route game
// (collect colored cards, claim routes between cities, complete destination
// tickets, longest-line bonus) on the original Lantern Isles map (./map.js).
// Pure logic: no routing/auth/persistence, no DOM, no timers. Spec + wire
// contract: src/sogotable/static/games/tracklayers/PLAN.md.
//
// SIMULTANEOUS SUBMIT: every round each seat COMMITs exactly one action (DRAW,
// CLAIM or TICKETS). Only humans hold the barrier; when every human has
// committed (or been skipped) the bots choose LAST through the same
// validateCommit a human runs, then ./resolve.js applies everything in the
// fixed order with a rotating `priority_order` settling every contest. An
// all-bot table resolves straight through (bounded loop). KEEP_TICKETS is an
// instant, non-barrier action that must precede a seat's COMMIT whenever it
// holds pending tickets.
//
// Secrets: the deck order and ticket pile never leave via toDict; hands,
// tickets and commits of OTHER seats are masked by the viewer projection.
// RNG: one seedable seam (setTracklayersRandom) for shuffles and bots.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { cleanGameId } from "../../game-catalog.js";
import { castSkipVote, normalizeSkipVotes, pruneSkipVotes } from "../skip-vote.js";
import { BOARD, CITIES, MAP_ID, ROUTES, TICKETS } from "./map.js";
import { CARD_KINDS, COLORS, MARKET_SIZE, buildDeck, drawBlind, emptyHand, handCount, refillMarket, shuffle } from "./cards.js";
import { TICKET_BY_ID } from "./graph.js";
import { EVENT_CAP, LONGEST_BONUS, ROUTE_POINTS, TICKETS_OFFERED, pushEvent, twinsLocked, validateCommit } from "./legal.js";
import { cardsLeft, completeGame, dealTickets, keepTickets, resolveRound } from "./resolve.js";
import { chooseTracklayersCommit, chooseTracklayersKeep } from "./ai.js";

export const TRACKLAYERS_GAME_ID = GAME_IDS.tracklayers;
export const TRACKLAYERS_MIN_PLAYERS = 2;
export const TRAIN_OPTIONS = Object.freeze([25, 35, 45]);
const DEFAULT_TRAINS = 35;
const START_HAND = 4;
const START_MIN_KEEP = 2;
const FINAL_TRIGGER_TRAINS = 2;
const IDLE_ROUND_LIMIT = 3;
const ROUND_CAP = 200;

export function isTracklayersGame(game) {
  if (!game || !game.game_id) return false;
  try { return cleanGameId(game.game_id) === TRACKLAYERS_GAME_ID; } catch { return String(game.game_id).trim() === TRACKLAYERS_GAME_ID; }
}

let rng = Math.random;
export function setTracklayersRandom(fn) {
  rng = typeof fn === "function" ? fn : Math.random;
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// Bot strength from the lobby seat (bot_level 1–4); non-bots 0.
function botLevel(seat) {
  if (!seat || (seat.kind !== "bot" && seat.is_bot !== true)) return 0;
  const level = Number(seat.bot_level !== undefined ? seat.bot_level : seat.level);
  return Number.isInteger(level) && level >= 1 && level <= 4 ? level : 2;
}

// ---------- options ----------

export function normalizeTracklayersOptions(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const n = Number(o.trains);
  if (!Number.isFinite(n)) return { trains: DEFAULT_TRAINS };
  const nearest = TRAIN_OPTIONS.reduce((best, t) => (Math.abs(t - n) < Math.abs(best - n) ? t : best), TRAIN_OPTIONS[0]);
  return { trains: nearest };
}

// Host options from /api/room/start (payload.tracklayers_options). Called
// BEFORE initTracklayersSeats. A payload without the object keeps the
// current options (the reset path carries options first).
export function setTracklayersOptions(game, payload) {
  const raw = payload && payload.tracklayers_options;
  game.options = normalizeTracklayersOptions(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : game.options);
  return game.options;
}

// ---------- lifecycle ----------

export function newTracklayersGame() {
  return {
    game_id: TRACKLAYERS_GAME_ID,
    status: "playing",
    phase: "playing",
    round: 1,
    final_round: null,
    options: normalizeTracklayersOptions(null),
    seat_order: [],
    priority_order: [],
    deck: [], // server-secret
    discard: [],
    market: [],
    ticket_deck: [], // server-secret
    routes: {},
    players: {},
    skip_votes: {},
    events: [],
    event_seq: 0,
    idle_rounds: 0,
    winner: null,
    results: null,
    move_count: 0,
  };
}

function newSeat(isBot, level, trains) {
  return {
    is_bot: isBot, level, hand: emptyHand(), tickets: [], pending_tickets: [], min_keep: START_MIN_KEEP,
    trains, score: 0, committed: null, skipped: false, ticket_results: null, longest: null,
  };
}

const botKeep = (game, mark) => {
  const seat = game.players[mark];
  let keep;
  try { keep = chooseTracklayersKeep(game, mark, seat.pending_tickets, seat.min_keep, rng); } catch { keep = null; }
  const valid = Array.isArray(keep) && keep.length >= seat.min_keep && keep.every((id) => seat.pending_tickets.includes(id));
  return valid ? [...new Set(keep)] : [...seat.pending_tickets];
};

export function initTracklayersSeats(game, seats) {
  game.options = normalizeTracklayersOptions(game.options);
  const fresh = newTracklayersGame();
  fresh.options = game.options;
  (Array.isArray(seats) ? seats : []).forEach((seat) => {
    const mark = String(seat && seat.mark || "").trim();
    if (!mark || fresh.players[mark]) return;
    fresh.seat_order.push(mark);
    fresh.players[mark] = newSeat(Boolean(seat && seat.kind === "bot"), botLevel(seat), fresh.options.trains);
  });
  if (fresh.seat_order.length < TRACKLAYERS_MIN_PLAYERS) {
    throw new Error("Tracklayers needs at least 2 players — invite a friend or add a bot.");
  }
  Object.keys(game).forEach((k) => { delete game[k]; });
  Object.assign(game, fresh);
  game.priority_order = [...game.seat_order];
  game.deck = buildDeck(rng);
  game.ticket_deck = shuffle(TICKETS.map((t) => t.id), rng);
  for (let i = 0; i < START_HAND; i += 1) {
    game.seat_order.forEach((mark) => {
      const card = drawBlind(game, rng);
      if (card) game.players[mark].hand[card] += 1;
    });
  }
  refillMarket(game, rng, (kind, text) => pushEvent(game, { kind, text }));
  pushEvent(game, { kind: "start", text: `The Lantern Isles await — ${game.seat_order.length} players, ${game.options.trains} trains each. Everyone acts at once.` });
  game.seat_order.forEach((mark) => {
    dealTickets(game, mark, TICKETS_OFFERED, START_MIN_KEEP);
    if (game.players[mark].is_bot) keepTickets(game, mark, botKeep(game, mark));
  });
  pushEvent(game, { kind: "round", text: "Round 1 — keep at least 2 tickets, then choose an action." });
  advance(game); // an all-bot table runs straight through
}

const isDone = (seat) => Boolean(seat.committed || seat.skipped);

function commitBots(game) {
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    if (!seat.is_bot || isDone(seat)) return;
    if (seat.pending_tickets.length) keepTickets(game, mark, botKeep(game, mark));
    let action = null;
    try { action = chooseTracklayersCommit(game, mark, rng); } catch { action = null; }
    try {
      seat.committed = validateCommit(game, mark, action);
    } catch {
      seat.committed = validateCommit(game, mark, { type: "DRAW", picks: ["deck", "deck"] });
    }
  });
}

function nextRound(game) {
  game.round += 1;
  const first = game.priority_order.shift();
  if (first !== undefined) game.priority_order.push(first);
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    seat.committed = null;
    seat.skipped = false;
  });
  game.skip_votes = {};
  const final = game.final_round === game.round ? " This is the FINAL round!" : "";
  pushEvent(game, { kind: "round", text: `Round ${game.round} — ${game.priority_order[0]} has priority.${final}` });
}

// The barrier. Loops so an all-bot table finishes in one call (bounded).
function advance(game) {
  let guard = 0;
  while (game.status === "playing" && guard < ROUND_CAP + 10) {
    guard += 1;
    const humans = game.seat_order.filter((m) => !game.players[m].is_bot);
    if (!humans.every((m) => isDone(game.players[m]))) return;
    commitBots(game);
    const { built } = resolveRound(game, rng, botKeep);
    game.idle_rounds = !built && cardsLeft(game) === 0 ? game.idle_rounds + 1 : 0;
    if (game.final_round !== null && game.round >= game.final_round) {
      completeGame(game, "The final round is done — scoring tickets and the Longest Line.");
      return;
    }
    if (game.idle_rounds >= IDLE_ROUND_LIMIT) {
      completeGame(game, `Nothing has moved for ${IDLE_ROUND_LIMIT} rounds and the cards are gone — the game ends.`);
      return;
    }
    if (game.round >= ROUND_CAP) {
      completeGame(game, `Round ${ROUND_CAP} reached — the game ends.`);
      return;
    }
    if (game.final_round === null) {
      const low = game.seat_order.find((m) => game.players[m].trains <= FINAL_TRIGGER_TRAINS);
      if (low) {
        game.final_round = game.round + 1;
        pushEvent(game, { kind: "final_round", mark: low, text: `${low} is down to ${game.players[low].trains} train${game.players[low].trains === 1 ? "" : "s"} — round ${game.final_round} is the final round!` });
      }
    }
    nextRound(game);
  }
}

// ---------- skip vote ----------

function skippable(game, target) {
  const seat = Object.hasOwn(game.players, target) ? game.players[target] : null;
  return Boolean(seat && !seat.is_bot && !isDone(seat));
}
function skipVoters(game, target) {
  return game.seat_order.filter((m) => m !== target && !game.players[m].is_bot && Boolean(game.players[m].committed));
}
function pruneVotes(game) {
  game.skip_votes = pruneSkipVotes(game.skip_votes, (t) => (game.status === "playing" && skippable(game, t) ? skipVoters(game, t) : null));
}

function applySkip(game, mark, action) {
  const target = String(action.target || "").trim();
  if (target === mark) throw new Error("You can't vote to skip yourself.");
  if (!skippable(game, target)) throw new Error("That player can't be skipped right now.");
  const eligible = skipVoters(game, target);
  if (!eligible.includes(mark)) throw new Error("Only players who already locked in this round can vote to skip.");
  const result = castSkipVote(game.skip_votes, mark, target, eligible);
  game.skip_votes = result.votes;
  if (result.passed) {
    game.players[target].skipped = true;
    const next = { ...game.skip_votes };
    delete next[target];
    game.skip_votes = next;
    pushEvent(game, { kind: "skip", mark: target, text: `${target} was skipped this round by vote — they're back next round.` });
  }
}

// ---------- moves ----------

function applyKeep(game, mark, action) {
  const seat = game.players[mark];
  if (!seat.pending_tickets.length) throw new Error("You have no tickets waiting to be chosen.");
  const keep = [...new Set((Array.isArray(action.keep) ? action.keep : []).map(String))];
  const stray = keep.find((id) => !seat.pending_tickets.includes(id));
  if (stray) throw new Error(`Ticket ${stray} isn't one of the tickets you were offered.`);
  if (keep.length < seat.min_keep) throw new Error(`Keep at least ${seat.min_keep} ticket${seat.min_keep === 1 ? "" : "s"}.`);
  keepTickets(game, mark, keep);
}

export function makeTracklayersMove(game, mark, action) {
  normalizeTracklayersGame(game);
  if (game.status === "complete") throw new Error("The game is already over.");
  const seat = Object.hasOwn(game.players, mark) ? game.players[mark] : null;
  if (!seat) throw new Error("You are not seated in this game.");
  if (seat.is_bot) throw new Error("Bot seats play automatically.");
  const act = action && typeof action === "object" ? action : {};
  const stamped = act.round == null || act.round === "" ? NaN : Math.trunc(Number(act.round));
  if (Number.isFinite(stamped) && stamped !== game.round) {
    throw new Error(`That move was for round ${stamped} — the table is on round ${game.round}. Refresh to catch up.`);
  }
  const type = String(act.type || "").trim().toUpperCase();
  if (type === "COMMIT") {
    if (seat.committed) return; // duplicate (retry / double tap / two tabs): first commit wins, silently
    if (seat.skipped) throw new Error("You were skipped this round — you're back in next round.");
    if (seat.pending_tickets.length) throw new Error(`Choose which tickets to keep first (at least ${seat.min_keep}).`);
    seat.committed = validateCommit(game, mark, act.action);
  } else if (type === "KEEP_TICKETS") {
    applyKeep(game, mark, act);
  } else if (type === "SKIP_PLAYER") {
    applySkip(game, mark, act);
  } else {
    throw new Error("Tracklayers action must be COMMIT, KEEP_TICKETS or SKIP_PLAYER.");
  }
  pruneVotes(game);
  advance(game);
  pruneVotes(game);
}

// ---------- projections ----------

const STATIC_MAP = Object.freeze({
  id: MAP_ID,
  board: { width: BOARD.width, height: BOARD.height },
  cities: CITIES.map((c) => ({ id: c.id, name: c.name, x: c.x, y: c.y })),
  routes: ROUTES.map((r) => ({ id: r.id, a: r.a, b: r.b, len: r.len, color: r.color, twin: r.twin })),
});
const TICKETS_CATALOG = Object.freeze(Object.fromEntries(TICKETS.map((t) => [t.id, { id: t.id, a: t.a, b: t.b, points: t.points }])));

export function tracklayersGameToDict(game) {
  normalizeTracklayersGame(game);
  const complete = game.status === "complete";
  const players = {};
  game.seat_order.forEach((mark) => {
    const s = game.players[mark];
    players[mark] = {
      is_bot: s.is_bot, level: s.level, trains: s.trains, score: s.score,
      hand_count: handCount(s.hand), ticket_count: s.tickets.length,
      has_committed: Boolean(s.committed), has_pending_tickets: s.pending_tickets.length > 0, skipped: s.skipped,
      hand: { ...s.hand }, tickets: [...s.tickets], pending_tickets: [...s.pending_tickets], min_keep: s.min_keep,
      committed: s.committed ? structuredClone(s.committed) : null,
      ticket_results: complete && s.ticket_results ? s.ticket_results.map((t) => ({ ...t })) : null,
      longest: complete && Number.isInteger(s.longest) ? s.longest : null,
    };
  });
  return {
    game_id: TRACKLAYERS_GAME_ID,
    status: game.status,
    phase: game.phase,
    round: game.round,
    final_round: game.final_round,
    options: { ...game.options },
    map: structuredClone(STATIC_MAP),
    tickets_catalog: structuredClone(TICKETS_CATALOG),
    colors: [...COLORS],
    route_points: { ...ROUTE_POINTS },
    deck_count: game.deck.length,
    discard_count: game.discard.length,
    ticket_deck_count: game.ticket_deck.length,
    market: [...game.market],
    routes: { ...game.routes },
    twins_locked: twinsLocked(game),
    seat_order: [...game.seat_order],
    priority_order: [...game.priority_order],
    players,
    longest_bonus: LONGEST_BONUS,
    skip_votes: normalizeSkipVotes(game.skip_votes),
    events: game.events.map((e) => ({ ...e })),
    winner: game.winner,
    results: game.results ? game.results.map((r) => ({ ...r })) : null,
    move_count: game.move_count,
  };
}

// Per-viewer projection (receives the DICT). Hands, tickets, pending tickets
// and commits stay only on the viewer's own seat; on completion everyone's
// tickets (and ticket_results) are revealed.
export function tracklayersGameToDictForViewer(dict, viewerMark, roomStatusValue) {
  const projected = structuredClone(dict);
  const revealAll = roomStatusValue === "completed" || projected.status === "complete";
  Object.keys(projected.players || {}).forEach((mark) => {
    if (mark === viewerMark) return;
    const seat = projected.players[mark];
    seat.hand = null;
    seat.pending_tickets = null;
    seat.committed = null;
    if (!revealAll) {
      seat.tickets = null;
      seat.ticket_results = null;
    }
  });
  return projected;
}

export function tracklayersScoreByMark(game) {
  normalizeTracklayersGame(game);
  const scores = {};
  game.seat_order.forEach((mark) => { scores[mark] = game.players[mark].score; });
  return scores;
}

// ---------- normalize ----------

const isTicket = (id) => typeof id === "string" && Boolean(TICKET_BY_ID[id]);
const isRouteId = (() => { const ids = new Set(ROUTES.map((r) => r.id)); return (id) => ids.has(id); })();
const cardList = (list) => (Array.isArray(list) ? list.filter((c) => CARD_KINDS.includes(c)) : []);

// Tolerate garbage in stored state: every field falls back to a sane value.
export function normalizeTracklayersGame(game) {
  game.game_id = TRACKLAYERS_GAME_ID;
  game.status = game.status === "complete" ? "complete" : "playing";
  game.phase = "playing";
  game.round = clampInt(game.round, 1, 99999, 1);
  game.final_round = game.final_round === null || game.final_round === undefined ? null : clampInt(game.final_round, 1, 99999, null);
  game.options = normalizeTracklayersOptions(game.options);
  game.seat_order = Array.isArray(game.seat_order) ? [...new Set(game.seat_order.map(String))] : [];
  if (!game.players || typeof game.players !== "object" || Array.isArray(game.players)) game.players = {};
  const players = {};
  game.seat_order.forEach((mark) => {
    const s = game.players[mark] && typeof game.players[mark] === "object" ? game.players[mark] : {};
    const hand = emptyHand();
    if (s.hand && typeof s.hand === "object") CARD_KINDS.forEach((k) => { hand[k] = clampInt(s.hand[k], 0, 999, 0); });
    const tickets = Array.isArray(s.tickets) ? [...new Set(s.tickets.filter(isTicket))] : [];
    const pending = Array.isArray(s.pending_tickets) ? [...new Set(s.pending_tickets.filter(isTicket))] : [];
    players[mark] = {
      is_bot: Boolean(s.is_bot),
      level: clampInt(s.level, 0, 4, s.is_bot ? 2 : 0),
      hand, tickets, pending_tickets: pending,
      min_keep: Math.min(pending.length, clampInt(s.min_keep, 1, TICKETS_OFFERED, 1)),
      trains: clampInt(s.trains, 0, 99, game.options.trains),
      score: clampInt(s.score, -9999, 99999, 0),
      committed: s.committed && typeof s.committed === "object" ? s.committed : null,
      skipped: Boolean(s.skipped),
      ticket_results: Array.isArray(s.ticket_results) ? s.ticket_results : null,
      longest: Number.isInteger(s.longest) ? s.longest : null,
    };
  });
  game.players = players;
  const order = Array.isArray(game.priority_order) ? game.priority_order.filter((m) => game.seat_order.includes(m)) : [];
  game.priority_order = order.length === game.seat_order.length && new Set(order).size === order.length ? order : [...game.seat_order];
  game.deck = cardList(game.deck);
  game.discard = cardList(game.discard);
  game.market = cardList(game.market).slice(0, MARKET_SIZE);
  game.ticket_deck = Array.isArray(game.ticket_deck) ? game.ticket_deck.filter(isTicket) : [];
  const routes = {};
  if (game.routes && typeof game.routes === "object") {
    Object.keys(game.routes).forEach((id) => { if (isRouteId(id) && game.seat_order.includes(game.routes[id])) routes[id] = game.routes[id]; });
  }
  game.routes = routes;
  game.skip_votes = normalizeSkipVotes(game.skip_votes);
  game.events = Array.isArray(game.events) ? game.events.filter((e) => e && typeof e === "object" && Number.isInteger(e.seq)).slice(-EVENT_CAP) : [];
  game.event_seq = clampInt(game.event_seq, 0, 1e9, game.events.length ? game.events[game.events.length - 1].seq : 0);
  game.idle_rounds = clampInt(game.idle_rounds, 0, 999, 0);
  game.winner = game.seat_order.includes(game.winner) ? game.winner : null;
  game.results = Array.isArray(game.results) ? game.results : null;
  game.move_count = clampInt(game.move_count, 0, 999999, 0);
  return game;
}
