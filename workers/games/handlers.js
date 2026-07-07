// Per-game dispatch layer: the one table binding every game's rules module to the
// game-agnostic dispatchers (create / toDict / viewer projection / legalMoves /
// bot / seat init / reset carry-over / start options). The Worker entry stays a
// router — adding a game is one import + one row HERE, not another if/else chain
// in workers/sogotable-api.js. Must not import the Worker entry back (see
// docs/module-ownership.md).
// Game metadata is shared with the browser app from one registry module so the
// two can't drift. esbuild bundles this relative import into the Worker.
import { GAME_IDS } from "../../src/sogotable/static/games/registry.js";
import { cleanGameId, DEFAULT_GAME_ID } from "../game-catalog.js";
import { isBotSeat } from "./bots.js";
import {
  isBoxesGame,
  newBoxesGame,
  boxesGameToDict,
  boxesLegalMoves,
  makeBoxesMove,
  chooseBoxesBotMove,
} from "./boxes/rules.js";
import {
  BATTLESHIP_FLEET,
  newBattleshipGame,
  ensureBattleshipState,
  battleshipGameToDict,
  makeBattleshipMove,
  placeBattleshipFleet,
  battleshipLegalMoves,
  chooseBattleshipBotFleet,
  chooseBattleshipBotMove,
  battleshipGameToDictForViewer,
} from "./battleship/rules.js";
import {
  newTenThousandGame,
  initTenThousandSeats,
  setTenThousandOpeningBase,
  tenThousandGameToDict,
  makeTenThousandMove,
  isTenThousandGame,
} from "./ten-thousand/rules.js";
import {
  newYahtzeeGame, initYahtzeeSeats, makeYahtzeeMove, yahtzeeGameToDict, isYahtzeeGame,
} from "./yahtzee/rules.js";
import {
  newQuoridorGame,
  quoridorGameToDict,
  makeQuoridorMove,
  quoridorLegalMoves,
  chooseQuoridorBotMove,
} from "./quoridor/rules.js";
import {
  isTacticalGame,
  legalBoards,
  makeClassicMove,
  makeTacticalMove,
} from "./super-tic-tac-toe/rules.js";
import { chooseScoredBotMove } from "./super-tic-tac-toe/bot.js";
import {
  MAZEWRIGHT_GAME_ID, isMazewrightGame, newMazewrightGame, initMazewrightSeats, makeMazewrightMove, mazewrightGameToDict,
} from "./mazewright/rules.js";
import {
  RTTA_GAME_ID, isRttaGame, newRttaGame, initRttaSeats, makeRttaMove, rttaGameToDict,
} from "./rtta/rules.js";
import {
  ZOMBIE_DICE_GAME_ID, isZombieDiceGame, newZombieDiceGame, initZombieDiceSeats, makeZombieDiceMove, zombieDiceGameToDict,
} from "./zombie-dice/rules.js";
import {
  LIARS_DICE_GAME_ID, isLiarsDiceGame, newLiarsDiceGame, initLiarsDiceSeats, makeLiarsDiceMove, liarsDiceGameToDict, liarsDiceGameToDictForViewer,
} from "./liars-dice/rules.js";
import {
  NO_THANKS_GAME_ID, isNoThanksGame, newNoThanksGame, initNoThanksSeats, makeNoThanksMove, noThanksGameToDict, noThanksGameToDictForViewer,
} from "./no-thanks/rules.js";
import {
  HEARTS_GAME_ID, isHeartsGame, newHeartsGame, initHeartsSeats, setHeartsOptions, makeHeartsMove, heartsGameToDict, heartsGameToDictForViewer,
} from "./hearts/rules.js";
import {
  POTION_LAB_GAME_ID, isPotionLabGame, newPotionLabGame, initPotionLabSeats, makePotionLabMove, potionLabGameToDict, potionLabGameToDictForViewer,
} from "./potion-lab/rules.js";
import {
  MYSTIC_WOOD_GAME_ID, isMysticWoodGame, newMysticWoodGame, initMysticWoodSeats, makeMysticWoodMove, mysticWoodGameToDict,
} from "./mystic-wood/rules.js";

