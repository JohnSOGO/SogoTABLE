// Bloomwork — server-authoritative rules. An ORIGINAL SogoTable game (our own
// name, theme and art) built on the classic open-market tile-drafting
// mechanic: take every flower of one kind from a market stall, plant them in
// a planter row, and when a row is full one flower moves into your 5×5
// garden bed, scoring for every flower it lines up with. Too many flowers
// spill onto your compost heap and cost points.
//
// Parallel play (docs/game-integration-spec.md §5): a round is a chain of
// PICK STEPS. At each step every seat secretly commits one pick; when every
// human has committed (bots commit last, through the same validation) the
// step resolves in this step's rotating priority order (./resolve.js).
// When the stalls and the Square are empty the round ends: full rows plant,
// compost costs points, and the table reviews the round (READY_NEXT). The
// game ends after the round in which anyone completes a horizontal bed row
// (or after round 3 in the Quick game).
//
// Hidden info: a seat's committed pick is masked from everyone else until
// the step resolves (bloomworkGameToDictForViewer). The bag order is secret
// from everyone (stripped in toDict).
//
// RNG: one seedable seam (setBloomworkRandom) — bag shuffles only.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { cleanGameId } from "../../game-catalog.js";
import { castSkipVote, normalizeSkipVotes, pruneSkipVotes } from "../skip-vote.js";
import {
  FLOWERS, SIZE, BIRD, COMPOST_SLOTS,
  bedColumnFor, canPlant, compostPenalty, completedRowCount, emptyBed, emptyRows,
  endBonuses, isFlower, plantPoints, rowCapacity,
} from "./board.js";
import { resolveBloomworkPick } from "./resolve.js";
import { chooseBloomworkPick } from "./ai.js";

export const BLOOMWORK_GAME_ID = GAME_IDS.bloomwork;
export const BLOOMWORK_MIN_PLAYERS = 2;
export const BLOOMWORK_MAX_PLAYERS = 6;
const STALL_SIZE = 4;
const QUICK_ROUNDS = 3;
const MAX_ROUNDS = 20; // safety stop; a real game ends far earlier
const EVENT_CAP = 80;

export const BLOOMWORK_DEFAULT_OPTIONS = Object.freeze({ length: "standard", helps: true });

export function isBloomworkGame(game) {
  return Boolean(game && cleanGameId(game.game_id) === BLOOMWORK_GAME_ID);
}

let bloomworkRandom = Math.random;
export function setBloomworkRandom(fn) {
  bloomworkRandom = typeof fn === "function" ? fn : Math.random;
}

function botLevel(seat) {
  if (!seat || (seat.kind !== "bot" && seat.is_bot !== true)) return 0;
  const level = Number(seat.bot_level !== undefined ? seat.bot_level : seat.level);
  return Number.isInteger(level) && level >= 1 && level <= 4 ? level : 2;
}

export function bloomworkStallCount(players) {
  return players * 2 + 1;
}
function perFlowerCount(players) {
  return players <= 4 ? 20 : 30;
}

export function newBloomworkGame() {
  return {
    game_id: BLOOMWORK_GAME_ID,
    status: "playing",
    phase: "drafting", // "drafting" (pick steps) | "review" (round summary)
    round: 1,
    pick: 0,
    options: { ...BLOOMWORK_DEFAULT_OPTIONS },
    seat_order: [],
    first: null, // who leads this round (Early Bird holder)
    players: {},
    bag: [], // server-secret order
    lid: [],
    stalls: [],
    center: [],
    bird_in_center: true,
    skip_votes: {},
    events: [],
    event_seq: 0,
    last_round: null, // public summary of the last round's planting
    winner: null,
    results: null,
    move_count: 0,
  };
}

export function setBloomworkOptions(game, payload) {
  const raw = (payload && (payload.bloom_options || payload.options)) || {};
  game.options = {
    length: raw.length === "quick" ? "quick" : "standard",
    helps: raw.helps === false || raw.helps === "off" ? false : true,
  };
}

function newSeat(seat) {
  return {
    is_bot: Boolean(seat && (seat.kind === "bot" || seat.is_bot === true)),
    level: botLevel(seat),
    rows: emptyRows(),
    bed: emptyBed(),
    compost: [],
    score: 0,
    committed: null,
    ready_next: false,
    skipped: false,
    round_log: null,
  };
}

