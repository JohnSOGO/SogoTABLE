// Reserved test players — fixed, hidden identities the integration/export tooling
// uses (e.g. the bug-report export script seats one). A tiny cross-cutting owner
// because the concept straddles two domains: auth skips owner-token checks for
// them, and player projection hides them from public rosters. Kept in one place
// so neither domain re-derives the id set.
export const RESERVED_TEST_PLAYERS = [
  { id: "codex-test-player-1", name: "Codex Test 1", icon: "🧪", color: "#4f46e5", kind: "test", hidden: true },
  { id: "codex-test-player-2", name: "Codex Test 2", icon: "🧪", color: "#be123c", kind: "test", hidden: true },
];
export const RESERVED_TEST_PLAYER_IDS = new Set(RESERVED_TEST_PLAYERS.map((player) => player.id));

export function reservedTestPlayerFromId(playerId) {
  return RESERVED_TEST_PLAYERS.find((player) => player.id === playerId) || null;
}
