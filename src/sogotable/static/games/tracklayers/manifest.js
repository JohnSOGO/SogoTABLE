// Tracklayers — descriptive metadata. The opaque id + aliases live in
// games/registry.js (the runtime source of truth); this carries the richer
// shape and is reconciled to exactly one registry entry by the architecture
// test. timingMode "simultaneousSubmit" = every seat commits one hidden action
// per round and the round resolves at the barrier in a rotating priority order.
// The display name is pinned equal to the registry name — rename both together
// (all other user-facing words live in branding.js).
export const tracklayersManifest = {
  id: "tracklayers",
  name: "🚂 Tracklayers",
  description: "An original train-route game: collect coloured rail cards, claim routes across the Lantern Isles and link the cities on your secret tickets. Everyone acts at once each round; the longest line earns a bonus.",
  minPlayers: 2,
  maxPlayers: 5,
  timingMode: "simultaneousSubmit",
  capabilities: ["hosted", "simultaneousSubmit", "bot", "simultaneous", "sharedBoard", "hiddenHands"],
};
