// Chinese Checkers pre-game lobby — the shared host-start template plus the
// host's options picker (PLAN.md `cc_options`), grouped into three sections:
//   Mode  — play mode cards (rounds / blitz / live / turns) + the mode's clock
//   Rules — jumps, chains, marbles, capture, teams, goal rules, passing, end
//           (collapsible; the summary says how many differ from classic)
//   Helps — move hints (assists)
//
// Host selections live in a module store keyed by room+epoch (the Hearts /
// WNYK / Realmwright precedent): every room snapshot repaints the lobby DOM, so
// the DOM is never the source of truth. A click updates the store and repaints
// the lobby from it; getStartArg reads the store. The server clamps every
// value; this file only offers the documented choices.
import { renderHostStartLobby } from "../lobby.js";
import { playClick } from "../../sound.js";
import { LOBBY } from "./branding.js";

export const CC_DEFAULTS = {
  mode: "rounds", timer: 0,
  jumps: "standard", chains: true, marbles: 10, capture: "off", teams: false,
  stay_in_goal: true, no_parking: false, anti_block: true, allow_pass: true, end: "first",
  assists: "full",
};

const MODES = ["rounds", "blitz", "live", "turns"];
const TIMERS = { rounds: [0, 30, 60, 90], blitz: [5, 10, 15, 20, 30], live: [15, 30, 45, 60, 90], turns: [0, 30, 60, 90] };
const TIMER_DEFAULT = { rounds: 0, blitz: 10, live: 30, turns: 0 };

const V = LOBBY.values;
const CHOICES = {
  jumps: [["standard", V.standard], ["long", V.long]],
  chains: [[true, V.on], [false, V.off]],
  marbles: [[6, "6"], [10, "10"], [15, "15"]],
  capture: [["off", V.off], ["send_home", V.send_home]],
  teams: [[false, V.off], [true, V.on]],
  stay_in_goal: [[true, V.on], [false, V.off]],
  no_parking: [[false, V.off], [true, V.on]],
  anti_block: [[true, V.on], [false, V.off]],
  allow_pass: [[true, V.allowed], [false, V.only_stuck]],
  end: [["first", V.first], ["all", V.all]],
  assists: [["full", V.full], ["moves", V.moves], ["off", V.off]],
};
const RULES = ["jumps", "chains", "marbles", "capture", "teams", "stay_in_goal", "no_parking", "anti_block", "allow_pass", "end"];
const HELPS = ["assists"];

