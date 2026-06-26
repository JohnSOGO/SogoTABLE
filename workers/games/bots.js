// Shared bot helpers used by the Worker and by per-game rules modules. Pure,
// imports nothing from the Worker (so no circular dependency). The Overlord is
// the top bot tier; both Battleship (fleet/targeting) and the difficulty label
// key off it.
export const OVERLORD_BOT_ID = "0f8a3c9d1e72";

export function isOverlordBot(bot) {
  return Boolean(bot && (bot.bot_id === OVERLORD_BOT_ID || bot.id === OVERLORD_BOT_ID));
}
