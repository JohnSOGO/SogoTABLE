import assert from "node:assert/strict";
import test from "node:test";
import {
  MYSTIC_WOOD_GAME_ID, isMysticWoodGame, newMysticWoodGame, initMysticWoodSeats,
  makeMysticWoodMove, mysticWoodGameToDict, setMysticWoodRandom,
} from "../games/mystic-wood/rules.js";
import {
  buildBoard, cellAt, reachableFrom, totalP, totalS, capTotal, princessVsKing,
  resolveChallenge, resolveGreet, hasThing, relocate, resolveSpell, greetOutcomes, combatOutcomes,
  logEvent, escapeOutcomes, escapeFrees, resolveEscape, raiseStorm, decayStorms,
  joustSpoils, joustPrize, enforcePower,
} from "../games/mystic-wood/engine.js";
import { KNIGHTS, DEN, DEN_TALES, DEN_INTRO } from "../games/mystic-wood/data.js";

// deterministic PRNG
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// return a fixed sequence of unit floats (repeats the last forever) — for rigging dice
function seq(values) { let i = 0; return () => values[Math.min(i++, values.length - 1)]; }
const human = (mark) => ({ mark, name: mark, kind: "human" });
const bot = (mark) => ({ mark, name: mark, kind: "bot", bot_level: 2 });
function seatLit(knight, over = {}) {
  return {
    mark: "P1", name: KNIGHTS[knight].name, is_bot: false, knight, q: KNIGHTS[knight].q, r: 1, c: 1,
    things: [], prowess: [], companions: [], horse: false, tower: false, towerTries: 0,
    captured: false, caveTurns: 0, questDone: false, isKing: false, castleHold: 0, atGate: false,
    _princeUsed: false, _princeAiding: false, moved: false, won: false, ...over,
  };
}

test("derived stats: things, horse, grail, prowess cards", () => {
  const s = seatLit("george", { things: ["lance", "armour"], horse: true, prowess: [{ name: "Ox-slayer", P: 1 }] });
  // george base P1 S3; lance+armour = +3 S; horse +2 S; one prowess card +1 P
  assert.equal(totalS(s), 3 + 1 + 2 + 2);
  assert.equal(totalP(s), 1 + 1);
});

test("transport reveals AND draws a fresh partner tile (no silently-skipped denizen)", () => {
  setMysticWoodRandom(mulberry32(7));
  const game = { board: buildBoard(), deck: ["troll", "orc"], discard: [], log: [] };
  // (7,5) is the point-reflection partner of (1,1): 8-1=7, 6-1=5.
  const dest = cellAt(game.board, 7, 5);
  assert.equal(dest.fixed, false);
  assert.equal(dest.revealed, false);
  const seat = seatLit("george", { r: 1, c: 1 });
  relocate(game, seat, 8 - seat.r, 6 - seat.c);
  assert.equal(seat.r, 7);
  assert.equal(seat.c, 5);
  assert.equal(dest.revealed, true);
  assert.ok(dest.card || dest.pendingSpell, "a card must be drawn when the partner tile is first revealed");
});

test("transport onto an already-revealed tile does not re-draw", () => {
  const game = { board: buildBoard(), deck: ["troll"], discard: [], log: [] };
  const dest = cellAt(game.board, 7, 5);
  dest.revealed = true; dest.card = null;
  const seat = seatLit("george");
  relocate(game, seat, dest.r, dest.c);
  assert.equal(dest.card, null, "no card drawn onto an already-explored tile");
  assert.equal(game.deck.length, 1, "deck left untouched");
});

test("greet shells: greetOutcomes previews the six faces, and a picked face resolves to match", () => {
  const mkGame = () => ({ board: buildBoard(), deck: [], discard: [], log: [], results: {} });
  const witchTile = (game) => { const t = cellAt(game.board, 6, 4); t.revealed = true; t.remains = false; t.card = "witch"; t.card2 = null; return t; };

  // Odds: the Witch is 2 transport, 2 remains, 2 give-Potion across the six faces.
  let game = mkGame();
  const out = greetOutcomes(game, seatLit("roland"), witchTile(game));
  assert.equal(out.faces.length, 6);
  assert.deepEqual(out.faces.map((f) => f.key), ["transport", "transport", "remains", "remains", "give:potion", "give:potion"]);
  assert.deepEqual(Object.fromEntries(out.groups.map((g) => [g.key, g.count])), { transport: 2, remains: 2, "give:potion": 2 });
  assert.equal(out.groups.reduce((a, g) => a + g.count, 0), 6);

  // Parity: picking a shell (forcedDie = its face) applies exactly what the preview said.
  game = mkGame(); let t = witchTile(game); let s = seatLit("roland");
  resolveGreet(game, s, t, 1); assert.equal(t.card, null);                 // face 1 → transport (gone)

  game = mkGame(); t = witchTile(game); s = seatLit("roland");
  resolveGreet(game, s, t, 3); assert.equal(t.remains, true); assert.equal(t.card, "witch"); // face 3 → remains

  game = mkGame(); t = witchTile(game); s = seatLit("roland");
  resolveGreet(game, s, t, 5); assert.ok(s.things.includes("potion")); assert.equal(t.card, null); // face 5 → Potion

  // A single-effect denizen never rolls — no pick.
  const g2 = mkGame(); const nt = cellAt(g2.board, 6, 4); nt.revealed = true; nt.card = "dwarf";
  assert.equal(greetOutcomes(g2, seatLit("roland"), nt), null);
});

