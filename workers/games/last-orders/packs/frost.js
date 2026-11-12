// Last Orders — "frost" expansion rules data (PLAN.md §2). Pure data, no imports.
// Display text lives in src/sogotable/static/games/last-orders/content.js.

const ANY = ["action", "drink", "gamble", "reaction"];

export const FROST_PACK = {
  id: "frost",
  characters: [
    {
      id: "frost:hrolga",
      pack: "frost",
      trait: { drink_buzz_mod: -1, start_gold: -2 },
      deck: [
        { id: "frost:hrolga:keg-toss", kind: "action", copies: 2, target: "opponent", effects: [{ op: "grit", who: "target", n: -3 }] },
        { id: "frost:hrolga:mallet-tap", kind: "action", copies: 3, target: "opponent", effects: [{ op: "grit", who: "target", n: -2 }] },
        { id: "frost:hrolga:tasting-flight", kind: "action", copies: 2, target: "opponent", effects: [{ op: "order", n: 1 }] },
        { id: "frost:hrolga:brewers-tab", kind: "action", copies: 1, target: "none", effects: [{ op: "collect", n: 1 }] },
        { id: "frost:hrolga:hearty-stew", kind: "action", copies: 2, target: "none", effects: [{ op: "grit", who: "self", n: 3 }] },
        { id: "frost:hrolga:cask-wager", kind: "action", copies: 3, target: "none", effects: [{ op: "gamble" }] },
        { id: "frost:hrolga:stone-belly", kind: "reaction", copies: 2, target: "none", answers: ["action", "drink"], needs: "targeted", effects: [{ op: "soften", n: 2 }] },
        { id: "frost:hrolga:seen-worse", kind: "reaction", copies: 2, target: "none", answers: ["drink"], needs: "targeted", effects: [{ op: "negate" }] },
        { id: "frost:hrolga:oaken-shield", kind: "reaction", copies: 2, target: "none", answers: ["action"], needs: "targeted", effects: [{ op: "negate" }] },
        { id: "frost:hrolga:hall-rules", kind: "reaction", copies: 2, target: "none", answers: ANY, needs: "any", effects: [{ op: "negate" }] },
        { id: "frost:hrolga:rune-dice", kind: "gamble", copies: 3, effects: [{ op: "take_lead" }] },
        { id: "frost:hrolga:stack-the-steins", kind: "gamble", copies: 2, effects: [{ op: "raise", n: 1 }] },
        { id: "frost:hrolga:fire-mead-dash", kind: "spike", copies: 2, effects: [{ op: "buzz", who: "target", n: 2 }] },
        { id: "frost:hrolga:smoked-malt", kind: "spike", copies: 2, effects: [{ op: "buzz", who: "target", n: 1 }] },
      ],
    },
    {
      id: "frost:sable",
      pack: "frost",
      trait: { damage_bonus: 1 },
      deck: [
        { id: "frost:sable:pinpoint-jab", kind: "action", copies: 3, target: "opponent", effects: [{ op: "grit", who: "target", n: -2 }] },
        { id: "frost:sable:snare", kind: "action", copies: 2, target: "opponent", effects: [{ op: "grit", who: "target", n: -1 }, { op: "buzz", who: "target", n: 1 }] },
        { id: "frost:sable:snowball", kind: "action", copies: 3, target: "opponent", free: true, effects: [{ op: "grit", who: "target", n: -1 }] },
        { id: "frost:sable:read-the-tracks", kind: "action", copies: 2, target: "none", effects: [{ op: "draw", who: "self", n: 2 }] },
        { id: "frost:sable:sell-a-pelt", kind: "action", copies: 1, target: "none", effects: [{ op: "gold", who: "self", n: 2 }] },
        { id: "frost:sable:follow-the-jingle", kind: "action", copies: 1, target: "opponent", effects: [{ op: "steal", n: 1 }] },
        { id: "frost:sable:fox-and-hound", kind: "action", copies: 3, target: "none", effects: [{ op: "gamble" }] },
        { id: "frost:sable:tuck-and-roll", kind: "reaction", copies: 3, target: "none", answers: ["action", "drink"], needs: "targeted", effects: [{ op: "soften", n: 2 }] },
        { id: "frost:sable:sniff-it-out", kind: "reaction", copies: 2, target: "none", answers: ["drink"], needs: "targeted", effects: [{ op: "negate" }] },
        { id: "frost:sable:vanish-in-snow", kind: "reaction", copies: 1, target: "none", answers: ["action"], needs: "targeted", effects: [{ op: "negate" }] },
        { id: "frost:sable:quick-as-a-fox", kind: "reaction", copies: 2, target: "none", answers: ANY, needs: "any", effects: [{ op: "negate" }] },
        { id: "frost:sable:tail-flick", kind: "gamble", copies: 3, effects: [{ op: "take_lead" }] },
        { id: "frost:sable:silver-bet", kind: "gamble", copies: 1, effects: [{ op: "raise", n: 1 }] },
        { id: "frost:sable:frostberry-squeeze", kind: "spike", copies: 2, effects: [{ op: "buzz", who: "target", n: 1 }] },
        { id: "frost:sable:pine-needle-shot", kind: "spike", copies: 1, effects: [{ op: "buzz", who: "target", n: 2 }, { op: "grit", who: "target", n: -1 }] },
      ],
    },
  ],
  drinks: [
    { id: "frost:drink:frostmead", copies: 2, effects: [{ op: "buzz", who: "target", n: 2 }] },
    { id: "frost:drink:glacier-melt", copies: 2, effects: [{ op: "buzz", who: "target", n: -1 }] },
    { id: "frost:drink:yeti-nog", copies: 1, effects: [{ op: "buzz", who: "target", n: 1 }, { op: "grit", who: "target", n: 2 }] },
    { id: "frost:drink:avalanche", copies: 1, chaser: true, effects: [{ op: "buzz", who: "target", n: 2 }] },
  ],
  events: [],
};
