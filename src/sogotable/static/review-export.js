// Sogo superuser source-review export: fetch an allowlist of public repo files
// from GitHub and bundle them into a stored (uncompressed) ZIP in the browser.
// This is admin tooling, kept out of the main app shell. app.js owns the button
// state and superuser gate; this module owns the file list and ZIP machinery.

const REVIEW_EXPORT_REPO_RAW_BASE = "https://raw.githubusercontent.com/JohnSOGO/SogoTABLE/main/";
const REVIEW_EXPORT_FILES = [
  "README.md",
  "package.json",
  "scripts/bench-ten-thousand-bots.mjs",
  "scripts/write-static-revision.mjs",
  "workers/sogotable-api.js",
  "workers/platform/http.js",
  "workers/platform/rate-limit.js",
  "workers/persistence/state.js",
  "workers/tests/sogotable-api.test.js",
  "workers/tests/helpers.js",
  "workers/tests/architecture.test.js",
  "workers/games/bots.js",
  "workers/games/util.js",
  "workers/games/boxes/rules.js",
  "workers/games/battleship/rules.js",
  "workers/games/quoridor/rules.js",
  "workers/games/ten-thousand/rules.js",
  "workers/games/super-tic-tac-toe/rules.js",
  "src/sogotable/static/index.html",
  "src/sogotable/static/app.js",
  "src/sogotable/static/api-client.js",
  "src/sogotable/static/color-utils.js",
  "src/sogotable/static/html-utils.js",
  "src/sogotable/static/realtime.js",
  "src/sogotable/static/review-export.js",
  "src/sogotable/static/storage.js",
  "src/sogotable/static/service-worker.js",
  "src/sogotable/static/sound.js",
  "src/sogotable/static/controllers/prompts.js",
  "src/sogotable/static/controllers/game-options.js",
  "src/sogotable/static/controllers/game-stats.js",
  "src/sogotable/static/controllers/win-overlay.js",
  "src/sogotable/static/styles.css",
  "src/sogotable/static/manifest.webmanifest",
  "src/sogotable/static/games/registry.js",
  "src/sogotable/static/games/render-keys.js",
  "src/sogotable/static/games/README.md",
  "src/sogotable/static/games/battleship/client.js",
  "src/sogotable/static/games/battleship/index.js",
  "src/sogotable/static/games/battleship/manifest.js",
  "src/sogotable/static/games/battleship/PLAN.md",
  "src/sogotable/static/games/battleship/README.md",
  "src/sogotable/static/games/boxes/app.js",
  "src/sogotable/static/games/boxes/client.js",
  "src/sogotable/static/games/boxes/index.html",
  "src/sogotable/static/games/boxes/index.js",
  "src/sogotable/static/games/boxes/manifest.js",
  "src/sogotable/static/games/boxes/README.md",
  "src/sogotable/static/games/boxes/render.js",
  "src/sogotable/static/games/boxes/rules.js",
  "src/sogotable/static/games/boxes/state.js",
  "src/sogotable/static/games/boxes/styles.css",
  "src/sogotable/static/games/quoridor/index.js",
  "src/sogotable/static/games/quoridor/manifest.js",
  "src/sogotable/static/games/quoridor/PLAN.md",
  "src/sogotable/static/games/quoridor/quoridor_ai_rules_four_difficulties.md",
  "src/sogotable/static/games/quoridor/README.md",
  "src/sogotable/static/games/quoridor/client.js",
  "src/sogotable/static/games/super-tic-tac-toe/index.js",
  "src/sogotable/static/games/super-tic-tac-toe/manifest.js",
  "src/sogotable/static/games/super-tic-tac-toe/README.md",
  "src/sogotable/static/games/super-tic-tac-toe/render.js",
  "src/sogotable/static/games/super-tic-tactical-toe/index.js",
  "src/sogotable/static/games/super-tic-tactical-toe/manifest.js",
  "src/sogotable/static/games/super-tic-tactical-toe/README.md",
  "src/sogotable/static/games/super-tic-tactical-toe/render.js",
  "src/sogotable/static/games/ten-thousand/10000_complete_scoring_set.md",
  "src/sogotable/static/games/ten-thousand/render.js",
  "src/sogotable/static/games/ten-thousand/SCORING.md",
  "docs/adding-a-game.md",
  "docs/ai-difficulty.md",
  "docs/api-contract.md",
  "docs/architecture.md",
  "docs/architecture-debt.md",
  "docs/AREC.md",
  "docs/audio.md",
  "docs/bots.md",
  "docs/bots/behavior.md",
  "docs/bots/farkle_ai_players_4_levels.md",
  "docs/bots/index.md",
  "docs/cloudflare-quota.md",
  "docs/doctrine.md",
  "docs/game-battleship.md",
  "docs/game-dots-and-boxes.md",
  "docs/game-quoridor.md",
  "docs/game-super-tic-tac-toe.md",
  "docs/game-super-tic-tactical-toe.md",
  "docs/game-ten-thousand.md",
  "docs/live-rounds.md",
  "docs/modularity.md",
  "docs/name-decision.md",
  "docs/nomenclature.md",
  "docs/project-memory.md",
  "docs/purpose.md",
  "docs/roadmap.md",
  "docs/state-machine.md",
  "docs/wu-wei-event-driven-progress.md",
  "docs/wu-wei-method.md",
];
const CRC32_TABLE = makeCrc32Table();

