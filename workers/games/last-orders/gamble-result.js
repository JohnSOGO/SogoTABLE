// Last Orders — the gamble result hold (2026-11-13). When a gamble settles,
// play pauses on a result card so nobody can miss who won the pot and what
// each gambler lost: the table waits until every human who was in the gamble
// taps "Got it" (ACK_GAMBLE). The hold only exists so a player can take the
// result in, so bots and auto-played seats never block it, an all-bot gamble
// never opens one, and it lapses after HOLD_MS in case a phone walked away.
// Pure functions over the plain game blob; `now` is passed in. ./rules.js
// wires it into the flow (closeWindow, advance, nextDueAt, the move switch,
// the projection and normalize).
import { isBotLike } from "./engine.js";

export const GAMBLE_RESULT_HOLD_MS = 20000;

// Opens the hold for a settled gamble (finishGamble's result). Returns
// whether a hold opened: only when a human was in the gamble.
export function openGambleResult(game, result, now) {
  game.gamble_result = null;
  if (!result || !result.winner) return false;
  const need = result.in.filter((m) => game.players[m] && !isBotLike(game.players[m]));
  if (!need.length) return false;
  game.gamble_result_seq = (Number(game.gamble_result_seq) || 0) + 1;
  game.gamble_result = {
    id: game.gamble_result_seq, winner: result.winner, pot: result.pot, bonus: result.bonus,
    in: [...result.in], paid: { ...result.paid }, need, acked: [], until: now + GAMBLE_RESULT_HOLD_MS,
  };
  return true;
}

// True while the table must wait on the card. Clears a hold that is done:
// everyone needed has acked (or has since gone auto), or it lapsed; onClear
// lets the caller mark the state as changed.
export function gambleResultHolding(game, now, onClear) {
  const h = game.gamble_result;
  if (!h) return false;
  const waiting = h.need.filter((m) => !h.acked.includes(m) && game.players[m] && !isBotLike(game.players[m]));
  if (waiting.length && now < h.until) return true;
  game.gamble_result = null;
  if (onClear) onClear();
  return false;
}

export const gambleResultDueAt = (game) => (game.gamble_result ? game.gamble_result.until : 0);

// "Got it". A mark that isn't needed, or a repeat tap, is quietly ignored.
// Returns whether anything changed.
export function ackGambleResult(game, mark) {
  const h = game.gamble_result;
  if (!h || !h.need.includes(mark) || h.acked.includes(mark)) return false;
  h.acked.push(mark);
  return true;
}

// Wire shape: the result is decided here, the card only renders it. `net` is
// each gambler's change in coins from this gamble (the winner's includes the
// pot and any pot bonus; everyone else lost what they put in).
export function projectGambleResult(game) {
  const h = game.gamble_result;
  if (!h) return null;
  const won = h.pot + h.bonus;
  return {
    id: h.id, winner: h.winner, pot: h.pot, bonus: h.bonus, until: h.until, need: [...h.need], acked: [...h.acked],
    rows: h.in.map((m) => {
      const paid = h.paid[m] || 0;
      return { mark: m, paid, net: m === h.winner ? won - paid : -paid };
    }),
  };
}

// Tolerate garbage in stored state: drop a malformed hold rather than stall.
export function normalizeGambleResult(game) {
  const h = game.gamble_result;
  if (!h) { game.gamble_result = null; return; }
  const seated = (m) => game.seat_order.includes(m);
  const ok = typeof h === "object" && seated(h.winner) && Array.isArray(h.in) && Array.isArray(h.need) && Array.isArray(h.acked);
  if (!ok) { game.gamble_result = null; return; }
  const num = (v) => Math.max(0, Math.trunc(Number(v) || 0));
  const paid = {};
  h.in = h.in.map(String).filter(seated);
  h.in.forEach((m) => { paid[m] = num(h.paid && h.paid[m]); });
  h.paid = paid;
  h.need = h.need.map(String).filter(seated);
  h.acked = h.acked.map(String).filter((m) => h.need.includes(m));
  h.pot = num(h.pot);
  h.bonus = num(h.bonus);
  h.until = num(h.until);
  h.id = num(h.id);
}
