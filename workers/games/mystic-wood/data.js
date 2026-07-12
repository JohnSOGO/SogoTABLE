// The Mystic Wood — static game data (pure constants; no logic, no I/O).
// Lifted verbatim from the AI/Mystic_Wood standalone so the server owns the numbers.
// Shared with the client only through parity-tested copies or the toDict projection —
// never imported across the worker/browser boundary directly.

// The five base knights: base Prowess (P) / Strength (S), quest text, and quest tag `q`.
export const KNIGHTS = {
  george:    { id: "george",    name: "George",    P: 1, S: 3, color: "#c9564c", quest: "Slay the Dragon, then leave the Wood",   q: "dragon" },
  perceval:  { id: "perceval",  name: "Perceval",  P: 3, S: 1, color: "#7d9dce", quest: "Leave the Wood bearing the Holy Grail",  q: "grail" },
  roland:    { id: "roland",    name: "Roland",    P: 2, S: 2, color: "#7d9a4d", quest: "Leave the Wood with the Princess",       q: "princess" },
  guyon:     { id: "guyon",     name: "Guyon",     P: 2, S: 1, color: "#caa24a", quest: "Spend 3 full turns in the Cave",         q: "cave" },
  britomart: { id: "britomart", name: "Britomart", P: 3, S: 1, color: "#a37ec6", quest: "Leave the Wood with the Prince",         q: "prince" },
};
// Deterministic knight-assignment order (seat 0 gets the first available, etc.) before any shuffle.
export const KNIGHT_ORDER = ["george", "perceval", "roland", "guyon", "britomart"];
// §18.10: taking the crown REPLACES the Knight card, and with it the quest — "his quest is now to occupy
// the Castle rather than to visit the cave". Kept out of KNIGHTS (the parity test pins that key set).
export const KING_QUEST = "Hold the Castle as King through a full turn";

// Things (magical items): flat bonus (P/S) and/or a named power.
export const THINGS = {
  lance:        { name: "Lance",        S: 1 },
  shield:       { name: "Shield",       S: 1 },
  armour:       { name: "Armour",       S: 2 },
  golden_bough: { name: "Golden Bough", power: "cave" },
  key:          { name: "Key",          power: "key" },
  wand:         { name: "Wand",         power: "wand" },
  blessing:     { name: "Blessing",     P: 1 },
  ring:         { name: "Ring",         P: 1 },
  potion:       { name: "Potion",       S: 1 },
  crystal:      { name: "Crystal",      power: "scry" },
};

