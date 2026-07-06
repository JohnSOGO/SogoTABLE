// Potion Lab — server-authoritative rules + the per-viewer hidden-information
// sanitizer. Pure logic: no routing/auth/persistence, no DOM, no timers. The
// Worker imports the exports below and calls initPotionLabSeats from
// startRoom/reset; bots resolve internally through the SAME pick internals a
// human uses, with the decision policy in ./ai.js.
//
// Ruleset: a re-theme of Sushi Go! — simultaneous ingredient-card drafting over
// three rounds. Each pick, every seat secretly keeps ONE card from the hand in
// front of it, then passes the rest one seat on; repeat until hands empty. That
// is a round. Score each round, deal a fresh hand, play three rounds, then the
// end-of-game Ice Crystal tally. N players, minimum 2, no maximum, bots fill.
//
// Card → scoring: 🧪 Potion (val 1/2/3, scores on its own), 🔥 Fire Essence
// (triples the NEXT potion collected after it), 🐸 Frog (sets of 3 = +10),
// 🍄 Mushroom (pairs = +5), 🌿 Herb (1/2/3/4/5+ = 1/3/6/10/15), 🌙 Moon Dust
// (majority of icons: most +6, 2nd +3), 🧙 Wizard (draft TWO on a later pick),
// ❄️ Ice Crystal (game end: most +6, least −6).
//
// DANGER ZONE: hands are secret. potionLabGameToDict includes each seat's hand
// so the per-viewer sanitizer can hand the viewer their own cards, but
// potionLabGameToDictForViewer is the ONLY thing masking every OTHER seat's
// hand to null — keep that. The deck (draw pile) is stripped for EVERYONE in
// toDict and never leaves the Worker.
//
// RNG: the deal flows through one seedable seam (setPotionLabRandom); an init
// consumes one value per shuffle swap (Fisher–Yates over the built deck).
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { cleanGameId } from "../../game-catalog.js";
import { choosePotionLabPick } from "./ai.js";

export const POTION_LAB_GAME_ID = GAME_IDS.potionLab;
export const POTION_LAB_MIN_PLAYERS = 2;
const ROUNDS = 3;
const HERB_TIERS = [0, 1, 3, 6, 10, 15]; // dumpling ladder, caps at 5+

// Base deck composition per 108 cards (mirrors Sushi Go! weights), scaled to
// the exact number of cards a table needs.
const DECK_SPEC = [
  { type: "frog", count: 14 },
  { type: "mushroom", count: 14 },
  { type: "herb", count: 14 },
  { type: "moondust", icons: 1, count: 6 },
  { type: "moondust", icons: 2, count: 12 },
  { type: "moondust", icons: 3, count: 8 },
  { type: "potion", val: 1, count: 5 },
  { type: "potion", val: 2, count: 10 },
  { type: "potion", val: 3, count: 5 },
  { type: "ice", count: 10 },
  { type: "fire", count: 6 },
  { type: "wizard", count: 4 },
];
const DECK_SPEC_TOTAL = 108;

export function isPotionLabGame(game) {
  return Boolean(game && cleanGameId(game.game_id) === POTION_LAB_GAME_ID);
}

let potionLabRandom = Math.random;
export function setPotionLabRandom(fn) {
  potionLabRandom = typeof fn === "function" ? fn : Math.random;
}

// More players -> shorter hands so rounds stay a sane length. 2p:10 … 7p+:5
export function potionLabHandSize(playerCount) {
  return Math.max(5, Math.min(10, 12 - playerCount));
}

function makeCard(spec, uid) {
  const card = { id: "c" + uid, type: spec.type };
  if (spec.type === "potion") card.val = spec.val;
  if (spec.type === "moondust") card.icons = spec.icons;
  return card;
}

