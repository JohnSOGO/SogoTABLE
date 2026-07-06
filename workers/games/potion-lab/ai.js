// Potion Lab bot. Pure heuristic drafter — it runs the SAME pick path a human
// commits (returns { cards: [id...], useWizard }); the rules module resolves it.
// No bot-only shortcuts, no free resources. Kept dependency-free of rules.js so
// the rules → ai import stays one-directional.

// Marginal value of adding `card` to a seat's current `collected`.
function marginal(card, collected, early) {
  const count = (t) => collected.filter((c) => c.type === t).length;
  switch (card.type) {
    case "frog": {
      const r = count("frog") % 3; // completing a set of 3 is huge
      return r === 2 ? 10 : r === 1 ? 4 : 2.5;
    }
    case "mushroom":
      return count("mushroom") % 2 === 1 ? 5 : 2.2; // odd -> completes a pair
    case "herb": {
      const tiers = [0, 1, 3, 6, 10, 15];
      const c = Math.min(count("herb"), 5);
      return (tiers[Math.min(c + 1, 5)] - tiers[c]) + 0.5;
    }
    case "moondust":
      return card.icons * 1.6; // majority; weight by icons
    case "potion": {
      const unusedFire = collected.filter((c) => c.type === "fire").length -
        collected.filter((c) => c.type === "potion").length;
      return unusedFire > 0 ? card.val * 3 : card.val;
    }
    case "fire":
      return early ? 4.5 : 1.5; // only pays off with a later potion
    case "ice":
      return 2.2; // slow-burn end-game majority
    case "wizard":
      return early ? 2.8 : 1.0; // flexibility, front-loaded
    default:
      return 1;
  }
}

// Choose a pick for `mark`. May cast a Wizard to draft the two best cards.
export function choosePotionLabPick(game, mark, rng = Math.random) {
  const seat = game.players[mark];
  if (!seat || !seat.hand.length) return { cards: [], useWizard: false };
  const early = game.pick < Math.floor(game.hand_size / 2);
  const ranked = seat.hand
    .map((c) => ({ id: c.id, v: marginal(c, seat.collected, early) + rng() * 0.01 }))
    .sort((a, b) => b.v - a.v);
  if (seat.wizards > 0 && seat.hand.length >= 2 && ranked.length >= 2 && ranked[1].v >= 4) {
    return { cards: [ranked[0].id, ranked[1].id], useWizard: true };
  }
  return { cards: [ranked[0].id], useWizard: false };
}
