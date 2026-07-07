// The Mystic Wood — browser client. Renders the 7×9 explorable board (with 3-level zoom), the seat
// list, encounter prompts, and power actions from the server projection (ctx.game), and posts intents
// via ctx.makeMove. Idempotent snapshot rendering: everything is re-derived from ctx.game each call;
// only transient view state (zoom lens, focus, log toggle) is kept in module scope, reset per game.
// The shell hands us #macroBoard and hides its tic-tac-toe chrome; we own the whole board + turn UI.
import { renderHostStartLobby } from "../lobby.js";
import { MYSTIC_WOOD_CSS } from "./styles.js";

const AREA_EMOJI = { xgate: "✨", egate: "🚪", tower: "🗼", grove: "🌳", palace: "🏛️", island: "🏝️", altar: "⛩️", cave: "🕳️", chapel: "⛪", castle: "🏰", fountain: "⛲" };
const AREA_LABEL = { xgate: "Enchanted Gate", egate: "Earthly Gate", tower: "Tower", grove: "Grove", palace: "Palace", island: "Isle", altar: "Altar", cave: "Cave", chapel: "Chapel", castle: "Castle", fountain: "Font" };
const DEN_EMOJI = { dragon: "🐉", ox: "🐂", boar: "🐗", troll: "👹", giant: "🗿", orc: "👺", saracen: "⚔️", king: "👑", wizard: "🧙", illusion: "🌀", enchantress: "🧝‍♀️", horse: "🐎", rogue: "🗡️", witch: "🧙‍♀️", druid: "🌿", elf: "🏹", merlin: "🔮", hermit: "🧓", bishop: "⛪", archmage: "✨", magician: "🌩️", sage: "📜", princess: "👸", prince: "🤴", grail: "🏆", dwarf: "⛏️", queen: "👸", nymph: "💧", fog: "🌫️", horn: "📯", wind: "🌬️" };
const ZOOM_WIDTHS = [7, 5, 3, 2];

let styled = false;
let view = { gameKey: null, zoom: 0, focus: null, showLog: false };
let zoomCtx = null;
let resizeHooked = false;

function injectStyles() {
  if (styled || document.getElementById("mystic-wood-styles")) { styled = true; return; }
  styled = true;
  const el = document.createElement("style");
  el.id = "mystic-wood-styles";
  el.textContent = MYSTIC_WOOD_CSS;
  document.head.appendChild(el);
}
function localMark(ctx) {
  const seat = ((ctx.room && ctx.room.players) || []).find((p) => p.id === ctx.localPlayerId);
  return seat ? seat.mark : null;
}
const esc = (ctx, s) => (ctx.escapeHtml ? ctx.escapeHtml(String(s == null ? "" : s)) : String(s == null ? "" : s));

export function renderMysticWoodGame(ctx) {
  injectStyles();
  const host = ctx.host;
  if (!host) return;
  if (!ctx.started) {
    renderHostStartLobby(host, ctx, {
      wrap: "mystic-wood-root",
      heading: "Knights",
      blurb: "Each knight has a unique quest. Invite players or bots (3–5 seats, bots fill), then start — knights are dealt at random.",
    });
    return;
  }
  const game = ctx.game || {};
  const gameKey = `${(ctx.room && ctx.room.code) || "?"}`;
  if (view.gameKey !== gameKey) view = { gameKey, zoom: 0, focus: null, showLog: false };
  if (!resizeHooked) { resizeHooked = true; window.addEventListener("resize", () => applyZoom()); }

  let root = host.querySelector(".mystic-wood-root");
  if (!root) { host.innerHTML = ""; root = document.createElement("div"); root.className = "mystic-wood-root"; host.appendChild(root); }
  const me = localMark(ctx);

  if (game.status === "complete") { root.innerHTML = endHtml(ctx, game); wire(root, ctx, game, me); return; }
  root.innerHTML = boardHtml(ctx, game, me);
  wire(root, ctx, game, me);
  zoomCtx = { root, game, me };
  applyZoom();
  requestAnimationFrame(() => applyZoom());   // re-apply once the board window has its laid-out width
}

