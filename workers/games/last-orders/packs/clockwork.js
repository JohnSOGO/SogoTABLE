// Last Orders — "clockwork" expansion rules data (PLAN.md §2). Pure data, no imports.
// Display text lives in src/sogotable/static/games/last-orders/content.js.

const ANY = ["action", "drink", "gamble", "reaction"];

export const CLOCKWORK_PACK = {
  id: "clockwork",
  characters: [
    {
      id: "clockwork:sprocket",
      pack: "clockwork",
      trait: { hand_size: 1 },
      deck: [
        { id: "clockwork:sprocket:spring-loaded-glove", kind: "action", copies: 3, target: "opponent", effects: [{ op: "grit", who: "target", n: -3 }, { op: "grit", who: "self", n: -1 }] },
        { id: "clockwork:sprocket:overclock", kind: "action", copies: 2, target: "none", effects: [{ op: "extra_action" }, { op: "draw", who: "self", n: 1 }] },
        { id: "clockwork:sprocket:blueprint-scribble", kind: "action", copies: 2, target: "none", effects: [{ op: "draw", who: "self", n: 2 }] },
        { id: "clockwork:sprocket:boom-bottle", kind: "action", copies: 1, target: "none", effects: [{ op: "grit", who: "others", n: -2 }, { op: "grit", who: "self", n: -1 }] },
        { id: "clockwork:sprocket:coin-magnet", kind: "action", copies: 2, target: "opponent", effects: [{ op: "steal", n: 2 }] },
        { id: "clockwork:sprocket:gizmo-gamble", kind: "action", copies: 3, target: "none", effects: [{ op: "gamble" }] },
        { id: "clockwork:sprocket:pop-up-umbrella", kind: "reaction", copies: 3, target: "none", answers: ["drink"], needs: "targeted", effects: [{ op: "negate" }] },
        { id: "clockwork:sprocket:rocket-boots", kind: "reaction", copies: 2, target: "none", answers: ["action"], needs: "targeted", effects: [{ op: "negate" }] },
        { id: "clockwork:sprocket:bounce-plate", kind: "reaction", copies: 1, target: "none", answers: ["action"], needs: "targeted", effects: [{ op: "reflect" }] },
        { id: "clockwork:sprocket:spanner-in-the-works", kind: "reaction", copies: 3, target: "none", answers: ANY, needs: "any", effects: [{ op: "negate" }] },
        { id: "clockwork:sprocket:rigged-roulette", kind: "gamble", copies: 3, effects: [{ op: "take_lead" }] },
        { id: "clockwork:sprocket:chain-reaction", kind: "gamble", copies: 1, effects: [{ op: "raise", n: 1 }] },
        { id: "clockwork:sprocket:jackpot-o-matic", kind: "gamble", copies: 1, effects: [{ op: "raise", n: 1 }, { op: "grit", who: "self", n: -1 }] },
        { id: "clockwork:sprocket:rocket-fizz", kind: "spike", copies: 2, effects: [{ op: "buzz", who: "target", n: 2 }] },
        { id: "clockwork:sprocket:sparkplug-shot", kind: "spike", copies: 1, effects: [{ op: "buzz", who: "target", n: 1 }, { op: "grit", who: "target", n: -1 }] },
      ],
    },
    {
      id: "clockwork:brassbell",
      pack: "clockwork",
      trait: { start_grit: 3, start_gold: -2 },
      deck: [
        { id: "clockwork:brassbell:piston-punch", kind: "action", copies: 2, target: "opponent", effects: [{ op: "grit", who: "target", n: -4 }] },
        { id: "clockwork:brassbell:clang", kind: "action", copies: 3, target: "opponent", effects: [{ op: "grit", who: "target", n: -2 }] },
        { id: "clockwork:brassbell:polish-the-glasses", kind: "action", copies: 2, target: "none", effects: [{ op: "grit", who: "self", n: 2 }, { op: "buzz", who: "self", n: -1 }] },
        { id: "clockwork:brassbell:overtime-tips", kind: "action", copies: 2, target: "none", effects: [{ op: "gold", who: "self", n: 2 }] },
        { id: "clockwork:brassbell:tip-jar-sweep", kind: "action", copies: 1, target: "none", effects: [{ op: "collect", n: 1 }] },
        { id: "clockwork:brassbell:coin-sorting-routine", kind: "action", copies: 3, target: "none", effects: [{ op: "gamble" }] },
        { id: "clockwork:brassbell:beverage-rejected", kind: "reaction", copies: 2, target: "none", answers: ["drink"], needs: "targeted", effects: [{ op: "negate" }] },
        { id: "clockwork:brassbell:reinforced-plating", kind: "reaction", copies: 2, target: "none", answers: ["action", "drink"], needs: "targeted", effects: [{ op: "soften", n: 3 }] },
        { id: "clockwork:brassbell:rustproof-lining", kind: "reaction", copies: 1, target: "none", answers: ["drink"], needs: "targeted", effects: [{ op: "soften", n: 2 }] },
        { id: "clockwork:brassbell:servo-sidestep", kind: "reaction", copies: 1, target: "none", answers: ["action"], needs: "targeted", effects: [{ op: "negate" }] },
        { id: "clockwork:brassbell:does-not-compute", kind: "reaction", copies: 2, target: "none", answers: ANY, needs: "any", effects: [{ op: "negate" }] },
        { id: "clockwork:brassbell:calculated-odds", kind: "gamble", copies: 3, effects: [{ op: "take_lead" }] },
        { id: "clockwork:brassbell:insert-coin", kind: "gamble", copies: 2, effects: [{ op: "raise", n: 1 }] },
        { id: "clockwork:brassbell:motor-oil-twist", kind: "spike", copies: 2, effects: [{ op: "buzz", who: "target", n: 1 }] },
        { id: "clockwork:brassbell:steam-shot", kind: "spike", copies: 2, effects: [{ op: "buzz", who: "target", n: 2 }] },
      ],
    },
  ],
  drinks: [
    { id: "clockwork:drink:fizzbang-soda", copies: 2, chaser: true, effects: [{ op: "buzz", who: "target", n: 1 }] },
    { id: "clockwork:drink:steam-cider", copies: 2, effects: [{ op: "buzz", who: "target", n: 2 }] },
    { id: "clockwork:drink:coolant-cooler", copies: 1, effects: [{ op: "buzz", who: "target", n: -1 }] },
    { id: "clockwork:drink:unstable-tonic", copies: 1, unrefusable: true, effects: [{ op: "buzz", who: "target", n: 3 }, { op: "grit", who: "target", n: -1 }] },
  ],
  events: [],
};
