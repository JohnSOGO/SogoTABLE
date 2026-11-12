// Chess Tutor — orchestration: which screen is showing, the study queue, and
// saving progress. Wired by the shell with one call; renders lazily whenever
// the #chessTutor screen becomes active (launch button or update-resume).

import { buildCourse } from "./course.js";
import { OPENINGS, TUTOR } from "./openings.js";
import { CHESS_TUTOR_CSS } from "./styles.js";
import { renderHome, renderOpening } from "./render.js";
import { mountDrill } from "./drill-view.js";
import { dueLines, nextNewLine, weaknessFor } from "./session.js";
import { formatWait, nextDue } from "./scheduler.js";
import { lineCardKeys } from "./session.js";
import { loadProgress, saveProgress, recordDrill, streak } from "./progress.js";

let shell = null;
let course = null;
let progress = null;
let playerId = "";
let view = { name: "home" };
let queue = [];
let activeDrill = null;

function mountEl() {
  return document.querySelector("#chessTutor .ct-mount");
}

function ensureSetup() {
  if (!course) {
    const built = buildCourse(OPENINGS);
    if (built.errors.length) console.error("[chess-tutor] course errors", built.errors);
    course = built.openings;
  }
  if (!document.getElementById("chessTutorStyles")) {
    const style = document.createElement("style");
    style.id = "chessTutorStyles";
    style.textContent = CHESS_TUTOR_CSS;
    document.head.appendChild(style);
  }
  const player = shell && shell.deviceSelectedPlayer ? shell.deviceSelectedPlayer() : null;
  const id = player && player.id ? player.id : "guest";
  if (!progress || id !== playerId) {
    playerId = id;
    progress = loadProgress(playerId);
  }
}

const openingById = (id) => course.find((o) => o.id === id);

function persist() {
  saveProgress(playerId, progress);
}

function stopActiveDrill(record) {
  if (!activeDrill) return;
  const { handle, opening } = activeDrill;
  const drill = handle.current();
  activeDrill = null;
  handle.dispose();
  if (record && Object.keys(drill.grades).length) {
    progress = recordDrill(progress, drill, Date.now(), { completed: false });
    persist();
  }
  return opening;
}

function render() {
  const host = mountEl();
  if (!host) return;
  ensureSetup();
  const now = Date.now();
  const title = document.getElementById("chessTutorTitle");
  if (title) title.textContent = `${TUTOR.icon} ${TUTOR.name}`;
  if (view.name === "drill") return renderDrill(host);
  if (view.name === "opening") {
    const opening = openingById(view.openingId);
    if (opening) {
      const dueLineIds = dueLines([opening], progress.cards, now).map((d) => d.lineId);
      renderOpening(host, { opening, progress, dueLineIds, now }, handlers);
      return;
    }
    view = { name: "home" };
  }
  renderHome(host, {
    course, progress, now,
    dueCount: dueLines(course, progress.cards, now).length,
    streakDays: streak(progress, now),
  }, handlers);
}

function startQueue(items, returnTo) {
  queue = items.slice();
  view = { name: "drill", returnTo };
  render();
}

function renderDrill(host) {
  const item = queue[0];
  if (!item) {
    view = view.returnTo || { name: "home" };
    render();
    return;
  }
  const opening = openingById(item.openingId);
  const handle = mountDrill(host, {
    opening,
    item,
    helps: progress.helps,
    weakness: weaknessFor(opening, progress.cards, Date.now()),
    queueLeft: queue.length - 1,
    onFinish: (drill) => finishItem(item, drill),
    onExit: () => {
      const drill = handle.current();
      activeDrill = null;
      if (Object.keys(drill.grades).length) {
        progress = recordDrill(progress, drill, Date.now(), { completed: false });
        persist();
      }
      queue = [];
      view = view.returnTo || { name: "home" };
      render();
    },
    onNext: () => {
      activeDrill = null;
      queue.shift();
      render();
    },
  });
  activeDrill = { handle, opening };
}

// Records the drill, queues follow-ups, and tells the view what "Next" does.
function finishItem(item, drill) {
  const now = Date.now();
  progress = recordDrill(progress, drill, now);
  persist();
  let requeued = false;
  if (item.mode === "learn") {
    queue.splice(1, 0, { ...item, mode: "quiz" });
  } else if (drill.mistakes && item.mode !== "spar" && !item.retry) {
    queue.push({ ...item, mode: "review", retry: true });
    requeued = true;
  }
  if (item.mode === "spar" && queue.length === 1) queue.push({ ...item });
  const more = queue.length > 1;
  let nextText = "";
  if (item.lineId) {
    const opening = openingById(item.openingId);
    const line = opening.lines.find((l) => l.id === item.lineId);
    const wait = nextDue(lineCardKeys(opening, line), progress.cards) - now;
    nextText = wait > 0 ? `Next review in ${formatWait(wait)}.` : "";
  }
  const nextLabel = item.mode === "learn" ? "Play it from memory"
    : item.mode === "spar" ? "Spar again"
    : more ? "Next line" : "Done";
  return { requeued, nextText, nextLabel };
}

const handlers = {
  home() { view = { name: "home" }; render(); },
  openOpening(openingId) { view = { name: "opening", openingId }; render(); },
  toggleHelp(key) {
    progress = { ...progress, helps: { ...progress.helps, [key]: !progress.helps[key] } };
    persist();
    render();
  },
  reviewAll() {
    const items = dueLines(course, progress.cards, Date.now()).map((d) => ({ ...d, mode: "review" }));
    if (items.length) startQueue(items, { name: "home" });
  },
  reviewOpening(openingId) {
    const opening = openingById(openingId);
    const items = dueLines([opening], progress.cards, Date.now()).map((d) => ({ ...d, mode: "review" }));
    if (items.length) startQueue(items, { name: "opening", openingId });
  },
  learn(openingId, lineId) {
    const opening = openingById(openingId);
    const line = lineId || (nextNewLine(opening, progress.cards, Date.now()) || {}).id;
    if (line) startQueue([{ openingId, lineId: line, mode: "learn" }], { name: "opening", openingId });
  },
  drillLine(openingId, lineId) {
    startQueue([{ openingId, lineId, mode: "review" }], { name: "opening", openingId });
  },
  spar(openingId) {
    startQueue([{ openingId, lineId: null, mode: "spar" }], { name: "opening", openingId });
  },
};

export function wireChessTutor(shellCtx) {
  shell = shellCtx || {};
  const section = document.getElementById("chessTutor");
  if (!section || typeof MutationObserver === "undefined") return;
  let wasActive = false;
  new MutationObserver(() => {
    const active = section.classList.contains("active");
    if (active === wasActive) return;
    wasActive = active;
    if (active) {
      render();
    } else {
      // Leaving the screen mid-drill keeps the grades earned so far.
      stopActiveDrill(true);
      queue = [];
      if (view.name === "drill") view = view.returnTo || { name: "home" };
    }
  }).observe(section, { attributes: true, attributeFilter: ["class"] });
}
