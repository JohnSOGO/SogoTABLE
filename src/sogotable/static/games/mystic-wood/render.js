// The Mystic Wood — browser client. The UI is LIFTED from the AI/Mystic_Wood prototype (tiles with
// road/emblem art, the topbar + knight-strip + board + log + actions layout, slide-over Knights/
// Chronicle panels, press-and-hold peeks, the encounter card, and the dice-reveal modal). Only the two
// seams are rewired: data source (the ctx.game projection) and intent (ctx.makeMove). Snapshot render.
import { renderHostStartLobby } from "../lobby.js";
import { MYSTIC_WOOD_CSS } from "./styles.js";
import { KNIGHTS, THINGS, DEN, DEN_CLASS, DEN_EMOJI, THING_DESC, COMP_DESC, AREA_NAMES, AREA_FX } from "./content.js";

const ZOOM_WIDTHS = [7, 5, 3, 2];
const CW = 99, CH = 72.12;   // board grid stride (cell 96 + gap 3, row 69.12 + gap 3)
let styled = false, resizeHooked = false, zoomCtx = null, seenRoll = 0, uiRoot = null;
let view = { gameKey: null, zoom: 0, focus: null, panel: null };
let prevPos = {};      // mark -> {r,c}, for gliding tokens between tiles
let pulseCell = null;  // "r,c" of the legend/map badge currently highlighted
let clickTimer = null; // single- vs double-tap discrimination

function roomMeta(ctx) { const m = {}; ((ctx.room && ctx.room.players) || []).forEach((p) => { m[p.mark] = { icon: p.icon || "", color: p.color }; }); return m; }

function injectStyles() {
  if (styled || document.getElementById("mystic-wood-styles")) { styled = true; return; }
  styled = true;
  const el = document.createElement("style"); el.id = "mystic-wood-styles"; el.textContent = MYSTIC_WOOD_CSS;
  document.head.appendChild(el);
}
function localMark(ctx) { const s = ((ctx.room && ctx.room.players) || []).find((p) => p.id === ctx.localPlayerId); return s ? s.mark : null; }
const E = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
const denEmoji = (id) => DEN_EMOJI[id] || (DEN[id] ? { beast: "🐾", warrior: "⚔️", magic: "✨", greet: "❓", companion: "🤝", special: "❓" }[DEN[id].cls] : "❓");

/* ------------------------------- entry ---------------------------------- */
export function renderMysticWoodGame(ctx) {
  injectStyles();
  const host = ctx.host; if (!host) return;
  if (!ctx.started) {
    renderHostStartLobby(host, ctx, { wrap: "mystic-wood-root", heading: "Knights",
      blurb: "Each knight has a unique quest. Invite players or bots (3–5 seats, bots fill), then start — knights are dealt at random." });
    return;
  }
  const game = ctx.game || {};
  const gameKey = `${(ctx.room && ctx.room.code) || "?"}`;
  if (view.gameKey !== gameKey) { view = { gameKey, zoom: 0, focus: null, panel: null }; seenRoll = 0; prevPos = {}; pulseCell = null; }
  if (!resizeHooked) { resizeHooked = true; window.addEventListener("resize", () => applyZoom()); }
  const me = localMark(ctx);
  let root = host.querySelector(".mystic-wood-root");
  if (!root) { host.innerHTML = ""; root = document.createElement("div"); root.className = "mystic-wood-root"; host.appendChild(root); }

  if (game.status === "complete") { root.innerHTML = endHtml(ctx, game); wireTop(root, ctx, game, me); return; }
  // if my knight moved while zoomed & following me, keep the view centred on me (prevPos still holds the old spot)
  const lp = (game.players || []).find((p) => p.mark === me);
  if (lp && prevPos[me] && (prevPos[me].r !== lp.r || prevPos[me].c !== lp.c) && (view.zoom || 0) > 0) view.focus = null;
  root.innerHTML = boardScreenHtml(ctx, game, me);
  uiRoot = root;
  wireTop(root, ctx, game, me);
  wireBoard(root, ctx, game, me);
  zoomCtx = { root, game, me }; applyZoom(); requestAnimationFrame(() => applyZoom());
  animateTokens(root, game);
  // overlays: my own most-recent roll result (kept per-seat so bot turns can't clobber it), else a pending encounter
  const myRoll = (game.results && me) ? game.results[me] : null;
  if (myRoll && myRoll.seq > seenRoll) { seenRoll = myRoll.seq; showDice(ctx, myRoll); }
  else if (game.pending && game.pending.mark === me) showEncounter(ctx, game);
}

