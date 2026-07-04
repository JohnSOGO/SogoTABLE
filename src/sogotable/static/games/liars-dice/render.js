// Liar's Dice — in-game UI adapter. Renders the prepared server projection and
// captures intent; it computes NO rule outcomes (raise legality, challenge
// math, die loss, and elimination all arrive decided from the worker rules
// module — the tap-to-count bid picker is bounded by the server's
// raise_options list, and other players' dice arrive already masked by the
// worker's viewer sanitizer). The shell hands a ctx bag (host, game, room,
// started, isHost, localPlayerId, pendingMove, makeMove, startGame, addBot,
// invitePlayer, escapeHtml) exactly like the other host-start games; the
// pre-game screen is the shared renderHostStartLobby template. All wiring is
// addEventListener — no inline onclick, and no imports from app.js.
//
// Layout (per the 2026-07-03 preview review, AI/liars-dice/preview.html is
// the spec): tip strip (all long guidance/verdict text) → reveal panel →
// your cup (face-down until the dead-man peek button is HELD) → tap-to-count
// picker → this round's history table + standings side by side → peek button.
//
// Pacing: the server resolves a whole bot chain inside one snapshot, so this
// renderer replays the new events one at a time (~1.4s apart) — the table
// reads like people taking turns, never an instant blur. Interactions stay
// hidden until the replay catches up to the authoritative state.
import { renderHostStartLobby } from "../lobby.js";
import { LD_CSS } from "./styles.js";

const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const FTXT = ["", "ones", "twos", "threes", "fours", "fives", "sixes"];
const BOT_STEP_MS = 1400;
let stylesInjected = false;
// Tap-to-count scratch bid, keyed by room + move_count so every table change
// resets it to the smallest legal raise.
let picker = { key: "", quantity: 0, face: 0 };
// Event replay cursor: how far into game.events the display has advanced.
let pace = { key: "", shown: 0, timer: null };

export function renderLiarsDiceGame(ctx) {
  const { host, game } = ctx;
  if (!host || !game) return;
  if (!stylesInjected) {
    const style = document.createElement("style");
    style.textContent = LD_CSS;
    document.head.appendChild(style);
    stylesInjected = true;
  }
  host.className = "macro-board liars-dice-table";
  if (!ctx.started) {
    renderHostStartLobby(host, ctx, {
      wrap: "liars-dice-root",
      heading: "Players",
      blurb: "Everyone rolls a hidden cup — raise the bid or call LIAR. Needs 2+ players; invite players or a bot, then start.",
    });
    return;
  }
  renderLiarsDicePlay(host, ctx);
}

