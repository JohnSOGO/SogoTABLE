// Roll Through the Ages — client rules core (PURE: no DOM, no transport).
//
// The game data (dice faces, monuments, developments, goods, disasters) and the
// small pure helpers the local turn engine (board.js) leans on — face emoji that
// reflect owned developments, the goods value chart, and the score breakdown.
// This mirrors the Yahtzee precedent (a client rules.js beside the renderer) and
// stays framework-free so the architecture purity guard is satisfied and the
// turn maths can be reasoned about without a browser.
//
// The SERVER (workers/games/rtta/rules.js) owns the authoritative score and the
// cross-player resolution; this module is only the local preview + the values
// the board packages into a COMMIT_TURN.

export const MIN_CITIES = 3;
export const MAX_CITIES = 7;
export const MAX_ROLLS = 3;

// The six canonical Roll Through the Ages die faces.
export const FACES = [
  { key: "food3",  emojis: "🌾🌾🌾",    food: 3 },
  { key: "choice", emojis: "🌾🌾\n⚒️⚒️", choice: true },
  { key: "work3",  emojis: "⚒️⚒️\n⚒️",  work: 3 },
  { key: "good1",  emojis: "📦",         good: 1, big: true },
  { key: "coin",   emojis: "🪙",         coin: 1 },
  { key: "skull",  emojis: "📦📦💀",     good: 2, skull: 1, skullFace: true },
];

// Cities: 3 starting (locked), then 4th–7th cost 3/4/5/6 workers.
export const CITY_COSTS = [null, null, null, 3, 4, 5, 6];

// Goods value chart: value = base × triangular(n); base 1/2/3/4/5.
// base = per-unit value; holes = spaces on that pegboard row (wood is collected
// first/most, so its row is longest). Value = base × triangular(n).
export const GOODS = [
  { name: "🪵 Wood",      base: 1, holes: 8 },
  { name: "🪨 Stone",     base: 2, holes: 7 },
  { name: "🏺 Pottery",   base: 3, holes: 6 },
  { name: "🧵 Cloth",     base: 4, holes: 5 },
  { name: "🗡️ Spearhead", base: 5, holes: 4 },
];

// Monuments: workers, first-builder VP, later-builder VP. shape = boxes per row
// (top→bottom), drawn centered to mimic the silhouette; players = min players
// before it's in play. vb = svg viewBox [w,h]; boxTop = y where the worker-box
// cluster starts; art = silhouette drawn behind the boxes (same coordinate space).
export const MONUMENTS = [
  { name: "Step Pyramid", w: 3, first: 1, later: 0, shape: [1, 2],
    vb: [70, 58], boxTop: 8,
    art: '<ellipse class="artdim" cx="35" cy="52" rx="27" ry="4"/><polygon class="art" points="12,50 58,50 45,6 25,6"/>' },
  { name: "Stone Circle", w: 5, first: 2, later: 1, shape: [3, 2],
    vb: [80, 58], boxTop: 8,
    art: '<ellipse class="artdim" cx="40" cy="50" rx="37" ry="9"/><rect class="art" x="20" y="14" width="9" height="34" rx="2"/><rect class="art" x="51" y="14" width="9" height="34" rx="2"/><rect class="art" x="16" y="7" width="48" height="10" rx="2"/>' },
  { name: "Temple", w: 7, first: 4, later: 2, shape: [3, 4], players: 2,
    vb: [92, 74], boxTop: 26,
    art: '<polygon class="art" points="6,20 86,20 46,2"/><rect class="art" x="6" y="20" width="80" height="6" rx="1"/><rect class="art" x="8" y="62" width="76" height="8" rx="1"/>' },
  { name: "Hanging Gardens", w: 11, first: 8, later: 4, shape: [2, 4, 5], players: 3,
    vb: [112, 84], boxTop: 8,
    art: '<rect class="art" x="10" y="56" width="92" height="22" rx="2"/><rect class="art" x="22" y="34" width="68" height="22" rx="2"/><rect class="art" x="34" y="12" width="44" height="22" rx="2"/><g class="green"><ellipse cx="14" cy="56" rx="11" ry="7"/><ellipse cx="98" cy="56" rx="11" ry="7"/><ellipse cx="26" cy="34" rx="10" ry="6"/><ellipse cx="86" cy="34" rx="10" ry="6"/><ellipse cx="56" cy="12" rx="13" ry="8"/></g>' },
  { name: "Obelisk", w: 9, first: 6, later: 3, shape: [1, 1, 1, 1, 1, 1, 1, 1, 1], tall: true,
    vb: [40, 186], boxTop: 16,
    art: '<ellipse class="artdim" cx="20" cy="180" rx="16" ry="4"/><polygon class="art" points="12,178 28,178 25,16 15,16"/><polygon class="art" points="15,16 25,16 20,2"/>' },
  { name: "Great Pyramid", w: 15, first: 12, later: 6, shape: [1, 2, 3, 4, 5], players: 2,
    vb: [112, 106], boxTop: 6,
    art: '<circle cx="86" cy="22" r="14" fill="#f6d273" opacity="0.4"/><polygon class="art" points="8,100 104,100 56,6"/><polygon class="artdim" points="56,6 104,100 56,100"/>' },
  { name: "Great Wall", w: 13, first: 10, later: 5, shape: [13], note: "invasion immunity", wide: true,
    vb: [260, 48], boxTop: 16,
    art: '<rect class="art" x="6" y="6" width="22" height="38" rx="2"/><rect class="art" x="232" y="6" width="22" height="38" rx="2"/><rect class="art" x="20" y="14" width="220" height="30" rx="2"/><g class="art"><rect x="26" y="6" width="12" height="9"/><rect x="54" y="6" width="12" height="9"/><rect x="82" y="6" width="12" height="9"/><rect x="110" y="6" width="12" height="9"/><rect x="138" y="6" width="12" height="9"/><rect x="166" y="6" width="12" height="9"/><rect x="194" y="6" width="12" height="9"/><rect x="222" y="6" width="12" height="9"/></g>' },
];

