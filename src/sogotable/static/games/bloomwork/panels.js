// Bloomwork — panels (HTML strings, view only): seat chips (scoreboard +
// ready status), status + priority strip, opponents' mini gardens, the
// "last pick" log, the round summary and the final results. Every word
// comes from branding.js; every player name arrives escaped via view.name().
import { RESULTS, TICKER, UI, WORDS, flowerWord } from "./branding.js";
import { birdSvg, tileSvg } from "./art.js";
import { gardenHtml, miniHeapHtml } from "./board.js";

const seats = (game) => (Array.isArray(game.players) ? game.players : []);

// ---------- seat chips ----------
function seatState(game, seat) {
  if (game.status !== "playing") return { text: "", ok: false };
  if (seat.is_bot) return { text: "✓", ok: false };
  if (game.phase === "review") return seat.ready_next ? { text: "✓", ok: true } : { text: "…", ok: false };
  if (seat.skipped) return { text: "⏸", ok: false };
  return seat.has_committed ? { text: "✓", ok: true } : { text: "…", ok: false };
}

export function seatsHtml(view) {
  const { game } = view;
  const chips = seats(game).map((seat) => {
    const st = seatState(game, seat);
    const bird = seat.has_bird ? birdSvg() : "";
    return `<div class="bw-seat${seat.mark === view.myMark ? " bw-me" : ""}" title="${view.name(seat.mark)}">
        <span class="bw-seat-dot" style="background:${view.color(seat.mark)}"></span>
        <span class="bw-seat-name">${view.icon(seat.mark)}${view.name(seat.mark)}</span>${bird}
        <span class="bw-seat-score">${Number(seat.score) || 0}</span>
        <span class="bw-seat-state${st.ok ? " bw-ok" : ""}">${st.text}</span>
      </div>`;
  }).join("");
  return `<div class="bw-seats">${chips}</div>`;
}

// ---------- status + priority ----------
export function statusHtml(view) {
  const { game } = view;
  const quick = game.options && game.options.length === "quick";
  const prio = Array.isArray(game.priority_order) ? game.priority_order : [];
  const list = prio.map((m, i) => `<span class="${m === view.myMark ? "bw-prio-me" : ""}"><span class="bw-prio-n">${i + 1}</span>${view.name(m)}</span>`).join(" › ");
  const step = game.phase === "drafting" && game.status === "playing" ? ` · ${UI.pickN(game.pick)}` : "";
  return `<div class="bw-status bw-panel">
      <div class="bw-status-line"><span class="bw-round">${UI.round(game.round)}${step}</span>
        ${game.status === "playing" ? `<span class="bw-goal">${quick ? UI.quickGoal : UI.goal}</span>
        <span class="bw-bag">${UI.bagLeft(Number(game.bag_count) || 0)}</span>` : ""}</div>
      ${prio.length && game.phase === "drafting" ? `<div class="bw-status-line bw-prio" title="${UI.priorityHint}"><b>${UI.priority}</b><span class="bw-prio-list">${list}</span></div>` : ""}
    </div>`;
}

// ---------- opponents ----------
function skipButton(view, seat) {
  const { game } = view;
  const me = view.me;
  const votes = (game.skip_votes && game.skip_votes[seat.mark]) || [];
  let eligible = false;
  if (me && !seat.is_bot && game.status === "playing" && seat.mark !== me.mark) {
    if (game.phase === "drafting") eligible = me.has_committed && !me.skipped && !seat.has_committed && !seat.skipped;
    else eligible = me.ready_next && !seat.ready_next;
  }
  const mine = votes.includes(view.myMark);
  const cls = `bw-skip${mine ? " bw-on" : ""}${eligible ? "" : " bw-off"}`;
  return `<button type="button" class="${cls}" data-act="skip" data-target="${view.attr(seat.mark)}" title="${UI.skipVoteTitle(view.name(seat.mark))}"${eligible ? "" : " disabled tabindex=\"-1\""}>⏭ ${UI.skipVote}${votes.length ? ` ${votes.length}` : ""}</button>`;
}

export function opponentsHtml(view, list) {
  if (!list.length) return "";
  const cards = list.map((seat) => {
    const st = seatState(view.game, seat);
    return `<div class="bw-opp bw-panel">
        <div class="bw-opp-head"><span class="bw-seat-dot" style="background:${view.color(seat.mark)}"></span>
          <span class="bw-opp-name">${view.icon(seat.mark)}${view.name(seat.mark)}</span>
          <span class="bw-seat-score">${Number(seat.score) || 0}</span>
          <span class="bw-seat-state${st.ok ? " bw-ok" : ""}">${st.text}</span></div>
        <div class="bw-mini">${gardenHtml(seat, view)}</div>
        <div class="bw-mini-foot">${miniHeapHtml(seat)}${skipButton(view, seat)}</div>
      </div>`;
  }).join("");
  return `<section class="bw-opps">${cards}</section>`;
}

