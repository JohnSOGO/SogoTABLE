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
import { GOODS } from "../../../src/sogotable/static/games/rtta/rules.js";
import { cleanGameId } from "../../game-catalog.js";
import { chooseRttaTurn } from "./ai.js";

export const RTTA_GAME_ID = GAME_IDS.rtta;
const ROUND_GUARD = 500; // bot-only auto-advance backstop (game always ends first)
const SOLO_ROUNDS = 10;  // rulebook solitaire variant: the game ends after 10 rounds
const MAX_POINTS_LOST = 45; // the score sheet's disaster grid: 45 boxes, then it is full

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

// Worker cost of the 4th–7th city (matches the client CITY_COSTS tail; parity-tested).
export const CITY_BOX_COSTS = [3, 4, 5, 6];

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
    cities: 3, food: 3, goods: [0, 0, 0, 0, 0],   // Setup: "sets their food peg to 3"
    cityBoxes: [0, 0, 0, 0],                       // partial worker boxes on the 4th–7th city
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
  game.end_reason = null;
  game.seat_order = [];
  game.players = {};
  game.monuments = {};
  game.pending_events = [];
  for (const name of MONUMENT_NAMES) game.monuments[name] = [];
  for (const p of players) {
    game.seat_order.push(p.mark);
    game.players[p.mark] = newSeat(p.name, p.kind === "bot", p.level);
  }
  rememberOpenMonuments(game);
  resolveBotRound(game, rng);
  maybeAdvance(game, rng);
}