export function initBloomworkSeats(game, seats) {
  const list = (Array.isArray(seats) ? seats : []).filter((s) => s && String(s.mark || "").trim());
  if (list.length < BLOOMWORK_MIN_PLAYERS) {
    throw new Error(`Bloomwork needs at least ${BLOOMWORK_MIN_PLAYERS} gardeners — invite players or bots to fill the table.`);
  }
  if (list.length > BLOOMWORK_MAX_PLAYERS) {
    throw new Error(`Bloomwork seats at most ${BLOOMWORK_MAX_PLAYERS} gardeners — remove a seat to start.`);
  }
  game.seat_order = [];
  game.players = {};
  list.forEach((seat) => {
    const mark = String(seat.mark).trim();
    game.seat_order.push(mark);
    game.players[mark] = newSeat(seat);
  });
  game.options = game.options ? { ...BLOOMWORK_DEFAULT_OPTIONS, ...game.options } : { ...BLOOMWORK_DEFAULT_OPTIONS };
  game.status = "playing";
  game.round = 1;
  game.winner = null;
  game.results = null;
  game.move_count = 0;
  game.events = [];
  game.event_seq = 0;
  game.last_round = null;
  game.skip_votes = {};
  game.lid = [];
  game.bag = [];
  const per = perFlowerCount(list.length);
  FLOWERS.forEach((f) => { for (let i = 0; i < per; i += 1) game.bag.push(f); });
  shuffle(game.bag);
  game.first = game.seat_order[0];
  startRound(game);
  maybeResolveBloomwork(game); // an all-bot table plays straight through
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(bloomworkRandom() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}

function drawOne(game) {
  if (!game.bag.length && game.lid.length) {
    game.bag = game.lid;
    game.lid = [];
    shuffle(game.bag);
  }
  return game.bag.length ? game.bag.pop() : null;
}

function startRound(game) {
  game.phase = "drafting";
  game.pick = 0;
  game.center = [];
  game.bird_in_center = true;
  game.stalls = [];
  for (let s = 0; s < bloomworkStallCount(game.seat_order.length); s += 1) {
    const stall = [];
    for (let i = 0; i < STALL_SIZE; i += 1) {
      const f = drawOne(game);
      if (f) stall.push(f);
    }
    game.stalls.push(stall);
  }
  game.seat_order.forEach((m) => {
    const seat = game.players[m];
    seat.committed = null;
    seat.ready_next = false;
    seat.skipped = false;
  });
  game.skip_votes = {};
  pushEvent(game, { type: "round", round: game.round, first: game.first });
}

// Priority for the current pick: the round leader first, rotating one seat
// further every pick step so nobody wins every clash in a round.
export function bloomworkPriorityOrder(game) {
  const order = game.seat_order;
  if (!order.length) return [];
  const lead = Math.max(0, order.indexOf(game.first));
  const start = (lead + game.pick) % order.length;
  return order.slice(start).concat(order.slice(0, start));
}

function pushEvent(game, event) {
  game.event_seq = (Number(game.event_seq) || 0) + 1;
  game.events.push({ seq: game.event_seq, round: game.round, pick: game.pick, ...event });
  if (game.events.length > EVENT_CAP) game.events = game.events.slice(-EVENT_CAP);
}

function marketEmpty(game) {
  return game.center.length === 0 && game.stalls.every((s) => s.length === 0);
}

function humanMarks(game) {
  return game.seat_order.filter((m) => !game.players[m].is_bot);
}

const doneDrafting = (seat) => Boolean(seat.committed || seat.skipped);

// ---------- pick validation (the one path humans and bots share) ----------

function normalizePickAction(game, seat, action) {
  const rawSource = action && action.source;
  const source = rawSource === "center" ? "center" : Number.parseInt(rawSource, 10);
  if (source !== "center" && !(Number.isInteger(source) && source >= 0 && source < game.stalls.length)) {
    throw new Error("Pick a market stall or the Square.");
  }
  const flower = String(action && action.flower || "");
  if (!isFlower(flower)) throw new Error("Pick a kind of flower.");
  const tiles = source === "center" ? game.center : game.stalls[source];
  if (!tiles.includes(flower)) throw new Error("That flower isn't there any more — pick again.");
  const row = action && (action.row === "compost" || action.row === -1 || action.row === "-1") ? -1 : Number.parseInt(action && action.row, 10);
  if (!Number.isInteger(row) || row < -1 || row >= SIZE) throw new Error("Pick a planter row (or the compost heap).");
  if (!canPlant(seat.rows, seat.bed, row, flower)) {
    throw new Error("Those flowers can't go in that row — it holds another kind, is full, or your bed already has that flower in that row.");
  }
  return { source, flower, row };
}

// ---------- the barrier ----------

function commitBots(game) {
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    if (!seat.is_bot || seat.committed) return;
    const choice = chooseBloomworkPick(game, mark, bloomworkRandom);
    if (!choice) return;
    try {
      seat.committed = normalizePickAction(game, seat, choice);
    } catch {
      seat.committed = null;
    }
  });
}

