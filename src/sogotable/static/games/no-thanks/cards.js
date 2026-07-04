// No Thanks! card visuals — the platform's first playing-card primitives and
// the pilot for the card look/tap/drag work. Pure HTML builders: no DOM
// queries, no listeners, no rules (run math here is DISPLAY grouping only —
// legality and scoring stay in the worker rules module). render.js composes
// these; styles.js owns their look. If a second card game ever needs them,
// extract to a shared games/ helper (new owner row) — never import game-to-game.

// Display grouping: consecutive cards fan together as one run.
export function groupNoThanksRuns(cards) {
  const sorted = (Array.isArray(cards) ? cards : []).slice().sort((a, b) => a - b);
  const runs = [];
  sorted.forEach((card) => {
    const run = runs[runs.length - 1];
    if (run && card === run[run.length - 1] + 1) run.push(card);
    else runs.push([card]);
  });
  return runs;
}

// Danger tier drives the card's color wash so the table reads at a glance.
function cardTier(value) {
  if (value >= 25) return "high";
  if (value >= 14) return "mid";
  return "low";
}

// One card face: corner indices + a big center value, tinted by danger tier.
// opts.size: "big" (the face-up table card) | "hand" (your cards) | "mini"
// (other players' cards). opts.flip replays the deal-in animation.
// opts.zIndex stacks overlapping run cards (flex items honor z-index).
export function noThanksCardHtml(value, opts = {}) {
  const size = opts.size || "hand";
  const classes = ["nt-card", `nt-card-${size}`, `nt-tier-${cardTier(value)}`];
  if (opts.flip) classes.push("nt-flip-in");
  if (opts.extraClass) classes.push(opts.extraClass);
  return `<span class="${classes.join(" ")}"${Number.isInteger(opts.zIndex) ? ` style="z-index:${opts.zIndex}"` : ""} role="img" aria-label="card ${value}">
    <span class="nt-corner nt-corner-tl">${value}</span>
    <span class="nt-value">${value}</span>
    <span class="nt-corner nt-corner-br">${value}</span>
  </span>`;
}

// A player's cards as fanned runs. The LOWEST card of a run is the group's
// score (the rest count nothing), so it sits ON TOP of the stack, fully
// visible, with the higher cards tucked behind it — descending z-index,
// since DOM paint order alone would bury the card that matters.
export function noThanksRunsHtml(cards, opts = {}) {
  const size = opts.size || "hand";
  const runs = groupNoThanksRuns(cards);
  if (!runs.length) return `<span class="nt-no-cards">no cards</span>`;
  return runs.map((run) => `<span class="nt-run">${run.map((card, index) =>
    noThanksCardHtml(card, { size, extraClass: index === 0 ? "nt-run-head" : "nt-run-tail", zIndex: run.length - index })).join("")}</span>`).join("");
}

// A chip stack: token glyphs for small stacks, token + count beyond that.
// Pass null/undefined for a hidden (opponent) stack.
export function noThanksChipsHtml(count, opts = {}) {
  if (count === null || count === undefined) {
    return `<span class="nt-chips nt-chips-hidden" aria-label="chips hidden">\u{1FA99} ?</span>`;
  }
  const value = Number(count) || 0;
  const label = opts.label || "chips";
  return `<span class="nt-chips" aria-label="${value} ${label}">\u{1FA99} ${value}</span>`;
}
