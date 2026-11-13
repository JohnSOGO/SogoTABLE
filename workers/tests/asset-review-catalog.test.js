// Asset Review pure modules: the catalog built from the real asset maps, and
// the Markdown export a later Claude session reads.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildCatalog, filterEntries, pictureSlots, progressOf } from "../../src/sogotable/static/admin/asset-review/catalog.js";
import { TAKES, SOURCES, PICTURE_SOURCE } from "../../src/sogotable/static/admin/asset-review/takes.js";
import { reviewsToMarkdown } from "../../src/sogotable/static/admin/asset-review/report.js";
import { SOUND_FILES } from "../../src/sogotable/static/sound-files.js";
import { ASSETS as BATTLESHIP } from "../../src/sogotable/static/games/battleship/assets.js";
import { ASSETS as LAST_ORDERS } from "../../src/sogotable/static/games/last-orders/assets.js";

const catalog = () => buildCatalog({
  soundFiles: SOUND_FILES,
  games: [{ id: "battleship", name: "Battleship", assets: BATTLESHIP }, { id: "last-orders", name: "Last Orders", assets: LAST_ORDERS }],
  takes: TAKES, sources: SOURCES, pictureSource: PICTURE_SOURCE,
});

test("every alternate take file is committed", () => {
  for (const take of Object.values(TAKES)) {
    for (const t of take.takes) assert.ok(existsSync(fileURLToPath(t.url)), t.url);
    assert.ok(take.takes.some((t) => t.seed === take.shipped));
  }
});

test("catalog lists sounds with takes and synth fallback, and every picture", () => {
  const entries = catalog();
  const farkle = entries.find((e) => e.key === "sound:global:farkle");
  assert.deepEqual(farkle.sources.map((s) => s.id), ["shipped", "seed-100", "seed-101", "seed-102", "seed-103", "synth"]);
  assert.match(farkle.source, /seed 102/);
  const scorePick = entries.find((e) => e.key === "sound:global:scorePick");
  assert.equal(scorePick.hasFile, false);
  assert.deepEqual(scorePick.sources.map((s) => s.id), ["synth"]);
  assert.ok(entries.find((e) => e.key === "sound:ui:click"));
  assert.ok(entries.find((e) => e.key === "sound:battleship:sunk").sources.length === 6);
  const pictures = entries.filter((e) => e.kind === "picture");
  assert.equal(pictures.length, pictureSlots(LAST_ORDERS).length);
  assert.ok(pictures.length > 200);
  assert.ok(pictures.every((p) => p.path.endsWith(".webp")));
  // Every TAKES key matches a real catalog entry (no typo'd keys).
  for (const key of Object.keys(TAKES).filter((k) => k.startsWith("sound:global:") || k.startsWith("sound:battleship:"))) {
    assert.ok(entries.find((e) => e.key === key), key);
  }
});

test("filters and progress follow the review map", () => {
  const entries = catalog();
  const reviews = {
    "sound:global:farkle": { status: "approved" },
    "sound:global:win": { status: "rejected", regenerate: true },
  };
  const progress = progressOf(entries, reviews);
  assert.equal(progress.approved, 1);
  assert.equal(progress.rejected, 1);
  assert.equal(progress.regenerate, 1);
  assert.equal(progress.reviewed, 2);
  assert.deepEqual(filterEntries(entries, reviews, { status: "regenerate" }).map((e) => e.key), ["sound:global:win"]);
  assert.ok(filterEntries(entries, reviews, { kind: "sound", game: "battleship" }).every((e) => e.game === "battleship" && e.kind === "sound"));
  assert.equal(filterEntries(entries, reviews, { status: "unreviewed" }).length, entries.length - 2);
  assert.ok(filterEntries(entries, reviews, { text: "gorrum" }).length > 0);
});

test("markdown export puts regenerate requests and take swaps first", () => {
  const md = reviewsToMarkdown([
    { key: "a", game: "global", label: "win", kind: "sound", status: "rejected", regenerate: true, note: "too cheesy", source: "Kenney" },
    { key: "b", game: "battleship", label: "miss", kind: "sound", status: "approved", chosen_take: "seed-103" },
    { key: "c", game: "global", label: "bank", kind: "sound", status: "approved" },
  ], { generatedAt: "now" });
  assert.ok(md.indexOf("## Regenerate (1)") < md.indexOf("## Swap to another take (1)"));
  assert.ok(md.indexOf("## Swap to another take") < md.indexOf("## Approved (2)"));
  assert.match(md, /Note: too cheesy/);
  assert.match(md, /pick: seed-103/);
});
