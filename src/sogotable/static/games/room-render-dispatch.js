// Room render dispatch for ctx-bag games: maps a game id to the render function
// that takes the shared ctx bag (host, game, room, started, makeMove, …; see
// docs/game-integration-spec.md §4.5). The shell builds the ctx once and asks
// this table which renderer to call — adding a game is one import + one row
// here instead of growing the shell's predicate chains. Presentation routing
// only: no rules, no state.
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

const CTX_RENDERERS = new Map([
  [GAME_IDS.yahtzee, renderYahtzeeGame],
  [GAME_IDS.mazewright, renderMazewrightGame],
  [GAME_IDS.rtta, renderRttaGame],
  [GAME_IDS.zombieDice, renderZombieDiceGame],
  [GAME_IDS.liarsDice, renderLiarsDiceGame],
  [GAME_IDS.noThanks, renderNoThanksGame],
  [GAME_IDS.hearts, renderHeartsGame],
  [GAME_IDS.potionLab, renderPotionLabGame],
  [GAME_IDS.mysticWood, renderMysticWoodGame],
  [GAME_IDS.wnyk, renderWnykGame],
  [GAME_IDS.realmwright, renderRealmwrightGame],
  [GAME_IDS.chineseCheckers, renderChineseCheckersGame],
  [GAME_IDS.lastOrders, renderLastOrdersGame],
  [GAME_IDS.tracklayers, renderTracklayersGame],
]);

// The ctx-bag renderer for this room game, or null for games the shell still
// renders itself. `canonicalGameId` resolves aliases (passed in by the shell).
export function ctxRendererFor(game, canonicalGameId) {
  if (!game || !game.game_id) return null;
  return CTX_RENDERERS.get(canonicalGameId(game.game_id)) || null;
}
