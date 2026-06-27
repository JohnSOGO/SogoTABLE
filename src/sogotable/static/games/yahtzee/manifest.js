export const yahtzeeManifest = {
  id: "yahtzee",
  name: "Yahtzee",
  description: "Roll five dice, fill your scorecard, and chase the high score — everyone plays their own game in parallel.",
  minPlayers: 1,
  maxPlayers: 6,
  timingMode: "gameLocked",   // async multiplayer solitaire: N independent games + shared leaderboard
  capabilities: ["hosted", "gameLocked", "bot", "series", "deterministic"],
};
