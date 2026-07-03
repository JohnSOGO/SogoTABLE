// Module metadata for Mazewright (descriptive; registration is via registry.js).
export const mazewrightManifest = {
  id: "mazewright",
  name: "Mazewright",
  description:
    "Build a fog-of-war dungeon maze and hide loot, then everyone runs every player's maze blind. " +
    "Three prizes — Mazewright (opponents' extra moves over your maze's shortest escape, plus loot they took the bait on), " +
    "Mazerunner (fewest total moves), Treasure Hunter (most loot) — and a 5/3/3 rank composite crowns the champion.",
  minPlayers: 1,
  maxPlayers: 6,
  timingMode: "gameLocked",   // build barrier -> async runs -> leaderboard tally
  capabilities: ["hosted", "gameLocked", "bot", "series", "fogOfWar", "mazeCode"],
};
