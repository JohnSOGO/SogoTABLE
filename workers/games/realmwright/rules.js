// Realmwright — server-authoritative rules for an ORIGINAL tile-laying game
// (the roads / cities / cloisters / fields + meeples family). Pure logic: no
// routing/auth/persistence, no DOM, no timers. The Worker calls
// setRealmwrightOptions at /api/room/start, then initRealmwrightSeats; bots
// resolve internally through the SAME validated placement path a human uses,
// with the decision policy in ./ai.js. Spec + wire contract: PLAN.md in
// src/sogotable/static/games/realmwright/.
//
// PARALLEL ROUNDS (the SogoTable twist): every round each seat holds one tile
// and places it whenever it likes. PLACE_TILE resolves IMMEDIATELY in
// server-received order (place → score completed features → return meeples),
// first come wins, a stale intent is rejected with a reason. After every
// placement any unplaced seat whose tile no longer fits anywhere is redrawn
// (tile_serial bumps). When every human has placed (or been skipped) the bots
// place in seat order, then the next round deals. The game ends after the
// round in which the bag ran dry; then end-game scoring.
//
// Features are DERIVED from the placement list by ./board.js — never stored.
// The bag order is server-secret: stripped from every projection (bag_count
// only). RNG: one seedable seam (setRealmwrightRandom) for the bag shuffle and
// bot choices.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { cleanGameId } from "../../game-catalog.js";
import { castSkipVote, normalizeSkipVotes, pruneSkipVotes } from "../skip-vote.js";
import { TILESETS, tileDefsFor } from "./tiles.js";
import {
  derive, fits, joinedRoots, legalPlacements, hasAnyPlacement, completedByPlacement, endGameScores, FEATURE_KINDS,
} from "./board.js";
import { chooseRealmwrightPlacement } from "./ai.js";

export const REALMWRIGHT_GAME_ID = GAME_IDS.realmwright;
const EVENT_CAP = 40;
const DECKS = ["standard", "quick", "big"];
export const REALMWRIGHT_DEFAULT_OPTIONS = Object.freeze({
  farmers: "on", live_tally: true, show_spots: true, meeples: 7, small_city: false, deck: "standard", expansions: [],
});

export function isRealmwrightGame(game) {
  if (!game || !game.game_id) return false;
  try { return cleanGameId(game.game_id) === REALMWRIGHT_GAME_ID; } catch { return String(game.game_id).trim() === REALMWRIGHT_GAME_ID; }
}

// Clock seam (epoch ms): bots act on a timer, so every transition reads time
// through here — tests pin it, the Worker uses the real clock.
let realmClock = () => Date.now();
export function setRealmwrightClock(fn) {
  realmClock = typeof fn === "function" ? fn : () => Date.now();
}

// Bot "thinking" time per level, from round open: BASE + 1d5 seconds (plus a
// sub-second jitter so bots never land in lockstep). MojoSOGO 2026-11-12:
// hard 5+1d5 s, intermediate 10+1d5 s; easy is slower still.
export const BOT_DELAY_BASE_S = [0, 15, 10, 5, 5];
function botDelayMs(level) {
  const base = BOT_DELAY_BASE_S[level] !== undefined ? BOT_DELAY_BASE_S[level] : 10;
  return (base + 1 + Math.floor(realmRandom() * 5)) * 1000 + Math.floor(realmRandom() * 900);
}

let realmRandom = Math.random;
export function setRealmwrightRandom(fn) {
  realmRandom = typeof fn === "function" ? fn : Math.random;
}

