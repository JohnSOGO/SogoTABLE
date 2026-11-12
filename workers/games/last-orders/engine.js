// Last Orders — the rules core: seat math, effect application, the reaction
// stack, drinks, gambling and elimination. Pure functions over the plain game
// blob; the flow (turns, windows, bots, timing) lives in ./rules.js.
import { cardDef, drinkDef, eventDef, characterDef } from "./catalog.js";

export const BASE = Object.freeze({ grit: 20, gold: 10, buzz: 0, hand: 7, discard: 3 });
export const EVENT_CAP = 60;
const CHASER_CAP = 3;

let rng = Math.random;
export function setEngineRandom(fn) {
  rng = typeof fn === "function" ? fn : Math.random;
}
export function random() {
  return rng();
}
export function shuffle(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// ---------- seats ----------

export const living = (game) => game.seat_order.filter((m) => game.players[m] && !game.players[m].out);
export const isLiving = (game, mark) => Boolean(mark && game.players[mark] && !game.players[mark].out);
export const isBotLike = (seat) => Boolean(seat && (seat.is_bot || seat.auto));

export function traitOf(seat) {
  const ch = seat && seat.character ? characterDef(seat.character) : null;
  const t = (ch && ch.trait) || {};
  const num = (k) => (Number.isFinite(Number(t[k])) ? Math.trunc(Number(t[k])) : 0);
  return {
    start_grit: num("start_grit"), start_gold: num("start_gold"), start_buzz: num("start_buzz"),
    hand_size: num("hand_size"), drink_buzz_mod: num("drink_buzz_mod"), damage_bonus: num("damage_bonus"),
    pot_bonus: num("pot_bonus"), draw_bonus: num("draw_bonus"),
  };
}
export const handSize = (seat) => Math.max(3, BASE.hand + traitOf(seat).hand_size);
export const maxGrit = (seat) => Math.max(1, BASE.grit + traitOf(seat).start_grit);
export const discardMax = (seat) => Math.max(0, BASE.discard + traitOf(seat).draw_bonus);

export function pushEvent(game, event) {
  const last = game.events[game.events.length - 1];
  game.events.push({ seq: last ? last.seq + 1 : 1, round: game.round, ...event });
  if (game.events.length > EVENT_CAP) game.events.splice(0, game.events.length - EVENT_CAP);
}

export function nextUid(game) {
  game.uid_seq = (Number(game.uid_seq) || 0) + 1;
  return `c${game.uid_seq}`;
}

// ---------- cards ----------

export function drawCards(game, mark, n) {
  const seat = game.players[mark];
  let drawn = 0;
  for (let i = 0; i < n; i += 1) {
    if (!seat.deck.length) {
      if (!seat.discard.length) break;
      seat.deck = shuffle(seat.discard.splice(0));
    }
    seat.hand.push({ uid: nextUid(game), id: seat.deck.shift() });
    drawn += 1;
  }
  return drawn;
}

export function takeFromHand(seat, uid) {
  const i = seat.hand.findIndex((c) => c.uid === uid);
  if (i < 0) return null;
  return seat.hand.splice(i, 1)[0];
}

export function nextDrink(game) {
  if (!game.drink_deck.length) {
    if (!game.drink_discard.length) return null;
    game.drink_deck = shuffle(game.drink_discard.splice(0));
  }
  return game.drink_deck.shift();
}

export function flipEvent(game) {
  if (!game.event_deck.length && !game.event_discard.length) { game.event = null; return null; }
  if (game.event) game.event_discard.push(game.event);
  if (!game.event_deck.length) game.event_deck = shuffle(game.event_discard.splice(0));
  game.event = game.event_deck.shift();
  pushEvent(game, { type: "event_flip", event: game.event });
  const def = eventDef(game.event);
  if (def && Array.isArray(def.on_flip) && def.on_flip.length) {
    const marks = living(game);
    def.on_flip.forEach((eff) => marks.forEach((m) => applyOne(game, { ...eff, who: "self" }, m, null, { source: game.event })));
  }
  return game.event;
}

export function eventMods(game) {
  const def = game.event ? eventDef(game.event) : null;
  const m = (def && def.mods) || {};
  const num = (k) => (Number.isFinite(Number(m[k])) ? Math.trunc(Number(m[k])) : 0);
  return { drink_buzz: num("drink_buzz"), ante: num("ante"), damage: num("damage") };
}

export function escalation(game) {
  if (!game.options.closing_time) return 0;
  return Math.max(0, Math.floor((game.round - 4) / 4));
}

// ---------- effects ----------

function recipients(game, who, actor, target) {
  const alive = living(game);
  switch (who) {
    case "self": return actor && alive.includes(actor) ? [actor] : [];
    case "target": return target && alive.includes(target) ? [target] : [];
    case "others": return alive.filter((m) => m !== actor);
    case "all": return alive;
    default: return target && alive.includes(target) ? [target] : [];
  }
}

// ctx: { item, drink: bool, source }
function applyOne(game, eff, actor, target, ctx = {}) {
  const n = Math.trunc(Number(eff.n) || 0);
  const item = ctx.item || null;
  const softenFor = (m) => (item && item.soften && item.target === m ? item.soften : 0);
  const source = ctx.source || (item ? item.card : null);
  switch (eff.op) {
    case "grit": {
      recipients(game, eff.who, actor, target).forEach((m) => {
        const seat = game.players[m];
        if (n < 0) {
          let dmg = -n;
          if (!ctx.drink && !ctx.spike && actor && game.players[actor]) dmg += traitOf(game.players[actor]).damage_bonus + eventMods(game).damage;
          dmg = Math.max(0, dmg - softenFor(m));
          if (!dmg) return;
          seat.grit = Math.max(0, seat.grit - dmg);
          pushEvent(game, { type: "grit", mark: m, n: -dmg, by: actor, source });
        } else if (n > 0) {
          const before = seat.grit;
          seat.grit = Math.min(maxGrit(seat), seat.grit + n);
          if (seat.grit !== before) pushEvent(game, { type: "grit", mark: m, n: seat.grit - before, by: actor, source });
        }
      });
      return;
    }
    case "buzz": {
      recipients(game, eff.who, actor, target).forEach((m) => {
        const seat = game.players[m];
        let d = n;
        if (d > 0 && ctx.drink) d = Math.max(0, d + traitOf(seat).drink_buzz_mod + eventMods(game).drink_buzz + escalation(game));
        if (d > 0) d = Math.max(0, d - softenFor(m));
        const before = seat.buzz;
        seat.buzz = Math.max(0, seat.buzz + d);
        if (seat.buzz !== before) pushEvent(game, { type: "buzz", mark: m, n: seat.buzz - before, by: actor, source });
      });
      return;
    }
    case "gold": {
      recipients(game, eff.who, actor, target).forEach((m) => {
        const seat = game.players[m];
        const before = seat.gold;
        seat.gold = Math.max(0, seat.gold + n);
        if (seat.gold !== before) pushEvent(game, { type: "gold", mark: m, n: seat.gold - before, by: actor, source });
      });
      return;
    }
    case "steal":
      if (actor && isLiving(game, actor) && isLiving(game, target) && target !== actor) transfer(game, target, actor, n, source);
      return;
    case "collect":
      if (actor && isLiving(game, actor)) living(game).filter((m) => m !== actor).forEach((m) => transfer(game, m, actor, n, source));
      return;
    case "draw":
      recipients(game, eff.who, actor, target).forEach((m) => {
        const got = drawCards(game, m, Math.max(0, Math.min(5, n)));
        if (got) pushEvent(game, { type: "draw", mark: m, n: got, source });
      });
      return;
    case "order": {
      if (!isLiving(game, target)) return;
      const count = Math.max(1, Math.min(3, n || 1));
      for (let i = 0; i < count; i += 1) {
        const drink = nextDrink(game);
        if (!drink) break;
        game.players[target].line.push({ drink, spikes: [], by: actor || null });
        pushEvent(game, { type: "order", mark: target, by: actor, source });
      }
      return;
    }
    case "gamble":
      if (actor) game.pending_gamble = actor;
      return;
    case "extra_action":
      if (game.turn && game.turn.mark === actor) game.turn.actions_left += 1;
      return;
    default:
  }
}

function transfer(game, from, to, n, source) {
  const amt = Math.max(0, Math.min(n, game.players[from].gold));
  if (!amt) return;
  game.players[from].gold -= amt;
  game.players[to].gold += amt;
  pushEvent(game, { type: "gold", mark: from, n: -amt, by: to, source });
  pushEvent(game, { type: "gold", mark: to, n: amt, by: to, source });
}

export function applyEffects(game, effects, actor, target, ctx) {
  (effects || []).forEach((eff) => applyOne(game, eff, actor, target, ctx));
}

// ---------- the stack ----------

const MODIFIERS = new Set(["negate", "redirect", "reflect", "soften"]);

export function itemDef(item) {
  if (!item) return null;
  return item.kind === "drink" ? drinkDef(item.card) : cardDef(item.card);
}

// A negate / redirect / reflect cannot touch an unstoppable action or an
// unrefusable drink.
export function isLocked(item) {
  const def = itemDef(item);
  return Boolean(def && (def.unstoppable || def.unrefusable));
}

// Resolve top-down: each reaction acts on the nearest live item beneath it,
// then the base item (bottom) resolves. Returns the base item (or null).
export function resolveStack(game) {
  const stack = game.reaction.stack;
  for (let i = stack.length - 1; i >= 1; i -= 1) {
    const it = stack[i];
    if (it.canceled) continue;
    const def = cardDef(it.card) || { effects: [] };
    let beneath = null;
    for (let j = i - 1; j >= 0; j -= 1) if (!stack[j].canceled) { beneath = stack[j]; break; }
    pushEvent(game, { type: "resolve", mark: it.by, card: it.card, kind: it.kind });
    for (const eff of def.effects || []) {
      if (!MODIFIERS.has(eff.op)) { applyOne(game, eff, it.by, it.target, { item: it }); continue; }
      if (!beneath) continue;
      if (eff.op === "negate" && !isLocked(beneath)) {
        beneath.canceled = true;
        pushEvent(game, { type: "negated", uid: beneath.uid, mark: beneath.by, card: beneath.card, kind: beneath.kind, by: it.by, target: beneath.target });
      } else if (eff.op === "redirect" && !isLocked(beneath) && isLiving(game, it.target) && beneath.target) {
        pushEvent(game, { type: "redirect", from: beneath.target, to: it.target, card: beneath.card, by: it.by });
        beneath.target = it.target;
      } else if (eff.op === "reflect" && !isLocked(beneath) && beneath.by && beneath.target && isLiving(game, beneath.by)) {
        pushEvent(game, { type: "redirect", from: beneath.target, to: beneath.by, card: beneath.card, by: it.by });
        beneath.target = beneath.by;
      } else if (eff.op === "soften") {
        beneath.soften = (beneath.soften || 0) + Math.max(0, Math.trunc(Number(eff.n) || 0));
      }
    }
  }
  const base = stack[0] || null;
  if (!base) return null;
  if (base.canceled) return base;
  if (base.kind === "drink") resolveDrink(game, base);
  else if (base.kind === "gamble") resolveGamblePlay(game, base);
  else {
    const def = cardDef(base.card) || { effects: [] };
    pushEvent(game, { type: "resolve", mark: base.by, card: base.card, kind: base.kind, target: base.target });
    applyEffects(game, def.effects, base.by, base.target, { item: base });
  }
  return base;
}

function resolveDrink(game, item) {
  const def = drinkDef(item.card) || { effects: [] };
  const drinkers = def.house ? living(game) : [item.target].filter((m) => isLiving(game, m));
  pushEvent(game, { type: "drink", mark: item.target, drink: item.card, spikes: item.spikes || [], by: item.by, house: Boolean(def.house) });
  drinkers.forEach((m) => {
    const it = m === item.target ? item : { ...item, target: m, soften: 0 };
    applyEffects(game, def.effects, m, m, { item: it, drink: true, source: item.card });
  });
  if (isLiving(game, item.target)) {
    (item.spikes || []).forEach((spikeId) => {
      const sd = cardDef(spikeId);
      if (sd) applyEffects(game, sd.effects, item.target, item.target, { item, spike: true, source: spikeId });
    });
  }
  if (def.chaser && (item.chain || 0) < CHASER_CAP && isLiving(game, item.target)) {
    game.pending_chaser = { target: item.target, chain: (item.chain || 0) + 1 };
  }
}

// ---------- gambling ----------

export function startGamble(game, leader) {
  const ante = Math.max(1, 1 + eventMods(game).ante);
  const marks = living(game);
  let pot = 0;
  marks.forEach((m) => {
    const pay = Math.min(ante, game.players[m].gold);
    game.players[m].gold -= pay;
    pot += pay;
  });
  game.gamble = { leader, pot, in: marks };
  pushEvent(game, { type: "gamble_start", mark: leader, pot, ante });
}

function resolveGamblePlay(game, item) {
  const g = game.gamble;
  if (!g || !isLiving(game, item.by)) return;
  const def = cardDef(item.card) || { effects: [] };
  pushEvent(game, { type: "resolve", mark: item.by, card: item.card, kind: "gamble" });
  for (const eff of def.effects || []) {
    if (eff.op === "raise") {
      const n = Math.max(1, Math.trunc(Number(eff.n) || 1));
      g.in.filter((m) => isLiving(game, m)).forEach((m) => {
        const pay = Math.min(n, game.players[m].gold);
        game.players[m].gold -= pay;
        g.pot += pay;
      });
      g.leader = item.by;
    } else if (eff.op === "take_lead") {
      g.leader = item.by;
    } else {
      applyOne(game, eff, item.by, item.target, { item });
    }
  }
  pushEvent(game, { type: "gamble_lead", mark: g.leader, pot: g.pot });
}

export function finishGamble(game) {
  const g = game.gamble;
  game.gamble = null;
  if (!g) return;
  const winner = isLiving(game, g.leader) ? g.leader : g.in.find((m) => isLiving(game, m));
  if (!winner) return;
  const bonus = Math.max(0, traitOf(game.players[winner]).pot_bonus);
  game.players[winner].gold += g.pot + bonus;
  pushEvent(game, { type: "gamble_win", mark: winner, pot: g.pot + bonus });
}

// ---------- elimination + victory ----------

export function checkOuts(game) {
  const newlyOut = [];
  living(game).forEach((m) => {
    const seat = game.players[m];
    let why = null;
    if (seat.grit <= 0) why = "knocked_out";
    else if (seat.buzz >= seat.grit) why = "passed_out";
    else if (seat.gold <= 0 && !game.gamble) why = "broke";
    if (!why) return;
    newlyOut.push(m);
    seat.out = why;
  });
  if (!newlyOut.length) return newlyOut;
  const standing = living(game);
  newlyOut.forEach((m) => {
    const seat = game.players[m];
    game.out_seq = (Number(game.out_seq) || 0) + 1;
    seat.out_order = game.out_seq;
    seat.discard.push(...seat.hand.map((c) => c.id));
    seat.hand = [];
    seat.line.forEach((d) => game.drink_discard.push(d.drink));
    seat.line = [];
    seat.auto = false;
    pushEvent(game, { type: "out", mark: m, why: seat.out });
  });
  if (standing.length <= 1) {
    const winner = standing[0] || pickTiebreak(game, newlyOut);
    completeGame(game, winner);
  }
  return newlyOut;
}

function pickTiebreak(game, marks) {
  return [...marks].sort((a, b) => {
    const A = game.players[a];
    const B = game.players[b];
    return (B.gold - A.gold) || ((B.grit - B.buzz) - (A.grit - A.buzz)) || (game.seat_order.indexOf(a) - game.seat_order.indexOf(b));
  })[0] || null;
}

export function completeGame(game, winner) {
  game.status = "complete";
  game.winner = winner || null;
  game.reaction = null;
  game.gamble = null;
  if (game.turn) game.turn.act_at = 0;
  const order = [...game.seat_order].sort((a, b) => {
    if (a === winner) return -1;
    if (b === winner) return 1;
    return (game.players[b].out_order || 0) - (game.players[a].out_order || 0);
  });
  game.results = order.map((m, i) => ({
    mark: m, place: i + 1, character: game.players[m].character,
    gold: game.players[m].gold, grit: game.players[m].grit, buzz: game.players[m].buzz, out: game.players[m].out,
  }));
  pushEvent(game, { type: "win", mark: winner });
}
