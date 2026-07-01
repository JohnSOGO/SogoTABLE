// 10,000 (dice / Farkle) — server-authoritative rules. Phase 2 game module,
// esbuild-bundled into the Worker. Pure logic: no routing/auth/persistence. This
// module owns the isTenThousandGame dispatch predicate; the Worker imports it and
// calls the exports below; initTenThousandSeats is invoked from startRoom/reset.
// The trailing __test exports are re-exposed by the Worker's __test object for the test suite.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { cleanGameId } from "../../game-catalog.js";
import { clampInteger } from "../util.js";

const TEN_THOUSAND_GAME_ID = GAME_IDS.tenThousand;

// Dispatch predicate: is this room's game blob a 10,000 game? Resolves aliases
// via the shared catalog, exactly as the Worker's inline predicate did.
export function isTenThousandGame(game) {
  return Boolean(game && cleanGameId(game.game_id) === TEN_THOUSAND_GAME_ID);
}

const TEN_THOUSAND_TARGET_SCORE = 10000;
const TEN_THOUSAND_OPENING_MINIMUM = 500; // default first-bank bar to get "on the board"
const TEN_THOUSAND_OPENING_BASE_MAX = 5000; // host may raise the opening bar up to this
const TEN_THOUSAND_BANK_MINIMUM = 50; // smallest legal bank once on the board
const TEN_THOUSAND_DICE_COUNT = 6;
const TEN_THOUSAND_PHASES = ["ready", "rolled", "selected", "farkled", "done"];
const TEN_THOUSAND_FINISH_STATES = ["active", "banked", "farkled_pending_ack", "farkled_acked"];
// Level 2 (Kitchen Table) bank thresholds by dice remaining, per
// docs/bots/farkle_ai_players_4_levels.md. Used to resolve bot rounds server-side.
const TEN_THOUSAND_BOT_BANK = { 6: 1000, 5: 750, 4: 600, 3: 450, 2: 350, 1: 250 };

function newTenThousandGame() {
  return {
    game_id: TEN_THOUSAND_GAME_ID,
    target_score: TEN_THOUSAND_TARGET_SCORE,
    opening_base: TEN_THOUSAND_OPENING_MINIMUM, // host-chosen first-bank bar (round 1)
    opening_minimum: TEN_THOUSAND_OPENING_MINIMUM, // derived per round from opening_base
    status: "playing",
    round: 1,
    round_pending_advance: false,
    final_round: false,
    final_trigger: null,
    winner: null,
    seat_order: [],
    players: {},
    move_count: 0,
    last_move: null,
  };
}


// Populate the per-seat sub-games once the room starts. `seats` is the ordered
// room.players list; each seat plays an independent 10,000 and resolves its own
// round. Bot seats are resolved immediately for round 1.
function initTenThousandSeats(game, seats) {
  game.seat_order = [];
  game.players = {};
  (Array.isArray(seats) ? seats : []).forEach((seat) => {
    const mark = String(seat && seat.mark || "").trim();
    if (!mark) return;
    game.seat_order.push(mark);
    game.players[mark] = newTenThousandSeat(seat);
  });
  game.round = 1;
  game.final_round = false;
  game.final_trigger = null;
  game.winner = null;
  game.status = "playing";
  game.move_count = 0;
  game.last_move = null;
  game.round_pending_advance = false;
  resolveTenThousandBots(game);
}

function newTenThousandSeat(seat) {
  return {
    score: 0,
    turn_score: 0,
    round_score: 0,
    farkles: 0,
    dice: tenThousandBlankDice(),
    phase: "ready",
    resolved: false,
    is_bot: Boolean(seat && seat.kind === "bot"),
    level: tenThousandBotLevel(seat),
    roll_count: 0, // rolls + rerolls this round (drives the bot "play-along" display)
    bot_trajectory: [], // per-roll running-total snapshots for a bot's resolved round
    farkle_from_straight: false, // a bust from a failed straight bet shows all dice red, no "missed" yellow
  };
}

function tenThousandBotLevel(seat) {
  // Accept both the room player (kind "bot", carries bot_level) and the in-game
  // seat (is_bot, carries the resolved level). Previously this only checked
  // `kind`, so the in-game seat — which has no `kind` — always resolved to 0 and
  // every tier silently played as the level-0 default.
  if (!seat || (seat.kind !== "bot" && seat.is_bot !== true)) return 0;
  const level = Number(seat.bot_level !== undefined ? seat.bot_level : seat.level);
  if (Number.isInteger(level) && level >= 1 && level <= 4) return level;
  return 2; // Kitchen Table default
}

