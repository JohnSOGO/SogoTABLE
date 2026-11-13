// Last Orders — original procedural art (pure SVG string builders).
//
// Hand-built layered-shape portraits for every patron, effect icons for hand
// cards, drink illustrations, card/drink backs, the table texture and the
// small stat icons. Every function returns an SVG markup string; nothing here
// touches the DOM or the network, and nothing here knows a rule.
//
// Re-skin: frame/table/icon colours come from assets.js (`paletteFor(theme)`),
// and any key set in ASSETS.portraits / cards / drinks / cardBack / drinkBack /
// tableBg replaces the procedural art with that image. Gradient and clip ids
// are unique per call (module counter + optional `idPrefix`), so any number of
// pieces can share one page.
//
// Patron portraits live in portraits.js and the shared drawing primitives in
// art-kit.js; both are re-exported here so callers keep importing art.js.
import { ASSETS } from "./assets.js";
import {
  C_, E_, G_, INK, L_, P_, R_, darken, f1, hashColor, hashString, imageSvg, lighten, mir, nextId, paletteOf, seeded,
  setInk, star4, starPoly, svgDataUrl, svgWrap,
} from "./art-kit.js";

export { svgDataUrl } from "./art-kit.js";
export { PORTRAIT_IDS, characterAccent, portraitSvg } from "./portraits.js";

