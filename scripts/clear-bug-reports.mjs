// Clear the deployed Worker's bug-report store (D1). Use once a batch of reports
// has been addressed. The endpoint is gated by the Sogo superuser passcode.
//
// Usage:
//   node scripts/clear-bug-reports.mjs <sogo-passcode>
//   SOGOTABLE_SUPERUSER_PASSCODE=... node scripts/clear-bug-reports.mjs
// Override the API origin with SOGOTABLE_API_ORIGIN (defaults to production).
const api = process.env.SOGOTABLE_API_ORIGIN || "https://sogotable.sogodojo.com";
const passcode = process.argv[2] || process.env.SOGOTABLE_SUPERUSER_PASSCODE || "";

if (!passcode) {
  console.error("Usage: node scripts/clear-bug-reports.mjs <sogo-passcode>  (or set SOGOTABLE_SUPERUSER_PASSCODE)");
  process.exit(1);
}

const res = await fetch(`${api}/api/bug-reports/clear`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ passcode }),
});
const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
if (!data.ok) {
  console.error(`Failed to clear bug reports: ${data.error || res.status}`);
  process.exit(1);
}

console.log(`Cleared ${data.cleared} bug report(s) from ${api}`);
