// The Mystic Wood — server-authoritative rules module (pure: no DOM, no I/O, no timers).
// Owns validation + state transitions for an N-player, shared-table, turn-based board game.
// Exports the platform contract (id/predicate/new/initSeats/makeMove/toDict) used by
// workers/games/handlers.js. Mechanics live in engine.js; bot turns in ai.js.
import { GAME_IDS } from "../../../src/sogotable/static/games/registry.js";
import { cleanGameId } from "../../game-catalog.js";
import { isBotSeat } from "../bots.js";
import {
  KNIGHTS, KNIGHT_ORDER, THINGS, DEN, DECK_IDS, START_CELL, MIN_PLAYERS, MAX_PLAYERS,
} from "./data.js";
import {
  setMysticWoodRandom, shuffle, buildBoard, cellAt, reachableFrom, applyMoveTo,
  resolveChallenge, resolveGreet, powerScry, powerRotate, powerDrink,
  relocate, totalP, totalS, hasThing, anyKing, tileNameAt, rollDie, combatPreview,
  resolveJoust, joustPrize, joustSpoils, clearCard, enforcePower, greetOutcomes, combatOutcomes,
  escapeOutcomes, resolveEscape, recordKeyUnlock, becomeKing,
  takeChivalry, deliverRescue, syncQuestCompanion, recordRoll,
} from "./engine.js";
import { logEvent, denPhrase, denIntro } from "./narration.js";   // the chronicle + its phrasing (pure leaf)
import { resolveSpell, raiseStorm, decayStorms } from "./spells.js";
import { playBotTurn } from "./ai.js";

export const MYSTIC_WOOD_GAME_ID = GAME_IDS.mysticWood;
export { setMysticWoodRandom };

export function isMysticWoodGame(game) {
  try { return Boolean(game && cleanGameId(game.game_id) === MYSTIC_WOOD_GAME_ID); }
  catch (_e) { return false; }
}

export function newMysticWoodGame() {
  return {
    game_id: MYSTIC_WOOD_GAME_ID,
    status: "playing", winner: null, end_reason: null,
    seat_order: [], players: {}, current_player: null,
    board: [], deck: [], discard: [], log: [], pending: null, scry_reveal: null, results: {},
    horn: null, horn_seq: 0, rotation: null, rotation_seq: 0, wind: null, wind_seq: 0,
    chivalry: { boy: null, damsel: null },
    turn_seq: 0, round: 1, roll_seq: 0, knight_setup: "auto",
  };
}

/* ------------------------------ seat init ------------------------------- */
function botLevel(seat) {
  if (!seat || (seat.kind !== "bot" && seat.is_bot !== true)) return 0;
  const level = Number(seat.bot_level !== undefined ? seat.bot_level : seat.level);
  return Number.isInteger(level) && level >= 1 && level <= 4 ? level : 2;
}
function makeSeat(p, knight) {
  return {
    mark: p.mark, name: p.name || KNIGHTS[knight].name, is_bot: isBotSeat(p), bot_level: botLevel(p),
    knight, q: KNIGHTS[knight].q,
    r: START_CELL.r, c: START_CELL.c,
    things: [], prowess: [], companions: [], horse: false,
    tower: false, towerTries: 0, captured: false, caveTurns: 0,
    questDone: false, isKing: false, castleHold: 0, atGate: false,
    praying: false, prayerTurns: 0,
    _princeUsed: false, _princeAiding: false, moved: false, won: false,
  };
}
export function initMysticWoodSeats(game, players) {
  const seats = Array.isArray(players) ? players.filter(Boolean) : [];
  if (seats.length < MIN_PLAYERS) throw new Error(`The Mystic Wood needs at least ${MIN_PLAYERS} knights.`);
  if (seats.length > MAX_PLAYERS) throw new Error(`The Mystic Wood seats at most ${MAX_PLAYERS} knights (one per knight).`);
  game.status = "playing"; game.winner = null; game.end_reason = null;
  game.seat_order = []; game.players = {}; game.log = []; game.pending = null; game.scry_reveal = null;
  game.results = {}; game.turn_seq = 0; game.round = 1; game.roll_seq = 0;
  game.horn = null; game.horn_seq = 0; game.rotation = null; game.rotation_seq = 0; game.wind = null; game.wind_seq = 0;
  game.chivalry = { boy: null, damsel: null };
  game.board = buildBoard();
  game.deck = shuffle(DECK_IDS.slice()); game.discard = [];
  const pool = shuffle(KNIGHT_ORDER.slice());   // distinct knights, randomly assigned (v1 — see PLAN.md)
  seats.forEach((p, i) => {
    const knight = pool[i];
    game.seat_order.push(p.mark);
    game.players[p.mark] = makeSeat(p, knight);
  });
  game.current_player = game.seat_order[0];
  logEvent(game, "The exploration of the Mystic Wood begins.");
  beginAndAdvance(game);
  return game;
}

