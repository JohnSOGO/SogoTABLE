import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, relative, sep } from "node:path";
import { posix } from "node:path";

// Ratchet guards (from the 2026-06-26 architecture review): the two god-files
// and the stylesheets must not silently regrow. When you extract code out of one,
// LOWER its ceiling to lock the win in. If a new feature pushes a file over its
// ceiling, that is the signal to extract something first, not to bump the limit.
// styles.css was split into styles.css (platform chrome) + styles-games.css
// (game-screen visuals) on 2026-06-27 to make room without regrowth.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const lineCount = (rel) => readFileSync(join(root, rel), "utf8").split("\n").length;

// Repo-relative (forward-slash) source paths. Prefers git (no untracked noise);
// falls back to a disk walk so an exported review ZIP without .git still runs the
// structural guards below.
function walkRepo(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", ".wrangler", "AI"].includes(entry.name)) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walkRepo(abs, acc);
    else acc.push(relative(root, abs).split(sep).join("/"));
  }
  return acc;
}
function sourceFiles(extensions) {
  let files;
  try {
    files = execSync("git ls-files", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().split("\n").filter(Boolean);
  } catch {
    files = walkRepo(root, []);
  }
  return files.filter((p) => extensions.some((ext) => p.endsWith(ext)));
}
// The game id for a path under .../games/<id>/<file>, or null for shared files
// that sit directly in games/ (registry.js, render-keys.js, host-lobby.js, ...).
function gameDirOf(rel) {
  const match = rel.match(/(?:^|\/)games\/([^/]+)\/[^/]+$/);
  return match ? match[1] : null;
}

const CEILINGS = {
  "src/sogotable/static/app.js": 2566,
  "workers/sogotable-api.js": 1960,
  "src/sogotable/static/styles.css": 375,
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

// Shell shared-state ratchet: app.js's top-level `let`s are its cross-cutting
// mutable state — the thing that forces extracted controllers to take wide ctx
// surfaces. Cap the count so new shared state can't be added as a fresh global;
// it must go in an owner module (e.g. client/session-store.js). Lower this when
// you move state OUT, like the line ceilings. (Also catches incidental top-level
// timers/keys — acceptable: it forces a deliberate choice on any new global.)
const APP_TOP_LEVEL_LET_CAP = 33;
test(`architecture: app.js keeps <= ${APP_TOP_LEVEL_LET_CAP} top-level let declarations`, () => {
  const count = (readFileSync(join(root, "src/sogotable/static/app.js"), "utf8").match(/^let /gm) || []).length;
  assert.ok(
    count <= APP_TOP_LEVEL_LET_CAP,
    `app.js has ${count} top-level \`let\`s (cap ${APP_TOP_LEVEL_LET_CAP}). New cross-cutting state belongs in a client/ owner module, not a fresh shell global.`,
  );
});

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

// God-file backstop: CEILINGS tightly ratchets the four known big files, but
// nothing stopped a FIFTH file growing unbounded. Cap every other source file at
// a generous limit so a new god file fails the build the moment it forms. This is
// a backstop, not the primary guard — the doctrine's smell tests catch earlier.
// Raising a cap or adding an exception is a deliberate, reviewed act: prefer
// extracting a module. (The big cohesive game files sit just under the cap, so
// the next large addition to them also forces a conversation.)
const GLOBAL_FILE_CAP = 800;
const FILE_CAP_EXCEPTIONS = {
  // Per-domain split is a tracked follow-up (review #5); pinned until then.
  "workers/tests/sogotable-api.test.js": 2810,
};
test(`architecture: no source file silently grows past ${GLOBAL_FILE_CAP} lines`, () => {
  const offenders = [];
  for (const rel of sourceFiles([".js", ".mjs", ".css"])) {
    if (rel in CEILINGS) continue; // ratcheted individually above
    const cap = FILE_CAP_EXCEPTIONS[rel] || GLOBAL_FILE_CAP;
    const lines = lineCount(rel);
    if (lines > cap) offenders.push(`${rel} is ${lines} lines (cap ${cap})`);
  }
  assert.deepEqual(offenders, [], `over line cap — extract a module, or justify a reviewed exception:\n${offenders.join("\n")}`);
});

// Layering: controllers and game modules are downstream of the shell. They reach
// the shell ONLY through a ctx injected via wireX() — never by importing app.js
// back (which would re-tangle the god file). Games are siblings, not a hierarchy,
// so one game must not import another's module. The single sanctioned exception is
// Tactical, which is built on Classic and reuses its renderer.
test("architecture: controllers/games never import the shell or another game", () => {
  const importRe = /(?:from|import)\s+["'](\.[^"']+)["']/g;
  const SHELL = "src/sogotable/static/app.js";
  const ALLOWED_CROSS_GAME = new Set([
    "src/sogotable/static/games/super-tic-tactical-toe/render.js -> src/sogotable/static/games/super-tic-tac-toe/render.js",
  ]);
  const problems = [];
  for (const rel of sourceFiles([".js", ".mjs"])) {
    const underControllers = rel.includes("/static/controllers/");
    const gameDir = gameDirOf(rel);
    if (!underControllers && !gameDir) continue; // the shell itself may compose both
    const source = readFileSync(join(root, rel), "utf8");
    const dir = posix.dirname(rel);
    for (const match of source.matchAll(importRe)) {
      const resolved = posix.normalize(posix.join(dir, match[1]));
      if (resolved === SHELL) {
        problems.push(`${rel} imports the shell (${SHELL}) — inject a ctx via wireX() instead of importing app.js`);
      }
      const targetGame = gameDirOf(resolved);
      if (gameDir && targetGame && targetGame !== gameDir && !ALLOWED_CROSS_GAME.has(`${rel} -> ${resolved}`)) {
        problems.push(`${rel} imports another game's module (${resolved}) — share via a games/ helper, not game-to-game`);
      }
    }
  }
  assert.deepEqual(problems, [], `layering violations:\n${problems.join("\n")}`);
});

// Ownership table (docs/modularity.md): game rules own legal moves/scoring only —
// no DOM, no transport, no persistence. Keep every games/<id>/rules.js pure so it
// stays testable without a browser and can't smuggle in a side channel.
test("architecture: game rule modules stay pure (no DOM / transport / storage)", () => {
  const forbidden = /\b(document|window|localStorage|sessionStorage)\b|(?<![\w.])fetch\s*\(/;
  const problems = [];
  for (const rel of sourceFiles([".js"])) {
    if (!/(?:^|\/)games\/[^/]+\/rules\.js$/.test(rel)) continue;
    readFileSync(join(root, rel), "utf8").split("\n").forEach((line, index) => {
      if (forbidden.test(line)) problems.push(`${rel}:${index + 1}  ${line.trim()}`);
    });
  }
  assert.deepEqual(problems, [], `game rules must own no DOM/transport/persistence — move it to the UI or transport layer:\n${problems.join("\n")}`);
});