// Bot strength tier (Sprout 1 / Buddy 2 / Cipher 3 / Overlord 4); non-bots 0.
function realmBotLevel(seat) {
  if (!seat || (seat.kind !== "bot" && seat.is_bot !== true)) return 0;
  const level = Number(seat.bot_level !== undefined ? seat.bot_level : seat.level);
  return Number.isInteger(level) && level >= 1 && level <= 4 ? level : 2;
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function toBool(value, fallback) {
  if (value === true || value === false) return value;
  if (value === "true" || value === "on" || value === 1 || value === "1") return true;
  if (value === "false" || value === "off" || value === 0 || value === "0") return false;
  return fallback;
}

// Options normalization tolerates any garbage: each key falls back to its
// default on its own.
export function normalizeRealmwrightOptions(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const d = REALMWRIGHT_DEFAULT_OPTIONS;
  const farmersBool = toBool(o.farmers, null);
  return {
    farmers: farmersBool === null ? d.farmers : farmersBool ? "on" : "off",
    live_tally: toBool(o.live_tally, d.live_tally),
    show_spots: toBool(o.show_spots, d.show_spots),
    meeples: clampInt(o.meeples, 5, 10, d.meeples),
    small_city: toBool(o.small_city, d.small_city),
    deck: DECKS.includes(o.deck) ? o.deck : d.deck,
    expansions: Array.isArray(o.expansions)
      ? [...new Set(o.expansions.map(String))].filter((id) => id !== "base" && TILESETS[id]).slice(0, 8)
      : [],
  };
}

// Host options from /api/room/start (payload.realm_options). Called BEFORE
// initRealmwrightSeats (the deck is read there). A payload without a
// realm_options object leaves existing options untouched (the reset path
// carries options first, then re-applies a payload without them).
export function setRealmwrightOptions(game, payload) {
  const raw = payload && payload.realm_options;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) game.options = normalizeRealmwrightOptions(raw);
  else game.options = normalizeRealmwrightOptions(game.options);
  return game.options;
}

// Every TileDef in play for these options (cached; defs are immutable).
const defsCache = new Map();
function defsFor(options) {
  const sets = ["base", ...(options.expansions || [])];
  const key = sets.join("|");
  if (!defsCache.has(key)) defsCache.set(key, tileDefsFor(sets));
  return defsCache.get(key);
}
const plainDefsCache = new Map();
function plainDefs(options) {
  const key = ["base", ...(options.expansions || [])].join("|");
  if (!plainDefsCache.has(key)) plainDefsCache.set(key, JSON.parse(JSON.stringify(defsFor(options))));
  return plainDefsCache.get(key);
}

export function newRealmwrightGame() {
  return {
    game_id: REALMWRIGHT_GAME_ID,
    status: "playing",
    round: 0,
    move_count: 0,
    options: normalizeRealmwrightOptions(null),
    seat_order: [],
    players: {},
    board: [],
    bag: [], // server-secret; NEVER leaves via toDict
    events: [],
    skip_votes: {},
    winner: null,
    results: null,
  };
}

function deckCount(count, deck) {
  if (deck === "big") return count * 2;
  if (deck === "quick") return Math.max(1, Math.round(count / 2));
  return count;
}