function tenThousandGameToDict(game) {
  normalizeTenThousandGame(game);
  const players = game.seat_order.map((mark) => {
    const seat = game.players[mark];
    return {
      mark,
      score: seat.score,
      turn_score: seat.turn_score,
      round_score: seat.round_score,
      farkles: seat.farkles,
      finish_state: seat.finish_state,
      phase: seat.phase,
      resolved: seat.resolved,
      is_bot: seat.is_bot,
      dice: seat.dice,
      roll_count: seat.roll_count || 0,
      bot_trajectory: Array.isArray(seat.bot_trajectory) ? seat.bot_trajectory : [],
      farkle_from_straight: Boolean(seat.farkle_from_straight),
      scoring_options: tenThousandScoringOptions(seat),
      can_roll: tenThousandCanRoll(game, seat),
      can_reroll: tenThousandCanReroll(game, seat),
      can_bank: tenThousandCanBank(game, seat),
      bank_minimum: tenThousandBankMinimum(game, seat),
    };
  });
  return {
    ...game,
    game_id: TEN_THOUSAND_GAME_ID,
    players,
  };
}

function normalizeTenThousandGame(game) {
  game.game_id = TEN_THOUSAND_GAME_ID;
  game.target_score = TEN_THOUSAND_TARGET_SCORE;
  game.status = game.status === "complete" ? "complete" : "playing";
  game.round = clampInteger(game.round, 1, 999999, 1);
  game.opening_base = clampInteger(game.opening_base, 0, TEN_THOUSAND_OPENING_BASE_MAX, TEN_THOUSAND_OPENING_MINIMUM);
  game.opening_minimum = tenThousandOpeningMinimum(game); // round-dependent (after round + base are set)
  game.final_round = Boolean(game.final_round);
  game.final_trigger = game.final_trigger || null;
  game.round_pending_advance = Boolean(game.round_pending_advance);
  game.seat_order = Array.isArray(game.seat_order) ? game.seat_order.map(String) : [];
  if (!game.players || typeof game.players !== "object") game.players = {};
  game.seat_order.forEach((mark) => {
    game.players[mark] = normalizeTenThousandSeat(game.players[mark]);
  });
  game.winner = game.seat_order.includes(game.winner) ? game.winner : null;
  game.move_count = clampInteger(game.move_count, 0, 999999, 0);
  game.last_move = game.last_move || null;
}

function normalizeTenThousandSeat(seat) {
  const source = seat || {};
  const finishState = normalizeTenThousandFinishState(source);
  return {
    score: clampInteger(source.score, 0, 9999999, 0),
    turn_score: clampInteger(source.turn_score, 0, 9999999, 0),
    round_score: clampInteger(source.round_score, 0, 9999999, 0),
    farkles: clampInteger(source.farkles, 0, 999999, 0),
    dice: normalizeTenThousandDice(source.dice),
    finish_state: finishState,
    phase: TEN_THOUSAND_PHASES.includes(source.phase) ? source.phase : "ready",
    resolved: Boolean(source.resolved) || finishState === "banked" || finishState === "farkled_acked",
    is_bot: Boolean(source.is_bot),
    level: Number.isInteger(source.level) ? source.level : (source.is_bot ? 2 : 0),
    roll_count: clampInteger(source.roll_count, 0, 999999, 0),
    bot_trajectory: normalizeTenThousandTrajectory(source.bot_trajectory),
    farkle_from_straight: Boolean(source.farkle_from_straight),
  };
}

function normalizeTenThousandTrajectory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).map((entry) => ({
    total: clampInteger(entry && entry.total, 0, 9999999, 0),
    status: ["rolling", "banked", "farkled"].includes(entry && entry.status) ? entry.status : "rolling",
    hot: clampInteger(entry && entry.hot, 0, 12, 0),
  }));
}

function normalizeTenThousandFinishState(source) {
  const finishState = String(source && source.finish_state || "").trim();
  if (TEN_THOUSAND_FINISH_STATES.includes(finishState)) return finishState;
  if (source && source.phase === "farkled") return source.resolved ? "farkled_acked" : "farkled_pending_ack";
  if (source && source.resolved) return "banked";
  return "active";
}

function tenThousandBlankDice() {
  return Array.from({ length: TEN_THOUSAND_DICE_COUNT }, (_, index) => ({
    id: `d${index + 1}`,
    value: null,
    selected: false,
    scored: false,
    rolling: false,
  }));
}

