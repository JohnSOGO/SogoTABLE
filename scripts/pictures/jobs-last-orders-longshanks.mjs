// Last Orders "Storm Road" pack, third patron: Longshanks Ohd (docs/PICTURES.md). Same scheme as
// jobs-last-orders-storm.mjs. Run on SogoAI:
//   node scripts/pictures/run.mjs scripts/pictures/jobs-last-orders-longshanks.mjs C:\Users\Public\sogotable-art\longshanks
const STYLE = "realistic graphic novel illustration, fine detailed ink linework with delicate cross-hatching, soft muted naturalistic coloring like watercolor and marker, realistic anatomy and expressive faces, clean simple background, high detail";
const CARD = ", single clear subject, centred, no text, no letters, no border, ";
const SCENE = ", dynamic humorous fantasy tavern moment, warm lantern-lit tavern interior, medium shot, illustration" + CARD + STYLE;
const STILL = ", on a wooden tavern table, no people, no hands, warm lantern light, illustration" + CARD + STYLE;
const SAFE = "nsfw, nude, naked, topless, cleavage, suggestive, text, letters, watermark";
const PORTRAIT = ", face and shoulders filling the frame, expressive face, warm lantern light, softly blurred warm amber tavern background, centred face, square framing, " + STYLE;
const LH = "Longshanks Ohd, a very tall lanky human bard with a long friendly face, shoulder-length brown hair, a short neat beard, a quill tucked behind one ear, fully clothed in a long forest-green coat with gold trim";
const jobs = [];
const add = (slot, prompt, seeds, extraNeg = "") => seeds.forEach((seed) =>
  jobs.push({ game: "last-orders", slot, prompt, seed, w: 384, h: 384, negative: SAFE + extraNeg }));
const two = [21, 22];

add("storm:longshanks", `close-up portrait of ${LH}, holding an old leather-bound book, warm knowing smile, loremaster bard` + PORTRAIT, [101, 202, 303], ", goblin, elf ears");
const C = {
  "fireside-ballad": "sitting by a tavern hearth singing softly with a lute while a bruised patron relaxes",
  "soothing-verse": "reciting a gentle verse with a calming open hand to a dizzy patron",
  "bolstering-ode": "standing tall and reciting a heroic ode with one hand raised, glowing with confidence",
  "round-of-applause": "bowing as the whole tavern crowd claps and cheers warmly",
  "ancient-lore": "reading a huge dusty ancient tome by candlelight, eyebrows raised",
  "tale-of-woe": "telling a tragic story so sad that a listening patron weeps into his mug",
  "quill-jab": "poking a grumpy patron with a long feather quill like a tiny sword",
  "patrons-purse": "holding out a hat while a wealthy patron drops coins into it",
  "wager-of-legends": "slapping a coin onto a gambling table beside an open storybook",
  "i-know-how-this-ends": "calmly stepping aside as a punch misses, holding a book open at the last page",
  "cautionary-tale": "gently pushing away an offered mug with a finger and a knowing warning look",
  footnote: "raising one finger to interrupt, pointing at a tiny note at the bottom of a scroll",
  "plot-twist": "gesturing dramatically with a cape flourish as a punch lands on someone else",
  "steady-rhythm": "tapping a steady beat on a hand drum while leaning back from a thrown mug",
  "old-tavern-trick": "doing a sleight of hand coin trick at a gambling table with a sly grin",
  "raise-the-chorus": "conducting a singing tavern crowd with a quill as coins pile into a pot",
};
for (const [id, d] of Object.entries(C)) add(`storm:longshanks:${id}`, `${LH} ${d}` + SCENE, two, ", goblin, elf ears");
add("storm:longshanks:bards-toast", "still life close-up of a raised pewter goblet of red wine with a feather quill resting beside it" + STILL, [21]);
export default jobs;
