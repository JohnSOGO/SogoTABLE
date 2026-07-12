import assert from "node:assert/strict";
import test from "node:test";
import {
  newMysticWoodGame, initMysticWoodSeats, makeMysticWoodMove, mysticWoodGameToDict, setMysticWoodRandom,
} from "../games/mystic-wood/rules.js";
import { cellAt, relocate, takeChivalry, deliverRescue, becomeKing, greetOutcomes } from "../games/mystic-wood/engine.js";
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
  assert.equal(g.players.P1.saved.damsel, true, "Damsel-rescuer status recorded (no stat reward)");
  g.players.P1.companions = ["boy"];
  deliverRescue(g, g.players.P1, cellAt(g.board, 8, 3));   // (8,3) is the Earthly Gate
  assert.ok(!g.players.P1.companions.includes("boy"), "the Boy is delivered to the Earthly Gate — rescued");
});

test("Guyon's +1 greet bonus is optional — the odds differ with and without it (§8.2)", () => {
  const g = moveGame({ knight: "guyon", q: "cave" });
  const t = cellAt(g.board, g.players.P1.r, g.players.P1.c); t.revealed = true; t.card = "witch"; t.card2 = null;
  const withB = greetOutcomes(g, g.players.P1, t, true).groups;
  const noB = greetOutcomes(g, g.players.P1, t, false).groups;
  assert.notDeepEqual(withB, noB, "declining Guyon's +1 changes the greet odds");
});

test("Chivalry: a King is exempt from the rescue obligation (§15/§18.10)", () => {
  const g = moveGame({});
  g.players.P1.knight = "george"; g.chivalry = { boy: "P1", damsel: null };
  becomeKing(g, g.players.P1);
  assert.equal(g.chivalry.boy, null, "the crown sets aside the Save Boy obligation");
});

// GY3B mrgkkwi4: a no-match fight no longer settles behind the player's back — the human still sees
// the encounter screen (flagged noMatch), and whichever face he taps yields the sure win. The lone
// tie face can never reroll a losable red and steal the win (that was mrfr29hn).
test("No-match fight: the human sees the screen, and any face taken wins", () => {
  const g = moveGame({ r: 8, c: 3, things: ["armour", "lance"] });   // +3 Strength — a boar can't touch him
  const dest = cellAt(g.board, 8, 2); dest.revealed = true; dest.card = "boar"; dest.open = { N: 1, E: 1, S: 1, W: 1 };
  cellAt(g.board, 8, 3).open = { N: 1, E: 1, S: 1, W: 1 };
  setMysticWoodRandom(() => 0);   // the boar's red = 1
  makeMysticWoodMove(g, "P1", { type: "move", r: 8, c: 2 });
  assert.ok(g.pending && g.pending.type === "combat_pick", "the encounter screen still opens for a human");
  assert.equal(g.pending.noMatch, true);
  assert.notEqual(g.pending.forcedWin, null, "the sure win is carried, so no tap can lose");
  assert.equal(g.current_player, "P1", "the turn waits for the player to acknowledge");
  makeMysticWoodMove(g, "P1", { type: "combat_pick", pick: 3 });
  assert.ok(g.players.P1.prowess.some((x) => x.name === "Boar-slayer"), "the boar is slain — no match");
});

