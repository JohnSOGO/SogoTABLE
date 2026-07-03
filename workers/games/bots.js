// Shared bot helpers used by the Worker and by per-game rules modules. Pure,
// imports nothing from the Worker (so no circular dependency). The Overlord is
// the top bot tier; both Battleship (fleet/targeting) and the difficulty label
// key off it.
export const OVERLORD_BOT_ID = "0f8a3c9d1e72";

export function isOverlordBot(bot) {
  return Boolean(bot && (bot.bot_id === OVERLORD_BOT_ID || bot.id === OVERLORD_BOT_ID));
}

// The bot roster + seat predicate moved here from the Worker entry when
// workers/stats.js was extracted (both the Worker and stats need them).
export const BOT_DEFINITIONS = [
  { id: "7c91a4e2b6d0", name: "Sprout", icon: "\uD83C\uDF31", color: "#16a34a", rating: 900, strategy: "random", difficulty: "novice", difficulty_label: "Novice" },
  { id: "5e2c8a71d0f4", name: "Buddy", icon: "\uD83E\uDD1D", color: "#2563eb", rating: 980, strategy: "random", difficulty: "casual", difficulty_label: "Casual" },
  { id: "b64d20f19a8c", name: "Cipher", icon: "\uD83D\uDD11", color: "#7c3aed", rating: 1100, strategy: "smart", difficulty: "strategist", difficulty_label: "Strategist" },
  { id: "0f8a3c9d1e72", name: "Overlord", icon: "\uD83D\uDC51", color: "#dc2626", rating: 1250, strategy: "smart", difficulty: "master", difficulty_label: "Master" },
];

export function isBotSeat(seat) {
  return Boolean(seat && seat.kind === "bot");
}
