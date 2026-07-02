// Roll Through the Ages — client renderer (the multiplayer shell seam).
//
// Thin adapter between the shell and the lifted turn engine (board.js):
//   - before the host starts, the shared host-start lobby;
//   - during the "playing" phase, this player's private turn (board.js), SEEDED
//     from their server seat, with the SHARED scoreboard on the Discard page and a
//     Submit button that POSTs ONE COMMIT_TURN via ctx.makeMove;
//   - once submitted / in "review", the barrier UI: the shared standings, a
//     "Ready for next round" button (READY_NEXT), and a hook that surfaces the
//     server's pending cross-player events (Pestilence) — the fly animation of
//     which is the next task.
// The board is mounted once per round and re-seeded when the server advances; an
// in-progress turn is never clobbered by another player's snapshot (we only
// refresh the shared scoreboard while the local board stays mounted).
import { renderHostStartLobby } from "../lobby.js";
import { RTTA_CSS } from "./styles.js";
import { createRttaBoard } from "./board.js";

let board = null;       // the mounted turn engine (during "playing")
let mountedKey = "";    // room:epoch:round the board was built for
let animatedKey = "";   // resolution whose cross-player disasters we've already animated

export function renderRttaGame(ctx) {
  const { host, game, room } = ctx;
  if (!host) return;
  injectStyles();
  if (!ctx.started) {
    board = null; mountedKey = "";
    renderHostStartLobby(host, ctx, {
      wrap: "rtta-root",
      heading: "Players",
      blurb: "Everyone builds their own Bronze Age at once; each round resolves together. Invite players or bots, then start.",
    });
    return;
  }
  if (!game || !Array.isArray(game.players)) return;

  const myMark = markForPlayer(room, ctx.localPlayerId);
  const mySeat = game.players.find((s) => s.mark === myMark) || null;
  const scoreboard = standingsHtml(game, room, myMark);
  const complete = game.status === "complete";
  const playing = !complete && game.phase === "playing" && mySeat && !mySeat.round_done;
  const epoch = (room && room.game_epoch) || 0;
  const key = `${room ? room.code : ""}:${epoch}:${game.round}`;

  if (playing) {
    // Mount (or re-seed on a new round); otherwise just refresh the shared board.
    if (!board || mountedKey !== key || !host.querySelector(".rtta-root #tray")) {
      mountedKey = key;
      board = createRttaBoard(host, {
        seat: mySeat,
        monuments: game.monuments || {},
        myMark,
        round: game.round,
        players: (game.seat_order || game.players.map((p) => p.mark)).length,
        scoreboardHtml: scoreboard,
        onCommit: (payload) => { ctx.makeMove(payload); },
      });
    } else {
      board.setScoreboard(scoreboard);
    }
    return;
  }

  // Not my turn to play: the barrier / review / complete screen.
  board = null; mountedKey = "";
  const waitingCount = game.players.filter((s) => !s.round_done).length;
  const reviewing = !complete && game.phase === "review";
  const canReady = reviewing && mySeat && !mySeat.ready_next;
  const iAmReady = reviewing && mySeat && mySeat.ready_next;

  let status;
  if (complete) status = "🏆 Game over — final standings below.";
  else if (game.phase === "playing") status = `Turn submitted. Waiting for ${waitingCount} player${waitingCount === 1 ? "" : "s"} to finish…`;
  else if (iAmReady) status = "Ready — waiting for the other players…";
  else status = "Round resolved. Review the standings, then ready up for the next round.";

  host.innerHTML = `
    <div class="rtta-root">
      <div class="block" style="width:100%;max-width:460px;margin-top:8px">
        <h3>Standings <small>round ${game.round}</small></h3>
        ${scoreboard}
      </div>
      ${eventsHtml(game, room, mySeat, myMark)}
      <p class="rtta-status">${status}</p>
      ${canReady ? '<button class="rtta-ready blink" id="rttaReady" type="button">Ready for next round →</button>' : ""}
    </div>`;
  const readyBtn = host.querySelector("#rttaReady");
  if (readyBtn) readyBtn.addEventListener("click", () => { readyBtn.disabled = true; ctx.makeMove({ type: "READY_NEXT" }); });
  animatePendingEvents(host, game, room, key);
}

