// The Mystic Wood — the game's voice: the chronicle it writes, and the words it writes in it.
// Two halves of one concern — what the player READS. The chronicle (write / bound / read-back) is the
// log the result modal, the herald and the bug-report snapshot all draw from; the phrase builders turn
// a denizen id + a knight's name into the line that lands in it. No rules are decided here: the engine
// has already resolved the effect, this module only says it.
// A pure leaf: it reads data.js and nothing else (engine.js imports IT — never the other way round),
// so no totals are computed here — the caller passes the already-derived S/P in.
import { DEN, DEN_TALES, DEN_INTRO, THINGS } from "./data.js";

/* ------------------------------ chronicle -------------------------------- */
// Retained history. Deep enough to audit a long game (the chronicle IS the audit log, and the
// bug-report snapshot draws from it), still bounded so room state / the projection stay a
// reasonable size on a phone. See docs/observability-and-debug.md (Slice 1).
const LOG_CAP = 300;
export function logEvent(game, text, cls = "") {
  if (!game.log) game.log = [];
  // `t` = turn counter at write time — a debug anchor (not shown to players) so a snapshot's chronicle reads turn-by-turn.
  game.log.push({ text, cls, t: game.turn_seq || 0 });
  game.log_n = (game.log_n || 0) + 1;
  if (game.log.length > LOG_CAP) game.log.splice(0, game.log.length - LOG_CAP);
}
// An encounter narrates itself by reading back the lines its own resolution logged. An INDEX into
// game.log cannot do that: once the log reaches LOG_CAP the trim drops the front, so the index a
// resolution captured before it ran still points at the end afterwards and the read comes back
// empty — the result modal then falls through to "the Merlin reacts." mid-game, and only mid-game.
// `log_n` counts every event ever logged and never shrinks, so the read stays anchored.
export function logMark(game) { return game.log_n || 0; }
export function logSince(game, mark) {
  const n = (game.log_n || 0) - mark;
  return n > 0 ? game.log.slice(-n).map((e) => e.text).join("<br>") : "";
}

/* ------------------------------- phrasing -------------------------------- */
// A short "what did this Thing do to me" note for the result card / chronicle: the stat/power it grants
// and the seat's resulting totals, so a player sees the buff and their updated stats when they receive it.
const POWER_NOTE = { cave: "lets you enter the Cave", key: "escapes the Tower once", wand: "rotates your tile", scry: "scries the deck" };
// The same courtesy for a COMPANION won: "whenever you receive something tell me what the buff is"
// (bug mrh964kp — the Grail joined you with no word of what it did). Called AFTER enforcePower, so the
// totals quoted are the ones the knight actually walks away with.
const COMP_NOTE = { grail: "+1 Prowess, +1 Strength", princess: "+1 Prowess (never against the King)", sage: "lends +2 Prowess to one contest, then departs",
  prince: "lends +3 Strength & +3 Prowess to ONE fight", archmage: "transports you on your turn", magician: "raises a storm on your turn",
  boy: "deliver him to the Earthly Gate", damsel: "deliver her to the Queen" };
// s / p are the seat's ALREADY-DERIVED totals (engine.totalS / engine.totalP) — passed in, not computed,
// so this stays a leaf and no import cycle forms back into the engine.
export function compEffect(id, s, p) {
  return `${COMP_NOTE[id] || "travels at your side"} (now S ${s} · P ${p})`;
}
export function thingEffect(id, s, p) {
  const t = THINGS[id] || {}; const parts = [];
  if (t.S) parts.push(`+${t.S} Strength`);
  if (t.P) parts.push(`+${t.P} Prowess`);
  if (t.power) parts.push(POWER_NOTE[t.power] || "a special power");
  return `${parts.join(", ") || "no bonus"} (now S ${s} · P ${p})`;
}
// "the Merlin" reads as a typo: he is a person, not a species. `proper` denizens take no article.
export function denPhrase(id) {
  const den = DEN[id];
  if (!den) return "the denizen";
  return den.proper ? den.name : `the ${den.name}`;
}
// The story a reaction tells, with the knight written into it. Falls back to plain narration.
export function tale(id, act, name) {
  const t = DEN_TALES[id] && DEN_TALES[id][act];
  return t ? t.replace(/\{k\}/g, name) : null;
}
// The first-sight line for an encountered denizen, the knight written in. Falls back to a plain
// meeting so a denizen with no written intro still says who {k} has come upon.
export function denIntro(id, name) {
  const t = DEN_INTRO[id];
  return t ? t.replace(/\{k\}/g, name) : `${name} comes upon ${denPhrase(id)}.`;
}
