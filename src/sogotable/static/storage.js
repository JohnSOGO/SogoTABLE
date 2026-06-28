// One home for the browser app's persisted state: the localStorage/sessionStorage
// key names and the pure read/migrate helpers. Keeping the keys here (instead of
// as string literals scattered across the shell) stops them drifting or being
// typo'd. Stateful save wrappers stay in app.js next to the state they own and
// import the key constants from here.

export const LEGACY_STORAGE_PREFIX = ["sogo", "games"].join("");
export const SOGO_SUPERUSER_PASSCODE_KEY = "sogotable.sogoSuperuserPasscode";
export const PLAYER_OWNER_TOKEN_STORAGE_KEY = "sogotable.playerOwnerTokens";
export const ACTION_LABELS_STORAGE_KEY = "sogotable.actionLabels";
export const LOCAL_GAME_HOME_PLAYERS_KEY = "sogotable.localGameHomePlayers";
export const THEME_STORAGE_KEY = "sogotable.theme";

export function loadLocalGameHomePlayers() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_GAME_HOME_PLAYERS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function loadPlayerOwnerTokens() {
  try {
    return JSON.parse(localStorage.getItem(PLAYER_OWNER_TOKEN_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

// Per-device display preference (like the sound toggle): action buttons show
// emojis by default, or brief words when the player opts in.
export function actionLabelStyle() {
  return localStorage.getItem(ACTION_LABELS_STORAGE_KEY) === "words" ? "words" : "emoji";
}

export function setActionLabelStyle(useWords) {
  localStorage.setItem(ACTION_LABELS_STORAGE_KEY, useWords ? "words" : "emoji");
}

// Per-device dark/light preference. Like the sound + action-label toggles, this
// is a display preference, not room state. A stored "dark"/"light" is an explicit
// choice; with none we follow the device's prefers-color-scheme. Currently only
// Mazewright restyles for it (its lobby + game board), but the attribute is set
// globally so other screens can opt in later. The early <head> script in
// index.html applies this on load; mirror any logic change there too.
export function themePreference() {
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  return value === "dark" || value === "light" ? value : "system";
}

export function effectiveTheme() {
  const pref = themePreference();
  if (pref !== "system") return pref;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function setDarkMode(useDark) {
  localStorage.setItem(THEME_STORAGE_KEY, useDark ? "dark" : "light");
}

export function applyTheme() {
  document.documentElement.setAttribute("data-theme", effectiveTheme());
}

// Drop the long-retired local roster keys (players now live in the Worker).
export function purgeDeprecatedLocalRoster() {
  localStorage.removeItem("sogotable.players");
  localStorage.removeItem("sogotable.playersMigrated");
  localStorage.removeItem(`${LEGACY_STORAGE_PREFIX}.players`);
  localStorage.removeItem(`${LEGACY_STORAGE_PREFIX}.playersMigrated`);
}

// One-time copy of the older `sogogames.*` keys into the `sogotable.*` namespace.
export function migrateStorageNamespace() {
  const keys = [
    "selectedPlayerId",
    "deviceSelectedPlayerId",
    "deviceSelectionHash",
    "selectedGameId",
    "localGameHomePlayers",
  ];
  keys.forEach((key) => {
    const oldKey = `${LEGACY_STORAGE_PREFIX}.${key}`;
    const newKey = `sogotable.${key}`;
    if (localStorage.getItem(newKey) === null && localStorage.getItem(oldKey) !== null) {
      localStorage.setItem(newKey, localStorage.getItem(oldKey));
    }
  });
}
