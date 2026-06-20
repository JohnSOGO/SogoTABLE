export const beanCatalog = [
  { id: "blue", name: "Blue Bean", color: "#2563eb", value: 1, copies: 18 },
  { id: "red", name: "Red Bean", color: "#dc2626", value: 2, copies: 16 },
  { id: "green", name: "Green Bean", color: "#16a34a", value: 3, copies: 14 },
  { id: "gold", name: "Gold Bean", color: "#ca8a04", value: 4, copies: 12 },
  { id: "purple", name: "Purple Bean", color: "#7c3aed", value: 5, copies: 10 },
  { id: "orange", name: "Orange Bean", color: "#f97316", value: 6, copies: 8 },
  { id: "brown", name: "Brown Bean", color: "#92400e", value: 7, copies: 6 },
  { id: "black", name: "Black Bean", color: "#111827", value: 8, copies: 4 },
];

export function createInitialState(playerIds = [], seed = Date.now()) {
  const players = playerIds.map((id, index) => ({
    id: String(id),
    seat: index + 1,
    playerNumber: index + 1,
    name: `Player ${index + 1}`,
    hand: [],
    fields: [],
    score: 0,
  }));
  const deck = shuffleDeck(buildDeck(), seed);
  const dealt = dealHands(deck, players, 5);
  return normalizeState({
    gameId: "bohnanza",
    phase: "setup",
    round: 1,
    activePlayerIndex: 0,
    seed,
    players: dealt.players,
    drawPile: dealt.deck,
    discardPile: [],
    market: [],
    log: [],
    turn: {
      plantedFrontCard: false,
      marketRevealed: false,
      cardsRemainingToReveal: 2,
    },
  });
}

export function buildDeck() {
  const cards = [];
  for (const bean of beanCatalog) {
    for (let copy = 1; copy <= bean.copies; copy += 1) {
      cards.push(createCard(bean, copy));
    }
  }
  return cards;
}

export function createCard(bean, copy) {
  return {
    id: `${bean.id}-${String(copy).padStart(2, "0")}`,
    beanId: bean.id,
    beanName: bean.name,
    color: bean.color,
    value: bean.value,
  };
}

export function shuffleDeck(deck, seed = 0) {
  const next = deck.slice();
  const random = mulberry32(seed || 1);
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

export function drawCards(deck, count = 1) {
  const nextDeck = deck.slice();
  const drawn = [];
  while (count > 0 && nextDeck.length) {
    drawn.push(nextDeck.shift());
    count -= 1;
  }
  return { drawn, deck: nextDeck };
}

export function dealHands(deck, players, handSize = 5) {
  const nextDeck = deck.slice();
  const nextPlayers = players.map((player) => ({
    ...player,
    hand: [],
    fields: Array.isArray(player.fields) ? player.fields.slice() : [],
    score: Number(player.score || 0),
  }));
  for (let round = 0; round < handSize; round += 1) {
    nextPlayers.forEach((player) => {
      if (!nextDeck.length) return;
      player.hand.push(nextDeck.shift());
    });
  }
  return { players: nextPlayers, deck: nextDeck };
}

export function normalizeState(state) {
  const next = structuredClone(state || {});
  next.gameId = next.gameId || "bohnanza";
  next.phase = next.phase || "setup";
  next.round = Number.isFinite(Number(next.round)) ? Number(next.round) : 1;
  next.activePlayerIndex = Number.isFinite(Number(next.activePlayerIndex)) ? Number(next.activePlayerIndex) : 0;
  next.seed = Number.isFinite(Number(next.seed)) ? Number(next.seed) : 0;
  next.players = Array.isArray(next.players)
    ? next.players.map((player, index) => normalizePlayer(player, index))
    : [];
  next.drawPile = Array.isArray(next.drawPile) ? next.drawPile : [];
  next.discardPile = Array.isArray(next.discardPile) ? next.discardPile : [];
  next.market = Array.isArray(next.market) ? next.market : [];
  next.log = Array.isArray(next.log) ? next.log : [];
  next.turn = normalizeTurn(next.turn);
  return next;
}

export function normalizePlayer(player, index = 0) {
  const seat = Number.isFinite(Number(player?.seat)) ? Number(player.seat) : index + 1;
  const playerNumber = Number.isFinite(Number(player?.playerNumber))
    ? Number(player.playerNumber)
    : seat;
  return {
    id: String(player?.id || `player-${seat}`),
    seat,
    playerNumber,
    name: String(player?.name || `Player ${playerNumber}`),
    hand: Array.isArray(player?.hand) ? player.hand.map(normalizeCard) : [],
    fields: Array.isArray(player?.fields) ? player.fields.map(normalizeField) : [],
    score: Number.isFinite(Number(player?.score)) ? Number(player.score) : 0,
  };
}

export function normalizeField(field) {
  if (Array.isArray(field)) {
    return field.map(normalizeCard);
  }
  if (!field || typeof field !== "object") return [];
  return Array.isArray(field.cards) ? field.cards.map(normalizeCard) : [];
}

export function normalizeCard(card) {
  if (!card || typeof card !== "object") return card;
  return {
    id: String(card.id || `${card.beanId || "bean"}-${card.value || "x"}`),
    beanId: String(card.beanId || "unknown"),
    beanName: String(card.beanName || "Bean"),
    color: String(card.color || "#999999"),
    value: Number.isFinite(Number(card.value)) ? Number(card.value) : 0,
  };
}

export function normalizeTurn(turn) {
  const next = turn && typeof turn === "object" ? turn : {};
  return {
    plantedFrontCard: Boolean(next.plantedFrontCard),
    marketRevealed: Boolean(next.marketRevealed),
    cardsRemainingToReveal: Number.isFinite(Number(next.cardsRemainingToReveal))
      ? Number(next.cardsRemainingToReveal)
      : 2,
  };
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
