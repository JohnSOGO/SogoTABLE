// Hidden Isles — rules. Two crews race to find their own islands on a 5×5
// chart of words. Each crew's Navigator sees the secret chart and gives a
// one-word clue + number; the crew taps words. The Kraken loses on the spot.
//
// Pure: no DOM, fetch, storage or timers. Time and randomness come through
// the clock/random seams so tests and replays are deterministic.
// Contract: src/sogotable/static/games/hidden-isles/PLAN.md.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { cleanGameId } from "../../game-catalog.js";
import { WORDS } from "./words.js";
import { normalizeClue, clueProblem } from "./clues.js";
import { chooseClue, chooseGuess, clueIdeas, bestPointer } from "./ai.js";

export const HIDDEN_ISLES_GAME_ID = GAME_IDS.hiddenIsles;
export const TEAMS = ["A", "B"];
export const BOARD_SIZE = 25;
export const MIN_SEATS = 4;
export const NUDGE_AFTER_MS = 90 * 1000;
const PACKS = ["classic", "easy", "mixed"];
const EVENT_CAP = 60;
const LOG_CAP = 40;

let hiRandom = Math.random;
export function setHiddenIslesRandom(fn) {
  hiRandom = typeof fn === "function" ? fn : Math.random;
}
let hiClock = () => Date.now();
export function setHiddenIslesClock(fn) {
  hiClock = typeof fn === "function" ? fn : () => Date.now();
}

export function isHiddenIslesGame(game) {
  if (!game || !game.game_id) return false;
  try { return cleanGameId(game.game_id) === HIDDEN_ISLES_GAME_ID; } catch { return String(game.game_id).trim() === HIDDEN_ISLES_GAME_ID; }
}