// ---------- last-pick log ----------
function eventLine(view, e) {
  const who = view.name(e.mark);
  if (e.type === "take") {
    let text = TICKER.take(who, e.count, e.flower, e.source, e.row, e.composted, e.bird);
    if (e.bumped_by) text = `${text} — ${TICKER.bumped(view.name(e.bumped_by), e.wanted)}`;
    return { text, flower: e.flower, bad: Boolean(e.bumped_by) && e.mark === view.myMark };
  }
  if (e.type === "missed") return { text: TICKER.missed(who, e.flower, e.by ? view.name(e.by) : null), flower: e.flower, bad: true };
  return null;
}

export function logHtml(view) {
  const events = Array.isArray(view.game.events) ? view.game.events : [];
  const last = events.filter((e) => e.type === "take" || e.type === "missed").reduce((best, e) => (!best || e.seq > best.seq ? e : best), null);
  const batch = last ? events.filter((e) => (e.type === "take" || e.type === "missed") && e.round === last.round && e.pick === last.pick) : [];
  const items = batch.sort((a, b) => a.seq - b.seq).map((e) => {
    const line = eventLine(view, e);
    if (!line) return "";
    const cls = `${line.bad ? "bw-bad" : ""}${e.mark === view.myMark ? " bw-mine" : ""}`;
    return `<li class="${cls}">${tileSvg(line.flower)}<span>${line.text}</span></li>`;
  }).join("");
  return `<section class="bw-log bw-panel"><h4>${UI.lastPick}</h4><ul>${items || `<li>${UI.noEvents}</li>`}</ul></section>`;
}

// ---------- round summary ----------
export function reviewHtml(view) {
  const { game, me } = view;
  const lr = game.last_round || { round: game.round, seats: {} };
  const rows = seats(game).map((seat) => {
    const s = (lr.seats && lr.seats[seat.mark]) || { planted: [], points: 0, penalty: 0, before: seat.score, after: seat.score };
    const planted = (s.planted || []).map((p) => `<span class="bw-rplant" title="${flowerWord(p.flower)}">${tileSvg(p.flower)}+${p.points}</span>`).join("");
    return `<div class="bw-rrow${seat.mark === view.myMark ? " bw-me" : ""}">
        <span class="bw-rname">${view.icon(seat.mark)}${view.name(seat.mark)}</span>
        <span class="bw-rscore"><small>${UI.scoreLine(s.before, "")}</small>${s.after}</span>
        <span class="bw-rdetail">${planted || UI.noPlant}${s.penalty ? `<span class="bw-rpen">${UI.compostLoss(s.penalty)}</span>` : ""}</span>
      </div>`;
  }).join("");
  const waiting = seats(game).filter((s) => !s.is_bot && !s.ready_next && s.mark !== view.myMark).map((s) => view.name(s.mark));
  const ready = me && me.ready_next;
  const note = ready ? (waiting.length ? UI.readyWaiting(waiting.join(", ")) : UI.waitingAll) : "";
  const btn = me
    ? `<button type="button" class="bw-next-btn" data-act="next"${ready || view.sending ? " disabled" : ""}>${UI.nextRound}</button>`
    : "";
  return `<section class="bw-review bw-panel"><h3>${UI.reviewTitle(lr.round)}</h3>
      <div class="bw-rtable">${rows}</div>
      <div class="bw-next">${btn}<span>${note}</span></div>
    </section>`;
}

// ---------- results ----------
export function resultsHtml(view) {
  const { game } = view;
  const results = Array.isArray(game.results) ? game.results : [];
  const winners = results.filter((r) => r.place === 1).map((r) => r.mark);
  let banner = "";
  if (winners.length > 1) banner = RESULTS.tie(winners.map((m) => view.name(m)).join(" & "));
  else if (winners[0] === view.myMark) banner = RESULTS.youWin;
  else if (winners[0]) banner = RESULTS.winner(view.name(winners[0]));
  const rows = results.map((r) => {
    const parts = [];
    if (r.rows) parts.push(RESULTS.bonusRows(r.rows));
    if (r.cols) parts.push(RESULTS.bonusCols(r.cols));
    if (r.kinds) parts.push(RESULTS.bonusKinds(r.kinds));
    const bonus = parts.length ? `+${r.bonus} · ${parts.join(" · ")}` : RESULTS.noBonus;
    return `<div class="bw-rrow${r.place === 1 ? " bw-first" : ""}${r.mark === view.myMark ? " bw-me" : ""}">
        <span class="bw-rname"><span class="bw-place">${RESULTS.place(r.place)}</span>${view.icon(r.mark)}${view.name(r.mark)}</span>
        <span class="bw-rscore">${r.score} <small>${WORDS.pts}</small></span>
        <span class="bw-rdetail">${bonus}</span>
      </div>`;
  }).join("");
  return `<section class="bw-results bw-panel"><h3>${RESULTS.title}</h3>
      <div class="bw-banner">${tileSvg("sun")}<span>${banner}</span></div>
      <div class="bw-rtable">${rows}</div>
      <p class="bw-results-note">${RESULTS.rematch}</p>
    </section>`;
}
