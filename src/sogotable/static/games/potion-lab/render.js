// Potion Lab — in-game UI adapter. Renders the prepared server projection and
// captures intent; it computes NO rule outcomes (legality, scoring, the winner
// all arrive decided from the worker rules module — other players' hands arrive
// already masked to null by the worker's viewer sanitizer, and the deck is a
// count, never a pile). The shell hands the same ctx bag as the other
// host-start games; the pre-game screen is the shared renderHostStartLobby.
// All wiring is addEventListener — no inline onclick, no imports from app.js.
import { renderHostStartLobby } from "../lobby.js";
import { POTION_LAB_CSS } from "./styles.js";

let stylesInjected = false;
// Local draft selection, keyed to the exact barrier so it resets when the pick
// (or round) advances. Not authoritative — the server re-validates on commit.
let selection = { key: "", ids: [], wizard: false };
let lastTap = { id: null, t: 0 };
// Which panels the player has collapsed. Persisted here (not on the DOM) so a
// re-render — e.g. tapping a card — doesn't reopen them.
const collapsed = new Set();

const CARD_META = {
  potion: { emoji: "🧪", name: "Potion" },
  fire: { emoji: "🔥", name: "Fire Essence" },
  frog: { emoji: "🐸", name: "Frog" },
  mushroom: { emoji: "🍄", name: "Mushroom" },
  herb: { emoji: "🌿", name: "Herb" },
  moondust: { emoji: "🌙", name: "Moon Dust" },
  wizard: { emoji: "🧙", name: "Wizard" },
  ice: { emoji: "❄️", name: "Ice Crystal" },
};
const HERB_TIERS = [0, 1, 3, 6, 10, 15];
const COLL_ORDER = ["potion", "fire", "frog", "mushroom", "herb", "moondust", "ice", "wizard"];
const KEY_ORDER = ["herb", "fire", "potion", "mushroom", "frog", "moondust", "ice", "wizard"];
const DECK_SPEC = [
  { type: "frog", count: 14 }, { type: "mushroom", count: 14 }, { type: "herb", count: 14 },
  { type: "moondust", icons: 1, count: 6 }, { type: "moondust", icons: 2, count: 12 }, { type: "moondust", icons: 3, count: 8 },
  { type: "potion", val: 1, count: 5 }, { type: "potion", val: 2, count: 10 }, { type: "potion", val: 3, count: 5 },
  { type: "ice", count: 10 }, { type: "fire", count: 6 }, { type: "wizard", count: 4 },
];

export function renderPotionLabGame(ctx) {
  const { host, game } = ctx;
  if (!host || !game) return;
  if (!stylesInjected) {
    const style = document.createElement("style");
    style.textContent = POTION_LAB_CSS;
    document.head.appendChild(style);
    stylesInjected = true;
  }
  host.className = "macro-board potion-lab-table";
  if (!ctx.started) {
    renderHostStartLobby(host, ctx, {
      wrap: "potion-lab-root",
      heading: "Alchemists",
      blurb: "Everyone drafts at once: keep one ingredient, pass the rest, brew the best shelf over three rounds. Needs 2+ players; invite players or bots, then start.",
    });
    return;
  }
  renderPlay(host, ctx);
}

// ---------- pure display helpers (no rules) ----------
function countType(list, type) { return list.filter((c) => c.type === type).length; }
function potionScore(list) {
  let fires = 0, total = 0;
  for (const c of list) {
    if (c.type === "fire") fires += 1;
    else if (c.type === "potion") { if (fires > 0) { total += c.val * 3; fires -= 1; } else total += c.val; }
  }
  return total;
}
function cardScore(list) {
  return Math.floor(countType(list, "frog") / 3) * 10 + Math.floor(countType(list, "mushroom") / 2) * 5 +
    HERB_TIERS[Math.min(countType(list, "herb"), 5)] + potionScore(list);
}
function moonTotal(list) { return list.reduce((s, c) => s + (c.type === "moondust" ? c.icons : 0), 0); }

