// Game catalog — metadata resolution over the shared registry: alias→canonical
// id, the public game-definition shape, and seat/timing queries (player count,
// solo, host-start). One owner for "what game is this and how is it shaped",
// derived from the single registry source. Pure lookups; no state, no I/O.
import { GAME_REGISTRY, GAME_IDS } from "../src/sogotable/static/games/registry.js";

export const GAME_DEFINITIONS = GAME_REGISTRY;
export const DEFAULT_GAME_ID = GAME_IDS.classic;

const GAME_ID_ALIASES = new Map();
GAME_DEFINITIONS.forEach((game) => {
  GAME_ID_ALIASES.set(game.id, game.id);
  (game.aliases || []).forEach((alias) => GAME_ID_ALIASES.set(alias, game.id));
});

export function cleanGameId(gameId) {
  const value = String(gameId || DEFAULT_GAME_ID).trim() || DEFAULT_GAME_ID;
  const canonical = GAME_ID_ALIASES.get(value);
  if (!canonical) throw new Error("Game is not available yet.");
  return canonical;
}

export function gameDefinitionFor(gameId) {
  const canonical = cleanGameId(gameId);
  return GAME_DEFINITIONS.find((game) => game.id === canonical);
}

export function publicGameDefinition(game) {
  const playerCount = playerCountForGame(game.id);
  return {
    id: game.id,
    name: game.name,
    summary: game.summary,
    players: game.players,
    category: game.category || null,
    player_count: Number.isFinite(playerCount) ? playerCount : null,
    status: game.status,
    availability: game.availability,
    aliases: [...(game.aliases || [])],
  };
}

export function gameIdsForLookup(gameId) {
  const game = gameDefinitionFor(gameId);
  return [game.id, ...(game.aliases || [])];
}

export function gameIdMatches(candidate, gameId) {
  return cleanGameId(candidate) === cleanGameId(gameId);
}

export function playerCountForGame(gameId) {
  const game = GAME_DEFINITIONS.find((item) => item.id === cleanGameId(gameId));
  const count = Number(game && game.player_count);
  if (Number.isFinite(count) && count > 0) return count;
  return game && game.host_start ? Number.POSITIVE_INFINITY : 2;
}

export function isSoloGameId(gameId) {
  return playerCountForGame(gameId) === 1;
}

// Host-start games seat a variable number of players and do not auto-activate;
// the host starts them explicitly. Seats get indexed marks (P1..PN) rather
// than the binary X/O the two-player games use.
export function gameUsesHostStart(gameId) {
  const game = GAME_DEFINITIONS.find((item) => item.id === cleanGameId(gameId));
  return Boolean(game && game.host_start);
}
