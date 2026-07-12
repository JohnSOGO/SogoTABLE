// The Mystic Wood — §14/§18 Power Limit: the pure mechanics of CHOOSING what to surrender.
//
// A LEAF module (like joust.js / spells.js): it may import totals from engine.js and the tables from
// data.js, but engine.js must NEVER import this back (that would make a cycle) — powerShedChoices and
// shedCard are called only from rules.js, at the end-of-turn chokepoint. No DOM / transport / storage
// here: this is game rule, and the UI only renders the choices it prepares.
//
// The rule: at the END of any turn a knight whose Strength + Prowess exceeds 10 must surrender cards
// until back within it (§18). The rulebook lets the PLAYER choose which (§14); the engine's inline
// `enforcePower` still auto-picks for BOTS, but a human resolves the choice through here.
//
// Scope note: this slice owns the CHOICE only. Disposal is unchanged from the auto-shedder — a
// surrendered card is removed. "Return to board" (a Thing dropped onto the tile, a "-slayer" reverting
// to its beast in the deck, §18) is the documented follow-up; keep both here when that slice lands.

import { THINGS } from "./data.js";

// The cards a knight MAY surrender to get back under the limit, each tagged with what it is worth so the
// client can show the cost of each. A quest-critical item (Guyon's Golden Bough while the Cave quest is
// unfinished) is flagged so the UI can warn — the player may still pick it, but it should not be the
// obvious first tap (this mirrors the auto-shedder's guard, which spares it until nothing else is left).
export function powerShedChoices(seat) {
  const out = [];
  (seat.things || []).forEach((id, idx) => out.push({
    kind: "thing", idx, id, name: THINGS[id] ? THINGS[id].name : id,
    s: THINGS[id] ? (THINGS[id].S || 0) : 0, p: THINGS[id] ? (THINGS[id].P || 0) : 0,
    critical: id === "golden_bough" && seat.q === "cave" && !seat.questDone,
  }));
  (seat.prowess || []).forEach((pc, idx) => out.push({
    kind: "prowess", idx, id: pc.name, name: pc.name, s: 0, p: pc.P || 1,
  }));
  return out;
}

// Apply ONE surrender the player chose. `action` carries { kind, idx }. Returns the surrendered card's
// display name. Throws on an illegal pick so the server stays authoritative over a spoofed/stale index —
// the UI only captures intent; legality is decided here.
export function shedCard(game, seat, action) {
  const kind = action && action.kind;
  const list = kind === "thing" ? seat.things : kind === "prowess" ? seat.prowess : null;
  if (!Array.isArray(list)) throw new Error("Choose a Thing or a prowess card to surrender.");
  const idx = Number(action && action.idx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) throw new Error("That card is not yours to surrender.");
  const removed = list.splice(idx, 1)[0];
  return kind === "thing" ? (THINGS[removed] ? THINGS[removed].name : removed) : removed.name;
}