/* ------------------------------- layout --------------------------------- */
function boardScreenHtml(ctx, game, me) {
  const cur = game.players.find((p) => p.mark === game.current_player);
  const turn = cur ? (cur.mark === me ? "Your turn" : `${E(cur.name)}'s turn`) : "—";
  return `
    <div class="mw-topbar">
      <button data-top="knights">≡ Knights</button>
      <span class="mw-tb-turn">${turn}</span>
      <button data-top="zoom">🔍</button>
      <button data-top="chron">📜</button>
    </div>
    <div class="mw-status">${stripHtml(ctx, game, me)}</div>
    <div class="mw-boardwrap"><div class="board">${cellsHtml(ctx, game, me)}</div></div>
    <div class="mw-legend">${legendHtml(ctx, game)}</div>
    <div class="mw-log">${logRows(game, 6)}</div>
    <div class="mw-actions">${actionsHtml(ctx, game, me)}</div>
  `;
}
function stripHtml(ctx, game, me) {
  const seat = game.players.find((p) => p.mark === me) || game.players.find((p) => p.mark === game.current_player);
  if (!seat) return "";
  return `<div class="pstrip">
    <div class="pstrip-r1">
      <span class="crest" style="width:24px;height:24px;font-size:12px;background:${E(seat.color)}">${E((seat.name || "?")[0])}</span>
      <span class="pstrip-name" style="color:${E(seat.color)}">${E(seat.name)}</span>
      ${statsHtml(seat)}
      <span class="pstrip-quest">${seat.questDone ? "✓ " : ""}${E(seat.quest || "")}</span>
    </div>
    <div class="pstrip-badges">${invHtml(seat)}</div>
  </div>`;
}
function statsHtml(seat) {
  const cap = (seat.totalP + seat.totalS) >= 10 ? ` <span style="color:var(--muted)">(cap 10)</span>` : "";
  return `<span class="stats" data-peek="stats:${seat.mark}"><span class="pP">P ${seat.totalP}</span><span class="pS">S ${seat.totalS}</span>${cap}</span>`;
}
function invHtml(seat) {
  let h = "";
  if (seat.isKing) h += `<span class="chip">👑 King</span>`;
  (seat.things || []).forEach((t) => { h += `<span class="chip holdable" data-peek="thing:${t.id}">${E(t.name)}</span>`; });
  (seat.prowess || []).forEach((n) => { h += `<span class="chip holdable" data-peek="prowess:0">${E(n)}</span>`; });
  (seat.companions || []).forEach((c) => { h += `<span class="chip comp holdable" data-peek="comp:${c.id}">${E(c.name)}</span>`; });
  if (seat.horse) h += `<span class="chip holdable" data-peek="horse:0">Horse</span>`;
  if (seat.tower) h += `<span class="badge holdable" data-peek="tower:0">⛓ Tower</span>`;
  if (seat.captured) h += `<span class="badge holdable" data-peek="captured:0">✦ Captured</span>`;
  return h;
}
function actionsHtml(ctx, game, me) {
  const cur = game.players.find((p) => p.mark === game.current_player);
  const meSeat = game.players.find((p) => p.mark === me);
  const mine = game.current_player === me;
  let btns = "";
  if (mine && meSeat && !meSeat.tower && !meSeat.captured && !game.pending) {
    const tile = tileAt(game, meSeat.r, meSeat.c);
    const has = (id) => (meSeat.things || []).some((t) => t.id === id);
    const comp = (id) => (meSeat.companions || []).some((c) => c.id === id);
    if (tile && tile.name === "fountain") btns += `<button data-act="drink">⛲ Drink</button>`;
    if (has("crystal")) btns += `<button data-act="scry">🔮 Scry</button>`;
    if (has("wand")) btns += `<button data-act="rotate">🔄 Rotate</button>`;
    if (comp("archmage")) btns += `<button data-act="transport">✨ Transport</button>`;
    btns += `<button class="primary" data-act="end">End turn</button>`;
    if (game.scry_reveal) btns += `<button disabled>🔮 Next: ${denEmoji(game.scry_reveal)} ${E((DEN[game.scry_reveal] || {}).name || game.scry_reveal)}</button>`;
  } else if (mine && meSeat && (meSeat.tower || meSeat.captured)) {
    btns += `<button disabled>${meSeat.captured ? "Captured — roll to break free" : "Imprisoned — roll to escape"}</button>`;
  } else {
    btns += `<button disabled>Waiting for ${cur ? E(cur.name) : "…"}…</button>`;
  }
  return btns;
}
function endHtml(ctx, game) {
  const w = game.players.find((p) => p.mark === game.winner);
  const reason = game.end_reason && game.end_reason.reason === "castle" ? "holds the Castle as King" : "escaped the Wood, quest fulfilled";
  return `<div class="mw-topbar"><span class="mw-tb-turn">Victory</span><button data-top="chron">📜</button></div>
    <div class="card" style="text-align:center;margin:14px;padding:22px">
      <div class="tag">Victory</div>
      <h2 style="font-size:26px;color:${w ? E(w.color) : "var(--gold2)"};margin:8px 0">${w ? E(w.name) : "Someone"} wins!</h2>
      <p style="color:var(--muted)">${w ? E(w.name) : "The victor"} ${reason} and rules the Mystic Wood.</p>
    </div>`;
}
function logRows(game, n) {
  const rows = (game.log || []).slice(-n).reverse();
  if (!rows.length) return `<div class="le muted">The chronicle is empty.</div>`;
  return rows.map((e) => `<div class="le"><span class="${E(e.cls || "")}">${sanitizeLog(e.text)}</span></div>`).join("");
}
// log text may contain the game's own <b>/<span class='g'>… markup — allow a safe subset.
function sanitizeLog(t) {
  return String(t == null ? "" : t).replace(/<(?!\/?(b|br|small|span)( class='(g|r|a|muted)')?\s*\/?>)/g, "&lt;");
}

