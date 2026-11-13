// Last Orders — the gamble result card (pure view; decides nothing).
//
// When a gamble settles the server holds play on game.gamble_result until
// every human who was in it taps "Got it" (ACK_GAMBLE), or its clock lapses.
// This builds the card from that projection only: the winner, the pot, and
// every gambler's coins won or lost arrive computed (rows[].net), so the
// client does no arithmetic and no win logic. render.js mounts it in its own
// section and routes the button (data-lo-act="gamble_ack") to ACK_GAMBLE.
import { GAMBLE_RESULT as L, STATS } from "./branding.js";
import { patronName, portrait } from "./panels.js";

const signed = (n) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n)}`;

// vm: render.js's view model (esc, nameOf, colorOf, players, myMark, theme).
export function gambleResultHtml(vm) {
  const r = vm.game.gamble_result;
  if (!r || vm.game.status !== "playing") return "";
  const seat = (m) => (vm.players || []).find((p) => p.mark === m) || {};
  // Patron first, the player's name smaller beside it.
  const who = (m) => (seat(m).character ? patronName(seat(m).character) : vm.nameOf(m));
  const player = (m) => (seat(m).character ? `<i class="lo-gr-player">${vm.esc(vm.nameOf(m))}</i>` : "");
  const winner = seat(r.winner);
  const mine = r.rows.find((row) => row.mark === vm.myMark);
  const iWon = r.winner === vm.myMark;
  const winRow = r.rows.find((row) => row.mark === r.winner) || { net: r.pot + r.bonus };
  const headline = iWon ? L.youWin : L.wins(who(r.winner));
  const mineLine = mine && !iWon && mine.paid ? `<div class="lo-gr-mine">${vm.esc(L.youLost(mine.paid))}</div>` : "";

  const losers = r.rows.filter((row) => row.mark !== r.winner).map((row) => {
    const p = seat(row.mark);
    const me = row.mark === vm.myMark;
    const sub = p.out === "broke" ? `<small class="lo-gr-broke">${vm.esc(L.broke)}</small>` : `<small>${vm.esc(L.now(p.gold))} ${STATS.gold.icon}</small>`;
    return `<li class="lo-gr-row${me ? " lo-me" : ""}">
        <span class="lo-gr-face">${portrait(vm, p.character, 36)}</span>
        <span class="lo-gr-name"><b style="color:${vm.colorOf(row.mark)}">${vm.esc(who(row.mark))} ${player(row.mark)}</b>${sub}</span>
        <span class="lo-gr-delta lo-gr-down">${vm.esc(L.lost)} <b>${vm.esc(signed(row.net))}</b> ${STATS.gold.icon}</span>
      </li>`;
  }).join("");

  const need = r.need || [];
  const acked = r.acked || [];
  const iNeed = need.includes(vm.myMark);
  const iAcked = acked.includes(vm.myMark);
  const left = need.filter((m) => !acked.includes(m));
  let foot;
  if (iNeed && !iAcked) {
    foot = `<button type="button" class="lo-btn lo-btn-primary lo-gr-ack" data-lo-act="gamble_ack">${vm.esc(L.ack)} <span class="lo-gr-count" data-lo-count="${r.until}"></span></button>`;
  } else {
    const names = left.map((m) => vm.nameOf(m)).join(", ");
    foot = `<div class="lo-gr-wait">${iAcked ? `<b>${vm.esc(L.acked)}</b> ` : ""}${vm.esc(left.length ? L.waiting(names) : L.watching)} <span class="lo-gr-count" data-lo-count="${r.until}"></span></div>`;
  }

  return `<div class="lo-gr-scrim"></div>
    <div class="lo-gr${iWon ? " lo-gr-iwon" : mine ? " lo-gr-ilost" : ""}" role="alertdialog" aria-labelledby="lo-gr-title" data-lo-gr="${r.id}">
      <div class="lo-gr-title" id="lo-gr-title">🎲 ${vm.esc(L.title)}</div>
      <div class="lo-gr-winner">
        <span class="lo-gr-crown" aria-hidden="true">👑</span>
        <span class="lo-gr-wface">${portrait(vm, winner.character, 72)}</span>
        <b class="lo-gr-wname" style="color:${vm.colorOf(r.winner)}">${vm.esc(headline)}</b>${iWon ? "" : player(r.winner)}
        <span class="lo-gr-won">${vm.esc(L.won)} <b>${vm.esc(signed(winRow.net))}</b> ${STATS.gold.icon}</span>
        <small class="lo-gr-pot">${vm.esc(L.pot(r.pot, r.bonus))} · ${vm.esc(L.put(winRow.paid || 0))}</small>
      </div>
      ${mineLine}
      ${losers ? `<ul class="lo-gr-list">${losers}</ul>` : ""}
      <div class="lo-gr-foot">${foot}</div>
    </div>`;
}
