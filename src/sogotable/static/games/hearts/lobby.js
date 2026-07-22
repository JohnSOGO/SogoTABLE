// Hearts pre-game lobby — the shared host-start template plus the host's
// optional-rules picker (Jack of Diamonds, first-trick blood, moon style,
// target score). Extracted from render.js (2026-07-21) when the persistence
// fix below pushed it past the 800-line backstop: the lobby is its own seam.
//
// Host option selections survive lobby repaints (same fix as WNYK,
// 2026-07-21): every room snapshot — a bot invite, a join — rebuilds the
// lobby DOM, and the DOM was the only state, so the toggles silently reset
// to defaults. Keyed by room+epoch; a new room or reset returns to defaults.
import { renderHostStartLobby } from "../lobby.js";
import { playClick } from "../../sound.js";

const HEARTS_LOBBY_DEFAULTS = { jack_of_diamonds: false, no_blood_first_trick: true, moon_style: "old", target_score: 100 };
let heartsLobbyKey = "";
let heartsLobbyStore = null;
function heartsLobbyOptions(ctx) {
  const key = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}`;
  if (heartsLobbyKey !== key) {
    heartsLobbyKey = key;
    heartsLobbyStore = { ...HEARTS_LOBBY_DEFAULTS };
  }
  return heartsLobbyStore;
}

function heartsParseOptionValue(value) {
  return value === "true" ? true : value === "false" ? false : (/^\d+$/.test(value) ? Number(value) : value);
}

export function renderHeartsLobby(host, ctx) {
  const seatCount = Array.isArray(ctx.room && ctx.room.players) ? ctx.room.players.length : 0;
  // Each toggle's hx-on derives from the STORED selection, never hardcoded.
  const stored = heartsLobbyOptions(ctx);
  const hxOn = (name, value) => (String(stored[name]) === String(value) ? ' class="hx-on"' : "");
  renderHostStartLobby(host, ctx, {
    wrap: "hearts-root",
    heading: "Players",
    blurb: seatCount === 4
      ? "Four seats filled — deal them in."
      : `Hearts seats exactly four (${seatCount}/4) — invite players or bots to fill the table.`,
    extraHtml: `
      <div class="hx-options">
        <div class="hx-opt"><div class="hx-opt-label"><b>Jack of Diamonds</b><span>taking the J♦ scores −10</span></div>
          <div class="hx-seg" data-hx-opt="jack_of_diamonds"><button type="button" data-v="false"${hxOn("jack_of_diamonds", false)}>Off</button><button type="button" data-v="true"${hxOn("jack_of_diamonds", true)}>On</button></div></div>
        <div class="hx-opt"><div class="hx-opt-label"><b>No blood on trick one</b><span>no hearts or Q♠ on the first trick</span></div>
          <div class="hx-seg" data-hx-opt="no_blood_first_trick"><button type="button" data-v="true"${hxOn("no_blood_first_trick", true)}>On</button><button type="button" data-v="false"${hxOn("no_blood_first_trick", false)}>Off</button></div></div>
        <div class="hx-opt"><div class="hx-opt-label"><b>Shooting the moon</b><span>old: others +26 · new: shooter −26</span></div>
          <div class="hx-seg" data-hx-opt="moon_style"><button type="button" data-v="old"${hxOn("moon_style", "old")}>Old</button><button type="button" data-v="new"${hxOn("moon_style", "new")}>New</button></div></div>
        <div class="hx-opt"><div class="hx-opt-label"><b>Play to</b><span>lowest score wins at the line</span></div>
          <div class="hx-seg" data-hx-opt="target_score"><button type="button" data-v="50"${hxOn("target_score", 50)}>50</button><button type="button" data-v="75"${hxOn("target_score", 75)}>75</button><button type="button" data-v="100"${hxOn("target_score", 100)}>100</button></div></div>
      </div>`,
    getStartArg: (lobbyHost) => {
      // The store is authoritative; the DOM scrape is only a fallback.
      const options = {};
      lobbyHost.querySelectorAll("[data-hx-opt]").forEach((seg) => {
        const on = seg.querySelector(".hx-on");
        const value = on ? on.getAttribute("data-v") : null;
        if (value === null) return;
        options[seg.getAttribute("data-hx-opt")] = heartsParseOptionValue(value);
      });
      return Object.assign(options, heartsLobbyOptions(ctx));
    },
    onMount: (lobbyHost) => {
      lobbyHost.querySelectorAll("[data-hx-opt] button").forEach((button) => {
        button.addEventListener("click", () => {
          button.parentElement.querySelectorAll("button").forEach((other) => other.classList.remove("hx-on"));
          button.classList.add("hx-on");
          heartsLobbyOptions(ctx)[button.parentElement.getAttribute("data-hx-opt")] = heartsParseOptionValue(button.getAttribute("data-v"));
          playClick();
        });
      });
    },
  });
}
