// Roll Through the Ages — server-authoritative rules for a round-locked,
// simultaneous, N-player game.
//
// Every player plays their whole turn at once on their own device and POSTs ONE
// committed turn (COMMIT_TURN) when they land on Discard. The server owns only
// the SHARED truth: the per-round barrier, cross-player disaster resolution
// (Pestilence / Revolt), and the authoritative scoreboard — with light sanity
// clamping, not a full turn replay (family game; the client computes its own
// board). Bots resolve their whole turn here via ./ai.js and never block the
// barrier. No hidden information: rttaGameToDict projects the full public state.
//
// Round lifecycle (two-phase barrier):
//   phase "playing"  — humans COMMIT_TURN; when every human is done the server
//                      resolves disasters + scores, then flips to "review".
//   phase "review"   — the Discard scoreboard shows totals + disaster events;
//                      humans READY_NEXT; when all are ready the round advances.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { cleanGameId } from "../../game-catalog.js";
import { chooseRttaTurn } from "./ai.js";

export const RTTA_GAME_ID = GAME_IDS.rtta;
const ROUND_GUARD = 500; // bot-only auto-advance backstop (game always ends first)

// Monument name → worker cost, first-builder VP, later-builder VP. 2025 rulebook
// edition. `notAt` = seat counts at which the monument SITS OUT (2-player games
// cross off Temple + Great Pyramid, 3-player games cross off Hanging Gardens;
// solo and 4+ use all). Matches the client table; guarded by the parity test.
export const MONUMENTS = {
  "Step Pyramid":    { workers: 3,  first: 1,  later: 0 },
  "Stone Circle":    { workers: 5,  first: 2,  later: 1 },
  "Temple":          { workers: 7,  first: 4,  later: 2,  notAt: [2] },
  "Obelisk":         { workers: 9,  first: 6,  later: 3 },
  "Hanging Gardens": { workers: 11, first: 8,  later: 4,  notAt: [3] },
  "Great Wall":      { workers: 13, first: 10, later: 5 },
  "Great Pyramid":   { workers: 15, first: 12, later: 8,  notAt: [2] },
};
export const MONUMENT_NAMES = Object.keys(MONUMENTS);

// The monuments actually in play for a seat count. Commits, bots, and the
// all-monuments end condition all key off this.
export function monumentsInPlay(playerCount) {
  return MONUMENT_NAMES.filter((name) => !(MONUMENTS[name].notAt || []).includes(playerCount));
}

// Development name → coin cost, victory points. 2025 rulebook edition.
export const DEVELOPMENTS = {
  "Leadership":   { cost: 10, vp: 2 },
  "Irrigation":   { cost: 10, vp: 2 },
  "Agriculture":  { cost: 15, vp: 3 },
  "Quarrying":    { cost: 15, vp: 3 },
  "Coinage":      { cost: 20, vp: 4 },
  "Caravans":     { cost: 20, vp: 4 },
  "Medicine":     { cost: 20, vp: 4 },
  "Religion":     { cost: 25, vp: 7 },
  "Granaries":    { cost: 30, vp: 6 },
  "Masonry":      { cost: 30, vp: 6 },
  "Engineering":  { cost: 40, vp: 6 },
  "Architecture": { cost: 60, vp: 8 },
  "Empire":       { cost: 70, vp: 10 },
};
export const DEVELOPMENT_NAMES = Object.keys(DEVELOPMENTS);

// Dispatch predicate: is this room's game blob an RToA game? Resolves aliases
// via the shared catalog, matching every other server rules module.
export function isRttaGame(game) {
  return Boolean(game && cleanGameId(game.game_id) === RTTA_GAME_ID);
}

function newSeat(name, isBot, level) {
  return {
    name: name || "Player", is_bot: !!isBot, level: level || null,
    cities: 3, food: 0, goods: [0, 0, 0, 0, 0],
    monumentBoxes: {}, developments: [],
    points_lost: 0, skulls: 0, score: 0,
    round_done: false, ready_next: false,
  };
}

function seatOrder(game) { return game.seat_order || []; }
function humanMarks(game) { return seatOrder(game).filter((m) => !game.players[m].is_bot); }

export function newRttaGame() {
  return {
    game_id: RTTA_GAME_ID, round: 1, phase: "playing", status: "playing",
    winner: null, seat_order: [], players: {}, monuments: {}, pending_events: [],
  };
}

