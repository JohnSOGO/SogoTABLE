// The Mystic Wood — quests, acquisitions, and board-wide events.
// The SON6 playtest batch: a companion quest is only fulfilled while the companion is STILL with you
// (§16 + §10 — the bug that let a knight win the Wood having left the Princess behind in it), every
// acquisition says what it does for you, and every board-wide event names who caused it.
// Split out of mystic-wood-rules.test.js, which sits at its 800-line cap.
import assert from "node:assert/strict";
import test from "node:test";
import {
  setMysticWoodRandom, newMysticWoodGame, initMysticWoodSeats, mysticWoodGameToDict,
} from "../games/mystic-wood/rules.js";
import {
  buildBoard, cellAt, resolveGreet, resolveChallenge, becomeKing, toTower, powerRotate,
} from "../games/mystic-wood/engine.js";
import { joustPrize } from "../games/mystic-wood/joust.js";
import { resolveSpell } from "../games/mystic-wood/spells.js";
import { KNIGHTS, KING_QUEST } from "../games/mystic-wood/data.js";

// return a fixed sequence of unit floats (repeats the last forever) — for rigging dice
function seq(values) { let i = 0; return () => values[Math.min(i++, values.length - 1)]; }
function seatLit(knight, over = {}) {
  return {
    mark: "P1", name: KNIGHTS[knight].name, is_bot: false, knight, q: KNIGHTS[knight].q, r: 1, c: 1,
    things: [], prowess: [], companions: [], horse: false, tower: false, towerTries: 0,
    captured: false, caveTurns: 0, questDone: false, isKing: false, castleHold: 0, atGate: false,
    _princeUsed: false, _princeAiding: false, moved: false, won: false, ...over,
  };
}
// A board with every glade face-up, so stranded companions have somewhere to be left (§10).
function openWood(seats = {}) {
  const g = { board: buildBoard(), deck: [], discard: [], log: [], results: {}, seat_order: Object.keys(seats), players: seats, chivalry: {} };
  g.board.forEach((t) => { t.revealed = true; });
  return g;
}

/* ------------------------- the companion quests -------------------------- */

// mrh9klnb / §16 + §10: a companion quest is fulfilled only WHILE the companion is with you. Roland
// befriended the Princess, was later vanquished — she was left behind in the wood (§10) — and then walked
// out of the Enchanted Gate and WON the Wood with no Princess at all: questDone had LATCHED on befriending
// and nothing ever revoked it. Losing her must un-fulfil the quest.
test("quest companion: losing the Princess un-fulfils Roland's quest (mrh9klnb)", () => {
  const s = seatLit("roland", { r: 1, c: 1, companions: ["princess"], questDone: true, atGate: true });
  const g = openWood({ P1: s });
  toTower(g, s);   // §10: vanquished in a challenge — companions are left in the area
  assert.ok(!s.companions.includes("princess"), "she is left behind in the wood");
  assert.equal(s.questDone, false, "so the quest is NO LONGER fulfilled — he cannot leave and win without her");
  assert.equal(s.atGate, false, "and any standing at the Enchanted Gate is undone with it");
  assert.match(g.log.map((e) => e.text).join("\n"), /no longer with/, "and he is TOLD, not left to find out at the gate");
});

// The same rule from the other end: winning her back re-fulfils it. The flag is a fact, not a one-way latch.
test("quest companion: winning the Princess back re-fulfils the quest", () => {
  const s = seatLit("roland", { r: 1, c: 1, prowess: [{ name: "Ox-slayer", P: 1 }] });
  const g = openWood({ P1: s });
  const t = cellAt(g.board, 1, 1); t.card = "princess";
  resolveGreet(g, s, t, 6);   // die 6 + Roland's Prowess 2 + 1 = 9 → she befriends
  assert.ok(s.companions.includes("princess"), "she befriends on 9+");
  assert.equal(s.questDone, true, "the quest is fulfilled again once she is back at his side");
});

// Sibling path — the OTHER way a companion leaves you: §12, a joust whose winner takes a companion.
test("quest companion: a joust that steals the Princess un-fulfils the loser's quest", () => {
  setMysticWoodRandom(seq([0.99]));   // the victor's approach roll takes her
  const loser = seatLit("roland", { mark: "P1", companions: ["princess"], questDone: true });
  const winner = seatLit("george", { mark: "P2", prowess: [{ name: "y", P: 5 }] });
  const g = openWood({ P1: loser, P2: winner });
  joustPrize(g, winner, loser, "companion");
  assert.ok(winner.companions.includes("princess"), "the victor takes her");
  assert.ok(!loser.companions.includes("princess"), "she is no longer Roland's");
  assert.equal(loser.questDone, false, "so Roland's quest is unfulfilled again");
  // Informed Consent (forced, OFF-turn): the theft happens on the victor's turn and reverts the loser's
  // WIN CONDITION. His joust result was already recorded before the steal, so nothing else overwrites this
  // — he is told his quest is undone, not left to discover the shut Gate later.
  const n = g.results.P1 && g.results.P1.notice;
  assert.ok(n && /Quest unfulfilled/.test(n.tag), "and the off-turn loser is TOLD his quest is undone");
  assert.match(n.body, /Enchanted Gate/);
});

