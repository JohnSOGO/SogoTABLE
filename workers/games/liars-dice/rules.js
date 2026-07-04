// Liar's Dice — server-authoritative rules + the per-viewer hidden-information
// sanitizer. Pure logic: no routing/auth/persistence, no DOM, no timers. The
// Worker imports the exports below and calls initLiarsDiceSeats from
// startRoom/reset; bots resolve internally through the same bid/challenge
// internals humans use, with the decision policy in ./ai.js.
//
// Ruleset (v1, classic family rules): everyone rolls a hidden cup. On your
// turn you either RAISE the bid (strictly more dice, or the same count on a
// higher face) or call LIAR — all dice reveal, and whoever was wrong loses a
// die. Ones are wild (they count toward any bid, and bids on ones are not
// allowed). Out of dice = out of the game; last player holding dice wins. The
// die-loser opens the next round. Spot-on and hot-seat play are deliberate v1
// exclusions (docs/game-liars-dice.md).
//
// Turn order (MojoSOGO 2026-07-03): NOT circular. Every seat tracks how many
// plays (bids + challenges) it has made; after each bid the next actor is
// drawn from the active seats with the FEWEST plays (never the seat that just
// acted), ties broken randomly through the seeded RNG seam. The die-loser
// still opens each round.
//
// DANGER ZONE: liarsDiceGameToDictForViewer is the ONLY thing that hides other
// players' cups from a viewer. Dice leave the live seats and move into the
// public last_reveal at the moment a challenge resolves, so a seat's `dice`
// array is secret whenever it is non-empty. Keep its behaviour exactly.
//
// RNG: all rolls flow through one seedable seam (setLiarsDiceRandom); a round
// start consumes one value per die, in seat order.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { cleanGameId } from "../../game-catalog.js";
import { clampInteger } from "../util.js";
import { liarsDiceBotAction } from "./ai.js";

export const LIARS_DICE_GAME_ID = GAME_IDS.liarsDice;
export const LIARS_DICE_STARTING_DICE = 5;
const LIARS_DICE_FACES = 6;
const LIARS_DICE_PHASES = ["bidding", "reveal"];

export function isLiarsDiceGame(game) {
  return Boolean(game && cleanGameId(game.game_id) === LIARS_DICE_GAME_ID);
}

let liarsDiceRandom = Math.random;
export function setLiarsDiceRandom(fn) {
  liarsDiceRandom = typeof fn === "function" ? fn : Math.random;
}

export function newLiarsDiceGame() {
  return {
    game_id: LIARS_DICE_GAME_ID,
    status: "playing",
    round: 0,
    phase: "bidding",
    ones_wild: true,
    current_player: null,
    current_bid: null, // { quantity, face, mark }
    starter: null, // who opens the next round
    seat_order: [],
    players: {},
    winner: null,
    move_count: 0,
    last_move: null,
    last_reveal: null,
    events: [],
  };
}

export function initLiarsDiceSeats(game, seats) {
  game.seat_order = [];
  game.players = {};
  (Array.isArray(seats) ? seats : []).forEach((seat) => {
    const mark = String(seat && seat.mark || "").trim();
    if (!mark) return;
    game.seat_order.push(mark);
    game.players[mark] = {
      dice_count: LIARS_DICE_STARTING_DICE,
      dice: [],
      eliminated: false,
      plays: 0,
      is_bot: Boolean(seat && seat.kind === "bot"),
    };
  });
  if (game.seat_order.length < 2) throw new Error("Liar's Dice needs at least 2 players — invite a player or add a bot.");
  game.status = "playing";
  game.round = 0;
  game.ones_wild = true;
  game.current_bid = null;
  game.starter = game.seat_order[0];
  game.winner = null;
  game.move_count = 0;
  game.last_move = null;
  game.last_reveal = null;
  game.events = [];
  startLiarsDiceRound(game);
}

// ---------- queries ----------

function activeMarks(game) {
  return game.seat_order.filter((mark) => !game.players[mark].eliminated);
}

function liarsDiceTotalDice(game) {
  return game.seat_order.reduce((sum, mark) => sum + game.players[mark].dice_count, 0);
}

// Wilds (1s) count toward every bid face; face-1 bids are rejected while wild.
export function countLiarsDiceMatches(game, face) {
  let count = 0;
  game.seat_order.forEach((mark) => {
    game.players[mark].dice.forEach((die) => {
      if (die === face || (game.ones_wild && die === 1 && face !== 1)) count += 1;
    });
  });
  return count;
}