/* ------------------------------- board ---------------------------------- */
function tileAt(game, r, c) { return (r >= 0 && r < 9 && c >= 0 && c < 7) ? game.board[r * 7 + c] : null; }
function edgeBetween(from, to) {
  if (to.r === from.r - 1) return ["N", "S"]; if (to.r === from.r + 1) return ["S", "N"];
  if (to.c === from.c + 1) return ["E", "W"]; if (to.c === from.c - 1) return ["W", "E"]; return null;
}
function reachableSet(game, seat) {
  const set = new Set();
  if (!seat) return set;
  const from = tileAt(game, seat.r, seat.c);
  if (!from || !from.open) return set;
  const hasBough = (seat.things || []).some((t) => t.id === "golden_bough");
  [[from.r - 1, from.c], [from.r + 1, from.c], [from.r, from.c - 1], [from.r, from.c + 1]].forEach(([r, c]) => {
    const n = tileAt(game, r, c); if (!n) return;
    const e = edgeBetween(from, n); if (!e) return;
    if (!from.open[e[0]]) return;
    if (n.revealed && !(n.open && n.open[e[1]])) return;
    if (n.revealed && n.name === "cave" && !hasBough) return;
    set.add(r * 7 + c);
  });
  return set;
}
function tileSvg(t) {
  const half = t.half === "ench" ? "ench" : "earth";
  const H2 = `var(--${half}-h2)`, H3 = `var(--${half}-h3)`, RD = `var(--${half}-road)`;
  const ends = { N: [50, 0], E: [100, 36], S: [50, 72], W: [0, 36] };
  const open = t.open || { N: 1, E: 1, S: 1, W: 1 };
  const ok = ["N", "E", "S", "W"].filter((k) => open[k]);
  let s = `<svg viewBox="0 0 100 72"><rect width="100" height="72" fill="${H2}"/>`;
  ok.forEach((k) => { const [x, y] = ends[k]; s += `<line x1="50" y1="36" x2="${x}" y2="${y}" stroke="${H3}" stroke-width="22" stroke-linecap="round" opacity="0.8"/>`; });
  ok.forEach((k) => { const [x, y] = ends[k]; s += `<line x1="50" y1="36" x2="${x}" y2="${y}" stroke="${RD}" stroke-width="15" stroke-linecap="round"/>`; });
  if (ok.length) s += `<circle cx="50" cy="36" r="9" fill="${RD}"/>`;
  if (ok.length) {
    const R = 8;
    ["N", "E", "S", "W"].filter((k) => !open[k]).forEach((k) => {
      let d;
      if (k === "N") d = `M${50 - R} 0 Q 50 ${R * 1.4} ${50 + R} 0 Z`;
      else if (k === "S") d = `M${50 - R} 72 Q 50 ${72 - R * 1.4} ${50 + R} 72 Z`;
      else if (k === "E") d = `M100 ${36 - R} Q ${100 - R * 1.4} 36 100 ${36 + R} Z`;
      else d = `M0 ${36 - R} Q ${R * 1.4} 36 0 ${36 + R} Z`;
      s += `<path d="${d}" fill="${RD}" opacity="0.85"/>`;
    });
  }
  if (t.name) s += `<ellipse cx="50" cy="36" rx="23" ry="16" fill="${RD}" opacity="0.9"/>`;
  s += `<path d="M9 4 l3 5 h-6 Z" fill="var(--mw-gold)" opacity="0.85"/></svg>`;
  return s;
}
function cellsHtml(ctx, game, me, reach, myTurn) {
  let h = "";
  for (let r = 0; r < 9; r += 1) {
    for (let c = 0; c < 7; c += 1) {
      const t = game.board[r * 7 + c];
      const cls = ["mw-cell"];
      const idx = r * 7 + c;
      const meSeat = game.players.find((p) => p.mark === me);
      if (meSeat && meSeat.r === r && meSeat.c === c) cls.push("mw-current");
      if (myTurn && reach.has(idx)) cls.push("mw-reachable");
      h += `<div class="${cls.join(" ")}" data-r="${r}" data-c="${c}">`;
      if (t.revealed) {
        h += tileSvg(t);
        if (t.name) h += `<span class="mw-place">${AREA_EMOJI[t.name] || "◆"} ${esc(ctx, AREA_LABEL[t.name] || "")}</span>`;
        if (t.card) h += `<span class="mw-card">${DEN_EMOJI[t.card] || "❓"}</span>`;
      } else {
        h += `<div class="mw-facedown"></div>`;
      }
      game.players.forEach((p, i) => {
        if (p.r === r && p.c === c && !p.won) {
          h += `<span class="mw-tok" style="background:${esc(ctx, p.color || "#999")};left:${8 + i * 18}%">${esc(ctx, (p.name || "?")[0])}</span>`;
        }
      });
      h += `</div>`;
    }
  }
  return h;
}
function boardHtml(ctx, game, me) {
  const cur = game.players.find((p) => p.mark === game.current_player);
  const isMine = game.current_player === me;
  const myTurn = isMine && game.status === "playing";
  const meSeat = game.players.find((p) => p.mark === me);
  const reach = (myTurn && !game.pending && meSeat && !meSeat.tower && !meSeat.captured) ? reachableSet(game, meSeat) : new Set();
  const turnLabel = cur ? (isMine ? "Your turn" : `${esc(ctx, cur.name)}'s turn`) : "—";
  return `
    <div class="mw-hud">
      <div class="mw-turn"><span class="mw-dot" style="background:${cur ? esc(ctx, cur.color) : "#666"}"></span><span class="mw-serif">${turnLabel}</span></div>
      <button class="mw-btn" data-act="zoom" title="Reset zoom">🔍</button>
      <button class="mw-btn" data-act="log" title="Chronicle">📜</button>
    </div>
    <div class="mw-boardwrap"><div class="mw-board">${cellsHtml(ctx, game, me, reach, myTurn)}</div></div>
    ${seatsHtml(ctx, game)}
    ${game.pending && game.pending.mark === me ? encounterHtml(ctx, game) : actionsHtml(ctx, game, me, meSeat, isMine)}
    ${view.showLog ? logHtml(ctx, game) : ""}
  `;
}
function seatsHtml(ctx, game) {
  return `<div class="mw-seats">${game.players.map((p) => {
    const turn = p.mark === game.current_player ? "▶ " : "";
    const badges = [];
    if (p.isKing) badges.push("👑 King");
    if (p.tower) badges.push("⛓ Tower");
    if (p.captured) badges.push("✦ Captured");
    if (p.horse) badges.push("🐎 Horse");
    (p.things || []).forEach((t) => badges.push(esc(ctx, t.name)));
    (p.companions || []).forEach((c) => badges.push(esc(ctx, c.name)));
    (p.prowess || []).forEach((n) => badges.push(esc(ctx, n)));
    return `<div class="mw-seat${p.mark === game.current_player ? " mw-active" : ""}">
      <div class="mw-seat-r1"><span class="mw-dot" style="background:${esc(ctx, p.color || "#999")}"></span><span class="mw-seat-name mw-serif">${turn}${esc(ctx, p.name)}${p.is_bot ? " 🤖" : ""}</span></div>
      <div class="mw-seat-stats"><span class="mw-p">P${p.totalP}</span> · <span class="mw-s">S${p.totalS}</span></div>
      <div class="mw-seat-quest">${p.questDone ? "✓ " : ""}${esc(ctx, p.quest || "")}</div>
      ${badges.length ? `<div class="mw-badges">${badges.map((b) => `<span class="mw-badge">${b}</span>`).join("")}</div>` : ""}
    </div>`;
  }).join("")}</div>`;
}
function actionsHtml(ctx, game, me, meSeat, isMine) {
  if (!isMine || game.status !== "playing") {
    const cur = game.players.find((p) => p.mark === game.current_player);
    return `<div class="mw-actions"><button class="mw-btn" disabled>Waiting for ${cur ? esc(ctx, cur.name) : "…"}…</button></div>`;
  }
  if (meSeat && (meSeat.tower || meSeat.captured)) {
    return `<div class="mw-actions"><button class="mw-btn" disabled>${meSeat.captured ? "Captured — roll to break free" : "Imprisoned — roll to escape"}</button></div>`;
  }
  const tile = tileAt(game, meSeat.r, meSeat.c);
  const has = (id) => (meSeat.things || []).some((t) => t.id === id);
  const comp = (id) => (meSeat.companions || []).some((c) => c.id === id);
  let btns = "";
  if (tile && tile.name === "fountain") btns += `<button class="mw-btn" data-act="drink">⛲ Drink</button>`;
  if (has("crystal")) btns += `<button class="mw-btn" data-act="scry">🔮 Scry</button>`;
  if (has("wand")) btns += `<button class="mw-btn" data-act="rotate">🔄 Rotate</button>`;
  if (comp("archmage")) btns += `<button class="mw-btn" data-act="transport">✨ Transport</button>`;
  btns += `<button class="mw-btn mw-primary" data-act="end">End turn</button>`;
  const scry = game.scry_reveal ? `<button class="mw-btn" disabled>🔮 Next: ${DEN_EMOJI[game.scry_reveal] || ""} ${esc(ctx, game.scry_reveal)}</button>` : "";
  return `<div class="mw-actions">${btns}${scry}</div>`;
}
function encounterHtml(ctx, game) {
  const p = game.pending;
  const emoji = DEN_EMOJI[p.card] || "❓";
  let line = "";
  if (p.combat && p.preview) {
    const diff = p.preview.mine - p.preview.foe;
    const cls = diff > 0 ? "mw-good" : diff < 0 ? "mw-bad" : "";
    line = `<div class="mw-enc-line ${cls}"><b>${esc(ctx, p.preview.label)}</b> — <span class="mw-num">${p.preview.mine}</span> vs <span class="mw-num">${p.preview.foe}</span> <b>(${diff >= 0 ? "+" : "−"}${Math.abs(diff)})</b></div>`;
  } else {
    line = `<div class="mw-enc-line">Greet this denizen and roll for its reaction.</div>`;
  }
  const choice = p.combat ? "challenge" : "greet";
  const label = p.combat ? "⚔️ Challenge" : "🤝 Greet";
  return `<div class="mw-panel-card">
    <div class="mw-enc-title">${emoji} ${esc(ctx, p.denName || "An encounter")}</div>
    ${line}
    <div class="mw-enc-actions"><button class="mw-btn mw-primary" data-act="enc" data-choice="${choice}">${label}</button></div>
  </div>`;
}
function logHtml(ctx, game) {
  const rows = (game.log || []).slice(-14).reverse().map((e) => `<div class="mw-le"><span class="${esc(ctx, e.cls || "")}">${esc(ctx, e.text).replace(/&lt;br&gt;/g, "<br>")}</span></div>`).join("");
  return `<div class="mw-log">${rows || "<div class='mw-le muted'>The chronicle is empty.</div>"}</div>`;
}
function endHtml(ctx, game) {
  const w = game.players.find((p) => p.mark === game.winner);
  const reason = game.end_reason && game.end_reason.reason === "castle" ? "holds the Castle as King" : "escaped the wood, quest fulfilled";
  return `<div class="mw-panel-card mw-end">
    <div class="mw-serif" style="color:var(--mw-gold2)">Victory</div>
    <h2 style="color:${w ? esc(ctx, w.color) : "var(--mw-gold)"}">${w ? esc(ctx, w.name) : "Someone"} wins!</h2>
    <p>${w ? esc(ctx, w.name) : "The victor"} ${reason} and rules the Mystic Wood.</p>
  </div>${logHtml(ctx, game)}`;
}