// =====================================================================
// Effect icons (100×100, centred around 50,52)
// =====================================================================
const ISW = 2.4;
const ICONS = {
  fist: (P) => [
    P_(starPoly(54, 50, 40, 26, 9), P.bolt, 0, `opacity=".9"`), L_("M12 40H24M8 52H22M12 64H24", 3, INK, `opacity=".55"`),
    R_(34, 78, 34, 14, 3, "#8a5a34", ISW), L_("M40 78V92M62 78V92", 1.4, "#5e3b20"),
    P_("M30 46C30 40 33 37 37 37L66 37C72 37 75 41 75 47L75 68C75 77 68 82 59 82L42 82C35 82 30 77 30 70Z", P.skinFist, ISW),
    [0, 1, 2, 3].map((i) => R_(30 + i * 11.2, 28 + (i === 0 || i === 3 ? 3 : 0), 11.2, 22, 5.6, P.skinFist, ISW)).join(""),
    P_("M30 58C30 51.5 36 49.5 44 51L60 53C64.5 54 64.5 61 60 62L40 64C34 64.5 30 62 30 58Z", P.skinFist, ISW),
    L_("M36 33.5Q38 31.5 40 33.5M47.5 30.5Q49.5 28.5 51.5 30.5M58.5 30.5Q60.5 28.5 62.5 30.5M69 33.5Q71 31.5 73 33.5", 1.4, "#c98a62"),
  ].join(""),
  heart: (P) => [
    L_("M44 22C40 17 44 12 47 15C50 12 54 17 50 22L47 25Z", 1.6, P.heart, `fill="${P.heart}" opacity=".7"`),
    L_("M58 14C55.5 11 58 8 60 10C62 8 64.5 11 62 14L60 16Z", 1.4, P.heart, `fill="${P.heart}" opacity=".55"`),
    L_("M72 50C86 50 86 74 72 74", 6.5, INK), L_("M72 50C86 50 86 74 72 74", 2.8, P.bone), R_(26, 36, 48, 52, 7, P.bone, ISW),
    P_("M24 40C22 31 31 26 38 30C43 24 54 25 57 31C64 26 76 30 75 38C78 42 74 46 70 44C66 47 30 47 26 44C22 44 22 41 24 40Z", P.foam, ISW),
    P_("M50 78C40 70 34 65 34 58C34 52 40 49 44 51C47 52.5 49 55 50 57C51 55 53 52.5 56 51C60 49 66 52 66 58C66 65 60 70 50 78Z", P.heart, ISW),
    E_(44, 56.5, 3, 2, "#fff", 0, `opacity=".6"`),
  ].join(""),
  coins: (P) => {
    const coin = (y) => R_(18, y, 40, 7, 3.5, P.goldDark, ISW) + E_(38, y, 20, 5.5, P.gold, ISW);
    return [
      [84, 76, 68, 60, 52].map(coin).join(""), E_(38, 52, 13, 3.4, "none", 1.4, `stroke="${P.goldDark}"`),
      C_(68, 60, 19, P.gold, ISW), C_(68, 60, 13.5, "none", 1.6, `stroke="${P.goldDark}"`),
      P_(starPoly(68, 60, 7.5, 3.4, 5), P.goldLight, 1.4),
      E_(61, 50, 4.5, 2.4, "#fff", 0, `opacity=".7" transform="rotate(-35 61 50)"`),
      star4(84, 30, 6, P.goldLight), star4(24, 34, 4.5, P.goldLight),
    ].join("");
  },
  bubbles: (P) => {
    const b = (x, y, r) => C_(x, y, r, P.buzzLight, ISW) + C_(x - r * 0.35, y - r * 0.35, r * 0.28, "#fff", 0, `opacity=".9"`);
    return [
      b(38, 66, 18), b(66, 44, 13), b(70, 76, 9), b(40, 30, 8), b(82, 22, 5.5), b(20, 40, 4.5),
      L_("M38 66m-7 0a7 7 0 1 1 7 7a4 4 0 1 1 -4 -4", 2.6, P.buzz),
      L_("M66 44m-5 0a5 5 0 1 1 5 5a2.6 2.6 0 1 1 -2.6 -2.6", 2.2, P.buzz),
    ].join("");
  },
  cards: (P) => {
    const card = (rot, fill) => G_(`rotate(${rot} 50 88)`, R_(34, 26, 32, 46, 5, fill, ISW) + R_(38, 30, 24, 38, 3, "none", 1.2, `stroke="${P.frameLight}"`));
    return [card(-22, P.bone), card(0, P.bone), card(22, P.bone),
      G_("rotate(22 50 88)", P_("M50 41V57M42 49H58", "none", 4.5, `stroke="${P.spike}"`))].join("");
  },
  palm: (P) => [
    C_(50, 54, 40, P.cardGlow, 0),
    [[33, 30, 8.5, 34], [42, 21, 8.5, 40], [51, 22.5, 8.5, 38], [60, 30, 8, 31]].map(([x, y, w, h]) => R_(x, y, w, h, w / 2, P.skinFist, ISW)).join(""),
    P_("M68.5 66C72 58 77 53 82 54.5C85 56 83 62 78 70L72 80Z", P.skinFist, ISW),
    P_("M33 52L33 74C33 85 41 92 51 92C61 92 69 86 69 74L68 52Z", P.skinFist, ISW), L_("M42 72Q50 76 58 70M44 80Q50 82 56 79", 1.4, "#c98a62"),
  ].join(""),
  swirl: (P) => {
    const arc = (d) => L_(d, 11, INK) + L_(d, 6.4, P.bone);
    return [
      arc("M24 46A27 27 0 0 1 70 30"), P_("M64 18L82 32L60 40Z", P.bone, ISW),
      arc("M76 58A27 27 0 0 1 30 74"), P_("M36 86L18 72L40 64Z", P.bone, ISW),
      C_(50, 52, 6, P.bolt, ISW),
    ].join("");
  },
  dice: (P) => {
    const pips = (x, y, s, list) => list.map(([u, v]) => C_(f1(x + u * s), f1(y + v * s), f1(s * 0.11), INK, 0)).join("");
    return [
      G_("rotate(-14 36 62)", R_(18, 44, 36, 36, 8, P.bone, ISW) + pips(18, 44, 36, [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]])),
      G_("rotate(16 66 40)", R_(50, 24, 32, 32, 7, P.bone, ISW) + pips(50, 24, 32, [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]])),
      L_("M80 66l6 4M84 60l7 1M76 72l3 6", 2.4, INK, `opacity=".5"`),
    ].join("");
  },
  tray: (P) => [
    E_(50, 80, 38, 9, P.pewter, ISW), E_(50, 78, 31, 6, P.pewterDark, 0, `opacity=".35"`),
    L_("M66 42C78 42 78 64 66 64", 6, INK), L_("M66 42C78 42 78 64 66 64", 2.6, P.woodVessel),
    R_(32, 34, 34, 42, 4, P.woodVessel, ISW), R_(31, 40, 36, 4, 1.4, P.pewter, 1.4), R_(31, 66, 36, 4, 1.4, P.pewter, 1.4),
    P_("M29 37C26 29 34 25 39 28C42 21 54 22 57 27C63 23 72 28 69 36C68 40 64 39 63 42C62 45 59 44 59 41C52 40 35 41 29 37Z", P.foam, ISW),
  ].join(""),
  bolt: (P) => [C_(50, 52, 38, P.cardGlow, 0), P_("M58 10L28 56L47 56L39 92L74 42L54 42L64 10Z", P.bolt, ISW), L_("M55 16L37 50", 1.6, "#fff", `opacity=".7"`)].join(""),
  drop: (P) => [
    P_("M50 18C60 34 70 46 70 60C70 72 61 80 50 80C39 80 30 72 30 60C30 46 40 34 50 18Z", P.spike, ISW),
    P_("M40 58C40 52 43 47 46 44", "none", 3, `stroke="#fff" opacity=".7"`), star4(72, 26, 7, P.bolt), star4(26, 34, 5, P.bolt),
  ].join(""),
  star: (P) => P_(starPoly(50, 52, 34, 15, 5), P.bolt, ISW),
};
/** Icon keys cardArtSvg can draw; displayEntry.icon may name one directly. */
export const CARD_ICON_KEYS = Object.keys(ICONS);
const PRIORITY_OPS = { negate: "palm", soften: "palm", redirect: "swirl", reflect: "swirl", gamble: "dice", take_lead: "dice", raise: "dice", order: "tray", extra_action: "bolt" };
const KIND_ICON = { action: "fist", reaction: "palm", gamble: "dice", spike: "drop" };