function buildDeck(playerCount, handSize) {
  const needed = handSize * playerCount * ROUNDS;
  const scale = needed / DECK_SPEC_TOTAL;
  const cards = [];
  let uid = 0;
  for (const spec of DECK_SPEC) {
    const k = Math.max(1, Math.round(spec.count * scale));
    for (let i = 0; i < k; i += 1) cards.push(makeCard(spec, uid++));
  }
  // Fisher–Yates via the seedable seam.
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(potionLabRandom() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  while (cards.length > needed) cards.pop();
  let fill = 0;
  while (cards.length < needed) { cards.push(makeCard(DECK_SPEC[fill % DECK_SPEC.length], uid++)); fill += 1; }
  return cards;
}

export function newPotionLabGame() {
  return {
    game_id: POTION_LAB_GAME_ID,
    status: "playing",
    phase: "playing", // "playing" (collecting picks) | "review" (round summary)
    round: 1,
    pick: 0,
    hand_size: 0,
    pass_dir: 1,
    deck: [], // server-secret; NEVER leaves via toDict
    seat_order: [],
    players: {},
    winner: null,
    results: null, // filled at game end: public score breakdown, best first
    move_count: 0,
    events: [],
  };
}

export function initPotionLabSeats(game, seats) {
  game.seat_order = [];
  game.players = {};
  (Array.isArray(seats) ? seats : []).forEach((seat) => {
    const mark = String(seat && seat.mark || "").trim();
    if (!mark) return;
    game.seat_order.push(mark);
    game.players[mark] = {
      is_bot: Boolean(seat && seat.kind === "bot"),
      hand: [],
      collected: [],
      committed: null, // this pick's choice: { cards: [ids], useWizard } — PRIVATE
      ready_next: false,
      wizards: 0,
      score: 0,
      ice: 0,
      ice_score: 0,
      round_scores: [],
    };
  });
  const count = game.seat_order.length;
  if (count < POTION_LAB_MIN_PLAYERS) {
    throw new Error(`Potion Lab needs at least ${POTION_LAB_MIN_PLAYERS} players — invite players or bots to fill the table.`);
  }
  game.status = "playing";
  game.phase = "playing";
  game.round = 1;
  game.pick = 0;
  game.pass_dir = 1;
  game.hand_size = potionLabHandSize(count);
  game.deck = buildDeck(count, game.hand_size);
  game.winner = null;
  game.results = null;
  game.move_count = 0;
  game.events = [];
  dealRound(game);
  maybeResolvePotionLab(game); // an all-bot table resolves straight through
}

// ---------- scoring (pure) ----------

function countType(collected, type) {
  return collected.filter((c) => c.type === type).length;
}

// Fire boosts the NEXT potion collected after it (order matters). Each fire
// boosts one potion; spare fires score 0.
function potionScore(collected) {
  let fires = 0;
  let total = 0;
  for (const c of collected) {
    if (c.type === "fire") fires += 1;
    else if (c.type === "potion") {
      if (fires > 0) { total += c.val * 3; fires -= 1; }
      else total += c.val;
    }
  }
  return total;
}

function splitPoints(pool, winners) {
  return winners > 0 ? Math.floor(pool / winners) : 0;
}

// Moon Dust majority across the table (scored each round): most icons +6,
// second-most +3, ties split (Sushi Go! maki rule).
function moondustScores(game) {
  const marks = game.seat_order;
  const totals = marks.map((m) =>
    game.players[m].collected.reduce((s, c) => s + (c.type === "moondust" ? c.icons : 0), 0));
  const out = totals.map(() => 0);
  if (!totals.some((t) => t > 0)) return out;
  const first = Math.max(...totals);
  const firstIdx = totals.map((t, i) => (t === first ? i : -1)).filter((i) => i >= 0);
  const each1 = splitPoints(6, firstIdx.length);
  firstIdx.forEach((i) => { out[i] = each1; });
  if (firstIdx.length === 1) {
    const rest = totals.filter((t) => t > 0 && t < first);
    if (rest.length) {
      const second = Math.max(...rest);
      const secondIdx = totals.map((t, i) => (t === second ? i : -1)).filter((i) => i >= 0);
      const each2 = splitPoints(3, secondIdx.length);
      secondIdx.forEach((i) => { out[i] = each2; });
    }
  }
  return out;
}

// Ice Crystal is the only end-of-GAME score: most +6, least −6 (no −6 at 2p).
function iceScores(game) {
  const marks = game.seat_order;
  const totals = marks.map((m) => game.players[m].ice);
  const out = totals.map(() => 0);
  const max = Math.max(...totals);
  const min = Math.min(...totals);
  if (max > 0) {
    const winners = totals.map((t, i) => (t === max ? i : -1)).filter((i) => i >= 0);
    const each = splitPoints(6, winners.length);
    winners.forEach((i) => { out[i] += each; });
  }
  if (marks.length > 2 && min < max) {
    const losers = totals.map((t, i) => (t === min ? i : -1)).filter((i) => i >= 0);
    const each = splitPoints(6, losers.length);
    losers.forEach((i) => { out[i] -= each; });
  }
  return out;
}

export function potionLabScoreByMark(game) {
  normalizePotionLabGame(game);
  const scores = {};
  game.seat_order.forEach((mark) => { scores[mark] = game.players[mark].score; });
  return scores;
}

// Pure scoring hooks exposed for tests.
export function potionLabCardScore(collected) {
  const list = Array.isArray(collected) ? collected : [];
  return {
    frog: Math.floor(countType(list, "frog") / 3) * 10,
    mushroom: Math.floor(countType(list, "mushroom") / 2) * 5,
    herb: HERB_TIERS[Math.min(countType(list, "herb"), 5)],
    potion: potionScore(list),
  };
}
export function potionLabMoondustScores(game) { return moondustScores(game); }
export function potionLabIceScores(game) { return iceScores(game); }

// ---------- lifecycle ----------

function dealRound(game) {
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    seat.collected = [];
    seat.committed = null;
    seat.ready_next = false;
    seat.wizards = 0;
    seat.hand = game.deck.splice(0, game.hand_size);
  });
  game.pick = 0;
  game.phase = "playing";
}