function normalizeTenThousandDice(dice) {
  const source = Array.isArray(dice) ? dice : [];
  return Array.from({ length: TEN_THOUSAND_DICE_COUNT }, (_, index) => {
    const die = source[index] || {};
    const value = Number(die.value);
    return {
      id: String(die.id || `d${index + 1}`).slice(0, 16),
      value: Number.isInteger(value) && value >= 1 && value <= 6 ? value : null,
      selected: Boolean(die.selected),
      scored: Boolean(die.scored),
      rolling: false,
    };
  });
}

function makeTenThousandMove(game, mark, action) {
  normalizeTenThousandGame(game);
  if (game.status === "complete") throw new Error("Game is complete.");
  const seat = game.players[mark];
  if (!seat) throw new Error("You are not seated in this game.");
  if (seat.is_bot) throw new Error("Bot seats are resolved automatically.");
  const type = String(action && action.type || "").trim();
  if (seat.resolved && !(type === "roll" && game.round_pending_advance)) throw new Error("You already finished this round. Wait for the next round.");
  if (seat.phase === "farkled" && type !== "ack_farkle") throw new Error("Acknowledge the farkle to continue.");
  if (type === "roll" && game.round_pending_advance) startTenThousandRound(game);
  if (type === "roll") rollTenThousandDice(seat);
  else if (type === "select") selectTenThousandDice(seat, action.dice_ids || action.diceIds || []);
  else if (type === "straight_attempt") attemptTenThousandStraight(seat, action.dice_ids || action.diceIds || []);
  else if (type === "score_and_press") scoreAndPressTenThousand(seat, action.dice_ids || action.diceIds || []);
  else if (type === "score_and_bank") scoreAndBankTenThousand(game, mark, seat, action.dice_ids || action.diceIds || []);
  else if (type === "reroll") rerollTenThousandDice(seat);
  else if (type === "bank") bankTenThousandScore(game, mark, seat);
  else if (type === "declare_farkle") declareTenThousandFarkle(seat);
  else if (type === "ack_farkle") acknowledgeTenThousandFarkle(game, seat);
  else throw new Error("10,000 action is required.");
  game.move_count += 1;
  const farkled = seat.phase === "farkled";
  // The combined buttons report as their press/bank effect so the client's
  // animation and sound paths (which key off the move type) behave as before.
  const reportType = farkled ? "farkle"
    : type === "score_and_press" ? "reroll"
    : type === "score_and_bank" ? "bank"
    : type;
  game.last_move = {
    type: reportType,
    mark,
    round: game.round,
    move_count: game.move_count,
    dice: (farkled || reportType === "roll" || reportType === "reroll" || type === "straight_attempt")
      ? seat.dice.map((die) => ({ id: die.id, value: die.value, scored: die.scored }))
      : undefined,
    // The straight bet re-rolls exactly one die; expose it so the client tumbles
    // only that die instead of jumping straight to the result.
    rolled_ids: type === "straight_attempt" && seat.straight_reroll_id ? [seat.straight_reroll_id] : undefined,
  };
  if (type === "straight_attempt") delete seat.straight_reroll_id;
  maybeAdvanceTenThousandRound(game);
}

function rollTenThousandDice(seat) {
  if (seat.phase !== "ready") throw new Error("Roll is not available.");
  seat.roll_count = clampInteger(seat.roll_count, 0, 999999, 0) + 1;
  seat.dice = tenThousandBlankDice();
  tenThousandRollDiceByIds(seat, seat.dice.map((die) => die.id));
  finishTenThousandRoll(seat);
}

function rerollTenThousandDice(seat) {
  if (seat.phase !== "selected") throw new Error("Reroll is not available.");
  seat.roll_count = clampInteger(seat.roll_count, 0, 999999, 0) + 1;
  const hotDice = seat.dice.every((die) => die.scored);
  if (hotDice) {
    seat.dice = tenThousandBlankDice();
    tenThousandRollDiceByIds(seat, seat.dice.map((die) => die.id));
  } else {
    tenThousandRollDiceByIds(seat, seat.dice.filter((die) => !die.scored).map((die) => die.id));
  }
  finishTenThousandRoll(seat);
}

