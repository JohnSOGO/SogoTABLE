export const rttaManifest = {
  id: "rtta",
  name: "Roll Through the Ages",
  description: "Build cities, raise monuments, and buy developments across a shared Bronze Age — everyone plays their turn at once, then the round resolves together.",
  minPlayers: 1,
  maxPlayers: 20,   // N-player: each seat runs an independent board; the only couplings (monument race, disasters) scale to any N
  timingMode: "liveRound",   // simultaneous turns + a per-round barrier before advancing
  capabilities: ["hosted", "liveRound", "bot", "simultaneous", "crossPlayer"],
};
