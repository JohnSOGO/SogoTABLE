// Reefkeepers — server-authoritative rules for an ORIGINAL domino-drafting
// reef builder. Pure logic: no routing/auth/persistence, no DOM, no timers.
// The Worker calls setReefkeepersOptions at /api/room/start, then
// initReefkeepersSeats. Wire contract: docs/game-reefkeepers.md.
//
// SIMULTANEOUS SUBMIT: each round every seat COMMITs { place, picks } — where
// its pending tile goes, and a ranked wish list from the face-up offer. The
// barrier closes when every human has committed (or been skipped); bots and
// skipped seats then commit through the SAME validation path, and the round
// resolves together:
//   1. every seat places (or discards) its pending tile on its own reef;
//   2. the draft resolves in CLAIM ORDER (lowest tile claimed last round
//      chooses first; round 1 is a seeded shuffle): each seat gets its highest
//      ranked free pick, else the autopilot's best free tile ("bumped");
//   3. next round's claim order = seats by the n of the tile they just took.
// Arrival order never matters. Leftover offer tiles are discarded. The deck
// order is server-secret (deck_count only). One RNG seam: setReefkeepersRandom.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { cleanGameId } from "../../game-catalog.js";
import { castSkipVote, normalizeSkipVotes, pruneSkipVotes } from "../skip-vote.js";
import { HABITATS, DECK_SIZE, deckIds, tileById, isTileId, compareTileIds } from "./tiles.js";
import { legalSpots, isLegalSpot, halvesFor, scoreReef } from "./board.js";
import { chooseReefMove, rankTiles } from "./ai.js";

export const REEFKEEPERS_GAME_ID = GAME_IDS.reefkeepers;
export const MIN_SEATS = 1;
export const MAX_SEATS = 8;
const EVENT_CAP = 40;
const DRAFTS = { 5: 12, 7: 24 };
export const REEFKEEPERS_DEFAULT_OPTIONS = Object.freeze({
  size: 5, heart_bonus: true, full_bonus: true, show_spots: true, live_score: true, hints: false,
});
const OPTION_KEYS = Object.keys(REEFKEEPERS_DEFAULT_OPTIONS);

let reefRandom = Math.random;
export function setReefkeepersRandom(fn) {
  reefRandom = typeof fn === "function" ? fn : Math.random;
}

export function isReefkeepersGame(game) {
  if (!game || !game.game_id) return false;
  try { return cleanGameId(game.game_id) === REEFKEEPERS_GAME_ID; } catch { return String(game.game_id).trim() === REEFKEEPERS_GAME_ID; }
}

// ---------- options ----------

function toBool(value, fallback) {
  if (value === true || value === false) return value;
  if (value === "true" || value === "on" || value === 1 || value === "1") return true;
  if (value === "false" || value === "off" || value === 0 || value === "0") return false;
  return fallback;
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function normalizeReefkeepersOptions(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const d = REEFKEEPERS_DEFAULT_OPTIONS;
  return {
    size: Number(o.size) === 7 || o.size === "7" ? 7 : 5,
    heart_bonus: toBool(o.heart_bonus, d.heart_bonus),
    full_bonus: toBool(o.full_bonus, d.full_bonus),
    show_spots: toBool(o.show_spots, d.show_spots),
    live_score: toBool(o.live_score, d.live_score),
    hints: toBool(o.hints, d.hints),
  };
}

// Host options from /api/room/start: `reef_options` (object), else any flat
// option keys on the payload merged over the current options. A payload with
// neither leaves existing options untouched (the reset path carries options
// first, then re-applies a payload without them).
export function setReefkeepersOptions(game, payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const nested = p.reef_options;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    game.options = normalizeReefkeepersOptions(nested);
  } else {
    const flat = {};
    OPTION_KEYS.forEach((k) => { if (Object.hasOwn(p, k)) flat[k] = p[k]; });
    game.options = normalizeReefkeepersOptions({ ...normalizeReefkeepersOptions(game.options), ...flat });
  }
  return game.options;
}

// ---------- lifecycle ----------

export function newReefkeepersGame() {
  return {
    game_id: REEFKEEPERS_GAME_ID,
    status: "playing",
    phase: "playing",
    round: 1,
    rounds_total: DRAFTS[5] + 1,
    options: normalizeReefkeepersOptions(null),
    seat_order: [],
    claim_order: [],
    offer: [],
    line_size: 3,
    deck: [], // server-secret; NEVER leaves via toDict
    players: {},
    skip_votes: {},
    events: [],
    event_seq: 0,
    winner: null,
    results: null,
    move_count: 0,
  };
}

