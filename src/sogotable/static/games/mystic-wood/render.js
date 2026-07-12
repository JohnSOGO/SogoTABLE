// The Mystic Wood — browser client. The UI is LIFTED from the AI/Mystic_Wood prototype (tiles with
// road/emblem art, the topbar + knight-strip + board + log + actions layout, slide-over Knights/
// Chronicle panels, press-and-hold peeks, the encounter card, and the dice-reveal modal). Only the two
// seams are rewired: data source (the ctx.game projection) and intent (ctx.makeMove). Snapshot render.
import { renderHostStartLobby } from "../lobby.js";
import { MYSTIC_WOOD_CSS } from "./styles.js";
import { syncHorn, resetHorn, hornOwnsTokens, hornRemainingMs } from "./horn.js";
import { syncHerald, resetHeralds, raiseHerald } from "./herald.js";
import { KNIGHTS, THINGS, DEN, DEN_CLASS, THING_DESC, COMP_DESC, AREA_NAMES, AREA_FX, EVENT_TALE } from "./content.js";
import { E, denEmoji, sanitizeLog, tblRows, tileAt, tileSvg } from "./util.js";
import { closePortals, showEncounter, showGreetPick, showCombatPick, showEscapePick, showDice, showIntro, initEncounter, signalWorking, clearWorking } from "./encounter.js";