test("combat pick: combatOutcomes marks the six white faces vs the rolled red, and a pick resolves", () => {
  setMysticWoodRandom(seq([0.99])); // red die = 6
  const game = { board: buildBoard(), deck: [], discard: [], log: [], results: {}, seat_order: ["P1"], players: {} };
  const s = seatLit("george"); game.players.P1 = s;                 // George S3
  const tile = cellAt(game.board, s.r, s.c); tile.card = "ox"; tile.revealed = true; // Ox: beast S1
  const co = combatOutcomes(game, s, tile);
  assert.equal(co.red, 6);
  // mine = face+3 vs foe = 6+1 = 7 → faces 5,6 win; face 4 ties; 1-3 lose.
  assert.deepEqual(co.faces.map((x) => x.result), ["lose", "lose", "lose", "tie", "win", "win"]);
  assert.deepEqual(Object.fromEntries(co.groups.map((x) => [x.key, x.count])), { win: 2, lose: 3, tie: 1 });

  // Parity: a winning white (5) vs the stored red (6) vanquishes the Ox and yields its slayer.
  const g2 = { board: buildBoard(), deck: [], discard: [], log: [], results: {} };
  const s2 = seatLit("george"); const t2 = cellAt(g2.board, s2.r, s2.c); t2.card = "ox"; t2.revealed = true;
  const res = resolveChallenge(g2, s2, t2, 5, 6);
  assert.equal(res.result, "win");
  assert.ok(s2.prowess.some((p) => p.name === "Ox-slayer"));
  assert.equal(g2.results.P1.picked, true);   // reveal will hide the dice
});

test("combat pick: a tie reopens the pick with a fresh red (rulebook reroll)", () => {
  setMysticWoodRandom(seq([0.99]));   // the reroll's fresh red = 6 → still a losable fight, so a pick reopens
  const g = newMysticWoodGame();
  initMysticWoodSeats(g, [human("P1"), bot("P2"), bot("P3")]);
  const s = g.players.P1; s.knight = "george"; s.things = []; s.prowess = []; s.companions = []; s.horse = false;
  const t = cellAt(g.board, s.r, s.c); t.card = "ox"; t.revealed = true;
  // Rig a guaranteed tie: every shell maps to white 4, stored red 6 → 4+S3 == 6+S1 == 7.
  g.current_player = "P1";
  g.pending = { type: "combat_pick", mark: "P1", r: t.r, c: t.c, card: "ox", red: 6, label: "Strength", groups: [], faceMap: [4, 4, 4, 4, 4, 4] };
  makeMysticWoodMove(g, "P1", { type: "combat_pick", pick: 2 });
  assert.equal(g.pending.type, "combat_pick", "a tie reopens the pick");
  assert.notEqual(g.pending.faceMap, undefined);   // a fresh shuffle was made
  // The projection must never leak the red die or the face-map (the answer key).
  const dict = mysticWoodGameToDict(g);
  assert.equal(dict.pending.type, "combat_pick");
  assert.equal(dict.pending.red, undefined);
  assert.equal(dict.pending.faceMap, undefined);
  assert.ok(Array.isArray(dict.pending.groups));
});

// A fight the knight cannot lose (every white face wins or ties) is empty ceremony — and worse, landing
// on the lone tie face would reroll a FRESH red that could be losable. So it is declared "no match" and
// won outright, no pick. Here a rigged first pick ties, and the reroll's low red leaves no losing face.
test("combat: a foregone win (no losing face) is declared no match — no pick, straight to victory", () => {
  setMysticWoodRandom(seq([0.0]));                 // every reroll red = 1
  const g = newMysticWoodGame();
  initMysticWoodSeats(g, [human("P1"), bot("P2"), bot("P3")]);
  const s = g.players.P1; s.knight = "george"; s.things = []; s.prowess = []; s.companions = []; s.horse = false;
  const t = cellAt(g.board, s.r, s.c); t.card = "ox"; t.revealed = true;   // George S3 vs Wild Ox S1
  g.current_player = "P1";
  // First pick is rigged to a tie (white 4 + S3 == red 6 + S1 == 7); the tie rerolls a fresh red of 1,
  // against which every white face wins — the no-match short-circuit takes over.
  g.pending = { type: "combat_pick", mark: "P1", r: t.r, c: t.c, card: "ox", red: 6, label: "Strength", groups: [], faceMap: [4, 4, 4, 4, 4, 4] };
  makeMysticWoodMove(g, "P1", { type: "combat_pick", pick: 1 });
  assert.equal(g.pending, null, "no second pick is opened for a foregone win");
  assert.ok(g.log.some((e) => /is no match for/.test(e.text)), "the fight is announced as no match");
  assert.ok(s.prowess.some((p) => p.name === "Ox-slayer"), "the win is applied (Ox-slayer gained)");
  assert.equal(g.results.P1.outcome, "win");
  assert.equal(g.results.P1.picked, true);         // resolved via a forced (picked) white, dice hidden on reveal
});

test("greet_pick projection sends the odds but never the face-map", () => {
  setMysticWoodRandom(mulberry32(4));
  const g = newMysticWoodGame();
  initMysticWoodSeats(g, [human("P1"), bot("P2"), bot("P3")]);
  g.pending = { type: "greet_pick", mark: "P1", r: 6, c: 4, card: "witch",
    groups: [{ key: "transport", label: "transports away", count: 2 }, { key: "give:potion", label: "gives a Potion", count: 2 }],
    faceMap: [5, 3, 1, 6, 2, 4] };
  const dict = mysticWoodGameToDict(g);
  assert.equal(dict.pending.type, "greet_pick");
  assert.ok(Array.isArray(dict.pending.groups) && dict.pending.groups.length >= 1);
  assert.equal(dict.pending.faceMap, undefined, "the answer key must never reach the client");
});

test("Grail lends +1 P and +1 S", () => {
  const s = seatLit("perceval", { companions: ["grail"] }); // P3 S1
  assert.equal(totalP(s), 4);
  assert.equal(totalS(s), 2);
});

test("Power-limit total EXEMPTS the Sage (Prince & Sage don't count toward 10)", () => {
  const s = seatLit("perceval", { companions: ["sage"] }); // sage +2 P
  assert.equal(totalP(s), 5);            // sage helps combat
  assert.equal(capTotal(s), totalP(s) + totalS(s) - 2); // but not the cap
  assert.equal(capTotal(s), 5 + 1 - 2);
});