function botLevel(seat) {
  if (!seat || (seat.kind !== "bot" && seat.is_bot !== true)) return 0;
  const level = Number(seat.bot_level !== undefined ? seat.bot_level : seat.level);
  return Number.isInteger(level) && level >= 1 && level <= 4 ? level : 2;
}

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(reefRandom() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const draftsFor = (size) => DRAFTS[size] || DRAFTS[5];

export function initReefkeepersSeats(game, seats) {
  game.options = normalizeReefkeepersOptions(game.options);
  const marks = [];
  const players = {};
  (Array.isArray(seats) ? seats : []).forEach((seat) => {
    const mark = String(seat && seat.mark || "").trim();
    if (!mark || players[mark]) return;
    marks.push(mark);
    const name = seat && typeof seat.name === "string" ? seat.name.slice(0, 40) : "";
    players[mark] = {
      is_bot: Boolean(seat && (seat.kind === "bot" || seat.is_bot === true)),
      level: botLevel(seat),
      name,
      cells: [],
      pending: null,
      committed: null,
      skipped: false,
      discards: 0,
    };
  });
  if (marks.length < MIN_SEATS) throw new Error("Reefkeepers needs at least one reefkeeper — invite players or bots to fill the table.");
  if (marks.length > MAX_SEATS) throw new Error(`Reefkeepers seats at most ${MAX_SEATS} reefkeepers — remove ${marks.length - MAX_SEATS} to start.`);
  const drafts = draftsFor(game.options.size);
  const line = Math.max(3, marks.length);
  const need = line * drafts;
  Object.assign(game, {
    game_id: REEFKEEPERS_GAME_ID,
    status: "playing",
    phase: "playing",
    round: 1,
    rounds_total: drafts + 1,
    seat_order: marks,
    players,
    line_size: line,
    deck: shuffle(deckIds(Math.ceil(need / DECK_SIZE))).slice(0, need),
    claim_order: shuffle(marks),
    offer: [],
    skip_votes: {},
    events: [],
    event_seq: 0,
    winner: null,
    results: null,
    move_count: 0,
  });
  dealOffer(game);
  pushEvent(game, { type: "round", claim_order: [...game.claim_order] });
  maybeResolve(game); // an all-bot table runs straight through
}

function pushEvent(game, event) {
  game.event_seq += 1;
  game.events.push({ seq: game.event_seq, round: game.round, ...event });
  if (game.events.length > EVENT_CAP) game.events.splice(0, game.events.length - EVENT_CAP);
}

function dealOffer(game) {
  game.offer = game.round <= draftsFor(game.options.size)
    ? game.deck.splice(0, game.line_size).sort(compareTileIds)
    : [];
}

// ---------- commits ----------

const tiles = (ids) => ids.map(tileById).filter(Boolean);

function viewFor(game, mark) {
  const seat = game.players[mark];
  return {
    cells: seat.cells,
    pending: tileById(seat.pending),
    offer: tiles(game.offer),
    size: game.options.size,
    options: game.options,
    progress: (game.round - 1) / Math.max(1, game.rounds_total - 1),
  };
}

// Normalize + validate one COMMIT body for `mark`. Humans, bots and the
// autopilot all go through here. Returns plain { place, picks }.
function validateCommit(game, mark, action) {
  const seat = game.players[mark];
  const pending = tileById(seat.pending);
  const raw = action ? action.place : null;
  let place = null;
  if (pending) {
    const legal = legalSpots(seat.cells, pending, game.options.size);
    if (legal.length) {
      if (!raw || typeof raw !== "object") throw new Error("Place your tile on your reef first.");
      place = { x: Number(raw.x), y: Number(raw.y), rot: Number(raw.rot) };
      if (!isLegalSpot(seat.cells, pending, game.options.size, place)) {
        throw new Error("That tile can't go there — it must touch your Grotto or a matching habitat and keep your reef inside the square.");
      }
    } else if (raw !== null && raw !== undefined) {
      throw new Error("Your tile can't fit anywhere this round — send no placement and it drifts away.");
    }
  } else if (raw !== null && raw !== undefined) {
    throw new Error("You have no tile to place this round.");
  }
  const rawPicks = action && action.picks;
  if (rawPicks !== undefined && rawPicks !== null && !Array.isArray(rawPicks)) throw new Error("Picks must be a list of tile ids.");
  const picks = (rawPicks || []).map(String);
  if (game.offer.length) {
    if (picks.length < 1 || picks.length > 3) throw new Error("Rank 1 to 3 tiles from the row.");
    if (new Set(picks).size !== picks.length) throw new Error("Each pick must be a different tile.");
    const bad = picks.find((id) => !game.offer.includes(id));
    if (bad) throw new Error(`Tile ${bad} isn't in this round's row.`);
  } else if (picks.length) {
    throw new Error("There is no row to draft from this round.");
  }
  return { place, picks };
}

// Bot / autopilot commit, through validateCommit; a policy bug falls back to
// the plainest legal commit rather than stalling the table.
function autoCommit(game, mark, level) {
  const view = viewFor(game, mark);
  let choice;
  try { choice = chooseReefMove(view, level, reefRandom); } catch { choice = null; }
  try {
    return validateCommit(game, mark, choice);
  } catch {
    const spots = legalSpots(view.cells, view.pending, view.size);
    return validateCommit(game, mark, { place: spots[0] || null, picks: game.offer.slice(0, 1) });
  }
}

// ---------- barrier + resolution ----------

const isDone = (seat) => Boolean(seat.committed || seat.skipped);

function maybeResolve(game) {
  let guard = 0;
  while (game.status === "playing" && guard < 200) {
    guard += 1;
    const humans = game.seat_order.filter((m) => !game.players[m].is_bot);
    if (humans.length && !humans.every((m) => isDone(game.players[m]))) return;
    resolveRound(game);
  }
}

function resolveRound(game) {
  // Bots and skipped seats commit last, through the human validation path.
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    if (seat.committed) return;
    seat.committed = autoCommit(game, mark, seat.is_bot && !seat.skipped ? seat.level : 2);
  });
  // 1. placements (each reef is independent).
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    if (!seat.pending) return;
    const tile = tileById(seat.pending);
    const place = seat.committed.place;
    if (place) {
      seat.cells.push(...halvesFor(tile, place));
      pushEvent(game, { type: "placed", mark, tile: tile.id, x: place.x, y: place.y, rot: place.rot });
    } else {
      seat.discards += 1;
      pushEvent(game, { type: "discarded", mark, tile: tile.id });
    }
    seat.pending = null;
  });
  // 2. the draft, in claim order.
  if (game.offer.length) {
    const free = new Set(game.offer);
    const takenBy = {};
    game.claim_order.forEach((mark) => {
      const seat = game.players[mark];
      const wanted = seat.committed.picks;
      const choice = wanted.findIndex((id) => free.has(id));
      let got;
      if (choice >= 0) {
        got = wanted[choice];
        pushEvent(game, { type: "picked", mark, tile: got, choice: choice + 1 });
      } else {
        got = rankTiles(seat.cells, tiles([...free].sort(compareTileIds)), game.options.size, game.options, 2)[0];
        const by = [...new Set(wanted.map((id) => takenBy[id]).filter(Boolean))];
        pushEvent(game, { type: "bumped", mark, tile: got, wanted: [...wanted], taken_by: by });
      }
      free.delete(got);
      takenBy[got] = mark;
      seat.pending = got;
    });
    game.claim_order = [...game.seat_order].sort((a, b) => compareTileIds(game.players[a].pending, game.players[b].pending));
  }
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    seat.committed = null;
    seat.skipped = false;
  });
  game.skip_votes = {};
  game.round += 1;
  if (game.round > game.rounds_total) {
    completeGame(game);
    return;
  }
  dealOffer(game);
  pushEvent(game, { type: "round", claim_order: [...game.claim_order] });
}