// Denizens. cls: beast | warrior | magic | greet | companion | special | spell.
// `tbl` maps a d6 face (1..6) to a reaction string. Combat class decides which stat is used:
//   beast → Strength · magic → Prowess · warrior → Strength + Prowess.
export const DEN = {
  ox:          { name: "Wild Ox",     cls: "beast",   S: 1, slay: "Ox-slayer" },
  boar:        { name: "Wild Boar",   cls: "beast",   S: 1, slay: "Boar-slayer" },
  troll:       { name: "Troll",       cls: "beast",   S: 2, slay: "Troll-slayer" },
  giant:       { name: "Giant",       cls: "beast",   S: 3, slay: "Giant-killer" },
  orc:         { name: "Orc",         cls: "beast",   S: 4, slay: "Orc-slayer" },
  dragon:      { name: "Dragon",      cls: "beast",   S: 5, dragon: true },
  saracen:     { name: "Saracen",     cls: "warrior", S: 2, P: 2, slay: "Saracen-vanquisher" },
  king:        { name: "King",        cls: "warrior", S: 4, P: 4, king: true },
  wizard:      { name: "Wizard",      cls: "magic",   P: 4, gives: "lance" },
  illusion:    { name: "Illusion",    cls: "magic",   P: 3 },
  enchantress: { name: "Enchantress", cls: "magic",   P: 6, captures: true },
  horse:       { name: "Horse",       cls: "greet",   horse: true, tbl: { 1: "runN", 2: "runN", 3: "runS", 4: "runS", 5: "runE", 6: "runW" } },
  rogue:       { name: "Rogue",       cls: "greet",   tbl: { 1: "tower", 2: "tower", 3: "tower", 4: "give:key", 5: "give:key", 6: "give:key" } },
  witch:       { name: "Witch",       cls: "greet",   tbl: { 1: "transport", 2: "transport", 3: "remains", 4: "remains", 5: "give:potion", 6: "give:potion" } },
  druid:       { name: "Druid",       cls: "greet",   tbl: { 1: "remains", 2: "remains", 3: "remains", 4: "remains", 5: "give:golden_bough", 6: "give:golden_bough" } },
  elf:         { name: "Elf",         cls: "greet",   tbl: { 1: "transport", 2: "transport", 3: "transport", 4: "give:wand", 5: "give:wand", 6: "give:wand" } },
  merlin:      { name: "Merlin",      cls: "greet",   proper: true, tbl: { 1: "transport", 2: "transport", 3: "remains", 4: "remains", 5: "give:shield", 6: "give:shield" } },
  hermit:      { name: "Hermit",      cls: "greet",   tbl: { 1: "transport", 2: "remains", 3: "remains", 4: "remains", 5: "give:blessing", 6: "give:blessing" } },
  bishop:      { name: "Bishop",      cls: "greet",   tbl: { 1: "give:ring", 2: "give:ring", 3: "give:ring", 4: "give:ring", 5: "give:ring", 6: "give:ring" } },
  archmage:    { name: "Arch-Mage",   cls: "greet",   tbl: { 1: "transportYou", 2: "transportYou", 3: "transport", 4: "transport", 5: "befriend", 6: "befriend" } },
  magician:    { name: "Magician",    cls: "greet",   tbl: { 1: "transport", 2: "transport", 3: "remains", 4: "remains", 5: "befriend", 6: "befriend" } },
  sage:        { name: "Sage",        cls: "companion", P: 2, befriendAlways: true },
  princess:    { name: "Princess",    cls: "companion", P: 1, fleeGate: true },
  prince:      { name: "Prince",      cls: "companion", P: 3, S: 3 },
  grail:       { name: "Holy Grail",  cls: "companion", P: 1, S: 1, grail: true },
  dwarf:       { name: "Dwarf",       cls: "greet",   tbl: { 1: "give:armour", 2: "give:armour", 3: "give:armour", 4: "give:armour", 5: "give:armour", 6: "give:armour" } },
  queen:       { name: "Queen",       cls: "special" },
  nymph:       { name: "Nymph",       cls: "greet",   tbl: { 1: "give:crystal", 2: "give:crystal", 3: "give:crystal", 4: "give:crystal", 5: "give:crystal", 6: "give:crystal" } },
  // Chivalry (§15): Boy & Damsel are rescued, not fought — greeting one makes it your Companion, and
  // merely SEEING one lays the obligation of rescue on you (the Save Boy / Rescue Damsel card).
  boy:         { name: "Boy",         cls: "companion", befriendAlways: true, chivalry: "boy" },
  damsel:      { name: "Damsel",      cls: "companion", befriendAlways: true, chivalry: "damsel" },
  fog:         { name: "Mystic Fog",  cls: "spell" },
  horn:        { name: "Mystic Horn", cls: "spell" },
  wind:        { name: "Mystic Wind", cls: "spell" },
};

