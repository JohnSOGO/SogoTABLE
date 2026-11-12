// Host-start room render dispatch: maps a room `game` blob to the per-game
// render function the shell calls for the shared host-start path (hide the
// generic players panel/turn status, then hand the board host to the game).
// A game-id-keyed table instead of an ever-growing predicate chain in app.js —
// adding a host-start game is one import + one row here. No DOM, no transport,
// no shell import: the shell injects its own `canonicalGameId` (alias
// resolution against the live games list), exactly as games/game-kinds.js does.
import { GAME_IDS } from "./registry.js";
import { renderYahtzeeGame } from "./yahtzee/render.js";
import { renderMazewrightGame } from "./mazewright/render.js";
import { renderRttaGame } from "./rtta/render.js";
import { renderZombieDiceGame } from "./zombie-dice/render.js";
import { renderLiarsDiceGame } from "./liars-dice/render.js";
import { renderNoThanksGame } from "./no-thanks/render.js";
import { renderHeartsGame } from "./hearts/render.js";
import { renderPotionLabGame } from "./potion-lab/render.js";
import { renderMysticWoodGame } from "./mystic-wood/render.js";
import { renderWnykGame } from "./wnyk/render.js";
import { renderRealmwrightGame } from "./realmwright/render.js";
import { renderChineseCheckersGame } from "./chinese-checkers/render.js";
import { renderLastOrdersGame } from "./last-orders/render.js";
import { renderTracklayersGame } from "./tracklayers/render.js";
import { renderTradewindsGame } from "./tradewinds/render.js";

const HOST_START_RENDERERS = {
  [GAME_IDS.yahtzee]: renderYahtzeeGame,
  [GAME_IDS.mazewright]: renderMazewrightGame,
  [GAME_IDS.rtta]: renderRttaGame,
  [GAME_IDS.zombieDice]: renderZombieDiceGame,
  [GAME_IDS.liarsDice]: renderLiarsDiceGame,
  [GAME_IDS.noThanks]: renderNoThanksGame,
  [GAME_IDS.hearts]: renderHeartsGame,
  [GAME_IDS.potionLab]: renderPotionLabGame,
  [GAME_IDS.mysticWood]: renderMysticWoodGame,
  [GAME_IDS.wnyk]: renderWnykGame,
  [GAME_IDS.realmwright]: renderRealmwrightGame,
  [GAME_IDS.chineseCheckers]: renderChineseCheckersGame,
  [GAME_IDS.lastOrders]: renderLastOrdersGame,
  [GAME_IDS.tracklayers]: renderTracklayersGame,
  [GAME_IDS.tradewinds]: renderTradewindsGame,
};

// Returns the host-start render function for `game`, or null when the game does
// not use the shared host-start render path.
export function hostStartRendererFor(game, canonicalGameId) {
  if (!game) return null;
  const id = canonicalGameId(game.game_id);
  return Object.prototype.hasOwnProperty.call(HOST_START_RENDERERS, id) ? HOST_START_RENDERERS[id] : null;
}