test("Princess withholds her aid vs the King only", () => {
  const s = seatLit("roland", { companions: ["princess"] });
  assert.equal(princessVsKing(s, DEN.king), 1);      // withheld vs King
  assert.equal(princessVsKing(s, DEN.saracen), 0);   // fine vs other warriors
  assert.equal(princessVsKing(seatLit("roland"), DEN.king), 0); // no princess, nothing to withhold
});

test("Challenge: winning a beast yields its slayer card and recycles the card", () => {
  const game = { board: buildBoard(), deck: [], discard: [], log: [], seat_order: ["P1"], players: {} };
  const s = seatLit("george"); game.players.P1 = s;
  const tile = cellAt(game.board, s.r, s.c); tile.card = "ox"; tile.revealed = true;
  setMysticWoodRandom(seq([0.99, 0.0])); // white=6, red=1 → george 6+3 vs 1+1 → win
  const res = resolveChallenge(game, s, tile);
  assert.equal(res.result, "win");
  assert.ok(s.prowess.some((p) => p.name === "Ox-slayer"));
  assert.equal(tile.card, null);
  assert.ok(game.discard.includes("ox")); // recycled
});

test("Challenge: losing a fight sends you to the Tower and RETURNS companions to the wood", () => {
  const game = { board: buildBoard(), deck: [], discard: [], log: [], seat_order: ["P1"], players: {} };
  const s = seatLit("guyon", { companions: ["princess"] }); game.players.P1 = s; // guyon P2 S1 — weak
  const tile = cellAt(game.board, s.r, s.c); tile.card = "orc"; tile.revealed = true; // orc S4
  setMysticWoodRandom(seq([0.0, 0.99])); // white=1, red=6 → guyon 1+1 vs 6+4 → lose
  const res = resolveChallenge(game, s, tile);
  assert.equal(res.result, "lose");
  assert.equal(s.tower, true);
  assert.deepEqual(s.companions, []);            // companions lost
  assert.ok(game.discard.includes("princess")); // but recycled, not deleted (no permanent quest lock)
});

// The result modal shows the roll AND `detail` — without it, slaying the Dragon read as a bare
// "Victory! 9 vs 6" and the player never learned the quest was done.
test("Challenge result carries the consequence: the Dragon slain completes George's quest", () => {
  const game = { board: buildBoard(), deck: [], discard: [], log: [], seat_order: ["P1"], players: {} };
  const s = seatLit("george"); game.players.P1 = s;               // george S3, q=dragon
  const tile = cellAt(game.board, s.r, s.c); tile.card = "dragon"; tile.revealed = true; // beast S5
  setMysticWoodRandom(seq([0.99, 0.0]));                          // white=6, red=1 → 9 vs 6 → win
  assert.equal(resolveChallenge(game, s, tile).result, "win");
  assert.equal(s.questDone, true);
  const roll = game.results.P1;
  assert.equal(roll.outcome, "win");
  assert.match(roll.detail, /Dragon is SLAIN/);
  assert.doesNotMatch(roll.detail, /vanquishes/);                 // headline isn't duplicated into the detail
});

test("Challenge result detail: another knight beating the Dragon is told it fled", () => {
  const game = { board: buildBoard(), deck: [], discard: [], log: [], seat_order: ["P1"], players: {} };
  const s = seatLit("roland"); game.players.P1 = s;               // roland S2, q=princess
  const tile = cellAt(game.board, s.r, s.c); tile.card = "dragon"; tile.revealed = true;
  setMysticWoodRandom(seq([0.99, 0.0]));                          // white=6, red=1 → 8 vs 6 → win
  assert.equal(resolveChallenge(game, s, tile).result, "win");
  assert.ok(!s.questDone);
  assert.match(game.results.P1.detail, /Dragon flees/);
  assert.ok(game.discard.includes("dragon"));                     // recycled — George's quest stays possible
});

// §18.7 / §8 exception: the Enchantress never imprisons. Vanquished by her, you REMAIN in her area
// (not the Tower) — no capture, no escape roll — and your companions become independent.
test("Enchantress: a loss keeps you in her area (not the Tower), and scatters companions", () => {
  const game = { board: buildBoard(), deck: [], discard: [], log: [], seat_order: ["P1"], players: {} };
  const s = seatLit("george", { r: 5, c: 5, companions: ["sage"] }); game.players.P1 = s;
  const tile = cellAt(game.board, 5, 5); tile.card = "enchantress"; tile.revealed = true; // magic P6
  setMysticWoodRandom(seq([0.0, 0.99])); // white=1, red=6 → george loses
  const res = resolveChallenge(game, s, tile);
  assert.equal(res.result, "lose");
  assert.equal(s.tower, false, "not sent to the Tower");
  assert.equal(s.captured, false, "no capture state — she doesn't imprison");
  assert.deepEqual([s.r, s.c], [5, 5], "remains in her area");
  assert.deepEqual(s.companions, [], "companions become independent");
});

// Tower escape (§17.7): frees on 5–6, and the 4th attempt frees you no matter the die — surfaced as a
// VISIBLE pick each turn, not an invisible auto-roll. (The Enchantress no longer jails; §18.7.)
test("escape rule: the Tower frees on 5–6 or the 4th attempt", () => {
  assert.equal(escapeFrees("tower", 4, 1), false);
  assert.equal(escapeFrees("tower", 5, 1), true);
  assert.equal(escapeFrees("tower", 1, 4), true, "the 4th attempt frees you no matter the die");
});

test("escape odds: the projected groups match the rule (2/6 free from the Tower)", () => {
  const tower = escapeOutcomes("tower", 1).groups;
  assert.deepEqual(tower.map((g) => [g.key, g.count]), [["free", 2], ["held", 4]]);
  const last = escapeOutcomes("tower", 4).groups;   // the 4th dawn: every face frees you
  assert.deepEqual(last.map((g) => [g.key, g.count]), [["free", 6]]);
});

