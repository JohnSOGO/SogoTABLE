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

/* ------------------------------- portal --------------------------------- */
function portal() { const p = document.createElement("div"); p.className = "mystic-wood-root mw-portal"; document.body.appendChild(p); return p; }
export function closePortals() { document.querySelectorAll(".mw-portal").forEach((n) => n.remove()); }
// The first-sight narrative the server writes for a met card (server-owned prose, no user input) —
// shown on both the encounter card and the pick grid so EVERY card type is met with its own line.
function introHtml(p) { return p && p.intro ? `<p class="mw-enc-intro">${sanitizeLog(p.intro)}</p>` : ""; }

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
    ${denboxHtml(p, den, tile)}
    <div class="row">${p.combat ? `<button class="primary" data-enc="challenge">Challenge</button>` : `<button class="primary" data-enc="greet">Greet</button>`}${p.canWithdraw ? `<button data-enc="withdraw">↩︎ Withdraw</button>` : ""}</div>
  </div></div>`;
  host.querySelectorAll("[data-enc]").forEach((b) => b.addEventListener("click", () => {
    if (ctx.isMovePending && ctx.isMovePending()) return;
    // Keep this card covering the map while the server resolves — the result modal then swaps in on the
    // next render (showDice closePortals+opens in one tick), so the map is never seen in between.
    const row = host.querySelector(".row"); if (row) row.innerHTML = `<div class="hint">Resolving…</div>`;
    const act = b.getAttribute("data-enc");
    ctx.makeMove(act === "withdraw" ? { type: "withdraw" } : { type: "encounter", choice: act });
  }));
}
// A greeting whose outcome varies is a "pick one of six" — six identical denizen faces, shuffled
// server-side, with the odds shown. You tap one; the consequence reveals. No dice on screen.
// A greeting whose outcome varies: tap one of six identical denizen faces (shuffled server-side)
// with the odds shown. No dice on screen.
export function showGreetPick(ctx, game) { pickCard(ctx, game, "greet_pick", "You greet"); }
// A fight: same six-face pick, but the odds are win / lose (/ tie → reroll) vs the foe's hidden roll.
export function showCombatPick(ctx, game) { pickCard(ctx, game, "combat_pick", "You fight"); }
function pickCard(ctx, game, moveType, verb) {
  closePortals();
  const p = game.pending, den = DEN[p.card], tile = tileAt(game, p.r, p.c);
  const emoji = denEmoji(p.card);
  // The server carries the article ("Merlin", but "the Witch") — he is a person, not a species.
  const name = E(p.denPhrase || `the ${p.denName || (den && den.name) || "denizen"}`);
  const oddsHtml = (groups) => (groups || []).map((g) => `<div class="mw-pickodd mw-odd-${E(g.key)}"><span class="mw-pickn">${g.count}</span> ${E(g.label)}</div>`).join("");
  const faces = [1, 2, 3, 4, 5, 6].map((n) => `<button class="mw-pickface" data-pick="${n}" aria-label="pick ${n}">${emoji}</button>`).join("");
  // §8.2: Guyon may add or decline his +1 after seeing the odds — a toggle that swaps the two odds sets.
  let useGuyon = true;
  const host = portal();
  host.innerHTML = `<div class="overlay"><div class="modal">
    <div class="tag">${verb} ${name}</div>
    ${tileHeaderHtml(tile)}
    ${introHtml(p)}
    <h2>${emoji} Pick one</h2>
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
  if (wb) wb.addEventListener("click", () => { if (!(ctx.isMovePending && ctx.isMovePending())) ctx.makeMove({ type: "withdraw" }); });
  host.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
    if (ctx.isMovePending && ctx.isMovePending()) return;
    host.querySelectorAll(".mw-pickface").forEach((f) => { f.disabled = true; if (f !== b) f.classList.add("mw-faded"); });
    b.classList.add("mw-chosen");
    // The result modal swaps in on the next render (dice suppressed — this was a pick, not a roll).
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
    // The result modal swaps in on the next render (no die — the pick stood in for the roll).
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
    if (den.grail) h += `<div class="denrow">Add your Prowess to the die: <b>9+</b> takes the Grail.</div>`;
    else if (p.card === "princess") h += `<div class="denrow">Add your Prowess to the die: <b>9+</b> she befriends you.</div>`;
    else if (p.card === "prince") h += `<div class="denrow">Add your Prowess to the die: <b>8+</b> he befriends you.</div>`;
    const rr = tblRows(den.tbl);
    if (rr && rr.length === 1) h += `<div class="denrow">Greet → ${rr[0].effect}.</div>`;
    else if (rr) { h += `<div class="denrow"><b>Reactions</b> — greet, then roll a die:</div><table class="rtbl">${rr.map((r) => `<tr><td class="rroll">${r.range}</td><td>${r.effect}</td></tr>`).join("")}</table>`; }
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
  closePortals();
  const host = portal();
  let inner;
  if (roll.escape) {
    // The picked escape shows no die (the pick stood in for the roll); the headline says free or held.
    const capture = roll.mode === "capture";
    const res = roll.freed
      ? `<span class="g">${capture ? "🕊️ Free of the Enchantress!" : "🔓 Free of the Tower!"}</span>`
      : `<span class="r">${capture ? "✦ Her song still holds you." : "⛓️ The bars hold — still imprisoned."}</span>`;
    const sub = roll.freed
      ? "You may move this turn."
      : capture ? "Try again next turn — break free on a 6."
      : roll.tries >= 3 ? "The fourth dawn will open the door." : "Try again next turn — or find the Key.";
    inner = `<div class="tag">${capture ? "The Enchantress" : "The Tower"}</div>
      <div class="result mw-result-big">${res}</div>
      <div class="hint">${sub}</div>
      <div class="row"><button class="primary" data-close="1">Continue</button></div>`;
  } else if (roll.joust) {
    inner = `<div class="tag">Joust</div>
      <div class="result mw-result-big">⚔️ ${E(roll.winnerName)} prevails!</div>
      <div class="hint">${E(roll.cName)} ${roll.cw} vs ${E(roll.dName)} ${roll.dw}</div>
      <div class="row"><button class="primary" data-close="1">Continue</button></div>`;
  } else if (roll.greet) {
    // No die on screen when the reaction never varies (Dwarf/Nymph/Sage/Bishop) OR when the
    // player picked a face instead of rolling — the pick already stood in for the die.
    const dice = (roll.die == null || roll.picked) ? "" : `<div class="hint">the roll:</div><div class="dicewrap">${diceRow("Roll", "white", roll.die, null, null)}</div>`;
    // The scene the denizen makes is the headline; the bookkeeping it caused (the Thing taken, the
    // stats now) drops to the detail line, as a fight's consequences do. Same shape, quieter voice.
    const [scene, ...rest] = String(roll.result || "The denizen reacts.").split("<br>");
    const detail = rest.length ? `<div class="mw-result-detail">${sanitizeLog(rest.join("<br>"))}</div>` : "";
    inner = `<div class="tag">You greet ${E(roll.foePhrase || `the ${roll.foeName}`)}</div>
      <div class="result mw-result-big mw-result-tale">${sanitizeLog(scene)}</div>
      ${detail}
      ${dice}
      <div class="row"><button class="primary" data-close="1">Continue</button></div>`;
  } else {
    const res = roll.outcome === "win" ? `<span class="g">⚔️✨ Victory! — ${roll.mine} vs ${roll.foe}</span>`
      : roll.bound ? `<span class="r">✦ Ensnared by the Enchantress! — ${roll.mine} vs ${roll.foe}<br>You remain in her glade; your companions wander free.</span>`
      : `<span class="r">💀 Defeated — ${roll.mine} vs ${roll.foe}<br>⛓️ To the Tower — companions lost.</span>`;
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
