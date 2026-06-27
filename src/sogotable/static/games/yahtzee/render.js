// Yahtzee — Game-Locked client renderer.
//
// This is a FAITHFUL port of the standalone UI we iterated on (AI/Yahtzee): the
// same dice, scorecard (Faces/Hands with the scoring legend, bonus row, yellow/
// grey/green states, blank-in-place), tip strip (tap-to-cycle), sounds, and end
// overlay. All of it is scoped under `.yz-root` so the standalone's generic class
// names (.row/.card/.die/...) never touch the app shell.
//
// Only the multiplayer seams differ from the standalone:
//   - each player runs their own game on-device (rolls/holds stay local);
//   - a committed category score is POSTED to the server via ctx.makeMove;
//   - the bottom board reads the LIVE leaderboard from the room snapshot;
//   - before the host starts, the standard 10,000-style lobby is shown.
import {
  UPPER, LOWER, CATEGORIES, CATEGORY_KEYS,
  newGame, applyAction, previewScores, isJoker, isYahtzee, scoringDice,
  upperSubtotal, upperBonus, grandTotal, isCardComplete,
  UPPER_BONUS_THRESHOLD, UPPER_BONUS, MAX_ROLLS,
} from "./rules.js";

const PIP_MAP = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
const FIXED_HAND = { fullHouse: 25, smallStraight: 30, largeStraight: 40, yahtzee: 50 };
const ROUNDS = CATEGORIES.length;

// Self-contained Web Audio SFX (ported verbatim from the standalone).
const Sound = (() => {
  let actx = null;
  let muted = false;
  function ac() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(freq, start, dur, { type = "sine", gain = 0.18, glideTo = null } = {}) {
    const c = ac(); const t0 = c.currentTime + start;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function noiseHit(start, dur, { gain = 0.2, freq = 1200, q = 1.2 } = {}) {
    const c = ac(); const t0 = c.currentTime + start;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(c.destination); src.start(t0); src.stop(t0 + dur + 0.03);
  }
  const guard = (fn) => (...a) => { if (!muted) try { fn(...a); } catch (_) {} };
  return {
    setMuted(m) { muted = m; },
    isMuted() { return muted; },
    unlock() { if (!muted) ac(); },
    roll: guard(() => { for (let i = 0; i < 7; i++) noiseHit(i * 0.05 + Math.random() * 0.02, 0.07, { gain: 0.16, freq: 800 + Math.random() * 1500 }); }),
    hold: guard(() => tone(880, 0, 0.05, { type: "square", gain: 0.1 })),
    unhold: guard(() => tone(587, 0, 0.06, { type: "square", gain: 0.1 })),
    score: guard(() => { tone(523, 0, 0.11, {}); tone(784, 0.085, 0.16, {}); }),
    zero: guard(() => tone(300, 0, 0.22, { type: "sawtooth", gain: 0.13, glideTo: 150 })),
    yahtzee: guard(() => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.2, { type: "triangle", gain: 0.2 }))),
    win: guard(() => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, 0.32, { type: "triangle" })); tone(1047, 0.62, 0.7, { gain: 0.12 }); }),
  };
})();

// Module state: this device's own game persists across room snapshots.
let ctx = null;
let localGame = null;
let localKey = "";       // room.code:game_epoch — re-init the local game on reset
let builtKey = "";       // play structure currently built for this key
let rolling = false;
let busy = false;        // during the post-score green/white dice feedback
let newsMsg = "";
let tipIndex = 0;
let tipKey = "";
let newsTimer = null;
let soundUnlocked = false;

const q = (sel) => ctx.host.querySelector(sel);
const qa = (sel) => ctx.host.querySelectorAll(sel);

export function renderYahtzeeGame(controllerCtx) {
  ctx = controllerCtx;
  injectStyles();
  if (!ctx.started) { renderLobby(); builtKey = ""; return; }
  ensureLocalGame();
  // A snapshot arriving mid-animation must not clobber the dice feedback; just
  // refresh the live board and let the local turn finish.
  if ((rolling || busy) && q(".diceArea")) { renderBoard(); return; }
  render();
}

