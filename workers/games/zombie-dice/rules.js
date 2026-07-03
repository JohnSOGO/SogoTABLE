// Zombie Dice — server-authoritative rules. Pure logic: no routing/auth/
// persistence, no DOM, no timers. The Worker imports the exports below and
// calls initZombieDiceSeats from startRoom/reset; bots resolve internally
// (their whole turn plays at round start via the same move path humans use,
// with the decision policy in ./ai.js).
//
// Spec: the official rulebook in AI/zombie-dice/ plus the face table below
// (absent from the rulebook; sourced from the physical dice). Seats play the
// platform's simultaneous-round model (the 10,000 precedent): every seat takes
// its turn concurrently, a barrier advances the round when all active seats
// have resolved, and the endgame fires at the barrier — someone banking 13+
// ends the game at that round's close with the most brains winning; tied
// leaders (only) play extra tiebreaker rounds until one leads. Each seat rolls
// from its own full 13-die cup, which is probability-identical to passing one
// physical cup around.
//
// RNG: all shared-outcome randomness flows through one seedable seam
// (setZombieDiceRandom). A roll consumes one value per drawn die (cup draws,
// in order), then one value per die rolled (held feet first, then the draws).
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { cleanGameId } from "../../game-catalog.js";
import { clampInteger } from "../util.js";
import { zombieDiceBotDecision } from "./ai.js";

export const ZOMBIE_DICE_GAME_ID = GAME_IDS.zombieDice;

export function isZombieDiceGame(game) {
  return Boolean(game && cleanGameId(game.game_id) === ZOMBIE_DICE_GAME_ID);
}

const ZOMBIE_DICE_TARGET_BRAINS = 13;
const ZOMBIE_DICE_COLORS = ["green", "yellow", "red"];
// 13 dice: 6 green (easy victims), 4 yellow, 3 red (tough victims).
export const ZOMBIE_DICE_CUP = { green: 6, yellow: 4, red: 3 };
// Faces per die color (each die has 6 faces). Part of the spec (pinned in
// zombie-dice-rules.test.js). Single source of truth: the client renders the
// projected faces and keeps no copy of this table.
export const ZOMBIE_DICE_FACES = {
  green: { brain: 3, feet: 2, shotgun: 1 },
  yellow: { brain: 2, feet: 2, shotgun: 2 },
  red: { brain: 1, feet: 2, shotgun: 3 },
};
const ZOMBIE_DICE_PHASES = ["ready", "rolled", "done"];
const ZOMBIE_DICE_FINISH_STATES = ["active", "banked", "busted", "sitting"];
const ZOMBIE_DICE_FACE_NAMES = ["brain", "feet", "shotgun"];

let zombieDiceRandom = Math.random;
export function setZombieDiceRandom(fn) {
  zombieDiceRandom = typeof fn === "function" ? fn : Math.random;
}

export function newZombieDiceGame() {
  return {
    game_id: ZOMBIE_DICE_GAME_ID,
    target_brains: ZOMBIE_DICE_TARGET_BRAINS,
    status: "playing",
    round: 1,
    round_pending_advance: false,
    tiebreaker: false,
    active_marks: [],
    winner: null,
    seat_order: [],
    players: {},
    move_count: 0,
    last_move: null,
  };
}

export function initZombieDiceSeats(game, seats) {
  game.seat_order = [];
  game.players = {};
  (Array.isArray(seats) ? seats : []).forEach((seat) => {
    const mark = String(seat && seat.mark || "").trim();
    if (!mark) return;
    game.seat_order.push(mark);
    game.players[mark] = newZombieDiceSeat(seat);
  });
  game.round = 1;
  game.round_pending_advance = false;
  game.tiebreaker = false;
  game.active_marks = game.seat_order.slice();
  game.winner = null;
  game.status = "playing";
  game.move_count = 0;
  game.last_move = null;
  resolveZombieDiceBots(game);
}

