// Last Orders content validation: the pack data (workers/games/last-orders/packs)
// must stay inside the PLAN.md §2 vocabulary, decks must stay in their size bands,
// and every rules id must have a client display entry (static content.js).
import test from "node:test";
import assert from "node:assert/strict";
import { PACKS, PACK_IDS } from "../games/last-orders/packs.js";
import * as CONTENT from "../../src/sogotable/static/games/last-orders/content.js";

const KINDS = ["action", "reaction", "gamble", "spike"];
const ITEM_KINDS = ["action", "drink", "gamble", "reaction"];
const WHO = ["self", "target", "others", "all"];
const TRAIT_KEYS = ["start_grit", "start_gold", "start_buzz", "hand_size", "drink_buzz_mod", "damage_bonus", "pot_bonus", "draw_bonus"];
const MOD_KEYS = ["drink_buzz", "ante", "damage"];
const EXPANSIONS = ["harbor", "frost", "masquerade", "clockwork", "storm"];

// op -> { fields: required field shape, n: "any" | "pos" | undefined }
const OPS = {
  grit: { who: true, n: "any" },
  buzz: { who: true, n: "any" },
  gold: { who: true, n: "any" },
  steal: { n: "pos", targeted: true },
  collect: { n: "pos" },
  draw: { who: true, n: "pos" },
  order: { n: "pos", targeted: true },
  gamble: {},
  extra_action: {},
  negate: {},
  redirect: { targeted: true },
  reflect: {},
  soften: { n: "pos" },
  take_lead: {},
  raise: { n: "pos" },
};
// Which ops each context may carry.
const ALLOWED = {
  action: ["grit", "buzz", "gold", "steal", "collect", "draw", "order", "gamble", "extra_action"],
  reaction: ["negate", "redirect", "reflect", "soften", "grit", "buzz", "gold", "draw"],
  gamble: ["take_lead", "raise", "grit", "buzz", "gold", "draw"],
  spike: ["grit", "buzz", "gold"],
  drink: ["grit", "buzz", "gold"],
  event: ["grit", "buzz", "gold", "draw"],
};

const isInt = (v) => Number.isInteger(v);
const copiesOf = (list) => list.reduce((sum, def) => sum + def.copies, 0);
const allCharacters = () => PACK_IDS.flatMap((id) => PACKS[id].characters);
const allCards = () => allCharacters().flatMap((c) => c.deck);
const allDrinks = () => PACK_IDS.flatMap((id) => PACKS[id].drinks);
const allEvents = () => PACK_IDS.flatMap((id) => PACKS[id].events);

function checkEffects(where, context, effects, problems) {
  if (!Array.isArray(effects) || (context !== "event" && effects.length === 0)) {
    problems.push(`${where}: effects must be a non-empty array`);
    return;
  }
  for (const effect of effects) {
    const spec = OPS[effect.op];
    if (!spec) { problems.push(`${where}: unknown op ${effect.op}`); continue; }
    if (!ALLOWED[context].includes(effect.op)) problems.push(`${where}: op ${effect.op} not allowed on ${context}`);
    const allowedFields = ["op", ...(spec.who ? ["who"] : []), ...(spec.n ? ["n"] : [])];
    for (const key of Object.keys(effect)) {
      if (!allowedFields.includes(key)) problems.push(`${where}: op ${effect.op} has stray field ${key}`);
    }
    if (spec.who) {
      if (!WHO.includes(effect.who)) problems.push(`${where}: bad who ${effect.who}`);
      if ((context === "drink" || context === "spike") && effect.who !== "target") problems.push(`${where}: ${context} effects use who "target" (the drinker)`);
      if (context === "event" && effect.who !== "all") problems.push(`${where}: event effects use who "all"`);
    }
    if (spec.n === "any" && !(isInt(effect.n) && effect.n !== 0)) problems.push(`${where}: ${effect.op} needs a non-zero integer n`);
    if (spec.n === "pos" && !(isInt(effect.n) && effect.n > 0)) problems.push(`${where}: ${effect.op} needs a positive integer n`);
    if (isInt(effect.n) && Math.abs(effect.n) > 4) problems.push(`${where}: ${effect.op} n=${effect.n} is outside the sane band`);
  }
}

test("last-orders content: pack registry is base first and keyed by pack id", () => {
  assert.deepEqual(PACK_IDS, ["base", "harbor", "frost", "masquerade", "clockwork", "storm", "rowdy"]);
  for (const id of PACK_IDS) assert.equal(PACKS[id].id, id);
  assert.equal(PACKS.base.characters.length, 4);
  for (const id of EXPANSIONS) assert.equal(PACKS[id].characters.length, id === "storm" ? 3 : 2, `${id} characters`);
});