/** Which icon a card shows: displayEntry.icon, then signature ops, then its first effect. */
export function cardIconKey(def = {}, displayEntry = {}) {
  if (displayEntry && ICONS[displayEntry.icon]) return displayEntry.icon;
  const effects = Array.isArray(def.effects) ? def.effects : [];
  for (const e of effects) if (PRIORITY_OPS[e.op]) return PRIORITY_OPS[e.op];
  for (const e of effects) {
    if (e.op === "grit") return Number(e.n) > 0 ? "heart" : "fist";
    if (e.op === "gold" || e.op === "steal" || e.op === "collect") return "coins";
    if (e.op === "buzz") return "bubbles";
    if (e.op === "draw") return "cards";
  }
  return KIND_ICON[def.kind] || "star";
}

function cardTile(kind, iconKey, P, opts) {
  setInk(P.ink);
  const id = nextId(opts.idPrefix || "loc");
  const base = P[kind] || P.generic;
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6; const b = a + Math.PI / 14;
    return `M50 52L${f1(50 + 80 * Math.cos(a))} ${f1(52 + 80 * Math.sin(a))}L${f1(50 + 80 * Math.cos(b))} ${f1(52 + 80 * Math.sin(b))}Z`;
  }).join("");
  const body = [
    `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(base, 0.28)}"/><stop offset="1" stop-color="${darken(base, 0.12)}"/></linearGradient>`,
    `<clipPath id="${id}c"><rect width="100" height="100" rx="12"/></clipPath></defs>`,
    `<g clip-path="url(#${id}c)"><rect width="100" height="100" fill="url(#${id}g)"/><path d="${rays}" fill="#fff" opacity=".1"/>`,
    `<circle cx="50" cy="52" r="34" fill="${P.cardGlow}"/>`, ICONS[iconKey](P), "</g>",
    `<rect x="1" y="1" width="98" height="98" rx="11" fill="none" stroke="${darken(base, 0.35)}" stroke-width="2"/>`,
  ].join("");
  return svgWrap(body, { size: opts.size, label: opts.label });
}

/** The art panel for a hand card: kind-coloured tile + the dominant-effect icon. */
export function cardArtSvg(def = {}, displayEntry = {}, opts = {}) {
  const override = ASSETS.cards && def.id && ASSETS.cards[def.id];
  const label = opts.label || (displayEntry && displayEntry.name) || def.id;
  if (override) return imageSvg(override, { size: opts.size, label, rx: 12 });
  return cardTile(def.kind, cardIconKey(def, displayEntry || {}), paletteOf(opts), { ...opts, label });
}
/** A kind tile with that kind's default emblem (for unknown or face-down-ish cards). */
export function cardFrameSvg(kind, opts = {}) { return cardTile(kind, KIND_ICON[kind] || "star", paletteOf(opts), opts); }

