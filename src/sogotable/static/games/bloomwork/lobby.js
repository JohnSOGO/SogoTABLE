// Bloomwork pre-game lobby — the shared host-start template plus the host's
// options: game length and helps.
//
// Host selections live in a module store keyed by room+epoch (the Last
// Orders / Hearts precedent): every room snapshot repaints the lobby DOM, so
// the DOM is never the source of truth. getStartArg reads the store and
// sends `{ bloom_options }`; the server clamps every value.
import { renderHostStartLobby } from "../lobby.js";
import { playClick } from "../../sound.js";
import { LOBBY } from "./branding.js";

export const BLOOM_DEFAULTS = Object.freeze({ length: "standard", helps: true });

let lobbyKey = "";
let lobbyStore = null;
export function bloomworkLobbyOptions(ctx) {
  const key = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}`;
  if (lobbyKey !== key) {
    lobbyKey = key;
    lobbyStore = { ...BLOOM_DEFAULTS };
  }
  return lobbyStore;
}

function parseValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function segment(name, choices, stored, esc) {
  const meta = LOBBY.options[name];
  const buttons = choices.map(([value, label]) => {
    const on = String(stored[name]) === String(value);
    return `<button type="button" data-v="${esc(String(value))}" class="${on ? "bw-on" : ""}" aria-pressed="${on}">${esc(label)}</button>`;
  }).join("");
  return `<div class="bw-opt">
      <div class="bw-opt-label"><b>${esc(meta.label)}</b><span>${esc(meta.hint)}</span></div>
      <div class="bw-seg" data-bw-opt="${name}">${buttons}</div>
    </div>`;
}

export function renderBloomworkLobby(host, ctx) {
  const esc = ctx.escapeHtml || ((s) => String(s));
  const stored = bloomworkLobbyOptions(ctx);
  renderHostStartLobby(host, ctx, {
    wrap: "bloomwork-root bw-lobby",
    heading: LOBBY.heading,
    blurb: LOBBY.blurb,
    extraHtml: `<div class="bw-options">
        ${segment("length", [["standard", LOBBY.lengthNames.standard], ["quick", LOBBY.lengthNames.quick]], stored, esc)}
        ${segment("helps", [[true, LOBBY.on], [false, LOBBY.off]], stored, esc)}
      </div>`,
    getStartArg: () => {
      const o = bloomworkLobbyOptions(ctx);
      return { bloom_options: { length: o.length, helps: o.helps } };
    },
    onMount: (lobbyHost) => {
      lobbyHost.querySelectorAll("[data-bw-opt] button").forEach((button) => {
        button.addEventListener("click", () => {
          const seg = button.parentElement;
          const name = seg.getAttribute("data-bw-opt");
          bloomworkLobbyOptions(ctx)[name] = parseValue(button.getAttribute("data-v"));
          seg.querySelectorAll("button").forEach((other) => {
            const on = other === button;
            other.classList.toggle("bw-on", on);
            other.setAttribute("aria-pressed", String(on));
          });
          playClick();
        });
      });
    },
  });
}
