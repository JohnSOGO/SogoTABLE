// Shared host-start lobby — the room-create / invite "table" screen every
// host-start (Game-Locked) game shows before it starts, so they all match.
//
// Emits the canonical `.ten-thousand-lobby` / `.tt-lobby-*` markup (the look
// Yahtzee and 10,000 already use) and wires the shell-provided ctx callbacks
// (`invitePlayer`, `addBot`, `startGame`). A game's renderer calls this when
// `ctx.started` is false instead of hand-rolling its own invite UI.
//
// opts:
//   wrap        - optional wrapper class (e.g. "mazewright-root") so a game's
//                 own #macroBoard neutralizer CSS applies to the lobby too.
//   heading     - roster heading (default "Players").
//   blurb       - one-line description shown above the controls.
//   extraHtml   - host-only markup injected above the action buttons (e.g. an
//                 options <select>); wire it up in onMount.
//   getStartArg - (host) => value passed to ctx.startGame() (for games whose
//                 start carries an option, like 10,000's opening score).
//   onMount     - (host) => void, called after render so the game can wire any
//                 extraHtml controls.
export function renderHostStartLobby(host, ctx, opts = {}) {
  const esc = ctx.escapeHtml || ((s) => s);
  const seats = Array.isArray(ctx.room && ctx.room.players) ? ctx.room.players : [];
  const roster = seats.length
    ? seats.map((seat, i) => `
      <li class="tt-lobby-player">
        <span class="tt-lobby-player-no">${i + 1}</span>
        <div class="tt-lobby-player-body">
          <strong>${seat.icon ? esc(seat.icon) + " " : ""}${esc(seat.name)}</strong>
          <span>${esc(seat.kind === "bot" ? "Bot" : "Player")} ${esc(seat.mark || "")}</span>
        </div>
      </li>`).join("")
    : `<li class="tt-lobby-empty">No players yet.</li>`;
  const hostControls = ctx.isHost
    ? `${opts.extraHtml || ""}
      <div class="tt-lobby-actions">
        <button class="secondary" type="button" data-lobby="invite">Invite Remote Opponent</button>
        <button class="secondary" type="button" data-lobby="bot">Invite Bot</button>
        <button class="primary" type="button" data-lobby="start" ${seats.length ? "" : "disabled"}>Start Game</button>
      </div>`
    : `<p class="ten-thousand-message">Waiting for the host to start...</p>`;
  const section = `<section class="ten-thousand-lobby">
      <h3>${esc(opts.heading || "Players")}</h3>
      <ul class="tt-lobby-roster">${roster}</ul>
      <p class="ten-thousand-message">${esc(opts.blurb || "Invite players or bots, then start.")}</p>
      ${hostControls}
    </section>`;
  host.innerHTML = opts.wrap ? `<div class="${opts.wrap}">${section}</div>` : section;
  if (!ctx.isHost) return;
  const wire = (key, fn) => {
    const b = host.querySelector(`[data-lobby="${key}"]`);
    if (b && fn) b.addEventListener("click", () => { if (!b.disabled) fn(); });
  };
  wire("invite", ctx.invitePlayer);
  wire("bot", ctx.addBot);
  wire("start", () => ctx.startGame(opts.getStartArg ? opts.getStartArg(host) : undefined));
  if (opts.onMount) opts.onMount(host);
}