// Humans post one committed turn per round (COMMIT_TURN) and one READY_NEXT to
// leave the review screen. Both are barrier-gated; bots go through neither.
//
// Rejection policy: a same-round duplicate is a client retry — ignored
// silently (idempotent, first commit wins). A round-STAMPED action from
// another round is a stale tab and is rejected loudly, as is an unknown
// action type; an unstamped action (legacy client mid-deploy) is accepted.
export function makeRttaMove(game, mark, action) {
  const seat = game.players && game.players[mark];
  if (!seat || seat.is_bot) return game;
  const type = action && action.type;
  if (type !== "COMMIT_TURN" && type !== "READY_NEXT") {
    throw new Error(`Unknown Roll Through the Ages action "${type}".`);
  }
  if (game.status === "complete") throw new Error("The game is already over.");
  const stamped = action.round === undefined || action.round === null ? NaN : Math.trunc(Number(action.round));
  if (Number.isFinite(stamped) && stamped !== game.round) {
    throw new Error(`Stale ${type === "COMMIT_TURN" ? "turn" : "ready"} from round ${stamped} — the table is on round ${game.round}. Refresh to catch up.`);
  }
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
  if (Array.isArray(turn.cityBoxes) && turn.cityBoxes.length === CITY_BOX_COSTS.length) {
    // Partial city progress persists (rulebook: checked boxes stay checked);
    // the city count is DERIVED from full slots, never trusted separately.
    seat.cityBoxes = turn.cityBoxes.map((v, i) => clampInt(v, 0, CITY_BOX_COSTS[i], 0));
    seat.cities = 3 + seat.cityBoxes.filter((v, i) => v >= CITY_BOX_COSTS[i]).length;
  } else {
    // Legacy commit (bots, older clients): a bare count, synthesized to full slots.
    const cities = Math.trunc(Number(turn.cities));
    if (Number.isFinite(cities)) seat.cities = Math.max(3, Math.min(7, cities));
    seat.cityBoxes = CITY_BOX_COSTS.map((cost, i) => (i < seat.cities - 3 ? cost : 0));
  }
  seat.food = clampInt(turn.food, 0, 15, seat.food);
  if (Array.isArray(turn.goods) && turn.goods.length === 5) {
    // Each pegboard row has a hard top (GOODS[i].holes) — a hostile payload
    // can't bank more of a good than the score sheet has spaces for.
    seat.goods = turn.goods.map((g, i) => clampInt(g, 0, GOODS[i].holes, 0));
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
  // Monument completion is DERIVED from the clamped boxes, never trusted from
  // the payload's monumentsCompleted list — a doctored claim could steal
  // first-builder VP and trip the SHARED all-monuments end condition.
  for (const name of inPlay) {
    if ((seat.monumentBoxes[name] || 0) >= MONUMENTS[name].workers && !game.monuments[name].includes(mark)) {
      game.monuments[name].push(mark);
    }
  }
  const dev = turn.devBought;
  if (dev && DEVELOPMENTS[dev] && !seat.developments.includes(dev)) {
    seat.developments.push(dev);
    seat.dev_this_round = dev; // buys land AFTER Upkeep — no disaster shield this round
  }
  seat.points_lost = Math.min(MAX_POINTS_LOST,
    seat.points_lost + Math.max(0, Math.trunc(Number(turn.pointsLostSelf) || 0)));
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
    s.dev_this_round = null; // last round's purchase shields from now on
  }
  rememberOpenMonuments(game);
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
//
// Timing rule (signed adaptation, PLAN.md): disasters resolve during Upkeep,
// which precedes the Buy step — so a development bought THIS round never
// shields (or powers) THIS round's disasters, for the roller or a victim.
function devsAtUpkeep(seat) {
  return seat.dev_this_round
    ? seat.developments.filter((d) => d !== seat.dev_this_round)
    : seat.developments;
}

function losePoints(seat, n) {
  seat.points_lost = Math.min(MAX_POINTS_LOST, seat.points_lost + n);
}

function resolveDisasters(game) {
  const events = [];
  const marks = seatOrder(game);
  for (const from of marks) {
    const seat = game.players[from];
    const skulls = seat.skulls || 0;
    if (skulls === 3) {
      if (marks.length === 1) {
        // Solitaire (rulebook solo variant): no opponents to strike —
        // pestilence costs the roller 3 points instead, Medicine immune.
        if (!devsAtUpkeep(seat).includes("Medicine")) {
          losePoints(seat, 3);
          events.push({ from, kind: "pestilence", to: [from], amount: 3 });
        }
      } else {
        const to = [];
        for (const other of marks) {
          if (other === from) continue;
          const os = game.players[other];
          if (devsAtUpkeep(os).includes("Medicine")) continue;
          losePoints(os, 3);
          to.push(other);
        }
        if (to.length) events.push({ from, kind: "pestilence", to, amount: 3 });
      }
    }
    if (skulls >= 5 && devsAtUpkeep(seat).includes("Religion")) {
      const to = [];
      for (const other of marks) {
        if (other === from) continue;
        const os = game.players[other];
        if (devsAtUpkeep(os).includes("Religion")) continue; // Religion holders are unaffected
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
// for this seat count is built — plus, in the solitaire variant, after the
// 10th round. gameEndReason names WHOSE situation triggered it: the
// 5-development owner(s), or whoever first-built the monuments that were
// still open at the start of the final round (tracked in open_monuments).
function gameEndReason(game) {
  const fiveDevs = seatOrder(game).filter((m) => game.players[m].developments.length >= 5);
  if (fiveDevs.length) return { kind: "five_devs", marks: fiveDevs, monuments: [] };
  const inPlay = monumentsInPlay(seatOrder(game).length);
  if (inPlay.every((name) => (game.monuments[name] || []).length > 0)) {
    const closed = (game.open_monuments || []).filter((n) => (game.monuments[n] || []).length > 0);
    return { kind: "all_monuments", marks: [...new Set(closed.map((n) => game.monuments[n][0]))], monuments: closed };
  }
  if (seatOrder(game).length === 1 && game.round >= SOLO_ROUNDS) {
    return { kind: "ten_rounds", marks: seatOrder(game).slice(), monuments: [] };
  }
  return null;
}

function isGameOver(game) { return gameEndReason(game) !== null; }

function rememberOpenMonuments(game) {
  game.open_monuments = monumentsInPlay(seatOrder(game).length)
    .filter((name) => (game.monuments[name] || []).length === 0);
}

function completeGame(game) {
  recomputeScores(game);
  game.status = "complete";
  game.end_reason = gameEndReason(game); // null when settled by the round guard
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
    // Seats persisted before cityBoxes existed synthesize full slots from the count.
    const cityBoxes = Array.isArray(s.cityBoxes) && s.cityBoxes.length === CITY_BOX_COSTS.length
      ? s.cityBoxes.slice()
      : CITY_BOX_COSTS.map((cost, i) => (i < (s.cities || 3) - 3 ? cost : 0));
    return {
      mark, name: s.name, is_bot: s.is_bot,
      cities: s.cities, cityBoxes, food: s.food, goods: s.goods.slice(),
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
    end_reason: game.end_reason
      ? { kind: game.end_reason.kind, marks: (game.end_reason.marks || []).slice(), monuments: (game.end_reason.monuments || []).slice() }
      : null,
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