const ZOOM_WIDTHS = [7, 5, 3, 2];
const CW = 99, CH = 72.12;   // board grid stride (cell 96 + gap 3, row 69.12 + gap 3)
const GLIDE_MS = 450;        // token move glide duration; encounter reveal waits this out
const ROTATE_MS = 2000;      // a tile "turns about" (Fog/Wand) — spin it 180° over this long (bug mrgkf242)
let styled = false, resizeHooked = false, zoomCtx = null, seenRoll = 0, uiRoot = null, seenRotation = 0, gameStartAt = 0;
// Debug-only wall-clock: how long this room's game has run. Persisted per room so a reload doesn't reset it.
// Shown only in the expanded Chronicle panel (mrh7ri98) — the game state stays pure; this is client-side.
function elapsedStr() {
  if (!gameStartAt) return "";
  const s = Math.max(0, Math.floor((Date.now() - gameStartAt) / 1000));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
let view = { gameKey: null, zoom: 0, focus: null, panel: null };
let prevPos = {};      // mark -> {r,c}, for gliding tokens between tiles
let pulseCell = null;  // "r,c" of the legend/map badge currently highlighted
let clickTimer = null; // deferred single-tap move (cancelled when a 2nd tap makes it a double-tap zoom)
let lastTapAt = 0;      // timestamp of the previous board tap, for pointer-based double-tap detection
let gesture = null;     // active board pointer gesture (tap / double-tap / drag-pan), from pointer events
let chronFilter = null; // Chronicle: mark of the knight whose entries are shown (null = all)
let stormMode = false;  // Magician storm-targeting: cells become storm targets and a tap raises a storm
let encTimer = null;    // deferred encounter reveal (waits for the mover's token glide)
let introShownFor = null; // gameKey whose start-of-game knight send-off has been shown this session

function roomMeta(ctx) { const m = {}; ((ctx.room && ctx.room.players) || []).forEach((p) => { m[p.mark] = { icon: p.icon || "", color: p.color }; }); return m; }

function injectStyles() {
  if (styled || document.getElementById("mystic-wood-styles")) { styled = true; return; }
  styled = true;
  const el = document.createElement("style"); el.id = "mystic-wood-styles"; el.textContent = MYSTIC_WOOD_CSS;
  document.head.appendChild(el);
}
function localMark(ctx) { const s = ((ctx.room && ctx.room.players) || []).find((p) => p.id === ctx.localPlayerId); return s ? s.mark : null; }
// render.js is the renderer the encounter/result modals re-enter after a modal closes; register it once.
initEncounter(renderMysticWoodGame);

/* ------------------------------- entry ---------------------------------- */
export function renderMysticWoodGame(ctx) {
  injectStyles();
  const host = ctx.host; if (!host) return;
  if (!ctx.started) {
    renderHostStartLobby(host, ctx, { wrap: "mystic-wood-root", heading: "Knights",
      blurb: "Each knight has a unique quest. Invite players or bots (3–5 seats, bots fill), then start — knights are dealt at random." });
    return;
  }
  clearWorking();   // a fresh render means the server replied — drop any "Working…" indicator (mrh84cjn)
  const game = ctx.game || {};
  const gameKey = `${(ctx.room && ctx.room.code) || "?"}`;
  const justInit = view.gameKey !== gameKey;
  if (justInit) {
    view = { gameKey, zoom: 0, focus: null, panel: null }; seenRoll = 0; prevPos = {}; pulseCell = null; chronFilter = null; stormMode = false;
    seenRotation = game.rotation ? game.rotation.seq : 0; resetHorn(game.horn ? game.horn.seq : 0); resetHeralds();
    try { const k = "mw.start." + gameKey; gameStartAt = +localStorage.getItem(k) || Date.now(); localStorage.setItem(k, gameStartAt); } catch (_e) { gameStartAt = 0; }
  }
  if (!resizeHooked) { resizeHooked = true; window.addEventListener("resize", () => applyZoom()); }
  const me = localMark(ctx);
  let root = host.querySelector(".mystic-wood-root");
  if (!root) { host.innerHTML = ""; root = document.createElement("div"); root.className = "mystic-wood-root"; host.appendChild(root); }

  if (game.status === "complete") { closePortals(); root.innerHTML = endHtml(ctx, game); wireTop(root, ctx, game, me); return; }
  // if my knight moved while zoomed & following me, keep the view centred on me (prevPos still holds the old spot)
  const lp = (game.players || []).find((p) => p.mark === me);
  const iMoved = !!(lp && prevPos[me] && (prevPos[me].r !== lp.r || prevPos[me].c !== lp.c)); // did my token glide this render?
  if (iMoved && (view.zoom || 0) > 0) view.focus = null;
  root.innerHTML = boardScreenHtml(ctx, game, me);
  uiRoot = root;
  wireTop(root, ctx, game, me);
  wireBoard(root, ctx, game, me);
  zoomCtx = { root, game, me }; applyZoom(); requestAnimationFrame(() => applyZoom());
  // The Horn owns the tokens while it scatters them (resuming the tour on every render so a
  // re-render can't strand it); it reads prevPos, so it runs BEFORE animateTokens. syncHerald then
  // re-mounts any raised herald (the Horn's tale) over the freshly-rendered chronicle strip.
  syncHorn(root, game, { cw: CW, ch: CH, prevPos });
  syncBoardEvents(game);
  syncHerald(root);
  syncRotation(root, game);
  animateTokens(root, game);
  // overlays: my own most-recent roll result (kept per-seat so bot turns can't clobber it), else a pending encounter.
  const myRoll = (game.results && me) ? game.results[me] : null;
  // On a fresh mount (reload / rejoin on mobile) do NOT replay the last combat's dice — replaying it used to
  // hide a live pending encounter behind a stale modal and softlock the turn. Seed to the latest seq so only
  // genuinely NEW rolls pop; the pending encounter (if any) then shows normally.
  if (justInit) seenRoll = myRoll ? (myRoll.seq || 0) : 0;
  if (encTimer) { clearTimeout(encTimer); encTimer = null; } // a newer render owns the encounter-reveal timing
  // Hold every modal off the map until the Mystic Horn's 2s tour lands — a popup must never cover the
  // tokens mid-flight (bug mrh6ewl2). Otherwise just wait out a token glide before the card covers a tile.
  const hornWait = hornOwnsTokens() ? hornRemainingMs() + 700 : 0;   // let the tour fully settle before any card (mrh7qgwh)
  if (myRoll && myRoll.seq > seenRoll) {
    seenRoll = myRoll.seq;
    if (hornWait) encTimer = setTimeout(() => { encTimer = null; showDice(ctx, myRoll); }, hornWait);
    else showDice(ctx, myRoll);
  } else if (game.pending && ["encounter", "greet_pick", "combat_pick", "escape_pick"].includes(game.pending.type) && game.pending.mark === me) {
    // Let the token finish gliding onto the tile BEFORE the card covers it; on a fresh mount
    // (no glide) reveal at once. A newer render clears this timer, so a stale card can't pop.
    const show = game.pending.type === "greet_pick" ? showGreetPick : game.pending.type === "combat_pick" ? showCombatPick
      : game.pending.type === "escape_pick" ? showEscapePick : showEncounter;
    const wait = hornWait || (iMoved ? GLIDE_MS + 60 : 0);
    if (wait) encTimer = setTimeout(() => { encTimer = null; show(ctx, game); }, wait);
    else show(ctx, game);
  } else if (game.round === 1 && me && introShownFor !== gameKey && !introSeen(gameKey)) {
    // At a clean game start (no roll, no pending), the local knight entrusts their quest — once per room.
    introShownFor = gameKey; markIntroSeen(gameKey); showIntro(ctx, game, me);
  }
}
function introSeen(key) { try { return localStorage.getItem("mw.intro." + key) === "1"; } catch (_e) { return false; } }
function markIntroSeen(key) { try { localStorage.setItem("mw.intro." + key, "1"); } catch (_e) { /* private mode */ } }
/* ------------------------------- layout --------------------------------- */
function boardScreenHtml(ctx, game, me) {
  const cur = game.players.find((p) => p.mark === game.current_player);
  const turn = cur ? (cur.mark === me ? "Your turn" : `${E(cur.label || cur.name)}'s turn`) : "—";
  return `
    <div class="mw-topbar">
      <button data-top="knights">≡ Knights</button>
      <span class="mw-tb-turn"><b class="mw-turnno">Turn ${game.turn_seq || 0}</b> · ${turn}</span>
      <button data-top="zoom">🔍</button>
      <button data-top="chron">📜</button>
    </div>
    <div class="mw-status">${stripHtml(ctx, game, me)}</div>
    <div class="mw-boardwrap"><div class="board">${cellsHtml(ctx, game, me)}${tokensHtml(ctx, game)}</div></div>
    <div class="mw-legend">${legendHtml(ctx, game)}</div>
    <div class="mw-log">${logRows(game, 6, logEmojiMap(ctx, game))}</div>
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
    <div class="pstrip-badges">${invHtml(seat)}${chivalryHtml(game, me)}</div>
  </div>`;
}
// §15: who currently bears each rescue obligation (Save Boy / Rescue Damsel). Peekable like any badge.
function chivalryHtml(game, me) {
  const ch = game.chivalry || {};
  const badge = (id, icon) => {
    const holder = ch[id]; if (!holder) return "";
    const p = (game.players || []).find((q) => q.mark === holder);
    const mine = holder === me;
    return `<span class="badge holdable mw-oblig${mine ? " mw-oblig-me" : ""}" data-peek="chivalry:${id}">${icon} ${mine ? "rescue!" : E(p ? p.name : "?")}</span>`;
  };
  return badge("boy", "👦") + badge("damsel", "👧");
}
function statsHtml(seat) {
  const cap = (seat.totalP + seat.totalS) >= 10 ? ` <span style="color:var(--muted)">(cap 10)</span>` : "";
  return `<span class="stats holdable" data-peek="stats:${seat.mark}"><span class="pP">P ${seat.totalP}</span><span class="pS">S ${seat.totalS}</span>${cap}</span>`;
}
function invHtml(seat) {
  let h = "";
  // §18.2: the vigil is three SPENT turns, and while it ran the only sign of it was a log line — the turn
  // itself was skipped in silence, so the prayer looked stuck at one ("bishop only does 1 of three", bug
  // mrh93gvz). Now it ticks on the strip, where the player is already looking.
  if (seat.praying) h += `<span class="badge holdable mw-pray" data-peek="pray:${seat.prayerTurns || 0}">🙏 Praying ${seat.prayerTurns || 0}/3</span>`;
  if (seat.isKing) h += `<span class="chip holdable" data-peek="king:0">👑 King</span>`;
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
  const jp = game.pending;
  if (jp && jp.type === "joust-prize" && jp.mark === me) {
    let b = `<span class="mw-prompt">Won vs ${E(jp.loserName)} — your prize:</span>`;
    b += `<button data-jp="tower">⛓ To the Tower</button>`;
    if (jp.spoils && jp.spoils.things) b += `<button data-jp="thing">🎁 Take a Thing</button>`;
    if (jp.spoils && jp.spoils.prowess) b += `<button data-jp="prowess">🎖 Take Prowess</button>`;
    if (jp.spoils && jp.spoils.companions) b += `<button data-jp="companion">🤝 Take a Companion</button>`;
    return b;
  }
  // A pending encounter for me ALWAYS keeps a resolve button in the bar, so a suppressed/dismissed encounter
  // modal (stale-dice replay, reload, mis-tap) can never dead-end the turn.
  // The server carries the article ("Merlin", but "the Witch") — he is a person, not a species.
  const denizen = (p) => E(p.denPhrase || `the ${p.denName || (DEN[p.card] && DEN[p.card].name) || "denizen"}`);
  // §8: withdraw from a met denizen (unless you arrived by transport) — the server sends `canWithdraw`.
  const withdraw = (jp && jp.canWithdraw) ? `<button data-act="withdraw">↩︎ Withdraw</button>` : "";
  if (jp && jp.type === "greet_pick" && jp.mark === me) {
    return `<button class="primary" data-act="greetpick">🤝 Greet ${denizen(jp)}</button>${withdraw}`;
  }
  if (jp && jp.type === "combat_pick" && jp.mark === me) {
    return `<button class="primary" data-act="combatpick">⚔️ Fight ${denizen(jp)}</button>${withdraw}`;
  }
  // Imprisonment keeps an actionable button in the bar, so a dismissed escape modal can't dead-end the turn.
  if (jp && jp.type === "escape_pick" && jp.mark === me) {
    return `<button class="primary" data-act="escapepick">${jp.mode === "capture" ? "✦ Break the Enchantress's song" : "⛓ Try to escape the Tower"}</button>`;
  }
  if (jp && jp.type === "encounter" && jp.mark === me) {
    return `<button class="primary" data-act="encounter">${jp.combat ? "⚔️ Challenge" : "🤝 Greet"} ${denizen(jp)}</button>${withdraw}`;
  }
  let btns = "";
  if (mine && meSeat && !meSeat.tower && !meSeat.captured && !game.pending) {
    const tile = tileAt(game, meSeat.r, meSeat.c);
    // Storm-targeting mode: the whole bar becomes a prompt — tap an area on the board to storm it.
    if (stormMode) return `<span class="mw-prompt">🌩️ Tap an area to storm</span><button data-act="stormcancel">Cancel</button>`;
    const has = (id) => (meSeat.things || []).some((t) => t.id === id);
    const comp = (id) => (meSeat.companions || []).some((c) => c.id === id);
    // After a move the turn stays open only for a free move or a joust — make that OBVIOUS so it never
    // looks stuck (the reason the bots seemed frozen: you had to End turn).
    if (meSeat.moved) btns += `<span class="mw-prompt">${meSeat.freeMove ? "Free move — step on, or" : "Your move is done —"} End turn ▶</span>`;
    const foes = game.players.filter((p) => p.mark !== me && !p.won && !p.tower && !p.captured && p.r === meSeat.r && p.c === meSeat.c);
    if (foes.length && !(tile && tile.name === "tower")) btns += `<button data-act="joust">⚔️ Joust</button>`;   // §12: before OR after moving
    if (tile && tile.name === "fountain") btns += `<button data-act="drink">⛲ Drink</button>`;
    if (has("crystal")) btns += `<button data-act="scry">🔮 Scry</button>`;
    if (has("wand")) btns += `<button data-act="rotate">🔄 Rotate</button>`;
    if (comp("archmage")) btns += `<button data-act="transport">✨ Transport</button>`;
    // Magician companion (§18.11): raise a storm over any area — never from the Tower.
    if (comp("magician") && !(tile && tile.name === "tower")) btns += `<button data-act="storm">🌩️ Storm</button>`;
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
// name→emoji for the chronicle's leading column: match the display name the log writes (seat.name —
// the human's name, or the knight for a bot). Longest-first so "Sogo the Bold" beats a stray "Sogo".
function logEmojiMap(ctx, game) {
  const meta = roomMeta(ctx);
  return (game.players || []).map((p) => ({ name: p.name || (KNIGHTS[p.knight] || {}).name || "", emoji: (meta[p.mark] || {}).icon || "" }))
    .filter((x) => x.name && x.emoji).sort((a, b) => b.name.length - a.name.length);
}
function logEmojiFor(text, map) {
  const t = String(text || "");
  for (let i = 0; i < (map || []).length; i += 1) if (t.includes(map[i].name)) return E(map[i].emoji);
  return "";
}
function logRows(game, n, emojiMap) {
  const rows = (game.log || []).slice(-n).reverse();
  if (!rows.length) return `<div class="le muted">The chronicle is empty.</div>`;
  return rows.map((e) => `<div class="le"><span class="le-emoji">${emojiMap ? logEmojiFor(e.text, emojiMap) : ""}</span><span class="le-text ${E(e.cls || "")}">${sanitizeLog(e.text)}</span></div>`).join("");
}
/* -------------------------------- board --------------------------------- */
function edgeBetween(from, to) {
  if (to.r === from.r - 1) return ["N", "S"]; if (to.r === from.r + 1) return ["S", "N"];
  if (to.c === from.c + 1) return ["E", "W"]; if (to.c === from.c - 1) return ["W", "E"]; return null;
}
function reachableSet(game, seat) {
  const set = new Set(); if (!seat) return set;
  const from = tileAt(game, seat.r, seat.c); if (!from || !from.open) return set;
  if (from.storm) return set;                                  // a storm bars normal movement OUT (mirrors reachableFrom)
  const bough = (seat.things || []).some((t) => t.id === "golden_bough");
  [[from.r - 1, from.c], [from.r + 1, from.c], [from.r, from.c - 1], [from.r, from.c + 1]].forEach(([r, c]) => {
    const n = tileAt(game, r, c); if (!n) return;
    const e = edgeBetween(from, n); if (!e) return;
    if (!from.open[e[0]]) return;
    if (n.revealed && !(n.open && n.open[e[1]])) return;
    if (n.revealed && n.name === "cave" && !bough) return;
    if (n.storm) return;                                       // ...and bars normal movement IN
    set.add(r * 7 + c);
  });
  return set;
}
function cellsHtml(ctx, game, me) {
  const meSeat = game.players.find((p) => p.mark === me);
  const myTurn = game.current_player === me && game.status === "playing" && meSeat && !meSeat.tower && !meSeat.captured && !game.pending;
  const reach = myTurn ? reachableSet(game, meSeat) : new Set();
  let h = "";
  for (let r = 0; r < 9; r += 1) for (let c = 0; c < 7; c += 1) {
    const t = game.board[r * 7 + c], idx = r * 7 + c, pc = `${r},${c}`;
    const cls = ["cell"];
    if (meSeat && meSeat.r === r && meSeat.c === c) cls.push("current");
    if (reach.has(idx)) cls.push("reachable");
    // Storm-targeting mode: any revealed non-Tower area with no storm yet is a valid target to tap.
    if (stormMode && t.revealed && t.name !== "tower" && !t.storm) cls.push("storm-target");
    h += `<div class="${cls.join(" ")}" data-cell="${pc}">`;
    if (t.revealed) {
      h += tileSvg(t, idx + 1);
      if (t.storm) h += `<div class="mw-storm holdable" data-peek="storm:${pc}">🌩️<b>${t.storm}</b></div>`;
      if (t.name && AREA_NAMES[t.name]) h += `<div class="infomark holdable" data-peek="area:${pc}">ⓘ</div>`;
      if (t.card) h += `<div class="cardmark holdable${pulseCell === pc ? " mw-pulse" : ""}" data-peek="card:${pc}">${denEmoji(t.card)} ${E((DEN[t.card] || {}).name || "?")}</div>`;
    } else { h += `<div class="facedown"></div>`; }
    h += `</div>`;
  }
  return h;
}
// Tokens are BOARD children (not cell children) positioned at board coordinates, so they glide across
// the whole board on a move without being clipped by any cell's overflow:hidden.
const PAD = 8;
function tokensHtml(ctx, game) {
  const meta = roomMeta(ctx);
  const stack = {};
  return game.players.map((p) => {
    if (p.won) return "";
    const key = `${p.r},${p.c}`, i = stack[key] || 0; stack[key] = i + 1;
    const md = meta[p.mark] || {};
    const face = md.icon || (p.name || "?")[0];
    const left = PAD + p.c * CW + 6 + i * 20, top = PAD + p.r * CH + 6;
    return `<div class="tok holdable" data-peek="tok:${p.mark}" data-mark="${p.mark}" style="background:${E(md.color || p.color)};left:${left.toFixed(1)}px;top:${top.toFixed(1)}px">${E(face)}</div>`;
  }).join("");
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
// Glide any token whose tile changed from its previous render position — unless the Mystic Horn's
// tour is carrying the tokens, in which case it owns them and the straight-line glide would fight it.
function animateTokens(root, game) {
  const horn = hornOwnsTokens();
  (game.players || []).forEach((p) => {
    if (p.won) { prevPos[p.mark] = { r: p.r, c: p.c }; return; }
    const tok = root.querySelector(`.tok[data-mark="${p.mark}"]`);
    const prev = prevPos[p.mark];
    if (!horn && tok && prev && (prev.r !== p.r || prev.c !== p.c)) {
      const dx = (prev.c - p.c) * CW, dy = (prev.r - p.r) * CH;
      tok.style.transition = "none";
      tok.style.transform = `translate(${dx}px,${dy}px)`;
      requestAnimationFrame(() => requestAnimationFrame(() => { tok.style.transition = `transform ${GLIDE_MS}ms ease`; tok.style.transform = "translate(0,0)"; }));
    }
    prevPos[p.mark] = { r: p.r, c: p.c };
  });
}
// §18.12 Fog / the Wand: when areas "turn about", spin exactly those tiles 180° once. The board is a
// snapshot rebuild, so the fresh <svg> already shows the NEW doors; we start it flipped 180° (which reads
// as the OLD orientation) and ease back to 0, so the doors visibly sweep round. Seq-guarded — a re-render
// mid-spin won't restart it, and a reconnect adopts the seq without replaying (seenRotation in justInit).
// The board can change under you on someone ELSE's turn — the Fog turns the wood about, the Wand turns a
// tile, the Wind strips every Thing — and the tiles simply "jumped", with the only word for it a log line
// that named no one ("they just jump and it's confusing what happened… there should be a pop-up explaining
// who triggered the event", bug mrh97d6q). Each seq'd event now raises a HERALD that says who and what,
// while it happens: the tale runs alongside the 2s spin (the banner sits over the chronicle, never the map,
// so it can narrate the animation instead of hiding it). The server owns who/what — we only tell it.
function syncBoardEvents(game) {
  const who = (name) => E(name || "A knight");   // a tale is raw HTML — the player-chosen name is escaped HERE
  const rot = game.rotation;
  if (rot && rot.seq) {
    const tale = EVENT_TALE[rot.cause === "wand" ? "wand" : "fog"];
    raiseHerald({ key: "rotation", seq: rot.seq, title: tale.title, tale: tale.body(who(rot.by), (rot.cells || []).length) });
  }
  const wind = game.wind;
  if (wind && wind.seq) raiseHerald({ key: "wind", seq: wind.seq, title: EVENT_TALE.wind.title, tale: EVENT_TALE.wind.body(who(wind.by), wind.swept || 0) });
}
function syncRotation(root, game) {
  const rot = game.rotation;
  if (!rot || !rot.seq || rot.seq <= seenRotation) return;
  seenRotation = rot.seq;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  (rot.cells || []).forEach(([r, c]) => {
    const cell = root.querySelector(`.cell[data-cell="${r},${c}"]`);
    const svg = cell && cell.querySelector("svg");
    if (!svg) return;
    svg.style.transition = "none";
    svg.style.transformOrigin = "50% 50%";
    svg.style.transform = "rotate(180deg)";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      svg.style.transition = `transform ${ROTATE_MS}ms ease`;
      svg.style.transform = "rotate(0deg)";
    }));
  });
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
  // Centred horizontally over the map, wherever the badge sits (bug mrh7xy80) — a peek near a corner badge
  // used to open off toward that corner and clip. Vertically it rides at the TOP of the map, not the middle
  // of the WINDOW: the badges and legend sit low, so a window-centred peek landed over the bottom of the
  // board and covered the very tiles it described ("I want the pop-up to be the top of the map and it's
  // currently at the bottom", bug mrh94r63). Clamped so it can never run off-screen on a small phone.
  const board = uiRoot && uiRoot.querySelector(".mw-boardwrap");
  const box = board ? board.getBoundingClientRect() : null;
  const top = box ? box.top + 8 : (window.innerHeight - r.height) / 2;
  popEl.style.left = Math.max(8, (window.innerWidth - r.width) / 2) + "px";
  popEl.style.top = Math.max(8, Math.min(top, window.innerHeight - r.height - 8)) + "px";
}
function peekContent(game, spec) {
  const [type, arg] = spec.split(":");
  if (type === "area") { const [r, c] = arg.split(",").map(Number); const t = tileAt(game, r, c); const half = t.half === "ench" ? "Enchanted" : "Earthly"; return { title: AREA_NAMES[t.name], body: `${AREA_FX[t.name] || "A place in the wood."}<br><span style="color:var(--muted)">${half} Wood · tile (${r},${c})</span>` }; }
  if (type === "card") { const [r, c] = arg.split(",").map(Number); const t = tileAt(game, r, c); return { title: `${denEmoji(t.card)} ${(DEN[t.card] || {}).name || "?"}`, body: denizenSummary(t.card) }; }
  if (type === "tok" || type === "stats") { const seat = game.players.find((p) => p.mark === arg); return { title: seat ? E(seat.name) : "Knight", body: playerPeek(seat) }; }
  if (type === "thing") return { title: (THINGS[arg] || {}).name || arg, body: THING_DESC[arg] || "A magical Thing." };
  if (type === "comp") return { title: (DEN[arg] || {}).name || arg, body: COMP_DESC[arg] || "A companion travelling with you." };
  if (type === "prowess") return { title: "Prowess card", body: "+1 Prowess — won by slaying a beast. Adds to your Prowess in every contest." };
  if (type === "pray") { const n = Number(arg) || 0; return { title: "🙏 Praying before the Bishop", body: `Three full turns of prayer earn the <b>Ring</b> (+1 Prowess). <b>${n} of 3</b> kept — ${3 - n} to go.<br>Each turn of prayer <b>costs you that turn</b>: you kneel instead of moving. If the prayer is interrupted, the turns kept are lost. (§18.2)` }; }
  if (type === "horse") return { title: "Horse", body: "+2 Strength. Caught when it bolts into a wall — greet it, chase it. Not a companion; another knight can win it in a joust." };
  if (type === "tower") return { title: "Imprisoned in the Tower", body: "Each turn roll a die — escape on 5–6, or freed on the 4th turn. The Key frees you at once." };
  if (type === "captured") return { title: "Captured by the Enchantress", body: "Each turn, roll — escape on a 6." };
  if (type === "king") return { title: "👑 King of the Wood", body: "You struck down the King and wear the crown. <b>Hold the Castle through a full turn to win as King.</b> (Britomart never takes the crown.)" };
  if (type === "storm") { const [r, c] = arg.split(",").map(Number); const t = tileAt(game, r, c); const n = t && t.storm; return { title: "🌩️ Magician's Storm", body: `No one may enter or leave this area by normal movement${n ? ` — ${n} turn${n === 1 ? "" : "s"} left` : ""}. Magical movement (transport / horn) still passes.` }; }
  if (type === "chivalry") {
    const holder = (game.chivalry || {})[arg];
    const p = (game.players || []).find((q) => q.mark === holder);
    const who = p ? E(p.label || p.name) : "someone";
    const one = arg === "boy" ? "the Boy" : "the Damsel", them = arg === "boy" ? "him" : "her";
    const dest = arg === "boy" ? "the <b>Earthly Gate</b>" : "the <b>Queen</b> — a denizen you must FIND by exploring (she is not at a gate; deliver to whatever area her card is in)";
    return { title: arg === "boy" ? "👦 Save Boy" : "👧 Rescue Damsel",
      body: `${who} bears this obligation of chivalry (§15). Greet ${one} to take ${them} as a companion, then deliver ${them} to ${dest} to fulfil it. Seeing them passes the duty to the last knight to enter their area.` };
  }
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
/* ------------------------------- wiring --------------------------------- */
function wireTop(root, ctx, game, me) {
  root.querySelectorAll("[data-top]").forEach((b) => b.addEventListener("click", () => {
    const w = b.getAttribute("data-top");
    if (w === "zoom") { view.zoom = 0; view.focus = null; applyZoom(true); }
    else if (w === "knights") openPanel(root, ctx, game, me, "knights");
    else if (w === "chron") openPanel(root, ctx, game, me, "chron");
  }));
}
function wireBoard(root, ctx, game, me) {
  root.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
    if (ctx.isMovePending && ctx.isMovePending()) return;
    const a = b.getAttribute("data-act");
    if (["end", "scry", "rotate", "drink", "withdraw"].includes(a)) signalWorking();   // server round-trips (mrh84cjn)
    if (a === "end") ctx.makeMove({ type: "end-turn" });
    else if (a === "scry") ctx.makeMove({ type: "scry" });
    else if (a === "rotate") ctx.makeMove({ type: "rotate" });
    else if (a === "drink") ctx.makeMove({ type: "drink" });
    else if (a === "transport") openTransport(root, ctx, game, me);
    else if (a === "storm") { stormMode = true; renderMysticWoodGame(ctx); }
    else if (a === "stormcancel") { stormMode = false; renderMysticWoodGame(ctx); }
    else if (a === "joust") openJoust(root, ctx, game, me);
    else if (a === "withdraw") ctx.makeMove({ type: "withdraw" });
    else if (a === "encounter") showEncounter(ctx, game);
    else if (a === "greetpick") showGreetPick(ctx, game);
    else if (a === "combatpick") showCombatPick(ctx, game);
    else if (a === "escapepick") showEscapePick(ctx, game);
  }));
  root.querySelectorAll("[data-jp]").forEach((b) => b.addEventListener("click", () => {
    if (ctx.isMovePending && ctx.isMovePending()) return;
    ctx.makeMove({ type: "joust-prize", prize: b.getAttribute("data-jp") });
  }));
  // (Board tap / double-tap / pan are handled by the pointer-gesture model below — NOT click — because
  // iOS Safari withholds the 2nd click of a double-tap, so click-based zoom never fires on iPhone.)
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
  // Board input is POINTER-based, not click. iOS Safari treats a double-tap as a gesture and does NOT
  // fire the 2nd click, so click-based zoom is impossible on iPhone; pointerdown/up land for every tap.
  // pointerdown records the gesture; document-level move/up (below) resolve tap / double-tap / drag-pan.
  const wrapEl = root.querySelector(".mw-boardwrap");
  if (wrapEl) wrapEl.addEventListener("pointerdown", (e) => {
    const zoomed = (view.zoom || 0) > 0;
    const vw = wrapEl.clientWidth || 1, scale = vw / ((ZOOM_WIDTHS[view.zoom] || 7) * CW);
    gesture = {
      id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, ctx,
      onHoldable: !!e.target.closest(".holdable"),          // a peek target → tap peeks, don't move
      f0: zoomed ? currentFocus(game, me) : null, scale,
    };
  });
}
// Which cell a screen point falls on, mapped back through the board's live transform (so a tap on a token,
// badge, or the tile padding still resolves to the tile beneath it — not just direct .cell hits).
function cellAtPoint(px, py) {
  const board = uiRoot && uiRoot.querySelector(".board");
  if (!board) return null;
  const rect = board.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const bw = 7 * CW - 3 + PAD * 2, s = rect.width / bw;        // effective scale from the rendered box
  const ix = (px - rect.left) / s - PAD, iy = (py - rect.top) / s - PAD;
  return { r: clampN(Math.floor(iy / CH), 0, 8), c: clampN(Math.floor(ix / CW), 0, 6) };
}
// The board's current centre in fractional cell coords: an explicit focus (double-tap / prior pan) or my knight.
function currentFocus(game, me) {
  if (view.focus) return { r: view.focus.r, c: view.focus.c };
  const seat = (game.players || []).find((p) => p.mark === me);
  return seat ? { r: seat.r, c: seat.c } : { r: 4, c: 3 };
}
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
function onBoardMove(e) {
  if (!gesture || e.pointerId !== gesture.id) return;
  const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
  if (!gesture.moved && Math.hypot(dx, dy) < 10) return;       // small movement stays a tap
  gesture.moved = true;
  hidePop();                                                   // a drag cancels any press-hold peek
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; } // ...and the pending single-tap move
  if (gesture.f0) {                                            // zoomed → pan; finger right reveals content left
    const dc = -dx / (gesture.scale * CW), dr = -dy / (gesture.scale * CH);
    view.focus = { r: clampN(gesture.f0.r + dr, 0, 8), c: clampN(gesture.f0.c + dc, 0, 6) };
    applyZoom(false);                                          // recompute + clamp the transform to bounds
  }
}
function onBoardUp(e) {
  if (!gesture || e.pointerId !== gesture.id) return;
  const g = gesture; gesture = null;
  if (g.moved) return;                                        // a pan/drag, not a tap
  const cell = cellAtPoint(g.x, g.y); if (!cell) return;      // couldn't map to a tile (off the board)
  const { r, c } = cell, ctx = g.ctx, now = Date.now();
  if (now - lastTapAt < 400) {                                // DOUBLE TAP → zoom in on this tile (even on a token)
    lastTapAt = 0;
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
    view.focus = { r, c }; view.zoom = Math.min(ZOOM_WIDTHS.length - 1, (view.zoom || 0) + 1); applyZoom(true);
    return;
  }
  lastTapAt = now;                                            // register the tap so a 2nd tap can pair into a zoom
  if (g.onHoldable) return;                                   // tap on a peek target → peek only, never a move
  if (clickTimer) clearTimeout(clickTimer);
  clickTimer = setTimeout(() => {                             // deferred single-tap move (a 2nd tap cancels it)
    clickTimer = null;
    const el = uiRoot && uiRoot.querySelector(`.cell[data-cell="${r},${c}"]`);
    if (!el || (ctx.isMovePending && ctx.isMovePending())) return;
    if (stormMode) {                                          // targeting a storm: tap a valid area to raise it
      if (el.classList.contains("storm-target")) { stormMode = false; signalWorking(); ctx.makeMove({ type: "storm", r, c }); }
      return;
    }
    if (el.classList.contains("reachable")) { signalWorking(); ctx.makeMove({ type: "move", r, c }); }
  }, 400);
}
function onBoardCancel(e) { if (gesture && e.pointerId === gesture.id) gesture = null; }
document.addEventListener("pointermove", onBoardMove);
document.addEventListener("pointerup", onBoardUp);
document.addEventListener("pointercancel", onBoardCancel);
document.addEventListener("mouseup", requestHide);
document.addEventListener("touchend", requestHide);

