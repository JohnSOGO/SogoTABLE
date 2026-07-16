#!/usr/bin/env node
// Audit the ratchet-ceiling scheme (docs/modularity.md → "Ratchet ceilings").
//
// Reads the LIVE caps straight out of workers/tests/architecture.test.js — the
// CEILINGS map, the FILE_CAP_EXCEPTIONS, WORKING_BUFFER and the 800 backstop — so
// this report can never drift from what CI enforces. For every capped file it shows
// its current size, its ceiling, and the room left before the next edit crosses the
// line and summons the placement-advisor (extract vs bless-and-raise). It also flags
// any *uncapped* source file creeping toward the 800-line backstop.
//
// Usage:  npm run arch:audit        (or: node scripts/audit-ceilings.mjs)
// Exit code is non-zero if any file is at/over its ceiling — usable as a check.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const testPath = join(root, "workers", "tests", "architecture.test.js");
const src = readFileSync(testPath, "utf8");

// Same line count as the test: readFileSync(...).split("\n").length.
const lineCount = (rel) => readFileSync(join(root, rel), "utf8").split("\n").length;

// Pull a `const NAME = <number>` out of the test source.
function num(name) {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*(\\d+)`));
  if (!m) throw new Error(`could not find const ${name} in architecture.test.js`);
  return Number(m[1]);
}
// Pull a `const NAME = { ... }` object literal (brace-balanced) and evaluate it,
// with WORKING_BUFFER in scope so `2260 + WORKING_BUFFER` resolves to a number.
function obj(name, WORKING_BUFFER) {
  const start = src.indexOf(`const ${name} = {`);
  if (start === -1) throw new Error(`could not find const ${name} in architecture.test.js`);
  const open = src.indexOf("{", start);
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  const text = src.slice(open, end + 1);
  return new Function("WORKING_BUFFER", `return (${text});`)(WORKING_BUFFER);
}

const WORKING_BUFFER = num("WORKING_BUFFER");
const GLOBAL_FILE_CAP = num("GLOBAL_FILE_CAP");
const CEILINGS = obj("CEILINGS", WORKING_BUFFER);
const FILE_CAP_EXCEPTIONS = obj("FILE_CAP_EXCEPTIONS", WORKING_BUFFER);

// Repo source files (git-tracked; disk-walk fallback), mirroring the test.
function sourceFiles(exts) {
  let files;
  try {
    files = execSync("git ls-files", { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
      .toString().split("\n").filter(Boolean);
  } catch {
    const acc = [];
    (function walk(dir) {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if ([".git", "node_modules", ".wrangler", "AI"].includes(e.name)) continue;
        const abs = join(dir, e.name);
        if (e.isDirectory()) walk(abs);
        else acc.push(relative(root, abs).split(sep).join("/"));
      }
    })(root);
    files = acc;
  }
  return files.filter((p) => exts.some((x) => p.endsWith(x)));
}

const bar = (n) => "─".repeat(n);
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

// ── Individually-capped files (CEILINGS + exceptions) ──────────────────────────
const capped = [
  ...Object.entries(CEILINGS).map(([f, c]) => [f, c, "ceiling"]),
  ...Object.entries(FILE_CAP_EXCEPTIONS).map(([f, c]) => [f, c, "exception"]),
]
  .filter(([f]) => existsSync(join(root, f)))
  .map(([f, cap, kind]) => {
    const lines = lineCount(f);
    return { f, cap, kind, lines, room: cap - lines };
  })
  .sort((a, b) => a.room - b.room); // tightest first

let over = 0;
console.log(`\nRatchet-ceiling audit   (WORKING_BUFFER = ${WORKING_BUFFER}, backstop = ${GLOBAL_FILE_CAP})\n`);
console.log(`  ${pad("FILE", 52)} ${lpad("LINES", 6)} ${lpad("CEIL", 6)} ${lpad("ROOM", 5)}  STATUS`);
console.log(`  ${bar(52)} ${bar(6)} ${bar(6)} ${bar(5)}  ${bar(28)}`);
for (const r of capped) {
  let status;
  if (r.room < 0) { status = `⛔ OVER by ${-r.room} — CI FAILS`; over++; }
  else if (r.room === 0) status = "🔴 at ceiling — next edit → advisor";
  else if (r.room <= Math.ceil(WORKING_BUFFER / 3)) status = `🟡 ${r.room} line(s) til advisor`;
  else status = `🟢 ${r.room} line(s) of room`;
  const tag = r.kind === "exception" ? "*" : " ";
  console.log(`  ${pad(r.f, 52)} ${lpad(r.lines, 6)} ${lpad(r.cap, 6)} ${lpad(r.room, 5)}  ${status}${tag}`);
}
console.log(`  ${bar(52)} ${bar(6)} ${bar(6)} ${bar(5)}  ${bar(28)}`);
console.log("  * = tracked FILE_CAP_EXCEPTION (below the 800 backstop, own split in progress)\n");

// ── Backstop watch: uncapped files nearing 800 ─────────────────────────────────
const watch = sourceFiles([".js", ".mjs", ".css"])
  .filter((f) => !(f in CEILINGS) && !(f in FILE_CAP_EXCEPTIONS))
  .map((f) => ({ f, lines: lineCount(f) }))
  .filter((r) => r.lines > GLOBAL_FILE_CAP - WORKING_BUFFER) // within a buffer of the cap
  .sort((a, b) => b.lines - a.lines);

if (watch.length) {
  console.log(`Backstop watch — uncapped files within ${WORKING_BUFFER} lines of the ${GLOBAL_FILE_CAP} cap:\n`);
  for (const r of watch) {
    const room = GLOBAL_FILE_CAP - r.lines;
    if (room < 0) { console.log(`  ⛔ ${pad(r.f, 60)} ${r.lines} — OVER 800, CI FAILS`); over++; }
    else console.log(`  🟡 ${pad(r.f, 60)} ${r.lines} — ${room} line(s) til the backstop`);
  }
  console.log("");
} else {
  console.log(`Backstop watch: clear — no uncapped file is within ${WORKING_BUFFER} lines of ${GLOBAL_FILE_CAP}.\n`);
}

console.log(
  over
    ? `Result: ${over} file(s) over the line — extract or bless-and-raise (see docs/modularity.md).\n`
    : "Result: healthy — every capped file sits within its buffer, nothing owed.\n",
);
process.exit(over ? 1 : 0);
