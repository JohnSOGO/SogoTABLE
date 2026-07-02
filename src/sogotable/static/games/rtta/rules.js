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
// (top→bottom), drawn centered to mimic the silhouette. notAt = seat counts at
// which the monument SITS OUT (2025 rulebook: Temple + Great Pyramid are crossed
// off in the 2-player game, Hanging Gardens in the 3-player game; solo and 4+
// use all monuments). vb = svg viewBox [w,h]; boxTop = y where the worker-box
// cluster starts; art = silhouette drawn behind the boxes (same coordinate space).
export const MONUMENTS = [
  { name: "Step Pyramid", w: 3, first: 1, later: 0, shape: [1, 2],
    vb: [70, 58], boxTop: 8,
    art: '<ellipse class="artdim" cx="35" cy="52" rx="27" ry="4"/><polygon class="art" points="12,50 58,50 45,6 25,6"/>' },
  { name: "Stone Circle", w: 5, first: 2, later: 1, shape: [3, 2],
    vb: [80, 58], boxTop: 8,
    art: '<ellipse class="artdim" cx="40" cy="50" rx="37" ry="9"/><rect class="art" x="20" y="14" width="9" height="34" rx="2"/><rect class="art" x="51" y="14" width="9" height="34" rx="2"/><rect class="art" x="16" y="7" width="48" height="10" rx="2"/>' },
  { name: "Temple", w: 7, first: 4, later: 2, shape: [3, 4], notAt: [2],
    vb: [92, 74], boxTop: 26,
    art: '<polygon class="art" points="6,20 86,20 46,2"/><rect class="art" x="6" y="20" width="80" height="6" rx="1"/><rect class="art" x="8" y="62" width="76" height="8" rx="1"/>' },
  { name: "Hanging Gardens", w: 11, first: 8, later: 4, shape: [2, 4, 5], notAt: [3],
    vb: [112, 84], boxTop: 8,
    art: '<rect class="art" x="10" y="56" width="92" height="22" rx="2"/><rect class="art" x="22" y="34" width="68" height="22" rx="2"/><rect class="art" x="34" y="12" width="44" height="22" rx="2"/><g class="green"><ellipse cx="14" cy="56" rx="11" ry="7"/><ellipse cx="98" cy="56" rx="11" ry="7"/><ellipse cx="26" cy="34" rx="10" ry="6"/><ellipse cx="86" cy="34" rx="10" ry="6"/><ellipse cx="56" cy="12" rx="13" ry="8"/></g>' },
  { name: "Obelisk", w: 9, first: 6, later: 3, shape: [1, 1, 1, 1, 1, 1, 1, 1, 1], tall: true,
    vb: [40, 186], boxTop: 16,
    art: '<ellipse class="artdim" cx="20" cy="180" rx="16" ry="4"/><polygon class="art" points="12,178 28,178 25,16 15,16"/><polygon class="art" points="15,16 25,16 20,2"/>' },
  { name: "Great Pyramid", w: 15, first: 12, later: 8, shape: [1, 2, 3, 4, 5], notAt: [2],
    vb: [112, 106], boxTop: 6,
    art: '<circle cx="86" cy="22" r="14" fill="#f6d273" opacity="0.4"/><polygon class="art" points="8,100 104,100 56,6"/><polygon class="artdim" points="56,6 104,100 56,100"/>' },
  { name: "Great Wall", w: 13, first: 10, later: 5, shape: [13], note: "invasion immunity", wide: true,
    vb: [260, 48], boxTop: 16,
    art: '<rect class="art" x="6" y="6" width="22" height="38" rx="2"/><rect class="art" x="232" y="6" width="22" height="38" rx="2"/><rect class="art" x="20" y="14" width="220" height="30" rx="2"/><g class="art"><rect x="26" y="6" width="12" height="9"/><rect x="54" y="6" width="12" height="9"/><rect x="82" y="6" width="12" height="9"/><rect x="110" y="6" width="12" height="9"/><rect x="138" y="6" width="12" height="9"/><rect x="166" y="6" width="12" height="9"/><rect x="194" y="6" width="12" height="9"/><rect x="222" y="6" width="12" height="9"/></g>' },
];

