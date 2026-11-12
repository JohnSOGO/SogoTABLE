// Last Orders — readable rules text built from a projected def (pure; no DOM).
//
// The server projects every def the viewer can see (`game.defs[id]`, tagged
// `type: "card" | "drink" | "event" | "character"`); this turns its effect
// list into sentences ("Deal 3 damage to a rival.", "Cancel the card it
// answers."). A content.js entry's `text` overrides the generated lines. It
// describes; it never decides whether anything is legal.
import { KINDS, RULES_WORDS as W, STATS, coinWord, cardWord, drinkWord } from "./branding.js";

const num = (v) => Math.trunc(Number(v) || 0);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Who an effect lands on, in the def's own frame:
//   card  → relative to the player ("target" = the chosen rival)
//   spike → "target" is the drinker
//   drink → "target" is the drinker, addressed as "you"
//   event → applied to everyone still in
function subject(who, frame, def) {
  if (frame === "event") return { you: false, name: W.everyone };
  if (frame === "drink") {
    if (who === "others") return { you: false, name: W.everyRival };
    if (who === "all") return { you: false, name: W.everyone };
    return { you: true, name: W.you };
  }
  if (frame === "spike") return who === "self" ? { you: true, name: W.you } : { you: false, name: W.drinker };
  switch (who) {
    case "self": return { you: true, name: W.you };
    case "others": return { you: false, name: W.everyRival };
    case "all": return { you: false, name: W.everyone };
    default: return { you: false, name: W.rival };
  }
}

// "Gain 2 Buzz." vs "A rival gains 2 Buzz."
function clause(s, verbYou, verbThey, rest) {
  return s.you ? `${cap(verbYou)} ${rest}.` : `${cap(s.name)} ${verbThey} ${rest}.`;
}

function effectLine(eff, frame, def, seen = {}) {
  const n = num(eff.n);
  const s = subject(eff.who, frame, def);
  // A second effect on the same chosen rival reads "them", not "a rival".
  if (frame === "card" && s.name === W.rival) {
    if (seen.rival) {
      if (eff.op === "buzz" && n > 0) return `Give them ${n} ${STATS.buzz.name}.`;
      if (eff.op === "grit" && n < 0) return `Deal ${-n} more damage to them.`;
      s.name = W.thatRival;
    }
    seen.rival = true;
  }
  if (frame === "card" && (eff.op === "steal" || eff.op === "order")) seen.rival = true;
  switch (eff.op) {
    case "grit":
      if (n < 0) {
        if (frame === "card" && !s.you) return `Deal ${-n} damage to ${s.name}.`;
        return clause(s, "lose", "loses", `${-n} ${STATS.grit.name}`);
      }
      return clause(s, "gain", "gains", `${n} ${STATS.grit.name}`);
    case "buzz":
      if (n < 0) return clause(s, "lose", "loses", `${-n} ${STATS.buzz.name}`);
      if (frame === "card" && !s.you && s.name === W.rival) return `Give a rival ${n} ${STATS.buzz.name}.`;
      return clause(s, "gain", "gains", `${n} ${STATS.buzz.name}`);
    case "gold":
      if (n < 0) return clause(s, "pay", "pays", `${-n} ${coinWord(n)} to the bank`);
      return clause(s, "gain", "gains", `${n} ${coinWord(n)} from the bank`);
    case "steal":
      return `Take up to ${n} ${coinWord(n)} from a rival.`;
    case "collect":
      return `Every rival pays you up to ${n} ${coinWord(n)}.`;
    case "draw":
      return clause(s, "draw", "draws", `${n} ${cardWord(n)}`);
    case "order": {
      const k = Math.max(1, n || 1);
      return `Put ${k} extra ${drinkWord(k)} from the deck on a rival's line.`;
    }
    case "gamble":
      return "Start a gamble: everyone still in antes, and you lead.";
    case "extra_action":
      return "Play one more action this turn.";
    case "negate":
      return "Cancel the card it answers.";
    case "redirect":
      return "Send it to another patron instead.";
    case "reflect":
      return "Bounce it back at whoever played it.";
    case "soften":
      return `It deals ${n} less damage and ${n} less ${STATS.buzz.name} to you.`;
    case "take_lead":
      return "Take the lead in the gamble.";
    case "raise":
      return `Raise: everyone in the gamble pays ${n || 1} more ${coinWord(n || 1)} into the pot, and you lead.`;
    default:
      return eff.op ? `${cap(String(eff.op).replace(/_/g, " "))}${n ? ` ${n}` : ""}.` : "";
  }
}

