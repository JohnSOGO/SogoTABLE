// Realmwright — descriptive metadata. The opaque id + aliases live in
// games/registry.js (the runtime source of truth); this carries the richer
// shape and is reconciled to exactly one registry entry by the architecture
// test. timingMode "liveRound" = everyone places one tile per round at once.
// The display name is pinned equal to the registry name — rename both together
// (all other user-facing words live in branding.js).
export const realmwrightManifest = {
  id: "realmwright",
  name: "🏰 Realmwright",
  description: "An original tile-laying realm builder: everyone lays a land tile at once each round, joining roads, walling cities, and claiming them with meeples.",
  minPlayers: 1,
  maxPlayers: 12,
  timingMode: "liveRound",
  capabilities: ["hosted", "liveRound", "bot", "simultaneous", "sharedBoard"],
};
