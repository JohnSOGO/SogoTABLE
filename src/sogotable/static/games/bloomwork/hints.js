// Bloomwork — DISPLAY-ONLY hints for the "Helps" option.
//
// The server (workers/games/bloomwork/board.js canPlant / plantPoints) is the
// ONLY authority on what is legal and what scores. This file mirrors the two
// simple checks purely to light up planter rows and preview points while a
// flower is selected; a wrong hint here can never change the game — the
// server re-validates every PICK and replies with a message if a row is
// illegal. Nothing outside the Helps highlight may read from this file.
// Keep it the one client copy (no other UI file re-derives these rules).

// Bed cell for `flower` in bed row `row`, read from the projected layout.
export function bedColumnHint(layout, row, flower) {
  const line = Array.isArray(layout) && layout[row];
  return line ? line.indexOf(flower) : -1;
}

// Would `flower` fit planter row `row` for this seat? (display hint)
export function rowFitsHint(seat, layout, row, flower) {
  if (row === -1) return true;
  const line = seat && seat.rows && seat.rows[row];
  if (!line) return false;
  if (line.count >= row + 1) return false;
  if (line.flower && line.flower !== flower) return false;
  const col = bedColumnHint(layout, row, flower);
  return !(col < 0 || (seat.bed[row] && seat.bed[row][col]));
}

// Adjacency points a new bed flower at (row, col) would score (display hint).
function pointsHint(bed, row, col) {
  const on = (r, c) => Boolean(bed[r] && bed[r][c]);
  let h = 1;
  for (let c = col - 1; c >= 0 && on(row, c); c -= 1) h += 1;
  for (let c = col + 1; c < 5 && on(row, c); c += 1) h += 1;
  let vv = 1;
  for (let r = row - 1; r >= 0 && on(r, col); r -= 1) vv += 1;
  for (let r = row + 1; r < 5 && on(r, col); r += 1) vv += 1;
  if (h > 1 && vv > 1) return h + vv;
  return Math.max(h, vv);
}

const COMPOST = [-1, -1, -2, -2, -2, -3, -3];

// What taking `count` × `flower` into `row` would roughly do (display hint):
// { placed, spill, completes, col, points, compostCost }.
export function previewHint(seat, layout, row, flower, count) {
  const heap = Array.isArray(seat.compost) ? seat.compost.length : 0;
  let placed = 0;
  let completes = false;
  let col = -1;
  let points = 0;
  if (row >= 0) {
    const line = seat.rows[row];
    placed = Math.min(count, row + 1 - line.count);
    completes = line.count + placed >= row + 1;
    col = bedColumnHint(layout, row, flower);
    if (completes && col >= 0) points = pointsHint(seat.bed, row, col);
  }
  const spill = count - placed;
  let compostCost = 0;
  for (let i = 0; i < spill && heap + i < COMPOST.length; i += 1) compostCost += COMPOST[heap + i];
  return { placed, spill, completes, col, points, compostCost };
}