function resolveStep(game) {
  const order = bloomworkPriorityOrder(game);
  const { birdTaker } = resolveBloomworkPick(game, order, (e) => pushEvent(game, e));
  if (birdTaker) game.next_first = birdTaker;
  game.seat_order.forEach((m) => { game.players[m].committed = null; });
  game.pick += 1;
  game.move_count += 1;
  game.skip_votes = {};
  if (marketEmpty(game)) endRound(game);
}

function endRound(game) {
  const summary = {};
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    const planted = [];
    let points = 0;
    for (let r = 0; r < SIZE; r += 1) {
      const line = seat.rows[r];
      if (line.flower && line.count >= rowCapacity(r)) {
        const col = bedColumnFor(r, line.flower);
        const pts = plantPoints(seat.bed, r, col);
        seat.bed[r][col] = true;
        points += pts;
        planted.push({ row: r, col, flower: line.flower, points: pts });
        for (let i = 1; i < line.count; i += 1) game.lid.push(line.flower);
        seat.rows[r] = { flower: null, count: 0 };
      }
    }
    const penalty = compostPenalty(seat.compost);
    seat.compost.forEach((f) => { if (f !== BIRD) game.lid.push(f); });
    seat.compost = [];
    const before = seat.score;
    seat.score = Math.max(0, seat.score + points + penalty);
    summary[mark] = { planted, points, penalty, before, after: seat.score };
    seat.round_log = summary[mark];
    planted.forEach((p) => pushEvent(game, { type: "plant", mark, ...p }));
    if (penalty) pushEvent(game, { type: "compost", mark, points: penalty });
  });
  game.last_round = { round: game.round, seats: summary };
  game.first = game.next_first && game.seat_order.includes(game.next_first) ? game.next_first : game.first;
  delete game.next_first;
  const someoneDone = game.seat_order.some((m) => completedRowCount(game.players[m].bed) > 0);
  const quickDone = game.options.length === "quick" && game.round >= QUICK_ROUNDS;
  if (someoneDone || quickDone || game.round >= MAX_ROUNDS) {
    completeGame(game);
    return;
  }
  game.phase = "review";
  game.seat_order.forEach((m) => { game.players[m].ready_next = false; game.players[m].skipped = false; });
  game.skip_votes = {};
}

function completeGame(game) {
  game.results = game.seat_order.map((mark) => {
    const seat = game.players[mark];
    const bonus = endBonuses(seat.bed);
    seat.score += bonus.points;
    if (bonus.points) pushEvent(game, { type: "bonus", mark, rows: bonus.rows, cols: bonus.cols, kinds: bonus.kinds, points: bonus.points });
    return { mark, score: seat.score, rows: bonus.rows, cols: bonus.cols, kinds: bonus.kinds, bonus: bonus.points };
  });
  // Highest score wins; ties break toward more completed bed rows, then
  // seat order (the shared win is announced by the client).
  game.results.sort((a, b) => b.score - a.score || b.rows - a.rows
    || game.seat_order.indexOf(a.mark) - game.seat_order.indexOf(b.mark));
  game.results.forEach((r, i) => {
    const prev = game.results[i - 1];
    r.place = prev && prev.score === r.score && prev.rows === r.rows ? prev.place : i + 1;
  });
  game.winner = game.results[0].mark;
  game.status = "complete";
  game.phase = "review";
  pushEvent(game, { type: "game_over", winner: game.winner });
}

function advanceRound(game) {
  game.round += 1;
  startRound(game);
}

function maybeResolveBloomwork(game) {
  let guard = 0;
  while (game.status !== "complete" && guard < 5000) {
    guard += 1;
    const humans = humanMarks(game);
    if (game.phase === "drafting") {
      if (marketEmpty(game)) {
        endRound(game); // bag and discards ran dry: nothing to draft this round
      } else {
        if (humans.length && !humans.every((m) => doneDrafting(game.players[m]))) return;
        commitBots(game);
        resolveStep(game); // may move to review or complete
      }
      if (game.status === "complete") return;
      if (game.phase === "drafting") continue;
      if (humans.length) return; // wait for READY_NEXT
    }
    if (game.phase === "review") {
      if (humans.length && !humans.every((m) => game.players[m].ready_next)) return;
      advanceRound(game);
    }
  }
}

