// Yahtzee — Game-Locked client renderer.
//
// Each player runs their OWN game locally (rolls, holds, scoring all on-device,
// local-first) and POSTS each committed category score to the server via
// ctx.makeMove({type:"SCORE", category, value, yahtzee_bonus}). The bottom board
// reads the LIVE leaderboard from the room snapshot (ctx.game.players). Rolls and
// holds never leave the client. On reconnect the committed scorecard is rebuilt
// from the server seat; the in-progress roll is lost (the cost of local-first).
import {
  UPPER, LOWER, CATEGORIES, CATEGORY_KEYS, MAX_ROLLS,
  newGame, applyAction, previewScores, scoringDice, isJoker, isYahtzee,
  upperSubtotal, upperBonus, grandTotal, isCardComplete,
  UPPER_BONUS_THRESHOLD, UPPER_BONUS,
} from "./rules.js";

const PIP_MAP = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const FIXED_HAND = { fullHouse: 25, smallStraight: 30, largeStraight: 40, yahtzee: 50 };

// Module-private local game (this device's player). Persists across snapshots.
let localGame = null;
let localKey = "";          // room.code:game_epoch — re-init the local game on reset
let rolling = false;
let busy = false;
let ctx = null;             // latest ctx, so dice/score handlers can post

export function renderYahtzeeGame(controllerCtx) {
  ctx = controllerCtx;
  injectStyles();
  if (!ctx.started) { renderLobby(); return; }
  ensureLocalGame();
  renderPlay();
}