function isLegalLiarsDiceBid(game, quantity, face) {
  try {
    assertLegalLiarsDiceBid(game, quantity, face);
    return true;
  } catch {
    return false;
  }
}

function assertLegalLiarsDiceBid(game, quantity, face) {
  const total = liarsDiceTotalDice(game);
  const minFace = game.ones_wild ? 2 : 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > total) {
    throw new Error(`Bid a count between 1 and ${total} (the dice on the table).`);
  }
  if (!Number.isInteger(face) || face < minFace || face > LIARS_DICE_FACES) {
    throw new Error(game.ones_wild && face === 1
      ? "Ones are wild — they back every bid, so you cannot bid on them."
      : `Bid a face between ${minFace} and ${LIARS_DICE_FACES}.`);
  }
  const bid = game.current_bid;
  if (bid && !(quantity > bid.quantity || (quantity === bid.quantity && face > bid.face))) {
    throw new Error(`Raise the bid: more than ${bid.quantity} dice, or ${bid.quantity} of a face above ${bid.face}.`);
  }
}

// Every raise still open to the current bidder: for each biddable quantity, the
// lowest legal face. The UI renders this list as its picker bounds instead of
// re-deriving raise legality client-side.
function liarsDiceRaiseOptions(game) {
  const total = liarsDiceTotalDice(game);
  const minFace = game.ones_wild ? 2 : 1;
  const bid = game.current_bid;
  const options = [];
  const fromQuantity = bid ? bid.quantity : 1;
  for (let quantity = fromQuantity; quantity <= total; quantity += 1) {
    const floor = bid && quantity === bid.quantity ? bid.face + 1 : minFace;
    if (floor > LIARS_DICE_FACES) continue; // same-quantity raise off a 6 is impossible
    options.push({ quantity, min_face: floor });
  }
  return options;
}

// ---------- projections ----------

export function liarsDiceGameToDict(game) {
  normalizeLiarsDiceGame(game);
  const players = game.seat_order.map((mark) => {
    const seat = game.players[mark];
    return {
      mark,
      dice_count: seat.dice_count,
      dice: seat.dice.slice(),
      eliminated: seat.eliminated,
      plays: seat.plays,
      is_bot: seat.is_bot,
      is_turn: game.status === "playing" && game.phase === "bidding" && mark === game.current_player,
    };
  });
  return {
    ...game,
    game_id: LIARS_DICE_GAME_ID,
    players,
    total_dice: liarsDiceTotalDice(game),
    raise_options: game.status === "playing" && game.phase === "bidding" ? liarsDiceRaiseOptions(game) : [],
    can_continue: game.status === "playing" && game.phase === "reveal",
  };
}

// Per-viewer projection (dispatched from the Worker's gameToDictForViewer seam,
// the Battleship precedent). Receives the DICT shape (players as an array).
// A viewer sees only their own live cup; everyone else's dice mask to null,
// preserving the count. The last_reveal is public by construction — dice only
// enter it when a challenge has already turned them face-up on the table.
export function liarsDiceGameToDictForViewer(game, viewerMark, roomStatusValue) {
  const projected = structuredClone(game);
  const revealAll = roomStatusValue === "completed" || projected.status === "complete";
  if (Array.isArray(projected.players)) {
    projected.players = projected.players.map((seat) => ({
      ...seat,
      dice: seat.mark === viewerMark || revealAll
        ? seat.dice
        : (Array.isArray(seat.dice) ? seat.dice.map(() => null) : []),
    }));
  }
  return projected;
}

export function liarsDiceScoreByMark(game) {
  normalizeLiarsDiceGame(game);
  const scores = {};
  game.seat_order.forEach((mark) => {
    scores[mark] = Number(game.players[mark].dice_count || 0);
  });
  return scores;
}