function requiredPickCount(seat, useWizard) {
  return useWizard && seat.wizards > 0 && seat.hand.length >= 2 ? 2 : 1;
}

// Resolve one simultaneous pick: keep each seat's chosen card(s), cast wizards,
// then pass the remaining hands one seat on. Ends the round when hands empty.
function resolvePick(game) {
  for (const mark of game.seat_order) {
    const seat = game.players[mark];
    const pick = seat.committed || { cards: [], useWizard: false };
    for (const id of pick.cards) {
      const idx = seat.hand.findIndex((c) => c.id === id);
      if (idx < 0) continue;
      const card = seat.hand.splice(idx, 1)[0];
      seat.collected.push(card);
      if (card.type === "wizard") seat.wizards += 1;
    }
    // Casting a Wizard returns one Wizard to the passing pool (like chopsticks).
    if (pick.useWizard) {
      seat.wizards = Math.max(0, seat.wizards - 1);
      const wIdx = seat.collected.findIndex((c) => c.type === "wizard");
      if (wIdx >= 0) seat.hand.push(seat.collected.splice(wIdx, 1)[0]);
    }
    seat.committed = null;
  }
  game.pick += 1;
  game.move_count += 1;

  const n = game.seat_order.length;
  const hands = game.seat_order.map((m) => game.players[m].hand);
  game.seat_order.forEach((mark, i) => {
    game.players[mark].hand = hands[(i - game.pass_dir + n) % n];
  });

  if (game.seat_order.every((m) => game.players[m].hand.length === 0)) endRound(game);
}

function endRound(game) {
  const moon = moondustScores(game);
  game.seat_order.forEach((mark, i) => {
    const seat = game.players[mark];
    const frog = Math.floor(countType(seat.collected, "frog") / 3) * 10;
    const mushroom = Math.floor(countType(seat.collected, "mushroom") / 2) * 5;
    const herb = HERB_TIERS[Math.min(countType(seat.collected, "herb"), 5)];
    const potion = potionScore(seat.collected);
    const moondust = moon[i];
    const total = frog + mushroom + herb + potion + moondust;
    seat.ice += countType(seat.collected, "ice");
    seat.score += total;
    seat.round_scores.push({
      round: game.round, herb, potion, mushroom, frog, moondust, total,
      cards: seat.collected.map((c) => ({ ...c })), // snapshot for the game-over add-up
    });
    seat.ready_next = false;
  });
  if (game.round >= ROUNDS) completePotionLabGame(game);
  else game.phase = "review";
}