// Once per resolution, fly 3 skulls from each pestilent player's standings row to
// every opponent they struck (revolt sends fire), then tick that row's Total down
// by the points lost. Deduped by resolution key so a snapshot mid-animation (a
// player readying up) never replays it. The board is torn down here, so this
// reuses the injected `.rtta-fly.arc` CSS directly rather than board.js's flyer.
function animatePendingEvents(host, game, room, key) {
  const events = Array.isArray(game.pending_events) ? game.pending_events : [];
  if (!events.length || key === animatedKey) return;
  animatedKey = key;
  const table = host.querySelector(".scoretab");
  if (!table) return;
  const rowFor = (mark) => table.querySelector(`tr[data-mark="${String(mark).replace(/["\\]/g, "\\$&")}"]`);

  // Pre-loss: bump each struck Total up by what it's about to lose, so the
  // number the player sees first is the pre-disaster score, then it ticks down.
  const displayed = {};
  for (const ev of events) {
    if (ev.kind !== "pestilence") continue;
    for (const m of ev.to || []) {
      const cell = rowForTotal(rowFor(m));
      if (!cell) continue;
      if (displayed[m] == null) {
        cell.dataset.final = String(Number(cell.textContent) || 0);
        displayed[m] = Number(cell.dataset.final);
      }
      displayed[m] += Number(ev.amount) || 0;
      cell.textContent = String(displayed[m]);
    }
  }

  let group = 0;
  for (const ev of events) {
    const src = rowFor(ev.from);
    const emoji = ev.kind === "revolt" ? "🔥" : "💀";
    for (const m of ev.to || []) {
      const tgt = rowFor(m);
      const skulls = ev.kind === "revolt" ? 1 : 3;
      for (let k = 0; k < skulls; k++) {
        const last = k === skulls - 1;
        flyArc(src, tgt, emoji, group * 220 + k * 170, last ? () => onStruck(tgt, m, ev, displayed) : null);
      }
      group += 1;
    }
  }
}

function onStruck(row, mark, ev, displayed) {
  if (row) { row.classList.add("rtta-hit"); setTimeout(() => row.classList.remove("rtta-hit"), 620); }
  const cell = rowForTotal(row);
  if (cell && ev.kind === "pestilence") {
    const floor = Number(cell.dataset.final) || 0;
    displayed[mark] = Math.max(floor, (displayed[mark] || floor) - (Number(ev.amount) || 0));
    cell.textContent = String(displayed[mark]);
  }
}

function rowForTotal(row) { return row ? row.querySelector(".tot b") : null; }

// A single emoji arcing from one element's centre to another's, reusing the
// injected `.rtta-fly.arc` keyframe (dx/dy custom props drive the translate).
function flyArc(srcEl, targetEl, emoji, delay, onArrive) {
  if (!srcEl || !targetEl) return;
  setTimeout(() => {
    const s = srcEl.getBoundingClientRect();
    const t = targetEl.getBoundingClientRect();
    const fly = document.createElement("div");
    fly.className = "rtta-fly arc";
    fly.textContent = emoji;
    fly.style.left = `${s.left + s.width / 2 - 12}px`;
    fly.style.top = `${s.top + s.height / 2 - 12}px`;
    fly.style.setProperty("--dx", `${t.left - s.left + (t.width - s.width) / 2}px`);
    fly.style.setProperty("--dy", `${t.top - s.top + (t.height - s.height) / 2}px`);
    document.body.appendChild(fly);
    setTimeout(() => { if (onArrive) onArrive(); fly.remove(); }, 950);
  }, delay);
}

