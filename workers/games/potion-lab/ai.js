// Potion Lab bot. Pure heuristic drafter — it runs the SAME pick path a human
// commits (returns { cards: [id...], useWizard }); the rules module resolves it.
// No bot-only shortcuts, no free resources, no hidden info: it reads only what
// any seat can see — every cauldron's collected pile (public) and its own hand.
// Kept dependency-free of rules.js so the rules → ai import stays one-directional.
//
// Four strength tiers (seat.level): SPROUT 1, BUDDY 2, CIPHER 3, OVERLORD 4.
//   OVERLORD — full table awareness: marginal self-value, PLUS majority contests
//     (Moon Dust each round, Ice at game end) valued by whether a card takes or
//     defends a lead, PLUS denial — a card it keeps is a card it never passes to
//     the neighbour downstream, so it weighs how much that card would have helped
//     the seat it feeds.
//   CIPHER / BUDDY — the Overlord policy with rare / frequent mistakes.
//   SPROUT — a spaz: mostly random, sometimes fixated on one pet ingredient.

const HERB_TIERS = [0, 1, 3, 6, 10, 15];
const PET_TYPES = ["moondust", "frog", "herb", "potion", "mushroom"];

function countType(coll, type) { return coll.filter((c) => c.type === type).length; }
function moonOf(coll) { return coll.reduce((s, c) => s + (c.type === "moondust" ? c.icons : 0), 0); }
function iceOf(coll) { return countType(coll, "ice"); }

// Marginal value of adding `card` to a `coll` (used both for self and, for
// denial, for the downstream seat).
function marginal(card, coll, early) {
  switch (card.type) {
    case "frog": { const r = countType(coll, "frog") % 3; return r === 2 ? 10 : r === 1 ? 4 : 2.5; }
    case "mushroom": return countType(coll, "mushroom") % 2 === 1 ? 5 : 2.2;
    case "herb": { const c = Math.min(countType(coll, "herb"), 5); return (HERB_TIERS[Math.min(c + 1, 5)] - HERB_TIERS[c]) + 0.5; }
    case "moondust": return card.icons * 1.6;
    case "potion": {
      const unusedFire = countType(coll, "fire") - countType(coll, "potion");
      return unusedFire > 0 ? card.val * 3 : card.val;
    }
    case "fire": return early ? 4.5 : 1.5;
    case "ice": return 2.2;
    case "wizard": return early ? 2.8 : 1.0;
    default: return 1;
  }
}

// Overlord's fuller valuation, gated by level for the awareness pieces.
function cardValue(card, ctx, level) {
  let v = marginal(card, ctx.myColl, ctx.early);

  // Moon Dust — round-end majority (Cipher/Overlord contest it).
  if (card.type === "moondust" && level >= 3) {
    const after = ctx.myMoon + card.icons;
    if (after > ctx.oppMoonBest && ctx.myMoon <= ctx.oppMoonBest) v += 3;      // seizes the lead
    else if (ctx.myMoon >= ctx.oppMoonBest) v += 1.2;                          // defends/extends
  }
  // Ice — end-of-game majority; matters more each round.
  if (card.type === "ice") {
    v = 1.6 * (1 + (ctx.round - 1) * 0.8); // ~1.6 / 2.9 / 4.2 across rounds 1-3
    if (level >= 3) {
      if (ctx.myIce + 1 > ctx.oppIceBest && ctx.myIce <= ctx.oppIceBest) v += 2.5; // grab the ice lead
      if (ctx.n > 2 && ctx.myIce <= ctx.iceFloor) v += 1.6;                        // climb out of the −6 basement
    }
  }
  // Denial — keeping this card robs the neighbour it would have been passed to.
  if (level >= 2 && ctx.downstreamColl) {
    const weight = level >= 4 ? 0.4 : level === 3 ? 0.28 : 0.12;
    v += marginal(card, ctx.downstreamColl, ctx.early) * weight;
  }
  return v;
}

function wizardWanted(level, ranked, rng) {
  const second = ranked.length >= 2 ? ranked[1].v : 0;
  if (level >= 4) return second >= 4.5;
  if (level === 3) return second >= 5;
  if (level === 2) return second >= 6 && rng() < 0.6;
  return rng() < 0.12; // Sprout casts on a whim
}

export function choosePotionLabPick(game, mark, rng = Math.random) {
  const seat = game.players[mark];
  if (!seat || !seat.hand.length) return { cards: [], useWizard: false };
  const hand = seat.hand;
  const level = Number.isInteger(seat.level) && seat.level >= 1 ? seat.level : 2;
  const single = (card) => ({ cards: [card.id], useWizard: false });

  // ---- SPROUT: a spaz — mostly random, sometimes fixated on a pet type ----
  if (level <= 1) {
    if (rng() < 0.55) return single(hand[Math.floor(rng() * hand.length)]);
    const pet = PET_TYPES[(String(mark).charCodeAt(String(mark).length - 1) || 0) % PET_TYPES.length];
    return single(hand.find((c) => c.type === pet) || hand[Math.floor(rng() * hand.length)]);
  }

  // ---- shared table awareness (public info only) ----
  const order = game.seat_order;
  const n = order.length;
  const myIdx = order.indexOf(mark);
  const passDir = game.pass_dir === -1 ? -1 : 1;
  const downstream = n > 1 ? game.players[order[(myIdx + passDir + n * 10) % n]] : null;
  const oppMoons = order.filter((m) => m !== mark).map((m) => moonOf(game.players[m].collected));
  const oppIces = order.filter((m) => m !== mark).map((m) => iceOf(game.players[m].collected));
  const allIces = order.map((m) => iceOf(game.players[m].collected));
  const ctx = {
    myColl: seat.collected,
    downstreamColl: downstream ? downstream.collected : null,
    early: game.pick < Math.floor(game.hand_size / 2),
    round: game.round, n,
    myMoon: moonOf(seat.collected), oppMoonBest: oppMoons.length ? Math.max(...oppMoons) : 0,
    myIce: iceOf(seat.collected), oppIceBest: oppIces.length ? Math.max(...oppIces) : 0,
    iceFloor: Math.min(...allIces),
  };

  const ranked = hand
    .map((c) => ({ id: c.id, card: c, v: cardValue(c, ctx, level) + rng() * 0.001 }))
    .sort((a, b) => b.v - a.v);

  // Wizard: keep the two best (a low tier may fumble the second pick).
  if (seat.wizards > 0 && hand.length >= 2 && wizardWanted(level, ranked, rng)) {
    let second = 1;
    if (level <= 2 && ranked.length >= 3 && rng() < 0.3) second = 2;
    return { cards: [ranked[0].id, ranked[second].id], useWizard: true };
  }

  // Single pick, with a tier-scaled chance of taking a near-best instead of best.
  const mistake = level >= 4 ? 0 : level === 3 ? 0.13 : 0.33;
  let idx = 0;
  if (ranked.length > 1 && rng() < mistake) idx = 1 + Math.floor(rng() * Math.min(2, ranked.length - 1));
  return single(ranked[Math.min(idx, ranked.length - 1)].card);
}