/* ------------------------------- wiring --------------------------------- */
function wire(root, ctx, game, me) {
  root.querySelectorAll("[data-act]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const act = el.getAttribute("data-act");
      if (act === "zoom") { view.zoom = 0; view.focus = null; applyZoom(); return; }
      if (act === "log") { view.showLog = !view.showLog; renderMysticWoodGame(ctx); return; }
      if (ctx.isMovePending && ctx.isMovePending()) return;
      if (act === "end") ctx.makeMove({ type: "end-turn" });
      else if (act === "scry") ctx.makeMove({ type: "scry" });
      else if (act === "rotate") ctx.makeMove({ type: "rotate" });
      else if (act === "drink") ctx.makeMove({ type: "drink" });
      else if (act === "transport") openTransport(root, ctx, game, me);
      else if (act === "enc") ctx.makeMove({ type: "encounter", choice: el.getAttribute("data-choice") });
    });
  });
  root.querySelectorAll(".mw-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const r = Number(cell.getAttribute("data-r")), c = Number(cell.getAttribute("data-c"));
      if (cell.classList.contains("mw-reachable")) {
        if (ctx.isMovePending && ctx.isMovePending()) return;
        ctx.makeMove({ type: "move", r, c });
      } else {
        view.focus = { r, c };
        view.zoom = ((view.zoom || 0) + 1) % ZOOM_WIDTHS.length;
        applyZoom();
      }
    });
  });
}
// Arch-Mage: pick any revealed named place to be sent to.
function openTransport(root, ctx, game, me) {
  const seat = game.players.find((p) => p.mark === me);
  const dests = game.board.filter((t) => t.revealed && t.name && !(t.r === seat.r && t.c === seat.c)
    && !game.players.some((q) => q.mark !== me && !q.won && q.r === t.r && q.c === t.c));
  const bar = root.querySelector(".mw-actions");
  if (!bar) return;
  if (!dests.length) { bar.innerHTML = `<button class="mw-btn" disabled>No open place to transport to yet</button>`; return; }
  bar.innerHTML = dests.map((t) => `<button class="mw-btn" data-tp="${t.r},${t.c}">${AREA_EMOJI[t.name] || "◆"} ${esc(ctx, AREA_LABEL[t.name] || t.name)}</button>`).join("")
    + `<button class="mw-btn" data-tp="cancel">Cancel</button>`;
  bar.querySelectorAll("[data-tp]").forEach((b) => b.addEventListener("click", () => {
    const v = b.getAttribute("data-tp");
    if (v === "cancel") { renderMysticWoodGame(ctx); return; }
    const [r, c] = v.split(",").map(Number);
    ctx.makeMove({ type: "transport", r, c });
  }));
}

