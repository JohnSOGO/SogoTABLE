// Realmwright pre-game lobby — the shared host-start template plus the host's
// options picker (farmers, live tally, meeples, small cities, tile bag).
//
// Host selections live in a module store keyed by room+epoch (the Hearts /
// WNYK precedent): every room snapshot repaints the lobby DOM, so the DOM is
// never the source of truth. getStartArg reads the store.
import { renderHostStartLobby } from "../lobby.js";
import { playClick } from "../../sound.js";
import { LOBBY } from "./branding.js";

export const REALM_DEFAULTS = { farmers: "on", live_tally: true, show_spots: true, meeples: 7, small_city: false, deck: "standard" };

let lobbyKey = "";
let lobbyStore = null;
export function realmLobbyOptions(ctx) {
  const key = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}`;
  if (lobbyKey !== key) {
    lobbyKey = key;
    lobbyStore = { ...REALM_DEFAULTS };
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
    return `<button type="button" data-v="${esc(String(value))}" class="${on ? "rw-on" : ""}" aria-pressed="${on}">${esc(label)}</button>`;
  }).join("");
  return `<div class="rw-opt">
      <div class="rw-opt-label"><b>${esc(meta.label)}</b><span>${esc(meta.hint)}</span></div>
      <div class="rw-seg" data-rw-opt="${name}">${buttons}</div>
    </div>`;
}

export function renderRealmwrightLobby(host, ctx) {
  const esc = ctx.escapeHtml || ((s) => String(s));
  const stored = realmLobbyOptions(ctx);
  const seats = Array.isArray(ctx.room && ctx.room.players) ? ctx.room.players.length : 0;
  const hint = seats >= 5 && stored.deck !== "big" ? `<p class="rw-opt-hint">💡 ${esc(LOBBY.bigDeckHint)}</p>` : "";
  renderHostStartLobby(host, ctx, {
    wrap: "realmwright-root rw-lobby",
    heading: LOBBY.heading,
    blurb: LOBBY.blurb,
    extraHtml: `<div class="rw-options">
        ${segment("farmers", [["on", LOBBY.on], ["off", LOBBY.off]], stored, esc)}
        ${segment("live_tally", [[true, LOBBY.on], [false, LOBBY.off]], stored, esc)}
        ${segment("show_spots", [[true, LOBBY.on], [false, LOBBY.off]], stored, esc)}
        ${segment("meeples", [5, 6, 7, 8, 9, 10].map((n) => [n, String(n)]), stored, esc)}
        ${segment("small_city", [[false, LOBBY.off], [true, LOBBY.on]], stored, esc)}
        ${segment("deck", [["quick", LOBBY.deckNames.quick], ["standard", LOBBY.deckNames.standard], ["big", LOBBY.deckNames.big]], stored, esc)}
        ${hint}
      </div>`,
    getStartArg: () => {
      const options = realmLobbyOptions(ctx);
      return { realm_options: { ...options, expansions: [] } };
    },
    onMount: (lobbyHost) => {
      lobbyHost.querySelectorAll("[data-rw-opt] button").forEach((button) => {
        button.addEventListener("click", () => {
          const seg = button.parentElement;
          const name = seg.getAttribute("data-rw-opt");
          realmLobbyOptions(ctx)[name] = parseValue(button.getAttribute("data-v"));
          seg.querySelectorAll("button").forEach((other) => {
            const on = other === button;
            other.classList.toggle("rw-on", on);
            other.setAttribute("aria-pressed", String(on));
          });
          playClick();
          if (name === "deck") {
            const hintEl = lobbyHost.querySelector(".rw-opt-hint");
            if (hintEl) hintEl.hidden = realmLobbyOptions(ctx).deck === "big";
          }
        });
      });
    },
  });
}
