import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { posix } from "node:path";

// Ratchet guards (from the 2026-06-26 architecture review): the two god-files
// and the stylesheets must not silently regrow. When you extract code out of one,
// LOWER its ceiling to lock the win in. If a new feature pushes a file over its
// ceiling, that is the signal to extract something first, not to bump the limit.
// styles.css was split into styles.css (platform chrome) + styles-games.css
// (game-screen visuals) on 2026-06-27 to make room without regrowth.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const lineCount = (rel) => readFileSync(join(root, rel), "utf8").split("\n").length;

const CEILINGS = {
  "src/sogotable/static/app.js": 2864,
  "workers/sogotable-api.js": 1960,
  "src/sogotable/static/styles.css": 1350,
  "src/sogotable/static/styles-games.css": 1700,
};

for (const [rel, ceiling] of Object.entries(CEILINGS)) {
  test(`architecture: ${rel} stays under ${ceiling} lines`, () => {
    const lines = lineCount(rel);
    assert.ok(
      lines <= ceiling,
      `${rel} is ${lines} lines (ceiling ${ceiling}). Extract a module before adding more, then ratchet this ceiling down.`,
    );
  });
}

// The game registry is the single source of truth: neither runtime should carry
// its own inline game-definition literals again (the split-brain we just killed).
test("architecture: game definitions live only in the shared registry", () => {
  const worker = readFileSync(join(root, "workers/sogotable-api.js"), "utf8");
  const app = readFileSync(join(root, "src/sogotable/static/app.js"), "utf8");
  assert.ok(worker.includes('from "../src/sogotable/static/games/registry.js"'), "Worker must import the shared registry");
  assert.ok(app.includes('from "./games/registry.js"'), "App must import the shared registry");
  // The opaque ids belong to the registry; they should not be re-hardcoded as
  // string literals in either god-file.
  const ids = ["a3f19c6e42b8", "d7e4a91f0c23", "4b7e2d9a6c10", "9c2f7a81d4e6", "8f5d2c7a1b90", "6d10f4a2c8b3"];
  for (const id of ids) {
    assert.ok(!worker.includes(`"${id}"`), `Worker hardcodes game id ${id}; use GAME_IDS from the registry`);
    assert.ok(!app.includes(`"${id}"`), `App hardcodes game id ${id}; use GAME_IDS from the registry`);
  }
});

// Parse the REVIEW_EXPORT_FILES allowlist out of review-export.js.
function reviewExportPaths() {
  const src = readFileSync(join(root, "src/sogotable/static/review-export.js"), "utf8");
  const start = src.indexOf("REVIEW_EXPORT_FILES = [");
  const block = src.slice(start, src.indexOf("];", start));
  const paths = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(paths.length > 0, "Could not parse REVIEW_EXPORT_FILES");
  return paths;
}