// Cross-player events surfaced by the server at the barrier — plus a line when
// one of MY developments quietly protected me from an event that struck others.
function eventsHtml(game, room, mySeat, myMark) {
  const events = Array.isArray(game.pending_events) ? game.pending_events : [];
  if (!events.length) return "";
  const myDevs = (mySeat && mySeat.developments) || [];
  const lines = events.map((ev) => {
    const from = escapeName(seatName(room, ev.from));
    const n = Array.isArray(ev.to) ? ev.to.length : 0;
    const missedMe = ev.from !== myMark && !(ev.to || []).includes(myMark);
    if (ev.kind === "pestilence") {
      let line = `☠️ <span class="rtta-event">Pestilence</span> — ${from} sent 3 skulls to ${n} opponent${n === 1 ? "" : "s"} (−3 each).`;
      if (missedMe && myDevs.includes("Medicine")) line += ` 🛡️ <b>Medicine</b> protected you.`;
      return line;
    }
    if (ev.kind === "revolt") {
      let line = `🔥 <span class="rtta-event">Revolt</span> — ${from} wiped ${n} opponent${n === 1 ? "'s" : "s'"} goods.`;
      if (missedMe && myDevs.includes("Religion")) line += ` 🛡️ <b>Religion</b> protected your goods.`;
      return line;
    }
    return "";
  }).filter(Boolean);
  return lines.length ? `<p class="rtta-status">${lines.join("<br>")}</p>` : "";
}

// Shared standings: Player · Cities · Mon · Devs · −Lost · Total, sorted desc.
function standingsHtml(game, room, myMark) {
  const monBuilt = {};
  for (const name of Object.keys(game.monuments || {})) {
    for (const mark of game.monuments[name] || []) monBuilt[mark] = (monBuilt[mark] || 0) + 1;
  }
  const rows = game.players
    .map((seat) => ({
      seat,
      cities: seat.cities || 0,
      mon: monBuilt[seat.mark] || 0,
      devs: Array.isArray(seat.developments) ? seat.developments.length : 0,
      lost: seat.points_lost || 0,
      total: seat.score || 0,
    }))
    .sort((a, b) => b.total - a.total)
    .map(({ seat, cities, mon, devs, lost, total }) => {
      const me = seat.mark === myMark;
      const win = game.status === "complete" && seat.mark === game.winner;
      const name = seatName(room, seat.mark);
      const emoji = seatEmoji(room, seat.mark);
      return `<tr data-mark="${escapeName(seat.mark)}" class="${me ? "me" : ""}${win ? " win" : ""}">
        <td>${win ? "🏆 " : ""}${emoji} ${escapeName(name)}${seat.is_bot ? " 🤖" : ""}</td>
        <td>${cities}</td><td>${mon}</td><td>${devs}</td><td>${lost}</td><td class="tot"><b>${total}</b></td>
      </tr>`;
    }).join("");
  return `<table class="scoretab">
    <tr><th>Player</th><th>Cities</th><th>Mon</th><th>Dev</th><th>−Lost</th><th>Total</th></tr>
    ${rows}</table>`;
}

function markForPlayer(room, playerId) {
  const seat = (room && room.players || []).find((p) => p.id === playerId);
  return seat ? seat.mark : null;
}
function seatEmoji(room, mark) {
  const seat = (room && room.players || []).find((p) => p.mark === mark);
  return seat && seat.icon ? seat.icon : "🙂";
}
function seatName(room, mark) {
  const seat = (room && room.players || []).find((p) => p.mark === mark);
  return seat ? seat.name : mark;
}
function escapeName(value) {
  return String(value || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function injectStyles() {
  if (document.getElementById("rtta-styles")) return;
  const s = document.createElement("style");
  s.id = "rtta-styles";
  s.textContent = RTTA_CSS;
  document.head.appendChild(s);
}