function localMark() {
  const seat = (ctx.room.players || []).find((p) => p.id === ctx.localPlayerId);
  return seat ? seat.mark : null;
}
function mySeat() {
  return (ctx.game.players || []).find((s) => s.mark === localMark());
}
function ensureLocalGame() {
  const key = `${ctx.room.code}:${ctx.room.game_epoch || 0}`;
  if (localKey === key && localGame) return;
  localKey = key;
  localGame = newGame(["You"]);
  // Rebuild committed scores from the server seat (reconnect / refresh).
  const seat = mySeat();
  if (seat && seat.scores) {
    const card = localGame.players[0];
    for (const k of CATEGORY_KEYS) if (seat.scores[k] != null) card.scores[k] = seat.scores[k];
    if (isCardComplete(card.scores)) localGame.over = true;
  }
}

// --- lobby (standard 10,000-style host-start lobby) ------------------------
function renderLobby() {
  const seats = Array.isArray(ctx.room.players) ? ctx.room.players : [];
  const roster = seats.length
    ? seats.map((seat, i) => `
      <li class="tt-lobby-player">
        <span class="tt-lobby-player-no">${i + 1}</span>
        <div class="tt-lobby-player-body">
          <strong>${ctx.escapeHtml(seat.name)}</strong>
          <span>${ctx.escapeHtml(seat.kind === "bot" ? "Bot" : "Player")} ${ctx.escapeHtml(seat.mark || "")}</span>
        </div>
      </li>`).join("")
    : `<li class="tt-lobby-empty">No players yet.</li>`;
  const hostControls = ctx.isHost
    ? `<div class="tt-lobby-actions">
        <button class="secondary" type="button" data-yz="invite">Invite Remote Opponent</button>
        <button class="secondary" type="button" data-yz="bot">Invite Bot</button>
        <button class="primary" type="button" data-yz="start" ${seats.length ? "" : "disabled"}>Start Game</button>
      </div>`
    : `<p class="ten-thousand-message">Waiting for the host to start...</p>`;
  ctx.host.innerHTML = `<div class="yz-root"><section class="ten-thousand-lobby">
      <h3>Players</h3>
      <ul class="tt-lobby-roster">${roster}</ul>
      <p class="ten-thousand-message">Everyone plays their own game in parallel. Invite players or bots, then start whenever you're ready.</p>
      ${hostControls}
    </section></div>`;
  if (!ctx.isHost) return;
  const wire = (key, fn) => { const b = q(`[data-yz="${key}"]`); if (b) b.addEventListener("click", fn); };
  wire("invite", () => ctx.invitePlayer());
  wire("bot", () => ctx.addBot());
  wire("start", () => ctx.startGame());
}

// --- play view -------------------------------------------------------------
function render() {
  ensureStructure();
  renderDice();
  renderCard();
  renderBoard();
  const p = localGame.players[localGame.current];
  const rollBtn = q(".roll");
  rollBtn.textContent = localGame.rollsLeft === MAX_ROLLS ? "Roll" : `Roll (${localGame.rollsLeft} left)`;
  rollBtn.disabled = localGame.over || localGame.rollsLeft <= 0 || rolling;
  q(".yz-sub").textContent = localGame.over ? "Game over" : `${p.name} · roll ${MAX_ROLLS - localGame.rollsLeft}/${MAX_ROLLS}`;
  renderTip();
}

function ensureStructure() {
  if (q(".diceArea") && builtKey === localKey) return;
  builtKey = localKey;
  ctx.host.innerHTML = `<div class="yz-root">
    <div class="yz-head">
      <span class="yz-sub"></span>
      <button class="yz-mini" data-yz="mute" title="Toggle sound">🔊</button>
    </div>
    <div class="tipstrip" data-yz="tip">…</div>
    <div class="diceArea">
      <div class="dice"></div>
      <div class="rollRow"><button class="roll">Roll</button></div>
    </div>
    <div class="card"></div>
    <div class="board"></div>
    <div class="overlay hidden" data-yz="end">
      <div class="sheet center">
        <h2 data-yz="endTitle">Game complete!</h2>
        <div class="finalscore" data-yz="finalScore">0</div>
        <div class="commline" data-yz="commLine">✓ Final score communicated</div>
        <button class="btn" data-yz="dismiss" style="width:100%;padding:11px;margin-top:14px">View the table</button>
      </div>
    </div>
  </div>`;
  q(".roll").addEventListener("click", doRoll);
  q('[data-yz="mute"]').addEventListener("click", toggleMute);
  q('[data-yz="dismiss"]').addEventListener("click", () => q('[data-yz="end"]').classList.add("hidden"));
  q('[data-yz="tip"]').addEventListener("click", () => {
    if (newsMsg) return;
    const n = localHints().length;
    if (n <= 1) return;
    tipIndex = (tipIndex + 1) % n;
    renderTip();
  });
  q('[data-yz="mute"]').textContent = Sound.isMuted() ? "🔇" : "🔊";
  if (!soundUnlocked) { ctx.host.addEventListener("pointerdown", () => Sound.unlock(), { once: true }); soundUnlocked = true; }
}

