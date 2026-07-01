// SessionStart hook: nudge when the code-steward health audit is overdue.
// Overdue = the newest entry in docs/maintenance-log.md is older than
// DAYS_LIMIT days, OR more than COMMITS_LIMIT commits have landed on HEAD
// since the log was last touched. Prints a context-injection JSON when
// overdue; prints nothing otherwise. Never blocks session start: any
// failure exits 0 silently.
//
// The steward's real cadence is milestone-driven (game ships, lock
// declared); this hook is only the safety net for a milestone that slipped
// past unaudited. Env overrides (STEWARD_DAYS_LIMIT / STEWARD_COMMITS_LIMIT)
// exist for testing the overdue branch by hand.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DAYS_LIMIT = Number(process.env.STEWARD_DAYS_LIMIT ?? 14);
const COMMITS_LIMIT = Number(process.env.STEWARD_COMMITS_LIMIT ?? 150);

try {
  const log = readFileSync(new URL("../docs/maintenance-log.md", import.meta.url), "utf8");
  const dates = [...log.matchAll(/^## (\d{4}-\d{2}-\d{2})/gm)].map((m) => m[1]).sort();
  const last = dates[dates.length - 1];
  const days = last
    ? Math.floor((Date.now() - new Date(`${last}T00:00:00`).getTime()) / 86400000)
    : Infinity;

  const git = (cmd) =>
    execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const lastLogCommit = git("git log -1 --format=%H -- docs/maintenance-log.md");
  const commitsSince = lastLogCommit
    ? Number(git(`git rev-list --count ${lastLogCommit}..HEAD`))
    : Infinity;

  if (days > DAYS_LIMIT || commitsSince > COMMITS_LIMIT) {
    const ago = last ? `${last} (${days} days ago)` : "never";
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext:
            `[steward-overdue-check] The last code-steward health audit was ${ago}, ` +
            `with ${commitsSince} commits since (limits: ${DAYS_LIMIT} days / ${COMMITS_LIMIT} commits). ` +
            `The audit is overdue. Before starting new feature work, tell the user and ` +
            `offer to run the code-steward agent (whole-codebase health audit; receipt ` +
            `goes in docs/maintenance-log.md).`,
        },
      }),
    );
  }
} catch {
  // Never block or noise up session start on a broken check.
}