// Press for a straight: keep five distinct faces and re-roll the lone sixth die,
// betting it lands the missing face for a 1-2-3-4-5-6 (1,500 + hot dice). It is
// all-or-nothing — any other result busts the turn like a farkle. This is the
// only way to set aside non-scoring dice, allowed only because the bet's own
// downside (the bust) is the cost. Requires all six dice live, since a straight
// uses every die.
function attemptTenThousandStraight(seat, diceIds) {
  if (seat.phase !== "rolled") throw new Error("Roll before going for a straight.");
  if (seat.dice.length !== 6 || seat.dice.some((die) => die.scored)) {
    throw new Error("Going for a straight needs all six dice in play.");
  }
  const ids = new Set((Array.isArray(diceIds) ? diceIds : []).map((id) => String(id)));
  if (ids.size !== 5) throw new Error("Keep five dice to go for a straight.");
  const kept = seat.dice.filter((die) => ids.has(die.id));
  if (kept.length !== 5) throw new Error("Kept dice are not available.");
  if (new Set(kept.map((die) => die.value)).size !== 5) {
    throw new Error("The five kept dice must show five different faces.");
  }
  seat.roll_count = clampInteger(seat.roll_count, 0, 999999, 0) + 1;
  const reroll = seat.dice.filter((die) => !ids.has(die.id));
  // The lone re-rolled die — exposed on last_move so only it tumbles, not all six.
  seat.straight_reroll_id = reroll.length ? reroll[0].id : null;
  tenThousandRollDiceByIds(seat, reroll.map((die) => die.id));
  seat.dice.forEach((die) => { die.rolling = false; });
  // Six distinct faces across six dice can only be 1-2-3-4-5-6, the straight.
  // Anything else busts, even if the dice happen to hold a lesser scoring play —
  // the bet was the straight, not "best available".
  const isStraight = new Set(seat.dice.map((die) => die.value)).size === 6;
  if (isStraight) {
    const score = tenThousandScoreValues(seat.dice.map((die) => die.value));
    seat.dice.forEach((die) => { die.selected = true; die.scored = true; });
    seat.turn_score += score.score; // 1,500
    seat.phase = "selected";
    seat.finish_state = "active";
  } else {
    resolveTenThousandFarkle(seat, false);
    // A failed straight is a plain bust: every die stays red. Suppress the
    // "missed scoring play" yellow highlight — the bet was the straight, so a
    // leftover 1 or 5 was never a play the player passed up.
    seat.farkle_from_straight = true;
  }
}

function tenThousandRollDiceByIds(seat, ids) {
  const rollingIds = new Set(ids);
  seat.dice.forEach((die) => {
    if (!rollingIds.has(die.id)) return;
    die.value = 1 + Math.floor(Math.random() * 6);
    die.selected = false;
    die.scored = false;
    die.rolling = true;
  });
}

// A roll always lands as a live "rolled" state. The farkle is NOT auto-detected:
// a human must spot (or fail to spot) a scoring play and declare a farkle
// themselves via declare_farkle. Bots evaluate their own keep in
// playTenThousandBotRound and farkle there when no scoring dice remain. Not
// revealing the bust is deliberate — an auto-farkle would tell the player a
// valid play exists whenever it does NOT fire.
function finishTenThousandRoll(seat) {
  seat.dice.forEach((die) => { die.rolling = false; });
  seat.phase = "rolled";
  seat.finish_state = "active";
  seat.farkle_from_straight = false;
}

// The player declares their own farkle (the "Red X"). It always busts the turn,
// even if a scoring play was actually available — that risk is the whole point.
function declareTenThousandFarkle(seat) {
  if (seat.phase !== "rolled") throw new Error("Roll before declaring a farkle.");
  resolveTenThousandFarkle(seat, false);
}

function acknowledgeTenThousandFarkle(game, seat) {
  if (seat.phase !== "farkled") throw new Error("There is no farkle to acknowledge.");
  resolveTenThousandFarkle(seat, true, false);
}

function selectTenThousandDice(seat, diceIds) {
  if (seat.phase !== "rolled" && seat.phase !== "selected") throw new Error("Roll before selecting dice.");
  const ids = new Set((Array.isArray(diceIds) ? diceIds : []).map((id) => String(id)));
  if (!ids.size) throw new Error("Select at least one die.");
  const dice = seat.dice.filter((die) => ids.has(die.id));
  if (dice.length !== ids.size || dice.some((die) => die.scored || !die.value)) throw new Error("Selected dice are not available.");
  const score = tenThousandScoreValues(dice.map((die) => die.value));
  if (!score.valid || score.score <= 0) throw new Error("Selected dice must all score.");
  dice.forEach((die) => {
    die.selected = true;
    die.scored = true;
  });
  seat.turn_score += score.score;
  seat.phase = "selected";
  seat.finish_state = "active";
}

