# Cloudflare Quota Guardrails

This note records the fix from `AI/CODEX_CLOUDFLARE_QUOTA_FIX.md`.

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
- Frontend fallback polling is degraded behavior, not the normal data path.
- Lobby presence heartbeat no longer forces a full room-list refresh every tick.

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
