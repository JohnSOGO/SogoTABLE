// No Thanks! — in-game UI adapter. Renders the prepared server projection and
// captures intent; it computes NO rule outcomes (pass legality, run scoring,
// and the winner all arrive decided from the worker rules module — other
// players' chip stacks arrive already masked by the worker's viewer
// sanitizer, and the deck is a count, never a pile). The shell hands the same
// ctx bag as the other host-start games; the pre-game screen is the shared
// renderHostStartLobby template. All wiring is addEventListener — no inline
// onclick, and no imports from app.js. Card visuals come from ./cards.js (the
// card look/tap/drag pilot).
//
// Pacing: the server resolves a whole bot chain inside one snapshot, so this
// renderer replays the new events one at a time (~1.1s apart) — the table
// reads like people deciding in turn, never an instant blur. Each event
// carries the public table (card + pot), so mid-replay frames redraw the
// exact moment. Interactions stay hidden until the replay catches up.
import { renderHostStartLobby } from "../lobby.js";
import { noThanksCardHtml, noThanksRunsHtml, noThanksChipsHtml } from "./cards.js";
import { NT_CSS } from "./styles.js";

const BOT_STEP_MS = 1100;
let stylesInjected = false;
// Event replay cursor: how far into game.events the display has advanced.
let pace = { key: "", shown: 0, timer: null };
// The table card last painted — a changed value replays the deal-in flip.
let lastCardShown = null;

export function renderNoThanksGame(ctx) {
  const { host, game } = ctx;
  if (!host || !game) return;
  if (!stylesInjected) {
    const style = document.createElement("style");
    style.textContent = NT_CSS;
    document.head.appendChild(style);
    stylesInjected = true;
  }
  host.className = "macro-board no-thanks-table";
  if (!ctx.started) {
    renderHostStartLobby(host, ctx, {
      wrap: "no-thanks-root",
      heading: "Players",
      blurb: "One card is up at a time — pay a chip to dodge it or take it with the pot. Needs 3-7 players; invite players or bots, then start.",
    });
    return;
  }
  renderNoThanksPlay(host, ctx);
}

function renderNoThanksPlay(host, ctx) {
  const { room, game } = ctx;
  // Read the pending-move latch LIVE, not from the captured ctx (the Liar's
  // Dice replay-timer freeze, 2026-07-03): timer re-renders reuse an old ctx.
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
  if (pace.shown > target) pace.shown = target;
  const caughtUp = pace.shown >= target;
  if (!caughtUp) {
    pace.timer = setTimeout(() => {
      if (host.isConnected && host.querySelector(".no-thanks-root")) renderNoThanksPlay(host, ctx);
    }, BOT_STEP_MS);
  }
  const visible = events.filter((event) => Number(event.move_count) <= pace.shown);
  const lastVisible = visible[visible.length - 1] || null;
  // Mid-replay the table redraws the shown event's moment (each event carries
  // card + pot); caught up it paints the authoritative state.
  const table = caughtUp || !lastVisible
    ? { card: game.current_card, pot: Number(game.pot || 0) }
    : tableAtEvent(lastVisible);
  const showResults = caughtUp && complete;
  const myTurn = caughtUp && !movePending && Boolean(localSeat && localSeat.is_turn) && !complete;
  // Watchdog: if actions are suppressed only by the pending latch, re-render
  // shortly — this board must never wedge on a player's turn.
  if (caughtUp && movePending && !complete) {
    pace.timer = setTimeout(() => {
      if (host.isConnected && host.querySelector(".no-thanks-root")) renderNoThanksPlay(host, ctx);
    }, 900);
  }

  const flip = table.card !== null && table.card !== lastCardShown;
  lastCardShown = table.card;
  host.innerHTML = `
    <div class="no-thanks-root">
      ${showResults && game.winner ? `<p class="nt-panel nt-banner">\u{1F3C6} ${escapeName(seatName(room, game.winner))} wins No Thanks!</p>` : ""}
      ${tipHtml(game, room, localSeat, { caughtUp, myTurn, complete, lastVisible })}
      ${showResults ? resultsHtml(game, room) : tableHtml(table, game, caughtUp, flip)}
      ${myTurn ? actionsHtml(localSeat, table) : ""}
      <p class="nt-msg" data-nt-note hidden></p>
      ${localSeat && !showResults ? mySeatHtml(localSeat) : ""}
      ${othersHtml(seats, room, game, localSeat, { caughtUp, complete })}
    </div>`;
  wireNoThanks(host, ctx, myTurn);
}

// ---------- projections of the replay cursor ----------

// The public table at an event: a pass leaves its card with the grown pot; a
// take clears the pot and (if the deck had more) flips the next card.
function tableAtEvent(event) {
  if (event.type === "pass") return { card: event.card, pot: Number(event.pot || 0) };
  if (event.type === "take") return { card: event.next_card ?? null, pot: 0, justTook: event };
  return { card: null, pot: 0 };
}

// ---------- html builders ----------

