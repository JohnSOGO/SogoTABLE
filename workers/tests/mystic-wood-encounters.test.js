// The Mystic Wood — how a knight MEETS the wood and the other knights: the snub (§8.2.1), the joust
// (§12), the obligation of chivalry (§15), and the Cave vigil. Split out of mystic-wood-rules.test.js,
// which is at its line cap; these all came out of playtest room 4LSI.
import assert from "node:assert/strict";
import test from "node:test";
import {
  newMysticWoodGame, initMysticWoodSeats, makeMysticWoodMove, mysticWoodGameToDict, setMysticWoodRandom,
} from "../games/mystic-wood/rules.js";
import {
  buildBoard, cellAt, reachableFrom, resolveGreet, resolveChallenge, befriend, deliverRescue, toTower, snubbedBy, capTotal,
} from "../games/mystic-wood/engine.js";
import { resolveJoust, recordJoust, joustPrize } from "../games/mystic-wood/joust.js";
import { resolveSpell } from "../games/mystic-wood/spells.js";
import { botEnter } from "../games/mystic-wood/ai.js";
import { KNIGHTS } from "../games/mystic-wood/data.js";

// deterministic PRNG
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// a fixed sequence of unit floats (repeats the last forever) — for rigging dice
function seq(values) { let i = 0; return () => values[Math.min(i++, values.length - 1)]; }
const human = (mark) => ({ mark, name: mark, kind: "human" });
const bot = (mark) => ({ mark, name: mark, kind: "bot", bot_level: 2 });
function seatLit(knight, over = {}) {
  return {
    mark: "P1", name: KNIGHTS[knight].name, is_bot: false, knight, q: KNIGHTS[knight].q, r: 1, c: 1,
    things: [], prowess: [], companions: [], horse: false, tower: false, towerTries: 0,
    captured: false, caveTurns: 0, questDone: false, isKing: false, castleHold: 0, atGate: false,
    snub: null, _princeUsed: false, _princeAiding: false, moved: false, won: false, ...over,
  };
}
function greetGame(knight, card) {
  const game = { board: buildBoard(), deck: [], discard: [], log: [], results: {}, seat_order: ["P1"], players: {} };
  const s = seatLit(knight); game.players.P1 = s;
  const tile = cellAt(game.board, s.r, s.c); tile.card = card; tile.revealed = true;
  return { game, s, tile };
}

/* ------------------------------ §8.2.1 the snub ------------------------------ */
// "The Denizen remains in the area and ignores you… you cannot greet the Denizen again until you have
// challenged or greeted a Denizen in another area, or jousted with another Knight." Report mrhcnxmv asked
// exactly this ("can I stay on a tile and try again… or do I have to move off and on") — and the engine
// enforced neither half: you could step off and back on and re-roll the same denizen for free.
test("§8.2.1: a denizen who remains ignores THIS knight until they meet one elsewhere", () => {
  const { game, s, tile } = greetGame("george", "hermit");
  setMysticWoodRandom(seq([0.4]));                       // die 3 → the Hermit "remains"
  resolveGreet(game, s, tile);
  assert.ok(snubbedBy(s, "hermit"), "the Hermit now ignores this knight");
  assert.equal(s.snub.r, tile.r);
  assert.equal(s.snub.c, tile.c);

  // A greeting in ANOTHER area lifts the bar.
  const other = cellAt(game.board, tile.r + 1, tile.c);
  other.card = "dwarf"; other.revealed = true;           // single-outcome: gives the Armour, no die rolled
  resolveGreet(game, s, other);
  assert.ok(!snubbedBy(s, "hermit"), "an encounter in another area lifts the snub");
});

