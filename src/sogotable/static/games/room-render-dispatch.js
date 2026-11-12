// Host-start game render dispatch: which per-game `render*Game` draws a started
// (or lobby) host-start room. Pure leaf — no DOM, no transport, no shell state;
// it only maps a room `game` blob to a render function. Game-kind predicates
// are injected (the shell's createGameKinds result) so alias resolution keeps
// tracking the live games list, and this module never imports app.js.
//
// Adding a host-start game: import its render and add one row below.
import { renderZombieDiceGame } from "./zombie-dice/render.js";
import { renderLiarsDiceGame } from "./liars-dice/render.js";
import { renderNoThanksGame } from "./no-thanks/render.js";
import { renderHeartsGame } from "./hearts/render.js";
import { renderYahtzeeGame } from "./yahtzee/render.js";
import { renderMazewrightGame } from "./mazewright/render.js";
import { renderRttaGame } from "./rtta/render.js";
import { renderPotionLabGame } from "./potion-lab/render.js";
import { renderRealmwrightGame } from "./realmwright/render.js";
import { renderLastOrdersGame } from "./last-orders/render.js";
import { renderTracklayersGame } from "./tracklayers/render.js";
import { renderReefkeepersGame } from "./reefkeepers/render.js";
import { renderChineseCheckersGame } from "./chinese-checkers/render.js";
import { renderMysticWoodGame } from "./mystic-wood/render.js";
import { renderWnykGame } from "./wnyk/render.js";

// Order is the dispatch order; first matching predicate wins. Yahtzee is last
// (it was the chooser's fallback).
export const HOST_START_RENDERERS = [
  { is: "isMazewrightGameState", render: renderMazewrightGame },
  { is: "isRttaGameState", render: renderRttaGame },
  { is: "isZombieDiceGameState", render: renderZombieDiceGame },
  { is: "isLiarsDiceGameState", render: renderLiarsDiceGame },
  { is: "isNoThanksGameState", render: renderNoThanksGame },
  { is: "isHeartsGameState", render: renderHeartsGame },
  { is: "isPotionLabGameState", render: renderPotionLabGame },
  { is: "isMysticWoodGameState", render: renderMysticWoodGame },
  { is: "isWnykGameState", render: renderWnykGame },
  { is: "isRealmwrightGameState", render: renderRealmwrightGame },
  { is: "isChineseCheckersGameState", render: renderChineseCheckersGame },
  { is: "isLastOrdersGameState", render: renderLastOrdersGame },
  { is: "isTracklayersGameState", render: renderTracklayersGame },
  { is: "isReefkeepersGameState", render: renderReefkeepersGame },
  { is: "isYahtzeeGameState", render: renderYahtzeeGame },
];

// Returns the render function for a host-start game, or null when `game` is not
// a host-start game (the shell then falls through to its legacy branches).
export function pickHostStartRenderer(game, kinds) {
  const row = HOST_START_RENDERERS.find(({ is }) => kinds[is](game));
  return row ? row.render : null;
}