// Developments: coin cost, VP, ability text. Values per the 2025 rulebook
// (AI/RToA/rtta_2025_rules_06.pdf, Table 3) — the adopted edition.
export const DEVELOPMENTS = [
  { name: "Leadership",   cost: 10, vp: 2,  ab: "Reroll 1 die, even a skull (after last roll)" },
  { name: "Irrigation",   cost: 10, vp: 2,  ab: "Drought has no effect" },
  { name: "Agriculture",  cost: 15, vp: 3,  ab: "+1 food / food die" },
  { name: "Quarrying",    cost: 15, vp: 3,  ab: "+1 stone if collecting stone" },
  { name: "Coinage",      cost: 20, vp: 4,  ab: "Coin die results worth 12" },
  { name: "Caravans",     cost: 20, vp: 4,  ab: "No need to discard goods" },
  { name: "Medicine",     cost: 20, vp: 4,  ab: "Pestilence has no effect" },
  { name: "Religion",     cost: 25, vp: 7,  ab: "Revolt hits opponents instead" },
  { name: "Granaries",    cost: 30, vp: 6,  ab: "Sell food for 6 coins each" },
  { name: "Masonry",      cost: 30, vp: 6,  ab: "+1 worker / worker die" },
  { name: "Engineering",  cost: 40, vp: 6,  ab: "Use stone for 3 workers each" },
  { name: "Architecture", cost: 60, vp: 8,  ab: "Bonus pts: 2 / monument" },
  { name: "Empire",       cost: 70, vp: 10, ab: "Bonus pts: 1 / city" },
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

// --- turn maths (pure — board.js animates these outcomes, never re-derives them) --

export const FACE_BY_KEY = Object.fromEntries(FACES.map((f) => [f.key, f]));

// Coins per food sold into a development purchase (Granaries, 2025 rulebook).
export const GRANARIES_RATE = 6;

// Tally a rolled dice set. dice = [{key, choice}] where key names a FACES entry
// and choice ("food" | "worker" | null) resolves the 2-food-or-2-workers face.
// Agriculture/Masonry add +1 per food/worker die (including a resolved choice die).
export function tallyFaces(dice, owns) {
  const t = { food: 0, work: 0, good: 0, coin: 0, skull: 0 };
  let foodDice = 0, workDice = 0;
  for (const d of dice) {
    const f = d && FACE_BY_KEY[d.key];
    if (!f) continue;
    if (f.choice) {
      if (d.choice === "food") { t.food += 2; foodDice++; }
      else if (d.choice === "worker") { t.work += 2; workDice++; }
    } else {
      if (f.food) { t.food += f.food; foodDice++; }
      if (f.work) { t.work += f.work; workDice++; }
      if (f.good) t.good += f.good;
      if (f.coin) t.coin += f.coin;
      if (f.skull) t.skull += f.skull;
    }
  }
  if (owns.has("Agriculture")) t.food += foodDice;
  if (owns.has("Masonry")) t.work += workDice;
  return t;
}

// The whole Upkeep outcome, decided up front: harvest (capped at the 15-box
// track), feeding (1 food per city die, shortfall = famine points), and the
// self-inflicted disasters — drought at exactly 2 skulls (Irrigation immune),
// invasion at exactly 4 (a completed Great Wall immune), revolt at 5+ (all own
// goods lost unless Religion reflects it onto the opponents, server-side).
export function upkeepPlan({ harvest, foodStored, diceCount, skulls, owns, hasGreatWall }) {
  const foodAfterHarvest = Math.min(15, foodStored + harvest);
  const feeds = Math.min(foodAfterHarvest, diceCount);
  const famine = diceCount - feeds;
  const foodAfterFeeding = Math.max(0, foodAfterHarvest - diceCount);
  let disasterPts = 0;
  if (skulls === 2) disasterPts = owns.has("Irrigation") ? 0 : 2;
  else if (skulls === 4) disasterPts = hasGreatWall ? 0 : 4;
  const revolt = skulls >= 5 && !owns.has("Religion");
  return { foodAfterHarvest, feeds, famine, foodAfterFeeding, disasterPts, revolt };
}

// Goods collection: one good per row, Wood upward, wrapping; a full row loses
// the good. Quarrying adds one bonus stone when 2+ goods are collected.
export function collectGoods(goods, earned, owns) {
  const next = goods.slice();
  for (let k = 0; k < earned; k++) {
    const i = k % GOODS.length;
    next[i] = Math.min(next[i] + 1, GOODS[i].holes);
  }
  if (owns.has("Quarrying") && earned >= 2) next[1] = Math.min(next[1] + 1, GOODS[1].holes);
  return next;
}

// End-of-turn discard down to 6 goods (Caravans exempt), cheapest rows first.
export function discardExcess(goods, owns) {
  if (owns.has("Caravans")) return goods.slice();
  const next = goods.slice();
  let total = next.reduce((a, b) => a + b, 0);
  for (let i = 0; i < next.length && total > 6; i++) {
    while (next[i] > 0 && total > 6) { next[i]--; total--; }
  }
  return next;
}

// Value of a development-payment selection: the turn's coins (all or nothing),
// whole goods stacks, and food at the Granaries rate.
export function paymentTotal({ payCoins, payGoods, payFood }, { coinCount, goods, owns }) {
  let v = payCoins ? coinCount * coinFaceValue(owns) : 0;
  for (const i of payGoods) v += goodValue(i, goods[i]);
  return v + (payFood || 0) * GRANARIES_RATE;
}

// Engineering: spend 1 stone for 3 workers (dir +1) or undo one conversion
// (dir -1). Returns the next {goods, workers}, or null if the step is illegal.
export function engineeringConvert({ goods, workers }, dir) {
  if (dir > 0) {
    if (goods[1] <= 0) return null;
    const g = goods.slice(); g[1]--;
    return { goods: g, workers: workers + 3 };
  }
  if (workers < 3) return null;
  const g = goods.slice(); g[1] = Math.min(g[1] + 1, GOODS[1].holes);
  return { goods: g, workers: workers - 3 };
}

// Package a finished local turn into the COMMIT_TURN wire payload (the server
// contract in workers/games/rtta/rules.js). monumentBoxes = {name: filled}.
export function buildCommitPayload({ cities, food, goods, monumentBoxes, devBought, skulls, pointsLostSelf }) {
  const boxes = {}; const completed = [];
  for (const m of MONUMENTS) {
    const filled = Math.max(0, Math.min(m.w, (monumentBoxes && monumentBoxes[m.name]) || 0));
    if (filled > 0) boxes[m.name] = filled;
    if (filled === m.w) completed.push(m.name);
  }
  return {
    type: "COMMIT_TURN",
    cities,
    food: Math.max(0, Math.min(15, food)),
    goods: goods.slice(),
    monumentBoxes: boxes,
    monumentsCompleted: completed,
    devBought: devBought || null,
    skulls,
    pointsLostSelf,
  };
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
  if (owns.has("Architecture")) bonus += 2 * monuments.length; // +2 per monument (2025)
  if (owns.has("Empire")) bonus += cities;                      // +1 per city
  return { dev, mon, bonus, dis: pointsLost, total: dev + mon + bonus - pointsLost };
}
