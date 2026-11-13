// Last Orders "Storm Road" pack pictures (docs/PICTURES.md): Monsoon, NotePick, their cards and the pack drinks.
// Same prompt scheme as the original Last Orders batch. Run on SogoAI:
//   node scripts/pictures/run.mjs scripts/pictures/jobs-last-orders-storm.mjs C:\Users\Public\sogotable-art\storm
const STYLE = "realistic graphic novel illustration, fine detailed ink linework with delicate cross-hatching, soft muted naturalistic coloring like watercolor and marker, realistic anatomy and expressive faces, clean simple background, high detail";
const CARD = ", single clear subject, centred, no text, no letters, no border, ";
const SCENE = ", dynamic humorous fantasy tavern moment, warm lantern-lit tavern interior, medium shot, illustration" + CARD + STYLE;
const STILL = ", on a wooden tavern table, no people, no hands, warm lantern light, illustration" + CARD + STYLE;
const DRINK = ", on a wooden tavern table, no people, no faces, no hands, warm lantern light, illustration, single clear subject, centred, no text, no letters, no labels, no border, " + STYLE;
const SAFE = "nsfw, nude, naked, topless, cleavage, suggestive, text, letters, watermark";
const PORTRAIT = ", face and shoulders filling the frame, expressive face, warm lantern light, softly blurred warm amber tavern background, centred face, square framing, " + STYLE;
const MONSOON = "Monsoon, a tall strong woman war priestess with smooth sea-blue skin, long pale aqua hair that flows and ripples like water, fully clothed in silver scale armour and a deep blue tabard with a raindrop emblem";
const NOTEPICK = "NotePick, a small skinny green goblin bard with huge pointed ears, a toothy grin, a green feathered cap and a purple doublet";
const jobs = [];
const add = (slot, prompt, seeds, extraNeg = "") => seeds.forEach((seed) =>
  jobs.push({ game: "last-orders", slot, prompt, seed, w: 384, h: 384, negative: SAFE + extraNeg }));
const two = [21, 22]; const three = [101, 202, 303];

add("storm:monsoon", `close-up portrait of ${MONSOON}, a warhammer over her shoulder, calm fierce eyes, water-blooded battle cleric` + PORTRAIT, three, ", man, beard, fire, flames");
add("storm:notepick", `close-up portrait of ${NOTEPICK}, holding a lute, mischievous cheerful face, goblin bard` + PORTRAIT, three);

const M = {
  "thunder-maul": "swinging a big silver warhammer crackling with small lightning sparks down at a tavern brawler",
  "crashing-wave": "sweeping her arm as a wave of seawater crashes over a startled tavern patron",
  "tidal-smite": "striking a patron with a glowing blue warhammer while a splash of water bursts from the blow",
  downpour: "raising her hands as a sudden indoor rain shower soaks the whole tavern crowd",
  "healing-rain": "standing with closed eyes and a peaceful smile under a soft glowing warm rain",
  "cleansing-tide": "pouring a bowl of clear sparkling water over her own head and shaking her flowing hair",
  "storm-tithe": "holding out a silver offering bowl with a raindrop emblem while coins clink into it",
  "rain-or-shine": "flipping a silver coin with a raindrop on one side and a sun on the other above a tavern table",
  "shield-of-the-tide": "raising a round shield of swirling water that splashes a punching fist aside",
  "water-off-my-back": "shrugging calmly as a thrown mug of ale splashes harmlessly off her armoured shoulder",
  "rolling-mist": "half dissolving into rolling blue mist as a fist swings straight through her",
  "storms-verdict": "pointing a stern finger upward as a small dark thundercloud rumbles over her head",
  backwash: "sending a splash of water surging back at a surprised brawler",
  "eye-of-the-storm": "sitting perfectly calm at a gambling table while a whirlwind of cards and coins spins around her",
  "rising-waters": "pushing a stack of coins into a pot as water rises up around the table legs",
};
for (const [id, d] of Object.entries(M)) add(`storm:monsoon:${id}`, `${MONSOON} ${d}` + SCENE, two, ", man, beard, fire, flames");
add("storm:monsoon:squall-splash", "still life close-up of a small stormy blue swirling splash poured into a mug of ale, tiny raindrops around it" + STILL, [21]);
add("storm:monsoon:lightning-in-a-bottle", "still life close-up of a corked glass bottle with a tiny crackling lightning bolt trapped inside" + STILL, [21]);

const N = {
  "lute-to-the-head": "swinging a lute like a club at a tavern brawler with a loud twang",
  "cutting-lyric": "singing a cheeky mocking song and pointing at an offended tavern patron",
  "off-key-solo": "playing a screeching off-key lute solo right into a wincing patron's ear",
  "drinking-song": "standing on a table leading a rowdy drinking song as patrons raise their mugs",
  "pass-the-lute-case": "holding out an open lute case full of coins to the tavern crowd with a hopeful grin",
  encore: "bowing dramatically on a small tavern stage then springing back up to play again",
  "rousing-ballad": "singing a heroic ballad with one fist raised and a proud puffed chest",
  "name-that-tune": "plucking three notes on a lute next to a pile of coins on a gambling table",
  "drown-them-out": "strumming a lute so loudly that shock waves of sound blow back a shouting brawler",
  "dodge-the-tomatoes": "ducking under a flying tomato on a tavern stage, laughing",
  "not-my-verse": "pointing sideways at another patron with an innocent face while holding a lute",
  "sour-note": "spitting out a sip of ale with a disgusted face, lute under one arm",
  "hold-that-note": "holding one long high note with eyes shut while the whole tavern freezes to listen",
  "lucky-pick": "kissing a small shiny lute pick for luck at a gambling table",
  crescendo: "playing a lute with wild energy as coins jump off the gambling table",
};
for (const [id, d] of Object.entries(N)) add(`storm:notepick:${id}`, `${NOTEPICK} ${d}` + SCENE, two);
add("storm:notepick:goblin-grog", "still life close-up of a lumpy green bubbling grog in a dented tin cup" + STILL, [21]);
add("storm:notepick:honey-for-the-throat", "still life close-up of a small honey pot with a wooden dipper dripping golden honey into a mug" + STILL, [21]);

add("storm:drink:thunderhead-ale", "still life close-up of a tall tankard of very dark ale with a foamy head like a storm cloud and tiny lightning flickers" + DRINK, [21]);
add("storm:drink:rain-barrel", "still life close-up of a wooden cup of clear fresh rainwater beside a small wet rain barrel" + DRINK, [21]);
add("storm:drink:chorus-round", "still life close-up of a tray of six foaming mugs of ale with musical notes carved into the tray" + DRINK, [21]);
add("storm:drink:lightning-cider", "still life close-up of a glass of fizzing golden cider with tiny sparks of lightning in the bubbles" + DRINK, [21]);
export default jobs;
