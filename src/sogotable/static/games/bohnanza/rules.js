import {
  drawCards,
  normalizeCard,
  normalizeField,
  normalizePlayer,
  normalizeState,
} from "./state.js";

export function getLegalActions(state) {
  const current = normalizeState(state);
  if (current.phase === "setup") {
    return [{ type: "start_game", label: "Start game" }];
  }
  if (current.phase === "complete") return [];
  const actions = [];
  const activePlayer = getActivePlayer(current);
  if (!activePlayer) return actions;
  if (!current.turn.plantedFrontCard && activePlayer.hand.length) {
    actions.push({ type: "plant_front", label: "Plant front card" });
  }
  if (current.turn.plantedFrontCard && !current.turn.marketRevealed) {
    actions.push({ type: "reveal_market", label: "Reveal market cards" });
  }
  if (current.turn.marketRevealed && current.market.length) {
    actions.push({ type: "plant_market_card", label: "Plant market card" });
  }
  if (activePlayer.fields.some((field) => field.length)) {
    actions.push({ type: "harvest_field", label: "Harvest field" });
  }
  if (current.turn.marketRevealed) {
    actions.push({ type: "end_turn", label: "End turn" });
  }
  return actions;
}

export function applyAction(state, action) {
  const current = normalizeState(state);
  if (!action || !action.type) throw new Error("Action type is required.");
  if (current.phase === "setup" && action.type === "start_game") {
    return startGame(current);
  }
  if (current.phase === "complete") {
    throw new Error("The game is already complete.");
  }
  const playerIndex = current.activePlayerIndex;
  const activePlayer = current.players[playerIndex];
  if (!activePlayer) throw new Error("No active player.");

  if (action.type === "plant_front") {
    return plantFrontCard(current, activePlayer, playerIndex);
  }
  if (action.type === "reveal_market") {
    return revealMarketCards(current);
  }
  if (action.type === "plant_market_card") {
    return plantMarketCard(current, activePlayer, action.marketIndex);
  }
  if (action.type === "harvest_field") {
    return harvestField(current, activePlayer, action.fieldIndex);
  }
  if (action.type === "end_turn") {
    return endTurn(current);
  }
  throw new Error(`Illegal action for phase ${current.phase}: ${action.type}`);
}

export function getPublicView(state) {
  const current = normalizeState(state);
  return {
    gameId: current.gameId,
    phase: current.phase,
    round: current.round,
    activePlayerIndex: current.activePlayerIndex,
    deckCount: current.drawPile.length,
    discardCount: current.discardPile.length,
    market: current.market.map(normalizeCard),
    turn: { ...current.turn },
    players: current.players.map((player) => ({
      id: player.id,
      seat: player.seat,
      playerNumber: player.playerNumber,
      name: player.name,
      score: Number(player.score || 0),
      handCount: Array.isArray(player.hand) ? player.hand.length : 0,
      fields: player.fields.map((field) => ({
        beanId: field[0]?.beanId || "",
        beanName: field[0]?.beanName || "Empty",
        color: field[0]?.color || "#d1d5db",
        count: field.length,
      })),
    })),
    log: current.log.slice(-20),
  };
}

export function isGameOver(state) {
  return normalizeState(state).phase === "complete";
}

export function getScore(state) {
  return normalizeState(state).players.map((player) => ({
    playerId: player.id,
    score: Number(player.score || 0),
  }));
}

function startGame(state) {
  const current = normalizeState(state);
  if (current.players.length < 2) throw new Error("Need at least two players.");
  return {
    ...current,
    phase: "play",
    activePlayerIndex: 0,
    round: 1,
    turn: {
      plantedFrontCard: false,
      marketRevealed: false,
      cardsRemainingToReveal: 2,
    },
    log: [...current.log, { type: "start_game" }],
  };
}

function plantFrontCard(state, activePlayer, playerIndex) {
  const hand = activePlayer.hand.slice();
  if (state.turn.plantedFrontCard) throw new Error("The front card has already been planted this turn.");
  if (!hand.length) throw new Error("No cards in hand.");
  const card = hand.shift();
  const nextState = placeCardIntoPlayerField(state, playerIndex, card, hand);
  const withMarket = revealMarketCards({
    ...nextState,
    turn: {
      ...nextState.turn,
      plantedFrontCard: true,
      marketRevealed: false,
      cardsRemainingToReveal: 2,
    },
  }, true);
  return {
    ...withMarket,
    phase: "play",
    turn: {
      ...withMarket.turn,
      plantedFrontCard: true,
      marketRevealed: true,
    },
    log: [...withMarket.log, { type: "plant_front", playerId: activePlayer.id, card: normalizeCard(card) }],
  };
}

