// Game pictures (docs/PICTURES.md): every picture URL mapped in an assets.js
// points at a committed file. imageSvg can't detect a 404, so a mapped but
// missing file would draw a blank card instead of falling back to the SVG art.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ASSETS as LO } from "../../src/sogotable/static/games/last-orders/assets.js";
import { ASSETS as CC } from "../../src/sogotable/static/games/chinese-checkers/assets.js";
import { CARDS, CHARACTERS, DRINKS } from "../../src/sogotable/static/games/last-orders/content.js";

const MAX_KB = { small: 60, large: 200 };

function urls() {
  const out = [];
  for (const group of ["portraits", "cards", "drinks"]) Object.entries(LO[group]).forEach(([id, url]) => out.push([`last-orders ${group} ${id}`, url, "small"]));
  for (const key of ["cardBack", "drinkBack"]) out.push([`last-orders ${key}`, LO[key], "small"]);
  out.push(["last-orders tableBg", LO.tableBg, "large"], ["chinese-checkers board", CC.board, "large"]);
  return out.filter(([, url]) => url);
}

test("pictures: every mapped picture file is committed and within its size budget", () => {
  for (const [what, url, size] of urls()) {
    const file = fileURLToPath(url);
    assert.ok(fs.existsSync(file), `${what}: ${file} is missing`);
    const kb = fs.statSync(file).size / 1024;
    assert.ok(kb <= MAX_KB[size], `${what}: ${kb.toFixed(0)} KB is over ${MAX_KB[size]} KB`);
  }
});

test("pictures: Last Orders picture ids all exist in the display table", () => {
  for (const id of Object.keys(LO.portraits)) assert.ok(CHARACTERS[id], `portrait for unknown character ${id}`);
  for (const id of Object.keys(LO.cards)) assert.ok(CARDS[id], `card picture for unknown card ${id}`);
  for (const id of Object.keys(LO.drinks)) assert.ok(DRINKS[id], `drink picture for unknown drink ${id}`);
});