/* ------------------------------ turn flow ------------------------------- */
function winGame(game, seat, reason) {
  game.status = "complete"; game.winner = seat.mark; seat.won = true;
  game.end_reason = { mark: seat.mark, reason };
  logEvent(game, `${seat.name} has won the Mystic Wood!`, "g");
}
// Runs at the start of a seat's turn: victory checks, then escape rolls. Returns "act" | "skip".
function beginSeatTurn(game, seat) {
  if (seat.out) return "skip";   // §18.10: a player unhorsed as King is out of the game
  seat.moved = false; seat.stormed = false; seat.freeMove = false; seat.usedFreeMove = false;
  game.pending = null; game.scry_reveal = null;
  const name = seat.name;
  // §16: "leaving the Wood AFTER fulfilling the other requirement of the quest" — a companion quest is
  // fulfilled only while the companion is still with you. The loss sites revoke questDone; this is the
  // backstop at the one place the game is actually WON, so no future loss path can smuggle a knight out
  // of the gate without his Princess (bug mrh9klnb).
  syncQuestCompanion(game, seat);
  if (seat.atGate) {
    if (seat.questDone && tileNameAt(game, seat) === "xgate") { winGame(game, seat, "gate"); return "skip"; }
    seat.atGate = false;
  }
  if (seat.isKing) {
    const onCastle = tileNameAt(game, seat) === "castle";
    seat.castleHold = onCastle ? (seat.castleHold || 0) + 1 : 0;
    if (onCastle && seat.castleHold >= 2) { winGame(game, seat, "castle"); return "skip"; }
    if (onCastle) logEvent(game, `${name} holds the Castle as King — stay through your next turn to win the crown.`);
  }
  // Imprisonment (Tower only — the Enchantress never jails, §18.7). The escape used to auto-roll here
  // and only reach the chronicle. A HUMAN now taps a visible "pick one of six" each turn (resolved in
  // doEscapePick); bots still auto-roll. The Key frees at once (no roll). On success the seat may move.
  if (seat.tower) {
    if (hasThing(seat, "key")) {
      seat.tower = false; logEvent(game, `${name} unlocks the Tower with the Key and walks free.`, "g");
      if (!seat.is_bot) recordKeyUnlock(game, seat);   // §? give the human a result modal explaining the free exit
    } else if (seat.is_bot) {
      seat.towerTries += 1;
      const { freed } = resolveEscape(game, seat, rollDie(), "tower", seat.towerTries);
      if (!freed) return "skip";
    } else {
      const tries = seat.towerTries + 1;
      game.pending = { type: "escape_pick", mark: seat.mark, mode: "tower", tries,
        groups: escapeOutcomes("tower", tries).groups, faceMap: shuffle([1, 2, 3, 4, 5, 6]) };
      return "act";
    }
  }
  // Spend-turns-here mechanics accrue at the start of each turn you remain on the tile.
  const here = tileNameAt(game, seat);
  if (seat.q === "cave" && here === "cave" && !seat.questDone) {
    seat.caveTurns = (seat.caveTurns || 0) + 1;
    logEvent(game, `${name} keeps vigil in the Cave (${seat.caveTurns}/3).`);
    if (seat.caveTurns >= 3) { seat.questDone = true; logEvent(game, `${name}'s vigil is complete — now reach the Enchanted Gate!`, "g"); }
  }
  if (seat.praying) {
    const t = cellAt(game.board, seat.r, seat.c);
    if (t && t.card === "bishop") {
      seat.prayerTurns = (seat.prayerTurns || 0) + 1;
      logEvent(game, `${name} prays before the Bishop (${seat.prayerTurns}/3).`);
      const blessed = seat.prayerTurns >= 3;
      if (blessed) { seat.things.push("ring"); seat.praying = false; clearCard(game, t, false); logEvent(game, `The Bishop blesses ${name} with the Ring (+1 Prowess).`, "g"); enforcePower(game, seat); }
      // §18.2: each turn of prayer COSTS the knight their turn, which the seat then silently skipped —
      // no popup, no badge, nothing but a log line. Three turns vanished and the vigil looked broken
      // ("bishop only does 1 of three… I have no chance to sit three rounds", bug mrh93gvz). A human now
      // gets the same result modal every other spent turn gets, counting the vigil down to the Ring.
      if (!seat.is_bot) recordRoll(game, seat.mark, { pray: true, turns: seat.prayerTurns, blessed });
    } else { seat.praying = false; logEvent(game, `${name} leaves the Bishop; the prayer lapses.`); }
    // Kneeling commits the knight: the Bishop holds them here, so a still-praying seat misses
    // its turn (the prayer just counted above) instead of being handed a move that would lapse it.
    // Bots already hold in ai.js; this makes a human wait the same three turns. On the turn the
    // prayer completes, `praying` is now false and the seat plays on (with the Ring).
    if (seat.praying) return "skip";
  }
  // §5.3/§8: a denizen sitting on your area (you were transported onto it) must be approached BEFORE any
  // move. Humans get the encounter opened here; bots resolve it in playBotTurn.
  if (seat.mustApproach && !seat.is_bot) {
    seat.mustApproach = false;
    const t = cellAt(game.board, seat.r, seat.c);
    if (t && t.card && openEncounter(game, seat, t)) return "act";
  }
  return "act";
}
function advanceTurn(game) {
  const i = game.seat_order.indexOf(game.current_player);
  const next = (i + 1) % game.seat_order.length;
  if (next === 0) game.round += 1;
  game.current_player = game.seat_order[next];
  game.turn_seq += 1;
  decayStorms(game);   // one turn of every active Magician storm elapses (§18.11)
}
// Begin the current seat; auto-run any bot/skip seats until a human must act or the game ends.
function beginAndAdvance(game) {
  let guard = 0;
  while (game.status === "playing" && guard++ < 5000) {
    const seat = game.players[game.current_player];
    const state = beginSeatTurn(game, seat);
    if (game.status !== "playing") return;
    if (state === "skip") { advanceTurn(game); continue; }
    if (seat.is_bot) { playBotTurn(game, seat); if (game.status !== "playing") return; advanceTurn(game); continue; }
    return;   // a human must act
  }
}
function passTurn(game) { advanceTurn(game); beginAndAdvance(game); }

