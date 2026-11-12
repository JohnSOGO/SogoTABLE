// Copies a batch's WebPs into the game folders under their slot file names (docs/PICTURES.md):
//   node scripts/pictures/place.mjs <batch out dir> [picks.json]
// picks.json maps "game slot" -> seed, e.g. {"mystic-wood knights:george": 202}. A slot made with one seed
// needs no pick. A slot with several seeds and no pick is copied once per seed as "<file>-s<seed>.webp"
// for review; delete the losers (and rename the winner) before merging.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GAMES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/sogotable/static/games");
// slot id -> file name (no extension) inside games/<game>/img/
const NAME = {
  "mystic-wood": (slot) => slot.replace(/^denizens:/, "den-").replace(/^things:/, "thing-").replace(/^knights:/, "knight-"),
  "potion-lab": (slot) => (slot.startsWith("cards:") ? slot.slice(6) : null), // its cardBack was dropped: no face-down card is drawn
  bloomwork: (slot) => slot.replace(/^flowerArt:/, "flower-").replace(/^birdArt$/, "bird").replace(/^tableBg$/, "table"),
  reefkeepers: (slot) => slot.replace(/^habitats:/, "habitat-"),
};
const [outDir, picksFile] = process.argv.slice(2);
const log = JSON.parse(fs.readFileSync(path.join(outDir, "log.json"), "utf8"));
const picks = picksFile ? JSON.parse(fs.readFileSync(picksFile, "utf8")) : {};
const seedsOf = {};
for (const j of log) (seedsOf[`${j.game} ${j.slot}`] ||= []).push(j.seed);
for (const j of log) {
  if (!NAME[j.game]) continue;
  const key = `${j.game} ${j.slot}`;
  const name = NAME[j.game](j.slot);
  if (!name) continue;
  const base = name.replace(/_/g, "-");
  const pick = picks[key] ?? (seedsOf[key].length === 1 ? j.seed : null);
  if (pick !== null && pick !== j.seed) continue;
  const dest = path.join(GAMES, j.game, "img", `${base}${pick === null ? `-s${j.seed}` : ""}.webp`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(outDir, j.file), dest);
  console.log(`${key} seed ${j.seed} -> ${path.relative(GAMES, dest)}`);
}
