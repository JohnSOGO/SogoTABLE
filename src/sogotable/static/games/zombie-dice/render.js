// Roll of the Dead (module id zombie-dice) — in-game UI adapter. Renders the
// prepared server projection and captures intent; it computes NO rule outcomes
// (bust/endgame/tiebreaker all arrive decided from the worker rules module).
// The shell hands a ctx bag (host, game, room, started, isHost, localPlayerId,
// pendingMove, makeMove, startGame, addBot, invitePlayer, escapeHtml) exactly
// like the other host-start games; the pre-game screen is the shared
// renderHostStartLobby template. All wiring is addEventListener — no inline
// onclick, and no imports from app.js.
import { renderHostStartLobby } from "../lobby.js";
import { ZD_CSS } from "./styles.js";

const FACE_EMOJI = { brain: "\u{1F9E0}", feet: "\u{1F463}", shotgun: "\u{1F4A5}" };
const CUP_EMOJI = { green: "\u{1F7E9}", yellow: "\u{1F7E8}", red: "\u{1F7E5}" };
const ROLL_MOVE_TYPES = new Set(["roll", "bust"]);
let stylesInjected = false;
let lastAnimatedMoveCount = -1;

export function renderZombieDiceGame(ctx) {
  const { host, game } = ctx;
  if (!host || !game) return;
  if (!stylesInjected) {
    const style = document.createElement("style");
    style.textContent = ZD_CSS;
    document.head.appendChild(style);
    stylesInjected = true;
  }
  host.className = "macro-board zombie-dice-table";
  if (!ctx.started) {
    renderHostStartLobby(host, ctx, {
      wrap: "zombie-dice-root",
      heading: "Players",
      blurb: "Eat brains, dodge shotguns — 13 brains triggers the last round. Invite players or bots, then start.",
    });
    return;
  }
  renderZombieDicePlay(host, ctx);
}

function renderZombieDicePlay(host, ctx) {
  const { room, game, pendingMove } = ctx;
  const seats = Array.isArray(game.players) ? game.players : [];
  const localMark = markForPlayer(room, ctx.localPlayerId);
  const localSeat = seats.find((seat) => seat.mark === localMark) || null;
  const complete = game.status === "complete";
  // Bot rows replay paced to the local human's rolls this round; once the
  // human's turn ends (or the game is over) the bots' final results show.
  const pacing = {
    rollCount: localSeat ? Number(localSeat.roll_count || 0) : 0,
    humanDone: complete || Boolean(localSeat && localSeat.resolved),
  };
  host.innerHTML = `
    <div class="zombie-dice-root">
      ${bannerHtml(game, room)}
      ${localSeat && !complete ? trayHtml(localSeat, game, room, pendingMove) : ""}
      ${standingsHtml(seats, room, game, pacing)}
    </div>`;
  if (localSeat && !complete) wireTray(host, localSeat, ctx);
}

function bannerHtml(game, room) {
  if (game.status === "complete" && game.winner) {
    const score = fmt((seatState(game, game.winner) || {}).score);
    return `<p class="zd-banner zd-win">\u{1F3C6} ${escapeName(seatName(room, game.winner))} wins with ${score} brains!</p>`;
  }
  if (game.tiebreaker) {
    const names = (game.active_marks || []).map((mark) => escapeName(seatName(room, mark))).join(" vs ");
    return `<p class="zd-banner">☠️ Tiebreaker round — ${names}!</p>`;
  }
  return "";
}

