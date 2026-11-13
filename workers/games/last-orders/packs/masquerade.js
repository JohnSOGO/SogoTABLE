// Last Orders — "masquerade" expansion rules data (PLAN.md §2). Pure data, no imports.
// Display text lives in src/sogotable/static/games/last-orders/content.js.

const ANY = ["action", "drink", "gamble", "reaction"];

export const MASQUERADE_PACK = {
  id: "masquerade",
  characters: [
    {
      id: "masquerade:verrin",
      pack: "masquerade",
      trait: { start_gold: 2 },
      deck: [
        { id: "masquerade:verrin:draining-glance", kind: "action", copies: 3, target: "opponent", effects: [{ op: "grit", who: "target", n: -2 }, { op: "grit", who: "self", n: 2 }] },
        { id: "masquerade:verrin:velvet-slap", kind: "action", copies: 4, target: "opponent", effects: [{ op: "grit", who: "target", n: -2 }] },
        { id: "masquerade:verrin:noble-tithe", kind: "action", copies: 1, target: "none", effects: [{ op: "collect", n: 1 }] },
        { id: "masquerade:verrin:old-money", kind: "action", copies: 1, target: "none", effects: [{ op: "gold", who: "self", n: 3 }] },
        { id: "masquerade:verrin:tomato-juice-toast", kind: "action", copies: 1, target: "none", effects: [{ op: "grit", who: "self", n: 1 }, { op: "buzz", who: "self", n: -2 }] },
        { id: "masquerade:verrin:backhanded-compliment", kind: "action", copies: 1, target: "opponent", effects: [{ op: "grit", who: "target", n: -1 }, { op: "steal", n: 1 }] },
        { id: "masquerade:verrin:high-stakes-soiree", kind: "action", copies: 3, target: "none", effects: [{ op: "gamble" }] },
        { id: "masquerade:verrin:cape-swirl", kind: "reaction", copies: 2, target: "none", answers: ["action"], needs: "targeted", effects: [{ op: "negate" }] },
        { id: "masquerade:verrin:only-tomato-juice", kind: "reaction", copies: 2, target: "none", answers: ["drink"], needs: "targeted", effects: [{ op: "negate" }] },
        { id: "masquerade:verrin:how-dare-you", kind: "reaction", copies: 1, target: "none", answers: ["action"], needs: "targeted", effects: [{ op: "reflect" }] },
        { id: "masquerade:verrin:i-insist", kind: "reaction", copies: 2, target: "none", answers: ANY, needs: "any", effects: [{ op: "negate" }] },
        { id: "masquerade:verrin:family-fortune", kind: "gamble", copies: 3, effects: [{ op: "take_lead" }] },
        { id: "masquerade:verrin:silk-purse", kind: "gamble", copies: 2, effects: [{ op: "raise", n: 1 }] },
        { id: "masquerade:verrin:ruby-cordial", kind: "spike", copies: 2, effects: [{ op: "buzz", who: "target", n: 2 }] },
        { id: "masquerade:verrin:garlic-twist", kind: "spike", copies: 1, effects: [{ op: "buzz", who: "target", n: 1 }] },
      ],
    },
    {
      id: "masquerade:bim",
      pack: "masquerade",
      trait: { draw_bonus: 1, start_grit: -2 },
      deck: [
        { id: "masquerade:bim:pie-in-the-face", kind: "action", copies: 3, target: "opponent", effects: [{ op: "grit", who: "target", n: -2 }, { op: "buzz", who: "target", n: 1 }] },
        { id: "masquerade:bim:juggling-jugs", kind: "action", copies: 1, target: "none", effects: [{ op: "buzz", who: "others", n: 1 }] },
        { id: "masquerade:bim:whoopee-cushion", kind: "action", copies: 2, target: "none", effects: [{ op: "grit", who: "others", n: -1 }] },
        { id: "masquerade:bim:confetti-shower", kind: "action", copies: 1, target: "none", effects: [{ op: "draw", who: "all", n: 1 }] },
        { id: "masquerade:bim:lily-pad-hop", kind: "action", copies: 1, target: "none", effects: [{ op: "extra_action" }, { op: "draw", who: "self", n: 1 }] },
        { id: "masquerade:bim:hat-trick", kind: "action", copies: 2, target: "none", effects: [{ op: "collect", n: 1 }] },
        { id: "masquerade:bim:leapfrog-bet", kind: "action", copies: 3, target: "none", effects: [{ op: "gamble" }] },
        { id: "masquerade:bim:wrong-pond", kind: "reaction", copies: 3, target: "opponent", answers: ["action", "drink"], needs: "targeted", effects: [{ op: "redirect" }] },
        { id: "masquerade:bim:boing", kind: "reaction", copies: 2, target: "none", answers: ["action"], needs: "targeted", effects: [{ op: "reflect" }] },
        { id: "masquerade:bim:spit-take", kind: "reaction", copies: 3, target: "none", answers: ["drink"], needs: "targeted", effects: [{ op: "negate" }] },
        { id: "masquerade:bim:punchline", kind: "reaction", copies: 3, target: "none", answers: ANY, needs: "any", effects: [{ op: "negate" }] },
        { id: "masquerade:bim:rubber-chicken", kind: "gamble", copies: 3, effects: [{ op: "take_lead" }] },
        { id: "masquerade:bim:jingle-the-bells", kind: "gamble", copies: 1, effects: [{ op: "raise", n: 1 }] },
        { id: "masquerade:bim:swamp-fizz", kind: "spike", copies: 2, effects: [{ op: "buzz", who: "target", n: 2 }] },
        { id: "masquerade:bim:bubble-pop", kind: "spike", copies: 2, effects: [{ op: "buzz", who: "target", n: 1 }] },
      ],
    },
  ],
  drinks: [
    { id: "masquerade:drink:masked-punch", copies: 2, chaser: true, effects: [{ op: "buzz", who: "target", n: 1 }] },
    { id: "masquerade:drink:midnight-tea", copies: 1, effects: [{ op: "buzz", who: "target", n: -1 }, { op: "grit", who: "target", n: 1 }] },
    { id: "masquerade:drink:bubbly-fountain", copies: 1, house: true, effects: [{ op: "buzz", who: "target", n: 1 }] },
    { id: "masquerade:drink:mystery-flute", copies: 1, effects: [{ op: "buzz", who: "target", n: 2 }, { op: "gold", who: "target", n: 1 }] },
  ],
  events: [],
};
