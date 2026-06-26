import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Ratchet guards (from the 2026-06-26 architecture review): the two god-files
// and the stylesheet must not silently regrow. When you extract code out of one,
// LOWER its ceiling to lock the win in. If a new feature pushes a file over its
// ceiling, that is the signal to extract something first, not to bump the limit.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const lineCount = (rel) => readFileSync(join(root, rel), "utf8").split("\n").length;

const CEILINGS = {
  "src/sogotable/static/app.js": 3350,
  "workers/sogotable-api.js": 2050,
  "src/sogotable/static/styles.css": 2800,
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

// The Sogo review-export ZIP fetches an allowlist of files from GitHub main and
// aborts on the first 404. A renamed/moved/deleted source file (or a case change
// like Quoridor/ -> quoridor/) silently breaks the export. This guard pins every
// listed path to a tracked file (git is case-sensitive, matching GitHub), so the
// export can't drift out from under us — when you extract a new module, add it to
// REVIEW_EXPORT_FILES and this test confirms it resolves.
test("architecture: review-export allowlist only lists tracked files", () => {
  const src = readFileSync(join(root, "src/sogotable/static/review-export.js"), "utf8");
  const start = src.indexOf("REVIEW_EXPORT_FILES = [");
  const block = src.slice(start, src.indexOf("];", start));
  const paths = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(paths.length > 0, "Could not parse REVIEW_EXPORT_FILES");
  const tracked = new Set(execSync("git ls-files", { cwd: root }).toString().split("\n"));
  const missing = paths.filter((p) => !tracked.has(p));
  assert.deepEqual(
    missing,
    [],
    `review-export lists files not tracked in git (the export would 404 on these): ${missing.join(", ")}`,
  );
});
