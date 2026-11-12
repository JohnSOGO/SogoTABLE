// Chinese Checkers — mode-specific play controls (PLAN.md "Play modes").
//
// Owns what differs between rounds / blitz / live / turns on the play screen:
// who may act right now, the strip's round label + badges + "my state" line,
// each seat's status pill and order number, the skip vote, and the four-slot
// action bar (Lock in ⇄ Change move in rounds; a single Move in the immediate
// modes). Pure functions over the server projection plus the local selection
// summary render.js passes in; every word comes from branding.js. No rule
// logic: legality still arrives in legal / stops / legal_lite.
import { UI } from "./branding.js";

export function modeOf(game) {
  const m = game && game.options && game.options.mode;
  return m === "blitz" || m === "live" || m === "turns" ? m : "rounds";
}
export const isLiveMode = (mode) => mode === "blitz" || mode === "live";
export function assistsOf(game) {
  const a = game && game.options && game.options.assists;
  return a === "moves" || a === "off" ? a : "full";
}

// Has this seat already used its move this round? (rounds: committed;
// blitz/live: moved — a pass counts too).
export function seatDone(p, mode) {
  if (!p) return false;
  return isLiveMode(mode) ? Boolean(p.moved || p.committed) : Boolean(p.committed);
}

export function canActNow(game, seat) {
  if (!game || game.status !== "playing" || !seat || seat.finished || seat.skipped) return false;
  const mode = modeOf(game);
  if (mode === "turns") return game.current === seat.mark;
  return !seatDone(seat, mode);
}

// PASS is offered when the table allows passing, or the seat has no move.
export const passOpen = (game, movableCount) => !(game.options && game.options.allow_pass === false) || movableCount === 0;

const timerOn = (game) => Number(game.options && game.options.timer) > 0;

// ---------- strip ----------
// s: { game, seat, myMark, anim, sending, from, pathLen, endOk, movable, assists, nameOf }
export function stripModel(s) {
  const { game, seat } = s;
  const mode = modeOf(game);
  const players = Array.isArray(game.players) ? game.players : [];
  const active = players.filter((p) => !p.finished);
  const playing = game.status === "playing";
  const badges = [];
  if (playing && mode === "rounds") {
    const prio = Array.isArray(game.priority_order) ? game.priority_order : [];
    const k = seat ? prio.indexOf(s.myMark) + 1 : 0;
    if (k > 0) badges.push({ cls: `cc-badge-prio${k === 1 ? " cc-first" : ""}`, text: UI.priority(k, prio.length), title: UI.priorityTitle(k, prio.length) });
    badges.push({ cls: "cc-badge-count", text: UI.lockedCount(active.filter((p) => p.committed).length, active.length) });
  } else if (playing && isLiveMode(mode)) {
    badges.push({ cls: "cc-badge-count", text: UI.movedCount(active.filter((p) => seatDone(p, mode)).length, active.length) });
  } else if (playing && mode === "turns" && game.current) {
    const mine = game.current === s.myMark;
    badges.push({ cls: `cc-badge-count cc-badge-turn${mine ? " cc-first" : ""}`, text: UI.turnBadge(s.nameOf(game.current), mine) });
  }
  return { roundLabel: mode === "turns" ? UI.turn(game.round) : UI.round(game.round), badges, state: stateLine(s, mode, players) };
}

function stateLine(s, mode, players) {
  const { game, seat } = s;
  const text = (t, extra = {}) => ({ text: t, ...extra });
  if (game.status === "complete") return text(UI.gameOver);
  if (s.anim && mode === "rounds") return text(UI.replaying);
  if (!seat) return text(mode === "turns" && game.current ? UI.turnBadge(s.nameOf(game.current), false) : UI.spectating);
  if (s.sending) return text(UI.sending);
  if (seat.finished) return text(UI.finished(seat.rank || seat.finish_round || 1));
  if (seat.skipped) return text(UI.skipped);
  const waiting = players.filter((p) => !p.is_bot && !p.skipped && !p.finished && p.mark !== s.myMark && !seatDone(p, mode)).map((p) => s.nameOf(p.mark));
  if (mode === "rounds" && seat.committed) return text((seat.commit && seat.commit.pass ? UI.lockedPass : UI.locked)(waiting), { done: true });
  if (isLiveMode(mode) && seatDone(seat, mode)) {
    return Number.isFinite(game.deadline) ? text("", { done: true, secsParts: UI.movedNext }) : text(UI.moved(waiting), { done: true });
  }
  if (mode === "turns" && game.current !== seat.mark) return text(UI.waitTurn(s.nameOf(game.current)));
  const lead = mode === "turns" ? `${UI.yourTurn} ` : "";
  if (!s.movable) return text(lead + UI.noMoves, { turn: Boolean(lead) });
  const verb = mode === "rounds" ? UI.lock : UI.move;
  let line;
  if (s.assists === "off") line = s.pathLen ? UI.offPath(verb) : (s.from ? UI.offPicked(verb) : UI.offPick);
  else if (s.pathLen) line = s.endOk ? UI.chain(verb) : UI.passThrough;
  else line = s.from ? UI.picked : UI.pick;
  return text(lead + line, { turn: Boolean(lead) });
}