const TACTICAL_GAME_ID = GAME_IDS.tactical;
const BOXES_GAME_ID = GAME_IDS.boxes;
const BATTLESHIP_GAME_ID = GAME_IDS.battleship;
const QUORIDOR_GAME_ID = GAME_IDS.quoridor;
const TEN_THOUSAND_GAME_ID = GAME_IDS.tenThousand;
const YAHTZEE_GAME_ID = GAME_IDS.yahtzee;

// Per-game dispatch table. Now that every game's rules live in a module, the
// newGame/gameToDict/legalMoves/chooseBotMove dispatchers route through this one
// table instead of parallel if/else chains — adding a game is one row here (plus
// its rules module and `is<Game>Game` predicate). Super-Tic-Tac-Toe and Tactical
// are the inline default fallthrough (they share board creation and the macro
// `legal_boards` projection), so they have no row. `bot` is absent where a game
// resolves bots through its own engine (10,000) or has no entry.
// applyAction(game, mark, payload) normalises the heterogeneous per-game move
// signatures so /api/room/move and bot turns dispatch through this table too.
// Flags capture each game's real differences: enforcesTurnOrder (shell rejects
// out-of-turn moves vs rules validating internally), preMove (setup before the
// move, e.g. lazy bot fleets), resolvesBotsInternally (game runs its own bot
// turns, so the shell skips runBotTurns). Classic/Tactical stay the default.
// Host-start lifecycle fields: initSeats seeds per-seat game state at start (and
// re-seed on reset), applyStartOptions applies host lobby options at
// /api/room/start, carryOptionsOnReset carries host options into the fresh game
// a reset creates.
const GAME_HANDLERS = [
  { id: TEN_THOUSAND_GAME_ID, is: isTenThousandGame, create: newTenThousandGame, toDict: tenThousandGameToDict, legalMoves: () => [],
    applyAction: (game, mark, payload) => makeTenThousandMove(game, mark, payload.action || payload), resolvesBotsInternally: true,
    initSeats: initTenThousandSeats,
    // 10,000 host option: the opening "get on the board" bar, chosen in the
    // lobby. Clamp defensively; normalize re-derives the round-aware minimum.
    applyStartOptions: (game, payload) => {
      if (payload.opening_minimum !== undefined && payload.opening_minimum !== null) setTenThousandOpeningBase(game, payload.opening_minimum);
    },
    // Carry the host's 10,000 opening-bar choice into the fresh game so a reset
    // keeps the table's chosen rules instead of snapping back to the default.
    carryOptionsOnReset: (prevGame, nextGame) => {
      if (isTenThousandGame(prevGame) && prevGame.opening_base !== undefined) nextGame.opening_base = prevGame.opening_base;
    } },
  { id: YAHTZEE_GAME_ID, is: isYahtzeeGame, create: newYahtzeeGame, toDict: yahtzeeGameToDict, legalMoves: () => [],
    applyAction: (game, mark, payload) => makeYahtzeeMove(game, mark, payload.action || payload), resolvesBotsInternally: true, initSeats: initYahtzeeSeats },
  { id: MAZEWRIGHT_GAME_ID, is: isMazewrightGame, create: newMazewrightGame, toDict: mazewrightGameToDict, legalMoves: () => [],
    applyAction: (game, mark, payload) => makeMazewrightMove(game, mark, payload.action || payload), resolvesBotsInternally: true, initSeats: initMazewrightSeats },
  { id: RTTA_GAME_ID, is: isRttaGame, create: newRttaGame, toDict: rttaGameToDict, legalMoves: () => [],
    applyAction: (game, mark, payload) => makeRttaMove(game, mark, payload.action || payload), resolvesBotsInternally: true, initSeats: initRttaSeats },
  { id: ZOMBIE_DICE_GAME_ID, is: isZombieDiceGame, create: newZombieDiceGame, toDict: zombieDiceGameToDict, legalMoves: () => [],
    applyAction: (game, mark, payload) => makeZombieDiceMove(game, mark, payload.action || payload), resolvesBotsInternally: true, initSeats: initZombieDiceSeats },
  { id: LIARS_DICE_GAME_ID, is: isLiarsDiceGame, create: newLiarsDiceGame, toDict: liarsDiceGameToDict, legalMoves: () => [],
    applyAction: (game, mark, payload) => makeLiarsDiceMove(game, mark, payload.action || payload), resolvesBotsInternally: true, initSeats: initLiarsDiceSeats },
  { id: NO_THANKS_GAME_ID, is: isNoThanksGame, create: newNoThanksGame, toDict: noThanksGameToDict, legalMoves: () => [],
    applyAction: (game, mark, payload) => makeNoThanksMove(game, mark, payload.action || payload), resolvesBotsInternally: true, initSeats: initNoThanksSeats },
  { id: HEARTS_GAME_ID, is: isHeartsGame, create: newHeartsGame, toDict: heartsGameToDict, legalMoves: () => [],
    applyAction: (game, mark, payload) => makeHeartsMove(game, mark, payload.action || payload), resolvesBotsInternally: true, initSeats: initHeartsSeats,
    // Hearts host options (J♦, first-trick blood, moon style, target score):
    // set at /api/room/start and carried across a reset.
    applyStartOptions: (game, payload) => setHeartsOptions(game, payload),
    carryOptionsOnReset: (prevGame, nextGame) => {
      if (isHeartsGame(prevGame) && prevGame.options) setHeartsOptions(nextGame, prevGame.options);
    } },
  { id: POTION_LAB_GAME_ID, is: isPotionLabGame, create: newPotionLabGame, toDict: potionLabGameToDict, legalMoves: () => [],
    applyAction: (game, mark, payload) => makePotionLabMove(game, mark, payload.action || payload), resolvesBotsInternally: true, initSeats: initPotionLabSeats },
  { id: MYSTIC_WOOD_GAME_ID, is: isMysticWoodGame, create: newMysticWoodGame, toDict: mysticWoodGameToDict, legalMoves: () => [],
    applyAction: (game, mark, payload) => makeMysticWoodMove(game, mark, payload.action || payload), resolvesBotsInternally: true, initSeats: initMysticWoodSeats },
  { id: BATTLESHIP_GAME_ID, is: isBattleshipGame, create: newBattleshipGame, toDict: battleshipGameToDict, legalMoves: battleshipLegalMoves, bot: (game, bot, moves) => chooseBattleshipBotMove(game, bot, moves),
    applyAction: (game, mark, payload) => makeBattleshipMove(game, mark, payload.action || payload), preMove: (room) => ensureBattleshipBotFleets(room) },
  { id: QUORIDOR_GAME_ID, is: isQuoridorGame, create: newQuoridorGame, toDict: quoridorGameToDict, legalMoves: quoridorLegalMoves, bot: (game, bot, moves) => chooseQuoridorBotMove(game, bot, moves),
    applyAction: (game, mark, payload) => makeQuoridorMove(game, mark, payload.action || payload) },
  { id: BOXES_GAME_ID, is: isBoxesGame, create: newBoxesGame, toDict: boxesGameToDict, legalMoves: boxesLegalMoves, bot: (game, bot, moves) => chooseBoxesBotMove(game, moves),
    applyAction: (game, mark, payload) => makeBoxesMove(game, payload.line_id), enforcesTurnOrder: true },
];

