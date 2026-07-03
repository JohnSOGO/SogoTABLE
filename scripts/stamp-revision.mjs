// Stamp src/sogotable/static/revision.json with the CURRENT git commit so the
// in-app revision summary (and /revision.json) is a trustworthy answer to
// "which build am I actually running?". Run via `npm run stamp` BEFORE the
// final commit of any static change (the stamp rides in that commit); the
// deploy drill is then: push → wait for Pages → hard-refresh → compare the
// on-screen revision to `git rev-parse --short HEAD`.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const path = "src/sogotable/static/revision.json";
const rev = execSync("git rev-parse --short HEAD").toString().trim();
const branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
const dirty = execSync("git status --porcelain").toString().trim().length > 0;
const current = JSON.parse(readFileSync(path, "utf8"));
const version = (current.status && current.status.version) || "0.1.2";

// The stamped hash is the PARENT of the commit that carries it (the stamp is
// committed after being written) — close enough to identify a build uniquely.
const status = {
  version,
  revision: rev,
  branch,
  dirty,
  summary: `SogoTable ${version} rev ${rev} branch ${branch} ${dirty ? "dirty" : "clean"}`,
};
writeFileSync(path, JSON.stringify({ ok: true, status }, null, 2) + "\n");
console.log("stamped:", status.summary);
