// Last Orders balance harness: plays thousands of all-bot games through the
// real rules (workers/games/last-orders/rules.js) and reports each patron's
// win rate against a fair share (1 / table size), plus seat-order effects.
//
//   node scripts/balance-last-orders.mjs [--games 2000] [--level 3] [--seed 1] [--packs all|base]
//
// Patrons are dealt uniformly at random, so every patron sees every table
// size, seat and opponent mix. "Edge" = win rate minus fair share, in points.
import {
  newLastOrdersGame, initLastOrdersSeats, setLastOrdersOptions, setLastOrdersRandom,
} from "../workers/games/last-orders/rules.js";
import { EXPANSION_IDS } from "../workers/games/last-orders/catalog.js";
import { PACKS } from "../workers/games/last-orders/packs.js";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "1"]);
  return acc;
}, []));
const GAMES = Number(args.games) || 2000; // per table size
const LEVEL = args.level === "mix" ? "mix" : Number(args.level) || 3;
const SIZES = (args.sizes || "2,3,4,5,6").split(",").map(Number);
const expansions = args.packs === "base" ? [] : EXPANSION_IDS;

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
setLastOrdersRandom(seeded(Number(args.seed) || 1));
// --patch file.mjs: a tuning experiment that mutates pack data in memory
// (export default (PACKS) => { ... }) so ideas can be tried before editing packs.
if (args.patch) (await import(new URL(args.patch, `file://${process.cwd()}/`).href)).default(PACKS);
const levelRng = seeded((Number(args.seed) || 1) + 99);

const byChar = {}; // id -> { games, wins, fair, why: {} }
const bySeat = {}; // size -> [wins by turn position]
const outs = {};
let rounds = 0;
let unfinished = 0;
const total = { games: 0 };

for (const size of SIZES) {
  bySeat[size] = Array(size).fill(0);
  for (let g = 0; g < GAMES; g += 1) {
    const game = newLastOrdersGame();
    setLastOrdersOptions(game, { lo_options: { expansions, closing_time: args.closing !== "off" } });
    const seats = Array.from({ length: size }, (_, k) => ({
      mark: `P${k + 1}`, kind: "bot", bot_level: LEVEL === "mix" ? 1 + Math.floor(levelRng() * 4) : LEVEL,
    }));
    initLastOrdersSeats(game, seats);
    total.games += 1;
    if (game.status !== "complete" || !game.winner) { unfinished += 1; continue; }
    rounds += game.round;
    game.seat_order.forEach((m) => {
      const p = game.players[m];
      const c = (byChar[p.character] ||= { games: 0, wins: 0, fair: 0 });
      c.games += 1;
      c.fair += 1 / size;
      if (m === game.winner) c.wins += 1;
      if (p.out) outs[p.out] = (outs[p.out] || 0) + 1;
    });
    const pos = (game.seat_order.indexOf(game.winner) - game.start_index + size) % size;
    bySeat[size][pos] += 1;
  }
}

const pct = (x) => (100 * x).toFixed(1);
const rows = Object.entries(byChar).map(([id, c]) => ({
  id, games: c.games, win: c.wins / c.games, fair: c.fair / c.games, edge: (c.wins - c.fair) / c.games,
  // 95% interval on the edge, in points
  ci: 1.96 * Math.sqrt((c.wins / c.games) * (1 - c.wins / c.games) / c.games),
})).sort((a, b) => b.edge - a.edge);

console.log(`Last Orders balance: ${total.games} games, sizes ${SIZES.join("/")}, bot level ${LEVEL}, packs ${args.packs === "base" ? "base" : "all"}`);
console.log(`unfinished ${unfinished}, avg rounds ${(rounds / Math.max(1, total.games - unfinished)).toFixed(1)}, outs ${JSON.stringify(outs)}`);
console.log("\npatron                  games   win%   fair%   edge (±95%)");
rows.forEach((r) => console.log(`${r.id.padEnd(22)} ${String(r.games).padStart(6)}  ${pct(r.win).padStart(5)}  ${pct(r.fair).padStart(5)}   ${(r.edge >= 0 ? "+" : "") + pct(r.edge)} ±${pct(r.ci)}`));
console.log("\nwins by turn position (first player = 1):");
Object.entries(bySeat).forEach(([size, w]) => {
  const n = w.reduce((a, b) => a + b, 0) || 1;
  console.log(`  ${size} players: ${w.map((x, i) => `#${i + 1} ${pct(x / n)}%`).join("  ")}  (fair ${pct(1 / size)}%)`);
});
if (args.json) console.log(JSON.stringify(rows));