function buildBag(options) {
  const bag = [];
  let startId = null;
  for (const setId of ["base", ...options.expansions]) {
    for (const t of TILESETS[setId].tiles) {
      if (t.start && !startId) startId = t.id;
      const n = deckCount(t.count, options.deck);
      for (let i = 0; i < n; i += 1) bag.push(t.id);
    }
  }
  if (startId) bag.splice(bag.indexOf(startId), 1); // the start tile is on the table
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(realmRandom() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return { bag, startId };
}

function blankBreakdown() {
  return { city: 0, road: 0, cloister: 0, field: 0 };
}

export function initRealmwrightSeats(game, seats) {
  game.options = normalizeRealmwrightOptions(game.options);
  game.seat_order = [];
  game.players = {};
  (Array.isArray(seats) ? seats : []).forEach((seat) => {
    const mark = String(seat && seat.mark || "").trim();
    if (!mark || game.players[mark]) return;
    game.seat_order.push(mark);
    game.players[mark] = {
      is_bot: Boolean(seat && seat.kind === "bot"),
      level: realmBotLevel(seat),
      score: 0,
      meeples_left: game.options.meeples,
      breakdown: blankBreakdown(),
      tile: null,
      tile_serial: 0,
      placed: false,
      skipped: false,
      act_at: 0, // bots only: epoch ms when this bot places this round
    };
  });
  if (!game.seat_order.length) throw new Error("Realmwright needs at least one player — invite players or bots to fill the table.");
  const { bag, startId } = buildBag(game.options);
  game.game_id = REALMWRIGHT_GAME_ID;
  game.status = "playing";
  game.round = 0;
  game.move_count = 0;
  game.bag = bag;
  game.board = [{ x: 0, y: 0, t: startId, r: 0, by: null, round: 0, meeples: [] }];
  game.events = [];
  game.skip_votes = {};
  game.winner = null;
  game.results = null;
  const now = realmClock();
  dealRound(game, now);
  advance(game, now); // an all-bot table runs straight through
}

// ---------- events ----------

function pushEvent(game, event) {
  const last = game.events[game.events.length - 1];
  game.events.push({ seq: last ? last.seq + 1 : 1, round: game.round, ...event });
  if (game.events.length > EVENT_CAP) game.events.splice(0, game.events.length - EVENT_CAP);
}

// ---------- lifecycle ----------

const isDone = (seat) => seat.placed || seat.skipped || !seat.tile;

// Draw the next tile that fits somewhere (dead tiles are discarded).
function drawTile(game, derived) {
  const defs = defsFor(game.options);
  while (game.bag.length) {
    const t = game.bag.shift();
    if (hasAnyPlacement(game.board, t, defs, derived)) return t;
  }
  return null;
}

function dealRound(game, now) {
  game.round += 1;
  game.round_opened_at = now;
  const humansSeated = game.seat_order.some((m) => !game.players[m].is_bot);
  game.skip_votes = {};
  const derived = derive(game.board, defsFor(game.options));
  let dealt = 0;
  for (const mark of game.seat_order) {
    const seat = game.players[mark];
    seat.placed = false;
    seat.skipped = false;
    seat.tile = drawTile(game, derived);
    if (seat.tile) { seat.tile_serial += 1; dealt += 1; }
    // With humans watching, a bot "thinks" for a while; an all-bot table
    // (nobody to watch) plays straight through.
    seat.act_at = seat.is_bot && humansSeated ? now + botDelayMs(seat.level) : 0;
  }
  if (!dealt) { completeGame(game); return; }
  pushEvent(game, { type: "round" });
}

// Bots whose think-time has passed place now, earliest first (so a bot due
// before a human's commit lands before it). Returns how many placed.
function releaseDueBots(game, now) {
  const due = game.seat_order
    .filter((m) => { const s = game.players[m]; return s.is_bot && !isDone(s) && s.act_at <= now; })
    .sort((a, b) => game.players[a].act_at - game.players[b].act_at || game.seat_order.indexOf(a) - game.seat_order.indexOf(b));
  due.forEach((mark) => { if (!isDone(game.players[mark])) placeBot(game, mark); });
  return due.length;
}

// The barrier: due bots place; once every seat is done the next round deals
// (or the game ends). Bots still thinking hold the round open — a client
// sends BOT_TICK when the next act_at passes. Loops so an all-bot table
// (act_at 0) finishes in one call.
function advance(game, now) {
  let guard = 0;
  while (game.status === "playing" && guard < 10000) {
    guard += 1;
    releaseDueBots(game, now);
    if (!game.seat_order.every((m) => isDone(game.players[m]))) return;
    if (!game.bag.length) completeGame(game);
    else dealRound(game, now);
  }
}

function placeBot(game, mark) {
  const seat = game.players[mark];
  const defs = defsFor(game.options);
  const legal = legalPlacements(game.board, seat.tile, defs, game.options, seat.meeples_left);
  if (!legal.length) { seat.tile = null; return; } // defensive: redraw already guarantees a spot
  let choice;
  try { choice = chooseRealmwrightPlacement(game, mark, legal, realmRandom); } catch { choice = null; }
  try {
    applyPlacement(game, mark, choice || legal[0]);
  } catch {
    applyPlacement(game, mark, { ...legal[0], meeple: null });
  }
}

function credit(game, marks, kind, points) {
  marks.forEach((mark) => {
    const seat = game.players[mark];
    if (!seat) return;
    seat.score += points;
    seat.breakdown[kind] = (seat.breakdown[kind] || 0) + points;
  });
}

// Validate + apply one placement for `mark` (humans and bots share this).
function applyPlacement(game, mark, move) {
  const seat = game.players[mark];
  const defs = defsFor(game.options);
  const def = defs[seat.tile];
  if (!def) throw new Error("You have no tile this round.");
  const x = Number(move && move.x);
  const y = Number(move && move.y);
  const r = Number(move && move.r);
  if (!Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x) > 999 || Math.abs(y) > 999) throw new Error("Pick a spot on the board.");
  if (!Number.isInteger(r) || r < 0 || r > 3) throw new Error("Rotation must be 0–3.");
  const derived = derive(game.board, defs);
  if (derived.index.has(x + "," + y)) throw new Error("Someone just built there — pick another spot.");
  if (!fits(game.board, derived.index, defs, def, x, y, r)) throw new Error("That spot no longer fits.");

  const rawMeeple = move.meeple;
  let meeple = null;
  if (rawMeeple !== null && rawMeeple !== undefined && rawMeeple !== "") {
    // Only an integer (or its digit string) names a feature: booleans, arrays
    // and objects must not coerce to feature 0/1 via Number().
    meeple = typeof rawMeeple === "number" || (typeof rawMeeple === "string" && /^\d{1,3}$/.test(rawMeeple)) ? Number(rawMeeple) : NaN;
    const f = Number.isInteger(meeple) ? def.features[meeple] : null;
    if (!f) throw new Error(`That tile has no feature #${rawMeeple}.`);
    if (seat.meeples_left <= 0) throw new Error("You have no meeples left — place without one.");
    const kind = FEATURE_KINDS[f.kind];
    if (!kind || !kind.claimable(game.options)) {
      throw new Error(f.kind === "field" ? "Farmers are off this game — fields can't be claimed." : `A ${f.kind} can't be claimed.`);
    }
    const taken = joinedRoots(game.board, derived, defs, def, x, y, r, meeple)
      .some((root) => derived.features[root] && derived.features[root].meeples.length);
    if (taken) throw new Error(`That ${f.kind} was just claimed — place without a meeple or pick another feature.`);
  }

  const placement = { x, y, t: seat.tile, r, by: mark, round: game.round, meeples: meeple === null ? [] : [{ f: meeple, mark }] };
  game.board.push(placement);
  if (meeple !== null) seat.meeples_left -= 1;
  seat.placed = true;
  seat.tile = null;
  game.move_count += 1;
  const placeEvent = { type: "place", mark, x, y };
  if (meeple !== null) placeEvent.meeple = def.features[meeple].kind;
  pushEvent(game, placeEvent);

  // Score whatever this tile closed; every meeple on it goes home.
  const after = derive(game.board, defs);
  for (const done of completedByPlacement(game.board, after, defs, game.board.length - 1, game.options)) {
    credit(game, done.marks, done.feature.kind, done.points);
    const scoredMeeples = meepleSpots(game, done.feature);
    done.feature.meeples.forEach((m) => {
      const holder = game.board[m.at];
      holder.meeples = holder.meeples.filter((mm) => !(mm.f === m.f && mm.mark === m.mark));
      if (game.players[m.mark]) game.players[m.mark].meeples_left += 1;
    });
    pushEvent(game, { type: "score", kind: done.feature.kind, points: done.points, marks: done.marks, cells: done.feature.cells, meeples: scoredMeeples });
  }
  knockOnRedraw(game, after);
}

