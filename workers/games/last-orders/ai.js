// Last Orders — bot brain. Decides only; every choice is played through the
// same validated path a human move takes (rules.js). Levels: 1 Sprout (mostly
// random), 2 Buddy, 3 Cipher, 4 Overlord (focus fire, saves counters).
import { cardDef, drinkDef } from "./catalog.js";
import { living, random, isLiving } from "./engine.js";
import { playableFor, topItem, orderTargets, discardLimit } from "./legal.js";

const pick = (list) => list[Math.floor(random() * list.length)];

// How close a seat is to going out (lower = closer).
function margin(game, m) {
  const s = game.players[m];
  return Math.min(s.grit - s.buzz, s.grit, s.gold * 2);
}

function effectValue(def, game, mark, target) {
  let v = 0;
  for (const e of def.effects || []) {
    const n = Number(e.n) || 0;
    const who = e.who || "target";
    const many = who === "others" ? Math.max(1, living(game).length - 1) : 1;
    switch (e.op) {
      case "grit": v += who === "self" ? n * 0.8 : -n * 1.2 * many; break;
      case "buzz": v += who === "self" ? -n : n * many; break;
      case "gold": v += who === "self" ? n : -n * 0.6 * many; break;
      case "steal": v += n * 1.4; break;
      case "collect": v += n * many; break;
      case "draw": v += who === "self" ? n * 0.7 : 0; break;
      case "order": v += 1.5 * (n || 1); break;
      case "gamble": v += game.players[mark].gold >= 4 ? 1.5 : -1; break;
      case "extra_action": v += 1.2; break;
      default: v += 0.3;
    }
  }
  if (target && isLiving(game, target)) v += Math.max(0, 8 - margin(game, target)) * 0.15;
  return v;
}

// Weakest opponent to finish (smart) or a random one (Sprout).
function chooseTarget(game, mark, targets, level) {
  if (!targets.length) return null;
  if (level <= 1) return pick(targets);
  return [...targets].sort((a, b) => margin(game, a) - margin(game, b) || (game.players[b].gold - game.players[a].gold))[0];
}

export function botPickCharacter(available) {
  return available.length ? pick(available) : null;
}

export function botDiscard(game, mark, level) {
  const max = discardLimit(game, mark);
  if (!max) return [];
  const hand = game.players[mark].hand;
  const scored = hand.map((c) => {
    const d = cardDef(c.id) || {};
    let keep = d.kind === "reaction" ? 3 : d.kind === "action" ? 2.5 : d.kind === "gamble" ? (game.gamble ? 2 : 1.2) : 1;
    if (level <= 1) keep = random() * 3;
    return { uid: c.uid, keep };
  }).sort((a, b) => a.keep - b.keep);
  const n = level <= 1 ? Math.floor(random() * 2) : Math.min(max, scored.filter((s) => s.keep < 1.6).length);
  return scored.slice(0, Math.min(max, n)).map((s) => s.uid);
}

export function botAction(game, mark, level) {
  const playable = playableFor(game, mark);
  let best = null;
  Object.keys(playable).forEach((uid) => {
    const card = game.players[mark].hand.find((c) => c.uid === uid);
    const def = card && cardDef(card.id);
    if (!def || def.kind !== "action") return;
    const targets = playable[uid];
    const target = targets.length ? chooseTarget(game, mark, targets, level) : null;
    let v = effectValue(def, game, mark, target) + (def.free ? 1 : 0);
    if (level <= 1) v = random() * 4;
    if (!best || v > best.v) best = { uid, target, v };
  });
  return best && best.v > 0 ? { uid: best.uid, target: best.target } : null;
}

export function botOrder(game, mark, level) {
  const targets = orderTargets(game, mark);
  if (!targets.length) return null;
  const target = chooseTarget(game, mark, targets, level);
  const playable = playableFor(game, mark);
  const spikes = Object.keys(playable).filter((uid) => {
    const c = game.players[mark].hand.find((h) => h.uid === uid);
    return c && (cardDef(c.id) || {}).kind === "spike";
  });
  const useSpike = spikes.length && (level >= 3 || random() < 0.5);
  return { target, spike: useSpike ? spikes[0] : null };
}

// Expected harm of the top item to `mark` (positive = bad for me).
function harmToMe(game, mark, top) {
  const def = top.kind === "drink" ? drinkDef(top.card) : cardDef(top.card);
  if (!def) return 0;
  let h = 0;
  const hitsMe = top.target === mark || top.kind === "drink" && def.house;
  for (const e of def.effects || []) {
    const n = Number(e.n) || 0;
    const who = e.who || "target";
    const onMe = (who === "target" && hitsMe) || who === "all" || (who === "others" && top.by !== mark);
    if (!onMe) continue;
    if (e.op === "grit" && n < 0) h += -n;
    if (e.op === "buzz" && n > 0) h += n * (top.kind === "drink" ? 1.2 : 1);
    if (e.op === "gold" && n < 0) h += -n * 0.6;
    if (e.op === "steal") h += n;
    if (e.op === "collect") h += n;
    if (e.op === "grit" && n > 0) h -= n;
    if (e.op === "buzz" && n < 0) h += n;
  }
  if (top.kind === "drink" && hitsMe) h += (top.spikes || []).length;
  const s = game.players[mark];
  const danger = s.grit - s.buzz <= 4 || s.grit <= 5 ? 2 : 1;
  return h * danger;
}

// Decide a window response: { uid, target } or null (pass).
export function botReact(game, mark, level) {
  const playable = playableFor(game, mark);
  const uids = Object.keys(playable);
  if (!uids.length) return null;
  const top = topItem(game);
  const hand = game.players[mark].hand;
  const defOf = (uid) => cardDef((hand.find((c) => c.uid === uid) || {}).id) || {};
  const chance = [0, 0.35, 0.6, 0.85, 0.95][level] || 0.6;
  if (!top) {
    // Gamble call: take the lead when the pot is worth it.
    const pot = game.gamble ? game.gamble.pot : 0;
    if (pot >= 2 && random() < chance) return { uid: pick(uids), target: null };
    return null;
  }
  let harm = 0;
  if (top.kind === "reaction") {
    // Someone answered something: counter it if it was aimed at my card.
    const beneath = game.window.stack[game.window.stack.length - 2];
    harm = beneath && beneath.by === mark ? 3 : 0;
  } else if (top.kind === "gamble") {
    harm = game.gamble && game.gamble.leader === mark ? Math.min(4, game.gamble.pot / 2) : 0;
  } else {
    harm = harmToMe(game, mark, top);
  }
  const threshold = level >= 4 ? 2.5 : level >= 3 ? 2 : 1;
  if (harm < threshold || random() > chance) {
    // Free value: a pure self-gain reaction is worth playing now and then.
    const freebie = uids.find((uid) => (defOf(uid).effects || []).every((e) => e.who === "self" && ["gold", "grit", "draw"].includes(e.op)));
    if (freebie && level >= 2 && random() < 0.25) return { uid: freebie, target: null };
    return null;
  }
  // Prefer the cheapest answer: soften < redirect/reflect < negate.
  const rank = (uid) => {
    const ops = (defOf(uid).effects || []).map((e) => e.op);
    if (ops.includes("soften")) return 1;
    if (ops.includes("redirect") || ops.includes("reflect")) return 2;
    if (ops.includes("negate")) return 3;
    return 4;
  };
  const choice = [...uids].sort((a, b) => rank(a) - rank(b))[0];
  const targets = playable[choice];
  return { uid: choice, target: targets.length ? chooseTarget(game, mark, targets, level) : null };
}