function trayHtml(seat, game, room, pendingMove) {
  if (!seat.active) {
    return `<p class="zd-msg">You're sitting out the tiebreaker — watch the leaders fight over the last brain.</p>`;
  }
  const busted = seat.finish_state === "busted";
  const banked = seat.finish_state === "banked";
  const lastMove = game.last_move || {};
  const moveCount = Number(game.move_count || 0);
  const animate = !pendingMove
    && lastMove.mark === seat.mark
    && ROLL_MOVE_TYPES.has(lastMove.type)
    && moveCount !== lastAnimatedMoveCount;
  if (animate) lastAnimatedMoveCount = moveCount;
  const rolled = Array.isArray(seat.rolled) ? seat.rolled : [];
  const diceHtml = rolled.length
    ? rolled.map((die) => `
      <span class="zd-die zd-${die.color}${animate ? " rolling" : ""}" role="img"
        aria-label="${die.color} die: ${die.face}"><span>${FACE_EMOJI[die.face] || "?"}</span></span>`).join("")
    : [1, 2, 3].map(() => `<span class="zd-die zd-blank" aria-label="not rolled">?</span>`).join("");
  const cup = seat.cup || {};
  const keptHtml = `
    <p class="zd-kept">
      <span>\u{1F9E0} <b>${fmt(seat.turn_brains)}</b></span>
      <span>\u{1F4A5} <b>${fmt(seat.shotguns)}</b>/3</span>
      <span>\u{1F463} <b>${fmt((seat.hand || []).length)}</b> re-roll</span>
      <span>Cup ${["green", "yellow", "red"].map((color) => `${CUP_EMOJI[color]}${fmt(cup[color])}`).join(" ")}</span>
    </p>`;
  const disabled = Boolean(pendingMove);
  const canRoll = !disabled && Boolean(seat.can_roll) && game.status === "playing";
  const canBank = !disabled && Boolean(seat.can_bank) && game.status === "playing";
  let actionsHtml;
  let noteHtml = "";
  if (busted && !seat.can_roll) {
    noteHtml = `<p class="zd-msg zd-bust">\u{1F4A5}\u{1F4A5}\u{1F4A5} Shotgunned! No brains this turn.</p>${waitingHtml(seat, game, room)}`;
    actionsHtml = "";
  } else if (banked && !seat.can_roll) {
    noteHtml = `<p class="zd-msg">\u{1F9E0} Banked ${fmt(seat.score)}.</p>${waitingHtml(seat, game, room)}`;
    actionsHtml = "";
  } else if (game.round_pending_advance) {
    actionsHtml = `<button class="primary" type="button" data-zd="roll" ${canRoll ? "" : "disabled"}
      aria-label="Start the next round">\u{1F3B2} Start round ${fmt(Number(game.round) + 1)}</button>`;
  } else if (seat.phase === "ready") {
    actionsHtml = `<button class="primary" type="button" data-zd="roll" ${canRoll ? "" : "disabled"}
      aria-label="Roll three dice">\u{1F3B2} Roll</button>`;
  } else {
    actionsHtml = `
      <button class="primary" type="button" data-zd="roll" ${canRoll ? "" : "disabled"}
        aria-label="Push your luck — roll again">\u{1F3B2} Roll again</button>
      <button class="secondary" type="button" data-zd="bank" ${canBank ? "" : "disabled"}
        aria-label="Stop and bank your brains">\u{1F3E6} Bank ${fmt(seat.turn_brains)}</button>`;
  }
  return `
    <section class="zd-tray">
      <div class="zd-scoreboard">
        <div><span class="label">Banked</span><strong>${fmt(seat.score)}</strong></div>
        <div><span class="label">This turn</span><strong>${fmt(seat.turn_brains)}</strong></div>
        <div><span class="label">Shotguns</span><strong>${fmt(seat.shotguns)}/3</strong></div>
      </div>
      <div class="zd-dice" aria-label="Rolled dice">${diceHtml}</div>
      ${keptHtml}
      ${actionsHtml ? `<div class="zd-actions" aria-label="Turn actions">${actionsHtml}</div>` : ""}
      ${noteHtml}
      <p class="zd-msg" data-zd-note hidden></p>
    </section>`;
}

function waitingHtml(seat, game, room) {
  const active = game.tiebreaker ? (game.active_marks || []) : (game.players || []).map((other) => other.mark);
  const stillPlaying = (game.players || [])
    .filter((other) => active.includes(other.mark) && !other.resolved && other.mark !== seat.mark)
    .map((other) => escapeName(seatName(room, other.mark)));
  return `<p class="zd-msg">${stillPlaying.length
    ? `Waiting for: ${stillPlaying.join(", ")}`
    : "Waiting for the next round…"}</p>`;
}

