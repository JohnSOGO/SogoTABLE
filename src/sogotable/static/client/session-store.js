// Device session identity — the "who is this device playing as" state owner.
//
// This is an UPSTREAM owner (the `client/` tier), not a downstream controller:
// both the shell (app.js) and the controllers read it, so it injects nothing and
// is wired into nobody. It owns three pieces of cross-cutting identity state that
// previously lived as bare globals in app.js — the source of the shell's wide ctx
// surfaces and of the hot-seat seat-resolution bug. Giving them one home is the
// fix; new shared client state belongs in an owner like this, not a fresh global.
//
//   selectedPlayerId       the shared / last-used player        (localStorage)
//   deviceSelectedPlayerId  this tab's seat                      (sessionStorage,
//                                                                 falls back local)
//   deviceSelectionHash     a stable tag for this device         (localStorage)
import {
  SELECTED_PLAYER_ID_KEY,
  DEVICE_SELECTED_PLAYER_ID_KEY,
  DEVICE_SELECTION_HASH_KEY,
} from "../storage.js";

let selectedPlayerId = "";
let deviceSelectedPlayerId = "";
let deviceSelectionHash = "";

function randomTenDigitHash() {
  return String(Math.floor(1000000000 + Math.random() * 9000000000));
}

// Seed from storage. MUST run after the shell's migrateStorageNamespace() — so it
// is called explicitly from init, never at import time (an import-time seed would
// read the pre-migration namespace). Reproduces the old app.js init exactly.
export function initSessionStore() {
  selectedPlayerId = localStorage.getItem(SELECTED_PLAYER_ID_KEY) || "";
  deviceSelectedPlayerId = sessionStorage.getItem(DEVICE_SELECTED_PLAYER_ID_KEY)
    || localStorage.getItem(DEVICE_SELECTED_PLAYER_ID_KEY)
    || selectedPlayerId;
  deviceSelectionHash = localStorage.getItem(DEVICE_SELECTION_HASH_KEY) || randomTenDigitHash();
  if (!selectedPlayerId && deviceSelectedPlayerId) selectedPlayerId = deviceSelectedPlayerId;
  localStorage.setItem(DEVICE_SELECTION_HASH_KEY, deviceSelectionHash);
}

export function getSelectedPlayerId() { return selectedPlayerId; }
export function setSelectedPlayerId(id) { selectedPlayerId = id; }
export function getDeviceSelectedPlayerId() { return deviceSelectedPlayerId; }
export function setDeviceSelectedPlayerId(id) { deviceSelectedPlayerId = id; }
export function getDeviceSelectionHash() { return deviceSelectionHash; }

// The device seat priority: the per-tab device id wins, the shared id is the
// fallback. The single home for this precedence — the hot-seat bug class. (Some
// shell call sites deliberately use the OPPOSITE order; those keep their explicit
// expression and do not route through here.)
export function pickSeatId(deviceId, sharedId) { return deviceId || sharedId; }
export function homePlayerId() { return pickSeatId(deviceSelectedPlayerId, selectedPlayerId); }

// Persist identity. Mirrors the old saveSelectedPlayer() writes EXACTLY — note the
// local SELECTED_PLAYER_ID_KEY is written from the DEVICE id (long-standing
// behavior), not from selectedPlayerId.
export function saveDeviceIdentity() {
  sessionStorage.setItem(DEVICE_SELECTED_PLAYER_ID_KEY, deviceSelectedPlayerId);
  localStorage.setItem(SELECTED_PLAYER_ID_KEY, deviceSelectedPlayerId);
  localStorage.setItem(DEVICE_SELECTION_HASH_KEY, deviceSelectionHash);
}
