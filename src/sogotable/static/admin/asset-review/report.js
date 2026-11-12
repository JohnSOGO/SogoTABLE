// Asset Review: export formatter. Pure; shared by the in-app export buttons and
// scripts/export-asset-reviews.mjs, so the Markdown format exists once.
//
// The Markdown is written for a later Claude session: regenerate requests come
// first (with the prompt and the note), then rejections, then approvals.

const byGameThenLabel = (a, b) => `${a.game} ${a.label}`.localeCompare(`${b.game} ${b.label}`);

function line(r) {
  const bits = [`**${r.game || "?"} / ${r.label || r.key}**`];
  if (r.kind) bits.push(r.kind);
  if (r.chosen_take) bits.push(`pick: ${r.chosen_take}`);
  if (r.path) bits.push(`\`${r.path}\``);
  let out = `- ${bits.join(" · ")}`;
  if (r.source) out += `\n  - Source: ${r.source}`;
  if (r.note) out += `\n  - Note: ${r.note.replace(/\s*\n\s*/g, " ")}`;
  return out;
}

export function reviewsToMarkdown(records, { generatedAt = new Date().toISOString() } = {}) {
  const list = [...(records || [])].sort(byGameThenLabel);
  const regen = list.filter((r) => r.regenerate);
  const rejected = list.filter((r) => r.status === "rejected" && !r.regenerate);
  const approved = list.filter((r) => r.status === "approved" && !r.regenerate);
  const pendingNotes = list.filter((r) => r.status === "pending" && !r.regenerate && (r.note || r.chosen_take));
  const picks = list.filter((r) => r.chosen_take && r.chosen_take !== "shipped");
  const section = (title, rows, hint) => (rows.length ? [`## ${title} (${rows.length})`, "", ...(hint ? [`_${hint}_`, ""] : []), ...rows.map(line), ""] : []);
  return [
    "# SogoTable asset review",
    "",
    `Exported ${generatedAt}. ${list.length} reviewed assets: ${approved.length} approved, ${rejected.length} rejected, ${regen.length} to regenerate.`,
    "",
    ...section("Regenerate", regen, "Make a new version using the note; keep the synth/SVG fallback."),
    ...section("Swap to another take", picks, "Copy the picked take over the shipped file and update docs/SOUNDS.md."),
    ...section("Rejected", rejected),
    ...section("Notes on unreviewed assets", pendingNotes),
    ...section("Approved", approved),
  ].join("\n");
}

export function reviewsToJson(records) {
  return JSON.stringify({ exported_at: new Date().toISOString(), reviews: records || [] }, null, 2);
}
