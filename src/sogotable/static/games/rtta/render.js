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
      ${eventsHtml(game, room)}
      <p class="rtta-status">${status}</p>
      ${canReady ? '<button class="rtta-ready blink" id="rttaReady" type="button">Ready for next round →</button>' : ""}
    </div>`;
  const readyBtn = host.querySelector("#rttaReady");
  if (readyBtn) readyBtn.addEventListener("click", () => { readyBtn.disabled = true; ctx.makeMove({ type: "READY_NEXT" }); });
}

// Cross-player events surfaced by the server at the barrier. The skull fly
// animation is the next task; for now name who struck whom.
function eventsHtml(game, room) {
  const events = Array.isArray(game.pending_events) ? game.pending_events : [];
  if (!events.length) return "";
  const lines = events.map((ev) => {
    const from = escapeName(seatName(room, ev.from));
    const n = Array.isArray(ev.to) ? ev.to.length : 0;
    if (ev.kind === "pestilence") return `☠️ <span class="rtta-event">Pestilence</span> — ${from} sent 3 skulls to ${n} opponent${n === 1 ? "" : "s"} (−3 each).`;
    if (ev.kind === "revolt") return `🔥 <span class="rtta-event">Revolt</span> — ${from} wiped every opponent's goods.`;
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
      return `<tr class="${me ? "me" : ""}${win ? " win" : ""}">
        <td>${win ? "🏆 " : ""}${emoji} ${escapeName(name)}${seat.is_bot ? " 🤖" : ""}</td>
        <td>${cities}</td><td>${mon}</td><td>${devs}</td><td>${lost}</td><td><b>${total}</b></td>
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
