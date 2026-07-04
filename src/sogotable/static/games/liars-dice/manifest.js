// Module metadata for Liar's Dice (descriptive; registration is via registry.js).
export const liarsDiceManifest = {
  id: "liars-dice", // registry alias — resolves to the opaque GAME_IDS.liarsDice
  name: "🤥 Liar's Dice 🎲",
  description:
    "Classic bluffing dice: everyone rolls a hidden cup, bids climb on how many of a face are " +
    "on the whole table (ones are wild), and a LIAR call turns every die face-up — whoever was " +
    "wrong loses a die. Run out and you're out; the last player holding dice wins. " +
    "Multi-phone only: each player's cup stays on their own screen.",
  minPlayers: 2,
  maxPlayers: 8,
  timingMode: "turnBased", // strict turn order around the table (hidden-info, Battleship-style projection)
  capabilities: ["hosted", "bot", "hiddenInfo"],
};