function newZombieDiceSeat(seat) {
  return {
    score: 0,
    turn_brains: 0,
    shotguns: 0,
    cup: { ...ZOMBIE_DICE_CUP },
    hand: [], // feet colors carried to the next roll
    brains_rolled: [], // brain die colors set aside (they return on a cup refill)
    shotguns_rolled: [], // shotgun die colors set aside (they never return mid-turn)
    rolled: [], // last roll, [{ color, face }] — display only
    phase: "ready",
    finish_state: "active",
    resolved: false,
    is_bot: Boolean(seat && seat.kind === "bot"),
    level: zombieDiceBotLevel(seat),
    roll_count: 0,
    bot_trajectory: [], // per-roll snapshots for the client's paced bot display
  };
}

function zombieDiceBotLevel(seat) {
  if (!seat || (seat.kind !== "bot" && seat.is_bot !== true)) return 0;
  const level = Number(seat.bot_level !== undefined ? seat.bot_level : seat.level);
  if (Number.isInteger(level) && level >= 1 && level <= 4) return level;
  return 2;
}

export function zombieDiceGameToDict(game) {
  normalizeZombieDiceGame(game);
  const players = game.seat_order.map((mark) => {
    const seat = game.players[mark];
    return {
      mark,
      score: seat.score,
      turn_brains: seat.turn_brains,
      shotguns: seat.shotguns,
      cup: { ...seat.cup },
      hand: seat.hand.slice(),
      brains_rolled: seat.brains_rolled.slice(),
      shotguns_rolled: seat.shotguns_rolled.slice(),
      rolled: seat.rolled.map((die) => ({ color: die.color, face: die.face })),
      phase: seat.phase,
      finish_state: seat.finish_state,
      resolved: seat.resolved,
      is_bot: seat.is_bot,
      active: zombieDiceSeatActive(game, mark),
      roll_count: seat.roll_count,
      bot_trajectory: Array.isArray(seat.bot_trajectory) ? seat.bot_trajectory : [],
      can_roll: zombieDiceCanRoll(game, mark, seat),
      can_bank: zombieDiceCanBank(game, mark, seat),
    };
  });
  return { ...game, game_id: ZOMBIE_DICE_GAME_ID, players };
}

export function zombieDiceScoreByMark(game) {
  normalizeZombieDiceGame(game);
  const scores = {};
  game.seat_order.forEach((mark) => {
    scores[mark] = Number(game.players[mark].score || 0);
  });
  return scores;
}

function normalizeZombieDiceGame(game) {
  game.game_id = ZOMBIE_DICE_GAME_ID;
  game.target_brains = ZOMBIE_DICE_TARGET_BRAINS;
  game.status = game.status === "complete" ? "complete" : "playing";
  game.round = clampInteger(game.round, 1, 999999, 1);
  game.round_pending_advance = Boolean(game.round_pending_advance);
  game.tiebreaker = Boolean(game.tiebreaker);
  game.seat_order = Array.isArray(game.seat_order) ? game.seat_order.map(String) : [];
  if (!game.players || typeof game.players !== "object") game.players = {};
  game.seat_order.forEach((mark) => {
    game.players[mark] = normalizeZombieDiceSeat(game.players[mark]);
  });
  game.active_marks = (Array.isArray(game.active_marks) ? game.active_marks.map(String) : [])
    .filter((mark) => game.seat_order.includes(mark));
  if (!game.active_marks.length) game.active_marks = game.seat_order.slice();
  game.winner = game.seat_order.includes(game.winner) ? game.winner : null;
  game.move_count = clampInteger(game.move_count, 0, 999999, 0);
  game.last_move = game.last_move || null;
}

function normalizeZombieDiceSeat(seat) {
  const source = seat || {};
  return {
    score: clampInteger(source.score, 0, 999, 0),
    turn_brains: clampInteger(source.turn_brains, 0, 999, 0),
    shotguns: clampInteger(source.shotguns, 0, 99, 0),
    cup: normalizeZombieDiceCup(source.cup),
    hand: normalizeZombieDiceColors(source.hand, 3),
    brains_rolled: normalizeZombieDiceColors(source.brains_rolled, 13),
    shotguns_rolled: normalizeZombieDiceColors(source.shotguns_rolled, 13),
    rolled: normalizeZombieDiceRolled(source.rolled),
    phase: ZOMBIE_DICE_PHASES.includes(source.phase) ? source.phase : "ready",
    finish_state: ZOMBIE_DICE_FINISH_STATES.includes(source.finish_state) ? source.finish_state : "active",
    resolved: Boolean(source.resolved),
    is_bot: Boolean(source.is_bot),
    level: Number.isInteger(source.level) ? source.level : (source.is_bot ? 2 : 0),
    roll_count: clampInteger(source.roll_count, 0, 999999, 0),
    bot_trajectory: normalizeZombieDiceTrajectory(source.bot_trajectory),
  };
}