function renderLiarsDicePlay(host, ctx) {
  const { room, game } = ctx;
  // Read the pending-move latch LIVE, not from the captured ctx: replay-timer
  // re-renders reuse an old ctx, and a stale `pendingMove: true` in it would
  // suppress the picker forever if no fresh snapshot arrives (the "SOGO stuck
  // on his turn with no buttons" freeze, 2026-07-03).
  const movePending = typeof ctx.isMovePending === "function" ? ctx.isMovePending() : Boolean(ctx.pendingMove);
  const seats = Array.isArray(game.players) ? game.players : [];
  const localMark = markForPlayer(room, ctx.localPlayerId);
  const localSeat = seats.find((seat) => seat.mark === localMark) || null;
  const complete = game.status === "complete";

  // ---- replay cursor: advance one event per paint, timer-drive the rest ----
  clearTimeout(pace.timer);
  const paceKey = `${room.code}:${room.game_epoch}`;
  const target = Number(game.move_count || 0);
  const events = Array.isArray(game.events) ? game.events : [];
  if (pace.key !== paceKey) pace = { key: paceKey, shown: target, timer: null };
  if (pace.shown < target) {
    const next = events.find((event) => Number(event.move_count) > pace.shown);
    pace.shown = next ? Number(next.move_count) : target;
  }
  if (pace.shown > target) pace.shown = target; // reset/rewind (new game epoch bumps the key, this is belt+braces)
  const caughtUp = pace.shown >= target;
  if (!caughtUp) {
    pace.timer = setTimeout(() => {
      if (host.isConnected && host.querySelector(".liars-dice-root")) renderLiarsDicePlay(host, ctx);
    }, BOT_STEP_MS);
  }

  const visible = events.filter((event) => Number(event.move_count) <= pace.shown);
  const lastVisible = visible[visible.length - 1] || null;
  // History clears on a re-roll: once caught up, only the CURRENT round's
  // events show (game.round advances at next_round, leaving the log empty
  // until the first bid). Mid-replay, follow the round of the shown event.
  const viewRound = caughtUp || !lastVisible ? Number(game.round || 1) : Number(lastVisible.round);
  const roundEvents = visible.filter((event) => Number(event.round) === viewRound);
  const shownBid = caughtUp ? game.current_bid : replayStandingBid(roundEvents);
  const showReveal = caughtUp && game.phase === "reveal" && game.last_reveal;
  const myTurn = caughtUp && !movePending && Boolean(localSeat && localSeat.is_turn) && game.phase === "bidding" && !complete;
  if (myTurn) syncPicker(room, game);
  // Watchdog: if actions are suppressed only by the pending latch, re-render
  // shortly — the shell may not re-render on its own (identical snapshot), and
  // this board must never wedge on a player's turn.
  if (caughtUp && movePending && !complete) {
    pace.timer = setTimeout(() => {
      if (host.isConnected && host.querySelector(".liars-dice-root")) renderLiarsDicePlay(host, ctx);
    }, 900);
  }

  const showCup = !complete && localSeat && !localSeat.eliminated && game.phase === "bidding";
  host.innerHTML = `
    <div class="liars-dice-root">
      ${complete && game.winner ? `<p class="ld-panel ld-banner ld-win">\u{1F3C6} ${escapeName(seatName(room, game.winner))} wins Liar's Dice!</p>` : ""}
      ${tipHtml(game, room, localSeat, { caughtUp, showReveal, myTurn, shownBid, roundEvents, complete })}
      ${showReveal ? revealHtml(game, room, localSeat, complete, movePending) : ""}
      ${showCup ? cupHtml(localSeat) : ""}
      ${myTurn ? pickerHtml(game) : ""}
      ${tablesHtml(seats, room, game, { roundEvents, caughtUp, myTurn, shownBid, complete })}
      <p class="ld-msg" data-ld-note hidden></p>
      ${showCup ? `<button class="ld-peek-btn" type="button" data-ld-peek aria-label="Hold to see your dice">\u{1F92B} HOLD TO SEE YOUR DICE</button>` : ""}
    </div>`;
  wireLiarsDice(host, ctx, myTurn);
}

// ---------- projections of the replay cursor ----------

function replayStandingBid(roundEvents) {
  let bid = null;
  for (const event of roundEvents) {
    if (event.type === "bid") bid = { quantity: event.quantity, face: event.face, mark: event.mark };
    else if (event.type === "challenge") bid = null;
  }
  return bid;
}

// Whose action the display is waiting on mid-replay: turn order is fewest-
// plays with random tie-breaks (server-decided), so the client cannot derive
// it — each bid event carries the chosen `next` mark instead.
function replayActor(seats, roundEvents) {
  const lastBid = [...roundEvents].reverse().find((event) => event.type === "bid");
  return lastBid && lastBid.next ? lastBid.next : null;
}

// ---------- html builders ----------

function pips(value) {
  return `<span class="ld-pips">${(PIPS[value] || []).map((cell) =>
    `<i style="grid-area:${Math.ceil(cell / 3)}/${((cell - 1) % 3) + 1}"></i>`).join("")}</span>`;
}

function tipHtml(game, room, localSeat, view) {
  let tip = "";
  let lost = false;
  const meOut = Boolean(localSeat && localSeat.eliminated);
  if (view.complete && game.winner) {
    tip = `Game over — ${escapeName(seatName(room, game.winner))} takes the table.`;
  } else if (view.showReveal) {
    const reveal = game.last_reveal;
    const bid = reveal.bid || {};
    const loserName = escapeName(seatName(room, reveal.loser));
    tip = reveal.outcome === "bid_holds"
      ? `The bid held — ${fmt(reveal.actual)} ${FTXT[bid.face]} on the table. ${escapeName(seatName(room, reveal.challenger))} called LIAR wrongly and loses a die!`
      : `LIAR confirmed — only ${fmt(reveal.actual)} ${FTXT[bid.face]}, not ${fmt(bid.quantity)}. ${loserName} loses a die!`;
    if (reveal.loser_eliminated) tip += ` ${loserName} is out of the game.`;
    if (meOut) tip += ` You're out — watch the bluffing play out.`;
    lost = Boolean(localSeat && reveal.loser === localSeat.mark);
  } else if (view.myTurn) {
    tip = view.shownBid
      ? "Hold the button to peek at your cup, then raise the bid or call LIAR — ones are wild."
      : "Hold the button to peek at your cup, then open the bidding — ones are wild.";
  } else if (!view.caughtUp || game.phase === "bidding") {
    const actor = view.caughtUp ? game.current_player : replayActor(game.players || [], view.roundEvents);
    tip = actor ? `${escapeName(seatName(room, actor))} is thinking…` : "…";
  } else {
    tip = "Waiting for the next round…";
  }
  return `<p class="ld-tip${lost ? " ld-lost" : ""}${view.myTurn ? " ld-your-turn" : ""}">${tip}</p>`;
}