// =====================================================================
// Drinks
// =====================================================================
function liquidOf(displayEntry, seed) {
  const p = displayEntry && displayEntry.palette;
  if (typeof p === "string") return p;
  if (Array.isArray(p) && p.length) return p[0];
  if (p && typeof p === "object") return p.liquid || p.primary || p.main || p.color || Object.values(p).find((v) => typeof v === "string") || hashColor(seed, 0.6, 0.5);
  const words = `${(displayEntry && displayEntry.name) || ""} ${seed}`.toLowerCase();
  const hit = LIQUID_WORDS.find(([w]) => new RegExp(`\\b${w}`).test(words));
  return hit ? hit[1] : hashColor(seed, 0.62, 0.5);
}
// Name keywords → liquid colour / vessel, so unpainted drinks still look like what they're called.
const LIQUID_WORDS = Object.entries({
  seafoam: "#7ad6b8", stout: "#4a2a1a", ink: "#2c2748", whiskey: "#c4651c", grog: "#9a5a26", ale: "#dc9a2c", mead: "#e9b43a", cider: "#e6bf48",
  milk: "#f4ecd8", nog: "#f2deb0", water: "#9fd3ea", melt: "#bfe8f4", frost: "#a8d8f0", tea: "#a8642c", wine: "#8e1f3a",
  port: "#7c1d3a", punch: "#e0466a", cordial: "#d8486a", flute: "#f0d070", soda: "#7fd0e0", tonic: "#86d66a", coolant: "#4fdcc0",
  cooler: "#4fdcc0", fountain: "#a4e070", dare: "#e8502c", penny: "#c87a3a", jug: "#7a5a8a", shanty: "#3a8aa8", special: "#dc9a2c",
});
const VESSEL_WORDS = Object.entries({
  tea: "teacup", milk: "teacup", nog: "teacup", cordial: "teacup", wine: "goblet", port: "goblet", flute: "goblet", punch: "goblet",
  whiskey: "bottle", grog: "bottle", tonic: "bottle", dare: "bottle", jug: "bottle", mead: "horn", horn: "horn", soda: "flask",
  melt: "flask", cooler: "flask", potion: "flask", ale: "tankard", stout: "tankard", cider: "tankard", shanty: "tankard", special: "tankard",
});
const VESSEL_EMOJI = { "🍷": "goblet", "🥂": "goblet", "🥃": "bottle", "🍾": "bottle", "🏺": "bottle", "🍵": "teacup", "🥛": "teacup", "☕": "teacup", "🍺": "tankard", "🍻": "tankard", "🍯": "horn", "🧪": "flask" };
const GLASS_HI = (d) => L_(d, 2.6, "#fff", `opacity=".6"`);
const VESSELS = {
  tankard: (L, P) => [
    L_("M68 42C82 42 82 72 68 72", 8, INK), L_("M68 42C82 42 82 72 68 72", 4.2, P.glass),
    R_(30, 34, 40, 52, 5, P.glass, ISW), R_(32.5, 44, 35, 39.5, 3, L, 0),
    [40, 50, 60].map((x) => L_(`M${x} 46V80`, 1.2, darken(L, 0.2), `opacity=".5"`)).join(""),
    R_(28.5, 80, 43, 7, 2.5, P.pewter, ISW), R_(28.5, 40, 43, 5, 2, P.pewter, ISW),
    P_("M27 41C23 32 32 27 37 30C41 22 55 22 58 28C64 23 75 29 72 38C71 43 67 41 66 45C65 48 62 47 62 44C54 43 34 45 27 41Z", lighten(L, 0.82), ISW),
    GLASS_HI("M35 50V74"),
  ].join(""),
  goblet: (L, P) => [
    P_("M26 22L74 22C74 46 64 58 50 58C36 58 26 46 26 22Z", P.glass, ISW),
    P_("M27.5 32L72.5 32C71 48 62 56 50 56C38 56 29 48 27.5 32Z", L, 0), E_(50, 32, 22.5, 3.2, lighten(L, 0.3), 0),
    L_("M26 22H74", 3.2, P.gold), GLASS_HI("M33 36Q35 46 41 51"),
    R_(46.5, 57, 7, 22, 2, P.gold, ISW), C_(50, 66, 4.5, P.gold, ISW), E_(50, 82, 17, 5, P.gold, ISW),
  ].join(""),
  bottle: (L, P) => [
    P_("M35 46C35 39 42 36 44 33L44 18L56 18L56 33C58 36 65 39 65 46L65 86C65 90 61 92 57 92L43 92C39 92 35 90 35 86Z", L, ISW),
    R_(42.5, 9, 15, 11, 3, "#b98a5a", ISW), L_("M46 12V18M50 11V18M54 12V18", 1, "#8a5a34"),
    R_(37, 56, 26, 22, 3, P.paper, 1.8), P_(starPoly(50, 67, 6.5, 3, 5), L, 1.4),
    GLASS_HI("M39 48V84"), R_(43, 30, 14, 4, 1.5, P.gold, 1.4),
  ].join(""),
  teacup: (L, P) => [
    L_("M42 30C38 24 46 20 42 14M56 30C52 24 60 20 56 14", 2.4, P.inkSoft),
    E_(50, 82, 34, 8, P.bone, ISW), E_(50, 80, 22, 4, darken(P.bone, 0.08), 0),
    L_("M72 52C86 50 86 70 70 70", 6.5, INK), L_("M72 52C86 50 86 70 70 70", 3, P.bone),
    P_("M24 48L76 48C76 68 66 80 50 80C34 80 24 68 24 48Z", P.bone, ISW),
    E_(50, 48, 26, 6, L, ISW), E_(44, 47, 8, 1.8, "#fff", 0, `opacity=".45"`),
    P_("M50 70C45 66 42 63.5 42 60.5C42 57.5 46 56.5 48 58.5L50 60.5L52 58.5C54 56.5 58 57.5 58 60.5C58 63.5 55 66 50 70Z", P.heart, 1.4),
  ].join(""),
  horn: (L, P) => [
    P_("M22 30C24 26 48 24 54 30C58 50 70 70 86 80C89 83 86 88 81 86C60 78 38 60 22 30Z", "#e8cf9c", ISW),
    P_("M70 72C76 77 81 80 86 80C89 83 86 88 81 86C77 84 73 80 70 72Z", "#8a5a34", 0),
    L_("M49 46C42 48 34 46 30 43M62 66C56 68 50 66 46 62", 3.6, P.gold),
    E_(38, 29, 16, 5.2, L, ISW), P_("M25 28C28 25 34 25 36 27C40 24 48 25 50 28C44 30 30 31 25 28Z", lighten(L, 0.8), 0),
    L_("M22 30C24 26 48 24 54 30", 3, P.gold), GLASS_HI("M30 40Q40 56 52 66"),
  ].join(""),
  flask: (L, P) => [
    C_(50, 64, 22, P.glass, ISW),
    P_("M29.4 60Q40 64 50 60T70.6 60A21 21 0 1 1 29.4 60Z", L, 0),
    C_(44, 72, 2.4, lighten(L, 0.5), 0), C_(55, 66, 1.6, lighten(L, 0.5), 0), C_(52, 77, 1.3, lighten(L, 0.5), 0),
    R_(43.5, 26, 13, 20, 2, P.glass, ISW), R_(42, 17, 16, 11, 3, "#b98a5a", ISW),
    GLASS_HI("M36 56Q34 64 37 72"),
    L_("M43 33H57", 2.4, P.gold),
  ].join(""),
};
/** Vessel keys drinkSvg can draw; displayEntry.vessel may name one directly. */
export const DRINK_VESSELS = Object.keys(VESSELS);