// ---------- seat table ----------
export function seatStatus(p, game) {
  const mode = modeOf(game);
  if (p.finished) return { statusKey: "finished", statusText: UI.statusFinished(p.rank || 1) };
  if (p.skipped) return { statusKey: "skipped", statusText: UI.statusSkipped };
  if (mode === "turns") {
    if (game.current === p.mark) return { statusKey: "turn", statusText: UI.statusTurn };
    return p.is_bot ? { statusKey: "bot", statusText: UI.statusBot } : { statusKey: "waiting", statusText: UI.statusWaiting };
  }
  if (seatDone(p, mode)) return { statusKey: "locked", statusText: isLiveMode(mode) ? UI.statusMoved : UI.statusLocked };
  return p.is_bot ? { statusKey: "bot", statusText: UI.statusBot } : { statusKey: "thinking", statusText: UI.statusThinking };
}

// Order badge: rounds = this round's priority, turns = seat in the turn order.
export function seatOrder(p, game) {
  if (game.status !== "playing") return 0;
  const mode = modeOf(game);
  const list = mode === "rounds" ? game.priority_order : (mode === "turns" ? game.turn_order : null);
  const i = Array.isArray(list) ? list.indexOf(p.mark) : -1;
  return i >= 0 ? i + 1 : 0;
}

// Skip vote (PLAN: only rounds/turns without a clock). Rounds: seats that are
// done vote on a human who isn't. Turns: other humans vote on the current one.
export function skipFor(p, game, me) {
  const mode = modeOf(game);
  const seat = me.mySeat;
  if (game.status !== "playing" || isLiveMode(mode) || timerOn(game)) return null;
  if (!seat || seat.is_bot || seat.skipped || p.is_bot || p.skipped || p.finished || p.mark === me.myMark) return null;
  const players = me.players;
  let eligible;
  if (mode === "turns") {
    if (game.current !== p.mark) return null;
    eligible = players.filter((x) => !x.is_bot && !x.skipped && x.mark !== p.mark);
  } else {
    if (p.committed || !(seat.committed || seat.finished)) return null;
    eligible = players.filter((x) => !x.is_bot && !x.skipped && (x.committed || x.finished));
  }
  const votes = (game.skip_votes && Array.isArray(game.skip_votes[p.mark])) ? game.skip_votes[p.mark] : [];
  return { votes: votes.length, needed: eligible.length, mine: votes.includes(me.myMark) };
}

// ---------- action bar ----------
// s: { game, seat, acting, busy, hasPath, hasSel, canSubmit, movable }
export function controlsModel(s) {
  const mode = modeOf(s.game);
  const { acting, busy } = s;
  let primary = "move";
  if (mode === "rounds") primary = s.seat && s.seat.committed ? "change" : "lock";
  else if (isLiveMode(mode) && seatDone(s.seat, mode)) primary = "moved";
  return {
    primary, sending: Boolean(s.sending),
    canPrimary: primary === "change"
      ? Boolean(s.seat && s.seat.committed && s.game.status === "playing" && !s.pending)
      : primary !== "moved" && acting && !busy && s.canSubmit,
    canUndo: acting && !s.pending && s.hasPath,
    canClear: acting && !s.pending && s.hasSel,
    canPass: acting && !busy && passOpen(s.game, s.movable),
  };
}

// Fixed four-slot bar: the primary slot swaps its label (Lock in ⇄ Change move,
// or Move ⇄ Moved ✓) so no control ever moves; unavailable controls are
// disabled, never hidden.
export function controlsHtml(c, esc) {
  const label = { lock: UI.lock, change: UI.change, move: UI.move, moved: UI.movedDone }[c.primary];
  const act = c.primary === "change" ? "retract" : "lock";
  const cls = c.primary === "change" ? "cc-btn-change" : (c.primary === "lock" ? "cc-btn-lock" : "cc-btn-lock cc-btn-move");
  return `<button type="button" class="cc-btn cc-btn-ghost" data-cc-act="undo" ${c.canUndo ? "" : "disabled"}>↶ ${esc(UI.undo)}</button>
    <button type="button" class="cc-btn cc-btn-ghost" data-cc-act="clear" ${c.canClear ? "" : "disabled"}>✕ ${esc(UI.clear)}</button>
    <button type="button" class="cc-btn cc-btn-pass" data-cc-act="pass" ${c.canPass ? "" : "disabled"}>${esc(UI.pass)}</button>
    <button type="button" class="cc-btn ${cls}" data-cc-act="${act}" ${c.canPrimary ? "" : "disabled"}>${esc(c.sending && c.primary !== "change" ? UI.sending : label)}</button>`;
}