function wireTray(host, seat, ctx) {
  const note = host.querySelector("[data-zd-note]");
  const wire = (key, action) => {
    const button = host.querySelector(`[data-zd="${key}"]`);
    if (!button) return;
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      const error = await ctx.makeMove(action);
      if (error && note) {
        note.textContent = error;
        note.hidden = false;
        note.classList.add("zd-error");
      }
    });
  };
  wire("roll", { type: "roll" });
  wire("bank", { type: "bank" });
}

function standingsHtml(seats, room, game, pacing) {
  const rows = seats
    .slice()
    .sort((left, right) => right.score - left.score)
    .map((seat) => standingsRow(seat, room, game, pacing))
    .join("");
  return `
    <section class="zd-standings" aria-label="Standings">
      <table>
        <thead><tr><th>Player</th><th aria-label="Status">Status</th><th>\u{1F4A5}</th><th>\u{1F9E0}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function zombieDiceStatusEmoji(status) {
  if (status === "banked") return "\u{1F3E6}";
  if (status === "busted") return "\u{1F4A5}";
  if (status === "sitting") return "\u{1F4A4}";
  return "\u{1F3B2}"; // rolling
}

function standingsRow(seat, room, game, pacing) {
  const complete = game.status === "complete";
  const paced = seat.is_bot ? zombieDiceBotPaced(seat, pacing) : null;
  let status;
  let shotguns;
  let carried;
  let gain;
  if (paced) {
    status = paced.status;
    shotguns = paced.shotguns;
    carried = paced.carried;
    gain = paced.gain;
  } else {
    status = seat.active === false ? "sitting" : seat.finish_state === "active" ? "rolling" : seat.finish_state;
    shotguns = Number(seat.shotguns || 0);
    carried = Number(seat.score || 0);
    gain = Number(seat.turn_brains || 0);
  }
  const isWinner = complete && seat.mark === game.winner;
  const statusHtml = isWinner ? "\u{1F3C6}" : zombieDiceStatusEmoji(status);
  // While rolling, show carried + the live turn gain; once banked the gain is
  // already inside the total (the server folds it in at bank time).
  const scoreHtml = !isWinner && status === "rolling" && gain > 0
    ? `<strong>${fmt(carried)}</strong><span class="zd-turn-gain">+${fmt(gain)}</span>`
    : `<strong>${fmt(paced && status === "banked" ? paced.carried + paced.gain : Number(seat.score || 0))}</strong>`;
  const classes = ["zd-row"];
  if (status === "busted") classes.push("zd-row-busted");
  if (status === "sitting") classes.push("zd-row-sitting");
  return `
    <tr class="${classes.join(" ")}">
      <td><span class="zd-player">${seatEmoji(room, seat.mark)} ${escapeName(seatName(room, seat.mark))}</span></td>
      <td title="${status}">${statusHtml}</td>
      <td>${status === "sitting" ? "—" : fmt(shotguns)}</td>
      <td>${scoreHtml}</td>
    </tr>`;
}

// Maps a bot's resolved-turn trajectory to what the human should see right now:
// indexed by the local human's roll count this round, clamped to the final
// entry once the human's turn ends. Mirrors the 10,000 pacing contract.
function zombieDiceBotPaced(seat, pacing) {
  const traj = Array.isArray(seat.bot_trajectory) ? seat.bot_trajectory : [];
  if (!traj.length) {
    return {
      carried: Number(seat.score || 0),
      gain: 0,
      status: seat.active === false ? "sitting" : seat.finish_state === "active" ? "rolling" : seat.finish_state,
      shotguns: Number(seat.shotguns || 0),
    };
  }
  const lastIndex = traj.length - 1;
  const index = pacing.humanDone ? lastIndex : Math.min(Math.max(pacing.rollCount, 0), lastIndex);
  const snap = traj[index];
  const carried = Number((traj[0] && traj[0].total) || 0);
  return {
    carried,
    gain: Math.max(0, Number(snap.total || 0) - carried),
    status: snap.status,
    shotguns: Number(snap.shotguns || 0),
  };
}

function seatState(game, mark) {
  return (Array.isArray(game.players) ? game.players : []).find((seat) => seat.mark === mark) || null;
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