// §18.8: the Grail is a Companion too, and Perceval's quest rides on it the same way.
test("quest companion: losing the Grail un-fulfils Perceval's quest", () => {
  const s = seatLit("perceval", { r: 1, c: 1, companions: ["grail"], questDone: true });
  const g = openWood({ P1: s });
  toTower(g, s);
  assert.equal(s.questDone, false, "the Grail left behind un-fulfils the quest to carry it out");
});

// ...but a quest with no companion in it (Guyon's vigil, George's Dragon) must NOT be touched by any of this.
test("quest companion: a non-companion quest is never revoked by losing companions", () => {
  const s = seatLit("guyon", { r: 1, c: 1, companions: ["sage"], questDone: true });   // vigil already kept
  const g = openWood({ P1: s });
  toTower(g, s);
  assert.ok(!s.companions.length, "the Sage is left behind with the rest");
  assert.equal(s.questDone, true, "but the Cave vigil is DONE — three turns kept cannot be taken back");
});

/* ---------------------------- acquisitions ------------------------------- */

// mrh964kp: "whenever you receive something tell me what the buff is." A Thing already said it; a
// Companion won — the Holy Grail above all — used to join in complete silence.
test("acquisition: a companion won says what it does for you (mrh964kp)", () => {
  const s = seatLit("george", { r: 1, c: 1, prowess: [{ name: "x", P: 5 }] });
  const g = openWood({ P1: s });
  const t = cellAt(g.board, 1, 1); t.card = "grail";
  resolveGreet(g, s, t, 6);   // 6 + Prowess (1 + 5) = 12 >= 9 → the Grail is taken up
  assert.ok(s.companions.includes("grail"));
  const text = g.log.map((e) => e.text).join("\n");
  assert.match(text, /\+1 Prowess, \+1 Strength/, "the Grail's buff is stated outright");
  assert.match(text, /now S \d+ · P \d+/, "...along with the totals it leaves you on");
});

/* -------------------------- board-wide events ---------------------------- */

// mrh9hu2f: an unattributed "The Princess flees to the Earthly Gate" read as the reader's OWN doing — she
// can flee from a RIVAL straight onto the gate you happen to be standing on. Name the knight she fled from.
test("Princess flight names the knight she fled from (mrh9hu2f)", () => {
  const s = seatLit("george", { r: 1, c: 1 });
  const g = openWood({ P1: s });
  const t = cellAt(g.board, 1, 1); t.card = "princess";
  resolveGreet(g, s, t, 1);   // 1 + Prowess 1 < 9 → she flees
  const line = g.log.map((e) => e.text).find((x) => x.includes("flees"));
  assert.match(line, /George/, "the flight says WHOSE greeting she slipped away from");
  assert.equal(cellAt(g.board, 8, 3).card, "princess", "...and §18.16 still sends her to the Gate in the other half");
});

// mrh97d6q: the tiles "just jump" — the wood turns about on someone else's turn with no word of who or
// why. Every board-wide event now carries its actor and its cause, so the client can herald it.
test("board events carry who caused them and why (mrh97d6q)", () => {
  const s = seatLit("george", { name: "Sogo", r: 1, c: 1, things: ["armour", "wand"] });
  const g = openWood({ P1: s });
  resolveSpell(g, s, cellAt(g.board, 1, 1), "fog");
  assert.equal(g.rotation.by, "Sogo", "the Fog names the knight who drew it");
  assert.equal(g.rotation.cause, "fog");
  assert.ok(g.rotation.cells.length > 0, "and which glades turned about");
  assert.match(g.log.map((e) => e.text).join("\n"), /Sogo draws the Mystic Fog/, "...and so does the chronicle");

  resolveSpell(g, s, cellAt(g.board, 1, 1), "wind");
  assert.equal(g.wind.by, "Sogo", "the Wind names the knight who drew it");
  assert.equal(g.wind.swept, 2, "and how many Things it tore away");
  assert.ok(g.wind.seq > 0, "seq'd, so the client plays it exactly once and never on a re-render");

  powerRotate(g, s);
  assert.equal(g.rotation.cause, "wand", "the Wand's single-tile turn is told apart from the Fog's");
  assert.equal(g.rotation.by, "Sogo");
  assert.deepEqual(g.rotation.cells, [[1, 1]], "just the glade underfoot");
});

