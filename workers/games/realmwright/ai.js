// Realmwright bot. Pure heuristic placer — it picks ONE of the legal entries
// rules.js computed (plus a meeple choice) and returns { x, y, r, meeple };
// rules.js applies it through the SAME validated path a human's PLACE_TILE
// takes. No bot-only shortcuts, no hidden info: it reads the public board, its
// own tile and the bag COUNT (never the bag order).
// Depends only on the pure board/tiles modules, never on rules.js, so the
// rules → ai import stays one-directional.
//
// Four strength tiers (seat.level):
//   SPROUT 1   — random legal spot, a meeple now and then.
//   BUDDY 2    — greedy on points closed right now, modest meeple use.
//   CIPHER 3   — greedy + board potential: values the features its meeples
//                hold (growing / closing its own, not feeding opponents'),
//                keeps 1–2 meeples in reserve, farms late when farmers are on.
//   OVERLORD 4 — Cipher with more candidates, sharper opponent weighting and
//                less noise.
// Cost is bounded: at most CANDIDATES[level] placements are simulated, one
// derive() each.

import { tileDefsFor } from "./tiles.js";
import { derive, completedByPlacement, majority } from "./board.js";

const CANDIDATES = [0, 0, 36, 60, 90];
const NOISE = [0, 0, 1.6, 0.7, 0.2];
const OPP_WEIGHT = [0, 0, 0.25, 0.55, 0.8];
const RESERVE = [0, 0, 0, 1, 2];

function pick(list, rng) {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

// Expected end value of a feature a meeple holds (rough completion odds).
function expectedValue(f, ctx) {
  const late = ctx.bagFrac; // 1 = game start, 0 = last tile
  if (f.kind === "city") {
    if (f.complete) return ctx.smallCity && f.cells.length === 2 ? 2 + f.pennants : 2 * (f.cells.length + f.pennants);
    const end = f.cells.length + f.pennants;
    const p = (f.open <= 1 ? 0.75 : f.open === 2 ? 0.5 : f.open === 3 ? 0.35 : 0.2) * Math.min(1, 0.35 + late * 1.3);
    return end + end * p;
  }
  if (f.kind === "road") return f.cells.length + (f.open <= 1 && !f.complete ? 0.4 : 0);
  if (f.kind === "cloister") return f.cells.length + (9 - f.cells.length) * Math.min(1, late * 1.6) * 0.7;
  if (f.kind === "field") {
    const done = f.cities.filter((c) => ctx.features[c] && ctx.features[c].complete).length;
    return 3 * done + 1.2 * (f.cities.length - done) * Math.min(1, late * 2);
  }
  return f.cells.length;
}

// Board potential for `mark`: its share of every held feature, minus a
// weighted share of opponents'.
function potential(derived, mark, ctx, oppWeight) {
  let v = 0;
  for (const f of Object.values(derived.features)) {
    if (!f.meeples.length || (f.kind === "field" && !ctx.farmers)) continue;
    const winners = majority(f.meeples);
    const val = expectedValue(f, { ...ctx, features: derived.features });
    for (const w of winners) v += w === mark ? val : -val * oppWeight;
  }
  return v;
}

function meepleCost(kind, seat, ctx, level) {
  let cost = level >= 3 ? 1.2 + ctx.bagFrac * 1.8 : 2;
  if (seat.meeples_left - 1 < RESERVE[level]) cost += 1 + ctx.bagFrac * 5;
  if (kind === "field") cost += level >= 3 ? ctx.bagFrac * 9 : ctx.bagFrac * 12;
  return cost;
}

export function chooseRealmwrightPlacement(game, mark, legal, rng = Math.random) {
  if (!Array.isArray(legal) || !legal.length) return null;
  const seat = game.players[mark];
  const level = seat && Number.isInteger(seat.level) && seat.level >= 1 ? Math.min(4, seat.level) : 2;
  const as = (entry, meeple) => ({ x: entry.x, y: entry.y, r: entry.r, meeple });

  // ---- SPROUT: random spot, rare meeple ----
  if (level <= 1) {
    const entry = pick(legal, rng);
    return as(entry, entry.meeples.length && rng() < 0.22 ? pick(entry.meeples, rng) : null);
  }

  const defs = tileDefsFor(["base", ...(game.options.expansions || [])]);
  const def = defs[seat.tile];
  if (!def) return as(legal[0], null);
  const total = Math.max(1, game.bag.length + game.board.length);
  const ctx = {
    bagFrac: Math.min(1, game.bag.length / total),
    farmers: game.options.farmers === "on",
    smallCity: Boolean(game.options.small_city),
  };
  const oppWeight = OPP_WEIGHT[level] / Math.max(1, Math.sqrt(game.seat_order.length - 1));

  // Bounded candidate set (random subset when the frontier is huge).
  let candidates = legal;
  if (legal.length > CANDIDATES[level]) {
    const copy = legal.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    candidates = copy.slice(0, CANDIDATES[level]);
  }

  const baseline = level >= 3 ? potential(derive(game.board, defs), mark, ctx, oppWeight) : 0;
  let best = null;
  for (const entry of candidates) {
    const board2 = game.board.concat([{ x: entry.x, y: entry.y, t: seat.tile, r: entry.r, by: mark, meeples: [] }]);
    const d2 = derive(board2, defs);
    const i = board2.length - 1;
    let base;
    if (level >= 3) {
      base = potential(d2, mark, ctx, oppWeight) - baseline;
    } else {
      base = 0;
      for (const done of completedByPlacement(board2, d2, defs, i, game.options)) {
        for (const w of done.marks) base += w === mark ? done.points : -done.points * oppWeight;
      }
    }
    const options = [{ meeple: null, v: base }];
    for (const fi of entry.meeples) {
      const f = d2.features[d2.root(i, fi)];
      if (!f) continue;
      if (f.kind === "field" && (level < 3 && ctx.bagFrac > 0.25)) continue;
      const gain = expectedValue(f, { ...ctx, features: d2.features });
      const returns = f.complete ? 0 : meepleCost(f.kind, seat, ctx, level);
      options.push({ meeple: fi, v: base + gain * (level >= 3 ? 1 : 0.8) - returns });
    }
    for (const o of options) {
      const v = o.v + rng() * NOISE[level];
      if (!best || v > best.v) best = { v, move: as(entry, o.meeple) };
    }
  }
  return best ? best.move : as(legal[0], null);
}