// The Sogo review-export ZIP fetches an allowlist of files from GitHub main and
// aborts on the first 404. A renamed/moved/deleted source file (or a case change
// like Quoridor/ -> quoridor/) silently breaks the export. This guard pins every
// listed path to a real file, so the export can't drift out from under us — when
// you extract a new module, add it to REVIEW_EXPORT_FILES and this test confirms
// it resolves. In a git checkout we compare against `git ls-files` (case-sensitive,
// matching GitHub); in an exported ZIP (no .git) we fall back to on-disk presence
// so the bundle stays self-testable.
test("architecture: review-export allowlist only lists real files", () => {
  const paths = reviewExportPaths();
  let tracked = null;
  try {
    tracked = new Set(execSync("git ls-files", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().split("\n"));
  } catch {
    tracked = null; // not a git checkout (e.g. an exported review ZIP)
  }
  const missing = tracked
    ? paths.filter((p) => !tracked.has(p))
    : paths.filter((p) => !existsSync(join(root, p)));
  assert.deepEqual(
    missing,
    [],
    `review-export lists files that do not exist (the export would 404 on these): ${missing.join(", ")}`,
  );
});

// Import closure: every relative module imported by an exported JS/MJS file must
// itself be in the allowlist. This is the guard that would have caught the missing
// controllers/houses.js and games/game-list-view.js — without it the export ZIP
// loads app.js, hits an unresolved ES import, and white-screens. Resolution is
// repo-relative so it matches how the browser fetches modules from the bundle.
test("architecture: exported JS modules only import other exported files", () => {
  const allow = new Set(reviewExportPaths());
  const importRe = /(?:from|import)\s+["'](\.[^"']+)["']/g;
  const problems = [];
  for (const rel of allow) {
    if (!/\.(js|mjs)$/.test(rel)) continue;
    // Skip test files: they are run by `node --test`, not fetched as part of the
    // browser/worker module graph, and their assertion strings contain literal
    // `from "..."` text that is not a real import.
    if (rel.startsWith("workers/tests/")) continue;
    const source = readFileSync(join(root, rel), "utf8");
    const dir = posix.dirname(rel);
    for (const match of source.matchAll(importRe)) {
      const resolved = posix.normalize(posix.join(dir, match[1]));
      if (!allow.has(resolved)) {
        problems.push(`${rel} imports ${match[1]} -> ${resolved} (not in REVIEW_EXPORT_FILES)`);
      }
    }
  }
  assert.deepEqual(problems, [], `exported modules import files missing from the allowlist:\n${problems.join("\n")}`);
});

// Metadata split-brain guard (review #13): games/registry.js is the runtime
// source of truth (opaque ids + aliases), while per-game manifest.js files carry
// richer descriptive metadata. They drift if nothing pins them together — some
// manifests key off the opaque id, others off a slug alias. This test reconciles
// every manifest to exactly one registry entry (by id OR alias), pins the name,
// requires the descriptive fields so a new manifest can't ship half-filled, and
// fails if a *ready* game has no manifest (ten-thousand is the one tracked gap).
test("architecture: every game manifest reconciles with the registry", async () => {
  const { GAME_REGISTRY, GAME_IDS } = await import(
    pathToFileURL(join(root, "src/sogotable/static/games/registry.js")).href
  );
  const gamesDir = join(root, "src/sogotable/static/games");
  // Registry-ready games that legitimately ship without a manifest yet. Removing
  // an entry here is the forcing function: add the manifest, then drop it.
  const KNOWN_NO_MANIFEST = new Set([GAME_IDS.tenThousand]);

  const covered = new Set();
  for (const entry of readdirSync(gamesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(gamesDir, entry.name, "manifest.js");
    if (!existsSync(manifestPath)) continue;
    const mod = await import(pathToFileURL(manifestPath).href);
    const manifest = Object.values(mod).find((v) => v && typeof v === "object" && "id" in v);
    assert.ok(manifest, `${entry.name}/manifest.js exports no manifest object`);
    const matches = GAME_REGISTRY.filter(
      (game) => game.id === manifest.id || (game.aliases || []).includes(manifest.id),
    );
    assert.equal(matches.length, 1, `${entry.name} manifest id "${manifest.id}" must match exactly one registry entry (matched ${matches.length})`);
    const game = matches[0];
    assert.equal(manifest.name, game.name, `${entry.name} manifest name "${manifest.name}" != registry name "${game.name}"`);
    assert.ok(Number.isInteger(manifest.minPlayers) && manifest.minPlayers >= 1, `${entry.name} manifest needs minPlayers >= 1`);
    assert.ok(Number.isInteger(manifest.maxPlayers) && manifest.maxPlayers >= manifest.minPlayers, `${entry.name} manifest needs maxPlayers >= minPlayers`);
    assert.ok(typeof manifest.timingMode === "string" && manifest.timingMode, `${entry.name} manifest needs a timingMode`);
    assert.ok(Array.isArray(manifest.capabilities) && manifest.capabilities.length, `${entry.name} manifest needs a non-empty capabilities array`);
    covered.add(game.id);
  }

  const missing = GAME_REGISTRY
    .filter((game) => game.availability === "ready" && !covered.has(game.id) && !KNOWN_NO_MANIFEST.has(game.id))
    .map((game) => game.name);
  assert.deepEqual(missing, [], `ready games missing a manifest.js: ${missing.join(", ")}`);
});
