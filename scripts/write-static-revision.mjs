import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const staticDir = join(root, "src", "sogotable", "static");
const version = "0.1.1";

function git(...args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const revision = git("rev-parse", "--short", "HEAD") || "revision unavailable";
const branch =
  process.env.CF_PAGES_BRANCH ||
  git("branch", "--show-current") ||
  process.env.GITHUB_REF_NAME ||
  "unknown";
const dirty = Boolean(git("status", "--porcelain"));
const summary = `SogoTable ${version} rev ${revision} branch ${branch} ${dirty ? "dirty" : "clean"}`;

mkdirSync(staticDir, { recursive: true });
writeFileSync(
  join(staticDir, "revision.json"),
  `${JSON.stringify({ ok: true, status: { version, revision, branch, dirty, summary } }, null, 2)}\n`,
  "utf8",
);
