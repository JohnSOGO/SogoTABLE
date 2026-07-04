// Module metadata for No Thanks! (descriptive; registration is via registry.js).
export const noThanksManifest = {
  id: "no-thanks", // registry alias — resolves to the opaque GAME_IDS.noThanks
  name: "🃏 No Thanks!",
  description:
    "The classic press-your-luck card auction: one card is up at a time, and you either pay a " +
    "chip to say NO THANKS or take the card with every chip riding on it. Runs of consecutive " +
    "cards only count their lowest card, chips subtract, lowest total wins. Chip stacks are " +
    "secret — multi-phone only: your chips stay on your own screen.",
  minPlayers: 3,
  maxPlayers: 7,
  timingMode: "turnBased", // strict clockwise decisions (hidden-info, Battleship-style projection)
  capabilities: ["hosted", "bot", "hiddenInfo"],
};
