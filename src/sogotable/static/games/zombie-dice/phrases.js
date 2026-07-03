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

// Banked-turn quips, 10 per brain COUNT (0-10; MANY covers 11+ with {n}
// substituted). render.js appends the running total after the phrase.
export const ZD_BANK_PHRASES = {
  0: [
    "Zero 🧠. A dignified retreat.",
    "No brains, but no new holes!",
    "Banked... absolutely nothing.",
    "A zero-brain diet day.",
    "Empty belly, intact hide.",
    "You quit while behind. Bold.",
    "Nothing gained, nothing pierced.",
    "The hunt was... educational.",
    "Zero 🧠 — call it a scouting run.",
    "Even zombies have off nights.",
  ],
  1: [
    "One 🧠 in my belly!",
    "A single, artisanal brain.",
    "One brain is still a brain.",
    "Snack-sized victory!",
    "One 🧠 down the hatch.",
    "Quality over quantity, right?",
    "A polite little nibble.",
    "One brain, zero regrets.",
    "Every horde starts with one.",
    "Just an amuse-bouche.",
  ],
  2: [
    "Two 🧠 in my belly!",
    "A brain for each cheek.",
    "Double helping, no seconds.",
    "Two down the gullet!",
    "Twin snacks acquired.",
    "Two 🧠 — balanced breakfast.",
    "A pair of thinkers, devoured.",
    "Two brains, one happy zombie.",
    "Stereo crunching sounds.",
    "Two scoops of gray matter.",
  ],
  3: [
    "Three 🧠 in my belly!",
    "A brain hat trick!",
    "Three-course cranium dinner.",
    "Triple crunch combo!",
    "Three thinkers, zero survivors.",
    "Hat trick of head snacks.",
    "Three 🧠 — now we're feasting.",
    "A trio down the hatch.",
    "Third brain's the charm.",
    "Three! The horde approves.",
  ],
  4: [
    "Four 🧠 in my belly!",
    "Four-brain feast mode.",
    "A quartet of craniums!",
    "Four down. Still peckish.",
    "Four 🧠 — that's a banquet.",
    "Quad-core snacking.",
    "Four thinkers deep.",
    "Four brains, no brakes.",
    "A four-skull salute!",
    "Four! Save room for dessert.",
  ],
  5: [
    "Five 🧠 in my belly!",
    "A high-five of brains!",
    "Five-star zombie dining.",
    "Handful of heads, devoured.",
    "Five 🧠 — gourmet gluttony.",
    "A full fist of brains!",
    "Five-course tasting menu.",
    "Five down the hatch. Burp.",
    "Five! The town's half empty.",
    "Cinco de Braino!",
  ],
  6: [
    "Six 🧠 in my belly!",
    "Half a dozen headlights out.",
    "Six-pack of gray matter!",
    "Six brains, one sitting.",
    "Six 🧠 — glorious gluttony.",
    "A six-course skull buffet.",
    "Six! Someone stop this zombie.",
    "Half-dozen down the hatch.",
    "Six brains richer.",
    "Six! The horde is jealous.",
  ],
  7: [
    "Seven 🧠 in my belly!",
    "Lucky number brain-seven!",
    "Seven skulls lighter, that town.",
    "A magnificent seven, eaten.",
    "Seven 🧠 — showing off now.",
    "Seven! Save some for the rest.",
    "Seven-brain winning streak.",
    "Seven down. Unstoppable.",
    "A week's worth in one turn!",
    "Seven! Absolute unit.",
  ],
  8: [
    "Eight 🧠 in my belly!",
    "An octet of intellects!",
    "Eight brains. EIGHT.",
    "Crazy eights, zombie style.",
    "Eight 🧠 — legendary appetite.",
    "Eight skulls emptied tonight.",
    "Eight! The town is trembling.",
    "An eight-brain bender!",
    "Eight down. No shame.",
    "Eight! Michelin-star monster.",
  ],
  9: [
    "Nine 🧠 in my belly!",
    "Cloud nine of carnage!",
    "A nine-brain masterpiece.",
    "Nine skulls, one legend.",
    "Nine 🧠 — peak zombie.",
    "Dressed to the nines in brains.",
    "Nine! One for the history books.",
    "Nine-brain rampage complete.",
    "Nine down. Utterly stuffed.",
    "Nine! The horde bows to you.",
  ],
  10: [
    "Ten 🧠 in my belly!",
    "A perfect ten!",
    "Double-digit devouring!",
    "Ten skulls. TEN.",
    "Ten 🧠 — hall of fame hunt.",
    "A ten-brain thunder run!",
    "Ten! The stuff of legends.",
    "Ten-course tasting of terror.",
    "Ten down. Waddle home happy.",
    "Ten! Nobody will believe this.",
  ],
  MANY: [
    "{n} 🧠 in my belly!",
    "{n}?! That's a census, not a snack.",
    "{n} brains! Utterly mythical.",
    "{n} 🧠 — rewrite the record books.",
    "A {n}-brain apocalypse!",
    "{n}! The town is a ghost town now.",
    "{n} brains in ONE hunt?!",
    "{n}! Statues will be built.",
    "{n} 🧠. Absolute legend.",
    "{n}! Even Overlord is scared.",
  ],
};

// Deterministic banked-turn quip for `count` brains; {n} carries the count in
// the 11+ tier.
export function zombieDiceBankPhrase(count, seed) {
  const n = Math.max(0, Math.trunc(Number(count) || 0));
  const list = n > 10 ? ZD_BANK_PHRASES.MANY : ZD_BANK_PHRASES[n];
  if (!list || !list.length) return "";
  const index = Math.abs(Math.trunc(Number(seed) || 0)) % list.length;
  return list[index].replace(/\{n\}/g, String(n));
}

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