function scoreFor(game, mark) {
  return scoreReef(game.players[mark].cells, game.options.size, game.options);
}

// Ranking: total, then largest region, then total pearls; full ties share a
// rank. winner = the first result (seat order breaks a full tie at the top).
function completeGame(game) {
  game.round = game.rounds_total;
  game.offer = [];
  const rows = game.seat_order.map((mark, i) => {
    const s = scoreFor(game, mark);
    return { mark, total: s.total, largest: s.largest, pearls: s.pearls, i };
  });
  const better = (a, b) => b.total - a.total || b.largest - a.largest || b.pearls - a.pearls;
  rows.sort((a, b) => better(a, b) || a.i - b.i);
  game.results = rows.map((r) => ({
    mark: r.mark, total: r.total, largest: r.largest, pearls: r.pearls,
    rank: 1 + rows.filter((o) => better(r, o) > 0).length,
  }));
  game.winner = game.results.length ? game.results[0].mark : null;
  game.status = "complete";
  game.skip_votes = {};
  game.seat_order.forEach((m) => { game.players[m].pending = null; game.players[m].committed = null; });
  pushEvent(game, { type: "final", winner: game.winner, results: game.results.map((r) => ({ ...r })) });
}

// ---------- skip vote ----------

function skippable(game, target) {
  const seat = Object.hasOwn(game.players, target) ? game.players[target] : null;
  return Boolean(game.status === "playing" && seat && !seat.is_bot && !isDone(seat));
}
function skipVoters(game, target) {
  return game.seat_order.filter((m) => m !== target && !game.players[m].is_bot && game.players[m].committed);
}

