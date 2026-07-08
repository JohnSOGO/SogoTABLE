# Bug reports — export & manage

In-game bug/feature reports are submitted by players (`POST /api/bug-report`) and
stored server-side in D1 as the `data.bug_reports` array (capped at the last 500).
This folder is the **local admin surface** for triaging them. Everything here is
gated by the Sogo superuser passcode.

The exported `.txt` reports are git-ignored (local artifacts); only the helper
scripts and this note are tracked — see `.gitignore`.

## The three helpers

| Command | What it does |
| --- | --- |
| `npm run bugreports <passcode>` | **Export** — pull every report into this folder, one `.txt` each (stable filename, safe to re-run). |
| `npm run bugreports:manage -- <cmd> [--pass=<code>]` | **Manage** — list / mark done / reopen / delete / sync (below). |
| `npm run bugreports:clear <passcode>` | **Nuke** — delete *all* reports from the server. Blunt; prefer `manage delete`. |

Passcode for any of them can instead come from the `SOGOTABLE_SUPERUSER_PASSCODE`
env var. On Windows you can double-click `export-bug-reports.bat` or
`manage-bug-reports.bat` (they prompt for the passcode).

## Managing reports (`scripts/manage-bug-reports.mjs`)

```
node scripts/manage-bug-reports.mjs list                 # numbered table
node scripts/manage-bug-reports.mjs done   1 3           # mark rows 1 and 3 done
node scripts/manage-bug-reports.mjs done   mrc24ovl-l0g57k
node scripts/manage-bug-reports.mjs open   2             # reopen (un-done)
node scripts/manage-bug-reports.mjs delete 4             # remove from server
node scripts/manage-bug-reports.mjs done   all
node scripts/manage-bug-reports.mjs sync                 # see below
```

A **selector** is a row number from the last `list` (1-based, oldest-first —
matches the export order), a report id, or the word `all`.

`done`/`open` set a `status` (`"done"` / cleared) and `resolved_at` on the report
**without deleting it**, so it stays in the export and the audit trail. `delete`
removes it entirely. Use `delete`/`clear` to reclaim the 500-report cap.

### The `sync` workflow (folder as checklist)

If you prefer to triage in the files: export, then rename any handled report file
to add a `DONE_` prefix (e.g. `DONE_20260708-053145_mrc24ovl-l0g57k.txt`), then
run `manage sync`. It scans this folder for `DONE_*.txt`, extracts the ids, and
marks those reports done on the server. (This matches a rename habit already in
use here.)

## Server side (for future AI)

- Endpoints live in **`workers/bug-reports.js`** (leaf module, no fan-in). The
  Worker entry `workers/sogotable-api.js` only routes to it. The passcode-only
  gate is `assertSogoPasscode` in `workers/platform/auth.js`.
- `POST /api/bug-reports/resolve` — passcode-gated. Body:
  `{ passcode, ids: [id,...], delete?: bool, reopen?: bool }`.
  - default → set `status:"done"`, `resolved_at:<ms>` on matching reports
  - `reopen:true` → clear the status (back to open)
  - `delete:true` → remove matching reports from `data.bug_reports`
  - returns `{ ok:true, affected:<n> }`
- The route is **mutating** (persists via the entry's default save) — it is NOT in
  the `READ_ONLY` side-effects list; only `/api/bug-reports/list` is.
- Deploy worker changes with `npm run deploy:brain` (static deploy won't ship them).

## Ideas / follow-ups

- No admin UI yet — this is script-only. A superuser web panel that lists reports
  with done/delete buttons would call the same `/resolve` endpoint.
- `status`/`resolved_at` now ride along on `list`; the export `.txt` could show a
  `Status:` line so exported files reflect server state at a glance.
