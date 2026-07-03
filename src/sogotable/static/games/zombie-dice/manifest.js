// Module metadata for Roll of the Dead (descriptive; registration is via registry.js).
export const zombieDiceManifest = {
  id: "zombie-dice", // registry alias — resolves to the opaque GAME_IDS.zombieDice
  name: "Roll of the Dead 🧟",
  description:
    "Push-your-luck zombie dice: draw three dice from the cup, eat brains, keep rolling or bank — " +
    "three shotguns and the turn scores nothing. 13 banked brains triggers the final round; " +
    "tied leaders (only) roll tiebreaker rounds until one shambles ahead.",
  minPlayers: 1,
  maxPlayers: 8,
  timingMode: "turnBased", // simultaneous per-seat rounds with a barrier (the 10,000 model)
  capabilities: ["hosted", "bot", "simultaneousRounds", "tiebreaker"],
};