export function drinkVessel(def = {}, displayEntry = {}) {
  if (displayEntry && VESSELS[displayEntry.vessel]) return displayEntry.vessel;
  const words = `${(displayEntry && displayEntry.name) || ""} ${def.id || ""}`.toLowerCase();
  const hit = VESSEL_WORDS.find(([w]) => new RegExp(`\\b${w}`).test(words));
  if (hit) return hit[1];
  if (displayEntry && VESSEL_EMOJI[displayEntry.emoji]) return VESSEL_EMOJI[displayEntry.emoji];
  const effects = Array.isArray(def.effects) ? def.effects : [];
  if (effects.some((e) => e.op === "grit" && Number(e.n) > 0)) return "teacup";
  if (def.house) return "tankard";
  if (effects.some((e) => e.op === "buzz" && Number(e.n) >= 3)) return "bottle";
  return DRINK_VESSELS[hashString(String(def.id || "drink")) % DRINK_VESSELS.length];
}

const BADGES = {
  crown: (P) => G_("translate(4 4)", C_(12, 12, 11, P.badge, 1.8) + P_("M4.5 16.5L3.5 7L8.5 11L12 4.5L15.5 11L20.5 7L19.5 16.5Z", P.gold, 1.5)),
  lock: (P) => G_("translate(72 4)", C_(12, 12, 11, P.badge, 1.8) + L_("M8.5 11V8.5A3.5 3.5 0 0 1 15.5 8.5V11", 2) + R_(6.5, 10.5, 11, 8.5, 1.8, P.goldDark, 1.5) + C_(12, 14.5, 1.3, INK, 0)),
};

