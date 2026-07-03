// Roll of the Dead — flavor quips for NON-turn-ending rolls (the battleship
// phrases.js precedent). The turn-ending outcomes (bust, bank) have their own
// notes in render.js; these fire only while the player is still deciding.
//
// Index: the roll's face multiset — 3 dice of Brain/Feet/Shotgun, sorted
// B < F < S — giving 9 keys (SSS always busts, so it never reaches here; the
// other shotgun-heavy rolls only appear when they did NOT bust, so lines like
// "one more shot ends it" are accurate whenever shown: a BSS/FSS roll can only
// survive with exactly two total shotguns).
//
// Selection is deterministic per roll (seeded by move/roll counters) so a
// re-render or refresh never swaps the joke mid-laugh.
export const ZD_ROLL_PHRASES = {
  BBB: [
    "Triple brains! The buffet is OPEN.",
    "Three brains, zero manners. Chef's kiss.",
    "A full three-course braaain dinner.",
    "The whole family fainted. More brains for you.",
    "Brains, brains, brains — say it with feeling.",
    "You just aced Zombie 101.",
    "Somewhere, a zombie professor is proud.",
    "Gray matter? More like PAY matter.",
    "Three heads are better than none.",
    "The horde chants your name. Braaains!",
  ],
  BBF: [
    "Two brains down, one victim jogging away.",
    "Delicious! And a light cardio chaser.",
    "Two for the belly, one for the chase.",
    "That runner won't get far. They never do.",
    "Brains with a side of footprints.",
    "Double snack, single sprinter.",
    "Two skulls emptied, one pair of shoes squeaking.",
    "You eat, they run. Circle of unlife.",
    "A fine haul — and dessert is escaping.",
    "Nom nom... hey, get back here!",
  ],
  BBS: [
    "Two brains! Worth the buckshot in your shoulder.",
    "Delicious — though someone brought a shotgun to dinner.",
    "Two snacks, one warning shot.",
    "Feast now, limp later.",
    "That's a fair trade in zombie economics.",
    "Brains acquired. Ow. Ow. Worth it.",
    "Two brains and a new hole. Still smiling.",
    "The farmer missed twice, you didn't.",
    "You can't spell 'shotgun' without... eh, who cares. BRAINS.",
    "Double brains! Walk off the buckshot.",
  ],
  BFF: [
    "One brain, two escapees. Rude.",
    "A nibble — and a lot of running shoes.",
    "One course served, two victims cardio-ing away.",
    "Snack secured. The others are FAST.",
    "You got one. The other two joined a track team.",
    "One brain in hand, two in the wind.",
    "Appetizer eaten. Entrées escaping.",
    "They can run... and apparently they did.",
    "One down. The rest are surprisingly spry.",
    "A modest bite. The night is young.",
  ],
  BFS: [
    "A brain, a blast, a runner. Busy street.",
    "One of everything — the sampler platter.",
    "Snack, scratch, and a sprinter.",
    "Balanced diet: brains, buckshot, cardio.",
    "One ate, one shot, one bolted. Classic Tuesday.",
    "The full zombie experience in one roll.",
    "Win some, get shot some, chase some.",
    "A little pain, a little brain.",
    "That's showbiz, zombie.",
    "Variety is the spice of unlife.",
  ],
  BSS: [
    "One brain... and you're basically a colander now.",
    "That snack cost you two new air vents.",
    "Brain: 1. New holes: 2. Hmm.",
    "Tasty! But maybe stop volunteering as target practice.",
    "One more shot and you're done — choose wisely.",
    "The town is armed. The brain was worth it?",
    "Living dangerously. Well — unliving dangerously.",
    "Eat fast, they reload faster.",
    "You're one 💥 from nap time.",
    "Bold zombie. Very ventilated zombie.",
  ],
  FFF: [
    "Everyone escaped. EVERYONE.",
    "Three victims, three clean getaways. Embarrassing.",
    "The whole neighborhood just outran you.",
    "You lunged. They lived. Awkward.",
    "Fastest humans in the county, apparently.",
    "All feet, no feast.",
    "They'll tire out eventually. Probably.",
    "Zero brains, maximum cardio.",
    "The chase continues... and continues.",
    "Your dinner is doing a marathon.",
  ],
  FFS: [
    "Two got away and one shot back. Rough block.",
    "No brains, one bruise, lots of dust trails.",
    "Winged by buckshot while they sprint off. Rude.",
    "The hunt goes on — slightly ventilated.",
    "Two runners and a warning shot.",
    "Nothing eaten. Something dented.",
    "They run AND they shoot? Unfair.",
    "Empty jaws, ringing ears.",
    "That block is officially out of snacks.",
    "Shake it off. The feet are still out there.",
  ],
  FSS: [
    "Two blasts and a runaway. This town is ANGRY.",
    "No brains, two new holes. Reconsider the menu?",
    "One more shot ends the hunt — tread softly.",
    "The victim fled while you got peppered.",
    "You're collecting buckshot like trophies.",
    "Dinner escaped. The shotgun didn't miss.",
    "Danger zone: one 💥 to go.",
    "They shot first. And second.",
    "Maybe chase the ones WITHOUT shotguns?",
    "Your unlife is flashing before your eyes.",
  ],
};

const FACE_LETTER = { brain: "B", feet: "F", shotgun: "S" };

// "BFS"-style key for a rolled trio; empty string when the roll is malformed.
export function zombieDiceRollKey(rolled) {
  if (!Array.isArray(rolled) || rolled.length !== 3) return "";
  const letters = rolled.map((die) => FACE_LETTER[die && die.face] || "");
  if (letters.some((letter) => !letter)) return "";
  return letters.sort().join("");
}

// Deterministic pick: same roll -> same quip, across re-renders and refreshes.
export function zombieDiceRollPhrase(rolled, seed) {
  const list = ZD_ROLL_PHRASES[zombieDiceRollKey(rolled)];
  if (!list || !list.length) return "";
  const index = Math.abs(Math.trunc(Number(seed) || 0)) % list.length;
  return list[index];
}