let lobbyKey = "";
let lobbyStore = null;
let rulesOpen = false; // view-only (not sent)
export function ccLobbyOptions(ctx) {
  const key = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}`;
  if (lobbyKey !== key) {
    lobbyKey = key;
    lobbyStore = { ...CC_DEFAULTS };
    rulesOpen = false;
  }
  return lobbyStore;
}

function parseValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

function segButtons(name, choices, current, esc, disabled = () => false) {
  return choices.map(([value, label]) => {
    const on = String(current) === String(value);
    const off = disabled(value);
    return `<button type="button" data-v="${esc(String(value))}" class="${on ? "cc-on" : ""}" aria-pressed="${on}"${off ? " disabled" : ""}>${esc(label)}</button>`;
  }).join("");
}

function segment(name, stored, esc, opts = {}) {
  const meta = LOBBY.options[name];
  const choices = opts.choices || CHOICES[name];
  return `<div class="cc-opt">
      <div class="cc-opt-label"><b>${esc(meta.label)}</b><span>${esc(opts.hint || meta.hint)}</span></div>
      <div class="cc-seg" data-cc-opt="${name}">${segButtons(name, choices, stored[name], esc, opts.disabled)}</div>
    </div>`;
}

function modeHtml(stored, esc) {
  const cards = MODES.map((mode) => {
    const on = stored.mode === mode;
    const meta = LOBBY.modes[mode];
    const secs = on ? stored.timer : TIMER_DEFAULT[mode];
    return `<button type="button" class="cc-mode${on ? " cc-on" : ""}" data-cc-mode="${mode}" aria-pressed="${on}">
        <b>${esc(meta.label)}</b><span>${esc(meta.desc(secs))}</span>
      </button>`;
  }).join("");
  const timer = segment("timer", stored, esc, {
    choices: TIMERS[stored.mode].map((s) => [s, V.secs(s)]),
    hint: LOBBY.timerHint[stored.mode],
  });
  return `<div class="cc-modes" role="group">${cards}</div>${timer}`;
}

function changedRules(stored) {
  return RULES.filter((name) => String(stored[name]) !== String(CC_DEFAULTS[name])).length;
}

function section(title, body, extra = "") {
  return `<section class="cc-osec"${extra}><h4 class="cc-osec-title">${title}</h4>${body}</section>`;
}

function optionsHtml(seats, stored, esc) {
  const seatWarn = seats === 5 || seats === 1;
  const teamWarn = stored.teams && seats !== 4 && seats !== 6;
  const no15 = seats !== 2;
  const rules = RULES.map((name) => segment(name, stored, esc, name === "marbles"
    ? { disabled: (v) => v === 15 && no15 } : {})).join("");
  const changed = changedRules(stored);
  const summary = `${esc(LOBBY.sections.rules)} <span class="cc-osec-note">${esc(changed ? LOBBY.rulesChanged(changed) : LOBBY.rulesClassic)}</span>`;
  return `<div class="cc-options">
      ${section(esc(LOBBY.sections.mode), modeHtml(stored, esc))}
      <details class="cc-osec cc-osec-rules"${rulesOpen ? " open" : ""}>
        <summary class="cc-osec-title">${summary}</summary>
        ${rules}
        <p class="cc-opt-hint" data-cc-hint="marbles15"${no15 ? "" : " hidden"}>🔵 ${esc(LOBBY.marbles15Hint)}</p>
      </details>
      ${section(esc(LOBBY.sections.helps), HELPS.map((name) => segment(name, stored, esc)).join(""))}
      <p class="cc-opt-hint${seatWarn ? " cc-warn" : ""}" data-cc-hint="seats">💡 ${esc(LOBBY.seatHint)}</p>
      <p class="cc-opt-hint cc-warn" data-cc-hint="teams"${teamWarn ? "" : " hidden"}>👥 ${esc(LOBBY.teamsHint)}</p>
    </div>`;
}

export function renderChineseCheckersLobby(host, ctx) {
  const esc = ctx.escapeHtml || ((s) => String(s));
  const stored = ccLobbyOptions(ctx);
  const seats = Array.isArray(ctx.room && ctx.room.players) ? ctx.room.players.length : 0;
  if (seats !== 2 && stored.marbles === 15) stored.marbles = 10; // 15 is 2-player only (server clamps too)
  renderHostStartLobby(host, ctx, {
    wrap: "chinese-checkers-root cc-lobby",
    heading: LOBBY.heading,
    blurb: LOBBY.blurb,
    extraHtml: optionsHtml(seats, stored, esc),
    getStartArg: () => ({ cc_options: { ...ccLobbyOptions(ctx) } }),
    onMount: (lobbyHost) => {
      const options = ccLobbyOptions(ctx);
      const rerender = () => { playClick(); renderChineseCheckersLobby(host, ctx); };
      lobbyHost.querySelectorAll("[data-cc-mode]").forEach((button) => {
        button.addEventListener("click", () => {
          const mode = button.getAttribute("data-cc-mode");
          if (options.mode === mode) return;
          options.mode = mode;
          options.timer = TIMER_DEFAULT[mode]; // each mode starts on its own default clock
          rerender();
        });
      });
      lobbyHost.querySelectorAll("[data-cc-opt] button").forEach((button) => {
        button.addEventListener("click", () => {
          if (button.disabled) return;
          options[button.parentElement.getAttribute("data-cc-opt")] = parseValue(button.getAttribute("data-v"));
          rerender();
        });
      });
      const rules = lobbyHost.querySelector(".cc-osec-rules");
      if (rules) rules.addEventListener("toggle", () => { rulesOpen = rules.open; });
    },
  });
}