function startNextRound(game) {
  game.round += 1;
  dealRound(game);
}

function completePotionLabGame(game) {
  const ice = iceScores(game);
  game.seat_order.forEach((mark, i) => {
    const seat = game.players[mark];
    seat.ice_score = ice[i];
    seat.score += ice[i];
  });
  game.results = game.seat_order.map((mark) => {
    const seat = game.players[mark];
    return { mark, score: seat.score, ice: seat.ice, ice_score: seat.ice_score };
  });
  // Highest score wins; ties break toward more ice, then seat order.
  game.results.sort((a, b) =>
    b.score - a.score || b.ice - a.ice ||
    game.seat_order.indexOf(a.mark) - game.seat_order.indexOf(b.mark));
  game.winner = game.results[0].mark;
  game.status = "complete";
  game.phase = "review";
}

function humanMarks(game) {
  return game.seat_order.filter((m) => !game.players[m].is_bot);
}

// The barrier. In "playing", hold until every human has committed a pick, then
// let the bots commit and resolve the pick; loop so an all-bot table (and the
// chain of picks within a round) resolves straight through. In "review", hold
// until every human is ready, then deal the next round.
function maybeResolvePotionLab(game) {
  let guard = 0;
  while (game.status !== "complete" && guard < 100000) {
    guard += 1;
    const humans = humanMarks(game);
    if (game.phase === "playing") {
      if (humans.length && !humans.every((m) => game.players[m].committed)) return;
      resolveBotPicks(game);
      resolvePick(game); // may flip phase to "review" or complete
    } else { // review
      if (humans.length && !humans.every((m) => game.players[m].ready_next)) return;
      startNextRound(game);
    }
  }
}

function resolveBotPicks(game) {
  // Bots choose through the same pick shape a human commits.
  // Imported lazily to keep the rules ↔ ai dependency one-directional at load.
  for (const mark of game.seat_order) {
    const seat = game.players[mark];
    if (!seat.is_bot || seat.committed || !seat.hand.length) continue;
    const choice = choosePotionLabPick(game, mark, potionLabRandom);
    seat.committed = normalizePick(seat, choice);
  }
}

function normalizePick(seat, choice) {
  const ids = Array.isArray(choice && choice.cards) ? choice.cards.filter((id) => seat.hand.some((c) => c.id === id)) : [];
  const useWizard = Boolean(choice && choice.useWizard) && seat.wizards > 0 && seat.hand.length >= 2;
  const need = useWizard ? 2 : 1;
  const picked = [...new Set(ids)].slice(0, need);
  if (!picked.length && seat.hand.length) picked.push(seat.hand[0].id); // safe default
  return { cards: picked, useWizard: useWizard && picked.length === 2 };
}

// ---------- projections ----------

export function potionLabGameToDict(game) {
  normalizePotionLabGame(game);
  const moon = moondustScores(game);
  const players = game.seat_order.map((mark, i) => {
    const seat = game.players[mark];
    return {
      mark,
      is_bot: seat.is_bot,
      collected: seat.collected.map((c) => ({ ...c })),
      hand: seat.hand.map((c) => ({ ...c })), // masked per-viewer; see sanitizer
      hand_count: seat.hand.length,
      has_committed: Boolean(seat.committed),
      ready_next: Boolean(seat.ready_next),
      wizards: seat.wizards,
      score: seat.score,
      ice: seat.ice,
      ice_score: seat.ice_score,
      round_estimate: liveRoundEstimate(seat, moon[i]), // this round's live points (incl. moon majority)
      round_scores: seat.round_scores,
    };
  });
  const { deck, ...publicGame } = game; // draw pile secret from EVERYONE
  return {
    ...publicGame,
    game_id: POTION_LAB_GAME_ID,
    players,
    deck_count: game.deck.length,
  };
}

function liveRoundEstimate(seat, moonPts) {
  const frog = Math.floor(countType(seat.collected, "frog") / 3) * 10;
  const mushroom = Math.floor(countType(seat.collected, "mushroom") / 2) * 5;
  const herb = HERB_TIERS[Math.min(countType(seat.collected, "herb"), 5)];
  return frog + mushroom + herb + potionScore(seat.collected) + moonPts;
}