// Where a feature's meeples stood (for the client's jump-for-joy), captured
// before they go home.
function meepleSpots(game, feature) {
  return feature.meeples.map((m) => {
    const holder = game.board[m.at];
    return { x: holder.x, y: holder.y, f: m.f, mark: m.mark };
  });
}

// Any unplaced seat whose tile no longer fits anywhere gets a fresh one.
function knockOnRedraw(game, derived) {
  const defs = defsFor(game.options);
  for (const mark of game.seat_order) {
    const seat = game.players[mark];
    if (isDone(seat) || hasAnyPlacement(game.board, seat.tile, defs, derived)) continue;
    seat.tile = drawTile(game, derived);
    seat.tile_serial += 1;
    pushEvent(game, { type: "redraw", mark });
  }
}

function skipSeat(game, mark) {
  const seat = game.players[mark];
  if (seat.tile) { game.bag.push(seat.tile); seat.tile_serial += 1; }
  seat.tile = null;
  seat.skipped = true;
  pushEvent(game, { type: "skip", mark });
}

function completeGame(game) {
  const defs = defsFor(game.options);
  const derived = derive(game.board, defs);
  for (const s of endGameScores(derived, game.options)) {
    if (s.points > 0) {
      credit(game, s.marks, s.feature.kind, s.points);
      pushEvent(game, { type: "score", kind: s.feature.kind, points: s.points, marks: s.marks, cells: s.feature.cells, meeples: meepleSpots(game, s.feature), final: true });
    }
  }
  game.seat_order.forEach((m) => { game.players[m].tile = null; });
  game.results = game.seat_order.map((mark) => ({ mark, score: game.players[mark].score, breakdown: { ...game.players[mark].breakdown } }));
  game.results.sort((a, b) => b.score - a.score || game.seat_order.indexOf(a.mark) - game.seat_order.indexOf(b.mark));
  game.winner = game.results.length ? game.results[0].mark : null;
  game.status = "complete";
  game.skip_votes = {};
  pushEvent(game, { type: "end" });
}

// ---------- skip vote ----------

function skippable(game, target) {
  const seat = Object.hasOwn(game.players, target) ? game.players[target] : null;
  return Boolean(seat && !seat.is_bot && !isDone(seat));
}
function skipVoters(game, target) {
  return game.seat_order.filter((m) => m !== target && !game.players[m].is_bot && game.players[m].placed);
}
function pruneVotes(game) {
  game.skip_votes = pruneSkipVotes(game.skip_votes, (t) => (game.status === "playing" && skippable(game, t) ? skipVoters(game, t) : null));
}