/** A drink illustration: vessel + liquid colour, chaser bubbles, house/unrefusable badges. */
export function drinkSvg(drinkDef = {}, displayEntry = {}, opts = {}) {
  const label = opts.label || (displayEntry && displayEntry.name) || drinkDef.id;
  const override = ASSETS.drinks && drinkDef.id && ASSETS.drinks[drinkDef.id];
  if (override) return imageSvg(override, { size: opts.size, label, rx: 14 });
  const P = paletteOf(opts);
  setInk(P.ink);
  const id = nextId(opts.idPrefix || "lod");
  const L = liquidOf(displayEntry, drinkDef.id || "drink");
  const dark = Boolean(P.backdropDrop);
  const bubbles = drinkDef.chaser
    ? [[84, 74, 4.5], [80, 60, 3.4], [86, 48, 2.8], [81, 37, 2.2], [16, 70, 3.2], [20, 56, 2.4]].map(([x, y, r]) => C_(x, y, r, lighten(L, 0.65), 1.3) + C_(x - r * 0.35, y - r * 0.35, r * 0.3, "#fff", 0)).join("")
    : "";
  const body = [
    `<defs><radialGradient id="${id}b" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="${dark ? darken(L, 0.45) : lighten(L, 0.82)}"/><stop offset="1" stop-color="${dark ? darken(L, 0.68) : lighten(L, 0.58)}"/></radialGradient>`,
    `<clipPath id="${id}c"><rect width="100" height="100" rx="14"/></clipPath></defs>`,
    `<g clip-path="url(#${id}c)"><rect width="100" height="100" fill="url(#${id}b)"/>`,
    E_(50, 90, 34, 6, "#000", 0, `opacity=".14"`),
    VESSELS[drinkVessel(drinkDef, displayEntry || {})](L, P), bubbles,
    drinkDef.house ? BADGES.crown(P) : "", drinkDef.unrefusable ? BADGES.lock(P) : "", "</g>",
    `<rect x="1" y="1" width="98" height="98" rx="13" fill="none" stroke="${darken(L, 0.4)}" stroke-width="1.8" opacity=".6"/>`,
  ].join("");
  return svgWrap(body, { size: opts.size, label });
}

// =====================================================================
// Backs, table, stat icons
// =====================================================================
function backSvg(kind, opts) {
  const P = paletteOf(opts);
  setInk(P.ink);
  const id = nextId(opts.idPrefix || "lob");
  const card = kind === "card";
  const [a, b, trim] = card ? [P.cardBackA, P.cardBackB, P.cardBackTrim] : [P.drinkBackA, P.drinkBackB, P.drinkBackTrim];
  const pattern = card
    ? `<pattern id="${id}p" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 7H14M7 0V14" stroke="${trim}" stroke-width=".8" opacity=".22"/></pattern>`
    : `<pattern id="${id}p" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="2.2" fill="none" stroke="${trim}" stroke-width=".8" opacity=".25"/><circle cx="13" cy="13" r="1.3" fill="${trim}" opacity=".18"/></pattern>`;
  const mug = G_("translate(39.5 76) rotate(16)", L_("M-9 -6C-17 -6 -17 8 -9 8", 3.4, trim) + R_(-9, -12, 18, 26, 3, trim, 0) + R_(-9, -6, 18, 2.4, 0, b, 0, `opacity=".5"`)
    + R_(-9, 7, 18, 2.4, 0, b, 0, `opacity=".5"`) + P_("M-11 -11C-13 -16 -7 -19 -4 -16C-2 -20 5 -20 6 -16C10 -18 13 -13 10.5 -10Z", P.foam, 0));
  const emblem = card
    ? mug + mir(mug) + star4(50, 52, 6, P.foam) + C_(42, 50, 1.4, P.foam, 0) + C_(58, 49, 1.2, P.foam, 0) + C_(50, 43, 1.1, P.foam, 0)
    : P_("M41 54C41 49 45 47 45 44L45 35L53 35L53 44C53 47 57 49 57 54L57 88C57 90 55 92 53 92L45 92C43 92 41 90 41 88Z", trim, 0) + R_(43.5, 30, 11, 6, 2, P.foam, 0)
      + R_(43.5, 62, 11, 14, 1.5, b, 0, `opacity=".55"`) + P_("M59 64L73 64L71 86C71 89 69 90 66 90C63 90 61 89 61 86Z", trim, 0) + R_(60.5, 68, 11.5, 2.4, 0, b, 0, `opacity=".5"`)
      + C_(36, 52, 1.8, P.foam, 0) + C_(33, 42, 1.2, P.foam, 0) + C_(66, 56, 1.5, P.foam, 0) + C_(70, 48, 1, P.foam, 0);
  const body = [
    `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>${pattern}</defs>`,
    `<rect width="100" height="140" rx="10" fill="url(#${id}g)"/><rect width="100" height="140" rx="10" fill="url(#${id}p)"/>`,
    `<rect x="6" y="6" width="88" height="128" rx="6" fill="none" stroke="${trim}" stroke-width="1.6" opacity=".85"/>`,
    `<rect x="9.5" y="9.5" width="81" height="121" rx="4" fill="none" stroke="${trim}" stroke-width=".8" stroke-dasharray="3 2.4" opacity=".6"/>`,
    `<circle cx="50" cy="70" r="31" fill="${b}" stroke="${trim}" stroke-width="2"/><circle cx="50" cy="70" r="26" fill="none" stroke="${trim}" stroke-width=".8" opacity=".6"/>`,
    emblem,
    [[16, 16], [84, 16], [16, 124], [84, 124]].map(([x, y]) => star4(x, y, 4, trim)).join(""),
  ].join("");
  return svgWrap(body, { size: opts.size, label: opts.label, viewBox: "0 0 100 140" });
}
/** Hand-card back (100×140 viewBox — scale with CSS or `size` = width px). */
export function cardBackSvg(opts = {}) {
  if (ASSETS.cardBack) return imageSvg(ASSETS.cardBack, { size: opts.size, label: opts.label, viewBox: "0 0 100 140", rx: 10 });
  return backSvg("card", opts);
}
/** Drink-deck card back (100×140 viewBox). */
export function drinkBackSvg(opts = {}) {
  if (ASSETS.drinkBack) return imageSvg(ASSETS.drinkBack, { size: opts.size, label: opts.label, viewBox: "0 0 100 140", rx: 10 });
  return backSvg("drink", opts);
}