test("§8.2.1: the snub is per-knight, and a joust lifts it", () => {
  const { game, s, tile } = greetGame("george", "hermit");
  const other = seatLit("roland", { mark: "P2", r: s.r, c: s.c });
  game.players.P2 = other; game.seat_order = ["P1", "P2"];
  setMysticWoodRandom(seq([0.4]));                       // die 3 → remains, for George only
  resolveGreet(game, s, tile);
  assert.ok(snubbedBy(s, "hermit"));
  assert.ok(!snubbedBy(other, "hermit"), "the other knight has not been ignored — he may still be heard");

  setMysticWoodRandom(seq([0.0, 0.99]));                 // any decisive joust
  resolveJoust(game, other, s);
  assert.ok(!snubbedBy(s, "hermit"), "§8.2.1: a joust frees you to approach the denizen again");
});

// The gate itself: walking back onto a denizen who has already ignored you opens NO encounter (you "may
// pass freely through this area"), and the player is told why instead of being met with silence.
test("§8.2.1: re-entering a snubbing denizen's area opens no encounter, and says so", () => {
  setMysticWoodRandom(mulberry32(5));
  const game = newMysticWoodGame();
  initMysticWoodSeats(game, [human("P1"), bot("P2"), bot("P3")]);
  const p1 = game.players.P1;
  const to = reachableFrom(game.board, p1, cellAt(game.board, p1.r, p1.c))[0];
  to.revealed = true; to.card = "hermit"; to.card2 = null;
  p1.snub = { card: "hermit", r: to.r, c: to.c };        // he has already been ignored here

  makeMysticWoodMove(game, "P1", { type: "move", r: to.r, c: to.c });

  assert.equal(to.card, "hermit", "the Hermit stays put");
  assert.ok(!(game.pending && game.pending.mark === "P1"), "no encounter is opened — pass freely");
  assert.ok(game.results.P1.notice, "the knight is TOLD he is being ignored, not left guessing");
  assert.match(game.results.P1.notice.body, /another area/);
});

/* -------------------------------- §12 the joust ------------------------------- */
// Bug mrhc3izr: the loser of a joust used to see ONLY a bare "cast into the Tower" notice — toTower
// recorded it over the joust result, so the fight that put them there was never shown at all. Both knights
// must get the FIGHT (both dice, both bonuses), and the loser's must carry the fate, not be replaced by it.
test("§12: a joust is recorded as a fight for BOTH knights, and the Tower does not overwrite the loser's", () => {
  const game = { board: buildBoard(), deck: [], discard: [], log: [], results: {}, seat_order: ["P1", "P2"], players: {} };
  const ch = seatLit("guyon", { mark: "P1", r: 4, c: 4 });          // challenger — S1, will lose
  const def = seatLit("george", { mark: "P2", r: 4, c: 4 });        // defender — S3
  game.players.P1 = ch; game.players.P2 = def;

  setMysticWoodRandom(seq([0.0, 0.99]));                            // challenger die 1, defender die 6
  const res = resolveJoust(game, ch, def);
  assert.equal(res.chWon, false, "the weaker knight loses the ride");
  assert.equal(res.cDie, 1);
  assert.equal(res.dDie, 6);

  joustPrize(game, def, ch, "tower", "joust");                      // the defender unhorses him to the Tower
  recordJoust(game, ch, def, res, "unhorsed — away to the Tower!");

  assert.ok(ch.tower, "the loser is imprisoned");
  // The LOSER sees the fight, not a bare jail notice.
  assert.equal(game.results.P1.joust, true);
  assert.ok(!game.results.P1.jailed, "the jail notice must not overwrite the joust");
  assert.equal(game.results.P1.youWon, false);
  assert.equal(game.results.P1.youAreCh, true);
  assert.equal(game.results.P1.cDie, 1);                            // both dice reach the loser's screen
  assert.equal(game.results.P1.dDie, 6);
  assert.match(game.results.P1.detail, /Tower/);
  // …and the WINNER sees the same fight, told from his own side.
  assert.equal(game.results.P2.joust, true);
  assert.equal(game.results.P2.youWon, true);
  assert.equal(game.results.P2.youAreCh, false);
  assert.equal(game.results.P2.foeName, ch.name);
});

