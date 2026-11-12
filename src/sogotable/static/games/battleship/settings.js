// Battleship — per-device view preferences (effects level, board tilt,
// coordinate labels, fleet tracker) and the small in-game settings row that
// edits them. Presentation only: nothing here reaches the Worker or the rules.
// Keys are namespaced under sogotable.battleship.* and every storage access is
// guarded, so private mode or blocked storage just falls back to the defaults.

const KEY = "sogotable.battleship.view";
export const FX_LEVELS = ["full", "lite", "off"];
const DEFAULTS = { fx: "full", tilt: true, coords: true, tracker: true };

let cache = null;
let panelOpen = false;

function normalize(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  return {
    fx: FX_LEVELS.includes(value.fx) ? value.fx : DEFAULTS.fx,
    tilt: typeof value.tilt === "boolean" ? value.tilt : DEFAULTS.tilt,
    coords: typeof value.coords === "boolean" ? value.coords : DEFAULTS.coords,
    tracker: typeof value.tracker === "boolean" ? value.tracker : DEFAULTS.tracker,
  };
}

export function loadBattleshipView() {
  if (cache) return cache;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { raw = null; }
  cache = normalize(raw);
  return cache;
}

export function saveBattleshipView(patch) {
  cache = normalize({ ...loadBattleshipView(), ...patch });
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage unavailable: keep in memory */ }
  return cache;
}

const FX_LABELS = { full: "Full", lite: "Lite", off: "Off" };

// Build the collapsible "Effects & helps" row. `onChange` is the injected
// rerender; the open/closed state survives rerenders.
export function buildBattleshipSettings(onChange) {
  const view = loadBattleshipView();
  const details = document.createElement("details");
  details.className = "bs-settings";
  details.open = panelOpen;
  details.innerHTML = `
    <summary>⚙️ Effects &amp; helps</summary>
    <div class="bs-settings-body">
      <div class="bs-settings-fx" role="radiogroup" aria-label="Effects">
        <span>Effects</span>
        ${FX_LEVELS.map((level) => `<button type="button" data-bs-fx="${level}" role="radio" aria-checked="${view.fx === level}" class="${view.fx === level ? "selected" : ""}">${FX_LABELS[level]}</button>`).join("")}
      </div>
      <label><input type="checkbox" data-bs-opt="tilt" ${view.tilt ? "checked" : ""}> 3D tilted sea</label>
      <label><input type="checkbox" data-bs-opt="coords" ${view.coords ? "checked" : ""}> Grid coordinates (A–J, 1–10)</label>
      <label><input type="checkbox" data-bs-opt="tracker" ${view.tracker ? "checked" : ""}> Fleet tracker</label>
    </div>`;
  details.addEventListener("toggle", () => { panelOpen = details.open; });
  details.querySelectorAll("[data-bs-fx]").forEach((button) => {
    button.addEventListener("click", () => {
      saveBattleshipView({ fx: button.dataset.bsFx });
      onChange();
    });
  });
  details.querySelectorAll("[data-bs-opt]").forEach((input) => {
    input.addEventListener("change", () => {
      saveBattleshipView({ [input.dataset.bsOpt]: input.checked });
      onChange();
    });
  });
  return details;
}
