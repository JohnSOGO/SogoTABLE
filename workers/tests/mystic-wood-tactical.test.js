import assert from "node:assert/strict";
import test from "node:test";
import {
  newMysticWoodGame, initMysticWoodSeats, makeMysticWoodMove, mysticWoodGameToDict, setMysticWoodRandom,
} from "../games/mystic-wood/rules.js";
import { cellAt, relocate, takeChivalry, deliverRescue, becomeKing } from "../games/mystic-wood/engine.js";
import { KNIGHTS } from "../games/mystic-wood/data.js";

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function seq(values) { let i = 0; return () => values[Math.min(i++, values.length - 1)]; }
const human = (mark) => ({ mark, name: mark, kind: "human" });
const bot = (mark) => ({ mark, name: mark, kind: "bot", bot_level: 2 });

// Turn-flow (§5.2 / §8 / §12 / §18.10): a move no longer auto-ends the turn — you may take a free move
// through an empty explored area, withdraw from a denizen, joust after moving, and unhorse a player-King.
function moveGame(overrides = {}) {
  setMysticWoodRandom(mulberry32(5));
  const g = newMysticWoodGame();
  initMysticWoodSeats(g, [human("P1"), bot("P2"), bot("P3")]);
  g.current_player = "P1"; Object.assign(g.players.P1, overrides);
  return g;
}

test("Free move: entering an empty explored area keeps the turn open (may move again)", () => {
  const g = moveGame({ r: 8, c: 3 });
  const dest = cellAt(g.board, 8, 2); dest.revealed = true; dest.card = null; dest.card2 = null; dest.open = { N: 1, E: 1, S: 1, W: 1 };
  cellAt(g.board, 8, 3).open = { N: 1, E: 1, S: 1, W: 1 };
  makeMysticWoodMove(g, "P1", { type: "move", r: 8, c: 2 });
  assert.equal(g.current_player, "P1", "an empty explored area does not end the turn");
  assert.equal(g.players.P1.freeMove, true, "a free continuation is granted");
  assert.equal(g.pending, null);
});

test("Withdraw: step back from a met denizen and end the turn", () => {
  const g = moveGame({ r: 8, c: 3 });
  const dest = cellAt(g.board, 8, 2); dest.revealed = true; dest.card = "troll"; dest.open = { N: 1, E: 1, S: 1, W: 1 };
  cellAt(g.board, 8, 3).open = { N: 1, E: 1, S: 1, W: 1 };
  makeMysticWoodMove(g, "P1", { type: "move", r: 8, c: 2 });
  assert.ok(g.pending, "a denizen opens an encounter");
  // Withdrawing returns P1 to (8,3) and ends the turn.
  const before = g.turn_seq;
  // Force it back to P1 for a clean assert on position (turn may have advanced through bots).
  makeMysticWoodMove(g, "P1", { type: "withdraw" });
  assert.deepEqual([g.players.P1.r, g.players.P1.c], [8, 3], "withdrew to the area it came from");
  assert.equal(g.players.P1.tower, false);
});

test("Joust after moving is allowed; unhorsing a player-King eliminates him and passes the crown", () => {
  const g = moveGame({ r: 5, c: 5 });
  const foe = g.players.P2; foe.r = 5; foe.c = 5; foe.isKing = true; foe.knight = "king" in KNIGHTS ? foe.knight : foe.knight;
  g.players.P1.moved = true;   // already moved this turn — a joust must still be allowed
  setMysticWoodRandom(seq([0.99, 0.0]));   // challenger rolls high → wins
  makeMysticWoodMove(g, "P1", { type: "joust", target: "P2" });
  assert.equal(foe.out, true, "the unhorsed player-King is out of the game");
  assert.equal(foe.isKing, false);
  assert.equal(g.players.P1.isKing, true, "the victor takes the crown");
});

test("Transport-meets-denizen: relocate flags an approach when a denizen waits (§5.3/§8)", () => {
  const g = moveGame({ r: 8, c: 3 });
  const dest = cellAt(g.board, 0, 3); dest.revealed = true; dest.card = "troll";
  relocate(g, g.players.P1, 0, 3);
  assert.equal(g.players.P1.mustApproach, true, "must approach the denizen at the destination next turn");
  const empty = cellAt(g.board, 1, 3); empty.revealed = true; empty.card = null;
  g.players.P2.mustApproach = false;
  relocate(g, g.players.P2, 1, 3);
  assert.ok(!g.players.P2.mustApproach, "no approach flagged for an empty destination");
});

// Chivalry (§15): seeing a Boy/Damsel lays the obligation, it passes to the last to see, delivery
// rescues (Damsel → the Queen's area, Boy → the Earthly Gate), and a King is exempt.
test("Chivalry: obligation on sight passes to the last to see; delivery rescues", () => {
  const g = moveGame({ r: 8, c: 3 });
  const t = cellAt(g.board, 5, 5); t.revealed = true; t.card = "damsel";
  takeChivalry(g, g.players.P1, t);
  assert.equal(g.chivalry.damsel, "P1", "P1 takes the Rescue Damsel obligation on sight");
  takeChivalry(g, g.players.P2, t);
  assert.equal(g.chivalry.damsel, "P2", "the obligation passes to the last knight to see her");
  g.players.P1.companions = ["damsel"];
  deliverRescue(g, g.players.P1, (() => { const q = cellAt(g.board, 2, 5); q.revealed = true; q.card = "queen"; return q; })());
  assert.ok(!g.players.P1.companions.includes("damsel"), "the Damsel is delivered to the Queen — rescued");
  assert.equal(g.players.P1.rescued, 1);
  g.players.P1.companions = ["boy"];
  deliverRescue(g, g.players.P1, cellAt(g.board, 8, 3));   // (8,3) is the Earthly Gate
  assert.ok(!g.players.P1.companions.includes("boy"), "the Boy is delivered to the Earthly Gate — rescued");
});

test("Chivalry: a King is exempt from the rescue obligation (§15/§18.10)", () => {
  const g = moveGame({});
  g.players.P1.knight = "george"; g.chivalry = { boy: "P1", damsel: null };
  becomeKing(g, g.players.P1);
  assert.equal(g.chivalry.boy, null, "the crown sets aside the Save Boy obligation");
});