function openPanel(root, ctx, game, me, which) {
  closePanel();
  const back = document.createElement("div"); back.className = "mw-backdrop"; back.addEventListener("click", closePanel); document.body.appendChild(back);
  const panel = document.createElement("div"); panel.className = "mystic-wood-root mw-panelover " + (which === "knights" ? "mw-knights" : "mw-chronicle");
  if (which === "knights") panel.innerHTML = `<h2 style="font-size:22px;margin-bottom:10px">Knights</h2>${game.players.map((p) => knightCard(p, p.mark === game.current_player)).join("")}`;
  else { panel.innerHTML = chronicleHtml(game); wireChron(panel, game); }
  document.body.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add("open"));
  panel.querySelectorAll("[data-peek]").forEach((el) => { const show = (ev) => { ev.stopPropagation(); const pt = ev.touches ? ev.touches[0] : ev; const c = peekContent(game, el.getAttribute("data-peek")); if (c) showPop(pt.clientX, pt.clientY, c.title, c.body); }; el.addEventListener("mousedown", show); el.addEventListener("touchstart", show, { passive: false }); });
}
// The name the log writes for a player (seat.name — human name, or the knight for a bot), so the
// per-player filter matches log lines. Chips DISPLAY the fuller label ("Sogo (Roland's quest)").
function logName(p) { return p.name || (KNIGHTS[p.knight] || {}).name || ""; }
function chronicleHtml(game) {
  const chips = [`<button class="mw-cf${chronFilter == null ? " on" : ""}" data-cf="all">All</button>`]
    .concat(game.players.map((p) => `<button class="mw-cf${chronFilter === p.mark ? " on" : ""}" data-cf="${p.mark}" style="--cf:${E(p.color)}">${E(p.label || logName(p))}</button>`));
  let rows = game.log || [];
  if (chronFilter) { const p = game.players.find((q) => q.mark === chronFilter); const nm = p && logName(p); rows = nm ? rows.filter((e) => String(e.text || "").includes(nm)) : rows; }
  rows = rows.slice().reverse();   // the ENTIRE (bounded) history, newest first — report mrfoq90c
  // Debug view: prefix each line with the turn it was written on (the `t` field) so a snapshot reads turn-by-turn.
  const list = rows.length ? rows.map((e) => `<div class="le"><span style="color:var(--muted);font-size:11px;margin-right:6px">t${e.t == null ? "?" : e.t}</span><span class="${E(e.cls || "")}">${sanitizeLog(e.text)}</span></div>`).join("")
    : `<div class="le muted">No entries${chronFilter ? " for this player" : ""} yet.</div>`;
  const clock = elapsedStr();
  return `<h2 style="font-size:22px;margin-bottom:8px">Chronicle <span style="font-size:14px;color:var(--muted)">· Turn ${game.turn_seq || 0} · ${(game.log || []).length} entries${clock ? ` · ⏱ ${clock}` : ""}</span></h2><div class="mw-cfrow">${chips.join("")}</div><div class="mw-chronlist">${list}</div>`;
}
function wireChron(panel, game) {
  panel.querySelectorAll("[data-cf]").forEach((b) => b.addEventListener("click", () => {
    const v = b.getAttribute("data-cf"); chronFilter = v === "all" ? null : v;
    panel.innerHTML = chronicleHtml(game); wireChron(panel, game);
  }));
}
function closePanel() { document.querySelectorAll(".mw-panelover,.mw-backdrop").forEach((n) => n.remove()); }
function knightCard(p, active) {
  return `<div class="card pl${active ? " active" : ""}">
    <div class="plhead"><span class="crest" style="background:${E(p.color)}">${E((p.name || "?")[0])}</span>
      <span class="plname" style="color:${E(p.color)}">${E(p.label || p.name)}${p.is_bot ? " 🤖" : ""}</span>${p.isKing ? `<span class="chip">👑 King</span>` : ""}</div>
    ${statsHtml(p)}
    <div class="quest">${p.questDone ? "✓ " : ""}${E(p.quest || "")}</div>
    <div class="inv">${invHtml(p)}</div>
  </div>`;
}
function openJoust(root, ctx, game, me) {
  const meSeat = game.players.find((p) => p.mark === me);
  const targets = game.players.filter((p) => p.mark !== me && !p.won && !p.tower && !p.captured && p.r === meSeat.r && p.c === meSeat.c);
  const bar = root.querySelector(".mw-actions"); if (!bar) return;
  if (!targets.length) { bar.innerHTML = `<button disabled>No knight to joust here</button>`; return; }
  bar.innerHTML = `<span class="mw-prompt">Joust which knight?</span>` + targets.map((t) => `<button data-jt="${t.mark}">⚔️ ${E(t.name)}</button>`).join("") + `<button data-jt="cancel">Cancel</button>`;
  bar.querySelectorAll("[data-jt]").forEach((b) => b.addEventListener("click", () => {
    const v = b.getAttribute("data-jt"); if (v === "cancel") { renderMysticWoodGame(ctx); return; }
    if (!(ctx.isMovePending && ctx.isMovePending())) { signalWorking(); ctx.makeMove({ type: "joust", target: v }); }
  }));
}
function openTransport(root, ctx, game, me) {
  const seat = game.players.find((p) => p.mark === me);
  const dests = game.board.filter((t) => t.revealed && t.name && !(t.r === seat.r && t.c === seat.c) && !game.players.some((q) => q.mark !== me && !q.won && q.r === t.r && q.c === t.c));
  const bar = root.querySelector(".mw-actions"); if (!bar) return;
  if (!dests.length) { bar.innerHTML = `<button disabled>No open place to transport to yet</button>`; return; }
  bar.innerHTML = dests.map((t) => `<button data-tp="${t.r},${t.c}">${E(AREA_NAMES[t.name] || t.name)}</button>`).join("") + `<button data-tp="cancel">Cancel</button>`;
  bar.querySelectorAll("[data-tp]").forEach((b) => b.addEventListener("click", () => {
    const v = b.getAttribute("data-tp"); if (v === "cancel") { renderMysticWoodGame(ctx); return; }
    const [r, c] = v.split(",").map(Number); signalWorking(); ctx.makeMove({ type: "transport", r, c });
  }));
}

