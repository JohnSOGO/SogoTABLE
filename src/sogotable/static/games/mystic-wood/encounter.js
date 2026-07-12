// The Mystic Wood — the full-screen modal family (presentation only): the start-of-game intro, the
// encounter card, the greet-pick grid, and the dice/result reveal. Each builds a
// `.mw-portal > .overlay > .modal` over the board and wires its buttons to ctx.makeMove. render.js
// decides WHEN to show them (from the ctx.game projection) and imports these builders — a leaf like
// horn.js: it imports content + the shared pure util, never render.js, so there is no import cycle.
// render.js registers its re-render via initEncounter() so a closed result modal can re-surface a
// still-pending encounter without this module importing back into the renderer.
import { DEN, DEN_CLASS, AREA_NAMES, AREA_FX, KNIGHTS, KNIGHT_INTRO } from "./content.js";
import { E, denEmoji, sanitizeLog, tblRows, tileAt, tileSvg } from "./util.js";

// render.js hands us its entry point once at module load; showDice calls it after closePortals so any
// still-pending encounter re-surfaces on the next render. An injected hook (not an import) keeps the
// dependency one-way: render.js -> encounter.js, never back.
let rerender = () => {};
export function initEncounter(fn) { rerender = fn; }
// The face a player just tapped in a combat/escape pick. When the result lands, the TRUE outcome emoji
// morphs onto it for a beat before the result modal (UHKO mrgls3o2 / mrglq3yx) — a die 🎲 is only ever
// shown for a reroll, never a resolution.
let pendingReveal = null;
function resultEmojiForRoll(roll) {
  if (roll.escape) return roll.freed ? "🗝️" : "🔒";     // the Key when you break free, the lock when the bars hold
  if (roll.outcome === "win") return "⚔️✨";
  if (roll.outcome === "lose") return roll.bound ? "🕸️" : "⛓️";   // ensnared (held) vs jailed (Tower) — never a death skull
  if (roll.greet && roll.resultKey) return oddsEmoji(roll.resultKey) || null;   // befriend 🤝, give:potion 🧪, transport 💨 … (mrgsh5me)
  return null;   // joust: no single-face outcome to reveal
}

/* ------------------------------- portal --------------------------------- */
function portal() { const p = document.createElement("div"); p.className = "mystic-wood-root mw-portal"; document.body.appendChild(p); return p; }
export function closePortals() { document.querySelectorAll(".mw-portal").forEach((n) => n.remove()); }
// "Working…" indicator (bug mrh84cjn): a move is a server round-trip that can lag. signalWorking() shows a
// small badge only if the reply hasn't come within ~500ms (so fast moves don't flicker); the next render
// calls clearWorking(). Lives here (render imports it) so both the board and the pick modals can raise it.
let workTimer = null;
function workEl() { return document.querySelector(".mw-working"); }
export function signalWorking() {
  if (workTimer || workEl()) return;
  workTimer = setTimeout(() => {
    workTimer = null;
    if (workEl()) return;
    const w = document.createElement("div"); w.className = "mystic-wood-root mw-working";
    w.innerHTML = `<div class="mw-working-box">⏳ Working…</div>`;
    document.body.appendChild(w);
  }, 500);
}
export function clearWorking() { if (workTimer) { clearTimeout(workTimer); workTimer = null; } const w = workEl(); if (w) w.remove(); }
// The first-sight narrative the server writes for a met card (server-owned prose, no user input) —
// shown on both the encounter card and the pick grid so EVERY card type is met with its own line.
function introHtml(p) { return p && p.intro ? `<p class="mw-enc-intro">${sanitizeLog(p.intro)}</p>` : ""; }
// §9: a second denizen was waiting in this area. The rules make you approach EVERY denizen here before the
// turn ends (and the withdrawal was spent on the first) — but the card just appeared, unannounced, and read
// as a bug ("I get a Merlin card after capturing horse; rules ok?", mrhijjmm). Name the rule on the card.
function secondHtml(p) {
  return p && p.second
    ? `<div class="mw-prompt" style="text-align:center">🃏 A second denizen holds this glade — §9: you must approach them all before your turn ends. No withdrawing now.</div>`
    : "";
}
// A glance-emoji for each pick outcome, so a face's result reads without reading (bug mrghtdqr).
const ODDS_EMOJI = { win: "⚔️✨", lose: "⛓️", tie: "🎲", captured: "🕸️", free: "🔓", held: "🔒",
  remains: "😐", transport: "💨", transportYou: "🌀", befriend: "🤝", tower: "⛓️", run: "🐎💨", catch: "🐎",
  grail: "🏆", flee: "🏃", attack: "⚔️", imprison: "👑⛓️", nothing: "🚫", pray: "🙏" };