function normalizeLiarsDiceGame(game) {
  game.game_id = LIARS_DICE_GAME_ID;
  game.status = game.status === "complete" ? "complete" : "playing";
  game.round = clampInteger(game.round, 0, 999999, 0);
  game.phase = LIARS_DICE_PHASES.includes(game.phase) ? game.phase : "bidding";
  game.ones_wild = game.ones_wild !== false;
  game.seat_order = Array.isArray(game.seat_order) ? game.seat_order.map(String) : [];
  if (!game.players || typeof game.players !== "object") game.players = {};
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark] || {};
    game.players[mark] = {
      dice_count: clampInteger(seat.dice_count, 0, LIARS_DICE_STARTING_DICE, 0),
      dice: normalizeLiarsDiceDice(seat.dice),
      eliminated: Boolean(seat.eliminated),
      plays: clampInteger(seat.plays, 0, 999999, 0),
      is_bot: Boolean(seat.is_bot),
    };
  });
  game.current_player = game.seat_order.includes(game.current_player) ? game.current_player : null;
  game.starter = game.seat_order.includes(game.starter) ? game.starter : (game.seat_order[0] || null);
  game.current_bid = normalizeLiarsDiceBid(game, game.current_bid);
  game.winner = game.seat_order.includes(game.winner) ? game.winner : null;
  game.move_count = clampInteger(game.move_count, 0, 999999, 0);
  game.last_move = game.last_move || null;
  game.last_reveal = game.last_reveal || null;
  game.events = Array.isArray(game.events) ? game.events.slice(-40) : [];
}

function normalizeLiarsDiceDice(dice) {
  if (!Array.isArray(dice)) return [];
  return dice
    .map((die) => clampInteger(die, 1, LIARS_DICE_FACES, 1))
    .slice(0, LIARS_DICE_STARTING_DICE);
}

function normalizeLiarsDiceBid(game, bid) {
  if (!bid || !game.seat_order.includes(bid.mark)) return null;
  const quantity = clampInteger(bid.quantity, 1, LIARS_DICE_STARTING_DICE * 8, 1);
  const face = clampInteger(bid.face, 1, LIARS_DICE_FACES, 2);
  return { quantity, face, mark: bid.mark };
}

// ---------- transitions ----------

export function makeLiarsDiceMove(game, mark, action) {
  normalizeLiarsDiceGame(game);
  if (game.status === "complete") throw new Error("Game is complete.");
  const seat = game.players[mark];
  if (!seat) throw new Error("You are not seated in this game.");
  if (seat.is_bot) throw new Error("Bot seats play automatically.");
  const type = String(action && action.type || "").trim();
  if (type === "next_round") {
    if (game.phase !== "reveal") throw new Error("The round is still being played.");
    if (seat.eliminated && activeMarks(game).some((other) => !game.players[other].is_bot)) {
      throw new Error("A player still in the game starts the next round.");
    }
    startLiarsDiceRound(game);
    return;
  }
  if (game.phase !== "bidding") throw new Error("The dice are face-up — start the next round first.");
  if (seat.eliminated) throw new Error("You are out of dice — watch the bluffing play out.");
  if (mark !== game.current_player) throw new Error(`It is ${game.current_player}'s turn.`);
  if (type === "bid") {
    applyLiarsDiceBid(game, mark, Number(action.quantity), Number(action.face));
  } else if (type === "challenge") {
    applyLiarsDiceChallenge(game, mark);
  } else {
    throw new Error("Liar's Dice action must be bid, challenge, or next_round.");
  }
  resolveLiarsDiceBots(game);
}

function startLiarsDiceRound(game) {
  game.round += 1;
  game.phase = "bidding";
  game.current_bid = null;
  game.last_reveal = null;
  game.seat_order.forEach((mark) => {
    const seat = game.players[mark];
    seat.dice = seat.eliminated
      ? []
      : Array.from({ length: seat.dice_count }, () => 1 + Math.floor(liarsDiceRandom() * LIARS_DICE_FACES));
  });
  game.current_player = game.starter;
  resolveLiarsDiceBots(game);
}

// N-player turn selection: the next actor is drawn from the active seats with
// the fewest plays — never the seat that just acted — ties broken randomly.
// A single candidate is returned without consuming RNG (keeps 2-player games
// and rigged tests deterministic).
function pickNextLiarsDiceActor(game, lastMark) {
  const candidates = game.seat_order.filter((mark) => mark !== lastMark && !game.players[mark].eliminated);
  if (!candidates.length) return lastMark;
  const fewest = Math.min(...candidates.map((mark) => game.players[mark].plays));
  const pool = candidates.filter((mark) => game.players[mark].plays === fewest);
  return pool.length === 1 ? pool[0] : pool[Math.floor(liarsDiceRandom() * pool.length)];
}