test("an imprisonment that is NOT a joust still raises its own jail notice", () => {
  const game = { board: buildBoard(), deck: [], discard: [], log: [], results: {}, seat_order: ["P1"], players: {} };
  const s = seatLit("george"); game.players.P1 = s;
  toTower(game, s);                                                 // e.g. a rival's Queen boon, off-turn
  assert.equal(game.results.P1.jailed, true);
});

/* ------------------------------ §15 chivalry ---------------------------------- */
// Bug mrhcgftz: "it let me withdraw from the boy and not force chivalry". The rulebook is explicit —
// "He withdraws from the area, but he must take the Save Boy card." SEEING them binds you, not greeting
// them, and withdrawing is legal and does not shed the duty. The behaviour was right; nothing said so.
test("§15: withdrawing from the Boy is legal, and the obligation follows you out", () => {
  setMysticWoodRandom(mulberry32(7));
  const game = newMysticWoodGame();
  initMysticWoodSeats(game, [human("P1"), bot("P2"), bot("P3")]);
  const p1 = game.players.P1;
  const to = reachableFrom(game.board, p1, cellAt(game.board, p1.r, p1.c))[0];
  to.revealed = true; to.card = "boy"; to.card2 = null;

  makeMysticWoodMove(game, "P1", { type: "move", r: to.r, c: to.c });
  assert.equal(game.chivalry.boy, "P1", "§15: merely SEEING the Boy lays the obligation");
  assert.ok(game.pending, "the Boy is there to be met");

  makeMysticWoodMove(game, "P1", { type: "withdraw" });
  assert.equal(game.chivalry.boy, "P1", "withdrawing does NOT shed the obligation");
  assert.equal(to.card, "boy", "the Boy stays in the area");
  assert.ok(game.results.P1.notice, "and the knight is TOLD the duty rode with him");
  assert.match(game.results.P1.notice.body, /Save Boy/);
});

/* ------------------------------- the Cave vigil ------------------------------- */
// Bug mrhcq3ps: the vigil only accrues at the START of a turn you are STILL in the Cave — so each turn you
// must End turn WITHOUT moving, and nothing said so. The Bishop's prayer already gets a per-turn modal;
// the Cave is the same mechanic and must speak with the same voice.
test("Cave: each kept turn tells the human it counted, and what keeps the next one", () => {
  setMysticWoodRandom(mulberry32(11));
  const game = newMysticWoodGame();
  initMysticWoodSeats(game, [human("P1"), bot("P2"), bot("P3")]);
  const p1 = game.players.P1;
  p1.q = "cave";                                    // Guyon's quest, whichever seat drew it
  const cave = game.board.find((t) => t.name === "cave");
  cave.revealed = true; cave.card = null; cave.card2 = null;
  p1.r = cave.r; p1.c = cave.c;

  makeMysticWoodMove(game, "P1", { type: "end-turn" });

  assert.equal(p1.caveTurns, 1, "the turn is kept at the START of the next one");
  assert.ok(!p1.questDone);
  assert.ok(game.results.P1.notice, "the human is told the vigil counted");
  assert.match(game.results.P1.notice.head, /<b>1 of 3<\/b>/);
  assert.match(game.results.P1.notice.body, /End turn/, "…and told the act that keeps the next one");
});

// Sibling path (CLAUDE.md: bot moves vs human moves). Bots resolve encounters in ai.js/botEnter, NOT via
// openEncounter — so the §8.2.1 bar has to be enforced on both paths or the bots quietly play by different
// rules, re-rolling a denizen a human is barred from.
test("§8.2.1: the snub binds bots too — a bot does not re-greet a denizen that ignored it", () => {
  const { game, s, tile } = greetGame("george", "hermit");
  s.is_bot = true;
  setMysticWoodRandom(seq([0.4]));                  // die 3 → the Hermit "remains"
  resolveGreet(game, s, tile);
  assert.ok(snubbedBy(s, "hermit"));

  const before = game.log.length;
  botEnter(game, s, tile);                          // the bot walks back in
  assert.equal(tile.card, "hermit", "the Hermit is neither greeted nor moved");
  assert.equal(game.log.length, before, "…and nothing at all is resolved");
});

