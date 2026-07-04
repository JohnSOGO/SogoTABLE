// Client game-kind predicates: classify a room `game` blob by its game id
// (with structural fallbacks for the paper/board games). Pure leaf module — no
// DOM, no transport, no shell/ctx object. The shell injects its own
// `canonicalGameId` (which resolves aliases against the live, server-fetched
// games list) via createGameKinds, so these stay behavior-identical to the
// inline definitions they replaced while never importing app.js back.
import { GAME_IDS } from "./registry.js";

export function createGameKinds(canonicalGameId) {
  const isTacticalGameState = (game) =>
    Boolean(game && (canonicalGameId(game.game_id) === GAME_IDS.tactical || Array.isArray(game.pickups)));
  const isBoxesGameState = (game) =>
    Boolean(game && (canonicalGameId(game.game_id) === GAME_IDS.boxes || Array.isArray(game.lines) && Array.isArray(game.boxes)));
  const isBattleshipGameState = (game) =>
    Boolean(game && (canonicalGameId(game.game_id) === GAME_IDS.battleship || game.phase === "setup" && game.players && game.fleet));
  const isQuoridorGameState = (game) =>
    Boolean(game && (canonicalGameId(game.game_id) === GAME_IDS.quoridor || game.pawns && game.walls_remaining && Array.isArray(game.walls)));
  const isTenThousandGameState = (game) =>
    Boolean(game && canonicalGameId(game.game_id) === GAME_IDS.tenThousand);
  const isYahtzeeGameState = (game) =>
    Boolean(game && canonicalGameId(game.game_id) === GAME_IDS.yahtzee);
  const isMazewrightGameState = (game) =>
    Boolean(game && canonicalGameId(game.game_id) === GAME_IDS.mazewright);
  const isRttaGameState = (game) =>
    Boolean(game && canonicalGameId(game.game_id) === GAME_IDS.rtta);
  const isZombieDiceGameState = (game) =>
    Boolean(game && canonicalGameId(game.game_id) === GAME_IDS.zombieDice);
  const isLiarsDiceGameState = (game) =>
    Boolean(game && canonicalGameId(game.game_id) === GAME_IDS.liarsDice);
  return {
    isTacticalGameState,
    isBoxesGameState,
    isBattleshipGameState,
    isQuoridorGameState,
    isTenThousandGameState,
    isYahtzeeGameState,
    isMazewrightGameState,
    isRttaGameState,
    isZombieDiceGameState,
    isLiarsDiceGameState,
  };
}