function cupHtml(seat) {
  const dice = (Array.isArray(seat.dice) ? seat.dice : []).filter((die) => die).slice().sort((a, b) => a - b);
  return `<section class="ld-panel" aria-label="Your dice">
    <span class="ld-cup-label">Your cup</span>
    <div class="ld-dice-row ld-cup-row">${dice.map((die) =>
      `<span class="ld-die ld-secret" role="img" aria-label="your hidden die">${pips(die)}</span>`).join("")}</div>
  </section>`;
}

// Tap-to-count picker: tapping a face selects it at its minimum legal
// quantity, further taps bump the count, switching faces resets. Bounds come
// from the server's raise_options only.
function pickerHtml(game) {
  const options = Array.isArray(game.raise_options) ? game.raise_options : [];
  if (!options.length) {
    return `<section class="ld-panel ld-picker" data-ld-picker>
      <p class="ld-msg">No raise is possible — it's LIAR time.</p>
      <div class="ld-actions">
        <button class="ld-liar" type="button" data-ld="challenge" aria-label="Call liar">\u{1F921} LIAR! \u{1F921}</button>
      </div>
    </section>`;
  }
  const faces = [1, 2, 3, 4, 5, 6].map((face) => `
    <button type="button" data-ld-face="${face}" aria-pressed="${face === picker.face}"
      aria-label="bid on ${FTXT[face]}" ${minQuantityFor(options, face) === null ? "disabled" : ""}>
      ${pips(face)}${face === picker.face ? `<span class="ld-face-count">${fmt(picker.quantity)}</span>` : ""}
    </button>`).join("");
  return `<section class="ld-panel ld-picker" data-ld-picker aria-label="Compose your bid">
    <div class="ld-faces" aria-label="tap a face to raise your count">${faces}</div>
    <div class="ld-actions">
      <button class="primary" type="button" data-ld="bid" aria-label="place this bid">\u{1F3B2} Bid ${fmt(picker.quantity)} ${FTXT[picker.face]}</button>
      ${game.current_bid ? `<button class="ld-liar" type="button" data-ld="challenge" aria-label="Call liar">\u{1F921} LIAR!</button>` : ""}
    </div>
  </section>`;
}

