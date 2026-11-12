// Reefkeepers — habitats and the ORIGINAL 48-tile reef deck. Pure data +
// pure helpers: no rules, no RNG, no game state. Wire contract:
// docs/game-reefkeepers.md.
//
// Each tile is two halves (A and B), each a habitat with 0–3 pearls. Rarer
// habitats appear on fewer halves and carry more pearls. The draft number `n`
// (1..48) is the tile's STRENGTH rank: TILE_SPECS is authored in no particular
// order and `n` is assigned by sorting on tileStrength(), so "lower n = weaker"
// holds by construction. Bigger tables / the Grand reef shuffle several copies
// of the deck; copies carry an id suffix ("t17", "t17b", "t17c", …) and keep n.

export const HABITATS = Object.freeze(["sand", "kelp", "lagoon", "seagrass", "coral", "trench"]);

// Rarity weight per habitat (0 = most common). Drives tileStrength() and the
// bots' sense of how hard a region is to grow.
export const RARITY = Object.freeze({ sand: 0, kelp: 1, lagoon: 1.5, seagrass: 2, coral: 3, trench: 4 });

// [habitat A, pearls A, habitat B, pearls B] — authored for this game.
const TILE_SPECS = [
  // plain monos
  ["sand", 0, "sand", 0], ["sand", 0, "sand", 0], ["sand", 0, "sand", 0], ["sand", 0, "sand", 0],
  ["kelp", 0, "kelp", 0], ["kelp", 0, "kelp", 0], ["kelp", 0, "kelp", 0],
  ["lagoon", 0, "lagoon", 0], ["lagoon", 0, "lagoon", 0],
  ["seagrass", 0, "seagrass", 0],
  // plain mixed
  ["sand", 0, "kelp", 0], ["sand", 0, "kelp", 0], ["sand", 0, "lagoon", 0], ["sand", 0, "seagrass", 0],
  ["lagoon", 1, "seagrass", 0], ["kelp", 0, "seagrass", 0], ["lagoon", 0, "seagrass", 0], ["sand", 0, "coral", 0],
  // one pearl
  ["sand", 1, "sand", 0], ["sand", 1, "kelp", 0], ["sand", 1, "lagoon", 0], ["sand", 0, "kelp", 1],
  ["sand", 0, "lagoon", 1], ["kelp", 1, "kelp", 0], ["kelp", 1, "lagoon", 0], ["kelp", 0, "lagoon", 1],
  ["lagoon", 1, "lagoon", 0], ["sand", 0, "seagrass", 1], ["kelp", 0, "seagrass", 1], ["lagoon", 0, "seagrass", 1],
  ["seagrass", 1, "seagrass", 0], ["sand", 0, "coral", 1], ["kelp", 0, "coral", 1], ["lagoon", 0, "coral", 1],
  ["coral", 1, "coral", 0], ["sand", 0, "trench", 1], ["kelp", 0, "trench", 1],
  // two or more pearls
  ["sand", 0, "seagrass", 2], ["kelp", 0, "seagrass", 2], ["seagrass", 1, "coral", 1], ["sand", 0, "coral", 2],
  ["lagoon", 0, "coral", 2], ["kelp", 1, "coral", 1], ["sand", 0, "trench", 2], ["lagoon", 0, "trench", 2],
  ["seagrass", 0, "trench", 2], ["coral", 1, "trench", 2], ["kelp", 0, "trench", 3],
];

export function tileStrength(spec) {
  const [a, ap, b, bp] = spec;
  const half = (h, p) => p * (3 + RARITY[h]) + RARITY[h] * 0.4;
  return half(a, ap) + half(b, bp) + (a === b ? 0.6 : 0);
}

// The base deck, n = 1..48 by strength (ties keep authoring order).
export const TILES = Object.freeze(
  TILE_SPECS
    .map((spec, i) => ({ spec, i, s: tileStrength(spec) }))
    .sort((x, y) => x.s - y.s || x.i - y.i)
    .map(({ spec }, k) => Object.freeze({ id: `t${k + 1}`, n: k + 1, a: spec[0], ap: spec[1], b: spec[2], bp: spec[3] })),
);

export const DECK_SIZE = TILES.length;
const SUFFIXES = "bcdefghijklmnopqrstuvwxyz";
const ID_PATTERN = /^t(\d{1,2})([b-z]?)$/;

// Every tile id for `copies` shuffled-together copies of the deck.
export function deckIds(copies) {
  const ids = [];
  const c = Math.max(1, Math.min(SUFFIXES.length + 1, Math.trunc(copies) || 1));
  for (let k = 0; k < c; k += 1) {
    const suffix = k === 0 ? "" : SUFFIXES[k - 1];
    TILES.forEach((t) => ids.push(t.id + suffix));
  }
  return ids;
}

// Resolve an id ("t17", "t17b") to a plain Tile object, or null.
export function tileById(id) {
  const m = typeof id === "string" ? ID_PATTERN.exec(id) : null;
  if (!m) return null;
  const base = TILES[Number(m[1]) - 1];
  if (!base) return null;
  return { id, n: base.n, a: base.a, ap: base.ap, b: base.b, bp: base.bp };
}

export function isTileId(id) {
  return tileById(id) !== null;
}

// Stable draft order: by n, then id (copies of one n sort "t17" < "t17b").
export function compareTileIds(x, y) {
  const a = tileById(x);
  const b = tileById(y);
  return (a ? a.n : 999) - (b ? b.n : 999) || (x < y ? -1 : x > y ? 1 : 0);
}