/* -------------------------------- board --------------------------------- */
function tileAt(game, r, c) { return (r >= 0 && r < 9 && c >= 0 && c < 7) ? game.board[r * 7 + c] : null; }
function edgeBetween(from, to) {
  if (to.r === from.r - 1) return ["N", "S"]; if (to.r === from.r + 1) return ["S", "N"];
  if (to.c === from.c + 1) return ["E", "W"]; if (to.c === from.c - 1) return ["W", "E"]; return null;
}
function reachableSet(game, seat) {
  const set = new Set(); if (!seat) return set;
  const from = tileAt(game, seat.r, seat.c); if (!from || !from.open) return set;
  const bough = (seat.things || []).some((t) => t.id === "golden_bough");
  [[from.r - 1, from.c], [from.r + 1, from.c], [from.r, from.c - 1], [from.r, from.c + 1]].forEach(([r, c]) => {
    const n = tileAt(game, r, c); if (!n) return;
    const e = edgeBetween(from, n); if (!e) return;
    if (!from.open[e[0]]) return;
    if (n.revealed && !(n.open && n.open[e[1]])) return;
    if (n.revealed && n.name === "cave" && !bough) return;
    set.add(r * 7 + c);
  });
  return set;
}
function cellsHtml(ctx, game, me) {
  const meSeat = game.players.find((p) => p.mark === me);
  const myTurn = game.current_player === me && game.status === "playing" && meSeat && !meSeat.tower && !meSeat.captured && !game.pending;
  const reach = myTurn ? reachableSet(game, meSeat) : new Set();
  const meta = roomMeta(ctx);
  let h = "";
  for (let r = 0; r < 9; r += 1) for (let c = 0; c < 7; c += 1) {
    const t = game.board[r * 7 + c], idx = r * 7 + c, pc = `${r},${c}`;
    const cls = ["cell"];
    if (meSeat && meSeat.r === r && meSeat.c === c) cls.push("current");
    if (reach.has(idx)) cls.push("reachable");
    h += `<div class="${cls.join(" ")}" data-cell="${pc}">`;
    if (t.revealed) {
      h += tileSvg(t, idx + 1);
      if (t.name && AREA_NAMES[t.name]) h += `<div class="infomark holdable" data-peek="area:${pc}">ⓘ</div>`;
      if (t.card) h += `<div class="cardmark holdable${pulseCell === pc ? " mw-pulse" : ""}" data-peek="card:${pc}">${denEmoji(t.card)} ${E((DEN[t.card] || {}).name || "?")}</div>`;
    } else { h += `<div class="facedown"></div>`; }
    game.players.forEach((p, i) => {
      if (p.r === r && p.c === c && !p.won) {
        const md = meta[p.mark] || {};
        const face = md.icon || (p.name || "?")[0];
        h += `<div class="tok holdable" data-peek="tok:${p.mark}" data-mark="${p.mark}" style="background:${E(md.color || p.color)};left:${6 + i * 20}px;top:6px">${E(face)}</div>`;
      }
    });
    h += `</div>`;
  }
  return h;
}
function legendHtml(ctx, game) {
  const badges = [];
  game.board.forEach((t) => { if (t.revealed && t.card) badges.push(t); });
  if (!badges.length) return `<span class="mw-leg-empty">No denizens revealed yet.</span>`;
  return badges.map((t) => {
    const pc = `${t.r},${t.c}`;
    return `<span class="mw-legbadge${pulseCell === pc ? " mw-pulse" : ""}" data-legend="${pc}">${denEmoji(t.card)} ${E((DEN[t.card] || {}).name || "?")}</span>`;
  }).join("");
}
// Glide any token whose tile changed from its previous render position.
function animateTokens(root, game) {
  (game.players || []).forEach((p) => {
    if (p.won) { prevPos[p.mark] = { r: p.r, c: p.c }; return; }
    const tok = root.querySelector(`.tok[data-mark="${p.mark}"]`);
    const prev = prevPos[p.mark];
    if (tok && prev && (prev.r !== p.r || prev.c !== p.c)) {
      const dx = (prev.c - p.c) * CW, dy = (prev.r - p.r) * CH;
      tok.style.transition = "none";
      tok.style.transform = `translate(${dx}px,${dy}px)`;
      requestAnimationFrame(() => requestAnimationFrame(() => { tok.style.transition = "transform .45s ease"; tok.style.transform = "translate(0,0)"; }));
    }
    prevPos[p.mark] = { r: p.r, c: p.c };
  });
}
// Faithful tile art: terrain, roads to open edges (over a darker lining), closed-edge semicircle,
// grass tufts, named-glade backdrop + emblem, and the gold north triangle.
function tileSvg(t, seed) {
  const half = t.half === "ench" ? "ench" : "earth";
  const H1 = `var(--${half}-h1)`, H2 = `var(--${half}-h2)`, H3 = `var(--${half}-h3)`, PP = `var(--${half}-road)`, LF = `var(--${half}-leaf)`;
  let s = seed || 1; const rr = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const ends = { N: [50, 0], E: [100, 36], S: [50, 72], W: [0, 36] };
  const open = t.open || { N: 1, E: 1, S: 1, W: 1 };
  const ok = ["N", "E", "S", "W"].filter((k) => open[k]);
  let g = `<svg viewBox="0 0 100 72"><rect x="0" y="0" width="100" height="72" fill="${H2}"/>`;
  for (let i = 0; i < 3; i += 1) g += `<ellipse cx="${(10 + rr() * 80).toFixed(1)}" cy="${(8 + rr() * 56).toFixed(1)}" rx="${(12 + rr() * 16).toFixed(1)}" ry="${(8 + rr() * 10).toFixed(1)}" fill="${H1}" opacity="${(0.14 + rr() * 0.14).toFixed(2)}"/>`;
  ok.forEach((k) => { const [x, y] = ends[k]; g += `<line x1="50" y1="36" x2="${x}" y2="${y}" stroke="${H3}" stroke-width="22" stroke-linecap="round" opacity="0.8"/>`; });
  ok.forEach((k) => { const [x, y] = ends[k]; g += `<line x1="50" y1="36" x2="${x}" y2="${y}" stroke="${PP}" stroke-width="15" stroke-linecap="round"/>`; });
  if (ok.length) g += `<circle cx="50" cy="36" r="9" fill="${PP}"/>`;
  if (ok.length) { const R = 8; ["N", "E", "S", "W"].filter((k) => !open[k]).forEach((k) => {
    let d; if (k === "N") d = `M${50 - R} 0 Q 50 ${R * 1.4} ${50 + R} 0 Z`;
    else if (k === "S") d = `M${50 - R} 72 Q 50 ${72 - R * 1.4} ${50 + R} 72 Z`;
    else if (k === "E") d = `M100 ${36 - R} Q ${100 - R * 1.4} 36 100 ${36 + R} Z`;
    else d = `M0 ${36 - R} Q ${R * 1.4} 36 0 ${36 + R} Z`;
    g += `<path d="${d}" fill="${PP}" opacity="0.85"/>`; }); }
  for (let i = 0; i < 10; i += 1) { const x = 4 + rr() * 92, y = 4 + rr() * 64; if (Math.abs(x - 50) < 13 || Math.abs(y - 36) < 11) continue; const hh = 3 + rr() * 3;
    g += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l -1.4 ${(-hh * 0.8).toFixed(1)} M${x.toFixed(1)} ${y.toFixed(1)} l 0 ${(-hh).toFixed(1)} M${x.toFixed(1)} ${y.toFixed(1)} l 1.4 ${(-hh * 0.8).toFixed(1)}" fill="none" stroke="${rr() < 0.5 ? LF : H1}" stroke-width="0.9" stroke-linecap="round" opacity="0.9"/>`; }
  if (t.name) { g += `<ellipse cx="50" cy="36" rx="23" ry="16" fill="${PP}" opacity="0.9"/>` + drawIcon(t.name)
    + `<rect x="26" y="2" width="48" height="11" rx="3" fill="#0007"/><text x="50" y="10" text-anchor="middle" font-family="var(--serif)" font-size="8" fill="var(--gold2)">${E(t.label || t.name)}</text>`; }
  g += `<path d="M9 4 l3 5 h-6 Z" fill="var(--gold)" opacity="0.85"/></svg>`;
  return g;
}
function drawIcon(name) {
  const G = "var(--gold)", Gf = "color-mix(in srgb,var(--gold) 26%,transparent)";
  const P = (d) => `<path d="${d}" fill="none" stroke="${G}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  const F = (d, f) => `<path d="${d}" fill="${f || G}" stroke="${G}" stroke-width="1.6"/>`;
  const C = (cx, cy, r, f, sw) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f || "none"}"${sw ? ` stroke="${G}" stroke-width="${sw}"` : ""}/>`;
  const map = {
    tower: () => F("M42 48 v-22 h4 v-4 h3 v4 h2 v-4 h3 v4 h4 v22 z", Gf),
    egate: () => F("M36 48 v-13 a14 14 0 0 1 28 0 v13 z", Gf) + P("M50 22 l5 5 l-5 5 l-5 -5 z"),
    xgate: () => F("M36 48 v-13 a14 14 0 0 1 28 0 v13 z", Gf) + P("M50 20 l6 6 l-6 6 l-6 -6 z") + C(50, 32, 3, "var(--gold2)"),
    cave: () => F("M33 47 q4 -21 17 -21 q13 0 17 21 z", "#1a1a10") + F("M44 47 q2 -10 6 -10 q4 0 6 10 z", "#000"),
    chapel: () => F("M50 18 l13 13 v16 h-26 v-16 z", Gf) + C(50, 33, 4, "none", 2),
    castle: () => F("M33 30 h5 v-4 h4 v4 h4 v-4 h4 v4 h4 v-4 h4 v4 h5 v17 h-39 z", Gf),
    fountain: () => P("M37 46 h26 l-3 -8 h-20 z") + P("M50 38 v-8") + C(50, 24, 3, G),
    grove: () => P("M50 48 v-12") + F("M50 18 q13 4 11 15 q-11 6 -22 0 q-2 -11 11 -15 z", Gf),
    island: () => P("M31 44 q19 7 38 0") + F("M40 40 q10 -12 20 0 z", Gf),
    palace: () => F("M50 14 l4 8 h-8 z", G) + F("M39 47 v-17 l11 -8 l11 8 v17 z", Gf),
    altar: () => F("M41 47 h18 v-4 h-18 z", G) + F("M44 43 v-13 h12 v13", Gf),
  };
  return (map[name] || map.grove)();
}

/* -------------------------------- peeks --------------------------------- */
let popEl = null, popAt = 0, popTimer = null;
function hidePop() { if (popTimer) { clearTimeout(popTimer); popTimer = null; } if (popEl) { popEl.remove(); popEl = null; } }
function requestHide() { if (!popEl) return; const MIN = 1500, el = Date.now() - popAt; if (el >= MIN) hidePop(); else { if (popTimer) clearTimeout(popTimer); popTimer = setTimeout(hidePop, MIN - el); } }
function showPop(x, y, title, body) {
  hidePop();
  popEl = document.createElement("div"); popEl.className = "mystic-wood-root mw-pop";
  popEl.innerHTML = `<b>${title}</b><div class="popbody">${body}</div>`;
  document.body.appendChild(popEl); popAt = Date.now();
  const r = popEl.getBoundingClientRect();
  popEl.style.left = Math.max(8, Math.min(window.innerWidth - r.width - 8, x - r.width / 2)) + "px";
  popEl.style.top = Math.max(8, y - r.height - 12) + "px";
}
function peekContent(game, spec) {
  const [type, arg] = spec.split(":");
  if (type === "area") { const [r, c] = arg.split(",").map(Number); const t = tileAt(game, r, c); const half = t.half === "ench" ? "Enchanted" : "Earthly"; return { title: AREA_NAMES[t.name], body: `${AREA_FX[t.name] || "A place in the wood."}<br><span style="color:var(--muted)">${half} Wood · tile (${r},${c})</span>` }; }
  if (type === "card") { const [r, c] = arg.split(",").map(Number); const t = tileAt(game, r, c); return { title: `${denEmoji(t.card)} ${(DEN[t.card] || {}).name || "?"}`, body: denizenSummary(t.card) }; }
  if (type === "tok" || type === "stats") { const seat = game.players.find((p) => p.mark === arg); return { title: seat ? E(seat.name) : "Knight", body: playerPeek(seat) }; }
  if (type === "thing") return { title: (THINGS[arg] || {}).name || arg, body: THING_DESC[arg] || "A magical Thing." };
  if (type === "comp") return { title: (DEN[arg] || {}).name || arg, body: COMP_DESC[arg] || "A companion travelling with you." };
  if (type === "prowess") return { title: "Prowess card", body: "+1 Prowess — won by slaying a beast. Adds to your Prowess in every contest." };
  if (type === "horse") return { title: "Horse", body: "+2 Strength. Not a companion; another knight can win it in a joust." };
  if (type === "tower") return { title: "Imprisoned in the Tower", body: "Each turn roll a die — escape on 5–6, or freed on the 4th turn. The Key frees you at once." };
  if (type === "captured") return { title: "Captured by the Enchantress", body: "Each turn, roll — escape on a 6." };
  return null;
}
function denizenSummary(id) {
  const den = DEN[id]; if (!den) return "Unknown.";
  const lines = []; const stats = []; if (den.S) stats.push(`Strength ${den.S}`); if (den.P) stats.push(`Prowess ${den.P}`);
  lines.push(`<b>${DEN_CLASS[den.cls] || "Denizen"}</b>${stats.length ? " · " + stats.join(" · ") : ""}`);
  lines.push(den.cls === "beast" ? "Challenge with your Strength." : den.cls === "magic" ? "Challenge with your Prowess." : den.cls === "warrior" ? "Challenge with Strength + Prowess." : "Greet — roll a die.");
  if (den.slay) lines.push(`Vanquish → ${den.slay} (+1 Prowess).`);
  if (id === "wizard") lines.push("Vanquish → Lance (+1 Strength).");
  else if (den.gives) lines.push(`Vanquish → ${THINGS[den.gives].name}.`);
  if (den.dragon) lines.push("Only George can slay it.");
  if (den.king) lines.push("Vanquish → become King.");
  if (den.captures) lines.push("If it wins, it captures you (escape on a 6).");
  const rr = tblRows(den.tbl);
  if (rr) { if (rr.length === 1) lines.push(`Greet → ${rr[0].effect}.`); else lines.push("Reactions: " + rr.map((r) => `${r.range} ${r.effect}`).join(" · ")); }
  return lines.join("<br>");
}
function playerPeek(seat) {
  if (!seat) return "";
  const list = (a) => a && a.length ? a.join(", ") : "none";
  const lines = [
    `<b style="color:var(--azure)">Prowess ${seat.totalP}</b> · <b style="color:var(--crimson)">Strength ${seat.totalS}</b>`,
    `Quest: ${E(seat.quest || "")}${seat.questDone ? " ✓" : ""}`,
    `Things: ${list((seat.things || []).map((t) => t.name))}`,
    `Prowess: ${list(seat.prowess || [])}`,
    `Companions: ${list((seat.companions || []).map((c) => c.name))}`,
  ];
  if (seat.horse) lines.push("Horse: +2 Strength");
  if (seat.isKing) lines.push("👑 King");
  if (seat.tower) lines.push("⛓ In the Tower");
  if (seat.captured) lines.push("✦ Captured");
  return lines.join("<br>");
}
const ACT_LABEL = (a) => a === "remains" ? "remains / ignores you" : a === "transport" ? "vanishes to the far wood" : a === "transportYou" ? "transports you away" : a === "befriend" ? "befriends you" : a === "tower" ? "betrays you → Tower" : a && a.startsWith("give:") ? "gives " + THINGS[a.slice(5)].name : a && a.startsWith("run") ? "the Horse runs off" : (a || "remains");
function tblRows(tbl) {
  if (!tbl) return null;
  const a = []; for (let i = 1; i <= 6; i += 1) a.push(tbl[i] || "remains");
  const res = []; let i = 0;
  while (i < 6) { let j = i; while (j + 1 < 6 && a[j + 1] === a[i]) j++; res.push({ range: (i === j ? `${i + 1}` : `${i + 1}–${j + 1}`), effect: ACT_LABEL(a[i]) }); i = j + 1; }
  return res;
}

/* ------------------------------ encounter ------------------------------- */
function portal() { const p = document.createElement("div"); p.className = "mystic-wood-root mw-portal"; document.body.appendChild(p); return p; }
function closePortals() { document.querySelectorAll(".mw-portal").forEach((n) => n.remove()); }
function showEncounter(ctx, game) {
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
    closePortals(); ctx.makeMove({ type: "encounter", choice: b.getAttribute("data-enc") });
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
function diceRow(label, cls, die, parts, total) {
  let h = `<div class="dicerow"><span class="drlabel">${label}</span><div class="die ${cls}">${die}</div>`;
  (parts || []).forEach((pt) => { h += `<span class="drop">+</span><span class="drbon">${E(pt.l)} ${pt.v}</span>`; });
  if (total != null) h += `<span class="drtot">= ${total}</span>`;
  return h + `</div>`;
}
function showDice(ctx, roll) {
  closePortals();
  const host = portal();
  let inner;
  if (roll.greet) {
    inner = `<div class="tag">You greet the ${E(roll.foeName)}</div>
      <div class="result mw-result-big">${sanitizeLog(roll.result || "The denizen reacts.")}</div>
      <div class="hint">the roll:</div>
      ${diceRow("Roll", "white", roll.die, null, null)}
      <div class="row"><button class="primary" data-close="1">Continue</button></div>`;
  } else {
    const res = roll.outcome === "win" ? `<span class="g">⚔️✨ Victory! — ${roll.mine} vs ${roll.foe}</span>`
      : roll.outcome === "captured" ? `<span class="r">✦ Captured by the Enchantress! — ${roll.mine} vs ${roll.foe}</span>`
      : `<span class="r">💀 Defeated — ${roll.mine} vs ${roll.foe}<br>⛓️ To the Tower — companions lost.</span>`;
    inner = `<div class="tag">Encounter result</div>
      <div class="result mw-result-big">${res}</div>
      <div class="hint">the dice — white = you · red = foe:</div>
      ${diceRow("You", "white", roll.white, roll.mineParts, roll.mine)}
      ${diceRow(E(roll.foeName), "red", roll.red, roll.foeParts, roll.foe)}
      <div class="row"><button class="primary" data-close="1">Continue</button></div>`;
  }
  host.innerHTML = `<div class="overlay"><div class="modal">${inner}</div></div>`;
  const close = host.querySelector("[data-close]");
  if (close) close.addEventListener("click", () => closePortals());
}

/* ------------------------------- wiring --------------------------------- */
function wireTop(root, ctx, game, me) {
  root.querySelectorAll("[data-top]").forEach((b) => b.addEventListener("click", () => {
    const w = b.getAttribute("data-top");
    if (w === "zoom") { view.zoom = 0; view.focus = null; applyZoom(); }
    else if (w === "knights") openPanel(root, ctx, game, me, "knights");
    else if (w === "chron") openPanel(root, ctx, game, me, "chron");
  }));
}
function wireBoard(root, ctx, game, me) {
  root.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
    if (ctx.isMovePending && ctx.isMovePending()) return;
    const a = b.getAttribute("data-act");
    if (a === "end") ctx.makeMove({ type: "end-turn" });
    else if (a === "scry") ctx.makeMove({ type: "scry" });
    else if (a === "rotate") ctx.makeMove({ type: "rotate" });
    else if (a === "drink") ctx.makeMove({ type: "drink" });
    else if (a === "transport") openTransport(root, ctx, game, me);
  }));
  root.querySelectorAll(".cell").forEach((cell) => {
    cell.addEventListener("click", (ev) => {
      if (ev.target.closest(".holdable")) return; // a peek tap, not a move/zoom
      const [r, c] = cell.getAttribute("data-cell").split(",").map(Number);
      if (clickTimer) {                                   // double tap → zoom in on this tile
        clearTimeout(clickTimer); clickTimer = null;
        view.focus = { r, c }; view.zoom = Math.min(ZOOM_WIDTHS.length - 1, (view.zoom || 0) + 1); applyZoom();
        return;
      }
      clickTimer = setTimeout(() => {                     // single tap → move (if reachable)
        clickTimer = null;
        if (cell.classList.contains("reachable") && !(ctx.isMovePending && ctx.isMovePending())) ctx.makeMove({ type: "move", r, c });
      }, 250);
    });
  });
  // legend badges: tap to pulse the badge and its tile on the map
  root.querySelectorAll("[data-legend]").forEach((b) => b.addEventListener("click", () => {
    const pc = b.getAttribute("data-legend");
    pulseCell = pulseCell === pc ? null : pc;
    renderMysticWoodGame(ctx);
  }));
  // press-and-hold peeks
  root.querySelectorAll("[data-peek]").forEach((el) => {
    const show = (ev) => { ev.preventDefault(); ev.stopPropagation(); const pt = ev.touches ? ev.touches[0] : ev; const c = peekContent(game, el.getAttribute("data-peek")); if (c) showPop(pt.clientX, pt.clientY, c.title, c.body); };
    el.addEventListener("mousedown", show); el.addEventListener("touchstart", show, { passive: false });
    el.addEventListener("mouseleave", requestHide); el.addEventListener("click", (e) => e.stopPropagation());
  });
}
document.addEventListener("mouseup", requestHide);
document.addEventListener("touchend", requestHide);

