// Tracklayers pre-game lobby — the shared host-start template plus the host's
// "trains each" picker (25 / 35 / 45).
//
// The host's choice lives in a module store keyed by room+epoch (the Hearts /
// WNYK / Realmwright precedent): every room snapshot repaints the lobby DOM, so
// the DOM is never the source of truth. getStartArg reads the store and sends
// { tracklayers_options: { trains } }; the server validates it.
import { renderHostStartLobby } from "../lobby.js";
import { playClick } from "../../sound.js";
import { LOBBY } from "./branding.js";

export const TRAIN_CHOICES = [25, 35, 45];
export const TRACK_DEFAULTS = { trains: 35 };

let lobbyKey = "";
let lobbyStore = null;
export function trackLobbyOptions(ctx) {
  const key = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}`;
  if (lobbyKey !== key) {
    lobbyKey = key;
    lobbyStore = { ...TRACK_DEFAULTS };
  }
  return lobbyStore;
}

export function renderTracklayersLobby(host, ctx) {
  const esc = ctx.escapeHtml || ((s) => String(s));
  const stored = trackLobbyOptions(ctx);
  const buttons = TRAIN_CHOICES.map((n) => {
    const on = stored.trains === n;
    return `<button type="button" data-v="${n}" class="${on ? "tl-on" : ""}" aria-pressed="${on}">${esc(LOBBY.trainsNames[n] || String(n))}</button>`;
  }).join("");
  renderHostStartLobby(host, ctx, {
    wrap: "tracklayers-root tl-lobby",
    heading: LOBBY.heading,
    blurb: LOBBY.blurb,
    extraHtml: `<div class="tl-options"><div class="tl-opt">
        <div class="tl-opt-label"><b>${esc(LOBBY.trainsLabel)}</b><span>${esc(LOBBY.trainsHint)}</span></div>
        <div class="tl-seg" data-tl-opt="trains">${buttons}</div>
      </div></div>`,
    getStartArg: () => ({ tracklayers_options: { trains: trackLobbyOptions(ctx).trains } }),
    onMount: (lobbyHost) => {
      lobbyHost.querySelectorAll("[data-tl-opt] button").forEach((button) => {
        button.addEventListener("click", () => {
          trackLobbyOptions(ctx).trains = Number(button.getAttribute("data-v"));
          button.parentElement.querySelectorAll("button").forEach((other) => {
            const on = other === button;
            other.classList.toggle("tl-on", on);
            other.setAttribute("aria-pressed", String(on));
          });
          playClick();
        });
      });
    },
  });
}