const THING_EMOJI = { wand: "🪄", crystal: "💎", key: "🗝️", armour: "🛡️", potion: "🧪", ring: "💍", blessing: "✨", shield: "🛡️", golden_bough: "🌿", lance: "🗡️" };
function oddsEmoji(key) {
  if (ODDS_EMOJI[key]) return ODDS_EMOJI[key];
  if (key && key.startsWith("give:")) return THING_EMOJI[key.slice(5)] || "🎁";
  return "";
}

/* ------------------------------- intro ---------------------------------- */
export function showIntro(ctx, game, me) {
  const seat = game.players.find((p) => p.mark === me); if (!seat) return;
  const k = KNIGHTS[seat.knight] || {}, tale = KNIGHT_INTRO[seat.knight]; if (!tale) return;
  closePortals();
  const host = portal();
  host.innerHTML = `<div class="overlay"><div class="modal mw-intro">
    <div class="tag">A quest entrusted</div>
    <div class="mw-intro-head"><span class="crest" style="background:${E(k.color)}">${E((seat.name || "?")[0])}</span><h2>Sir ${E(k.name)}</h2></div>
    <p class="mw-intro-frame">${E(k.name)} cannot ride today, and entrusts the quest to you:</p>
    <p class="mw-intro-tale">${tale}</p>
    <div class="row"><button class="primary" data-intro="go">Begin the quest</button></div>
  </div></div>`;
  const b = host.querySelector("[data-intro]"); if (b) b.addEventListener("click", () => closePortals());
}