// Developments: coin cost, VP, ability text.
export const DEVELOPMENTS = [
  { name: "Leadership",   cost: 10, vp: 2, ab: "Reroll 1 die (after last roll)" },
  { name: "Irrigation",   cost: 10, vp: 2, ab: "Drought has no effect" },
  { name: "Agriculture",  cost: 15, vp: 3, ab: "+1 food / food die" },
  { name: "Quarrying",    cost: 15, vp: 3, ab: "+1 stone if collecting stone" },
  { name: "Medicine",     cost: 15, vp: 3, ab: "Pestilence has no effect" },
  { name: "Coinage",      cost: 20, vp: 4, ab: "Coin die results worth 12" },
  { name: "Caravans",     cost: 20, vp: 4, ab: "No need to discard goods" },
  { name: "Religion",     cost: 20, vp: 6, ab: "Revolt affects opponents" },
  { name: "Granaries",    cost: 30, vp: 6, ab: "Sell food for 4 coins each" },
  { name: "Masonry",      cost: 30, vp: 6, ab: "+1 worker / worker die" },
  { name: "Engineering",  cost: 40, vp: 6, ab: "Use stone for 3 workers each" },
  { name: "Architecture", cost: 50, vp: 8, ab: "Bonus pts: 1 / monument" },
  { name: "Empire",       cost: 60, vp: 8, ab: "Bonus pts: 1 / city" },
];

// Disasters by skull count.
export const DISASTERS = [
  { sk: "💀",         ef: "None — no effect",                     count: 1 },
  { sk: "💀💀",       ef: "Drought — lose 2 points",              count: 2 },
  { sk: "💀💀💀",     ef: "Pestilence — opponents lose 3 points", count: 3 },
  { sk: "💀💀💀💀",   ef: "Invasion — lose 4 points",             count: 4 },
  { sk: "💀×5+",      ef: "Revolt — lose all your goods",         count: 5 },
];

export const DEV_BY_NAME = Object.fromEntries(DEVELOPMENTS.map((d) => [d.name, d]));
export const MON_BY_NAME = Object.fromEntries(MONUMENTS.map((m) => [m.name, m]));

// --- pure helpers ----------------------------------------------------------
export const tri = (n) => (n * (n + 1)) / 2;

// Whole-stack cash value of good `i` when holding `qty` of it (chart is cumulative).
export function goodValue(i, qty) {
  return qty > 0 ? GOODS[i].base * tri(qty) : 0;
}

// Coin-die value: 7 normally, 12 with Coinage.
export function coinFaceValue(owns) {
  return owns.has("Coinage") ? 12 : 7;
}

// Stack `n` copies of an emoji into rows of `perRow` (wraps inside the die).
export function stackEmoji(emoji, n, perRow) {
  const rows = [];
  for (let i = 0; i < n; i += perRow) rows.push(emoji.repeat(Math.min(perRow, n - i)));
  return rows.join("\n");
}

// The die face as displayed — reflects developments that change a die's value.
// `owns` is a Set of owned development names.
export function faceEmojis(face, owns) {
  if (face.key === "food3") { const n = 3 + (owns.has("Agriculture") ? 1 : 0); return stackEmoji("🌾", n, n > 3 ? 2 : 3); }
  if (face.key === "work3") return stackEmoji("⚒️", 3 + (owns.has("Masonry") ? 1 : 0), 2);
  if (face.key === "coin")  return "🪙\n" + coinFaceValue(owns);
  return face.emojis;
}

// Score breakdown from a plain turn snapshot (the local preview; the server holds
// the authority). developments = owned names; monuments = [{first, isFirst}] the
// player has built; cities = built city count; pointsLost = disaster points lost.
export function scoreBreakdown({ developments = [], monuments = [], cities = 3, pointsLost = 0 }) {
  const owns = new Set(developments);
  let dev = 0;
  for (const name of developments) dev += DEV_BY_NAME[name] ? DEV_BY_NAME[name].vp : 0;
  let mon = 0;
  for (const m of monuments) mon += m.vp || 0;
  let bonus = 0;
  if (owns.has("Architecture")) bonus += monuments.length; // +1 per monument
  if (owns.has("Empire")) bonus += cities;                  // +1 per city
  return { dev, mon, bonus, dis: pointsLost, total: dev + mon + bonus - pointsLost };
}