// Landing on a tile: resolve a spell, apply location effects, then either open an encounter
// (await the player's Greet/Challenge choice) or end the turn.
// Open the encounter for the denizen on this tile. In a two-card area (Palace/Altar §9) the second
// denizen waits in `card2` and becomes the active one once the first is gone. Returns true if a pending
// was opened (there is a denizen to meet), false if there is nothing to approach.
function openEncounter(game, seat, tile) {
  if (!tile.card && tile.card2) { tile.card = tile.card2; tile.card2 = null; }   // meet the second of a two-card area
  if (!tile.card) return false;
  if (DEN[tile.card].king && seat.knight === "britomart" && !anyKing(game)) {
    // §18: Britomart's quest is not the crown — she alone neither challenges the King nor may become one,
    // so she simply passes him by (intentional — a report asked "is this right?"; it is).
    logEvent(game, "Britomart's quest is not the crown — she pays the King no heed and passes by.", "muted"); return false;
  }
  const den = DEN[tile.card];
  const combat = den.cls === "beast" || den.cls === "warrior" || den.cls === "magic";
  // Both greeting and combat become "pick one of six": the player taps one of six identical denizen
  // faces (shuffled here, hidden) instead of watching a die roll.
  if (combat) { openCombatPick(game, seat, tile); return true; }
  const outcomes = greetOutcomes(game, seat, tile);
  if (outcomes) {
    const gp = { type: "greet_pick", mark: seat.mark, r: tile.r, c: tile.c, card: tile.card,
      groups: outcomes.groups, faceMap: shuffle([1, 2, 3, 4, 5, 6]) };
    if (seat.knight === "guyon") {   // §8.2: Guyon may decline his +1 — carry the alternate odds + a toggle
      const alt = greetOutcomes(game, seat, tile, false);
      if (alt) { gp.groupsNoBonus = alt.groups; gp.guyonOptional = true; }
    }
    game.pending = gp;
    return true;
  }
  game.pending = { type: "encounter", mark: seat.mark, r: tile.r, c: tile.c, card: tile.card, combat };  // single-effect greet: one confirm button
  return true;
}
// After a denizen resolves, a two-card area may still hold a second to approach THIS visit — meet it
// (only once the first is gone; a "remained" first keeps the tile and its partner waits for a later entry).
function afterEncounter(game, seat, tile) {
  if (tile && !tile.card && tile.card2 && openEncounter(game, seat, tile)) return;
  passTurn(game);
}
// Returns a movement disposition: "end" (a spell/gate ended the turn), "encounter" (a denizen pending
// is open — resolving/withdrawing ends the turn), or "open" (an empty area — the turn stays OPEN: the
// seat may take a free move on, joust, or End turn, §5.2). Callers decide whether to passTurn.
function enterTile(game, seat, tile) {
  const name = seat.name;
  if (tile.pendingSpell) {
    const sp = tile.pendingSpell; tile.pendingSpell = null;
    const res = resolveSpell(game, seat, tile, sp);
    if (res.endTurn) return "end";
  }
  if (tile.name === "xgate" && seat.questDone && !seat.atGate) {
    seat.atGate = true;
    logEvent(game, `${name} stands in the Enchanted Gate, quest fulfilled — hold it to your next turn to leave in triumph.`, "g");
    return "end";   // §5.2: you cannot enter the Enchanted Gate and leave the Wood on the same turn
  }
  if (tile.name === "cave" && seat.q === "cave" && !seat.questDone) logEvent(game, `${name} enters the Cave — keep vigil here for 3 full turns.`);
  takeChivalry(game, seat, tile);    // §15: seeing a Boy/Damsel here lays the obligation of rescue on you
  deliverRescue(game, seat, tile);   // §15: arriving in the Queen's area with the Damsel rescues her
  return openEncounter(game, seat, tile) ? "encounter" : "open";
}
// Open a combat "pick one of six": the foe's (red) die is rolled now and stored; the player taps a
// white face. groups carry the win/lose(/tie) counts; faceMap + red stay server-side (the answer key).
function openCombatPick(game, seat, tile) {
  const co = combatOutcomes(game, seat, tile);
  // No match: every white face wins or ties — the knight cannot lose this roll. A bot needs no ceremony,
  // so settle it outright. A human still SEES the encounter (GY3B mrgkkwi4: "show the screen, say no
  // match, then the result"), but any face taken yields the sure win — never the lone tie face's FRESH
  // red that could be losable. So we carry forcedWin: the pick is display, the outcome is already decided.
  const win = co.faces.find((f) => f.result === "win");
  const noMatch = !!win && !co.faces.some((f) => f.result === "lose" || f.result === "captured");
  const hopeless = !win;   // every face loses or captures — he mocks the knight (mrgkjm4p); withdraw stays open
  if (noMatch) logEvent(game, `${denPhrase(tile.card)} is no match for ${seat.name}.`);
  if (noMatch && seat.is_bot) {   // a bot needs no ceremony — settle the sure win outright
    game.pending = null;
    resolveChallenge(game, seat, tile, win.face, co.red);
    afterEncounter(game, seat, tile);
    return;
  }
  game.pending = { type: "combat_pick", mark: seat.mark, r: tile.r, c: tile.c, card: tile.card,
    red: co.red, label: co.label, groups: co.groups, faceMap: shuffle([1, 2, 3, 4, 5, 6]),
    noMatch, hopeless, forcedWin: noMatch ? win.face : null };
}

