// Last Orders — "harbor" expansion rules data (PLAN.md §2). Pure data, no imports.
// Display text lives in src/sogotable/static/games/last-orders/content.js.

const ANY = ["action", "drink", "gamble", "reaction"];

export const HARBOR_PACK = {
  id: "harbor",
  characters: [
    {
      id: "harbor:marrow",
      pack: "harbor",
      trait: { start_gold: 2 },
      deck: [
        { id: "harbor:marrow:next-ones-on-me", kind: "action", copies: 3, target: "opponent", effects: [{ op: "order", n: 1 }] },
        { id: "harbor:marrow:keelhaul", kind: "action", copies: 1, target: "opponent", effects: [{ op: "grit", who: "target", n: -3 }] },
        { id: "harbor:marrow:cutlass-swipe", kind: "action", copies: 3, target: "opponent", effects: [{ op: "grit", who: "target", n: -2 }] },
        { id: "harbor:marrow:buried-treasure", kind: "action", copies: 1, target: "none", effects: [{ op: "gold", who: "self", n: 2 }] },
        { id: "harbor:marrow:harbor-toll", kind: "action", copies: 1, target: "none", effects: [{ op: "collect", n: 1 }] },
        { id: "harbor:marrow:rum-ration", kind: "action", copies: 2, target: "none", free: true, effects: [{ op: "grit", who: "self", n: 1 }, { op: "buzz", who: "self", n: -1 }] },
        { id: "harbor:marrow:wager-at-sea", kind: "action", copies: 3, target: "none", effects: [{ op: "gamble" }] },
        { id: "harbor:marrow:all-hands", kind: "reaction", copies: 2, target: "none", answers: ANY, needs: "any", effects: [{ op: "negate" }] },
        { id: "harbor:marrow:over-the-rail", kind: "reaction", copies: 3, target: "none", answers: ["drink"], needs: "targeted", effects: [{ op: "negate" }] },
        { id: "harbor:marrow:batten-down", kind: "reaction", copies: 2, target: "none", answers: ["action", "drink"], needs: "targeted", effects: [{ op: "soften", n: 2 }] },
        { id: "harbor:marrow:belay-that", kind: "reaction", copies: 2, target: "none", answers: ["action"], needs: "targeted", effects: [{ op: "negate" }] },
        { id: "harbor:marrow:captains-call", kind: "gamble", copies: 3, effects: [{ op: "take_lead" }] },
        { id: "harbor:marrow:raise-the-anchor", kind: "gamble", copies: 2, effects: [{ op: "raise", n: 1 }] },
        { id: "harbor:marrow:splash-of-brine", kind: "spike", copies: 1, effects: [{ op: "buzz", who: "target", n: 1 }] },
        { id: "harbor:marrow:sailors-measure", kind: "spike", copies: 2, effects: [{ op: "buzz", who: "target", n: 2 }] },
      ],
    },
    {
      id: "harbor:nessa",
      pack: "harbor",
      trait: { hand_size: 1, start_gold: -1 },
      deck: [
        { id: "harbor:nessa:siren-shanty", kind: "action", copies: 2, target: "none", effects: [{ op: "buzz", who: "others", n: 1 }] },
        { id: "harbor:nessa:undertow", kind: "action", copies: 3, target: "opponent", effects: [{ op: "buzz", who: "target", n: 2 }] },
        { id: "harbor:nessa:seashell-lullaby", kind: "action", copies: 1, target: "none", effects: [{ op: "buzz", who: "self", n: -2 }] },
        { id: "harbor:nessa:turn-the-tide", kind: "action", copies: 2, target: "opponent", effects: [{ op: "buzz", who: "self", n: -1 }, { op: "buzz", who: "target", n: 1 }] },
        { id: "harbor:nessa:salt-spray", kind: "action", copies: 4, target: "opponent", effects: [{ op: "grit", who: "target", n: -2 }] },
        { id: "harbor:nessa:pearl-wager", kind: "action", copies: 3, target: "none", effects: [{ op: "gamble" }] },
        { id: "harbor:nessa:tidal-mist", kind: "reaction", copies: 2, target: "opponent", answers: ["drink"], needs: "targeted", effects: [{ op: "redirect" }] },
        { id: "harbor:nessa:riptide", kind: "reaction", copies: 2, target: "none", answers: ["action"], needs: "targeted", effects: [{ op: "negate" }] },
        { id: "harbor:nessa:foam-and-fizzle", kind: "reaction", copies: 1, target: "none", answers: ["drink"], needs: "targeted", effects: [{ op: "soften", n: 2 }] },
        { id: "harbor:nessa:oceans-hush", kind: "reaction", copies: 2, target: "none", answers: ANY, needs: "any", effects: [{ op: "negate" }] },
        { id: "harbor:nessa:shell-game", kind: "gamble", copies: 3, effects: [{ op: "take_lead" }] },
        { id: "harbor:nessa:high-tide", kind: "gamble", copies: 1, effects: [{ op: "raise", n: 1 }] },
        { id: "harbor:nessa:kelp-garnish", kind: "spike", copies: 2, effects: [{ op: "buzz", who: "target", n: 1 }] },
        { id: "harbor:nessa:mermaid-kiss", kind: "spike", copies: 2, effects: [{ op: "buzz", who: "target", n: 2 }] },
      ],
    },
  ],
  drinks: [
    { id: "harbor:drink:ships-grog", copies: 2, effects: [{ op: "buzz", who: "target", n: 2 }] },
    { id: "harbor:drink:bilge-water", copies: 1, effects: [{ op: "buzz", who: "target", n: -1 }, { op: "grit", who: "target", n: -1 }] },
    { id: "harbor:drink:squid-ink-stout", copies: 1, effects: [{ op: "buzz", who: "target", n: 3 }] },
    { id: "harbor:drink:farewell-shanty", copies: 1, house: true, effects: [{ op: "buzz", who: "target", n: 1 }] },
    { id: "harbor:drink:seafoam-tea", copies: 1, effects: [{ op: "buzz", who: "target", n: -1 }] },
  ],
  events: [],
};
