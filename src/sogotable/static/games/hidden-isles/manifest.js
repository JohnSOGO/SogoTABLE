// Hidden Isles — descriptive metadata. The opaque id + aliases live in
// games/registry.js (the runtime source of truth); this carries the richer
// shape and is reconciled to exactly one registry entry by the architecture
// test. The display name is pinned equal to the registry name — rename both
// together (all other user-facing words live in branding.js).
export const hiddenIslesManifest = {
  id: "hidden_isles",
  name: "🗺️ Hidden Isles",
  description: "An original team word-clue game: two crews race to find their islands on a 5×5 sea chart of words. Each crew's Navigator gives one-word clues — and nobody wants to wake the Kraken.",
  minPlayers: 4,
  maxPlayers: 12,
  timingMode: "turnBased",
  capabilities: ["hosted", "bot", "teams", "hiddenInfo", "liveRound"],
};
