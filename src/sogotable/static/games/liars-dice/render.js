// Liar's Dice — in-game UI adapter. Renders the prepared server projection and
// captures intent; it computes NO rule outcomes (raise legality, challenge
// math, die loss, and elimination all arrive decided from the worker rules
// module — the bid picker is bounded by the server's raise_options list, and
// other players' dice arrive already masked to null by the worker's viewer
// sanitizer). The shell hands a ctx bag (host, game, room, started, isHost,
// localPlayerId, pendingMove, makeMove, startGame, addBot, invitePlayer,
// escapeHtml) exactly like the other host-start games; the pre-game screen is
// the shared renderHostStartLobby template. All wiring is addEventListener —
// no inline onclick, and no imports from app.js.
//
// Hidden info note: this renderer never receives another player's live dice
// (multi-phone only — hot-seat is a documented v1 exclusion). If a value ever
// showed up here, the bug would be in the worker sanitizer, not something to
// paper over client-side.
import { renderHostStartLobby } from "../lobby.js";
import { LD_CSS } from "./styles.js";

const DIE_GLYPHS = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
let stylesInjected = false;
// Bid-picker scratch: the quantity/face the local player is composing. Keyed
// by room + move_count so every table change resets it to the smallest raise.
let picker = { key: "", quantity: 0, face: 0 };

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
  const { room, game, pendingMove } = ctx;
  const seats = Array.isArray(game.players) ? game.players : [];
  const localMark = markForPlayer(room, ctx.localPlayerId);
  const localSeat = seats.find((seat) => seat.mark === localMark) || null;
  const complete = game.status === "complete";
  const myTurn = Boolean(localSeat && localSeat.is_turn && !pendingMove);
  syncPicker(room, game, myTurn);
  host.innerHTML = `
    <div class="liars-dice-root">
      ${bannerHtml(game, room)}
      ${game.phase === "reveal" ? revealHtml(game, room, localSeat, complete, pendingMove) : bidSpotlightHtml(game, room, localSeat)}
      ${!complete && localSeat && !localSeat.eliminated && game.phase === "bidding" ? cupHtml(localSeat) : ""}
      ${myTurn && game.phase === "bidding" && !complete ? pickerHtml(game) : ""}
      ${seatsHtml(seats, room, game)}
      <p class="ld-msg" data-ld-note hidden></p>
    </div>`;
  wireLiarsDice(host, ctx, myTurn);
}

function bannerHtml(game, room) {
  if (game.status === "complete" && game.winner) {
    return `<p class="ld-panel ld-banner ld-win">\u{1F3C6} ${escapeName(seatName(room, game.winner))} wins Liar's Dice!</p>`;
  }
  return `<p class="ld-panel ld-banner">Round ${Number(game.round || 1)} • ${fmt(game.total_dice)} dice on the table</p>`;
}

// What is currently claimed: "4 × ⚄" plus whose turn it is to beat it.
function bidSpotlightHtml(game, room, localSeat) {
  const bid = game.current_bid;
  const turnName = game.current_player ? escapeName(seatName(room, game.current_player)) : "";
  const isMe = localSeat && game.current_player === localSeat.mark;
  const turnNote = game.status === "playing"
    ? `<p class="ld-turn-note">${isMe ? "<b>Your turn</b> — raise the bid or call LIAR." : `Waiting for ${turnName}…`}</p>`
    : "";
  if (!bid) {
    return `<section class="ld-panel">
      <div class="ld-bid"><span class="ld-bid-label">No bid yet</span></div>
      ${game.status === "playing" ? `<p class="ld-turn-note">${isMe ? "<b>Your turn</b> — open the bidding." : `${turnName} opens the bidding…`}</p>` : ""}
    </section>`;
  }
  return `<section class="ld-panel" aria-label="Current bid">
    <div class="ld-bid">
      <span class="ld-bid-label">${escapeName(seatName(room, bid.mark))} bids</span>
      <strong>${fmt(bid.quantity)} ×</strong>
      <span class="ld-die" role="img" aria-label="face ${bid.face}">${DIE_GLYPHS[bid.face] || "?"}</span>
    </div>
    ${turnNote}
  </section>`;
}