function normalizeZombieDiceCup(cup) {
  const source = cup && typeof cup === "object" ? cup : {};
  return {
    green: clampInteger(source.green, 0, ZOMBIE_DICE_CUP.green, ZOMBIE_DICE_CUP.green),
    yellow: clampInteger(source.yellow, 0, ZOMBIE_DICE_CUP.yellow, ZOMBIE_DICE_CUP.yellow),
    red: clampInteger(source.red, 0, ZOMBIE_DICE_CUP.red, ZOMBIE_DICE_CUP.red),
  };
}

function normalizeZombieDiceColors(value, max) {
  if (!Array.isArray(value)) return [];
  return value.filter((color) => ZOMBIE_DICE_COLORS.includes(color)).slice(0, max);
}

function normalizeZombieDiceRolled(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((die) => die && ZOMBIE_DICE_COLORS.includes(die.color) && ZOMBIE_DICE_FACE_NAMES.includes(die.face))
    .slice(0, 3)
    .map((die) => ({ color: die.color, face: die.face }));
}

function normalizeZombieDiceTrajectory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 60).map((entry) => ({
    total: clampInteger(entry && entry.total, 0, 999, 0),
    status: ["rolling", "banked", "busted"].includes(entry && entry.status) ? entry.status : "rolling",
    shotguns: clampInteger(entry && entry.shotguns, 0, 99, 0),
  }));
}

export function makeZombieDiceMove(game, mark, action) {
  normalizeZombieDiceGame(game);
  if (game.status === "complete") throw new Error("Game is complete.");
  const seat = game.players[mark];
  if (!seat) throw new Error("You are not seated in this game.");
  if (seat.is_bot) throw new Error("Bot seats are resolved automatically.");
  if (!zombieDiceSeatActive(game, mark)) throw new Error("You are sitting out the tiebreaker round.");
  const type = String(action && action.type || "").trim();
  if (seat.resolved && !(type === "roll" && game.round_pending_advance)) {
    throw new Error("You already finished this round. Wait for the next round.");
  }
  if (type === "roll") {
    if (game.round_pending_advance) startZombieDiceRound(game);
    rollZombieDice(game.players[mark]);
  } else if (type === "bank") {
    bankZombieDiceBrains(seat);
  } else {
    throw new Error("Zombie Dice action is required.");
  }
  game.move_count += 1;
  const moved = game.players[mark];
  const busted = moved.finish_state === "busted";
  game.last_move = {
    type: busted ? "bust" : type,
    mark,
    round: game.round,
    move_count: game.move_count,
    rolled: type === "roll" ? moved.rolled.map((die) => ({ color: die.color, face: die.face })) : undefined,
    shotguns: moved.shotguns,
    turn_brains: busted ? 0 : moved.turn_brains,
  };
  maybeAdvanceZombieDiceRound(game);
}

