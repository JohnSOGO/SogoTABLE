// Last Orders — client rules text (static describe.js) over every rules def:
// every effect op yields readable text, nothing says "undefined", and a
// content.js `text` override wins.
import test from "node:test";
import assert from "node:assert/strict";
import { PACKS, PACK_IDS } from "../games/last-orders/packs.js";
import { plainDef } from "../games/last-orders/catalog.js";
import { describe, describeLines, kindLabel, traitLines } from "../../src/sogotable/static/games/last-orders/describe.js";

function allDefs() {
  const out = [];
  PACK_IDS.forEach((packId) => {
    const pack = PACKS[packId];
    (pack.characters || []).forEach((ch) => {
      out.push(plainDef(ch.id));
      (ch.deck || []).forEach((c) => out.push(plainDef(c.id)));
    });
    (pack.drinks || []).forEach((d) => out.push(plainDef(d.id)));
    (pack.events || []).forEach((e) => out.push(plainDef(e.id)));
  });
  return out;
}

const bad = (s) => /undefined|NaN|null|\[object/.test(s);

test("every def describes to clean, non-empty text", () => {
  const defs = allDefs();
  assert.ok(defs.length > 100, "expected the full catalog");
  defs.forEach((def) => {
    const lines = describeLines(def);
    assert.ok(lines.length > 0, `${def.id} has no text`);
    lines.forEach((l) => {
      assert.equal(typeof l, "string");
      assert.ok(l.trim().length > 3, `${def.id} has an empty line`);
      assert.ok(!bad(l), `${def.id}: "${l}"`);
    });
    assert.ok(!bad(describe(def)), def.id);
    if (def.type === "card" || def.type === "drink" || def.type === "event") assert.ok(kindLabel(def), `${def.id} kind label`);
  });
});

test("every effect op on every def contributes its own sentence", () => {
  allDefs().filter((d) => d.type === "card" || d.type === "drink").forEach((def) => {
    const lines = describeLines(def);
    const effects = def.effects || [];
    const extra = (def.kind === "reaction" ? 1 : 0) + (def.free ? 1 : 0) + (def.unstoppable ? 1 : 0)
      + (def.house ? 1 : 0) + (def.chaser ? 1 : 0) + (def.unrefusable ? 1 : 0);
    assert.equal(lines.length, effects.length + extra, `${def.id}: ${lines.join(" | ")}`);
  });
  allDefs().filter((d) => d.type === "event").forEach((def) => {
    const mods = Object.values(def.mods || {}).filter((v) => Number(v)).length;
    const lines = describeLines(def);
    assert.equal(lines.length, Math.max(1, mods + (def.on_flip || []).length), def.id);
  });
});

test("sample phrasings read like rules text", () => {
  const card = (effects, extra = {}) => ({ type: "card", kind: "action", target: "opponent", effects, ...extra });
  assert.equal(describe(card([{ op: "grit", who: "target", n: -3 }])), "Deal 3 damage to a rival.");
  assert.equal(describe(card([{ op: "steal", n: 2 }])), "Take up to 2 Coins from a rival.");
  assert.equal(describe(card([{ op: "grit", who: "self", n: 3 }], { target: "none", free: true })), "Gain 3 Grit. Free — doesn't use your action.");
  assert.equal(describe({ type: "card", kind: "reaction", answers: ["action"], needs: "targeted", effects: [{ op: "negate" }] }),
    "Answer an action aimed at you. Cancel the card it answers.");
  assert.equal(describe({ type: "card", kind: "reaction", answers: ["action", "drink", "gamble", "reaction"], needs: "any", effects: [{ op: "negate" }] }),
    "Answer any card or drink. Cancel the card it answers.");
  assert.equal(describe({ type: "drink", effects: [{ op: "buzz", who: "target", n: 1 }], house: true }), "Gain 1 Buzz. On the house — everyone still in drinks it.");
  assert.equal(describe({ type: "card", kind: "spike", effects: [{ op: "buzz", who: "target", n: 2 }] }), "The drinker gains 2 Buzz.");
  assert.equal(describe({ type: "event", mods: { drink_buzz: 1 }, on_flip: [{ op: "gold", who: "all", n: 1 }] }),
    "Every drink gives +1 Buzz this round. Everyone gains 1 Coin from the bank.");
});

test("a content text override wins", () => {
  const def = plainDef("base:gorrum:headbutt");
  assert.deepEqual(describeLines(def, { text: "Bonk." }), ["Bonk."]);
});

test("every patron trait describes", () => {
  allDefs().filter((d) => d.type === "character").forEach((ch) => {
    traitLines(ch.trait).forEach((l) => assert.ok(!bad(l) && l.length > 3, ch.id));
  });
});