function dieNode(value, idx) {
  const el = document.createElement("div");
  el.className = "die";
  const showFace = localGame.rolled || rolling;
  if (!showFace) el.classList.add("idle");
  if (localGame.rolled && localGame.held[idx] && localGame.rollsLeft > 0) el.classList.add("held");
  const pips = showFace ? (PIP_MAP[value] || []) : [];
  for (let c = 0; c < 9; c++) {
    const pip = document.createElement("span");
    pip.className = "pip";
    if (pips.includes(c)) pip.style.visibility = "visible";
    el.appendChild(pip);
  }
  el.addEventListener("click", () => toggleHold(idx));
  return el;
}
function renderDice() {
  const diceEl = q(".dice");
  diceEl.innerHTML = "";
  localGame.dice.forEach((v, i) => diceEl.appendChild(dieNode(v, i)));
}

function row(cat, preview, scores) {
  const filled = scores[cat.key] != null;
  const el = document.createElement("div");
  el.className = "row " + (filled ? (scores[cat.key] === 0 ? "filled zero" : "filled") : "open");
  if (localGame.rolled && filled) el.classList.add("blank");
  const can = !filled && localGame.rolled && !rolling;
  if (can) el.classList.add(preview[cat.key] > 0 ? "canscore" : "zeroplay");
  const tag = cat.face ? `∑ ${cat.face}'s` : (FIXED_HAND[cat.key] != null ? String(FIXED_HAND[cat.key]) : "∑ All Dice");
  let valText;
  if (filled) valText = String(scores[cat.key]);
  else if (localGame.rolled && !rolling) valText = String(preview[cat.key]);
  else valText = "–";
  el.innerHTML = `<span class="lbl"><span class="cat">${cat.label}</span><span class="hint">( ${tag} )</span></span><span class="val">${valText}</span>`;
  if (!filled) el.addEventListener("click", () => scoreCategory(cat.key));
  return el;
}

function renderCard() {
  const cardEl = q(".card");
  cardEl.innerHTML = "";
  const p = localGame.players[localGame.current];
  const scores = p.scores;
  const preview = previewScores(localGame);

  const up = document.createElement("div"); up.className = "sec";
  const uphd = document.createElement("div"); uphd.className = "sechd";
  uphd.innerHTML = `<span>Faces</span><span class="tag">${isJoker(localGame.dice, p) ? "JOKER!" : ""}</span>`;
  up.appendChild(uphd);
  UPPER.forEach((c) => up.appendChild(row(c, preview, scores)));
  const sub = upperSubtotal(scores);
  const bonusRow = document.createElement("div"); bonusRow.className = "row bonusrow";
  const reached = upperBonus(scores) > 0;
  bonusRow.innerHTML = `<span class="lbl"><span class="cat">Bonus <span class="bprog">${sub}/${UPPER_BONUS_THRESHOLD}${reached ? " ✓" : ""}</span></span>` +
    `<span class="hint">( ${UPPER_BONUS} )</span></span>` +
    `<span class="val${reached ? " earned" : ""}">${reached ? UPPER_BONUS : "–"}</span>`;
  up.appendChild(bonusRow);
  cardEl.appendChild(up);

  const lo = document.createElement("div"); lo.className = "sec";
  const lohd = document.createElement("div"); lohd.className = "sechd";
  lohd.innerHTML = `<span>Hands</span><span class="tag">${p.yahtzeeBonus ? "+" + p.yahtzeeBonus : ""}</span>`;
  lo.appendChild(lohd);
  LOWER.forEach((c) => lo.appendChild(row(c, preview, scores)));
  const tot = document.createElement("div"); tot.className = "subrow grand";
  tot.innerHTML = `<span>Total</span><span class="v">${grandTotal(p)}</span>`;
  lo.appendChild(tot);
  cardEl.appendChild(lo);
}

