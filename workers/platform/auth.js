// Auth primitives — the cross-cutting identity layer the route handlers share.
// Two concerns: per-player ownership (owner-token hash check) and the single Sogo
// superuser gate (configured id + passcode). Pure functions over the passed-in
// state/options — they own no state and make no game decisions, so every domain
// can call them without coupling. Extracted from the Worker entry so it stops
// being the home for everything.
import { RESERVED_TEST_PLAYER_IDS } from "../test-players.js";

const OWNER_TOKEN_BYTES = 24;

export async function assertPlayerOwner(data, playerId, ownerToken, options = {}) {
  const id = String(playerId || "").trim();
  if (options.ownerAuthBypass || RESERVED_TEST_PLAYER_IDS.has(id)) return;
  if (!id) throw new Error("Player id is required.");
  const player = (data.players || []).find((item) => item.id === id);
  if (!player) throw new Error("Player not found.");
  if (!player.owner_token_hash) throw new Error("Player must be claimed before this action.");
  const token = String(ownerToken || "").trim();
  if (!token) throw new Error("Player owner token is required.");
  const hash = await ownerTokenHash(token);
  if (hash !== player.owner_token_hash) throw new Error("Player owner token is incorrect.");
}

export function assertSogoSuperuser(data, playerId, passcode, configuredPasscode, configuredPlayerIds) {
  if (!isSogoSuperuser(data, playerId, configuredPlayerIds)) throw new Error("Only the configured Sogo superuser can do this.");
  if (!String(configuredPasscode || "").trim()) throw new Error("Sogo superuser passcode is not configured.");
  if (String(passcode || "") !== String(configuredPasscode)) throw new Error("Sogo passcode is incorrect.");
}

// Passcode-only Sogo gate: no seated-player context, just the shared superuser
// passcode. Used by the admin bug-report endpoints (list/clear/resolve) and the
// superuser branch of player reclaim, all of which are driven by local scripts
// rather than a logged-in player.
export function assertSogoPasscode(passcode, configuredPasscode) {
  if (!String(configuredPasscode || "").trim() || String(passcode || "") !== String(configuredPasscode)) {
    throw new Error("Sogo passcode is incorrect.");
  }
}

export function isSogoSuperuser(data, playerId, configuredPlayerIds) {
  const id = String(playerId || "").trim();
  if (!id) return false;
  const allowed = configuredSogoSuperuserIds(configuredPlayerIds);
  if (!allowed.size) return false;
  if (!allowed.has(id)) return false;
  return Boolean((data.players || []).find((item) => item.id === id));
}

export function configuredSogoSuperuserIds(value) {
  return new Set(String(value || "").split(",").map((item) => item.trim()).filter(Boolean));
}

export function generateOwnerToken() {
  const bytes = new Uint8Array(OWNER_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function ownerTokenHash(token) {
  const bytes = new TextEncoder().encode(String(token || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
