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
    ${denboxHtml(p, den, tile)}
    <div class="row">${p.combat ? `<button class="primary" data-enc="challenge">Challenge</button>` : `<button class="primary" data-enc="greet">Greet</button>`}</div>
  </div></div>`;
  host.querySelectorAll("[data-enc]").forEach((b) => b.addEventListener("click", () => {
    if (ctx.isMovePending && ctx.isMovePending()) return;
    // Keep this card covering the map while the server resolves — the result modal then swaps in on the
    // next render (showDice closePortals+opens in one tick), so the map is never seen in between.
    const row = host.querySelector(".row"); if (row) row.innerHTML = `<div class="hint">Resolving…</div>`;
    ctx.makeMove({ type: "encounter", choice: b.getAttribute("data-enc") });
  }));
}
// A greeting whose outcome varies is a "pick one of six" — six identical denizen faces, shuffled
// server-side, with the odds shown. You tap one; the consequence reveals. No dice on screen.
// A greeting whose outcome varies: tap one of six identical denizen faces (shuffled server-side)
// with the odds shown. No dice on screen.
export function showGreetPick(ctx, game) { pickCard(ctx, game, "greet_pick", "You greet the"); }
// A fight: same six-face pick, but the odds are win / lose (/ tie → reroll) vs the foe's hidden roll.
export function showCombatPick(ctx, game) { pickCard(ctx, game, "combat_pick", "You fight the"); }
function pickCard(ctx, game, moveType, verb) {
  closePortals();
  const p = game.pending, den = DEN[p.card], tile = tileAt(game, p.r, p.c);
  const emoji = denEmoji(p.card);
  const name = E(p.denName || (den && den.name) || "denizen");
  const odds = (p.groups || []).map((g) => `<div class="mw-pickodd mw-odd-${E(g.key)}"><span class="mw-pickn">${g.count}</span> ${E(g.label)}</div>`).join("");
  const faces = [1, 2, 3, 4, 5, 6].map((n) => `<button class="mw-pickface" data-pick="${n}" aria-label="pick ${n}">${emoji}</button>`).join("");
  const host = portal();
  host.innerHTML = `<div class="overlay"><div class="modal">
    <div class="tag">${verb} ${name}</div>
    ${tileHeaderHtml(tile)}
    <h2>${emoji} Pick one</h2>
    <div class="mw-pickodds">${odds}</div>
    <div class="mw-pickgrid">${faces}</div>
  </div></div>`;
  host.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
    if (ctx.isMovePending && ctx.isMovePending()) return;
    host.querySelectorAll(".mw-pickface").forEach((f) => { f.disabled = true; if (f !== b) f.classList.add("mw-faded"); });
    b.classList.add("mw-chosen");
    // The result modal swaps in on the next render (dice suppressed — this was a pick, not a roll).
    ctx.makeMove({ type: moveType, pick: Number(b.getAttribute("data-pick")) });
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
    if (den.captures) h += `<div class="denrow bad">If it wins, it <b>captures</b> you (escape on a 6).</div>`;
    if (tile && tile.name === "chapel") h += `<div class="denrow good">Chapel +2 Prowess to you — included.</div>`;
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
  if (roll.joust) {
    inner = `<div class="tag">Joust</div>
      <div class="result mw-result-big">⚔️ ${E(roll.winnerName)} prevails!</div>
      <div class="hint">${E(roll.cName)} ${roll.cw} vs ${E(roll.dName)} ${roll.dw}</div>
      <div class="row"><button class="primary" data-close="1">Continue</button></div>`;
  } else if (roll.greet) {
    // No die on screen when the reaction never varies (Dwarf/Nymph/Sage/Bishop) OR when the
    // player picked a face instead of rolling — the pick already stood in for the die.
    const dice = (roll.die == null || roll.picked) ? "" : `<div class="hint">the roll:</div><div class="dicewrap">${diceRow("Roll", "white", roll.die, null, null)}</div>`;
    inner = `<div class="tag">You greet the ${E(roll.foeName)}</div>
      <div class="result mw-result-big">${sanitizeLog(roll.result || "The denizen reacts.")}</div>
      ${dice}
      <div class="row"><button class="primary" data-close="1">Continue</button></div>`;
  } else {
    const res = roll.outcome === "win" ? `<span class="g">⚔️✨ Victory! — ${roll.mine} vs ${roll.foe}</span>`
      : roll.outcome === "captured" ? `<span class="r">✦ Captured by the Enchantress! — ${roll.mine} vs ${roll.foe}</span>`
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
