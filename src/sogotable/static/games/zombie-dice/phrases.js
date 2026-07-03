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
// Every quip must fit ONE line on a phone — keep them under ~38 characters
// (the .zd-quip style nowraps + ellipsizes as the hard stop).
//
// Selection is deterministic per roll (seeded by move/roll counters) so a
// re-render or refresh never swaps the joke mid-laugh.
export const ZD_ROLL_PHRASES = {
  BBB: [
    "Triple brains! Buffet's OPEN.",
    "Three brains, zero manners.",
    "A three-course braaain dinner.",
    "The whole family fainted.",
    "Braaains — say it with feeling.",
    "You just aced Zombie 101.",
    "Zombie professors are proud.",
    "Gray matter? PAY matter.",
    "Three heads are better than none.",
    "The horde chants your name.",
  ],
  BBF: [
    "Two brains, one jogger.",
    "Delicious! Plus light cardio.",
    "Two for the belly, one to chase.",
    "That runner won't get far.",
    "Brains with a side of footprints.",
    "Double snack, single sprinter.",
    "You eat, they run. Unlife.",
    "Fine haul — dessert is escaping.",
    "Nom nom... hey, get back here!",
    "Two skulls emptied, one squeaker.",
  ],
  BBS: [
    "Two brains! Worth the buckshot.",
    "Who invited the shotgun to dinner?",
    "Two snacks, one warning shot.",
    "Feast now, limp later.",
    "Fair trade, zombie economics.",
    "Brains acquired. Ow. Worth it.",
    "Two brains, one new hole.",
    "The farmer missed twice.",
    "Who cares about holes. BRAINS.",
    "Walk off the buckshot.",
  ],
  BFF: [
    "One brain, two escapees. Rude.",
    "A nibble, lots of running shoes.",
    "One served, two sprinting away.",
    "Snack secured. Others are FAST.",
    "The rest joined a track team.",
    "One in hand, two in the wind.",
    "Appetizer eaten. Entrées fleeing.",
    "They can run. And they did.",
    "One down. The rest are spry.",
    "A modest bite. Night is young.",
  ],
  BFS: [
    "A brain, a blast, a runner.",
    "One of everything — the sampler.",
    "Snack, scratch, and a sprinter.",
    "Brains, buckshot, cardio.",
    "Classic Tuesday for a zombie.",
    "The full zombie experience.",
    "Win some, get shot some.",
    "A little pain, a little brain.",
    "That's showbiz, zombie.",
    "Variety is the spice of unlife.",
  ],
  BSS: [
    "One brain... you're a colander now.",
    "That snack cost two air vents.",
    "Brain: 1. New holes: 2.",
    "Quit volunteering as a target.",
    "One more shot and you're done.",
    "The town is armed. Worth it?",
    "Unliving dangerously.",
    "Eat fast, they reload faster.",
    "You're one 💥 from nap time.",
    "Bold zombie. Ventilated zombie.",
  ],
  FFF: [
    "Everyone escaped. EVERYONE.",
    "Three getaways. Embarrassing.",
    "The whole block outran you.",
    "You lunged. They lived.",
    "Fastest humans in the county.",
    "All feet, no feast.",
    "They'll tire out. Probably.",
    "Zero brains, maximum cardio.",
    "The chase continues...",
    "Your dinner is running a marathon.",
  ],
  FFS: [
    "Two got away, one shot back.",
    "No brains, one bruise.",
    "Winged while they sprint off.",
    "The hunt goes on — ventilated.",
    "Two runners, one warning shot.",
    "Nothing eaten. Something dented.",
    "They run AND shoot? Unfair.",
    "Empty jaws, ringing ears.",
    "That block is out of snacks.",
    "Shake it off. Keep hunting.",
  ],
  FSS: [
    "Two blasts and a runaway.",
    "No brains, two new holes.",
    "One more shot ends the hunt.",
    "Dinner fled, you got peppered.",
    "Collecting buckshot like trophies.",
    "Dinner escaped. Shotgun didn't.",
    "Danger zone: one 💥 to go.",
    "They shot first. And second.",
    "Chase the unarmed ones, maybe?",
    "Your unlife just flashed by.",
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
