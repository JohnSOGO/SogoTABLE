// Manage the deployed Worker's bug-report store: list reports, mark them done /
// reopen, or delete them — one at a time or in bulk. This is the counterpart to
// the export (scripts/export-bug-reports.mjs) and clear-all
// (scripts/clear-bug-reports.mjs) helpers. All endpoints are gated by the Sogo
// superuser passcode.
//
// Usage:
//   node scripts/manage-bug-reports.mjs list
//   node scripts/manage-bug-reports.mjs done   <sel...>
//   node scripts/manage-bug-reports.mjs open   <sel...>
//   node scripts/manage-bug-reports.mjs delete <sel...>
//   node scripts/manage-bug-reports.mjs sync
//
// A <sel> is a report id (e.g. mrc24ovl-l0g57k), the row number shown by `list`
// (1-based), or the word `all`. Mix and match: `done 1 3 mrc24ovl-l0g57k`.
//
// `sync` reads ./bugreport for exported files renamed with a DONE_ prefix and
// marks those reports done on the server — so the local folder doubles as the
// checklist (rename a file to DONE_*.txt, then run sync).
//
// Passcode resolution: --pass=<code> flag -> SOGOTABLE_SUPERUSER_PASSCODE env.
// Override the API origin with SOGOTABLE_API_ORIGIN (defaults to production).
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const bugDir = join(repoRoot, "bugreport");
const api = process.env.SOGOTABLE_API_ORIGIN || "https://sogotable.sogodojo.com";

const argv = process.argv.slice(2);
const passFlag = argv.find((a) => a.startsWith("--pass="));
const passcode = (passFlag ? passFlag.slice("--pass=".length) : "") || process.env.SOGOTABLE_SUPERUSER_PASSCODE || "";
const rest = argv.filter((a) => a !== passFlag);
const cmd = (rest[0] || "list").toLowerCase();
const selectors = rest.slice(1);

if (!passcode) {
  fail("No passcode. Pass --pass=<code> or set SOGOTABLE_SUPERUSER_PASSCODE.");
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

async function call(path, body) {
  const res = await fetch(`${api}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode, ...body }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!data.ok) fail(`Request to ${path} failed: ${data.error || res.status}`);
  return data;
}

async function fetchReports() {
  const data = await call("/api/bug-reports/list", {});
  const reports = Array.isArray(data.reports) ? data.reports : [];
  // Stable, predictable order: oldest first, so row numbers match the export.
  reports.sort((a, b) => (Number(a.created_at) || 0) - (Number(b.created_at) || 0));
  return reports;
}

function firstLine(text) {
  return String(text || "").trim().split("\n")[0].slice(0, 60);
}

function statusMark(r) {
  return r.status === "done" ? "✓" : "○"; // ✓ / ○
}

function renderList(reports) {
  if (!reports.length) {
    console.log("No bug reports on the server.");
    return;
  }
  const open = reports.filter((r) => r.status !== "done").length;
  console.log(`${reports.length} report(s) — ${open} open, ${reports.length - open} done\n`);
  reports.forEach((r, i) => {
    const when = new Date(Number(r.created_at) || 0).toISOString().slice(0, 16).replace("T", " ");
    const who = (r.player_name || "?").slice(0, 12).padEnd(12);
    const game = (r.game || "-").slice(0, 16).padEnd(16);
    console.log(
      `${String(i + 1).padStart(3)} ${statusMark(r)} ${when}  ${who} ${game} ${firstLine(r.description)}`,
    );
    console.log(`      id ${r.id}`);
  });
}

// Turn selectors (row numbers, ids, or `all`) into a concrete list of ids.
function resolveIds(reports, sels) {
  if (!sels.length) fail("No reports selected. Give row numbers, ids, or `all`.");
  if (sels.some((s) => s.toLowerCase() === "all")) return reports.map((r) => r.id);
  const ids = new Set();
  for (const sel of sels) {
    if (/^\d+$/.test(sel)) {
      const row = reports[Number(sel) - 1];
      if (!row) fail(`No report at row ${sel} (have ${reports.length}).`);
      ids.add(row.id);
    } else if (reports.some((r) => r.id === sel)) {
      ids.add(sel);
    } else {
      fail(`No report matches "${sel}".`);
    }
  }
  return [...ids];
}

// Pull report ids out of DONE_-prefixed exported filenames. Export names look
// like <stamp>_<id>.txt, so DONE_<stamp>_<id>.txt -> <id>.
function doneIdsFromFolder() {
  let files = [];
  try {
    files = readdirSync(bugDir);
  } catch {
    fail(`Cannot read ${bugDir}.`);
  }
  const ids = [];
  for (const name of files) {
    const m = /^DONE_\d{8}-\d{6}_(.+)\.txt$/i.exec(name);
    if (m) ids.push(m[1]);
  }
  return ids;
}

if (cmd === "list") {
  renderList(await fetchReports());
} else if (cmd === "done" || cmd === "open") {
  const reports = await fetchReports();
  const ids = resolveIds(reports, selectors);
  const data = await call("/api/bug-reports/resolve", { ids, reopen: cmd === "open" });
  console.log(`${cmd === "open" ? "Reopened" : "Marked done"}: ${data.affected} report(s).`);
} else if (cmd === "delete" || cmd === "rm") {
  const reports = await fetchReports();
  const ids = resolveIds(reports, selectors);
  const data = await call("/api/bug-reports/resolve", { ids, delete: true });
  console.log(`Deleted: ${data.affected} report(s) from the server.`);
} else if (cmd === "sync") {
  const ids = doneIdsFromFolder();
  if (!ids.length) {
    console.log("No DONE_*.txt files found in ./bugreport — nothing to sync.");
  } else {
    const data = await call("/api/bug-reports/resolve", { ids });
    console.log(`Synced ${ids.length} DONE_ file(s) -> marked ${data.affected} report(s) done.`);
  }
} else {
  fail(`Unknown command "${cmd}". Use: list | done | open | delete | sync`);
}