/* ------------------------------- zoom ----------------------------------- */
function applyZoom() {
  if (!zoomCtx) return;
  const { root, game, me } = zoomCtx;
  const wrap = root.querySelector(".mw-boardwrap");
  const board = root.querySelector(".mw-board");
  if (!wrap || !board) return;
  const CELL = 100, cw = CELL, ch = CELL * 0.72;
  const bw = 7 * cw, bh = 9 * ch;
  const vw = wrap.clientWidth, vh = wrap.clientHeight;
  if (!vw || !vh) return;
  const N = ZOOM_WIDTHS[view.zoom || 0] || 7;
  const scale = vw / (N * cw);
  const seat = game.players.find((p) => p.mark === me);
  const f = view.focus || (seat ? { r: seat.r, c: seat.c } : { r: 4, c: 3 });
  const fx = (f.c + 0.5) * cw, fy = (f.r + 0.5) * ch;
  let tx = vw / 2 - fx * scale, ty = vh / 2 - fy * scale;
  const sw = bw * scale, sh = bh * scale;
  tx = sw > vw ? Math.min(0, Math.max(vw - sw, tx)) : (vw - sw) / 2;
  ty = sh > vh ? Math.min(0, Math.max(vh - sh, ty)) : (vh - sh) / 2;
  board.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${scale.toFixed(3)})`;
}