function openPanel(root, ctx, game, me, which) {
  closePanel();
  const back = document.createElement("div"); back.className = "mw-backdrop"; back.addEventListener("click", closePanel); document.body.appendChild(back);
  const panel = document.createElement("div"); panel.className = "mystic-wood-root mw-panelover " + (which === "knights" ? "mw-knights" : "mw-chronicle");
  if (which === "knights") panel.innerHTML = `<h2 style="font-size:22px;margin-bottom:10px">Knights</h2>${game.players.map((p) => knightCard(p, p.mark === game.current_player)).join("")}`;
  else panel.innerHTML = `<h2 style="font-size:22px;margin-bottom:10px">Chronicle</h2><div>${logRows(game, 60)}</div>`;
  document.body.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add("open"));
  panel.querySelectorAll("[data-peek]").forEach((el) => { const show = (ev) => { ev.stopPropagation(); const pt = ev.touches ? ev.touches[0] : ev; const c = peekContent(game, el.getAttribute("data-peek")); if (c) showPop(pt.clientX, pt.clientY, c.title, c.body); }; el.addEventListener("mousedown", show); el.addEventListener("touchstart", show, { passive: false }); });
}
function closePanel() { document.querySelectorAll(".mw-panelover,.mw-backdrop").forEach((n) => n.remove()); }
function knightCard(p, active) {
  return `<div class="card pl${active ? " active" : ""}">
    <div class="plhead"><span class="crest" style="background:${E(p.color)}">${E((p.name || "?")[0])}</span>
      <span class="plname" style="color:${E(p.color)}">${E(p.name)}${p.is_bot ? " 🤖" : ""}</span>${p.isKing ? `<span class="chip">👑 King</span>` : ""}</div>
    ${statsHtml(p)}
    <div class="quest">${p.questDone ? "✓ " : ""}${E(p.quest || "")}</div>
    <div class="inv">${invHtml(p)}</div>
  </div>`;
}
function openTransport(root, ctx, game, me) {
  const seat = game.players.find((p) => p.mark === me);
  const dests = game.board.filter((t) => t.revealed && t.name && !(t.r === seat.r && t.c === seat.c) && !game.players.some((q) => q.mark !== me && !q.won && q.r === t.r && q.c === t.c));
  const bar = root.querySelector(".mw-actions"); if (!bar) return;
  if (!dests.length) { bar.innerHTML = `<button disabled>No open place to transport to yet</button>`; return; }
  bar.innerHTML = dests.map((t) => `<button data-tp="${t.r},${t.c}">${E(AREA_NAMES[t.name] || t.name)}</button>`).join("") + `<button data-tp="cancel">Cancel</button>`;
  bar.querySelectorAll("[data-tp]").forEach((b) => b.addEventListener("click", () => {
    const v = b.getAttribute("data-tp"); if (v === "cancel") { renderMysticWoodGame(ctx); return; }
    const [r, c] = v.split(",").map(Number); ctx.makeMove({ type: "transport", r, c });
  }));
}

