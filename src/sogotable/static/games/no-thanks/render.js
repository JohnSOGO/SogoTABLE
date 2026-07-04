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
import { noThanksCardHtml, noThanksRunsHtml, noThanksChipsHtml, groupNoThanksRuns } from "./cards.js";
import { NT_CSS } from "./styles.js";

const BOT_STEP_MS = 1100;
const TAKE_ANIM_MS = 2000; // a take animates for 2s before anyone (AI or player) visibly acts again
let stylesInjected = false;
// Event replay cursor: how far into game.events the display has advanced.
let pace = { key: "", shown: 0, timer: null };
// Tip-strip pagination: the strip is a FIXED one-liner (wrapping would grow
// it and jump the controls below). Text that doesn't fit splits into pages;
// tapping the strip advances. Keyed by the full text so a new tip resets.
let tipPages = { text: "", page: 0, pages: [] };
// The take being animated: the card flies from the table to the taker's
// panel; `flown` guards the overlay against re-paints mid-flight.
let takeAnim = { key: "", moveCount: 0, until: 0, flown: false };
// The table card last painted — a changed value replays the deal-in flip.
let lastCardShown = null;
// Chip counts last painted (pot + own stack), keyed by room+epoch: a value
// that GREW since the last paint flashes green. Repaints at the same value
// stay quiet, so the flash fires once per gain, including per replay step.
let lastChips = { key: "", pot: -1, mine: -1 };

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
      blurb: "One card is up at a time — pay a chip to dodge it or take it with the pot. Needs 3+ players; invite players or bots to fill the table, then start.",
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
  if (pace.key !== paceKey) {
    pace = { key: paceKey, shown: target, timer: null };
    takeAnim = { key: paceKey, moveCount: target, until: 0, flown: false }; // a fresh join never animates history
  }
  if (pace.shown < target) {
    const next = events.find((event) => Number(event.move_count) > pace.shown);
    pace.shown = next ? Number(next.move_count) : target;
  }
  if (pace.shown > target) pace.shown = target;
  const caughtUp = pace.shown >= target;
  const visible = events.filter((event) => Number(event.move_count) <= pace.shown);
  const lastVisible = visible[visible.length - 1] || null;
  const rerender = () => {
    if (host.isConnected && host.querySelector(".no-thanks-root")) renderNoThanksPlay(host, ctx);
  };
  // ---- take animation: a NEWLY shown take holds the display for 2s while
  // the card flies to the taker; the next event (or interactivity) waits. ----
  const now = Date.now();
  if (lastVisible && lastVisible.type === "take" && Number(lastVisible.move_count) > takeAnim.moveCount) {
    takeAnim = { key: paceKey, moveCount: Number(lastVisible.move_count), until: now + TAKE_ANIM_MS, flown: false };
  }
  const animatingTake = Boolean(lastVisible && lastVisible.type === "take" &&
    takeAnim.moveCount === Number(lastVisible.move_count) && now < takeAnim.until);
  if (animatingTake) {
    pace.timer = setTimeout(rerender, takeAnim.until - now);
  } else if (!caughtUp) {
    pace.timer = setTimeout(rerender, BOT_STEP_MS);
  }
  // Mid-replay the table redraws the shown event's moment (each event carries
  // card + pot); during a take animation the NEXT deck card flips up in the
  // spot while the taken card (a clone) flies away — no ghosted duplicate;
  // caught up, the live state.
  const table = animatingTake
    ? { card: lastVisible.next_card ?? null, pot: 0 }
    : (caughtUp || !lastVisible
      ? { card: game.current_card, pot: Number(game.pot || 0) }
      : tableAtEvent(lastVisible));
  const showResults = caughtUp && complete && !animatingTake;
  const myTurn = caughtUp && !animatingTake && !movePending && Boolean(localSeat && localSeat.is_turn) && !complete;
  // ---- replay-true seat panels: the snapshot carries END-state hands, so
  // rewind them to the shown moment — cards from not-yet-shown takes are
  // absent, chips not yet paid/collected are restored, and the card being
  // ANIMATED holds an invisible slot (its landing pad) until the flight ends.
  const ghostMark = animatingTake ? lastVisible.mark : null;
  const ghostCard = animatingTake ? lastVisible.card : null;
  const stateShown = animatingTake ? Number(lastVisible.move_count) - 1 : pace.shown;
  const futureCards = {}; // mark -> Set of cards not taken yet at the shown moment
  const chipRewind = {}; // mark -> delta restoring chips to the shown moment
  events.forEach((event) => {
    const mc = Number(event.move_count);
    if (event.type === "take" && mc > pace.shown) (futureCards[event.mark] = futureCards[event.mark] || new Set()).add(event.card);
    if (mc > stateShown) {
      if (event.type === "pass") chipRewind[event.mark] = (chipRewind[event.mark] || 0) + 1;
      if (event.type === "take") chipRewind[event.mark] = (chipRewind[event.mark] || 0) - Number(event.chips_gained || 0);
    }
  });
  // Sum of run heads — the same public math the server's card_score uses,
  // duplicated for DISPLAY only (mid-replay hands have no server score).
  const displayScore = (cards) => groupNoThanksRuns(cards).reduce((sum, run) => sum + run[0], 0);
  const displaySeats = seats.map((seat) => {
    const hide = futureCards[seat.mark];
    const ghost = seat.mark === ghostMark ? ghostCard : null;
    const chipDelta = chipRewind[seat.mark] || 0;
    if (!hide && ghost === null && !chipDelta) return seat;
    const cards = hide ? seat.cards.filter((card) => !hide.has(card)) : seat.cards;
    return {
      ...seat,
      cards,
      chips: Number.isInteger(seat.chips) ? seat.chips + chipDelta : seat.chips,
      card_score: hide || ghost !== null ? displayScore(cards.filter((card) => card !== ghost)) : seat.card_score,
    };
  });
  const displayLocal = displaySeats.find((seat) => seat.mark === localMark) || null;
  // Watchdog: if actions are suppressed only by the pending latch, re-render
  // shortly — this board must never wedge on a player's turn.
  if (caughtUp && movePending && !complete) {
    pace.timer = setTimeout(() => {
      if (host.isConnected && host.querySelector(".no-thanks-root")) renderNoThanksPlay(host, ctx);
    }, 900);
  }

  // The table card only ever changes on a take, and the take's own glide-down
  // is the animation — a flip UNDER the flying card is noise (MojoSOGO
  // 2026-07-04). The flip-in stays for the opening deal only.
  const flip = table.card !== null && lastCardShown === null;
  lastCardShown = table.card;
  const myChips = displayLocal ? Number(displayLocal.chips || 0) : -1;
  if (lastChips.key !== paceKey) lastChips = { key: paceKey, pot: table.pot, mine: myChips }; // fresh table: no flash
  const potFlash = table.pot > lastChips.pot;
  const chipsFlash = localSeat !== null && myChips > lastChips.mine;
  lastChips.pot = table.pot;
  lastChips.mine = myChips;
  // Whose decision the DISPLAY is on: the taker mid-animation, the live turn
  // once caught up, or the `next` mark the shown event named mid-replay.
  const actorMark = animatingTake ? lastVisible.mark
    : caughtUp ? game.current_player : (lastVisible ? lastVisible.next : null);
  // Who has said No Thanks to the card ON the table: every pass event since
  // the last take (a take flips a fresh card, resetting the tally). Derived
  // from the VISIBLE events so the ❌s land one at a time during replay.
  const lastTake = visible.map((event) => event.type).lastIndexOf("take");
  const passedMarks = new Set(visible.slice(lastTake + 1).filter((event) => event.type === "pass").map((event) => event.mark));
  host.innerHTML = `
    <div class="no-thanks-root">
      ${showResults && game.winner ? `<p class="nt-panel nt-banner">\u{1F3C6} ${escapeName(seatName(room, game.winner))} wins No Thanks!</p>` : ""}
      ${tipHtml(game, room, localSeat, { caughtUp, myTurn, complete, lastVisible, animatingTake })}
      ${showResults ? resultsHtml(game, room) : tableHtml(table, game, room, { caughtUp, flip, actorMark, localMark, passedMarks, potFlash })}
      ${displayLocal && !showResults ? actionsHtml(displayLocal, table, myTurn) : ""}
      <p class="nt-msg" data-nt-note hidden></p>
      ${displayLocal ? mySeatHtml(displayLocal, chipsFlash, showResults && displayLocal.mark === game.winner, displayLocal.mark === ghostMark ? ghostCard : null) : ""}
      ${othersHtml(displaySeats, room, game, displayLocal, { caughtUp, complete, ghostMark, ghostCard })}
    </div>`;
  wireNoThanks(host, ctx, myTurn);
  paginateTip(host);
  if (animatingTake && !takeAnim.flown) {
    takeAnim.flown = true;
    flyTakenCard(host, lastVisible.mark, lastVisible.card);
  }
}