/** Subtle wood-plank table texture (400×400, `slice` so it covers any box; tiles cleanly as a CSS background). */
export function tableBgSvg(opts = {}) {
  const P = paletteOf(opts);
  if (ASSETS.tableBg) return imageSvg(ASSETS.tableBg, { label: opts.label, viewBox: "0 0 400 400", rx: 0 });
  const rand = seeded(`table:${opts.seed || "last-orders"}`);
  const planks = [];
  const tones = [P.tableA, P.tableB, P.tableC, P.tableB];
  for (let i = 0; i < 4; i += 1) {
    const y = i * 100;
    planks.push(`<rect x="0" y="${y}" width="400" height="100" fill="${tones[i]}"/>`);
    for (let g = 0; g < 7; g += 1) {
      const gy = y + 10 + g * 12 + rand() * 6; const amp = 2 + rand() * 4; const ph = rand() * 400;
      planks.push(`<path d="M0 ${f1(gy)}C${f1(100 + ph * 0.1)} ${f1(gy - amp)} ${f1(200 - ph * 0.1)} ${f1(gy + amp)} 400 ${f1(gy)}" fill="none" stroke="${P.tableGrain}" stroke-width="${f1(0.8 + rand() * 1.4)}"/>`);
    }
    const kx = 40 + rand() * 320; const ky = y + 30 + rand() * 40;
    planks.push(`<ellipse cx="${f1(kx)}" cy="${f1(ky)}" rx="${f1(9 + rand() * 6)}" ry="${f1(3.5 + rand() * 2)}" fill="none" stroke="${P.tableGrain}" stroke-width="1.6"/><ellipse cx="${f1(kx)}" cy="${f1(ky)}" rx="3" ry="1.4" fill="${P.tableSeam}"/>`);
    planks.push(`<path d="M0 ${y + 0.5}H400" stroke="${P.tableSeam}" stroke-width="2"/>`);
    const nx = i % 2 ? 300 : 100;
    planks.push(`<circle cx="${nx}" cy="${y + 12}" r="2" fill="${P.tableSeam}"/><circle cx="${nx}" cy="${y + 88}" r="2" fill="${P.tableSeam}"/>`);
  }
  const vb = "0 0 400 400";
  return svgWrap(planks.join(""), { label: opts.label, viewBox: vb, extra: ` preserveAspectRatio="xMidYMid slice"` });
}