function tok(card) {
  if (card.type === "potion") return `<span class="pl-tok pl-moontok">${"<i>🧪</i>".repeat(card.val)}</span>`;
  return `<span class="pl-tok">${CARD_META[card.type].emoji}</span>`;
}
function renderTypeGroup(type, items) {
  const size = type === "frog" ? 3 : type === "mushroom" ? 2 : 0;
  if (!size) return items.map(tok).join("");
  let out = "";
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const complete = chunk.length === size;
    const inner = chunk.map((c) => `<span class="pl-gi">${CARD_META[c.type].emoji}</span>`).join("");
    out += `<span class="pl-group${complete ? "" : " pl-partial"}">${inner}</span>`;
  }
  return out;
}
function renderFirePotions(coll) {
  const seq = coll.filter((c) => c.type === "fire" || c.type === "potion");
  if (!seq.length) return "";
  let pending = 0; const out = [];
  for (const c of seq) {
    if (c.type === "fire") { pending += 1; continue; }
    if (pending > 0) { pending -= 1; out.push(`<span class="pl-group pl-firegroup"><span class="pl-gi">🔥</span>${"<span class=\"pl-gi\">🧪</span>".repeat(c.val)}</span>`); }
    else out.push(tok(c));
  }
  for (let i = 0; i < pending; i += 1) out.push(`<span class="pl-tok pl-firepartial">🔥</span>`);
  return out.join("");
}
function groupColl(coll) {
  const parts = [];
  for (const t of COLL_ORDER) {
    if (t === "fire" || t === "moondust") continue;
    if (t === "potion") { const fp = renderFirePotions(coll); if (fp) parts.push(fp); continue; }
    const items = coll.filter((c) => c.type === t);
    if (items.length) parts.push(renderTypeGroup(t, items));
  }
  return parts.join(" ") || `<span class="pl-dash">—</span>`;
}
function moonTallyChip(coll) {
  const total = moonTotal(coll);
  return total ? `<span class="pl-tok pl-moontally">🌙 ${total}</span>` : `<span class="pl-dash">—</span>`;
}
function roundCardsHtml(cards) {
  const total = moonTotal(cards);
  return groupColl(cards) + (total ? ` <span class="pl-tok pl-moontally">🌙 ${total}</span>` : "");
}

// ---------- main play render ----------
function renderPlay(host, ctx) {
  const { room, game } = ctx;
  const seats = Array.isArray(game.players) ? game.players : [];
  const localMark = markForPlayer(room, ctx.localPlayerId);
  const me = seats.find((s) => s.mark === localMark) || null;
  const complete = game.status === "complete";
  const key = `${room.code}:${room.game_epoch}:${game.round}:${game.pick}:${game.phase}`;
  if (selection.key !== key) selection = { key, ids: [], wizard: false };

  let body;
  if (complete) body = gameOverHtml(game, room, me);
  else if (game.phase === "review") body = reviewHtml(game, room, me);
  else body = playingHtml(game, room, me);

  host.innerHTML = `<div class="potion-lab-root">
    <p class="pl-round">Round ${game.round} / 3 · Pick ${Math.min(game.pick + 1, game.hand_size)} / ${game.hand_size}${complete ? " · complete" : ""}</p>
    ${standingsHtml(game, room, localMark)}
    ${cauldronsHtml(game, room, localMark)}
    ${scoringKeyHtml(me)}
    ${body}
  </div>`;
  wire(host, ctx, game, me);
}

function standingsHtml(game, room, localMark) {
  const seats = game.players;
  const over = game.status === "complete";
  const liveTotal = (s) => (over ? s.score : s.score + (s.round_estimate || 0));
  const iceVals = seats.map((s) => s.ice);
  const maxIce = Math.max(...iceVals), minIce = Math.min(...iceVals);
  const ranked = seats.slice().sort((a, b) => liveTotal(b) - liveTotal(a));
  const rows = ranked.map((s) => {
    const status = over ? "" : (s.has_committed ? "✅" : "…");
    const iceCls = maxIce !== minIce ? (s.ice === maxIce ? "pl-hi" : s.ice === minIce ? "pl-lo" : "") : "";
    const thisRound = over ? "" : `+${s.round_estimate || 0}`;
    return `<tr class="${s.mark === localMark ? "pl-me" : ""}"><td class="pl-name">${seatEmoji(room, s.mark)} ${esc(seatName(room, s.mark))}</td><td>${status}</td><td>${thisRound}</td><td class="${iceCls}">${s.ice}</td><td class="pl-total">${liveTotal(s)}</td></tr>`;
  }).join("");
  return `<div class="pl-panel${collapsed.has("stand") ? " collapsed" : ""}" data-pl-panel="stand"><h2>Standings</h2>
    <table class="pl-stand"><tr><th>Alchemist</th><th></th><th>This round</th><th>❄️</th><th>Total</th></tr>${rows}</table></div>`;
}