// Per-viewer projection (dispatched from the Worker's gameToDictForViewer
// seam — the No Thanks / Hearts precedent). Receives the DICT shape (players as
// an array). A viewer sees only their OWN hand; every other hand masks to null
// until the game (or room) completes.
export function potionLabGameToDictForViewer(game, viewerMark, roomStatusValue) {
  const projected = structuredClone(game);
  const revealAll = roomStatusValue === "completed" || projected.status === "complete";
  if (Array.isArray(projected.players)) {
    projected.players = projected.players.map((seat) => ({
      ...seat,
      hand: seat.mark === viewerMark || revealAll ? seat.hand : null,
    }));
  }
  return projected;
}

function normalizePotionLabGame(game) {
  game.game_id = POTION_LAB_GAME_ID;
  game.status = game.status === "complete" ? "complete" : "playing";
  game.phase = game.phase === "review" ? "review" : "playing";
  game.round = clampInt(game.round, 1, ROUNDS, 1);
  game.pick = clampInt(game.pick, 0, 99, 0);
  game.hand_size = clampInt(game.hand_size, 0, 20, 0);
  game.pass_dir = game.pass_dir === -1 ? -1 : 1;
  game.deck = Array.isArray(game.deck) ? game.deck : [];
  game.seat_order = Array.isArray(game.seat_order) ? game.seat_order.map(String) : [];
  if (!game.players || typeof game.players !== "object") game.players = {};
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark] || {};
    game.players[mark] = {
      is_bot: Boolean(seat.is_bot),
      hand: Array.isArray(seat.hand) ? seat.hand : [],
      collected: Array.isArray(seat.collected) ? seat.collected : [],
      committed: seat.committed && Array.isArray(seat.committed.cards)
        ? { cards: seat.committed.cards.map(String), useWizard: Boolean(seat.committed.useWizard) } : null,
      ready_next: Boolean(seat.ready_next),
      wizards: clampInt(seat.wizards, 0, 99, 0),
      score: clampInt(seat.score, -999, 9999, 0),
      ice: clampInt(seat.ice, 0, 999, 0),
      ice_score: clampInt(seat.ice_score, -99, 99, 0),
      round_scores: Array.isArray(seat.round_scores) ? seat.round_scores : [],
    };
  });
  game.winner = game.seat_order.includes(game.winner) ? game.winner : null;
  game.results = Array.isArray(game.results) ? game.results : null;
  game.move_count = clampInt(game.move_count, 0, 999999, 0);
  game.events = Array.isArray(game.events) ? game.events.slice(-60) : [];
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// ---------- transitions (top-level) ----------

export function makePotionLabMove(game, mark, action) {
  normalizePotionLabGame(game);
  if (game.status === "complete") throw new Error("Game is complete.");
  const seat = game.players[mark];
  if (!seat) throw new Error("You are not seated in this game.");
  if (seat.is_bot) throw new Error("Bot seats play automatically.");
  const type = String(action && action.type || "").trim();
  if (type === "COMMIT_PICK") applyCommitPick(game, mark, action);
  else if (type === "READY_NEXT") applyReadyNext(game, mark, action);
  else throw new Error("Potion Lab action must be COMMIT_PICK or READY_NEXT.");
  maybeResolvePotionLab(game);
}

function applyCommitPick(game, mark, action) {
  const seat = game.players[mark];
  if (game.phase !== "playing") throw new Error("Not in the drafting phase.");
  // Round/pick stamp guard: reject a stale pick from a resolved barrier; a
  // duplicate same-barrier commit is idempotent (first commit wins).
  if (action.round !== game.round || action.pick !== game.pick) return;
  if (seat.committed) return;
  const committed = normalizePick(seat, { cards: action.cards, useWizard: action.useWizard });
  if (committed.cards.length !== requiredPickCount(seat, committed.useWizard)) {
    throw new Error("Pick the required number of ingredients.");
  }
  seat.committed = committed;
}

function applyReadyNext(game, mark, action) {
  const seat = game.players[mark];
  if (game.phase !== "review") throw new Error("Not in the round summary.");
  if (action.round !== game.round) return;
  seat.ready_next = true;
}
