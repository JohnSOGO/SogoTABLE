// Picture batch for SogoTable (docs/pictures-spec.md). Pure data: one job per output file.
const STYLE = "realistic graphic novel illustration, fine detailed ink linework with delicate cross-hatching, soft muted naturalistic coloring like watercolor and marker, realistic anatomy and expressive faces, clean simple background, high detail";
const CARD = ", single clear subject, centred, no text, no letters, no border, ";
const WOOD = ", in a misty enchanted medieval forest glade";
const LAB = ", on a dim candle-lit alchemist's workbench";
const jobs = [];
const add = (game, slot, prompt, seeds, size = 384, h) => seeds.forEach((seed) => jobs.push({ game, slot, prompt, seed, w: size, h: h || size }));
const one = [101], three = [101, 202, 303];

// ---- Mystic Wood: knights (portraits)
const KN = {
  george: "Sir George, a bold broad-shouldered knight with a short dark beard, red surcoat with a white cross over chainmail, helm under his arm",
  perceval: "Sir Perceval, a gentle young knight with fair shoulder-length hair and a hopeful gaze, pale blue surcoat over chainmail",
  roland: "Sir Roland, a weathered loyal knight with brown hair and a scar on his cheek, green surcoat over chainmail, an ivory horn at his belt",
  guyon: "Sir Guyon, a stern disciplined knight with close-cropped grey hair and a solemn expression, gold and black surcoat over plate armour",
  britomart: "Britomart, a fierce woman knight with a long auburn braid, violet surcoat over silver plate armour, holding a spear",
};
for (const [id, d] of Object.entries(KN)) add("mystic-wood", `knights:${id}`, `close-up portrait of ${d}, face and shoulders filling the frame, expressive face, soft green forest light, softly blurred misty forest background, centred face, square framing, ` + STYLE, three);

// ---- Mystic Wood: denizen cards
const DEN = {
  dragon: "a huge green dragon coiled among ancient trees, wings half spread, smoke curling from its jaws",
  ox: "a wild shaggy ox with great curved horns lowering its head to charge",
  boar: "a fierce wild boar with long tusks and bristling back, snorting",
  troll: "a hulking warty forest troll with a club, mossy skin, scowling",
  giant: "a towering bearded giant in rough hides holding an uprooted tree as a club",
  orc: "a snarling armoured orc warrior with a jagged axe",
  saracen: "a proud armed Saracen knight in a turban helm and curved scimitar on a fine horse",
  king: "a stern crowned king in ermine robes and armour, gripping a great sword",
  wizard: "a wise old wizard in a deep blue robe with a long white beard, holding out a knight's lance",
  illusion: "a shimmering ghostly illusion, a half-transparent knight dissolving into swirling mist and sparkles",
  enchantress: "a beautiful dangerous enchantress in dark green robes weaving a glowing web of magic between her hands",
  horse: "a magnificent white horse rearing among the trees, mane flying",
  rogue: "a sly hooded rogue leaning on a tree, twirling an iron key on a ring",
  witch: "an old forest witch stirring a bubbling cauldron, holding up a small potion bottle",
  druid: "a robed druid with an oak-leaf crown holding a glowing golden bough",
  elf: "a slender wood elf with pointed ears and a longbow, offering a slender carved wand",
  merlin: "Merlin the great enchanter, ancient and hooded, holding a crystal-topped staff and a round shield",
  hermit: "a kindly old hermit in a patched grey robe outside a tiny moss-covered hut, hand raised in blessing",
  bishop: "a solemn bishop in white and gold vestments with a mitre and crozier, holding out a golden ring",
  archmage: "a mighty arch-mage in star-embroidered robes, floating, arcane circles of light around him",
  magician: "a showy travelling magician in a tall hat and bright cloak conjuring sparks from his fingers",
  sage: "an old sage with spectacles reading an unrolled scroll by lantern light",
  princess: "a young princess in a flowing rose-coloured gown and small tiara, looking back over her shoulder as if about to flee",
  prince: "a gallant young prince in a fine blue doublet and light armour with a sword at his side",
  grail: "the Holy Grail, a radiant golden chalice glowing with holy light on a mossy stone altar, still life, no people",
  dwarf: "a stout bearded dwarf miner with a pickaxe, presenting a gleaming suit of armour",
  queen: "a regal queen of the fairies in a silver gown and crown of white flowers, serene and mysterious",
  nymph: "a water nymph rising from a forest pool, holding up a sparkling crystal",
  boy: "a cheerful young squire lad in a simple tunic carrying a knight's helmet",
  damsel: "a damsel in a long green medieval dress with a lantern, waving for help",
  fog: "thick swirling magical fog filling the forest, faint glowing eyes and twisted trees, no people",
  horn: "an ornate ivory hunting horn with silver bands glowing with magic, hanging from a branch, still life, no people",
  wind: "a howling magical wind tearing leaves from the trees in a swirling spiral, no people",
};
for (const [id, d] of Object.entries(DEN)) add("mystic-wood", `denizens:${id}`, d + WOOD + CARD + STYLE, one);

// ---- Mystic Wood: things (items, still lifes)
const TH = {
  lance: "a knight's jousting lance with a pennant", shield: "a round knight's shield with a heraldic emblem",
  armour: "a gleaming suit of knight's plate armour on a stand", golden_bough: "a glowing golden bough with gold leaves",
  key: "an ornate old iron key", wand: "a slender carved magic wand with a faint glow",
  blessing: "a soft beam of holy light with a white dove", ring: "a golden ring with a red jewel",
  potion: "a small corked glass potion bottle with glowing red liquid", crystal: "a glowing scrying crystal ball on a small stand",
};
for (const [id, d] of Object.entries(TH)) add("mystic-wood", `things:${id}`, `${d}, still life, no people, resting on moss` + WOOD + CARD + STYLE, one);

// ---- Potion Lab: ingredient cards + back
const PL = {
  potion: "a bubbling round-bottomed potion flask with glowing pink liquid",
  fire: "a small glass jar holding a living flame of fire essence",
  frog: "a plump green frog sitting on a lily leaf, curious expression",
  mushroom: "a cluster of red spotted toadstools and brown mushrooms",
  herb: "a bundle of fresh green herbs tied with string, rosemary and sage",
  moondust: "a small open pouch spilling glittering silver moon dust under a crescent moon",
  wizard: "a cheerful old wizard alchemist with a pointy hat holding up a test tube",
  ice: "a jagged pale blue ice crystal glowing with frost",
};
for (const [id, d] of Object.entries(PL)) add("potion-lab", `cards:${id}`, d + LAB + CARD + STYLE, one);
// Made in the first run, then dropped (no face-down card is ever drawn); place.mjs skips it.
add("potion-lab", "cardBack", "ornate card back design, symmetrical alchemy emblem of a potion flask inside a circle of runes and stars, deep purple and gold, decorative, no text, no letters, " + STYLE, three, 512, 716);
export default jobs;
