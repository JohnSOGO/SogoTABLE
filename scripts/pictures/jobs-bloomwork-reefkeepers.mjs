// Picture batch 3 for SogoTable (docs/pictures-spec.md): Bloomwork and Reefkeepers tiles.
const STYLE = "realistic graphic novel illustration, fine detailed ink linework with delicate cross-hatching, soft muted naturalistic coloring like watercolor and marker, clean simple background, high detail";
const TILE = ", square game tile, fills the whole frame edge to edge, no text, no letters, no border, ";
const jobs = [];
const add = (game, slot, prompt, seeds, size = 256) => seeds.forEach((seed) => jobs.push({ game, slot, prompt, seed, w: size, h: size }));
const three = [101, 202, 303];

const BW = {
  rose: "a single lush red-pink rose bloom seen from above, on a soft pale pink background",
  iris: "a single blue-violet iris flower seen from the front, on a soft pale blue background",
  sun: "a single bright yellow sunflower head seen from the front, on a soft pale yellow background",
  lilac: "a cluster of purple lilac blossoms, on a soft pale lavender background",
  fern: "a curling green fern frond with fresh leaves, on a soft pale green background",
};
for (const [id, d] of Object.entries(BW)) add("bloomwork", `flowerArt:${id}`, d + ", centred, garden flower card art" + TILE + STYLE, three);
add("bloomwork", "birdArt", "a plump cheerful orange robin bird perched, facing left, on a soft cream background, centred" + TILE + STYLE, three);
add("bloomwork", "tableBg", "top-down view of an old wooden garden potting bench with scattered soil, small leaves and petals at the edges, empty middle, warm daylight, no text, " + STYLE, three, 1024);

const RK = {
  sand: "top-down view of a pale golden sandy sea floor with gentle ripples and a few tiny shells, underwater",
  kelp: "top-down view of a dense dark green kelp forest underwater, long fronds",
  lagoon: "top-down view of clear bright turquoise shallow lagoon water with sunlight caustics",
  seagrass: "top-down view of a yellow-green seagrass meadow underwater, swaying blades",
  coral: "top-down view of a colourful pink and red coral reef with small fish",
  trench: "top-down view of a deep dark navy blue ocean trench, glowing cyan bioluminescent specks",
};
for (const [id, d] of Object.entries(RK)) add("reefkeepers", `habitats:${id}`, d + ", seamless even texture, no horizon" + TILE + STYLE, three);
add("reefkeepers", "grotto", "top-down view of a cosy undersea grotto home made from a giant spiral seashell with a small round door, surrounded by turquoise water, centred" + TILE + STYLE, three);
export default jobs;