// How a greeting reads. The rulebook prints a reaction table and no story, so — as with
// KNIGHT_INTRO on the client — this is original chivalric-romance flavour, one line per reaction
// each denizen's table can actually produce. `{k}` is the greeting knight's name. A missing key
// falls back to narration.js's plain wording, so an unwritten reaction still says what happened.
// Keys match the `tbl` actions: remains | transport | transportYou | tower | give:<thing> | run | catch.
export const DEN_TALES = {
  merlin: {
    remains: "Merlin turns a page of his great book and does not look up. {k} waits, and is not answered.",
    transport: "Merlin closes his book, draws a sign upon the air, and is simply no longer there.",
    "give:shield": "Merlin lays a battered shield at {k}'s feet. “You will want this,” he says, “before the week is out.”",
  },
  witch: {
    remains: "The Witch stirs her pot and hums, as though {k} were only weather.",
    transport: "The Witch throws a handful of dust; the glade folds shut, and she is gone with it.",
    "give:potion": "The Witch presses a warm phial into {k}'s hand. “Drink it when you are afraid.”",
  },
  druid: {
    remains: "The Druid stands among the oaks so still that {k} half takes him for one.",
    "give:golden_bough": "The Druid breaks a bough of gold from the oldest tree and sets it in {k}'s hands.",
  },
  elf: {
    transport: "The Elf laughs once from the branches, and by the time {k} looks up there is only leaf-shadow.",
    "give:wand": "The Elf lays a slender wand across {k}'s palms and is gone before thanks can be given.",
  },
  hermit: {
    remains: "The Hermit tells his beads and will not break his silence, even for {k}.",
    transport: "The Hermit steps into his cell and shuts the door, and the cell is no longer there.",
    "give:blessing": "The Hermit lays a thin hand on {k}'s head and blesses the road ahead.",
  },
  magician: {
    remains: "The Magician watches the clouds gather over the wood and spares {k} not a word.",
    transport: "The Magician steps behind a curtain of rain and does not step out of it again.",
  },
  archmage: {
    transport: "The Arch-Mage draws the glade around him like a cloak, and is gone.",
    transportYou: "The Arch-Mage speaks one word, and the Wood rearranges itself about {k}!",
  },
  rogue: {
    tower: "The Rogue clasps {k}'s hand like a brother — then whistles for the guard. Away to the Tower!",
    "give:key": "The Rogue grins, palms {k} an iron key, and is over the wall before it is missed.",
  },
  horse: {
    run: "The Horse tosses its head and is away down the path before {k} can touch the bridle.",
    catch: "{k} takes the bridle and gentles the Horse. It will carry you now.",
  },
  dwarf: { "give:armour": "The Dwarf hauls a mail-coat from his hoard and buckles it onto {k} himself." },
  nymph: { "give:crystal": "The Nymph rises from the pool and presses a cold crystal into {k}'s hand." },
};

// First sight of a denizen — one bespoke line shown on the encounter/pick card the moment {k} meets
// it, before Greet or Challenge. Same original chivalric-romance voice as DEN_TALES / KNIGHT_INTRO
// (the rulebook prints stats, not story); one unique line per denizen that can be encountered. `{k}`
// is the meeting knight's name. Spells are never "met" — they resolve on arrival (see resolveSpell) —
// so they are absent here; a missing key falls back to narration.js's plain "{k} comes upon …".
export const DEN_INTRO = {
  // Beasts — a fight of Strength.
  ox:          "A wild ox stands hock-deep in the fern and swings its great head to fix {k} with one black eye.",
  boar:        "The bracken bursts apart — a boar wheels about, tusks lowered, and will not yield {k} the path.",
  troll:       "A troll uncoils from beneath the roots, grey as wet stone, and grins at {k} with a mouthful of teeth.",
  giant:       "The trees thin, and what {k} took for a hill stands up: a giant, blinking down through the leaves.",
  orc:         "An orc drops from the branch it was crouched on, notched blade already drawn, and comes for {k}.",
  dragon:      "The wood goes silent, then hot. The Dragon lifts its head from the ash of its own making and regards {k}.",
  // Warriors — a fight of Strength and Prowess.
  saracen:     "A Saracen knight bars the road, shield up and lance couched, and calls across the glade for {k} to prove their worth.",
  king:        "A crowned knight rides out beneath a hundred banners — the King himself, who suffers no rival, and looks on {k} with cold eyes.",
  // Magic-users — a contest of Prowess.
  wizard:      "A wizard turns from the fire he was reading, and the flames lean toward {k} as if to point.",
  illusion:    "The glade doubles, and doubles again; {k} can no longer tell the true path from the painted one.",
  enchantress: "A woman sings among the willows, and {k} feels the song reach in and try the latch of the heart.",
  // Greet denizens — offer a greeting and see what they do.
  horse:       "A grey horse grazes untethered in the clearing, then lifts its head, ears turned toward {k}.",
  rogue:       "A ragged fellow steps from behind an oak, all smiles and open hands, and hails {k} as an old friend.",
  witch:       "Smoke threads up through the leaves; a witch bends over her pot and does not yet look up at {k}.",
  druid:       "Among the oldest oaks a druid stands so still that {k} nearly walks past him for a tree.",
  elf:         "A laugh comes down from the branches, and {k} catches only a flash of green before the leaves are still again.",
  merlin:      "An old man sits reading beneath the ash, a great book open on his knee, unsurprised to see {k}. It is Merlin.",
  hermit:      "A hermit tells his beads at the door of a mean cell, and lifts his eyes to {k} without breaking his prayer.",
  bishop:      "A bishop keeps a wayside shrine here, mitred and mild, and beckons {k} to kneel a while.",
  archmage:    "The air bends about a figure in the glade — the Arch-Mage, to whom the whole Wood is a room he may rearrange for {k}.",
  magician:    "A magician watches the clouds gather over the wood, and greets {k} without turning from the coming storm.",
  dwarf:       "A dwarf looks up from his hoard, measures {k} with a smith's eye, and reaches for something in the dark behind him.",
  nymph:       "A nymph rises dripping from the pool, cups something bright in her hands, and holds it out toward {k}.",
  // Companions — won, not slain (though the Prince may test you first).
  sage:        "An old sage rests on a stone beside the path, and offers {k} his counsel for the road ahead.",
  princess:    "A princess waits at the glade's edge, hopeful and wary at once, weighing whether {k} is the deliverance she was promised.",
  prince:      "A young prince rises, hand on hilt, to judge whether {k} comes as rescuer or as rival.",
  grail:       "A cold light stands in the clearing where no light should fall: the Holy Grail, waiting to see if {k} is worthy to bear it.",
  // The Queen holds court and may grant a boon.
  queen:       "A queen holds court beneath a canopy of leaves, and inclines her head, curious what boon {k} will ask.",
  // Chivalry — the sight of them lays the obligation of rescue on {k}.
  boy:         "A frightened boy huddles among the roots, lost and far from home — the sight of him lays a duty on {k}.",
  damsel:      "A damsel stands pale among the thorns, lost in the Wood; {k} cannot in honour leave her here.",
};

