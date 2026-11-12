// Last Orders — "rowdy" expansion: the event deck only (PLAN.md §2 EventDef).
// One event flips at the start of each table round and lasts for that round.
// Pure data, no imports. Display text lives in the client content.js.

export const ROWDY_PACK = {
  id: "rowdy",
  characters: [],
  drinks: [],
  events: [
    { id: "rowdy:event:fiddlers-night", copies: 1, mods: { drink_buzz: 1 }, on_flip: [] },
    { id: "rowdy:event:high-rollers", copies: 1, mods: { ante: 1 }, on_flip: [] },
    { id: "rowdy:event:brawl-oclock", copies: 1, mods: { damage: 1 }, on_flip: [] },
    { id: "rowdy:event:watered-down", copies: 1, mods: { drink_buzz: -1 }, on_flip: [] },
    { id: "rowdy:event:foggy-night", copies: 1, mods: { damage: -1 }, on_flip: [] },
    { id: "rowdy:event:payday", copies: 1, mods: {}, on_flip: [{ op: "gold", who: "all", n: 2 }] },
    { id: "rowdy:event:free-snacks", copies: 1, mods: {}, on_flip: [{ op: "grit", who: "all", n: 2 }] },
    { id: "rowdy:event:pie-contest", copies: 1, mods: {}, on_flip: [{ op: "buzz", who: "all", n: -1 }, { op: "grit", who: "all", n: 1 }] },
    { id: "rowdy:event:tip-jar-tumble", copies: 1, mods: {}, on_flip: [{ op: "gold", who: "all", n: -1 }] },
    { id: "rowdy:event:arm-wrestling-league", copies: 1, mods: { damage: 1, ante: 1 }, on_flip: [] },
    { id: "rowdy:event:sing-along", copies: 1, mods: {}, on_flip: [{ op: "draw", who: "all", n: 1 }] },
    { id: "rowdy:event:happy-hour", copies: 1, mods: { drink_buzz: 1 }, on_flip: [{ op: "gold", who: "all", n: 1 }] },
  ],
};
