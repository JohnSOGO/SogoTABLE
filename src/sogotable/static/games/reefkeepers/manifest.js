// Reefkeepers — descriptive metadata. The opaque id + aliases live in
// games/registry.js (the runtime source of truth); this carries the richer
// shape and is reconciled to exactly one registry entry by the architecture
// test. timingMode "simultaneousSubmit" = everyone places + ranks at once and
// the round resolves when the barrier closes. The display name is pinned equal
// to the registry name — rename both together (all other user-facing words
// live in branding.js).
export const reefkeepersManifest = {
  id: "reefkeepers",
  name: "🐚 Reefkeepers",
  description: "An original domino-drafting reef builder: everyone places last round's tile and ranks the tiles they want at the same time, growing a 5×5 reef around their Grotto. Score each habitat patch: cells × pearls.",
  minPlayers: 1,
  maxPlayers: 8,
  timingMode: "simultaneousSubmit",
  capabilities: ["hosted", "bot", "simultaneous"],
};
