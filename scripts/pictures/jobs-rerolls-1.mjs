// Re-rolls after review of the first Mystic Wood / Potion Lab run (docs/PICTURES.md): the nymph came out
// nude (removed at once; family game), fog and wind drew animals, the witch drew a man, moon dust drew a person.
const STYLE = "realistic graphic novel illustration, fine detailed ink linework with delicate cross-hatching, soft muted naturalistic coloring like watercolor and marker, realistic anatomy and expressive faces, clean simple background, high detail";
const CARD = ", single clear subject, centred, no text, no letters, no border, ";
const WOOD = ", in a misty enchanted medieval forest glade";
const LAB = ", on a dim candle-lit alchemist's workbench";
const SAFE = "nsfw, nude, naked, topless, cleavage, suggestive, text, letters, watermark";
const jobs = [];
const add = (game, slot, prompt, extraNeg = "") => [101, 202, 303].forEach((seed) =>
  jobs.push({ game, slot, prompt, seed, w: 384, h: 384, negative: SAFE + extraNeg }));
add("mystic-wood", "denizens:nymph", "a modest water nymph spirit fully clothed in a long flowing high-necked blue-green gown with long sleeves, standing waist-deep in a forest pool, holding up a sparkling crystal" + WOOD + CARD + STYLE);
add("mystic-wood", "denizens:fog", "thick swirling magical white fog rolling between twisted dark trees, faint glowing lights inside the mist, empty forest, landscape only, no people, no animals" + WOOD + CARD + STYLE, ", animal, bear, dog, wolf, person");
add("mystic-wood", "denizens:wind", "a howling magical gust of wind visible as a swirling spiral of autumn leaves and streaks of air between bending trees, landscape only, no people, no animals" + WOOD + CARD + STYLE, ", animal, wolf, dog, fox, person");
add("mystic-wood", "denizens:witch", "an old woman forest witch with long grey hair, a crooked hat and a patched shawl, stirring a bubbling cauldron and holding up a small potion bottle" + WOOD + CARD + STYLE, ", man, beard");
add("potion-lab", "cards:moondust", "a small open velvet pouch spilling glittering silver moon dust onto the table under a crescent moon in the window, still life, no people" + LAB + CARD + STYLE, ", person, man, woman, hands");
export default jobs;