function applyLiarsDiceBid(game, mark, quantity, face) {
  assertLegalLiarsDiceBid(game, quantity, face);
  game.current_bid = { quantity, face, mark };
  game.players[mark].plays += 1;
  game.current_player = pickNextLiarsDiceActor(game, mark);
  game.move_count += 1;
  // `next` rides the public event so the client replay can name who is up.
  game.last_move = { type: "bid", mark, quantity, face, next: game.current_player, round: game.round, move_count: game.move_count };
  pushLiarsDiceEvent(game, game.last_move);
}

function applyLiarsDiceChallenge(game, mark) {
  const bid = game.current_bid;
  if (!bid) throw new Error("There is no bid to challenge — open the bidding instead.");
  game.players[mark].plays += 1;
  const actual = countLiarsDiceMatches(game, bid.face);
  const bidHolds = actual >= bid.quantity;
  const loser = bidHolds ? mark : bid.mark;
  const winner = bidHolds ? bid.mark : mark;
  const loserSeat = game.players[loser];
  loserSeat.dice_count -= 1;
  if (loserSeat.dice_count <= 0) {
    loserSeat.dice_count = 0;
    loserSeat.eliminated = true;
  }
  game.move_count += 1;
  game.last_reveal = {
    round: game.round,
    bid: { ...bid },
    challenger: mark,
    outcome: bidHolds ? "bid_holds" : "bid_fails",
    actual,
    loser,
    loser_eliminated: loserSeat.eliminated,
    dice: Object.fromEntries(game.seat_order.map((seatMark) => [seatMark, game.players[seatMark].dice.slice()])),
  };
  game.last_move = { type: "challenge", mark, round: game.round, outcome: game.last_reveal.outcome, loser, move_count: game.move_count };
  pushLiarsDiceEvent(game, game.last_move);
  // The dice are face-up on the table now: they live in the public last_reveal,
  // and the secret per-seat cups empty until the next round rolls.
  game.seat_order.forEach((seatMark) => { game.players[seatMark].dice = []; });
  game.current_bid = null;
  game.current_player = null;
  const remaining = activeMarks(game);
  if (remaining.length <= 1) {
    game.status = "complete";
    game.winner = remaining[0] || null;
    game.phase = "reveal";
    game.last_move = { type: "complete", round: game.round, winner: game.winner, move_count: game.move_count };
    return;
  }
  game.starter = loserSeat.eliminated ? winner : loser;
  game.phase = "reveal";
}

function pushLiarsDiceEvent(game, event) {
  game.events.push(event);
  game.events = game.events.slice(-40);
}

// Bot turns run through the SAME bid/challenge internals a human move uses —
// no bot-only legality. The chain stops at a human's turn, at a reveal that a
// human should get to read (they press Begin next round), or at game end. A
// bots-only table (all humans eliminated) plays itself out; the guard bounds
// a pathological game (each round is at most ~total*faces raises, and every
// reveal removes a die, so real games end far earlier).
function resolveLiarsDiceBots(game) {
  for (let guard = 0; guard < 4000; guard += 1) {
    if (game.status !== "playing") return;
    if (game.phase === "reveal") {
      if (activeMarks(game).some((mark) => !game.players[mark].is_bot)) return;
      startLiarsDiceRound(game);
      continue;
    }
    const mark = game.current_player;
    const seat = mark ? game.players[mark] : null;
    if (!seat || !seat.is_bot) return;
    const choice = liarsDiceBotAction({
      dice: seat.dice.slice(),
      totalDice: liarsDiceTotalDice(game),
      currentBid: game.current_bid ? { quantity: game.current_bid.quantity, face: game.current_bid.face } : null,
      onesWild: game.ones_wild,
      faces: LIARS_DICE_FACES,
      raiseOptions: liarsDiceRaiseOptions(game),
      random: liarsDiceRandom,
    });
    if (choice && choice.type === "challenge" && game.current_bid) {
      applyLiarsDiceChallenge(game, mark);
    } else if (choice && choice.type === "bid" && isLegalLiarsDiceBid(game, Number(choice.quantity), Number(choice.face))) {
      applyLiarsDiceBid(game, mark, Number(choice.quantity), Number(choice.face));
    } else {
      // A confused policy must not wedge the table: make the smallest legal
      // raise, or call the bid when no raise exists.
      const options = liarsDiceRaiseOptions(game);
      if (options.length) applyLiarsDiceBid(game, mark, options[0].quantity, options[0].min_face);
      else applyLiarsDiceChallenge(game, mark);
    }
  }
  throw new Error("Liar's Dice bot resolution exceeded its guard — this is a bug.");
}
