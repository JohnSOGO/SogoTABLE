// Hidden Isles pre-game lobby — the shared host-start template plus the
// host's options picker (word pack, clue ideas, crew pointers).
//
// Host selections live in a module store keyed by room+epoch (the Hearts /
// WNYK / Realmwright precedent): every room snapshot repaints the lobby DOM,
// so the DOM is never the source of truth. getStartArg reads the store.
import { renderHostStartLobby } from "../lobby.js";
import { playClick } from "../../sound.js";
import { LOBBY } from "./branding.js";

export const HIDDEN_ISLES_DEFAULTS = { pack: "classic", clue_ideas: false, team_marks: true };

let lobbyKey = "";
let lobbyStore = null;
export function hiddenIslesLobbyOptions(ctx) {
  const key = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}`;
  if (lobbyKey !== key) {
    lobbyKey = key;
    lobbyStore = { ...HIDDEN_ISLES_DEFAULTS };
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
    return `<button type="button" data-v="${esc(String(value))}" class="${on ? "hi-on" : ""}" aria-pressed="${on}">${esc(label)}</button>`;
  }).join("");
  return `<div class="hi-opt">
      <div class="hi-opt-label"><b>${esc(meta.label)}</b><span>${esc(meta.hint)}</span></div>
      <div class="hi-seg" role="group" aria-label="${esc(meta.label)}" data-hi-opt="${name}">${buttons}</div>
    </div>`;
}

export function renderHiddenIslesLobby(host, ctx) {
  const esc = ctx.escapeHtml || ((s) => String(s));
  const stored = hiddenIslesLobbyOptions(ctx);
  const packs = ["classic", "easy", "mixed"].map((p) => [p, LOBBY.packNames[p]]);
  renderHostStartLobby(host, ctx, {
    wrap: "hidden-isles-root hi-lobby",
    heading: LOBBY.heading,
    blurb: LOBBY.blurb,
    extraHtml: `<div class="hi-options">
        ${segment("pack", packs, stored, esc)}
        ${segment("clue_ideas", [[false, LOBBY.off], [true, LOBBY.on]], stored, esc)}
        ${segment("team_marks", [[true, LOBBY.on], [false, LOBBY.off]], stored, esc)}
      </div>`,
    getStartArg: () => {
      const { pack, clue_ideas, team_marks } = hiddenIslesLobbyOptions(ctx);
      return { hidden_isles_options: { pack, clue_ideas, team_marks } };
    },
    onMount: (lobbyHost) => {
      lobbyHost.querySelectorAll("[data-hi-opt] button").forEach((button) => {
        button.addEventListener("click", () => {
          const seg = button.parentElement;
          const name = seg.getAttribute("data-hi-opt");
          hiddenIslesLobbyOptions(ctx)[name] = parseValue(button.getAttribute("data-v"));
          seg.querySelectorAll("button").forEach((other) => {
            const on = other === button;
            other.classList.toggle("hi-on", on);
            other.setAttribute("aria-pressed", String(on));
          });
          playClick();
        });
      });
    },
  });
}