// The taken card lifts off the table spot and flies to its RESTING PLACE in
// the taker's panel — the seat panels already paint the post-take hand, so
// the exact destination card exists in the DOM (as the invisible ghost
// slot): glide a fresh clone onto its rect (position AND size), and the
// post-anim repaint swaps them seamlessly. The clone is BUILT from the taken
// value — the spot itself already shows the NEXT deck card, so cloning it
// would fly the wrong card. Live rects keep it correct at any viewport size;
// the panel rect is the fallback if the destination card is ever missing.
function flyTakenCard(host, takerMark, cardValue) {
  const root = host.querySelector(".no-thanks-root");
  const spot = host.querySelector(".nt-spot");
  const panel = host.querySelector(`[data-nt-seat="${takerMark}"]`);
  if (!root || !spot || !panel) return;
  const spotCard = spot.querySelector(".nt-card-big");
  const destCard = panel.querySelector(`.nt-cards-row [data-nt-card="${cardValue}"]`);
  const from = (spotCard || spot).getBoundingClientRect();
  const to = (destCard || panel).getBoundingClientRect();
  const holder = document.createElement("div");
  holder.innerHTML = noThanksCardHtml(cardValue, { size: "big" });
  const clone = holder.firstElementChild;
  clone.classList.add("nt-fly");
  // Positioned ABSOLUTE inside the root (not fixed — a transformed ancestor
  // silently rebases fixed elements and the flight lands nowhere visible),
  // so the scoped card styles dress it and the 2s re-render sweeps it away.
  const rootRect = root.getBoundingClientRect();
  clone.style.cssText += `;position:absolute;left:${from.left - rootRect.left}px;top:${from.top - rootRect.top}px;width:${from.width}px;height:${from.height}px;margin:0;transform-origin:top left;`;
  root.appendChild(clone);
  clone.getBoundingClientRect(); // flush layout so the transition below actually animates
  // The destination is the ghost slot (rendered invisible) — the clone IS
  // the card until the post-anim repaint swaps the real one in.
  clone.style.transform = destCard
    ? `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})`
    : `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${to.top + Math.min(to.height / 2, 44) - (from.top + from.height / 2)}px) scale(.32) rotate(6deg)`;
  if (!destCard) clone.style.opacity = "0.2";
  setTimeout(() => clone.remove(), TAKE_ANIM_MS);
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
  if (view.animatingTake) {
    const event = view.lastVisible;
    tip = `${escapeName(seatName(room, event.mark))} takes the ${event.card}${event.chips_gained ? ` and ${fmt(event.chips_gained)} \u{1FA99}` : ""}!`;
  } else if (view.complete && view.caughtUp && game.winner) {
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
  return `<p class="nt-tip${view.myTurn ? " nt-your-turn" : ""}" data-nt-tip>
    <span class="nt-tip-text">${tip}</span><span class="nt-tip-page" hidden></span>
  </p>`;
}

// Fit the tip to its single line. If it overflows, greedily split the words
// into pages that fit beside the n/m badge, show the current page, and let a
// tap on the strip flip to the next. Pure display — measured on live rects,
// so it adapts to every device width.
function paginateTip(host) {
  const strip = host.querySelector("[data-nt-tip]");
  if (!strip) return;
  const textEl = strip.querySelector(".nt-tip-text");
  const badge = strip.querySelector(".nt-tip-page");
  const full = textEl.textContent.replace(/\s+/g, " ").trim();
  if (tipPages.text !== full) tipPages = { text: full, page: 0, pages: [] };
  textEl.textContent = full;
  badge.hidden = true;
  if (textEl.scrollWidth <= textEl.clientWidth + 1) return; // fits — one page, no badge
  badge.hidden = false;
  badge.textContent = "9/9"; // worst-case badge width while measuring
  const fits = (candidate) => {
    textEl.textContent = candidate;
    return textEl.scrollWidth <= textEl.clientWidth + 1;
  };
  const pages = [];
  let current = "";
  for (const word of full.split(" ")) {
    const attempt = current ? `${current} ${word}` : word;
    if (fits(attempt)) current = attempt;
    else { if (current) pages.push(current); current = word; }
  }
  if (current) pages.push(current);
  tipPages.pages = pages.length ? pages : [full];
  const show = () => {
    const total = tipPages.pages.length;
    tipPages.page %= total;
    textEl.textContent = tipPages.pages[tipPages.page];
    badge.textContent = `${tipPages.page + 1}/${total}`;
  };
  show();
  strip.classList.add("nt-tip-paged");
  strip.addEventListener("click", () => { tipPages.page += 1; show(); });
}

// The table: deck + face-up card on the left, the turn list on the right —
// YOU at the top, then the seats in the order they act after you (the house
// table style: name left, single-emoji status column beside it). The emoji
// tells this card's story: 🤔 = deciding now, ❌ = already said No Thanks to
// the card on the table. Turn-based games always show the seat list + whose
// turn (MojoSOGO 2026-07-04).
function tableHtml(table, game, room, view) {
  const deckCount = view.caughtUp ? Number(game.deck_count || 0) : null;
  let seats = Array.isArray(game.players) ? game.players : [];
  const localIndex = seats.findIndex((seat) => seat.mark === view.localMark);
  if (localIndex > 0) seats = [...seats.slice(localIndex), ...seats.slice(0, localIndex)];
  const flag = (seat) => {
    if (seat.mark === view.actorMark) return "\u{1F914}";
    if (view.passedMarks && view.passedMarks.has(seat.mark)) return "❌";
    return "";
  };
  const rows = seats.map((seat) => `
    <li class="nt-turn-row${seat.mark === view.actorMark ? " nt-turn-now" : ""}${seat.mark === view.localMark ? " nt-turn-you" : ""}">
      <span class="nt-turn-name">${seatEmoji(room, seat.mark)} ${escapeName(seatName(room, seat.mark))}</span>
      <span class="nt-turn-flag">${flag(seat)}</span>
    </li>`).join("");
  return `<section class="nt-panel nt-table" aria-label="The table">
    <div class="nt-table-main">
      <div>
        <div class="nt-deck"><span class="nt-deck-count">${deckCount === null ? "…" : fmt(deckCount)}</span></div>
        <span class="nt-deck-label">deck</span>
      </div>
      <div class="nt-spot">
        ${table.card === null ? `<span class="nt-no-cards">no card</span>` : noThanksCardHtml(table.card, { size: "big", flip: view.flip })}
        <div>
          <span class="nt-pot${table.pot ? "" : " nt-pot-empty"}${view.potFlash ? " nt-flash" : ""}" aria-label="${table.pot} chips on the card">\u{1FA99} ${fmt(table.pot)}</span>
        </div>
      </div>
    </div>
    <ul class="nt-turn-list" aria-label="Turn order">${rows}</ul>
  </section>`;
}

// Always rendered for a seated player (disabled off-turn and during the take
// animation) — hiding this row would make the controls below it jump, and
// jumping tap targets cause mistaps (docs/adding-a-game.md hard rule,
// MojoSOGO 2026-07-04).
function actionsHtml(localSeat, table, enabled) {
  const canPass = enabled && Number(localSeat.chips) > 0;
  return `<div class="nt-actions">
    <button class="nt-pass" type="button" data-nt="pass" ${canPass ? "" : "disabled"}
      aria-label="Pay one chip to pass">\u{1F645} No Thanks! −1 \u{1FA99}</button>
    <button class="nt-take" type="button" data-nt="take" ${enabled ? "" : "disabled"}
      aria-label="Take the card and ${table.pot} chips">\u{1F0CF} Take Card ${table.pot ? `+${fmt(table.pot)} \u{1FA99}` : ""}</button>
  </div>`;
}

// Shown during play AND at game over — the final screen lists every seat's
// card+chip summary, the local player's included (MojoSOGO 2026-07-04).
function mySeatHtml(seat, chipsFlash, isWinner, ghostCard) {
  return `<section class="nt-panel nt-seat" data-nt-seat="${seat.mark}" aria-label="Your cards and chips">
    <div class="nt-seat-head">
      <span class="nt-seat-name">Your hand${isWinner ? " \u{1F3C6}" : ""}</span>
      <span class="nt-score-tag">cards ${fmt(seat.card_score)} − chips = ${fmt(seat.card_score - Number(seat.chips || 0))}</span>
      ${noThanksChipsHtml(seat.chips, chipsFlash ? { extraClass: "nt-flash" } : {})}
    </div>
    <div class="nt-cards-row">${noThanksRunsHtml(seat.cards, { size: "hand", ghost: ghostCard })}</div>
  </section>`;
}

function othersHtml(seats, room, game, localSeat, view) {
  const localMark = localSeat ? localSeat.mark : null;
  return seats.filter((seat) => seat.mark !== localMark).map((seat) => {
    const isTurn = view.caughtUp && !view.complete && seat.is_turn;
    return `<section class="nt-panel nt-seat${isTurn ? " nt-turn-seat" : ""}" data-nt-seat="${seat.mark}" aria-label="${escapeName(seatName(room, seat.mark))}'s table">
      <div class="nt-seat-head">
        <span class="nt-seat-name">${seatEmoji(room, seat.mark)} ${escapeName(seatName(room, seat.mark))}${view.complete && seat.mark === game.winner ? " \u{1F3C6}" : ""}</span>
        <span class="nt-score-tag">cards ${fmt(seat.card_score)}</span>
        ${noThanksChipsHtml(seat.chips)}
      </div>
      <div class="nt-cards-row">${noThanksRunsHtml(seat.cards, { size: "mini", ghost: seat.mark === view.ghostMark ? view.ghostCard : null })}</div>
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