function applySkip(game, mark, action) {
  const target = String(action.target || "");
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
    pushEvent(game, { type: "skipped", mark: target });
  }
}

// ---------- transitions (top-level) ----------

export function makeReefkeepersMove(game, mark, action) {
  normalizeReefkeepersGame(game);
  if (game.status === "complete") throw new Error("The game is already over.");
  const seat = Object.hasOwn(game.players, mark) ? game.players[mark] : null;
  if (!seat) throw new Error("You are not seated in this game.");
  if (seat.is_bot) throw new Error("Bot seats play automatically.");
  const type = String(action && action.type || "").trim();
  const hasStamp = action && action.round !== undefined && action.round !== null;
  const stamped = hasStamp ? Math.trunc(Number(action.round)) : NaN;
  if ((type === "COMMIT" || hasStamp) && stamped !== game.round) {
    throw new Error(`That move was for round ${hasStamp ? action.round : "?"} — the table is on round ${game.round}. Refresh to catch up.`);
  }
  if (type === "COMMIT") {
    if (seat.skipped) throw new Error("You were skipped this round — you're back in next round.");
    if (seat.committed) return; // duplicate = client retry → idempotent, first commit wins
    seat.committed = validateCommit(game, mark, action);
    game.move_count += 1;
  } else if (type === "SKIP_PLAYER") {
    applySkip(game, mark, action);
  } else {
    throw new Error("Reefkeepers action must be COMMIT or SKIP_PLAYER.");
  }
  maybeResolve(game);
  game.skip_votes = pruneSkipVotes(game.skip_votes, (t) => (skippable(game, t) ? skipVoters(game, t) : null));
}

// ---------- projections ----------

export function reefkeepersGameToDict(game) {
  normalizeReefkeepersGame(game);
  const playing = game.status === "playing";
  const offer = tiles(game.offer);
  const players = {};
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    const pending = tileById(seat.pending);
    const view = viewFor(game, mark);
    let hint = null;
    if (playing && game.options.hints && !seat.is_bot && !seat.committed) {
      const h = chooseReefMove(view, 3, () => 0.5);
      hint = { place: h.place, pick: h.picks[0] || null };
    }
    const score = scoreFor(game, mark);
    players[mark] = {
      is_bot: seat.is_bot,
      level: seat.level,
      name: seat.name,
      cells: seat.cells.map((c) => ({ ...c })),
      pending,
      legal: playing && pending ? legalSpots(seat.cells, pending, game.options.size) : [],
      has_committed: Boolean(seat.committed),
      committed: seat.committed ? structuredClone(seat.committed) : null,
      skipped: seat.skipped,
      discards: seat.discards,
      score: { total: score.total, regions: score.regions, heart: score.heart, full: score.full, largest: score.largest, pearls: score.pearls },
      hint,
    };
  });
  return {
    game_id: REEFKEEPERS_GAME_ID,
    status: game.status,
    phase: "playing",
    round: game.round,
    rounds_total: game.rounds_total,
    options: { ...game.options },
    seat_order: [...game.seat_order],
    claim_order: [...game.claim_order],
    offer,
    line_size: game.line_size,
    deck_count: game.deck.length, // the deck ORDER never leaves the Worker
    players,
    skip_votes: normalizeSkipVotes(game.skip_votes),
    events: game.events.map((e) => structuredClone(e)),
    event_seq: game.event_seq,
    winner: game.winner,
    results: game.results ? game.results.map((r) => ({ ...r })) : null,
    move_count: game.move_count,
  };
}