function cauldronsHtml(game, room, localMark) {
  const seats = game.players;
  const n = seats.length;
  const meIdx = Math.max(0, seats.findIndex((s) => s.mark === localMark));
  const centerIdx = Math.floor((n - 1) / 2);
  const order = [];
  for (let k = 0; k < n; k += 1) order.push(seats[(meIdx + (k - centerIdx) + n * 10) % n]);
  const rows = order.map((s) => `
    <div class="pl-seat ${s.mark === localMark ? "pl-me" : ""}">
      <div class="pl-who"><div class="pl-nm">${seatEmoji(room, s.mark)} ${esc(seatName(room, s.mark))}</div>
        <div class="pl-rs">${s.hand_count} in hand${s.wizards ? ` · 🧙×${s.wizards}` : ""}</div></div>
      <div class="pl-coll">${groupColl(s.collected)}</div>
      <div class="pl-mooncol">${moonTallyChip(s.collected)}</div>
      <div class="pl-sc">${s.score}</div>
    </div>`).join("");
  return `<div class="pl-panel${collapsed.has("cauldrons") ? " collapsed" : ""}" data-pl-panel="cauldrons"><h2>Cauldrons</h2><div class="pl-seats">${rows}</div></div>`;
}

function scoringKeyHtml(me) {
  const coll = me ? me.collected : [];
  const tally = {
    herb: HERB_TIERS[Math.min(countType(coll, "herb"), 5)],
    fire: "×3", potion: potionScore(coll),
    mushroom: Math.floor(countType(coll, "mushroom") / 2) * 5,
    frog: Math.floor(countType(coll, "frog") / 3) * 10,
    moondust: "🌙" + moonTotal(coll), wizard: "—", ice: "×" + countType(coll, "ice"),
  };
  const rows = KEY_ORDER.map((t) => {
    const k = KEY[t];
    return `<tr data-pl-help="${t}"><td class="pl-em">${CARD_META[t].emoji.repeat(k.need)}</td><td class="pl-kn">${CARD_META[t].name}</td><td class="pl-kd">${k.desc}</td><td class="pl-mine">${tally[t]}</td></tr>`;
  }).join("");
  return `<div class="pl-panel${collapsed.has("key") ? " collapsed" : ""}" data-pl-panel="key"><h2>How cards score <span>(tap a row for details)</span></h2>
    <table class="pl-key"><tr><th></th><th>Ingredient</th><th>How it scores</th><th class="pl-r">You</th></tr>${rows}</table></div>`;
}

function playingHtml(game, room, me) {
  if (!me) return `<div class="pl-panel"><p class="pl-wait">Spectating — the alchemists are drafting.</p></div>`;
  if (me.has_committed) {
    const waiting = game.players.filter((s) => !s.is_bot && !s.has_committed).length;
    return `<div class="pl-panel"><p class="pl-wait">Ingredient kept. Waiting for ${waiting} alchemist${waiting === 1 ? "" : "s"} to pick…</p></div>`;
  }
  const hand = Array.isArray(me.hand) ? me.hand : [];
  const need = requiredPick(me);
  const cards = hand.map((c) => {
    const sel = selection.ids.includes(c.id) ? " pl-sel" : "";
    return `<div class="pl-card${sel}" data-pl-card="${c.id}">${cardFace(c)}<span class="pl-cn">${CARD_META[c.type].name}</span></div>`;
  }).join("");
  const canWizard = me.wizards > 0 && hand.length >= 2;
  return `<div class="pl-panel">
    <div class="pl-hand">${cards}</div>
    <div class="pl-controls">
      ${canWizard ? `<label class="pl-wiz"><input type="checkbox" data-pl-wiz ${selection.wizard ? "checked" : ""}> 🧙 Cast Wizard — draft 2</label>` : ""}
      <button class="pl-commit" data-pl-commit ${selection.ids.length === need ? "" : "disabled"}>${selection.wizard && canWizard ? "Commit 2 🧙" : "Commit"}</button>
    </div>
    <p class="pl-hint">${selection.wizard && canWizard ? `Pick 2 ingredients (${selection.ids.length}/2), then Commit.` : "Tap to keep · double-tap to keep + commit."}</p>
  </div>`;
}

