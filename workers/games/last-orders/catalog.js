// Last Orders — card catalog: every pack's characters, hand cards, drinks and
// events flattened into one id → def lookup, plus deck builders for a set of
// enabled packs. Pure data access; no game state.
import { PACKS, PACK_IDS } from "./packs.js";

export const EXPANSION_IDS = PACK_IDS.filter((id) => id !== "base");

const DEFS = new Map(); // id -> { type: "character"|"card"|"drink"|"event", def, pack }
for (const packId of PACK_IDS) {
  const pack = PACKS[packId];
  (pack.characters || []).forEach((ch) => {
    DEFS.set(ch.id, { type: "character", def: ch, pack: packId });
    (ch.deck || []).forEach((card) => DEFS.set(card.id, { type: "card", def: card, pack: packId, character: ch.id }));
  });
  (pack.drinks || []).forEach((d) => DEFS.set(d.id, { type: "drink", def: d, pack: packId }));
  (pack.events || []).forEach((e) => DEFS.set(e.id, { type: "event", def: e, pack: packId }));
}

export function entryOf(id) {
  return DEFS.get(String(id)) || null;
}
export function cardDef(id) {
  const e = DEFS.get(String(id));
  return e && e.type === "card" ? e.def : null;
}
export function drinkDef(id) {
  const e = DEFS.get(String(id));
  return e && e.type === "drink" ? e.def : null;
}
export function eventDef(id) {
  const e = DEFS.get(String(id));
  return e && e.type === "event" ? e.def : null;
}
export function characterDef(id) {
  const e = DEFS.get(String(id));
  return e && e.type === "character" ? e.def : null;
}

export function enabledPacks(expansions) {
  return ["base", ...(expansions || []).filter((id) => EXPANSION_IDS.includes(id))];
}

export function charactersFor(expansions) {
  return enabledPacks(expansions).flatMap((id) => PACKS[id].characters || []);
}

function expand(list) {
  const out = [];
  (list || []).forEach((item) => {
    const n = Math.max(1, Math.trunc(Number(item.copies) || 1));
    for (let i = 0; i < n; i += 1) out.push(item.id);
  });
  return out;
}

export function characterDeckIds(characterId) {
  const ch = characterDef(characterId);
  return ch ? expand(ch.deck) : [];
}
export function drinkDeckIds(expansions) {
  return enabledPacks(expansions).flatMap((id) => expand(PACKS[id].drinks));
}
export function eventDeckIds(expansions) {
  return enabledPacks(expansions).flatMap((id) => expand(PACKS[id].events));
}

// Plain JSON copy of a def for the wire, tagged with its type.
export function plainDef(id) {
  const e = DEFS.get(String(id));
  if (!e) return null;
  return { ...JSON.parse(JSON.stringify(e.def)), type: e.type, pack: e.pack };
}
