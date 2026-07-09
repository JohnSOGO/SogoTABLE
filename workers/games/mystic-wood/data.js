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
  fog:         { name: "Mystic Fog",  cls: "spell" },
  horn:        { name: "Mystic Horn", cls: "spell" },
  wind:        { name: "Mystic Wind", cls: "spell" },
};

// How a greeting reads. The rulebook prints a reaction table and no story, so — as with
// KNIGHT_INTRO on the client — this is original chivalric-romance flavour, one line per reaction
// each denizen's table can actually produce. `{k}` is the greeting knight's name. A missing key
// falls back to engine.js's plain narration, so an unwritten reaction still says what happened.
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

// The denizen deck: one of each, plus a couple of duplicate beasts as filler. Recycled via a discard.
export const DECK_IDS = [
  "ox", "boar", "troll", "giant", "orc", "dragon", "saracen", "king", "wizard", "illusion", "enchantress",
  "horse", "rogue", "witch", "druid", "elf", "merlin", "hermit", "bishop", "archmage", "magician", "sage",
  "princess", "prince", "grail", "dwarf", "queen", "nymph", "fog", "horn", "wind", "ox", "boar",
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