/* ------------------------------ encounter ------------------------------- */
export function showEncounter(ctx, game) {
  closePortals();
  const p = game.pending, den = DEN[p.card], tile = tileAt(game, p.r, p.c);
  const host = portal();
  host.innerHTML = `<div class="overlay"><div class="modal">
    <div class="tag">An encounter</div>
    ${tileHeaderHtml(tile)}
    <h2>${denEmoji(p.card)} ${E(p.denName || (den && den.name) || "")}</h2>
    ${introHtml(p)}
    ${secondHtml(p)}
    ${denboxHtml(p, den, tile)}
    <div class="row">${p.combat ? `<button class="primary" data-enc="challenge">Challenge</button>` : `<button class="primary" data-enc="greet">Greet</button>`}${p.canWithdraw ? `<button data-enc="withdraw">↩︎ Withdraw</button>` : ""}</div>
  </div></div>`;
  host.querySelectorAll("[data-enc]").forEach((b) => b.addEventListener("click", () => {
    if (ctx.isMovePending && ctx.isMovePending()) return;
    // Keep this card covering the map while the server resolves — the result modal then swaps in on the
    // next render (showDice closePortals+opens in one tick), so the map is never seen in between.
    const act = b.getAttribute("data-enc");
    if (act === "withdraw") { closePortals(); ctx.makeMove({ type: "withdraw" }); return; }   // close the card so a withdraw can't soft-lock
    const row = host.querySelector(".row"); if (row) row.innerHTML = `<div class="hint">Resolving…</div>`;
    ctx.makeMove({ type: "encounter", choice: act });
  }));
}
// A greeting whose outcome varies is a "pick one of six" — six identical denizen faces, shuffled
// server-side, with the odds shown. You tap one; the consequence reveals. No dice on screen.
// A greeting whose outcome varies: tap one of six identical denizen faces (shuffled server-side)
// with the odds shown. No dice on screen.
export function showGreetPick(ctx, game) { pickCard(ctx, game, "greet_pick", "You greet"); }
// A fight: same six-face pick, but the odds are win / lose (/ tie → reroll) vs the foe's hidden roll.
export function showCombatPick(ctx, game) { pickCard(ctx, game, "combat_pick", "You fight"); }
// What a WIN against this foe actually buys you. A fight goes straight to the pick screen (no encounter
// card), so these rules had nowhere to appear: the Dragon's "only George can slay it" lived only in a
// board peek, where — read beside a guaranteed win — it looked like "you cannot win here" ("I have an
// instant win on dragon and it says I will lose", mrhcj22t). §18.4: any knight may BEAT the Dragon; only
// George's quest KILLS it. Say what victory means, on the screen where you commit to the fight.
function stakesHtml(den, game, p) {
  if (!den) return "";
  const seat = (game.players || []).find((q) => q.mark === p.mark);
  const out = [];
  if (den.dragon) {
    out.push(seat && seat.knight === "george"
      ? `<div class="denrow good">Your quest: <b>slay the Dragon</b>. Win, and it dies — then leave by the Enchanted Gate.</div>`
      : `<div class="denrow">Any knight can <b>beat</b> the Dragon — but <b>only George can slay it</b>. Win and you drive it off: it flees to the far wood, and <b>no prowess is won</b>. (§18.4)</div>`);
  }
  if (den.captures) out.push(`<div class="denrow bad">If she wins, you are <b>ensnared</b> — you stay in her glade and your companions wander free (no Tower).</div>`);
  if (den.king) out.push(`<div class="denrow good">Vanquish him and <b>you are King</b> — then hold the Castle a full turn to win.</div>`);
  return out.length ? `<div class="denbox">${out.join("")}</div>` : "";
}
function pickCard(ctx, game, moveType, verb) {
  closePortals();
  const p = game.pending, den = DEN[p.card], tile = tileAt(game, p.r, p.c);
  const emoji = denEmoji(p.card);
  // The server carries the article ("Merlin", but "the Witch") — he is a person, not a species.
  const name = E(p.denPhrase || `the ${p.denName || (den && den.name) || "denizen"}`);
  // A result-related emoji on each odds row, so a face's outcome reads at a glance (bug mrghtdqr).
  const oddsHtml = (groups) => (groups || []).map((g) => `<div class="mw-pickodd mw-odd-${E(g.key)}"><span class="mw-pickn">${g.count}</span> ${oddsEmoji(g.key)} ${E(g.label)}</div>`).join("");
  const faces = [1, 2, 3, 4, 5, 6].map((n) => `<button class="mw-pickface" data-pick="${n}" aria-label="pick ${n}">${emoji}</button>`).join("");
  // §8.2: Guyon may add or decline his +1 after seeing the odds — a toggle that swaps the two odds sets.
  let useGuyon = true;
  const host = portal();
  host.innerHTML = `<div class="overlay"><div class="modal">
    <div class="tag">${verb} ${name}</div>
    ${tileHeaderHtml(tile)}
    ${introHtml(p)}
    ${secondHtml(p)}
    <h2>${emoji} Pick one</h2>
    ${p.reroll ? `<div class="mw-prompt" style="text-align:center">🎲 A tie — cast again. Pick one.</div>` : ""}
    ${p.noMatch ? `<div class="mw-prompt" style="text-align:center;color:var(--good,#2e7d32)">⚔️✨ ${name} is no match — you cannot lose here.</div>` : ""}
    ${p.hopeless ? `<div class="mw-prompt" style="text-align:center;color:var(--bad,#c62828)">${den && den.captures ? "🕸️" : "⛓️"} ${name} mocks you — you cannot best him here.${p.canWithdraw ? " Withdraw, or meet your fate." : ""}</div>` : ""}
    ${moveType === "combat_pick" ? stakesHtml(den, game, p) : ""}
    <div class="mw-pickodds">${oddsHtml(p.groups)}</div>
    ${p.guyonOptional ? `<div class="row"><button data-guyon="1" class="mw-guyon">Guyon's +1: ON</button></div>` : ""}
    <div class="mw-pickgrid">${faces}</div>
    ${p.canWithdraw ? `<div class="row"><button data-pick-withdraw="1">↩︎ Withdraw instead</button></div>` : ""}
  </div></div>`;
  const gt = host.querySelector("[data-guyon]");
  if (gt) gt.addEventListener("click", () => {
    useGuyon = !useGuyon;
    gt.textContent = `Guyon's +1: ${useGuyon ? "ON" : "OFF"}`;
    const od = host.querySelector(".mw-pickodds"); if (od) od.innerHTML = oddsHtml(useGuyon ? p.groups : p.groupsNoBonus);
  });
  const wb = host.querySelector("[data-pick-withdraw]");
  if (wb) wb.addEventListener("click", () => { if (ctx.isMovePending && ctx.isMovePending()) return; closePortals(); ctx.makeMove({ type: "withdraw" }); });
  host.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
    if (ctx.isMovePending && ctx.isMovePending()) return;
    host.querySelectorAll(".mw-pickface").forEach((f) => { f.disabled = true; if (f !== b) f.classList.add("mw-faded"); });
    b.classList.add("mw-chosen");
    // Every pick face reveals its TRUE result when the roll lands (mrgkd4uw / mrgls3o2 / mrgsh5me — ALL
    // picks, greet included). A sure win/loss reads at once; otherwise the face waits until the verdict
    // morphs on via pendingReveal — never a die (a die is only ever a reroll).
    if (moveType === "combat_pick" && p.noMatch) b.textContent = "⚔️✨";
    else if (moveType === "combat_pick" && p.hopeless) b.textContent = den && den.captures ? "🕸️" : "⛓️";
    if (moveType === "combat_pick" || moveType === "greet_pick") pendingReveal = { el: b };
    // The result modal swaps in on the next render (dice suppressed — this was a pick, not a roll).
    signalWorking();
    ctx.makeMove({ type: moveType, pick: Number(b.getAttribute("data-pick")), useGuyon });
  }));
}
// The imprisoned-escape "pick one of six": each turn the captive taps a face to try the lock. The odds
// (server-computed) say how many faces free you; the result modal then reveals whether you slipped out.
export function showEscapePick(ctx, game) {
  closePortals();
  const p = game.pending, capture = p.mode === "capture";
  const emoji = capture ? "🧝‍♀️" : "⛓️";
  const title = capture ? "Captured by the Enchantress" : "Imprisoned in the Tower";
  const lead = capture ? "Her song holds you fast. Pick one of six — you break free only on the toll of the sixth."
                       : "The bars are cold and close. Pick one of six — you slip free on a 5 or 6, or on the fourth dawn.";
  const odds = (p.groups || []).map((g) => `<div class="mw-pickodd mw-odd-${E(g.key)}"><span class="mw-pickn">${g.count}</span> ${E(g.label)}</div>`).join("");
  const faces = [1, 2, 3, 4, 5, 6].map((n) => `<button class="mw-pickface" data-pick="${n}" aria-label="pick ${n}">${emoji}</button>`).join("");
  const host = portal();
  host.innerHTML = `<div class="overlay"><div class="modal">
    <div class="tag">${title}</div>
    <p class="mw-enc-intro">${lead}</p>
    <h2>${emoji} Pick one</h2>
    <div class="mw-pickodds">${odds}</div>
    <div class="mw-pickgrid">${faces}</div>
  </div></div>`;
  host.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
    if (ctx.isMovePending && ctx.isMovePending()) return;
    host.querySelectorAll(".mw-pickface").forEach((f) => { f.disabled = true; if (f !== b) f.classList.add("mw-faded"); });
    b.classList.add("mw-chosen");
    pendingReveal = { el: b };   // the Key 🗝️ (free) or the lock 🔒 (held) morphs onto this face when it lands (mrglq3yx)
    // The result modal swaps in on the next render (no die — the pick stood in for the roll).
    signalWorking();
    ctx.makeMove({ type: "escape_pick", pick: Number(b.getAttribute("data-pick")) });
  }));
}
function tileHeaderHtml(t) {
  if (!t) return "";
  const half = t.half === "ench" ? "Enchanted Wood" : "Earthly Wood";
  const name = t.name ? (AREA_NAMES[t.name] || "Glade") : "Forest path";
  let info = `<b>${name}</b> · <span style="color:var(--muted)">${half} · tile (${t.r},${t.c})</span>`;
  if (t.name && AREA_FX[t.name]) info += `<br><span style="color:var(--muted);font-size:12px">${AREA_FX[t.name]}</span>`;
  return `<div class="tilehdr2"><div class="tilethumb">${tileSvg(t, t.r * 7 + t.c + 1)}</div><div class="tileinfo">${info}</div></div>`;
}
function denboxHtml(p, den, tile) {
  let h = `<div class="denbox">`;
  const stats = []; if (den.S) stats.push(`<span class="pS">Strength ${den.S}</span>`); if (den.P) stats.push(`<span class="pP">Prowess ${den.P}</span>`);
  h += `<div class="denrow"><b>${DEN_CLASS[den.cls] || "Denizen"}</b>${stats.length ? " · " + stats.join(" · ") : ""}</div>`;
  if (p.combat && p.preview) {
    const diff = p.preview.mine - p.preview.foe, cls = diff > 0 ? "good" : diff < 0 ? "bad" : "muted";
    h += `<div class="denrow denvs"><b>${E(p.preview.label)}</b> — <span class="num">${p.preview.mine}</span> vs <span class="num">${p.preview.foe}</span> <span class="${cls}" style="font-weight:700">(${diff >= 0 ? "+" : "−"}${Math.abs(diff)})</span></div>`;
    if (den.dragon) h += `<div class="denrow">Only <b>George</b> can slay the Dragon.</div>`;
    if (den.captures) h += `<div class="denrow bad">If she wins, you're <b>ensnared</b> — you stay in her glade and lose your companions (no Tower).</div>`;
    if (tile && tile.name === "chapel") h += `<div class="denrow good">Chapel +1 Prowess to you — included.</div>`;
    if (tile && tile.name === "castle" && den.S) h += `<div class="denrow bad">Castle +2 to the foe — included.</div>`;
    if (tile && tile.name === "grove" && den.P) h += `<div class="denrow bad">Sacred Grove +1 to the foe — included.</div>`;
  } else {
    // The Bishop and Sage don't roll — their single-effect tables read as "gives a Ring" / nothing, which
    // hides the real cost (GY3B mrgkgq6j: "tell me it's three turns"; mrgke23d: "why is the Sage free?").
    if (p.card === "bishop") h += `<div class="denrow">Kneel and <b>pray 3 full turns</b> here to earn the <b>Ring</b> — if the prayer is interrupted, it is lost.</div>`;
    else if (p.card === "sage") h += `<div class="denrow">A <b>Companion</b>: he joins freely, and once lends <b>+2 Prowess</b> to a fight or greeting before departing.</div>`;
    else if (den.grail) h += `<div class="denrow">Add your Prowess to the die: <b>9+</b> takes the Grail.</div>`;
    else if (p.card === "princess") h += `<div class="denrow">Add your Prowess to the die: <b>9+</b> she befriends you.</div>`;
    else if (p.card === "prince") h += `<div class="denrow">Add your Prowess to the die: <b>8+</b> he befriends you.</div>`;
    else {
      const rr = tblRows(den.tbl);
      if (rr && rr.length === 1) h += `<div class="denrow">Greet → ${rr[0].effect}.</div>`;
      else if (rr) { h += `<div class="denrow"><b>Reactions</b> — greet, then roll a die:</div><table class="rtbl">${rr.map((r) => `<tr><td class="rroll">${r.range}</td><td>${r.effect}</td></tr>`).join("")}</table>`; }
    }
  }
  h += `</div>`;
  return h;
}

