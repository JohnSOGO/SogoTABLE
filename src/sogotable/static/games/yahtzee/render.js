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
// Shell sound system — every cue is gated by the top-menu sound toggle
// (isSoundEnabled), so Yahtzee audio is controlled there. No per-game speaker.
import { playDiceRoll, playScorePick, playClick, playCancel, playWin } from "../../sound.js";

const PIP_MAP = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
const FIXED_HAND = { fullHouse: 25, smallStraight: 30, largeStraight: 40, yahtzee: 50 };
const ROUNDS = CATEGORIES.length;
const SERIES_GAMES = 6;

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
let gameIndex = 1;       // the room's current game (1..SERIES_GAMES), server-driven
let seriesPast = 0;      // banked total from this device's completed games
let lastSeen = {};       // mark -> finish_state, for cross-player news
let roomKey = "";        // room.code:game_epoch — resets per-series news/celebration
let celebratedGame = 0;  // last game whose start we celebrated
let shownEnd = false;    // series-complete overlay already shown

const q = (sel) => ctx.host.querySelector(sel);
const qa = (sel) => ctx.host.querySelectorAll(sel);

export function renderYahtzeeGame(controllerCtx) {
  ctx = controllerCtx;
  injectStyles();
  if (!ctx.started) { renderLobby(); builtKey = ""; return; }
  ensureLocalGame();
  newsFromSnapshot();
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
function seatIcon(mark) {
  const p = (ctx.room.players || []).find((x) => x.mark === mark);
  return p && p.icon ? ctx.escapeHtml(p.icon) : "";
}
function ensureLocalGame() {
  const gi = (ctx.game && ctx.game.game_index) || 1;
  const rKey = `${ctx.room.code}:${ctx.room.game_epoch || 0}`;
  if (rKey !== roomKey) { roomKey = rKey; lastSeen = {}; celebratedGame = 0; shownEnd = false; }
  const key = `${rKey}:${gi}`;
  if (localKey === key && localGame) return;
  // The room (server) owns the game index; re-seed the local game when the table
  // advances or on reconnect, restoring this game's committed card from the seat.
  localKey = key;
  gameIndex = gi;
  const seat = mySeat();
  seriesPast = seat && seat.series_past ? seat.series_past : 0;
  localGame = newGame(["You"]);
  if (seat && seat.scores) {
    const card = localGame.players[0];
    for (const k of CATEGORY_KEYS) if (seat.scores[k] != null) card.scores[k] = seat.scores[k];
    if (isCardComplete(card.scores)) localGame.over = true; // finished this game, waiting
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
      <p class="ten-thousand-message">A 6-game series — everyone plays their own card, and the table moves to the next game once all players finish. Invite players or bots, then start.</p>
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
  const rollBtn = q(".roll");
  rollBtn.textContent = localGame.rollsLeft === MAX_ROLLS ? "Roll" : `Roll (${localGame.rollsLeft} left)`;
  rollBtn.disabled = localGame.over || localGame.rollsLeft <= 0 || rolling;
  renderTip();
  // Big deal when a new game starts (the whole table just advanced).
  if (gameIndex !== celebratedGame) {
    celebratedGame = gameIndex;
    pushNews(`🎲 Game ${gameIndex} of ${SERIES_GAMES} — good luck!`, 2600);
    tipFlash();
  }
  if (ctx.game && ctx.game.status === "complete") showEnd();
}

// Flash the tip/news strip green for ~1s to mark a new game.
function tipFlash() {
  const el = q('[data-yz="tip"]');
  if (!el) return;
  el.classList.add("celebrate");
  setTimeout(() => { const e = q('[data-yz="tip"]'); if (e) e.classList.remove("celebrate"); }, 1100);
}

function ensureStructure() {
  if (q(".diceArea") && builtKey === localKey) return;
  builtKey = localKey;
  ctx.host.innerHTML = `<div class="yz-root">
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
  q('[data-yz="dismiss"]').addEventListener("click", () => q('[data-yz="end"]').classList.add("hidden"));
  q('[data-yz="tip"]').addEventListener("click", () => {
    if (newsMsg) return;
    const n = localHints().length;
    if (n <= 1) return;
    tipIndex = (tipIndex + 1) % n;
    renderTip();
  });
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
  const games = (ctx.game && ctx.game.series_games) || SERIES_GAMES;
  const seriesComplete = ctx.game && ctx.game.status === "complete";
  const rows = (ctx.game.players || []).map((seat) => {
    const me = seat.mark === myMark;
    const card = localGame.players[0];
    const round = me ? CATEGORIES.filter((c) => card.scores[c.key] != null).length : (seat.round || 0);
    const roundScore = me ? grandTotal(card) : (seat.round_score || 0);
    const overall = me ? seriesPast + grandTotal(card) : (seat.overall || 0);
    const g = me ? gameIndex : (seat.game_index || gameIndex);
    const complete = seat.finish_state === "complete";
    const waiting = me ? (localGame.over && !seriesComplete) : seat.finish_state === "waiting";
    return { name: seat.name, isBot: seat.is_bot, mark: seat.mark, me, round, roundScore, overall, g, complete, waiting };
  }).sort((a, b) => b.overall - a.overall);
  q(".board").innerHTML =
    `<table class="lbtable"><thead><tr><th>Player</th><th class="r">Round#</th><th class="r">Round</th><th class="r">Game</th><th class="s">Overall</th></tr></thead><tbody>${
      rows.map((p) => `<tr class="${p.me ? "me" : ""}"><td>${seatIcon(p.mark)} ${ctx.escapeHtml(p.name)}${p.isBot ? " 🤖" : ""}</td>` +
        `<td class="r">${p.complete ? "✅" : (p.waiting ? "⏳" : p.round + "/" + ROUNDS)}</td>` +
        `<td class="r">${p.roundScore}</td>` +
        `<td class="r">${p.g}/${games}</td>` +
        `<td class="s">${p.overall}</td></tr>`).join("")
    }</tbody></table>`;
}

// Cross-player news: when another seat advances a game or finishes its series,
// post it over the tip strip (the "global news" tier the local tips defer to).
function newsFromSnapshot() {
  const myMark = localMark();
  const gi = (ctx.game && ctx.game.game_index) || gameIndex;
  for (const seat of (ctx.game.players || [])) {
    if (seat.mark === myMark) continue;
    const prev = lastSeen[seat.mark];
    if (prev) {
      if (seat.finish_state === "complete" && prev !== "complete") {
        pushNews(`🏁 ${seat.name} finished the series — ${seat.overall} total!`, 3500);
      } else if (seat.finish_state === "waiting" && prev === "playing") {
        pushNews(`✅ ${seat.name} finished game ${gi} — waiting on the table.`, 3000);
      }
    }
    lastSeen[seat.mark] = seat.finish_state;
  }
}

// --- tips ------------------------------------------------------------------
function localHints() {
  if (!localGame) return ["Loading…"];
  if (localGame.over) return [`✓ Game ${gameIndex} done — waiting for the table to finish.`];
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
  playClick();
  render();
}
async function doRoll() {
  if (localGame.over || localGame.rollsLeft <= 0 || rolling || busy) return;
  const rerolling = localGame.dice.map((_, i) => !(localGame.rolled && localGame.held[i]));
  applyAction(localGame, { type: "ROLL", held: localGame.held });   // local roll — never posted
  playDiceRoll();
  rolling = true;
  render();
  qa(".die").forEach((el, i) => { if (rerolling[i]) el.classList.add("rolling"); });
  await new Promise((r) => setTimeout(r, 430));
  rolling = false;
  render();
  if (isYahtzee(localGame.dice)) { playWin(); pushNews("⭐ You rolled a YAHTZEE!"); }
}
async function scoreCategory(key) {
  if (localGame.over || !localGame.rolled || rolling || busy) return;
  const card = localGame.players[localGame.current];
  if (card.scores[key] != null) return;
  busy = true;
  if (previewScores(localGame)[key] > 0) playScorePick(); else playCancel();
  const mask = scoringDice(key, localGame.dice);
  qa(".die").forEach((el, i) => { el.classList.remove("held", "rolling"); el.classList.add(mask[i] ? "score" : "noscore"); });
  await new Promise((r) => setTimeout(r, 850));
  busy = false;
  const bonusBefore = card.yahtzeeBonus;
  applyAction(localGame, { type: "SCORE", category: key });   // local commit (sets over when the card fills)
  const value = card.scores[key];
  const yahtzeeBonus = card.yahtzeeBonus - bonusBefore;
  render();   // a filled card shows the waiting state; the server advances the whole table
  await ctx.makeMove({ type: "SCORE", category: key, value, yahtzee_bonus: yahtzeeBonus });   // post to the table
}
function showEnd() {
  if (shownEnd) return;
  shownEnd = true;
  playWin();
  const seat = mySeat();
  const total = seat ? seat.overall : seriesPast + grandTotal(localGame.players[0]);
  q('[data-yz="endTitle"]').textContent = "Series complete! 🎲";
  q('[data-yz="finalScore"]').textContent = total;
  q('[data-yz="commLine"]').textContent = `✓ ${SERIES_GAMES} games · ${total} total.`;
  pushNews(`🏁 Series complete: ${total}!`, 6000);
  q('[data-yz="end"]').classList.remove("hidden");
}

// --- scoped styles (the standalone CSS, prefixed under .yz-root) ------------
function injectStyles() {
  if (document.getElementById("yz-styles")) return;
  const s = document.createElement("style"); s.id = "yz-styles";
  s.textContent = `
  /* neutralize the tic-tac-toe macro-board grid + square so the tall Yahtzee UI lays out normally */
  #macroBoard:has(.yz-root){display:block;aspect-ratio:auto;height:auto}
  /* the shell turn-status banner (#turnStatus{display:grid} beats .hidden) would leave a blank band above Yahtzee — collapse it */
  #turnStatus:has(~ #macroBoard .yz-root){display:none}
  /* light mode — matches the shell + 10,000 (white panels, dark text, red accent) */
  .yz-root{grid-column:1/-1;width:100%;display:flex;flex-direction:column;gap:8px;
    --panel:#ffffff;--head:#f6ebeb;--ink:#171717;--muted:#5f5b5b;--line:#e7d4d4;--accent:#d71920;--accentdk:#8f1116;--green:#15803d;color:var(--ink)}
  .yz-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  .yz-root .tipstrip{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:0 14px;font-size:14px;font-weight:600;color:var(--accentdk);height:38px;display:flex;align-items:center;justify-content:center;gap:8px;overflow:hidden;cursor:default}
  .yz-root .tipstrip.tappable{cursor:pointer}
  .yz-root .tipstrip:active.tappable{background:#fbeeee}
  .yz-root .tipstrip.celebrate{background:#15803d;color:#ffffff;border-color:#15803d;font-weight:700;transition:background .15s ease,color .15s ease}
  .yz-root .tipstrip .tiptext{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .yz-root .tipstrip .tipnav{flex:0 0 auto;color:var(--muted);font-size:12px;font-weight:700}
  .yz-root .board{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
  .yz-root .lbtable{width:100%;border-collapse:collapse;font-size:13px}
  .yz-root .lbtable th{padding:7px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);background:var(--head);text-align:left;font-weight:600}
  .yz-root .lbtable th.r,.yz-root .lbtable th.s{text-align:center}
  .yz-root .lbtable td{padding:6px 10px;border-top:1px solid var(--line);white-space:nowrap}
  .yz-root .lbtable td.r,.yz-root .lbtable td.s,.yz-root .lbtable td.g{text-align:center;font-variant-numeric:tabular-nums}
  .yz-root .lbtable td.g{color:var(--ink);font-weight:600}
  .yz-root .lbtable td.s{font-weight:800;color:var(--green);font-size:16px}
  .yz-root .lbtable tr.me{background:rgba(215,25,32,.08)}
  .yz-root .diceArea{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:8px;display:flex;flex-direction:column;gap:8px;align-items:center}
  .yz-root .dice{display:flex;gap:10px;justify-content:center}
  .yz-root .die{width:min(15vw,52px);height:min(15vw,52px);background:#ffffff;border:1px solid #d9c9c9;border-radius:14%;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);padding:9px;gap:3px;cursor:pointer;box-shadow:0 2px 5px rgba(0,0,0,.14);transition:transform .1s ease}
  .yz-root .die .pip{align-self:center;justify-self:center;width:80%;height:80%;border-radius:50%;background:#171717;visibility:hidden}
  .yz-root .die.held{background:#fde68a;border-color:#f59e0b;outline:3px solid #f59e0b;outline-offset:1px}
  .yz-root .die.idle{background:#ece0e0;cursor:default;box-shadow:none}
  .yz-root .die.rolling{animation:yz-tumble .42s ease}
  .yz-root .die.score{background:#bbf7d0;border-color:#15803d;outline:3px solid #15803d;outline-offset:1px}
  .yz-root .die.noscore{background:#ffffff}
  @keyframes yz-tumble{0%{transform:rotate(0) scale(1)}30%{transform:rotate(-14deg) scale(.9)}60%{transform:rotate(12deg) scale(1.05)}100%{transform:rotate(0) scale(1)}}
  .yz-root .rollRow{display:flex;gap:10px;align-items:center;width:100%;justify-content:center}
  .yz-root button.roll{background:#bbf7d0;border:1px solid #86efac;color:#14532d;font-size:15px;padding:10px 22px;border-radius:12px;font-weight:700;cursor:pointer}
  .yz-root button.roll:disabled{background:#fef9c3;border-color:#fde68a;color:#92400e;cursor:not-allowed}
  .yz-root .card{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;align-items:flex-start}
  .yz-root .sec{flex:1 1 0;min-width:0;padding:4px 0}
  .yz-root .sec + .sec{border-left:1px solid var(--line)}
  .yz-root .sechd{display:flex;justify-content:space-between;gap:6px;padding:7px 11px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px;background:var(--head);white-space:nowrap}
  .yz-root .sechd .tag{color:var(--accent);overflow:hidden;text-overflow:ellipsis}
  .yz-root .row{display:flex;justify-content:space-between;align-items:center;padding:6px 11px;border-top:1px solid var(--line);gap:6px}
  .yz-root .row .lbl{font-size:13px;flex:1;min-width:0;display:flex;align-items:baseline;justify-content:space-between;gap:8px}
  .yz-root .row .lbl .cat{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .yz-root .row .lbl .hint{color:var(--muted);font-weight:400;font-size:11px;flex:0 0 auto;white-space:nowrap}
  .yz-root .row .val{font-variant-numeric:tabular-nums;font-weight:700;min-width:32px;text-align:right;flex:0 0 auto}
  .yz-root .row.open{cursor:pointer}
  .yz-root .row.open .val{color:var(--muted);font-weight:600}
  .yz-root .row.open.canscore{background:#fef3c7}
  .yz-root .row.open.canscore .val{color:#b45309}
  .yz-root .row.open.canscore:active{background:#fde68a}
  .yz-root .row.open.zeroplay{background:rgba(0,0,0,.035)}
  .yz-root .row.open.zeroplay .val{color:var(--muted)}
  .yz-root .row.open.zeroplay:active{background:rgba(0,0,0,.07)}
  .yz-root .row.filled .val{color:var(--green)}
  .yz-root .row.filled.zero .val{color:var(--muted)}
  .yz-root .row.blank .lbl,.yz-root .row.blank .val{visibility:hidden}
  .yz-root .row.bonusrow{background:var(--head);cursor:default}
  .yz-root .row.bonusrow .cat .bprog{color:var(--muted);font-weight:400;font-size:12px}
  .yz-root .row.bonusrow .val{color:var(--muted);font-weight:700}
  .yz-root .row.bonusrow .val.earned{color:var(--green)}
  .yz-root .subrow{display:flex;justify-content:space-between;padding:7px 14px;font-size:13px;color:var(--muted);background:var(--head)}
  .yz-root .subrow .v{font-variant-numeric:tabular-nums;color:var(--ink);font-weight:600}
  .yz-root .subrow.grand{align-items:center;padding:9px 14px;border-top:1px solid var(--line)}
  .yz-root .subrow.grand > span:first-child{font-size:13px;color:var(--ink);font-weight:700;letter-spacing:.4px;text-transform:uppercase}
  .yz-root .subrow.grand .v{font-size:27px;line-height:1;color:var(--green);font-weight:800}
  .yz-root .overlay{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(40,20,20,.45)}
  .yz-root .overlay.hidden{display:none}
  .yz-root .sheet{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;width:100%;max-width:420px;box-shadow:0 12px 40px rgba(0,0,0,.25)}
  .yz-root .sheet h2{margin:0 0 14px;font-size:18px;text-align:center}
  .yz-root .center{text-align:center}
  .yz-root .finalscore{font-size:56px;font-weight:800;color:var(--green);line-height:1;margin:16px 0 8px;font-variant-numeric:tabular-nums}
  .yz-root .commline{font-size:13px;color:var(--muted)}
  .yz-root .btn{background:var(--head);color:var(--ink);border:1px solid var(--line);border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}
  `;
  document.head.appendChild(s);
}