/* -------------------------------- zoom ---------------------------------- */
// animate=true glides the board transform (used for user zoom in/out); render/resize calls stay instant
// so the board never slides on a server update or window resize.
function applyZoom(animate) {
  if (!zoomCtx) return;
  const { root, game, me } = zoomCtx;
  const wrap = root.querySelector(".mw-boardwrap"), board = root.querySelector(".board");
  if (!wrap || !board) return;
  const CELL = 96, gap = 3, cw = CELL + gap, ch = CELL * 0.72 + gap, pad = 8;
  const bw = 7 * cw - gap + pad * 2, bh = 9 * ch - gap + pad * 2;
  const RM = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The map panel's HEIGHT tracks the zoom level: at full view it's compact (fit-to-width) so it rides up
  // under the player strip and the chronicle fills below; when zoomed in it GROWS to fill the space (down
  // to a >=84px chronicle sliver) so the zoom actually reads. Both the panel height and the board scale
  // animate together on a user zoom, so double-tap glides in instead of snapping.
  const kids = [...root.children];
  const rootTop = root.getBoundingClientRect().top;
  const availRoot = Math.floor(window.innerHeight - rootTop - 4);
  if (availRoot > 260) root.style.height = availRoot + "px";
  const otherH = kids.filter((c) => c !== wrap && !/mw-log/.test(c.className || "")).reduce((a, c) => a + (c.offsetHeight || 0), 0);
  const vw = wrap.clientWidth; if (!vw) return;
  const zoom = view.zoom || 0;
  const bigMap = Math.max(160, availRoot - otherH - 84);        // zoomed: map fills the space, chronicle at min
  const fitMap = Math.max(160, Math.min(Math.round(bh * (vw / bw)), bigMap)); // full view: compact fit-to-width
  const mapH = zoom === 0 ? fitMap : bigMap;
  wrap.style.transition = (animate && !RM) ? "height .3s ease" : "none";
  wrap.style.height = mapH + "px";
  const vh = mapH; if (!vh) return;
  const N = ZOOM_WIDTHS[zoom] || 7;
  let scale = zoom === 0 ? Math.min(vw / bw, vh / bh) : vw / (N * cw);   // full view fits the WHOLE board; zoomed shows N cells wide
  const seat = game.players.find((p) => p.mark === me);
  const f = view.focus || (seat ? { r: seat.r, c: seat.c } : { r: 4, c: 3 });
  const fx = pad + (f.c + 0.5) * cw - gap / 2, fy = pad + (f.r + 0.5) * ch - gap / 2;
  let tx = vw / 2 - fx * scale, ty = vh / 2 - fy * scale;
  const sw = bw * scale, sh = bh * scale;
  tx = sw > vw ? Math.min(0, Math.max(vw - sw, tx)) : (vw - sw) / 2;
  ty = sh > vh ? Math.min(0, Math.max(vh - sh, ty)) : (vh - sh) / 2;
  board.style.transition = (animate && !RM) ? "transform .3s ease" : "none";
  board.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${scale.toFixed(3)})`;
}
