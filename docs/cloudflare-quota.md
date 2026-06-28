# Cloudflare Quota Guardrails

This note records the fix from `AI/CODEX_CLOUDFLARE_QUOTA_FIX.md`.
It is the Cloudflare-runtime counterpart to `docs/doctrine.md` and
`docs/wu-wei-method.md`: keep updates event-driven, make refresh explicit, and
do not make background polling the normal path.

## Problem

Cloudflare reported quota pressure from:

- Durable Object free-tier duration
- Workers KV free-tier put operations

For this app, the immediate Durable Object risk is idle browser tabs holding
plain WebSocket connections open. Plain `server.accept()` WebSocket handling can
keep a Durable Object billable for the lifetime of the socket.

## Adopted Fix

Production Durable Object WebSockets must use Cloudflare WebSocket Hibernation:

```js
state.acceptWebSocket(server);
```

The Worker keeps `server.accept()` only as a local/test fallback when the
Cloudflare hibernation API is unavailable.

Durable Object classes that accept WebSockets should:

- implement `webSocketMessage`, `webSocketClose`, and `webSocketError`
- use `serializeAttachment()` for per-socket metadata
- recover metadata with `deserializeAttachment()`
- broadcast through `state.getWebSockets()` when available

This lets idle connected clients remain connected while the Durable Object can
sleep.

## Current App Behavior

- `RoomDurableObject` accepts room sockets with hibernation where available.
- `EventHubDurableObject` accepts app-event sockets with hibernation where available.
- EventHub socket subscriptions are serialized onto each socket so game/player
  routing survives hibernation.
- Broadcasts use `state.getWebSockets()` in production and in-memory sets/maps
  only as local/test fallback.
- Frontend fallback polling should be treated as an exception path only.
- The normal data path should be WebSocket push, reconnect, or explicit user refresh.
- Lobby presence heartbeat must not force a full room-list refresh every tick.
- Prefer no repeating timers at all for room or lobby freshness when push or explicit refresh can do the job.

## KV Rule

Hot game state does not belong in Workers KV.

Use:

- Durable Objects for live room coordination
- D1 for durable shared state, stats, and history
- in-memory state only as a temporary cache while an object is awake
- KV only for cold, low-write configuration if a future feature truly needs it

Avoid:

- KV writes on moves
- KV writes on presence heartbeats
- KV writes for room lists
- KV writes for lobby activity

The current `wrangler.toml` has no `kv_namespaces` binding, and no gameplay KV
write path should be added as a quota fix.

## Rate Limit Rule

Use Cloudflare Workers rate-limit bindings for coarse public API abuse
protection instead of writing limiter counters to D1, KV, or Durable Object
storage on every request. The current Worker has:

- `API_MUTATION_RATE_LIMITER`: 180 `POST`/`DELETE` requests per minute per client key.
- `SUPERUSER_RATE_LIMITER`: 20 `POST /api/superuser/verify` attempts per minute per client key.

Workers rate-limit `namespace_id` values must be positive integers encoded as
strings. Keep namespace ids unique per limiter unless counters should be shared.

Keep these limits roomy enough for household play, then tune with live evidence
before broader public sharing.

## Verification

Before deploying quota-sensitive Worker changes, run:

```powershell
node --check workers/sogotable-api.js
node --check src/sogotable/static/realtime.js
npm run test:worker
```

After deploy, smoke-test with multiple tabs and idle sockets, then check
Cloudflare usage. Durable Object duration should stop climbing aggressively while
clients are idle.

## State-blob growth: finished-game retention

All app state is a single JSON row in D1 (`app_state`), parsed on every read and
re-serialized on every write. Finished games are invisible to the UI (the lobby
lists only active/waiting rooms) but were never removed unless a player tapped
"leave" — which rarely happens — so they accumulated indefinitely. On
2026-06-27 finished games had grown to ~95 KB / 73% of a 130 KB blob, carried on
every action, and the stale legacy game shapes inside them surfaced latent
serialization bugs (e.g. a Yahtzee bot seat missing `gameTotals`).

Adopted fix (`workers/persistence/state.js`, `pruneCompletedRooms`): on load,
stamp `completed_at` the first time a game is seen finished, then drop it after a
~3h grace window (rematch/review still works inside the window). Invites pointing
at removed rooms are dropped too. This is retention only — no game decisions, and
stats live in `data.stats`, so no scores or history are lost. It piggybacks on
the existing read/write path (no cron, no extra writes), matching the
event-driven doctrine above.

To clear an existing backlog, delete finished rooms directly from the state row
with a version-checked `json_remove(value, '$.rooms."CODE"', ...)` (keep
active/waiting rooms). Avoid rewriting the whole blob inline — it can exceed
SQLite's statement-size limit (`SQLITE_TOOBIG`).