function cardFace(c) {
  if (c.type === "moondust" || c.type === "potion") {
    const stack = c.type === "moondust" ? c.icons : c.val;
    const em = CARD_META[c.type].emoji;
    const rows = stack >= 3
      ? `<span class="pl-mrow"><i>${em}</i></span><span class="pl-mrow"><i>${em}</i><i>${em}</i></span>`
      : `<span class="pl-mrow">${("<i>" + em + "</i>").repeat(stack)}</span>`;
    return `<span class="pl-face pl-moons pl-m${stack}">${rows}</span>`;
  }
  return `<span class="pl-face">${CARD_META[c.type].emoji}</span>`;
}

function reviewHtml(game, room, me) {
  const finished = game.round;
  const rs = me && me.round_scores.find((r) => r.round === finished);
  const cauldron = rs ? `<div class="pl-gr"><div class="pl-grl">Your cauldron <b>+${rs.total}</b></div><div class="pl-grc">${roundCardsHtml(rs.cards)}</div></div>` : "";
  const ready = me && me.ready_next;
  const waiting = game.players.filter((s) => !s.is_bot && !s.ready_next).length;
  return `<div class="pl-panel"><h3 class="pl-h">Round ${finished} brewed 🧪</h3>
    ${cauldron}
    ${breakdownTable(game, room, finished, me ? me.mark : null)}
    ${ready
      ? `<p class="pl-wait">Ready — waiting for ${waiting} alchemist${waiting === 1 ? "" : "s"}…</p>`
      : `<button class="pl-commit pl-ready" data-pl-ready>Round ${finished + 1} →</button>`}
  </div>`;
}

function gameOverHtml(game, room, me) {
  const win = game.winner;
  const rounds = me ? me.round_scores.map((rs) => `
    <div class="pl-gr"><div class="pl-grl">Round ${rs.round} <b>+${rs.total}</b></div><div class="pl-grc">${roundCardsHtml(rs.cards)}</div></div>`).join("") : "";
  const iceLine = me ? `<div class="pl-gr"><div class="pl-grl">❄️ Ice <b>${me.ice_score >= 0 ? "+" : ""}${me.ice_score}</b></div><div class="pl-grc">${me.ice ? "❄️".repeat(me.ice) : "—"} <span class="pl-dash">most +6 · least −6</span></div></div>` : "";
  return `<div class="pl-panel"><h3 class="pl-h">${win === (me && me.mark) ? "You win! 🏆" : esc(seatName(room, win)) + " wins 🏆"}</h3>
    ${me ? `<p class="pl-round">How your ${me.score} points add up:</p>${rounds}${iceLine}<div class="pl-grtot">Total <b>${me.score}</b></div>` : ""}
    <p class="pl-round" style="margin-top:16px">Final standings</p>
    ${finalTable(game, room, me)}
  </div>`;
}

function breakdownTable(game, room, finished, localMark) {
  const rows = game.players.slice().sort((a, b) => b.score - a.score).map((s) => {
    const rs = s.round_scores.find((r) => r.round === finished) || { herb: 0, potion: 0, mushroom: 0, frog: 0, moondust: 0, total: 0 };
    return `<tr class="${s.mark === localMark ? "pl-me" : ""}"><td class="pl-n">${seatEmoji(room, s.mark)} ${esc(seatName(room, s.mark))}</td><td>${rs.herb}</td><td>${rs.potion}</td><td>${rs.mushroom}</td><td>${rs.frog}</td><td>${rs.moondust}</td><td>+${rs.total}</td><td>${s.score}</td></tr>`;
  }).join("");
  return `<table class="pl-bd"><tr><th>Alchemist</th><th>🌿</th><th>🧪</th><th>🍄</th><th>🐸</th><th>🌙</th><th>Round</th><th>Total</th></tr>${rows}</table>`;
}

