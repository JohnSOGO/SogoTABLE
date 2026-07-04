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
import { MARKUP, buildCitySVG, monTile, wboxOrder, splitRows } from "./board-art.js";
import {
  fillFood, flyEmoji, flashFirstFoodBox, rollFlicker, animateHarvestToFood, animateFoodToDice, resolveDisasters,
} from "./board-fx.js";

// Build a fresh board bound to `root`. opts:
//   seat       - my server seat projection (cities, food, goods, developments,
//                monumentBoxes, points_lost) to seed this round from.
//   monuments  - game.monuments {name:[marks]} so already-claimed monuments show.
//   myMark     - my seat mark (to read the monuments map).
//   players    - seat count (drives which monuments are in play).
//   scoreboard - (overlay) => html builder for the shared scoreboard. The board
//                calls it with MY in-progress turn overlay whenever the local
//                score changes (wu wei: state transition → projection → render).
//   onCommit   - (payload) => void, called once when the player submits the turn.
export function createRttaBoard(root, opts) {
  const seat = opts.seat || {};
  const onCommit = opts.onCommit || (() => {});
  const myMark = opts.myMark;
  let gameMon = opts.monuments || {};        // updated mid-round as opponents commit
  let rivalBoxes = opts.rivalBoxes || {};    // monument -> furthest opponent progress

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
  let undoMode = false;                      // sticky ↩️ toggle — build taps refund workers instead of spending
  let goodsHeld = (seat.goods && seat.goods.length === 5) ? seat.goods.slice() : [0, 0, 0, 0, 0];
  let goodsOriginal = goodsHeld.slice();
  const owned = new Set(seat.developments || []);   // owned at turn start
  let boughtDev = null;                       // development bought THIS turn
  const monBoxes = {};                        // monument name -> my filled worker boxes
  let leadershipUsed = false;
  let engUsed = 0;                           // stones converted to workers this turn (Engineering)
  let payDev = null;
  const payGoods = new Set();
  let payCoins = false;
  let coinsSpent = false;                    // coins turned in with a purchase are gone (no change)
  let payFood = 0;                           // food sold into the current dev purchase (Granaries)
  let lastFoodTap = 0;                       // for the quick-second-tap-to-clear gesture
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
    rolls = 0; upkeepDone = false; plan = null; leadershipUsed = false; upkeepConfirm = false; turnLost = 0; turnSkulls = 0;
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
    if (busy() || submitted || upkeepDone) return;   // dice are settled once Upkeep runs
    const d = dice[i];
    // Leadership reroll wins the tap — ANY die is a legal target, even the
    // choice die (2025 rulebook: "select 1 die and roll it again").
    if (leadMode && leadershipReady() && d.face) { leadershipReroll(i); return; }
    if (rollingEnded() && d.face && d.face.choice) { cycleChoice(i); return; }   // choice taps always cycle
    toggleLock(i);
  }
  // "After your LAST roll" — the 3rd, or an earlier roll the player stopped at
  // (all dice held). Owned at turn start: buys land after Upkeep, too late.
  function rollingEnded() { return rolls >= MAX_ROLLS || (rolls > 0 && allHeld()); }
  function leadershipReady() {
    return rollingEnded() && owned.has("Leadership") && !leadershipUsed && !upkeepDone;
  }
  // Explicit two-step reroll: the 👑 button appears after the final roll; only
  // AFTER pressing it do dice become rerollable (no accidental rerolls).
  let leadMode = false;
  function renderLead() {
    const el = gid("leadRow"); if (!el) return;
    if (!leadershipReady()) { leadMode = false; el.innerHTML = ""; return; }
    el.innerHTML = leadMode
      ? '<button class="cashchip pay on" id="leadBtn" type="button">👑 Now tap the die to reroll — or tap here to cancel</button>'
      : '<button class="cashchip pay" id="leadBtn" type="button">👑 Leadership: reroll a die</button>';
  }
  function leadershipReroll(i) {
    leadershipUsed = true;
    leadMode = false;
    rolls = MAX_ROLLS;   // using Leadership DECLARES the roll final — no rolling on after it
    const rc = gid("rollCell"); rc.classList.add("busy");
    rollFlicker([dieEls[i]], () => {
      setFace(i, FACES[Math.floor(Math.random() * 6)]);
      if (!dice[i].face.skullFace) { dice[i].locked = true; paintDie(i); }
      rc.classList.remove("busy"); tally(); markChoices(); updateButton();
    });
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
    const ended = rollingEnded();
    let pending = 0;
    const lead = leadershipReady();
    dice.forEach((d, i) => {
      const needsDecision = ended && d.face && d.face.choice === true && !d.choice;
      dieEls[i].classList.toggle("choice-pending", needsDecision);
      dieEls[i].classList.toggle("lead-glow", leadMode && lead && !!d.face);
      if (needsDecision) pending++;
    });
    renderLead();
    const tip = gid("tipStrip");
    if (pending > 0 && !upkeepDone) {
      tip.innerHTML = "Tap the blinking 🌾/⚒️ die — <b>Food or Workers?</b>"; tip.classList.add("alert");
    } else if (lead && leadMode) {
      tip.innerHTML = "👑 Tap the die to reroll — even a skull. You must accept the new result."; tip.classList.add("alert");
    } else if (lead) {
      tip.classList.remove("alert");
      tip.innerHTML = "👑 <b>Leadership</b> is ready — tap the 👑 button to reroll one die, or tap <b>Upkeep</b> to keep the roll.";
    } else if (ended && !upkeepDone) {
      tip.classList.remove("alert");
      tip.innerHTML = "Roll finished — tap the green <b>Upkeep</b>: food stores, cities feed (1 each). Then spend workers on <b>2 Build</b>.";
    } else { tip.classList.remove("alert"); setTip("dice"); }
    const rc = gid("rollCell");
    if (rc) rc.classList.toggle("ready", ended && pending === 0 && !upkeepDone);
  }
  function updateButton() {
    const rc = gid("rollCell"); if (!rc) return;
    const bank = rollingEnded();
    rc.dataset.mode = bank ? "bank" : "roll";
    rc.textContent = bank ? "Upkeep" : "ROLL";
    rc.classList.toggle("bank", bank);
  }
  let upkeepConfirm = false;   // one-tap pause while Leadership is still unused
  function onAction() {
    const rc = gid("rollCell");
    if (rc.classList.contains("busy") || submitted) return;
    if (rc.dataset.mode === "bank") {
      // An undecided 🌾/⚒️ die is never worth NOTHING — block Upkeep until
      // the player picks (tapping past the prompt used to tally it as zero).
      if (dice.some((d) => d.face && d.face.choice && !d.choice)) {
        const tip = gid("tipStrip");
        tip.innerHTML = "Tap the blinking 🌾/⚒️ die first — <b>Food or Workers?</b>";
        tip.classList.add("alert");
        return;
      }
      if (leadershipReady() && !upkeepConfirm) {
        upkeepConfirm = true;
        const tip = gid("tipStrip");
        tip.innerHTML = "👑 <b>Leadership unused</b> — tap the 👑 button to reroll a die, or tap <b>Upkeep</b> again to skip.";
        tip.classList.add("alert");
        return;
      }
      runUpkeep(); return;
    }
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
    refreshDisasterImmunity();   // buying/undoing Irrigation or Religion updates the table
  }

  function doRoll() {
    if (rolls >= MAX_ROLLS) return;
    const toRoll = dice.map((d, i) => (d.face && isHeld(d) ? -1 : i)).filter((i) => i >= 0);
    if (toRoll.length === 0) return;
    const rc = gid("rollCell"); rc.classList.add("busy");
    rollFlicker(toRoll.map((i) => dieEls[i]), () => {
      toRoll.forEach((i) => setFace(i, FACES[Math.floor(Math.random() * 6)]));
      rolls++;
      if (rolls >= MAX_ROLLS) lockAll();
      tally(); rc.classList.remove("busy"); updateButton(); markChoices();
    });
  }
  function lockAll() { dice.forEach((d, i) => { if (d.face && !d.face.skullFace) { d.locked = true; paintDie(i); } }); }

  // --- upkeep animations (motion FX live in board-fx.js) ---------------------
  // Each step hands board-fx the counts/elements to animate, then applies the
  // state transition itself — the fly/fill visuals never own food or points.
  function loseAPoint(srcEl) {
    const target = disOrder[lostPoints]; if (!target) return;
    lostPoints++; turnLost++;
    flyEmoji(srcEl, target, "💀", () => target.classList.add("filled"));
  }
  function loseFoodPoint() { loseAPoint(flashFirstFoodBox(root)); }
  const harvestStep = (done) => { animateHarvestToFood(root, food, plan.foodAfterHarvest, done); food = plan.foodAfterHarvest; };
  const feedStep = (done) => { animateFoodToDice(root, food, plan.feeds, dieEls, done); food = plan.foodAfterFeeding; };
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
    leadMode = false; renderLead();
    dieEls.forEach((el) => el.classList.remove("choice-pending", "lead-glow"));
    harvestStep(() => feedStep(() => resolveDisasters(root, plan.famine, plan.disasterPts, loseFoodPoint, loseAPoint, finishUpkeep)));
  }
  function finishUpkeep() {
    const rc = gid("rollCell"); rc.classList.remove("ready"); rc.textContent = "✓";
    workersToSpend = turnTally.work;
    const noQuarry = new Set([...ownsAll()].filter((n) => n !== "Quarrying"));
    const quarryBonus = ownsDev("Quarrying")
      && collectGoods(goodsHeld, turnTally.good, ownsAll())[1] > collectGoods(goodsHeld, turnTally.good, noQuarry)[1];
    goodsHeld = collectGoods(goodsHeld, turnTally.good, ownsAll());
    goodsOriginal = goodsHeld.slice();
    const nextStep = workersToSpend > 0
      ? "Spend your ⚒️ workers on <b>2 Build</b>."
      : "No workers this turn — see <b>3 Dev</b> to buy, then <b>4 Discard</b> to submit.";
    if (plan.revolt) {   // revolt: all goods lost (Religion turns it on opponents instead)
      goodsHeld = [0, 0, 0, 0, 0]; goodsOriginal = [0, 0, 0, 0, 0];
      const tip = gid("tipStrip");
      tip.innerHTML = "🔥 <b>Revolt!</b> All your goods are lost. " + nextStep; tip.classList.add("alert");
    } else if (quarryBonus) {
      gid("tipStrip").innerHTML = "🪨 <b>Quarrying</b>: +1 bonus stone. ✓ Upkeep done — " + nextStep;
    } else {
      gid("tipStrip").innerHTML = "✓ Upkeep done — " + nextStep;
    }
    markGoodsChart(); computePower();
    gid("tWorkBuild").textContent = workersToSpend;
    renderEng();
    refreshScoreboard();   // famine/disaster points just landed — project them
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

  // Cities seed from the seat's cityBoxes — partial worker progress persists
  // between rounds exactly like the paper score sheet (and like monuments).
  // Seeded boxes are locked; a slot is "done" when its boxes are full.
  const cityBoxesState = [0, 0, 0, 0];
  const seedCityBoxes = (Array.isArray(seat.cityBoxes) && seat.cityBoxes.length === 4)
    ? seat.cityBoxes
    : [0, 1, 2, 3].map((s) => (s < builtCities - MIN_CITIES ? CITY_COSTS[s + MIN_CITIES] : 0));
  const cityRow = gid("cityRow");
  CITY_COSTS.forEach((cost, i) => {
    const c = document.createElement("div");
    const seeded = cost == null ? 0 : Math.max(0, Math.min(cost, seedCityBoxes[i - MIN_CITIES] || 0));
    const full = cost == null || seeded >= cost;
    c.className = "city" + (full ? " done" : "");
    c.innerHTML = buildCitySVG(cost, i) + '<div class="num">City ' + (i + 1) + "</div>";
    if (cost != null) {
      c.dataset.locked = String(seeded);   // seeded progress can't be undone
      c.dataset.slot = String(i - MIN_CITIES);
      cityBoxesState[i - MIN_CITIES] = seeded;
      const boxes = [...c.querySelectorAll(".wbox")].sort(wboxOrder);
      for (let k = 0; k < seeded; k++) boxes[k].classList.add("filled");
    }
    cityRow.appendChild(c);
  });

  const foodRoll = gid("foodRoll");
  for (let i = 1; i <= 15; i++) foodRoll.appendChild(box("em-food", ""));
  for (let i = 0; i < food; i++) fillFood(root, i);

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
  const devCost = (r) => parseInt(r.querySelector(".cost").textContent, 10) || 0;
  const goodValueLocal = (i) => goodValue(i, goodsHeld[i]);
  const coinValue = () => (coinsSpent ? 0 : turnTally.coin * coinFaceValue(ownsAll()));
  const paidTotal = () => paymentTotal({ payCoins, payGoods, payFood }, { coinCount: turnTally.coin, goods: goodsHeld, owns: ownsAll() });
  function startPay(r) { payDev = r; payGoods.clear(); payCoins = false; payFood = 0; qsa("#devBlock .row.dev").forEach((x) => x.classList.toggle("paying", x === r)); renderPay(); }
  function cancelPay() { payDev = null; payGoods.clear(); payCoins = false; payFood = 0; qsa("#devBlock .row.dev").forEach((x) => x.classList.remove("paying")); computePower(); }
  function renderPay() {
    if (!payDev) return;
    const cost = devCost(payDev), paid = paidTotal();
    let html = '<span class="paylbl">Pay ' + cost + " →</span>";
    // Granaries food leads the strip — the buff that is easiest to forget you
    // can cash in. Tap cycles the count (rulebook: any number of food, 6 coins
    // each, during the Buy step); a quick second tap clears back to zero.
    if (ownsDev("Granaries") && (food > 0 || payFood > 0)) {
      const label = payFood > 0
        ? "🌾×" + payFood + " = " + (payFood * GRANARIES_RATE)
        : "🌾 sell food · " + GRANARIES_RATE + " ea";
      html += '<span class="cashchip pay' + (payFood > 0 ? " on" : "") + '" data-food="1">' + label + "</span>";
    }
    if (coinValue() > 0) html += '<span class="cashchip pay' + (payCoins ? " on" : "") + '" data-coins="1">🪙 ' + coinValue() + "</span>";
    goodsHeld.forEach((q, i) => { if (q > 0) html += '<span class="cashchip pay' + (payGoods.has(i) ? " on" : "") + '" data-good="' + i + '">' + GOODS[i].name.split(" ")[0] + " " + goodValueLocal(i) + "</span>"; });
    html += '<span class="paystat' + (paid >= cost ? " ok" : "") + '">' + paid + "/" + cost + "</span>";
    if (paid >= cost) html += '<button class="cashchip paybuy" id="payConfirm">✓ Buy</button>';
    gid("goodsCash").innerHTML = html;
  }
  function confirmPay() {
    if (!upkeepDone || !payDev || paidTotal() < devCost(payDev)) return;
    const r = payDev;
    if (payCoins) coinsSpent = true;   // turned in whole — overpay is lost, no change
    payGoods.forEach((i) => { goodsHeld[i] = 0; });
    if (payFood > 0) { food = Math.max(0, food - payFood); syncFoodTrack(); }
    r.classList.add("bought", "locked");   // a purchase is FINAL once bought (rulebook has no undo)
    r.classList.remove("paying");
    boughtDev = r.querySelector(".nm").textContent;
    payDev = null; payGoods.clear(); payCoins = false; payFood = 0;
    blinkTab("goods"); markGoodsChart(); computePower(); refreshScoreboard();
  }
  function syncFoodTrack() { root.querySelectorAll("#foodRoll .box").forEach((b, i) => b.classList.toggle("filled", i < food)); }

  // --- scoring / discard / submit -------------------------------------------
  function submitTurn() {
    if (submitted) return;
    if (!upkeepDone) { showPage("dice"); return; }   // must run upkeep first
    if (payDev && paidTotal() >= devCost(payDev)) {
      // A fully-funded purchase was never confirmed — don't silently drop it.
      showPage("dev");
      const tip = gid("tipStrip");
      tip.innerHTML = "💰 <b>Unfinished purchase</b> — tap <b>✓ Buy</b> to take it, or tap the cost to cancel. Then submit.";
      tip.classList.add("alert");
      return;
    }
    if (payDev) cancelPay();
    goodsHeld = discardExcess(goodsHeld, ownsAll());
    markGoodsChart();
    submitted = true;
    root.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("done"));
    const sub = gid("submitBtn"); if (sub) { sub.textContent = "✓ Turn submitted"; sub.disabled = true; sub.classList.remove("ready"); }
    gid("rttaStatus").textContent = "Waiting for the other players to finish…";
    onCommit(buildCommitPayload({
      cities: builtCities, cityBoxes: cityBoxesState, food, goods: goodsHeld,
      monumentBoxes: monBoxes, devBought: boughtDev, skulls: turnSkulls, pointsLostSelf: turnLost,
      round,   // stamps the payload — the server rejects a stale tab's commit
    }));
  }
  // A failed POST re-opens the turn: without this the latched `submitted` +
  // disabled button strand the player at "Waiting…" until a manual refresh.
  function commitFailed(message) {
    submitted = false;
    const sub = gid("submitBtn");
    if (sub) { sub.textContent = "Submit turn"; sub.disabled = false; sub.classList.add("ready"); }
    const st = gid("rttaStatus");
    if (st) st.textContent = "⚠️ " + (message || "The turn didn't send") + " — tap Submit to retry.";
  }

  // --- build interactions (artwork + markup live in board-art.js) -------------
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
      else if (tile.dataset.slot != null) cityBoxesState[+tile.dataset.slot] = filledCount + 1;
      workersToSpend--; gid("tWorkBuild").textContent = workersToSpend;
      if (workersToSpend === 0) blinkTab("dev");
      renderEng();
      if (filledCount + 1 === boxes.length) onBuildingComplete(tile);
      refreshScoreboard();
    }
  }
  function buildUndo(tile) {
    if (submitted) return;
    const locked = +tile.dataset.locked || 0;
    const filled = [...tile.querySelectorAll(".wbox.filled")];
    if (filled.length <= locked) return;
    [...tile.querySelectorAll(".wbox")].sort(wboxOrder)[filled.length - 1].classList.remove("filled");
    if (tile.classList.contains("mon")) monBoxes[tile.dataset.name] = filled.length - 1;
    else if (tile.dataset.slot != null) cityBoxesState[+tile.dataset.slot] = filled.length - 1;
    workersToSpend++; gid("tWorkBuild").textContent = workersToSpend;
    renderEng();
    if (tile._builtTimer) { clearTimeout(tile._builtTimer); tile._builtTimer = null; }
    tile.classList.remove("built");
    if (tile.classList.contains("city") && tile.classList.contains("done")) {
      tile.classList.remove("done"); builtCities = Math.max(MIN_CITIES, builtCities - 1); diceCount = builtCities;
    }
    refreshScoreboard();
  }
  function onBuildingComplete(tile) {
    if (tile.classList.contains("city")) {
      tile.classList.add("done"); builtCities = Math.min(MAX_CITIES, builtCities + 1); diceCount = builtCities;
    } else { tile._builtTimer = setTimeout(() => tile.classList.add("built"), 2000); }
  }
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
  // The build race: rival workers tint boxes light red (my gold overpaints
  // where I've matched them), and the badge shows 🥇+first-VP while a monument
  // is unclaimed, dropping to the later-builder VP once someone scores it.
  function paintRace() {
    qsa("#monArea .mon").forEach((tile) => {
      const name = tile.dataset.name;
      const m = MONUMENTS.find((x) => x.name === name);
      if (!m) return;
      const boxes = [...tile.querySelectorAll(".wbox")].sort(wboxOrder);
      const rival = Math.max(0, Math.min(boxes.length, rivalBoxes[name] || 0));
      boxes.forEach((b, i) => b.classList.toggle("rival", i < rival));
      const claims = gameMon[name] || [];
      const sc = tile.querySelector(".mscore");
      if (!sc) return;
      if (claims.length === 0) sc.textContent = "🥇 " + m.first;
      else if (claims.includes(myMark)) sc.textContent = String(claims[0] === myMark ? m.first : m.later);
      else sc.textContent = String(m.later);
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
  paintRace();
  const mp = gid("monPlayers"); if (mp) mp.textContent = playerCount === 1 ? "solo set" : playerCount + "-player set";

  // Developments list — mark seeded (owned) devs as locked
  const devBlock = gid("devBlock");
  DEVELOPMENTS.forEach((d) => {
    const r = document.createElement("div");
    r.className = "row dev" + (owned.has(d.name) ? " locked" : "");
    r.innerHTML = '<div class="cost">' + d.cost + '</div><div class="nm">' + d.name + '</div><div class="ab">' + d.ab + '</div><div class="vp"><b>' + d.vp + "</b> pts</div>";
    devBlock.appendChild(r);
  });

  // Disasters list + points-lost grid. Solitaire has no opponents, so its
  // Pestilence row strikes the roller (server rule) — say so, and let
  // Medicine read as immunity there.
  const baseEf = (n) => (playerCount === 1 && n === 3
    ? "Pestilence — lose 3 points (no opponents)"
    : DISASTERS.find((d) => d.count === n).ef);
  const disList = gid("disList");
  DISASTERS.forEach((d) => { disList.insertAdjacentHTML("beforeend", '<div class="drow" data-skulls="' + d.count + '"><span class="sk">' + d.sk + '</span><span class="ef">' + baseEf(d.count) + "</span></div>"); });
  // A disaster row you are covered against says WHY it can't hurt you instead
  // of listing a penalty that will not happen: Drought ↔ Irrigation, Invasion ↔
  // a completed Great Wall, Revolt ↔ Religion (redirected at your opponents).
  const wallWorkers = MONUMENTS.find((m) => m.name === "Great Wall").w;
  const IMMUNE_EF = {
    2: "Irrigation prevents Drought — no effect",
    3: "Medicine prevents Pestilence — no effect",
    4: "Great Wall prevents Invasion — no effect",
    5: "Religion turns Revolt on opponents — they lose their goods",
  };
  function refreshDisasterImmunity() {
    qsa("#disList .drow").forEach((r) => {
      const n = +r.dataset.skulls;
      const immune =
        (n === 2 && ownsDev("Irrigation")) ||
        (n === 3 && playerCount === 1 && ownsDev("Medicine")) ||
        (n === 4 && (monBoxes["Great Wall"] || 0) >= wallWorkers) ||
        (n === 5 && ownsDev("Religion"));
      r.classList.toggle("immune", immune);
      const ef = r.querySelector(".ef");
      if (ef) ef.textContent = immune ? IMMUNE_EF[n] : baseEf(n);
    });
  }
  function highlightDisaster(skulls) {
    refreshDisasterImmunity();
    const n = skulls >= 5 ? 5 : skulls;
    qsa("#disList .drow").forEach((r) => r.classList.toggle("hit", +r.dataset.skulls === n && !r.classList.contains("immune")));
  }

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
    // Build taps apply IMMEDIATELY (no double-tap timer — fast tapping works);
    // the sticky ↩️ toggle flips taps from spending workers to refunding them.
    const tile = e.target.closest("#monArea .mon, #cityRow .city");
    if (tile) { (undoMode ? buildUndo : buildAdd)(tile); return; }
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
      else if (paychip.dataset.food) {
        const now = Date.now();
        if (now - lastFoodTap < 250) payFood = 0;                     // quick second tap clears
        else payFood = (payFood + 1) % (food + 1);                    // cycle 0..food
        lastFoodTap = now;
      }
      else { const gi = +paychip.dataset.good; payGoods.has(gi) ? payGoods.delete(gi) : payGoods.add(gi); }
      renderPay(); return;
    }
    if (e.target.closest("#leadBtn")) { leadMode = !leadMode; markChoices(); return; }
    const undoBtn = e.target.closest("#undoModeBtn");
    if (undoBtn) { undoMode = !undoMode; undoBtn.classList.toggle("on", undoMode); return; }
    if (e.target.closest("#engUse")) { engConvert(+1); return; }
    if (e.target.closest("#engUndo")) { engConvert(-1); return; }
    if (e.target.closest("#payConfirm")) { confirmPay(); return; }
    if (e.target.closest("#submitBtn")) { submitTurn(); return; }
    const dev = e.target.closest(".row.dev .cost");
    if (dev) {
      const rowEl = dev.closest(".row.dev");
      if (rowEl.classList.contains("locked")) return;   // owned — including bought this turn: final
      if (!upkeepDone) {   // buys come AFTER Upkeep — no dodging your own disasters
        const tip = gid("tipStrip");
        tip.innerHTML = "⏳ Finish your roll and <b>Upkeep</b> first — developments are bought in the Buy step.";
        tip.classList.add("alert");
        return;
      }
      if (boughtDev) { /* one dev per turn */ }
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
    goodsCaravans: "Goods cash in <b>by type, whole-stack — no change</b>. 🐫 <b>Caravans</b>: no discard — keep everything. Then tap <b>Submit turn</b>.",
  };
  const setTip = (page) => {
    const t = gid("tipStrip"); if (!t) return;
    const key = (page === "goods" && ownsDev("Caravans")) ? "goodsCaravans" : page;
    t.innerHTML = TIPS[key] || ""; t.classList.remove("alert");
  };
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
  let scoreBuilder = opts.scoreboard || null;
  const roundLabel = gid("roundNum"); if (roundLabel) roundLabel.textContent = String(round);
  refreshScoreboard();
  newTurn();

  function setScoreboard(html) { const el = gid("sharedScore"); if (el) el.innerHTML = html; }
  // MY in-progress turn, projected into the shared standings (my row only).
  function localOverlay() {
    return {
      devBought: boughtDev,
      monumentsCompleted: MONUMENTS.filter((m) => (monBoxes[m.name] || 0) >= m.w).map((m) => m.name),
      cities: builtCities,
      pointsLost: turnLost,
    };
  }
  function refreshScoreboard() { if (scoreBuilder) setScoreboard(scoreBuilder(localOverlay())); }

  return {
    root,
    isSubmitted: () => submitted,
    commitFailed,
    setScoreboardBuilder: (fn) => { scoreBuilder = fn; refreshScoreboard(); },
    // Mid-round snapshot: opponents committed — repaint the build race.
    updateRace: (mon, rivals) => { gameMon = mon || {}; rivalBoxes = rivals || {}; paintRace(); },
  };
}