// This round's history (player | bid as actual dice) beside the standings.
function tablesHtml(seats, room, game, view) {
  const rows = view.roundEvents.map((event) => {
    if (event.type === "bid") {
      const dice = Array.from({ length: Number(event.quantity) || 0 },
        () => `<span class="ld-die ld-mini">${pips(event.face)}</span>`).join("");
      return `<tr><td class="ld-log-name">${seatEmoji(room, event.mark)} ${escapeName(seatName(room, event.mark))}</td>
        <td><span class="ld-dice-cell">${dice}</span></td></tr>`;
    }
    if (event.type === "challenge") {
      return `<tr><td class="ld-log-name">${seatEmoji(room, event.mark)} ${escapeName(seatName(room, event.mark))}</td>
        <td><span class="ld-liar-tag">LIAR!</span> \u{1F4A5}</td></tr>`;
    }
    return "";
  }).join("");
  const winRow = view.complete && game.winner
    ? `<tr class="ld-log-win"><td colspan="2">\u{1F3C6} ${escapeName(seatName(room, game.winner))} wins the game!</td></tr>` : "";
  let status = "";
  if (!view.complete) {
    if (!view.caughtUp) {
      const actor = replayActor(seats, view.roundEvents);
      status = `⏳ Waiting for ${actor ? escapeName(seatName(room, actor)) : "…"}…`;
    } else if (game.phase === "bidding") {
      status = view.myTurn ? "▶ Your move" : `⏳ Waiting for ${escapeName(seatName(room, game.current_player))}…`;
    } else if (game.phase === "reveal") {
      status = "▶ Roll the next round";
    }
  }
  const standingRows = seats.map((seat) => {
    const isTurn = view.caughtUp && game.phase === "bidding" && seat.is_turn && !view.complete;
    return `<tr class="${isTurn ? "ld-turn-row" : ""}${seat.eliminated ? " ld-out-row" : ""}">
      <td>${seatEmoji(room, seat.mark)} ${escapeName(seatName(room, seat.mark))}${view.complete && seat.mark === game.winner ? " \u{1F3C6}" : ""}</td>
      <td class="ld-count">${seat.eliminated ? "—" : fmt(seat.dice_count)}</td>
    </tr>`;
  }).join("");
  return `<div class="ld-top">
    <section class="ld-panel ld-log-panel" aria-label="This round's bids"><div class="ld-log" data-ld-log>
      <table class="ld-log-table"><tbody>
        ${rows}${winRow}${status ? `<tr class="ld-log-now"><td colspan="2">${status}</td></tr>` : ""}
      </tbody></table>
    </div></section>
    <section class="ld-panel ld-side" aria-label="Standings"><table class="ld-side-table">
      <thead><tr><th>Player</th><th>\u{1F3B2}</th></tr></thead>
      <tbody>${standingRows}</tbody>
    </table></section>
  </div>`;
}

function revealHtml(game, room, localSeat, complete, movePending) {
  const reveal = game.last_reveal;
  const bid = reveal.bid || {};
  const rows = Object.entries(reveal.dice || {}).map(([mark, dice]) => {
    const diceHtml = (Array.isArray(dice) ? dice : []).slice().sort((a, b) => a - b).map((die) => {
      const matches = die === bid.face || (die === 1 && bid.face !== 1);
      return `<span class="ld-die ld-small${matches ? " ld-hit" : ""}"
        role="img" aria-label="${escapeName(seatName(room, mark))}'s die: ${die}">${pips(die)}</span>`;
    }).join("");
    return `<div class="ld-reveal-row">
      <span class="ld-reveal-name">${seatEmoji(room, mark)} <span>${escapeName(seatName(room, mark))}</span></span>
      <div class="ld-dice-row">${diceHtml}</div>
    </div>`;
  }).join("");
  const canContinue = !complete && localSeat && !localSeat.eliminated && !movePending;
  return `<section class="ld-panel ld-reveal" aria-label="The reveal">
    <p class="ld-reveal-outcome${localSeat && reveal.loser === localSeat.mark ? " ld-lost" : ""}">
      ${escapeName(seatName(room, reveal.challenger))} called LIAR on ${escapeName(seatName(room, bid.mark))}'s ${fmt(bid.quantity)} ${FTXT[bid.face]}</p>
    ${rows}
    ${canContinue ? `<div class="ld-actions">
      <button class="primary" type="button" data-ld="next-round" aria-label="Start the next round">\u{1F3B2} Roll the next round</button>
    </div>` : ""}
  </section>`;
}

