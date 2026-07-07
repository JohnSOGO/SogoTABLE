// Module metadata for The Mystic Wood (descriptive; registration is via registry.js).
export const mysticWoodManifest = {
  id: "mystic-wood",
  name: "The Mystic Wood",
  description:
    "Explore an ever-shifting 7×9 wood, fight or greet its denizens, gather Things and companions, " +
    "finish your knight's personal quest, and leave by the Enchanted Gate — or seize the Castle as King. " +
    "3–5 knights, bots fill empty seats.",
  minPlayers: 3,
  maxPlayers: 5,
  timingMode: "turnBased",
  capabilities: ["hosted", "turnBased", "bot", "sharedTable", "customBoard"],
};
