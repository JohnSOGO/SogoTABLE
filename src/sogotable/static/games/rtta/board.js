// Roll Through the Ages — local turn engine (the lifted AI/RToA prototype).
//
// This is a FAITHFUL port of the standalone board: the dice tray (roll/hold/skull
// freeze, Leadership reroll, food-or-worker choice), the Upkeep animations
// (harvest → food track → feed cities → famine/disaster skulls), the Build page
// (cities + monuments as shaped box clusters), the Dev page (whole-stack goods
// payment), and the Discard page. All of it runs on a scoped `root` element so the
// prototype's generic ids/classes never leak into the shell.
//
// The ONLY multiplayer seams differ from the standalone:
//   - the board is SEEDED from this player's server seat at the start of a round
//     (cities/food/goods/developments/monuments/points-lost carried by the server);
//   - the local round plays entirely on-device (rolls/builds/buys stay local);
//   - the Discard page shows the SHARED scoreboard (injected by render.js) and a
//     "Submit turn" button that packages ONE COMMIT_TURN and calls opts.onCommit.
// render.js owns the barrier/review UI; this module owns one player's private turn.
import {
  FACES, GOODS, MONUMENTS, DEVELOPMENTS, DISASTERS, CITY_COSTS,
  MIN_CITIES, MAX_CITIES, MAX_ROLLS, tri, faceEmojis,
} from "./rules.js";

