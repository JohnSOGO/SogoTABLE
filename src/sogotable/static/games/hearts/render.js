// Hearts — in-game UI adapter. Renders the prepared server projection and
// captures intent; it computes NO rule outcomes (legality arrives as
// game.legal_plays for the current player only, other hands arrive masked to
// null by the worker's viewer sanitizer, and every score is server-decided).
// The shell hands the same ctx bag as the other host-start games; the
// pre-game screen is the shared renderHostStartLobby template, carrying the
// host's optional-rules picker (Jack of Diamonds, first-trick blood, moon
// style, target score) into ctx.startGame(options). Card faces come from the
// shared games/playing-cards.js; all wiring is addEventListener — no inline
// onclick, no imports from app.js.
//
// Pacing: the server resolves a whole bot chain inside one snapshot, so this
// renderer replays the new events one at a time — plays slide in from their
// seat's direction (~1.5s of room for a lone play, faster when consecutive
// plays chain), a finished trick dwells, then glides to its winner. Nothing
// interactive unlocks until the replay catches up.
import { renderHostStartLobby } from "../lobby.js";
import { playingCardHtml, sortPlayingCards, cardRankLabel, CARD_SUIT_GLYPHS, cardSuit, PLAYING_CARD_CSS } from "../playing-cards.js";
import { HEARTS_CSS } from "./styles.js";
import {
  playClick, playWin, playLose, playBank, playCardDeal, playCardPlay,
  playTrickTake, playHeartsBroken, playQueenSpades, playMoonShot,
} from "../../sound.js";

const PLAY_STEP_MS = 700;        // consecutive plays inside a bot chain
const PLAY_SOLO_MS = 1200;       // a play with the table's attention on it
const TRICK_DWELL_MS = 2150;     // read the full trick, then the collect glide
const COLLECT_MS = 1150;         // the glide itself (matches styles.js transition)
const FAST_PLAY_MS = 250;        // once every point is off the hands: keep it moving
const FAST_TRICK_MS = 650;
const FAST_COLLECT_MS = 300;     // matches the .hx-fast transition in styles.js
const DEAL_DWELL_MS = 2200;
const PASS_DWELL_MS = 1500;
const POSITIONS = ["b", "l", "t", "r"]; // you, left, across, right
const DIRECTION_ARROWS = { left: "⬅️", right: "➡️", across: "⬆️", hold: "✋" };

let stylesInjected = false;
// Event replay cursor: how far into game.events the display has advanced.
let pace = { key: "", shown: 0, nextAt: 0, timer: null };
let sounded = 0;        // move_count of the last event given its sound
let dealAnimRound = 0;  // the round whose deal-in the hand has already fanned
let raised = { key: "", cards: new Set(), preset: false }; // tap-to-raise state; preset = picked off-turn (a queued commit)
let autoCommitted = ""; // paceKey:move_count the premove already fired for
let receivedSeed = "";  // round whose received trio has been auto-raised once
// The commit shot clock: an ON-turn selection auto-commits after 1s while the
// Commit button pulses softly — no numeric countdown, too distracting
// (MojoSOGO 2026-07-04). Unselecting or switching cards resets it; a manual
// commit (button/swipe) beats it.
const COMMIT_COUNTDOWN_MS = 1000;
let countdown = { timer: null, card: "" };

function commitButton(host) {
  const button = host.querySelector("[data-hx-action]");
  return button && button.getAttribute("data-hx-action") === "play" ? button : null;
}

function cancelCountdown(host) {
  if (countdown.timer) clearInterval(countdown.timer);
  countdown = { timer: null, card: "" };
  const button = host ? commitButton(host) : null;
  if (button) button.classList.remove("hx-committing");
}

function startCountdown(host, commitPlay, card) {
  cancelCountdown(host);
  const until = Date.now() + COMMIT_COUNTDOWN_MS;
  countdown.card = card;
  countdown.timer = setInterval(() => {
    const stillMine = raised.cards.size === 1 && raised.cards.has(card);
    if (!host.isConnected || !stillMine) { cancelCountdown(host); return; }
    if (until - Date.now() <= 0) {
      cancelCountdown(host);
      commitPlay(card);
      return;
    }
    // Re-applied each tick: a snapshot repaint replaces the button node.
    const button = commitButton(host);
    if (button) button.classList.add("hx-committing");
  }, 100);
}
// Tip-strip pagination (the No Thanks pattern): the strip is a FIXED one-liner;
// overflow splits into pages with an n/m badge and a tap flips them.
let tipPages = { text: "", page: 0, pages: [] };

export function renderHeartsGame(ctx) {
  const { host, game } = ctx;
  if (!host || !game) return;
  if (!stylesInjected) {
    const style = document.createElement("style");
    style.textContent = PLAYING_CARD_CSS + HEARTS_CSS;
    document.head.appendChild(style);
    stylesInjected = true;
  }
  host.className = "macro-board hearts-table";
  if (!ctx.started) {
    renderHeartsLobby(host, ctx);
    return;
  }
  renderHeartsPlay(host, ctx);
}

// ---------- pre-game lobby: the optional rules live here ----------

