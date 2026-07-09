# Bug reports — export & manage

In-game bug/feature reports are submitted by players (`POST /api/bug-report`) and
stored server-side in D1 as the `data.bug_reports` array (capped at the last 500).
This folder is the **local admin surface** for triaging them. Everything here is
gated by the Sogo superuser passcode.

The exported `.txt` reports are git-ignored (local artifacts); only the helper
scripts and this note are tracked — see `.gitignore`.

## The friendly way: the web UI ⭐

```
npm run bugreports:ui <passcode>
```

Starts a tiny **localhost-only** server and opens `manage.html` in your browser —
a nice point-and-click panel to browse, search, filter (Open / Done / All), mark
done, reopen, and delete reports, with bulk-select for clearing many at once.
Windows: double-click **`bug-manager.bat`**. Press Ctrl+C (or close the console)
when done.

Why a server and not just opening `manage.html`? The API's CORS only allows
`http://localhost:<port>` (a `file://` page is rejected), and this keeps the
passcode in the terminal — it's injected into proxied requests and never touches
the browser page.

### 🤖 Let an agent fix it

Each report has an **🤖 Address** button. It launches the Claude Code CLI headless
in an **isolated git worktree** (`.worktrees/bug-<id>/`) on a branch
(`fix/bug-<id>`), where the agent diagnoses, fixes, runs tests, and commits — then
the job appears in the **Fix agents** panel at the top. From there you can **View
diff**, **Merge to main**, **Mark report done**, or **Discard**.

Guarantees, by design:
- The agent **never pushes and never deploys** — it only commits to its branch, so
  nothing ships without you clicking Merge (and deploying yourself).
- It runs in a worktree, so your main working tree and any other jobs sharing the
  clone are untouched.
- **Merge to main** refuses on a dirty tree or a merge conflict (it aborts cleanly)
  and tells you to merge manually — it never leaves a mess.

Requirements: the `claude` CLI must be on PATH and logged in (it is, in this repo).
Runner: `scripts/bug-agent.mjs`; the server exposes local `/agent/*` routes.
Residual note: the agent runs with permissions bypassed *inside its worktree* so it
can edit and test unattended; the no-push/no-deploy rule is enforced by instruction,
not a sandbox — review the diff before merging.

## Command-line helpers

| Command | What it does |
| --- | --- |
| `npm run bugreports <passcode>` | **Export** — pull every report into this folder, one `.txt` each (stable filename, safe to re-run). |
| `npm run bugreports:manage -- <cmd> [--pass=<code>]` | **Manage** — list / mark done / reopen / delete / sync (below). |
| `npm run bugreports:clear <passcode>` | **Nuke** — delete *all* reports from the server. Blunt; prefer `manage delete` or the UI. |

Passcode for any of them can instead come from the `SOGOTABLE_SUPERUSER_PASSCODE`
env var. On Windows you can double-click `bug-manager.bat`, `export-bug-reports.bat`,
or `manage-bug-reports.bat` (they prompt for the passcode).

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

## Files here

- `manage.html` — the web UI (self-contained; served by `serve-bug-manager.mjs`).
- `bug-manager.bat` / `manage-bug-reports.bat` / `export-bug-reports.bat` —
  double-click launchers (they prompt for the passcode).
- Exported `*.txt` reports — git-ignored local artifacts.

## Ideas / follow-ups

- The UI is a **local** tool (runs on your machine, talks to the live API). If you
  ever want it reachable from a phone without a laptop, it could become an in-app
  superuser panel — it would call the same `/api/bug-reports/resolve` endpoint.
- `status`/`resolved_at` now ride along on `list`; the export `.txt` could show a
  `Status:` line so exported files reflect server state at a glance.