// The real path, end to end: doJoust -> joustPrize -> toTower, through makeMysticWoodMove. The unit test
// above hands `detail` in by hand; this one proves the LIVE wiring — that the loser's single result is the
// fight (carrying the Tower), and that logSince captured the fate without duplicating the headline.
test("§12: losing a joust for real leaves the loser holding the fight, not a bare jail notice", () => {
  setMysticWoodRandom(mulberry32(3));
  const game = newMysticWoodGame();
  initMysticWoodSeats(game, [human("P1"), bot("P2"), bot("P3")]);
  const p1 = game.players.P1, p2 = game.players.P2;
  // Stand them on the same tile (not the Tower — no jousting there) and make P1 certain to lose.
  p2.r = p1.r; p2.c = p1.c;
  p1.things = []; p1.prowess = []; p1.companions = []; p1.horse = false;
  p2.things = ["lance", "armour"]; p2.horse = true;      // the defender is far stronger
  game.current_player = "P1"; game.pending = null;

  makeMysticWoodMove(game, "P1", { type: "joust", target: "P2" });

  assert.ok(p1.tower, "the challenger is unhorsed to the Tower");
  const r = game.results.P1;
  assert.equal(r.joust, true, "the loser's result is the FIGHT…");
  assert.ok(!r.jailed, "…not a bare jail notice that overwrote it");
  assert.equal(r.youWon, false);
  assert.ok(r.cDie >= 1 && r.cDie <= 6 && r.dDie >= 1 && r.dDie <= 6, "both dice are on the screen");
  assert.match(r.detail, /Tower/, "the fate the fight ended in");
  assert.ok(!/jousts/.test(r.detail), "…and not a duplicate of the headline");
});


// §9 (bug mrhijjmm — "I get a Merlin card after capturing horse; rules ok?"): it IS the rule. An area can
// hold two cards (the Horse runs into an occupied glade; the Palace/Altar deal two), and "you must approach
// all Denizens individually, and your turn is not over until you have done so". The play was right; the game
// simply never SAID so. It now names the rule, and enforces the half it was quietly getting wrong: the
// withdrawal is spent on ENTERING the area, so you cannot meet the first denizen and slip away from the second.
test("§9: the second denizen announces itself — the chronicle and the card name the rule", () => {
  setMysticWoodRandom(() => 0.5);
  const g = newMysticWoodGame();
  initMysticWoodSeats(g, [human("P1"), bot("P2"), bot("P3")]);
  g.current_player = "P1"; const s = g.players.P1;
  s.knight = "george"; s.q = "dragon"; s.things = []; s.prowess = []; s.companions = [];
  const tile = cellAt(g.board, s.r, s.c); tile.revealed = true; tile.card = "ox"; tile.card2 = "merlin";
  g.pending = { type: "combat_pick", mark: "P1", r: tile.r, c: tile.c, card: "ox", red: 1, label: "Strength", faceMap: [6, 6, 6, 6, 6, 6] };
  makeMysticWoodMove(g, "P1", { type: "combat_pick", pick: 1 });   // the Ox is slain; Merlin was waiting
  assert.ok(g.pending, "the second denizen opens its own encounter");
  assert.equal(g.pending.second, true, "…flagged as a §9 second denizen, so the card can say why it appeared");
  assert.ok(g.log.some((e) => /every denizen here must be approached/.test(e.text) && /§9/.test(e.text)),
    "the chronicle names §9 instead of letting a fresh card look like a bug");
  const pend = mysticWoodGameToDict(g, "P1").pending;
  assert.equal(pend.second, true, "the flag reaches the client");
  assert.equal(pend.canWithdraw, false, "§9: the withdrawal was spent on the first denizen");
});

