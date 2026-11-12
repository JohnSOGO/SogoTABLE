// Last Orders — what a seat may legally do right now. The ONE place legality
// lives: the move validator, the bots and the projection's `me.playable` all
// ask here, so the UI never decides what can be played.
import { cardDef } from "./catalog.js";
import { living, isLiving, isLocked, discardMax } from "./engine.js";

const opponents = (game, mark) => living(game).filter((m) => m !== mark);

export function topItem(game) {
  const st = game.reaction && game.reaction.stack;
  return st && st.length ? st[st.length - 1] : null;
}

// Marks that may still act in the open window (and so hold it open).
export function windowEligible(game) {
  const w = game.reaction;
  if (!w) return [];
  const top = topItem(game);
  if (w.kind === "gamble" && !top) {
    const g = game.gamble;
    return g ? g.in.filter((m) => isLiving(game, m) && m !== g.leader) : [];
  }
  return living(game).filter((m) => !top || m !== top.by);
}

// Targets a card may take in the current window for `mark`, or null if the
// card cannot be played there. [] means "playable, no target needed".
function windowTargets(game, mark, def) {
  const w = game.reaction;
  const top = topItem(game);
  if (w.kind === "gamble" && !top) {
    const g = game.gamble;
    if (def.kind !== "gamble" || !g || !g.in.includes(mark) || g.leader === mark) return null;
    return [];
  }
  if (!top || def.kind !== "reaction" || top.by === mark) return null;
  const answers = Array.isArray(def.answers) ? def.answers : [];
  if (!answers.includes(top.kind)) return null;
  if (def.needs === "targeted" && top.target !== mark) return null;
  const ops = new Set((def.effects || []).map((e) => e.op));
  if ((ops.has("negate") || ops.has("redirect") || ops.has("reflect")) && isLocked(top)) return null;
  if (ops.has("reflect") && (!top.by || !top.target || top.target === top.by || !isLiving(game, top.by))) return null;
  if (ops.has("soften") && !top.target) return null;
  if (ops.has("redirect")) {
    if (!top.target) return null;
    const t = living(game).filter((m) => m !== mark && m !== top.target);
    return t.length ? t : null;
  }
  return [];
}

function turnTargets(game, mark, def) {
  const t = game.turn;
  if (!t || t.mark !== mark || game.reaction) return null;
  if (t.phase === "action" && def.kind === "action") {
    if (t.actions_left <= 0 && !def.free) return null;
    if (def.target === "opponent") {
      const opp = opponents(game, mark);
      return opp.length ? opp : null;
    }
    return [];
  }
  if (t.phase === "order" && def.kind === "spike") {
    const opp = opponents(game, mark);
    return opp.length ? opp : null;
  }
  return null;
}

// { [uid]: targets[] } for every card `mark` could play right now.
export function playableFor(game, mark) {
  const out = {};
  if (game.status !== "playing" || game.phase !== "play" || !isLiving(game, mark)) return out;
  const seat = game.players[mark];
  const w = game.reaction;
  if (w && w.passed.includes(mark)) return out; // a pass holds until a new card lands on top
  seat.hand.forEach((c) => {
    const def = cardDef(c.id);
    if (!def) return;
    const targets = w ? windowTargets(game, mark, def) : turnTargets(game, mark, def);
    if (targets) out[c.uid] = targets;
  });
  return out;
}

export function canPass(game, mark) {
  const w = game.reaction;
  return Boolean(w && windowEligible(game).includes(mark) && !w.passed.includes(mark));
}

export function orderTargets(game, mark) {
  const t = game.turn;
  if (!t || t.mark !== mark || t.phase !== "order" || game.reaction) return [];
  return opponents(game, mark);
}

export function discardLimit(game, mark) {
  const t = game.turn;
  if (!t || t.mark !== mark || t.phase !== "discard" || game.reaction) return 0;
  return discardMax(game.players[mark]);
}
