#!/usr/bin/env node
// Make the Last Orders voice clips (docs/voices.md): one MP3 per card, the card's
// name spoken by its patron in that patron's Kokoro voice (voice.js
// VOICE_PROFILES). Run ON SogoAI (Remote Control), where the TTS service runs;
// the game never calls TTS at runtime.
//
//   node scripts/voices/last-orders-voices.mjs [--url http://127.0.0.1:8880] [--only base:gorrum] [--force]
//
// The service is any OpenAI-compatible speech endpoint (Kokoro-FastAPI serves
// POST /v1/audio/speech { model, voice, input, speed, response_format }). Files
// land in src/sogotable/static/games/last-orders/voice/, and the script rewrites
// VOICE_IDS in assets.js to list exactly the clips on disk.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CARDS } from "../../src/sogotable/static/games/last-orders/content.js";
import { VOICE_PROFILES, lineFor } from "../../src/sogotable/static/games/last-orders/voice.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const gameDir = join(root, "src/sogotable/static/games/last-orders");
const outDir = join(gameDir, "voice");
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const url = arg("url", process.env.TTS_URL || "http://127.0.0.1:8880").replace(/\/$/, "");
const only = arg("only", "");
const force = process.argv.includes("--force");
const fileOf = (id) => join(outDir, `${id.replace(/:/g, "-")}.mp3`);

mkdirSync(outDir, { recursive: true });
let made = 0;
for (const [id, entry] of Object.entries(CARDS)) {
  const owner = id.split(":").slice(0, 2).join(":");
  if (only && owner !== only && id !== only) continue;
  const profile = VOICE_PROFILES[owner];
  if (!profile) { console.warn(`skip ${id}: no voice profile for ${owner}`); continue; }
  if (existsSync(fileOf(id)) && !force) continue;
  const res = await fetch(`${url}/v1/audio/speech`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "kokoro", voice: profile.kokoro, input: lineFor(entry.name), speed: profile.speed, response_format: "mp3" }),
  });
  if (!res.ok) { console.error(`fail ${id}: HTTP ${res.status} ${await res.text()}`); process.exitCode = 1; continue; }
  writeFileSync(fileOf(id), Buffer.from(await res.arrayBuffer()));
  made += 1;
  console.log(`ok ${id} (${profile.kokoro}) "${lineFor(entry.name)}"`);
}

// VOICE_IDS = every card whose clip is on disk, in content.js order.
const onDisk = new Set(readdirSync(outDir).filter((f) => f.endsWith(".mp3")));
const ids = Object.keys(CARDS).filter((id) => onDisk.has(`${id.replace(/:/g, "-")}.mp3`));
const assetsPath = join(gameDir, "assets.js");
const src = readFileSync(assetsPath, "utf8");
const list = ids.length ? `[\n${ids.map((id) => `  "${id}",`).join("\n")}\n]` : "[]";
writeFileSync(assetsPath, src.replace(/export const VOICE_IDS = \[[\s\S]*?\];/, `export const VOICE_IDS = ${list};`));
console.log(`made ${made}; ${ids.length} clips listed in assets.js VOICE_IDS`);