// One atomic draw+roll. Drawing and rolling are a single server action, which
// enforces the rulebook's "after you take new dice, you can't stop — you have
// to roll" for free: a client can never hold drawn-but-unrolled dice.
function rollZombieDice(seat) {
  if (seat.phase !== "ready" && seat.phase !== "rolled") throw new Error("Roll is not available.");
  const dice = seat.hand.slice(); // feet re-roll, keeping their colors
  seat.hand = [];
  const needed = 3 - dice.length;
  // Cup refill (rulebook "Brrrains?"): when the cup cannot cover the draw, the
  // brain tally is noted (turn_brains keeps it) and the brain DICE go back in
  // the cup; shotguns stay out. Colors matter — a refilled cup is richer in
  // whatever was eaten.
  if (zombieDiceCupTotal(seat.cup) < needed) {
    seat.brains_rolled.forEach((color) => { seat.cup[color] += 1; });
    seat.brains_rolled = [];
  }
  for (let index = 0; index < needed; index += 1) {
    dice.push(zombieDiceDrawFromCup(seat.cup));
  }
  seat.roll_count += 1;
  seat.rolled = dice.map((color) => ({ color, face: zombieDiceRollFace(color) }));
  seat.rolled.forEach((die) => {
    if (die.face === "brain") {
      seat.brains_rolled.push(die.color);
      seat.turn_brains += 1;
    } else if (die.face === "shotgun") {
      seat.shotguns_rolled.push(die.color);
      seat.shotguns += 1;
    } else {
      seat.hand.push(die.color);
    }
  });
  if (seat.shotguns >= 3) {
    seat.turn_brains = 0;
    seat.phase = "done";
    seat.finish_state = "busted";
    seat.resolved = true;
  } else {
    seat.phase = "rolled";
    seat.finish_state = "active";
  }
}

function bankZombieDiceBrains(seat) {
  if (seat.phase !== "rolled") throw new Error("Roll before you can stop and score.");
  seat.score += seat.turn_brains;
  seat.phase = "done";
  seat.finish_state = "banked";
  seat.resolved = true;
}

function zombieDiceCupTotal(cup) {
  return cup.green + cup.yellow + cup.red;
}

function zombieDiceDrawFromCup(cup) {
  const total = zombieDiceCupTotal(cup);
  if (total <= 0) throw new Error("Zombie Dice cup is empty; the refill should have covered this draw.");
  let pick = Math.floor(zombieDiceRandom() * total);
  for (const color of ZOMBIE_DICE_COLORS) {
    if (pick < cup[color]) {
      cup[color] -= 1;
      return color;
    }
    pick -= cup[color];
  }
  cup.red -= 1; // unreachable with a valid RNG; keep the cup consistent anyway
  return "red";
}

function zombieDiceRollFace(color) {
  const faces = ZOMBIE_DICE_FACES[color];
  const roll = Math.floor(zombieDiceRandom() * 6);
  if (roll < faces.brain) return "brain";
  if (roll < faces.brain + faces.feet) return "feet";
  return "shotgun";
}

function zombieDiceSeatActive(game, mark) {
  return !game.tiebreaker || game.active_marks.includes(mark);
}

function zombieDiceCanRoll(game, mark, seat) {
  if (game.status !== "playing" || !zombieDiceSeatActive(game, mark)) return false;
  if (game.round_pending_advance) return true;
  return !seat.resolved && (seat.phase === "ready" || seat.phase === "rolled");
}

function zombieDiceCanBank(game, mark, seat) {
  return game.status === "playing" && zombieDiceSeatActive(game, mark)
    && !game.round_pending_advance && !seat.resolved && seat.phase === "rolled";
}

// Barrier: the round closes once every ACTIVE seat has banked or busted. The
// endgame check runs here — someone at 13+ ends the game at the round's close
// (most brains wins); a tie among the leaders starts a leaders-only tiebreaker
// round, repeating until one player leads outright. A round whose active seats
// are ALL bots (a bot-vs-bot tiebreaker) can never be started by a human roll,
// so it plays out immediately inside the loop; the guard bounds a coin-flip
// tie that stubbornly refuses to break.
function maybeAdvanceZombieDiceRound(game) {
  for (let guard = 0; guard < 26; guard += 1) {
    const active = game.tiebreaker ? game.active_marks : game.seat_order;
    if (!active.length) return;
    if (!active.every((mark) => game.players[mark].resolved)) return;
    const best = Math.max(...game.seat_order.map((mark) => game.players[mark].score));
    if (best >= game.target_brains) {
      const leaders = game.seat_order.filter((mark) => game.players[mark].score === best);
      if (leaders.length === 1) {
        game.status = "complete";
        game.winner = leaders[0];
        game.seat_order.forEach((mark) => { game.players[mark].phase = "done"; });
        game.last_move = { type: "complete", round: game.round, winner: game.winner };
        return;
      }
      game.tiebreaker = true;
      game.active_marks = leaders;
      // A bots-only tie that refuses to break before the guard runs out ends
      // deterministically — earliest-seated tied leader takes it (edge rule in
      // PLAN.md) — rather than leaving the room soft-locked with every human
      // sitting out and no legal roll to advance the round.
      if (guard === 25 && leaders.every((mark) => game.players[mark].is_bot)) {
        game.status = "complete";
        game.winner = leaders[0];
        game.seat_order.forEach((mark) => { game.players[mark].phase = "done"; });
        game.last_move = { type: "complete", round: game.round, winner: game.winner };
        return;
      }
    }
    game.round_pending_advance = true;
    const next = game.tiebreaker ? game.active_marks : game.seat_order;
    if (!next.every((mark) => game.players[mark].is_bot)) return; // a human's roll starts the round
    startZombieDiceRound(game); // bots-only round: resolve it now and re-check the barrier
  }
}

