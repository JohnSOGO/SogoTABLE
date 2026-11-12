#!/usr/bin/env node
// Last Orders art gallery — writes one HTML page showing every procedural
// portrait, card icon, drink, back, the table texture and the stat icons, in
// both light and dark themes, for visual QA.
//
//   node scripts/last-orders-gallery.mjs /tmp/lo-gallery.html
//
// Uses the real pack data + display table when present, so every shipped drink
// shows up; falls back to built-in samples otherwise.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  portraitSvg, PORTRAIT_IDS, cardArtSvg, cardFrameSvg, CARD_ICON_KEYS, drinkSvg, DRINK_VESSELS,
  cardBackSvg, drinkBackSvg, tableBgSvg, coinSvg, mugIconSvg, gritIconSvg, buzzIconSvg, svgDataUrl,
} from "../src/sogotable/static/games/last-orders/art.js";

const out = process.argv[2];
if (!out) {
  console.error("usage: node scripts/last-orders-gallery.mjs <out.html>");
  process.exit(2);
}

async function optional(path) {
  try { return await import(path); } catch { return {}; }
}
const packsMod = await optional("../workers/games/last-orders/packs.js");
const content = await optional("../src/sogotable/static/games/last-orders/content.js");
const names = content.CHARACTERS || {};
const cardText = content.CARDS || {};
const drinkText = content.DRINKS || {};

const SAMPLE_CARDS = [
  { id: "s:fist", kind: "action", effects: [{ op: "grit", who: "target", n: -2 }] },
  { id: "s:heart", kind: "action", effects: [{ op: "grit", who: "self", n: 3 }] },
  { id: "s:coins", kind: "action", effects: [{ op: "steal", n: 2 }] },
  { id: "s:bubbles", kind: "spike", effects: [{ op: "buzz", who: "target", n: 2 }] },
  { id: "s:cards", kind: "action", effects: [{ op: "draw", who: "self", n: 2 }] },
  { id: "s:palm", kind: "reaction", effects: [{ op: "negate" }] },
  { id: "s:swirl", kind: "reaction", effects: [{ op: "reflect" }] },
  { id: "s:dice", kind: "gamble", effects: [{ op: "take_lead" }] },
  { id: "s:tray", kind: "action", effects: [{ op: "order", n: 1 }] },
  { id: "s:bolt", kind: "action", effects: [{ op: "extra_action" }] },
];
const SAMPLE_DRINKS = DRINK_VESSELS.map((v, i) => ({
  def: { id: `s:drink:${v}`, effects: [{ op: "buzz", who: "target", n: 1 }], chaser: i === 1, house: i === 2, unrefusable: i === 3 },
  entry: { name: v, vessel: v },
}));

const realDrinks = [];
const seen = new Set();
for (const pack of Object.values(packsMod.PACKS || {})) {
  for (const d of pack.drinks || []) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    realDrinks.push({ def: d, entry: drinkText[d.id] || {} });
  }
}

const tile = (svg, caption, w = 96) => `<figure style="width:${w}px">${svg}<figcaption>${caption}</figcaption></figure>`;
const short = (id) => String(id).split(":").pop();

function section(theme) {
  const opts = { theme };
  const portraits = [...PORTRAIT_IDS, "promo:mystery-guest"].map((id) => tile(portraitSvg(id, { ...opts, size: 112 }), (names[id] && names[id].name) || id, 112)).join("");
  const small = [...PORTRAIT_IDS].map((id) => portraitSvg(id, { ...opts, size: 40 })).join("");
  const icons = SAMPLE_CARDS.map((d) => tile(cardArtSvg(d, {}, { ...opts, size: 80 }), short(d.id), 80)).join("")
    + ["action", "reaction", "gamble", "spike"].map((k) => tile(cardFrameSvg(k, { ...opts, size: 80 }), `frame:${k}`, 80)).join("");
  const drinks = [...SAMPLE_DRINKS, ...realDrinks].map(({ def, entry }) => {
    const flags = [def.chaser && "chaser", def.house && "house", def.unrefusable && "locked"].filter(Boolean).join(" ");
    return tile(drinkSvg(def, entry, { ...opts, size: 88 }), `${entry.name || short(def.id)}${flags ? ` <i>${flags}</i>` : ""}`, 88);
  }).join("");
  const backs = tile(cardBackSvg({ ...opts, size: 90 }), "card back", 90) + tile(drinkBackSvg({ ...opts, size: 90 }), "drink back", 90);
  const stats = [coinSvg, mugIconSvg, gritIconSvg, buzzIconSvg].map((fn) => `${fn({ ...opts, size: 32 })}${fn({ ...opts, size: 18 })}<span style="color:${theme === "dark" ? "#f3e6cf" : "#3b2a1f"}">${fn({ ...opts, size: 18, mono: true })}</span>`).join("&nbsp;&nbsp;");
  return `<section id="${theme}" class="${theme}" style="background-image:url('${svgDataUrl(tableBgSvg(opts))}')">
    <div class="panel"><h2>Portraits — ${theme}</h2><div class="row">${portraits}</div><div class="row tiny">${small}</div></div>
    <div class="panel"><h2>Card art</h2><div class="row">${icons}</div></div>
    <div class="panel"><h2>Drinks</h2><div class="row">${drinks}</div></div>
    <div class="panel"><h2>Backs &amp; stat icons</h2><div class="row">${backs}<div class="stats">${stats}</div></div></div>
  </section>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Last Orders art gallery</title><style>
body{margin:0;font:12px/1.3 system-ui,sans-serif}
section{padding:16px;background-size:400px 400px}
.panel{border-radius:14px;padding:10px 12px;margin:0 0 12px}
.light .panel{background:rgba(251,243,226,.92);color:#3b2a1f}
.dark .panel{background:rgba(26,20,16,.9);color:#f3e6cf}
h2{margin:0 0 8px;font-size:14px}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}
.tiny{gap:6px;margin-top:8px}
figure{margin:0;text-align:center}
figure svg{display:block}
figcaption{margin-top:3px;font-size:11px;opacity:.85;overflow-wrap:anywhere}
i{opacity:.7}
.stats{display:flex;align-items:center;gap:6px;padding:8px}
</style></head><body>${section("light")}${section("dark")}</body></html>`;

writeFileSync(resolve(out), html);
console.log(`wrote ${resolve(out)} (${PORTRAIT_IDS.length} portraits, ${SAMPLE_CARDS.length} card icons, ${SAMPLE_DRINKS.length + realDrinks.length} drinks)`);