// Seat one civilization per player (3 cities / 3 dice each), then let bots take
// the opening round and check the barrier (matters for a bot-only room).
export function initRttaSeats(game, players, rng = Math.random) {
  game.round = 1;
  game.phase = "playing";
  game.status = "playing";
  game.winner = null;
  game.seat_order = [];
  game.players = {};
  game.monuments = {};
  game.pending_events = [];
  for (const name of MONUMENT_NAMES) game.monuments[name] = [];
  for (const p of players) {
    game.seat_order.push(p.mark);
    game.players[p.mark] = newSeat(p.name, p.kind === "bot", p.level);
  }
  resolveBotRound(game, rng);
  maybeAdvance(game, rng);
}

// Humans post one committed turn per round (COMMIT_TURN) and one READY_NEXT to
// leave the review screen. Both are barrier-gated; bots go through neither.
export function makeRttaMove(game, mark, action) {
  const seat = game.players && game.players[mark];
  if (!seat || seat.is_bot) return game;
  const type = action && action.type;
  if (type === "COMMIT_TURN" && game.phase === "playing" && !seat.round_done) {
    applyCommittedTurn(game, mark, action);
    seat.round_done = true;
    maybeAdvance(game);
  } else if (type === "READY_NEXT" && game.phase === "review" && !seat.ready_next) {
    seat.ready_next = true;
    maybeAdvance(game);
  }
  return game;
}

// Trust-but-clamp: the client computed this turn; the server only bounds it to
// sane ranges so a bad/stale payload can't corrupt the shared state. A player
// can only mis-report their OWN board; shared consequences are server-resolved.
function applyCommittedTurn(game, mark, turn) {
  const seat = game.players[mark];
  const cities = Math.trunc(Number(turn.cities));
  if (Number.isFinite(cities)) seat.cities = Math.max(3, Math.min(7, cities));
  seat.food = clampInt(turn.food, 0, 15, seat.food);
  if (Array.isArray(turn.goods) && turn.goods.length === 5) {
    seat.goods = turn.goods.map((g) => Math.max(0, Math.trunc(Number(g) || 0)));
  }
  const inPlay = monumentsInPlay(seatOrder(game).length);
  if (turn.monumentBoxes && typeof turn.monumentBoxes === "object") {
    const boxes = {};
    for (const name of inPlay) {
      const v = Math.max(0, Math.trunc(Number(turn.monumentBoxes[name]) || 0));
      if (v > 0) boxes[name] = Math.min(v, MONUMENTS[name].workers);
    }
    seat.monumentBoxes = boxes;
  }
  const completed = Array.isArray(turn.monumentsCompleted) ? turn.monumentsCompleted : [];
  for (const name of completed) {
    if (inPlay.includes(name) && !game.monuments[name].includes(mark)) game.monuments[name].push(mark);
  }
  const dev = turn.devBought;
  if (dev && DEVELOPMENTS[dev] && !seat.developments.includes(dev)) seat.developments.push(dev);
  seat.points_lost += Math.max(0, Math.trunc(Number(turn.pointsLostSelf) || 0));
  seat.skulls = clampInt(turn.skulls, 0, 7, 0); // 7 cities → up to 7 skull dice
}

function clampInt(value, lo, hi, fallback) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

// The barrier. Loops only for a bot-only room (auto-advancing rounds until the
// game ends); a room with humans returns to wait on the appropriate flag.
function maybeAdvance(game, rng = Math.random) {
  if (!seatOrder(game).length) return;
  const humans = humanMarks(game);
  let guard = 0;
  while (game.status !== "complete" && guard++ < ROUND_GUARD) {
    if (game.phase === "playing") {
      const marks = humans.length ? humans : seatOrder(game);
      if (!marks.every((m) => game.players[m].round_done)) return;
      resolveDisasters(game);
      recomputeScores(game);
      game.phase = "review";
      if (isGameOver(game)) { completeGame(game); return; }
      if (humans.length) return; // wait for humans to READY_NEXT
      // bot-only: fall through and advance immediately
    }
    if (game.phase === "review") {
      const ready = humans.length ? humans.every((m) => game.players[m].ready_next) : true;
      if (!ready) return;
      advanceRound(game, rng);
    }
  }
  if (game.status !== "complete") completeGame(game); // guard tripped: settle
}

function advanceRound(game, rng) {
  game.round += 1;
  game.phase = "playing";
  game.pending_events = [];
  for (const m of seatOrder(game)) {
    const s = game.players[m];
    s.round_done = false;
    s.ready_next = false;
    s.skulls = 0;
  }
  resolveBotRound(game, rng);
}