// The denizen deck: one of each, plus a couple of duplicate beasts as filler. Recycled via a discard.
export const DECK_IDS = [
  "ox", "boar", "troll", "giant", "orc", "dragon", "saracen", "king", "wizard", "illusion", "enchantress",
  "horse", "rogue", "witch", "druid", "elf", "merlin", "hermit", "bishop", "archmage", "magician", "sage",
  "princess", "prince", "grail", "dwarf", "queen", "nymph", "boy", "damsel", "fog", "horn", "wind", "ox", "boar",
];

// Passive Prowess a companion lends while travelling with you. Prince is a one-shot aid applied
// only in the fight he helps, so he is NOT here. Prince & Sage are exempt from the Power Limit.
export const COMP_P = { princess: 1, grail: 1, sage: 2 };

// Board: 7 columns × 9 rows. Rows 0–3 = Enchanted Wood, row 4 = Tower row (split), rows 5–8 = Earthly.
export const ROWS = 9;
export const COLS = 7;
export const POWER_LIMIT = 10;
export const CAVE_TURNS_TO_WIN = 3;
export const MIN_PLAYERS = 3;
// Only five knights exist in the base game, so the table caps at five seats.
export const MAX_PLAYERS = 5;

// Fixed & named tile placements. Only the two Gates + Tower are `fixed` (start revealed);
// the named glades shuffle-in conceptually but sit at these cells for the digital board.
export const NAMED_TILES = {
  "0,3": { name: "xgate",   label: "Gate",   half: "ench",  fixed: true, open: { S: 1, E: 1, W: 1 } },
  "8,3": { name: "egate",   label: "Gate",   half: "earth", fixed: true, open: { N: 1, E: 1, W: 1 } },
  "4,3": { name: "tower",   label: "Tower",  half: "ench",  fixed: true, open: { N: 1, E: 1, S: 1, W: 1 } },
  "1,1": { name: "grove",   label: "Grove",  half: "ench" },
  "2,5": { name: "palace",  label: "Palace", half: "ench" },
  "3,2": { name: "island",  label: "Isle",   half: "ench" },
  "1,5": { name: "altar",   label: "Altar",  half: "ench" },
  "6,1": { name: "cave",    label: "Cave",   half: "earth" },
  "5,4": { name: "chapel",  label: "Chapel", half: "earth" },
  "7,5": { name: "castle",  label: "Castle", half: "earth" },
  "6,4": { name: "fountain",label: "Font",   half: "earth" },
};

// Knights start on the Earthly Gate.
export const START_CELL = { r: 8, c: 3 };