function applySkip(game, mark, action) {
  if (Number(action.round) !== game.round) throw new Error(`Stale skip vote: that was for round ${action.round}; the table is on round ${game.round}.`);
  const target = String(action.target || "");
  if (target === mark) throw new Error("You can't vote to skip yourself.");
  if (!skippable(game, target)) throw new Error("That player can't be skipped right now.");
  const eligible = skipVoters(game, target);
  if (!eligible.includes(mark)) throw new Error("Only players who already placed this round can vote to skip.");
  const result = castSkipVote(game.skip_votes, mark, target, eligible);
  game.skip_votes = result.votes;
  if (result.passed) {
    skipSeat(game, target);
    const next = { ...game.skip_votes };
    delete next[target];
    game.skip_votes = next;
  }
}

// ---------- transitions (top-level) ----------

export function makeRealmwrightMove(game, mark, action) {
  normalizeRealmwrightGame(game);
  if (game.status === "complete") throw new Error("Game is complete.");
  const seat = Object.hasOwn(game.players, mark) ? game.players[mark] : null;
  if (!seat) throw new Error("You are not seated in this game.");
  if (seat.is_bot) throw new Error("Bot seats play automatically.");
  const type = String(action && action.type || "").trim();
  const now = realmClock();
  if (type === "BOT_TICK") {
    // Any seated human's client nudges the table when a bot's think-time
    // passes. Nothing due → reject quietly (no write, no broadcast).
    if (!releaseDueBots(game, now)) throw new Error("No bot is ready yet.");
    pruneVotes(game);
    advance(game, now);
    return;
  }
  // Bots whose time already came go first, so server order stays fair.
  releaseDueBots(game, now);
  if (type === "PLACE_TILE") {
    if (Number(action.round) !== game.round) throw new Error(`Stale move: that was for round ${action.round}; the table is on round ${game.round}.`);
    if (seat.placed) throw new Error("You already placed your tile this round.");
    if (seat.skipped) throw new Error("You were skipped this round — you're back in next round.");
    if (!seat.tile) throw new Error("You have no tile this round.");
    if (Number(action.serial) !== seat.tile_serial) throw new Error("Stale tile: your tile was redrawn — pick a spot for the new one.");
    applyPlacement(game, mark, action);
  } else if (type === "SKIP_PLAYER") {
    applySkip(game, mark, action);
  } else {
    throw new Error("Realmwright action must be PLACE_TILE, SKIP_PLAYER or BOT_TICK.");
  }
  pruneVotes(game);
  advance(game, now);
}

// ---------- projections ----------

function projectedFor(game, derived) {
  const out = {};
  game.seat_order.forEach((m) => {
    out[m] = { ...blankBreakdown(), ...game.players[m].breakdown };
  });
  if (game.status === "playing") {
    for (const s of endGameScores(derived, game.options)) {
      s.marks.forEach((m) => { if (out[m]) out[m][s.feature.kind] = (out[m][s.feature.kind] || 0) + s.points; });
    }
  }
  return out;
}

export function realmwrightGameToDict(game) {
  normalizeRealmwrightGame(game);
  const defs = defsFor(game.options);
  const derived = derive(game.board, defs);
  const projected = projectedFor(game, derived);
  const players = game.seat_order.map((mark) => {
    const seat = game.players[mark];
    const pb = projected[mark];
    return {
      mark,
      is_bot: seat.is_bot,
      score: seat.score,
      projected: Object.values(pb).reduce((a, b) => a + b, 0),
      breakdown: { ...blankBreakdown(), ...seat.breakdown },
      projected_breakdown: pb,
      meeples_left: seat.meeples_left,
      meeples_total: game.options.meeples,
      tile: seat.tile,
      tile_serial: seat.tile_serial,
      placed: seat.placed,
      skipped: seat.skipped,
      act_at: seat.is_bot && !isDone(seat) ? seat.act_at : 0,
    };
  });
  const legal = {};
  if (game.status === "playing") {
    game.seat_order.forEach((mark) => {
      const seat = game.players[mark];
      if (!isDone(seat)) legal[mark] = legalPlacements(game.board, seat.tile, defs, game.options, seat.meeples_left, derived);
    });
  }
  return {
    game_id: REALMWRIGHT_GAME_ID,
    status: game.status,
    round: game.round,
    round_opened_at: game.round_opened_at,
    server_now: realmClock(), // lets clients map bot act_at onto their own clock
    move_count: game.move_count,
    options: { ...game.options, expansions: [...game.options.expansions] },
    seat_order: [...game.seat_order],
    winner: game.winner,
    bag_count: game.bag.length, // the bag ORDER never leaves the Worker
    tile_defs: plainDefs(game.options),
    board: game.board.map((p) => ({ ...p, meeples: p.meeples.map((m) => ({ ...m })) })),
    players,
    legal,
    events: game.events.map((e) => ({ ...e })),
    skip_votes: normalizeSkipVotes(game.skip_votes),
    results: game.results ? game.results.map((r) => ({ ...r, breakdown: { ...r.breakdown } })) : null,
  };
}