// ---------- skip vote ----------

function skippable(game, target) {
  const seat = game.players[target];
  if (!seat || seat.is_bot) return false;
  if (game.phase === "drafting") return !doneDrafting(seat);
  return !seat.ready_next;
}
function skipVoters(game, target) {
  return humanMarks(game).filter((m) => m !== target && (game.phase === "drafting"
    ? doneDrafting(game.players[m]) && !game.players[m].skipped
    : game.players[m].ready_next));
}

function applySkip(game, mark, action) {
  const target = String(action.target || "");
  if (target === mark) throw new Error("You can't vote to skip yourself.");
  if (!skippable(game, target)) throw new Error("That gardener can't be skipped right now.");
  const eligible = skipVoters(game, target);
  if (!eligible.includes(mark)) throw new Error("Only gardeners who are already done can vote to skip.");
  const result = castSkipVote(game.skip_votes, mark, target, eligible);
  game.skip_votes = result.votes;
  if (!result.unanimous) return;
  const seat = game.players[target];
  if (game.phase === "drafting") seat.skipped = true; // sits out the rest of this round's picks
  else seat.ready_next = true;
  const next = { ...game.skip_votes };
  delete next[target];
  game.skip_votes = next;
  pushEvent(game, { type: "skip", mark: target });
}

// ---------- moves ----------

export function makeBloomworkMove(game, mark, action) {
  normalizeBloomworkGame(game);
  if (game.status === "complete") throw new Error("The garden is finished — start a rematch to play again.");
  const seat = game.players[mark];
  if (!seat) throw new Error("You are not seated in this game.");
  if (seat.is_bot) throw new Error("Bot seats play automatically.");
  const type = String(action && action.type || "").trim().toUpperCase();
  const stampedRound = action && action.round != null ? Math.trunc(Number(action.round)) : NaN;
  if (Number.isFinite(stampedRound) && stampedRound !== game.round) {
    throw new Error(`That move was for round ${stampedRound} — the table is on round ${game.round}. Refresh to catch up.`);
  }
  if (type === "PICK") {
    if (game.phase !== "drafting") throw new Error("Not picking right now — the round is being tallied.");
    const stampedPick = action.pick != null ? Math.trunc(Number(action.pick)) : NaN;
    if (Number.isFinite(stampedPick) && stampedPick !== game.pick) {
      if (stampedPick < game.pick && seat.committed == null) {
        throw new Error("That pick was for an earlier step — the market has changed. Pick again.");
      }
      if (stampedPick > game.pick) throw new Error("That pick is ahead of the table. Refresh to catch up.");
      return; // earlier-step duplicate after resolution: ignore
    }
    if (seat.skipped) throw new Error("You were skipped this round — you're back next round.");
    if (seat.committed) return; // duplicate tap / retry: first pick wins
    seat.committed = normalizePickAction(game, seat, action);
  } else if (type === "READY_NEXT") {
    if (game.phase !== "review") throw new Error("Not in the round summary.");
    seat.ready_next = true;
  } else if (type === "SKIP_PLAYER") {
    applySkip(game, mark, action);
  } else {
    throw new Error("Bloomwork action must be PICK, READY_NEXT or SKIP_PLAYER.");
  }
  maybeResolveBloomwork(game);
  game.skip_votes = pruneSkipVotes(game.skip_votes, (t) => (game.status === "playing" && skippable(game, t) ? skipVoters(game, t) : null));
}

// ---------- projections ----------

export function bloomworkGameToDict(game) {
  normalizeBloomworkGame(game);
  const players = game.seat_order.map((mark) => {
    const seat = game.players[mark];
    return {
      mark,
      is_bot: seat.is_bot,
      level: seat.level,
      rows: seat.rows.map((l) => ({ ...l })),
      bed: seat.bed.map((line) => line.slice()),
      compost: seat.compost.slice(),
      compost_penalty: compostPenalty(seat.compost),
      score: seat.score,
      committed: seat.committed ? { ...seat.committed } : null, // masked per viewer
      has_committed: Boolean(seat.committed),
      ready_next: seat.ready_next,
      skipped: seat.skipped,
      has_bird: seat.compost.includes(BIRD),
      bed_rows_done: completedRowCount(seat.bed),
      round_log: seat.round_log,
    };
  });
  const rest = { ...game };
  const { bag, lid } = game;
  delete rest.bag; delete rest.lid; delete rest.next_first; delete rest.players;
  return {
    ...rest,
    game_id: BLOOMWORK_GAME_ID,
    players,
    priority_order: game.status === "complete" ? [] : bloomworkPriorityOrder(game),
    stalls: game.stalls.map((s) => s.slice()),
    center: game.center.slice(),
    bag_count: bag.length,
    lid_count: lid.length,
    flowers: FLOWERS.slice(),
    bed_layout: Array.from({ length: SIZE }, (_, r) => Array.from({ length: SIZE }, (__, c) => FLOWERS[(c - r + SIZE * 2) % SIZE])),
    compost_slots: COMPOST_SLOTS,
  };
}