// §18.14: the Wind takes THINGS, never Companions — "Remember: Grail is not a Thing."
test("Mystic Wind spares companions, the Grail, and the Horse", () => {
  const s = seatLit("perceval", { companions: ["grail", "princess"], things: ["armour"], horse: true, questDone: true });
  const g = openWood({ P1: s });
  resolveSpell(g, s, cellAt(g.board, 1, 1), "wind");
  assert.deepEqual(s.things, [], "every Thing held is swept away");
  assert.deepEqual(s.companions, ["grail", "princess"], "companions stay — the Grail is not a Thing");
  assert.equal(s.horse, true, "nor is the Horse you ride");
  assert.equal(s.questDone, true, "so a Grail quest survives the Wind");
});

/* -------------------- the crown replaces the quest (§18.10) -------------- */
// 4T6D mrhzg94z / mrhzha1o. Sogo played George, vanquished the King on turn 15 — and §18.10 traded his
// Knight card for the King card, quest and all ("his quest is now to occupy the Castle"). The ENGINE knew
// (seat.q became "king"); the projection did not — seatToDict read the quest straight off the KNIGHT card,
// so for forty turns the board still told him to slay the Dragon. He hunted it, was told only George may
// slay it, then stood in the Enchanted Gate and could not leave. The rules were right the whole way; the
// screen was lying. These pin the screen to the rules.
test("taking the crown swaps the projected quest and label (4T6D mrhzg94z)", () => {
  const game = newMysticWoodGame();
  initMysticWoodSeats(game, [{ mark: "P1", name: "Sogo", kind: "human" }, { mark: "P2", name: "B", kind: "bot", bot_level: 2 }, { mark: "P3", name: "C", kind: "bot", bot_level: 2 }]);
  const s = game.players.P1;
  s.knight = "george"; s.q = "dragon";
  const before = mysticWoodGameToDict(game, "P1").players.find((p) => p.mark === "P1");
  assert.equal(before.quest, KNIGHTS.george.quest, "before the crown, George's own quest");
  assert.match(before.label, /George's quest/);

  becomeKing(game, s);
  const after = mysticWoodGameToDict(game, "P1").players.find((p) => p.mark === "P1");
  assert.equal(after.isKing, true);
  assert.equal(after.quest, KING_QUEST, "the crown REPLACED the Knight card, and the quest with it (§18.10)");
  assert.doesNotMatch(after.quest, /Dragon/, "so the board no longer promises him a Dragon he can no longer slay");
  assert.match(after.label, /Sogo \(King\)/, "and he is named for what he now is");
  assert.match(game.log.map((e) => e.text).join("\n"), /quest changes with the crown/, "the swap is announced, not silent");
});
// Review finding (4T6D): the crown must set aside a quest ALREADY fulfilled, not just relabel it — or a
// knight who finished his quest and THEN took the crown keeps questDone and could still leave by the
// Enchanted Gate. A King's only road is the Castle (§18.10).
test("taking the crown voids a quest already fulfilled — set aside in state, not just relabelled", () => {
  const s = seatLit("george", { name: "Sogo" });
  const g = openWood({ P1: s });
  s.q = "dragon"; s.questDone = true; s.atGate = true;   // he slew the Dragon and stood in the Gate BEFORE the crown
  becomeKing(g, s);
  assert.equal(s.isKing, true);
  assert.equal(s.questDone, false, "§18.10: the crown replaces the quest — a fulfilment already banked is set aside with it");
  assert.equal(s.atGate, false, "so a former quest-holder cannot slip out the Enchanted Gate; a King's road is the Castle");
});
// §18.4 read against §18.10: only George kills the Dragon — and a George who wears the crown is not George
// any more. The engine already had this right (it gates on seat.q, not on the knight's name); this pins it,
// because it is the behaviour the report called a bug and it is staying.
test("a George who took the crown drives the Dragon off rather than slaying it (§18.4 + §18.10)", () => {
  const s = seatLit("george", { name: "Sogo" });
  const g = openWood({ P1: s });
  becomeKing(g, s);
  const tile = cellAt(g.board, s.r, s.c); tile.card = "dragon";
  resolveChallenge(g, s, tile, 6, 1);
  assert.equal(s.questDone, false, "the Dragon is not his quest any more, so killing it would win him nothing");
  assert.equal(tile.card, null, "it flees the glade…");
  assert.ok(g.discard.includes("dragon"), "…but is recycled, not killed — it comes back for whoever still owes it a death");
  assert.match(g.log.map((e) => e.text).join("\n"), /drives the Dragon off/);
});