function renderHeartsLobby(host, ctx) {
  const seatCount = Array.isArray(ctx.room && ctx.room.players) ? ctx.room.players.length : 0;
  renderHostStartLobby(host, ctx, {
    wrap: "hearts-root",
    heading: "Players",
    blurb: seatCount === 4
      ? "Four seats filled — deal them in."
      : `Hearts seats exactly four (${seatCount}/4) — invite players or bots to fill the table.`,
    extraHtml: `
      <div class="hx-options">
        <div class="hx-opt"><div class="hx-opt-label"><b>Jack of Diamonds</b><span>taking the J♦ scores −10</span></div>
          <div class="hx-seg" data-hx-opt="jack_of_diamonds"><button type="button" data-v="false" class="hx-on">Off</button><button type="button" data-v="true">On</button></div></div>
        <div class="hx-opt"><div class="hx-opt-label"><b>No blood on trick one</b><span>no hearts or Q♠ on the first trick</span></div>
          <div class="hx-seg" data-hx-opt="no_blood_first_trick"><button type="button" data-v="true" class="hx-on">On</button><button type="button" data-v="false">Off</button></div></div>
        <div class="hx-opt"><div class="hx-opt-label"><b>Shooting the moon</b><span>old: others +26 · new: shooter −26</span></div>
          <div class="hx-seg" data-hx-opt="moon_style"><button type="button" data-v="old" class="hx-on">Old</button><button type="button" data-v="new">New</button></div></div>
        <div class="hx-opt"><div class="hx-opt-label"><b>Play to</b><span>lowest score wins at the line</span></div>
          <div class="hx-seg" data-hx-opt="target_score"><button type="button" data-v="50">50</button><button type="button" data-v="75">75</button><button type="button" data-v="100" class="hx-on">100</button></div></div>
      </div>`,
    getStartArg: (lobbyHost) => {
      const options = {};
      lobbyHost.querySelectorAll("[data-hx-opt]").forEach((seg) => {
        const on = seg.querySelector(".hx-on");
        const value = on ? on.getAttribute("data-v") : null;
        if (value === null) return;
        options[seg.getAttribute("data-hx-opt")] = value === "true" ? true : value === "false" ? false : (/^\d+$/.test(value) ? Number(value) : value);
      });
      return options;
    },
    onMount: (lobbyHost) => {
      lobbyHost.querySelectorAll("[data-hx-opt] button").forEach((button) => {
        button.addEventListener("click", () => {
          button.parentElement.querySelectorAll("button").forEach((other) => other.classList.remove("hx-on"));
          button.classList.add("hx-on");
          playClick();
        });
      });
    },
  });
}

// ---------- in-game ----------

