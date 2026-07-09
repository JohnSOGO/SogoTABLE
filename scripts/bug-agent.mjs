// Bug-fixing agent runner for the bug-report manager. Each "Address" from the GUI
// spins up an isolated git worktree on its own branch, launches the Claude Code
// CLI headlessly inside it to diagnose + fix + test the report, and leaves the
// branch for review. It NEVER pushes or deploys — that stays a human decision.
//
// Isolation matters: worktrees keep the agent off the user's main working tree, so
// concurrent work (and other jobs sharing the clone) is untouched.
//
// Job state is in-memory: it lives only while the server runs, which is fine — the
// durable artifacts are the git branches/worktrees, which survive a restart.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const isWin = process.platform === "win32";
const MAX_CONCURRENT = 2;
const LOG_TAIL = 6000;

const jobs = new Map(); // id -> full job record
let running = 0;
let seq = 0;

function git(args, cwd = repoRoot) {
  return new Promise((resolve) => {
    const p = spawn("git", args, { cwd, shell: isWin });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", (e) => resolve({ code: -1, out: "", err: String(e.message || e) }));
    p.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
  });
}

function firstLine(text) {
  return String(text || "").trim().split("\n")[0].slice(0, 80) || "(no description)";
}

function reportToText(r) {
  const lines = [`Report ID: ${r.id}`];
  if (r.game) lines.push(`Game: ${r.game}`);
  if (r.screen) lines.push(`Screen: ${r.screen}`);
  if (r.room_code) lines.push(`Room: ${r.room_code}`);
  if (r.player_name) lines.push(`Reported by: ${r.player_name}`);
  lines.push("", "Issue:", String(r.description || "").trim());
  return lines.join("\n");
}

function buildPrompt(report, branch) {
  return [
    "You are fixing an issue in the SogoTable project. You are running inside an",
    `isolated git worktree on branch \`${branch}\` — your changes here do NOT touch`,
    "the user's main working tree, so work freely.",
    "",
    "Follow the repository's CLAUDE.md doctrine (placement before implementation,",
    "smallest correct change, sibling-path parity, docs when contracts change).",
    "Investigate the report below, implement the fix (or the feature, if that's what",
    "it asks), and verify it. The worker test suite needs no install — run",
    "`node --test workers/tests/*.test.js` directly. Commit your work to this branch",
    "with a clear message.",
    "",
    "HARD CONSTRAINTS:",
    "- Do NOT `git push`. Do NOT deploy (no `npm run deploy:*`). Do NOT switch to or",
    "  modify `main`. Commit only to this branch.",
    "- If the report is too ambiguous to fix safely, do NOT guess — explain what you'd",
    "  need and what you investigated instead.",
    "",
    "When finished, output a concise summary: root cause, files changed, and how you",
    "verified (test results).",
    "",
    "--- REPORT ---",
    reportToText(report),
  ].join("\n");
}

function publicJob(j) {
  return {
    id: j.id, reportId: j.reportId, title: j.title, branch: j.branch,
    status: j.status, summary: j.summary, error: j.error, commits: j.commits,
    log: j.log.slice(-LOG_TAIL), startedAt: j.startedAt, endedAt: j.endedAt,
  };
}

export function listJobs() {
  return [...jobs.values()].map(publicJob).sort((a, b) => b.startedAt - a.startedAt);
}

export function getJob(id) {
  const j = jobs.get(id);
  return j ? publicJob(j) : null;
}

export async function startFix(report) {
  const reportId = String(report && report.id || "").replace(/[^a-z0-9-]/gi, "");
  if (!reportId) return { ok: false, error: "Report has no id." };
  if (running >= MAX_CONCURRENT) return { ok: false, error: `Too many agents running (${running}). Try again shortly.` };
  for (const j of jobs.values()) {
    if (j.reportId === reportId && j.status === "running") return { ok: false, error: "An agent is already working this report." };
  }
  const id = `job-${++seq}`;
  const branch = `fix/bug-${reportId}`;
  const job = {
    id, reportId, title: firstLine(report.description), branch,
    wtPath: join(repoRoot, ".worktrees", `bug-${reportId}`),
    status: "running", log: "", summary: "", error: "", commits: "",
    startedAt: Date.now(), endedAt: 0,
  };
  jobs.set(id, job);
  running += 1;
  run(job, report).catch((e) => { job.status = "error"; job.error = String(e && e.message || e); })
    .finally(() => { running -= 1; if (!job.endedAt) job.endedAt = Date.now(); });
  return { ok: true, id, branch };
}