test("resolveEscape: a freeing face releases and records a viewable roll; a held one records a failure", () => {
  const g = { log: [], results: {} };
  const s = seatLit("george", { tower: true, towerTries: 1 });
  assert.equal(resolveEscape(g, s, 6, "tower", 1).freed, true);
  assert.equal(s.tower, false);
  assert.equal(g.results.P1.escape, true);
  assert.equal(g.results.P1.freed, true);            // the client pops a result modal off this seq'd record
  const g2 = { log: [], results: {} };
  const s2 = seatLit("george", { tower: true, towerTries: 1 });
  assert.equal(resolveEscape(g2, s2, 2, "tower", 1).freed, false);
  assert.equal(s2.tower, true);
  assert.equal(g2.results.P1.freed, false);
});

test("imprisoned human: the escape surfaces as a pick-one-of-six each turn (no invisible auto-roll)", () => {
  setMysticWoodRandom(mulberry32(5));
  const g = newMysticWoodGame();
  initMysticWoodSeats(g, [human("P1"), bot("P2"), bot("P3")]);
  g.players.P1.tower = true; g.players.P1.towerTries = 0;
  makeMysticWoodMove(g, "P1", { type: "end-turn" });   // cycle the bots; P1's next turn must offer the pick
  assert.equal(g.current_player, "P1");
  assert.equal(g.pending.type, "escape_pick");
  assert.equal(g.pending.mode, "tower");
  const proj = mysticWoodGameToDict(g).pending;
  assert.equal(proj.type, "escape_pick");
  assert.ok(!("faceMap" in proj), "the faceMap (answer key) is never projected to the client");
  assert.ok(proj.groups.some((gr) => gr.key === "free" && gr.count === 2));
  // resolving a held face keeps you imprisoned AND ends the turn (turn_seq advances past the bots);
  // the next imprisoned turn then offers a fresh pick (the 2nd of up-to-4 attempts).
  const held = g.pending.faceMap.indexOf(1) + 1;       // the pick mapping to a die 1 (Tower: held)
  const seqBefore = g.turn_seq;
  makeMysticWoodMove(g, "P1", { type: "escape_pick", pick: held });
  assert.equal(g.players.P1.tower, true);
  assert.ok(g.turn_seq > seqBefore, "a failed escape ends the turn");
  assert.equal(g.players.P1.towerTries, 1, "the attempt counted (toward the 4th-turn auto-free)");
  assert.equal(g.results.P1.escape, true, "the failed attempt is a viewable roll, not just a chronicle line");
  assert.equal(g.pending.type, "escape_pick", "the next turn offers a fresh escape pick");
  assert.equal(g.pending.tries, 2, "…now the 2nd attempt");
});

test("imprisoned bot: still auto-resolves its escape (no pending left dangling for a bot)", () => {
  setMysticWoodRandom(seq([0.0]));   // every die = 1 → a bot never rolls a 5/6, so it stays put and skips
  const g = newMysticWoodGame();
  initMysticWoodSeats(g, [human("P1"), bot("P2"), bot("P3")]);
  g.players.P2.tower = true; g.players.P2.towerTries = 0;
  makeMysticWoodMove(g, "P1", { type: "end-turn" });   // hand off to the imprisoned bot P2
  assert.equal(g.current_player, "P1", "the bot's failed escape is auto-skipped back to the human");
  assert.equal(g.players.P2.tower, true);
  assert.ok(!g.pending, "a bot never leaves an escape pick pending");
});

test("Mystic Horn: scatters the free knights and announces a seq'd tour for the client to animate", () => {
  setMysticWoodRandom(mulberry32(11));
  const game = {
    board: buildBoard(), deck: [], discard: [], log: [],
    seat_order: ["P1", "P2", "P3"], players: {},
  };
  game.players.P1 = seatLit("george", { mark: "P1", r: 1, c: 1 });
  game.players.P2 = seatLit("britomart", { mark: "P2", r: 6, c: 2 });
  game.players.P3 = seatLit("perceval", { mark: "P3", r: 3, c: 4, tower: true }); // never hears it
  const tile = cellAt(game.board, 1, 1);

  const res = resolveSpell(game, game.players.P1, tile, "horn");
  assert.equal(res.endTurn, true, "the Horn ends the drawer's turn");
  assert.deepEqual([game.players.P1.r, game.players.P1.c], [7, 5]);
  assert.deepEqual([game.players.P2.r, game.players.P2.c], [2, 4]);
  assert.deepEqual([game.players.P3.r, game.players.P3.c], [3, 4], "the Tower's prisoner stays put");

  assert.equal(game.horn_seq, 1);
  assert.equal(game.horn.seq, 1);
  assert.equal(game.horn.byName, KNIGHTS.george.name);
  assert.deepEqual(game.horn.marks, ["P1", "P2"], "only the scattered knights tour");
  assert.deepEqual(game.horn.tour, [[7, 5], [2, 4]], "landing places, in seat order");

  // The seq only advances, so a re-render/reload never replays the effect; a second Horn does.
  resolveSpell(game, game.players.P1, tile, "horn");
  assert.equal(game.horn.seq, 2);
  assert.deepEqual([game.players.P1.r, game.players.P1.c], [1, 1], "scattered back through the centre");
});

test("Mystic Horn: the projection carries the horn event to the client", () => {
  setMysticWoodRandom(mulberry32(5));
  const game = initMysticWoodSeats(newMysticWoodGame(), [human("P1"), bot("P2"), bot("P3")]);
  assert.equal(mysticWoodGameToDict(game).horn, null, "no horn until one sounds");
  game.horn = { seq: 3, byName: "George", marks: ["P1"], tour: [[7, 5]] };
  assert.deepEqual(mysticWoodGameToDict(game).horn, { seq: 3, byName: "George", marks: ["P1"], tour: [[7, 5]] });
});