function renderHeartsPlay(host, ctx) {
  const { room, game } = ctx;
  const movePending = typeof ctx.isMovePending === "function" ? ctx.isMovePending() : Boolean(ctx.pendingMove);
  const seats = Array.isArray(game.players) ? game.players : [];
  const localMark = markForPlayer(room, ctx.localPlayerId);
  const localSeat = seats.find((seat) => seat.mark === localMark) || null;
  const complete = game.status === "complete";

  // ---- replay cursor (time-gated; see no-thanks/render.js for the why) ----
  clearTimeout(pace.timer);
  const paceKey = `${room.code}:${room.game_epoch}`;
  const target = Number(game.move_count || 0);
  const events = Array.isArray(game.events) ? game.events : [];
  const now = Date.now();
  if (pace.key !== paceKey) {
    pace = { key: paceKey, shown: target, nextAt: 0, timer: null }; // a fresh join never replays history
    sounded = target;
    dealAnimRound = 0;
  }
  if (raised.key !== paceKey) raised = { key: paceKey, cards: new Set(), preset: false };
  // The dead tail: once EVERY point card is off the hands (live state), the
  // round is decided — events after the last point-bearing one replay at
  // quarter speed and the human's own cards auto-play (MojoSOGO 2026-07-04).
  const exhausted = heartsPointsExhausted(game);
  const fastFrom = exhausted ? lastPointEventCount(events, game.options) : Infinity;
  if (pace.shown < target && now >= (pace.nextAt || 0)) {
    const next = events.find((event) => Number(event.move_count) > pace.shown);
    pace.shown = next ? Number(next.move_count) : target;
    pace.nextAt = now + (next ? dwellFor(next, events, Number(next.move_count) > fastFrom) : 0);
  }
  if (pace.shown > target) pace.shown = target;
  const caughtUp = pace.shown >= target;
  const inDwell = now < (pace.nextAt || 0); // the just-shown event's animation is still playing
  const settled = caughtUp && !inDwell;     // nothing interactive unlocks before this
  const visible = events.filter((event) => Number(event.move_count) <= pace.shown);
  const lastVisible = visible[visible.length - 1] || null;
  const rerender = () => {
    if (host.isConnected && host.querySelector(".hearts-root")) renderHeartsPlay(host, ctx);
  };
  if (!caughtUp || inDwell) pace.timer = setTimeout(rerender, Math.max(60, (pace.nextAt || 0) - now));
  else if (movePending && !complete) pace.timer = setTimeout(rerender, 900); // never wedge on the latch

  // ---- one sound per newly shown event ----
  if (lastVisible && Number(lastVisible.move_count) > sounded) {
    sounded = Number(lastVisible.move_count);
    soundFor(lastVisible, visible, game, localMark);
  }

  // ---- rewind the end-state snapshot to the shown moment ----
  const futurePlays = events.filter((event) => event.type === "play" && Number(event.move_count) > pace.shown);
  const futureTricks = events.filter((event) => event.type === "trick" && Number(event.move_count) > pace.shown);
  const myFuture = futurePlays.filter((event) => event.mark === localMark).map((event) => event.card);
  const displaySeats = seats.map((seat) => {
    const tricksBack = futureTricks.filter((event) => event.winner === seat.mark);
    // Point cards from not-yet-shown tricks don't badge the seat box early.
    const futureCards = new Set(tricksBack.flatMap((event) => (event.plays || []).map((play) => play.card)));
    const takenShown = (Array.isArray(seat.points_taken) ? seat.points_taken : []).filter((card) => !futureCards.has(card));
    return {
      ...seat,
      tricks: Number(seat.tricks || 0) - tricksBack.length,
      round_points: Number(seat.round_points || 0) - tricksBack.reduce((sum, event) => sum + Number(event.points || 0), 0),
      hand_count: (Array.isArray(seat.hand) ? seat.hand.length : 0) + futurePlays.filter((event) => event.mark === seat.mark).length,
      took_hearts: takenShown.some((card) => cardSuit(card) === "H"),
      took_queen: takenShown.includes("QS"),
    };
  });
  const myHand = localSeat
    ? sortPlayingCards((localSeat.hand || []).filter((card) => typeof card === "string").concat(myFuture))
    : [];
  // A committed card stays raised until it actually leaves the hand — clearing
  // it early made an auto-play look like unselect → reselect → play
  // (MojoSOGO 2026-07-04). The raise set simply never outlives the hand.
  if (raised.cards.size) raised.cards = new Set([...raised.cards].filter((card) => myHand.includes(card)));

  // The trick on the felt at the shown moment. Mid-replay (and during the
  // final event's dwell) it derives from the visible events so each play
  // carries its move_count for the slide-in; settled, the live state rules.
  const lastBoundary = [...visible].reverse().find((event) => ["trick", "deal", "pass_complete"].includes(event.type));
  const boundaryCount = lastBoundary ? Number(lastBoundary.move_count) : 0;
  const collecting = Boolean(lastVisible && lastVisible.type === "trick" && inDwell);
  const trickShown = collecting
    ? lastVisible.plays
    : settled
      ? (Array.isArray(game.trick) ? game.trick : [])
      : visible.filter((event) => event.type === "play" && Number(event.move_count) > boundaryCount)
        .map((event) => ({ mark: event.mark, card: event.card, move_count: Number(event.move_count) }));

  // Seat -> table position, rotated so the local player sits at the bottom.
  const order = Array.isArray(game.seat_order) ? game.seat_order : seats.map((seat) => seat.mark);
  const anchor = localMark && order.includes(localMark) ? order.indexOf(localMark) : 0;
  const positionOf = {};
  order.forEach((mark, index) => { positionOf[mark] = POSITIONS[(index - anchor + 4) % 4]; });

  const heartsBrokenShown = caughtUp ? Boolean(game.hearts_broken)
    : visible.some((event) => event.type === "play" && Number(event.move_count) > dealCountBefore(visible) && cardSuit(event.card) === "H");
  const myTurn = settled && !movePending && !complete && game.phase === "playing"
    && Boolean(localSeat && game.current_player === localMark);
  // Pre-selection: a card may be raised at ANY time you hold cards in the
  // playing phase — even mid-replay, even off-turn — so Commit is one tap
  // away when the turn arrives (MojoSOGO 2026-07-04).
  const preselect = Boolean(localSeat) && !complete && game.phase === "playing";
  // The three received cards arrive already raised (and gold-outlined) once
  // per round; selecting any card for play lowers the others.
  const seedKey = `${paceKey}:r${Number(game.round) || 0}`;
  if (preselect && game.first_trick && localSeat && Array.isArray(localSeat.received) && receivedSeed !== seedKey) {
    receivedSeed = seedKey;
    raised.cards = new Set(localSeat.received.filter((card) => (localSeat.hand || []).includes(card)));
    raised.preset = false; // the auto-raised trio is a highlight, not a queued play
  }
  const passing = settled && !complete && game.phase === "passing";
  const myPassPending = passing && Boolean(localSeat) && !seatByMark(seats, localMark).has_passed;
  const legal = myTurn && Array.isArray(game.legal_plays) ? game.legal_plays : null;
  // A pre-selection IS a commit (MojoSOGO 2026-07-04): a card picked off-turn
  // plays itself the moment the turn arrives — if it's legal. An illegal
  // premove stays raised (dimmed) for a fresh pick and never auto-fires.
  if (myTurn && raised.preset && raised.cards.size === 1) {
    const queued = [...raised.cards][0];
    raised.preset = false;
    const commitKey = `${paceKey}:${target}`;
    if (Array.isArray(legal) && legal.includes(queued) && autoCommitted !== commitKey) {
      autoCommitted = commitKey;
      // The card stays raised while the play is in flight — the reply snapshot
      // removes it from the hand and the raise set follows.
      ctx.makeMove({ type: "play", card: queued });
    }
  }
  // Dead-tail auto-play: no points remain, so the human's cards go by
  // themselves too (any legal card — nothing can change the score).
  const autoPlaying = exhausted && !complete && game.phase === "playing";
  if (myTurn && autoPlaying && Array.isArray(legal) && legal.length) {
    const commitKey = `${paceKey}:${target}`;
    if (autoCommitted !== commitKey) {
      autoCommitted = commitKey;
      ctx.makeMove({ type: "play", card: raised.cards.size === 1 && legal.includes([...raised.cards][0]) ? [...raised.cards][0] : legal[0] });
    }
  }
  const playReady = myTurn && raised.cards.size === 1 && Array.isArray(legal) && legal.includes([...raised.cards][0]);
  const queuedCard = !myTurn && preselect && raised.preset && raised.cards.size === 1 ? [...raised.cards][0] : null;
  const showResults = settled && (complete || game.phase === "round_end");
  // The 👉 stays on the player whose action is being ANIMATED — not the next
  // actor — and hides once a finished trick takes over (MojoSOGO 2026-07-04).
  const actorMark = settled ? game.current_player
    : (lastVisible && lastVisible.type === "play" ? lastVisible.mark : null);

  // ---- html ----
  const dealing = Boolean(lastVisible && lastVisible.type === "deal") && Number(game.round) !== dealAnimRound;
  if (dealing) dealAnimRound = Number(game.round);
  // Opponent boxes render in grid order: left, across, right.
  const oppOrder = ["l", "t", "r"].map((pos) => order.find((mark) => positionOf[mark] === pos)).filter(Boolean);
  const meMark = order.find((mark) => positionOf[mark] === "b");
  const fastShown = Boolean(lastVisible && Number(lastVisible.move_count) > fastFrom);
  host.innerHTML = `
    <div class="hearts-root${fastShown ? " hx-fast" : ""}">
      ${showResults && complete && game.winner ? `<p class="hx-banner">🏆 ${escapeName(seatName(room, game.winner))} wins Hearts!</p>` : ""}
      <p class="hx-tip${myTurn || myPassPending ? " hx-your-turn" : ""}" data-hx-tip>
        <span class="hx-tip-text">${tipHtml(game, room, { caughtUp, lastVisible, myTurn, myPassPending, passing, complete, localSeat, seats, movePending, queuedCard, autoPlaying })}</span><span class="hx-tip-page" hidden></span>
      </p>
      <div class="hx-opps">${oppOrder.map((mark) => seatBoxHtml(displaySeats, room, game, mark, actorMark, passing, caughtUp)).join("")}</div>
      <div class="hx-felt">
        ${showResults
          ? resultsHtml(game, room, complete)
          : `${trickShown.map((play) => slotHtml(play, positionOf, collecting, pace.shown)).join("")}
             <div class="hx-felt-status">${feltStatus(game, room, { caughtUp, lastVisible, myTurn, collecting })}</div>`}
        <span class="hx-felt-corner hx-corner-bl">${heartsBrokenShown ? "♥ broken" : ""}</span>
        <span class="hx-felt-corner hx-corner-br">round ${Number(game.round) || 1} · ${DIRECTION_ARROWS[game.pass_direction] || ""} ${game.pass_direction || ""}</span>
      </div>
      <div class="hx-actionrow">
        ${meMark ? seatBoxHtml(displaySeats, room, game, meMark, actorMark, passing, caughtUp) : `<div class="hx-seatbox"><span class="hx-nm">Watching</span></div>`}
        ${actionButtonHtml(game, { caughtUp, complete, myTurn, passing, myPassPending, movePending, localSeat, raisedCount: raised.cards.size, playReady, queuedCard })}
      </div>
      <div class="hx-hand${dealing ? " hx-dealing" : ""}">${handHtml(myHand, localSeat, legal, game, myTurn)}</div>
      ${standingsHtml(displaySeats, room, game, actorMark, complete && caughtUp, localMark)}
      <p class="hx-msg" data-hx-note></p>
    </div>`;
  wireHearts(host, ctx, { myTurn, myPassPending, legal, movePending, preselect, offTurnPlaying: preselect && !myTurn, arrow: DIRECTION_ARROWS[game.pass_direction] || "" });
  paginateTip(host);

  // The trick-collect glide: after the dwell's read time, the four cards get
  // their direction class and slide to the winner.
  if (collecting) {
    const winnerPos = positionOf[lastVisible.winner] || "t";
    const collectAt = Math.max(0, (pace.nextAt || now) - (fastShown ? FAST_COLLECT_MS : COLLECT_MS) - now);
    setTimeout(() => {
      if (!host.isConnected) return;
      host.querySelectorAll(".hx-slot").forEach((slot) => slot.classList.add(`hx-collect-${winnerPos}`));
    }, collectAt);
  }
}

