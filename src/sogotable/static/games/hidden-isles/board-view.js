// Hidden Isles — the 5×5 sea chart as HTML (pure string builder over the view
// model that render.js prepares). No rule logic: which keys are visible comes
// from the server projection (Navigators and finished games see the chart;
// everyone sees revealed cards), and whether a card can be picked is a flag
// render.js derives from phase/role/turn only. Every word from branding.js.
import { cardArt } from "./art.js";
import { UI, tileEmoji } from "./branding.js";

const FLIP_MS = 700;
const WIGGLE_MS = 2500;

function dotsHtml(marks, vm) {
  if (!marks.length) return "";
  const shown = marks.slice(0, 4).map((m) => `<span class="hi-dot" style="background:${vm.colorOf(m)}"></span>`).join("");
  return `<span class="hi-dots" aria-hidden="true">${shown}</span>`;
}

function cardHtml(card, vm) {
  const { esc } = vm;
  const index = Number(card.index);
  const word = String(card.word || "");
  const key = card.key || null;
  const revealed = Boolean(card.revealed);
  const marks = !revealed && vm.marks && Array.isArray(vm.marks[index]) ? vm.marks[index] : [];
  const classes = ["hi-card"];
  const labels = [];
  let inner = "";
  if (revealed && key) {
    classes.push("hi-revealed", `hi-key-${key}`);
    inner += `<span class="hi-art">${cardArt(key)}</span>`;
    labels.push(UI.cardRevealed(word, key));
  } else if (key) {
    classes.push(`hi-chart-${key}`);
    if (vm.complete) classes.push("hi-unfound");
    inner += `<span class="hi-key-icon" aria-hidden="true">${tileEmoji(key)}</span>`;
    labels.push(UI.cardChart(word, key));
  } else {
    labels.push(UI.cardUnrevealed(word));
  }
  inner += `<span class="hi-word" style="--len:${Math.max(5, word.length)}">${esc(word)}</span>`;
  inner += dotsHtml(marks, vm);
  if (marks.length) labels.push(UI.cardMarked(marks.map(vm.nameOf)));
  const pickable = vm.canGuess && !revealed;
  if (pickable) classes.push("hi-can-pick");
  const selected = pickable && vm.selected === index;
  if (selected) { classes.push("hi-selected"); labels.push(UI.cardSelected); }
  if (!revealed && vm.ideaTargets && vm.ideaTargets.includes(index)) classes.push("hi-idea");
  let style = "";
  const flipAge = vm.flips[index];
  if (flipAge !== undefined) {
    const kraken = key === "trap";
    if (flipAge < (kraken ? WIGGLE_MS : FLIP_MS)) {
      classes.push(kraken ? "hi-wiggle" : "hi-flip");
      style = ` style="animation-delay:-${Math.round(flipAge)}ms${kraken ? `,${Math.round(600 - flipAge)}ms` : ""}"`;
    }
  }
  return `<button type="button" class="${classes.join(" ")}" data-hi-card="${index}" data-hi-focus="card-${index}"${style}
      aria-label="${esc(labels.join(", "))}"${pickable ? ` aria-pressed="${selected}"` : ` aria-disabled="true"`}>${inner}</button>`;
}

export function gridHtml(vm) {
  const board = Array.isArray(vm.board) ? vm.board : [];
  return board.map((card, i) => cardHtml({ index: i, ...card }, vm)).join("");
}
