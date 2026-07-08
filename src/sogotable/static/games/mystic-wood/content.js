// The Mystic Wood — CLIENT display data (names, emojis, reaction tables, descriptions) lifted from
// the prototype so render.js can draw the exact same encounter cards, peeks, and badges. This is
// display data only; the server (workers/games/mystic-wood/data.js) owns the authoritative rules.
export const KNIGHTS = {
  george:    { name: "George",    P: 1, S: 3, color: "#c9564c", quest: "Slay the Dragon, then leave the Wood", q: "dragon" },
  perceval:  { name: "Perceval",  P: 3, S: 1, color: "#7d9dce", quest: "Leave the Wood bearing the Holy Grail", q: "grail" },
  roland:    { name: "Roland",    P: 2, S: 2, color: "#7d9a4d", quest: "Leave the Wood with the Princess", q: "princess" },
  guyon:     { name: "Guyon",     P: 2, S: 1, color: "#caa24a", quest: "Spend 3 full turns in the Cave", q: "cave" },
  britomart: { name: "Britomart", P: 3, S: 1, color: "#a37ec6", quest: "Leave the Wood with the Prince", q: "prince" },
};
export const THINGS = {
  lance: { name: "Lance", S: 1 }, shield: { name: "Shield", S: 1 }, armour: { name: "Armour", S: 2 },
  golden_bough: { name: "Golden Bough", power: "cave" }, key: { name: "Key", power: "key" },
  wand: { name: "Wand", power: "wand" }, blessing: { name: "Blessing", P: 1 }, ring: { name: "Ring", P: 1 },
  potion: { name: "Potion", S: 1 }, crystal: { name: "Crystal", power: "scry" },
};
export const DEN = {
  ox: { name: "Wild Ox", cls: "beast", S: 1, slay: "Ox-slayer" },
  boar: { name: "Wild Boar", cls: "beast", S: 1, slay: "Boar-slayer" },
  troll: { name: "Troll", cls: "beast", S: 2, slay: "Troll-slayer" },
  giant: { name: "Giant", cls: "beast", S: 3, slay: "Giant-killer" },
  orc: { name: "Orc", cls: "beast", S: 4, slay: "Orc-slayer" },
  dragon: { name: "Dragon", cls: "beast", S: 5, dragon: true },
  saracen: { name: "Saracen", cls: "warrior", S: 2, P: 2, slay: "Saracen-vanquisher" },
  king: { name: "King", cls: "warrior", S: 4, P: 4, king: true },
  wizard: { name: "Wizard", cls: "magic", P: 4, gives: "lance" },
  illusion: { name: "Illusion", cls: "magic", P: 3 },
  enchantress: { name: "Enchantress", cls: "magic", P: 6, captures: true },
  horse: { name: "Horse", cls: "greet", horse: true, tbl: { 1: "runN", 2: "runN", 3: "runS", 4: "runS", 5: "runE", 6: "runW" } },
  rogue: { name: "Rogue", cls: "greet", tbl: { 1: "tower", 2: "tower", 3: "tower", 4: "give:key", 5: "give:key", 6: "give:key" } },
  witch: { name: "Witch", cls: "greet", tbl: { 1: "transport", 2: "transport", 3: "remains", 4: "remains", 5: "give:potion", 6: "give:potion" } },
  druid: { name: "Druid", cls: "greet", tbl: { 1: "remains", 2: "remains", 3: "remains", 4: "remains", 5: "give:golden_bough", 6: "give:golden_bough" } },
  elf: { name: "Elf", cls: "greet", tbl: { 1: "transport", 2: "transport", 3: "transport", 4: "give:wand", 5: "give:wand", 6: "give:wand" } },
  merlin: { name: "Merlin", cls: "greet", tbl: { 1: "transport", 2: "transport", 3: "remains", 4: "remains", 5: "give:shield", 6: "give:shield" } },
  hermit: { name: "Hermit", cls: "greet", tbl: { 1: "transport", 2: "remains", 3: "remains", 4: "remains", 5: "give:blessing", 6: "give:blessing" } },
  bishop: { name: "Bishop", cls: "greet", tbl: { 1: "give:ring", 2: "give:ring", 3: "give:ring", 4: "give:ring", 5: "give:ring", 6: "give:ring" } },
  archmage: { name: "Arch-Mage", cls: "greet", tbl: { 1: "transportYou", 2: "transportYou", 3: "transport", 4: "transport", 5: "befriend", 6: "befriend" } },
  magician: { name: "Magician", cls: "greet", tbl: { 1: "transport", 2: "transport", 3: "remains", 4: "remains", 5: "befriend", 6: "befriend" } },
  sage: { name: "Sage", cls: "companion", P: 2, befriendAlways: true },
  princess: { name: "Princess", cls: "companion", P: 1, fleeGate: true },
  prince: { name: "Prince", cls: "companion", P: 3, S: 3 },
  grail: { name: "Holy Grail", cls: "companion", P: 1, S: 1, grail: true },
  dwarf: { name: "Dwarf", cls: "greet", tbl: { 1: "give:armour", 2: "give:armour", 3: "give:armour", 4: "give:armour", 5: "give:armour", 6: "give:armour" } },
  queen: { name: "Queen", cls: "special" },
  nymph: { name: "Nymph", cls: "greet", tbl: { 1: "give:crystal", 2: "give:crystal", 3: "give:crystal", 4: "give:crystal", 5: "give:crystal", 6: "give:crystal" } },
  fog: { name: "Mystic Fog", cls: "spell" }, horn: { name: "Mystic Horn", cls: "spell" }, wind: { name: "Mystic Wind", cls: "spell" },
};
export const DEN_CLASS = { beast: "Beast", warrior: "Warrior", magic: "Magic-user", greet: "Denizen", companion: "Companion", special: "Denizen" };
export const DEN_EMOJI = { dragon: "🐉", ox: "🐂", boar: "🐗", troll: "👹", giant: "🗿", orc: "👺", saracen: "⚔️", king: "👑", wizard: "🧙", illusion: "🌀", enchantress: "🧝‍♀️", horse: "🐎", rogue: "🗡️", witch: "🧙‍♀️", druid: "🌿", elf: "🏹", merlin: "🔮", hermit: "🧓", bishop: "⛪", archmage: "✨", magician: "🌩️", sage: "📜", princess: "👸", prince: "🤴", grail: "🏆", dwarf: "⛏️", queen: "👸", nymph: "💧", fog: "🌫️", horn: "📯", wind: "🌬️" };
export const THING_DESC = {
  lance: "+1 Strength. (Given by the Wizard.)", shield: "+1 Strength. (Given by Merlin.)",
  armour: "+2 Strength. (Revealed by the Dwarf.)", golden_bough: "Lets you enter the Cave.",
  key: "Escape the Tower on your first try.", wand: "On your turn, press <b>🔄 Rotate</b> beneath the board to turn the tile you stand on 180°.",
  blessing: "+1 Prowess. (Given by the Hermit.)", ring: "+1 Prowess. (Prayed from the Bishop.)",
  potion: "+1 Strength. (Given by the Witch.)",
  crystal: "Scry the deck. On your turn, press <b>🔮 Scry</b> beneath the board to reveal the next card.",
};
export const COMP_DESC = {
  sage: "Adds +2 Prowess to one contest, then departs.", princess: "+1 Prowess. Won't aid against the King. (Roland's quest companion.)",
  prince: "Lends +3 Strength & +3 Prowess to ONE fight (never vs the King, nor George vs the Dragon), then just travels on. (Britomart's quest companion.)", grail: "+1 Strength and +1 Prowess. Not a Thing. (Perceval's quest object.)",
  magician: "His only power is to raise a Storm on any tile — that rule isn't in this build yet, so he grants no buff for now (no stat bonus).",
  archmage: "On your turn, press <b>✨ Transport</b> beneath the board to send yourself to any revealed place.",
};
export const AREA_NAMES = { cave: "Cave", chapel: "Chapel", castle: "Castle", fountain: "Fountain", grove: "Sacred Grove", island: "Island", palace: "Palace", altar: "Altar", tower: "Tower", egate: "Earthly Gate", xgate: "Enchanted Gate" };
export const AREA_FX = {
  chapel: "+2 Prowess to you in a magic/warrior contest fought here.",
  castle: "+2 Strength to a denizen that has Strength; the King's seat and a victory spot.",
  grove: "+1 Prowess to a denizen that has Prowess.",
  fountain: "Drink to be swept away to the Tower or a Gate.",
  cave: "Enter with the Golden Bough to draw a card; Guyon's goal.",
  island: "An island glade within the water.",
  palace: "Two cards are drawn here.", altar: "Two cards are drawn here; the Pilgrim's goal.",
  tower: "Prison & sanctuary. Escape on 5–6, or freed on the 4th turn.<br>No fighting here.",
  egate: "The Earthly Gate — where knights start.", xgate: "The Enchanted Gate — leave here once your quest is done to win.",
};
