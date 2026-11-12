// Bloomwork — pure board math: the garden-bed layout, planter-row legality,
// planting adjacency points, compost (floor) penalties and end-of-game
// bonuses. Plain data in, plain data out; no game state shape beyond one
// seat's rows / bed / compost, so rules.js, ai.js and tests share it.
//
// Rule ids only. Every player-facing name, colour and picture for a flower
// lives on the client (games/bloomwork/branding.js + assets.js).

// The five flower kinds, in bed order. Stable ids — never rename (saved games).
export const FLOWERS = Object.freeze(["rose", "iris", "sun", "lilac", "fern"]);
export const SIZE = 5; // 5 planter rows (capacity 1..5), 5×5 garden bed
export const BIRD = "bird"; // the Early Bird token, as it sits in a compost heap

// Compost heap slots and what each costs at the end of a round.
export const COMPOST_PENALTIES = Object.freeze([-1, -1, -2, -2, -2, -3, -3]);
export const COMPOST_SLOTS = COMPOST_PENALTIES.length;

export const BONUS_ROW = 2;
export const BONUS_COLUMN = 7;
export const BONUS_KIND = 10;

export function isFlower(id) {
  return FLOWERS.includes(id);
}

// The bed is a fixed Latin square: each row shifts the flower order one step
// right, so every row and every column holds each flower exactly once.
export function bedFlowerAt(row, col) {
  return FLOWERS[(col - row + SIZE * 2) % SIZE];
}
export function bedColumnFor(row, flower) {
  const k = FLOWERS.indexOf(flower);
  return k < 0 ? -1 : (k + row) % SIZE;
}

export function emptyRows() {
  return Array.from({ length: SIZE }, () => ({ flower: null, count: 0 }));
}
export function emptyBed() {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false));
}

// Row `r` (0-based) holds r+1 flowers.
export function rowCapacity(row) {
  return row + 1;
}

// Can `flower` go into planter row `row` on this seat right now?
// Floor/compost (row === -1) is always allowed.
export function canPlant(rows, bed, row, flower) {
  if (row === -1) return true;
  if (!Number.isInteger(row) || row < 0 || row >= SIZE || !isFlower(flower)) return false;
  const line = rows[row];
  if (!line) return false;
  if (line.count >= rowCapacity(row)) return false;
  if (line.flower && line.flower !== flower) return false;
  const col = bedColumnFor(row, flower);
  return !(bed[row] && bed[row][col]);
}

export function legalRows(rows, bed, flower) {
  const out = [];
  for (let r = 0; r < SIZE; r += 1) if (canPlant(rows, bed, r, flower)) out.push(r);
  return out;
}

// Points for planting one flower at (row, col) on a bed that does NOT yet
// have it: count the horizontal and vertical runs it joins. A lone flower
// scores 1; joining only a horizontal run scores its length; joining both
// scores both lengths.
export function plantPoints(bed, row, col) {
  let h = 1;
  for (let c = col - 1; c >= 0 && bed[row][c]; c -= 1) h += 1;
  for (let c = col + 1; c < SIZE && bed[row][c]; c += 1) h += 1;
  let v = 1;
  for (let r = row - 1; r >= 0 && bed[r][col]; r -= 1) v += 1;
  for (let r = row + 1; r < SIZE && bed[r][col]; r += 1) v += 1;
  if (h > 1 && v > 1) return h + v;
  if (h > 1) return h;
  if (v > 1) return v;
  return 1;
}

export function compostPenalty(heap) {
  const n = Math.min(Array.isArray(heap) ? heap.length : 0, COMPOST_SLOTS);
  let total = 0;
  for (let i = 0; i < n; i += 1) total += COMPOST_PENALTIES[i];
  return total;
}

export function completedRowCount(bed) {
  return bed.filter((line) => line.every(Boolean)).length;
}

export function endBonuses(bed) {
  const rows = completedRowCount(bed);
  let cols = 0;
  for (let c = 0; c < SIZE; c += 1) if (bed.every((line) => line[c])) cols += 1;
  let kinds = 0;
  FLOWERS.forEach((flower) => {
    let all = true;
    for (let r = 0; r < SIZE; r += 1) if (!bed[r][bedColumnFor(r, flower)]) all = false;
    if (all) kinds += 1;
  });
  return {
    rows, cols, kinds,
    points: rows * BONUS_ROW + cols * BONUS_COLUMN + kinds * BONUS_KIND,
  };
}