// Per-viewer projection: receives the DICT (players as an array). Nothing is
// secret beyond the bag (already stripped); this only trims `legal` to the
// viewer's own seat to save bytes.
export function realmwrightGameToDictForViewer(dict, viewerMark /* , roomStatus */) {
  const projected = structuredClone(dict);
  const legal = projected.legal || {};
  projected.legal = viewerMark && legal[viewerMark] ? { [viewerMark]: legal[viewerMark] } : {};
  return projected;
}

export function realmwrightScoreByMark(game) {
  normalizeRealmwrightGame(game);
  const scores = {};
  game.seat_order.forEach((mark) => { scores[mark] = game.players[mark].score; });
  return scores;
}

// Tolerate garbage in stored state: every field falls back to a sane value.
function normalizeRealmwrightGame(game) {
  game.game_id = REALMWRIGHT_GAME_ID;
  game.status = game.status === "complete" ? "complete" : "playing";
  game.round = clampInt(game.round, 0, 99999, 0);
  game.move_count = clampInt(game.move_count, 0, 999999, 0);
  game.options = normalizeRealmwrightOptions(game.options);
  const defs = defsFor(game.options);
  game.seat_order = Array.isArray(game.seat_order) ? [...new Set(game.seat_order.map(String))] : [];
  if (!game.players || typeof game.players !== "object") game.players = {};
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark] || {};
    const breakdown = blankBreakdown();
    if (seat.breakdown && typeof seat.breakdown === "object") {
      Object.keys(seat.breakdown).forEach((k) => { breakdown[k] = clampInt(seat.breakdown[k], 0, 99999, 0); });
    }
    game.players[mark] = {
      is_bot: Boolean(seat.is_bot),
      level: clampInt(seat.level, 0, 4, seat.is_bot ? 2 : 0),
      score: clampInt(seat.score, 0, 99999, 0),
      meeples_left: clampInt(seat.meeples_left, 0, 10, game.options.meeples),
      breakdown,
      tile: typeof seat.tile === "string" && defs[seat.tile] ? seat.tile : null,
      tile_serial: clampInt(seat.tile_serial, 0, 999999, 0),
      placed: Boolean(seat.placed),
      skipped: Boolean(seat.skipped),
      act_at: Number.isFinite(Number(seat.act_at)) ? Math.max(0, Number(seat.act_at)) : 0,
    };
  });
  game.round_opened_at = Number.isFinite(Number(game.round_opened_at)) ? Number(game.round_opened_at) : 0;
  game.board = Array.isArray(game.board) ? game.board.filter((p) => p && defs[p.t]
    && Number.isInteger(p.x) && Number.isInteger(p.y) && Number.isInteger(p.r) && p.r >= 0 && p.r <= 3) : [];
  game.board.forEach((p) => {
    p.by = game.seat_order.includes(p.by) ? p.by : null;
    p.round = clampInt(p.round, 0, 99999, 0);
    p.meeples = Array.isArray(p.meeples)
      ? p.meeples.filter((m) => m && Number.isInteger(m.f) && defs[p.t].features[m.f] && game.seat_order.includes(m.mark)).map((m) => ({ f: m.f, mark: m.mark }))
      : [];
  });
  game.bag = Array.isArray(game.bag) ? game.bag.filter((t) => typeof t === "string" && defs[t]) : [];
  game.events = Array.isArray(game.events) ? game.events.filter((e) => e && typeof e === "object" && Number.isInteger(e.seq)).slice(-EVENT_CAP) : [];
  game.skip_votes = normalizeSkipVotes(game.skip_votes);
  game.winner = game.seat_order.includes(game.winner) ? game.winner : null;
  game.results = Array.isArray(game.results) ? game.results : null;
}