test("last-orders content: every id is unique and namespaced by its pack", () => {
  const seen = new Set();
  const problems = [];
  const claim = (id) => { if (seen.has(id)) problems.push(`duplicate id ${id}`); seen.add(id); };
  for (const packId of PACK_IDS) {
    const pack = PACKS[packId];
    for (const character of pack.characters) {
      claim(character.id);
      if (!new RegExp(`^${packId}:[a-z0-9-]+$`).test(character.id)) problems.push(`bad character id ${character.id}`);
      if (character.pack !== packId) problems.push(`${character.id}: pack field ${character.pack}`);
      for (const card of character.deck) {
        claim(card.id);
        if (!card.id.startsWith(`${character.id}:`) || !/^[a-z]+:[a-z0-9-]+:[a-z0-9-]+$/.test(card.id)) problems.push(`card id ${card.id} not under ${character.id}`);
      }
    }
    for (const drink of pack.drinks) {
      claim(drink.id);
      if (!new RegExp(`^${packId}:drink:[a-z0-9-]+$`).test(drink.id)) problems.push(`bad drink id ${drink.id}`);
    }
    for (const event of pack.events) {
      claim(event.id);
      if (!new RegExp(`^${packId}:event:[a-z0-9-]+$`).test(event.id)) problems.push(`bad event id ${event.id}`);
    }
  }
  assert.deepEqual(problems, []);
});

test("last-orders content: hand cards use the PLAN vocabulary and kind-specific fields", () => {
  const problems = [];
  for (const card of allCards()) {
    const where = card.id;
    if (!KINDS.includes(card.kind)) problems.push(`${where}: bad kind ${card.kind}`);
    if (!(isInt(card.copies) && card.copies > 0)) problems.push(`${where}: copies must be a positive int`);
    checkEffects(where, card.kind, card.effects, problems);
    const ops = (card.effects || []).map((e) => e.op);
    const usesTarget = (card.effects || []).some((e) => e.who === "target" || OPS[e.op]?.targeted);
    if (card.kind === "action") {
      if (!["opponent", "none"].includes(card.target)) problems.push(`${where}: action needs target opponent|none`);
      if (usesTarget !== (card.target === "opponent")) problems.push(`${where}: target "${card.target}" does not match its effects`);
      if (ops.includes("gamble") && ops.length !== 1) problems.push(`${where}: a gamble starter carries only {op:"gamble"}`);
      if ("answers" in card || "needs" in card) problems.push(`${where}: answers/needs are reaction-only`);
    } else if (card.kind === "reaction") {
      if (!["opponent", "none"].includes(card.target)) problems.push(`${where}: reaction needs target opponent|none`);
      if (ops.includes("redirect") !== (card.target === "opponent")) problems.push(`${where}: only redirects pick a target`);
      if (!Array.isArray(card.answers) || card.answers.length === 0 || card.answers.some((k) => !ITEM_KINDS.includes(k))) problems.push(`${where}: bad answers`);
      if (!["targeted", "any"].includes(card.needs)) problems.push(`${where}: needs must be targeted|any`);
      if (!ops.some((op) => ["negate", "redirect", "reflect", "soften"].includes(op))) problems.push(`${where}: reaction has no stack effect`);
      if ((ops.includes("redirect") || ops.includes("reflect")) && card.needs !== "targeted") problems.push(`${where}: redirect/reflect only answer targeted items`);
      if ("free" in card || "unstoppable" in card) problems.push(`${where}: free/unstoppable are action-only`);
    } else {
      for (const key of ["target", "answers", "needs", "free", "unstoppable"]) {
        if (key in card) problems.push(`${where}: ${key} not used on ${card.kind}`);
      }
      if (card.kind === "gamble" && !ops.some((op) => op === "take_lead" || op === "raise")) problems.push(`${where}: gamble card must take_lead or raise`);
    }
  }
  assert.deepEqual(problems, []);
});

test("last-orders content: every character deck is 28-34 cards with a full toolkit", () => {
  const problems = [];
  for (const character of allCharacters()) {
    const deck = character.deck;
    const total = copiesOf(deck);
    if (total < 28 || total > 34) problems.push(`${character.id}: deck is ${total} cards`);
    for (const key of Object.keys(character.trait || {})) {
      if (!TRAIT_KEYS.includes(key) || !isInt(character.trait[key])) problems.push(`${character.id}: bad trait ${key}`);
    }
    const count = (pred) => copiesOf(deck.filter(pred));
    const has = (card, op) => card.effects.some((e) => e.op === op);
    if (count((c) => c.kind === "action" && has(c, "gamble")) < 2) problems.push(`${character.id}: needs 2+ gamble starters`);
    if (count((c) => c.kind === "gamble") < 3) problems.push(`${character.id}: needs 3+ gamble cards`);
    if (count((c) => c.kind === "spike") < 2) problems.push(`${character.id}: needs 2+ spikes`);
    const answersDrink = count((c) => c.kind === "reaction" && c.answers.includes("drink"));
    const answersAction = count((c) => c.kind === "reaction" && c.answers.includes("action"));
    if (answersDrink < 2 || answersAction < 2) problems.push(`${character.id}: needs drink and action defenses`);
  }
  assert.deepEqual(problems, []);
});

