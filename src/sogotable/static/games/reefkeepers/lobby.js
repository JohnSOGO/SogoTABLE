// Reefkeepers pre-game lobby — the shared host-start template plus the host's
// options picker: rule options (reef size, bonuses) and clearly-labelled
// optional helps (show spots, live scores, hints).
//
// Host selections live in a module store keyed by room+epoch (the Hearts /
// WNYK / Realmwright precedent): every room snapshot repaints the lobby DOM,
// so the DOM is never the source of truth. getStartArg reads the store.
import { renderHostStartLobby } from "../lobby.js";
import { playClick } from "../../sound.js";
import { LOBBY } from "./branding.js";

export const REEF_DEFAULTS = { size: 5, heart_bonus: true, full_bonus: true, show_spots: true, live_score: true, hints: false };

let lobbyKey = "";
let lobbyStore = null;
export function reefLobbyOptions(ctx) {
  const key = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}`;
  if (lobbyKey !== key) {
    lobbyKey = key;
    lobbyStore = { ...REEF_DEFAULTS };
  }
  return lobbyStore;
}

function parseValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

function segment(name, choices, stored, esc) {
  const meta = LOBBY.options[name];
  const buttons = choices.map(([value, label]) => {
    const on = String(stored[name]) === String(value);
    return `<button type="button" data-v="${esc(String(value))}" class="${on ? "rk-on" : ""}" aria-pressed="${on}">${esc(label)}</button>`;
  }).join("");
  return `<div class="rk-opt">
      <div class="rk-opt-label"><b>${esc(meta.label)}</b><span>${esc(meta.hint)}</span></div>
      <div class="rk-seg" data-rk-opt="${name}">${buttons}</div>
    </div>`;
}

const onOff = (on, off) => [[true, on], [false, off]];

export function renderReefkeepersLobby(host, ctx) {
  const esc = ctx.escapeHtml || ((x) => String(x));
  const stored = reefLobbyOptions(ctx);
  const toggle = (name) => segment(name, onOff(LOBBY.on, LOBBY.off), stored, esc);
  renderHostStartLobby(host, ctx, {
    wrap: "reefkeepers-root rk-lobby",
    heading: LOBBY.heading,
    blurb: LOBBY.blurb,
    extraHtml: `<div class="rk-options">
        <div class="rk-opt-group">${esc(LOBBY.rulesHeading)}</div>
        ${segment("size", [[5, LOBBY.sizeNames[5]], [7, LOBBY.sizeNames[7]]], stored, esc)}
        ${toggle("heart_bonus")}
        ${toggle("full_bonus")}
        <div class="rk-opt-group">${esc(LOBBY.helpsHeading)} <span>${esc(LOBBY.helpsNote)}</span></div>
        ${toggle("show_spots")}
        ${toggle("live_score")}
        ${toggle("hints")}
      </div>`,
    getStartArg: () => ({ reef_options: { ...reefLobbyOptions(ctx) } }),
    onMount: (lobbyHost) => {
      lobbyHost.querySelectorAll("[data-rk-opt] button").forEach((button) => {
        button.addEventListener("click", () => {
          const seg = button.parentElement;
          const name = seg.getAttribute("data-rk-opt");
          reefLobbyOptions(ctx)[name] = parseValue(button.getAttribute("data-v"));
          seg.querySelectorAll("button").forEach((other) => {
            const on = other === button;
            other.classList.toggle("rk-on", on);
            other.setAttribute("aria-pressed", String(on));
          });
          playClick();
        });
      });
    },
  });
}