/* -------------------------------- zoom ---------------------------------- */
function applyZoom() {
  if (!zoomCtx) return;
  const { root, game, me } = zoomCtx;
  const wrap = root.querySelector(".mw-boardwrap"), board = root.querySelector(".board");
  if (!wrap || !board) return;
  const CELL = 96, gap = 3, cw = CELL + gap, ch = CELL * 0.72 + gap, pad = 8;
  const bw = 7 * cw - gap + pad * 2, bh = 9 * ch - gap + pad * 2;
  // MAX VERTICAL: stretch the board window to fill the space down to the viewport bottom
  const kids = [...root.children], wi = kids.indexOf(wrap);
  const belowH = kids.slice(wi + 1).reduce((a, c) => a + c.offsetHeight, 0);
  const avail = Math.floor(window.innerHeight - wrap.getBoundingClientRect().top - belowH - 6);
  if (avail > 200) wrap.style.height = avail + "px";
  const vw = wrap.clientWidth, vh = wrap.clientHeight; if (!vw || !vh) return;
  const N = ZOOM_WIDTHS[view.zoom || 0] || 7;
  let scale = vw / (N * cw);
  if ((view.zoom || 0) === 0) scale = Math.min(vw / bw, vh / bh);   // full view: fit the WHOLE board (real bw/bh incl. padding) so it centres
  const seat = game.players.find((p) => p.mark === me);
  const f = view.focus || (seat ? { r: seat.r, c: seat.c } : { r: 4, c: 3 });
  const fx = pad + (f.c + 0.5) * cw - gap / 2, fy = pad + (f.r + 0.5) * ch - gap / 2;
  let tx = vw / 2 - fx * scale, ty = vh / 2 - fy * scale;
  const sw = bw * scale, sh = bh * scale;
  tx = sw > vw ? Math.min(0, Math.max(vw - sw, tx)) : (vw - sw) / 2;
  ty = sh > vh ? Math.min(0, Math.max(vh - sh, ty)) : (vh - sh) / 2;
  board.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${scale.toFixed(3)})`;
}
