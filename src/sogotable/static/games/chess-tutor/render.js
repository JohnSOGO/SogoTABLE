// Chess Tutor — the home (all openings) and opening (lines) screens.
// Renders prepared data and reports intent through the handlers object; no
// scheduling or chess logic lives here.

import { escapeHtml } from "../../html-utils.js";
import { TUTOR } from "./openings.js";
import { openingSummary, lineStatus, nextNewLine } from "./session.js";
import { formatWait } from "./scheduler.js";

const HELP_LABELS = {
  explain: "Explanations",
  hints: "Hint button",
  arrows: "Opponent arrows",
  mistakeDetail: "Mistake details",
};

const STATUS_BADGE = {
  new: '<span class="ct-badge ct-new">New</span>',
  due: '<span class="ct-badge ct-due">Due</span>',
  learning: '<span class="ct-badge">Learning</span>',
  mastered: '<span class="ct-badge ct-mastered">Mastered</span>',
};

function progressBar(summary) {
  const pct = (n) => (summary.total ? (100 * n) / summary.total : 0);
  return `<div class="ct-bar" aria-hidden="true"><span class="ct-b-master" style="width:${pct(summary.mastered)}%"></span><span class="ct-b-learn" style="width:${pct(summary.learning)}%"></span></div>`;
}

function helpsHtml(helps) {
  return `<div class="ct-helps" role="group" aria-label="Optional helps">${Object.entries(HELP_LABELS)
    .map(([key, label]) => `<button type="button" class="ct-chip" data-help="${key}" aria-pressed="${helps[key] ? "true" : "false"}">${label}</button>`)
    .join("")}</div>`;
}

function wireHelps(host, handlers) {
  host.querySelectorAll("[data-help]").forEach((button) => {
    button.addEventListener("click", () => handlers.toggleHelp(button.dataset.help));
  });
}

export function renderHome(host, { course, progress, dueCount, streakDays, now }, handlers) {
  const summaries = new Map(course.map((o) => [o.id, openingSummary(o, progress.cards, now)]));
  const nextAny = Math.min(...[...summaries.values()].map((s) => s.nextDue));
  const studied = [...summaries.values()].some((s) => s.fresh < s.total);
  const reviewLabel = dueCount
    ? `Review due lines (${dueCount})`
    : studied ? `Nothing due · next in ${formatWait(nextAny - now)}` : "Learn a line first";
  const card = (o) => {
    const s = summaries.get(o.id);
    const badge = s.linesDue ? `<span class="ct-badge ct-due">${s.linesDue} due</span>`
      : s.linesNew === o.lines.length ? '<span class="ct-badge ct-new">New</span>'
      : s.linesMastered === o.lines.length ? '<span class="ct-badge ct-mastered">Mastered</span>'
      : `<span class="ct-badge">${o.lines.length - s.linesNew}/${o.lines.length} lines</span>`;
    return `<button type="button" class="ct-card ct-opening" data-opening="${escapeHtml(o.id)}">
      <div class="ct-opening-head"><h3>${escapeHtml(o.name)}</h3>${badge}</div>
      <div class="ct-muted">${escapeHtml(o.eco)} · ${escapeHtml(o.level)} · ${o.lines.length} lines</div>
      <div>${escapeHtml(o.blurb)}</div>
      ${progressBar(s)}
    </button>`;
  };
  const group = (side, title) => `<p class="ct-group-title">${title}</p>
    <div class="ct-openings">${course.filter((o) => o.side === side).map(card).join("")}</div>`;
  host.innerHTML = `
    <div class="ct-card ct-today">
      <div class="ct-muted">${escapeHtml(TUTOR.tagline)}</div>
      <div class="ct-today-stats">
        <span><b>${dueCount}</b> lines due</span>
        <span><b>${streakDays}</b> day streak</span>
        <span><b>${progress.stats.perfect}</b> perfect drills</span>
      </div>
      <button type="button" class="ct-btn" data-action="review" ${dueCount ? "" : "disabled"}>${escapeHtml(reviewLabel)}</button>
      ${helpsHtml(progress.helps)}
    </div>
    ${group("w", "Play as White")}
    ${group("b", "Play as Black")}
    <p class="ct-credits">${escapeHtml(TUTOR.credits)}</p>`;
  host.querySelector('[data-action="review"]').addEventListener("click", handlers.reviewAll);
  host.querySelectorAll("[data-opening]").forEach((button) => {
    button.addEventListener("click", () => handlers.openOpening(button.dataset.opening));
  });
  wireHelps(host, handlers);
}

export function renderOpening(host, { opening, progress, dueLineIds, now }, handlers) {
  const s = openingSummary(opening, progress.cards, now);
  const nextLine = nextNewLine(opening, progress.cards, now);
  const studied = s.fresh < s.total;
  host.innerHTML = `
    <div class="ct-card">
      <div class="ct-title"><h3>${escapeHtml(opening.name)}</h3><span class="ct-muted">${escapeHtml(opening.eco)} · you play ${opening.side === "w" ? "White" : "Black"}</span></div>
      <div>${escapeHtml(opening.blurb)}</div>
      <ul class="ct-ideas">${opening.ideas.map((idea) => `<li>${escapeHtml(idea)}</li>`).join("")}</ul>
      ${progressBar(s)}
      <div class="ct-muted" style="margin-top:6px">${s.mastered} of ${s.total} positions mastered · ${s.learning} learning · ${s.fresh} new</div>
    </div>
    <div class="ct-row">
      <button type="button" class="ct-btn" data-action="learn" ${nextLine ? "" : "disabled"}>${nextLine ? `Learn: ${escapeHtml(nextLine.name)}` : "All lines learned"}</button>
      <button type="button" class="ct-btn ct-secondary" data-action="review" ${dueLineIds.length ? "" : "disabled"}>Review due (${dueLineIds.length})</button>
      <button type="button" class="ct-btn ct-secondary" data-action="spar" ${studied ? "" : "disabled"} title="The defender picks book replies and deviations at random, favouring your weak lines">Spar the defender</button>
    </div>
    <p class="ct-group-title">Lines</p>
    <div class="ct-lines">${opening.lines.map((line) => {
      const status = lineStatus(opening, line, progress.cards, now);
      const kind = line.kind === "trap" ? " · trap" : line.kind === "sideline" ? " · sideline" : "";
      return `<button type="button" class="ct-line" data-line="${escapeHtml(line.id)}" data-status="${status}">
        <span>${escapeHtml(line.name)}<small>${line.plies.length} moves${kind}</small></span>${STATUS_BADGE[status]}
      </button>`;
    }).join("")}</div>
    <p class="ct-muted">Tap a new line to learn it, or a learned line to drill it from memory.</p>
    <div class="ct-row"><button type="button" class="ct-btn ct-secondary" data-action="home">All openings</button></div>`;
  host.querySelector('[data-action="learn"]').addEventListener("click", () => nextLine && handlers.learn(opening.id, nextLine.id));
  host.querySelector('[data-action="review"]').addEventListener("click", () => handlers.reviewOpening(opening.id));
  host.querySelector('[data-action="spar"]').addEventListener("click", () => handlers.spar(opening.id));
  host.querySelector('[data-action="home"]').addEventListener("click", handlers.home);
  host.querySelectorAll("[data-line]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.status === "new") handlers.learn(opening.id, button.dataset.line);
      else handlers.drillLine(opening.id, button.dataset.line);
    });
  });
}
