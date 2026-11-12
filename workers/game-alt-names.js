// Game alt-name store: an optional, admin-set second name per game (for
// example Tracklayers -> "Ticket to Ride"), shown to players in parentheses
// under the published name. A zero-fan-in leaf over data.game_alt_names,
// keyed by canonical game id; it never persists (the Worker entry saves).
// The write is gated by the Sogo passcode; reads are public via /api/games.
import { assertSogoPasscode } from "./platform/auth.js";
import { cleanGameId } from "./game-catalog.js";

export const ALT_NAME_LIMIT = 60;

// Trim, drop control characters, collapse whitespace, cap the length.
export function cleanAltName(value) {
  return String(value == null ? "" : value)
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ALT_NAME_LIMIT)
    .trim();
}

export function altNameFor(data, gameId) {
  const names = data && data.game_alt_names;
  return names && typeof names === "object" ? names[gameId] || "" : "";
}

// Set (or, with an empty name, clear) one game's alt name.
export function setGameAltName(data, payload, superuserPasscode) {
  assertSogoPasscode(payload.passcode, superuserPasscode);
  const requested = String(payload.game_id || "").trim();
  if (!requested) throw new Error("Game id is required.");
  const gameId = cleanGameId(requested);
  const altName = cleanAltName(payload.alt_name);
  if (!data.game_alt_names || typeof data.game_alt_names !== "object" || Array.isArray(data.game_alt_names)) {
    data.game_alt_names = {};
  }
  if (altName) data.game_alt_names[gameId] = altName;
  else delete data.game_alt_names[gameId];
  return { ok: true, game_id: gameId, alt_name: altName || null };
}