/* ------------------------------- moves ---------------------------------- */
function requireThing(seat, thing) { if (!seat.things.includes(thing)) throw new Error(`You do not hold the ${THINGS[thing].name}.`); }
function requireComp(seat, cid) { if (!seat.companions.includes(cid)) throw new Error("You lack that companion."); }

function doHumanMove(game, seat, action) {
  if (game.pending) throw new Error("Resolve the encounter first.");
  if (seat.moved && !seat.freeMove) throw new Error("You have already moved this turn.");
  const from = cellAt(game.board, seat.r, seat.c);
  const to = cellAt(game.board, action.r, action.c);
  if (!to) throw new Error("No such tile.");
  if (!reachableFrom(game.board, seat, from).includes(to)) throw new Error("That tile is not reachable from here.");
  const wasRevealed = to.revealed, wasFreeContinuation = !!seat.freeMove;
  seat.fromR = from.r; seat.fromC = from.c; seat.arrivedByTransport = false;   // record the retreat path for a withdraw
  applyMoveTo(game, seat, from, to);   // sets seat.moved = true
  seat.freeMove = false;               // consume any granted continuation
  const disp = enterTile(game, seat, to);
  if (disp === "encounter") return;    // a denizen pending — resolving/withdrawing ends the turn
  if (disp === "end") { passTurn(game); return; }
  // "open": an empty area. §5.2 grants ONE free move through a PREVIOUSLY-explored empty area, taken
  // before your normal move — so only the FIRST move can be free, and it keeps the turn open for one more.
  // Otherwise a move ENDS the turn (the common case), so the game passes to the next player as expected.
  const occupied = game.seat_order.some((m) => m !== seat.mark && !game.players[m].won && !game.players[m].out && game.players[m].r === to.r && game.players[m].c === to.c);
  const emptyExplored = wasRevealed && !to.card && !to.card2 && !occupied;
  if (emptyExplored && !wasFreeContinuation && !seat.usedFreeMove) { seat.usedFreeMove = true; seat.freeMove = true; return; }  // free move → turn stays open for one more
  if (occupied) return;   // §12: stay open so you may joust the knight in this area (or End turn)
  passTurn(game);         // a normal move ends the turn
}
// The shell-free "pick one of six" greeting: the player taps a face (1-6); we map it
// through the hidden shuffle to a die face and resolve the greet exactly as a roll would.
function doGreetPick(game, seat, action) {
  const p = game.pending;
  if (!p || p.type !== "greet_pick" || p.mark !== seat.mark) throw new Error("There is no greeting to resolve.");
  const pick = Number(action && action.pick);
  if (!(pick >= 1 && pick <= 6)) throw new Error("Pick one of the six.");
  const tile = cellAt(game.board, p.r, p.c);
  const face = p.faceMap[pick - 1];
  game.pending = null;
  if (!tile || !tile.card) { passTurn(game); return; }
  resolveGreet(game, seat, tile, face, action.useGuyon !== false);   // §8.2: Guyon's +1 unless he declined it
  afterEncounter(game, seat, tile);   // a two-card area may still hold a second denizen to meet
}
// Combat "pick one of six": the tapped face maps through the hidden shuffle to a white die,
// fought against the stored red die. A tie reopens the pick with a fresh red (the rulebook reroll).
function doCombatPick(game, seat, action) {
  const p = game.pending;
  if (!p || p.type !== "combat_pick" || p.mark !== seat.mark) throw new Error("There is no fight to resolve.");
  const pick = Number(action && action.pick);
  if (!(pick >= 1 && pick <= 6)) throw new Error("Pick one of the six.");
  const tile = cellAt(game.board, p.r, p.c);
  if (!tile || !tile.card) { game.pending = null; passTurn(game); return; }
  // A no-match encounter is display only: whichever face the player taps, the sure win stands (no tie
  // reroll can steal it back — that was mrfr29hn). The screen was shown for feel, not for a real roll.
  if (p.forcedWin != null) { game.pending = null; resolveChallenge(game, seat, tile, p.forcedWin, p.red); afterEncounter(game, seat, tile); return; }
  const white = p.faceMap[pick - 1];
  const pv = combatPreview(seat, tile);
  if (white + pv.mine === p.red + pv.foe) {   // tie → reroll (new red, pick again)
    logEvent(game, "A tie — the fates are cast again.");
    openCombatPick(game, seat, tile);
    if (game.pending && game.pending.type === "combat_pick") game.pending.reroll = true;   // tell the client it re-opened (bug mrgigq4l)
    return;
  }
  game.pending = null;
  resolveChallenge(game, seat, tile, white, p.red);
  afterEncounter(game, seat, tile);
}
// The visible "pick one of six" escape: the captive taps a face; we map it through the hidden shuffle
// to a die and resolve the escape rule exactly as an auto-roll would. Success → the seat may still move
// this turn (the rulebook lets you move the turn you break out); failure → the turn ends.
function doEscapePick(game, seat, action) {
  const p = game.pending;
  if (!p || p.type !== "escape_pick" || p.mark !== seat.mark) throw new Error("There is nothing to escape from.");
  const pick = Number(action && action.pick);
  if (!(pick >= 1 && pick <= 6)) throw new Error("Pick one of the six.");
  const face = p.faceMap[pick - 1];
  game.pending = null;
  if (!seat.tower && !seat.captured) return;   // already freed by some other path (defensive)
  const mode = seat.captured ? "capture" : "tower";
  if (mode === "tower") seat.towerTries += 1;
  const tries = mode === "tower" ? seat.towerTries : 1;
  const { freed } = resolveEscape(game, seat, face, mode, tries);
  if (!freed) passTurn(game);   // still imprisoned → the turn ends; a freed knight keeps the turn to move
}
function doEncounterChoice(game, seat, action) {
  const p = game.pending;
  if (!p || p.type !== "encounter" || p.mark !== seat.mark) throw new Error("There is no encounter to resolve.");
  const tile = cellAt(game.board, p.r, p.c);
  game.pending = null;
  if (!tile || !tile.card) { passTurn(game); return; }
  const combat = p.combat;
  const choice = action && action.choice;
  if (combat) { if (choice && choice !== "challenge") throw new Error("This denizen must be challenged."); resolveChallenge(game, seat, tile); }
  else { if (choice && choice !== "greet") throw new Error("This denizen can only be greeted."); resolveGreet(game, seat, tile); }
  afterEncounter(game, seat, tile);
}
function doTransport(game, seat, action) {
  requireComp(seat, "archmage");
  if (game.pending) throw new Error("Resolve the encounter first.");
  const to = cellAt(game.board, action.r, action.c);
  if (!to || !to.revealed || !to.name) throw new Error("Choose a revealed place.");
  if (to.r === seat.r && to.c === seat.c) throw new Error("You are already there.");
  if (game.seat_order.some((m) => m !== seat.mark && !game.players[m].won && game.players[m].r === to.r && game.players[m].c === to.c)) {
    throw new Error("Another knight holds that place.");
  }
  logEvent(game, `The Arch-Mage sends ${seat.name} to the ${to.label || to.name}.`, "a");
  // §18.1: "he remains in the area where you used it" — a one-shot. He leaves you (returns to the origin
  // tile to be greeted again if it's free), so the power is not infinitely reusable.
  const from = cellAt(game.board, seat.r, seat.c);
  seat.companions = seat.companions.filter((c) => c !== "archmage");
  if (from && !from.card && !from.fixed && from.name !== "tower") { from.card = "archmage"; logEvent(game, "The Arch-Mage remains in the glade he opened.", "a"); }
  else logEvent(game, `The Arch-Mage parts ways with ${seat.name}.`, "a");
  seat.arrivedByTransport = true;   // §8: you cannot withdraw from a denizen you were transported onto
  relocate(game, seat, to.r, to.c);
  const disp = enterTile(game, seat, to);
  if (disp !== "encounter") passTurn(game);   // transport ends the turn; a destination encounter resolves then passes
}
// Magician's Storm (§18.11): a free power on your turn (does not end it, does not spend your move).
// Never from or at the Tower; one storm per turn.
function doStorm(game, seat, action) {
  requireComp(seat, "magician");
  if (game.pending) throw new Error("Resolve the encounter first.");
  if (seat.stormed) throw new Error("You have already raised a storm this turn.");
  const from = cellAt(game.board, seat.r, seat.c);
  if (from && from.name === "tower") throw new Error("The Magician's power cannot be used from the Tower.");
  const to = cellAt(game.board, action.r, action.c);
  if (!to || !to.revealed) throw new Error("Choose a revealed area to storm.");
  if (to.name === "tower") throw new Error("The Tower cannot be stormed.");
  if (to.storm) throw new Error("A storm already rages there.");
  raiseStorm(game, seat, to);
  seat.stormed = true;
}
// §12: a joust may be issued at the START of a turn OR AFTER moving (no `moved` guard). Either way the
// challenger's turn ends once it resolves.
function doJoust(game, seat, action) {
  if (game.pending) throw new Error("Resolve the encounter first.");
  if (seat.tower) throw new Error("You cannot joust from here.");
  const tile = cellAt(game.board, seat.r, seat.c);
  if (tile && tile.name === "tower") throw new Error("There is no jousting in the Tower.");
  const def = game.players[action && action.target];
  if (!def || def.mark === seat.mark) throw new Error("Choose a knight to joust.");
  if (def.won || def.tower || def.out) throw new Error("That knight cannot be jousted.");
  if (def.r !== seat.r || def.c !== seat.c) throw new Error("That knight is not in your area.");
  const res = resolveJoust(game, seat, def);
  const winner = res.chWon ? seat : def, loser = res.chWon ? def : seat;
  // §18.10: unhorse a player-King and he is OUT of the game; the victor takes the crown outright.
  if (loser.isKing) {
    loser.out = true; loser.isKing = false;
    logEvent(game, `${loser.name} is unhorsed and cast from the game — the crown passes to ${winner.name}!`, "r");
    becomeKing(game, winner);
    passTurn(game);
    return;
  }
  if (res.chWon) {
    game.pending = { type: "joust-prize", mark: seat.mark, loser: def.mark };   // won → choose the prize
  } else {
    joustPrize(game, def, seat, "tower");                     // lost → the defender unhorses you to the Tower
    passTurn(game);
  }
}
// §8: withdraw from a met denizen — step back to the area you came from; your turn ends. Barred if you
// arrived by transportation (or, per the rulebook, if Fog blocked the retreat — not modelled here).
function doWithdraw(game, seat) {
  const p = game.pending;
  if (!p || !["encounter", "greet_pick", "combat_pick"].includes(p.type) || p.mark !== seat.mark) throw new Error("There is nothing to withdraw from.");
  if (seat.arrivedByTransport) throw new Error("You cannot withdraw after being transported here.");
  const back = seat.fromR === undefined ? null : cellAt(game.board, seat.fromR, seat.fromC);
  if (!back) throw new Error("There is nowhere to withdraw to.");
  game.pending = null;
  seat.r = back.r; seat.c = back.c;
  logEvent(game, `${seat.name} withdraws from ${denPhrase(p.card)} back to ${back.label || "the path"}.`);
  passTurn(game);
}
function doJoustPrize(game, seat, action) {
  const p = game.pending;
  if (!p || p.type !== "joust-prize" || p.mark !== seat.mark) throw new Error("There is no joust prize to claim.");
  const loser = game.players[p.loser];
  game.pending = null;
  joustPrize(game, seat, loser, (action && action.prize) || "tower");
  passTurn(game);
}

