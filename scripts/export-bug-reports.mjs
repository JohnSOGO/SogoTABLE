// Pull bug reports from the deployed Worker and write one .txt per report into
// ./bugreport. The list endpoint is gated by the Sogo superuser passcode.
//
// Usage:
//   node scripts/export-bug-reports.mjs <sogo-passcode>
//   SOGOTABLE_SUPERUSER_PASSCODE=... node scripts/export-bug-reports.mjs
// Override the API origin with SOGOTABLE_API_ORIGIN (defaults to production).
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(repoRoot, "bugreport");
const api = process.env.SOGOTABLE_API_ORIGIN || "https://sogotable.sogodojo.com";
const passcode = process.argv[2] || process.env.SOGOTABLE_SUPERUSER_PASSCODE || "";

if (!passcode) {
  console.error("Usage: node scripts/export-bug-reports.mjs <sogo-passcode>  (or set SOGOTABLE_SUPERUSER_PASSCODE)");
  process.exit(1);
}

const res = await fetch(`${api}/api/bug-reports/list`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ passcode }),
});
const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
if (!data.ok) {
  console.error(`Failed to fetch bug reports: ${data.error || res.status}`);
  process.exit(1);
}

const reports = Array.isArray(data.reports) ? data.reports : [];
mkdirSync(outDir, { recursive: true });

const pad = (n) => String(n).padStart(2, "0");
function stamp(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

for (const r of reports) {
  const created = Number(r.created_at) || Date.now();
  // Stamp + id keeps the filename stable, so re-running just refreshes files
  // rather than creating duplicates.
  const file = join(outDir, `${stamp(created)}_${r.id || "report"}.txt`);
  const lines = [
    `Report: ${r.id || "(no id)"}`,
    `When:   ${new Date(created).toString()}`,
    `Who:    ${r.player_name || "(unknown)"}${r.player_id ? ` <${r.player_id}>` : ""}`,
    `Screen: ${r.screen || "(unknown)"}`,
    `Game:   ${r.game || "(none)"}${r.room_code ? ` — room ${r.room_code}` : ""}${r.game_id ? ` [${r.game_id}]` : ""}`,
    `Agent:  ${r.user_agent || ""}`,
    "",
    "Description:",
    String(r.description || "").trim(),
    "",
  ];
  writeFileSync(file, lines.join("\n"), "utf8");
}

console.log(`Wrote ${reports.length} bug report(s) to ${outDir}`);