test("§9: you cannot withdraw from the second denizen of a two-card area", () => {
  setMysticWoodRandom(() => 0.5);
  const g = newMysticWoodGame();
  initMysticWoodSeats(g, [human("P1"), bot("P2"), bot("P3")]);
  g.current_player = "P1"; const s = g.players.P1;
  s.knight = "george"; s.q = "dragon"; s.things = []; s.prowess = []; s.companions = [];
  s.fromR = s.r; s.fromC = s.c === 0 ? 1 : s.c - 1; s.arrivedByTransport = false;   // a retreat path exists
  const back = cellAt(g.board, s.fromR, s.fromC); back.revealed = true;
  const tile = cellAt(g.board, s.r, s.c); tile.revealed = true; tile.card = "ox"; tile.card2 = "merlin";
  g.pending = { type: "combat_pick", mark: "P1", r: tile.r, c: tile.c, card: "ox", red: 1, label: "Strength", faceMap: [6, 6, 6, 6, 6, 6] };
  makeMysticWoodMove(g, "P1", { type: "combat_pick", pick: 1 });
  assert.equal(g.pending.second, true);
  assert.throws(() => makeMysticWoodMove(g, "P1", { type: "withdraw" }), /§9/,
    "having met the first, the knight is bound to approach the second");
  assert.ok(g.pending, "and the encounter is still standing — the turn cannot be dodged");
  assert.equal(g.players.P1.r, tile.r, "he has not stepped back");
});

// Sibling path (bot vs human): the human loops the area in afterEncounter; the bot met the FIRST card and
// walked away from the second, so bots were playing a §9 a human is bound by. Bots run the human rules.
test("§9 parity: a bot approaches the second denizen too, it does not walk away", () => {
  setMysticWoodRandom(mulberry32(11));
  const g = newMysticWoodGame();
  initMysticWoodSeats(g, [human("P1"), bot("P2"), bot("P3")]);
  const b = g.players.P2;
  b.knight = "george"; b.q = "dragon"; b.things = []; b.prowess = []; b.companions = []; b.tower = false;
  // The Dwarf and the Nymph are single-effect greets (Armour / Crystal) — they always clear, so this test
  // measures §9 and not the die.
  const tile = cellAt(g.board, b.r, b.c); tile.revealed = true; tile.card = "dwarf"; tile.card2 = "nymph";
  botEnter(g, b, tile);
  assert.equal(tile.card, null, "the first denizen was met");
  assert.equal(tile.card2, null, "…and so was the second — no card is left un-approached (§9)");
  assert.deepEqual(b.things, ["armour", "crystal"], "the bot met BOTH, in order — it no longer walks away from the second");
});

/* ------------------------ the Prince's arm (§18.15) ---------------------- */
// 4T6D mrhzdu0s ("can I bank the prince, or is he used on the first fight?"). He was auto-spent on the
// FIRST eligible challenge — even one already won — and §18.15 then denied the prowess for the kill, so
// the Prince cost his knight twice over and could never be saved for the fight that needed him. §12 says
// a knight MAY use a companion's aid: so he is billed only when his arm actually decided the day, exactly
// as the Sage already is. He still stands in the line (his +3 shows in the odds) — he just isn't spent.
function fightWith(knight, card, over = {}) {
  const game = { board: buildBoard(), deck: [], discard: [], log: [], results: {}, seat_order: ["P1"], players: {} };
  const s = seatLit(knight, over); game.players.P1 = s;
  const tile = cellAt(game.board, s.r, s.c); tile.card = card; tile.revealed = true;
  return { game, s, tile };
}
test("the Prince is NOT spent on a fight won without him (4T6D mrhzdu0s)", () => {
  // George S3 + Prince S3 = 9 vs the Boar's 2. He wins by 7 — four more than the Prince lent.
  const { game, s, tile } = fightWith("george", "boar", { companions: ["prince"] });
  resolveChallenge(game, s, tile, 3, 1);
  assert.deepEqual(s.companions, ["prince"], "his arm was not needed — he keeps his place at your side");
  assert.equal(s._princeUsed, false, "…and is still there for the fight that WILL need him");
  assert.deepEqual(s.prowess.map((p) => p.name), ["Boar-slayer"], "so the kill is the knight's own, and the prowess is won (§18.15 does not bite)");
  assert.match(game.log.map((e) => e.text).join("\n"), /the day was yours without him/, "and the modal says so — that is the answer to 'can I bank him?'");
});
test("the Prince IS spent on the fight his arm decided (§18.15)", () => {
  // George S3 = 4 against the Troll's 7 — a loss. With the Prince's +3 it is 7 vs 7... so rig the white
  // die one higher: 8 vs 7, a win by 1, which is inside the 3 he lent. Decisive → he is spent.
  const { game, s, tile } = fightWith("george", "troll", { companions: ["prince"] });
  resolveChallenge(game, s, tile, 2, 5);
  assert.deepEqual(s.companions, [], "he gave his help, and §18.15 transports him back into the wood");
  assert.equal(s._princeUsed, true);
  assert.deepEqual(s.prowess, [], "no prowess is gained for a kill made with the Prince's help (§18.15)");
  assert.equal(cellAt(game.board, s.r, s.c).card, null, "and the slain denizen is removed from the game");
});
test("a lost fight never spends the Prince (§18.15 bills him for help GIVEN)", () => {
  const { game, s, tile } = fightWith("george", "troll", { companions: ["prince"] });
  resolveChallenge(game, s, tile, 1, 6);   // 7 vs 8 even with his arm — the Tower
  assert.equal(s._princeUsed, false, "his help never landed, so it is not billed");
  assert.equal(s.tower, true, "the knight is away to the Tower — and the Prince is left in the glade with the rest (§10)");
});