// GY3B mrgkjm4p: when every face loses, the fight is hopeless — flag it so the client can have the foe
// mock the knight, and keep withdraw open so he can still retreat rather than be forced onto the Tower.
// UHKO mrgm4a84 (§10): a Knight vanquished in a challenge leaves all Companions in the area — they go
// back onto the BOARD as independent denizens (a Damsel stays visible, re-rescuable), not into the
// discard out of sight. The carrier keeps none; the obligation resets so a re-sighting can re-lay it.
test("Companions left behind on a challenge loss are placed on the board, not discarded", () => {
  const g = moveGame({ r: 8, c: 3, companions: ["damsel"] });
  g.chivalry = { boy: null, damsel: "P1" };
  const foe = cellAt(g.board, 8, 2); foe.revealed = true; foe.card = "enchantress"; foe.open = { N: 1, E: 1, S: 1, W: 1 };
  cellAt(g.board, 8, 3).open = { N: 1, E: 1, S: 1, W: 1 };
  // Reveal an open glade nearby so the stranded Damsel has somewhere to land.
  const glade = cellAt(g.board, 7, 3); glade.revealed = true; glade.card = null;
  setMysticWoodRandom(() => 0.99);   // her red = 6 — the bare knight loses
  makeMysticWoodMove(g, "P1", { type: "move", r: 8, c: 2 });
  makeMysticWoodMove(g, "P1", { type: "combat_pick", pick: 1 });   // resolve the (hopeless) fight → a loss
  assert.deepEqual(g.players.P1.companions, [], "the carrier keeps no companions after the loss");
  assert.ok(!g.discard.includes("damsel"), "the Damsel is not discarded out of play");
  const onBoard = g.board.some((t) => t.card === "damsel");
  assert.ok(onBoard, "the Damsel is placed back on the board as an independent denizen");
  assert.equal(g.chivalry.damsel, null, "the rescue obligation resets — a re-sighting re-lays it");
});

test("Hopeless fight: flagged as hopeless, no sure win, and withdraw stays available", () => {
  const g = moveGame({ r: 8, c: 3 });   // a bare knight against the Enchantress (Prowess 6)
  const dest = cellAt(g.board, 8, 2); dest.revealed = true; dest.card = "enchantress"; dest.open = { N: 1, E: 1, S: 1, W: 1 };
  cellAt(g.board, 8, 3).open = { N: 1, E: 1, S: 1, W: 1 };
  setMysticWoodRandom(() => 0.99);   // her red = 6 — unbeatable by a bare knight
  makeMysticWoodMove(g, "P1", { type: "move", r: 8, c: 2 });
  assert.ok(g.pending && g.pending.type === "combat_pick", "the fight screen opens");
  assert.equal(g.pending.hopeless, true, "every face loses — a hopeless fight");
  assert.equal(g.pending.forcedWin, null, "there is no sure win to grant");
  const dict = mysticWoodGameToDict(g, "P1");
  assert.equal(dict.pending.canWithdraw, true, "the knight may still withdraw from a hopeless fight");
});

// Soft-lock (bugs mrhieiyh / mrhihqe8 — "game stuck waiting for working to finish"). The turn legitimately
// stays OPEN after a move (to joust, or to spend a free move), but the board went on highlighting reachable
// tiles, so tapping one posted a move the server had to reject — and a rejected action left the client's
// "⏳ Working…" latch up forever, freezing the game. The client now hides the affordance (render.js mirrors
// this guard) and the shell re-renders on rejection (app.js). This pins the server contract both rely on:
// the reject itself, and the two projected fields the board reads to know a move is spent.
test("Turn flow: a spent move is rejected, and the projection SAYS the move is spent", () => {
  const g = moveGame({ r: 8, c: 3 });
  const dest = cellAt(g.board, 8, 2); dest.revealed = true; dest.card = null; dest.card2 = null; dest.open = { N: 1, E: 1, S: 1, W: 1 };
  cellAt(g.board, 8, 3).open = { N: 1, E: 1, S: 1, W: 1 };
  Object.assign(g.players.P2, { r: 8, c: 2, tower: false });   // a rival stands there → §12: the turn stays open to joust
  makeMysticWoodMove(g, "P1", { type: "move", r: 8, c: 2 });
  assert.equal(g.current_player, "P1", "the turn stays open (a knight to joust here)");
  const seat = mysticWoodGameToDict(g, "P1").players.find((p) => p.mark === "P1");
  assert.equal(seat.moved, true, "…but the move is SPENT, and the projection says so");
  assert.equal(seat.freeMove, false, "…with no free continuation — so the board must offer no reachable tile");
  assert.throws(() => makeMysticWoodMove(g, "P1", { type: "move", r: 8, c: 1 }), /already moved/,
    "and the server rejects a second move — the UI must never invite one");
});