// The local player's hidden cup. Ones glow — they are wild.
function cupHtml(seat) {
  const dice = Array.isArray(seat.dice) ? seat.dice : [];
  const diceHtml = dice.map((die) => die
    ? `<span class="ld-die${die === 1 ? " ld-wild" : ""}" role="img" aria-label="your die: ${die}">${DIE_GLYPHS[die]}</span>`
    : `<span class="ld-die ld-hidden" aria-label="hidden die">?</span>`).join("");
  return `<section class="ld-panel" aria-label="Your dice">
    <span class="ld-cup-label">Your cup • only you can see these${dice.includes(1) ? " • ⚀ is wild" : ""}</span>
    <div class="ld-dice-row">${diceHtml}</div>
  </section>`;
}

// Quantity stepper + face row, bounded by the server's raise_options.
function pickerHtml(game) {
  const options = Array.isArray(game.raise_options) ? game.raise_options : [];
  if (!options.length) {
    // Nothing left to raise (the bid is already every die on max face):
    // challenging is the only move.
    return `<section class="ld-panel ld-picker" data-ld-picker>
      <p class="ld-msg">No raise is possible — it's LIAR time.</p>
      <div class="ld-actions">
        <button class="ld-liar" type="button" data-ld="challenge" aria-label="Call liar">\u{1F921} LIAR! \u{1F921}</button>
      </div>
    </section>`;
  }
  const quantities = options.map((option) => option.quantity);
  const option = options.find((item) => item.quantity === picker.quantity) || options[0];
  const atMin = picker.quantity <= quantities[0];
  const atMax = picker.quantity >= quantities[quantities.length - 1];
  const faces = [1, 2, 3, 4, 5, 6].map((face) => `
    <button type="button" data-ld-face="${face}" aria-pressed="${face === picker.face}"
      aria-label="bid face ${face}" ${face < option.min_face ? "disabled" : ""}>${DIE_GLYPHS[face]}</button>`).join("");
  return `<section class="ld-panel ld-picker" data-ld-picker aria-label="Compose your bid">
    <div class="ld-stepper">
      <button class="secondary" type="button" data-ld="qty-down" aria-label="fewer dice" ${atMin ? "disabled" : ""}>−</button>
      <span class="ld-qty" aria-label="bid quantity">${fmt(picker.quantity)} ×</span>
      <button class="secondary" type="button" data-ld="qty-up" aria-label="more dice" ${atMax ? "disabled" : ""}>+</button>
    </div>
    <div class="ld-faces" aria-label="bid face">${faces}</div>
    <div class="ld-actions">
      <button class="primary" type="button" data-ld="bid" aria-label="place this bid">\u{1F3B2} Bid ${fmt(picker.quantity)} × ${DIE_GLYPHS[picker.face]}</button>
      ${game.current_bid ? `<button class="ld-liar" type="button" data-ld="challenge" aria-label="Call liar">\u{1F921} LIAR!</button>` : ""}
    </div>
  </section>`;
}

// Everyone's seat: name, face-down dice, whose turn, who is out.
function seatsHtml(seats, room, game) {
  const rows = seats.map((seat) => {
    const isTurn = Boolean(seat.is_turn) && game.status === "playing";
    const out = Boolean(seat.eliminated);
    const isWinner = game.status === "complete" && seat.mark === game.winner;
    const backs = Array.from({ length: Number(seat.dice_count) || 0 },
      () => `<span class="ld-die ld-small ld-hidden" aria-label="hidden die">?</span>`).join("");
    return `<div class="ld-seat${isTurn ? " ld-turn" : ""}${out ? " ld-out" : ""}">
      <span class="ld-seat-name">${seatEmoji(room, seat.mark)} <span>${escapeName(seatName(room, seat.mark))}</span></span>
      ${isWinner ? `<span class="ld-turn-tag">\u{1F3C6} winner</span>` : ""}
      ${isTurn ? `<span class="ld-turn-tag">turn</span>` : ""}
      ${out ? `<span class="ld-turn-tag" style="color:inherit">out</span>` : `<span class="ld-seat-dice">${backs}</span>`}
    </div>`;
  }).join("");
  return `<section class="ld-panel" aria-label="Players"><div class="ld-seats">${rows}</div></section>`;
}