// Fetch the allowlisted files and build the ZIP, then trigger a download.
// `revisionText` is the app's revision summary, included in the export readme.
export async function downloadReviewZip(revisionText) {
  const entries = await reviewExportEntries(revisionText);
  const zipBlob = createStoredZip(entries);
  const today = new Date().toISOString().slice(0, 10);
  downloadBlob(zipBlob, `sogotable-review-${today}.zip`);
}

async function reviewExportEntries(revisionText) {
  const entries = [{
    name: "sogotable-review/REVIEW_EXPORT.md",
    bytes: encodeText(reviewExportReadme(revisionText)),
  }];
  for (const path of REVIEW_EXPORT_FILES) {
    const response = await fetch(`${REVIEW_EXPORT_REPO_RAW_BASE}${encodeURI(path)}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not export ${path}.`);
    entries.push({
      name: `sogotable-review/${path}`,
      bytes: new Uint8Array(await response.arrayBuffer()),
    });
  }
  return entries;
}

function reviewExportReadme(revisionText) {
  return [
    "# SogoTable Review Export",
    "",
    `Exported: ${new Date().toISOString()}`,
    `App revision label: ${revisionText || "revision unavailable"}`,
    "",
    "This ZIP is a Sogo superuser source-review export generated from an explicit allowlist.",
    "",
    "Included:",
    "- Public source code for the browser app and Worker brain.",
    "- Worker tests, scripts, README, and durable project docs.",
    "",
    "Excluded:",
    "- Cloudflare secrets and environment values.",
    "- D1 data, runtime state, player data, room data, logs, caches, .wrangler, node_modules, AI intake files, and generated revision artifacts.",
    "- Binary app icons and intro artwork unless they are needed for source review.",
    "",
    "The source files are fetched from the public GitHub main branch at export time.",
    "",
  ].join("\n");
}

function createStoredZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = encodeText(entry.name);
    const bytes = entry.bytes;
    const crc = crc32(bytes);
    const localHeader = zipLocalHeader(nameBytes, bytes.length, crc);
    chunks.push(localHeader, nameBytes, bytes);
    central.push({ nameBytes, size: bytes.length, crc, offset });
    offset += localHeader.length + nameBytes.length + bytes.length;
  }
  const centralStart = offset;
  for (const entry of central) {
    const header = zipCentralHeader(entry.nameBytes, entry.size, entry.crc, entry.offset);
    chunks.push(header, entry.nameBytes);
    offset += header.length + entry.nameBytes.length;
  }
  chunks.push(zipEndRecord(central.length, offset - centralStart, centralStart));
  return new Blob(chunks, { type: "application/zip" });
}

function zipLocalHeader(nameBytes, size, crc) {
  const header = new Uint8Array(30);
  writeU32(header, 0, 0x04034b50);
  writeU16(header, 4, 20);
  writeU16(header, 8, 0);
  writeU32(header, 10, zipDosTimestamp());
  writeU32(header, 14, crc);
  writeU32(header, 18, size);
  writeU32(header, 22, size);
  writeU16(header, 26, nameBytes.length);
  return header;
}

function zipCentralHeader(nameBytes, size, crc, offset) {
  const header = new Uint8Array(46);
  writeU32(header, 0, 0x02014b50);
  writeU16(header, 4, 20);
  writeU16(header, 6, 20);
  writeU16(header, 10, 0);
  writeU32(header, 12, zipDosTimestamp());
  writeU32(header, 16, crc);
  writeU32(header, 20, size);
  writeU32(header, 24, size);
  writeU16(header, 28, nameBytes.length);
  writeU32(header, 42, offset);
  return header;
}

function zipEndRecord(count, centralSize, centralStart) {
  const header = new Uint8Array(22);
  writeU32(header, 0, 0x06054b50);
  writeU16(header, 8, count);
  writeU16(header, 10, count);
  writeU32(header, 12, centralSize);
  writeU32(header, 16, centralStart);
  return header;
}

function zipDosTimestamp(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return ((dosDate << 16) | time) >>> 0;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
}

function writeU16(buffer, offset, value) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(buffer, offset, value) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
}

function encodeText(text) {
  return new TextEncoder().encode(text);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