function dealCountBefore(visible) {
  const deal = [...visible].reverse().find((event) => event.type === "deal");
  return deal ? Number(deal.move_count) : 0;
}

function dwellFor(event, events, fast) {
  if (event.type === "deal") return DEAL_DWELL_MS;
  if (event.type === "passed") return 400;
  if (event.type === "pass_complete") return PASS_DWELL_MS;
  if (event.type === "trick") return fast ? FAST_TRICK_MS : TRICK_DWELL_MS;
  if (event.type === "play") {
    if (fast) return FAST_PLAY_MS; // the round is decided — keep it moving
    // Consecutive plays chain quickly; a play that OPENS a trick gets the
    // table's full attention (1.5s-class dwell).
    const previous = events.filter((other) => Number(other.move_count) < Number(event.move_count)).pop();
    const opensTrick = !previous || previous.type !== "play";
    return opensTrick ? PLAY_SOLO_MS : PLAY_STEP_MS;
  }
  return 250; // round_end / complete: the score sheet is its own moment
}

// All 26 points (plus the J♦ under that option) already sit in someone's
// points_taken: nothing left in the hands can change a score.
function heartsPointsExhausted(game) {
  const taken = (Array.isArray(game.players) ? game.players : [])
    .flatMap((seat) => (Array.isArray(seat.points_taken) ? seat.points_taken : []));
  if (taken.filter((card) => cardSuit(card) === "H").length < 13) return false;
  if (!taken.includes("QS")) return false;
  if (game.options && game.options.jack_of_diamonds && !taken.includes("JD")) return false;
  return true;
}