// Build a fresh board bound to `root`. opts:
//   seat       - my server seat projection (cities, food, goods, developments,
//                monumentBoxes, points_lost) to seed this round from.
//   monuments  - game.monuments {name:[marks]} so already-claimed monuments show.
//   myMark     - my seat mark (to read the monuments map).
//   players    - seat count (drives which monuments are in play).
//   scoreboardHtml - initial shared-scoreboard HTML for the Discard page.
//   onCommit   - (payload) => void, called once when the player submits the turn.
export function createRttaBoard(root, opts) {
  const seat = opts.seat || {};
  const onCommit = opts.onCommit || (() => {});
  const myMark = opts.myMark;
  const gameMon = opts.monuments || {};

  // --- per-turn + seeded state ---------------------------------------------
  let diceCount = Math.max(MIN_CITIES, Math.min(MAX_CITIES, seat.cities || 3));
  let builtCities = diceCount;
  let round = opts.round || 1;
  let submitted = false;
  let rolls = 0;                              // rolls used this turn (0..3)
  let food = Math.max(0, Math.min(15, seat.food || 0));
  let upkeepDone = false;
  let lostPoints = Math.max(0, seat.points_lost || 0);   // cumulative disaster grid fill
  let turnLost = 0;                          // points lost THIS turn (famine + drought/invasion)
  let turnSkulls = 0;                        // final skull count THIS turn (for pestilence)
  let pendingFamine = 0;
  let workersToSpend = 0;
  let buildClickTimer = null, buildClickTile = null;
  const goodsHeld = (seat.goods && seat.goods.length === 5) ? seat.goods.slice() : [0, 0, 0, 0, 0];
  let goodsOriginal = goodsHeld.slice();
  let leadershipUsed = false;
  let payDev = null;
  const payGoods = new Set();
  let payCoins = false;
  // monuments seeded from the seat/game, re-applied whenever the tiles re-render
  const monSeed = {};                        // name -> {filled, built}
  for (const m of MONUMENTS) {
    const filled = Math.max(0, Math.min(m.w, (seat.monumentBoxes && seat.monumentBoxes[m.name]) || 0));
    const built = Array.isArray(gameMon[m.name]) && gameMon[m.name].includes(myMark);
    if (filled > 0 || built) monSeed[m.name] = { filled: built ? m.w : filled, built };
  }

  const gid = (id) => root.querySelector("#" + id);
  const qsa = (sel) => root.querySelectorAll(sel);
  const dieCells = () => [...root.querySelectorAll(".die:not(.roll):not(.empty)")];
  const isHeld = (d) => d.classList.contains("locked") || d.classList.contains("skull");
  const allHeld = () => { const ds = dieCells(); return ds.length > 0 && ds.every(isHeld); };
  const busy = () => gid("rollCell").classList.contains("busy");
  const ownedList = () => [...qsa("#devBlock .row.dev.bought, #devBlock .row.dev.locked")]
    .map((r) => r.querySelector(".nm").textContent);
  const ownsDev = (name) => ownedList().includes(name);
  const ownedSet = () => new Set(ownedList());

  // --- markup --------------------------------------------------------------
  root.className = "";
  root.classList.add("rtta-root");
  root.innerHTML = MARKUP;

  const tray = gid("tray");

  function buildTray() {
    tray.innerHTML = "";
    for (let i = 0; i < diceCount; i++) {
      const d = document.createElement("div");
      d.className = "die"; d._face = null;
      d.innerHTML = '<div class="emojis"></div>';
      d.addEventListener("click", () => onDieClick(d));
      tray.appendChild(d);
    }
    for (let i = diceCount; i < MAX_CITIES; i++) {
      const e = document.createElement("div"); e.className = "die empty"; tray.appendChild(e);
    }
    const rc = document.createElement("div");
    rc.className = "die roll"; rc.id = "rollCell";
    rc.addEventListener("click", onAction);
    tray.appendChild(rc);
  }

  function newTurn() {
    rolls = 0; upkeepDone = false; leadershipUsed = false; turnLost = 0; turnSkulls = 0;
    buildTray(); tally(); updateButton();
  }

  function setFace(dieEl, face) {
    dieEl._face = face;
    delete dieEl.dataset.choice;
    dieEl.className = "die" + (face.skullFace ? " skull" : "") + (face.big ? " bigface" : "");
    dieEl.innerHTML = '<div class="emojis">' + faceEmojis(face, ownedSet()) + "</div>";
  }

  function onDieClick(d) {
    if (busy() || submitted) return;
    const ended = rolls >= MAX_ROLLS || (rolls > 0 && allHeld());
    if (ended && d._face && d._face.choice) { cycleChoice(d); return; }
    if (rolls >= MAX_ROLLS && ownsDev("Leadership") && !leadershipUsed && d._face && !d.classList.contains("skull")) {
      leadershipReroll(d); return;
    }
    toggleLock(d);
  }
  function leadershipReroll(d) {
    leadershipUsed = true;
    const rc = gid("rollCell"); rc.classList.add("busy");
    d.className = "die rolling";
    const SYMS = ["🌾", "⚒️", "📦", "🪙", "💀", "🎲"];
    d.querySelector(".emojis").textContent = "🎲";
    const flick = setInterval(() => { d.querySelector(".emojis").textContent = SYMS[Math.floor(Math.random() * SYMS.length)]; }, 90);
    setTimeout(() => {
      clearInterval(flick); d.classList.remove("rolling");
      setFace(d, FACES[Math.floor(Math.random() * 6)]);
      rc.classList.remove("busy"); tally(); markChoices(); updateButton();
    }, 700);
  }
  function toggleLock(d) {
    if (busy() || rolls === 0 || rolls >= MAX_ROLLS) return;
    if (!d._face || d.classList.contains("skull")) return;
    d.classList.toggle("locked"); updateButton(); markChoices();
  }
  function cycleChoice(d) {
    d.dataset.choice = (d.dataset.choice === "food") ? "worker" : "food";
    d.querySelector(".emojis").textContent = d.dataset.choice === "food"
      ? "🌾".repeat(2 + (ownsDev("Agriculture") ? 1 : 0))
      : "⚒️".repeat(2 + (ownsDev("Masonry") ? 1 : 0));
    d.classList.remove("choice-pending"); tally(); markChoices();
  }
  function markChoices() {
    const ended = rolls >= MAX_ROLLS || (rolls > 0 && allHeld());
    let pending = 0;
    dieCells().forEach((d) => {
      const needsDecision = ended && d._face && d._face.choice === true && !d.dataset.choice;
      d.classList.toggle("choice-pending", needsDecision);
      if (needsDecision) pending++;
    });
    const tip = gid("tipStrip");
    if (pending > 0 && !upkeepDone) {
      tip.innerHTML = "Tap the blinking 🌾/⚒️ die — <b>Food or Workers?</b>"; tip.classList.add("alert");
    } else { tip.classList.remove("alert"); setTip("dice"); }
    const rc = gid("rollCell");
    if (rc) rc.classList.toggle("ready", ended && pending === 0 && !upkeepDone);
  }
  function updateButton() {
    const rc = gid("rollCell"); if (!rc) return;
    const bank = rolls >= MAX_ROLLS || (rolls > 0 && allHeld());
    rc.dataset.mode = bank ? "bank" : "roll";
    rc.textContent = bank ? "Upkeep" : "ROLL";
    rc.classList.toggle("bank", bank);
  }
  function onAction() {
    const rc = gid("rollCell");
    if (rc.classList.contains("busy") || submitted) return;
    if (rc.dataset.mode === "bank") { runUpkeep(); return; }
    doRoll();
  }

  function tally() {
    const t = { food: 0, work: 0, good: 0, coin: 0, skull: 0 };
    let foodDice = 0, workDice = 0;
    dieCells().forEach((d) => {
      const f = d._face; if (!f) return;
      if (f.choice) {
        if (d.dataset.choice === "food") { t.food += 2; foodDice++; }
        else if (d.dataset.choice === "worker") { t.work += 2; workDice++; }
      } else {
        if (f.food) { t.food += f.food; foodDice++; }
        if (f.work) { t.work += f.work; workDice++; }
        if (f.good) t.good += f.good;
        if (f.coin) t.coin += f.coin;
        if (f.skull) t.skull += f.skull;
      }
    });
    if (ownsDev("Agriculture")) t.food += foodDice;
    if (ownsDev("Masonry")) t.work += workDice;
    gid("tFood").textContent = t.food;
    gid("tWork").textContent = t.work;
    gid("tWorkBuild").textContent = t.work;
    gid("tGood").textContent = t.good;
    gid("tCoin").textContent = t.coin;
    gid("tSkull").textContent = t.skull;
    highlightDisaster(t.skull);
    computePower();
  }

  function computePower() {
    const coins = (parseInt(gid("tCoin").textContent, 10) || 0) * (ownsDev("Coinage") ? 12 : 7);
    let goods = 0; const chips = [];
    qsa("#goodsBlock .grow").forEach((rowEl) => {
      let max = 0;
      rowEl.querySelectorAll(".gv.filled").forEach((c) => { const v = parseInt(c.textContent, 10) || 0; if (v > max) max = v; });
      if (max > 0) { const emoji = rowEl.querySelector(".gname").textContent.trim().split(" ")[0]; chips.push('<span class="cashchip">' + emoji + " " + max + "</span>"); }
      goods += max;
    });
    if (!payDev) gid("goodsCash").innerHTML = chips.join("");
    let total = coins + goods;
    if (ownsDev("Granaries")) total += food * 4;
    const boughtRow = root.querySelector("#devBlock .row.dev.bought:not(.locked)");
    gid("pCoins").textContent = coins;
    gid("pGoods").textContent = goods;
    gid("pTotal").textContent = boughtRow ? 0 : total;
    qsa("#devBlock .row.dev").forEach((r) => {
      if (r.classList.contains("locked")) { r.classList.remove("unaffordable"); return; }
      const cost = parseInt(r.querySelector(".cost").textContent, 10) || 0;
      r.classList.toggle("unaffordable", boughtRow ? (r !== boughtRow) : (total < cost));
    });
  }

  function doRoll() {
    if (rolls >= MAX_ROLLS) return;
    const toRoll = dieCells().filter((d) => !isHeld(d));
    if (toRoll.length === 0) return;
    const rc = gid("rollCell"); rc.classList.add("busy");
    const SYMS = ["🌾", "⚒️", "📦", "🪙", "💀", "🎲"];
    toRoll.forEach((d) => { d.className = "die rolling"; d.querySelector(".emojis").textContent = "🎲"; });
    const flick = setInterval(() => { toRoll.forEach((d) => { d.querySelector(".emojis").textContent = SYMS[Math.floor(Math.random() * SYMS.length)]; }); }, 90);
    setTimeout(() => {
      clearInterval(flick);
      toRoll.forEach((d) => { const f = FACES[Math.floor(Math.random() * 6)]; d.classList.remove("rolling"); setFace(d, f); });
      rolls++;
      if (rolls >= MAX_ROLLS) lockAll();
      tally(); rc.classList.remove("busy"); updateButton(); markChoices();
    }, 700);
  }
  function lockAll() { dieCells().forEach((d) => { if (!d.classList.contains("skull")) d.classList.add("locked"); }); }

  // --- upkeep animations ----------------------------------------------------
  function fillFood(idx) { const a = root.querySelectorAll("#foodRoll .box")[idx]; if (a) a.classList.add("filled"); }
  function flyFood(src, target, idx) {
    const s = src.getBoundingClientRect(), t = target.getBoundingClientRect();
    if (!t.width) { fillFood(idx); return; }
    const fly = document.createElement("div"); fly.className = "rtta-fly"; fly.textContent = "🌾";
    fly.style.left = (s.left + s.width / 2 - 10) + "px"; fly.style.top = (s.top + s.height / 2 - 10) + "px";
    document.body.appendChild(fly);
    requestAnimationFrame(() => {
      fly.style.transform = "translate(" + (t.left - s.left + (t.width - s.width) / 2) + "px," + (t.top - s.top + (t.height - s.height) / 2) + "px) scale(.6)";
      fly.style.opacity = "0.35";
    });
    setTimeout(() => { fillFood(idx); fly.remove(); }, 560);
  }
  function animateHarvestToFood(done) {
    const harvest = parseInt(gid("tFood").textContent, 10) || 0;
    const src = gid("tFood").closest(".stat");
    const boxes = root.querySelectorAll("#foodRoll .box");
    let n = 0;
    for (let k = 0; k < harvest && (food + k) < 15; k++) {
      const target = boxes[food + k], idx = food + k; if (!target) break; n++;
      setTimeout(() => {
        flyFood(src, target, idx);
        const fc = gid("tFood"); fc.textContent = Math.max(0, (parseInt(fc.textContent, 10) || 0) - 1);
      }, k * 240);
    }
    food = Math.min(15, food + n);
    setTimeout(done, n * 240 + 650);
  }
  function animateFoodToDice(done) {
    const dice = dieCells();
    const filled = [...root.querySelectorAll("#foodRoll .box.filled")];
    const feeds = Math.min(food, dice.length);
    pendingFamine = dice.length - feeds;
    for (let k = 0; k < feeds; k++) { const srcBox = filled[food - 1 - k], die = dice[k]; setTimeout(() => flyFoodToDie(srcBox, die), k * 240); }
    food = Math.max(0, food - dice.length);
    setTimeout(done, feeds * 240 + 1000);
  }
  function flyEmoji(srcEl, targetEl, emoji, onArrive) {
    const s = srcEl.getBoundingClientRect(), t = targetEl.getBoundingClientRect();
    if (!s.width || !t.width) { onArrive(); return; }
    const fly = document.createElement("div"); fly.className = "rtta-fly arc"; fly.textContent = emoji;
    fly.style.left = (s.left + s.width / 2 - 12) + "px"; fly.style.top = (s.top + s.height / 2 - 12) + "px";
    fly.style.setProperty("--dx", (t.left - s.left + (t.width - s.width) / 2) + "px");
    fly.style.setProperty("--dy", (t.top - s.top + (t.height - s.height) / 2) + "px");
    document.body.appendChild(fly);
    setTimeout(() => { onArrive(); fly.remove(); }, 950);
  }
  function loseAPoint(srcEl) {
    const target = disOrder[lostPoints]; if (!target) return;
    lostPoints++; turnLost++;
    flyEmoji(srcEl, target, "💀", () => target.classList.add("filled"));
  }
  function loseFoodPoint() {
    const box0 = root.querySelector("#foodRoll .box");
    if (box0) { box0.classList.remove("flash-red"); void box0.offsetWidth; box0.classList.add("flash-red"); }
    loseAPoint(box0);
  }
  function resolveDisasters(done) {
    const skulls = dieCells().filter((d) => d.classList.contains("skull")).length;
    turnSkulls = skulls;
    let disasterPts = 0;
    if (skulls === 2) disasterPts = ownsDev("Irrigation") ? 0 : 2;              // drought
    else if (skulls >= 4) disasterPts = monumentBuilt("Great Wall") ? 0 : 4;    // invasion
    const famine = pendingFamine;
    const skullSrc = gid("tSkull").closest(".stat");
    if (famine > 0 || disasterPts > 0) gid("disBoxes").scrollIntoView({ block: "center" });
    let delay = 0;
    for (let i = 0; i < famine; i++) { setTimeout(loseFoodPoint, delay); delay += 260; }
    for (let i = 0; i < disasterPts; i++) {
      setTimeout(() => {
        loseAPoint(skullSrc);
        const sc = gid("tSkull"); sc.textContent = Math.max(0, (parseInt(sc.textContent, 10) || 0) - 1);
      }, delay);
      delay += 260;
    }
    pendingFamine = 0;
    setTimeout(done, (famine + disasterPts > 0) ? delay + 1100 : 250);
  }
  function flyFoodToDie(srcBox, die) {
    if (!srcBox || !die) return;
    srcBox.classList.remove("filled");
    flyEmoji(srcBox, die, "🌾", () => { die.classList.add("fed"); setTimeout(() => die.classList.remove("fed"), 450); });
  }
  function runUpkeep() {
    if (upkeepDone) return;
    upkeepDone = true;
    gid("tipStrip").classList.remove("alert"); setTip("dice");
    gid("rollCell").classList.remove("ready");
    dieCells().forEach((d) => d.classList.remove("choice-pending"));
    animateHarvestToFood(() => animateFoodToDice(() => resolveDisasters(finishUpkeep)));
  }
  function finishUpkeep() {
    const rc = gid("rollCell"); rc.classList.remove("ready"); rc.textContent = "✓";
    workersToSpend = parseInt(gid("tWork").textContent, 10) || 0;
    populateResources();
    if (ownsDev("Engineering")) workersToSpend += goodsHeld[1] * 3;   // stone → 3 workers each
    gid("tWorkBuild").textContent = workersToSpend;
    blinkTab("build");
  }

  // --- score-sheet data build ----------------------------------------------
  const box = (cls, txt) => { const b = document.createElement("div"); b.className = "box" + (cls ? " " + cls : ""); if (txt != null) b.textContent = txt; return b; };

  const cityRow = gid("cityRow");
  CITY_COSTS.forEach((cost, i) => {
    const c = document.createElement("div");
    c.className = "city" + (cost == null || i < builtCities ? " done" : "");
    c.innerHTML = buildCitySVG(cost, i) + '<div class="num">City ' + (i + 1) + "</div>";
    if (cost != null && i < builtCities) c.dataset.locked = String(cityCost(i));   // seeded-built cities can't be undone
    cityRow.appendChild(c);
  });

  const foodRoll = gid("foodRoll");
  for (let i = 1; i <= 15; i++) foodRoll.appendChild(box("em-food", ""));
  for (let i = 0; i < food; i++) fillFood(i);

  const goodsBlock = gid("goodsBlock");
  GOODS.map((g, i) => ({ g, i })).reverse().forEach(({ g, i }) => {
    const r = document.createElement("div"); r.className = "grow"; r.dataset.good = i;
    let cells = '<div class="gname">' + g.name + "</div>";
    for (let n = 1; n <= g.holes; n++) cells += '<div class="gv">' + (g.base * tri(n)) + "</div>";
    r.innerHTML = cells; goodsBlock.appendChild(r);
  });
  markGoodsChart();   // reflect seeded goods

  function populateResources() {
    const got = parseInt(gid("tGood").textContent, 10) || 0;
    for (let k = 0; k < got; k++) { const idx = k % GOODS.length; goodsHeld[idx] = Math.min(goodsHeld[idx] + 1, GOODS[idx].holes); }
    if (ownsDev("Quarrying") && got >= 2) goodsHeld[1] = Math.min(goodsHeld[1] + 1, GOODS[1].holes);
    goodsOriginal = goodsHeld.slice();
    markGoodsChart(); computePower();
  }
  function markGoodsChart() {
    qsa("#goodsBlock .grow").forEach((rowEl) => {
      const qty = goodsHeld[+rowEl.dataset.good] || 0;
      rowEl.querySelectorAll(".gv").forEach((c, ci) => c.classList.toggle("filled", ci < qty));
    });
  }

  // --- development payment ---------------------------------------------------
  const devCost = (r) => parseInt(r.querySelector(".cost").textContent, 10) || 0;
  const goodValueLocal = (i) => GOODS[i].base * tri(goodsHeld[i]);
  const coinValue = () => (parseInt(gid("tCoin").textContent, 10) || 0) * (ownsDev("Coinage") ? 12 : 7);
  function paidTotal() { let v = payCoins ? coinValue() : 0; payGoods.forEach((i) => v += goodValueLocal(i)); return v; }
  function startPay(r) { payDev = r; payGoods.clear(); payCoins = false; qsa("#devBlock .row.dev").forEach((x) => x.classList.toggle("paying", x === r)); renderPay(); }
  function cancelPay() { payDev = null; payGoods.clear(); payCoins = false; qsa("#devBlock .row.dev").forEach((x) => x.classList.remove("paying")); computePower(); }
  function renderPay() {
    if (!payDev) return;
    const cost = devCost(payDev), paid = paidTotal();
    let html = '<span class="paylbl">Pay ' + cost + " →</span>";
    if (coinValue() > 0) html += '<span class="cashchip pay' + (payCoins ? " on" : "") + '" data-coins="1">🪙 ' + coinValue() + "</span>";
    goodsHeld.forEach((q, i) => { if (q > 0) html += '<span class="cashchip pay' + (payGoods.has(i) ? " on" : "") + '" data-good="' + i + '">' + GOODS[i].name.split(" ")[0] + " " + goodValueLocal(i) + "</span>"; });
    html += '<span class="paystat' + (paid >= cost ? " ok" : "") + '">' + paid + "/" + cost + "</span>";
    if (paid >= cost) html += '<button class="cashchip paybuy" id="payConfirm">✓ Buy</button>';
    gid("goodsCash").innerHTML = html;
  }
  function confirmPay() {
    if (!payDev || paidTotal() < devCost(payDev)) return;
    const r = payDev, paid = [];
    payGoods.forEach((i) => { paid.push([i, goodsHeld[i]]); goodsHeld[i] = 0; });
    r._paid = paid; r.classList.add("bought"); r.classList.remove("paying");
    payDev = null; payGoods.clear(); payCoins = false;
    blinkTab("goods"); markGoodsChart(); computePower();
  }

  // --- scoring / discard / submit -------------------------------------------
  function monumentBuilt(name) { return [...qsa("#monArea .mon.built")].some((m) => m.dataset.name === name); }
  function discardExcessGoods() {
    if (ownsDev("Caravans")) return;
    let total = goodsHeld.reduce((a, b) => a + b, 0);
    for (let i = 0; i < goodsHeld.length && total > 6; i++) { while (goodsHeld[i] > 0 && total > 6) { goodsHeld[i]--; total--; } }
    markGoodsChart();
  }
  // Package this player's COMMIT_TURN from the current board state (see the server
  // contract in workers/games/rtta/rules.js). cities/food/goods/monumentBoxes are
  // ABSOLUTE; devBought/monumentsCompleted/skulls/pointsLostSelf are THIS turn.
  function packageCommit() {
    const monumentBoxes = {}; const monumentsCompleted = [];
    qsa("#monArea .mon").forEach((tile) => {
      const name = tile.dataset.name;
      const total = tile.querySelectorAll(".wbox").length;
      const filled = tile.querySelectorAll(".wbox.filled").length;
      if (filled > 0) monumentBoxes[name] = filled;
      if (total > 0 && filled === total) monumentsCompleted.push(name);
    });
    const boughtRow = root.querySelector("#devBlock .row.dev.bought:not(.locked)");
    const devBought = boughtRow ? boughtRow.querySelector(".nm").textContent : null;
    return {
      type: "COMMIT_TURN",
      cities: builtCities,
      food: Math.max(0, Math.min(15, food)),
      goods: goodsHeld.slice(),
      monumentBoxes, monumentsCompleted,
      devBought,
      skulls: turnSkulls,
      pointsLostSelf: turnLost,
    };
  }
  function submitTurn() {
    if (submitted) return;
    if (!upkeepDone) { showPage("dice"); return; }   // must run upkeep first
    if (payDev) cancelPay();
    discardExcessGoods();
    submitted = true;
    root.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("done"));
    const sub = gid("submitBtn"); if (sub) { sub.textContent = "✓ Turn submitted"; sub.disabled = true; sub.classList.remove("ready"); }
    gid("rttaStatus").textContent = "Waiting for the other players to finish…";
    onCommit(packageCommit());
  }

  // --- monuments / cities SVG ------------------------------------------------
  function cityCost(i) { return CITY_COSTS[i] || 0; }
  function wbox(x, y, u) {
    return '<g class="wbox"><rect x="' + x + '" y="' + y + '" width="' + u + '" height="' + u + '" rx="2"/>' +
      '<text x="' + (x + u / 2) + '" y="' + (y + u / 2) + '" font-size="' + (u * 0.78).toFixed(1) + '">⚒️</text></g>';
  }
  function clusterRects(shape, cx, topY, u, g) {
    const pitch = u + g; let out = "";
    shape.forEach((n, r) => { const rowW = n * u + (n - 1) * g, x0 = cx - rowW / 2, y = topY + r * pitch; for (let i = 0; i < n; i++) out += wbox(x0 + i * pitch, y, u); });
    return out;
  }
  function buildMonSVG(m) {
    const u = 16, g = 3, scale = 0.85, cx = m.vb[0] / 2;
    return '<svg class="monsvg" viewBox="0 0 ' + m.vb[0] + " " + m.vb[1] + '" width="' + Math.round(m.vb[0] * scale) + '" height="' + Math.round(m.vb[1] * scale) + '">' +
      m.art + clusterRects(m.shape, cx, m.boxTop, u, g) + "</svg>";
  }
  function cityShape(n) { const rows = []; if (n % 2 === 1) rows.push(1); for (let i = 0; i < Math.floor(n / 2); i++) rows.push(2); return rows; }
  function buildCitySVG(cost, i) {
    const W = 48, H = 72, scale = 0.6 + i * 0.07, cx = 24;
    const dieFs = (15 / scale).toFixed(1);
    let art = '<polygon class="art" points="4,22 44,22 24,6"/><rect class="art" x="6" y="22" width="36" height="46" rx="2"/>' +
      '<text class="citydie" x="24" y="6" font-size="' + dieFs + '" text-anchor="middle" dominant-baseline="central">🎲</text>';
    let boxes = "";
    if (cost != null) { const u = 11, g = 2, pitch = u + g, bottomY = 64, shape = cityShape(cost); boxes = clusterRects(shape, cx, bottomY - (shape.length * pitch - g), u, g); }
    return '<svg class="citysvg" viewBox="0 0 ' + W + " " + H + '" width="' + Math.round(W * scale) + '" height="' + Math.round(H * scale) + '">' + art + boxes + "</svg>";
  }
  function monTile(m) {
    const el = document.createElement("div");
    el.className = "mon" + (m.wide ? " wide" : "") + (m.tall ? " tall" : "");
    el.dataset.name = m.name;
    el.innerHTML = buildMonSVG(m) + '<div class="mon-foot"><span class="mscore">' + m.first + '</span><span class="mname">' + m.name + "</span></div>";
    return el;
  }
  const wboxOrder = (a, b) => {
    const ra = a.querySelector("rect"), rb = b.querySelector("rect");
    const dy = (+rb.getAttribute("y")) - (+ra.getAttribute("y"));
    return dy !== 0 ? dy : (+ra.getAttribute("x")) - (+rb.getAttribute("x"));
  };
  function buildAdd(tile) {
    if (submitted) return;
    const boxes = [...tile.querySelectorAll(".wbox")];
    const filledCount = tile.querySelectorAll(".wbox.filled").length;
    if (boxes.length && filledCount === boxes.length && !tile.classList.contains("built") && !tile.classList.contains("done")) {
      tile.classList.add(tile.classList.contains("mon") ? "built" : "done"); return;
    }
    if (boxes.length && filledCount < boxes.length && workersToSpend > 0) {
      boxes.sort(wboxOrder); boxes[filledCount].classList.add("filled");
      workersToSpend--; gid("tWorkBuild").textContent = workersToSpend;
      if (workersToSpend === 0) blinkTab("dev");
      if (filledCount + 1 === boxes.length) onBuildingComplete(tile);
    }
  }
  function buildUndo(tile) {
    if (submitted) return;
    const locked = +tile.dataset.locked || 0;
    const filled = [...tile.querySelectorAll(".wbox.filled")];
    if (filled.length <= locked) return;
    [...tile.querySelectorAll(".wbox")].sort(wboxOrder)[filled.length - 1].classList.remove("filled");
    workersToSpend++; gid("tWorkBuild").textContent = workersToSpend;
    if (tile._builtTimer) { clearTimeout(tile._builtTimer); tile._builtTimer = null; }
    tile.classList.remove("built");
    if (tile.classList.contains("city") && tile.classList.contains("done")) {
      tile.classList.remove("done"); builtCities = Math.max(MIN_CITIES, builtCities - 1); diceCount = builtCities;
    }
  }
  function onBuildingComplete(tile) {
    if (tile.classList.contains("city")) {
      tile.classList.add("done"); builtCities = Math.min(MAX_CITIES, builtCities + 1); diceCount = builtCities;
    } else { tile._builtTimer = setTimeout(() => tile.classList.add("built"), 2000); }
  }
  function splitRows(n) { if (n <= 3) return [n]; const top = Math.floor(n / 2); return [top, n - top]; }
  function applyMonSeed() {
    qsa("#monArea .mon").forEach((tile) => {
      const seed = monSeed[tile.dataset.name]; if (!seed) return;
      const boxes = [...tile.querySelectorAll(".wbox")].sort(wboxOrder);
      for (let i = 0; i < Math.min(seed.filled, boxes.length); i++) boxes[i].classList.add("filled");
      tile.dataset.locked = String(Math.min(seed.filled, boxes.length));
      if (seed.built) tile.classList.add("built");
    });
  }
  function renderMonuments(players) {
    const area = gid("monArea"); area.innerHTML = "";
    const vis = MONUMENTS.filter((m) => (m.players || 1) <= players);
    const normal = vis.filter((m) => !m.wide && !m.tall);
    const wall = vis.find((m) => m.wide);
    const obel = vis.find((m) => m.tall);
    let idx = 0;
    splitRows(normal.length).forEach((cnt, ri, arr) => {
      for (let k = 0; k < cnt; k++) area.appendChild(monTile(normal[idx++]));
      if (ri < arr.length - 1) { const br = document.createElement("div"); br.className = "mbreak"; area.appendChild(br); }
    });
    if (wall) area.appendChild(monTile(wall));
    if (obel) area.appendChild(monTile(obel));
    applyMonSeed();
  }
  function applyPlayers(n) { renderMonuments(n); qsa("#pcount button").forEach((b) => b.classList.toggle("active", +b.dataset.p === n)); }
  gid("pcount").addEventListener("click", (e) => { const b = e.target.closest("button[data-p]"); if (b) applyPlayers(+b.dataset.p); });
  applyPlayers(Math.max(1, Math.min(3, opts.players || 3)));

  // Developments list — mark seeded (owned) devs as locked
  const devBlock = gid("devBlock");
  const ownedSeed = new Set(seat.developments || []);
  DEVELOPMENTS.forEach((d) => {
    const r = document.createElement("div");
    r.className = "row dev" + (ownedSeed.has(d.name) ? " locked" : "");
    r.innerHTML = '<div class="cost">' + d.cost + '</div><div class="nm">' + d.name + '</div><div class="ab">' + d.ab + '</div><div class="vp"><b>' + d.vp + "</b> pts</div>";
    devBlock.appendChild(r);
  });

  // Disasters list + points-lost grid
  const disList = gid("disList");
  DISASTERS.forEach((d) => { disList.insertAdjacentHTML("beforeend", '<div class="drow" data-skulls="' + d.count + '"><span class="sk">' + d.sk + '</span><span class="ef">' + d.ef + "</span></div>"); });
  function highlightDisaster(skulls) { const n = skulls >= 5 ? 5 : skulls; qsa("#disList .drow").forEach((r) => r.classList.toggle("hit", +r.dataset.skulls === n)); }

  const disBoxes = gid("disBoxes");
  for (let r = 0; r < 3; r++) {
    const rowEl = document.createElement("div"); rowEl.className = "disrow";
    for (let gp = 0; gp < 3; gp++) { const grp = document.createElement("div"); grp.className = "disgroup"; for (let k = 0; k < 5; k++) grp.appendChild(box("em-skull", "")); rowEl.appendChild(grp); }
    disBoxes.appendChild(rowEl);
  }
  const disOrder = [];
  const disRows = [...disBoxes.querySelectorAll(".disrow")];
  for (let gp = 0; gp < 3; gp++) for (let r = 0; r < 3; r++) disRows[r].querySelectorAll(".disgroup")[gp].querySelectorAll(".box").forEach((b) => disOrder.push(b));
  for (let i = 0; i < Math.min(lostPoints, disOrder.length); i++) disOrder[i].classList.add("filled");   // seed cumulative losses

  // delegated tap handler across pages
  gid("window").addEventListener("click", (e) => {
    if (submitted) return;
    const tile = e.target.closest("#monArea .mon, #cityRow .city");
    if (tile) {
      if (buildClickTimer && buildClickTile === tile) { clearTimeout(buildClickTimer); buildClickTimer = null; buildUndo(tile); }
      else { if (buildClickTimer) { clearTimeout(buildClickTimer); buildAdd(buildClickTile); } buildClickTile = tile; buildClickTimer = setTimeout(() => { buildClickTimer = null; buildAdd(tile); }, 250); }
      return;
    }
    const gv = e.target.closest("#goodsBlock .gv");
    if (gv) {
      const rowEl = gv.closest(".grow"), i = +rowEl.dataset.good;
      const q = [...rowEl.querySelectorAll(".gv")].indexOf(gv) + 1;
      if (q <= goodsOriginal[i]) { goodsHeld[i] = (goodsHeld[i] === q) ? q - 1 : q; markGoodsChart(); computePower(); }
      return;
    }
    const paychip = e.target.closest("#goodsCash .cashchip.pay");
    if (paychip && payDev) {
      if (paychip.dataset.coins) payCoins = !payCoins;
      else { const gi = +paychip.dataset.good; payGoods.has(gi) ? payGoods.delete(gi) : payGoods.add(gi); }
      renderPay(); return;
    }
    if (e.target.closest("#payConfirm")) { confirmPay(); return; }
    if (e.target.closest("#submitBtn")) { submitTurn(); return; }
    const dev = e.target.closest(".row.dev .cost");
    if (dev) {
      const rowEl = dev.closest(".row.dev");
      if (rowEl.classList.contains("locked")) return;
      if (rowEl.classList.contains("bought")) {
        rowEl.classList.remove("bought");
        if (rowEl._paid) { rowEl._paid.forEach(([i, q]) => goodsHeld[i] = q); rowEl._paid = null; }
        markGoodsChart(); computePower();
      } else if (root.querySelector("#devBlock .row.dev.bought:not(.locked)")) { /* one dev per turn */ }
      else if (payDev === rowEl) { cancelPay(); }
      else if (!payDev) { startPay(rowEl); }
    }
  });

  computePower();

  // tips + tab switching
  const TIPS = {
    dice: "Tap <b>ROLL</b> (3×); click dice to <b>hold</b>. A 🌾/⚒️ die blinks — tap it for <b>Food or Workers</b>. Then <b>Upkeep</b>: food stores, cities feed (1 each).",
    build: "Spend this turn's <b>workers</b> to fill city &amp; monument boxes. <b>First</b> to finish a monument scores the bigger number.",
    dev: "Buy <b>one development per turn</b> with coins + whole goods stacks. Each is bought once; its effect is permanent.",
    goods: "Goods cash in <b>by type, whole-stack — no change</b>. Keep only <b>6 total</b>. Then tap <b>Submit turn</b>.",
  };
  const setTip = (page) => { const t = gid("tipStrip"); if (t) t.innerHTML = TIPS[page] || ""; };
  function blinkTab(page) { const b = root.querySelector('.tabs button[data-page="' + page + '"]'); if (b) b.classList.add("done"); }
  function showPage(page) {
    root.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
    root.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === "page-" + page));
    const cur = root.querySelector('.tabs button[data-page="' + page + '"]'); if (cur) cur.classList.remove("done");
    setTip(page);
    if (page === "build" && workersToSpend === 0) blinkTab("dev");
    if (page === "dev") { const power = parseInt(gid("pTotal").textContent, 10) || 0; if (power < 10 || root.querySelector("#devBlock .row.dev.bought:not(.locked)")) blinkTab("goods"); }
    if (page === "goods" && upkeepDone) { const sub = gid("submitBtn"); if (sub && !submitted) sub.classList.add("ready"); }
  }
  gid("tabs").addEventListener("click", (e) => { const btn = e.target.closest("button[data-page]"); if (btn) showPage(btn.dataset.page); });
  setTip("dice");

  // seed the shared scoreboard + round label + start the turn
  const roundLabel = gid("roundNum"); if (roundLabel) roundLabel.textContent = String(round);
  setScoreboard(opts.scoreboardHtml || "");
  newTurn();

  function setScoreboard(html) { const el = gid("sharedScore"); if (el) el.innerHTML = html; }

  return { root, setScoreboard, isSubmitted: () => submitted };
}