/* ------------------------ chivalry delivered (§15) ----------------------- */
// 4T6D mrhzbzxe: the rescue — the whole point of the chivalry card — happened in the chronicle alone,
// the one channel a player doesn't watch. "Delivering damsel needs a modal."
test("delivering the Damsel to the Queen raises a modal, not just a log line (4T6D mrhzbzxe)", () => {
  const { game, s, tile } = fightWith("george", null, { companions: ["damsel"] });
  game.chivalry = { boy: null, damsel: "P1" };
  tile.card = "queen";
  deliverRescue(game, s, tile);
  assert.equal(s.saved.damsel, true, "she is delivered — Damsel-rescuer");
  assert.deepEqual(s.companions, [], "…and she leaves your side");
  assert.equal(game.chivalry.damsel, null, "the obligation is discharged");
  const n = game.results.P1 && game.results.P1.notice;
  assert.ok(n, "the player is TOLD, in a modal of its own");
  assert.match(n.head, /deliver the Damsel/i);
  assert.match(n.body, /Damsel-rescuer/);
});
test("a bot's delivery raises no modal", () => {
  const { game, s, tile } = fightWith("roland", null, { is_bot: true, companions: ["boy"] });
  game.chivalry = { boy: "P1", damsel: null };
  const gate = game.board.find((t) => t.name === "egate");
  s.r = gate.r; s.c = gate.c;
  deliverRescue(game, s, gate);
  assert.equal(s.saved.boy, true, "the bot still rescues him");
  assert.equal(game.results.P1, undefined, "but no modal is recorded for a seat with nobody behind it");
  assert.ok(tile);
});
// §18.15: "If you approach him again, you must greet him in the usual way" — a re-won Prince fights again.
test("a Prince re-befriended after being spent lends his arm once more (§18.15)", () => {
  const { game, s, tile } = fightWith("george", "troll", { companions: ["prince"] });
  resolveChallenge(game, s, tile, 2, 5);            // decisive → spent, and _princeUsed latched
  assert.equal(s._princeUsed, true);
  const glade = cellAt(game.board, s.r, s.c); glade.card = "prince";
  befriend(game, s, glade, "prince");               // greeted and won all over again
  assert.equal(s._princeUsed, false, "a fresh greeting buys his arm again — he is not a dead weight for the rest of the game");
  glade.card = "troll";
  resolveChallenge(game, s, glade, 2, 5);
  assert.deepEqual(s.companions, [], "…and he can be spent a second time on a fight that needs him");
});