function greetGame(knight, card) {
  const game = { board: buildBoard(), deck: [], discard: [], log: [], seat_order: ["P1"], players: {} };
  const s = seatLit(knight); game.players.P1 = s;
  const tile = cellAt(game.board, s.r, s.c); tile.card = card; tile.revealed = true;
  return { game, s, tile };
}

test("Greet: a single-outcome denizen gives its Thing with no die rolled", () => {
  for (const [card, thing] of [["dwarf", "armour"], ["nymph", "crystal"]]) {
    const { game, s, tile } = greetGame("george", card);
    setMysticWoodRandom(() => { throw new Error(`${card} must not roll`); });
    resolveGreet(game, s, tile);
    assert.deepEqual(s.things, [thing]);
    assert.equal(tile.card, null);
    assert.equal(game.results.P1.die, null);   // client shows no die
  }
});

test("Greet: the Sage and the Bishop have fixed reactions and roll no die", () => {
  const sage = greetGame("george", "sage");
  setMysticWoodRandom(() => { throw new Error("sage must not roll"); });
  resolveGreet(sage.game, sage.s, sage.tile);
  assert.deepEqual(sage.s.companions, ["sage"]);
  assert.equal(sage.game.results.P1.die, null);

  const bishop = greetGame("george", "bishop");
  setMysticWoodRandom(() => { throw new Error("bishop must not roll"); });
  resolveGreet(bishop.game, bishop.s, bishop.tile);
  assert.equal(bishop.s.praying, true);
  assert.equal(bishop.game.results.P1.die, null);
});

// Report mrfof9ip-to1swn: "Bishop doesn't make me wait three turns. It starts but doesn't count."
// A bot HOLDS while praying (ai.js), so its prayer counts every round — but a human used to be
// handed a normal, active turn, and any move silently LAPSED the prayer, so a human playing
// naturally never accumulated the count. Kneeling is a commitment: the Bishop must hold the human
// the same three turns hands-free. After the kneel turn ends, the turn machine must auto-skip the
// still-praying seat (counting the prayer) until the Ring is earned — no further input required.
test("Bishop: kneeling holds a human for three turns and earns the Ring hands-free", () => {
  setMysticWoodRandom(mulberry32(42));
  const game = newMysticWoodGame();
  initMysticWoodSeats(game, [human("P1"), bot("P2"), bot("P3")]);
  assert.equal(game.current_player, "P1");
  const p1 = game.players.P1;

  // Kneel: put the Bishop under the human and start the prayer, then end the kneel turn once.
  const tile = cellAt(game.board, p1.r, p1.c);
  tile.card = "bishop"; tile.revealed = true;
  resolveGreet(game, p1, tile);
  assert.equal(p1.praying, true);
  assert.equal(p1.prayerTurns, 0);

  makeMysticWoodMove(game, "P1", { type: "end-turn" });   // one input — the Bishop takes it from here

  assert.equal(game.status, "playing");
  assert.equal(p1.prayerTurns, 3, "the prayer must count to three unattended");
  assert.equal(p1.praying, false, "the prayer completes and releases the knight");
  assert.ok(p1.things.includes("ring"), "three turns of prayer earn the Ring");
  assert.equal(game.current_player, "P1", "the freed knight gets its turn back");
});

test("Greet: a varying reaction table still rolls (Merlin: 1-2 transports, 5-6 gives the Shield)", () => {
  const low = greetGame("george", "merlin");
  setMysticWoodRandom(seq([0.0]));   // die = 1 → transports away, no Thing
  resolveGreet(low.game, low.s, low.tile);
  assert.deepEqual(low.s.things, []);
  assert.equal(low.game.results.P1.die, 1);

  const high = greetGame("george", "merlin");
  setMysticWoodRandom(seq([0.99]));  // die = 6 → gives the Shield
  resolveGreet(high.game, high.s, high.tile);
  assert.deepEqual(high.s.things, ["shield"]);
  assert.equal(high.game.results.P1.die, 6);
});

