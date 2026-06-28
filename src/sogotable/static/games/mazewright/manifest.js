// Module metadata for Mazewright (descriptive; registration is via registry.js).
export const mazewrightManifest = {
  id: "mazewright",
  name: "Mazewright",
  description:
    "Build a fog-of-war dungeon maze and hide loot, then everyone runs every player's maze blind. " +
    "Score three prizes: Mazewright (most moves players lost in your maze), Mazerunner (fewest total moves), " +
    "Treasure Hunter (most loot).",
  minPlayers: 1,
  maxPlayers: 6,
  timingMode: "gameLocked",   // build barrier -> async runs -> leaderboard tally
  capabilities: ["hosted", "gameLocked", "bot", "series", "fogOfWar", "mazeCode"],
};
