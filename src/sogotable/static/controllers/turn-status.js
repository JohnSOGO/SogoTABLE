// Room turn banner + player-switch strip: the "whose turn" text (#turnStatus,
// with the tactical-event sub-line) and the seat labels above the board
// (#gamePlayerSwitch, with the current-turn tint and tactical scores). Presentation
// only — reads the prepared room snapshot; it never decides legality. The shell
// wires it once via wireTurnStatus(ctx) and imports showTurnStatus /
// setTurnStatusText / renderGamePlayerSwitch.
import { getContrastAwareTextColor, colorWithAlpha, mixColorWithWhite } from "../color-utils.js";
import { avatarHtml, escapeHtml } from "../html-utils.js";
import { getSelectedPlayerId } from "../client/session-store.js";

// ctx (from app.js): getRoom, getPendingMove, rerender, isBotPlayer,
// setTurnColorVariables, safePlayerColor, the Battleship review-mark hooks
// (visibleBattleshipPlayerMark, getBattleshipReviewMark, setBattleshipReviewMark)
// and the game-kind predicates the strip/banner branch on.
let ctx = null;

export function wireTurnStatus(context) {
  ctx = context;
}

export function renderGamePlayerSwitch() {
  const currentRoom = ctx.getRoom();
  const host = document.getElementById("gamePlayerSwitch");
  host.innerHTML = "";
  if (!currentRoom || !currentRoom.started) return;
  if (ctx.isTenThousandGameState(currentRoom.game) || ctx.isYahtzeeGameState(currentRoom.game) || ctx.isMazewrightGameState(currentRoom.game) || ctx.isRttaGameState(currentRoom.game) || ctx.isZombieDiceGameState(currentRoom.game) || ctx.isLiarsDiceGameState(currentRoom.game) || ctx.isNoThanksGameState(currentRoom.game) || ctx.isHeartsGameState(currentRoom.game) || ctx.isPotionLabGameState(currentRoom.game) || ctx.isMysticWoodGameState(currentRoom.game) || ctx.isRealmwrightGameState(currentRoom.game) || ctx.isChineseCheckersGameState(currentRoom.game) || ctx.isLastOrdersGameState(currentRoom.game) || ctx.isTracklayersGameState(currentRoom.game) || ctx.isReefkeepersGameState(currentRoom.game) || ctx.isHiddenIslesGameState(currentRoom.game)) {
    host.classList.add("hidden");
    return;
  }
  host.classList.remove("hidden");
  const isBattleship = ctx.isBattleshipGameState(currentRoom.game);
  const isBattleshipReview = isBattleship && currentRoom.game && currentRoom.game.phase === "complete";
  const battleshipActiveMark = isBattleship && !isBattleshipReview ? ctx.visibleBattleshipPlayerMark(currentRoom) : "";

  currentRoom.players.forEach((roomPlayer) => {
    const isCurrentTurn = roomPlayer.mark === currentRoom.game.current_player && currentRoom.game.status === "playing";
    const isVisibleBattleshipPlayer = Boolean(battleshipActiveMark && roomPlayer.mark === battleshipActiveMark);
    const highlighted = isBattleship && !isBattleshipReview ? isVisibleBattleshipPlayer : isCurrentTurn;
    const scoreText = tacticalScoreText(roomPlayer);
    const label = document.createElement(isBattleshipReview ? "button" : "div");
    if (isBattleshipReview) label.type = "button";
    const selectedReview = isBattleshipReview && roomPlayer.mark === (ctx.getBattleshipReviewMark() || currentRoom.players[0].mark);
    label.className = `player-switch-button ${highlighted ? "current-turn" : ""} ${selectedReview ? "current-turn" : ""}`;
    label.setAttribute("aria-current", highlighted ? "true" : "false");
    if (highlighted || selectedReview) applyPlayerLabelTurnColor(label, roomPlayer);
    label.innerHTML = `${avatarHtml(roomPlayer)}<span>${escapeHtml(roomPlayer.name)}${scoreText}</span>`;
    if (isBattleshipReview) {
      label.setAttribute("aria-pressed", selectedReview ? "true" : "false");
      label.addEventListener("click", () => {
        ctx.setBattleshipReviewMark(roomPlayer.mark);
        ctx.rerender();
      });
    }
    host.appendChild(label);
  });
}

function applyPlayerLabelTurnColor(element, player) {
  if (!element || !player) return;
  const playerColor = ctx.safePlayerColor(player);
  const background = mixColorWithWhite(playerColor, 0.16);
  element.style.background = background;
  element.style.borderColor = mixColorWithWhite(playerColor, 0.64);
  element.style.color = getContrastAwareTextColor(background);
  element.style.boxShadow = `0 0 0 2px ${colorWithAlpha(playerColor, 0.18)}`;
}

export function showTurnStatus(currentPlayer, overrideText = "") {
  const currentRoom = ctx.getRoom();
  const host = document.getElementById("turnStatus");
  if (!host) return;
  host.classList.remove("your-turn", "waiting");
  ctx.setTurnColorVariables(host, currentPlayer ? currentPlayer.color : "#1f7a5f");
  if (overrideText) {
    host.textContent = overrideText;
    return;
  }
  const selectedSeat = currentRoom.players.find((player) => player.id === getSelectedPlayerId());
  if (!selectedSeat) {
    host.textContent = "Select your player.";
    host.classList.add("waiting");
    return;
  }
  if (selectedSeat.mark === currentRoom.game.current_player) {
    ctx.setTurnColorVariables(host, selectedSeat.color);
    const moveText = ctx.isBattleshipGameState(currentRoom.game)
      ? `It's your turn, ${selectedSeat.name}.`
      : `It's Your Turn ${selectedSeat.name}; Place an ${selectedSeat.mark}`;
    setTurnStatusText(host, ctx.getPendingMove() ? "Placing move..." : moveText);
    host.classList.add("your-turn");
    return;
  }
  const waitingText = ctx.isBotPlayer(currentPlayer)
    ? `${currentPlayer.name} is thinking...`
    : `Waiting for ${currentPlayer ? currentPlayer.name : ctx.isBattleshipGameState(currentRoom.game) ? "the other player" : currentRoom.game.current_player}.`;
  setTurnStatusText(host, waitingText);
  host.classList.add("waiting");
}

export function setTurnStatusText(host, text) {
  const eventText = tacticalEventText();
  if (!eventText) {
    host.textContent = text;
    return;
  }
  host.innerHTML = `<span>${escapeHtml(text)}</span><small>${escapeHtml(eventText)}</small>`;
}

function tacticalScoreText(roomPlayer) {
  const currentRoom = ctx.getRoom();
  if (!ctx.isTacticalGameState(currentRoom && currentRoom.game) || !roomPlayer.mark) return "";
  const score = Number(currentRoom.game.scores && currentRoom.game.scores[roomPlayer.mark] || 0);
  return ` <em>${score}</em>`;
}

function tacticalEventText() {
  const currentRoom = ctx.getRoom();
  if (!ctx.isTacticalGameState(currentRoom && currentRoom.game) || !currentRoom.game.last_event) return "";
  const event = currentRoom.game.last_event;
  if (event.type === "pickupCaptured") {
    const player = currentRoom.players.find((seat) => seat.mark === event.player);
    return `${player ? player.name : event.player} captured ${event.emoji || ""} ${event.pickup_label || "Pickup"}! +${event.points}`;
  }
  if (event.type === "sectorCaptured") {
    const player = currentRoom.players.find((seat) => seat.mark === event.player);
    return `${player ? player.name : event.player} captured Sector ${Number(event.sector) + 1}.`;
  }
  return "";
}