function tipHtml(game, room, localSeat, view) {
  let tip = "";
  if (view.complete && view.caughtUp && game.winner) {
    tip = `Game over — ${escapeName(seatName(room, game.winner))} takes it with the lowest score.`;
  } else if (view.myTurn) {
    tip = Number(localSeat.chips) > 0
      ? "Take the card (and every chip on it), or pay 1 chip to say No Thanks."
      : "You're out of chips — you must take the card.";
  } else if (!view.caughtUp && view.lastVisible) {
    const event = view.lastVisible;
    if (event.type === "pass") tip = `${escapeName(seatName(room, event.mark))} says No Thanks and adds a chip…`;
    else if (event.type === "take") tip = `${escapeName(seatName(room, event.mark))} takes the ${event.card}${event.chips_gained ? ` and ${fmt(event.chips_gained)} \u{1FA99}` : ""}…`;
    else tip = "…";
  } else if (game.current_player) {
    tip = `${escapeName(seatName(room, game.current_player))} is deciding…`;
  } else {
    tip = "…";
  }
  return `<p class="nt-tip${view.myTurn ? " nt-your-turn" : ""}">${tip}</p>`;
}

function tableHtml(table, game, caughtUp, flip) {
  const deckCount = caughtUp ? Number(game.deck_count || 0) : null;
  return `<section class="nt-panel nt-table" aria-label="The table">
    <div>
      <div class="nt-deck"><span class="nt-deck-count">${deckCount === null ? "…" : fmt(deckCount)}</span></div>
      <span class="nt-deck-label">deck</span>
    </div>
    <div class="nt-spot">
      ${table.card === null ? `<span class="nt-no-cards">no card</span>` : noThanksCardHtml(table.card, { size: "big", flip })}
      <div>
        <span class="nt-pot${table.pot ? "" : " nt-pot-empty"}" aria-label="${table.pot} chips on the card">\u{1FA99} ${fmt(table.pot)}</span>
      </div>
    </div>
  </section>`;
}

function actionsHtml(localSeat, table) {
  const canPass = Number(localSeat.chips) > 0;
  return `<div class="nt-actions">
    <button class="nt-pass" type="button" data-nt="pass" ${canPass ? "" : "disabled"}
      aria-label="Pay one chip to pass">\u{1F645} No Thanks! −1 \u{1FA99}</button>
    <button class="nt-take" type="button" data-nt="take"
      aria-label="Take the card and ${table.pot} chips">\u{1F0CF} Take Card ${table.pot ? `+${fmt(table.pot)} \u{1FA99}` : ""}</button>
  </div>`;
}

function mySeatHtml(seat) {
  return `<section class="nt-panel nt-seat" aria-label="Your cards and chips">
    <div class="nt-seat-head">
      <span class="nt-seat-name">Your hand</span>
      <span class="nt-score-tag">cards ${fmt(seat.card_score)} − chips = ${fmt(seat.card_score - Number(seat.chips || 0))}</span>
      ${noThanksChipsHtml(seat.chips)}
    </div>
    <div class="nt-cards-row">${noThanksRunsHtml(seat.cards, { size: "hand" })}</div>
  </section>`;
}

function othersHtml(seats, room, game, localSeat, view) {
  const localMark = localSeat ? localSeat.mark : null;
  return seats.filter((seat) => seat.mark !== localMark).map((seat) => {
    const isTurn = view.caughtUp && !view.complete && seat.is_turn;
    return `<section class="nt-panel nt-seat${isTurn ? " nt-turn-seat" : ""}" aria-label="${escapeName(seatName(room, seat.mark))}'s table">
      <div class="nt-seat-head">
        <span class="nt-seat-name">${seatEmoji(room, seat.mark)} ${escapeName(seatName(room, seat.mark))}${view.complete && seat.mark === game.winner ? " \u{1F3C6}" : ""}</span>
        <span class="nt-score-tag">cards ${fmt(seat.card_score)}</span>
        ${noThanksChipsHtml(seat.chips)}
      </div>
      <div class="nt-cards-row">${noThanksRunsHtml(seat.cards, { size: "mini" })}</div>
    </section>`;
  }).join("");
}

// Table layout per MojoSOGO's global table style (2026-07-04): player name
// left-justified, a single-emoji status column right beside it, stat columns
// centered, and no row numbering.
function resultsHtml(game, room) {
  const rows = (Array.isArray(game.results) ? game.results : []).map((row) => `
    <tr class="${row.mark === game.winner ? "nt-winner-row" : ""}">
      <td class="nt-name">${seatEmoji(room, row.mark)} ${escapeName(seatName(room, row.mark))}</td>
      <td class="nt-status">${row.mark === game.winner ? "\u{1F3C6}" : ""}</td>
      <td class="nt-num">${fmt(row.card_score)}</td>
      <td class="nt-num">−${fmt(row.chips)}</td>
      <td class="nt-num nt-total">${fmt(row.total)}</td>
    </tr>`).join("");
  return `<section class="nt-panel" aria-label="Final scores">
    <table class="nt-results-table">
      <thead><tr><th class="nt-name">Player</th><th class="nt-status"></th><th>Cards</th><th>\u{1FA99}</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

// ---------- wiring ----------

function wireNoThanks(host, ctx, myTurn) {
  if (!myTurn) return;
  const note = host.querySelector("[data-nt-note]");
  const send = async (action) => {
    const error = await ctx.makeMove(action);
    if (error && note) {
      note.textContent = error;
      note.hidden = false;
      note.classList.add("nt-error");
    }
  };
  host.querySelectorAll("[data-nt]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      send({ type: button.getAttribute("data-nt") });
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