// §14/§18 Power Limit — the first "informed consent" slice: a HUMAN over the limit CHOOSES which
// card to surrender at end of turn (bots still auto-shed inline via enforcePower). The turn is held
// until the choice is made; the server owns legality (a spoofed index throws).
test("§14/§18 Power Limit: a human over the limit chooses what to surrender before the turn passes", () => {
  setMysticWoodRandom(() => 0.5);
  const g = newMysticWoodGame();
  initMysticWoodSeats(g, [human("P1"), bot("P2"), bot("P3")]);
  g.current_player = "P1"; g.pending = null;
  const s = g.players.P1;
  s.knight = "george"; s.q = "dragon"; s.isKing = false; s.tower = false; s.captured = false;
  s.things = ["armour", "lance", "shield"];                                   // +2 / +1 / +1 Strength
  s.prowess = [{ name: "Ox-slayer", P: 1 }, { name: "Boar-slayer", P: 1 }, { name: "Saracen-vanquisher", P: 1 }, { name: "Orc-slayer", P: 1 }, { name: "Troll-slayer", P: 1 }];
  assert.ok(capTotal(s) > 10, "starts over the Power Limit");

  const seq0 = g.turn_seq;
  makeMysticWoodMove(g, "P1", { type: "end-turn" });
  assert.equal(g.pending && g.pending.type, "power_shed", "over the limit → the surrender choice rises");
  assert.equal(g.pending.mark, "P1");
  assert.equal(g.pending.choices.length, 8, "offered his own Things and prowess-cards (3 + 5)");
  assert.ok(g.pending.terms && /Power Limit/.test(g.pending.terms.tag), "carries the terms (informed)");
  assert.equal(g.turn_seq, seq0, "and the turn is HELD until it is resolved (§18: at the end of the turn)");

  assert.throws(() => makeMysticWoodMove(g, "P1", { type: "power_shed", kind: "thing", idx: 99 }),
    /not yours to surrender/, "the server rejects a card the seat does not hold");

  let guard = 0;
  while (g.pending && g.pending.type === "power_shed" && guard++ < 12) {
    makeMysticWoodMove(g, "P1", { type: "power_shed", kind: g.pending.choices[0].kind, idx: 0 });
  }
  assert.ok(capTotal(s) <= 10, "brought within the limit — by cards the PLAYER picked, not an auto-shed");
  assert.ok(g.turn_seq > seq0, "and only then does the turn pass");
});

// Informed Consent (forced change): the Mystic Wind strips your Things on a RIVAL's turn — the shared
// herald says only "N swept". Each HUMAN victim must be told what THEY lost, or a forced change to their
// character lives only in a chronicle they cannot see. Bots (no screen) and knights who lost nothing don't.
test("Mystic Wind tells each human victim what THEY lost, not just the shared herald", () => {
  const game = { board: buildBoard(), deck: [], discard: [], log: [], results: {}, seat_order: ["P1", "P2", "P3"], players: {} };
  game.players.P1 = seatLit("george", { mark: "P1", things: ["armour", "lance"] });     // human — loses two
  game.players.P2 = seatLit("roland", { mark: "P2", is_bot: true, things: ["wand"] });  // bot drawer — no notice
  game.players.P3 = seatLit("perceval", { mark: "P3", things: [] });                    // holds nothing — no notice
  resolveSpell(game, game.players.P2, cellAt(game.board, game.players.P2.r, game.players.P2.c), "wind");

  assert.deepEqual(game.players.P1.things, [], "the Wind stripped the human's Things");
  const n = game.results.P1 && game.results.P1.notice;
  assert.ok(n && /Mystic Wind/.test(n.tag), "the victim is personally told");
  assert.match(n.body, /Armour/); assert.match(n.body, /Lance/);
  assert.ok(!(game.results.P2 && game.results.P2.notice), "the bot drawer gets no notice (no screen)");
  assert.ok(!(game.results.P3 && game.results.P3.notice), "a knight who lost nothing gets no notice");
});