// The live all-player board from the room snapshot. The local player's own row is
// driven by the local game so it updates the instant a score is committed, before
// the post round-trips; rivals/bots come straight from the server projection.
function renderBoard() {
  const myMark = localMark();
  const rows = (ctx.game.players || []).map((seat) => {
    const me = seat.mark === myMark;
    const round = me ? CATEGORIES.filter((c) => localGame.players[0].scores[c.key] != null).length : seat.round;
    const total = me ? grandTotal(localGame.players[0]) : seat.score;
    const series = 0; // series (cumulative Overall) lands with the multi-game wrapper
    const done = me ? localGame.over : seat.finish_state === "complete";
    return { name: seat.name, isBot: seat.is_bot, me, round, total, overall: series + total, done };
  }).sort((a, b) => b.overall - a.overall);
  q(".board").innerHTML =
    `<table class="lbtable"><thead><tr><th>Player</th><th>Status</th><th class="r">Round</th><th class="r">Game</th><th class="s">Overall</th></tr></thead><tbody>${
      rows.map((p) => `<tr class="${p.me ? "me" : ""}"><td>${ctx.escapeHtml(p.name)}${p.isBot ? " 🤖" : ""}</td>` +
        `<td>${p.done ? "✅ done" : "🎲 play"}</td><td class="r">${p.round}/${ROUNDS}</td><td class="r g">${p.total}</td><td class="s">${p.overall}</td></tr>`).join("")
    }</tbody></table>`;
}

// --- tips ------------------------------------------------------------------
function localHints() {
  if (!localGame) return ["Loading…"];
  if (localGame.over) return ["🎲 Game over — your score is in."];
  if (rolling) return ["🎲 Rolling…"];
  const p = localGame.players[localGame.current];
  if (!localGame.rolled) {
    const started = CATEGORIES.some((c) => p.scores[c.key] != null);
    return [started ? "🎲 Tap Roll to continue your game." : "🎲 Tap Roll to start your game."];
  }
  const preview = previewScores(localGame);
  const anyPositive = CATEGORIES.some((c) => p.scores[c.key] == null && preview[c.key] > 0);
  const tips = [localGame.rollsLeft > 0 ? "Hold the dice you want, then roll again." : "No rolls left — pick a box to score."];
  if (anyPositive) tips.push("Tap a yellow box to score points.");
  tips.push("Tap a grey box to take a zero.");
  return tips;
}
function renderTip() {
  const el = q('[data-yz="tip"]');
  if (!el) return;
  if (newsMsg) { el.classList.remove("tappable"); el.innerHTML = `<span class="tiptext">${newsMsg}</span>`; return; }
  const tips = localHints();
  const key = tips.join("|");
  if (key !== tipKey) { tipKey = key; tipIndex = 0; }
  tipIndex %= tips.length;
  const nav = tips.length > 1 ? `<span class="tipnav">👁 ${tipIndex + 1}/${tips.length}</span>` : "";
  el.innerHTML = `<span class="tiptext">${tips[tipIndex]}</span>${nav}`;
  el.classList.toggle("tappable", tips.length > 1);
}
function pushNews(msg, ms = 3500) {
  newsMsg = msg;
  const el = q('[data-yz="tip"]');
  if (el) el.textContent = msg;
  clearTimeout(newsTimer);
  newsTimer = setTimeout(() => { newsMsg = ""; renderTip(); }, ms);
}

// --- interactions ----------------------------------------------------------
function toggleHold(i) {
  if (!localGame.rolled || localGame.rollsLeft <= 0 || rolling || busy) return;
  localGame.held[i] = !localGame.held[i];
  (localGame.held[i] ? Sound.hold : Sound.unhold)();
  render();
}
async function doRoll() {
  if (localGame.over || localGame.rollsLeft <= 0 || rolling || busy) return;
  const rerolling = localGame.dice.map((_, i) => !(localGame.rolled && localGame.held[i]));
  applyAction(localGame, { type: "ROLL", held: localGame.held });   // local roll — never posted
  Sound.roll();
  rolling = true;
  render();
  qa(".die").forEach((el, i) => { if (rerolling[i]) el.classList.add("rolling"); });
  await new Promise((r) => setTimeout(r, 430));
  rolling = false;
  render();
  if (isYahtzee(localGame.dice)) { Sound.yahtzee(); pushNews("⭐ You rolled a YAHTZEE!"); }
}
async function scoreCategory(key) {
  if (localGame.over || !localGame.rolled || rolling || busy) return;
  const card = localGame.players[localGame.current];
  if (card.scores[key] != null) return;
  busy = true;
  if (previewScores(localGame)[key] > 0) Sound.score(); else Sound.zero();
  const mask = scoringDice(key, localGame.dice);
  qa(".die").forEach((el, i) => { el.classList.remove("held", "rolling"); el.classList.add(mask[i] ? "score" : "noscore"); });
  await new Promise((r) => setTimeout(r, 850));
  busy = false;
  const bonusBefore = card.yahtzeeBonus;
  applyAction(localGame, { type: "SCORE", category: key });   // local commit
  const value = card.scores[key];
  const yahtzeeBonus = card.yahtzeeBonus - bonusBefore;
  render();
  if (localGame.over) showEnd();
  await ctx.makeMove({ type: "SCORE", category: key, value, yahtzee_bonus: yahtzeeBonus });   // post to the table
}
function showEnd() {
  Sound.win();
  const score = grandTotal(localGame.players[0]);
  q('[data-yz="finalScore"]').textContent = score;
  q('[data-yz="commLine"]').textContent = "✓ Your final score is in — watch the table.";
  pushNews(`🏁 Your game is done: ${score}.`, 6000);
  q('[data-yz="end"]').classList.remove("hidden");
}
function toggleMute() {
  Sound.setMuted(!Sound.isMuted());
  q('[data-yz="mute"]').textContent = Sound.isMuted() ? "🔇" : "🔊";
  Sound.unlock();
}