test("Greet: the result narrates the reaction, and Merlin takes no article", () => {
  const { game, s, tile } = greetGame("george", "merlin");
  setMysticWoodRandom(seq([0.4]));   // die = 3 → remains
  resolveGreet(game, s, tile);
  const rec = game.results.P1;
  assert.equal(rec.foePhrase, "Merlin", "a person, not a species: never 'the Merlin'");
  assert.match(rec.result, /Merlin turns a page/);
  assert.doesNotMatch(rec.result, /reacts/);

  const witch = greetGame("roland", "witch");
  setMysticWoodRandom(seq([0.99]));  // die = 6 → gives the Potion
  resolveGreet(witch.game, witch.s, witch.tile);
  assert.equal(witch.game.results.P1.foePhrase, "the Witch");
  const [scene, detail] = witch.game.results.P1.result.split("<br>");
  assert.match(scene, /The Witch presses a warm phial into Roland's hand/, "the story leads");
  assert.match(detail, /Potion — \+1 Strength/, "the bookkeeping follows");
});

// The chronicle is capped (LOG_CAP=300). An encounter that read its own outcome back by INDEX went
// silent the moment the cap began trimming the front — every greet result and fight detail from
// then on collapsed to the "…reacts." fallback. Report mrdvkkfp-j59jyf: "it just says 'the Merlin
// reacts'… a few interactions". Pin it: a full chronicle must not mute the narration.
test("Greet: the result survives a full chronicle (log-cap regression)", () => {
  const { game, s, tile } = greetGame("george", "merlin");
  for (let i = 0; i < 400; i += 1) logEvent(game, `filler ${i}`);   // exceed the cap so trimming actually occurs
  assert.equal(game.log.length, 300, "the chronicle is trimmed to its cap");
  setMysticWoodRandom(seq([0.4]));   // die = 3 → remains
  resolveGreet(game, s, tile);
  assert.match(game.results.P1.result, /Merlin turns a page/);
});

// Every reaction a greet table can actually produce must have a story written for it. Without this
// a new `tbl` row lands the player on engine.js's bare fallback, which is how the encounter card
// came to read like bookkeeping. `befriend` narrates itself in befriend(); the Bishop's table is
// never applied (greeting him starts a prayer instead).
test("Greet: every reaction a table can roll has a tale", () => {
  const missing = [];
  for (const [id, den] of Object.entries(DEN)) {
    if (!den.tbl || id === "bishop") continue;
    for (const act of new Set(Object.values(den.tbl))) {
      if (act === "befriend") continue;
      const keys = act.startsWith("run") ? ["run", "catch"] : [act];
      for (const k of keys) if (!(DEN_TALES[id] && DEN_TALES[id][k])) missing.push(`${id}.${k}`);
    }
  }
  assert.deepEqual(missing, [], "write a line in DEN_TALES (data.js) for each");
});

// Every card a knight can actually MEET (encounter card or pick grid) must have its own first-sight
// line, so no denizen falls through to the bare "{k} comes upon …" fallback. Spells resolve on
// arrival and are never met, so they're exempt.
test("Encounter: every denizen you can meet has a first-sight intro", () => {
  const missing = Object.entries(DEN)
    .filter(([, den]) => den.cls !== "spell")
    .map(([id]) => id)
    .filter((id) => !DEN_INTRO[id]);
  assert.deepEqual(missing, [], "write a line in DEN_INTRO (data.js) for each");
});

test("Challenge: the detail survives a full chronicle (log-cap regression)", () => {
  const { game, s, tile } = greetGame("george", "troll");
  for (let i = 0; i < 400; i += 1) logEvent(game, `filler ${i}`);   // exceed the cap so trimming actually occurs
  setMysticWoodRandom(seq([0.99, 0.0]));   // white 6 vs red 1 → George wins
  resolveChallenge(game, s, tile);
  assert.match(game.results.P1.detail, /Troll-slayer/, "the win must still say what was gained");
});

// Magician's Storm (§18.11): bars NORMAL movement in and out of the stormy area; magical movement
// (relocate) bypasses; lasts three full turns after the creating turn, then clears.
test("Storm: bars entering and leaving; magical movement bypasses", () => {
  const game = { board: buildBoard(), deck: [], discard: [], log: [], seat_order: ["P1"], players: {} };
  const s = seatLit("george", { r: 8, c: 3 }); game.players.P1 = s;
  const here = cellAt(game.board, 8, 3); here.revealed = true;
  const nb = cellAt(game.board, 8, 2); nb.revealed = true;
  raiseStorm(game, s, nb);
  assert.ok(!reachableFrom(game.board, s, here).includes(nb), "cannot enter a stormy area");
  raiseStorm(game, s, here);
  assert.deepEqual(reachableFrom(game.board, s, here), [], "cannot leave a stormy area by normal movement");
  relocate(game, s, 0, 3);
  assert.deepEqual([s.r, s.c], [0, 3], "magical movement (relocate) ignores the storm");
});

test("Storm: three full turns after the creating turn, then clears", () => {
  const game = { board: buildBoard(), log: [] };
  const t = cellAt(game.board, 5, 5); t.revealed = true;
  raiseStorm(game, { name: "Sogo" }, t);
  assert.equal(t.storm.turns, 3);
  decayStorms(game); assert.equal(t.storm.turns, 3, "the creating turn is free (fresh)");
  decayStorms(game); assert.equal(t.storm.turns, 2);
  decayStorms(game); assert.equal(t.storm.turns, 1);
  decayStorms(game); assert.equal(t.storm, null, "cleared after three full turns");
});

test("Storm: requires the Magician, never from/at the Tower, one per turn", () => {
  const g = newMysticWoodGame();
  initMysticWoodSeats(g, [human("P1"), bot("P2"), bot("P3")]);
  g.current_player = "P1"; const s = g.players.P1;
  const gen = cellAt(g.board, 3, 3); gen.revealed = true;   // generic tile; Tower sits at 4,3
  assert.throws(() => makeMysticWoodMove(g, "P1", { type: "storm", r: 3, c: 3 }), /companion|lack/i);
  s.companions = ["magician"];
  assert.throws(() => makeMysticWoodMove(g, "P1", { type: "storm", r: 4, c: 3 }), /Tower/i);
  makeMysticWoodMove(g, "P1", { type: "storm", r: 3, c: 3 });
  assert.ok(cellAt(g.board, 3, 3).storm, "storm raised on a valid area");
  assert.equal(g.current_player, "P1", "raising a storm does not end the turn");
  const t2 = cellAt(g.board, 5, 5); t2.revealed = true;
  assert.throws(() => makeMysticWoodMove(g, "P1", { type: "storm", r: 5, c: 5 }), /already raised/i);
});

// §18.12 Fog rotates every revealed non-fixed area 180°; §18.14 Wind sweeps all Things held by knights.
test("Spells: Fog rotates the wood; Wind sweeps held Things", () => {
  const game = { board: buildBoard(), log: [], seat_order: ["P1", "P2"], players: {} };
  const t = cellAt(game.board, 5, 5); t.revealed = true; t.open = { N: 1, S: 0, E: 1, W: 0 };
  resolveSpell(game, { name: "Sogo" }, t, "fog");
  assert.deepEqual(t.open, { N: 0, S: 1, E: 0, W: 1 }, "Fog rotates the area 180°");
  game.players.P1 = seatLit("george", { things: ["lance", "armour"] });
  game.players.P2 = seatLit("roland", { things: ["shield"] });
  resolveSpell(game, game.players.P1, cellAt(game.board, 0, 0), "wind");
  assert.deepEqual(game.players.P1.things, [], "Wind sweeps P1's Things");
  assert.deepEqual(game.players.P2.things, [], "Wind sweeps every knight's Things");
});

// §18.15: the Prince leaves after aiding, and a Prince-assisted kill grants no prowess.
test("Prince: departs after lending aid; no prowess from a Prince-assisted kill", () => {
  setMysticWoodRandom(seq([0.99, 0.0]));   // white 6 vs red 1 → a win
  const game = { board: buildBoard(), deck: [], discard: [], log: [], results: {}, seat_order: ["P1"], players: {} };
  const s = seatLit("perceval", { companions: ["prince"] }); game.players.P1 = s;   // q=grail, so the Prince may aid
  const tile = cellAt(game.board, s.r, s.c); tile.card = "troll"; tile.revealed = true;
  resolveChallenge(game, s, tile);
  assert.ok(!s.companions.includes("prince"), "the Prince leaves after aiding");
  assert.ok(!s.prowess.some((p) => p.name === "Troll-slayer"), "no prowess from a Prince-assisted kill");
});

// §18.1: Arch-Mage transport is one-shot — he leaves you after use (no infinite teleport).
test("Arch-Mage: transport spends the companion", () => {
  const g = newMysticWoodGame();
  initMysticWoodSeats(g, [human("P1"), bot("P2"), bot("P3")]);
  g.current_player = "P1"; const s = g.players.P1; s.companions = ["archmage"];
  const dest = cellAt(g.board, 1, 1); dest.revealed = true;   // Grove (a named glade), unoccupied
  makeMysticWoodMove(g, "P1", { type: "transport", r: 1, c: 1 });
  assert.ok(!s.companions.includes("archmage"), "the Arch-Mage is spent after one transport");
});

// §12: a joust winner may take a prowess card; a Companion must be APPROACHED, not simply stolen.
test("Joust prize: prowess card takeable; companion needs an approach roll", () => {
  const game = { board: buildBoard(), deck: [], discard: [], log: [], results: {}, seat_order: ["P1", "P2"], players: {} };
  const w = seatLit("george", { mark: "P1" });
  const l = seatLit("roland", { mark: "P2", prowess: [{ name: "Ox-slayer", P: 1 }], companions: ["grail"] });
  game.players.P1 = w; game.players.P2 = l;
  assert.deepEqual(joustSpoils(l), { things: false, prowess: true, companions: true });
  joustPrize(game, w, l, "prowess");
  assert.ok(w.prowess.some((p) => p.name === "Ox-slayer") && l.prowess.length === 0, "winner takes the prowess card");
  setMysticWoodRandom(seq([0.0]));   // die 1 → roll = 1 + P(george 1) = 2, well under the 9 the Grail needs
  joustPrize(game, w, l, "companion");
  assert.deepEqual(l.companions, ["grail"], "a failed approach leaves the companion loyal to the foe");
});

// §9: a two-card area (Palace/Altar) holds two denizens — you must meet BOTH. The second used to be
// silently discarded when the first was cleared; now it opens a fresh encounter the same visit.
test("Two-card area: the second denizen is met, not discarded", () => {
  setMysticWoodRandom(() => 0.5);   // neutral: the follow-on Boar fight is losable (not an auto-win), so it opens a pick
  const g = newMysticWoodGame();
  initMysticWoodSeats(g, [human("P1"), bot("P2"), bot("P3")]);
  g.current_player = "P1"; const s = g.players.P1;
  s.knight = "george"; s.q = "dragon"; s.things = []; s.prowess = []; s.companions = []; s.horse = false;
  const tile = cellAt(g.board, s.r, s.c); tile.revealed = true; tile.card = "ox"; tile.card2 = "boar";
  g.pending = { type: "combat_pick", mark: "P1", r: tile.r, c: tile.c, card: "ox", red: 1, label: "Strength", faceMap: [6, 6, 6, 6, 6, 6] };
  makeMysticWoodMove(g, "P1", { type: "combat_pick", pick: 1 });   // white 6 vs red 1 → the Ox is slain
  assert.equal(g.pending && g.pending.type, "combat_pick", "the second denizen opens a fresh encounter");
  assert.equal(g.pending.card, "boar", "the second denizen (Boar) is met, not discarded");
  assert.equal(g.current_player, "P1", "both are met this visit — the turn hasn't passed");
});

// §18.19: the Sage aids ONE approach — a challenge OR a greeting — then departs (was: persisted through greets).
test("Sage: departs after aiding a greeting, not just a challenge", () => {
  const game = { board: buildBoard(), deck: [], discard: [], log: [], results: {} };
  const s = seatLit("roland", { companions: ["sage"] });
  const tile = cellAt(game.board, s.r, s.c); tile.revealed = true; tile.card = "princess";
  resolveGreet(game, s, tile, 3);   // approaching the Princess uses prowess (incl. the Sage's +2)
  assert.ok(!s.companions.includes("sage"), "the Sage is spent after aiding a greeting");
});

// §14: the auto power-limit shed must never drop a still-needed quest item (Guyon's Golden Bough).
test("Power limit: keeps the quest-critical Golden Bough", () => {
  const game = { log: [] };
  const s = seatLit("guyon", { things: ["golden_bough", "armour", "lance", "shield"],
    prowess: [{ name: "a", P: 1 }, { name: "b", P: 1 }, { name: "c", P: 1 }, { name: "d", P: 1 }] });
  assert.ok(capTotal(s) > 10, "starts over the power limit");
  enforcePower(game, s);
  assert.ok(s.things.includes("golden_bough"), "the Golden Bough is kept while the Cave quest is unfinished");
  assert.ok(capTotal(s) <= 10, "power is brought back within the limit");
});

test("contract: id predicate, seat count, distinct knights, projection shape", () => {
  setMysticWoodRandom(mulberry32(1));
  const g = newMysticWoodGame();
  assert.equal(g.game_id, MYSTIC_WOOD_GAME_ID);
  initMysticWoodSeats(g, [human("P1"), bot("P2"), bot("P3")]);
  assert.ok(isMysticWoodGame(g));
  assert.equal(g.seat_order.length, 3);
  const knights = g.seat_order.map((m) => g.players[m].knight);
  assert.equal(new Set(knights).size, 3);
  const d = mysticWoodGameToDict(g);
  assert.equal(d.board.length, 63);
  assert.equal(d.players.length, 3);
  assert.ok(d.players.every((p) => typeof p.totalP === "number" && typeof p.totalS === "number"));
});

test("contract: min 3 and max 5 seats enforced", () => {
  setMysticWoodRandom(mulberry32(2));
  assert.throws(() => initMysticWoodSeats(newMysticWoodGame(), [human("P1"), bot("P2")]));
  const six = ["P1", "P2", "P3", "P4", "P5", "P6"].map((m, i) => (i ? bot(m) : human(m)));
  assert.throws(() => initMysticWoodSeats(newMysticWoodGame(), six));
});

test("contract: rejects out-of-turn and unreachable moves; bot seats are automatic", () => {
  setMysticWoodRandom(mulberry32(3));
  const g = newMysticWoodGame();
  initMysticWoodSeats(g, [human("P1"), bot("P2"), bot("P3")]);
  assert.equal(g.current_player, "P1"); // seat 0 human acts first
  assert.throws(() => makeMysticWoodMove(g, "P2", { type: "move", r: 0, c: 0 })); // not P2's turn
  assert.throws(() => makeMysticWoodMove(g, "P1", { type: "move", r: 0, c: 0 })); // unreachable
});

test("integration: seeded bot-heavy games run to completion with a valid winner", () => {
  let completed = 0;
  for (let seed = 1; seed <= 24; seed++) {
    setMysticWoodRandom(mulberry32(seed * 7919));
    const g = newMysticWoodGame();
    initMysticWoodSeats(g, [human("P1"), bot("P2"), bot("P3")]);
    const rr = mulberry32(seed * 13 + 1);
    let steps = 0;
    while (g.status === "playing" && steps++ < 8000) {
      const seat = g.players[g.current_player];
      assert.equal(seat.is_bot, false, "advance loop must stop only on a human");
      if (g.pending) {
        if (g.pending.type === "greet_pick" || g.pending.type === "combat_pick" || g.pending.type === "escape_pick") makeMysticWoodMove(g, g.current_player, { type: g.pending.type, pick: 1 + Math.floor(rr() * 6) });
        else makeMysticWoodMove(g, g.current_player, { type: "encounter", choice: g.pending.combat ? "challenge" : "greet" });
        continue;
      }
      const from = cellAt(g.board, seat.r, seat.c);
      const reach = reachableFrom(g.board, seat, from);
      if (!reach.length) { makeMysticWoodMove(g, g.current_player, { type: "end-turn" }); continue; }
      const to = reach[Math.floor(rr() * reach.length)];
      makeMysticWoodMove(g, g.current_player, { type: "move", r: to.r, c: to.c });
    }
    if (g.status === "complete") { completed++; assert.ok(g.players[g.winner], "winner is a real seat"); }
  }
  assert.ok(completed >= 18, `most seeded games complete under random play (${completed}/24)`);
});

// The Horse (rulebook §6): 1,2→N · 3,4→S · 5→E · 6→W "if a road leads that way; else it befriends".
// It RUNS — into the next glade, where it can be chased — it never leaves the wood.
function horseAt(r, c) {
  const g = { board: buildBoard(), deck: [], discard: [], log: [], results: {} };
  const t = cellAt(g.board, r, c);
  t.revealed = true; t.open = { N: 1, E: 1, S: 1, W: 1 }; t._openSet = true; t.card = "horse";
  return { g, t };
}

test("horse: bolts into the neighbouring glade rather than vanishing (you can give chase)", () => {
  const { g, t } = horseAt(4, 3);
  const s = seatLit("george", { r: 4, c: 3 });
  resolveGreet(g, s, t, 1);                       // face 1 → runs north
  const nb = cellAt(g.board, 3, 3);
  assert.equal(t.card, null, "the Horse has left this glade");
  assert.equal(nb.card, "horse", "…and stands in the glade to the north");
  assert.equal(s.horse, false, "it was not caught");
  assert.deepEqual(g.discard, [], "a running Horse is never discarded out of play");
});

test("horse: walled in, it is caught — held, not reshuffled into the deck", () => {
  const { g, t } = horseAt(4, 3);
  t.open.N = 0;                                   // no road north
  const s = seatLit("george", { r: 4, c: 3 });
  resolveGreet(g, s, t, 1);
  assert.equal(s.horse, true, "no road that way → the Horse befriends you");
  assert.equal(t.card, null);
  assert.deepEqual(g.discard, [], "a held Horse must not return to the deck");
  assert.equal(totalS(s), 3 + 2, "the Horse is worth +2 Strength");
});

test("horse: the board edge catches it too (a run off-board is no road)", () => {
  const { g, t } = horseAt(0, 3);                 // top row: nothing north of it
  const s = seatLit("george", { r: 0, c: 3 });
  resolveGreet(g, s, t, 2);                       // face 2 → runs north
  assert.equal(s.horse, true);
});

test("horse: the odds panel shows the catch faces the board actually allows", () => {
  const { g, t } = horseAt(4, 3);
  t.open.E = 0;                                   // face 5 (east) has nowhere to go → catch
  const s = seatLit("george", { r: 4, c: 3 });
  const out = greetOutcomes(g, s, t);
  const catchGrp = out.groups.find((x) => x.key === "catch");
  const runGrp = out.groups.find((x) => x.key === "run");
  assert.equal(catchGrp.count, 1, "exactly the east face catches");
  assert.equal(runGrp.count, 5);
  assert.equal(out.faces[4].key, "catch", "face 5 is the eastward bolt");
});