// The last event that still carried a point — everything after it is the
// dead tail. 0 when the events window has already scrolled past them all.
function lastPointEventCount(events, options) {
  const jd = Boolean(options && options.jack_of_diamonds);
  const pointCard = (card) => cardSuit(card) === "H" || card === "QS" || (jd && card === "JD");
  return events.reduce((last, event) => (
    (event.type === "play" && pointCard(event.card)) || (event.type === "trick" && Number(event.points || 0) !== 0)
      ? Number(event.move_count) : last
  ), 0);
}

function soundFor(event, visible, game, localMark) {
  if (event.type === "deal") { playCardDeal(); return; }
  if (event.type === "pass_complete") { playCardDeal(); return; }
  if (event.type === "trick") { playTrickTake(); return; }
  if (event.type === "play") {
    playCardPlay();
    if (event.card === "QS") playQueenSpades();
    else if (cardSuit(event.card) === "H") {
      const dealAt = dealCountBefore(visible);
      const earlierHeart = visible.some((other) => other.type === "play" && cardSuit(other.card) === "H"
        && Number(other.move_count) > dealAt && Number(other.move_count) < Number(event.move_count));
      if (!earlierHeart) playHeartsBroken();
    }
    return;
  }
  if (event.type === "round_end") { if (event.moon_shooter) playMoonShot(); else playBank(); return; }
  if (event.type === "complete") { (event.winner === localMark ? playWin : playLose)(); }
}

// ---------- html builders ----------

// Name + turn marker only — scores and tricks live in the standings table
// below the hand (MojoSOGO 2026-07-04). The one exception: suit badges — a ♥
// if the seat has taken ANY heart this round, a ♠ if the queen landed on them.
function seatBoxHtml(displaySeats, room, game, mark, actorMark, passing, caughtUp) {
  const seat = seatByMark(displaySeats, mark);
  if (!seat) return "";
  const waitingPass = passing && !seat.has_passed;
  const turnMark = actorMark === mark ? "👉" : waitingPass ? "🔀" : "";
  const badges = `${seat.took_hearts ? '<span class="hx-badge-h">♥</span>' : ""}${seat.took_queen ? '<span class="hx-badge-s">♠</span>' : ""}`;
  return `<div class="hx-seatbox${actorMark === mark ? " hx-turn" : ""}">
    <span class="hx-nm"><span class="hx-mark">${turnMark}</span><span class="hx-nm-text">${seatEmoji(room, mark)} ${escapeName(seatName(room, mark))}</span><span class="hx-badges">${badges}</span></span>
  </div>`;
}

function slotHtml(play, positionOf, collecting, shownCount) {
  const pos = positionOf[play.mark] || "t";
  const fresh = !collecting && Number(play.move_count || 0) === shownCount;
  return `<div class="hx-slot hx-slot-${pos}">${playingCardHtml(play.card, { size: "table", extraClass: fresh ? `hx-play-${pos}` : "" })}</div>`;
}

function handHtml(myHand, localSeat, legal, game, myTurn) {
  if (!localSeat) return "";
  const received = game.first_trick && Array.isArray(localSeat.received) ? new Set(localSeat.received) : new Set();
  const overlap = myHand.length > 9 ? 26 : 20;
  return myHand.map((card, index) => {
    const classes = [];
    if (raised.cards.has(card)) classes.push("hx-raised");
    if (received.has(card)) classes.push("hx-new");
    if (myTurn && legal && !legal.includes(card)) classes.push("hx-dim");
    return playingCardHtml(card, { size: "hand", extraClass: classes.join(" "), zIndex: index + 1 })
      .replace('class="pc-card', `style="--hx-i:${index};--hx-ovl:${overlap}px" class="pc-card`);
  }).join("");
}

