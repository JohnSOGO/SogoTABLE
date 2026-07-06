// Potion Lab — descriptive metadata. The opaque id + aliases live in
// games/registry.js (the runtime source of truth); this carries the richer
// shape and is reconciled to exactly one registry entry by the architecture
// test. timingMode "liveRound" = simultaneous picks with a per-pick barrier.
export const potionLabManifest = {
  id: "potion_lab",
  name: "🧪 Potion Lab",
  description: "A Sushi Go!-style ingredient draft: keep one card, pass the rest, and brew the best-scoring shelf over three rounds.",
  minPlayers: 2,
  maxPlayers: 20,
  timingMode: "liveRound",
  capabilities: ["hosted", "liveRound", "bot", "simultaneous", "hiddenHand"],
};