/** CSS `url(...)` for the table background. A picture file is used directly: an SVG shown as a CSS
 *  image (data URL) can't load an external <image>, so the file must never be wrapped in tableBgSvg. */
export function tableBgCssUrl(opts = {}) {
  return `url("${ASSETS.tableBg || svgDataUrl(tableBgSvg(opts))}")`;
}

// Stat icons: 24×24, simple shapes. `mono: true` draws in currentColor only.
function statIcon(opts, drawColour, drawMono) {
  const P = paletteOf(opts);
  setInk(P.ink);
  return svgWrap(opts.mono ? drawMono() : drawColour(P), { size: opts.size === undefined ? 24 : opts.size, label: opts.label, viewBox: "0 0 24 24" });
}
const MONO = (d, extra = "") => `<path d="${d}" fill="currentColor"${extra}/>`;
const HEART_D = "M12 21C6 16.5 2.5 13.2 2.5 9C2.5 5.8 5 3.8 7.6 3.8C9.4 3.8 11 4.8 12 6.4C13 4.8 14.6 3.8 16.4 3.8C19 3.8 21.5 5.8 21.5 9C21.5 13.2 18 16.5 12 21Z";

export function coinSvg(opts = {}) {
  return statIcon(opts,
    (P) => C_(12, 12, 9.6, P.gold, 1.4) + C_(12, 12, 6.6, "none", 1.1, `stroke="${P.goldDark}"`) + P_(starPoly(12, 12, 3.8, 1.7, 5), P.goldLight, 0.9) + E_(8.6, 8, 1.8, 1, "#fff", 0, `opacity=".7" transform="rotate(-35 8.6 8)"`),
    () => `<circle cx="12" cy="12" r="9.6" fill="currentColor"/><path d="${starPoly(12, 12, 3.8, 1.7, 5)}" fill="none" stroke="currentColor" stroke-width="0"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/>`);
}
export function mugIconSvg(opts = {}) {
  return statIcon(opts,
    (P) => L_("M17 9.5C21 9.5 21 16.5 17 16.5", 3.6, INK) + L_("M17 9.5C21 9.5 21 16.5 17 16.5", 1.6, P.woodVessel) + R_(5, 7, 12.5, 14, 2, P.woodVessel, 1.3) + R_(4.5, 9, 13.5, 1.8, 0.8, P.pewter, 0.9) + R_(4.5, 17.5, 13.5, 1.8, 0.8, P.pewter, 0.9) + P_("M4 8C3 5 6 3.5 8 4.6C9.5 2 14 2.4 14.6 4.6C16.6 3.8 19 5.6 18 8Z", P.foam, 1.2),
    () => MONO("M5 8H17.5V9.5C21.5 9.5 21.5 17 17.5 17V19C17.5 20.1 16.6 21 15.5 21H7C5.9 21 5 20.1 5 19ZM17.5 11.2V15.3C19.2 15.3 19.2 11.2 17.5 11.2ZM4 7C3.4 4.6 6 3.3 8 4.3C9.5 1.8 14 2.2 14.6 4.3C16.6 3.6 19 5.2 18.2 7Z"));
}
export function gritIconSvg(opts = {}) {
  return statIcon(opts,
    (P) => P_(HEART_D, P.heart, 1.4) + G_("rotate(-35 12 12)", R_(6.5, 10, 11, 4, 1.4, P.bone, 0.9) + C_(10.5, 12, 0.5, P.heartDark, 0) + C_(13.5, 12, 0.5, P.heartDark, 0)) + E_(7.4, 8, 1.6, 1, "#fff", 0, `opacity=".6"`),
    () => MONO(HEART_D));
}
export function buzzIconSvg(opts = {}) {
  return statIcon(opts,
    (P) => C_(9.5, 14, 6.5, P.buzzLight, 1.3) + C_(17, 7.5, 4, P.buzzLight, 1.2) + C_(19, 16.5, 2.2, P.buzzLight, 1) + L_("M9.5 14m-2.6 0a2.6 2.6 0 1 1 2.6 2.6a1.5 1.5 0 1 1 -1.5 -1.5", 1.3, P.buzz) + C_(7.4, 11.6, 1.2, "#fff", 0) + C_(15.8, 6.2, 0.9, "#fff", 0),
    () => `<circle cx="9.5" cy="14" r="6.5" fill="currentColor"/><circle cx="17" cy="7.5" r="4" fill="currentColor"/><circle cx="19" cy="16.5" r="2.2" fill="currentColor"/>`);
}