function finalTable(game, room, me) {
  const results = Array.isArray(game.results) ? game.results : [];
  const rows = results.map((r) => {
    const win = r.mark === game.winner;
    return `<tr class="${win ? "pl-win" : ""}${me && r.mark === me.mark ? " pl-me" : ""}"><td class="pl-n">${seatEmoji(room, r.mark)} ${esc(seatName(room, r.mark))}${win ? " 👑" : ""}</td><td>${r.ice} ❄️</td><td>${r.ice_score >= 0 ? "+" : ""}${r.ice_score}</td><td>${r.score}</td></tr>`;
  }).join("");
  return `<table class="pl-bd"><tr><th>Alchemist</th><th>Ice</th><th>Ice pts</th><th>Total</th></tr>${rows}</table>`;
}

// ---------- wiring ----------
function requiredPick(me) {
  return selection.wizard && me.wizards > 0 && (me.hand || []).length >= 2 ? 2 : 1;
}
function wire(host, ctx, game, me) {
  const root = host.querySelector(".potion-lab-root");
  if (!root) return;
  // collapse panels — persist the state so a re-render (e.g. a card tap) keeps it
  root.querySelectorAll(".pl-panel[data-pl-panel] > h2").forEach((h) => {
    h.addEventListener("click", () => {
      const panel = h.parentElement;
      const isCollapsed = panel.classList.toggle("collapsed");
      if (isCollapsed) collapsed.add(panel.dataset.plPanel); else collapsed.delete(panel.dataset.plPanel);
    });
  });
  // scoring detail popups
  const keyTable = root.querySelector(".pl-key");
  if (keyTable) keyTable.addEventListener("click", (e) => {
    const rowEl = e.target.closest("tr");
    if (rowEl && rowEl.dataset.plHelp) { e.stopPropagation(); showHelp(root, rowEl.dataset.plHelp, game); }
  });
  if (!me || game.status === "complete") return;

  if (game.phase === "review") {
    const readyBtn = root.querySelector("[data-pl-ready]");
    if (readyBtn) readyBtn.addEventListener("click", () => { readyBtn.disabled = true; ctx.makeMove({ type: "READY_NEXT", round: game.round }); });
    return;
  }
  if (me.has_committed) return;
  const need = requiredPick(me);
  const doCommit = () => {
    if (selection.ids.length !== need) return;
    ctx.makeMove({ type: "COMMIT_PICK", round: game.round, pick: game.pick, cards: selection.ids.slice(), useWizard: selection.wizard && need === 2 });
  };
  const hand = root.querySelector(".pl-hand");
  if (hand) hand.addEventListener("click", (e) => {
    const el = e.target.closest("[data-pl-card]");
    if (!el) return;
    const id = el.dataset.plCard;
    const now = (window.performance && performance.now) ? performance.now() : Date.now();
    if (need === 1 && lastTap.id === id && now - lastTap.t < 320) {
      lastTap = { id: null, t: 0 }; selection.ids = [id]; doCommit(); return;
    }
    lastTap = { id, t: now };
    const i = selection.ids.indexOf(id);
    if (i >= 0) selection.ids.splice(i, 1);
    else { if (selection.ids.length >= need) { if (need === 1) selection.ids = []; else return; } selection.ids.push(id); }
    renderPlay(host, ctx);
  });
  const wiz = root.querySelector("[data-pl-wiz]");
  if (wiz) wiz.addEventListener("change", (e) => {
    selection.wizard = e.target.checked;
    if (!selection.wizard && selection.ids.length > 1) selection.ids = selection.ids.slice(0, 1);
    renderPlay(host, ctx);
  });
  const commitBtn = root.querySelector("[data-pl-commit]");
  if (commitBtn) commitBtn.addEventListener("click", doCommit);
}