async function run(job, report) {
  const log = (s) => { job.log += s; };

  // Fresh worktree: clear any stale one for this report first.
  await git(["worktree", "remove", "--force", job.wtPath]);
  await git(["branch", "-D", job.branch]);
  mkdirSync(join(repoRoot, ".worktrees"), { recursive: true });
  log(`$ git worktree add -b ${job.branch} ${job.wtPath} main\n`);
  const add = await git(["worktree", "add", "-b", job.branch, job.wtPath, "main"]);
  log((add.out ? add.out + "\n" : "") + (add.err ? add.err + "\n" : ""));
  if (add.code !== 0) {
    job.status = "error";
    job.error = "Could not create worktree: " + (add.err || "git failed");
    job.endedAt = Date.now();
    return;
  }

  // Launch Claude Code headless inside the worktree. bypassPermissions lets it edit
  // and run tests unattended; the prompt forbids push/deploy and it's boxed to the
  // worktree branch. The prompt goes in via STDIN, not as an argument: a multi-line
  // prompt passed as a command-line arg gets mangled by Windows cmd.exe (newlines
  // break the command line), which silently handed the agent an empty task.
  log(`\n$ claude -p --permission-mode bypassPermissions  (prompt via stdin, cwd: worktree)\n\n`);
  const args = ["-p", "--permission-mode", "bypassPermissions"];
  const prompt = buildPrompt(report, job.branch);
  let result = "";
  const exit = await new Promise((resolve) => {
    let proc;
    try {
      proc = spawn("claude", args, { cwd: job.wtPath, shell: isWin, env: process.env });
    } catch (e) {
      log(`[could not launch claude: ${e.message}]\n`);
      resolve(-1);
      return;
    }
    proc.stdout.on("data", (d) => { const s = d.toString(); result += s; log(s); });
    proc.stderr.on("data", (d) => log(d.toString()));
    proc.on("error", (e) => { log(`[claude error: ${e.message}]\n`); resolve(-1); });
    proc.on("close", (code) => resolve(code));
    try { proc.stdin.write(prompt); proc.stdin.end(); } catch (e) { log(`[stdin error: ${e.message}]\n`); }
  });

  const commits = await git(["log", "--oneline", `main..${job.branch}`]);
  job.commits = commits.out;
  job.summary = result.trim().slice(-4000);
  job.endedAt = Date.now();
  if (exit === 0 && commits.out) {
    job.status = "done";
  } else if (exit === 0) {
    job.status = "done";
    if (!job.summary) job.summary = "Agent finished but committed no changes.";
  } else {
    job.status = "error";
    if (!job.error) job.error = `Agent exited with code ${exit}` + (exit === -1 ? " (is the `claude` CLI on PATH?)" : "");
  }
}

export async function getDiff(id) {
  const j = jobs.get(id);
  if (!j) return { ok: false, error: "No such job." };
  const diff = await git(["diff", `main...${j.branch}`]);
  const stat = await git(["diff", "--stat", `main...${j.branch}`]);
  if (diff.code !== 0) return { ok: false, error: diff.err || "No diff (branch may be gone)." };
  return { ok: true, branch: j.branch, stat: stat.out, diff: diff.out };
}

// Safe merge into main: refuses on a dirty tree or when not on main, and aborts on
// conflict rather than leaving a mess. Never pushes/deploys.
export async function mergeJob(id) {
  const j = jobs.get(id);
  if (!j) return { ok: false, error: "No such job." };
  const status = await git(["status", "--porcelain"]);
  if (status.out) return { ok: false, error: `Main working tree has uncommitted changes — merge manually when clear:\n  git merge --no-ff ${j.branch}` };
  const head = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (head.out !== "main") return { ok: false, error: `Not on main (on ${head.out}). Merge manually.` };
  const merge = await git(["merge", "--no-ff", job2branch(j), "-m", `Merge ${j.branch} (bug ${j.reportId})`]);
  if (merge.code !== 0) {
    await git(["merge", "--abort"]);
    return { ok: false, error: "Merge hit a conflict and was aborted. Resolve manually." };
  }
  return { ok: true, message: merge.out || `Merged ${j.branch} into main.`, hint: "Now push + deploy when ready." };
}

function job2branch(j) { return j.branch; }

// Tear down a job's worktree + branch (local only).
export async function discardJob(id) {
  const j = jobs.get(id);
  if (!j) return { ok: false, error: "No such job." };
  await git(["worktree", "remove", "--force", j.wtPath]);
  await git(["branch", "-D", j.branch]);
  jobs.delete(id);
  return { ok: true };
}

// Confirm the CLI is reachable so the GUI can warn early.
export async function claudeAvailable() {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn("claude", ["--version"], { shell: isWin, env: process.env });
    } catch {
      resolve(false);
      return;
    }
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}
