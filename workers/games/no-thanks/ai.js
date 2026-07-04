// No Thanks! bot policy — pure decision function, no game mutation. rules.js
// hands it a pre-digested view of the choice (including scoreDelta, the run
// math it would otherwise have to re-derive) and applies the returned action
// through the same take/pass internals a human uses.
//
// The policy is the standard human heuristic: judge the card by its NET cost
// — how much it would really add to your score (a card that extends a run you
// own adds little or nothing) minus the chips riding on it. Take anything
// free or profitable; pay to dodge genuinely expensive cards while chips
// last; loosen up as the chip stack thins so the forced-take cliff (0 chips)
// is approached deliberately instead of hit at the worst moment.

// view: { card, pot, chips, scoreDelta, deckCount, random }
// scoreDelta = how much taking the card changes the bot's card score
// (run-aware, computed by rules.js). Returns { type: "take" | "pass" }.
export function noThanksBotAction(view) {
  const chips = Number(view.chips || 0);
  if (chips <= 0) return { type: "take" }; // no chip, no choice
  const random = typeof view.random === "function" ? view.random : Math.random;
  const netCost = Number(view.scoreDelta || 0) - Number(view.pot || 0);
  if (netCost <= 0) return { type: "take" }; // free points (run extension or a fat pot)
  // Dodging costs a chip, which is a point: rich stacks hold out for a better
  // pot, thin stacks settle earlier. A pinch of randomness keeps a table of
  // bots from milling the same card in lockstep.
  const patience = chips >= 8 ? 2 : chips >= 5 ? 4 : chips >= 3 ? 7 : 11;
  if (netCost <= patience - Math.floor(random() * 3)) return { type: "take" };
  return { type: "pass" };
}
