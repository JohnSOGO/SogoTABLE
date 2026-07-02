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
  MIN_CITIES, MAX_CITIES, MAX_ROLLS, GRANARIES_RATE, tri, faceEmojis,
  tallyFaces, upkeepPlan, collectGoods, discardExcess, paymentTotal,
  engineeringConvert, buildCommitPayload, goodValue, coinFaceValue,
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

  // --- per-turn + seeded state (plain JS — the DOM only displays it) ---------
  let diceCount = Math.max(MIN_CITIES, Math.min(MAX_CITIES, seat.cities || 3));
  let builtCities = diceCount;
  let round = opts.round || 1;
  let submitted = false;
  let rolls = 0;                              // rolls used this turn (0..3)
  let dice = [];                              // [{face, locked, choice}] — tray source of truth
  let dieEls = [];                            // tray elements, same order as `dice`
  let turnTally = { food: 0, work: 0, good: 0, coin: 0, skull: 0 };
  let food = Math.max(0, Math.min(15, seat.food || 0));
  let upkeepDone = false;
  let plan = null;                            // upkeepPlan result once Upkeep runs
  let lostPoints = Math.max(0, seat.points_lost || 0);   // cumulative disaster grid fill
  let turnLost = 0;                          // points lost THIS turn (famine + drought/invasion)
  let turnSkulls = 0;                        // final skull count THIS turn (for pestilence)
  let workersToSpend = 0;
  let buildClickTimer = null, buildClickTile = null;
  let goodsHeld = (seat.goods && seat.goods.length === 5) ? seat.goods.slice() : [0, 0, 0, 0, 0];
  let goodsOriginal = goodsHeld.slice();
  const owned = new Set(seat.developments || []);   // owned at turn start
  let boughtDev = null;                       // development bought THIS turn
  const monBoxes = {};                        // monument name -> my filled worker boxes
  let leadershipUsed = false;
  let engUsed = 0;                           // stones converted to workers this turn (Engineering)
  let payDev = null;
  let payCounts = [0, 0, 0, 0, 0];           // goods sold per type (off the top of each stack)
  let payCoins = false;
  let payFood = 0;                           // food sold into the current dev purchase (Granaries)
  // monuments seeded from the seat/game, re-applied whenever the tiles re-render
  const monSeed = {};                        // name -> {filled, built}
  for (const m of MONUMENTS) {
    const filled = Math.max(0, Math.min(m.w, (seat.monumentBoxes && seat.monumentBoxes[m.name]) || 0));
    const built = Array.isArray(gameMon[m.name]) && gameMon[m.name].includes(myMark);
    if (filled > 0 || built) monSeed[m.name] = { filled: built ? m.w : filled, built };
  }

  const gid = (id) => root.querySelector("#" + id);
  const qsa = (sel) => root.querySelectorAll(sel);
  const isHeld = (d) => d.locked || (d.face && d.face.skullFace);
  const allHeld = () => dice.length > 0 && dice.every((d) => d.face && isHeld(d));
  const busy = () => gid("rollCell").classList.contains("busy");
  const ownsDev = (name) => owned.has(name) || boughtDev === name;
  const ownsAll = () => (boughtDev ? new Set([...owned, boughtDev]) : owned);

  // --- markup --------------------------------------------------------------
  root.className = "";
  root.classList.add("rtta-root");
  root.innerHTML = MARKUP;

  const tray = gid("tray");

  function buildTray() {
    tray.innerHTML = "";
    dice = []; dieEls = [];
    for (let i = 0; i < diceCount; i++) {
      dice.push({ face: null, locked: false, choice: null });
      const d = document.createElement("div");
      d.className = "die";
      d.innerHTML = '<div class="emojis"></div>';
      d.addEventListener("click", () => onDieClick(i));
      tray.appendChild(d); dieEls.push(d);
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
    rolls = 0; upkeepDone = false; plan = null; leadershipUsed = false; turnLost = 0; turnSkulls = 0;
    buildTray(); tally(); updateButton();
  }

  function paintDie(i) {
    const d = dice[i], el = dieEls[i];
    if (!d.face) { el.className = "die"; el.innerHTML = '<div class="emojis"></div>'; return; }
    el.className = "die" + (d.face.skullFace ? " skull" : "") + (d.face.big ? " bigface" : "")
      + (d.locked ? " locked" : "");
    const emojis = d.face.choice && d.choice
      ? (d.choice === "food"
        ? "🌾".repeat(2 + (ownsDev("Agriculture") ? 1 : 0))
        : "⚒️".repeat(2 + (ownsDev("Masonry") ? 1 : 0)))
      : faceEmojis(d.face, ownsAll());
    el.innerHTML = '<div class="emojis">' + emojis + "</div>";
  }
  function setFace(i, face) { dice[i].face = face; dice[i].choice = null; dice[i].locked = false; paintDie(i); }

  function onDieClick(i) {
    if (busy() || submitted) return;
    const d = dice[i];
    const ended = rolls >= MAX_ROLLS || (rolls > 0 && allHeld());
    if (ended && d.face && d.face.choice) { cycleChoice(i); return; }
    if (rolls >= MAX_ROLLS && ownsDev("Leadership") && !leadershipUsed && d.face) {
      leadershipReroll(i); return;   // 2025 rulebook: a skull die MAY be rerolled
    }
    toggleLock(i);
  }
  function leadershipReroll(i) {
    leadershipUsed = true;
    const rc = gid("rollCell"); rc.classList.add("busy");
    const el = dieEls[i];
    el.className = "die rolling";
    const SYMS = ["🌾", "⚒️", "📦", "🪙", "💀", "🎲"];
    el.querySelector(".emojis").textContent = "🎲";
    const flick = setInterval(() => { el.querySelector(".emojis").textContent = SYMS[Math.floor(Math.random() * SYMS.length)]; }, 90);
    setTimeout(() => {
      clearInterval(flick);
      setFace(i, FACES[Math.floor(Math.random() * 6)]);
      if (rolls >= MAX_ROLLS && !dice[i].face.skullFace) { dice[i].locked = true; paintDie(i); }
      rc.classList.remove("busy"); tally(); markChoices(); updateButton();
    }, 700);
  }
  function toggleLock(i) {
    if (busy() || rolls === 0 || rolls >= MAX_ROLLS) return;
    const d = dice[i];
    if (!d.face || d.face.skullFace) return;
    d.locked = !d.locked; paintDie(i); updateButton(); markChoices();
  }
  function cycleChoice(i) {
    const d = dice[i];
    d.choice = (d.choice === "food") ? "worker" : "food";
    paintDie(i);
    dieEls[i].classList.remove("choice-pending");
    tally(); markChoices();
  }
  function markChoices() {
    const ended = rolls >= MAX_ROLLS || (rolls > 0 && allHeld());
    let pending = 0;
    dice.forEach((d, i) => {
      const needsDecision = ended && d.face && d.face.choice === true && !d.choice;
      dieEls[i].classList.toggle("choice-pending", needsDecision);
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
    turnTally = tallyFaces(dice.map((d) => (d.face ? { key: d.face.key, choice: d.choice } : null)), ownsAll());
    gid("tFood").textContent = turnTally.food;
    gid("tWork").textContent = turnTally.work;
    gid("tWorkBuild").textContent = turnTally.work;
    gid("tGood").textContent = turnTally.good;
    gid("tCoin").textContent = turnTally.coin;
    gid("tSkull").textContent = turnTally.skull;
    highlightDisaster(turnTally.skull);
    computePower();
  }

  function computePower() {
    const coins = turnTally.coin * coinFaceValue(ownsAll());
    let goods = 0; const chips = [];
    goodsHeld.forEach((qty, i) => {
      const v = goodValue(i, qty);
      if (v > 0) chips.push('<span class="cashchip">' + GOODS[i].name.split(" ")[0] + " " + v + "</span>");
      goods += v;
    });
    if (!payDev) gid("goodsCash").innerHTML = chips.join("");
    let total = coins + goods;
    if (ownsDev("Granaries")) total += food * GRANARIES_RATE;
    gid("pCoins").textContent = coins;
    gid("pGoods").textContent = goods;
    gid("pTotal").textContent = boughtDev ? 0 : total;
    qsa("#devBlock .row.dev").forEach((r) => {
      if (r.classList.contains("locked")) { r.classList.remove("unaffordable"); return; }
      const cost = parseInt(r.querySelector(".cost").textContent, 10) || 0;
      r.classList.toggle("unaffordable", boughtDev ? !r.classList.contains("bought") : (total < cost));
    });
  }

  function doRoll() {
    if (rolls >= MAX_ROLLS) return;
    const toRoll = dice.map((d, i) => (d.face && isHeld(d) ? -1 : i)).filter((i) => i >= 0);
    if (toRoll.length === 0) return;
    const rc = gid("rollCell"); rc.classList.add("busy");
    const SYMS = ["🌾", "⚒️", "📦", "🪙", "💀", "🎲"];
    toRoll.forEach((i) => { dieEls[i].className = "die rolling"; dieEls[i].querySelector(".emojis").textContent = "🎲"; });
    const flick = setInterval(() => { toRoll.forEach((i) => { dieEls[i].querySelector(".emojis").textContent = SYMS[Math.floor(Math.random() * SYMS.length)]; }); }, 90);
    setTimeout(() => {
      clearInterval(flick);
      toRoll.forEach((i) => setFace(i, FACES[Math.floor(Math.random() * 6)]));
      rolls++;
      if (rolls >= MAX_ROLLS) lockAll();
      tally(); rc.classList.remove("busy"); updateButton(); markChoices();
    }, 700);
  }
  function lockAll() { dice.forEach((d, i) => { if (d.face && !d.face.skullFace) { d.locked = true; paintDie(i); } }); }

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
    const src = gid("tFood").closest(".stat");
    const boxes = root.querySelectorAll("#foodRoll .box");
    const n = plan.foodAfterHarvest - food;   // harvest actually banked (track caps at 15)
    for (let k = 0; k < n; k++) {
      const target = boxes[food + k], idx = food + k; if (!target) break;
      setTimeout(() => {
        flyFood(src, target, idx);
        const fc = gid("tFood"); fc.textContent = Math.max(0, (parseInt(fc.textContent, 10) || 0) - 1);
      }, k * 240);
    }
    food = plan.foodAfterHarvest;
    setTimeout(done, n * 240 + 650);
  }
  function animateFoodToDice(done) {
    const filled = [...root.querySelectorAll("#foodRoll .box.filled")];
    const feeds = plan.feeds;
    for (let k = 0; k < feeds; k++) { const srcBox = filled[food - 1 - k], die = dieEls[k]; setTimeout(() => flyFoodToDie(srcBox, die), k * 240); }
    food = plan.foodAfterFeeding;
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
    const { famine, disasterPts } = plan;
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
    turnSkulls = turnTally.skull;
    plan = upkeepPlan({
      harvest: turnTally.food, foodStored: food, diceCount: dice.length,
      skulls: turnSkulls, owns: ownsAll(),
      hasGreatWall: !!(monSeed["Great Wall"] && monSeed["Great Wall"].built),
    });
    gid("tipStrip").classList.remove("alert"); setTip("dice");
    gid("rollCell").classList.remove("ready");
    dieEls.forEach((el) => el.classList.remove("choice-pending"));
    animateHarvestToFood(() => animateFoodToDice(() => resolveDisasters(finishUpkeep)));
  }
  function finishUpkeep() {
    const rc = gid("rollCell"); rc.classList.remove("ready"); rc.textContent = "✓";
    workersToSpend = turnTally.work;
    goodsHeld = collectGoods(goodsHeld, turnTally.good, ownsAll());
    goodsOriginal = goodsHeld.slice();
    if (plan.revolt) {   // revolt: all goods lost (Religion turns it on opponents instead)
      goodsHeld = [0, 0, 0, 0, 0]; goodsOriginal = [0, 0, 0, 0, 0];
      const tip = gid("tipStrip");
      tip.innerHTML = "🔥 <b>Revolt!</b> Your people revolt — all your goods are lost."; tip.classList.add("alert");
    }
    markGoodsChart(); computePower();
    gid("tWorkBuild").textContent = workersToSpend;
    renderEng();
    blinkTab("build");
  }

  // Engineering (owned at turn start — Build precedes Buy): tap to SPEND a stone
  // for 3 workers. Opt-in and undoable while the 3 workers are still unspent.
  function renderEng() {
    const el = gid("engRow"); if (!el) return;
    const usable = upkeepDone && !submitted && owned.has("Engineering");
    if (!usable || (goodsHeld[1] <= 0 && engUsed === 0)) { el.innerHTML = ""; return; }
    let html = "";
    if (goodsHeld[1] > 0) html += '<button class="cashchip pay" id="engUse" type="button">🪨 → ⚒️⚒️⚒️ spend a stone (' + goodsHeld[1] + " held)</button>";
    if (engUsed > 0 && workersToSpend >= 3) html += '<button class="cashchip pay" id="engUndo" type="button">↩ undo</button>';
    el.innerHTML = html;
  }
  function engConvert(dir) {
    if (dir < 0 && engUsed <= 0) return;   // never mint stone from ordinary workers
    const next = engineeringConvert({ goods: goodsHeld, workers: workersToSpend }, dir);
    if (!next) return;
    goodsHeld = next.goods; workersToSpend = next.workers;
    if (dir > 0) { engUsed++; goodsOriginal[1] = Math.max(0, goodsOriginal[1] - 1); }
    else { engUsed--; goodsOriginal[1]++; }
    gid("tWorkBuild").textContent = workersToSpend;
    markGoodsChart(); computePower(); renderEng();
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

  function markGoodsChart() {
    qsa("#goodsBlock .grow").forEach((rowEl) => {
      const qty = goodsHeld[+rowEl.dataset.good] || 0;
      rowEl.querySelectorAll(".gv").forEach((c, ci) => c.classList.toggle("filled", ci < qty));
    });
  }

  // --- development payment ---------------------------------------------------
  // House rule (deviation, PLAN.md): goods are sold INDIVIDUALLY off the top of
  // each stack — one chip per held good, chart order, tap to add/remove — not
  // as the rulebook's whole-stack spend. Values stay chart-coherent because a
  // partial sale always takes the topmost (most valuable) marginals.
  const devCost = (r) => parseInt(r.querySelector(".cost").textContent, 10) || 0;
  const coinValue = () => turnTally.coin * coinFaceValue(ownsAll());
  const paidTotal = () => paymentTotal({ payCoins, payGoodsCounts: payCounts, payFood }, { coinCount: turnTally.coin, goods: goodsHeld, owns: ownsAll() });
  function startPay(r) { payDev = r; payCounts = [0, 0, 0, 0, 0]; payCoins = false; payFood = 0; qsa("#devBlock .row.dev").forEach((x) => x.classList.toggle("paying", x === r)); renderPay(); }
  function cancelPay() { payDev = null; payCounts = [0, 0, 0, 0, 0]; payCoins = false; payFood = 0; qsa("#devBlock .row.dev").forEach((x) => x.classList.remove("paying")); computePower(); }
  function renderPay() {
    if (!payDev) return;
    const cost = devCost(payDev), paid = paidTotal();
    let html = '<span class="paylbl">Pay ' + cost + " →</span>";
    if (coinValue() > 0) html += '<span class="cashchip pay' + (payCoins ? " on" : "") + '" data-coins="1">🪙 ' + coinValue() + "</span>";
    goodsHeld.forEach((q, i) => {
      const emoji = GOODS[i].name.split(" ")[0];
      for (let u = 1; u <= q; u++) {   // one chip per good, bottom→top; the top k are lit
        const lit = u > q - payCounts[i];
        html += '<span class="cashchip pay gunit' + (lit ? " on" : "") + '" data-good="' + i + '">' + emoji + " " + (GOODS[i].base * u) + "</span>";
      }
    });
    if (ownsDev("Granaries") && (food > 0 || payFood > 0)) {
      html += '<span class="cashchip pay' + (payFood > 0 ? " on" : "") + '" data-food="1">🌾×' + payFood + " = " + (payFood * GRANARIES_RATE) + "</span>";
    }
    html += '<span class="paystat' + (paid >= cost ? " ok" : "") + '">' + paid + "/" + cost + "</span>";
    if (paid >= cost) html += '<button class="cashchip paybuy" id="payConfirm">✓ Buy</button>';
    gid("goodsCash").innerHTML = html;
  }
  function confirmPay() {
    if (!payDev || paidTotal() < devCost(payDev)) return;
    const r = payDev, paid = [];
    payCounts.forEach((k, i) => {
      if (k > 0) { paid.push([i, goodsHeld[i]]); goodsHeld[i] = Math.max(0, goodsHeld[i] - k); }
    });
    r._paid = paid;
    if (payFood > 0) { r._paidFood = payFood; food = Math.max(0, food - payFood); syncFoodTrack(); }
    r.classList.add("bought"); r.classList.remove("paying");
    boughtDev = r.querySelector(".nm").textContent;
    payDev = null; payCounts = [0, 0, 0, 0, 0]; payCoins = false; payFood = 0;
    blinkTab("goods"); markGoodsChart(); computePower();
  }
  function syncFoodTrack() { root.querySelectorAll("#foodRoll .box").forEach((b, i) => b.classList.toggle("filled", i < food)); }

  // --- scoring / discard / submit -------------------------------------------
  function submitTurn() {
    if (submitted) return;
    if (!upkeepDone) { showPage("dice"); return; }   // must run upkeep first
    if (payDev) cancelPay();
    goodsHeld = discardExcess(goodsHeld, ownsAll());
    markGoodsChart();
    submitted = true;
    root.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("done"));
    const sub = gid("submitBtn"); if (sub) { sub.textContent = "✓ Turn submitted"; sub.disabled = true; sub.classList.remove("ready"); }
    gid("rttaStatus").textContent = "Waiting for the other players to finish…";
    onCommit(buildCommitPayload({
      cities: builtCities, food, goods: goodsHeld, monumentBoxes: monBoxes,
      devBought: boughtDev, skulls: turnSkulls, pointsLostSelf: turnLost,
    }));
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
      if (tile.classList.contains("mon")) monBoxes[tile.dataset.name] = filledCount + 1;
      workersToSpend--; gid("tWorkBuild").textContent = workersToSpend;
      if (workersToSpend === 0) blinkTab("dev");
      renderEng();
      if (filledCount + 1 === boxes.length) onBuildingComplete(tile);
    }
  }
  function buildUndo(tile) {
    if (submitted) return;
    const locked = +tile.dataset.locked || 0;
    const filled = [...tile.querySelectorAll(".wbox.filled")];
    if (filled.length <= locked) return;
    [...tile.querySelectorAll(".wbox")].sort(wboxOrder)[filled.length - 1].classList.remove("filled");
    if (tile.classList.contains("mon")) monBoxes[tile.dataset.name] = filled.length - 1;
    workersToSpend++; gid("tWorkBuild").textContent = workersToSpend;
    renderEng();
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
      const filled = Math.min(seed.filled, boxes.length);
      for (let i = 0; i < filled; i++) boxes[i].classList.add("filled");
      monBoxes[tile.dataset.name] = filled;
      tile.dataset.locked = String(filled);
      if (seed.built) tile.classList.add("built");
    });
  }
  function renderMonuments(players) {
    const area = gid("monArea"); area.innerHTML = "";
    const vis = MONUMENTS.filter((m) => !(m.notAt || []).includes(players));
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
  // The monument set is fixed by the room's seat count — never a mid-game choice.
  const playerCount = Math.max(1, opts.players || 1);
  renderMonuments(playerCount);
  const mp = gid("monPlayers"); if (mp) mp.textContent = playerCount === 1 ? "solo set" : playerCount + "-player set";

  // Developments list — mark seeded (owned) devs as locked
  const devBlock = gid("devBlock");
  DEVELOPMENTS.forEach((d) => {
    const r = document.createElement("div");
    r.className = "row dev" + (owned.has(d.name) ? " locked" : "");
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
      else if (paychip.dataset.food) payFood = (payFood + 1) % (food + 1);   // cycle 0..food
      else {
        const gi = +paychip.dataset.good;   // lit chip: sell one fewer; unlit: one more (off the top)
        payCounts[gi] = paychip.classList.contains("on")
          ? Math.max(0, payCounts[gi] - 1)
          : Math.min(goodsHeld[gi], payCounts[gi] + 1);
      }
      renderPay(); return;
    }
    if (e.target.closest("#engUse")) { engConvert(+1); return; }
    if (e.target.closest("#engUndo")) { engConvert(-1); return; }
    if (e.target.closest("#payConfirm")) { confirmPay(); return; }
    if (e.target.closest("#submitBtn")) { submitTurn(); return; }
    const dev = e.target.closest(".row.dev .cost");
    if (dev) {
      const rowEl = dev.closest(".row.dev");
      if (rowEl.classList.contains("locked")) return;
      if (rowEl.classList.contains("bought")) {
        rowEl.classList.remove("bought");
        boughtDev = null;
        if (rowEl._paid) { rowEl._paid.forEach(([i, q]) => goodsHeld[i] = q); rowEl._paid = null; }
        if (rowEl._paidFood) { food = Math.min(15, food + rowEl._paidFood); rowEl._paidFood = 0; syncFoodTrack(); }
        markGoodsChart(); computePower();
      } else if (boughtDev) { /* one dev per turn */ }
      else if (payDev === rowEl) { cancelPay(); }
      else if (!payDev) { startPay(rowEl); }
    }
  });

  computePower();

  // tips + tab switching
  const TIPS = {
    dice: "Tap <b>ROLL</b> (3×); click dice to <b>hold</b>. A 🌾/⚒️ die blinks — tap it for <b>Food or Workers</b>. Then <b>Upkeep</b>: food stores, cities feed (1 each).",
    build: "Spend this turn's <b>workers</b> to fill city &amp; monument boxes. <b>First</b> to finish a monument scores the bigger number.",
    dev: "Buy <b>one development per turn</b> — tap a cost, then tap coins and <b>individual goods</b> to pay. Each is bought once; its effect is permanent.",
    goods: "Each good's value grows with its stack — <b>sell from the top</b>. Keep only <b>6 total</b>. Then tap <b>Submit turn</b>.",
  };
  const setTip = (page) => { const t = gid("tipStrip"); if (t) { t.innerHTML = TIPS[page] || ""; t.classList.remove("alert"); } };
  function blinkTab(page) { const b = root.querySelector('.tabs button[data-page="' + page + '"]'); if (b) b.classList.add("done"); }
  function showPage(page) {
    root.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
    root.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === "page-" + page));
    const cur = root.querySelector('.tabs button[data-page="' + page + '"]'); if (cur) cur.classList.remove("done");
    setTip(page);
    if (page === "build") { renderEng(); if (workersToSpend === 0) blinkTab("dev"); }
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
      <div class="block workers-panel"><h3>Workers to spend <small>from this roll</small></h3><div class="big-stat">⚒️ <span id="tWorkBuild">0</span></div><div class="goods-cash" id="engRow"></div></div>
      <div class="block"><h3>Cities <small>start with 3 · build with workers</small></h3><div id="cityRow"></div></div>
      <div class="block" id="monBlock"><h3>Monuments <small id="monPlayers"></small></h3>
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
