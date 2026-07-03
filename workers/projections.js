// Public projections — shaping internal state into the public shapes the API
// returns. This owner starts with the player + bot views (the cluster that
// depends only on the reserved-test-player ids); room/stats projections can join
// later. Pure transforms: no state, no game decisions, no I/O. Extracted from the
// Worker entry so projection logic has a home instead of living among the routes.
import { RESERVED_TEST_PLAYER_IDS } from "./test-players.js";

export function isHiddenPlayer(player) {
  return Boolean(player && (player.hidden || player.kind === "test" || RESERVED_TEST_PLAYER_IDS.has(player.id)));
}

export function publicPlayers(data) {
  return (data.players || []).filter((player) => !isHiddenPlayer(player)).map(publicPlayer);
}

export function publicPlayer(player) {
  if (!player) return player;
  const { owner_token_hash, ...clean } = player;
  return { ...clean, claimed: Boolean(owner_token_hash) };
}

export function isHiddenTestRoom(room) {
  return Boolean(room && Array.isArray(room.players) && room.players.some(isHiddenPlayer));
}

// Room projection: derive the public room status from internal room state.
// Moved from the Worker entry when workers/stats.js was extracted (both need it).
export function roomStatus(room) {
  if (["x_won", "o_won", "draw", "complete"].includes(room.game.status)) return "completed";
  if (room.started) return "active";
  return "waiting_for_player";
}

export function publicBot(bot) {
  const botLevel = botDifficultyLevel(bot);
  return {
    id: bot.id,
    bot_id: bot.id,
    kind: "bot",
    name: bot.name,
    icon: bot.icon,
    color: bot.color,
    strategy: bot.strategy || "random",
    strategy_icon: bot.strategy === "smart" ? "🧠" : "🎲",
    strategy_label: bot.difficulty_label || (bot.strategy === "smart" ? "Smart move scoring" : "Random legal moves"),
    difficulty: bot.difficulty || "novice",
    difficulty_label: bot.difficulty_label || "Novice",
    bot_level: botLevel,
    level: botLevel,
  };
}

export function botDifficultyLevel(bot) {
  const difficulty = String(bot && bot.difficulty || "").toLowerCase();
  if (difficulty === "novice") return 1;
  if (difficulty === "casual") return 2;
  if (difficulty === "strategist") return 3;
  if (difficulty === "master") return 4;
  return 2;
}
