// The Mystic Wood — how a knight MEETS the wood and the other knights: the snub (§8.2.1), the joust
// (§12), the obligation of chivalry (§15), and the Cave vigil. Split out of mystic-wood-rules.test.js,
// which is at its line cap; these all came out of playtest room 4LSI.
import assert from "node:assert/strict";
import test from "node:test";
import {
  newMysticWoodGame, initMysticWoodSeats, makeMysticWoodMove, setMysticWoodRandom,
} from "../games/mystic-wood/rules.js";
import {
  buildBoard, cellAt, reachableFrom, resolveGreet, resolveJoust, recordJoust,
  joustPrize, toTower, snubbedBy,
} from "../games/mystic-wood/engine.js";
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
