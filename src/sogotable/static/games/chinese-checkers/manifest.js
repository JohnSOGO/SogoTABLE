// Chinese Checkers — descriptive metadata. The opaque id + aliases live in
// games/registry.js (the runtime source of truth); this carries the richer
// shape and is reconciled to exactly one registry entry (via the
// "chinese_checkers" alias) by the architecture test. timingMode
// "simultaneousSubmit" = every seat commits one hidden move per round and the
// round resolves in rotating priority order (see PLAN.md).
// The display name is pinned equal to the registry name — rename both together
// (all other user-facing words live in branding.js).
export const chineseCheckersManifest = {
  id: "chinese_checkers",
  name: "⭐ Chinese Checkers",
  description: "Race your marbles across the star by stepping and chaining hops. Everyone moves at the same time each round; ties go to the rotating priority seat.",
  minPlayers: 2,
  maxPlayers: 6,
  timingMode: "simultaneousSubmit",
  capabilities: ["hosted", "bot", "simultaneous", "sharedBoard"],
};