const other = (team) => (team === "A" ? "B" : "A");

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function botLevel(seat) {
  const level = Number(seat && (seat.bot_level !== undefined ? seat.bot_level : seat.level));
  return Number.isInteger(level) && level >= 1 && level <= 4 ? level : 2;
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(hiRandom() * (i + 1)) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------- options

export function normalizeHiddenIslesOptions(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  return {
    pack: PACKS.includes(o.pack) ? o.pack : "classic",
    clue_ideas: o.clue_ideas === true || o.clue_ideas === "true" || o.clue_ideas === "on",
    team_marks: !(o.team_marks === false || o.team_marks === "false" || o.team_marks === "off"),
  };
}

// Only an explicit `hidden_isles_options` changes the table's rules: the start
// route re-applies start options with unrelated library inputs after a reset.
export function setHiddenIslesOptions(game, payload) {
  const raw = payload && payload.hidden_isles_options;
  game.options = normalizeHiddenIslesOptions(raw && typeof raw === "object" ? raw : game.options);
}

// Rematch keeps the table's rules and crews; the Navigator role moves on to
// the next member of each crew.
export function carryHiddenIslesOnReset(prev, next) {
  if (!isHiddenIslesGame(prev)) return;
  if (prev.options) setHiddenIslesOptions(next, { hidden_isles_options: prev.options });
  const teams = {};
  const guides = {};
  (prev.seat_order || []).forEach((mark) => {
    const seat = prev.players && prev.players[mark];
    if (!seat || !TEAMS.includes(seat.team)) return;
    teams[mark] = seat.team;
    if (seat.role === "guide") guides[seat.team] = mark;
  });
  next.carry = { teams, guides };
}

// ---------------------------------------------------------------- create / seats

export function newHiddenIslesGame() {
  return {
    game_id: HIDDEN_ISLES_GAME_ID,
    status: "playing",
    phase: "setup",
    options: normalizeHiddenIslesOptions(null),
    round: 1,
    turn: 0,
    seat_order: [],
    players: {},
    board: [],
    start_team: null,
    turn_team: null,
    phase_started_at: 0,
    clue: null,
    guesses_made: 0,
    guesses_left: null,
    marks: {},
    log: [],
    remaining: { A: 0, B: 0 },
    winner_team: null,
    end_reason: null,
    winner: null,
    events: [],
    event_seq: 0,
    move_count: 0,
  };
}

export function initHiddenIslesSeats(game, seats) {
  game.options = normalizeHiddenIslesOptions(game.options);
  // `carry` (last game's crews) stays in the blob: initSeats may run twice on a
  // reset and must land on the same crews both times. It is never projected.
  const carry = game.carry && typeof game.carry === "object" ? game.carry : { teams: {}, guides: {} };
  const fresh = newHiddenIslesGame();
  Object.keys(fresh).forEach((k) => { if (k !== "options") game[k] = fresh[k]; });
  (Array.isArray(seats) ? seats : []).forEach((seat) => {
    const mark = String(seat && seat.mark || "").trim();
    if (!mark || game.players[mark]) return;
    const isBot = Boolean(seat.kind === "bot" || seat.is_bot === true);
    game.seat_order.push(mark);
    game.players[mark] = { is_bot: isBot, level: isBot ? botLevel(seat) : 0, team: null, role: "guesser", act_at: 0 };
  });
  if (game.seat_order.length < MIN_SEATS) {
    throw new Error("Hidden Isles needs at least 4 seats — two per crew. Invite players or bots to fill the table.");
  }
  // Crews: keep last game's crews, then deal newcomers to the smaller crew.
  game.seat_order.forEach((mark, i) => {
    const kept = carry.teams && carry.teams[mark];
    if (TEAMS.includes(kept)) game.players[mark].team = kept;
    else if (!Object.keys(carry.teams || {}).length) game.players[mark].team = i % 2 === 0 ? "A" : "B";
  });
  game.seat_order.forEach((mark) => {
    if (game.players[mark].team) return;
    const sizes = crewSizes(game);
    game.players[mark].team = sizes.A <= sizes.B ? "A" : "B";
  });
  balanceCrews(game);
  // Navigators: rotate to the member after last game's Navigator.
  TEAMS.forEach((team) => {
    const members = crew(game, team);
    const prevGuide = carry.guides && carry.guides[team];
    const at = members.indexOf(prevGuide);
    const guide = at >= 0 ? members[(at + 1) % members.length] : members[0];
    if (guide) game.players[guide].role = "guide";
  });
  fixGuides(game);
  if (!humans(game).length) { // all-bot table plays straight through
    deal(game, hiClock());
    runBots(game, hiClock());
  }
}

function crew(game, team) {
  return game.seat_order.filter((m) => game.players[m].team === team);
}
function crewSizes(game) {
  return { A: crew(game, "A").length, B: crew(game, "B").length };
}
function humans(game) {
  return game.seat_order.filter((m) => !game.players[m].is_bot);
}
function guideOf(game, team) {
  return crew(game, team).find((m) => game.players[m].role === "guide") || null;
}
function guessers(game, team) {
  return crew(game, team).filter((m) => game.players[m].role !== "guide");
}

// A crew of one can't play; move the last-seated member of the bigger crew.
function balanceCrews(game) {
  let guard = 0;
  while (guard++ < 20) {
    const sizes = crewSizes(game);
    const small = sizes.A < sizes.B ? "A" : "B";
    if (sizes[small] >= 2 || sizes[other(small)] - sizes[small] < 2) return;
    const movers = crew(game, other(small));
    game.players[movers[movers.length - 1]].team = small;
  }
}

// Every crew with members has exactly one Navigator.
function fixGuides(game) {
  TEAMS.forEach((team) => {
    const members = crew(game, team);
    const guides = members.filter((m) => game.players[m].role === "guide");
    if (!guides.length && members.length) {
      const pick = members.find((m) => !game.players[m].is_bot) || members[0];
      game.players[pick].role = "guide";
    }
    guides.slice(1).forEach((m) => { game.players[m].role = "guesser"; });
  });
}

function setupProblem(game) {
  for (const team of TEAMS) {
    const members = crew(game, team);
    if (members.length < 2) return `Each crew needs at least 2 members (a Navigator and someone to guess).`;
    if (!guideOf(game, team)) return `Each crew needs a Navigator.`;
  }
  return null;
}

// ---------------------------------------------------------------- deal / turns

function poolFor(pack) {
  if (pack === "easy") return WORDS.filter((w) => w.easy);
  if (pack === "mixed") return WORDS;
  return WORDS.filter((w) => !w.easy).length >= 60 ? WORDS.filter((w) => !w.easy).concat(shuffle(WORDS.filter((w) => w.easy)).slice(0, 40)) : WORDS;
}

function pushEvent(game, event) {
  game.event_seq += 1;
  game.events.push({ seq: game.event_seq, ...event });
  if (game.events.length > EVENT_CAP) game.events = game.events.slice(-EVENT_CAP);
}

function deal(game, now) {
  const words = shuffle(poolFor(game.options.pack).map((w) => w.word)).slice(0, BOARD_SIZE);
  const start = hiRandom() < 0.5 ? "A" : "B";
  const keys = shuffle([
    ...Array(9).fill(start), ...Array(8).fill(other(start)), ...Array(7).fill("neutral"), "trap",
  ]);
  game.board = words.map((word, index) => ({ index, word, key: keys[index], revealed: false, revealed_by: null, revealed_turn: null }));
  game.start_team = start;
  game.turn_team = start;
  game.turn = 1;
  game.phase = "clue";
  game.phase_started_at = now;
  game.clue = null;
  game.guesses_made = 0;
  game.guesses_left = null;
  game.marks = {};
  game.log = [];
  recount(game);
  pushEvent(game, { type: "deal", start_team: start });
  scheduleBots(game, now);
}

function recount(game) {
  game.remaining = { A: 0, B: 0 };
  game.board.forEach((t) => { if (!t.revealed && TEAMS.includes(t.key)) game.remaining[t.key] += 1; });
}

function switchTurn(game, reason, now) {
  const ended = game.turn_team;
  game.turn += 1;
  game.turn_team = other(ended);
  game.phase = "clue";
  game.phase_started_at = now;
  game.clue = null;
  game.guesses_made = 0;
  game.guesses_left = null;
  game.marks = {};
  pushEvent(game, { type: "turn", team: game.turn_team, ended, reason });
  scheduleBots(game, now);
}

function completeGame(game, winnerTeam, reason) {
  game.status = "complete";
  game.winner_team = winnerTeam;
  game.end_reason = reason;
  game.winner = guideOf(game, winnerTeam) || crew(game, winnerTeam)[0] || null;
  game.seat_order.forEach((m) => { game.players[m].act_at = 0; });
  pushEvent(game, { type: "win", team: winnerTeam, reason });
}

// ---------------------------------------------------------------- bots

function botDelayMs(kind) {
  const base = kind === "clue" ? 5000 : 2500;
  const spread = kind === "clue" ? 4000 : 1500;
  return base + Math.floor(hiRandom() * spread);
}

// Who (if any) is a bot that must act now, and when.
function botActor(game) {
  if (game.status !== "playing") return null;
  const team = game.turn_team;
  if (game.phase === "clue") {
    const g = guideOf(game, team);
    return g && game.players[g].is_bot ? g : null;
  }
  if (game.phase === "guess") {
    const crewGuessers = guessers(game, team);
    if (crewGuessers.some((m) => !game.players[m].is_bot)) return null; // humans guess; bots only point
    return crewGuessers[0] || null;
  }
  return null;
}

function scheduleBots(game, now) {
  game.seat_order.forEach((m) => { game.players[m].act_at = 0; });
  const actor = botActor(game);
  if (actor) game.players[actor].act_at = now + botDelayMs(game.phase);
}

function botStep(game, mark, now) {
  const seat = game.players[mark];
  if (game.phase === "clue") {
    applyClue(game, mark, chooseClue(game.board, game.turn_team, seat.level, hiRandom), now);
  } else {
    const choice = chooseGuess(game.board, { clue: game.clue, guesses_made: game.guesses_made }, seat.level, hiRandom);
    if (choice.pass && game.guesses_made >= 1) switchTurn(game, "pass", now);
    else applyGuess(game, mark, choice.pass ? firstHidden(game) : choice.index, now);
  }
}

function firstHidden(game) {
  const t = game.board.find((x) => !x.revealed);
  return t ? t.index : 0;
}

// Release bots whose think-time has passed. With no humans seated, time is
// ignored and the table plays straight through.
function runBots(game, now) {
  const noHumans = !humans(game).length;
  let steps = 0;
  let guard = 0;
  while (game.status === "playing" && game.phase !== "setup" && guard++ < 500) {
    const actor = botActor(game);
    if (!actor) break;
    const seat = game.players[actor];
    if (!noHumans && !(seat.act_at > 0 && seat.act_at <= now)) break;
    botStep(game, actor, now);
    steps += 1;
    if (game.status === "playing" && botActor(game) === actor && game.phase === "guess") {
      seat.act_at = now + botDelayMs("guess"); // next guess of the same bot: think again
    }
  }
  return steps;
}

// ---------------------------------------------------------------- actions

function applyClue(game, mark, raw, now) {
  const word = normalizeClue(raw && raw.word);
  const clash = clueProblem(word, game.board.filter((t) => !t.revealed).map((t) => t.word));
  if (clash) {
    throw new Error(`"${word.toUpperCase()}" is too close to ${clash.toUpperCase()} on the chart — pick another clue.`);
  }
  const unlimited = raw.unlimited === true || raw.unlimited === "true";
  const count = unlimited ? 0 : clampInt(raw.count, 0, 9, NaN);
  if (!Number.isFinite(count)) throw new Error("Pick a number from 0 to 9, or unlimited.");
  game.clue = { word, count, unlimited, by: mark, turn: game.turn };
  game.guesses_made = 0;
  game.guesses_left = unlimited || count === 0 ? null : count + 1;
  game.phase = "guess";
  game.phase_started_at = now;
  game.marks = {};
  game.log.push({ turn: game.turn, team: game.turn_team, by: mark, word, count, unlimited, results: [] });
  if (game.log.length > LOG_CAP) game.log = game.log.slice(-LOG_CAP);
  pushEvent(game, { type: "clue", team: game.turn_team, by: mark, word, count, unlimited });
  // Bot crew mates of a human crew drop a pointer on their best guess.
  if (game.options.team_marks) {
    guessers(game, game.turn_team).forEach((m) => {
      if (!game.players[m].is_bot) return;
      const idx = bestPointer(game.board, game.clue);
      if (idx !== null && !botActor(game)) setMark(game, m, idx);
    });
  }
  scheduleBots(game, now);
}

function applyGuess(game, mark, index, now) {
  const tile = game.board[index];
  const team = game.turn_team;
  tile.revealed = true;
  tile.revealed_by = mark;
  tile.revealed_turn = game.turn;
  game.guesses_made += 1;
  if (game.guesses_left !== null) game.guesses_left -= 1;
  Object.keys(game.marks).forEach((k) => { if (Number(k) === index) delete game.marks[k]; });
  recount(game);
  const entry = game.log[game.log.length - 1];
  if (entry && entry.turn === game.turn) entry.results.push({ index, word: tile.word, key: tile.key });
  pushEvent(game, { type: "reveal", team, by: mark, index, word: tile.word, key: tile.key });
  if (tile.key === "trap") { completeGame(game, other(team), "kraken"); return; }
  const done = TEAMS.find((t) => game.remaining[t] === 0);
  if (done) { completeGame(game, done, "found_all"); return; }
  if (tile.key === "neutral") { switchTurn(game, "sandbar", now); return; }
  if (tile.key !== team) { switchTurn(game, "rival", now); return; }
  if (game.guesses_left === 0) switchTurn(game, "out_of_guesses", now);
}

function setMark(game, mark, index) {
  Object.keys(game.marks).forEach((k) => {
    game.marks[k] = game.marks[k].filter((m) => m !== mark);
    if (!game.marks[k].length) delete game.marks[k];
  });
  if (index === null) return;
  game.marks[index] = [...(game.marks[index] || []), mark];
}

function tileIndex(game, raw) {
  const index = Number.parseInt(raw, 10);
  if (!Number.isInteger(index) || index < 0 || index >= game.board.length) throw new Error("Pick a word on the chart.");
  return index;
}

function setupAction(game, mark, type, action) {
  const seat = game.players[mark];
  if (type === "JOIN_TEAM") {
    const team = String(action.team || "");
    if (!TEAMS.includes(team)) throw new Error("Pick a crew.");
    if (seat.team === team) return;
    seat.team = team;
    seat.role = "guesser";
  } else if (type === "BE_GUIDE") {
    crew(game, seat.team).forEach((m) => { game.players[m].role = "guesser"; });
    seat.role = "guide";
  } else if (type === "SHUFFLE_TEAMS") {
    shuffle(game.seat_order).forEach((m, i) => {
      game.players[m].team = i % 2 === 0 ? "A" : "B";
      game.players[m].role = "guesser";
    });
  } else if (type === "DEAL") {
    const problem = setupProblem(game);
    if (problem) throw new Error(problem);
    deal(game, hiClock());
    return;
  } else {
    throw new Error("The crews are still getting ready — wait for someone to set sail.");
  }
  fixGuides(game);
}

export function makeHiddenIslesMove(game, mark, action) {
  normalizeHiddenIslesGame(game);
  if (game.status === "complete") throw new Error("The game is already over.");
  const seat = Object.hasOwn(game.players, mark) ? game.players[mark] : null;
  if (!seat) throw new Error("You are not seated in this game.");
  if (seat.is_bot) throw new Error("Bot seats play automatically.");
  const a = action && typeof action === "object" ? action : {};
  const type = String(a.type || "").trim().toUpperCase();
  const now = hiClock();
  game.move_count += 1;

  if (game.phase === "setup") { setupAction(game, mark, type, a); return; }

  if (a.turn !== undefined && a.turn !== null) {
    const stamped = Math.trunc(Number(a.turn));
    if (stamped !== game.turn) {
      throw new Error(`That move was for turn ${stamped} — the table is on turn ${game.turn}. Refresh to catch up.`);
    }
  }
  if (type === "BOT_TICK") {
    if (!runBots(game, now)) throw new Error("No bot is ready yet.");
    return;
  }
  runBots(game, now); // bots whose time came go first, so server order stays fair
  if (game.status === "complete") throw new Error("The game just ended.");
  const team = game.turn_team;
  const onCrew = seat.team === team;

  switch (type) {
    case "CLUE":
      if (game.phase !== "clue") throw new Error("A clue has already been given this turn.");
      if (!onCrew || seat.role !== "guide") throw new Error("Only this crew's Navigator can give the clue.");
      applyClue(game, mark, a, now);
      break;
    case "GUESS": {
      if (game.phase !== "guess") throw new Error("Wait for the Navigator's clue.");
      if (!onCrew) throw new Error("It's the other crew's turn.");
      if (seat.role === "guide") throw new Error("Navigators can't guess — your crew taps the words.");
      const index = tileIndex(game, a.index);
      if (game.board[index].revealed) {
        if (game.board[index].revealed_turn === game.turn) return; // a crew mate beat you to it
        throw new Error("That word is already uncovered.");
      }
      applyGuess(game, mark, index, now);
      break;
    }
    case "PASS":
      if (game.phase !== "guess") throw new Error("There is nothing to pass yet.");
      if (!onCrew || seat.role === "guide") throw new Error("Only the guessing crew can end its turn.");
      if (game.guesses_made < 1) throw new Error("Make at least one guess before ending the turn.");
      switchTurn(game, "pass", now);
      break;
    case "MARK": {
      if (!game.options.team_marks) throw new Error("Crew pointers are turned off for this game.");
      if (game.phase !== "guess" || !onCrew || seat.role === "guide") throw new Error("Only the guessing crew can point at words.");
      const index = a.index === null ? null : tileIndex(game, a.index);
      if (index !== null && game.board[index].revealed) throw new Error("That word is already uncovered.");
      const already = index !== null && (game.marks[index] || []).includes(mark);
      setMark(game, mark, already ? null : index);
      break;
    }
    case "NUDGE": {
      if (now < game.phase_started_at + NUDGE_AFTER_MS) throw new Error("Give them a moment — you can nudge after 90 seconds.");
      if (game.phase === "clue") {
        const guide = guideOf(game, team);
        applyClue(game, guide, chooseClue(game.board, team, 2, hiRandom), now);
        pushEvent(game, { type: "nudge", team, by: mark, phase: "clue" });
      } else {
        if (game.guesses_made < 1) {
          const choice = chooseGuess(game.board, { clue: game.clue, guesses_made: 0 }, 2, hiRandom);
          applyGuess(game, mark, choice.pass ? firstHidden(game) : choice.index, now);
        }
        if (game.status === "playing" && game.turn_team === team) switchTurn(game, "nudge", now);
      }
      break;
    }
    default:
      throw new Error(`Unknown Hidden Isles action "${type || "(none)"}".`);
  }
  runBots(game, now);
}

// ---------------------------------------------------------------- projection

export function hiddenIslesGameToDict(game) {
  normalizeHiddenIslesGame(game);
  const players = game.seat_order.map((mark) => {
    const s = game.players[mark];
    return { mark, is_bot: s.is_bot, level: s.level, team: s.team, role: s.role, act_at: s.is_bot ? s.act_at : 0 };
  });
  const dict = {
    game_id: game.game_id,
    status: game.status,
    phase: game.phase,
    round: game.round,
    turn: game.turn,
    turn_team: game.turn_team,
    start_team: game.start_team,
    options: { ...game.options },
    players,
    seat_order: [...game.seat_order],
    board: game.board.map((t) => ({ ...t })),
    clue: game.clue ? { ...game.clue } : null,
    guesses_made: game.guesses_made,
    guesses_left: game.guesses_left,
    marks: structuredClone(game.marks),
    log: structuredClone(game.log),
    remaining: { ...game.remaining },
    winner_team: game.winner_team,
    end_reason: game.end_reason,
    winner: game.winner,
    events: structuredClone(game.events),
    move_count: game.move_count,
    server_now: hiClock(),
    phase_started_at: game.phase_started_at,
    nudge_after_ms: NUDGE_AFTER_MS,
  };
  if (game.phase === "setup") {
    const problem = setupProblem(game);
    dict.can_deal = !problem;
    dict.setup_problem = problem;
  }
  if (game.status === "playing" && game.phase === "clue" && game.options.clue_ideas) {
    dict.clue_ideas_for = guideOf(game, game.turn_team);
    dict.clue_ideas = clueIdeas(game.board, game.turn_team);
  }
  return dict;
}

// Per-viewer mask: face-down keys only for Navigators (or once the game ends);
// clue ideas only for the Navigator whose turn it is.
export function hiddenIslesGameToDictForViewer(dict, viewerMark) {
  const out = structuredClone(dict);
  const me = (out.players || []).find((p) => p.mark === viewerMark) || null;
  out.you = me ? { mark: me.mark, team: me.team, role: me.role } : null;
  const seesChart = out.status === "complete" || (me && me.role === "guide");
  if (!seesChart) out.board = (out.board || []).map((t) => (t.revealed ? t : { ...t, key: null }));
  if (!me || out.clue_ideas_for !== me.mark) delete out.clue_ideas;
  delete out.clue_ideas_for;
  return out;
}

// Team game: win-only for now (stats has no team concept) — no leaderboard.
export function hiddenIslesScoreByMark() {
  return null;
}

// ---------------------------------------------------------------- normalize

export function normalizeHiddenIslesGame(game) {
  game.game_id = HIDDEN_ISLES_GAME_ID;
  game.status = game.status === "complete" ? "complete" : "playing";
  game.phase = ["setup", "clue", "guess"].includes(game.phase) ? game.phase : "setup";
  game.options = normalizeHiddenIslesOptions(game.options);
  game.round = 1;
  game.turn = clampInt(game.turn, 0, 99999, 0);
  game.move_count = clampInt(game.move_count, 0, 9999999, 0);
  game.event_seq = clampInt(game.event_seq, 0, 9999999, 0);
  game.seat_order = Array.isArray(game.seat_order) ? [...new Set(game.seat_order.map(String))] : [];
  if (!game.players || typeof game.players !== "object") game.players = {};
  game.seat_order = game.seat_order.filter((m) => game.players[m] && typeof game.players[m] === "object");
  game.seat_order.forEach((mark) => {
    const s = game.players[mark];
    s.is_bot = Boolean(s.is_bot);
    s.level = s.is_bot ? botLevel(s) : 0;
    if (!TEAMS.includes(s.team)) s.team = "A";
    s.role = s.role === "guide" ? "guide" : "guesser";
    s.act_at = Number.isFinite(Number(s.act_at)) ? Number(s.act_at) : 0;
  });
  game.board = Array.isArray(game.board) ? game.board.slice(0, BOARD_SIZE).map((t, index) => ({
    index,
    word: String(t && t.word || ""),
    key: ["A", "B", "neutral", "trap"].includes(t && t.key) ? t.key : "neutral",
    revealed: Boolean(t && t.revealed),
    revealed_by: t && t.revealed_by ? String(t.revealed_by) : null,
    revealed_turn: t && Number.isFinite(Number(t.revealed_turn)) && t.revealed_turn !== null ? Number(t.revealed_turn) : null,
  })) : [];
  if (game.phase !== "setup" && game.board.length !== BOARD_SIZE) game.phase = "setup";
  game.turn_team = TEAMS.includes(game.turn_team) ? game.turn_team : null;
  game.start_team = TEAMS.includes(game.start_team) ? game.start_team : null;
  if (game.phase !== "setup" && !game.turn_team) game.turn_team = "A";
  game.phase_started_at = Number.isFinite(Number(game.phase_started_at)) ? Number(game.phase_started_at) : 0;
  game.clue = game.clue && typeof game.clue === "object" ? game.clue : null;
  if (game.phase === "guess" && !game.clue) game.phase = "clue";
  game.guesses_made = clampInt(game.guesses_made, 0, 99, 0);
  game.guesses_left = game.guesses_left === null || game.guesses_left === undefined ? null : clampInt(game.guesses_left, 0, 10, null);
  if (!game.marks || typeof game.marks !== "object" || Array.isArray(game.marks)) game.marks = {};
  if (!Array.isArray(game.log)) game.log = [];
  if (!Array.isArray(game.events)) game.events = [];
  if (!game.remaining || typeof game.remaining !== "object") game.remaining = { A: 0, B: 0 };
  if (game.board.length) recount(game);
  game.winner_team = TEAMS.includes(game.winner_team) ? game.winner_team : null;
  game.end_reason = game.end_reason === "kraken" || game.end_reason === "found_all" ? game.end_reason : null;
  game.winner = game.winner ? String(game.winner) : null;
  return game;
}
