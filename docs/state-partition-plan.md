# State Partition Plan

Status: **plan only — do not implement until public usage forces it.** This draws
the seams now so the eventual migration is incremental and testable, per the
`docs/architecture-debt.md` exit criteria. For family-table scale the single
optimistic-lock D1 row is still acceptable.

## Today

The Worker loads/saves one D1 row (`app_state` key `state`) as a JSON blob via
`workers/persistence/state.js` (optimistic `version` lock + 3-retry). Everything
contends on that one document:

```
data = {
  players: [],          // roster: id, name, icon, color, owner_token_hash, house_*
  rooms: {},            // hot room state (also mirrored into RoomDurableObject)
  invites: {},          // invite lifecycle (pending/accepted/...)
  lobbyViewers: {},      // per-game presence
  stats: { high_scores, ratings, personal },
  bug_reports: [],      // capped to last 500
}
```

Durable Objects already own the *hot* paths: `RoomFactoryDurableObject`
(room creation), `RoomDurableObject` (active-room mutation + socket fanout),
`EventHubDurableObject` (per-game app-event fanout). The blob's copies of
`rooms`/`invites`/`lobbyViewers` are the contention the DOs were meant to remove.

## Target ownership

| Data | Owner | Why |
|---|---|---|
| `bug_reports` | **D1 table** `bug_reports` | append-only, off every hot path, queryable |
| `stats` | **D1 tables** `player_stats` / `game_stats` | durable; written on game-end, read on demand; must outlive room pruning |
| `players` | **D1 table** `players` | roster: read-heavy, low write, owner-token auth unchanged |
| completed-room history | **D1 table** `room_history` (optional) | today pruned after 3h (`COMPLETED_ROOM_TTL_MS`); a table if durable history is wanted |
| `rooms` (hot) | **RoomDurableObject** authoritative; D1 keeps a lobby **summary index** only | removes the blob round-trip from every move |
| `invites` + `lobbyViewers` | **DO** (EventHub per-game, or a presence DO) | highest write frequency; last to move, most coupling |

## Migration order — lowest risk first, each independently shippable

1. **`bug_reports` → D1 table.** Isolated, append-only, no hot path. Proves the
   seam and the dual-write/cutover pattern. Routes: `/api/bug-report`,
   `/api/bug-reports/{list,clear}`. Scripts `export-bug-reports.mjs` /
   `clear-bug-reports.mjs` repoint to the table.
2. **`stats` → D1 tables.** Decouples scoring from every roster write. Write on
   game-end, read in `eventSnapshotForGame` + `/api/stats` + `/api/player/stats`.
3. **`players` roster → D1 table.** Owner-token hashing unchanged; reads can be
   cached. Touches create/claim/unclaim/reclaim/delete handlers.
4. **`invites` + `lobby presence` → DO.** Highest write rate, most coupling —
   move once 1–3 are proven.
5. **Drop the blob's `rooms` mirror.** RoomDurableObject becomes the sole hot
   authority; D1 retains only the summary index the lobby list needs.

After 1–5 the `app_state` blob holds little or nothing; retire it or keep it for
low-churn config only.

## Code seams each slice touches

- `workers/persistence/state.js` — `loadState`/`saveState` stop hydrating the
  migrated slice into the blob; add the table reader/writer (own optimistic or
  row-level semantics).
- `workers/sogotable-api.js` — the domain handlers in `routeRequest` for that
  slice, and the **notification fanout** (`eventSnapshotForGame` reads
  stats/lobby/invites and must read the new source).
- The single-blob save/notify wrapper in `fetch` — a migrated slice must not be
  re-serialized into `app_state`; this pairs naturally with the per-route
  `{mutates, notify}` metadata work (architecture-debt item #2).

## Tests to write **before** each slice

- bug_reports: create → list → clear against the table; cap behaviour preserved.
- stats: a score survives a completed-room prune (the existing risk).
- players: CRUD with owner-token auth; claim/unclaim/reclaim parity.
- presence/invites: reconnect + duplicate-tab presence under DO ownership.

Each slice is behaviour-preserving and reversible; ship and verify one at a time.