// ONE button, always labeled Commit when it can act (MojoSOGO 2026-07-04):
// it commits the 3-card pass, the selected card, and the next deal.
function actionButtonHtml(game, view) {
  const arrow = DIRECTION_ARROWS[game.pass_direction] || "";
  if (view.complete) return `<button class="hx-action" type="button" data-hx-action disabled>Game over 🏆</button>`;
  if (!view.localSeat) return `<button class="hx-action" type="button" data-hx-action disabled>Watching</button>`;
  if (view.passing && view.myPassPending) {
    const ready = view.raisedCount === 3 && !view.movePending && view.caughtUp;
    return `<button class="hx-action" type="button" data-hx-action="pass" ${ready ? "" : "disabled"}>Commit ${view.raisedCount}/3 ${arrow}</button>`;
  }
  if (view.passing) return `<button class="hx-action" type="button" data-hx-action disabled>Passed ✓</button>`;
  if (view.caughtUp && game.phase === "round_end") {
    return `<button class="hx-action" type="button" data-hx-action="next_round" ${view.movePending ? "disabled" : ""}>Commit</button>`;
  }
  if (view.myTurn) {
    return `<button class="hx-action" type="button" data-hx-action="play" ${view.playReady ? "" : "disabled"}>Commit</button>`;
  }
  return `<button class="hx-action" type="button" data-hx-action disabled>${view.queuedCard ? "Queued ✓" : "Waiting…"}</button>`;
}

function tipHtml(game, room, view) {
  if (view.complete && view.caughtUp && game.winner) {
    return `Game over — ${escapeName(seatName(room, game.winner))} wins with the lowest score.`;
  }
  if (!view.caughtUp && view.lastVisible) {
    const event = view.lastVisible;
    if (event.type === "play") return `${escapeName(seatName(room, event.mark))} plays ${cardLabel(event.card)}`;
    if (event.type === "trick") return `${escapeName(seatName(room, event.winner))} takes the trick${event.points ? ` (+${event.points})` : ""}`;
    if (event.type === "deal") return `Round ${event.round} — dealing…`;
    if (event.type === "passed") return `${escapeName(seatName(room, event.mark))} passed three cards`;
    if (event.type === "pass_complete") return "The cards slide across the table…";
    if (event.type === "round_end") return event.moon_shooter ? `${escapeName(seatName(room, event.moon_shooter))} shot the moon! 🌙` : "The round is scored.";
    return "…";
  }
  if (view.myPassPending) {
    const offset = { left: 1, right: 3, across: 2 }[game.pass_direction] || 0;
    const order = game.seat_order || [];
    const meIndex = view.localSeat ? order.indexOf(view.localSeat.mark) : -1;
    const receiver = meIndex >= 0 && offset ? seatName(room, order[(meIndex + offset) % 4]) : "";
    return `Tap 3 cards to pass ${game.pass_direction}${receiver ? ` to ${escapeName(receiver)}` : ""}.`;
  }
  if (view.passing) {
    const waiting = (view.seats || []).filter((seat) => !seat.has_passed).map((seat) => escapeName(seatName(room, seat.mark)));
    return waiting.length ? `Waiting on ${waiting.join(", ")}…` : "…";
  }
  if (view.autoPlaying) return "No points left — playing out the hand…";
  if (view.myTurn) return "Your turn — pick a card, then Commit (or flick it to the table).";
  if (view.caughtUp && game.phase === "round_end") return "Round scored — ready for the next deal.";
  if (view.queuedCard) return `${cardLabel(view.queuedCard)} queued — it plays when your turn comes.`;
  if (game.current_player) return `${escapeName(seatName(room, game.current_player))} is thinking…`;
  return "…";
}