// ---------- help popup (transient DOM, dismiss on any tap/key) ----------
function showHelp(root, type, game) {
  closeHelp(root);
  const k = KEY[type];
  const overlay = document.createElement("div");
  overlay.className = "pl-overlay";
  overlay.innerHTML = `<div class="pl-modal"><div class="pl-detail"><div class="pl-big">${CARD_META[type].emoji.repeat(k.need)}</div>
    <h3>${CARD_META[type].name}</h3>${k.detail}${deckFooter(type, game)}
    <div class="pl-center"><button class="pl-commit" data-pl-close>Got it</button></div></div></div>`;
  root.appendChild(overlay);
  const close = () => closeHelp(root);
  overlay.querySelector("[data-pl-close]").addEventListener("click", (e) => { e.stopPropagation(); close(); });
  setTimeout(() => {
    const onTap = () => { close(); document.removeEventListener("click", onTap); document.removeEventListener("keydown", onKey); };
    const onKey = () => onTap();
    document.addEventListener("click", onTap);
    document.addEventListener("keydown", onKey);
    overlay.__cleanup = onTap;
  }, 0);
}
function closeHelp(root) {
  const existing = root.querySelector(".pl-overlay");
  if (existing) { if (existing.__cleanup) document.removeEventListener("click", existing.__cleanup); existing.remove(); }
}
function deckFooter(type, game) {
  const n = (game.players || []).length || 2;
  const handSize = Math.max(5, Math.min(10, 12 - n));
  const scale = (handSize * n * 3) / 108;
  const cnt = (spec) => Math.max(1, Math.round(spec.count * scale));
  if (type === "potion") {
    const rows = [1, 2, 3].map((v) => `<tr><td><span class="pl-potcard">${"🧪".repeat(v)}</span></td><td class="pl-r"><b>${cnt(DECK_SPEC.find((s) => s.type === "potion" && s.val === v))}</b></td></tr>`).join("");
    return `<p class="pl-deckcount"><b>In this game's deck</b></p><table class="pl-mini"><tr><th>Potion</th><th class="pl-r">Cards</th></tr>${rows}</table>`;
  }
  if (type === "moondust") {
    const rows = [1, 2, 3].map((v) => `<tr><td>${"🌙".repeat(v)}</td><td class="pl-r"><b>${cnt(DECK_SPEC.find((s) => s.type === "moondust" && s.icons === v))}</b></td></tr>`).join("");
    return `<p class="pl-deckcount"><b>In this game's deck</b></p><table class="pl-mini"><tr><th>Moon Dust</th><th class="pl-r">Cards</th></tr>${rows}</table>`;
  }
  const total = DECK_SPEC.filter((s) => s.type === type).reduce((sum, s) => sum + cnt(s), 0);
  return `<p class="pl-deckcount">${CARD_META[type].emoji} <b>${total}</b> ${CARD_META[type].name} card${total === 1 ? "" : "s"} in this game's deck</p>`;
}