// Combined "score the kept dice, then press your luck" — the green dice imply
// the score, so there is no separate score step. With no dice_ids it is a plain
// press (the hot-dice re-roll, e.g. after a straight leaves all six set aside).
// select-then-reroll is atomic: if either step throws, the whole move is
// rejected and nothing is persisted.
function scoreAndPressTenThousand(seat, diceIds) {
  if (Array.isArray(diceIds) && diceIds.length) selectTenThousandDice(seat, diceIds);
  rerollTenThousandDice(seat);
}

// Combined "score the kept dice, then bank". With no dice_ids it banks directly
// (e.g. the hot-dice total after a straight). The opening-minimum check inside
// bankTenThousandScore still applies and rejects-and-rolls-back if unmet.
function scoreAndBankTenThousand(game, mark, seat, diceIds) {
  if (Array.isArray(diceIds) && diceIds.length) selectTenThousandDice(seat, diceIds);
  bankTenThousandScore(game, mark, seat);
}

function bankTenThousandScore(game, mark, seat) {
  if (seat.phase !== "selected" || seat.turn_score <= 0) throw new Error("Select scoring dice before banking.");
  if (seat.turn_score < tenThousandBankMinimum(game, seat)) {
    throw new Error(`Score at least ${tenThousandOpeningMinimum(game)} to get on the board before you can bank.`);
  }
  seat.score += seat.turn_score;
  seat.round_score = seat.turn_score;
  seat.turn_score = 0;
  seat.dice = tenThousandBlankDice();
  seat.phase = "done";
  seat.finish_state = "banked";
  seat.resolved = true;
  if (seat.score >= game.target_score && !game.final_round) {
    game.final_round = true;
    game.final_trigger = mark;
  }
}

// Barrier: a round ends only once every seat has resolved (banked or farkled
// and acknowledged). The next round does not start until someone rolls again.
function maybeAdvanceTenThousandRound(game) {
  const marks = game.seat_order;
  if (!marks.length) return;
  if (!marks.every((mark) => game.players[mark].resolved)) return;
  if (marks.some((mark) => game.players[mark].score >= game.target_score)) {
    game.status = "complete";
    game.winner = tenThousandLeader(game);
    marks.forEach((mark) => { game.players[mark].phase = "done"; });
    game.last_move = { type: "complete", round: game.round, winner: game.winner };
    return;
  }
  game.round_pending_advance = true;
}

function startTenThousandRound(game) {
  const marks = game.seat_order;
  if (!marks.length) return;
  if (!game.round_pending_advance && !marks.every((mark) => game.players[mark].resolved)) return;
  game.round += 1;
  game.round_pending_advance = false;
  marks.forEach((mark) => {
    const seat = game.players[mark];
    seat.turn_score = 0;
    seat.round_score = 0;
    seat.dice = tenThousandBlankDice();
    seat.phase = "ready";
    seat.finish_state = "active";
    seat.resolved = false;
    seat.roll_count = 0;
    seat.bot_trajectory = [];
    seat.farkle_from_straight = false;
  });
  resolveTenThousandBots(game);
}

function tenThousandLeader(game) {
  let leader = null;
  let best = -1;
  game.seat_order.forEach((mark) => {
    const score = game.players[mark].score;
    if (score > best) { best = score; leader = mark; }
  });
  return leader;
}

function resolveTenThousandBots(game) {
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    if (seat.is_bot && !seat.resolved) playTenThousandBotRound(game, mark, seat);
  });
}

function resolveTenThousandFarkle(seat, acknowledged = false, countFarkle = true) {
  seat.turn_score = 0;
  seat.round_score = 0;
  if (countFarkle) seat.farkles += 1;
  seat.phase = acknowledged ? "done" : "farkled";
  seat.finish_state = acknowledged ? "farkled_acked" : "farkled_pending_ack";
  seat.resolved = Boolean(acknowledged);
}