/* -------------------------------- dice ---------------------------------- */
// Die, then name + total on one line with the bonuses tucked under them. Never a single
// long line: a warrior foe (the King) carries Strength + Prowess + tile bonus and would wrap.
function diceRow(label, cls, die, parts, total) {
  const bons = (parts || []).map((pt) => `<span class="drbon">${E(pt.l)} ${pt.v}</span>`).join(`<span class="drop">+</span>`);
  const tot = total == null ? "" : `<span class="drtot">= ${total}</span>`;
  return `<div class="dicerow"><div class="die ${cls}">${die}</div><div class="drmain">`
    + `<div class="drtop"><span class="drlabel">${label}</span>${tot}</div>`
    + (bons ? `<div class="drbons">${bons}</div>` : "") + `</div></div>`;
}
export function showDice(ctx, roll) {
  // If a pick face is awaiting its verdict, morph the TRUE outcome onto it first, hold a beat, then
  // swap in the result modal. The pressed face lives in a body-level portal, so a board re-render in
  // between can't destroy it. No pending face (or no single-face outcome) → straight to the modal.
  const face = pendingReveal && pendingReveal.el && pendingReveal.el.isConnected ? pendingReveal.el : null;
  const emoji = resultEmojiForRoll(roll);
  pendingReveal = null;
  if (face && emoji) {
    face.textContent = emoji;
    face.classList.add("mw-revealed");
    setTimeout(() => renderDiceModal(ctx, roll), 780);
    return;
  }
  renderDiceModal(ctx, roll);
}
function renderDiceModal(ctx, roll) {
  closePortals();
  const host = portal();
  let inner;
  if (roll.jailed) {
    // A bare imprisonment notice — mostly for being towered on someone ELSE's turn (a rival's Queen boon),
    // where there'd otherwise be no popup at all (mrh6go4v). A fight loss supersedes this with its own modal.
    inner = `<div class="tag">The Tower</div>
      <div class="result mw-result-big"><span class="r">⛓️ Cast into the Tower jail!</span></div>
      <div class="hint">On your turn you may try to escape — a 5 or 6 frees you, the fourth dawn opens the door on its own, and the Key unlocks it at once.</div>
      <div class="row"><button class="primary" data-close="1">Continue</button></div>`;
  } else if (roll.pray) {
    // §18.2: a turn of prayer SPENDS the turn — the knight kneels instead of moving, and the seat is skipped.
    // Skipped in silence, the vigil looked broken and stuck at one ("bishop only does 1 of three… no chance to
    // sit three rounds", mrh93gvz). Now each kept turn gets its own modal and counts itself down to the Ring.
    const n = roll.turns || 0;
    inner = roll.blessed
      ? `<div class="tag">The Bishop</div>
        <div class="result mw-result-big"><span class="g">💍 The Bishop blesses you with the Ring!</span></div>
        <div class="mw-result-detail">Three full turns of prayer kept — the Ring is yours: <b>+1 Prowess</b>. You may move again on this turn.</div>
        <div class="row"><button class="primary" data-close="1">Continue</button></div>`
      : `<div class="tag">The Bishop</div>
        <div class="result mw-result-big mw-result-tale">🙏 You keep the vigil — <b>${n} of 3</b>.</div>
        <div class="mw-result-detail">This turn is spent kneeling: you do not move. <b>${3 - n} more turn${3 - n === 1 ? "" : "s"}</b> of prayer and the Bishop gives you the <b>Ring (+1 Prowess)</b>.<br><span class="muted">If the prayer is broken before then, the turns kept are lost.</span></div>
        <div class="row"><button class="primary" data-close="1">Continue</button></div>`;
  } else if (roll.escape) {
    // The picked escape shows no die (the pick stood in for the roll); the headline says free or held.
    const capture = roll.mode === "capture", key = roll.mode === "key";
    const res = roll.freed
      ? `<span class="g">${capture ? "🕊️ Free of the Enchantress!" : key ? "🗝️ The Key unlocks the Tower!" : "🔓 Free of the Tower!"}</span>`
      : `<span class="r">${capture ? "✦ Her song still holds you." : "⛓️ The bars hold — still imprisoned."}</span>`;
    const sub = roll.freed
      ? (key ? "The Key you carry opened the door — you walk free, and may move this turn." : "You may move this turn.")
      : capture ? "Try again next turn — break free on a 6."
      : roll.tries >= 3 ? "The fourth dawn will open the door." : "Try again next turn — or find the Key.";
    inner = `<div class="tag">${capture ? "The Enchantress" : "The Tower"}</div>
      <div class="result mw-result-big">${res}</div>
      <div class="hint">${sub}</div>
      <div class="row"><button class="primary" data-close="1">Continue</button></div>`;
  } else if (roll.notice) {
    // A plain titled notice — a rule the board can't show and a log line gets lost in: the Cave vigil
    // counting itself down (mrhcq3ps), a denizen who has already ignored you (§8.2.1, mrhcnxmv), the
    // obligation of rescue that follows you out of a withdrawal (§15, mrhcgftz). Server-owned prose.
    const n = roll.notice;
    inner = `<div class="tag">${E(n.tag || "")}</div>
      <div class="result mw-result-big mw-result-tale">${n.emoji ? E(n.emoji) + " " : ""}${sanitizeLog(n.head || "")}</div>
      ${n.body ? `<div class="mw-result-detail">${sanitizeLog(n.body)}</div>` : ""}
      <div class="row"><button class="primary" data-close="1">Continue</button></div>`;
  } else if (roll.joust) {
    // §12: a joust is a FIGHT, resolved just like a challenge — so show it like one. It used to be a single
    // line, and the LOSER saw only a bare "you're in the Tower" notice with no word of the fight that put
    // them there ("need more modals explaining what is happening… make it sound like a fight", mrhc3izr).
    // Both knights now get this, told from their own side, with both dice, both bonuses, and the fate.
    const won = !!roll.youWon;
    const head = won ? `<span class="g">⚔️✨ You unhorse ${E(roll.foeName)}! — ${roll.youAreCh ? roll.cw : roll.dw} vs ${roll.youAreCh ? roll.dw : roll.cw}</span>`
      : `<span class="r">🛡️ ${E(roll.foeName)} unhorses you — ${roll.youAreCh ? roll.cw : roll.dw} vs ${roll.youAreCh ? roll.dw : roll.cw}</span>`;
    const detail = roll.detail ? `<div class="mw-result-detail">${sanitizeLog(roll.detail)}</div>` : "";
    inner = `<div class="tag">The lists — ${E(roll.cName)} rides against ${E(roll.dName)}</div>
      <div class="result mw-result-big">${head}</div>
      ${detail}
      <div class="hint">the dice — each knight adds his full Strength + Prowess:</div>
      <div class="dicewrap">${diceRow(E(roll.cName), "white", roll.cDie, roll.cParts, roll.cw)}${diceRow(E(roll.dName), "red", roll.dDie, roll.dParts, roll.dw)}</div>
      <div class="row"><button class="primary" data-close="1">Continue</button></div>`;
  } else if (roll.greet) {
    // No die on screen when the reaction never varies (Dwarf/Nymph/Sage/Bishop) OR when the
    // player picked a face instead of rolling — the pick already stood in for the die.
    const dice = (roll.die == null || roll.picked) ? "" : `<div class="hint">the roll:</div><div class="dicewrap">${diceRow("Roll", "white", roll.die, null, null)}</div>`;
    // The scene the denizen makes is the headline; the bookkeeping it caused (the Thing taken, the
    // stats now) drops to the detail line, as a fight's consequences do. Same shape, quieter voice.
    const [scene, ...rest] = String(roll.result || "The denizen reacts.").split("<br>");
    const detail = rest.length ? `<div class="mw-result-detail">${sanitizeLog(rest.join("<br>"))}</div>` : "";
    const oe = oddsEmoji(roll.resultKey);   // the item/outcome glyph (a Potion 🧪, befriend 🤝 …) on the result (mrgqs7rw)
    inner = `<div class="tag">You greet ${E(roll.foePhrase || `the ${roll.foeName}`)}</div>
      <div class="result mw-result-big mw-result-tale">${oe ? oe + " " : ""}${sanitizeLog(scene)}</div>
      ${detail}
      ${dice}
      <div class="row"><button class="primary" data-close="1">Continue</button></div>`;
  } else {
    const res = roll.outcome === "win" ? `<span class="g">⚔️✨ Victory! — ${roll.mine} vs ${roll.foe}</span>`
      : roll.bound ? `<span class="r">🕸️ Ensnared by the Enchantress! — ${roll.mine} vs ${roll.foe}<br>You remain in her glade; your companions wander free.</span>`
      : `<span class="r">⛓️ Defeated — ${roll.mine} vs ${roll.foe}<br>Off to the Tower jail — companions left behind. Try to escape on your turn.</span>`;
    // What the fight actually did — the Dragon slain, a Thing taken, the crown claimed. Without it a
    // win reads as "you rolled higher" and the player never learns what they gained.
    const detail = roll.detail ? `<div class="mw-result-detail">${sanitizeLog(roll.detail)}</div>` : "";
    // A picked fight shows no dice — the pick stood in for the roll; the headline carries the totals.
    const dice = roll.picked ? "" : `<div class="hint">the dice — white = you · red = foe:</div>
      <div class="dicewrap">${diceRow("You", "white", roll.white, roll.mineParts, roll.mine)}${diceRow(E(roll.foeName), "red", roll.red, roll.foeParts, roll.foe)}</div>`;
    inner = `<div class="tag">Encounter result</div>
      <div class="result mw-result-big">${res}</div>
      ${detail}
      ${dice}
      <div class="row"><button class="primary" data-close="1">Continue</button></div>`;
  }
  host.innerHTML = `<div class="overlay"><div class="modal">${inner}</div></div>`;
  const close = host.querySelector("[data-close]");
  if (close) close.addEventListener("click", () => { closePortals(); rerender(ctx); }); // re-render surfaces any still-pending encounter
}