export function makeMysticWoodMove(game, mark, action) {
  if (game.status !== "playing") throw new Error("The game is already over.");
  if (!game.players[mark]) throw new Error("You are not seated in this game.");
  if (mark !== game.current_player) throw new Error(`It is not ${mark}'s turn.`);
  const seat = game.players[mark];
  if (seat.is_bot) throw new Error("Bot seats are resolved automatically.");
  const type = (action && action.type) || action;
  switch (type) {
    case "move": doHumanMove(game, seat, action); break;
    case "encounter": doEncounterChoice(game, seat, action); break;
    case "greet_pick": doGreetPick(game, seat, action); break;
    case "combat_pick": doCombatPick(game, seat, action); break;
    case "escape_pick": doEscapePick(game, seat, action); break;
    case "scry": { requireThing(seat, "crystal"); const res = powerScry(game, seat); game.scry_reveal = res.next; break; }
    case "rotate": { requireThing(seat, "wand"); powerRotate(game, seat); break; }
    case "drink": {
      const t = cellAt(game.board, seat.r, seat.c);
      if (!t || t.name !== "fountain" || t._used) throw new Error("There is no Fountain to drink from here.");
      const res = powerDrink(game, seat, t);
      if (res.endTurn) passTurn(game);
      break;
    }
    case "transport": doTransport(game, seat, action); break;
    case "storm": doStorm(game, seat, action); break;
    case "joust": doJoust(game, seat, action); break;
    case "withdraw": doWithdraw(game, seat); break;
    case "joust-prize": doJoustPrize(game, seat, action); break;
    case "end-turn": passTurn(game); break;
    default: throw new Error(`Unknown Mystic Wood action "${type}".`);
  }
  return game;
}