// Plays a bot's entire round in one shot (Level 2 policy by default). Records a
// per-roll trajectory of running-total snapshots so the client can replay the
// bot "playing along" in step with the human's rolls. trajectory[0] is the
// pre-roll baseline (the bot's carried score); each later entry is the state
// after one of the bot's rolls. total = score + turn_score, which is the
// running total while rolling, the new total after banking, and the carried
// total after a farkle. `hot` accumulates each time the bot scores all six dice.
function playTenThousandBotRound(game, mark, seat) {
  const trajectory = [{ total: seat.score, status: "rolling", hot: 0 }];
  let hot = 0;
  const snap = (status) => trajectory.push({ total: seat.score + seat.turn_score, status, hot });
  const finish = () => { seat.bot_trajectory = trajectory; };
  for (let guard = 0; guard < 50; guard += 1) {
    if (seat.phase === "ready") rollTenThousandDice(seat);
    else if (seat.phase === "selected") rerollTenThousandDice(seat);
    if (seat.resolved) { finish(); return; }
    const level = tenThousandBotLevel(seat);
    const overlord = level === 4;
    // Decide which dice to keep. The Overlord may keep a single die as part of a
    // triple hunt (huntReroll), which forces a re-roll below.
    let keepIds;
    let huntReroll = false;
    if (overlord) {
      const plan = overlordKeepPlan(seat.dice);
      keepIds = plan.ids;
      huntReroll = plan.hunt;
    } else {
      const keepPlan = tenThousandBotKeep(level, seat.dice);
      const keep = tenThousandBotShouldMisplay(level)
        ? tenThousandBotAlternativeKeep(seat.dice, keepPlan.ids)
        : keepPlan;
      keepIds = keep.ids;
    }
    // No scoring dice (rolls are no longer auto-farkled) is the bot's bust: it
    // resolves and acknowledges in one step, counting the farkle.
    if (!keepIds.length) { resolveTenThousandFarkle(seat, true, true); snap("farkled"); finish(); return; }
    selectTenThousandDice(seat, keepIds);
    if (seat.dice.length && seat.dice.every((die) => die.scored)) hot += 1; // hot dice
    let wantBank;
    if (overlord) {
      const remaining = seat.dice.filter((die) => !die.scored).length;
      const wouldWin = seat.score + seat.turn_score >= game.target_score;
      // Press through the hunt; with only 1-2 dice left to throw, bank a turn
      // worth more than 400, otherwise keep pressing. Always bank a winning turn.
      wantBank = wouldWin || (!huntReroll && (remaining === 1 || remaining === 2) && seat.turn_score > 400);
    } else {
      const shouldBank = tenThousandBotShouldBank(game, seat, level);
      wantBank = tenThousandBotShouldMisplay(level) ? !shouldBank : shouldBank;
    }
    // Only bank when it is legal: below the opening minimum the bot must keep
    // pressing (or eventually bust), exactly like a human with bank disabled.
    if (wantBank && tenThousandCanBank(game, seat)) {
      bankTenThousandScore(game, mark, seat);
      snap("banked");
      finish();
      return;
    }
    snap("rolling");
  }
  // Safety: never loop forever — bank whatever is on the table if it is legal,
  // otherwise resolve without banking so the round can still advance.
  if (tenThousandCanBank(game, seat)) { bankTenThousandScore(game, mark, seat); snap("banked"); }
  else if (!seat.resolved) { resolveTenThousandFarkle(seat, true, false); snap("farkled"); }
  finish();
}

function tenThousandBotKeep(level, dice) {
  if (level <= 1) return sproutTenThousandKeep(dice);
  return bestTenThousandKeep(dice);
}

// Overlord (level 4) plays a high-variance three-of-a-kind hunt: when it rolls
// 4+ dice with no triple and cannot clear them all, it keeps a single die — a 1,
// or a 5 only if there are no 1s — and re-rolls the rest fishing for a triple.
// With a triple in hand, all dice scoring, or 3 or fewer dice, it takes the best
// keep and plays normally. Returns { ids, hunt }; the bank side (press through
// the hunt; bank over 400 with 1-2 dice left) lives in playTenThousandBotRound.
function overlordKeepPlan(dice) {
  const avail = (Array.isArray(dice) ? dice : []).filter((die) => !die.scored && die.value >= 1 && die.value <= 6);
  const best = bestTenThousandKeep(dice);
  const clearsAll = best.score > 0 && best.ids.length === avail.length;
  const counts = tenThousandCounts(avail.map((die) => die.value));
  const hasTriple = counts.some((count) => count >= 3);
  if (avail.length >= 4 && !clearsAll && !hasTriple) {
    const one = avail.find((die) => die.value === 1);
    const five = avail.find((die) => die.value === 5);
    const pick = one || five;
    if (pick) return { ids: [pick.id], hunt: true };
    return { ids: [], hunt: false }; // no 1/5 and no triple — a true farkle
  }
  return { ids: best.ids, hunt: false };
}

function tenThousandBotShouldMisplay(level) {
  return Math.random() < tenThousandBotErrorRate(level);
}

function tenThousandBotErrorRate(level) {
  if (level <= 1) return 0.3;
  if (level === 2) return 0.2;
  if (level === 3) return 0.1;
  return 0;
}

