// Bloomwork — descriptive metadata. The opaque id + aliases live in
// games/registry.js (the runtime source of truth); this carries the richer
// shape and is reconciled to exactly one registry entry by the architecture
// test. timingMode "simultaneousSubmit": every gardener picks at once each
// pick step and the step resolves at the barrier in a rotating priority
// order. The display name is pinned equal to the registry name — rename both
// together (every other word lives in branding.js).
export const bloomworkManifest = {
  id: "bloomwork",
  name: "🌷 Bloomwork",
  description: "An original flower-garden drafting game: everyone picks flowers from the market stalls at the same time, fills planter rows and grows a 5×5 garden bed. Flowers score for every neighbour they line up with; spills cost points on the compost heap.",
  minPlayers: 2,
  maxPlayers: 6,
  timingMode: "simultaneousSubmit",
  capabilities: ["hosted", "bot", "simultaneous"],
};
