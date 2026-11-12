// Tradewind Isles pre-game lobby — the shared host-start template plus the
// host's options picker (renown target, hand limit, island size, quick setup,
// friendly monkey, and the three help toggles).
//
// Host selections live in a module store keyed by room+epoch (the Hearts /
// WNYK / Realmwright precedent): every room snapshot repaints the lobby DOM, so
// the DOM is never the source of truth. getStartArg reads the store.
import { renderHostStartLobby } from "../lobby.js";
import { playClick } from "../../sound.js";
import { HELP, LOBBY, UI } from "./branding.js";

export const TI_DEFAULTS = {
  target: 10, hand_limit: 7, board: "auto", quick_setup: false, friendly_monkey: false,
  show_spots: true, show_pips: true, show_afford: true,
};

let lobbyKey = "";
let lobbyStore = null;
export function tiLobbyOptions(ctx) {
  const key = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}`;
  if (lobbyKey !== key) {
    lobbyKey = key;
    lobbyStore = { ...TI_DEFAULTS };
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
    return `<button type="button" data-v="${esc(String(value))}" class="${on ? "tw-on" : ""}" aria-pressed="${on}">${esc(label)}</button>`;
  }).join("");
  return `<div class="tw-opt">
      <div class="tw-opt-label"><b>${esc(meta.label)}</b><span>${esc(meta.hint)}</span></div>
      <div class="tw-seg" data-tw-opt="${name}">${buttons}</div>
    </div>`;
}

const onOff = [[true, LOBBY.on], [false, LOBBY.off]];

export function renderTradewindsLobby(host, ctx) {
  const esc = ctx.escapeHtml || ((s) => String(s));
  const stored = tiLobbyOptions(ctx);
  const help = `<details class="tw-lobby-help"><summary>${esc(UI.help)}</summary><ul>${HELP.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></details>`;
  renderHostStartLobby(host, ctx, {
    wrap: "tradewinds-root tw-lobby",
    heading: LOBBY.heading,
    blurb: LOBBY.blurb,
    extraHtml: `<div class="tw-options">
        ${segment("target", [8, 10, 12, 14].map((n) => [n, String(n)]), stored, esc)}
        ${segment("hand_limit", [7, 9, 11].map((n) => [n, String(n)]), stored, esc)}
        ${segment("board", ["auto", "small", "large"].map((k) => [k, LOBBY.boardNames[k]]), stored, esc)}
        ${segment("quick_setup", [[false, LOBBY.off], [true, LOBBY.on]], stored, esc)}
        ${segment("friendly_monkey", [[false, LOBBY.off], [true, LOBBY.on]], stored, esc)}
        ${segment("show_spots", onOff, stored, esc)}
        ${segment("show_pips", onOff, stored, esc)}
        ${segment("show_afford", onOff, stored, esc)}
      </div>${help}`,
    getStartArg: () => ({ ti_options: { ...tiLobbyOptions(ctx) } }),
    onMount: (lobbyHost) => {
      lobbyHost.querySelectorAll("[data-tw-opt] button").forEach((button) => {
        button.addEventListener("click", () => {
          const seg = button.parentElement;
          const name = seg.getAttribute("data-tw-opt");
          tiLobbyOptions(ctx)[name] = parseValue(button.getAttribute("data-v"));
          seg.querySelectorAll("button").forEach((other) => {
            const on = other === button;
            other.classList.toggle("tw-on", on);
            other.setAttribute("aria-pressed", String(on));
          });
          playClick();
        });
      });
    },
  });
  // Non-hosts see the rules too (the shared template shows options only to the host).
  if (!ctx.isHost) {
    const wrap = host.querySelector(".tradewinds-root");
    if (wrap) wrap.insertAdjacentHTML("beforeend", help);
  }
}