// Static page shell (ids kept from the prototype, queried within `root`).
const MARKUP = `
  <div class="app-header">
    <nav class="tabs" id="tabs">
      <button class="active" data-page="dice">1 Roll</button>
      <button data-page="build">2 Build</button>
      <button data-page="dev">3 Dev</button>
      <button data-page="goods">4 Discard</button>
    </nav>
    <div class="tipstrip" id="tipStrip"></div>
  </div>
  <main class="window" id="window">
    <section class="page active" id="page-dice">
      <div class="tray" id="tray"></div>
      <div class="tally oneline"><div class="tally-grid">
        <div class="stat"><span class="icon">🌾</span><span class="meta"><b class="val" id="tFood">0</b><span class="nm">Food</span></span></div>
        <div class="stat"><span class="icon">⚒️</span><span class="meta"><b class="val" id="tWork">0</b><span class="nm">Work</span></span></div>
        <div class="stat"><span class="icon">📦</span><span class="meta"><b class="val" id="tGood">0</b><span class="nm">Goods</span></span></div>
        <div class="stat"><span class="icon">🪙</span><span class="meta"><b class="val" id="tCoin">0</b><span class="nm">Coins</span></span></div>
        <div class="stat danger"><span class="icon">💀</span><span class="meta"><b class="val" id="tSkull">0</b><span class="nm">Skull</span></span></div>
      </div></div>
      <div class="block foodctl"><h3>Food <small>max 15 · feeds 1 per die</small></h3><div class="boxrow" id="foodRoll"></div></div>
      <div class="block"><h3>Points lost <small>1 box per point lost</small></h3><div id="disBoxes"></div></div>
      <div class="block"><h3>Disaster results <small>from skulls</small></h3><div class="dis" id="disList"></div></div>
    </section>
    <section class="page" id="page-build">
      <div class="block workers-panel"><h3>Workers to spend <small>from this roll</small></h3><div class="big-stat">⚒️ <span id="tWorkBuild">0</span></div></div>
      <div class="block"><h3>Cities <small>start with 3 · build with workers</small></h3><div id="cityRow"></div></div>
      <div class="block" id="monBlock"><h3>Monuments</h3>
        <div class="pcount" id="pcount"><span class="pclbl">Players</span><button data-p="1">1</button><button data-p="2">2</button><button class="active" data-p="3">3+</button></div>
        <div id="monArea"></div>
      </div>
    </section>
    <section class="page" id="page-dev">
      <div class="power" id="powerStrip">
        <div class="pcell"><span class="picon">🪙</span><span class="pmeta"><b class="pval" id="pCoins">0</b><span class="plabel">Coins</span></span></div>
        <div class="pcell"><span class="picon">📦</span><span class="pmeta"><b class="pval" id="pGoods">0</b><span class="plabel">Goods</span></span></div>
        <div class="pcell total"><span class="picon">💰</span><span class="pmeta"><b class="pval" id="pTotal">0</b><span class="plabel">Power</span></span></div>
      </div>
      <div class="goods-cash" id="goodsCash"></div>
      <div class="block" id="devBlock"><h3>Developments <small>tap cost to buy · dim = can't afford</small></h3></div>
    </section>
    <section class="page" id="page-goods">
      <div class="block goods" id="goodsBlock"><h3>Goods <small>coin value by quantity · keep 6 total</small></h3></div>
      <div class="block"><h3>Standings <small>round <span id="roundNum">1</span></small></h3><div id="sharedScore"></div></div>
      <p class="rtta-status" id="rttaStatus">Finish your turn, then submit.</p>
      <button class="rtta-submit" id="submitBtn" type="button">✓ Submit turn</button>
    </section>
  </main>
`;