function joinOr(list) {
  if (list.length <= 1) return list[0] || "";
  return `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`;
}

// "Answer an action aimed at you." — what a reaction may be played on.
function answersLine(def) {
  const answers = Array.isArray(def.answers) ? def.answers : [];
  if (!answers.length) return "";
  if (answers.length >= 4 && def.needs !== "targeted") return W.answerAny;
  const kinds = answers.map((k) => W.answers[k] || k);
  return `Answer ${joinOr(kinds)}${def.needs === "targeted" ? W.aimedAtYou : ""}.`;
}

function modLines(mods) {
  const m = mods && typeof mods === "object" ? mods : {};
  const out = [];
  const signed = (v) => (v > 0 ? `+${v}` : String(v));
  if (num(m.drink_buzz)) out.push(`Every drink gives ${signed(num(m.drink_buzz))} ${STATS.buzz.name} ${W.thisRound}.`);
  if (num(m.ante)) out.push(`Gamble antes are ${signed(num(m.ante))} ${coinWord(m.ante)} ${W.thisRound}.`);
  if (num(m.damage)) out.push(`Attacks deal ${signed(num(m.damage))} damage ${W.thisRound}.`);
  return out;
}

// Rules lines for a def: string[] (never empty for a known def).
export function describeLines(def, entry) {
  if (entry && typeof entry.text === "string" && entry.text.trim()) return [entry.text.trim()];
  if (!def || typeof def !== "object") return [];
  const type = def.type || (def.kind ? "card" : def.mods || def.on_flip ? "event" : "drink");
  const lines = [];
  if (type === "event") {
    lines.push(...modLines(def.mods));
    (def.on_flip || []).forEach((eff) => lines.push(effectLine(eff, "event", def)));
  } else if (type === "drink") {
    (def.effects || []).forEach((eff) => lines.push(effectLine(eff, "drink", def)));
    if (def.house) lines.push(W.house);
    if (def.chaser) lines.push(W.chaser);
    if (def.unrefusable) lines.push(W.unrefusable);
  } else if (type === "character") {
    lines.push(...traitLines(def.trait));
  } else {
    if (def.kind === "reaction") { const a = answersLine(def); if (a) lines.push(a); }
    const frame = def.kind === "spike" ? "spike" : "card";
    const seen = {};
    (def.effects || []).forEach((eff) => lines.push(effectLine(eff, frame, def, seen)));
    if (def.free) lines.push(W.free);
    if (def.unstoppable) lines.push(W.unstoppable);
  }
  const clean = lines.filter((l) => l && !/undefined|NaN/.test(l));
  if (!clean.length) clean.push(type === "event" ? "A quiet night." : "No effect.");
  return clean;
}

export function describe(def, entry) {
  return describeLines(def, entry).join(" ");
}

export function kindLabel(def) {
  if (!def) return "";
  if (def.type === "drink") return KINDS.drink;
  if (def.type === "event") return KINDS.event;
  return KINDS[def.kind] || "";
}

// Patron traits (content.js traitText wins; this is the fallback).
export function traitLines(trait) {
  const t = trait && typeof trait === "object" ? trait : {};
  const out = [];
  const signed = (v) => (v > 0 ? `+${v}` : String(v));
  if (num(t.start_grit)) out.push(`Starts with ${signed(num(t.start_grit))} ${STATS.grit.name}.`);
  if (num(t.start_gold)) out.push(`Starts with ${signed(num(t.start_gold))} ${coinWord(t.start_gold)}.`);
  if (num(t.start_buzz)) out.push(`Starts with ${num(t.start_buzz)} ${STATS.buzz.name}.`);
  if (num(t.hand_size)) out.push(`Holds ${signed(num(t.hand_size))} ${cardWord(t.hand_size)} in hand.`);
  if (num(t.drink_buzz_mod)) out.push(`Every drink gives ${signed(num(t.drink_buzz_mod))} ${STATS.buzz.name}.`);
  if (num(t.damage_bonus)) out.push(`Attacks deal ${signed(num(t.damage_bonus))} damage.`);
  if (num(t.pot_bonus)) out.push(`Wins ${signed(num(t.pot_bonus))} ${coinWord(t.pot_bonus)} extra with every pot.`);
  if (num(t.draw_bonus)) out.push(`Discards and draws up to ${signed(num(t.draw_bonus))} extra.`);
  return out.length ? out : ["No special trait."];
}
