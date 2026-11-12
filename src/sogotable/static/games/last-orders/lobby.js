// Last Orders pre-game lobby — the shared host-start template plus the host's
// options (PLAN.md §5): reaction window, expansion packs, closing time,
// random patrons, playable glow.
//
// Host selections live in a module store keyed by room+epoch (the Realmwright
// / Hearts precedent): every room snapshot repaints the lobby DOM, so the DOM
// is never the source of truth. getStartArg reads the store and sends
// `{ lo_options }`; the server clamps every value.
import { renderHostStartLobby } from "../lobby.js";
import { playClick } from "../../sound.js";
import { LOBBY } from "./branding.js";
import { PACKS } from "./content.js";

export const LO_DEFAULTS = Object.freeze({ react_seconds: 8, expansions: [], closing_time: true, random_characters: false, show_playable: true });
const REACT_CHOICES = [5, 8, 12, 20];
const EXPANSIONS = ["harbor", "frost", "masquerade", "clockwork", "rowdy"];

let lobbyKey = "";
let lobbyStore = null;
export function lastOrdersLobbyOptions(ctx) {
  const key = `${ctx.room ? ctx.room.code : ""}#${ctx.room ? ctx.room.game_epoch : ""}`;
  if (lobbyKey !== key) {
    lobbyKey = key;
    lobbyStore = { ...LO_DEFAULTS, expansions: [] };
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
    return `<button type="button" data-v="${esc(String(value))}" class="${on ? "lo-on" : ""}" aria-pressed="${on}">${esc(label)}</button>`;
  }).join("");
  return `<div class="lo-opt">
      <div class="lo-opt-label"><b>${esc(meta.label)}</b><span>${esc(meta.hint)}</span></div>
      <div class="lo-seg" data-lo-opt="${name}">${buttons}</div>
    </div>`;
}

function packToggles(stored, esc) {
  const items = EXPANSIONS.filter((id) => PACKS[id]).map((id) => {
    const on = stored.expansions.includes(id);
    return `<button type="button" class="lo-pack${on ? " lo-on" : ""}" data-lo-pack="${id}" aria-pressed="${on}">
        <span class="lo-pack-check" aria-hidden="true">${on ? "✓" : ""}</span>
        <span class="lo-pack-text"><b>${esc(PACKS[id].name)}</b><small>${esc(PACKS[id].blurb)}</small></span>
      </button>`;
  }).join("");
  return `<div class="lo-packs"><div class="lo-opt-label"><b>${esc(LOBBY.packsTitle)}</b></div>${items}</div>`;
}

export function renderLastOrdersLobby(host, ctx) {
  const esc = ctx.escapeHtml || ((s) => String(s));
  const stored = lastOrdersLobbyOptions(ctx);
  const onOff = [[true, LOBBY.on], [false, LOBBY.off]];
  renderHostStartLobby(host, ctx, {
    wrap: "last-orders-root lo-lobby",
    heading: LOBBY.heading,
    blurb: LOBBY.blurb,
    extraHtml: `<div class="lo-options">
        ${segment("react_seconds", REACT_CHOICES.map((n) => [n, LOBBY.seconds(n)]), stored, esc)}
        ${segment("closing_time", onOff, stored, esc)}
        ${segment("random_characters", [[false, LOBBY.off], [true, LOBBY.on]], stored, esc)}
        ${segment("show_playable", onOff, stored, esc)}
        ${packToggles(stored, esc)}
      </div>`,
    getStartArg: () => {
      const o = lastOrdersLobbyOptions(ctx);
      return { lo_options: { ...o, expansions: [...o.expansions] } };
    },
    onMount: (lobbyHost) => {
      lobbyHost.querySelectorAll("[data-lo-opt] button").forEach((button) => {
        button.addEventListener("click", () => {
          const seg = button.parentElement;
          const name = seg.getAttribute("data-lo-opt");
          lastOrdersLobbyOptions(ctx)[name] = parseValue(button.getAttribute("data-v"));
          seg.querySelectorAll("button").forEach((other) => {
            const on = other === button;
            other.classList.toggle("lo-on", on);
            other.setAttribute("aria-pressed", String(on));
          });
          playClick();
        });
      });
      lobbyHost.querySelectorAll("[data-lo-pack]").forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.getAttribute("data-lo-pack");
          const o = lastOrdersLobbyOptions(ctx);
          o.expansions = o.expansions.includes(id) ? o.expansions.filter((x) => x !== id) : [...o.expansions, id];
          const on = o.expansions.includes(id);
          button.classList.toggle("lo-on", on);
          button.setAttribute("aria-pressed", String(on));
          const check = button.querySelector(".lo-pack-check");
          if (check) check.textContent = on ? "✓" : "";
          playClick();
        });
      });
    },
  });
}