// --- local game lifecycle --------------------------------------------------
function mySeat() {
  return (ctx.game.players || []).find((s) => s.mark === localMark());
}
function localMark() {
  const seat = (ctx.room.players || []).find((p) => p.id === ctx.localPlayerId);
  return seat ? seat.mark : null;
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

// --- lobby (before host start) ---------------------------------------------
function renderLobby() {
  const host = ctx.host;
  const seats = (ctx.room.players || []).map((p) =>
    `<div class="yz-seat">${ctx.escapeHtml(p.name)}${p.kind === "bot" ? " 🤖" : ""}</div>`).join("");
  const controls = ctx.isHost
    ? `<button class="yz-btn" id="yzStart">Start game</button>
       <button class="yz-btn ghost" id="yzInvite">Invite player</button>
       <button class="yz-btn ghost" id="yzBot">Add bot</button>`
    : `<div class="yz-wait">Waiting for the host to start…</div>`;
  host.innerHTML = `<div class="yz"><div class="yz-lobby">
    <div class="yz-h">Yahtzee — everyone plays their own game</div>
    <div class="yz-seats">${seats}</div>
    <div class="yz-controls">${controls}</div></div></div>`;
  if (ctx.isHost) {
    host.querySelector("#yzStart").addEventListener("click", () => ctx.startGame());
    host.querySelector("#yzInvite").addEventListener("click", () => ctx.invitePlayer());
    host.querySelector("#yzBot").addEventListener("click", () => ctx.addBot());
  }
}

// --- play (own game + live leaderboard) ------------------------------------
function renderPlay() {
  const g = localGame;
  const card = g.players[0];
  const preview = previewScores(g);
  ctx.host.innerHTML = `<div class="yz">
    <div class="yz-tip" id="yzTip"></div>
    <div class="yz-dicearea"><div class="yz-dice" id="yzDice"></div>
      <button class="yz-roll" id="yzRoll"></button></div>
    <div class="yz-card"><div class="yz-sec" id="yzFaces"></div><div class="yz-sec" id="yzHands"></div></div>
    <div class="yz-board" id="yzBoard"></div></div>`;
  renderDice();
  renderColumn("yzFaces", "Faces", UPPER, card, preview);
  renderColumn("yzHands", "Hands", LOWER, card, preview);
  renderBoard();
  document.getElementById("yzRoll").addEventListener("click", doRoll);
  updateTip();
}

function renderDice() {
  const host = document.getElementById("yzDice");
  const g = localGame;
  host.innerHTML = "";
  g.dice.forEach((v, i) => {
    const el = document.createElement("div");
    el.className = "yz-die" + (!g.rolled && !rolling ? " idle" : "") + (g.rolled && g.held[i] && g.rollsLeft > 0 ? " held" : "");
    const pips = (g.rolled || rolling) ? (PIP_MAP[v] || []) : [];
    for (let c = 0; c < 9; c++) { const p = document.createElement("span"); p.className = "yz-pip"; if (pips.includes(c)) p.style.visibility = "visible"; el.appendChild(p); }
    el.addEventListener("click", () => toggleHold(i));
    host.appendChild(el);
  });
  const roll = document.getElementById("yzRoll");
  roll.textContent = g.over ? "Done" : g.rollsLeft === MAX_ROLLS ? "Roll" : `Roll (${g.rollsLeft} left)`;
  roll.disabled = g.over || g.rollsLeft <= 0 || rolling || busy;
}

function renderColumn(id, title, cats, card, preview) {
  const host = document.getElementById(id);
  host.innerHTML = `<div class="yz-sechd">${title}</div>`;
  cats.forEach((cat) => host.appendChild(scoreRow(cat, card, preview)));
  if (id === "yzFaces") {
    const sub = upperSubtotal(card.scores); const reached = upperBonus(card.scores) > 0;
    const b = document.createElement("div"); b.className = "yz-row bonus";
    b.innerHTML = `<span class="yz-lbl"><span class="yz-cat">Bonus <span class="yz-bp">${sub}/${UPPER_BONUS_THRESHOLD}${reached ? " ✓" : ""}</span></span><span class="yz-hint">( ${UPPER_BONUS} )</span></span><span class="yz-val${reached ? " earned" : ""}">${reached ? UPPER_BONUS : "–"}</span>`;
    host.appendChild(b);
  } else {
    const t = document.createElement("div"); t.className = "yz-row total";
    t.innerHTML = `<span class="yz-lbl"><span class="yz-cat">TOTAL</span></span><span class="yz-val big">${grandTotal(card)}</span>`;
    host.appendChild(t);
  }
}

function scoreRow(cat, card, preview) {
  const g = localGame;
  const filled = card.scores[cat.key] != null;
  const el = document.createElement("div");
  el.className = "yz-row " + (filled ? (card.scores[cat.key] === 0 ? "filled zero" : "filled") : "open");
  if (g.rolled && filled) el.classList.add("blank");
  const can = !filled && g.rolled && !rolling && !busy;
  if (can) el.classList.add(preview[cat.key] > 0 ? "canscore" : "zeroplay");
  const tag = cat.face ? `∑ ${cat.face}'s` : (FIXED_HAND[cat.key] != null ? String(FIXED_HAND[cat.key]) : "∑ All Dice");
  const val = filled ? String(card.scores[cat.key]) : (g.rolled && !rolling ? String(preview[cat.key]) : "–");
  el.innerHTML = `<span class="yz-lbl"><span class="yz-cat">${cat.label}</span><span class="yz-hint">( ${tag} )</span></span><span class="yz-val">${val}</span>`;
  if (!filled) el.addEventListener("click", () => scoreCategory(cat.key));
  return el;
}

function renderBoard() {
  const rows = (ctx.game.players || []).slice().sort((a, b) => b.score - a.score).map((p) => {
    const done = p.finish_state === "complete";
    const me = p.mark === localMark();
    return `<tr class="${me ? "me" : ""}"><td>${ctx.escapeHtml(p.name)}${p.is_bot ? " 🤖" : ""}</td>` +
      `<td>${done ? "✅ done" : "🎲 play"}</td><td class="r">${p.round}/${CATEGORY_KEYS.length}</td><td class="s">${p.score}</td></tr>`;
  }).join("");
  document.getElementById("yzBoard").innerHTML =
    `<table class="yz-lb"><thead><tr><th>Player</th><th>Status</th><th class="r">Round</th><th class="s">Score</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// --- interactions (local; only SCORE is posted) ----------------------------
function toggleHold(i) {
  const g = localGame;
  if (!g.rolled || g.rollsLeft <= 0 || rolling || busy || g.over) return;
  g.held[i] = !g.held[i];
  renderDice();
}
async function doRoll() {
  const g = localGame;
  if (g.over || g.rollsLeft <= 0 || rolling || busy) return;
  applyAction(g, { type: "ROLL", held: g.held });   // local roll — not posted
  rolling = true; renderDice(); updateTip();
  await new Promise((r) => setTimeout(r, 350));
  rolling = false; renderPlay();
}
async function scoreCategory(key) {
  const g = localGame;
  if (g.over || !g.rolled || rolling || busy) return;
  if (g.players[0].scores[key] != null) return;
  busy = true;
  const joker = isJoker(g.dice, g.players[0]);
  const before = grandTotal(g.players[0]);
  const bonusBefore = g.players[0].yahtzeeBonus;
  applyAction(g, { type: "SCORE", category: key });   // local commit
  const value = g.players[0].scores[key];
  const yahtzeeBonus = g.players[0].yahtzeeBonus - bonusBefore;
  renderPlay();
  // POST the committed score to the server (the only thing that leaves the client)
  await ctx.makeMove({ type: "SCORE", category: key, value, yahtzee_bonus: yahtzeeBonus });
  busy = false;
}

function updateTip() {
  const el = document.getElementById("yzTip"); if (!el) return;
  const g = localGame;
  if (g.over) { el.textContent = "🎲 Game complete — your score is posted."; return; }
  if (rolling) { el.textContent = "🎲 Rolling…"; return; }
  if (!g.rolled) { el.textContent = "🎲 Tap Roll to play your turn."; return; }
  el.textContent = g.rollsLeft > 0 ? "Hold dice & roll, or tap a yellow box to score." : "Last roll — tap a box to score.";
}

// --- scoped styles (injected once) -----------------------------------------
function injectStyles() {
  if (document.getElementById("yz-styles")) return;
  const s = document.createElement("style"); s.id = "yz-styles";
  s.textContent = `
  .yz{display:flex;flex-direction:column;gap:10px;--p:#1a1f2e;--ln:#262c3d;--mut:#8b93a7;--acc:#ffd166;--grn:#5ed18a}
  .yz-tip{background:var(--p);border:1px solid var(--ln);border-radius:12px;height:42px;display:flex;align-items:center;justify-content:center;
    font-size:14px;font-weight:600;color:var(--acc);padding:0 12px;text-align:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  .yz-dicearea{background:var(--p);border:1px solid var(--ln);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px;align-items:center}
  .yz-dice{display:flex;gap:10px}
  .yz-die{width:min(16vw,56px);height:min(16vw,56px);background:#f4f6fb;border-radius:14%;display:grid;grid-template-columns:repeat(3,1fr);
    grid-template-rows:repeat(3,1fr);padding:8px;gap:3px;cursor:pointer;box-shadow:0 3px 6px rgba(0,0,0,.4)}
  .yz-die.idle{background:#cfd6e6;cursor:default}
  .yz-die.held{background:#ffe9a8;outline:3px solid var(--acc);outline-offset:1px}
  .yz-pip{align-self:center;justify-self:center;width:80%;height:80%;border-radius:50%;background:#10131c;visibility:hidden}
  .yz-roll{background:#1f7a44;border:1px solid #2ea35e;color:#eafff1;font-size:15px;font-weight:700;border-radius:12px;padding:10px 22px;cursor:pointer}
  .yz-roll:disabled{background:#33415a;border-color:#39425c;color:var(--mut)}
  .yz-card{background:var(--p);border:1px solid var(--ln);border-radius:14px;overflow:hidden;display:flex;align-items:flex-start}
  .yz-sec{flex:1 1 0;min-width:0;padding:4px 0}
  .yz-sec+.yz-sec{border-left:1px solid var(--ln)}
  .yz-sechd{padding:7px 11px;color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.5px;background:#161b29}
  .yz-row{display:flex;justify-content:space-between;align-items:center;padding:8px 11px;border-top:1px solid #20263680;gap:6px}
  .yz-lbl{font-size:13px;flex:1;min-width:0;display:flex;align-items:baseline;justify-content:space-between;gap:8px}
  .yz-cat{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .yz-hint{color:var(--mut);font-weight:400;font-size:11px;flex:0 0 auto;white-space:nowrap}
  .yz-val{font-variant-numeric:tabular-nums;font-weight:700;min-width:32px;text-align:right;flex:0 0 auto}
  .yz-val.big{font-size:27px;color:var(--grn);font-weight:800}
  .yz-row.open .yz-val{color:var(--mut);font-weight:600}
  .yz-row.open.canscore{background:rgba(255,209,102,.18)}
  .yz-row.open.canscore .yz-val{color:var(--acc)}
  .yz-row.open.zeroplay{background:rgba(255,255,255,.05)}
  .yz-row.filled .yz-val{color:var(--grn)}
  .yz-row.filled.zero .yz-val{color:var(--mut)}
  .yz-row.blank .yz-lbl,.yz-row.blank .yz-val{visibility:hidden}
  .yz-row.bonus,.yz-row.total{background:#161b29;cursor:default}
  .yz-row.bonus .yz-bp{color:var(--mut);font-weight:400;font-size:12px}
  .yz-row.bonus .yz-val{color:var(--mut)} .yz-row.bonus .yz-val.earned{color:var(--grn)}
  .yz-board{background:var(--p);border:1px solid var(--ln);border-radius:12px;overflow:hidden}
  .yz-lb{width:100%;border-collapse:collapse;font-size:13px}
  .yz-lb th{padding:7px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--mut);background:#161b29;text-align:left;font-weight:600}
  .yz-lb th.r,.yz-lb th.s{text-align:right}
  .yz-lb td{padding:9px 10px;border-top:1px solid #20263680;white-space:nowrap}
  .yz-lb td.r,.yz-lb td.s{text-align:right;font-variant-numeric:tabular-nums}
  .yz-lb td.s{font-weight:800;color:var(--grn);font-size:16px}
  .yz-lb tr.me{background:rgba(255,209,102,.12)}
  .yz-lobby{background:var(--p);border:1px solid var(--ln);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px}
  .yz-h{font-size:15px;font-weight:700} .yz-seats{display:flex;flex-wrap:wrap;gap:8px}
  .yz-seat{background:#222a3d;border:1px solid var(--ln);border-radius:10px;padding:8px 12px;font-size:14px}
  .yz-controls{display:flex;flex-direction:column;gap:8px} .yz-wait{color:var(--mut);font-size:14px}
  .yz-btn{background:#1f7a44;border:1px solid #2ea35e;color:#eafff1;border-radius:10px;padding:11px;font-weight:700;font-size:14px;cursor:pointer}
  .yz-btn.ghost{background:#2a3146;border-color:#39425c;color:#eef1f8}
  `;
  document.head.appendChild(s);
}