function tenThousandBotAlternativeKeep(dice, preferredIds) {
  const options = tenThousandAllKeepOptions(dice)
    .filter((choice) => choice.ids.length && !setsEqual(choice.ids, preferredIds))
    .sort((left, right) => left.score - right.score || left.ids.length - right.ids.length);
  return options[0] || { ids: [], score: 0 };
}

function tenThousandBotShouldBank(game, seat, level) {
  if (seat.score + seat.turn_score >= game.target_score) return true;
  const remaining = tenThousandRemainingDice(seat);
  const threshold = TEN_THOUSAND_BOT_BANK[remaining] || 350;
  if (level <= 1) return seat.turn_score >= Math.max(50, threshold + 500);
  if (level === 2) return seat.turn_score >= Math.max(50, threshold + 250);
  if (level === 3) return seat.turn_score >= threshold;
  if (remaining <= 2) return seat.turn_score >= Math.max(50, threshold - 200);
  if (remaining >= 5) return seat.turn_score >= threshold - 25;
  return seat.turn_score >= Math.max(50, threshold - 100);
}

function tenThousandRemainingDice(seat) {
  const unscored = seat.dice.filter((die) => !die.scored).length;
  return unscored === 0 ? TEN_THOUSAND_DICE_COUNT : unscored;
}

// Maximal scoring subset of the seat's still-rollable dice (used by bots and as
// the canonical "take everything that scores" keep).
function bestTenThousandKeep(dice) {
  const options = tenThousandAllKeepOptions(dice)
    .sort((left, right) => right.score - left.score || right.ids.length - left.ids.length);
  return options[0] || { ids: [], score: 0 };
}

function tenThousandAllKeepOptions(dice) {
  const avail = dice.filter((die) => !die.scored && die.value);
  const choices = [];
  if (avail.length === TEN_THOUSAND_DICE_COUNT) {
    const counts = tenThousandCounts(avail.map((die) => die.value));
    if (counts.every((count) => count === 1) || counts.filter((count) => count === 2).length === 3) {
      choices.push({ ids: avail.map((die) => die.id), score: 1500 });
    }
  }
  const total = 1 << avail.length;
  for (let mask = 1; mask < total; mask += 1) {
    const ids = [];
    const values = [];
    for (let index = 0; index < avail.length; index += 1) {
      if ((mask & (1 << index)) === 0) continue;
      ids.push(avail[index].id);
      values.push(avail[index].value);
    }
    const score = tenThousandScoreValues(values);
    if (score.valid) choices.push({ ids, score: score.score });
  }
  return choices;
}

function sproutTenThousandKeep(dice) {
  const avail = dice.filter((die) => !die.scored && die.value);
  if (!avail.length) return { ids: [], score: 0 };
  if (avail.length === TEN_THOUSAND_DICE_COUNT) {
    const counts = tenThousandCounts(avail.map((die) => die.value));
    if (counts.every((count) => count === 1) || counts.filter((count) => count === 2).length === 3) {
      return { ids: avail.map((die) => die.id), score: 1500 };
    }
  }
  const byFace = new Map();
  avail.forEach((die) => {
    if (!byFace.has(die.value)) byFace.set(die.value, []);
    byFace.get(die.value).push(die);
  });
  const triples = [...byFace.entries()]
    .filter(([face, list]) => list.length >= 3)
    .map(([face, list]) => ({
      face: Number(face),
      ids: list.slice(0, 3).map((die) => die.id),
      score: tenThousandScoreValues(list.slice(0, 3).map((die) => die.value)).score,
    }))
    .sort((left, right) => right.score - left.score || left.face - right.face);
  if (triples.length) return { ids: triples[0].ids, score: triples[0].score };
  if (byFace.has(1)) return { ids: byFace.get(1).map((die) => die.id), score: byFace.get(1).length * 100 };
  if (byFace.has(5)) return { ids: byFace.get(5).map((die) => die.id), score: byFace.get(5).length * 50 };
  return { ids: [], score: 0 };
}

