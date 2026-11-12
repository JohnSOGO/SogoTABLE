// Last Orders — descriptive metadata. The opaque id + aliases live in
// games/registry.js (the runtime source of truth); this carries the richer
// shape and is reconciled to exactly one registry entry by the architecture
// test. timingMode "turnBased": classic turns around the table, with timed
// reaction windows anyone can answer. The display name is pinned equal to the
// registry name — rename both together (other words live in branding.js).
export const lastOrdersManifest = {
  id: "last_orders",
  name: "🍻 Last Orders",
  description: "An original tavern-brawl card game: pick a patron with their own deck, brawl, buy rivals drinks, gamble, and answer tricks in timed reaction windows. Last one standing wins.",
  minPlayers: 2,
  maxPlayers: 8,
  timingMode: "turnBased",
  capabilities: ["hosted", "bot", "hiddenHand", "reactionWindows", "expansions"],
};
