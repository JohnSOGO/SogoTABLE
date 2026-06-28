const HOSTED_API_ORIGIN = "https://sogotable.sogodojo.com";

// A repair hook the app registers (setOwnerTokenHealer): given a player id, it
// drops this device's dead token and re-acquires a fresh one (claim succeeds for an
// unclaimed player with NO passcode; an already-claimed player goes through the
// normal move-to-this-device confirm). Lets api() transparently recover from
// "must be claimed" / "owner token is incorrect" on ANY owner action — previously
// only Create-game had its own retry, so other actions stranded the player.
let ownerTokenHealer = null;
export function setOwnerTokenHealer(fn) { ownerTokenHealer = fn; }

// The acting player a payload's owner_token belongs to. Host actions carry host_id;
// player actions carry requester_id / player_id / id or a player object. host_id
// wins because kick/invite payloads also carry the *target* player_id.
function ownerPlayerId(payload) {
  if (!payload || typeof payload !== "object") return "";
  return String(payload.host_id || payload.requester_id || payload.player_id || payload.id
    || (payload.player && payload.player.id) || "").trim();
}

export async function api(url, payload, options = {}) {
  try {
    const data = await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!data.ok) throw new Error(data.error || "Request failed.");
    return data;
  } catch (error) {
    // Self-heal a stale/unclaimed owner token once, transparently, for any action.
    if (options.noHeal || !ownerTokenHealer || !payload || payload.owner_token == null) throw error;
    if (!isUnclaimedError(error) && !isStaleOwnerTokenError(error)) throw error;
    const playerId = ownerPlayerId(payload);
    if (!playerId) throw error;
    let freshToken = null;
    try { freshToken = await ownerTokenHealer(playerId); } catch (_) { freshToken = null; }
    if (!freshToken) throw error;   // couldn't repair (e.g. a declined device move) — surface the original error
    console.info(`[sogotable] recovered a stale owner token for player ${playerId}; retried ${url}`);
    return api(url, { ...payload, owner_token: freshToken }, { noHeal: true });
  }
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(apiUrl(url), options);
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!text) throw new Error("Game server returned an empty response.");
  if (!contentType.includes("application/json")) throw new Error("Game server returned a non-JSON response.");
  return JSON.parse(text);
}

export function roomSocketUrl(code, playerId = "") {
  const url = new URL(`${HOSTED_API_ORIGIN}/api/room/socket`);
  url.searchParams.set("code", code);
  if (playerId) url.searchParams.set("player_id", playerId);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function appEventsSocketUrl({ gameId, playerId } = {}) {
  const url = new URL(`${HOSTED_API_ORIGIN}/api/events/socket`);
  if (gameId) url.searchParams.set("game_id", gameId);
  if (playerId) url.searchParams.set("player_id", playerId);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function apiUrl(url) {
  if (typeof url === "string" && url.startsWith("/api/")) return `${HOSTED_API_ORIGIN}${url}`;
  return url;
}

// Classifiers for the player-ownership errors the Worker returns, so callers can
// react (re-claim, move device, drop a stale token) without matching strings
// inline. They only read error.message — no app state.
export function isAlreadyClaimedError(error) {
  return String(error && error.message || "").toLowerCase().includes("already claimed");
}

// True when an action was rejected because the player has no owner token on the
// server at all (unclaimed) — e.g. the Sogo admin unlocked it. Any token stored on
// this device is stale; drop it and re-claim (no passcode needed for an unclaimed
// player, so this works from any device after an unlock).
export function isUnclaimedError(error) {
  return String(error && error.message || "").toLowerCase().includes("must be claimed");
}

// True when an action was rejected because this device's owner token for the
// player no longer matches the server — e.g. the player was reclaimed on a
// different device, invalidating the token stored here.
export function isStaleOwnerTokenError(error) {
  return String(error && error.message || "").toLowerCase().includes("owner token is incorrect");
}