// ---------- picker state ----------

function minQuantityFor(options, face) {
  const option = options.find((item) => face >= item.min_face);
  return option ? option.quantity : null;
}

function syncPicker(room, game) {
  const options = Array.isArray(game.raise_options) ? game.raise_options : [];
  if (!options.length) return;
  const key = `${room.code}:${room.game_epoch}:${game.move_count}`;
  if (picker.key !== key) picker = { key, quantity: options[0].quantity, face: options[0].min_face };
}

function wireLiarsDice(host, ctx, myTurn) {
  const note = host.querySelector("[data-ld-note]");
  const log = host.querySelector("[data-ld-log]");
  if (log) log.scrollTop = log.scrollHeight;
  const send = async (action) => {
    const error = await ctx.makeMove(action);
    if (error && note) {
      note.textContent = error;
      note.hidden = false;
      note.classList.add("ld-error");
    }
  };
  const wire = (key, fn) => {
    const button = host.querySelector(`[data-ld="${key}"]`);
    if (button) button.addEventListener("click", () => { if (!button.disabled) fn(); });
  };
  wire("challenge", () => send({ type: "challenge" }));
  wire("next-round", () => send({ type: "next_round" }));
  wire("bid", () => send({ type: "bid", quantity: picker.quantity, face: picker.face }));
  // Dead-man switch: dice show only while the peek button is physically held.
  const peek = host.querySelector("[data-ld-peek]");
  const root = host.querySelector(".liars-dice-root");
  if (peek && root && !peek.dataset.ldWired) {
    peek.dataset.ldWired = "1"; // picker repaints re-run this pass; the peek button survives them
    peek.addEventListener("contextmenu", (event) => event.preventDefault());
    peek.addEventListener("pointerdown", (event) => {
      peek.setPointerCapture(event.pointerId);
      root.classList.add("ld-peek");
    });
    const end = () => root.classList.remove("ld-peek");
    peek.addEventListener("pointerup", end);
    peek.addEventListener("pointercancel", end);
  }
  if (!myTurn) return;
  // Tap-to-count: face taps only reshape the local scratch bid — repaint the
  // picker panel in place (no server round-trip until Bid).
  const game = ctx.game;
  const options = Array.isArray(game.raise_options) ? game.raise_options : [];
  const maxQuantity = options.length ? options[options.length - 1].quantity : 0;
  const repaint = () => {
    const panel = host.querySelector("[data-ld-picker]");
    if (!panel) return;
    panel.outerHTML = pickerHtml(game);
    wireLiarsDice(host, ctx, myTurn);
  };
  host.querySelectorAll("[data-ld-face]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      const face = Number(button.getAttribute("data-ld-face"));
      const min = minQuantityFor(options, face);
      if (min === null) return;
      if (picker.face === face) picker.quantity = Math.min(picker.quantity + 1, maxQuantity);
      else { picker.face = face; picker.quantity = min; }
      repaint();
    });
  });
}

// ---------- room helpers ----------

function markForPlayer(room, playerId) {
  const seat = (room.players || []).find((player) => player.id === playerId);
  return seat ? seat.mark : null;
}

function seatEmoji(room, mark) {
  const seat = (room.players || []).find((player) => player.mark === mark);
  return seat && seat.icon ? seat.icon : "\u{1F642}";
}

function seatName(room, mark) {
  const seat = (room.players || []).find((player) => player.mark === mark);
  return seat ? seat.name : mark;
}

function fmt(value) {
  return Number(value || 0).toLocaleString();
}

function escapeName(value) {
  return String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}