/* ----------------------------- projection ------------------------------- */
function seatToDict(s) {
  const k = KNIGHTS[s.knight];
  return {
    // `label` identifies the player the way the reports asked: the human's name with the knight's
    // quest in parens — "Sogo (Roland's quest)". A bot IS its knight, so it just reads "Roland".
    mark: s.mark, name: s.name, label: s.is_bot ? k.name : `${s.name} (${k.name}'s quest)`,
    is_bot: s.is_bot, knight: s.knight, color: k.color, quest: k.quest,
    r: s.r, c: s.c,
    things: s.things.map((t) => ({ id: t, name: THINGS[t].name })),
    prowess: s.prowess.map((x) => x.name),
    companions: s.companions.map((cid) => ({ id: cid, name: DEN[cid].name })),
    horse: !!s.horse, tower: !!s.tower, captured: !!s.captured, out: !!s.out, saved: s.saved || {},
    moved: !!s.moved, freeMove: !!s.freeMove,   // client shows an "open turn" prompt after a move
    questDone: !!s.questDone, isKing: !!s.isKing, atGate: !!s.atGate, won: !!s.won,
    caveTurns: s.caveTurns || 0,
    praying: !!s.praying, prayerTurns: s.prayerTurns || 0,   // §18.2: the vigil, so the strip can SHOW it ticking (mrh93gvz)
    totalP: totalP(s), totalS: totalS(s),
  };
}
// Enrich the pending encounter with display data + the combat preview so the client renders it without
// re-implementing any rules math.
function pendingToDict(game) {
  const p = game.pending;
  if (!p) return null;
  if (p.type === "joust-prize") {
    const loser = game.players[p.loser];
    return { type: p.type, mark: p.mark, loser: p.loser, loserName: loser.name, spoils: joustSpoils(loser) };
  }
  // "pick one of six" greeting/combat: send the grouped odds, NEVER the face-map or the red die
  // (they're the answer key).
  if (p.type === "escape_pick") {
    // Never send the faceMap (the answer key) — only the grouped odds, the mode, and the attempt count.
    return { type: p.type, mark: p.mark, mode: p.mode, tries: p.tries, groups: p.groups };
  }
  const meeter = game.players[p.mark];
  const knightName = meeter.name;   // the intro/first-sight line names the meeting player (human name, or the knight for a bot)
  // §8: you may withdraw from a met denizen unless you arrived by transportation (no retreat path).
  const canWithdraw = !meeter.arrivedByTransport && meeter.fromR !== undefined;
  if (p.type === "greet_pick" || p.type === "combat_pick") {
    const den = DEN[p.card];
    return { type: p.type, mark: p.mark, r: p.r, c: p.c, card: p.card, groups: p.groups, label: p.label || "", canWithdraw, reroll: !!p.reroll,
      noMatch: !!p.noMatch, hopeless: !!p.hopeless,   // GY3B: "no match" (sure win) / "he mocks you" (cannot win — withdraw)
      groupsNoBonus: p.groupsNoBonus, guyonOptional: !!p.guyonOptional,   // §8.2 Guyon's optional +1 (greet only)
      denName: den ? den.name : "", denPhrase: denPhrase(p.card), denClass: den ? den.cls : "", intro: denIntro(p.card, knightName) };
  }
  const out = { type: p.type, mark: p.mark, r: p.r, c: p.c, card: p.card, combat: p.combat, canWithdraw };
  const den = DEN[p.card];
  if (den) {
    out.denName = den.name; out.denPhrase = denPhrase(p.card); out.denClass = den.cls; out.denS = den.S || 0; out.denP = den.P || 0;
    out.intro = denIntro(p.card, knightName);
    if (p.combat) { const tile = cellAt(game.board, p.r, p.c); out.preview = combatPreview(game.players[p.mark], tile); }
  }
  return out;
}
function tileToDict(t) {
  if (!t.revealed) return { r: t.r, c: t.c, half: t.half, revealed: false };
  return {
    r: t.r, c: t.c, half: t.half, revealed: true, name: t.name || null, label: t.label || null,
    fixed: !!t.fixed, open: { ...t.open }, card: t.card || null, card2: t.card2 || null, remains: !!t.remains,
    storm: t.storm ? t.storm.turns : 0,   // turns of Magician's storm remaining (0 = clear)
  };
}
export function mysticWoodGameToDict(game) {
  return {
    game_id: game.game_id,
    status: game.status, winner: game.winner, end_reason: game.end_reason || null,
    round: game.round, turn_seq: game.turn_seq, current_player: game.current_player,
    seat_order: game.seat_order.slice(),
    players: game.seat_order.map((m) => seatToDict(game.players[m])),
    board: game.board.map(tileToDict),
    deck_count: game.deck.length, discard_count: game.discard.length,
    pending: pendingToDict(game),
    scry_reveal: game.scry_reveal || null,
    results: game.results || {},
    horn: game.horn || null,
    rotation: game.rotation || null,   // §18.12 Fog / Wand: cells that just turned about, for the spin animation
    wind: game.wind || null,           // §18.14: who drew the Wind and how many Things it swept, for the herald
    chivalry: game.chivalry || { boy: null, damsel: null },   // §15: who currently bears each rescue obligation
    // Send the full retained chronicle (bounded by LOG_CAP) so the client can show the ENTIRE history
    // (report mrfoq90c) and a bug-report snapshot captures a real audit trail. turn_seq above is the
    // turn count shown near the top.
    log: (game.log || []).slice(-300),
  };
}
