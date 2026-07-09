import assert from "node:assert/strict";
import test from "node:test";
import {
  MYSTIC_WOOD_GAME_ID, isMysticWoodGame, newMysticWoodGame, initMysticWoodSeats,
  makeMysticWoodMove, mysticWoodGameToDict, setMysticWoodRandom,
} from "../games/mystic-wood/rules.js";
import {
  buildBoard, cellAt, reachableFrom, totalP, totalS, capTotal, princessVsKing,
  resolveChallenge, resolveGreet, hasThing, relocate, resolveSpell, greetOutcomes, combatOutcomes,
  logEvent,
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
    mark: "P1", name: knight, is_bot: false, knight, q: KNIGHTS[knight].q, r: 1, c: 1,
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
  setMysticWoodRandom(mulberry32(9));
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

test("Enchantress captures on a loss (escape on a 6), not the Tower", () => {
  const game = { board: buildBoard(), deck: [], discard: [], log: [], seat_order: ["P1"], players: {} };
  const s = seatLit("george"); game.players.P1 = s;
  const tile = cellAt(game.board, s.r, s.c); tile.card = "enchantress"; tile.revealed = true; // magic P6
  setMysticWoodRandom(seq([0.0, 0.99])); // white=1, red=6 → george P1+1 vs 6+6 → lose
  const res = resolveChallenge(game, s, tile);
  assert.equal(res.result, "captured");
  assert.equal(s.captured, true);
  assert.equal(s.tower, false);
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

// The chronicle is capped at 80 lines. An encounter that read its own outcome back by INDEX went
// silent the moment the cap began trimming the front — every greet result and fight detail from
// then on collapsed to the "…reacts." fallback. Report mrdvkkfp-j59jyf: "it just says 'the Merlin
// reacts'… a few interactions". Pin it: a full chronicle must not mute the narration.
test("Greet: the result survives a full chronicle (log-cap regression)", () => {
  const { game, s, tile } = greetGame("george", "merlin");
  for (let i = 0; i < 200; i += 1) logEvent(game, `filler ${i}`);
  assert.equal(game.log.length, 80, "the chronicle is trimmed to its cap");
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
  for (let i = 0; i < 200; i += 1) logEvent(game, `filler ${i}`);
  setMysticWoodRandom(seq([0.99, 0.0]));   // white 6 vs red 1 → George wins
  resolveChallenge(game, s, tile);
  assert.match(game.results.P1.detail, /Troll-slayer/, "the win must still say what was gained");
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
        if (g.pending.type === "greet_pick" || g.pending.type === "combat_pick") makeMysticWoodMove(g, g.current_player, { type: g.pending.type, pick: 1 + Math.floor(rr() * 6) });
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