// ---------- scoring reference copy ----------
const KEY = {
  potion: { need: 1, desc: "worth 1 / 2 / 3", detail:
    `<p>A finished potion — the more 🧪, the more points. Scores on its own. A 🔥 <b>Fire Essence</b> collected just <i>before</i> it triples the value:</p>
     <table class="pl-mini"><tr><th>Potion</th><th class="pl-r">Points</th><th class="pl-r">🔥 ×3</th></tr>
     <tr><td><span class="pl-potcard">🧪</span></td><td class="pl-r"><b>1</b></td><td class="pl-r"><b>3</b></td></tr>
     <tr><td><span class="pl-potcard">🧪🧪</span></td><td class="pl-r"><b>2</b></td><td class="pl-r"><b>6</b></td></tr>
     <tr><td><span class="pl-potcard">🧪🧪🧪</span></td><td class="pl-r"><b>3</b></td><td class="pl-r"><b>9</b></td></tr></table>
     <p class="pl-ctr">Collect the 🔥 <i>before</i> the potion — order matters.</p>` },
  fire: { need: 1, desc: "triples the next potion", detail:
    `<p>Worth nothing alone — it triples the <b>next Potion</b> collected after it. A grouped pill = scored together.</p>
     <table class="pl-mini"><tr><th>You collect</th><th class="pl-r">Scores</th></tr>
     <tr><td><span class="pl-tok pl-firepartial">🔥</span></td><td class="pl-r"><b>0</b></td></tr>
     <tr><td><span class="pl-group pl-firegroup"><span class="pl-gi">🔥</span><span class="pl-gi">🧪</span><span class="pl-gi">🧪</span><span class="pl-gi">🧪</span></span></td><td class="pl-r"><b>9</b></td></tr>
     <tr><td><span class="pl-group pl-firegroup"><span class="pl-gi">🔥</span><span class="pl-gi">🧪</span><span class="pl-gi">🧪</span></span> <span class="pl-tok pl-moontok"><i>🧪</i><i>🧪</i></span></td><td class="pl-r"><b>8</b></td></tr></table>
     <p class="pl-ctr">Each 🔥 boosts just <b>one</b> potion card. Want two? Collect two 🔥.</p>` },
  frog: { need: 3, desc: "every 3 = +10", detail:
    `<p>Complete a set of <b>3</b> (in brackets) to brew a Grand Potion. Fewer than 3 score nothing.</p>
     <table class="pl-mini"><tr><th>Frogs</th><th class="pl-r">Scores</th></tr>
     <tr><td>🐸🐸</td><td class="pl-r"><b>0</b></td></tr><tr><td>(🐸🐸🐸)</td><td class="pl-r"><b>10</b></td></tr>
     <tr><td>(🐸🐸🐸)(🐸🐸🐸)</td><td class="pl-r"><b>20</b></td></tr></table>` },
  mushroom: { need: 2, desc: "every pair = +5", detail:
    `<p>Every <b>pair</b> (in brackets) scores. A lone mushroom scores nothing.</p>
     <table class="pl-mini"><tr><th>Mushrooms</th><th class="pl-r">Scores</th></tr>
     <tr><td>🍄</td><td class="pl-r"><b>0</b></td></tr><tr><td>(🍄🍄)</td><td class="pl-r"><b>5</b></td></tr>
     <tr><td>(🍄🍄)(🍄🍄)🍄</td><td class="pl-r"><b>10</b></td></tr></table>` },
  herb: { need: 1, desc: "1/2/3/4/5 → 1/3/6/10/15", detail:
    `<p>The more you hoard, the better — then it <b>caps at 5</b>.</p>
     <table class="pl-mini"><tr><th>Herbs</th><th class="pl-r">Scores</th></tr>
     <tr><td>🌿</td><td class="pl-r"><b>1</b></td></tr><tr><td>🌿🌿</td><td class="pl-r"><b>3</b></td></tr>
     <tr><td>🌿🌿🌿</td><td class="pl-r"><b>6</b></td></tr><tr><td>🌿🌿🌿🌿</td><td class="pl-r"><b>10</b></td></tr>
     <tr><td>🌿🌿🌿🌿🌿+</td><td class="pl-r"><b>15</b></td></tr></table>` },
  moondust: { need: 1, desc: "round end: 1st +6, 2nd +3", detail:
    `<p>Majority at the end of each round — count up <b>all your 🌙</b> across every card you kept. Ties split the points.</p>
     <table class="pl-mini"><tr><th>Place</th><th class="pl-r">Scores</th></tr>
     <tr><td>Most 🌙</td><td class="pl-r"><b>+6</b></td></tr><tr><td>2nd most</td><td class="pl-r"><b>+3</b></td></tr></table>` },
  wizard: { need: 1, desc: "later turn: draft 2 at once", detail:
    `<p>The Wizard is a <b>power, not points</b>. Once you keep it, it sits <b>face-up</b> in your cauldron.</p>
     <p><b>What to do with it:</b></p>
     <ol><li>Draft a 🧙 like any card — it waits in your cauldron.</li>
     <li>On a <b>later</b> pick, tick <b>“Cast Wizard”</b>, tap <b>two</b> cards, then Commit — you keep both.</li></ol>
     <p>Each Wizard casts once and scores <b>0</b>, so it never shows in the score standings.</p>` },
  ice: { need: 1, desc: "game end: most +6, least −6", detail:
    `<p>Scored once, at the <b>end of the game</b> (all 3 rounds). Ties split; with 2 players there's no −6.</p>
     <table class="pl-mini"><tr><th>Place</th><th class="pl-r">Scores</th></tr>
     <tr><td>Most ❄️</td><td class="pl-r"><b>+6</b></td></tr><tr><td>Fewest ❄️</td><td class="pl-r"><b>−6</b></td></tr></table>` },
};

// ---------- room helpers ----------
function markForPlayer(room, playerId) {
  const seat = (room.players || []).find((p) => p.id === playerId);
  return seat ? seat.mark : null;
}
function seatEmoji(room, mark) {
  const seat = (room.players || []).find((p) => p.mark === mark);
  return seat && seat.icon ? seat.icon : "🙂";
}
function seatName(room, mark) {
  const seat = (room.players || []).find((p) => p.mark === mark);
  return seat ? seat.name : mark;
}
function esc(v) {
  return String(v || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
