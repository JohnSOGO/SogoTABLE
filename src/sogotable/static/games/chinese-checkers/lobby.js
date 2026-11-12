// Chinese Checkers pre-game lobby — the shared host-start template plus the
// host's options picker (PLAN.md `cc_options`: jumps, marbles, capture, teams,
// stay_in_goal, no_parking, anti_block, end).
//
// Host selections live in a module store keyed by room+epoch (the Hearts /
// WNYK / Realmwright precedent): every room snapshot repaints the lobby DOM, so
// the DOM is never the source of truth. getStartArg reads the store. The server
// clamps every value; this file only offers the documented choices.
import { renderHostStartLobby } from "../lobby.js";
import { playClick } from "../../sound.js";
import { LOBBY } from "./branding.js";

export const CC_DEFAULTS = {
  jumps: "standard", marbles: 10, capture: "off", teams: false,
  stay_in_goal: true, no_parking: false, anti_block: true, end: "first",
};

const V = LOBBY.values;
const CHOICES = {
  jumps: [["standard", V.standard], ["long", V.long]],
  marbles: [[10, "10"], [6, "6"]],
  capture: [["off", V.off], ["send_home", V.send_home]],
  teams: [[false, V.off], [true, V.on]],
  stay_in_goal: [[true, V.on], [false, V.off]],
  no_parking: [[false, V.off], [true, V.on]],
  anti_block: [[true, V.on], [false, V.off]],
  end: [["first", V.first], ["all", V.all]],
};

let lobbyKey = "";
let lobbyStore = null;
export function ccLobbyOptions(ctx) {
  const key = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}`;
  if (lobbyKey !== key) {
    lobbyKey = key;
    lobbyStore = { ...CC_DEFAULTS };
  }
  return lobbyStore;
}

function parseValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

function segment(name, stored, esc) {
  const meta = LOBBY.options[name];
  const buttons = CHOICES[name].map(([value, label]) => {
    const on = String(stored[name]) === String(value);
    return `<button type="button" data-v="${esc(String(value))}" class="${on ? "cc-on" : ""}" aria-pressed="${on}">${esc(label)}</button>`;
  }).join("");
  return `<div class="cc-opt">
      <div class="cc-opt-label"><b>${esc(meta.label)}</b><span>${esc(meta.hint)}</span></div>
      <div class="cc-seg" data-cc-opt="${name}">${buttons}</div>
    </div>`;
}

function hintsHtml(seats, stored, esc) {
  const seatWarn = seats === 5 || seats === 1;
  const teamWarn = stored.teams && seats !== 4 && seats !== 6;
  return `<p class="cc-opt-hint${seatWarn ? " cc-warn" : ""}" data-cc-hint="seats">💡 ${esc(LOBBY.seatHint)}</p>
    <p class="cc-opt-hint cc-warn" data-cc-hint="teams"${teamWarn ? "" : " hidden"}>👥 ${esc(LOBBY.teamsHint)}</p>`;
}

export function renderChineseCheckersLobby(host, ctx) {
  const esc = ctx.escapeHtml || ((s) => String(s));
  const stored = ccLobbyOptions(ctx);
  const seats = Array.isArray(ctx.room && ctx.room.players) ? ctx.room.players.length : 0;
  renderHostStartLobby(host, ctx, {
    wrap: "chinese-checkers-root cc-lobby",
    heading: LOBBY.heading,
    blurb: LOBBY.blurb,
    extraHtml: `<div class="cc-options">
        ${Object.keys(CHOICES).map((name) => segment(name, stored, esc)).join("")}
        ${hintsHtml(seats, stored, esc)}
      </div>`,
    getStartArg: () => ({ cc_options: { ...ccLobbyOptions(ctx) } }),
    onMount: (lobbyHost) => {
      lobbyHost.querySelectorAll("[data-cc-opt] button").forEach((button) => {
        button.addEventListener("click", () => {
          const seg = button.parentElement;
          const name = seg.getAttribute("data-cc-opt");
          const options = ccLobbyOptions(ctx);
          options[name] = parseValue(button.getAttribute("data-v"));
          seg.querySelectorAll("button").forEach((other) => {
            const on = other === button;
            other.classList.toggle("cc-on", on);
            other.setAttribute("aria-pressed", String(on));
          });
          playClick();
          const teamHint = lobbyHost.querySelector('[data-cc-hint="teams"]');
          if (teamHint) teamHint.hidden = !(options.teams && seats !== 4 && seats !== 6);
        });
      });
    },
  });
}