// --- scoped styles (the standalone CSS, prefixed under .yz-root) ------------
function injectStyles() {
  if (document.getElementById("yz-styles")) return;
  const s = document.createElement("style"); s.id = "yz-styles";
  s.textContent = `
  .yz-root{grid-column:1/-1;width:100%;display:flex;flex-direction:column;gap:12px;
    --bg:#10131c;--panel:#1a1f2e;--ink:#eef1f8;--muted:#8b93a7;--line:#262c3d;--accent:#ffd166;--good:#1f7a44;--hot:#c43d5d;color:var(--ink)}
  .yz-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  .yz-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .yz-head .yz-sub{color:var(--muted);font-size:12px}
  .yz-mini{background:#2a3146;color:var(--ink);border:1px solid #39425c;border-radius:10px;padding:5px 10px;font-size:13px;cursor:pointer}
  .yz-root .tipstrip{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:0 14px;font-size:14px;font-weight:600;color:var(--accent);height:44px;display:flex;align-items:center;justify-content:center;gap:8px;overflow:hidden;cursor:default}
  .yz-root .tipstrip.tappable{cursor:pointer}
  .yz-root .tipstrip:active.tappable{background:#222a3d}
  .yz-root .tipstrip .tiptext{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .yz-root .tipstrip .tipnav{flex:0 0 auto;color:var(--muted);font-size:12px;font-weight:700}
  .yz-root .board{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
  .yz-root .lbtable{width:100%;border-collapse:collapse;font-size:13px}
  .yz-root .lbtable th{padding:7px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);background:#161b29;text-align:left;font-weight:600}
  .yz-root .lbtable th.r,.yz-root .lbtable th.s{text-align:right}
  .yz-root .lbtable td{padding:9px 10px;border-top:1px solid #20263680;white-space:nowrap}
  .yz-root .lbtable td.r,.yz-root .lbtable td.s,.yz-root .lbtable td.g{text-align:right;font-variant-numeric:tabular-nums}
  .yz-root .lbtable td.g{color:var(--ink);font-weight:600}
  .yz-root .lbtable td.s{font-weight:800;color:#5ed18a;font-size:16px}
  .yz-root .lbtable tr.me{background:rgba(255,209,102,.12)}
  .yz-root .diceArea{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:12px;align-items:center}
  .yz-root .dice{display:flex;gap:10px;justify-content:center}
  .yz-root .die{width:min(17vw,60px);height:min(17vw,60px);background:#f4f6fb;border-radius:14%;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);padding:9px;gap:3px;cursor:pointer;box-shadow:0 3px 6px rgba(0,0,0,.4);transition:transform .1s ease}
  .yz-root .die .pip{align-self:center;justify-self:center;width:80%;height:80%;border-radius:50%;background:#10131c;visibility:hidden}
  .yz-root .die.held{background:#ffe9a8;outline:3px solid var(--accent);outline-offset:1px}
  .yz-root .die.idle{background:#cfd6e6;cursor:default}
  .yz-root .die.rolling{animation:yz-tumble .42s ease}
  .yz-root .die.score{background:#5ed18a;outline:3px solid #2ea35e;outline-offset:1px}
  .yz-root .die.noscore{background:#f4f6fb}
  @keyframes yz-tumble{0%{transform:rotate(0) scale(1)}30%{transform:rotate(-14deg) scale(.9)}60%{transform:rotate(12deg) scale(1.05)}100%{transform:rotate(0) scale(1)}}
  .yz-root .rollRow{display:flex;gap:10px;align-items:center;width:100%;justify-content:center}
  .yz-root button.roll{background:var(--good);border-color:#2ea35e;color:#eafff1;font-size:15px;padding:10px 22px;border-radius:12px;font-weight:700;border-width:1px;border-style:solid;cursor:pointer}
  .yz-root button.roll:disabled{background:#33415a;border-color:#39425c;color:var(--muted);cursor:not-allowed}
  .yz-root .card{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;align-items:flex-start}
  .yz-root .sec{flex:1 1 0;min-width:0;padding:4px 0}
  .yz-root .sec + .sec{border-left:1px solid var(--line)}
  .yz-root .sechd{display:flex;justify-content:space-between;gap:6px;padding:7px 11px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px;background:#161b29;white-space:nowrap}
  .yz-root .sechd .tag{color:var(--accent);overflow:hidden;text-overflow:ellipsis}
  .yz-root .row{display:flex;justify-content:space-between;align-items:center;padding:8px 11px;border-top:1px solid #20263680;gap:6px}
  .yz-root .row .lbl{font-size:13px;flex:1;min-width:0;display:flex;align-items:baseline;justify-content:space-between;gap:8px}
  .yz-root .row .lbl .cat{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .yz-root .row .lbl .hint{color:var(--muted);font-weight:400;font-size:11px;flex:0 0 auto;white-space:nowrap}
  .yz-root .row .val{font-variant-numeric:tabular-nums;font-weight:700;min-width:32px;text-align:right;flex:0 0 auto}
  .yz-root .row.open{cursor:pointer}
  .yz-root .row.open .val{color:var(--muted);font-weight:600}
  .yz-root .row.open.canscore{background:rgba(255,209,102,.18)}
  .yz-root .row.open.canscore .val{color:var(--accent)}
  .yz-root .row.open.canscore:active{background:rgba(255,209,102,.34)}
  .yz-root .row.open.zeroplay{background:rgba(255,255,255,.05)}
  .yz-root .row.open.zeroplay .val{color:var(--muted)}
  .yz-root .row.open.zeroplay:active{background:rgba(255,255,255,.1)}
  .yz-root .row.filled .val{color:#5ed18a}
  .yz-root .row.filled.zero .val{color:#8b93a7}
  .yz-root .row.blank .lbl,.yz-root .row.blank .val{visibility:hidden}
  .yz-root .row.bonusrow{background:#161b29;cursor:default}
  .yz-root .row.bonusrow .cat .bprog{color:var(--muted);font-weight:400;font-size:12px}
  .yz-root .row.bonusrow .val{color:var(--muted);font-weight:700}
  .yz-root .row.bonusrow .val.earned{color:#5ed18a}
  .yz-root .subrow{display:flex;justify-content:space-between;padding:7px 14px;font-size:13px;color:var(--muted);background:#161b29}
  .yz-root .subrow .v{font-variant-numeric:tabular-nums;color:var(--ink);font-weight:600}
  .yz-root .subrow.grand{align-items:center;padding:9px 14px;border-top:1px solid #2a3145}
  .yz-root .subrow.grand > span:first-child{font-size:13px;color:var(--ink);font-weight:700;letter-spacing:.4px;text-transform:uppercase}
  .yz-root .subrow.grand .v{font-size:27px;line-height:1;color:#5ed18a;font-weight:800}
  .yz-root .overlay{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(8,10,16,.74)}
  .yz-root .overlay.hidden{display:none}
  .yz-root .sheet{background:var(--panel);border:1px solid #39425c;border-radius:16px;padding:20px;width:100%;max-width:420px;box-shadow:0 12px 40px rgba(0,0,0,.5)}
  .yz-root .sheet h2{margin:0 0 14px;font-size:18px;text-align:center}
  .yz-root .center{text-align:center}
  .yz-root .finalscore{font-size:56px;font-weight:800;color:#5ed18a;line-height:1;margin:16px 0 8px;font-variant-numeric:tabular-nums}
  .yz-root .commline{font-size:13px;color:var(--muted)}
  .yz-root .btn{background:#2a3146;color:var(--ink);border:1px solid #39425c;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}
  `;
  document.head.appendChild(s);
}
