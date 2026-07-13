import assert from "node:assert/strict";
import test from "node:test";
import {
  newMysticWoodGame, initMysticWoodSeats, makeMysticWoodMove, mysticWoodGameToDict, setMysticWoodRandom,
} from "../games/mystic-wood/rules.js";
import { buildBoard, cellAt, escapeOutcomes, escapeFrees, resolveEscape } from "../games/mystic-wood/engine.js";
import { resolveSpell } from "../games/mystic-wood/spells.js";
import { KNIGHTS } from "../games/mystic-wood/data.js";

// The Mystic Wood — imprisonment (§17.7 Tower escape) and the Mystic Horn scatter (§6). Split out of
// mystic-wood-rules.test.js, which sits at its 800-line cap.
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
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