function startZombieDiceRound(game) {
  const marks = game.tiebreaker ? game.active_marks : game.seat_order;
  if (!marks.length) return;
  if (!game.round_pending_advance && !marks.every((mark) => game.players[mark].resolved)) return;
  game.round += 1;
  game.round_pending_advance = false;
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    const active = zombieDiceSeatActive(game, mark);
    seat.turn_brains = 0;
    seat.shotguns = 0;
    seat.cup = { ...ZOMBIE_DICE_CUP };
    seat.hand = [];
    seat.brains_rolled = [];
    seat.shotguns_rolled = [];
    seat.rolled = [];
    seat.phase = active ? "ready" : "done";
    seat.finish_state = active ? "active" : "sitting";
    seat.resolved = !active;
    seat.roll_count = 0;
    seat.bot_trajectory = [];
  });
  resolveZombieDiceBots(game);
}

function resolveZombieDiceBots(game) {
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    if (seat.is_bot && !seat.resolved && zombieDiceSeatActive(game, mark)) {
      playZombieDiceBotTurn(game, mark, seat);
    }
  });
}

// Plays a bot's whole turn at round start via the SAME roll/bank internals a
// human's move uses — no bot-only legality. Records a per-roll trajectory of
// { total, status, shotguns } snapshots (trajectory[0] is the carried baseline)
// so the client can replay the bot "playing along" paced to the human's rolls.
// Bots resolve sequentially at round start, so a later-seated bot's standings
// read includes earlier bots' same-round banks — mirroring physical turn-order
// information (PLAN.md deviation #6).
function playZombieDiceBotTurn(game, mark, seat) {
  const trajectory = [{ total: seat.score, status: "rolling", shotguns: 0 }];
  const bestOpponentScore = Math.max(0, ...game.seat_order
    .filter((other) => other !== mark)
    .map((other) => game.players[other].score));
  for (let guard = 0; guard < 40; guard += 1) {
    rollZombieDice(seat);
    trajectory.push({
      total: seat.score + seat.turn_brains,
      status: seat.finish_state === "busted" ? "busted" : "rolling",
      shotguns: seat.shotguns,
    });
    if (seat.resolved) break;
    const rollAgain = zombieDiceBotDecision(seat.level, {
      faces: ZOMBIE_DICE_FACES,
      cup: { ...seat.cup },
      hand: seat.hand.slice(),
      shotguns: seat.shotguns,
      turnBrains: seat.turn_brains,
      score: seat.score,
      bestOpponentScore,
      target: game.target_brains,
      random: zombieDiceRandom,
    });
    if (!rollAgain) {
      bankZombieDiceBrains(seat);
      trajectory.push({ total: seat.score, status: "banked", shotguns: seat.shotguns });
      break;
    }
  }
  if (!seat.resolved) { // guard tripped: bank whatever is on the table
    bankZombieDiceBrains(seat);
    trajectory.push({ total: seat.score, status: "banked", shotguns: seat.shotguns });
  }
  seat.bot_trajectory = trajectory;
}