test("last-orders content: drinks are valid and the decks are sized", () => {
  const problems = [];
  for (const drink of allDrinks()) {
    if (!(isInt(drink.copies) && drink.copies > 0)) problems.push(`${drink.id}: copies must be a positive int`);
    checkEffects(drink.id, "drink", drink.effects, problems);
    for (const flag of ["chaser", "house", "unrefusable"]) {
      if (flag in drink && drink[flag] !== true) problems.push(`${drink.id}: ${flag} must be true when present`);
    }
  }
  assert.deepEqual(problems, []);
  const baseCount = copiesOf(PACKS.base.drinks);
  assert.ok(baseCount >= 28 && baseCount <= 36, `base drink deck is ${baseCount}`);
  for (const id of EXPANSIONS) assert.ok(PACKS[id].drinks.length >= 4, `${id} adds 4+ drinks`);
  assert.equal(PACKS.rowdy.drinks.length, 0);
  assert.equal(PACKS.rowdy.characters.length, 0);
});

test("last-orders content: rowdy event deck is 10-14 valid events", () => {
  const events = PACKS.rowdy.events;
  assert.ok(events.length >= 10 && events.length <= 14, `rowdy has ${events.length} events`);
  for (const id of PACK_IDS.filter((p) => p !== "rowdy")) assert.equal(PACKS[id].events.length, 0);
  const problems = [];
  for (const event of allEvents()) {
    if (!(isInt(event.copies) && event.copies > 0)) problems.push(`${event.id}: copies`);
    for (const [key, value] of Object.entries(event.mods || {})) {
      if (!MOD_KEYS.includes(key) || !isInt(value)) problems.push(`${event.id}: bad mod ${key}`);
    }
    checkEffects(event.id, "event", event.on_flip || [], problems);
    if (!Object.keys(event.mods || {}).length && !(event.on_flip || []).length) problems.push(`${event.id}: does nothing`);
  }
  assert.deepEqual(problems, []);
});

test("last-orders content: every rules id has a client display entry", () => {
  const missing = [];
  const need = (table, id, fields) => {
    const entry = CONTENT[table][id];
    if (!entry) { missing.push(`${table}[${id}]`); return; }
    for (const field of fields) if (typeof entry[field] !== "string" || !entry[field]) missing.push(`${table}[${id}].${field}`);
  };
  for (const id of PACK_IDS) need("PACKS", id, ["name", "blurb"]);
  for (const character of allCharacters()) {
    need("CHARACTERS", character.id, ["name", "title", "blurb", "traitText"]);
    const palette = CONTENT.CHARACTERS[character.id]?.palette;
    if (!palette || !/^#[0-9a-f]{6}$/i.test(palette.main) || !/^#[0-9a-f]{6}$/i.test(palette.accent)) missing.push(`${character.id}.palette`);
    for (const card of character.deck) need("CARDS", card.id, ["name", "flavor"]);
  }
  for (const drink of allDrinks()) need("DRINKS", drink.id, ["name", "flavor", "emoji"]);
  for (const event of allEvents()) need("EVENTS", event.id, ["name", "flavor"]);
  assert.deepEqual(missing, []);

  // No orphans: display entries without rules data are stale.
  const ids = new Set([...allCharacters().map((c) => c.id), ...allCards().map((c) => c.id), ...allDrinks().map((d) => d.id), ...allEvents().map((e) => e.id)]);
  const orphans = ["CHARACTERS", "CARDS", "DRINKS", "EVENTS"].flatMap((table) => Object.keys(CONTENT[table]).filter((id) => !ids.has(id)));
  assert.deepEqual(orphans, []);
});

test("last-orders voices: every patron has a distinct Kokoro voice and every listed clip is committed", async () => {
  const { existsSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { VOICE_PROFILES } = await import("../../src/sogotable/static/games/last-orders/voice.js");
  const { ASSETS, VOICE_IDS } = await import("../../src/sogotable/static/games/last-orders/assets.js");
  const ids = Object.keys(CONTENT.CHARACTERS);
  assert.deepEqual(Object.keys(VOICE_PROFILES).sort(), [...ids].sort());
  const kokoro = ids.map((id) => VOICE_PROFILES[id].kokoro);
  assert.equal(new Set(kokoro).size, ids.length, "no two patrons share a voice");
  for (const id of VOICE_IDS) {
    assert.ok(CONTENT.CARDS[id], `${id} is a card`);
    assert.ok(existsSync(fileURLToPath(ASSETS.voices[id])), `${id} clip is committed`);
  }
});