// Bots resolve their entire turn here and mark themselves done+ready, so they
// never hold either barrier.
function resolveBotRound(game, rng = Math.random) {
  for (const m of seatOrder(game)) {
    const seat = game.players[m];
    if (!seat.is_bot || seat.round_done) continue;
    applyCommittedTurn(game, m, chooseRttaTurn(game, m, rng));
    seat.round_done = true;
    seat.ready_next = true;
  }
}

// Cross-player disasters, resolved once when the round barrier closes. Pestilence
// (exactly 3 skulls) costs every OTHER player without Medicine 3 points; Revolt
// (5+ skulls) with Religion wipes every opponent's goods. Events are recorded for
// the client to animate (skulls flying to each opponent).
function resolveDisasters(game) {
  const events = [];
  const marks = seatOrder(game);
  for (const from of marks) {
    const seat = game.players[from];
    const skulls = seat.skulls || 0;
    if (skulls === 3) {
      const to = [];
      for (const other of marks) {
        if (other === from) continue;
        const os = game.players[other];
        if (os.developments.includes("Medicine")) continue;
        os.points_lost += 3;
        to.push(other);
      }
      if (to.length) events.push({ from, kind: "pestilence", to, amount: 3 });
    }
    if (skulls >= 5 && seat.developments.includes("Religion")) {
      const to = [];
      for (const other of marks) {
        if (other === from) continue;
        const os = game.players[other];
        if (os.developments.includes("Religion")) continue; // Religion holders are unaffected
        os.goods = [0, 0, 0, 0, 0];
        to.push(other);
      }
      if (to.length) events.push({ from, kind: "revolt", to });
    }
  }
  game.pending_events = events;
}

// Authoritative score = development VP + monument VP (first vs later) +
// Architecture (+2/monument) + Empire (+1/city) − points lost.
function recomputeScores(game) {
  for (const m of seatOrder(game)) {
    const seat = game.players[m];
    let score = 0;
    for (const d of seat.developments) score += DEVELOPMENTS[d] ? DEVELOPMENTS[d].vp : 0;
    let monCount = 0;
    for (const name of MONUMENT_NAMES) {
      const idx = (game.monuments[name] || []).indexOf(m);
      if (idx === -1) continue;
      monCount += 1;
      score += idx === 0 ? MONUMENTS[name].first : MONUMENTS[name].later;
    }
    if (seat.developments.includes("Architecture")) score += 2 * monCount;
    if (seat.developments.includes("Empire")) score += seat.cities;
    score -= seat.points_lost;
    seat.score = score;
  }
}

// The game ends when any player owns 5 developments OR every monument IN PLAY
// for this seat count is built.
function isGameOver(game) {
  const fiveDevs = seatOrder(game).some((m) => game.players[m].developments.length >= 5);
  const allMonuments = monumentsInPlay(seatOrder(game).length)
    .every((name) => (game.monuments[name] || []).length > 0);
  return fiveDevs || allMonuments;
}

function completeGame(game) {
  recomputeScores(game);
  game.status = "complete";
  let best = -Infinity;
  let winner = null;
  for (const m of seatOrder(game)) {
    if (game.players[m].score > best) { best = game.players[m].score; winner = m; }
  }
  game.winner = winner;
}

// Full public projection — no hidden information in a family game.
export function rttaGameToDict(game) {
  const players = seatOrder(game).map((mark) => {
    const s = game.players[mark];
    return {
      mark, name: s.name, is_bot: s.is_bot,
      cities: s.cities, food: s.food, goods: s.goods.slice(),
      developments: s.developments.slice(), monumentBoxes: { ...s.monumentBoxes },
      points_lost: s.points_lost, score: s.score,
      round_done: s.round_done, ready_next: s.ready_next,
      finish_state: game.status === "complete" ? "complete"
        : game.phase === "review" ? (s.ready_next ? "ready" : "reviewing")
        : (s.round_done ? "waiting" : "playing"),
    };
  });
  const monuments = {};
  for (const name of MONUMENT_NAMES) monuments[name] = (game.monuments[name] || []).slice();
  return {
    game_id: game.game_id, round: game.round, phase: game.phase,
    status: game.status, winner: game.winner,
    monuments, pending_events: (game.pending_events || []).slice(),
    seat_order: seatOrder(game).slice(), players,
  };
}

// For stats recording: each seat's authoritative final score keyed by mark.
export function rttaScoreByMark(game) {
  const scores = {};
  for (const m of seatOrder(game)) scores[m] = game.players[m].score;
  return scores;
}