// The table row that owns a game's move handling (applyAction + flags), or null
// for the Classic/Tactical default fallthrough (which uses makeMove below).
export function moveHandlerFor(game) {
  return GAME_HANDLERS.find((entry) => entry.applyAction && entry.is(game)) || null;
}

export function newGame(gameId = DEFAULT_GAME_ID) {
  const canonicalGameId = cleanGameId(gameId);
  const handler = GAME_HANDLERS.find((entry) => entry.id === canonicalGameId);
  if (handler) return handler.create();
  const game = {
    game_id: canonicalGameId,
    boards: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null)),
    small_winners: Array.from({ length: 9 }, () => null),
    current_player: "X",
    next_board: null,
    status: "playing",
    winner: null,
    line_winner: null,
    move_count: 0,
  };
  if (canonicalGameId === TACTICAL_GAME_ID) {
    game.pickups = [];
    game.scores = { X: 0, O: 0 };
    game.captures = {
      X: { coin: 0, treasureChest: 0 },
      O: { coin: 0, treasureChest: 0 },
    };
    game.events = [];
    game.last_event = null;
  }
  return game;
}

export function gameToDict(game) {
  const handler = GAME_HANDLERS.find((entry) => entry.is(game));
  if (handler) return handler.toDict(game);
  return { ...game, game_id: cleanGameId(game.game_id), legal_boards: legalBoards(game) };
}

