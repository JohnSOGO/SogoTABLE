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
  resolveSpell, resolveChallenge, resolveGreet, powerScry, powerRotate, powerDrink,
  relocate, logEvent, totalP, totalS, hasThing, anyKing, tileNameAt, rollDie, combatPreview,
  resolveJoust, joustPrize, joustSpoils, clearCard, enforcePower, greetOutcomes,
} from "./engine.js";
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
    horn: null, horn_seq: 0,
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
  game.horn = null; game.horn_seq = 0;
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
  logEvent(game, `${KNIGHTS[seat.knight].name} has won the Mystic Wood!`, "g");
}
// Runs at the start of a seat's turn: victory checks, then escape rolls. Returns "act" | "skip".
function beginSeatTurn(game, seat) {
  seat.moved = false; game.pending = null; game.scry_reveal = null;
  const name = KNIGHTS[seat.knight].name;
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
  if (seat.captured) {
    const e = rollDie();
    if (e === 6) { seat.captured = false; logEvent(game, `${name} breaks free of the Enchantress!`, "g"); }
    else { logEvent(game, `${name} struggles against the Enchantress (rolled ${e}).`); return "skip"; }
  }
  if (seat.tower) {
    seat.towerTries += 1;
    const e = rollDie();
    if (e >= 5 || seat.towerTries >= 4 || hasThing(seat, "key")) { seat.tower = false; logEvent(game, `${name} escapes the Tower!`, "g"); }
    else { logEvent(game, `${name} rattles the Tower bars (rolled ${e}).`); return "skip"; }
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
      if (seat.prayerTurns >= 3) { seat.things.push("ring"); seat.praying = false; clearCard(game, t, false); logEvent(game, `The Bishop blesses ${name} with the Ring (+1 Prowess).`, "g"); enforcePower(game, seat); }
    } else { seat.praying = false; logEvent(game, `${name} leaves the Bishop; the prayer lapses.`); }
  }
  return "act";
}
function advanceTurn(game) {
  const i = game.seat_order.indexOf(game.current_player);
  const next = (i + 1) % game.seat_order.length;
  if (next === 0) game.round += 1;
  game.current_player = game.seat_order[next];
  game.turn_seq += 1;
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
function enterTile(game, seat, tile) {
  const name = KNIGHTS[seat.knight].name;
  if (tile.pendingSpell) {
    const sp = tile.pendingSpell; tile.pendingSpell = null;
    const res = resolveSpell(game, seat, tile, sp);
    if (res.endTurn) { passTurn(game); return; }
  }
  if (tile.name === "xgate" && seat.questDone && !seat.atGate) {
    seat.atGate = true;
    logEvent(game, `${name} stands in the Enchanted Gate, quest fulfilled — hold it to your next turn to leave in triumph.`, "g");
  }
  if (tile.name === "cave" && seat.q === "cave" && !seat.questDone) logEvent(game, `${name} enters the Cave — keep vigil here for 3 full turns.`);
  if (tile.card && DEN[tile.card].king && seat.knight === "britomart" && !anyKing(game)) {
    logEvent(game, "Britomart pays the King no heed and passes by.");
    passTurn(game); return;
  }
  if (tile.card) {
    const den = DEN[tile.card];
    const combat = den.cls === "beast" || den.cls === "warrior" || den.cls === "magic";
    // A greeting whose outcome varies becomes "pick one of six": the player taps one of six
    // identical denizen faces (shuffled here, hidden) instead of watching a die roll.
    if (!combat) {
      const outcomes = greetOutcomes(game, seat, tile);
      if (outcomes) {
        game.pending = { type: "greet_pick", mark: seat.mark, r: tile.r, c: tile.c, card: tile.card,
          groups: outcomes.groups, faceMap: shuffle([1, 2, 3, 4, 5, 6]) };
        return;
      }
    }
    game.pending = { type: "encounter", mark: seat.mark, r: tile.r, c: tile.c, card: tile.card, combat };
    return;   // await the player's Greet/Challenge choice — turn stays open
  }
  passTurn(game);
}

/* ------------------------------- moves ---------------------------------- */
function requireThing(seat, thing) { if (!seat.things.includes(thing)) throw new Error(`You do not hold the ${THINGS[thing].name}.`); }
function requireComp(seat, cid) { if (!seat.companions.includes(cid)) throw new Error("You lack that companion."); }

function doHumanMove(game, seat, action) {
  if (seat.moved) throw new Error("You have already moved this turn.");
  if (game.pending) throw new Error("Resolve the encounter first.");
  const from = cellAt(game.board, seat.r, seat.c);
  const to = cellAt(game.board, action.r, action.c);
  if (!to) throw new Error("No such tile.");
  if (!reachableFrom(game.board, seat, from).includes(to)) throw new Error("That tile is not reachable from here.");
  applyMoveTo(game, seat, from, to);
  enterTile(game, seat, to);
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
  resolveGreet(game, seat, tile, face);
  passTurn(game);
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
  passTurn(game);
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
  logEvent(game, `The Arch-Mage sends ${KNIGHTS[seat.knight].name} to the ${to.label || to.name}.`, "a");
  relocate(game, seat, to.r, to.c);
  enterTile(game, seat, to);
}
function doJoust(game, seat, action) {
  if (game.pending) throw new Error("Resolve the encounter first.");
  if (seat.moved) throw new Error("You have already acted this turn.");
  if (seat.tower || seat.captured) throw new Error("You cannot joust from here.");
  const tile = cellAt(game.board, seat.r, seat.c);
  if (tile && tile.name === "tower") throw new Error("There is no jousting in the Tower.");
  const def = game.players[action && action.target];
  if (!def || def.mark === seat.mark) throw new Error("Choose a knight to joust.");
  if (def.won || def.tower || def.captured) throw new Error("That knight cannot be jousted.");
  if (def.r !== seat.r || def.c !== seat.c) throw new Error("That knight is not in your area.");
  const res = resolveJoust(game, seat, def);
  if (res.chWon) {
    seat.moved = true;                                        // won → pick the prize (turn stays open for it)
    game.pending = { type: "joust-prize", mark: seat.mark, loser: def.mark };
  } else {
    joustPrize(game, def, seat, "tower");                     // lost → the defender unhorses you to the Tower
    passTurn(game);
  }
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
    case "joust": doJoust(game, seat, action); break;
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
    mark: s.mark, name: s.name, is_bot: s.is_bot, knight: s.knight, color: k.color, quest: k.quest,
    r: s.r, c: s.c,
    things: s.things.map((t) => ({ id: t, name: THINGS[t].name })),
    prowess: s.prowess.map((x) => x.name),
    companions: s.companions.map((cid) => ({ id: cid, name: DEN[cid].name })),
    horse: !!s.horse, tower: !!s.tower, captured: !!s.captured,
    questDone: !!s.questDone, isKing: !!s.isKing, atGate: !!s.atGate, won: !!s.won,
    caveTurns: s.caveTurns || 0,
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
    return { type: p.type, mark: p.mark, loser: p.loser, loserName: KNIGHTS[loser.knight].name, spoils: joustSpoils(loser) };
  }
  // "pick one of six" greeting: send the grouped odds, NEVER the face-map (it's the answer key).
  if (p.type === "greet_pick") {
    const den = DEN[p.card];
    return { type: p.type, mark: p.mark, r: p.r, c: p.c, card: p.card, groups: p.groups,
      denName: den ? den.name : "", denClass: den ? den.cls : "" };
  }
  const out = { type: p.type, mark: p.mark, r: p.r, c: p.c, card: p.card, combat: p.combat };
  const den = DEN[p.card];
  if (den) {
    out.denName = den.name; out.denClass = den.cls; out.denS = den.S || 0; out.denP = den.P || 0;
    if (p.combat) { const tile = cellAt(game.board, p.r, p.c); out.preview = combatPreview(game.players[p.mark], tile); }
  }
  return out;
}
function tileToDict(t) {
  if (!t.revealed) return { r: t.r, c: t.c, half: t.half, revealed: false };
  return {
    r: t.r, c: t.c, half: t.half, revealed: true, name: t.name || null, label: t.label || null,
    fixed: !!t.fixed, open: { ...t.open }, card: t.card || null, card2: t.card2 || null, remains: !!t.remains,
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
    log: (game.log || []).slice(-40),
  };
}