function revealMarketCards(state, silent = false) {
  const current = normalizeState(state);
  if (!current.turn.plantedFrontCard) throw new Error("Plant the front card before revealing market cards.");
  if (current.turn.marketRevealed && !silent) throw new Error("The market is already revealed.");
  const drawResult = drawCards(current.drawPile, 2);
  const market = current.market.concat(drawResult.drawn.map(normalizeCard));
  return {
    ...current,
    drawPile: drawResult.deck,
    market,
    turn: {
      ...current.turn,
      marketRevealed: true,
      cardsRemainingToReveal: 0,
    },
    log: silent ? current.log : [...current.log, { type: "reveal_market", cards: drawResult.drawn.map(normalizeCard) }],
  };
}

function plantMarketCard(state, activePlayer, marketIndex = 0) {
  const current = normalizeState(state);
  if (!current.turn.marketRevealed) throw new Error("Reveal the market before planting market cards.");
  if (!current.market.length) throw new Error("No market cards to plant.");
  const index = Number.isFinite(Number(marketIndex)) ? Number(marketIndex) : 0;
  const card = current.market[index];
  if (!card) throw new Error("Market card not found.");
  const nextState = placeCardIntoPlayerField(current, current.activePlayerIndex, card);
  const market = current.market.slice();
  market.splice(index, 1);
  return {
    ...nextState,
    market,
    log: [...nextState.log, { type: "plant_market_card", playerId: activePlayer.id, card: normalizeCard(card) }],
  };
}

function harvestField(state, activePlayer, fieldIndex = 0) {
  const current = normalizeState(state);
  const player = current.players[current.activePlayerIndex];
  const index = Number.isFinite(Number(fieldIndex)) ? Number(fieldIndex) : 0;
  const field = player.fields[index];
  if (!field || !field.length) throw new Error("That field is empty.");
  const harvestedCards = field.map(normalizeCard);
  const players = current.players.slice();
  const playerCopy = normalizePlayer(players[current.activePlayerIndex], current.activePlayerIndex);
  playerCopy.fields = player.fields.slice();
  playerCopy.fields[index] = [];
  playerCopy.score = Number(playerCopy.score || 0) + harvestedCards.length;
  players[current.activePlayerIndex] = playerCopy;
  return {
    ...current,
    players,
    discardPile: current.discardPile.concat(harvestedCards),
    log: [...current.log, { type: "harvest_field", playerId: activePlayer.id, fieldIndex: index, cards: harvestedCards }],
  };
}

function endTurn(state) {
  const current = normalizeState(state);
  if (!current.turn.marketRevealed) throw new Error("Finish the turn's plant-and-market phase before ending the turn.");
  const activeIndex = current.activePlayerIndex;
  const players = current.players.slice();
  const active = normalizePlayer(players[activeIndex], activeIndex);
  const nextActiveIndex = players.length ? (activeIndex + 1) % players.length : 0;
  const nextRound = nextActiveIndex === 0 ? current.round + 1 : current.round;
  const nextMarket = current.market.length
    ? current.discardPile.concat(current.market.map(normalizeCard))
    : current.discardPile;
  const nextState = {
    ...current,
    players,
    activePlayerIndex: nextActiveIndex,
    round: nextRound,
    drawPile: current.drawPile,
    discardPile: nextMarket,
    market: [],
    turn: {
      plantedFrontCard: false,
      marketRevealed: false,
      cardsRemainingToReveal: 2,
    },
    log: [...current.log, { type: "end_turn", playerId: active.id }],
  };
  if (!nextState.drawPile.length && nextState.players.every((player) => player.hand.length === 0)) {
    return {
      ...nextState,
      phase: "complete",
      log: [...nextState.log, { type: "game_over" }],
    };
  }
  return nextState;
}

function placeCardIntoPlayerField(state, playerIndex, card, nextHand = null) {
  const current = normalizeState(state);
  const players = current.players.slice();
  const player = normalizePlayer(players[playerIndex], playerIndex);
  const hand = nextHand ? nextHand.map(normalizeCard) : player.hand.slice();
  const fields = player.fields.map((field) => field.slice());
  let targetIndex = fields.findIndex((field) => field.length && field[0].beanId === card.beanId);
  if (targetIndex === -1) targetIndex = fields.findIndex((field) => !field.length);
  if (targetIndex === -1 && fields.length < 3) {
    fields.push([]);
    targetIndex = fields.length - 1;
  }
  if (targetIndex === -1) throw new Error("No available field. Harvest one first.");
  fields[targetIndex].push(normalizeCard(card));
  players[playerIndex] = {
    ...player,
    hand,
    fields,
  };
  return {
    ...current,
    players,
  };
}