// The challenge reveal: every cup face-up, bid matches ringed, loser named.
function revealHtml(game, room, localSeat, complete, pendingMove) {
  const reveal = game.last_reveal;
  if (!reveal) return "";
  const bid = reveal.bid || {};
  const rows = Object.entries(reveal.dice || {}).map(([mark, dice]) => {
    const diceHtml = (Array.isArray(dice) ? dice : []).map((die) => {
      const matches = die === bid.face || (die === 1 && bid.face !== 1);
      return `<span class="ld-die ld-small${matches ? " ld-hit" : ""}${die === 1 ? " ld-wild" : ""}"
        role="img" aria-label="${escapeName(seatName(room, mark))}'s die: ${die}">${DIE_GLYPHS[die] || ""}</span>`;
    }).join("");
    return `<div class="ld-reveal-row">
      <span class="ld-reveal-name">${seatEmoji(room, mark)} <span>${escapeName(seatName(room, mark))}</span></span>
      <div class="ld-dice-row">${diceHtml}</div>
    </div>`;
  }).join("");
  const held = reveal.outcome === "bid_holds";
  const loserName = escapeName(seatName(room, reveal.loser));
  const verdict = held
    ? `The bid held — ${fmt(reveal.actual)} × ${DIE_GLYPHS[bid.face]} on the table. ${loserName} called LIAR wrongly and loses a die!`
    : `LIAR confirmed — only ${fmt(reveal.actual)} × ${DIE_GLYPHS[bid.face]}, not ${fmt(bid.quantity)}. ${loserName} loses a die!`;
  const canContinue = !complete && localSeat && !localSeat.eliminated && !pendingMove;
  return `<section class="ld-panel ld-reveal" aria-label="The reveal">
    <p class="ld-reveal-outcome${localSeat && reveal.loser === localSeat.mark ? " ld-lost" : ""}">
      ${escapeName(seatName(room, reveal.challenger))} called LIAR on ${fmt(bid.quantity)} × ${DIE_GLYPHS[bid.face]}</p>
    ${rows}
    <p class="ld-msg">${verdict}${reveal.loser_eliminated ? ` ${loserName} is out of the game.` : ""}</p>
    ${canContinue ? `<div class="ld-actions">
      <button class="primary" type="button" data-ld="next-round" aria-label="Start the next round">\u{1F3B2} Roll the next round</button>
    </div>` : ""}
    ${!complete && localSeat && localSeat.eliminated ? `<p class="ld-msg">You're out of dice — watch the bluffing play out.</p>` : ""}
  </section>`;
}

// Reset the picker to the smallest legal raise whenever the table changes.
function syncPicker(room, game, myTurn) {
  if (!myTurn) return;
  const options = Array.isArray(game.raise_options) ? game.raise_options : [];
  if (!options.length) return;
  const key = `${room.code}:${room.game_epoch}:${game.move_count}`;
  if (picker.key !== key) picker = { key, quantity: options[0].quantity, face: options[0].min_face };
}

function wireLiarsDice(host, ctx, myTurn) {
  const note = host.querySelector("[data-ld-note]");
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
  if (!myTurn) return;
  // Stepper and face taps only reshape the local scratch bid: update state and
  // repaint the picker panel in place (no server round-trip until Bid).
  const game = ctx.game;
  const options = Array.isArray(game.raise_options) ? game.raise_options : [];
  const quantities = options.map((option) => option.quantity);
  const repaint = () => {
    const panel = host.querySelector("[data-ld-picker]");
    if (!panel) return;
    panel.outerHTML = pickerHtml(game);
    wireLiarsDice(host, ctx, myTurn);
  };
  const setQuantity = (quantity) => {
    const option = options.find((item) => item.quantity === quantity);
    if (!option) return;
    picker.quantity = quantity;
    picker.face = Math.max(picker.face, option.min_face);
    repaint();
  };
  wire("qty-down", () => setQuantity(quantities[quantities.indexOf(picker.quantity) - 1]));
  wire("qty-up", () => setQuantity(quantities[quantities.indexOf(picker.quantity) + 1]));
  host.querySelectorAll("[data-ld-face]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      picker.face = Number(button.getAttribute("data-ld-face"));
      repaint();
    });
  });
}

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