// A tip broken into complete ideas: a chunk ends after sentence punctuation
// or a comma, so page breaks land BETWEEN thoughts, never mid-idea.
// (Duplicated from no-thanks/render.js — games must not import game-to-game;
// a shared games/tip-strip.js is the extraction candidate when a third game
// wants it.)
function ideaChunks(text) {
  const chunks = [];
  let buffer = "";
  for (const word of text.split(" ")) {
    buffer = buffer ? `${buffer} ${word}` : word;
    if (/[.!?;:,]$/.test(word)) { chunks.push(buffer); buffer = ""; }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

// Fit the tip to its single line. If it overflows, pack whole ideas into
// pages that fit beside the n/m badge, show the current page, and let a tap
// on the strip flip to the next. Pure display — measured on live rects.
function paginateTip(host) {
  const strip = host.querySelector("[data-hx-tip]");
  if (!strip) return;
  const textEl = strip.querySelector(".hx-tip-text");
  const badge = strip.querySelector(".hx-tip-page");
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
  const push = () => { if (current) { pages.push(current); current = ""; } };
  for (const idea of ideaChunks(full)) {
    const attempt = current ? `${current} ${idea}` : idea;
    if (fits(attempt)) { current = attempt; continue; }
    push();
    if (fits(idea)) { current = idea; continue; }
    for (const word of idea.split(" ")) { // an idea alone too long: last resort, split it
      const wordAttempt = current ? `${current} ${word}` : word;
      if (fits(wordAttempt)) current = wordAttempt;
      else { push(); current = word; }
    }
  }
  push();
  tipPages.pages = pages.length ? pages : [full];
  const show = () => {
    const total = tipPages.pages.length;
    tipPages.page %= total;
    textEl.textContent = tipPages.pages[tipPages.page];
    badge.textContent = `${tipPages.page + 1}/${total}`;
  };
  show();
  strip.classList.add("hx-tip-paged");
  strip.addEventListener("click", () => { tipPages.page += 1; show(); });
}

function feltStatus(game, room, view) {
  if (view.collecting || !view.caughtUp) return "";
  if (game.phase === "playing" && game.first_trick && game.current_player && (game.trick || []).length === 0) {
    return `${escapeName(seatName(room, game.current_player))} opens with the 2♣`;
  }
  return "";
}

// House table style: name left, single-emoji status column beside it, stat
// columns centered, no row numbers.
function resultsHtml(game, room, complete) {
  const results = game.round_results || { final: {}, moon_shooter: null };
  const order = (game.seat_order || []).slice().sort((a, b) => seatScore(game, a) - seatScore(game, b));
  const rows = order.map((mark) => {
    const delta = Number(results.final && results.final[mark] !== undefined ? results.final[mark] : 0);
    const flag = complete && game.winner === mark ? "🏆" : results.moon_shooter === mark ? "🌙" : "";
    return `<tr class="${complete && game.winner === mark ? "hx-winner-row" : ""}">
      <td class="hx-name">${seatEmoji(room, mark)} ${escapeName(seatName(room, mark))}</td>
      <td class="hx-status">${flag}</td>
      <td>${delta > 0 ? `+${delta}` : delta}</td>
      <td class="hx-total">${seatScore(game, mark)}</td>
    </tr>`;
  }).join("");
  return `<div class="hx-results">
    <table><thead><tr><th class="hx-name">${complete ? "Final" : `Round ${game.round}`}</th><th></th><th>Round</th><th>Total</th></tr></thead>
    <tbody>${rows}</tbody></table>
    ${results.moon_shooter ? `<span class="hx-moon-note">${escapeName(seatName(room, results.moon_shooter))} shot the moon! 🌙</span>` : ""}
  </div>`;
}

function seatScore(game, mark) {
  const seat = seatByMark(game.players || [], mark);
  return seat ? Number(seat.score || 0) : 0;
}

// The standing score table — ALWAYS below the cards region (MojoSOGO
// 2026-07-04). House table style: name left, single-emoji status column,
// stat columns centered, no row numbers. Lowest score leads the sort.
function standingsHtml(displaySeats, room, game, actorMark, finished, localMark) {
  const target = Number(game.options && game.options.target_score) || 100;
  // Rows sit in TABLE order — you at the top, then clockwise (play order) —
  // so the 👉 walks straight down the list and wraps bottom to top instead
  // of skipping around a score sort (MojoSOGO 2026-07-04).
  const order = Array.isArray(game.seat_order) && game.seat_order.length
    ? game.seat_order : displaySeats.map((seat) => seat.mark);
  const anchor = localMark && order.includes(localMark) ? order.indexOf(localMark) : 0;
  const seats = order.map((_, i) => seatByMark(displaySeats, order[(anchor + i) % order.length])).filter(Boolean);
  const rows = seats.map((seat) => {
    const flag = finished && game.winner === seat.mark ? "🏆" : actorMark === seat.mark ? "👉" : "";
    // Danger pulses scale to the target (at the default 100: the 80s pulse
    // yellow, the 90s red).
    const pct = (Number(seat.score) / target) * 100;
    const heat = finished ? "" : pct >= 90 ? " hx-hot90" : pct >= 80 ? " hx-hot80" : "";
    return `<tr class="${finished && game.winner === seat.mark ? "hx-winner-row" : ""}${heat}">
      <td class="hx-name">${seatEmoji(room, seat.mark)} ${escapeName(seatName(room, seat.mark))}</td>
      <td class="hx-status">${flag}</td>
      <td>${Math.max(0, seat.round_points)}</td>
      <td>${Math.max(0, seat.tricks)}</td>
      <td class="hx-total">${seat.score}</td>
    </tr>`;
  }).join("");
  // The march to the target: every player's emoji rides the 0 → target line.
  const chips = displaySeats.map((seat) => {
    const pct = Math.max(0, Math.min(100, (Number(seat.score) / target) * 100));
    return `<span class="hx-prog-chip" style="left:${pct}%" aria-label="${escapeName(seatName(room, seat.mark))}: ${seat.score} of ${target}">${seatEmoji(room, seat.mark)}</span>`;
  }).join("");
  return `<section class="hx-standings" aria-label="Scores">
    <table><thead><tr><th class="hx-name">Player</th><th></th><th>♥ round</th><th>Tricks</th><th>Score</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="hx-progress"><span class="hx-prog-track"></span>${chips}</div>
  </section>`;
}

// ---------- wiring ----------

// Interaction model (MojoSOGO 2026-07-04): tap selects, tapping the SAME card
// unselects (never a double-tap commit). Committing is explicit — the Commit
// button, or an up-swipe that may start ANYWHERE in the hand strip (the blank
// space beside the cards included) and commits ONLY the selected card.
const SWIPE_UP_PX = 48; // how far up a flick must travel to commit (and more up than sideways)
let swipeGuardAt = 0;   // a swipe's trailing click must not re-toggle selection

// Selection changes patch the DOM in place — a full re-render mid-dwell would
// restart the felt's play/collect animations (MojoSOGO 2026-07-04).
function applySelection(host, view) {
  host.querySelectorAll(".hx-hand .pc-card[data-card]").forEach((el) => {
    el.classList.toggle("hx-raised", raised.cards.has(el.getAttribute("data-card")));
  });
  const action = host.querySelector("[data-hx-action]");
  if (!action) return;
  const kind = action.getAttribute("data-hx-action");
  if (kind === "pass") {
    action.disabled = raised.cards.size !== 3 || Boolean(view.movePending);
    action.textContent = `Commit ${raised.cards.size}/3 ${view.arrow}`;
  } else if (kind === "play") {
    const [card] = [...raised.cards];
    action.disabled = !(raised.cards.size === 1 && view.legal && view.legal.includes(card));
  } else if (!kind && view.offTurnPlaying) {
    action.textContent = raised.preset && raised.cards.size === 1 ? "Queued ✓" : "Waiting…";
  }
}

function wireHearts(host, ctx, view) {
  const note = host.querySelector("[data-hx-note]");
  const send = async (action) => {
    const error = await ctx.makeMove(action);
    if (error && note) {
      note.textContent = error;
      note.classList.add("hx-error");
    }
  };
  const commitPlay = (card) => {
    cancelCountdown(host);
    // No raised.clear() here: the card stays up until the reply snapshot takes
    // it out of the hand — lowering it first reads as a spurious unselect.
    send({ type: "play", card });
  };
  host.querySelectorAll(".hx-hand .pc-card[data-card]").forEach((cardEl) => {
    const card = cardEl.getAttribute("data-card");
    cardEl.addEventListener("click", () => {
      if (Date.now() - swipeGuardAt < 400) return; // this tap already committed as a swipe
      if (view.myPassPending) {
        if (raised.cards.has(card)) raised.cards.delete(card);
        else if (raised.cards.size < 3) raised.cards.add(card);
        else return;
        playClick();
        applySelection(host, view);
        return;
      }
      // Playing phase: selection works even off-turn (pre-select, MojoSOGO
      // 2026-07-04); on-turn it is limited to legal cards. Selecting a card
      // lowers everything else — including the auto-raised received trio —
      // and if the tapped card was already among the raised, it simply stays
      // as THE selection. Tapping the lone selected card unselects it.
      if (view.preselect && (!view.myTurn || (view.legal && view.legal.includes(card)))) {
        if (raised.cards.has(card) && raised.cards.size === 1) {
          raised.cards.delete(card);
          raised.preset = false;
          cancelCountdown(host);
        } else {
          raised.cards.clear();
          raised.cards.add(card);
          raised.preset = !view.myTurn; // an off-turn pick is a queued commit
          // On-turn, the selection arms the 1s shot clock (pulsing Commit);
          // switching cards restarts it.
          if (view.myTurn) startCountdown(host, commitPlay, card);
        }
        playClick();
        applySelection(host, view);
      }
    });
  });
  // Up-swipe to commit, starting ANYWHERE in the hand strip (blank edges
  // included). It commits ONLY the already-selected card — selection is a
  // separate prior tap, so a swipe that happens to begin over some other card
  // can never play that card (MojoSOGO 2026-07-04). Pointer capture keeps the
  // gesture even when the finger leaves the strip.
  const hand = host.querySelector(".hx-hand");
  if (hand && view.myTurn && view.legal) {
    hand.addEventListener("pointerdown", (start) => {
      try { hand.setPointerCapture(start.pointerId); } catch {}
      const onUp = (end) => {
        cleanup();
        const rose = start.clientY - end.clientY;
        const drift = Math.abs(end.clientX - start.clientX);
        if (rose < SWIPE_UP_PX || drift > rose) return; // must travel up, more up than sideways
        const selected = raised.cards.size === 1 ? [...raised.cards][0] : null;
        if (selected && view.legal.includes(selected)) {
          swipeGuardAt = Date.now();
          commitPlay(selected);
        }
      };
      const cleanup = () => {
        hand.removeEventListener("pointerup", onUp);
        hand.removeEventListener("pointercancel", cleanup);
      };
      hand.addEventListener("pointerup", onUp);
      hand.addEventListener("pointercancel", cleanup);
    });
  }
  // The listener attaches whether or not the button is currently enabled —
  // applySelection() flips `disabled` live without a re-wire.
  const action = host.querySelector("[data-hx-action]");
  if (action) {
    action.addEventListener("click", () => {
      if (action.disabled) return;
      const kind = action.getAttribute("data-hx-action");
      if (kind === "pass" && raised.cards.size === 3) {
        const cards = [...raised.cards];
        raised.cards.clear();
        send({ type: "pass", cards });
      } else if (kind === "play" && raised.cards.size === 1) {
        commitPlay([...raised.cards][0]);
      } else if (kind === "next_round") {
        send({ type: "next_round" });
      }
    });
  }
}

// ---------- room helpers ----------

function seatByMark(seats, mark) {
  return (seats || []).find((seat) => seat.mark === mark) || null;
}

function markForPlayer(room, playerId) {
  const seat = (room.players || []).find((player) => player.id === playerId);
  return seat ? seat.mark : null;
}

function seatEmoji(room, mark) {
  const seat = (room.players || []).find((player) => player.mark === mark);
  return seat && seat.icon ? seat.icon : "🙂";
}

function seatName(room, mark) {
  const seat = (room.players || []).find((player) => player.mark === mark);
  return seat ? seat.name : mark;
}

function cardLabel(card) {
  return `${cardRankLabel(card)}${CARD_SUIT_GLYPHS[cardSuit(card)] || ""}`;
}

function escapeName(value) {
  return String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}