export function gameToDictForViewer(game, viewerMark, roomStatusValue) {
  if (isBattleshipGame(game)) return battleshipGameToDictForViewer(game, viewerMark, roomStatusValue);
  if (isLiarsDiceGame(game)) return liarsDiceGameToDictForViewer(game, viewerMark, roomStatusValue);
  if (isNoThanksGame(game)) return noThanksGameToDictForViewer(game, viewerMark, roomStatusValue);
  if (isHeartsGame(game)) return heartsGameToDictForViewer(game, viewerMark);
  if (isPotionLabGame(game)) return potionLabGameToDictForViewer(game, viewerMark, roomStatusValue);
  return game;
}

export function legalMoves(game) {
  const handler = GAME_HANDLERS.find((entry) => entry.is(game));
  if (handler) return handler.legalMoves(game);
  if (!game || game.status !== "playing") return [];
  const moves = [];
  legalBoards(game).forEach((boardIndex) => {
    game.boards[boardIndex].forEach((value, cellIndex) => {
      if (value === null) moves.push({ board: boardIndex, cell: cellIndex });
    });
  });
  return moves;
}

export function chooseBotMove(game, bot = null) {
  const moves = legalMoves(game);
  if (!moves.length) return null;
  const handler = GAME_HANDLERS.find((entry) => entry.bot && entry.is(game));
  if (handler) return handler.bot(game, bot, moves);
  if (bot && bot.strategy === "smart") return chooseScoredBotMove(game, bot, moves);
  return moves[Math.floor(Math.random() * moves.length)];
}

// Super Tic Tac Toe / Tactical / Boxes — the default (non-table) move path.
export function makeMove(game, boardIndex, cellIndex, lineId = "") {
  if (isBoxesGame(game)) return makeBoxesMove(game, lineId);
  if (isTacticalGame(game)) return makeTacticalMove(game, boardIndex, cellIndex);
  return makeClassicMove(game, boardIndex, cellIndex);
}

// Seat init for host-start games: seeds per-seat game state at explicit start
// (seats already carry P1..PN marks) and re-seeds after a reset.
export function initGameSeats(game, players) {
  const handler = GAME_HANDLERS.find((entry) => entry.initSeats && entry.is(game));
  if (handler) handler.initSeats(game, players);
}

// Host lobby options applied at /api/room/start, per the table's
// applyStartOptions field (e.g. 10,000's opening minimum).
export function applyGameStartOptions(game, payload) {
  const handler = GAME_HANDLERS.find((entry) => entry.applyStartOptions && entry.is(game));
  if (handler) handler.applyStartOptions(game, payload);
}

// Fresh game on reset: replace room.game, carry per-game host options across,
// and re-seed per-seat state for started host-start games — otherwise the room
// stays started with an empty game (e.g. Ten Thousand ends up with no seats and
// a dead board).
export function resetRoomGame(room) {
  const prevGame = room.game;
  room.game = newGame(room.game_id);
  if (!room.started) return;
  const handler = GAME_HANDLERS.find((entry) => entry.is(room.game));
  if (!handler) return;
  if (handler.carryOptionsOnReset) handler.carryOptionsOnReset(prevGame, room.game);
  if (handler.initSeats) handler.initSeats(room.game, room.players);
}

function isBattleshipGame(game) {
  return Boolean(game && (cleanGameId(game.game_id) === BATTLESHIP_GAME_ID || game.phase === "setup" && game.players && game.fleet));
}

function isQuoridorGame(game) {
  return Boolean(game && (cleanGameId(game.game_id) === QUORIDOR_GAME_ID || game.pawns && game.walls_remaining && Array.isArray(game.walls)));
}

export function ensureBattleshipBotFleets(room) {
  if (!room || !isBattleshipGame(room.game) || !room.started) return false;
  ensureBattleshipState(room.game);
  let changed = false;
  room.players.filter(isBotSeat).forEach((bot) => {
    if (!bot.mark || !room.game.players[bot.mark]) return;
    const state = room.game.players[bot.mark];
    const hasCompleteFleet = state.ready && Array.isArray(state.ships) && state.ships.length === BATTLESHIP_FLEET.length;
    if (hasCompleteFleet) return;
    placeBattleshipFleet(room.game, bot.mark, chooseBattleshipBotFleet(bot));
    changed = true;
  });
  return changed;
}
