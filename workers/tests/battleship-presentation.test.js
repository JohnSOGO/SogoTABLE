import assert from "node:assert/strict";
import test from "node:test";
import { shipSvg } from "../../src/sogotable/static/games/battleship/ship-art.js";
import { ASSETS, paletteFor } from "../../src/sogotable/static/games/battleship/assets.js";
import { burstMarkup, markMarkup, shipFxClass, shakeClass, resultElapsed } from "../../src/sogotable/static/games/battleship/fx.js";
import { loadBattleshipView } from "../../src/sogotable/static/games/battleship/settings.js";

test("battleship art: every fleet ship draws in both orientations with unique gradient ids", () => {
  for (const [id, size] of [["carrier", 5], ["battleship", 4], ["cruiser", 3], ["submarine", 3], ["destroyer", 2], ["mystery", 6]]) {
    const h = shipSvg({ id }, size, "h", paletteFor("light"), null, `t${id}`);
    const v = shipSvg({ id }, size, "v", paletteFor("dark"), null, `t${id}`);
    assert.match(h, new RegExp(`viewBox="0 0 ${size * 100} 100"`));
    assert.match(v, new RegExp(`viewBox="0 0 100 ${size * 100}"`));
    assert.match(v, /rotate\(90\)/);
    assert.match(h, new RegExp(`id="ht${id}"`));
  }
});

test("battleship art: an asset override swaps in an image", () => {
  const svg = shipSvg({ id: "carrier" }, 5, "h", paletteFor("light"), "./carrier.png", "x");
  assert.match(svg, /<image href="\.\/carrier\.png"/);
  assert.ok(!svg.includes("<defs>"));
  assert.deepEqual(Object.keys(ASSETS.ships).sort(), ["battleship", "carrier", "cruiser", "destroyer", "submarine"]);
});

test("battleship fx: levels gate the bursts, markers stay at every level", () => {
  const hit = { hit: true }, miss = { hit: false };
  assert.equal(burstMarkup(hit, "off", 0), "");
  assert.match(burstMarkup(hit, "full", 120), /bs-debris/);
  assert.match(burstMarkup(hit, "full", 120), /animation-delay:-120ms/);
  assert.ok(!burstMarkup(hit, "lite", 0).includes("bs-debris"));
  assert.match(burstMarkup(miss, "full", 0), /bs-drop/);
  assert.match(markMarkup("damaged", "full"), /bs-fire-live/);
  assert.ok(!markMarkup("damaged", "off").includes("bs-fire-live"));
  assert.match(markMarkup("miss", "off"), /bs-peg-miss/);
  assert.equal(shipFxClass(false, true, "full"), "");
  assert.equal(shipFxClass(true, true, "full"), "bs-sinking");
  assert.equal(shipFxClass(true, true, "off"), "bs-wreck");
  assert.equal(shakeClass(hit, "full"), "bs-shake");
  assert.equal(shakeClass(hit, "lite"), "");
  assert.equal(resultElapsed({ radarUntil: 1000 }, 1600), 600);
  assert.equal(resultElapsed({ radarUntil: 1000 }, 900), 0);
});

test("battleship settings: defaults when storage is unavailable", () => {
  assert.deepEqual(loadBattleshipView(), { fx: "full", tilt: true, coords: true, tracker: true });
});
