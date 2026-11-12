// The Mystic Wood — picture slots (docs/PICTURES.md). Data only: slot id -> committed WebP URL.
// An id left out keeps its emoji / initial crest (art.js). Ids with "_" become "-" in file names.
const pic = (file) => new URL(`./img/${file}.webp`, import.meta.url).href;
const map = (prefix, ids) => Object.fromEntries(ids.split(" ").map((id) => [id, pic(prefix + id.replace(/_/g, "-"))]));

export const ASSETS = {
  // Encounter cards (DEN ids in content.js), drawn on the encounter popup and the card / companion peeks.
  denizens: map("den-", "dragon ox boar troll giant orc saracen king wizard illusion enchantress horse rogue witch druid elf merlin hermit bishop archmage magician sage princess prince grail dwarf queen nymph boy damsel fog horn wind"),
  // Things (THINGS ids), drawn on the thing peek.
  things: map("thing-", "lance shield armour golden_bough key wand blessing ring potion crystal"),
  // Knight portraits (KNIGHTS ids), drawn in the crest on the Knights panel and the quest intro.
  knights: map("knight-", "george perceval roland guyon britomart"),
};
