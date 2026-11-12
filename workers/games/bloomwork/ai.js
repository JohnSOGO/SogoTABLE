// Bloomwork bot — chooses one pick (source, flower, planter row) for a seat.
// Pure: reads the game blob, never mutates it. Bots pick at the barrier
// close against the same displays the humans saw, and their choice goes
// through the human validation path in rules.js.
//
// Levels (seat.level): 1 Sprout (noisy, sometimes random), 2 Buddy (greedy
// with noise), 3 Cipher (greedy), 4 Overlord (greedy + bed-shape bonuses).
import {
  FLOWERS, SIZE, COMPOST_PENALTIES, COMPOST_SLOTS,
  bedColumnFor, canPlant, plantPoints, rowCapacity,
} from "./board.js";

export function listBloomworkOptions(game, mark) {
  const seat = game.players[mark];
  if (!seat) return [];
  const sources = [];
  game.stalls.forEach((stall, i) => { if (stall.length) sources.push({ source: i, tiles: stall }); });
  if (game.center.length) sources.push({ source: "center", tiles: game.center });
  const options = [];
  sources.forEach(({ source, tiles }) => {
    FLOWERS.forEach((flower) => {
      const count = tiles.filter((t) => t === flower).length;
      if (!count) return;
      for (let row = -1; row < SIZE; row += 1) {
        if (canPlant(seat.rows, seat.bed, row, flower)) options.push({ source, flower, row, count });
      }
    });
  });
  return options;
}

function overflowCost(heapLen, overflow) {
  let cost = 0;
  for (let i = 0; i < overflow; i += 1) {
    const slot = heapLen + i;
    if (slot < COMPOST_SLOTS) cost += -COMPOST_PENALTIES[slot];
  }
  return cost;
}

function scoreOption(game, seat, opt, level) {
  const heapLen = seat.compost.length;
  let placed = 0;
  let overflow = opt.count;
  let value = 0;
  if (opt.row >= 0) {
    const line = seat.rows[opt.row];
    const cap = rowCapacity(opt.row);
    placed = Math.min(opt.count, cap - line.count);
    overflow = opt.count - placed;
    const filled = line.count + placed;
    value += placed;
    if (filled === cap) {
      const col = bedColumnFor(opt.row, opt.flower);
      value += 2 + plantPoints(seat.bed, opt.row, col);
      if (level >= 4) {
        let colFilled = 0;
        for (let r = 0; r < SIZE; r += 1) if (seat.bed[r][col]) colFilled += 1;
        value += colFilled * 0.4;
      }
    } else {
      // A half-filled row is a promise; small rows are easier to keep.
      value += line.count > 0 ? 0.6 : 0;
      value -= (cap - filled) * 0.15 * (game.round >= 4 ? 2 : 1);
    }
  }
  const birdHere = opt.source === "center" && game.bird_in_center;
  value -= overflowCost(heapLen + (birdHere ? 1 : 0), overflow);
  if (birdHere) value -= (heapLen < COMPOST_SLOTS ? -COMPOST_PENALTIES[heapLen] : 0) - 0.6; // first next round is worth a little
  return value;
}

const NOISE = { 1: 3, 2: 1.4, 3: 0.4, 4: 0.1 };

export function chooseBloomworkPick(game, mark, random = Math.random) {
  const seat = game.players[mark];
  const options = listBloomworkOptions(game, mark);
  if (!options.length) return null;
  const level = seat && seat.level ? seat.level : 2;
  if (level <= 1 && random() < 0.25) {
    const opt = options[Math.floor(random() * options.length)];
    return { source: opt.source, flower: opt.flower, row: opt.row };
  }
  const noise = NOISE[level] || NOISE[2];
  let best = null;
  let bestValue = -Infinity;
  options.forEach((opt) => {
    const v = scoreOption(game, seat, opt, level) + (random() - 0.5) * noise;
    if (v > bestValue) { bestValue = v; best = opt; }
  });
  return { source: best.source, flower: best.flower, row: best.row };
}