// Per-viewer projection of the DICT: other seats' commits, legal spots and
// hints are masked while the game is on; their scores too when live_score is
// off. Everything is revealed on completion.
export function reefkeepersGameToDictForViewer(dict, viewerMark /* , roomStatus */) {
  const out = structuredClone(dict);
  if (!out || !out.players || out.status === "complete") return out;
  const opts = out.options || {};
  Object.keys(out.players).forEach((mark) => {
    const seat = out.players[mark];
    if (mark === viewerMark) {
      if (!opts.hints) seat.hint = null;
      return;
    }
    seat.committed = null;
    seat.legal = [];
    seat.hint = null;
    if (opts.live_score === false) seat.score = null;
  });
  return out;
}

export function reefkeepersScoreByMark(game) {
  normalizeReefkeepersGame(game);
  const scores = {};
  game.seat_order.forEach((mark) => { scores[mark] = scoreFor(game, mark).total; });
  return scores;
}

// ---------- normalization (garbage in stored state → sane values) ----------

function normalizePlace(raw) {
  if (!raw || typeof raw !== "object") return null;
  const place = { x: Number(raw.x), y: Number(raw.y), rot: Number(raw.rot) };
  return Number.isInteger(place.x) && Number.isInteger(place.y) && Number.isInteger(place.rot) && place.rot >= 0 && place.rot <= 3 ? place : null;
}

export function normalizeReefkeepersGame(game) {
  game.game_id = REEFKEEPERS_GAME_ID;
  game.status = game.status === "complete" ? "complete" : "playing";
  game.phase = "playing";
  game.options = normalizeReefkeepersOptions(game.options);
  const size = game.options.size;
  game.rounds_total = draftsFor(size) + 1;
  game.round = clampInt(game.round, 1, game.rounds_total, 1);
  game.move_count = clampInt(game.move_count, 0, 999999, 0);
  game.seat_order = Array.isArray(game.seat_order) ? [...new Set(game.seat_order.map(String))].slice(0, MAX_SEATS) : [];
  game.line_size = Math.max(3, game.seat_order.length);
  if (!game.players || typeof game.players !== "object") game.players = {};
  const lim = size - 1;
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark] || {};
    const seen = new Set(["0,0"]);
    const cells = (Array.isArray(seat.cells) ? seat.cells : []).filter((c) => {
      if (!c || !HABITATS.includes(c.t) || !Number.isInteger(c.x) || !Number.isInteger(c.y)) return false;
      if (Math.abs(c.x) > lim || Math.abs(c.y) > lim || seen.has(c.x + "," + c.y)) return false;
      seen.add(c.x + "," + c.y);
      return true;
    }).map((c) => ({ x: c.x, y: c.y, t: c.t, p: clampInt(c.p, 0, 3, 0) }));
    const committed = seat.committed && typeof seat.committed === "object"
      ? { place: normalizePlace(seat.committed.place), picks: Array.isArray(seat.committed.picks) ? seat.committed.picks.filter(isTileId).slice(0, 3) : [] }
      : null;
    game.players[mark] = {
      is_bot: Boolean(seat.is_bot),
      level: clampInt(seat.level, 0, 4, seat.is_bot ? 2 : 0),
      name: typeof seat.name === "string" ? seat.name.slice(0, 40) : "",
      cells,
      pending: isTileId(seat.pending) ? seat.pending : null,
      committed,
      skipped: Boolean(seat.skipped),
      discards: clampInt(seat.discards, 0, 99, 0),
    };
  });
  Object.keys(game.players).forEach((m) => { if (!game.seat_order.includes(m)) delete game.players[m]; });
  const claim = Array.isArray(game.claim_order) ? game.claim_order.map(String).filter((m) => game.seat_order.includes(m)) : [];
  game.claim_order = [...new Set([...claim, ...game.seat_order])];
  game.offer = Array.isArray(game.offer) ? [...new Set(game.offer.filter(isTileId))].slice(0, MAX_SEATS) : [];
  game.deck = Array.isArray(game.deck) ? game.deck.filter(isTileId) : [];
  game.events = Array.isArray(game.events) ? game.events.filter((e) => e && typeof e === "object" && Number.isInteger(e.seq)).slice(-EVENT_CAP) : [];
  const lastSeq = game.events.length ? game.events[game.events.length - 1].seq : 0;
  game.event_seq = Math.max(clampInt(game.event_seq, 0, 1e9, 0), lastSeq);
  game.skip_votes = normalizeSkipVotes(game.skip_votes);
  game.winner = game.seat_order.includes(game.winner) ? game.winner : null;
  game.results = Array.isArray(game.results) ? game.results : null;
}
