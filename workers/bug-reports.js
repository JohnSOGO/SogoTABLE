// Bug-report store — a zero-fan-in leaf owning the shape and lifecycle of the
// in-state bug_reports array (append / list / clear, room for resolve-reopen-delete
// by id next). Pure functions over the passed-in state: they mutate data.bug_reports
// in place and return the handler payload, but never persist — the Worker entry's
// default save handles that. Passcode-gated admin reads/writes use the shared
// passcode-only Sogo gate; submission is open (any player can file a report).
import { assertSogoPasscode } from "./platform/auth.js";

// Newest report kept; store is capped so it can't grow without bound.
const BUG_REPORT_LIMIT = 500;

// Open submit: build the report from the (untrusted) payload with the exact field
// limits the store enforces, append it, and cap to the most recent BUG_REPORT_LIMIT.
export function appendBugReport(data, payload) {
  const description = String(payload.description || "").trim();
  if (!description) throw new Error("Bug description is required.");
  if (!Array.isArray(data.bug_reports)) data.bug_reports = [];
  const report = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: Date.now(),
    player_id: String(payload.player_id || ""),
    player_name: String(payload.player_name || "").slice(0, 120),
    screen: String(payload.screen || "").slice(0, 120),
    game: String(payload.game || "").slice(0, 120),
    game_id: String(payload.game_id || "").slice(0, 60),
    room_code: String(payload.room_code || "").slice(0, 12),
    user_agent: String(payload.user_agent || "").slice(0, 400),
    description: description.slice(0, 4000),
    // Bounded JSON snapshot of the game at report time (Tier 1 capture) — lets the fix agent see the
    // actual state, not just the text. Capped so one report can't bloat the D1 row.
    game_state: String(payload.game_state || "").slice(0, 40000),
  };
  data.bug_reports.push(report);
  data.bug_reports = data.bug_reports.slice(-BUG_REPORT_LIMIT);
  return { ok: true, id: report.id };
}

// Admin export, gated by the Sogo passcode alone (no player context — this is
// called by the local export script, not a seated player).
export function listBugReports(data, payload, superuserPasscode) {
  assertSogoPasscode(payload.passcode, superuserPasscode);
  return { ok: true, reports: Array.isArray(data.bug_reports) ? data.bug_reports : [] };
}

// Admin housekeeping: empty the bug-report store once a batch is handled. Gated by
// the Sogo passcode alone, like the export. Mutating (persists via the entry's save).
export function clearBugReports(data, payload, superuserPasscode) {
  assertSogoPasscode(payload.passcode, superuserPasscode);
  const cleared = Array.isArray(data.bug_reports) ? data.bug_reports.length : 0;
  data.bug_reports = [];
  return { ok: true, cleared };
}

// Per-report triage by id: mark done (default), reopen, or delete. Lets the admin
// close out reports individually instead of clearing the whole store. `done`/`reopen`
// keep the report (status audit trail); `delete` drops it to reclaim the cap. Gated
// by the Sogo passcode; mutating (persists via the entry's save).
export function resolveBugReports(data, payload, superuserPasscode) {
  assertSogoPasscode(payload.passcode, superuserPasscode);
  const ids = new Set((Array.isArray(payload.ids) ? payload.ids : []).map((id) => String(id)));
  const list = Array.isArray(data.bug_reports) ? data.bug_reports : [];
  let affected = 0;
  if (payload.delete) {
    data.bug_reports = list.filter((report) => !ids.has(String(report.id)));
    affected = list.length - data.bug_reports.length;
    return { ok: true, affected };
  }
  for (const report of list) {
    if (!ids.has(String(report.id))) continue;
    if (payload.reopen) {
      delete report.status;
      delete report.resolved_at;
    } else {
      report.status = "done";
      report.resolved_at = Date.now();
    }
    affected += 1;
  }
  return { ok: true, affected };
}

// Refine a report's description in place — used when the admin expands a terse
// in-game note (often typed quickly on a phone) into a fuller brief before handing
// it to a fix agent. Keeps the report record in sync with what was actually worked
// on. Gated by the Sogo passcode; mutating (persists via the entry's save).
export function updateBugReport(data, payload, superuserPasscode) {
  assertSogoPasscode(payload.passcode, superuserPasscode);
  const id = String(payload.id || "");
  const description = String(payload.description || "").trim();
  if (!description) throw new Error("Description is required.");
  const report = (Array.isArray(data.bug_reports) ? data.bug_reports : []).find((r) => String(r.id) === id);
  if (!report) throw new Error("No such report.");
  report.description = description.slice(0, 4000);
  report.edited_at = Date.now();
  return { ok: true, id };
}