// A viewer sees only their own committed pick until the step resolves.
export function bloomworkGameToDictForViewer(game, viewerMark) {
  const projected = structuredClone(game);
  if (Array.isArray(projected.players)) {
    projected.players = projected.players.map((seat) => ({
      ...seat,
      committed: seat.mark === viewerMark ? seat.committed : null,
    }));
  }
  return projected;
}

export function bloomworkScoreByMark(game) {
  normalizeBloomworkGame(game);
  const scores = {};
  game.seat_order.forEach((mark) => { scores[mark] = game.players[mark].score; });
  return scores;
}

// ---------- normalize (resilience floor) ----------

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
const flowerList = (v) => (Array.isArray(v) ? v.filter(isFlower) : []);

export function normalizeBloomworkGame(game) {
  game.game_id = BLOOMWORK_GAME_ID;
  game.status = game.status === "complete" ? "complete" : "playing";
  game.phase = game.phase === "review" ? "review" : "drafting";
  game.round = clampInt(game.round, 1, MAX_ROUNDS, 1);
  game.pick = clampInt(game.pick, 0, 999, 0);
  const o = game.options || {};
  game.options = { length: o.length === "quick" ? "quick" : "standard", helps: o.helps !== false };
  game.seat_order = Array.isArray(game.seat_order) ? game.seat_order.map(String) : [];
  if (!game.players || typeof game.players !== "object") game.players = {};
  game.seat_order.forEach((mark) => {
    const s = game.players[mark] || {};
    const rows = Array.isArray(s.rows) && s.rows.length === SIZE ? s.rows : emptyRows();
    game.players[mark] = {
      is_bot: Boolean(s.is_bot),
      level: clampInt(s.level, 0, 4, s.is_bot ? 2 : 0),
      rows: rows.map((l, r) => {
        const flower = l && isFlower(l.flower) ? l.flower : null;
        const count = flower ? clampInt(l.count, 0, rowCapacity(r), 0) : 0;
        return { flower: count ? flower : null, count };
      }),
      bed: Array.isArray(s.bed) && s.bed.length === SIZE
        ? s.bed.map((line) => Array.from({ length: SIZE }, (_, c) => Boolean(Array.isArray(line) && line[c])))
        : emptyBed(),
      compost: Array.isArray(s.compost) ? s.compost.filter((f) => f === BIRD || isFlower(f)).slice(0, COMPOST_SLOTS) : [],
      score: clampInt(s.score, 0, 9999, 0),
      committed: s.committed && isFlower(s.committed.flower) ? {
        source: s.committed.source === "center" ? "center" : clampInt(s.committed.source, 0, 99, 0),
        flower: s.committed.flower,
        row: clampInt(s.committed.row, -1, SIZE - 1, -1),
      } : null,
      ready_next: Boolean(s.ready_next),
      skipped: Boolean(s.skipped),
      round_log: s.round_log && typeof s.round_log === "object" ? s.round_log : null,
    };
  });
  game.first = game.seat_order.includes(game.first) ? game.first : (game.seat_order[0] || null);
  game.bag = flowerList(game.bag);
  game.lid = flowerList(game.lid);
  game.stalls = Array.isArray(game.stalls) ? game.stalls.map(flowerList) : [];
  game.center = flowerList(game.center);
  game.bird_in_center = game.bird_in_center !== false;
  game.skip_votes = normalizeSkipVotes(game.skip_votes);
  game.events = Array.isArray(game.events) ? game.events.slice(-EVENT_CAP) : [];
  game.event_seq = clampInt(game.event_seq, 0, 1e9, 0);
  game.winner = game.seat_order.includes(game.winner) ? game.winner : null;
  game.results = Array.isArray(game.results) ? game.results : null;
  game.move_count = clampInt(game.move_count, 0, 999999, 0);
  return game;
}