function setsEqual(left, right) {
  const a = [...new Set((Array.isArray(left) ? left : []).map(String))].sort();
  const b = [...new Set((Array.isArray(right) ? right : []).map(String))].sort();
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function tenThousandCanRoll(game, seat) {
  if (game.status !== "playing") return false;
  // When the round is complete, any resolved seat may roll to start the next one.
  if (game.round_pending_advance) return true;
  return !seat.resolved && seat.phase === "ready";
}

function tenThousandCanReroll(game, seat) {
  return game.status === "playing" && !seat.resolved && seat.phase === "selected";
}

function tenThousandCanBank(game, seat) {
  return game.status === "playing" && !seat.resolved && seat.phase === "selected"
    && seat.turn_score >= tenThousandBankMinimum(game, seat);
}

// Opening rule: until a seat is "on the board" (has banked anything) the first
// bank must reach the opening minimum. After that any positive score may bank.
function tenThousandBankMinimum(game, seat) {
  return seat.score > 0 ? TEN_THOUSAND_BANK_MINIMUM : tenThousandOpeningMinimum(game);
}

// The opening bar starts at the host-chosen base (default 500) and, by house
// rule, drops 50 each round, never below the normal bank minimum.
function tenThousandOpeningMinimum(game) {
  const round = Math.max(1, Number(game && game.round) || 1);
  return Math.max(TEN_THOUSAND_BANK_MINIMUM, tenThousandOpeningBase(game) - (round - 1) * 50);
}

function tenThousandOpeningBase(game) {
  return clampInteger(game && game.opening_base, 0, TEN_THOUSAND_OPENING_BASE_MAX, TEN_THOUSAND_OPENING_MINIMUM);
}

function tenThousandScoringOptions(seat) {
  if (seat.phase !== "rolled" && seat.phase !== "selected") return [];
  return seat.dice
    .filter((die) => !die.scored && die.value)
    .filter((die) => tenThousandScoreValues([die.value]).valid)
    .map((die) => die.id);
}

function tenThousandHasAnyScoringSet(values) {
  const clean = values.filter((value) => Number.isInteger(value) && value >= 1 && value <= 6);
  if (!clean.length) return false;
  if (clean.some((value) => value === 1 || value === 5)) return true;
  const counts = tenThousandCounts(clean);
  if (counts.some((count) => count >= 3)) return true;
  // Three pairs is a scoring combo even with no 1s, 5s, or triple (e.g. 2 2 4 4 6 6).
  if (clean.length === 6 && counts.filter((count) => count === 2).length === 3) return true;
  return false;
}

// Scores a selected set of dice values per the Default Scoring Set:
//   1. Full six-dice combos (highest priority): straight / three pairs / two
//      triplets, each consuming all six dice.
//   2. n-of-a-kind with the doubling rule: each die past three doubles the
//      three-of-a-kind value (four x2, five x4, six x8).
//   3. Leftover single 1s (100) and 5s (50).
// Any other leftover die makes the whole set invalid (it cannot be set aside).
function tenThousandScoreValues(values) {
  const clean = values.map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 6);
  if (clean.length !== values.length || !clean.length) return { valid: false, score: 0 };
  const counts = tenThousandCounts(clean);
  if (clean.length === 6) {
    if (counts.every((count) => count === 1)) return { valid: true, score: 1500 }; // straight
    if (counts.filter((count) => count === 2).length === 3) return { valid: true, score: 1500 }; // three pairs
    if (counts.filter((count) => count === 3).length === 2) return { valid: true, score: 2500 }; // two triplets
  }
  let score = 0;
  for (let index = 0; index < counts.length; index += 1) {
    const face = index + 1;
    if (counts[index] >= 3) {
      const base = face === 1 ? 1000 : face * 100;
      score += base * Math.pow(2, counts[index] - 3); // doubling: 4->x2, 5->x4, 6->x8
      counts[index] = 0;
    }
  }
  score += counts[0] * 100;
  counts[0] = 0;
  score += counts[4] * 50;
  counts[4] = 0;
  if (counts.some((count) => count > 0)) return { valid: false, score: 0 };
  return { valid: score > 0, score };
}

function tenThousandCounts(values) {
  const counts = [0, 0, 0, 0, 0, 0];
  values.forEach((value) => {
    counts[value - 1] += 1;
  });
  return counts;
}

// Host lobby option: set the "get on the board" opening bar. The Worker's start
// handler calls this so the 10,000 clamp bounds stay inside this module.
function setTenThousandOpeningBase(game, value) {
  game.opening_base = clampInteger(value, 0, TEN_THOUSAND_OPENING_BASE_MAX, TEN_THOUSAND_OPENING_MINIMUM);
}

export {
  newTenThousandGame,
  initTenThousandSeats,
  setTenThousandOpeningBase,
  tenThousandGameToDict,
  makeTenThousandMove,
  tenThousandBotKeep,
  tenThousandBotShouldBank,
  tenThousandBotErrorRate,
  tenThousandBotShouldMisplay,
  tenThousandBotAlternativeKeep,
  bestTenThousandKeep,
  sproutTenThousandKeep,
  overlordKeepPlan,
  tenThousandScoreValues,
  tenThousandHasAnyScoringSet,
};
