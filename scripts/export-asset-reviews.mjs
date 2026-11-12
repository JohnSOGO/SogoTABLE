// Pull the admin's asset reviews (Asset Review screen) from the deployed Worker
// and write them to ./asset-review/ as review.md (for people and Claude) and
// review.json (full records). The list endpoint is gated by the Sogo passcode.
//
// Usage:
//   node scripts/export-asset-reviews.mjs <sogo-passcode>
//   SOGOTABLE_SUPERUSER_PASSCODE=... node scripts/export-asset-reviews.mjs
// Override the API origin with SOGOTABLE_API_ORIGIN (defaults to production).
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { reviewsToJson, reviewsToMarkdown } from "../src/sogotable/static/admin/asset-review/report.js";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(repoRoot, "asset-review");
const api = process.env.SOGOTABLE_API_ORIGIN || "https://sogotable.sogodojo.com";
const passcode = process.argv[2] || process.env.SOGOTABLE_SUPERUSER_PASSCODE || "";

if (!passcode) {
  console.error("Usage: node scripts/export-asset-reviews.mjs <sogo-passcode>  (or set SOGOTABLE_SUPERUSER_PASSCODE)");
  process.exit(1);
}

const res = await fetch(`${api}/api/asset-reviews/list`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ passcode }),
});
const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
if (!data.ok) {
  console.error(`Failed to fetch asset reviews: ${data.error || res.status}`);
  process.exit(1);
}

const reviews = Array.isArray(data.reviews) ? data.reviews : [];
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "review.md"), reviewsToMarkdown(reviews), "utf8");
writeFileSync(join(outDir, "review.json"), reviewsToJson(reviews), "utf8");
console.log(`Wrote ${reviews.length} reviews to ${outDir}`);
