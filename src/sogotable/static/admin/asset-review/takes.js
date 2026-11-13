// Asset Review: alternate takes and source notes. Pure data, no logic.
//
// TAKES lists the Stable Audio Open candidates for a cue (all four seeds made
// on SogoAI, converted like the shipped file; see docs/SOUNDS.md). `shipped` is
// the seed that is live now. The MP3s live in static/sounds/takes/<dir>/ and are
// only fetched by this admin screen; they are not precached.
//
// SOURCES says where each shipped sound came from, so a review (and a later
// "regenerate" request) carries its prompt. Keys are asset keys from catalog.js.
const take = (dir, seed) => new URL(`../../sounds/takes/${dir}/seed-${seed}.mp3`, import.meta.url).href;
const SEEDS = [100, 101, 102, 103];
const sao = (dir, shipped, seconds, prompt) => ({
  shipped,
  seconds,
  prompt,
  takes: SEEDS.map((seed) => ({ id: `seed-${seed}`, seed, url: take(dir, seed) })),
});

export const TAKES = {
  "sound:global:farkle": sao("global/farkle", 102, 1.0, "short comic deflating trombone wah, cartoon fail sound, clean, close, dry"),
  "sound:global:heartsBroken": sao("global/heartsBroken", 100, 1.2, "glass heart cracking, light shatter, magical sparkle tail, clean, close"),
  "sound:global:queenSpades": sao("global/queenSpades", 103, 1.5, "ominous low gong hit with dark reverb tail"),
  "sound:global:moonShot": sao("global/moonShot", 103, 2.5, "triumphant short brass fanfare, orchestral, bright"),
  "sound:global:mysticHorn": sao("global/mysticHorn", 102, 2.0, "ancient hunting horn call in a misty forest, long and hollow"),
  "sound:battleship:incoming": sao("battleship/incoming", 101, 1.2, "artillery shell whistle falling, descending pitch, clean, dry"),
  "sound:battleship:miss": sao("battleship/miss", 101, 1.2, "cannonball splashing into the sea, water splash, clean, close, dry"),
  "sound:battleship:sunk": sao("battleship/sunk", 100, 3.0, "steel ship hull groaning and sinking, bubbles rising underwater"),
};

export const SOURCES = {
  "sound:global:diceRoll": "Kenney Casino Audio, dice-throw-1",
  "sound:global:bank": "Kenney Casino Audio, chips-stack-3",
  "sound:global:cardDeal": "Kenney Casino Audio, card-fan-1",
  "sound:global:cardPlay": "Kenney Casino Audio, card-place-1",
  "sound:global:trickTake": "Kenney Casino Audio, card-shove-1",
  "sound:global:win": "Kenney Music Jingles, jingles_STEEL02",
  "sound:global:lose": "Kenney Music Jingles, jingles_PIZZI01",
  "sound:global:roomCreated": "Kenney Interface Sounds, confirmation_001",
  "sound:global:invite": "Kenney Interface Sounds, glass_001",
  "sound:global:playerJoined": "Kenney Impact Sounds, impactWood_light_000 + _002 (two knocks)",
  "sound:last-orders:play": "Kenney Casino Audio, card-place-2",
  "sound:last-orders:coins": "Kenney Casino Audio, chips-handle-1",
  "sound:battleship:fire": "Kenney Sci-fi Sounds, lowFrequency_explosion_001",
  "sound:battleship:hit": "Kenney Sci-fi Sounds, explosionCrunch_002",
  "sound:tracklayers:draw": "Shared global card-deal (Kenney)",
  "sound:tracklayers:tickets": "Shared global trick-take (Kenney)",
};

// Pictures: one style and model for every file (docs/PICTURES.md).
export const PICTURE_SOURCE = "qwen-image21 on SogoAI, graphic-novel style (docs/PICTURES.md has the prompt and seed)";
