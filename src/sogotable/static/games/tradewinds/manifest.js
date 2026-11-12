// Tradewind Isles — descriptive metadata. The opaque id + aliases live in
// games/registry.js (the runtime source of truth); this carries the richer
// shape and is reconciled to exactly one registry entry by the architecture
// test. timingMode "liveRound" = after the table roll everyone builds and
// trades at once; the first build the server receives wins a contested spot.
// The display name is pinned equal to the registry name — rename both together
// (all other user-facing words live in branding.js).
export const tradewindsManifest = {
  id: "tradewinds",
  name: "🏝️ Tradewind Isles",
  description: "An original island trading game: one roll feeds the whole table, then everyone builds boardwalks, huts and lodges at once, trades fruit for stone, and dodges the Mischief Monkey on the way to renown.",
  minPlayers: 2,
  maxPlayers: 6,
  timingMode: "liveRound",
  capabilities: ["hosted", "liveRound", "bot", "simultaneous", "sharedBoard", "hiddenHand"],
};
