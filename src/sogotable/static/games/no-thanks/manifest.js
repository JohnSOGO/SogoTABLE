// Module metadata for No Thanks! (descriptive; registration is via registry.js).
export const noThanksManifest = {
  id: "no-thanks", // registry alias — resolves to the opaque GAME_IDS.noThanks
  name: "🃏 No Thanks!",
  description:
    "The classic press-your-luck card auction: one card is up at a time, and you either pay a " +
    "chip to say NO THANKS or take the card with every chip riding on it. Runs of consecutive " +
    "cards only count their lowest card, chips subtract, lowest total wins. Chip stacks are " +
    "secret — multi-phone only: your chips stay on your own screen. N-player, 3-seat minimum " +
    "(bots fill the gaps).",
  minPlayers: 3,
  maxPlayers: 20, // N-player (the RTTA convention): no engine ceiling; 8+ seats keep the 7-chip stack as a house rule
  timingMode: "turnBased", // strict clockwise decisions (hidden-info, Battleship-style projection)
  capabilities: ["hosted", "bot", "hiddenInfo"],
};
